"""
Google Tasks Integration — ربط ثنائي الاتجاه بين مهام AZVIO ومهام Google.
يعيد استخدام نفس نظام OAuth الموجود بـ google_calendar.py (نفس الحساب المربوط،
فقط نطاق صلاحية إضافي "tasks" تمت إضافته لقائمة SCOPES).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from auth import get_current_user
from database import db
from google_calendar import _get_valid_credentials

router = APIRouter()


class GTaskCreate(BaseModel):
    title: str
    notes: str = ""
    due: str = ""  # YYYY-MM-DD
    account_email: str
    tasklist_id: str = ""  # فاضي = القائمة المختارة افتراضياً


class GTaskUpdate(BaseModel):
    google_task_id: str
    title: Optional[str] = None
    notes: Optional[str] = None
    due: Optional[str] = None
    completed: Optional[bool] = None
    account_email: str
    tasklist_id: str = ""


def _tasks_service(access_token: str):
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    creds = Credentials(token=access_token)
    return build("tasks", "v1", credentials=creds, cache_discovery=False)


def _sync_list_tasklists(access_token: str) -> list:
    service = _tasks_service(access_token)
    result = service.tasklists().list().execute()
    return [{"id": t["id"], "title": t.get("title", t["id"])} for t in result.get("items", [])]


def _sync_list_tasks(access_token: str, tasklist_id: str) -> list:
    service = _tasks_service(access_token)
    result = service.tasks().list(tasklist=tasklist_id, showCompleted=True, showHidden=True).execute()
    return result.get("items", [])


def _sync_insert_task(access_token: str, tasklist_id: str, body: dict) -> dict:
    service = _tasks_service(access_token)
    return service.tasks().insert(tasklist=tasklist_id, body=body).execute()


def _sync_update_task(access_token: str, tasklist_id: str, task_id: str, body: dict) -> dict:
    service = _tasks_service(access_token)
    return service.tasks().patch(tasklist=tasklist_id, task=task_id, body=body).execute()


def _sync_delete_task(access_token: str, tasklist_id: str, task_id: str) -> None:
    service = _tasks_service(access_token)
    service.tasks().delete(tasklist=tasklist_id, task=task_id).execute()


async def _get_selected_tasklist_id(user_id: str, account_email: str) -> str:
    doc = await db.google_accounts.find_one({"user_id": user_id, "email": account_email}, {"_id": 0, "selected_tasklist_id": 1})
    tasklist_id = (doc or {}).get("selected_tasklist_id")
    return tasklist_id or "@default"


@router.get("/gtasks/lists", dependencies=[Depends(get_current_user)])
async def list_tasklists(account: str = Query(...), current_user=Depends(get_current_user)):
    """كل قوائم المهام بحساب Google — يختار المستخدم منها (نفس مبدأ اختيار التقويم)."""
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    try:
        lists = await run_in_threadpool(_sync_list_tasklists, access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل جلب قوائم المهام: {e}. تأكد إنك فعّلت Google Tasks API وأعدت تسجيل الدخول.")
    selected = await _get_selected_tasklist_id(current_user["user_id"], account)
    return {"lists": lists, "selected_tasklist_id": selected}


@router.post("/gtasks/select", dependencies=[Depends(get_current_user)])
async def select_tasklist(
    account: str = Query(...),
    tasklist_id: str = Query(...),
    current_user=Depends(get_current_user),
):
    result = await db.google_accounts.update_one(
        {"user_id": current_user["user_id"], "email": account},
        {"$set": {"selected_tasklist_id": tasklist_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الحساب غير موجود")
    return {"ok": True, "selected_tasklist_id": tasklist_id}


@router.get("/gtasks", dependencies=[Depends(get_current_user)])
async def list_gtasks(account: str = Query(...), current_user=Depends(get_current_user)):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    tasklist_id = await _get_selected_tasklist_id(current_user["user_id"], account)
    try:
        items = await run_in_threadpool(_sync_list_tasks, access_token, tasklist_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل جلب المهام: {e}")
    return {"tasks": items, "tasklist_id": tasklist_id}


@router.post("/gtasks", dependencies=[Depends(get_current_user)])
async def create_gtask(body: GTaskCreate, current_user=Depends(get_current_user)):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], body.account_email)
    tasklist_id = body.tasklist_id or await _get_selected_tasklist_id(current_user["user_id"], body.account_email)
    task_body: dict = {"title": body.title, "notes": body.notes}
    if body.due:
        task_body["due"] = f"{body.due}T00:00:00.000Z"
    try:
        created = await run_in_threadpool(_sync_insert_task, access_token, tasklist_id, task_body)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل إنشاء المهمة بقوقل: {e}")

    local_doc = {
        "id": created["id"],
        "google_task_id": created["id"],
        "google_tasklist_id": tasklist_id,
        "google_account": body.account_email,
        "title": body.title,
        "description": body.notes,
        "due_date": body.due,
        "status": "todo",
        "assignee_id": current_user["user_id"],
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "google_tasks",
    }
    await db.tasks.insert_one(dict(local_doc))
    return {"google_task_id": created["id"], "local_task_id": local_doc["id"]}


@router.put("/gtasks", dependencies=[Depends(get_current_user)])
async def update_gtask(body: GTaskUpdate, current_user=Depends(get_current_user)):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], body.account_email)
    tasklist_id = body.tasklist_id or await _get_selected_tasklist_id(current_user["user_id"], body.account_email)
    patch: dict = {}
    if body.title is not None:
        patch["title"] = body.title
    if body.notes is not None:
        patch["notes"] = body.notes
    if body.due is not None:
        patch["due"] = f"{body.due}T00:00:00.000Z" if body.due else None
    if body.completed is not None:
        patch["status"] = "completed" if body.completed else "needsAction"
    try:
        updated = await run_in_threadpool(_sync_update_task, access_token, tasklist_id, body.google_task_id, patch)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل تحديث المهمة بقوقل: {e}")

    local_patch = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None:
        local_patch["title"] = body.title
    if body.notes is not None:
        local_patch["description"] = body.notes
    if body.due is not None:
        local_patch["due_date"] = body.due
    if body.completed is not None:
        local_patch["status"] = "done" if body.completed else "todo"
    await db.tasks.update_one({"google_task_id": body.google_task_id}, {"$set": local_patch})
    return {"google_task_id": updated.get("id")}


@router.delete("/gtasks/{task_id}", dependencies=[Depends(get_current_user)])
async def delete_gtask(
    task_id: str,
    account: str = Query(...),
    tasklist_id: str = Query(""),
    current_user=Depends(get_current_user),
):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    real_tasklist_id = tasklist_id or await _get_selected_tasklist_id(current_user["user_id"], account)
    try:
        await run_in_threadpool(_sync_delete_task, access_token, real_tasklist_id, task_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل حذف المهمة من قوقل: {e}")
    await db.tasks.delete_one({"google_task_id": task_id})
    return {"ok": True}


@router.post("/gtasks/sync-from-google", dependencies=[Depends(get_current_user)])
async def sync_from_google(account: str = Query(...), current_user=Depends(get_current_user)):
    """يسحب كل المهام من Google Tasks ويحدّث/ينشئ نسخها المحلية — يُستخدم عند فتح شاشة اليوم
    أو بالسحب للتحديث، عشان أي تعديل أو حذف صار مباشرة بتطبيق Google Tasks ينعكس بالتطبيق."""
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    tasklist_id = await _get_selected_tasklist_id(current_user["user_id"], account)
    try:
        remote_tasks = await run_in_threadpool(_sync_list_tasks, access_token, tasklist_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل المزامنة: {e}")

    remote_ids = set()
    synced = 0
    for rt in remote_tasks:
        remote_ids.add(rt["id"])
        due = ""
        if rt.get("due"):
            due = rt["due"][:10]
        await db.tasks.update_one(
            {"google_task_id": rt["id"]},
            {
                "$set": {
                    "title": rt.get("title", ""),
                    "description": rt.get("notes", ""),
                    "due_date": due,
                    "status": "done" if rt.get("status") == "completed" else "todo",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                "$setOnInsert": {
                    "id": rt["id"],
                    "google_task_id": rt["id"],
                    "google_tasklist_id": tasklist_id,
                    "google_account": account,
                    "assignee_id": current_user["user_id"],
                    "created_by": current_user["user_id"],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "source": "google_tasks",
                },
            },
            upsert=True,
        )
        synced += 1

    await db.tasks.delete_many({
        "google_tasklist_id": tasklist_id,
        "google_task_id": {"$nin": list(remote_ids)},
    })

    return {"synced": synced}
