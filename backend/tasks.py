"""Task management + the personalised "Today" screen.

Tasks can be assigned to a team member and linked to a client/project.
Each member sees only their own tasks on the Today screen; admins and
project managers can see and assign everyone's tasks.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db, today_str
from llm_client import ask_text, LLMError

router = APIRouter(dependencies=[Depends(get_current_user)])


def now_iso():
    return datetime.now(timezone.utc).isoformat()




def new_id():
    return uuid.uuid4().hex


def _can_manage(user: dict) -> bool:
    return user.get("role") in ("admin", "project_manager")


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    assignee_id: str = ""          # user_id of the assigned member ("" = unassigned)
    client_id: str = ""            # optional linked project/client
    client_name: str = ""
    due_date: str = ""             # YYYY-MM-DD
    priority: str = "normal"       # low | normal | high | urgent
    status: str = "todo"           # todo | in_progress | done


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


@router.get("/tasks")
async def list_tasks(status: str = "", assignee_id: str = "", user: dict = Depends(get_current_user)):
    q: dict = {}
    if status:
        q["status"] = status
    # Non-managers can only see their own tasks.
    if _can_manage(user):
        if assignee_id:
            q["assignee_id"] = assignee_id
    else:
        q["assignee_id"] = user["user_id"]
    return await db.tasks.find(q, {"_id": 0}).sort([("due_date", 1), ("created_at", -1)]).to_list(1000)


@router.get("/tasks/my-today")
async def my_today(user: dict = Depends(get_current_user)):
    """Tasks for the current user that are due today or overdue and not done."""
    today = today_str()
    tasks = await db.tasks.find(
        {
            "assignee_id": user["user_id"],
            "status": {"$ne": "done"},
        },
        {"_id": 0},
    ).sort([("due_date", 1)]).to_list(500)
    overdue = [t for t in tasks if t.get("due_date") and t["due_date"] < today]
    due_today = [t for t in tasks if t.get("due_date") == today]
    upcoming = [t for t in tasks if not t.get("due_date") or t["due_date"] > today]
    return {"overdue": overdue, "today": due_today, "upcoming": upcoming}


async def _try_sync_task_to_google(user_id: str, task_doc: dict) -> dict:
    """لو المستخدم عنده حساب Google مربوط وقائمة مهام مختارة، ننشئ نفس المهمة هناك
    ونرجّع معلومات الربط (google_task_id...) عشان نحفظها بالمهمة المحلية.
    لو ما فيه حساب مربوط أو صار خطأ، نرجّع {} بهدوء — إنشاء المهمة محلياً ما يفشل أبداً بسبب Google."""
    try:
        account = await db.google_accounts.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
        if not account:
            return {}
        from google_calendar import _get_valid_credentials
        from google_tasks import _get_selected_tasklist_ids, _sync_insert_task
        from fastapi.concurrency import run_in_threadpool

        access_token, _ = await _get_valid_credentials(user_id, account["email"])
        tasklist_ids = await _get_selected_tasklist_ids(user_id, account["email"])
        tasklist_id = tasklist_ids[0]  # مهام مُنشأة من التطبيق تروح لأول قائمة مختارة افتراضياً
        body = {"title": task_doc.get("title", ""), "notes": task_doc.get("description", "")}
        if task_doc.get("due_date"):
            body["due"] = f"{task_doc['due_date']}T00:00:00.000Z"
        created = await run_in_threadpool(_sync_insert_task, access_token, tasklist_id, body)
        return {
            "google_task_id": created["id"],
            "google_tasklist_id": tasklist_id,
            "google_account": account["email"],
        }
    except Exception:
        return {}


async def _try_update_task_on_google(user_id: str, task: dict, updates: dict) -> None:
    """لو المهمة مرتبطة بمهمة Google (عندها google_task_id)، نعكس التعديل هناك أيضاً."""
    if not task.get("google_task_id"):
        return
    try:
        from google_calendar import _get_valid_credentials
        from google_tasks import _sync_update_task
        from fastapi.concurrency import run_in_threadpool

        access_token, _ = await _get_valid_credentials(user_id, task["google_account"])
        patch = {}
        if "title" in updates:
            patch["title"] = updates["title"]
        if "description" in updates:
            patch["notes"] = updates["description"]
        if "due_date" in updates:
            patch["due"] = f"{updates['due_date']}T00:00:00.000Z" if updates["due_date"] else None
        if "status" in updates:
            patch["status"] = "completed" if updates["status"] == "done" else "needsAction"
        if patch:
            await run_in_threadpool(_sync_update_task, access_token, task["google_tasklist_id"], task["google_task_id"], patch)
    except Exception:
        pass  # المهمة المحلية اتعدلت بنجاح؛ فشل مزامنة قوقل ما يوقف العملية


async def _try_delete_task_on_google(user_id: str, task: dict) -> None:
    if not task.get("google_task_id"):
        return
    try:
        from google_calendar import _get_valid_credentials
        from google_tasks import _sync_delete_task
        from fastapi.concurrency import run_in_threadpool

        access_token, _ = await _get_valid_credentials(user_id, task["google_account"])
        await run_in_threadpool(_sync_delete_task, access_token, task["google_tasklist_id"], task["google_task_id"])
    except Exception:
        pass


@router.post("/tasks")
async def create_task(body: TaskCreate, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    # A regular member can only create tasks for themselves.
    if not _can_manage(user):
        doc["assignee_id"] = user["user_id"]
    elif not doc.get("assignee_id"):
        # مدير/مدير مشروع أنشأ مهمة بدون تحديد شخص → تنسند له تلقائياً
        # (بدل ما تبقى "غير مسندة" وتختفي من شاشة "اليوم" الخاصة به)
        doc["assignee_id"] = user["user_id"]
    doc.update({
        "id": new_id(),
        "created_by": user["user_id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    # مزامنة تلقائية مع Google Tasks — أي مهمة تضيفها من أي زر بالتطبيق تنعكس بقوقل
    google_link = await _try_sync_task_to_google(user["user_id"], doc)
    doc.update(google_link)
    await db.tasks.insert_one(dict(doc))
    return doc


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    # A regular member may only touch their own task, and may not reassign it.
    if not _can_manage(user):
        if task.get("assignee_id") != user["user_id"]:
            raise HTTPException(status_code=403, detail="لا تملك صلاحية تعديل هذه المهمة")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not _can_manage(user):
        updates.pop("assignee_id", None)
    updates["updated_at"] = now_iso()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    # مزامنة التعديل مع Google Tasks لو المهمة مرتبطة (سواء عدّلتها بالتطبيق أو أضفتها أصلاً من قوقل)
    await _try_update_task_on_google(user["user_id"], task, updates)
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@router.patch("/tasks/{task_id}/reassign")
async def reassign_task(task_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Drag-and-drop reassignment. Managers only."""
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="فقط المدير أو مدير المشروع يمكنه إعادة توزيع المهام")
    assignee_id = body.get("assignee_id", "")
    r = await db.tasks.update_one(
        {"id": task_id}, {"$set": {"assignee_id": assignee_id, "updated_at": now_iso()}}
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    return {"ok": True}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="المهمة غير موجودة")
    if not _can_manage(user) and task.get("created_by") != user["user_id"]:
        raise HTTPException(status_code=403, detail="لا تملك صلاحية حذف هذه المهمة")
    await _try_delete_task_on_google(user["user_id"], task)
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


