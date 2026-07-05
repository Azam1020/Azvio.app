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

router = APIRouter(prefix="/team", tags=["team"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "member"  # member | admin


class UserRoleUpdate(BaseModel):
    role: str


@router.get("", dependencies=[Depends(get_current_admin)])
async def list_users():
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users


@router.post("", dependencies=[Depends(get_current_admin)])
async def create_user(body: UserCreate):
    el = body.email.strip().lower()
    if await db.users.find_one({"email_lower": el}):
        raise HTTPException(status_code=400, detail="هذا البريد الإلكتروني مسجّل مسبقاً")
    if body.role not in ("member", "admin"):
        raise HTTPException(status_code=400, detail="الصلاحية يجب أن تكون member أو admin")
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


@router.patch("/{user_id}/role", dependencies=[Depends(get_current_admin)])
async def update_role(user_id: str, body: UserRoleUpdate):
    if body.role not in ("member", "admin"):
        raise HTTPException(status_code=400, detail="الصلاحية يجب أن تكون member أو admin")
    result = await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    return {"ok": True}


@router.patch("/{user_id}/disable", dependencies=[Depends(get_current_admin)])
async def disable_user(user_id: str, current_admin: dict = Depends(get_current_admin)):
    if user_id == current_admin["user_id"]:
        raise HTTPException(status_code=400, detail="لا يمكنك تعطيل حسابك الخاص")
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
