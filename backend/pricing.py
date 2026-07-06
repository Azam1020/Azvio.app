"""
Dynamic Pricing Module - حاسب الأسعار الذكي
يسمح للعميل بتعديل الخدمات والسعر يتحدث لحاله مباشرة
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth import get_current_user
from database import db
import uuid
from datetime import datetime

router = APIRouter(dependencies=[Depends(get_current_user)])


# Base pricing for each service type
PRICING_MATRIX = {
    "photography": {
        "base_rate": 500,  # سعر الساعة الواحدة
        "min_hours": 1,
        "modifiers": {
            "drone": {"multiplier": 1.5, "label": "+ درون (50% أضافي)"},
            "editing": {"fixed_cost": 500, "per_minute": 50, "label": "+ مونتاج"},
            "location_travel": {"per_km": 10, "label": "+ تنقل"},
            "rush": {"multiplier": 1.3, "label": "+ استعجالي (30%)"},
            "raw_footage": {"fixed_cost": 200, "label": "+ ملفات Raw"},
            "vfx": {"per_second": 100, "label": "+ مؤثرات"}
        }
    },
    "editing": {
        "base_rate": 0,  # per minute
        "min_cost": 300,
        "modifiers": {
            "duration_minutes": 50,  # سعر الدقيقة
            "complexity": {"simple": 1.0, "medium": 1.5, "complex": 2.0},
            "color_grade": {"fixed_cost": 300, "label": "+ تصحيح ألوان"},
            "sound_design": {"fixed_cost": 300, "label": "+ تصميم صوتي"},
            "effects": {"fixed_cost": 200, "label": "+ مؤثرات"},
            "subtitles": {"fixed_cost": 100, "label": "+ ترجمة"},
            "turnaround": {"same_day": 1.5, "next_day": 1.2, "label": "+ توصيل سريع"}
        }
    },
    "drone": {
        "base_rate": 1000,  # سعر الجلسة الواحدة
        "min_hours": 0.5,
        "modifiers": {
            "duration_hours": 500,
            "location_difficulty": {"easy": 1.0, "medium": 1.3, "difficult": 1.6},
            "equipment": {"dji_air3": 0, "other": 300},
            "post_production": {"basic": 300, "advanced": 800},
            "raw_delivery": {"fixed_cost": 200, "label": "+ ملفات Raw"}
        }
    }
}


class PricingRequest(BaseModel):
    service_type: str  # photography, editing, drone
    duration_hours: float = 1
    duration_minutes: float = 0
    complexity: str = "medium"
    modifications: list = []  # مثال: ["drone", "editing", "color_grade"]
    location_distance_km: float = 0
    is_rush: bool = False


class PricingResponse(BaseModel):
    base_cost: float
    modifiers_breakdown: dict
    total_cost: float
    savings_if_bulk: float
    comparison_industry: str
    recommended_price: float


@router.post("/pricing/calculate")
async def calculate_dynamic_pricing(req: PricingRequest, user: dict = Depends(get_current_user)):
    """احسب السعر الديناميكي بناءً على المواصفات."""
    if req.service_type not in PRICING_MATRIX:
        raise HTTPException(status_code=400, detail="نوع الخدمة غير صحيح")

    pricing_config = PRICING_MATRIX[req.service_type]

    base_cost = 0
    modifiers_breakdown = {}

    try:
        if req.service_type == "photography":
            hours = max(req.duration_hours, pricing_config.get("min_hours", 1))
            base_cost = hours * pricing_config["base_rate"]
            modifiers_breakdown["ساعات التصوير"] = f"{hours}h × {pricing_config['base_rate']} ر.س = {base_cost} ر.س"

            if "drone" in req.modifications:
                drone_cost = base_cost * 0.5
                base_cost += drone_cost
                modifiers_breakdown["إضافة درون"] = f"+ {drone_cost} ر.س (50%)"

            if "editing" in req.modifications:
                edit_cost = 500
                if req.duration_minutes > 0:
                    edit_cost += req.duration_minutes * 50
                base_cost += edit_cost
                modifiers_breakdown["مونتاج الفيديو"] = f"+ {edit_cost} ر.س"

            if req.location_distance_km > 5:
                travel_cost = (req.location_distance_km - 5) * 10
                base_cost += travel_cost
                modifiers_breakdown["رسوم التنقل"] = f"+ {travel_cost} ر.س ({req.location_distance_km}km)"

            if req.is_rush:
                rush_cost = base_cost * 0.3
                base_cost += rush_cost
                modifiers_breakdown["رسوم الاستعجالية"] = f"+ {rush_cost} ر.س (30%)"

        elif req.service_type == "editing":
            total_minutes = (req.duration_hours * 60) + req.duration_minutes
            base_cost = total_minutes * 50
            modifiers_breakdown["مراحل المونتاج"] = f"{total_minutes} دقيقة × 50 ر.س = {base_cost} ر.س"

            # تطبيق معامل التعقيد
            complexity_multiplier = {"simple": 1.0, "medium": 1.5, "complex": 2.0}.get(req.complexity, 1.0)
            if complexity_multiplier != 1.0:
                complexity_cost = base_cost * (complexity_multiplier - 1)
                base_cost *= complexity_multiplier
                modifiers_breakdown["مستوى التعقيد"] = f"× {complexity_multiplier} ({req.complexity})"

            if "color_grade" in req.modifications:
                base_cost += 300
                modifiers_breakdown["تصحيح ألوان"] = "+ 300 ر.س"

            if "sound_design" in req.modifications:
                base_cost += 300
                modifiers_breakdown["تصميم صوتي"] = "+ 300 ر.س"

            if "effects" in req.modifications:
                base_cost += 200
                modifiers_breakdown["المؤثرات البصرية"] = "+ 200 ر.س"

        elif req.service_type == "drone":
            hours = max(req.duration_hours, 0.5)
            base_cost = hours * 1000
            modifiers_breakdown["جلسة التصوير الجوي"] = f"{hours}h × 1000 ر.س = {base_cost} ر.س"

            # معامل صعوبة الموقع
            difficulty_multiplier = {"easy": 1.0, "medium": 1.3, "difficult": 1.6}.get(req.complexity, 1.0)
            if difficulty_multiplier != 1.0:
                difficulty_cost = base_cost * (difficulty_multiplier - 1)
                base_cost *= difficulty_multiplier
                modifiers_breakdown["صعوبة الموقع"] = f"× {difficulty_multiplier} ({req.complexity})"

            if "post_production" in req.modifications:
                base_cost += 800
                modifiers_breakdown["معالجة ما بعد الإنتاج"] = "+ 800 ر.س"

            if "raw_delivery" in req.modifications:
                base_cost += 200
                modifiers_breakdown["تسليم الملفات الخام"] = "+ 200 ر.س"

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # حساب الادخار المحتمل للطلبات الكبيرة
    savings = 0
    if base_cost > 5000:
        savings = base_cost * 0.1
        modifiers_breakdown["خصم الكميات الكبيرة"] = f"- {savings} ر.س (10%)"
        base_cost -= savings

    # مقارنة مع السوق
    industry_comparison = "متنافسة جداً"
    if base_cost > 10000:
        industry_comparison = "متنافسة"
    elif base_cost < 1000:
        industry_comparison = "اقتصادية جداً"

    recommended_price = base_cost * 1.15  # اقتراح 15% هامش ربح إضافي

    return {
        "base_cost": round(base_cost, 2),
        "modifiers_breakdown": modifiers_breakdown,
        "total_cost": round(base_cost, 2),
        "savings_if_bulk": round(savings, 2),
        "comparison_industry": industry_comparison,
        "recommended_price": round(recommended_price, 2),
        "service_type": req.service_type
    }


@router.post("/pricing/quote")
async def save_pricing_quote(body: dict, user: dict = Depends(get_current_user)):
    """احفظ اقتباس سعر للعميل."""
    try:
        quote = {
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "client_id": body.get("client_id"),
            "service_type": body.get("service_type"),
            "pricing": body.get("pricing"),
            "expires_at": body.get("expires_at"),  # تاريخ انتهاء الاقتباس
            "status": "pending",
            "created_at": datetime.now().isoformat(),
        }

        result = await db.pricing_quotes.insert_one(quote)

        return {
            "success": True,
            "quote_id": quote["id"],
            "message": "✅ تم حفظ الاقتباس"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pricing/quotes")
async def get_user_pricing_quotes(user: dict = Depends(get_current_user)):
    """احصل على الاقتباسات السابقة."""
    try:
        quotes = await db.pricing_quotes.find(
            {"user_id": user["user_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)

        return {"quotes": quotes or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
