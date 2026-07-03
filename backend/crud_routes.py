import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db

router = APIRouter(dependencies=[Depends(get_current_user)])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def new_id():
    return uuid.uuid4().hex


# ============ Clients ============

class ClientCreate(BaseModel):
    name: str
    phone: str = ""
    service_type: str = "drone"  # drone | editing | both
    sub_category: str = ""  # e.g. "عقاري", "فعاليات" - free-text linked to categories
    agreed_price: float = 0
    status: str = "in_progress"  # in_progress | delivered
    drive_link: str = ""
    source: str = ""  # legacy source (kept for backwards compat)
    notes: str = ""


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    service_type: Optional[str] = None
    sub_category: Optional[str] = None
    agreed_price: Optional[float] = None
    status: Optional[str] = None
    drive_link: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class LogCreate(BaseModel):
    text: str = ""
    log_type: str = "note"  # note | whatsapp | form | file
    attachment_name: str = ""
    attachment_mime: str = ""
    attachment_data: str = ""  # base64


@router.get("/clients")
async def list_clients(search: str = ""):
    q = {"name": {"$regex": search, "$options": "i"}} if search else {}
    return await db.clients.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/clients")
async def create_client(body: ClientCreate):
    doc = body.model_dump()
    doc.update({"id": new_id(), "logs": [], "created_at": now_iso(), "updated_at": now_iso()})
    await db.clients.insert_one(dict(doc))
    return doc


@router.get("/clients/{client_id}")
async def get_client(client_id: str):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return doc


