import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from database import db, today_str, new_portal_token

router = APIRouter(dependencies=[Depends(get_current_user)])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def require_finance_access(user: dict = Depends(get_current_user)) -> dict:
    """المالية بيانات حساسة (أرباح، مصاريف، ديون) — بس admin أو project_manager يشوفها (طلب #17)."""
    from roles import can_access_section
    role = user.get("role", "photographer")
    if not can_access_section(role, "finance"):
        raise HTTPException(status_code=403, detail="لا تملك صلاحية الوصول للمالية")
    return user




def new_id():
    return uuid.uuid4().hex


# ============ Clients ============

PROJECT_STAGES = ["booked", "shooting", "editing", "review", "delivered"]


class ClientCreate(BaseModel):
    name: str
    phone: str = ""
    service_type: str = "drone"  # drone | editing | both
    sub_category: str = ""  # e.g. "عقاري", "فعاليات" - free-text linked to categories
    agreed_price: float = 0
    status: str = "in_progress"  # in_progress | delivered
    stage: str = "booked"  # booked | shooting | editing | review | delivered
    drive_link: str = ""
    source: str = ""  # legacy source (kept for backwards compat)
    notes: str = ""
    project_details: str = ""  # تفاصيل المشروع: الموقع، المتطلبات، التسليمات... (طلب: إضافة تفاصيل المشروع)
    custom_fields: list[dict] = []  # حقول حرة إضافية {id, label, value} — لأي معلومة ثانية تخص العميل/المشروع
    attachments: list[dict] = []  # مرفقات {name, url, type} — صور/فيديوهات (مثلاً من تحليل واتساب)


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    service_type: Optional[str] = None
    sub_category: Optional[str] = None
    agreed_price: Optional[float] = None
    status: Optional[str] = None
    stage: Optional[str] = None
    drive_link: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    project_details: Optional[str] = None
    custom_fields: Optional[list[dict]] = None
    attachments: Optional[list[dict]] = None
    approval_signature: Optional[str] = None
    approved_at: Optional[str] = None
    portal_token: Optional[str] = None


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


async def link_contact_and_flag_repeat(phone: str) -> tuple[str, int]:
    """يبحث عن عملاء بنفس الجوال، يرجّع (contact_id يُستخدم للعميل الجديد، عدد المشاريع السابقة).
    يُستخدم من أي مسار ينشئ عميل (الإضافة اليدوية، أو تحليل الواتساب) عشان الربط يصير موحّد
    بغض النظر عن المسار (طلب #8)."""
    if not phone:
        return uuid.uuid4().hex, 0
    existing = await db.clients.find({"phone": phone}, {"_id": 0, "contact_id": 1, "id": 1}).to_list(100)
    if not existing:
        return uuid.uuid4().hex, 0
    contact_id = next((e.get("contact_id") for e in existing if e.get("contact_id")), None)
    if not contact_id:
        contact_id = uuid.uuid4().hex
        old_ids = [e["id"] for e in existing]
        await db.clients.update_many({"id": {"$in": old_ids}}, {"$set": {"contact_id": contact_id}})
    return contact_id, len(existing)


