"""AZVIO Backend API tests (pytest).

Covers auth, clients, finance/transactions, content, events, services,
links, dashboard, Sanad AI chat + history, and invoice AI extraction.
"""
import io
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
) or "https://azvio-workspace.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "Info@azvio.co"
ADMIN_PASSWORD = "Azvio@2026"

# ---------- shared fixtures ----------


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------

class TestAuth:
    def test_login_success_primary(self):
        r = requests.post(f"{API}/auth/login", json={"email": "Info@azvio.co", "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and data["token"]
        assert data["user"]["email"].lower() == "info@azvio.co"

    def test_login_case_insensitive_azzam(self):
        r = requests.post(f"{API}/auth/login", json={"email": "azzam@azvio.co", "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json()["user"]["email"].lower() == "azzam@azvio.co"

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_non_whitelisted(self):
        r = requests.post(f"{API}/auth/login", json={"email": "other@gmail.com", "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 401

    def test_me_with_token(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"].lower() == "info@azvio.co"

    def test_protected_route_without_token(self):
        r = requests.get(f"{API}/clients", timeout=15)
        assert r.status_code == 401

    def test_google_session_invalid(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": "invalid-fake-id"}, timeout=25)
        assert r.status_code == 401


# ---------- Clients CRUD ----------

class TestClients:
    _client_id = None
    _log_id = None

    def test_create_client(self, auth_headers):
        payload = {
            "name": "TEST_عميل_تجريبي",
            "phone": "0500000000",
            "service_type": "drone",
            "agreed_price": 1500,
            "source": "instagram",
            "notes": "test",
        }
        r = requests.post(f"{API}/clients", headers=auth_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["agreed_price"] == 1500
        assert "id" in data
        TestClients._client_id = data["id"]

    def test_list_clients(self, auth_headers):
        r = requests.get(f"{API}/clients", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_clients(self, auth_headers):
        r = requests.get(f"{API}/clients", headers=auth_headers, params={"search": "TEST_"}, timeout=15)
        assert r.status_code == 200
        names = [c["name"] for c in r.json()]
        assert any("TEST_" in n for n in names)

    def test_get_client(self, auth_headers):
        assert TestClients._client_id
        r = requests.get(f"{API}/clients/{TestClients._client_id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == TestClients._client_id

    def test_update_client(self, auth_headers):
        r = requests.put(
            f"{API}/clients/{TestClients._client_id}",
            headers=auth_headers,
            json={"status": "delivered"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "delivered"

    def test_add_log(self, auth_headers):
        r = requests.post(
            f"{API}/clients/{TestClients._client_id}/logs",
            headers=auth_headers,
            json={"text": "TEST_log", "log_type": "note"},
            timeout=15,
        )
        assert r.status_code == 200
        log = r.json()
        assert log["text"] == "TEST_log"
        TestClients._log_id = log["id"]
        # verify persistence
        c = requests.get(f"{API}/clients/{TestClients._client_id}", headers=auth_headers, timeout=15).json()
        assert any(lg["id"] == TestClients._log_id for lg in c.get("logs", []))

    def test_delete_log(self, auth_headers):
        r = requests.delete(
            f"{API}/clients/{TestClients._client_id}/logs/{TestClients._log_id}",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        c = requests.get(f"{API}/clients/{TestClients._client_id}", headers=auth_headers, timeout=15).json()
        assert not any(lg["id"] == TestClients._log_id for lg in c.get("logs", []))

    def test_delete_client(self, auth_headers):
        r = requests.delete(f"{API}/clients/{TestClients._client_id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/clients/{TestClients._client_id}", headers=auth_headers, timeout=15)
        assert r2.status_code == 404


# ---------- Transactions / Finance ----------

class TestFinance:
    _tx_ids = []

    def test_create_income(self, auth_headers):
        r = requests.post(f"{API}/transactions", headers=auth_headers, json={
            "type": "income", "amount": 2000, "description": "TEST_income", "date": "2026-01-15"
        }, timeout=15)
        assert r.status_code == 200
        TestFinance._tx_ids.append(r.json()["id"])

    def test_create_expense(self, auth_headers):
        r = requests.post(f"{API}/transactions", headers=auth_headers, json={
            "type": "expense", "amount": 300, "description": "TEST_expense", "date": "2026-01-15"
        }, timeout=15)
        assert r.status_code == 200
        TestFinance._tx_ids.append(r.json()["id"])

    def test_create_withdrawal(self, auth_headers):
        r = requests.post(f"{API}/transactions", headers=auth_headers, json={
            "type": "withdrawal", "amount": 500, "description": "TEST_withdrawal"
        }, timeout=15)
        assert r.status_code == 200
        TestFinance._tx_ids.append(r.json()["id"])

    def test_create_subscription(self, auth_headers):
        r = requests.post(f"{API}/transactions", headers=auth_headers, json={
            "type": "subscription", "amount": 50, "description": "TEST_sub"
        }, timeout=15)
        assert r.status_code == 200
        TestFinance._tx_ids.append(r.json()["id"])

    def test_create_debt_and_toggle_paid(self, auth_headers):
        r = requests.post(f"{API}/transactions", headers=auth_headers, json={
            "type": "debt", "amount": 400, "description": "TEST_debt",
            "debt_direction": "owed_to_me", "paid": False
        }, timeout=15)
        assert r.status_code == 200
        tx = r.json()
        assert tx["debt_direction"] == "owed_to_me" and tx["paid"] is False
        TestFinance._tx_ids.append(tx["id"])
        # toggle
        r2 = requests.put(f"{API}/transactions/{tx['id']}", headers=auth_headers, json={"paid": True}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["paid"] is True

    def test_summary_math(self, auth_headers):
        r = requests.get(f"{API}/finance/summary", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        s = r.json()
        for key in ["total_income", "total_expenses", "total_withdrawals", "net_balance",
                    "monthly_subscriptions", "debts_owed_to_me", "debts_i_owe",
                    "month_income", "month_expenses"]:
            assert key in s, f"Missing key {key}"
        # net_balance formula check
        expected_net = s["total_income"] - s["total_expenses"] - s["total_withdrawals"] - s["monthly_subscriptions"]
        assert abs(s["net_balance"] - expected_net) < 0.01

    def test_filter_by_type(self, auth_headers):
        r = requests.get(f"{API}/transactions", headers=auth_headers, params={"type": "debt"}, timeout=15)
        assert r.status_code == 200
        assert all(t["type"] == "debt" for t in r.json())

    def test_cleanup_transactions(self, auth_headers):
        for tid in TestFinance._tx_ids:
            requests.delete(f"{API}/transactions/{tid}", headers=auth_headers, timeout=15)


# ---------- Content ----------

class TestContent:
    _id = None

    def test_create(self, auth_headers):
        r = requests.post(f"{API}/content", headers=auth_headers, json={
            "title": "TEST_content", "description": "test", "stage": "idea"
        }, timeout=15)
        assert r.status_code == 200
        TestContent._id = r.json()["id"]

    def test_list(self, auth_headers):
        r = requests.get(f"{API}/content", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stage_update(self, auth_headers):
        r = requests.put(f"{API}/content/{TestContent._id}", headers=auth_headers, json={"stage": "filming"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["stage"] == "filming"

    def test_delete(self, auth_headers):
        r = requests.delete(f"{API}/content/{TestContent._id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200


# ---------- Events ----------

class TestEvents:
    _id = None

    def test_create(self, auth_headers):
        r = requests.post(f"{API}/events", headers=auth_headers, json={
            "title": "TEST_event", "event_type": "shooting", "date": "2026-06-01", "time": "16:00"
        }, timeout=15)
        assert r.status_code == 200
        TestEvents._id = r.json()["id"]

    def test_list(self, auth_headers):
        r = requests.get(f"{API}/events", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert any(e.get("id") == TestEvents._id for e in r.json())

    def test_delete(self, auth_headers):
        r = requests.delete(f"{API}/events/{TestEvents._id}", headers=auth_headers, timeout=15)
        assert r.status_code == 200


# ---------- Services / Links ----------

class TestServicesLinks:
    def test_services_seeded(self, auth_headers):
        r = requests.get(f"{API}/services", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_links_seeded(self, auth_headers):
        r = requests.get(f"{API}/links", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 4

    def test_service_crud(self, auth_headers):
        r = requests.post(f"{API}/services", headers=auth_headers, json={
            "title": "TEST_service", "service_type": "drone", "price_from": 100, "price_to": 200
        }, timeout=15)
        assert r.status_code == 200
        sid = r.json()["id"]
        r2 = requests.put(f"{API}/services/{sid}", headers=auth_headers, json={"price_to": 300}, timeout=15)
        assert r2.status_code == 200 and r2.json()["price_to"] == 300
        r3 = requests.delete(f"{API}/services/{sid}", headers=auth_headers, timeout=15)
        assert r3.status_code == 200

    def test_link_crud(self, auth_headers):
        r = requests.post(f"{API}/links", headers=auth_headers, json={
            "title": "TEST_link", "url": "https://example.com", "icon": "link-outline"
        }, timeout=15)
        assert r.status_code == 200
        lid = r.json()["id"]
        r2 = requests.delete(f"{API}/links/{lid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200


# ---------- Dashboard ----------

class TestDashboard:
    def test_dashboard(self, auth_headers):
        r = requests.get(f"{API}/dashboard", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["clients_total", "clients_in_progress", "clients_delivered",
                  "month_income", "month_expenses", "upcoming_events", "content_stages"]:
            assert k in d
        assert set(d["content_stages"].keys()) == {"idea", "filming", "editing", "published"}


# ---------- Sanad AI ----------

class TestSanad:
    SESSION_ID = f"TEST_sanad_{uuid.uuid4().hex[:8]}"

    def test_chat_arabic_with_action(self, auth_headers):
        payload = {
            "message": "سجل مصروف 150 ريال قهوة للاجتماع",
            "session_id": TestSanad.SESSION_ID,
        }
        # generous timeout, allow one retry for transient budget errors
        last_err = None
        for attempt in range(2):
            try:
                r = requests.post(f"{API}/sanad/chat", headers=auth_headers, json=payload, timeout=90)
                if r.status_code == 500 and "Budget" in r.text:
                    time.sleep(5)
                    continue
                break
            except requests.exceptions.RequestException as e:
                last_err = e
                time.sleep(3)
        else:
            pytest.fail(f"Sanad chat repeatedly failed: {last_err}")

        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data and data["reply"]
        # reply must be Arabic
        assert any("\u0600" <= ch <= "\u06FF" for ch in data["reply"]), "Reply is not Arabic"
        # actions array must contain at least one executed action
        assert isinstance(data.get("actions"), list)
        assert len(data["actions"]) >= 1, f"No actions executed. reply={data['reply']!r}"
        # verify a transaction was actually created
        txs = requests.get(f"{API}/transactions", headers=auth_headers, params={"type": "expense"}, timeout=15).json()
        assert any(abs(t["amount"] - 150) < 0.01 for t in txs), "Expense of 150 not persisted"

    def test_history(self, auth_headers):
        r = requests.get(f"{API}/sanad/history", headers=auth_headers, params={"session_id": TestSanad.SESSION_ID}, timeout=15)
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 2  # user + assistant

    def test_clear_history(self, auth_headers):
        r = requests.delete(f"{API}/sanad/history", headers=auth_headers, params={"session_id": TestSanad.SESSION_ID}, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/sanad/history", headers=auth_headers, params={"session_id": TestSanad.SESSION_ID}, timeout=15)
        assert r2.json() == []


# ---------- Invoice AI extraction ----------

def _build_test_pdf() -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 780, "INVOICE - TEST SUPPLIES CO.")
    c.setFont("Helvetica", 12)
    c.drawString(100, 750, "Vendor: TEST Supplies Co.")
    c.drawString(100, 730, "Date: 2026-01-10")
    c.drawString(100, 710, "Item: Camera accessories")
    c.drawString(100, 690, "Category: Equipment / معدات")
    c.drawString(100, 660, "TOTAL: 275.00 SAR")
    c.showPage()
    c.save()
    return buf.getvalue()


class TestInvoice:
    def test_analyze_invoice_pdf(self, auth_headers):
        pdf = _build_test_pdf()
        files = {"file": ("test_invoice.pdf", pdf, "application/pdf")}
        headers = {"Authorization": auth_headers["Authorization"]}  # let requests set multipart
        last_err = None
        for attempt in range(2):
            try:
                r = requests.post(f"{API}/invoices/analyze", headers=headers, files=files, timeout=120)
                if r.status_code == 500 and "Budget" in r.text:
                    time.sleep(5)
                    continue
                break
            except requests.exceptions.RequestException as e:
                last_err = e
                time.sleep(3)
        else:
            pytest.fail(f"Invoice analyze failed repeatedly: {last_err}")

        assert r.status_code == 200, r.text
        data = r.json()
        assert "extracted" in data
        ex = data["extracted"]
        # keys presence
        for k in ["vendor", "amount", "date", "suggested_type"]:
            assert k in ex, f"Missing {k} in extracted: {ex}"
        # amount should equal 275
        assert abs(float(ex["amount"]) - 275) < 1, f"Amount mismatch: {ex['amount']}"
        assert ex["suggested_type"] in ("income", "expense")