@router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    r = await db.clients.update_one({"id": client_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return await db.clients.find_one({"id": client_id}, {"_id": 0})


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    r = await db.clients.delete_one({"id": client_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return {"ok": True}


@router.post("/clients/{client_id}/logs")
async def add_client_log(client_id: str, body: LogCreate):
    log = {
        "id": new_id(),
        "text": body.text or "",
        "log_type": body.log_type,
        "created_at": now_iso(),
    }
    if body.attachment_data:
        log["attachment"] = {
            "name": body.attachment_name or "ملف",
            "mime": body.attachment_mime or "application/octet-stream",
            "data": body.attachment_data,
        }
    r = await db.clients.update_one({"id": client_id}, {"$push": {"logs": log}, "$set": {"updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    # trimmed response (no big base64)
    resp = {**log}
    if "attachment" in resp:
        resp["attachment"] = {"name": resp["attachment"]["name"], "mime": resp["attachment"]["mime"]}
    return resp


@router.delete("/clients/{client_id}/logs/{log_id}")
async def delete_client_log(client_id: str, log_id: str):
    await db.clients.update_one({"id": client_id}, {"$pull": {"logs": {"id": log_id}}})
    return {"ok": True}


@router.get("/clients/{client_id}/logs/{log_id}/attachment")
async def get_client_log_attachment(client_id: str, log_id: str):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "logs": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    for lg in doc.get("logs", []):
        if lg.get("id") == log_id and lg.get("attachment"):
            return lg["attachment"]
    raise HTTPException(status_code=404, detail="المرفق غير موجود")


# ============ Categories (Client Sub-Categories) ============

class CategoryCreate(BaseModel):
    name: str
    service_type: str = "drone"  # drone | editing
    description: str = ""  # hidden note (Sanad-only context)
    source: str = "manual"  # manual | sanad


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    description: Optional[str] = None


@router.get("/categories")
async def list_categories(service_type: str = ""):
    q = {"service_type": service_type} if service_type else {}
    return await db.categories.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/categories")
async def create_category(body: CategoryCreate):
    # dedupe on (name, service_type)
    existing = await db.categories.find_one({"name": body.name.strip(), "service_type": body.service_type})
    if existing:
        raise HTTPException(status_code=400, detail="الفئة موجودة مسبقاً")
    doc = body.model_dump()
    doc["name"] = doc["name"].strip()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.categories.insert_one(dict(doc))
    return doc


@router.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    r = await db.categories.update_one({"id": cat_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="الفئة غير موجودة")
    return await db.categories.find_one({"id": cat_id}, {"_id": 0})


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ============ Transactions / Finance ============

class TransactionCreate(BaseModel):
    type: str  # income | expense | withdrawal | debt | subscription
    amount: float
    description: str = ""
    category: str = ""
    date: str = ""
    client_name: str = ""
    debt_direction: str = "owed_to_me"  # owed_to_me | i_owe
    paid: bool = False


class TransactionUpdate(BaseModel):
    type: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    client_name: Optional[str] = None
    debt_direction: Optional[str] = None
    paid: Optional[bool] = None


@router.get("/transactions")
async def list_transactions(type: str = ""):
    q = {"type": type} if type else {}
    return await db.transactions.find(q, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(2000)


@router.post("/transactions")
async def create_transaction(body: TransactionCreate):
    doc = body.model_dump()
    if not doc.get("date"):
        doc["date"] = today_str()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.transactions.insert_one(dict(doc))
    return doc


@router.put("/transactions/{tx_id}")
async def update_transaction(tx_id: str, body: TransactionUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.transactions.update_one({"id": tx_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    return await db.transactions.find_one({"id": tx_id}, {"_id": 0})


@router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str):
    r = await db.transactions.delete_one({"id": tx_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    return {"ok": True}


@router.get("/finance/summary")
async def finance_summary():
    txs = await db.transactions.find({}, {"_id": 0}).to_list(10000)
    month = datetime.now(timezone.utc).strftime("%Y-%m")

    def total(t):
        return sum(x["amount"] for x in txs if x["type"] == t)

    total_income = total("income")
    total_expenses = total("expense")
    total_withdrawals = total("withdrawal")
    subs_monthly = total("subscription")
    debts_to_me = sum(x["amount"] for x in txs if x["type"] == "debt" and x.get("debt_direction") == "owed_to_me" and not x.get("paid"))
    debts_i_owe = sum(x["amount"] for x in txs if x["type"] == "debt" and x.get("debt_direction") == "i_owe" and not x.get("paid"))
    month_income = sum(x["amount"] for x in txs if x["type"] == "income" and (x.get("date") or "").startswith(month))
    month_expenses = sum(x["amount"] for x in txs if x["type"] in ("expense", "subscription") and (x.get("date") or "").startswith(month))
    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_withdrawals": total_withdrawals,
        "net_balance": total_income - total_expenses - total_withdrawals - subs_monthly,
        "monthly_subscriptions": subs_monthly,
        "debts_owed_to_me": debts_to_me,
        "debts_i_owe": debts_i_owe,
        "month_income": month_income,
        "month_expenses": month_expenses,
    }


# ============ Content ============

class ContentCreate(BaseModel):
    title: str
    description: str = ""
    stage: str = "idea"  # idea | filming | editing | published


class ContentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    stage: Optional[str] = None


@router.get("/content")
async def list_content():
    return await db.content.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/content")
async def create_content(body: ContentCreate):
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.content.insert_one(dict(doc))
    return doc


@router.put("/content/{item_id}")
async def update_content(item_id: str, body: ContentUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    r = await db.content.update_one({"id": item_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العنصر غير موجود")
    return await db.content.find_one({"id": item_id}, {"_id": 0})


@router.delete("/content/{item_id}")
async def delete_content(item_id: str):
    await db.content.delete_one({"id": item_id})
    return {"ok": True}


# ============ Services ============

class ServiceCreate(BaseModel):
    title: str
    description: str = ""
    service_type: str = "drone"
    price_from: float = 0
    price_to: float = 0


class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    service_type: Optional[str] = None
    price_from: Optional[float] = None
    price_to: Optional[float] = None


@router.get("/services")
async def list_services():
    return await db.services.find({}, {"_id": 0}).to_list(200)


@router.post("/services")
async def create_service(body: ServiceCreate):
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.services.insert_one(dict(doc))
    return doc


@router.put("/services/{service_id}")
async def update_service(service_id: str, body: ServiceUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.services.update_one({"id": service_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
    return await db.services.find_one({"id": service_id}, {"_id": 0})


@router.delete("/services/{service_id}")
async def delete_service(service_id: str):
    await db.services.delete_one({"id": service_id})
    return {"ok": True}


# ============ Quick Links ============

class LinkCreate(BaseModel):
    title: str
    url: str
    icon: str = "link-outline"


@router.get("/links")
async def list_links():
    return await db.quick_links.find({}, {"_id": 0}).to_list(200)


@router.post("/links")
async def create_link(body: LinkCreate):
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.quick_links.insert_one(dict(doc))
    return doc


@router.delete("/links/{link_id}")
async def delete_link(link_id: str):
    await db.quick_links.delete_one({"id": link_id})
    return {"ok": True}


# ============ Calendar Events ============

class EventCreate(BaseModel):
    title: str
    event_type: str = "shooting"  # shooting | delivery | other
    date: str  # YYYY-MM-DD
    time: str = ""
    client_name: str = ""
    notes: str = ""


@router.get("/events")
async def list_events():
    return await db.events.find({}, {"_id": 0}).sort("date", 1).to_list(1000)


@router.post("/events")
async def create_event(body: EventCreate):
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.events.insert_one(dict(doc))
    return doc


@router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    await db.events.delete_one({"id": event_id})
    return {"ok": True}


# ============ Dashboard ============

@router.get("/dashboard")
async def dashboard():
    clients = await db.clients.find({}, {"_id": 0, "status": 1}).to_list(5000)
    txs = await db.transactions.find({}, {"_id": 0, "type": 1, "amount": 1, "date": 1}).to_list(10000)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    month_income = sum(t["amount"] for t in txs if t["type"] == "income" and (t.get("date") or "").startswith(month))
    month_expenses = sum(t["amount"] for t in txs if t["type"] in ("expense", "subscription") and (t.get("date") or "").startswith(month))
    events = await db.events.find({"date": {"$gte": today_str()}}, {"_id": 0}).sort("date", 1).to_list(5)
    content_items = await db.content.find({}, {"_id": 0, "stage": 1}).to_list(5000)
    stages = {"idea": 0, "filming": 0, "editing": 0, "published": 0}
    for c in content_items:
        if c.get("stage") in stages:
            stages[c["stage"]] += 1
    return {
        "clients_total": len(clients),
        "clients_in_progress": sum(1 for c in clients if c.get("status") == "in_progress"),
        "clients_delivered": sum(1 for c in clients if c.get("status") == "delivered"),
        "month_income": month_income,
        "month_expenses": month_expenses,
        "upcoming_events": events,
        "content_stages": stages,
    }


@router.get("/dashboard/timeseries")
async def dashboard_timeseries(months: int = 6):
    """Returns per-month totals for income and expenses for the last `months` months."""
    now = datetime.now(timezone.utc)
    # Build list of months from oldest to newest
    ym_list = []
    for i in range(months - 1, -1, -1):
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        ym_list.append(f"{y:04d}-{m:02d}")

    txs = await db.transactions.find(
        {"date": {"$regex": f"^({'|'.join(ym_list)})"}}, {"_id": 0, "type": 1, "amount": 1, "date": 1}
    ).to_list(20000)

    income = {ym: 0.0 for ym in ym_list}
    expense = {ym: 0.0 for ym in ym_list}
    for t in txs:
        ym = (t.get("date") or "")[:7]
        if ym not in income:
            continue
        amt = float(t.get("amount") or 0)
        if t["type"] == "income":
            income[ym] += amt
        elif t["type"] in ("expense", "subscription"):
            expense[ym] += amt

    # New clients per month
    clients_all = await db.clients.find({}, {"_id": 0, "created_at": 1}).to_list(5000)
    clients_month = {ym: 0 for ym in ym_list}
    for c in clients_all:
        ym = (c.get("created_at") or "")[:7]
        if ym in clients_month:
            clients_month[ym] += 1

    return {
        "months": ym_list,
        "income": [income[ym] for ym in ym_list],
        "expense": [expense[ym] for ym in ym_list],
        "new_clients": [clients_month[ym] for ym in ym_list],
    }


# ============ Seed defaults ============

async def seed_defaults():
    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([
            {
                "id": new_id(),
                "title": "تصوير جوي بالدرون",
                "description": "تصوير فيديو وصور جوية احترافية للمشاريع والعقارات والفعاليات بجودة سينمائية عالية.",
                "service_type": "drone",
                "price_from": 500,
                "price_to": 3000,
                "created_at": now_iso(),
            },
            {
                "id": new_id(),
                "title": "مونتاج فيديو احترافي",
                "description": "مونتاج وتلوين وإضافة مؤثرات وموشن جرافيك للفيديوهات الدعائية والمحتوى الرقمي.",
                "service_type": "editing",
                "price_from": 300,
                "price_to": 1500,
                "created_at": now_iso(),
            },
        ])
    if await db.quick_links.count_documents({}) == 0:
        # Only 2 quick links per AZVIO requirements
        await db.quick_links.insert_many([
            {"id": new_id(), "title": "منصة رائد", "url": "https://raed.gov.sa/", "icon": "rocket-outline", "created_at": now_iso()},
            {"id": new_id(), "title": "موقع AZVIO", "url": "https://azvio.co/", "icon": "globe-outline", "created_at": now_iso()},
        ])
    if await db.categories.count_documents({}) == 0:
        default_cats = [
            ("عقاري", "drone", "تصوير جوي للفلل والعقارات والمشاريع السكنية"),
            ("فعاليات", "drone", "تغطية جوية للحفلات والمؤتمرات والفعاليات المفتوحة"),
            ("سياحي", "drone", "تصوير لمواقع ومعالم سياحية وشواطئ ومناظر طبيعية"),
            ("تجاري", "drone", "إعلانات ومنتجات تجارية بلقطات جوية"),
            ("سوشيال ميديا", "editing", "مونتاج قصير عمودي لمنصات Reels/TikTok"),
            ("فيديو دعائي", "editing", "مونتاج فيديو دعائي كامل بالمؤثرات والموشن جرافيك"),
            ("عرس/مناسبة", "editing", "مونتاج فيديوهات الأعراس والمناسبات الخاصة"),
        ]
        await db.categories.insert_many([
            {
                "id": new_id(),
                "name": n,
                "service_type": st,
                "description": desc,
                "source": "manual",
                "created_at": now_iso(),
            }
            for (n, st, desc) in default_cats
        ])
