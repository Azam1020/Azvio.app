"""AZVIO team management — admin-only user CRUD.

Only an existing admin can create new accounts. This is what makes the
Google-login and password-login flows in auth.py safe without a hardcoded
email whitelist: a person can only sign in if an admin created their
record here first.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_admin, get_current_user, public_user
from database import db
from roles import is_valid_role, role_label, ROLES

router = APIRouter(prefix="/team", tags=["team"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "photographer"  # admin | photographer | editor | project_manager


class UserRoleUpdate(BaseModel):
    role: str


class UserEdit(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    password: str | None = None


@router.get("/roles", dependencies=[Depends(get_current_user)])
async def list_roles():
    return [{"key": k, "label": v} for k, v in ROLES.items()]


@router.get("", dependencies=[Depends(get_current_admin)])
async def list_users():
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@router.post("", dependencies=[Depends(get_current_admin)])
async def create_user(body: UserCreate):
    el = body.email.strip().lower()
    if await db.users.find_one({"email_lower": el}):
        raise HTTPException(status_code=400, detail="هذا البريد الإلكتروني مسجّل مسبقاً")
    if not is_valid_role(body.role):
        raise HTTPException(status_code=400, detail="صلاحية غير معروفة")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": body.email.strip(),
        "email_lower": el,
        "name": body.name.strip() or el,
        "picture": None,
        "role": body.role,
        "active": True,
        "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
        "created_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    return public_user(user)


@router.patch("/{user_id}", dependencies=[Depends(get_current_admin)])
async def edit_user(user_id: str, body: UserEdit):
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    updates: dict = {}
    if body.name is not None and body.name.strip():
        updates["name"] = body.name.strip()
    if body.email is not None and body.email.strip():
        el = body.email.strip().lower()
        existing = await db.users.find_one({"email_lower": el, "user_id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=400, detail="هذا البريد الإلكتروني مستخدم من حساب آخر")
        updates["email"] = body.email.strip()
        updates["email_lower"] = el
    if body.role is not None:
        if not is_valid_role(body.role):
            raise HTTPException(status_code=400, detail="صلاحية غير معروفة")
        updates["role"] = body.role
    if body.password is not None and body.password:
        if len(body.password) < 8:
            raise HTTPException(status_code=400, detail="كلمة المرور يجب أن تكون 8 أحرف على الأقل")
        updates["password_hash"] = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    if updates:
        await db.users.update_one({"user_id": user_id}, {"$set": updates})
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return updated


OWNER_EMAIL = "azzam@azvio.co"


@router.delete("/{user_id}", dependencies=[Depends(get_current_admin)])
async def delete_user(user_id: str, current_admin: dict = Depends(get_current_admin)):
    if user_id == current_admin["user_id"]:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الخاص")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if target and (target.get("email") or "").lower() == OWNER_EMAIL.lower():
        raise HTTPException(status_code=403, detail="لا يمكن حذف حساب مالك التطبيق")
    result = await db.users.delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True}


@router.patch("/{user_id}/role", dependencies=[Depends(get_current_admin)])
async def update_role(user_id: str, body: UserRoleUpdate):
    if not is_valid_role(body.role):
        raise HTTPException(status_code=400, detail="صلاحية غير معروفة")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    is_owner_account = (target.get("email") or "").lower() == OWNER_EMAIL.lower()
    if is_owner_account:
        raise HTTPException(status_code=403, detail="لا يمكن تغيير صلاحية مالك التطبيق")
    if body.role == "admin":
        # لا أحد غير مالك التطبيق يصير admin — أعلى صلاحية لغيره هي "project_manager"
        raise HTTPException(status_code=403, detail="صلاحية الإدارة الكاملة محجوزة لمالك التطبيق فقط")
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return {"ok": True}


@router.patch("/{user_id}/disable", dependencies=[Depends(get_current_admin)])
async def disable_user(user_id: str, current_admin: dict = Depends(get_current_admin)):
    if user_id == current_admin["user_id"]:
        raise HTTPException(status_code=400, detail="لا يمكنك تعطيل حسابك الخاص")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if target and (target.get("email") or "").lower() == OWNER_EMAIL.lower():
        raise HTTPException(status_code=403, detail="لا يمكن تعطيل حساب مالك التطبيق")
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"active": False}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return {"ok": True}


@router.patch("/{user_id}/enable", dependencies=[Depends(get_current_admin)])
async def enable_user(user_id: str):
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"active": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return {"ok": True}


@router.get("/permissions/mine", dependencies=[Depends(get_current_user)])
async def my_permissions(current_user: dict = Depends(get_current_user)):
    """الأقسام المسموح للمستخدم الحالي يشوفها بالتطبيق — الواجهة تخفي أي قسم مو موجود بالقائمة."""
    from roles import allowed_sections, role_label
    role = current_user.get("role", "photographer")
    return {
        "role": role,
        "role_label": role_label(role),
        "sections": sorted(allowed_sections(role)),
    }
