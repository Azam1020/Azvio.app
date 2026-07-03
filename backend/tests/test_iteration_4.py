"""AZVIO Iteration 4 backend tests — Supabase Storage + Google Calendar integrations
and regression smoke tests for prior endpoints.
"""
import os
import base64
import pytest
import requests
import jwt as pyjwt

BASE_URL = "http://localhost:8001/api"
LOGIN_EMAIL = "Info@azvio.co"
LOGIN_PASSWORD = "Azvio@2026"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def test_client_id(auth_headers):
    r = requests.post(f"{BASE_URL}/clients", headers=auth_headers,
                      json={"name": "TEST_SupClient", "service_type": "drone"}, timeout=15)
    assert r.status_code == 200, f"create client failed: {r.text}"
    cid = r.json()["id"]
    yield cid
    # cleanup
    requests.delete(f"{BASE_URL}/clients/{cid}", headers=auth_headers, timeout=15)


# ============ 1. Supabase Storage: Multipart Upload ============

class TestSupabaseUpload:
    def test_upload_small_file(self, auth_headers, test_client_id):
        content = b"AZVIO test content"
        files = {"file": ("test.txt", content, "text/plain")}
        data = {"text": "test log", "log_type": "file"}
        r = requests.post(f"{BASE_URL}/clients/{test_client_id}/logs/upload",
                          headers=auth_headers, files=files, data=data, timeout=30)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert "id" in body
        assert "attachment" in body
        assert body["attachment"]["name"] == "test.txt"
        assert body["attachment"]["mime"] == "text/plain"
        # Should NOT include base64 data
        assert "data" not in body["attachment"], "response leaked base64 data"
        # stash for downstream tests
        pytest.upload_log_id = body["id"]
        pytest.upload_expected = content

    def test_get_attachment_returns_signed_url(self, auth_headers, test_client_id):
        log_id = pytest.upload_log_id
        r = requests.get(f"{BASE_URL}/clients/{test_client_id}/logs/{log_id}/attachment",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("kind") == "url", f"expected kind=url got {b}"
        url = b.get("url", "")
        assert url.startswith("https://") and "supabase" in url, f"bad url: {url}"
        assert "/storage/v1/object/sign/" in url, f"not a signed URL: {url}"
        assert b.get("name") == "test.txt"
        assert b.get("mime") == "text/plain"
        pytest.signed_url = url

    def test_signed_url_downloads_file(self):
        # HTTP GET the signed URL with no auth header — should return the original bytes
        r = requests.get(pytest.signed_url, timeout=15)
        assert r.status_code == 200, f"signed url fetch failed: {r.status_code} {r.text[:200]}"
        assert r.content == pytest.upload_expected, "downloaded bytes differ from uploaded"

    def test_upload_over_15mb_returns_413(self, auth_headers, test_client_id):
        big = b"A" * (15 * 1024 * 1024 + 100)
        files = {"file": ("big.txt", big, "text/plain")}
        data = {"text": "big", "log_type": "file"}
        r = requests.post(f"{BASE_URL}/clients/{test_client_id}/logs/upload",
                          headers=auth_headers, files=files, data=data, timeout=60)
        assert r.status_code == 413, f"expected 413 got {r.status_code}: {r.text[:200]}"

    def test_delete_log_removes_supabase_file(self, auth_headers, test_client_id):
        log_id = pytest.upload_log_id
        r = requests.delete(f"{BASE_URL}/clients/{test_client_id}/logs/{log_id}",
                            headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        # Best-effort verification (do not fail suite): attachment endpoint should 404
        r2 = requests.get(f"{BASE_URL}/clients/{test_client_id}/logs/{log_id}/attachment",
                          headers=auth_headers, timeout=15)
        assert r2.status_code == 404


# ============ 2. Legacy base64 log endpoint ============

class TestLegacyBase64Log:
    def test_legacy_endpoint_and_attachment_response_shape(self, auth_headers, test_client_id):
        payload_bytes = b"legacy content"
        b64 = base64.b64encode(payload_bytes).decode()
        body = {
            "text": "legacy test",
            "log_type": "file",
            "attachment_name": "legacy.txt",
            "attachment_mime": "text/plain",
            "attachment_data": b64,
        }
        r = requests.post(f"{BASE_URL}/clients/{test_client_id}/logs",
                          headers=auth_headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        resp = r.json()
        log_id = resp["id"]

        # Fetch attachment — accept either kind=url OR kind=data
        r2 = requests.get(f"{BASE_URL}/clients/{test_client_id}/logs/{log_id}/attachment",
                          headers=auth_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        kind = b2.get("kind")
        assert kind in ("url", "data"), f"unexpected kind={kind}: {b2}"
        if kind == "url":
            assert b2.get("url", "").startswith("https://"), f"bad url: {b2}"
        else:
            assert b2.get("data"), "expected base64 data field"

        # cleanup
        requests.delete(f"{BASE_URL}/clients/{test_client_id}/logs/{log_id}",
                        headers=auth_headers, timeout=15)


# ============ 3. Google Calendar — Config & Auth URL ============

class TestGoogleConfig:
    def test_google_status(self, auth_headers):
        r = requests.get(f"{BASE_URL}/google/status", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("configured") is True
        assert b.get("redirect_uri") == "https://azvio-workspace.preview.emergentagent.com/api/google/callback"

    def test_google_auth_url(self, auth_headers):
        r = requests.get(f"{BASE_URL}/google/auth-url", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        url = r.json().get("auth_url", "")
        assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?"), f"bad prefix: {url[:120]}"
        for needle in ["client_id=", "redirect_uri=", "response_type=code",
                       "scope=", "access_type=offline", "prompt=consent", "state="]:
            assert needle in url, f"missing '{needle}' in auth_url"

        # Extract state and JWT-decode without verification
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(url).query)
        state = q.get("state", [""])[0]
        assert state, "state missing"
        decoded = pyjwt.decode(state, options={"verify_signature": False})
        assert "user_id" in decoded, f"state JWT missing user_id: {decoded}"


# ============ 4. Google Accounts CRUD ============

class TestGoogleAccounts:
    def test_list_accounts_empty(self, auth_headers):
        r = requests.get(f"{BASE_URL}/google/accounts", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "accounts" in b
        assert isinstance(b["accounts"], list)

    def test_delete_nonexistent_returns_404(self, auth_headers):
        r = requests.delete(f"{BASE_URL}/google/accounts/nonexistent@test.com",
                            headers=auth_headers, timeout=10)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"


# ============ 5. Calendar endpoints require linked account (error path) ============

class TestCalendarNoAccount:
    def test_create_event_no_link_returns_404(self, auth_headers):
        body = {
            "account_email": "notlinked@test.com",
            "summary": "test",
            "start": "2026-02-01T10:00:00",
            "end": "2026-02-01T11:00:00",
        }
        r = requests.post(f"{BASE_URL}/google/calendar/events",
                          headers=auth_headers, json=body, timeout=10)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"
        assert "غير مربوط" in r.text

    def test_list_events_no_link_returns_404(self, auth_headers):
        r = requests.get(f"{BASE_URL}/google/calendar/events?account=notlinked@test.com",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"


# ============ 6. Callback endpoint sanity ============

class TestGoogleCallback:
    def test_callback_no_params_redirects_missing_code(self):
        r = requests.get(f"{BASE_URL}/google/callback",
                         allow_redirects=False, timeout=10)
        assert r.status_code in (302, 307), f"expected redirect got {r.status_code}"
        loc = r.headers.get("location", "")
        assert "status=error" in loc and "reason=missing_code" in loc, f"bad loc: {loc}"
        assert loc.startswith("https://azvio-workspace.preview.emergentagent.com/oauth-callback"), loc

    def test_callback_error_param_redirects_access_denied(self):
        r = requests.get(f"{BASE_URL}/google/callback?error=access_denied&state=x",
                         allow_redirects=False, timeout=10)
        assert r.status_code in (302, 307), f"expected redirect got {r.status_code}"
        loc = r.headers.get("location", "")
        assert "status=error" in loc and "reason=access_denied" in loc, f"bad loc: {loc}"


# ============ 7. Regression smoke checks ============

REGRESSION_GETS = [
    "/dashboard",
    "/dashboard/timeseries",
    "/finance/statistics",
    "/service-types",
    "/my-pricing",
    "/categories",
    "/insights/weekly",
    "/links",
]


@pytest.mark.parametrize("path", REGRESSION_GETS)
def test_regression_get(auth_headers, path):
    r = requests.get(f"{BASE_URL}{path}", headers=auth_headers, timeout=45)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"


class TestRegressionSanad:
    def test_price_opinion(self, auth_headers):
        r = requests.post(f"{BASE_URL}/sanad/price-opinion", headers=auth_headers,
                          json={"service_type": "drone", "category": "عقارات", "price": 500},
                          timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_suggest_content(self, auth_headers):
        r = requests.post(f"{BASE_URL}/sanad/suggest-content", headers=auth_headers,
                          json={"topic": "تسويق عقاري"}, timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_pricing_advice(self, auth_headers):
        r = requests.post(f"{BASE_URL}/sanad/pricing-advice", headers=auth_headers,
                          json={"service_type": "drone", "sub_category": ""}, timeout=60)
        assert r.status_code == 200, r.text[:300]


class TestRegressionLinks:
    def test_links_crud(self, auth_headers):
        # create
        r = requests.post(f"{BASE_URL}/links", headers=auth_headers,
                          json={"title": "TEST_it4_link", "url": "https://example.com"}, timeout=10)
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        # update
        r2 = requests.put(f"{BASE_URL}/links/{lid}", headers=auth_headers,
                          json={"title": "TEST_it4_link_upd"}, timeout=10)
        assert r2.status_code == 200, r2.text
        # delete
        r3 = requests.delete(f"{BASE_URL}/links/{lid}", headers=auth_headers, timeout=10)
        assert r3.status_code == 200, r3.text
