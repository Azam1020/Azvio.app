import json
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from database import db

from emergentintegrations.llm.chat import FileContentWithMimeType, LlmChat, UserMessage

router = APIRouter(dependencies=[Depends(get_current_user)])

LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
UPLOAD_DIR = "/tmp/azvio_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MIME_MAP = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".csv": "text/csv",
    ".txt": "text/plain",
}

ACTION_PROTOCOL = """
## بروتوكول تنفيذ الأوامر
عندما يطلب المستخدم صراحةً إضافة أو تعديل بيانات، أدرج في نهاية ردك وسم <action> بصيغة JSON (يمكن إدراج أكثر من وسم):
<action>{"type":"add_client","data":{"name":"اسم العميل","phone":"05xxxxxxxx","service_type":"drone","agreed_price":1500,"source":"انستقرام","drive_link":"","notes":""}}</action>
<action>{"type":"add_transaction","data":{"type":"expense","amount":250,"description":"وصف العملية","category":"معدات","date":"YYYY-MM-DD","client_name":"","debt_direction":"owed_to_me"}}</action>
<action>{"type":"add_content","data":{"title":"عنوان الفكرة","description":"","stage":"idea"}}</action>
<action>{"type":"add_event","data":{"title":"تصوير مشروع X","event_type":"shooting","date":"YYYY-MM-DD","time":"16:00","client_name":"","notes":""}}</action>
<action>{"type":"update_client_status","data":{"name":"اسم العميل","status":"delivered"}}</action>

قيم مسموحة:
- service_type: drone أو editing أو both
- transaction type: income (دخل) أو expense (مصروف) أو withdrawal (سحب) أو debt (دين) أو subscription (اشتراك شهري)
- debt_direction: owed_to_me (لي) أو i_owe (عليّ)
- content stage: idea أو filming أو editing أو published
- event_type: shooting أو delivery أو other
- client status: in_progress أو delivered

قواعد صارمة:
1. استخدم وسم action فقط عند طلب صريح من المستخدم بالإضافة أو التعديل.
2. إذا نقصت معلومة أساسية (مثل الاسم أو المبلغ) اسأل المستخدم عنها أولاً ولا تُرسل action.
3. اذكر في نص ردك ملخصاً بسيطاً لما ستنفذه، فالنظام سينفذ الوسوم تلقائياً ويؤكد.
4. التاريخ الافتراضي هو اليوم إذا لم يُحدد.
"""

