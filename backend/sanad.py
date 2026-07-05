import json
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from database import db
from llm_client import ask_text, ask_with_file, LLMError

router = APIRouter(dependencies=[Depends(get_current_user)])

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
<action>{"type":"add_client","data":{"name":"اسم العميل","phone":"05xxxxxxxx","service_type":"drone","sub_category":"عقاري","agreed_price":1500,"source":"انستقرام","drive_link":"","notes":""}}</action>
<action>{"type":"add_transaction","data":{"type":"expense","amount":250,"description":"وصف العملية","category":"معدات","date":"YYYY-MM-DD","client_name":"","debt_direction":"owed_to_me"}}</action>
<action>{"type":"add_content","data":{"title":"عنوان الفكرة","description":"","stage":"idea"}}</action>
<action>{"type":"add_event","data":{"title":"تصوير مشروع X","event_type":"shooting","date":"YYYY-MM-DD","time":"16:00","client_name":"","notes":""}}</action>
<action>{"type":"update_client_status","data":{"name":"اسم العميل","status":"delivered"}}</action>
<action>{"type":"add_category","data":{"name":"عقاري","service_type":"drone","description":"شرح مختصر يفهمه سند فقط"}}</action>
<action>{"type":"add_service","data":{"title":"اسم الخدمة","description":"وصف مختصر","service_type":"drone","price_from":500,"price_to":2000}}</action>
<action>{"type":"report_issue","data":{"kind":"bug","title":"عنوان قصير للمشكلة","description":"وصف تفصيلي بكلام المستخدم نفسه","screen":"اسم الشاشة إن ذكرها المستخدم"}}</action>

استخدم "report_issue" فقط حين يصف المستخدم خطأ بالتطبيق نفسه (شي ما يشتغل صحيح) أو يطلب ميزة جديدة بالتطبيق — هذي حالة مختلفة عن بقية الأوامر أعلاه (اللي لبيانات العمل: عملاء، فواتير...). لما يحصل هذا:
1. اجعل "kind" يساوي "bug" للأخطاء، أو "feature" لطلبات المزايا الجديدة.
2. لخّص المشكلة بعنوان قصير واضح، والوصف يبقى بكلام المستخدم قريب من الأصل.
3. أخبر المستخدم بجملة ودودة إن ملاحظته وصلت لعزّام وسيراجعها.
4. لا تحاول أبداً تنفيذ التعديل بنفسك أو التحدث كأنك عدّلت الكود — أنت فقط توصّل الملاحظة.

قيم مسموحة:
- service_type: drone أو editing أو both
- sub_category: اسم الفئة الفرعية (مثل: عقاري، فعاليات، سوشيال ميديا)
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

