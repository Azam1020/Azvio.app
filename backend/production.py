"""
Production Mode - وضع الإنتاج للعمل الميداني
يوفر تسجيل الملاحظات بالصوت، والقوائم الجاهزة (Checklists)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from database import db
from datetime import datetime
import uuid

router = APIRouter(dependencies=[Depends(get_current_user)])


# القوائم الجاهزة الافتراضية
DEFAULT_CHECKLISTS = {
    "real_estate_photography": {
        "name": "تصوير عقاري",
        "items": [
            "اختبار الكاميرا والعدسات",
            "شحن البطاريات",
            "إعدادات الإضاءة الداخلية",
            "تصوير الواجهة الخارجية",
            "تصوير الردهة والصالات",
            "تصوير الغرف",
            "تصوير المطبخ والحمامات",
            "تصوير الحديقة/الفناء",
            "صور المسافة (من بعيد)",
            "صور الفيديو (جولة ثلاثية الأبعاد)"
        ]
    },
    "drone_shots": {
        "name": "تصوير جوي - درون",
        "items": [
            "التحقق من الطقس والرياح",
            "اختبار الدرون والبطاريات",
            "اختبار نظام GPS",
            "التحقق من التراخيص والقيود",
            "الحصول على الموافقات المحلية",
            "تصوير الحركة البطيئة (Slow Motion)",
            "تصوير الحركات الديناميكية",
            "التقطعات الجوية من الارتفاعات المختلفة",
            "الصور الثابتة عالية الدقة",
            "تسجيل الأصوات البيئية"
        ]
    },
    "video_editing": {
        "name": "مرحلة المونتاج",
        "items": [
            "استيراد ملفات الفيديو الخام",
            "تنظيم الملفات بالفئات",
            "القطع الأولي (Rough Cut)",
            "تصحيح الألوان (Color Grading)",
            "إضافة الموسيقى والصوت",
            "إضافة المؤثرات البصرية",
            "المونتاج النهائي",
            "إضافة الترجمات",
            "التصدير بجودة عالية",
            "اختبار على أجهزة مختلفة"
        ]
    },
    "client_review": {
        "name": "مراجعة العميل",
        "items": [
            "إرسال المشروع الأولي",
            "انتظار ردود العميل",
            "توثيق التعديلات المطلوبة",
            "تطبيق التعديلات",
            "إرسال النسخة المعدلة",
            "موافقة العميل",
            "التصدير النهائي",
            "تحضير ملفات التسليم"
        ]
    }
}


class ChecklistItem(BaseModel):
    id: str = ""
    text: str
    completed: bool = False
    notes: str = ""


class Checklist(BaseModel):
    id: str = ""
    project_id: str
    name: str
    items: list[ChecklistItem] = []
    progress_percent: int = 0


class ProductionNote(BaseModel):
    id: str = ""
    project_id: str
    text: str
    timestamp: str = ""
    type: str = "note"  # note, warning, fix_needed


@router.get("/production/checklists/templates")
async def get_checklist_templates(user: dict = Depends(get_current_user)):
    """احصل على قوالب القوائم الجاهزة."""
    return {"templates": DEFAULT_CHECKLISTS}


@router.post("/production/checklists/create")
async def create_checklist_from_template(body: dict, user: dict = Depends(get_current_user)):
    """أنشئ قائمة من قالب موجود."""
    template_key = body.get("template_key")
    project_id = body.get("project_id")
    
    if not template_key or not project_id:
        raise HTTPException(status_code=400, detail="template_key و project_id مطلوبان")
    
    template = DEFAULT_CHECKLISTS.get(template_key)
    if not template:
        raise HTTPException(status_code=404, detail="القالب غير موجود")
    
    try:
        checklist = {
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "project_id": project_id,
            "name": template["name"],
            "items": [
                {
                    "id": str(uuid.uuid4()),
                    "text": item,
                    "completed": False,
                    "notes": ""
                }
                for item in template["items"]
            ],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        await db.checklists.insert_one(checklist)
        
        return {
            "success": True,
            "checklist": checklist,
            "message": f"✅ تم إنشاء قائمة {template['name']}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/production/checklists/{checklist_id}")
async def get_checklist(checklist_id: str, user: dict = Depends(get_current_user)):
    """احصل على قائمة مع حساب التقدم."""
    try:
        checklist = await db.checklists.find_one(
            {"id": checklist_id, "user_id": user["user_id"]},
            {"_id": 0}
        )
        
        if not checklist:
            raise HTTPException(status_code=404, detail="القائمة غير موجودة")
        
        # احسب نسبة الإنجاز
        items = checklist.get("items", [])
        total = len(items)
        completed = sum(1 for item in items if item.get("completed"))
        progress = (completed / total * 100) if total > 0 else 0
        
        checklist["progress_percent"] = int(progress)
        checklist["completed_count"] = completed
        checklist["total_count"] = total
        
        return checklist
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/production/checklists/{checklist_id}/toggle")
async def toggle_checklist_item(checklist_id: str, body: dict, user: dict = Depends(get_current_user)):
    """حدّث حالة عنصر في القائمة."""
    item_id = body.get("item_id")
    
    try:
        result = await db.checklists.update_one(
            {"id": checklist_id, "user_id": user["user_id"]},
            {
                "$set": {
                    "items.$[elem].completed": body.get("completed", True),
                    "updated_at": datetime.now().isoformat()
                }
            },
            array_filters=[{"elem.id": item_id}]
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="القائمة غير موجودة")
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/production/notes")
async def add_production_note(body: ProductionNote, user: dict = Depends(get_current_user)):
    """أضف ملاحظة سريعة أثناء الإنتاج (يمكن تسجيلها بالصوت)."""
    try:
        note = {
            "id": body.id or str(uuid.uuid4()),
            "user_id": user["user_id"],
            "project_id": body.project_id,
            "text": body.text,
            "type": body.type,
            "timestamp": body.timestamp or datetime.now().isoformat(),
            "created_at": datetime.now().isoformat()
        }
        
        await db.production_notes.insert_one(note)
        
        return {
            "success": True,
            "note": note,
            "message": "✅ تم حفظ الملاحظة"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/production/notes/{project_id}")
async def get_project_notes(project_id: str, user: dict = Depends(get_current_user)):
    """احصل على جميع ملاحظات الإنتاج للمشروع."""
    try:
        notes = await db.production_notes.find(
            {"project_id": project_id, "user_id": user["user_id"]},
            {"_id": 0}
        ).sort("timestamp", -1).to_list(100)
        
        # فصل حسب النوع
        regular_notes = [n for n in notes if n.get("type") == "note"]
        warnings = [n for n in notes if n.get("type") == "warning"]
        fixes = [n for n in notes if n.get("type") == "fix_needed"]
        
        return {
            "notes": regular_notes,
            "warnings": warnings,
            "fixes_needed": fixes,
            "total": len(notes)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/production/voice-note")
async def add_voice_note(body: dict, user: dict = Depends(get_current_user)):
    """أضف ملاحظة من تسجيل صوتي محوّل لنص."""
    project_id = body.get("project_id")
    transcript = body.get("transcript")  # النص المحوّل من الصوت
    
    if not project_id or not transcript:
        raise HTTPException(status_code=400, detail="project_id و transcript مطلوبان")
    
    try:
        note = {
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "project_id": project_id,
            "text": transcript,
            "type": "voice_note",
            "is_voice": True,
            "timestamp": datetime.now().isoformat(),
            "created_at": datetime.now().isoformat()
        }
        
        await db.production_notes.insert_one(note)
        
        return {
            "success": True,
            "note": note,
            "message": "✅ تم حفظ الملاحظة الصوتية"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
