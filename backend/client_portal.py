"""Public client portal — no authentication required.

Each client gets a unique portal_token (generated on creation). Sharing the
link /portal/{token} lets the client see their project's live status
without any login, per the AZVIO feature roadmap ("بوابة بصمة المشروع").

Only safe, client-facing fields are exposed here — internal notes, source,
and other team-only fields are intentionally excluded.
"""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import db

public_router = APIRouter(prefix="/portal", tags=["client-portal"])
router = APIRouter(dependencies=[Depends(get_current_user)], tags=["client-portal-internal"])

STAGE_LABELS = {
    "booked": "محجوز",
    "shooting": "جاري التصوير",
    "editing": "جاري المونتاج",
    "review": "مراجعة العميل",
    "delivered": "تم التسليم",
}
STAGE_ORDER = ["booked", "shooting", "editing", "review", "delivered"]


@public_router.get("/{token}")
async def get_portal(token: str):
    """احصل على بيانات المشروع للعميل."""
    client = await db.clients.find_one({"portal_token": token}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="الرابط غير صحيح أو منتهي")
    
    stage = client.get("stage") or "booked"
    project_id = client.get("id")
    
    # احصل على كل الفواتير/عروض السعر المرتبطة بهذا العميل (المجموعة الحقيقية db.documents —
    # كانت البوابة تقرأ من db.invoices الخطأ، مجموعة شبه فاضية غير مستخدمة فعلياً بشاشة الفواتير)
    invoices = []
    if project_id:
        docs = await db.documents.find(
            {"client_id": project_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(20)
        invoices = [{
            "id": d.get("id"),
            "display_number": d.get("display_number"),
            "is_quote": d.get("is_quote"),
            "total": d.get("total"),
            "status": d.get("status"),
            "payment_link": d.get("payment_link") or "",
            "created_at": d.get("created_at"),
        } for d in docs]

    # احصل على الملفات إذا كانت موجودة
    files = []
    if stage == "delivered" and project_id:
        files_docs = await db.project_files.find(
            {"client_id": project_id},
            {"_id": 0}
        ).to_list(100)
        files = [{
            "name": f.get("name"),
            "download_link": f.get("download_link"),
            "type": f.get("type")
        } for f in files_docs]
    
    # احصل على آخر ملاحظات
    notes = []
    if project_id:
        notes_docs = await db.project_notes.find(
            {"client_id": project_id, "client_visible": True},
            {"_id": 0}
        ).sort("created_at", -1).to_list(10)
        notes = [{
            "text": n.get("text"),
            "created_at": n.get("created_at")
        } for n in notes_docs]
    
    return {
        "name": client.get("name"),
        "service_type": client.get("service_type"),
        "sub_category": client.get("sub_category"),
        "stage": stage,
        "stage_label": STAGE_LABELS.get(stage, stage),
        "stage_index": STAGE_ORDER.index(stage) if stage in STAGE_ORDER else 0,
        "stages": [{"key": s, "label": STAGE_LABELS[s]} for s in STAGE_ORDER],
        "agreed_price": client.get("agreed_price"),
        "status": client.get("status"),
        "drive_link": client.get("drive_link") if stage == "delivered" else None,
        "has_signature": bool(client.get("approval_signature")),
        "invoices": invoices,
        "files": files,
        "notes": notes,
        "project_id": project_id
    }


@public_router.get("/{token}/invoices/{doc_id}/pdf")
async def portal_invoice_pdf(token: str, doc_id: str):
    """تحميل فاتورة/عرض سعر بصيغة PDF من رابط البوابة العام — بدون تسجيل دخول،
    محمي برمز البوابة الخاص بالعميل نفسه (طلب #12: كل شي مرتبط بالفواتير من نفس الرابط)."""
    client = await db.clients.find_one({"portal_token": token}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="الرابط غير صحيح أو منتهي")
    doc = await db.documents.find_one({"id": doc_id, "client_id": client["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="المستند غير موجود أو لا يخص هذا العميل")

    from invoices import _build_document_pdf_bytes
    from fastapi.responses import Response

    pdf_bytes = await _build_document_pdf_bytes(doc_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.get("display_number", "invoice")}.pdf"'},
    )


@public_router.post("/{token}/sign")
async def sign_portal(token: str, body: dict):
    """Client signs approval directly from the public portal link."""
    signature = (body or {}).get("signature")
    if not signature:
        raise HTTPException(status_code=400, detail="التوقيع مطلوب")
    r = await db.clients.update_one(
        {"portal_token": token},
        {"$set": {"approval_signature": signature, "approved_at": datetime.now(timezone.utc).isoformat()}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="الرابط غير صحيح")
    return {"ok": True}


# ============ رابط توقيع مخصص يُقفل تلقائياً بعد الاستخدام (طلب #12) ============
# مختلف عن رابط "حالة المشروع" العام أعلاه (اللي يفضل مفتوح دايماً) — هذا رابط
# لمرة واحدة تحديداً لجمع التوقيع، وبمجرد ما العميل يوقّع، يصير الرابط مقفول نهائياً.

import uuid as _uuid


@router.post("/clients/{client_id}/signing-link", tags=["client-portal"])
async def generate_signing_link(client_id: str):
    """يولّد رابط توقيع جديد لمرة واحدة — استدعِه من التطبيق الداخلي (يحتاج تسجيل دخول)."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="العميل غير موجود")

    sign_token = _uuid.uuid4().hex
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"sign_token": sign_token, "sign_token_used": False, "sign_token_created_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"sign_token": sign_token}


@public_router.get("/sign/{sign_token}")
async def get_signing_link(sign_token: str):
    """صفحة التوقيع المخصصة — تعرض تفاصيل الخدمة فقط، وتُقفل تلقائياً بعد أول توقيع."""
    client = await db.clients.find_one({"sign_token": sign_token}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="رابط التوقيع غير صحيح")
    if client.get("sign_token_used"):
        raise HTTPException(status_code=410, detail="هذا الرابط استُخدم بالفعل وتم إغلاقه. تواصل معنا لو تحتاج رابط جديد.")

    return {
        "client_name": client.get("name"),
        "service_type": client.get("service_type"),
        "sub_category": client.get("sub_category"),
        "agreed_price": client.get("agreed_price"),
        "notes": client.get("notes", ""),
    }


@public_router.post("/sign/{sign_token}")
async def submit_signing_link(sign_token: str, body: dict):
    """يسجّل التوقيع ويقفل الرابط فوراً — أي محاولة ثانية بنفس الرابط ترفض تلقائياً."""
    signature = (body or {}).get("signature")
    if not signature:
        raise HTTPException(status_code=400, detail="التوقيع مطلوب")

    client = await db.clients.find_one({"sign_token": sign_token}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="رابط التوقيع غير صحيح")
    if client.get("sign_token_used"):
        raise HTTPException(status_code=410, detail="هذا الرابط استُخدم بالفعل وتم إغلاقه.")

    await db.clients.update_one(
        {"sign_token": sign_token},
        {"$set": {
            "approval_signature": signature,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "sign_token_used": True,  # قفل نهائي — الرابط ما يشتغل بعدها
            "stage_locked": True,  # حالة المشروع تتثبت فور التوقيع — ما تتغير إلا بفك القفل يدوياً
        }},
    )
    return {"ok": True}


@router.post("/clients/{client_id}/unlock-stage", tags=["client-portal"])
async def unlock_client_stage(client_id: str):
    """فك قفل حالة المشروع يدوياً (بعد التوقيع) — لو احتجت تعدّل المرحلة لأي سبب استثنائي."""
    r = await db.clients.update_one({"id": client_id}, {"$set": {"stage_locked": False}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return {"ok": True}