SANAD_SYSTEM = """أنت "سند"، المساعد الذكي الشخصي لعزّام داخل تطبيق AZVIO.

عزّام يعمل في: التصوير الجوي بالدرون، المونتاج، تحليل البيانات وذكاء الأعمال، التصميم، والتصوير الفوتوغرافي بشكل عام. أنت مساعده الشخصي الشامل، لا تقتصر مساعدتك على الدرون والمونتاج فقط — ساعده في أي سؤال أو مهمة يطرحها، مهنية كانت أو شخصية، بنفس الجدية والاهتمام.

مهامك داخل التطبيق:
- إدارة العملاء (إضافة، تحديث الحالة) والماليات (دخل، مصاريف، سحوبات، ديون، اشتراكات).
- تحليل الفواتير من ملفات PDF والصور واستخراج بياناتها.
- إدارة أفكار المحتوى ومواعيد التقويم (تصوير وتسليم).
- الإجابة عن أسئلة العمل وتقديم نصائح تسعير ومقارنات سوقية لخدمات الدرون والمونتاج.
- مساعدة المستخدم في استخدام التطبيق.

خارج هذي المهام، أنت مساعد عام مفيد: تجاوب على أي سؤال (تحليل بيانات، تصميم، تطوير مهني، أو أي استفسار شخصي) بنفس الجودة، دون الاعتذار أو تحويل الموضوع لكونه "خارج نطاقك".

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
            "sub_category": d.get("sub_category") or "",
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
    if t == "add_category":
        name = (d.get("name") or "").strip()
        if not name:
            return "⚠️ اسم الفئة مفقود"
        stype = d.get("service_type") or "drone"
        existing = await db.categories.find_one({"name": name, "service_type": stype})
        if existing:
            return f"⚠️ الفئة {name} موجودة مسبقاً"
        doc = {
            "id": uuid.uuid4().hex,
            "name": name,
            "service_type": stype,
            "description": d.get("description") or "",
            "source": "sanad",
            "created_at": now,
        }
        await db.categories.insert_one(dict(doc))
        return f"✅ تمت إضافة الفئة: {name}"
    if t == "add_service":
        doc = {
            "id": uuid.uuid4().hex,
            "title": d.get("title") or "خدمة جديدة",
            "description": d.get("description") or "",
            "service_type": d.get("service_type") or "drone",
            "price_from": float(d.get("price_from") or 0),
            "price_to": float(d.get("price_to") or 0),
            "created_at": now,
        }
        await db.services.insert_one(dict(doc))
        return f"✅ تمت إضافة الخدمة: {doc['title']}"
    if t == "report_issue":
        kind = d.get("kind") or "bug"
        doc = {
            "id": uuid.uuid4().hex,
            "kind": kind if kind in ("bug", "feature") else "bug",
            "title": (d.get("title") or "ملاحظة من سند").strip(),
            "description": (d.get("description") or "").strip(),
            "screen": (d.get("screen") or "").strip(),
            "status": "open",
            "source": "sanad",
            "created_at": now,
        }
        await db.tickets.insert_one(dict(doc))
        label = "الخطأ" if doc["kind"] == "bug" else "الطلب"
        return f"✅ وصلت ملاحظتك، سجّلتها كـ{label}: {doc['title']}. عزّام بيراجعها."
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
    model: str = "claude"


CHAT_MODELS = {
    "claude": ("anthropic", "claude-sonnet-4-5-20250929"),
    "gemini-pro": ("gemini", "gemini-3.1-pro-preview"),
    "gemini-flash": ("gemini", "gemini-3.5-flash"),
}


@router.post("/sanad/chat")
async def sanad_chat(body: ChatRequest):
    context = await build_context()
    hist = await get_history_text(body.session_id)
    system = build_system(context)
    if hist:
        system += f"\n\n## آخر المحادثة\n{hist}"
    await store_message(body.session_id, "user", body.message)
    try:
        text = await ask_text(system=system, user=body.message, task="chat")
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"تعذر الاتصال بسند: {e}")
    clean, actions = await execute_actions(text)
    await store_message(body.session_id, "assistant", clean)
    return {"reply": clean, "actions": actions, "model": body.model}


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
        text = await ask_with_file(system=system, prompt=user_text, file_path=path, mime=mime, task="vision")
    except LLMError as e:
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


# ============ Sanad Assist Endpoints (price opinion + suggestions) ============

async def _sanad_ask(system: str, user: str, task: str = "suggest") -> str:
    """Wrapper to call the unified LLM client with task-based routing."""
    try:
        return await ask_text(system=system, user=user, task=task, temperature=0.5)
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"تعذر الحصول على رد سند: {e}")


def _parse_json_block(text: str) -> dict | list:
    m = re.search(r"\{.*\}|\[.*\]", text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


class PriceOpinionReq(BaseModel):
    service_type: str = "drone"
    sub_category: str = ""
    agreed_price: float = 0
    client_name: str = ""


@router.post("/sanad/price-opinion")
async def price_opinion(body: PriceOpinionReq):
    if body.agreed_price <= 0:
        return {"opinion": "", "verdict": "unknown", "market_min": 0, "market_max": 0}
    # gather category description if exists
    desc = ""
    if body.sub_category:
        cat = await db.categories.find_one({"name": body.sub_category, "service_type": body.service_type}, {"_id": 0})
        if cat:
            desc = cat.get("description") or ""
    stype_label = {"drone": "تصوير جوي بالدرون", "editing": "مونتاج فيديو", "both": "درون ومونتاج معاً"}.get(body.service_type, body.service_type)
    system = (
        "أنت سند، خبير تسعير خدمات التصوير الجوي والمونتاج في السوق السعودي. "
        "تقدّم رأياً مختصراً وعمليّاً في العربية عن السعر المتفق عليه مقارنةً بالسوق السعودي الحالي، "
        "وتعطي نطاقاً واقعياً بالريال السعودي. لا تُطيل. أعطِ الإجابة كـ JSON فقط."
    )
    user = (
        f"نوع الخدمة: {stype_label}\n"
        f"الفئة الفرعية: {body.sub_category or 'بدون'}\n"
        f"شرح داخلي للفئة: {desc or 'لا يوجد'}\n"
        f"السعر المتفق عليه: {body.agreed_price} ر.س\n"
        "أعطِ الرد بصيغة JSON فقط:\n"
        '{"opinion":"تعليق مختصر بالعربية (سطر أو سطرين)","verdict":"low|fair|high","market_min":0,"market_max":0}\n'
        "verdict قيمها: low (أقل من السوق)، fair (مناسب)، high (أعلى من السوق)."
    )
    text = await _sanad_ask(system, user)
    data = _parse_json_block(text) or {}
    return {
        "opinion": data.get("opinion") or "",
        "verdict": data.get("verdict") or "unknown",
        "market_min": float(data.get("market_min") or 0),
        "market_max": float(data.get("market_max") or 0),
    }


class SuggestCategoriesReq(BaseModel):
    service_type: str = "drone"
    hint: str = ""


@router.post("/sanad/suggest-categories")
async def suggest_categories(body: SuggestCategoriesReq):
    existing = await db.categories.find({"service_type": body.service_type}, {"_id": 0, "name": 1}).to_list(200)
    existing_names = [c["name"] for c in existing]
    stype_label = {"drone": "التصوير الجوي بالدرون", "editing": "مونتاج الفيديو"}.get(body.service_type, body.service_type)
    system = (
        "أنت سند، خبير سوق التصوير الجوي والمونتاج في السعودية. "
        "تقترح فئات فرعية عملية للخدمات، بالعربية، مختصرة. أعطِ الرد كـ JSON فقط."
    )
    user = (
        f"اقترح 5 فئات فرعية جديدة (غير مكررة) لخدمة {stype_label}.\n"
        f"الفئات الموجودة مسبقاً (لا تكرر): {', '.join(existing_names) if existing_names else 'لا يوجد'}\n"
        f"إشارة إضافية من المستخدم: {body.hint or 'لا يوجد'}\n"
        "أعد JSON: {\"categories\":[{\"name\":\"اسم الفئة\",\"description\":\"شرح مختصر يوضح متى تستخدم\"},...]}"
    )
    text = await _sanad_ask(system, user)
    data = _parse_json_block(text) or {}
    cats = data.get("categories") if isinstance(data, dict) else data
    if not isinstance(cats, list):
        cats = []
    # clean
    result = []
    for c in cats[:8]:
        if not isinstance(c, dict):
            continue
        name = (c.get("name") or "").strip()
        if not name or name in existing_names:
            continue
        result.append({"name": name, "description": (c.get("description") or "").strip()})
    return {"categories": result}


class SuggestContentReq(BaseModel):
    topic: str = ""
    count: int = 5


@router.post("/sanad/suggest-content")
async def suggest_content(body: SuggestContentReq):
    existing = await db.content.find({}, {"_id": 0, "title": 1}).sort("created_at", -1).to_list(50)
    existing_titles = [c["title"] for c in existing]
    count = max(1, min(body.count or 5, 10))
    system = (
        "أنت سند، خبير محتوى للتصوير الجوي والمونتاج. تقترح أفكار فيديو مبتكرة "
        "قابلة للتنفيذ في السوق السعودي، بالعربية، مختصرة. أعطِ الرد كـ JSON فقط."
    )
    user = (
        f"اقترح {count} أفكار فيديو مبتكرة{' حول: ' + body.topic if body.topic else ''}.\n"
        f"عناصر موجودة سابقاً (تجنّب التكرار): {', '.join(existing_titles[:20]) if existing_titles else 'لا يوجد'}\n"
        "أعد JSON: {\"ideas\":[{\"title\":\"عنوان مختصر\",\"description\":\"شرح تنفيذي في سطرين\"},...]}"
    )
    text = await _sanad_ask(system, user)
    data = _parse_json_block(text) or {}
    ideas = data.get("ideas") if isinstance(data, dict) else data
    if not isinstance(ideas, list):
        ideas = []
    out = []
    for i in ideas[:count]:
        if not isinstance(i, dict):
            continue
        title = (i.get("title") or "").strip()
        if not title:
            continue
        out.append({"title": title, "description": (i.get("description") or "").strip()})
    return {"ideas": out}


class SuggestServicesReq(BaseModel):
    service_type: str = "drone"


@router.post("/sanad/suggest-services")
async def suggest_services(body: SuggestServicesReq):
    existing = await db.services.find({"service_type": body.service_type}, {"_id": 0, "title": 1}).to_list(50)
    existing_titles = [s["title"] for s in existing]
    # Try to get service_type label from db
    st_doc = await db.service_types.find_one({"key": body.service_type}, {"_id": 0}) or {}
    stype_label = st_doc.get("label") or {"drone": "التصوير الجوي بالدرون", "editing": "مونتاج الفيديو"}.get(body.service_type, body.service_type)
    system = (
        "أنت سند، خبير خدمات التصوير والمونتاج في السوق السعودي. "
        "تقترح خدمات إضافية جذّابة قابلة للبيع، بالعربية، مع أسعار سوقية واقعية. أعطِ الرد كـ JSON فقط."
    )
    user = (
        f"اقترح 5 خدمات إضافية جديدة (غير مكررة) لـ{stype_label} مع أسعار سوقية بالريال السعودي.\n"
        f"الخدمات الموجودة سابقاً (لا تكرر): {', '.join(existing_titles) if existing_titles else 'لا يوجد'}\n"
        "أعد JSON: {\"services\":[{\"title\":\"اسم الخدمة\",\"description\":\"وصف قصير\",\"price_from\":0,\"price_to\":0},...]}"
    )
    text = await _sanad_ask(system, user)
    data = _parse_json_block(text) or {}
    services = data.get("services") if isinstance(data, dict) else data
    if not isinstance(services, list):
        services = []
    out = []
    for s in services[:8]:
        if not isinstance(s, dict):
            continue
        title = (s.get("title") or "").strip()
        if not title or title in existing_titles:
            continue
        out.append({
            "title": title,
            "description": (s.get("description") or "").strip(),
            "price_from": float(s.get("price_from") or 0),
            "price_to": float(s.get("price_to") or 0),
            "service_type": body.service_type,
        })
    return {"services": out}


# ============ Explain a service type ============

class ExplainServiceTypeReq(BaseModel):
    key: str
    label: str


@router.post("/sanad/explain-service-type")
async def explain_service_type(body: ExplainServiceTypeReq):
    """Sanad explains what a service type means, gives target market and starting price range."""
    system = (
        "أنت سند، خبير سوق التصوير والإنتاج المرئي في السعودية. "
        "تعطي شرحاً واضحاً وموجزاً لنوع خدمة يذكرها المستخدم، مع نصائح لبدء تقديمها. أعطِ الرد كـ JSON فقط."
    )
    user = (
        f"اشرح نوع الخدمة التالي بالتفصيل بالعربية:\n"
        f"- المفتاح: {body.key}\n- الاسم: {body.label}\n"
        "أعد JSON: {\"description\":\"شرح مختصر (سطرين-ثلاثة)\","
        "\"target_audience\":\"الجمهور المستهدف\","
        "\"typical_price_from\":0,\"typical_price_to\":0,"
        "\"tips\":[\"نصيحة 1\",\"نصيحة 2\",\"نصيحة 3\"]}"
    )
    text = await _sanad_ask(system, user)
    data = _parse_json_block(text) or {}
    return {
        "description": (data.get("description") or "").strip(),
        "target_audience": (data.get("target_audience") or "").strip(),
        "typical_price_from": float(data.get("typical_price_from") or 0),
        "typical_price_to": float(data.get("typical_price_to") or 0),
        "tips": [t for t in (data.get("tips") or []) if isinstance(t, str)][:5],
    }


# ============ Pricing Advice (compare my pricing vs market) ============

class PricingAdviceReq(BaseModel):
    service_type: str = ""
    sub_category: str = ""


@router.post("/sanad/pricing-advice")
async def pricing_advice(body: PricingAdviceReq):
    """Gets Sanad's advice on user's own pricing list vs current market prices."""
    q = {}
    if body.service_type:
        q["service_type"] = body.service_type
    if body.sub_category:
        q["sub_category"] = body.sub_category
    my_prices = await db.my_pricing.find(q, {"_id": 0}).to_list(200)

    if not my_prices:
        return {"advice": "لم تُضف بعد أي تسعيرة خاصة بك. أضف بعض التسعيرات ليتمكن سند من مقارنتها بالسوق.", "items": []}

    # Build compact context
    items_ctx = "\n".join(
        f"- {p.get('label', '')} ({p.get('service_type', '')}"
        + (f" / {p.get('sub_category', '')}" if p.get('sub_category') else "")
        + f"): من {p.get('price_from', 0)} إلى {p.get('price_to', 0)} ر.س"
        + (f" — ملاحظة: {p.get('notes', '')}" if p.get("notes") else "")
        for p in my_prices
    )

    system = (
        "أنت سند، خبير تسعير خدمات التصوير الجوي والمونتاج في السوق السعودي. "
        "تقارن تسعيرات المستخدم بالسوق الفعلي وتعطي نصائح عملية بالعربية. أعطِ الرد كـ JSON فقط."
    )
    user = (
        f"هذه تسعيرات المستخدم الحالية:\n{items_ctx}\n\n"
        "لكل بند: قدّر نطاق السوق السعودي الحالي وقارنه بتسعيرة المستخدم. "
        "أعد JSON: {\"advice\":\"ملخص عام في 2-3 أسطر\","
        "\"items\":[{\"label\":\"مطابق للاسم أعلاه\",\"market_min\":0,\"market_max\":0,\"verdict\":\"low|fair|high\",\"note\":\"جملة قصيرة\"},...]}"
    )
    text = await _sanad_ask(system, user, model=("gemini", "gemini-3.1-pro-preview"))
    data = _parse_json_block(text) or {}
    return {
        "advice": (data.get("advice") or "").strip(),
        "items": [
            {
                "label": (it.get("label") or "").strip(),
                "market_min": float(it.get("market_min") or 0),
                "market_max": float(it.get("market_max") or 0),
                "verdict": it.get("verdict") or "unknown",
                "note": (it.get("note") or "").strip(),
            }
            for it in (data.get("items") or [])
            if isinstance(it, dict)
        ],
    }


# ============ Weekly Insights (كل سبت) ============

@router.get("/insights/weekly")
async def weekly_insights():
    """Generates weekly insights for the past 7 days: performance, wins, alerts, next-week focus."""
    now = datetime.now(timezone.utc)
    # Simple past-7-days filter
    from datetime import timedelta
    seven_days_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    txs = await db.transactions.find({"date": {"$gte": seven_days_ago, "$lte": today}}, {"_id": 0}).to_list(2000)
    week_income = sum(t["amount"] for t in txs if t["type"] == "income")
    week_expense = sum(t["amount"] for t in txs if t["type"] in ("expense", "subscription"))
    week_income_count = sum(1 for t in txs if t["type"] == "income")

    # Previous week for comparison
    fourteen_days_ago = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    txs_prev = await db.transactions.find({"date": {"$gte": fourteen_days_ago, "$lt": seven_days_ago}}, {"_id": 0}).to_list(2000)
    prev_income = sum(t["amount"] for t in txs_prev if t["type"] == "income")
    prev_expense = sum(t["amount"] for t in txs_prev if t["type"] in ("expense", "subscription"))

    # Client changes
    clients_all = await db.clients.find({}, {"_id": 0}).to_list(5000)
    new_clients_week = sum(1 for c in clients_all if (c.get("created_at") or "")[:10] >= seven_days_ago)
    delivered_week = sum(1 for c in clients_all if c.get("status") == "delivered" and (c.get("updated_at") or "")[:10] >= seven_days_ago)
    in_progress = sum(1 for c in clients_all if c.get("status") == "in_progress")

    # Upcoming events next 7 days
    next_7 = (now + timedelta(days=7)).strftime("%Y-%m-%d")
    events = await db.events.find({"date": {"$gte": today, "$lte": next_7}}, {"_id": 0}).sort("date", 1).to_list(20)

    # Content this week
    content_added = await db.content.count_documents({"created_at": {"$gte": seven_days_ago}})
    content_published = await db.content.count_documents({"stage": "published", "updated_at": {"$gte": seven_days_ago}})

    stats = {
        "week_start": seven_days_ago,
        "week_end": today,
        "income": week_income,
        "expense": week_expense,
        "net": week_income - week_expense,
        "income_transactions": week_income_count,
        "prev_income": prev_income,
        "prev_expense": prev_expense,
        "income_change_pct": ((week_income - prev_income) / prev_income * 100) if prev_income > 0 else 0,
        "new_clients": new_clients_week,
        "delivered_clients": delivered_week,
        "in_progress_clients": in_progress,
        "upcoming_events": events,
        "content_added": content_added,
        "content_published": content_published,
    }

    # Ask Sanad for personalized advice
    ctx = (
        f"إحصائيات أسبوعك (من {seven_days_ago} إلى {today}):\n"
        f"- دخل الأسبوع: {week_income} ر.س من {week_income_count} معاملة\n"
        f"- مصاريف الأسبوع: {week_expense} ر.س\n"
        f"- صافي الأسبوع: {week_income - week_expense} ر.س\n"
        f"- الأسبوع السابق: دخل {prev_income} / مصاريف {prev_expense}\n"
        f"- عملاء جدد: {new_clients_week} — تم التسليم: {delivered_week} — قيد التنفيذ: {in_progress}\n"
        f"- محتوى مضاف: {content_added} — منشور: {content_published}\n"
        f"- مواعيد قادمة الأسبوع القادم: {len(events)}\n"
    )
    system = (
        "أنت سند، شريك المستخدم في إدارة أعمال التصوير. "
        "تقدّم تقريراً أسبوعياً قصيراً وتحفيزياً ومركّزاً بالعربية. أعطِ الرد كـ JSON فقط."
    )
    user = (
        ctx + "\n"
        "أعد JSON: {\"headline\":\"جملة ملخّصة قصيرة\","
        "\"wins\":[\"إنجاز 1\",\"إنجاز 2\"],"
        "\"alerts\":[\"تنبيه أو انتباه\"],"
        "\"focus_next_week\":[\"أولوية 1\",\"أولوية 2\",\"أولوية 3\"]}"
    )
    try:
        text = await _sanad_ask(system, user)
        insights = _parse_json_block(text) or {}
    except Exception:
        insights = {}

    return {
        "stats": stats,
        "insights": {
            "headline": (insights.get("headline") or "").strip(),
            "wins": [w for w in (insights.get("wins") or []) if isinstance(w, str)][:5],
            "alerts": [a for a in (insights.get("alerts") or []) if isinstance(a, str)][:5],
            "focus_next_week": [f for f in (insights.get("focus_next_week") or []) if isinstance(f, str)][:5],
        },
    }


# ============ Bank Statement Analysis ============

BANK_STATEMENT_PROMPT = """استخرج جميع المعاملات المالية من هذا الكشف بدقة وأجب بصيغة JSON فقط:
{"transactions":[
  {"type":"income|expense|withdrawal","amount":0,"date":"YYYY-MM-DD","description":"وصف مختصر بالعربية","category":"تصنيف مختصر بالعربية","client_name":"اسم العميل إن وجد أو فارغ"},
  ...
]}