@router.post("/clients")
async def create_client(body: ClientCreate):
    doc = body.model_dump()
    doc.update({
        "id": new_id(),
        "logs": [],
        "portal_token": await new_portal_token(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })

    contact_id, sibling_count = await link_contact_and_flag_repeat(doc.get("phone", ""))
    doc["contact_id"] = contact_id

    await db.clients.insert_one(dict(doc))

    # المرة الثالثة فأكثر = عميل متكرر — نسجّلها كملاحظة تلقائية بسجل النشاط عشان
    # "سند يعرف على طول" (طلب #8) بدون ما يحتاج فحص يدوي كل مرة.
    if sibling_count >= 2:  # هذا العميل الجديد = الثالث أو أكثر
        await db.clients.update_one(
            {"id": doc["id"]},
            {"$push": {"logs": {
                "id": uuid.uuid4().hex,
                "kind": "note",
                "text": f"🔁 عميل متكرر — هذا مشروعه رقم {sibling_count + 1} معنا. سند يتابعه تلقائياً.",
                "created_at": now_iso(),
                "auto_generated": True,
            }}},
        )

    # إشعار فوري (طلب: إشعارات فورية عند حدث معيّن — عميل جديد)
    from notifications import notify_all_users
    await notify_all_users("سند — عميل جديد 🎉", f"{doc['name']} انضاف كعميل جديد")

    return doc


@router.get("/clients/{client_id}/history")
async def get_client_history(client_id: str):
    """كل مشاريع نفس العميل (بالهوية الموحّدة contact_id) — يوضح هل عنده أكثر من خدمة
    وترتيبها الزمني (طلب #8)."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")

    contact_id = client.get("contact_id")
    if not contact_id:
        return {"contact_id": None, "total_projects": 1, "is_repeat_client": False, "projects": [client]}

    siblings = await db.clients.find({"contact_id": contact_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {
        "contact_id": contact_id,
        "total_projects": len(siblings),
        "is_repeat_client": len(siblings) >= 3,
        "projects": siblings,
    }


@router.get("/clients/{client_id}/whatsapp-history")
async def get_client_whatsapp_history(client_id: str, user: dict = Depends(get_current_user)):
    """كل تحاليل واتساب المرتبطة بهذا العميل — سواء طُبّقت يدوياً، أو تطابقت بالجوال/الاسم تلقائياً
    (حتى لو قديمة من قبل ما نضيف هذا الربط). يُستخدم بسجل نشاط العميل (طلب #7)."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")

    or_conditions = [{"applied_to_client": client_id}]
    if client.get("phone"):
        or_conditions.append({"analysis.client.phone": client["phone"]})
    if client.get("name"):
        or_conditions.append({"analysis.client.name": client["name"]})

    items = await db.whatsapp_analyses.find(
        {"user_id": user["user_id"], "$or": or_conditions},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"items": items}


@router.get("/clients/{client_id}")
async def get_client(client_id: str):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return doc


@router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates.get("stage") == "delivered":
        updates["status"] = "delivered"
    updates["updated_at"] = now_iso()
    prev = await db.clients.find_one({"id": client_id}, {"_id": 0, "status": 1})
    r = await db.clients.update_one({"id": client_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    # Auto-portfolio sync: if status just transitioned to "delivered", create/refresh portfolio item
    new_status = updates.get("status")
    if new_status == "delivered" and (not prev or prev.get("status") != "delivered"):
        try:
            from portfolio import create_or_update_from_client
            await create_or_update_from_client(client_id, enhance=True)
        except Exception as _e:  # never block client update on portfolio errors
            pass
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
        # Legacy path: base64 payload (backwards compat / fallback if Supabase not configured)
        try:
            import base64 as _b64
            from supabase_storage import is_configured, upload_bytes
            if is_configured():
                raw = _b64.b64decode(body.attachment_data)
                up = await upload_bytes(
                    client_id=client_id,
                    log_id=log["id"],
                    filename=body.attachment_name or "attachment",
                    data=raw,
                    content_type=body.attachment_mime or "application/octet-stream",
                )
                log["attachment"] = {
                    "name": up["name"],
                    "mime": up["mime"],
                    "path": up["path"],  # Supabase storage path
                }
            else:
                # Legacy fallback
                log["attachment"] = {
                    "name": body.attachment_name or "ملف",
                    "mime": body.attachment_mime or "application/octet-stream",
                    "data": body.attachment_data,
                }
        except Exception as e:
            log["attachment"] = {
                "name": body.attachment_name or "ملف",
                "mime": body.attachment_mime or "application/octet-stream",
                "data": body.attachment_data,
                "storage_error": str(e)[:120],
            }
    r = await db.clients.update_one({"id": client_id}, {"$push": {"logs": log}, "$set": {"updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    # trimmed response (no big base64)
    resp = {**log}
    if "attachment" in resp and "data" in resp["attachment"]:
        resp["attachment"] = {"name": resp["attachment"]["name"], "mime": resp["attachment"]["mime"]}
    return resp


@router.post("/clients/{client_id}/logs/upload")
async def upload_client_log_file(
    client_id: str,
    file: UploadFile = File(...),
    text: str = Form(""),
    log_type: str = Form("file"),
):
    """Multipart upload for a client log attachment. Stores in Supabase Storage.

    The stored/display filename follows a standard convention (client name +
    date + service type) instead of the raw uploaded filename, to avoid
    messy/inconsistent names as files pile up.
    """
    from supabase_storage import is_configured, upload_bytes
    if not is_configured():
        raise HTTPException(status_code=500, detail="Supabase غير مُهيّأ")
    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="الملف كبير جداً (الحد 15MB)")
    log_id = new_id()

    client = await db.clients.find_one({"id": client_id}, {"name": 1, "service_type": 1})
    orig_ext = os.path.splitext(file.filename or "")[1]
    safe_client = "".join(ch for ch in (client or {}).get("name", "عميل") if ch.isalnum() or ch in " _-").strip() or "عميل"
    service = (client or {}).get("service_type", "") or ""
    standardized_name = f"{safe_client}_{today_str()}" + (f"_{service}" if service else "") + orig_ext

    up = await upload_bytes(
        client_id=client_id,
        log_id=log_id,
        filename=standardized_name,
        data=contents,
        content_type=file.content_type or "application/octet-stream",
    )
    log = {
        "id": log_id,
        "text": text or (file.filename or ""),
        "log_type": log_type or "file",
        "created_at": now_iso(),
        "attachment": {
            "name": up["name"],
            "mime": up["mime"],
            "path": up["path"],
        },
    }
    r = await db.clients.update_one({"id": client_id}, {"$push": {"logs": log}, "$set": {"updated_at": now_iso()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return {
        "id": log_id,
        "text": log["text"],
        "log_type": log["log_type"],
        "created_at": log["created_at"],
        "attachment": {"name": up["name"], "mime": up["mime"]},
    }


@router.delete("/clients/{client_id}/logs/{log_id}")
async def delete_client_log(client_id: str, log_id: str):
    # Try delete attached file from Supabase (best-effort)
    doc = await db.clients.find_one({"id": client_id, "logs.id": log_id}, {"_id": 0, "logs.$": 1})
    if doc and doc.get("logs"):
        att = (doc["logs"][0] or {}).get("attachment") or {}
        if att.get("path"):
            try:
                from supabase_storage import remove_paths
                await remove_paths([att["path"]])
            except Exception:
                pass
    await db.clients.update_one({"id": client_id}, {"$pull": {"logs": {"id": log_id}}})
    return {"ok": True}


@router.get("/clients/{client_id}/logs/{log_id}/attachment")
async def get_client_log_attachment(client_id: str, log_id: str):
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "logs": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    for lg in doc.get("logs", []):
        if lg.get("id") == log_id and lg.get("attachment"):
            att = lg["attachment"]
            # New: stored in Supabase — return fresh signed URL
            if att.get("path"):
                try:
                    from supabase_storage import get_signed_url
                    url = await get_signed_url(att["path"])
                    return {"name": att.get("name"), "mime": att.get("mime"), "url": url, "kind": "url"}
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"تعذر توليد رابط: {e}")
            # Legacy: base64 in Mongo
            if att.get("data"):
                return {"name": att.get("name"), "mime": att.get("mime"), "data": att["data"], "kind": "data"}
    raise HTTPException(status_code=404, detail="المرفق غير موجود")


# ============ Categories (Client Sub-Categories) ============

class CategoryCreate(BaseModel):
    name: str
    service_type: str = "drone"  # drone | editing
    description: str = ""  # hidden note (Sanad-only context)
    source: str = "manual"  # manual | sanad
    base_price: float = 0  # سعر افتراضي لهذي الفئة — يُستخدم كنقطة بداية بالتسعير والفواتير


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    description: Optional[str] = None
    base_price: Optional[float] = None


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


@router.get("/transactions", dependencies=[Depends(require_finance_access)])
async def list_transactions(
    type: str = "",
    q: str = "",  # بحث نصي بالوصف/الفئة/اسم العميل
    date_from: str = "",
    date_to: str = "",
    category: str = "",
):
    query: dict = {}
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if date_from or date_to:
        query["date"] = {}
        if date_from:
            query["date"]["$gte"] = date_from
        if date_to:
            query["date"]["$lte"] = date_to
    if q:
        query["$or"] = [
            {"description": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
            {"client_name": {"$regex": q, "$options": "i"}},
        ]
    return await db.transactions.find(query, {"_id": 0}).sort([("date", -1), ("created_at", -1)]).to_list(2000)


EXPENSE_CATEGORY_KEYWORDS = {
    "معدات": ["معدات", "درون", "درونز", "كاميرا", "كاميرات", "بطارية", "بطاريات", "لنس", "عدسة", "جمبال", "ميموري", "كارت"],
    "انتقال": ["بنزين", "وقود", "تكسي", "أوبر", "اوبر", "كريم", "انتقال", "توصيل", "مواصلات", "سفر", "تذكرة طيران"],
    "فريلانسر": ["فريلانسر", "مونتير", "مصور خارجي", "مساعد", "مصمم", "مقاول من الباطن"],
    "برامج واشتراكات": ["اشتراك", "adobe", "أدوبي", "برنامج", "تطبيق", "سوفتوير", "software", "subscription"],
    "إيجار": ["إيجار", "ايجار", "استوديو", "مكتب"],
    "صيانة": ["صيانة", "تصليح", "إصلاح"],
    "تسويق": ["تسويق", "إعلان", "اعلان", "ads", "حملة", "بوست ممول"],
}


def guess_expense_category(description: str) -> str:
    text = (description or "").lower()
    for category, keywords in EXPENSE_CATEGORY_KEYWORDS.items():
        if any(k.lower() in text for k in keywords):
            return category
    return ""


@router.post("/transactions", dependencies=[Depends(require_finance_access)])
async def create_transaction(body: TransactionCreate):
    doc = body.model_dump()
    if not doc.get("date"):
        doc["date"] = today_str()
    if doc.get("type") == "expense" and not doc.get("category"):
        doc["category"] = guess_expense_category(doc.get("description", ""))
    doc.update({"id": new_id(), "attachments": [], "created_at": now_iso()})
    await db.transactions.insert_one(dict(doc))

    # إشعار فوري لما دفعة تدخل (طلب: إشعارات فورية عند حدث معيّن — دفعة وصلت)
    if doc.get("type") == "income" and doc.get("amount"):
        from notifications import notify_all_users
        who = f" من {doc['client_name']}" if doc.get("client_name") else ""
        await notify_all_users("سند — دفعة وصلت 💰", f"{doc['amount']:,.0f} ر.س{who}")

    return doc


@router.put("/transactions/{tx_id}", dependencies=[Depends(require_finance_access)])
async def update_transaction(tx_id: str, body: TransactionUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.transactions.update_one({"id": tx_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    return await db.transactions.find_one({"id": tx_id}, {"_id": 0})


@router.delete("/transactions/{tx_id}", dependencies=[Depends(require_finance_access)])
async def delete_transaction(tx_id: str):
    r = await db.transactions.delete_one({"id": tx_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    return {"ok": True}


@router.post("/transactions/{tx_id}/attachments", dependencies=[Depends(require_finance_access)])
async def upload_transaction_attachments(tx_id: str, files: list[UploadFile] = File(...)):
    """رفع صور/ملفات متعددة (إيصالات، فواتير موردين...) وربطها بعملية مالية موجودة (طلب #13)."""
    tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")

    from supabase_storage import is_configured, _upload_sync, _signed_url_sync
    from fastapi.concurrency import run_in_threadpool

    if not is_configured():
        raise HTTPException(status_code=400, detail="التخزين (Supabase) غير مفعّل بعد")

    new_attachments = []
    for f in files:
        data = await f.read()
        if len(data) > 8 * 1024 * 1024:
            continue  # تجاهل أي ملف أكبر من 8 ميجابايت بدل ما نوقف باقي الملفات
        ext = (f.filename or "file").split(".")[-1]
        path = f"transaction-attachments/{tx_id}/{uuid.uuid4().hex}.{ext}"
        try:
            await run_in_threadpool(_upload_sync, path, data, f.content_type or "application/octet-stream")
            url = await run_in_threadpool(_signed_url_sync, path, 60 * 60 * 24 * 365 * 5)
            new_attachments.append({"name": f.filename or "ملف", "url": url, "path": path, "type": f.content_type or ""})
        except Exception as e:
            print(f"[transaction-attachment] فشل رفع {f.filename}: {e}")

    if not new_attachments:
        raise HTTPException(status_code=400, detail="فشل رفع كل الملفات")

    existing = tx.get("attachments") or []
    await db.transactions.update_one(
        {"id": tx_id},
        {"$set": {"attachments": existing + new_attachments, "updated_at": now_iso()}},
    )
    return {"ok": True, "attachments": existing + new_attachments}


@router.delete("/transactions/{tx_id}/attachments/{attachment_index}", dependencies=[Depends(require_finance_access)])
async def delete_transaction_attachment(tx_id: str, attachment_index: int):
    tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="العملية غير موجودة")
    attachments = tx.get("attachments") or []
    if attachment_index < 0 or attachment_index >= len(attachments):
        raise HTTPException(status_code=404, detail="المرفق غير موجود")
    attachments.pop(attachment_index)
    await db.transactions.update_one({"id": tx_id}, {"$set": {"attachments": attachments, "updated_at": now_iso()}})
    return {"ok": True, "attachments": attachments}


@router.get("/finance/summary", dependencies=[Depends(require_finance_access)])
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


# ============ Custom Service Types (parent categories) ============

class ServiceTypeCreate(BaseModel):
    key: str  # unique short id e.g. "photography"
    label: str  # display name in Arabic
    description: str = ""  # brief description
    icon: str = "briefcase-outline"


class ServiceTypeUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None


@router.get("/service-types")
async def list_service_types():
    return await db.service_types.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)


@router.post("/service-types")
async def create_service_type(body: ServiceTypeCreate):
    key = body.key.strip().lower()
    if not key:
        raise HTTPException(status_code=400, detail="مفتاح النوع مطلوب")
    existing = await db.service_types.find_one({"key": key})
    if existing:
        raise HTTPException(status_code=400, detail="نوع الخدمة موجود مسبقاً")
    doc = {
        "id": new_id(),
        "key": key,
        "label": body.label.strip(),
        "description": body.description.strip(),
        "icon": body.icon,
        "is_default": False,
        "created_at": now_iso(),
    }
    await db.service_types.insert_one(dict(doc))
    return doc


@router.put("/service-types/{type_id}")
async def update_service_type(type_id: str, body: ServiceTypeUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.service_types.update_one({"id": type_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="نوع الخدمة غير موجود")
    return await db.service_types.find_one({"id": type_id}, {"_id": 0})


@router.delete("/service-types/{type_id}")
async def delete_service_type(type_id: str):
    doc = await db.service_types.find_one({"id": type_id}, {"_id": 0})
    if doc and doc.get("is_default"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف الأنواع الافتراضية")
    await db.service_types.delete_one({"id": type_id})
    return {"ok": True}


# ============ My Pricing (personal price knowledge base) ============

class MyPricingCreate(BaseModel):
    service_type: str  # drone | editing | custom key
    sub_category: str = ""  # optional category
    label: str  # what this pricing is for (e.g. "فيلا كبيرة", "مونتاج 60 ثانية")
    price_from: float = 0
    price_to: float = 0
    notes: str = ""  # extra context for Sanad


class MyPricingUpdate(BaseModel):
    service_type: Optional[str] = None
    sub_category: Optional[str] = None
    label: Optional[str] = None
    price_from: Optional[float] = None
    price_to: Optional[float] = None
    notes: Optional[str] = None


@router.get("/my-pricing")
async def list_my_pricing(service_type: str = ""):
    q = {"service_type": service_type} if service_type else {}
    return await db.my_pricing.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/my-pricing")
async def create_my_pricing(body: MyPricingCreate):
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.my_pricing.insert_one(dict(doc))
    return doc


@router.put("/my-pricing/{price_id}")
async def update_my_pricing(price_id: str, body: MyPricingUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    r = await db.my_pricing.update_one({"id": price_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="التسعيرة غير موجودة")
    return await db.my_pricing.find_one({"id": price_id}, {"_id": 0})


@router.delete("/my-pricing/{price_id}")
async def delete_my_pricing(price_id: str):
    await db.my_pricing.delete_one({"id": price_id})
    return {"ok": True}


@router.post("/my-pricing/analyze-file")
async def analyze_pricing_file(
    file: UploadFile = File(...),
    service_type: str = Form("drone"),
    user: dict = Depends(get_current_user),
):
    """يقرأ ملف أو صورة (قائمة أسعار، عرض منافس، جدول بيانات...) ويستخرج منه بنود تسعير
    مقترحة — المستخدم يراجعها ويعدّلها قبل ما تُضاف فعلياً لـ"تسعيرتي" (طلب #4)."""
    import json
    from sanad import _save_upload, UPLOAD_DIR
    from llm_client import ask_with_file, LLMError

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    path, mime = await _save_upload(file)

    system = "أنت مساعد يستخرج بيانات تسعير من ملفات ومستندات لمصور فيديو ودرون سعودي."
    prompt = f"""هذا ملف يحتوي على معلومات أسعار (يمكن يكون قائمة أسعارك الخاصة، عرض من منافس، جدول بيانات، أو أي مستند فيه أسعار خدمات تصوير/مونتاج/درون).

استخرج منه كل بند تسعير تقدر تلاحظه، بصيغة JSON فقط بدون أي نص إضافي، بالشكل التالي بالضبط:
{{"items": [{{"label": "وصف مختصر للخدمة", "price_from": 0, "price_to": 0, "notes": "أي ملاحظة إضافية مفيدة"}}]}}

لو ما لقيت أي بيانات تسعير واضحة بالملف، أرجع {{"items": []}}."""

    try:
        raw = await ask_with_file(system=system, prompt=prompt, file_path=path, mime=mime, task="vision")
    except LLMError as e:
        raise HTTPException(status_code=400, detail=f"تعذّر تحليل الملف: {e}")
    finally:
        try:
            os.remove(path)
        except Exception:
            pass

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        parsed = json.loads(cleaned)
    except Exception:
        raise HTTPException(status_code=400, detail="سند ما قدر يفهم بيانات تسعير واضحة بهذا الملف")

    items = parsed.get("items", [])
    for it in items:
        it["service_type"] = service_type
    return {"items": items, "count": len(items)}


# ============ Finance Statistics (detailed) ============

@router.get("/finance/statistics", dependencies=[Depends(require_finance_access)])
async def finance_statistics(months: int = 6):
    """Detailed statistics for the finance screen: totals, by-category expenses, income by client, monthly trends."""
    now = datetime.now(timezone.utc)
    ym_list = []
    for i in range(months - 1, -1, -1):
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        ym_list.append(f"{y:04d}-{m:02d}")

    txs = await db.transactions.find({}, {"_id": 0}).to_list(20000)
    month = now.strftime("%Y-%m")

    # Totals
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    total_withdrawals = sum(t["amount"] for t in txs if t["type"] == "withdrawal")
    total_subs = sum(t["amount"] for t in txs if t["type"] == "subscription")
    month_income = sum(t["amount"] for t in txs if t["type"] == "income" and (t.get("date") or "").startswith(month))
    month_expenses = sum(t["amount"] for t in txs if t["type"] in ("expense", "subscription") and (t.get("date") or "").startswith(month))
    debts_to_me = sum(t["amount"] for t in txs if t["type"] == "debt" and t.get("debt_direction") == "owed_to_me" and not t.get("paid"))
    debts_i_owe = sum(t["amount"] for t in txs if t["type"] == "debt" and t.get("debt_direction") == "i_owe" and not t.get("paid"))

    # Monthly time series
    income_series = {ym: 0.0 for ym in ym_list}
    expense_series = {ym: 0.0 for ym in ym_list}
    net_series = {ym: 0.0 for ym in ym_list}
    for t in txs:
        ym = (t.get("date") or "")[:7]
        if ym not in income_series:
            continue
        amt = float(t.get("amount") or 0)
        if t["type"] == "income":
            income_series[ym] += amt
            net_series[ym] += amt
        elif t["type"] in ("expense", "subscription"):
            expense_series[ym] += amt
            net_series[ym] -= amt
        elif t["type"] == "withdrawal":
            net_series[ym] -= amt

    # Expenses by category
    cat_map = {}
    for t in txs:
        if t["type"] in ("expense", "subscription"):
            cat = t.get("category") or "بدون تصنيف"
            cat_map[cat] = cat_map.get(cat, 0) + float(t.get("amount") or 0)
    top_categories = sorted(
        [{"category": k, "amount": v} for k, v in cat_map.items()],
        key=lambda x: x["amount"], reverse=True
    )[:8]

    # Income by client (top earners)
    client_map = {}
    for t in txs:
        if t["type"] == "income":
            name = t.get("client_name") or "بدون اسم"
            client_map[name] = client_map.get(name, 0) + float(t.get("amount") or 0)
    top_clients = sorted(
        [{"client": k, "amount": v} for k, v in client_map.items()],
        key=lambda x: x["amount"], reverse=True
    )[:6]

    # Transaction type breakdown (for pie chart)
    type_breakdown = {
        "income": total_income,
        "expense": total_expenses,
        "withdrawal": total_withdrawals,
        "subscription": total_subs,
    }

    return {
        "totals": {
            "income": total_income,
            "expenses": total_expenses,
            "withdrawals": total_withdrawals,
            "subscriptions": total_subs,
            "net": total_income - total_expenses - total_withdrawals - total_subs,
            "month_income": month_income,
            "month_expenses": month_expenses,
            "debts_to_me": debts_to_me,
            "debts_i_owe": debts_i_owe,
        },
        "months": ym_list,
        "income_series": [income_series[ym] for ym in ym_list],
        "expense_series": [expense_series[ym] for ym in ym_list],
        "net_series": [net_series[ym] for ym in ym_list],
        "top_categories": top_categories,
        "top_clients": top_clients,
        "type_breakdown": type_breakdown,
    }


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


class LinkUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    icon: Optional[str] = None


@router.put("/links/{link_id}")
async def update_link(link_id: str, body: LinkUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.quick_links.update_one({"id": link_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="الرابط غير موجود")
    return await db.quick_links.find_one({"id": link_id}, {"_id": 0})


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


@router.put("/events/{event_id}")
async def update_event(event_id: str, body: EventCreate):
    updates = body.model_dump()
    updates["updated_at"] = now_iso()
    result = await db.events.update_one({"id": event_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الموعد غير موجود")
    return await db.events.find_one({"id": event_id}, {"_id": 0})


@router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    await db.events.delete_one({"id": event_id})
    return {"ok": True}


# ============ Dashboard ============

@router.get("/dashboard")
async def dashboard():
    clients = await db.clients.find({}, {"_id": 0, "status": 1, "service_type": 1, "contact_id": 1}).to_list(5000)
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

    # توزيع العملاء حسب نوع الخدمة (طلب #11: أشكال تحليل أكثر)
    service_breakdown: dict = {}
    for c in clients:
        st = c.get("service_type") or "غير محدد"
        service_breakdown[st] = service_breakdown.get(st, 0) + 1

    # إحصائيات المهام السريعة
    tasks_total = await db.tasks.count_documents({})
    tasks_done = await db.tasks.count_documents({"status": "done"})
    tasks_overdue = await db.tasks.count_documents({"due_date": {"$lt": today_str()}, "status": {"$ne": "done"}})
    tasks_pending = await db.tasks.count_documents({"status": {"$ne": "done"}})

    # عملاء متكررون (نفس contact_id تكرر مرتين فأكثر) — طلب: إحصائيات على العملاء
    contact_counts: dict = {}
    for c in clients:
        cid = c.get("contact_id")
        if cid:
            contact_counts[cid] = contact_counts.get(cid, 0) + 1
    repeat_clients = sum(1 for n in contact_counts.values() if n >= 2)

    events_today_count = await db.events.count_documents({"date": today_str()})
    # تحاليل واتساب لسا ما اتطبقت = تنبيهات سند تحتاج مراجعتك
    sanad_alerts_count = await db.whatsapp_analyses.count_documents({"applied": False})

    return {
        "clients_total": len(clients),
        "clients_in_progress": sum(1 for c in clients if c.get("status") == "in_progress"),
        "clients_delivered": sum(1 for c in clients if c.get("status") == "delivered"),
        "delivery_rate": round(sum(1 for c in clients if c.get("status") == "delivered") / len(clients) * 100, 1) if clients else 0,
        "month_income": month_income,
        "month_expenses": month_expenses,
        "net_profit": month_income - month_expenses,
        "upcoming_events": events,
        "upcoming_events_count": await db.events.count_documents({"date": {"$gte": today_str()}}),
        "content_stages": stages,
        "service_breakdown": service_breakdown,
        "tasks_total": tasks_total,
        "tasks_done": tasks_done,
        "tasks_overdue": tasks_overdue,
        "tasks_pending": tasks_pending,
        "repeat_clients": repeat_clients,
        "events_today_count": events_today_count,
        "sanad_alerts_count": sanad_alerts_count,
        "tasks_completion_rate": round((tasks_done / tasks_total * 100), 1) if tasks_total else 0,
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
    if await db.service_types.count_documents({}) == 0:
        await db.service_types.insert_many([
            {
                "id": new_id(),
                "key": "drone",
                "label": "التصوير الجوي بالدرون",
                "description": "تصوير فيديو وصور جوية للمشاريع والفعاليات",
                "icon": "airplane",
                "is_default": True,
                "created_at": now_iso(),
            },
            {
                "id": new_id(),
                "key": "editing",
                "label": "مونتاج الفيديو",
                "description": "مونتاج وتلوين ومؤثرات وموشن جرافيك",
                "icon": "cut",
                "is_default": True,
                "created_at": now_iso(),
            },
        ])
    # Backfill portal_token for clients created before this feature existed
    async for c in db.clients.find({"portal_token": {"$exists": False}}, {"id": 1}):
        await db.clients.update_one({"id": c["id"]}, {"$set": {"portal_token": await new_portal_token()}})
    # ترحيل العملاء اللي عندهم رمز hex قديم (طويل) لرمز رقمي جديد (طلب: رابط بالأرقام)
    async for c in db.clients.find({"portal_token": {"$regex": "^[a-f0-9]{16}$"}}, {"id": 1}):
        await db.clients.update_one({"id": c["id"]}, {"$set": {"portal_token": await new_portal_token()}})


# ============ Testimonials (client reviews shown inside the app) ============

class TestimonialCreate(BaseModel):
    client_name: str
    rating: int = 5  # 1-5
    comment: str = ""
    service_type: str = "drone"


@router.get("/testimonials")
async def list_testimonials():
    return await db.testimonials.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/testimonials")
async def create_testimonial(body: TestimonialCreate):
    rating = max(1, min(5, body.rating))
    doc = {
        "id": new_id(),
        "client_name": body.client_name.strip() or "عميل AZVIO",
        "rating": rating,
        "comment": body.comment.strip(),
        "service_type": body.service_type,
        "created_at": now_iso(),
    }
    await db.testimonials.insert_one(dict(doc))
    return doc


@router.delete("/testimonials/{testimonial_id}")
async def delete_testimonial(testimonial_id: str):
    r = await db.testimonials.delete_one({"id": testimonial_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="التقييم غير موجود")
    return {"ok": True}


# ============ تخصيص الرئيسية (طلب #11) ============

class HomeLayoutUpdate(BaseModel):
    order: list[str]  # ترتيب مفاتيح الأزرار المطلوب (يشمل الأزرار الافتراضية + المخصصة custom:id)
    hidden: list[str] = []  # مفاتيح الأزرار المخفية
    sizes: dict[str, str] = {}  # حجم كل بطاقة: small | medium | large (طلب: تحكم بحجم/شكل كل بطاقة)
    custom: list[dict] = []  # بطاقات مخصصة حرة {id, title, icon, target} يضيفها المستخدم بنفسه
    stats_selected: list[str] = []  # اختيار مدقق لإحصائيات الرئيسية (طلب: اختيار مدقق بالإحصائيات والتحاليل)


@router.get("/home/layout")
async def get_home_layout(user: dict = Depends(get_current_user)):
    """ترتيب المستخدم المخصص لأزرار الرئيسية — كل مستخدم له ترتيبه الخاص."""
    doc = await db.user_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    doc = doc or {}
    return {
        "order": doc.get("home_order", []),
        "hidden": doc.get("home_hidden", []),
        "sizes": doc.get("home_sizes", {}),
        "custom": doc.get("home_custom", []),
        "stats_selected": doc.get("home_stats_selected", []),
    }


@router.put("/home/layout")
async def update_home_layout(body: HomeLayoutUpdate, user: dict = Depends(get_current_user)):
    await db.user_settings.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "home_order": body.order,
            "home_hidden": body.hidden,
            "home_sizes": body.sizes,
            "home_custom": body.custom,
            "home_stats_selected": body.stats_selected,
            "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True}


# ============ تحليلات موسّعة — العملاء والمشاريع (طلب: تحليلات كثيرة موسّعة) ============

@router.get("/analytics/clients-extended")
async def analytics_clients_extended():
    """تحليلات أعمق للعملاء والمشاريع: توزيع المصادر، معدل التسليم، ومتوسط مدة
    التنفيذ (من الحجز للتسليم) — كلها من بيانات موجودة فعلاً بدون حقول جديدة."""
    clients = await db.clients.find(
        {}, {"_id": 0, "source": 1, "status": 1, "stage": 1, "created_at": 1, "updated_at": 1, "sub_category": 1, "service_type": 1}
    ).to_list(5000)

    total = len(clients)
    delivered = [c for c in clients if c.get("status") == "delivered"]

    # توزيع المصادر (انستقرام، تويتر، إحالة...) — نتجاهل الفاضي
    source_breakdown: dict = {}
    for c in clients:
        src = (c.get("source") or "").strip() or "غير محدد"
        source_breakdown[src] = source_breakdown.get(src, 0) + 1
    top_sources = sorted(source_breakdown.items(), key=lambda x: -x[1])[:8]

    # توزيع الفئات الفرعية (عقاري، فعاليات...)
    category_breakdown: dict = {}
    for c in clients:
        cat = (c.get("sub_category") or "").strip() or "أخرى"
        category_breakdown[cat] = category_breakdown.get(cat, 0) + 1
    top_categories = sorted(category_breakdown.items(), key=lambda x: -x[1])[:8]

    # متوسط مدة التنفيذ للمشاريع المُسلّمة (من إنشاء المشروع لآخر تحديث حالته لـ delivered)
    durations = []
    for c in delivered:
        try:
            created = datetime.fromisoformat(c["created_at"].replace("Z", "+00:00"))
            updated = datetime.fromisoformat(c["updated_at"].replace("Z", "+00:00"))
            days = (updated - created).total_seconds() / 86400
            if 0 <= days <= 365:  # نتجاهل القيم الشاذة (بيانات قديمة قبل تتبع الحالة مثلاً)
                durations.append(days)
        except Exception:
            continue
    avg_turnaround_days = round(sum(durations) / len(durations), 1) if durations else None

    # توزيع حسب مرحلة العمل الحالية (للمشاريع الجارية)
    stage_breakdown: dict = {}
    for c in clients:
        if c.get("status") != "delivered":
            st = c.get("stage") or "booked"
            stage_breakdown[st] = stage_breakdown.get(st, 0) + 1

    return {
        "total_clients": total,
        "delivered_count": len(delivered),
        "delivery_rate": round(len(delivered) / total * 100, 1) if total else 0,
        "avg_turnaround_days": avg_turnaround_days,
        "top_sources": [{"source": s, "count": n} for s, n in top_sources],
        "top_categories": [{"category": c, "count": n} for c, n in top_categories],
        "in_progress_by_stage": stage_breakdown,
    }
