"""WhatsApp chat analysis — accepts .txt exports, extracts clients/prices/events/notes/alerts via Sanad."""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
from database import db, today_str
from llm_client import ask_text, LLMError

router = APIRouter(dependencies=[Depends(get_current_user)])



def now_iso():
    return datetime.now(timezone.utc).isoformat()




WHATSAPP_PROMPT = """أنت خبير في تحليل محادثات واتساب لصاحب عمل درون + مونتاج (AZVIO في السعودية).
اقرأ نص المحادثة المرفقة واستخرج البيانات بصيغة JSON فقط دون أي شرح خارجي.

الصيغة المطلوبة:
{
  "client": {"name": "اسم العميل من المحادثة", "phone": "05xxxxxxxx أو '' إن لم يذكر", "service_type": "drone|editing|both", "sub_category": "عقاري|فعاليات|... حسب الفهم", "source": "واتساب"},
  "agreed_price": 0,
  "payments": [{"amount": 500, "date": "YYYY-MM-DD", "note": "دفعة مقدمة"}],
  "events": [{"title": "تصوير فيلا العليا", "event_type": "shooting|delivery|other", "date": "YYYY-MM-DD", "time": "HH:MM أو ''", "notes": ""}],
  "notes": ["ملاحظة 1", "ملاحظة 2"],
  "alerts": ["إجراء متابعة أو رد منتظر"],
  "summary": "ملخص من سطرين للمحادثة كلها"
}

قواعد صارمة:
1. إذا لم يُذكر السعر النهائي المتفق عليه اجعل agreed_price = 0.
2. service_type: drone إذا كانت تصوير جوي فقط، editing إذا مونتاج فقط، both إذا كلاهما.
3. sub_category: خمّن من السياق (عقاري، فعاليات، أعراس، سوشيال ميديا، فلل، مطاعم، مباني، إعلانات...).
4. events: أي موعد ذكر (تصوير، تسليم، اجتماع، معاينة). التاريخ ISO. إذا كان الوقت مذكوراً (7 مساءً → 19:00) استخدم 24 ساعة.
5. payments: أي مبلغ مذكور أنه دُفع أو سيُدفع كدفعة مقدمة.
6. alerts: أشياء تحتاج متابعة (رد مطلوب، ملف منتظر، تأكيد موعد، دفعة متأخرة).
7. notes: تفاصيل أو متطلبات خاصة يجب تذكرها (عدد الأسئلة، توقيت، جودة معينة، إلخ).
8. إذا لم تجد اسم العميل استنتجه من السياق أو اجعله "عميل جديد".
9. أرقام الجوال بصيغة سعودية 05xxxxxxxx (بدون +966).
10. لا تخترع بيانات — اترك الحقل فارغاً أو صفراً إذا لم يذكر."""


class ApplyRequest(BaseModel):
    create_client: bool = True
    create_events: bool = True
    add_transactions: bool = True
    notes_as_log: bool = True


def _strip_and_limit(text: str, max_chars: int = 30000) -> str:
    """Return trimmed chat text. Truncate to keep prompt cost reasonable."""
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    # Keep last N chars (most recent conversation is usually more relevant)
    return "…\n" + text[-max_chars:]


def _parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


