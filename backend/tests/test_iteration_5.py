"""AZVIO Iteration 5 backend tests.

Covers:
- GET /api/user/settings (defaults if empty)
- PUT /api/user/settings/dashboard (dedupe, filter unknowns, upsert)
- POST /api/user/settings/dashboard/reset
- Auth enforcement (401 without token)
- Service Types regression (seed defaults, create/list/delete + default-delete guard)
"""
import os
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

DEFAULT_ORDER = ["stats", "incomeChart", "contentChart", "nav", "events"]
DEFAULT_VISIBLE = {k: True for k in DEFAULT_ORDER}


# ------- fixtures -------

@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _reset_after(auth_headers):
    """Ensure prefs reset to defaults after this module runs so we don't leave garbage."""
    yield
    try:
        requests.post(
            f"{API}/user/settings/dashboard/reset", headers=auth_headers, timeout=15
        )
    except Exception:
        pass


# ------- Auth enforcement -------

class TestUserSettingsAuth:
    def test_get_settings_requires_auth(self):
        r = requests.get(f"{API}/user/settings", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_put_dashboard_requires_auth(self):
        r = requests.put(
            f"{API}/user/settings/dashboard",
            json={"order": DEFAULT_ORDER},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text

    def test_reset_requires_auth(self):
        r = requests.post(f"{API}/user/settings/dashboard/reset", timeout=15)
        assert r.status_code in (401, 403), r.text


# ------- Core behaviour -------

class TestUserSettingsCore:
    def test_reset_first_then_get_defaults(self, auth_headers):
        # Reset to make state deterministic
        r0 = requests.post(
            f"{API}/user/settings/dashboard/reset", headers=auth_headers, timeout=15
        )
        assert r0.status_code == 200, r0.text
        payload = r0.json()
        assert "dashboard" in payload
        assert payload["dashboard"]["order"] == DEFAULT_ORDER
        assert payload["dashboard"]["visible"] == DEFAULT_VISIBLE

        # GET returns same defaults
        r = requests.get(f"{API}/user/settings", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()["dashboard"]
        assert d["order"] == DEFAULT_ORDER
        assert d["visible"] == DEFAULT_VISIBLE

    def test_put_order_and_visible_persists(self, auth_headers):
        new_order = ["events", "nav", "stats", "incomeChart", "contentChart"]
        r = requests.put(
            f"{API}/user/settings/dashboard",
            headers=auth_headers,
            json={"order": new_order, "visible": {"events": False}},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()["dashboard"]
        assert d["order"] == new_order
        assert d["visible"]["events"] is False
        # others remain True (merged with defaults)
        for k in ["stats", "incomeChart", "contentChart", "nav"]:
            assert d["visible"][k] is True

        # GET reflects persisted state
        r2 = requests.get(f"{API}/user/settings", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()["dashboard"]
        assert d2["order"] == new_order
        assert d2["visible"]["events"] is False

    def test_put_dedupes_and_filters_unknown_keys(self, auth_headers):
        # duplicates + unknown key "foo" — should be dropped; missing keys appended
        r = requests.put(
            f"{API}/user/settings/dashboard",
            headers=auth_headers,
            json={
                "order": ["nav", "nav", "foo", "stats"],
                "visible": {"stats": False, "foo": True, "nav": False},
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()["dashboard"]
        # deduped nav, dropped foo, appended remaining defaults
        assert d["order"][:2] == ["nav", "stats"]
        assert set(d["order"]) == set(DEFAULT_ORDER)
        assert len(d["order"]) == len(DEFAULT_ORDER)
        # visible: unknown ignored, known applied, defaults filled
        assert d["visible"]["stats"] is False
        assert d["visible"]["nav"] is False
        assert d["visible"]["events"] is True
        assert "foo" not in d["visible"]

    def test_reset_restores_defaults(self, auth_headers):
        r = requests.post(
            f"{API}/user/settings/dashboard/reset", headers=auth_headers, timeout=15
        )
        assert r.status_code == 200, r.text
        d = r.json()["dashboard"]
        assert d["order"] == DEFAULT_ORDER
        assert d["visible"] == DEFAULT_VISIBLE

        r2 = requests.get(f"{API}/user/settings", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()["dashboard"]
        assert d2["order"] == DEFAULT_ORDER
        assert d2["visible"] == DEFAULT_VISIBLE

    def test_put_only_visible_keeps_order(self, auth_headers):
        # Set a specific order first
        custom_order = ["events", "nav", "stats", "incomeChart", "contentChart"]
        r0 = requests.put(
            f"{API}/user/settings/dashboard",
            headers=auth_headers,
            json={"order": custom_order},
            timeout=15,
        )
        assert r0.status_code == 200
        # Now PUT only visible
        r = requests.put(
            f"{API}/user/settings/dashboard",
            headers=auth_headers,
            json={"visible": {"nav": False}},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()["dashboard"]
        assert d["order"] == custom_order
        assert d["visible"]["nav"] is False


# ------- Service Types regression -------

class TestServiceTypes:
    _created_id = None

    def test_defaults_seeded(self, auth_headers):
        r = requests.get(f"{API}/service-types", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        keys = {i["key"]: i for i in items}
        assert "drone" in keys and keys["drone"].get("is_default") is True
        assert "editing" in keys and keys["editing"].get("is_default") is True

    def test_create_photography(self, auth_headers):
        # cleanup any leftover with same key
        existing = requests.get(f"{API}/service-types", headers=auth_headers, timeout=15).json()
        for it in existing:
            if it.get("key") == "photography":
                requests.delete(f"{API}/service-types/{it['id']}", headers=auth_headers, timeout=15)

        r = requests.post(
            f"{API}/service-types",
            headers=auth_headers,
            json={"key": "photography", "label": "تصوير فوتوغرافي"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["key"] == "photography"
        assert doc["label"] == "تصوير فوتوغرافي"
        assert doc.get("is_default") is False
        TestServiceTypes._created_id = doc["id"]

        # verify present in GET
        r2 = requests.get(f"{API}/service-types", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        keys = {i["key"] for i in r2.json()}
        assert "photography" in keys

    def test_delete_default_forbidden(self, auth_headers):
        items = requests.get(f"{API}/service-types", headers=auth_headers, timeout=15).json()
        drone = next(i for i in items if i["key"] == "drone")
        r = requests.delete(
            f"{API}/service-types/{drone['id']}", headers=auth_headers, timeout=15
        )
        assert r.status_code == 400, r.text

    def test_delete_non_default_succeeds(self, auth_headers):
        assert TestServiceTypes._created_id, "prior create test must have run"
        r = requests.delete(
            f"{API}/service-types/{TestServiceTypes._created_id}",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        # ensure removed
        items = requests.get(f"{API}/service-types", headers=auth_headers, timeout=15).json()
        keys = {i["key"] for i in items}
        assert "photography" not in keys