# ============ الدفعة الأولى: شاشة اليوم + التوزيع الآلي ============

@router.get("/tasks/today/sanad-plan")
async def get_sanad_today_plan(user: dict = Depends(get_current_user)):
    """خطة سند الفعلية لليوم — تحليل حقيقي بالذكاء الصناعي (مو رسالة تحفيزية
    جاهزة) يقرأ المهام والمواعيد ويقترح أولوية وترتيب عمل. تُخزَّن يوميًا لكل
    مستخدم عشان ما نستدعي النموذج كل مرة يفتح الشاشة (طلب: قسم اليوم يكون
    احترافي ومع سند فعليًا)."""
    today = today_str()
    cached = await db.sanad_daily_plans.find_one({"user_id": user["user_id"], "date": today}, {"_id": 0})
    if cached:
        return cached

    all_tasks = await db.tasks.find({"assignee_id": user["user_id"], "status": {"$ne": "done"}}, {"_id": 0}).to_list(200)
    overdue = [t for t in all_tasks if t.get("due_date") and t["due_date"] < today]
    due_today = [t for t in all_tasks if t.get("due_date") == today]
    events_today = await db.events.find({"date": today}, {"_id": 0, "title": 1, "time": 1}).sort("time", 1).to_list(20)

    if not overdue and not due_today and not events_today:
        result = {"date": today, "plan": "ما عليك شي مستحق اليوم ولا مواعيد — يوم مناسب تشتغل فيه على شي مؤجل أو تاخذ راحة.", "has_content": False}
        await db.sanad_daily_plans.update_one({"user_id": user["user_id"], "date": today}, {"$set": result}, upsert=True)
        return result

    lines = []
    if overdue:
        lines.append("مهام متأخرة: " + "، ".join(t["title"] for t in overdue[:8]))
    if due_today:
        lines.append("مهام اليوم: " + "، ".join(t["title"] for t in due_today[:8]))
    if events_today:
        lines.append("مواعيد اليوم: " + "، ".join(f"{e.get('title')} ({e.get('time') or '؟'})" for e in events_today))

    try:
        plan = await ask_text(
            system=(
                "أنت سند، مساعد صاحب استوديو تصوير جوي ومونتاج (AZVIO) بالسعودية. "
                "تكتب بالعربي السعودي المباشر، جملتين لثلاث بالكثير. لا تكرر قائمة المهام "
                "حرفيًا، بس رتّب الأولوية واذكر أهم شي يبدأ فيه وليش، بأسلوب مباشر وعملي "
                "بدون مجاملات أو حشو."
            ),
            user="هذي مهام ومواعيد اليوم:\n" + "\n".join(lines) + "\n\nوش أولوية اليوم؟",
            task="chat",
            temperature=0.5,
        )
    except LLMError:
        plan = "عندك " + str(len(overdue) + len(due_today)) + " مهمة اليوم — ابدأ بالمتأخرة أول."

    result = {"date": today, "plan": plan.strip()[:500], "has_content": True}
    await db.sanad_daily_plans.update_one({"user_id": user["user_id"], "date": today}, {"$set": result}, upsert=True)
    return result