def _normalize_analysis(raw: dict) -> dict:
    """Ensure the LLM output matches our expected shape."""
    client = raw.get("client") or {}
    events = raw.get("events") or []
    payments = raw.get("payments") or []
    notes = raw.get("notes") or []
    alerts = raw.get("alerts") or []
    if not isinstance(events, list):
        events = []
    if not isinstance(payments, list):
        payments = []
    if not isinstance(notes, list):
        notes = []
    if not isinstance(alerts, list):
        alerts = []
    return {
        "client": {
            "name": (client.get("name") or "").strip()[:120],
            "phone": re.sub(r"\D", "", client.get("phone") or "")[:15],
            "service_type": client.get("service_type") if client.get("service_type") in ("drone", "editing", "both") else "drone",
            "sub_category": (client.get("sub_category") or "").strip()[:80],
            "source": (client.get("source") or "واتساب")[:60],
        },
        "agreed_price": float(raw.get("agreed_price") or 0),
        "payments": [
            {
                "amount": float(p.get("amount") or 0),
                "date": (p.get("date") or "")[:10],
                "note": (p.get("note") or "").strip()[:160],
            }
            for p in payments if isinstance(p, dict) and float(p.get("amount") or 0) > 0
        ],
        "events": [
            {
                "title": (e.get("title") or "").strip()[:160],
                "event_type": e.get("event_type") if e.get("event_type") in ("shooting", "delivery", "other") else "other",
                "date": (e.get("date") or "")[:10],
                "time": (e.get("time") or "")[:5],
                "notes": (e.get("notes") or "").strip()[:200],
            }
            for e in events if isinstance(e, dict) and (e.get("title") or e.get("date"))
        ],
        "notes": [str(n).strip()[:300] for n in notes if str(n).strip()][:12],
        "alerts": [str(a).strip()[:300] for a in alerts if str(a).strip()][:8],
        "summary": (raw.get("summary") or "").strip()[:600],
    }


@router.post("/whatsapp/analyze")
async def analyze_chat(file: UploadFile = File(...), label: Optional[str] = Form(None), user=Depends(get_current_user)):
    """Upload a WhatsApp chat export (.txt), analyze it, save the result, return extracted structured data."""
    if not file.filename or not file.filename.lower().endswith((".txt", ".zip", ".chat")):
        raise HTTPException(status_code=400, detail="الرجاء رفع ملف تصدير محادثة واتساب (.txt)")
    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الملف: {e}")

    # If it's a zip (WhatsApp iOS export), extract the .txt inside
    if file.filename.lower().endswith(".zip"):
        try:
            import io
            import zipfile
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                txt_name = next((n for n in z.namelist() if n.lower().endswith(".txt")), None)
                if not txt_name:
                    raise HTTPException(status_code=400, detail="لم أجد ملف نصي داخل ZIP")
                with z.open(txt_name) as f:
                    data = f.read()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"تعذر فك ZIP: {e}")

    try:
        chat_text = data.decode("utf-8", errors="ignore")
    except Exception:
        chat_text = data.decode("cp1256", errors="ignore")

    chat_text = _strip_and_limit(chat_text)
    if not chat_text.strip():
        raise HTTPException(status_code=400, detail="الملف فارغ")

    try:
        text = await ask_text(
            system="أنت خبير تحليل محادثات واتساب باللغة العربية وتستخرج البيانات بدقة كصيغة JSON فقط.",
            user=WHATSAPP_PROMPT + "\n\n---بداية المحادثة---\n" + chat_text,
            task="analyze",
            temperature=0.3,
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"تعذر تحليل المحادثة: {e}")

    raw = _parse_json(text)
    if not raw:
        raise HTTPException(status_code=422, detail="تعذر استخراج بيانات المحادثة (الملف قد يكون غير مفهوم)")

    normalized = _normalize_analysis(raw)

    doc = {
        "id": uuid.uuid4().hex,
        "user_id": user["user_id"],
        "label": (label or normalized["client"].get("name") or file.filename or "محادثة").strip()[:120],
        "file_name": file.filename,
        "analysis": normalized,
        "raw_preview": chat_text[:400],
        "applied": False,
        "created_at": now_iso(),
    }
    await db.whatsapp_analyses.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.get("/whatsapp-analyses")
async def list_analyses(user=Depends(get_current_user)):
    items = await db.whatsapp_analyses.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return items


@router.get("/whatsapp-analyses/{analysis_id}")
async def get_analysis(analysis_id: str, user=Depends(get_current_user)):
    doc = await db.whatsapp_analyses.find_one({"id": analysis_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="التحليل غير موجود")
    return doc


@router.delete("/whatsapp-analyses/{analysis_id}")
async def delete_analysis(analysis_id: str, user=Depends(get_current_user)):
    r = await db.whatsapp_analyses.delete_one({"id": analysis_id, "user_id": user["user_id"]})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="التحليل غير موجود")
    return {"ok": True}


