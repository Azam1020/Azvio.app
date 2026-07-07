"""
Services Module - نظام الخدمات المركزي
مصدر واحد للحقيقة: كل شاشة بالتطبيق (سند، الفواتير، التسعير، البوابة، العملاء)
تسحب قائمة الخدمات من هنا بدل ما تكون مكتوبة يدوياً بكل ملف لحاله.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user, get_current_admin
from database import db
from datetime import datetime
import uuid

router = APIRouter(dependencies=[Depends(get_current_user)])


class ServiceCreate(BaseModel):
    name: str  # اسم الخدمة زي ما يبيه المستخدم (يقدر يضيف أي اسم، مو محصور بدرون/مونتاج)
    category_id: str = ""  # ربط بالفئة (طلب #16)
    base_price: float = 0
    description: str = ""
    icon: str = "briefcase"
    active: bool = True


class ServiceUpdate(BaseModel):
    name: str | None = None
    category_id: str | None = None
    base_price: float | None = None
    description: str | None = None
    icon: str | None = None
    active: bool | None = None


@router.get("/services")
async def list_services(user: dict = Depends(get_current_user)):
    """قائمة كل الخدمات — هذي هي القائمة اللي تظهر بكل مكان بالتطبيق (سند، فواتير، تسعير...)."""
    services = await db.services.find(
        {"created_by": user["user_id"], "active": True},
        {"_id": 0}
    ).sort("name", 1).to_list(200)
    return {"services": services}


@router.post("/services")
async def create_service(body: ServiceCreate, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "created_by": user["user_id"],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    })
    await db.services.insert_one(doc)
    return doc


@router.patch("/services/{service_id}")
async def update_service(service_id: str, body: ServiceUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now().isoformat()
    result = await db.services.update_one(
        {"id": service_id, "created_by": user["user_id"]},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
    return {"ok": True}


@router.delete("/services/{service_id}")
async def delete_service(service_id: str, user: dict = Depends(get_current_user)):
    # حذف ناعم (soft delete) بدل الحذف النهائي — عشان ما تنكسر الفواتير/العملاء القدام المرتبطين فيها
    result = await db.services.update_one(
        {"id": service_id, "created_by": user["user_id"]},
        {"$set": {"active": False, "updated_at": datetime.now().isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الخدمة غير موجودة")
    return {"ok": True}


@router.post("/services/seed-defaults")
async def seed_default_services(user: dict = Depends(get_current_user)):
    """أول مرة يفتح المستخدم صفحة الخدمات وما عنده شي، نعطيه نقطة بداية (درون + مونتاج) يقدر يعدلها/يمسحها بحرية."""
    existing = await db.services.count_documents({"created_by": user["user_id"]})
    if existing > 0:
        return {"seeded": False, "message": "عندك خدمات موجودة مسبقاً"}
    defaults = [
        {"name": "تصوير جوي بالدرون", "icon": "airplane", "base_price": 1000},
        {"name": "مونتاج فيديو", "icon": "cut", "base_price": 500},
    ]
    docs = []
    for d in defaults:
        doc = {
            "id": str(uuid.uuid4()),
            "name": d["name"],
            "category_id": "",
            "base_price": d["base_price"],
            "description": "",
            "icon": d["icon"],
            "active": True,
            "created_by": user["user_id"],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        docs.append(doc)
    await db.services.insert_many(docs)
    return {"seeded": True, "services": docs}
