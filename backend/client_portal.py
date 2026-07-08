"""Public client portal — no authentication required.

Each client gets a unique portal_token (generated on creation). Sharing the
link /portal/{token} lets the client see their project's live status
without any login, per the AZVIO feature roadmap ("بوابة بصمة المشروع").

Only safe, client-facing fields are exposed here — internal notes, source,
and other team-only fields are intentionally excluded.
"""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from database import db

public_router = APIRouter(prefix="/portal", tags=["client-portal"])

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