@router.post("/whatsapp-analyses/{analysis_id}/apply")
async def apply_analysis(analysis_id: str, body: ApplyRequest, user=Depends(get_current_user)):
    """Apply extracted data to CRM: create/update client, events, transactions."""
    doc = await db.whatsapp_analyses.find_one({"id": analysis_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="التحليل غير موجود")
    a = doc.get("analysis") or {}
    client_info = a.get("client") or {}
    created = {"client": None, "events": 0, "transactions": 0, "logs": 0}

    client_id: Optional[str] = None
    # Try to match existing client by phone or name
    if client_info.get("phone"):
        existing = await db.clients.find_one({"phone": client_info["phone"]}, {"_id": 0})
        if existing:
            client_id = existing["id"]
    if not client_id and client_info.get("name"):
        existing = await db.clients.find_one({"name": client_info["name"]}, {"_id": 0})
        if existing:
            client_id = existing["id"]

    if body.create_client:
        if client_id:
            # merge missing info
            updates = {}
            if client_info.get("phone") and not (existing.get("phone") if existing else ""):
                updates["phone"] = client_info["phone"]
            if a.get("agreed_price") and not (existing.get("agreed_price") if existing else 0):
                updates["agreed_price"] = float(a.get("agreed_price"))
            if client_info.get("sub_category") and not (existing.get("sub_category") if existing else ""):
                updates["sub_category"] = client_info["sub_category"]
            if updates:
                updates["updated_at"] = now_iso()
                await db.clients.update_one({"id": client_id}, {"$set": updates})
        elif client_info.get("name"):
            new_id = uuid.uuid4().hex
            client_doc = {
                "id": new_id,
                "name": client_info["name"],
                "phone": client_info.get("phone", ""),
                "service_type": client_info.get("service_type") or "drone",
                "sub_category": client_info.get("sub_category") or "",
                "agreed_price": float(a.get("agreed_price") or 0),
                "status": "in_progress",
                "drive_link": "",
                "source": client_info.get("source") or "واتساب",
                "notes": (a.get("summary") or "")[:400],
                "logs": [],
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.clients.insert_one(dict(client_doc))
            client_id = new_id
            created["client"] = client_id

    if body.create_events:
        for e in a.get("events") or []:
            if not e.get("date"):
                continue
            ev = {
                "id": uuid.uuid4().hex,
                "title": e.get("title") or "موعد",
                "event_type": e.get("event_type") or "other",
                "date": e["date"],
                "time": e.get("time") or "",
                "client_name": client_info.get("name") or "",
                "notes": e.get("notes") or "",
                "created_at": now_iso(),
            }
            await db.events.insert_one(dict(ev))
            created["events"] += 1

    if body.add_transactions:
        for p in a.get("payments") or []:
            if not p.get("amount"):
                continue
            tx = {
                "id": uuid.uuid4().hex,
                "type": "income",
                "amount": float(p["amount"]),
                "date": p.get("date") or today_str(),
                "description": p.get("note") or f"دفعة من {client_info.get('name', 'واتساب')}",
                "category": "دفعات عملاء",
                "client_name": client_info.get("name") or "",
                "debt_direction": "owed_to_me",
                "paid": True,
                "source": "whatsapp",
                "created_at": now_iso(),
            }
            await db.transactions.insert_one(dict(tx))
            created["transactions"] += 1

    if body.notes_as_log and client_id:
        note_texts = []
        if a.get("summary"):
            note_texts.append("📝 ملخص المحادثة:\n" + a["summary"])
        if a.get("notes"):
            note_texts.append("🔖 ملاحظات:\n• " + "\n• ".join(a["notes"]))
        if a.get("alerts"):
            note_texts.append("⚠️ متابعات مطلوبة:\n• " + "\n• ".join(a["alerts"]))
        for t in note_texts:
            log = {
                "id": uuid.uuid4().hex,
                "text": t,
                "log_type": "whatsapp",
                "created_at": now_iso(),
            }
            await db.clients.update_one({"id": client_id}, {"$push": {"logs": log}})
            created["logs"] += 1

    await db.whatsapp_analyses.update_one(
        {"id": analysis_id},
        {"$set": {"applied": True, "applied_at": now_iso(), "applied_to_client": client_id}},
    )
    return {"ok": True, "client_id": client_id, "created": created}
