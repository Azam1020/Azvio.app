"""AZVIO — Tests for new features added this session.

Covers:
  1. Categories CRUD (+ dedupe, filter by service_type, seeded 7 defaults)
  2. Client sub_category persistence (create/update/get)
  3. Client activity log with attachment (file log + retrieval)
  4. Sanad AI-powered assist endpoints:
       - /sanad/price-opinion
       - /sanad/suggest-categories
       - /sanad/suggest-content
       - /sanad/suggest-services
  5. Sanad chat action protocol (add_category, add_service)
  6. Dashboard timeseries (default 6, custom months, income reflection)
  7. Regression sanity on all existing GET endpoints + auth
"""
import base64
import os
import time
import uuid

import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://azvio-workspace.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Info@azvio.co"
ADMIN_PASSWORD = "Azvio@2026"


# ------------ fixtures ------------

@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _sanad_post(H, path, json_body, timeout=60):
    """POST to a Sanad LLM endpoint with a single retry on transient budget errors."""
    last = None
    for _ in range(2):
        try:
            r = requests.post(f"{API}{path}", headers=H, json=json_body, timeout=timeout)
            if r.status_code == 500 and ("Budget" in r.text or "quota" in r.text.lower()):
                time.sleep(4)
                last = r
                continue
            return r
        except requests.exceptions.RequestException as e:
            last = e
            time.sleep(3)
    if isinstance(last, requests.Response):
        return last
    pytest.fail(f"Sanad {path} failed repeatedly: {last}")


# ============ 1. Regression sanity (run first) ============