@router.post("/tasks/today/sanad-plan/refresh")
async def refresh_sanad_today_plan(user: dict = Depends(get_current_user)):
    """يمسح خطة اليوم المخزّنة عشان يولّد وحدة جديدة (لو المستخدم غيّر مهامه)."""
    await db.sanad_daily_plans.delete_one({"user_id": user["user_id"], "date": today_str()})
    return await get_sanad_today_plan(user)


@router.get("/tasks/today/enhanced")
async def get_enhanced_today(user: dict = Depends(get_current_user)):
    """شاشة اليوم المحسّنة مع إحصائيات وتحفيز."""
    today = today_str()
    
    # احصل على جميع مهام المستخدم غير المكتملة + المكتملة اليوم فقط
    all_tasks = await db.tasks.find({"assignee_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    
    overdue = [t for t in all_tasks if t.get("due_date") and t["due_date"] < today and t["status"] != "done"]
    due_today = [t for t in all_tasks if t.get("due_date") == today and t["status"] != "done"]
    upcoming = [t for t in all_tasks if t["status"] != "done" and (not t.get("due_date") or t["due_date"] > today)]
    completed_today = [t for t in all_tasks if t.get("due_date") == today and t["status"] == "done"]
    
    # احسب الإحصائيات
    total_pending = len(overdue) + len(due_today)
    total_completed = len(completed_today)
    
    # احصل على رسالة تحفيزية
    motivation = _get_daily_motivation(total_completed, total_pending)
    
    return {
        "date": today,
        "sections": {
            "overdue": overdue,
            "today": due_today,
            "upcoming": upcoming,
            "completed": completed_today
        },
        "stats": {
            "completed": total_completed,
            "pending": total_pending,
            "completion_rate": (total_completed / (total_completed + total_pending) * 100) if (total_completed + total_pending) > 0 else 0
        },
        "motivation": motivation
    }


@router.post("/tasks/auto-assign-project")
async def auto_assign_project_tasks(project_id: str, user: dict = Depends(get_current_user)):
    """توزيع آلي للمهام على فريق المشروع حسب التخصص والعبء الحالي."""
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="فقط المدير يمكنه توزيع المهام تلقائياً")
    
    try:
        # احصل على المهام غير الموزعة
        unassigned = await db.tasks.find(
            {"client_id": project_id, "assignee_id": ""},
            {"_id": 0}
        ).to_list(100)
        
        if not unassigned:
            return {"success": True, "assigned_count": 0, "message": "لا توجد مهام غير موزعة"}
        
        # احصل على فريقك النشط
        team = await db.team.find(
            {"created_by": user["user_id"], "status": "active"},
            {"_id": 0}
        ).to_list(50)
        
        assigned_count = 0
        for task in unassigned:
            # ابحث عن عضو فريق مناسب
            suitable_member = await _find_best_team_member(task, team, user["user_id"])
            
            if suitable_member:
                await db.tasks.update_one(
                    {"id": task["id"]},
                    {"$set": {
                        "assignee_id": suitable_member["id"],
                        "updated_at": now_iso()
                    }}
                )
                assigned_count += 1
        
        return {
            "success": True,
            "assigned_count": assigned_count,
            "message": f"✅ تم توزيع {assigned_count} مهمة على فريقك"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ: {str(e)}")


async def _find_best_team_member(task: dict, team: list, user_id: str):
    """اختر أفضل عضو فريق حسب الدور والعبء الحالي."""
    task_type = task.get("type", "general")
    
    # تطابق أنواع المهام مع الأدوار
    role_mapping = {
        "photography": "photographer",
        "shooting": "photographer",
        "editing": "editor",
        "montage": "editor",
        "review": "project_manager",
        "delivery": "project_manager",
        "general": "photographer"
    }
    
    required_role = role_mapping.get(task_type, "photographer")
    
    # ابحث عن أعضاء بالدور المناسب
    suitable = [m for m in team if m.get("role") == required_role]
    
    if not suitable:
        # إذا لم يوجد الدور، خذ أي عضو نشط
        suitable = [m for m in team if m.get("status") == "active"]
    
    if not suitable:
        return None
    
    # اختر من بينهم الأقل انشغالاً (بناءً على عدد المهام الحالية)
    for member in suitable:
        member_tasks = await db.tasks.count_documents({
            "assignee_id": member["id"],
            "status": {"$ne": "done"}
        })
        member["current_tasks"] = member_tasks
    
    best = min(suitable, key=lambda m: m.get("current_tasks", 0))
    return best


def _get_daily_motivation(completed: int, pending: int) -> str:
    """توليد رسالة تحفيزية ذكية من سند."""
    current_hour = datetime.now().hour
    
    messages = {
        "start": [
            "☀️ صباح الخير! يلا نبدأ اليوم بقوة وطاقة 💪",
            "🌟 صحيت برا؟ فيك مهام متناظرة اليوم ✨"
        ],
        "morning": [
            "🚀 الصبح أيام وأنت تشتغل تمام! ادِ الوتر 🎯",
            "🔥 شغلك رائع، استمر بنفس الإيقاع!"
        ],
        "progress": [
            "💯 عالية عالية! أنت تتقدم بشكل ممتاز 🌟",
            "🎯 استمر، أنت في المسار الصحيح تماماً!"
        ],
        "almost_done": [
            "🏁 قريب القريب! خلاص شوية ونتخلصنا! 💨",
            "⚡ وكاد! روح الآخر وخلصنا 🎉"
        ],
        "done": [
            "🏆 الف الف مبروك! انتهيت من كل شي اليوم! 👑",
            "🎊 عاشت الإنجازات! انت النجم اليوم! ⭐"
        ]
    }
    
    # اختر الفئة بناءً على الإحصائيات
    if pending == 0 and completed > 0:
        category = "done"
    elif completed == 0:
        category = "start" if current_hour < 10 else "morning"
    else:
        completion_rate = completed / (completed + pending) if (completed + pending) > 0 else 0
        if completion_rate < 0.3:
            category = "progress"
        elif completion_rate < 0.8:
            category = "almost_done"
        else:
            category = "done"
    
    # اختر رسالة عشوائية من الفئة
    import random
    return random.choice(messages.get(category, messages["progress"]))
