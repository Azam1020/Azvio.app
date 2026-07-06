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
from database import db

router = APIRouter(dependencies=[Depends(get_current_user)])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


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


@router.post("/tasks")
async def create_task(body: TaskCreate, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    # A regular member can only create tasks for themselves.
    if not _can_manage(user):
        doc["assignee_id"] = user["user_id"]
    doc.update({
        "id": new_id(),
        "created_by": user["user_id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
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
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}