class TestRegression:
    def test_login_ok(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_unauthorized_email(self):
        r = requests.post(f"{API}/auth/login", json={"email": "other@gmail.com", "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code in (401, 403)

    @pytest.mark.parametrize("path", ["/dashboard", "/clients", "/transactions", "/content", "/events", "/services", "/links"])
    def test_get_endpoints(self, H, path):
        r = requests.get(f"{API}{path}", headers=H, timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# ============ 2. Categories CRUD ============

class TestCategories:
    _created_id = None

    def test_seeded_defaults_present(self, H):
        r = requests.get(f"{API}/categories", headers=H, timeout=15)
        assert r.status_code == 200
        cats = r.json()
        # 7 default categories seeded (4 drone + 3 editing)
        assert len(cats) >= 7, f"Expected >=7 seeded categories, got {len(cats)}"
        names = {c["name"] for c in cats}
        for n in ("عقاري", "فعاليات", "سوشيال ميديا", "فيديو دعائي"):
            assert n in names, f"Seed missing: {n}"

    def test_filter_by_service_type_drone(self, H):
        r = requests.get(f"{API}/categories", headers=H, params={"service_type": "drone"}, timeout=15)
        assert r.status_code == 200
        cats = r.json()
        assert cats, "No drone categories returned"
        assert all(c["service_type"] == "drone" for c in cats)

    def test_filter_by_service_type_editing(self, H):
        r = requests.get(f"{API}/categories", headers=H, params={"service_type": "editing"}, timeout=15)
        assert r.status_code == 200
        assert all(c["service_type"] == "editing" for c in r.json())

    def test_create_category(self, H):
        name = f"TEST_فئة_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/categories", headers=H, json={
            "name": name, "service_type": "drone",
            "description": "TEST desc", "source": "manual",
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        assert data["service_type"] == "drone"
        assert data["description"] == "TEST desc"
        assert data["source"] == "manual"
        assert "id" in data and "created_at" in data
        TestCategories._created_id = data["id"]

    def test_create_duplicate_returns_400(self, H):
        # duplicate of the one just created
        r = requests.get(f"{API}/categories/", headers=H, timeout=15)  # trailing slash tolerance not needed
        # fetch created one
        cats = requests.get(f"{API}/categories", headers=H, params={"service_type": "drone"}, timeout=15).json()
        created = next(c for c in cats if c["id"] == TestCategories._created_id)
        r = requests.post(f"{API}/categories", headers=H, json={
            "name": created["name"], "service_type": "drone",
            "description": "dup", "source": "manual",
        }, timeout=15)
        assert r.status_code == 400, f"Expected 400 for duplicate, got {r.status_code} {r.text}"

    def test_update_category(self, H):
        assert TestCategories._created_id
        r = requests.put(f"{API}/categories/{TestCategories._created_id}", headers=H,
                         json={"description": "UPDATED"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["description"] == "UPDATED"

    def test_delete_category(self, H):
        r = requests.delete(f"{API}/categories/{TestCategories._created_id}", headers=H, timeout=15)
        assert r.status_code == 200
        # verify it is gone
        cats = requests.get(f"{API}/categories", headers=H, timeout=15).json()
        assert not any(c["id"] == TestCategories._created_id for c in cats)


# ============ 3. Client with sub_category ============

class TestClientSubCategory:
    _cid = None

    def test_create_with_sub_category(self, H):
        r = requests.post(f"{API}/clients", headers=H, json={
            "name": "TEST_client_sub",
            "service_type": "drone",
            "sub_category": "عقاري",
            "agreed_price": 1500,
        }, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["sub_category"] == "عقاري"
        assert d["service_type"] == "drone"
        assert d["agreed_price"] == 1500
        TestClientSubCategory._cid = d["id"]

    def test_get_returns_sub_category(self, H):
        r = requests.get(f"{API}/clients/{TestClientSubCategory._cid}", headers=H, timeout=15)
        assert r.status_code == 200
        assert r.json()["sub_category"] == "عقاري"

    def test_update_sub_category(self, H):
        r = requests.put(f"{API}/clients/{TestClientSubCategory._cid}", headers=H,
                         json={"sub_category": "فعاليات"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["sub_category"] == "فعاليات"
        # verify persistence
        g = requests.get(f"{API}/clients/{TestClientSubCategory._cid}", headers=H, timeout=15).json()
        assert g["sub_category"] == "فعاليات"


# ============ 4. Client activity log with attachment ============

class TestClientLogsAttachment:
    _log_id_file = None
    _log_id_text = None
    _sample_b64 = base64.b64encode(b"%PDF-1.4 minimal test payload").decode()

    def test_add_log_with_attachment(self, H):
        cid = TestClientSubCategory._cid
        assert cid, "Prerequisite client not created"
        r = requests.post(f"{API}/clients/{cid}/logs", headers=H, json={
            "text": "ملف مرفق تجريبي",
            "log_type": "file",
            "attachment_name": "test.pdf",
            "attachment_mime": "application/pdf",
            "attachment_data": TestClientLogsAttachment._sample_b64,
        }, timeout=15)
        assert r.status_code == 200, r.text
        log = r.json()
        assert log["log_type"] == "file"
        # response should not leak full base64 blob
        att = log.get("attachment") or {}
        assert att.get("name") == "test.pdf"
        assert att.get("mime") == "application/pdf"
        assert "data" not in att, "attachment.data must be stripped from POST response"
        TestClientLogsAttachment._log_id_file = log["id"]

    def test_get_attachment_data(self, H):
        cid = TestClientSubCategory._cid
        lid = TestClientLogsAttachment._log_id_file
        r = requests.get(f"{API}/clients/{cid}/logs/{lid}/attachment", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "test.pdf"
        assert d["mime"] == "application/pdf"
        assert d["data"] == TestClientLogsAttachment._sample_b64

    def test_add_log_text_only_still_works(self, H):
        cid = TestClientSubCategory._cid
        r = requests.post(f"{API}/clients/{cid}/logs", headers=H, json={
            "text": "ملاحظة نصية بدون مرفق",
            "log_type": "note",
        }, timeout=15)
        assert r.status_code == 200
        log = r.json()
        assert log["text"] == "ملاحظة نصية بدون مرفق"
        assert "attachment" not in log
        TestClientLogsAttachment._log_id_text = log["id"]

    def test_get_client_returns_logs_with_metadata(self, H):
        cid = TestClientSubCategory._cid
        r = requests.get(f"{API}/clients/{cid}", headers=H, timeout=15)
        assert r.status_code == 200
        logs = r.json().get("logs", [])
        assert any(lg["id"] == TestClientLogsAttachment._log_id_file for lg in logs)
        assert any(lg["id"] == TestClientLogsAttachment._log_id_text for lg in logs)
        file_log = next(lg for lg in logs if lg["id"] == TestClientLogsAttachment._log_id_file)
        assert file_log.get("attachment", {}).get("name") == "test.pdf"

    def test_cleanup_client(self, H):
        cid = TestClientSubCategory._cid
        requests.delete(f"{API}/clients/{cid}", headers=H, timeout=15)


# ============ 5. Sanad AI assist endpoints ============

class TestSanadAssist:
    def test_price_opinion_with_price(self, H):
        r = _sanad_post(H, "/sanad/price-opinion", {
            "service_type": "drone", "sub_category": "عقاري", "agreed_price": 1500,
        }, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("opinion", "verdict", "market_min", "market_max"):
            assert k in d, f"missing {k} in {d}"
        assert d["verdict"] in ("low", "fair", "high", "unknown"), f"bad verdict {d['verdict']}"
        assert isinstance(d["opinion"], str) and len(d["opinion"]) > 0, "opinion should be non-empty for price>0"
        assert isinstance(d["market_min"], (int, float))
        assert isinstance(d["market_max"], (int, float))

    def test_price_opinion_zero_price(self, H):
        r = _sanad_post(H, "/sanad/price-opinion", {
            "service_type": "drone", "sub_category": "عقاري", "agreed_price": 0,
        }, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["verdict"] == "unknown"
        assert d["opinion"] == ""

    def test_suggest_categories(self, H):
        r = _sanad_post(H, "/sanad/suggest-categories", {"service_type": "drone"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "categories" in d and isinstance(d["categories"], list)
        assert len(d["categories"]) >= 1, f"empty suggestions: {d}"
        for c in d["categories"]:
            assert "name" in c and c["name"]
            assert "description" in c

    def test_suggest_content(self, H):
        r = _sanad_post(H, "/sanad/suggest-content", {"topic": "رمضان", "count": 3}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "ideas" in d and isinstance(d["ideas"], list)
        # request was 3; allow 1-5 tolerance since LLM may vary
        assert 1 <= len(d["ideas"]) <= 5, f"expected ~3 ideas, got {len(d['ideas'])}"
        for i in d["ideas"]:
            assert "title" in i and i["title"]
            assert "description" in i

    def test_suggest_services(self, H):
        r = _sanad_post(H, "/sanad/suggest-services", {"service_type": "drone"}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "services" in d and isinstance(d["services"], list)
        assert len(d["services"]) >= 1
        for s in d["services"]:
            assert "title" in s and s["title"]
            assert "description" in s
            assert "price_from" in s and "price_to" in s
            assert s.get("service_type") == "drone"


# ============ 6. Sanad chat action protocol (add_category, add_service) ============

class TestSanadChatActions:
    SESSION_ID = f"TEST_actions_{uuid.uuid4().hex[:8]}"
    _added_cat_id = None
    _added_svc_id = None

    def test_add_category_via_chat(self, H):
        msg = "أضف فئة جديدة اسمها تصوير مطاعم لخدمة الدرون مع شرح: للمطاعم والكافيهات فقط"
        r = _sanad_post(H, "/sanad/chat", {"message": msg, "session_id": TestSanadChatActions.SESSION_ID}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("actions"), list), data
        # verify category now present
        cats = requests.get(f"{API}/categories", headers=H, params={"service_type": "drone"}, timeout=15).json()
        match = next((c for c in cats if c["name"].strip() == "تصوير مطاعم"), None)
        assert match is not None, f"'تصوير مطاعم' not found. actions={data.get('actions')}, reply={data.get('reply')[:200]}"
        assert match["service_type"] == "drone"
        assert match.get("source") == "sanad"
        TestSanadChatActions._added_cat_id = match["id"]

    def test_add_service_via_chat(self, H):
        msg = "أضف خدمة جديدة اسمها تصوير قصير لسوشيال ميديا من 300 إلى 900 ريال نوع مونتاج"
        r = _sanad_post(H, "/sanad/chat", {"message": msg, "session_id": TestSanadChatActions.SESSION_ID}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("actions"), list)
        svcs = requests.get(f"{API}/services", headers=H, timeout=15).json()
        match = next((s for s in svcs if "تصوير قصير" in s.get("title", "")), None)
        assert match is not None, f"Service not created. actions={data.get('actions')}, reply={data.get('reply')[:200]}"
        # price range sanity (LLM might round slightly)
        assert match.get("price_from", 0) > 0
        assert match.get("price_to", 0) >= match.get("price_from", 0)
        TestSanadChatActions._added_svc_id = match["id"]

    def test_cleanup(self, H):
        if TestSanadChatActions._added_cat_id:
            requests.delete(f"{API}/categories/{TestSanadChatActions._added_cat_id}", headers=H, timeout=15)
        if TestSanadChatActions._added_svc_id:
            requests.delete(f"{API}/services/{TestSanadChatActions._added_svc_id}", headers=H, timeout=15)
        requests.delete(f"{API}/sanad/history", headers=H, params={"session_id": TestSanadChatActions.SESSION_ID}, timeout=15)


# ============ 7. Dashboard timeseries ============

class TestDashboardTimeseries:
    def test_default_6_months(self, H):
        r = requests.get(f"{API}/dashboard/timeseries", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("months", "income", "expense", "new_clients"):
            assert k in d, f"missing {k}"
        assert len(d["months"]) == 6
        # all arrays same length
        assert len(d["income"]) == 6
        assert len(d["expense"]) == 6
        assert len(d["new_clients"]) == 6
        # months format YYYY-MM ascending
        for m in d["months"]:
            assert len(m) == 7 and m[4] == "-", f"bad month format {m}"

    def test_custom_3_months(self, H):
        r = requests.get(f"{API}/dashboard/timeseries", headers=H, params={"months": 3}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["months"]) == 3
        assert len(d["income"]) == 3
        assert len(d["expense"]) == 3
        assert len(d["new_clients"]) == 3

    def test_income_reflected_in_current_month(self, H):
        # baseline
        base = requests.get(f"{API}/dashboard/timeseries", headers=H, params={"months": 1}, timeout=15).json()
        assert len(base["months"]) == 1
        current_month = base["months"][0]
        baseline_income = base["income"][0]
        # add income transaction dated today
        today = f"{current_month}-15"
        r = requests.post(f"{API}/transactions", headers=H, json={
            "type": "income", "amount": 777.0, "description": "TEST_timeseries", "date": today,
        }, timeout=15)
        assert r.status_code == 200
        tx_id = r.json()["id"]
        try:
            after = requests.get(f"{API}/dashboard/timeseries", headers=H, params={"months": 1}, timeout=15).json()
            assert after["months"][0] == current_month
            assert abs(after["income"][0] - (baseline_income + 777.0)) < 0.01, (
                f"income delta wrong. before={baseline_income} after={after['income'][0]}"
            )
        finally:
            requests.delete(f"{API}/transactions/{tx_id}", headers=H, timeout=15)