SANAD_SYSTEM = """أنت "سند"، المساعد الذكي الشخصي في تطبيق AZVIO — تطبيق إدارة أعمال التصوير الجوي بالدرون والمونتاج الخاص بعزّام.

مهامك:
- إدارة العملاء (إضافة، تحديث الحالة) والماليات (دخل، مصاريف، سحوبات، ديون، اشتراكات).
- تحليل الفواتير من ملفات PDF والصور واستخراج بياناتها.
- إدارة أفكار المحتوى ومواعيد التقويم (تصوير وتسليم).
- الإجابة عن أسئلة العمل وتقديم نصائح تسعير ومقارنات سوقية لخدمات الدرون والمونتاج.
- مساعدة المستخدم في استخدام التطبيق.

تاريخ اليوم: __TODAY__

## بيانات العمل الحالية
__CONTEXT__

""" + ACTION_PROTOCOL + """

أسلوبك: عربي، ودود، مختصر، عملي واحترافي. استخدم أرقاماً وحقائق من بيانات العمل عند الإجابة.
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def build_context() -> str:
    clients = await db.clients.find({}, {"_id": 0, "name": 1, "status": 1, "service_type": 1, "agreed_price": 1}).sort("created_at", -1).to_list(50)
    txs = await db.transactions.find({}, {"_id": 0}).to_list(5000)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expenses = sum(t["amount"] for t in txs if t["type"] == "expense")
    month_income = sum(t["amount"] for t in txs if t["type"] == "income" and (t.get("date") or "").startswith(month))
    debts_to_me = sum(t["amount"] for t in txs if t["type"] == "debt" and t.get("debt_direction") == "owed_to_me" and not t.get("paid"))
    debts_i_owe = sum(t["amount"] for t in txs if t["type"] == "debt" and t.get("debt_direction") == "i_owe" and not t.get("paid"))
    subs = sum(t["amount"] for t in txs if t["type"] == "subscription")
    content_count = await db.content.count_documents({})
    events = await db.events.find({"date": {"$gte": today_str()}}, {"_id": 0, "title": 1, "date": 1, "event_type": 1}).sort("date", 1).to_list(5)

    lines = [
        f"- عدد العملاء: {len(clients)} (قيد التنفيذ: {sum(1 for c in clients if c.get('status') == 'in_progress')})",
        f"- إجمالي الدخل: {total_income} | إجمالي المصاريف: {total_expenses} | دخل هذا الشهر: {month_income}",
        f"- ديون لي: {debts_to_me} | ديون عليّ: {debts_i_owe} | اشتراكات شهرية: {subs}",
        f"- عناصر المحتوى: {content_count}",
    ]
    if clients:
        names = ", ".join(f"{c['name']} ({'قيد التنفيذ' if c.get('status') == 'in_progress' else 'تم التسليم'})" for c in clients[:10])
        lines.append(f"- آخر العملاء: {names}")
    if events:
        ev = ", ".join(f"{e['title']} ({e['date']})" for e in events)
        lines.append(f"- مواعيد قادمة: {ev}")
    return "\n".join(lines)


async def run_action(action: dict):
    t = action.get("type")
    d = action.get("data", {}) or {}
    now = now_iso()
    if t == "add_client":
        doc = {
            "id": uuid.uuid4().hex,
            "name": d.get("name") or "بدون اسم",
            "phone": str(d.get("phone") or ""),
            "service_type": d.get("service_type") or "drone",
            "agreed_price": float(d.get("agreed_price") or 0),
            "status": d.get("status") or "in_progress",
            "drive_link": d.get("drive_link") or "",
            "source": d.get("source") or "",
            "notes": d.get("notes") or "",
            "logs": [],
            "created_at": now,
            "updated_at": now,
        }
        await db.clients.insert_one(dict(doc))
        return f"✅ تمت إضافة العميل: {doc['name']}"
    if t == "add_transaction":
        type_labels = {"income": "دخل", "expense": "مصروف", "withdrawal": "سحب", "debt": "دين", "subscription": "اشتراك"}
        doc = {
            "id": uuid.uuid4().hex,
            "type": d.get("type") or "expense",
            "amount": float(d.get("amount") or 0),
            "description": d.get("description") or "",
            "category": d.get("category") or "",
            "date": d.get("date") or today_str(),
            "client_name": d.get("client_name") or "",
            "debt_direction": d.get("debt_direction") or "owed_to_me",
            "paid": bool(d.get("paid") or False),
            "created_at": now,
        }
        await db.transactions.insert_one(dict(doc))
        return f"✅ تم تسجيل {type_labels.get(doc['type'], doc['type'])}: {doc['amount']} — {doc['description']}"
    if t == "add_content":
        doc = {
            "id": uuid.uuid4().hex,
            "title": d.get("title") or "بدون عنوان",
            "description": d.get("description") or "",
            "stage": d.get("stage") or "idea",
            "created_at": now,
            "updated_at": now,
        }
        await db.content.insert_one(dict(doc))
        return f"✅ تمت إضافة فكرة المحتوى: {doc['title']}"
    if t == "add_event":
        doc = {
            "id": uuid.uuid4().hex,
            "title": d.get("title") or "موعد",
            "event_type": d.get("event_type") or "other",
            "date": d.get("date") or today_str(),
            "time": d.get("time") or "",
            "client_name": d.get("client_name") or "",
            "notes": d.get("notes") or "",
            "created_at": now,
        }
        await db.events.insert_one(dict(doc))
        return f"✅ تمت إضافة موعد: {doc['title']} بتاريخ {doc['date']}"
    if t == "update_client_status":
        name = d.get("name") or ""
        status = d.get("status") or "delivered"
        r = await db.clients.update_one(
            {"name": {"$regex": re.escape(name), "$options": "i"}},
            {"$set": {"status": status, "updated_at": now}},
        )
        if r.matched_count:
            label = "تم التسليم" if status == "delivered" else "قيد التنفيذ"
            return f"✅ تم تحديث حالة العميل {name} إلى: {label}"
        return f"⚠️ لم أجد عميلاً باسم {name}"
    return None


ACTION_RE = re.compile(r"<action>\s*(\{.*?\})\s*</action>", re.DOTALL)


async def execute_actions(text: str):
    results = []
    for m in ACTION_RE.finditer(text):
        try:
            action = json.loads(m.group(1))
        except Exception:
            continue
        try:
            r = await run_action(action)
            if r:
                results.append(r)
        except Exception as e:
            results.append(f"⚠️ تعذر تنفيذ الإجراء: {e}")
    clean = ACTION_RE.sub("", text).strip()
    if results:
        clean = clean + ("\n\n" if clean else "") + "\n".join(results)
    return clean, results


def build_system(context: str) -> str:
    return SANAD_SYSTEM.replace("__TODAY__", today_str()).replace("__CONTEXT__", context)


async def get_history_text(session_id: str) -> str:
    history = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", -1).to_list(12)
    history = list(reversed(history))
    if not history:
        return ""
    return "\n".join(
        f"{'المستخدم' if m['role'] == 'user' else 'سند'}: {m['content'][:600]}" for m in history
    )


async def store_message(session_id: str, role: str, content: str):
    await db.chat_messages.insert_one({
        "id": uuid.uuid4().hex,
        "session_id": session_id,
        "role": role,
        "content": content,
        "created_at": now_iso(),
    })


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


@router.post("/sanad/chat")
async def sanad_chat(body: ChatRequest):
    context = await build_context()
    hist = await get_history_text(body.session_id)
    system = build_system(context)
    if hist:
        system += f"\n\n## آخر المحادثة\n{hist}"
    await store_message(body.session_id, "user", body.message)
    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"sanad-{uuid.uuid4().hex[:10]}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=body.message))
        text = resp if isinstance(resp, str) else (getattr(resp, "text", None) or str(resp))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"تعذر الاتصال بسند: {e}")
    clean, actions = await execute_actions(text)
    await store_message(body.session_id, "assistant", clean)
    return {"reply": clean, "actions": actions}


async def _save_upload(file: UploadFile):
    ext = os.path.splitext(file.filename or "")[1].lower()
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="الملف كبير جداً (الحد الأقصى 15MB)")
    path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}{ext}")
    with open(path, "wb") as f:
        f.write(raw)
    mime = MIME_MAP.get(ext)
    if ext in (".xlsx", ".xls"):
        import pandas as pd
        try:
            df = pd.read_excel(path)
            csv_path = path + ".csv"
            df.to_csv(csv_path, index=False)
            path, mime = csv_path, "text/csv"
        except Exception:
            raise HTTPException(status_code=400, detail="تعذر قراءة ملف Excel")
    if not mime:
        raise HTTPException(status_code=400, detail="نوع الملف غير مدعوم (PDF، صور، CSV، Excel)")
    return path, mime


@router.post("/sanad/chat-with-file")
async def sanad_chat_file(
    file: UploadFile = File(...),
    message: str = Form(""),
    session_id: str = Form("default"),
):
    path, mime = await _save_upload(file)
    user_text = message.strip() or "حلّل هذا الملف واستخرج البيانات المهمة منه"
    await store_message(session_id, "user", f"📎 {file.filename}\n{user_text}")
    context = await build_context()
    system = build_system(context)
    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"sanad-file-{uuid.uuid4().hex[:10]}",
            system_message=system,
        ).with_model("gemini", "gemini-3.1-pro-preview")
        resp = await chat.send_message(
            UserMessage(
                text=user_text,
                file_contents=[FileContentWithMimeType(file_path=path, mime_type=mime)],
            )
        )
        text = resp if isinstance(resp, str) else (getattr(resp, "text", None) or str(resp))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"تعذر تحليل الملف: {e}")
    clean, actions = await execute_actions(text)
    await store_message(session_id, "assistant", clean)
    return {"reply": clean, "actions": actions}


@router.get("/sanad/history")
async def sanad_history(session_id: str = "default"):
    return await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(300)


@router.delete("/sanad/history")
async def sanad_clear(session_id: str = "default"):
    await db.chat_messages.delete_many({"session_id": session_id})
    return {"ok": True}


# ============ Invoice analysis (Finance module) ============

INVOICE_PROMPT = """استخرج بيانات هذه الفاتورة بدقة وأجب بصيغة JSON فقط دون أي نص إضافي أو شرح:
{"vendor": "اسم الجهة/المتجر", "amount": 0, "currency": "SAR", "date": "YYYY-MM-DD", "category": "تصنيف مختصر بالعربية", "description": "وصف مختصر بالعربية", "suggested_type": "expense"}
ملاحظات: amount رقم فقط (الإجمالي النهائي). suggested_type إما income (إذا كانت فاتورة صادرة لعميل) أو expense (إذا كانت فاتورة مشتريات/مصاريف). إذا لم تجد التاريخ استخدم null."""


@router.post("/invoices/analyze")
async def analyze_invoice(file: UploadFile = File(...)):
    path, mime = await _save_upload(file)
    try:
        chat = LlmChat(
            api_key=LLM_KEY,
            session_id=f"invoice-{uuid.uuid4().hex[:10]}",
            system_message="أنت خبير في قراءة الفواتير واستخراج بياناتها بدقة عالية. تجيب دائماً بصيغة JSON فقط.",
        ).with_model("gemini", "gemini-3.1-pro-preview")
        resp = await chat.send_message(
            UserMessage(text=INVOICE_PROMPT, file_contents=[FileContentWithMimeType(file_path=path, mime_type=mime)])
        )
        text = resp if isinstance(resp, str) else (getattr(resp, "text", None) or str(resp))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"تعذر تحليل الفاتورة: {e}")
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise HTTPException(status_code=422, detail="تعذر استخراج بيانات الفاتورة من الملف")
    try:
        data = json.loads(m.group(0))
    except Exception:
        raise HTTPException(status_code=422, detail="تعذر قراءة بيانات الفاتورة")
    if not data.get("date"):
        data["date"] = today_str()
    return {"extracted": data}
