"""AZVIO Phase B — Backend tests for iteration 3.

Covers new endpoints:
  1. Service Types CRUD (defaults protected, dedupe, PUT/DELETE)
  2. My Pricing CRUD (+ filter by service_type)
  3. Sanad AI: /sanad/pricing-advice, /sanad/explain-service-type
  4. Weekly Insights: /insights/weekly
  5. Finance Statistics: /finance/statistics (with tx reflection)
  6. Bank Statement analyze (auto-delete file) + save
  7. Links PUT (new)
  8. Regression sanity on old endpoints
"""
import io
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
UPLOAD_DIR = "/tmp/azvio_uploads"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def HA(token):
    """Auth headers WITHOUT content-type (for multipart)."""
    return {"Authorization": f"Bearer {token}"}


def _sanad_post(H, path, json_body, timeout=90):
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
    pytest.fail(f"Sanad {path} failed: {last}")


# ============ 1. Service Types CRUD ============

class TestServiceTypes:
    _created_id = None

    def test_list_defaults_present(self, H):
        r = requests.get(f"{API}/service-types", headers=H, timeout=15)
        assert r.status_code == 200, r.text
        types = r.json()
        assert isinstance(types, list)
        keys = {t["key"]: t for t in types}
        assert "drone" in keys, f"Missing drone default. Got: {list(keys)}"
        assert "editing" in keys, f"Missing editing default. Got: {list(keys)}"
        assert keys["drone"].get("is_default") is True
        assert keys["editing"].get("is_default") is True

    def test_create_custom_type(self, H):
        key = f"testphoto_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/service-types", headers=H, json={
            "key": key, "label": "التصوير الفوتوغرافي",
            "description": "تصوير أرضي احترافي", "icon": "camera",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["key"] == key
        assert d["label"] == "التصوير الفوتوغرافي"
        assert d["is_default"] is False
        assert "id" in d
        TestServiceTypes._created_id = d["id"]
        TestServiceTypes._created_key = key

    def test_create_duplicate_returns_400(self, H):
        assert TestServiceTypes._created_key
        r = requests.post(f"{API}/service-types", headers=H, json={
            "key": TestServiceTypes._created_key, "label": "x", "description": "", "icon": "camera",
        }, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_update_label(self, H):
        assert TestServiceTypes._created_id
        r = requests.put(f"{API}/service-types/{TestServiceTypes._created_id}", headers=H,
                         json={"label": "تصوير فوتوغرافي محدث"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["label"] == "تصوير فوتوغرافي محدث"

    def test_delete_default_blocked(self, H):
        types = requests.get(f"{API}/service-types", headers=H, timeout=15).json()
        drone = next(t for t in types if t["key"] == "drone")
        r = requests.delete(f"{API}/service-types/{drone['id']}", headers=H, timeout=15)
        assert r.status_code == 400, f"Deleting default should be blocked, got {r.status_code} {r.text}"
        # verify still there
        after = requests.get(f"{API}/service-types", headers=H, timeout=15).json()
        assert any(t["key"] == "drone" for t in after)

    def test_delete_custom_ok(self, H):
        r = requests.delete(f"{API}/service-types/{TestServiceTypes._created_id}", headers=H, timeout=15)
        assert r.status_code == 200
        after = requests.get(f"{API}/service-types", headers=H, timeout=15).json()
        assert not any(t.get("id") == TestServiceTypes._created_id for t in after)


# ============ 2. My Pricing CRUD ============

class TestMyPricing:
    _created_id = None
    _other_id = None

    def test_create(self, H):
        r = requests.post(f"{API}/my-pricing", headers=H, json={
            "service_type": "drone", "sub_category": "عقاري",
            "label": "TEST_فيلا كبيرة", "price_from": 1500, "price_to": 2500,
            "notes": "شامل التصوير والمونتاج القصير",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["label"] == "TEST_فيلا كبيرة"
        assert d["price_from"] == 1500
        assert d["price_to"] == 2500
        assert d["service_type"] == "drone"
        assert "id" in d
        TestMyPricing._created_id = d["id"]

    def test_list_contains_created(self, H):
        r = requests.get(f"{API}/my-pricing", headers=H, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(x["id"] == TestMyPricing._created_id for x in items)

    def test_filter_by_service_type(self, H):
        # add an editing pricing for filter test
        r = requests.post(f"{API}/my-pricing", headers=H, json={
            "service_type": "editing", "sub_category": "",
            "label": "TEST_مونتاج ريلز", "price_from": 300, "price_to": 700, "notes": "",
        }, timeout=15)
        assert r.status_code == 200
        TestMyPricing._other_id = r.json()["id"]

        r = requests.get(f"{API}/my-pricing", headers=H, params={"service_type": "drone"}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert all(x["service_type"] == "drone" for x in items)
        assert any(x["id"] == TestMyPricing._created_id for x in items)
        assert not any(x["id"] == TestMyPricing._other_id for x in items)

    def test_update(self, H):
        r = requests.put(f"{API}/my-pricing/{TestMyPricing._created_id}", headers=H,
                         json={"price_to": 3000}, timeout=15)
        assert r.status_code == 200
        assert r.json()["price_to"] == 3000

    def test_delete(self, H):
        r = requests.delete(f"{API}/my-pricing/{TestMyPricing._created_id}", headers=H, timeout=15)
        assert r.status_code == 200
        # cleanup the editing one too
        if TestMyPricing._other_id:
            requests.delete(f"{API}/my-pricing/{TestMyPricing._other_id}", headers=H, timeout=15)
        after = requests.get(f"{API}/my-pricing", headers=H, timeout=15).json()
        assert not any(x["id"] == TestMyPricing._created_id for x in after)


# ============ 3. Sanad: pricing-advice & explain-service-type ============

class TestSanadPricingAdvice:
    _p1 = None
    _p2 = None

    def test_no_pricing_returns_placeholder(self, H):
        # ensure no existing my-pricing rows (best-effort — this account may have leftovers)
        existing = requests.get(f"{API}/my-pricing", headers=H, timeout=15).json()
        for x in existing:
            requests.delete(f"{API}/my-pricing/{x['id']}", headers=H, timeout=15)

        r = _sanad_post(H, "/sanad/pricing-advice", {}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "لم تُضف بعد" in d.get("advice", ""), f"Expected placeholder advice, got: {d}"
        assert d.get("items") == []

    def test_advice_with_pricing_rows(self, H):
        # add 2 rows
        r1 = requests.post(f"{API}/my-pricing", headers=H, json={
            "service_type": "drone", "sub_category": "عقاري",
            "label": "TEST_فيلا فاخرة", "price_from": 2000, "price_to": 3500, "notes": "",
        }, timeout=15)
        assert r1.status_code == 200
        TestSanadPricingAdvice._p1 = r1.json()["id"]
        r2 = requests.post(f"{API}/my-pricing", headers=H, json={
            "service_type": "drone", "sub_category": "فعاليات",
            "label": "TEST_تغطية فعالية", "price_from": 800, "price_to": 1500, "notes": "",
        }, timeout=15)
        assert r2.status_code == 200
        TestSanadPricingAdvice._p2 = r2.json()["id"]

        r = _sanad_post(H, "/sanad/pricing-advice", {"service_type": "drone"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("advice"), str) and len(d["advice"]) > 0, f"advice empty: {d}"
        assert isinstance(d.get("items"), list) and len(d["items"]) >= 1, f"items empty: {d}"
        for it in d["items"]:
            assert "label" in it
            assert "market_min" in it and isinstance(it["market_min"], (int, float))
            assert "market_max" in it and isinstance(it["market_max"], (int, float))
            assert it.get("verdict") in ("low", "fair", "high", "unknown"), f"bad verdict: {it}"
            assert "note" in it

    def test_cleanup(self, H):
        for pid in (TestSanadPricingAdvice._p1, TestSanadPricingAdvice._p2):
            if pid:
                requests.delete(f"{API}/my-pricing/{pid}", headers=H, timeout=15)


class TestSanadExplainServiceType:
    def test_explain(self, H):
        r = _sanad_post(H, "/sanad/explain-service-type",
                        {"key": "photography", "label": "التصوير الفوتوغرافي"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("description"), str) and len(d["description"]) > 0, f"empty description: {d}"
        assert isinstance(d.get("target_audience"), str) and len(d["target_audience"]) > 0
        assert isinstance(d.get("typical_price_from"), (int, float))
        assert isinstance(d.get("typical_price_to"), (int, float))
        assert isinstance(d.get("tips"), list) and len(d["tips"]) >= 1


# ============ 4. Weekly Insights ============

class TestWeeklyInsights:
    def test_shape(self, H):
        r = requests.get(f"{API}/insights/weekly", headers=H, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "stats" in d and "insights" in d
        s = d["stats"]
        # week window
        assert isinstance(s.get("week_start"), str) and len(s["week_start"]) == 10 and s["week_start"][4] == "-"
        assert isinstance(s.get("week_end"), str) and len(s["week_end"]) == 10 and s["week_end"][4] == "-"
        # required numeric fields
        for k in ("income", "expense", "net", "new_clients",
                  "income_transactions", "prev_income", "prev_expense",
                  "delivered_clients", "in_progress_clients",
                  "content_added", "content_published"):
            assert k in s, f"missing stats.{k}"
        # insights structure
        ins = d["insights"]
        for k in ("headline", "wins", "alerts", "focus_next_week"):
            assert k in ins, f"missing insights.{k}"
        assert isinstance(ins["wins"], list)
        assert isinstance(ins["alerts"], list)
        assert isinstance(ins["focus_next_week"], list)


# ============ 5. Finance Statistics ============

class TestFinanceStatistics:
    _tx_ids = []

    def test_default_shape_and_length(self, H):
        r = requests.get(f"{API}/finance/statistics", headers=H, params={"months": 6}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("totals", "months", "income_series", "expense_series",
                  "net_series", "top_categories", "top_clients", "type_breakdown"):
            assert k in d, f"missing {k}"
        assert len(d["months"]) == 6
        assert len(d["income_series"]) == 6
        assert len(d["expense_series"]) == 6
        assert len(d["net_series"]) == 6
        t = d["totals"]
        for k in ("income", "expenses", "withdrawals", "subscriptions", "net",
                  "month_income", "month_expenses", "debts_to_me", "debts_i_owe"):
            assert k in t, f"missing totals.{k}"

    def test_reflects_new_transactions(self, H):
        # baseline
        base = requests.get(f"{API}/finance/statistics", headers=H, params={"months": 6}, timeout=15).json()
        base_income = base["totals"]["income"]
        base_expense = base["totals"]["expenses"]
        base_month_income = base["totals"]["month_income"]

        # today YYYY-MM-DD via server: use today month prefix from stats — safer: use first server month
        current_month = base["months"][-1]  # last is newest
        date_today = f"{current_month}-15"

        # add income + expense
        r1 = requests.post(f"{API}/transactions", headers=H, json={
            "type": "income", "amount": 1234.0, "description": "TEST_stats_income",
            "date": date_today, "category": "TEST_cat_stats", "client_name": "TEST_client_stats",
        }, timeout=15)
        assert r1.status_code == 200
        TestFinanceStatistics._tx_ids.append(r1.json()["id"])

        r2 = requests.post(f"{API}/transactions", headers=H, json={
            "type": "expense", "amount": 234.0, "description": "TEST_stats_expense",
            "date": date_today, "category": "TEST_cat_stats",
        }, timeout=15)
        assert r2.status_code == 200
        TestFinanceStatistics._tx_ids.append(r2.json()["id"])

        after = requests.get(f"{API}/finance/statistics", headers=H, params={"months": 6}, timeout=15).json()
        assert abs(after["totals"]["income"] - (base_income + 1234.0)) < 0.01
        assert abs(after["totals"]["expenses"] - (base_expense + 234.0)) < 0.01
        assert abs(after["totals"]["month_income"] - (base_month_income + 1234.0)) < 0.01
        # net series last-month delta = income - expense = +1000
        assert abs(after["income_series"][-1] - base["income_series"][-1] - 1234.0) < 0.01
        assert abs(after["expense_series"][-1] - base["expense_series"][-1] - 234.0) < 0.01
        # top_categories should contain our TEST_cat_stats
        cats = [c["category"] for c in after["top_categories"]]
        assert "TEST_cat_stats" in cats
        # top_clients should include TEST_client_stats
        clients = [c["client"] for c in after["top_clients"]]
        assert "TEST_client_stats" in clients

    def test_cleanup(self, H):
        for tid in TestFinanceStatistics._tx_ids:
            requests.delete(f"{API}/transactions/{tid}", headers=H, timeout=15)


# ============ 6. Bank Statement analyze + save (with file auto-delete) ============

# Minimal 1-page PDF (valid header)
MIN_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>endobj\n"
    b"4 0 obj<</Length 44>>stream\n"
    b"BT /F1 12 Tf 20 100 Td (Bank Statement Test) Tj ET\n"
    b"endstream endobj\n"
    b"xref\n0 5\n"
    b"0000000000 65535 f \n"
    b"0000000009 00000 n \n"
    b"0000000053 00000 n \n"
    b"0000000098 00000 n \n"
    b"0000000175 00000 n \n"
    b"trailer<</Size 5/Root 1 0 R>>\nstartxref\n256\n%%EOF\n"
)


class TestBankStatement:
    _saved_tx_ids = []

    def test_analyze_deletes_uploaded_file(self, HA):
        before = set(os.listdir(UPLOAD_DIR)) if os.path.isdir(UPLOAD_DIR) else set()
        files = {"file": ("stmt.pdf", io.BytesIO(MIN_PDF), "application/pdf")}
        r = requests.post(f"{API}/finance/statement/analyze", headers=HA, files=files, timeout=120)
        # response may be 200 (parsed even if empty) or 500 if LLM rejects — either way, file must be deleted
        after = set(os.listdir(UPLOAD_DIR)) if os.path.isdir(UPLOAD_DIR) else set()
        new_files = after - before
        assert not new_files, f"Upload file NOT auto-deleted! Leftover: {new_files}"
        # response shape check when 200
        if r.status_code == 200:
            d = r.json()
            assert "extracted" in d and isinstance(d["extracted"], list)
            assert "count" in d and isinstance(d["count"], int)
        else:
            # allowed: 500 (LLM failed to parse the minimal blank pdf) but file must still be gone
            print(f"[info] analyze returned {r.status_code}; file deletion still verified.")

    def test_save_inserts_transactions(self, H):
        r = requests.post(f"{API}/finance/statement/save", headers=H, json={
            "transactions": [
                {"type": "income", "amount": 100, "date": "2026-06-01",
                 "description": "TEST_stmt_save income", "category": "TEST_stmt_cat", "client_name": ""},
            ]
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("inserted") == 1, f"expected 1 inserted, got {d}"

        # verify it appears in list
        txs = requests.get(f"{API}/transactions", headers=H, params={"type": "income"}, timeout=15).json()
        matched = [t for t in txs if t.get("description") == "TEST_stmt_save income"]
        assert len(matched) >= 1, "saved statement tx not found in listing"
        TestBankStatement._saved_tx_ids.append(matched[0]["id"])

    def test_save_empty_returns_zero(self, H):
        r = requests.post(f"{API}/finance/statement/save", headers=H, json={"transactions": []}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("inserted") == 0

    def test_cleanup(self, H):
        for tid in TestBankStatement._saved_tx_ids:
            requests.delete(f"{API}/transactions/{tid}", headers=H, timeout=15)


# ============ 7. Links CRUD (with new PUT) ============

class TestLinks:
    _created_id = None

    def test_defaults_present(self, H):
        r = requests.get(f"{API}/links", headers=H, timeout=15)
        assert r.status_code == 200
        links = r.json()
        titles = {l["title"] for l in links}
        # after fresh seed there should be at least these 2 defaults
        assert "منصة رائد" in titles or "موقع AZVIO" in titles, f"expected defaults, got {titles}"

    def test_create(self, H):
        r = requests.post(f"{API}/links", headers=H, json={
            "title": "TEST_رابط", "url": "https://example.com", "icon": "link-outline",
        }, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST_رابط"
        TestLinks._created_id = d["id"]

    def test_update(self, H):
        assert TestLinks._created_id
        r = requests.put(f"{API}/links/{TestLinks._created_id}", headers=H,
                         json={"title": "TEST_محدّث"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "TEST_محدّث"

    def test_delete(self, H):
        r = requests.delete(f"{API}/links/{TestLinks._created_id}", headers=H, timeout=15)
        assert r.status_code == 200
        after = requests.get(f"{API}/links", headers=H, timeout=15).json()
        assert not any(l["id"] == TestLinks._created_id for l in after)


# ============ 8. Regression Sanity ============

class TestRegressionOldEndpoints:
    @pytest.mark.parametrize("path", [
        "/categories", "/clients", "/transactions", "/content",
        "/events", "/dashboard", "/dashboard/timeseries",
    ])
    def test_get_ok(self, H, path):
        r = requests.get(f"{API}{path}", headers=H, timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_sanad_price_opinion_still_works(self, H):
        r = _sanad_post(H, "/sanad/price-opinion", {
            "service_type": "drone", "sub_category": "عقاري", "agreed_price": 1500,
        }, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d.get("verdict") in ("low", "fair", "high", "unknown")

    def test_sanad_suggest_services(self, H):
        r = _sanad_post(H, "/sanad/suggest-services", {"service_type": "drone"}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("services"), list) and len(d["services"]) >= 1

    def test_sanad_suggest_categories(self, H):
        r = _sanad_post(H, "/sanad/suggest-categories", {"service_type": "drone"}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("categories"), list) and len(d["categories"]) >= 1

    def test_sanad_chat_add_category_action(self, H):
        sid = f"TEST_regress_{uuid.uuid4().hex[:6]}"
        msg = "أضف فئة تصوير مطاعم للدرون مع شرح: للمطاعم والكافيهات"
        r = _sanad_post(H, "/sanad/chat", {"message": msg, "session_id": sid}, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("actions"), list)
        # verify category exists
        cats = requests.get(f"{API}/categories", headers=H,
                            params={"service_type": "drone"}, timeout=15).json()
        m = next((c for c in cats if c["name"].strip() == "تصوير مطاعم"), None)
        if m:
            requests.delete(f"{API}/categories/{m['id']}", headers=H, timeout=15)
        requests.delete(f"{API}/sanad/history", headers=H,
                        params={"session_id": sid}, timeout=15)
        assert m is not None, f"add_category action did not persist. actions={data.get('actions')}"
