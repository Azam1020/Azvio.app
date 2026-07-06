"""
Communication Module - الردود الجاهزة والتواصل الذكي
يتضمن: Quick Reply Templates, Auto-replies, First Contact Response
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from database import db
from datetime import datetime
import uuid

router = APIRouter(dependencies=[Depends(get_current_user)])


# ============ DEFAULT REPLY TEMPLATES ============
DEFAULT_TEMPLATES = {
    "pricing": {
        "title": "استفسار عن الأسعار",
        "template": "السلام عليكم 👋\n\nشكراً على استفسارك. أسعارنا تتعلق حسب:\n• نوع الخدمة (تصوير، مونتاج، درون)\n• عدد ساعات العمل\n• التعقيد والمؤثرات\n\nبإمكانك مشاركة تفاصيل مشروعك حتى أعطيك عرض دقيق 😊"
    },
    "timeline": {
        "title": "استفسار عن المدة الزمنية",
        "template": "السلام عليكم 👋\n\nمتوسط مدة التسليم:\n📹 فيديو بسيط: 3-5 أيام\n🎬 فيديو متقدم: 1-2 أسابيع\n📸 صور درون: يوم-يومين\n\nحسب الحالية والحجم، راح أعطيك موعد دقيق ✅"
    },
    "location": {
        "title": "استفسار عن المواقع",
        "template": "السلام عليكم 👋\n\nنتعامل مع جميع مناطق الرياض وحواليها 📍\n\nالمواقع البعيدة (مثل الخرج، الدرعية)، قد يكون فيه تكلفة إضافية للتنقل.\n\nقول لي الموقع تمام وأحسبها لك 🚗"
    },
    "booking": {
        "title": "تأكيد الحجز",
        "template": "ممتاز! شكراً لاختيارك لنا 🙏\n\nقبل ما نبدأ:\n✅ رجاء أكد تاريخ العمل\n✅ ابعث صور/وصف للمشروع\n✅ وقت الدفع الأول\n\nراح أرسل لك رابط الدفع السريع والعقد 📋"
    },
    "delivery": {
        "title": "تذكير قبل التسليم",
        "template": "السلام عليكم 🎉\n\nأخبار سارة! مشروعك جاهز للمراجعة.\n\nتقدر تراجعه من الرابط هنا: [رابط المشروع]\n\nإذا في أي تعديلات، خبرني فوراً 📝"
    },
    "payment": {
        "title": "تذكير الدفع",
        "template": "السلام عليكم 💳\n\nذكرتك، الفاتورة رقم #[invoice_id] مستحقة.\n\nتقدر تدفع من هنا: [رابط الدفع]\n\nأي استفسار، أنا هنا 😊"
    },
    "followup": {
        "title": "متابعة لطيفة",
        "template": "السلام عليكم! 👋\n\nكيف حالك؟ هل استقبلت الملفات تمام؟\n\nإذا في أي استفسار أو تعديل، أنا متاح دايماً ✨"
    },
    "delay": {
        "title": "اعتذار عن التأخير",
        "template": "السلام عليكم 🙏\n\nنعتذر عن التأخير قليلاً.\n\nالمشروع قريب الانتهاء وراح أرسله لك [التاريخ].\n\nشكراً على صبرك معنا 💪"
    }
}


class ReplyTemplate(BaseModel):
    title: str
    template: str
    category: str = "custom"


class SavedReply(BaseModel):
    id: str = ""
    title: str
    template: str
    usage_count: int = 0


@router.get("/communication/templates")
async def get_reply_templates(user: dict = Depends(get_current_user)):
    """احصل على الردود الجاهزة (الافتراضية + المخزّنة)."""
    try:
        # احصل على الردود المخزّنة للمستخدم
        saved = list(await db.saved_replies.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)) or []
        
        # دمج الافتراضية مع المخزّنة
        return {
            "default": DEFAULT_TEMPLATES,
            "saved": saved
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/communication/templates/save")
async def save_reply_template(body: ReplyTemplate, user: dict = Depends(get_current_user)):
    """حفظ رد جديد مخصص."""
    try:
        reply_id = str(uuid.uuid4())
        reply = {
            "id": reply_id,
            "user_id": user["user_id"],
            "title": body.title,
            "template": body.template,
            "category": body.category,
            "usage_count": 0,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        await db.saved_replies.insert_one(reply)
        
        return {
            "success": True,
            "id": reply_id,
            "message": "✅ تم حفظ الرد"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/communication/templates/use")
async def use_reply_template(template_id: str, user: dict = Depends(get_current_user)):
    """استخدم رد جاهز (تحديث counter)."""
    try:
        await db.saved_replies.update_one(
            {"id": template_id, "user_id": user["user_id"]},
            {
                "$inc": {"usage_count": 1},
                "$set": {"last_used": datetime.now().isoformat()}
            }
        )
        
        return {"success": True}
    except Exception:
        pass  # لا تحتاج نتيجة


@router.delete("/communication/templates/{template_id}")
async def delete_reply_template(template_id: str, user: dict = Depends(get_current_user)):
    """احذف رد مخصص."""
    try:
        result = await db.saved_replies.delete_one(
            {"id": template_id, "user_id": user["user_id"]}
        )
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="الرد غير موجود")
        
        return {"success": True, "message": "تم حذف الرد"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ AUTO-REPLY SYSTEM ============

class AutoReplyConfig(BaseModel):
    enabled: bool = True
    reply_text: str = "شكراً على رسالتك! سأرد عليك قريباً 🙏"


@router.get("/communication/auto-reply")
async def get_auto_reply_config(user: dict = Depends(get_current_user)):
    """احصل على إعدادات الرد الآلي."""
    try:
        config = await db.user_settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
        
        return {
            "enabled": config.get("auto_reply_enabled", True) if config else True,
            "reply_text": config.get("auto_reply_text", "شكراً على رسالتك! سأرد عليك قريباً 🙏") if config else "شكراً على رسالتك! سأرد عليك قريباً 🙏"
        }
    except Exception:
        return {
            "enabled": True,
            "reply_text": "شكراً على رسالتك! سأرد عليك قريباً 🙏"
        }


@router.post("/communication/auto-reply")
async def update_auto_reply(body: AutoReplyConfig, user: dict = Depends(get_current_user)):
    """تحديث إعدادات الرد الآلي."""
    try:
        await db.user_settings.update_one(
            {"user_id": user["user_id"]},
            {
                "$set": {
                    "auto_reply_enabled": body.enabled,
                    "auto_reply_text": body.reply_text,
                    "updated_at": datetime.now().isoformat()
                }
            },
            upsert=True
        )
        
        return {"success": True, "message": "✅ تم تحديث الإعدادات"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ FIRST CONTACT RESPONSE ============

@router.post("/communication/first-reply")
async def send_first_contact_reply(client_id: str, user: dict = Depends(get_current_user)):
    """إرسال الرد الأول الفوري للعميل الجديد."""
    try:
        # احصل على العميل
        client = await db.clients.find_one({"id": client_id, "created_by": user["user_id"]}, {"_id": 0})
        
        if not client:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
        
        # الرد الأول الافتراضي
        first_reply = f"""السلام عليكم {client.get('name', 'صديقي')} 👋

شكراً لك على اختيارك AZVIO! 🙏

أنا سند، مساعدك الذكي هنا. 
بإمكانك:
✅ سؤالي عن الأسعار والخدمات
✅ حجز موعد تصوير أو مونتاج
✅ تتبع مشروعك بالوقت الفعلي

كيف أساعدك اليوم؟ 😊
"""
        
        # احفظ الرد في السجل
        await db.messages.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "client_id": client_id,
            "direction": "outgoing",
            "content": first_reply,
            "type": "auto_first_reply",
            "sent_at": datetime.now().isoformat()
        })
        
        return {
            "success": True,
            "message": first_reply,
            "sent_to": client.get("name", "العميل")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
