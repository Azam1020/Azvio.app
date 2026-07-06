"""
Daily Brief Module - ملخص يومي ذكي
يجمّع الأرقام المهمة والقرارات اليومية في رسالة واحدة سريعة
"""
from fastapi import APIRouter, Depends, HTTPException
from auth import get_current_user
from database import db
from datetime import datetime, timedelta
import random

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/insights/daily-brief")
async def get_daily_brief(user: dict = Depends(get_current_user)):
    """احصل على ملخص يومي شامل للعمل."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        this_month = datetime.now().strftime("%Y-%m")
        
        # 1. طلبات جديدة اليوم
        new_clients = await db.clients.count_documents({
            "created_by": user["user_id"],
            "created_at": {"$regex": f"^{today}"}
        })
        
        # 2. مشاريع مكتملة اليوم
        completed_projects = await db.clients.count_documents({
            "created_by": user["user_id"],
            "stage": "delivered",
            "updated_at": {"$regex": f"^{today}"}
        })
        
        # 3. فواتير معلقة (مستحقة)
        pending_invoices = await db.invoices.find(
            {"user_id": user["user_id"], "status": "pending"},
            {"_id": 0}
        ).to_list(100)
        total_pending = sum(inv.get("amount", 0) for inv in pending_invoices)
        pending_count = len(pending_invoices)
        
        # 4. مصاريف اليوم
        today_expenses = await db.transactions.find(
            {
                "created_by": user["user_id"],
                "type": "expense",
                "date": today
            },
            {"_id": 0}
        ).to_list(100)
        total_expenses = sum(exp.get("amount", 0) for exp in today_expenses)
        
        # 5. المشاريع الجاهزة للتسليم
        ready_to_deliver = await db.clients.count_documents({
            "created_by": user["user_id"],
            "stage": "review"
        })
        
        # 6. أداء هذا الشهر
        month_clients = await db.clients.count_documents({
            "created_by": user["user_id"],
            "created_at": {"$regex": f"^{this_month}"}
        })
        
        month_revenue = 0
        month_invoices = await db.invoices.find(
            {
                "user_id": user["user_id"],
                "created_at": {"$regex": f"^{this_month}"}
            },
            {"_id": 0}
        ).to_list(1000)
        month_revenue = sum(inv.get("amount", 0) for inv in month_invoices)
        
        # 7. تحليل الأداء
        performance = _analyze_performance(
            new_clients,
            completed_projects,
            month_clients,
            month_revenue,
            total_pending
        )
        
        # 8. القرار اليومي الواحد
        top_action = _get_top_action(
            new_clients,
            pending_count,
            ready_to_deliver,
            completed_projects
        )
        
        # تجميع الملخص
        brief = f"""
📊 ملخصك اليومي {today} 📊

🎯 **الأرقام المهمة:**
• طلبات جديدة: {new_clients} عميل
• مشاريع مكتملة اليوم: {completed_projects}
• فواتير معلقة: {pending_count} بمبلغ {total_pending:,.0f} ر.س
• مصاريف اليوم: {total_expenses:,.0f} ر.س

📈 **أداء الشهر:**
• عدد العملاء: {month_clients}
• الإيرادات: {month_revenue:,.0f} ر.س
• جاهزة للتسليم: {ready_to_deliver} مشاريع

🎬 **الأداء:** {performance}

⚡ **أهم شيء اليوم:**
{top_action}

تمنياتي لك بيوم منتج! 🚀
"""
        
        return {
            "brief": brief,
            "metrics": {
                "new_clients": new_clients,
                "completed_today": completed_projects,
                "pending_invoices": pending_count,
                "pending_amount": total_pending,
                "today_expenses": total_expenses,
                "ready_to_deliver": ready_to_deliver,
                "month_clients": month_clients,
                "month_revenue": month_revenue,
                "performance_level": performance
            },
            "top_action": top_action
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _analyze_performance(new_clients, completed, month_clients, revenue, pending) -> str:
    """تحليل الأداء وإعطاء تقييم."""
    
    if month_clients == 0:
        return "🚀 شهر جديد منتج، كل شيء متقدم!"
    
    conversion_rate = (completed / month_clients * 100) if month_clients > 0 else 0
    revenue_per_client = revenue / month_clients if month_clients > 0 else 0
    
    if conversion_rate >= 80 and revenue >= 50000:
        return "🔥 متقدم جداً! أداء استثنائي هذا الشهر"
    elif conversion_rate >= 60 and revenue >= 30000:
        return "💪 ممتاز! وتيرة سريعة والإيرادات عالية"
    elif new_clients >= 3:
        return "📈 نمو ثابت، الطلب كويس"
    elif pending > 20000:
        return "⚠️ فواتير معلقة كثيرة، ركز على التحصيل"
    else:
        return "😴 هادي، لكن فيه فرص متاحة"


def _get_top_action(new_clients, pending_count, ready_to_deliver, completed) -> str:
    """تحديد أهم إجراء للقيام به اليوم."""
    
    actions = []
    
    if pending_count > 5:
        actions.append(f"🎯 تحصيل {pending_count} فواتير معلقة - فرصة لتحسين التدفق النقدي")
    
    if ready_to_deliver > 2:
        actions.append(f"📦 تسليم {ready_to_deliver} مشاريع جاهزة - العملاء ينتظرون")
    
    if new_clients > 3:
        actions.append(f"📞 ردّ على {new_clients} طلبات جديدة - عزم جديد من السوق")
    
    if completed > 0:
        actions.append("✨ تصوير 'قبل وبعد' من الأعمال المكتملة لـ Instagram")
    
    if not actions:
        actions.append("🔍 استعرض العملاء غير النشطين - قد يكون هناك فرصة للمتابعة")
    
    return random.choice(actions)


@router.get("/insights/weekly-stats")
async def get_weekly_stats(user: dict = Depends(get_current_user)):
    """احصل على إحصائيات أسبوعية."""
    try:
        today = datetime.now()
        week_start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        
        # عملاء هذا الأسبوع
        week_clients = await db.clients.count_documents({
            "created_by": user["user_id"],
            "created_at": {"$gte": week_start}
        })
        
        # إيرادات الأسبوع
        week_invoices = await db.invoices.find(
            {
                "user_id": user["user_id"],
                "created_at": {"$gte": week_start}
            },
            {"_id": 0}
        ).to_list(1000)
        week_revenue = sum(inv.get("amount", 0) for inv in week_invoices)
        
        # أفضل يوم
        daily_stats = {}
        for inv in week_invoices:
            day = inv.get("created_at", "").split("T")[0]
            daily_stats[day] = daily_stats.get(day, 0) + inv.get("amount", 0)
        
        best_day = max(daily_stats.items(), key=lambda x: x[1]) if daily_stats else (None, 0)
        
        return {
            "week_start": week_start,
            "total_clients": week_clients,
            "total_revenue": week_revenue,
            "daily_breakdown": daily_stats,
            "best_day": {"date": best_day[0], "revenue": best_day[1]} if best_day[0] else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