قواعد صارمة:
- type: income للمبالغ الواردة، expense للمبالغ الخارجة (باستثناء سحوبات نقدية)، withdrawal للسحوبات النقدية فقط
- amount: القيمة المطلقة الموجبة فقط (لا سالب)
- date: YYYY-MM-DD (استنتج السنة من رأس الكشف إن لم تظهر في السطر)
- description: وصف قصير من الوصف الأصلي
- category: اقترح تصنيفاً مناسباً (مثال: راتب، معدات، اشتراكات، مواصلات، طعام، عميل درون، عميل مونتاج)
- client_name: استخرجه إذا كان الوصف يشير لعميل محدد
- تجاهل الأرصدة والرسوم البنكية الصغيرة والاعتمادات الإدارية"""


@router.post("/finance/statement/analyze")
async def analyze_bank_statement(file: UploadFile = File(...)):
    """Analyze bank statement PDF and extract transactions. File is auto-deleted after processing (privacy)."""
    path, mime = await _save_upload(file)
    try:
        text = await ask_with_file(
            system=(
                "أنت خبير في قراءة كشوف الحسابات البنكية السعودية واستخراج المعاملات بدقة عالية. "
                "تجيب دائماً بصيغة JSON فقط. لا تُدرج معاملات مكررة."
            ),
            prompt=BANK_STATEMENT_PROMPT,
            file_path=path,
            mime=mime,
            task="vision",
        )
    except LLMError as e:
        # Ensure file deletion even on error (privacy)
        try:
            os.remove(path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"تعذر تحليل الكشف: {e}")
    finally:
        # Auto-delete file (privacy) - success or fail
        try:
            os.remove(path)
        except Exception:
            pass

    data = _parse_json_block(text) or {}
    txs = data.get("transactions") if isinstance(data, dict) else data
    if not isinstance(txs, list):
        txs = []

    # Clean and validate
    out = []
    for t in txs:
        if not isinstance(t, dict):
            continue
        amt = float(t.get("amount") or 0)
        if amt <= 0:
            continue
        ttype = t.get("type") or "expense"
        if ttype not in ("income", "expense", "withdrawal"):
            ttype = "expense"
        out.append({
            "type": ttype,
            "amount": amt,
            "date": (t.get("date") or today_str())[:10],
            "description": (t.get("description") or "").strip()[:200],
            "category": (t.get("category") or "").strip()[:80],
            "client_name": (t.get("client_name") or "").strip()[:100],
        })
    return {"extracted": out, "count": len(out)}


class StatementSaveReq(BaseModel):
    transactions: list = []


@router.post("/finance/statement/save")
async def save_bank_statement_transactions(body: StatementSaveReq):
    """Save selected transactions extracted from a bank statement."""
    if not body.transactions:
        return {"inserted": 0}
    docs = []
    for t in body.transactions:
        if not isinstance(t, dict):
            continue
        amt = float(t.get("amount") or 0)
        if amt <= 0:
            continue
        docs.append({
            "id": uuid.uuid4().hex,
            "type": t.get("type") or "expense",
            "amount": amt,
            "description": (t.get("description") or "").strip()[:200],
            "category": (t.get("category") or "").strip()[:80],
            "date": (t.get("date") or today_str())[:10],
            "client_name": (t.get("client_name") or "").strip()[:100],
            "debt_direction": "owed_to_me",
            "paid": False,
            "source": "bank_statement",
            "created_at": now_iso(),
        })
    if docs:
        await db.transactions.insert_many(docs)
    return {"inserted": len(docs)}


# ============ Invoice analysis (Finance module) ============

INVOICE_PROMPT = """استخرج بيانات هذه الفاتورة بدقة وأجب بصيغة JSON فقط دون أي نص إضافي أو شرح:
{"vendor": "اسم الجهة/المتجر", "amount": 0, "currency": "SAR", "date": "YYYY-MM-DD", "category": "تصنيف مختصر بالعربية", "description": "وصف مختصر بالعربية", "suggested_type": "expense"}
ملاحظات: amount رقم فقط (الإجمالي النهائي). suggested_type إما income (إذا كانت فاتورة صادرة لعميل) أو expense (إذا كانت فاتورة مشتريات/مصاريف). إذا لم تجد التاريخ استخدم null."""


@router.post("/invoices/analyze")
async def analyze_invoice(file: UploadFile = File(...)):
    path, mime = await _save_upload(file)
    try:
        text = await ask_with_file(
            system="أنت خبير في قراءة الفواتير واستخراج بياناتها بدقة عالية. تجيب دائماً بصيغة JSON فقط.",
            prompt=INVOICE_PROMPT,
            file_path=path,
            mime=mime,
            task="vision",
        )
    except LLMError as e:
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
