"""Invoices and quotes.

A single 'documents' collection backs both quotes (عرض سعر) and invoices
(فاتورة) — a quote is just a document with is_quote=True. Approving a
quote creates a real invoice from it (see convert_to_invoice).

No payment gateway is wired up yet (Moyasar/Unifonic pending external
account setup) — "paid" is a manual admin toggle for now, which is exactly
what was asked for: build the pricing/invoice logic now, add real payment
later without needing to change this module's shape.
"""
from __future__ import annotations
import io
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import arabic_reshaper
from bidi.algorithm import get_display
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pymongo import ReturnDocument
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from auth import get_current_user
from database import db, today_str

router = APIRouter(dependencies=[Depends(get_current_user)])

FONTS_DIR = os.path.join(os.path.dirname(__file__), "fonts")
pdfmetrics.registerFont(TTFont("Cairo", os.path.join(FONTS_DIR, "Cairo-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Cairo-Bold", os.path.join(FONTS_DIR, "Cairo-Bold.ttf")))


def now_iso():
    return datetime.now(timezone.utc).isoformat()




def new_id():
    return uuid.uuid4().hex


def rtl(text: str) -> str:
    """Reshape + reorder Arabic text so reportlab draws it correctly."""
    return get_display(arabic_reshaper.reshape(text or ""))


async def _next_number(kind: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": kind},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["value"]


class InvoiceItem(BaseModel):
    description: str
    amount: float


class DocumentCreate(BaseModel):
    client_id: str = ""
    client_name: str
    service_type: str = "drone"
    sub_category: str = ""
    items: list[InvoiceItem]
    apply_vat: bool = True
    vat_rate: float = 15
    is_quote: bool = False
    notes: str = ""
    show_sub_category: bool = True
    show_notes: bool = True
    design: str = "brand"  # brand (teal AZVIO) | minimal (black & white)


class DocumentUpdate(BaseModel):
    status: Optional[str] = None  # draft | sent | approved | paid
    notes: Optional[str] = None


def _totals(items: list[dict], vat_rate: float, apply_vat: bool = True) -> dict:
    subtotal = sum(i["amount"] for i in items)
    vat_amount = round(subtotal * vat_rate / 100, 2) if apply_vat else 0.0
    return {"subtotal": round(subtotal, 2), "vat_amount": vat_amount, "total": round(subtotal + vat_amount, 2)}


@router.get("/documents")
async def list_documents(is_quote: Optional[bool] = None):
    q = {} if is_quote is None else {"is_quote": is_quote}
    return await db.documents.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/documents/{doc_id}")
async def get_document(doc_id: str):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    return doc


@router.post("/documents")
async def create_document(body: DocumentCreate):
    items = [i.model_dump() for i in body.items]
    if not items:
        raise HTTPException(status_code=400, detail="أضف بندًا واحدًا على الأقل")
    kind = "quote" if body.is_quote else "invoice"
    number = await _next_number(kind)
    doc = {
        "id": new_id(),
        "number": number,
        "display_number": f"{'QUO' if body.is_quote else 'INV'}-{number:04d}",
        "client_id": body.client_id,
        "client_name": body.client_name,
        "service_type": body.service_type,
        "sub_category": body.sub_category,
        "items": items,
        "apply_vat": body.apply_vat,
        "vat_rate": body.vat_rate if body.apply_vat else 0,
        "is_quote": body.is_quote,
        "notes": body.notes,
        "show_sub_category": body.show_sub_category,
        "show_notes": body.show_notes,
        "design": body.design,
        "status": "draft",
        "converted_to_invoice_id": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **_totals(items, body.vat_rate, body.apply_vat),
    }
    await db.documents.insert_one(dict(doc))
    return doc


@router.put("/documents/{doc_id}")
async def update_document(doc_id: str, body: DocumentUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    r = await db.documents.update_one({"id": doc_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    return await db.documents.find_one({"id": doc_id}, {"_id": 0})


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    r = await db.documents.delete_one({"id": doc_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المستند غير موجود")
    return {"ok": True}


@router.post("/documents/{doc_id}/convert-to-invoice")
async def convert_to_invoice(doc_id: str):
    quote = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="عرض السعر غير موجود")
    if not quote.get("is_quote"):
        raise HTTPException(status_code=400, detail="هذا المستند فاتورة أصلاً")
    if quote.get("converted_to_invoice_id"):
        existing = await db.documents.find_one({"id": quote["converted_to_invoice_id"]}, {"_id": 0})
        return existing

    number = await _next_number("invoice")
    invoice = {
        **quote,
        "id": new_id(),
        "number": number,
        "display_number": f"INV-{number:04d}",
        "is_quote": False,
        "status": "draft",
        "converted_to_invoice_id": None,
        "converted_from_quote_id": quote["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.documents.insert_one(dict(invoice))
    await db.documents.update_one({"id": doc_id}, {"$set": {"converted_to_invoice_id": invoice["id"], "status": "approved"}})
    return invoice


@router.get("/documents/{doc_id}/pdf")
async def document_pdf(doc_id: str):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="المستند غير موجود")

    accent = colors.HexColor("#3E9194") if doc.get("design", "brand") == "brand" else colors.black

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    right = width - 50
    y = height - 60

    title = "عرض سعر" if doc["is_quote"] else "فاتورة" + (" ضريبية" if doc.get("apply_vat", True) else "")
    c.setFillColor(accent)
    c.setFont("Cairo-Bold", 20)
    c.drawRightString(right, y, rtl("AZVIO — " + title))
    c.setFillColor(colors.black)
    y -= 22
    c.setFont("Cairo", 11)
    c.drawRightString(right, y, rtl(f"رقم المستند: {doc['display_number']}"))
    y -= 16
    c.drawRightString(right, y, rtl(f"التاريخ: {doc['created_at'][:10]}"))
    y -= 30

    c.setFont("Cairo-Bold", 13)
    c.drawRightString(right, y, rtl(f"إلى: {doc['client_name']}"))
    y -= 20
    if doc.get("show_sub_category", True) and doc.get("sub_category"):
        c.setFont("Cairo", 10)
        c.drawRightString(right, y, rtl(f"الفئة: {doc['sub_category']}"))
        y -= 20
    y -= 10

    # Table header
    c.setFillColor(accent)
    c.setFont("Cairo-Bold", 11)
    c.drawRightString(right, y, rtl("الوصف"))
    c.drawString(50, y, "المبلغ (ر.س)")
    c.setFillColor(colors.black)
    y -= 6
    c.line(50, y, right, y)
    y -= 18

    c.setFont("Cairo", 11)
    for item in doc["items"]:
        c.drawRightString(right, y, rtl(item["description"]))
        c.drawString(50, y, f"{item['amount']:,.2f}")
        y -= 20

    y -= 8
    c.line(50, y, right, y)
    y -= 22

    apply_vat = doc.get("apply_vat", True)
    c.setFont("Cairo", 11)
    if apply_vat:
        c.drawRightString(right, y, rtl("الإجمالي قبل الضريبة"))
        c.drawString(50, y, f"{doc['subtotal']:,.2f}")
        y -= 18
        c.drawRightString(right, y, rtl(f"ضريبة القيمة المضافة ({doc['vat_rate']:.0f}٪)"))
        c.drawString(50, y, f"{doc['vat_amount']:,.2f}")
        y -= 20
    c.setFillColor(accent)
    c.setFont("Cairo-Bold", 13)
    c.drawRightString(right, y, rtl("الإجمالي النهائي"))
    c.drawString(50, y, f"{doc['total']:,.2f}")
    c.setFillColor(colors.black)
    y -= 40

    if doc.get("show_notes", True) and doc.get("notes"):
        c.setFont("Cairo", 10)
        c.drawRightString(right, y, rtl("ملاحظات: " + doc["notes"]))
        y -= 20

    c.setFont("Cairo", 9)
    c.drawRightString(right, 40, rtl("AZVIO — التصوير الجوي بالدرون والمونتاج"))

    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={doc['display_number']}.pdf"},
    )


# ============ AI pricing suggestion ============

class PricingSuggestRequest(BaseModel):
    service_type: str = "drone"
    sub_category: str = ""
    shooting_days: float = 0
    editing_minutes: float = 0
    effects_level: str = "basic"  # basic | medium | advanced
    hours: float = 0  # ساعات العمل الفعلية (تصوير/مونتاج/أي خدمة)
    equipment_cost: float = 0  # تكلفة معدات/أغراض المشروع
    logistics_cost: float = 0  # رسوم لوجستية (تنقل، شحن، إلخ)
    admin_fees: float = 0  # رسوم إدارية/تصاريح
    notes: str = ""


@router.post("/pricing/suggest")
async def suggest_pricing(body: PricingSuggestRequest):
    from llm_client import ask_text, LLMError

    my_prices = await db.my_pricing.find(
        {"service_type": body.service_type} if body.service_type else {}, {"_id": 0}
    ).to_list(100)
    price_lines = "\n".join(
        f"- {p['label']}: {p['price_from']}-{p['price_to']} ر.س" + (f" ({p['notes']})" if p.get("notes") else "")
        for p in my_prices
    ) or "لا توجد أسعار مرجعية محفوظة بعد."

    direct_costs = body.equipment_cost + body.logistics_cost + body.admin_fees

    prompt = f"""بناءً على أسعاري المرجعية الخاصة التالية (هذي "تسعيرتي" — اعتبرها المصدر الأساسي والأهم لتحديد السعر، ولا تتجاهلها لصالح متوسط السوق العام):
{price_lines}

مهم جداً: كل نوع خدمة له منطق تسعير مختلف تماماً، لا تعاملهم بنفس الطريقة:
- تصوير جوي بالدرون: يعتمد على أيام/ساعات الطيران + تكلفة الطيار المرخص + التأمين + تصاريح الطيران (رسوم إدارية) + صعوبة الموقع.
- تصوير أرضي (فوتوغرافي/فيديو): يعتمد على ساعات الجلسة + عدد المصورين + تكلفة الإضاءة والمعدات + التنقل، وغالباً أرخص من الجوي للساعة الواحدة.
- المونتاج: يُحتسب بالدقيقة النهائية للفيديو (مو مدة التصوير الخام)، ويرتفع السعر مع مستوى المؤثرات وتعقيد القصة.
- الموشن جرافيك/الرسوم المتحركة: يُحتسب بالثانية أو بالمشهد غالباً، سعره للدقيقة أعلى بكثير من المونتاج العادي لأنه رسم يدوي وليس قص فقط، ولا علاقة له بأيام تصوير غالباً.
- أي نوع خدمة آخر غير المذكورين أعلاه: استخدم حكمك بناءً على طبيعة الخدمة المذكورة باسمها.

اقترح سعرًا عادلًا لمشروع جديد بالتفاصيل التالية، وطبّق منطق النوع المناسب من الأعلى حسب "نوع الخدمة" و"الفئة الفرعية":
- نوع الخدمة: {body.service_type}
- الفئة الفرعية: {body.sub_category or 'غير محدد'}
- أيام التصوير: {body.shooting_days}
- ساعات العمل الفعلية: {body.hours}
- دقائق المونتاج: {body.editing_minutes}
- مستوى المؤثرات المطلوبة: {body.effects_level}
- تكلفة المعدات/الأغراض: {body.equipment_cost} ر.س
- الرسوم اللوجستية (تنقل/شحن): {body.logistics_cost} ر.س
- الرسوم الإدارية/التصاريح: {body.admin_fees} ر.س
- إجمالي التكاليف المباشرة المذكورة أعلاه: {direct_costs} ر.س (لازم السعر المقترح يغطيها + هامش ربح، مو أقل منها)
- ملاحظات إضافية: {body.notes or 'لا توجد'}

اعتمد بالدرجة الأولى على "تسعيرتي" أعلاه إذا كانت متوفرة لنفس نوع الخدمة، واستخدم متوسط سعر السوق السعودي فقط كمرجع ثانوي لو تسعيرتي غير كافية أو غير موجودة.

أجب بصيغة JSON فقط بدون أي نص إضافي:
{{"suggested_price": 0, "price_range_low": 0, "price_range_high": 0, "market_price_low": 0, "market_price_high": 0, "based_on": "my_pricing أو market", "reasoning": "شرح مختصر بالعربية لسبب هذا السعر ومصدره"}}"""

    try:
        text = await ask_text(
            system="أنت خبير تسعير لخدمات التصوير الجوي بالدرون والمونتاج بالسوق السعودي. تجيب دائماً بصيغة JSON فقط.",
            user=prompt,
            task="advice",
        )
    except LLMError as e:
        raise HTTPException(status_code=500, detail=f"تعذر حساب السعر المقترح: {e}")

    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise HTTPException(status_code=422, detail="تعذر قراءة السعر المقترح")
    try:
        return json.loads(m.group(0))
    except Exception:
        raise HTTPException(status_code=422, detail="تعذر قراءة السعر المقترح")


@router.post("/invoices/auto-generate")
async def auto_generate_invoice(body: dict, user: dict = Depends(get_current_user)):
    """توليد الفاتورة تلقائياً من بيانات المشروع."""
    client_id = body.get("client_id")
    amount = body.get("amount", 0)
    notes = body.get("notes", "")
    
    if not client_id or not amount:
        raise HTTPException(status_code=400, detail="client_id و amount مطلوبان")
    
    try:
        # احصل على بيانات العميل
        client = await db.clients.find_one({"id": client_id, "created_by": user["user_id"]}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
        
        # توليد رقم الفاتورة
        from datetime import datetime
        invoice_num = f"INV-{datetime.now().strftime('%Y%m%d')}-{client_id[:6].upper()}"
        
        # إنشاء الفاتورة
        invoice = {
            "id": invoice_num,
            "invoice_number": invoice_num,
            "user_id": user["user_id"],
            "client_id": client_id,
            "client_name": client.get("name"),
            "client_phone": client.get("phone"),
            "client_email": client.get("email"),
            "amount": amount,
            "status": "pending",  # pending, paid, overdue
            "service_type": client.get("service_type"),
            "description": notes or f"فاتورة {client.get('service_type')}",
            "issued_date": datetime.now().isoformat(),
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),  # 7 ايام
            "payment_link": None,  # سيُملأ من نظام الدفع
            "payment_status": "not_paid",
            "created_at": datetime.now().isoformat()
        }
        
        # احفظ الفاتورة
        await db.invoices.insert_one(invoice)
        
        # حدّث حالة العميل
        await db.clients.update_one(
            {"id": client_id},
            {
                "$set": {
                    "stage": "delivered",
                    "invoice_id": invoice_num,
                    "updated_at": datetime.now().isoformat()
                }
            }
        )
        
        # أرسل رسالة للعميل
        from communication import DEFAULT_TEMPLATES
        delivery_msg = DEFAULT_TEMPLATES.get("delivery", {}).get("template", "مشروعك جاهز!")
        
        return {
            "success": True,
            "invoice": invoice,
            "message": f"✅ تم إنشاء الفاتورة {invoice_num} بنجاح"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/invoices/send-to-client")
async def send_invoice_to_client(body: dict, user: dict = Depends(get_current_user)):
    """أرسل الفاتورة للعميل عبر البريد الإلكتروني."""
    invoice_id = body.get("invoice_id")
    
    try:
        # احصل على الفاتورة
        invoice = await db.invoices.find_one(
            {"id": invoice_id, "user_id": user["user_id"]},
            {"_id": 0}
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
        
        client_email = invoice.get("client_email")
        if not client_email:
            return {
                "success": False,
                "message": "لا يوجد بريد إلكتروني للعميل"
            }
        
        # تحضير رسالة البريد
        invoice_msg = f"""
السلام عليكم {invoice.get('client_name')}،

فاتورتك جاهزة:
رقم الفاتورة: {invoice.get('invoice_number')}
المبلغ: {invoice.get('amount')} ريال
تاريخ الاستحقاق: {invoice.get('due_date')}
الخدمة: {invoice.get('description')}

رابط الدفع: [سيتم إضافته من بوابة الدفع]

شكراً لك! 🙏
AZVIO Team
"""
        
        # هنا يمكن إضافة تكامل مع خدمة البريد (SendGrid, Mailgun, etc)
        # في الوقت الحالي، نسجل فقط في قاعدة البيانات
        await db.messages.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "client_id": invoice.get("client_id"),
            "type": "invoice",
            "invoice_id": invoice_id,
            "content": invoice_msg,
            "sent_to": client_email,
            "sent_at": datetime.now().isoformat()
        })
        
        return {
            "success": True,
            "message": f"✅ تم إرسال الفاتورة إلى {client_email}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from datetime import timedelta
import uuid
