import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter()

JWT_SECRET = os.environ.get("JWT_SECRET", "azvio-dev-secret")
JWT_ALGO = "HS256"
WHITELIST = {"info@azvio.co", "azzam@azvio.co"}
DEFAULT_PASSWORD = "Azvio@2026"
SESSION_API = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def now_utc():
    return datetime.now(timezone.utc)


def public_user(user: dict) -> dict:
    return {k: user.get(k) for k in ("user_id", "email", "name", "picture", "role")}


async def seed_admins():
    seeds = [("Info@azvio.co", "إدارة AZVIO"), ("Azzam@azvio.co", "عزّام")]
    for email, name in seeds:
        el = email.lower()
        existing = await db.users.find_one({"email_lower": el})
        pw_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
        if not existing:
            await db.users.insert_one({
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email,
                "email_lower": el,
                "name": name,
                "picture": None,
                "role": "admin",
                "password_hash": pw_hash,
                "created_at": now_utc().isoformat(),
            })
        elif not existing.get("password_hash"):
            await db.users.update_one({"email_lower": el}, {"$set": {"password_hash": pw_hash}})


class LoginRequest(BaseModel):
    email: str
    password: str


class SessionRequest(BaseModel):
    session_id: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


def make_jwt(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(authorization: str = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="يجب تسجيل الدخول")
    token = authorization.split(" ", 1)[1].strip()
    # 1) Try JWT
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"user_id": payload.get("sub")}, {"_id": 0})
        if user:
            return user
    except Exception:
        pass
    # 2) Try Google session token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at and expires_at > now_utc():
            user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
            if user:
                return user
    raise HTTPException(status_code=401, detail="انتهت الجلسة، يرجى تسجيل الدخول مجدداً")


@router.post("/auth/login")
async def login(body: LoginRequest):
    el = body.email.strip().lower()
    if el not in WHITELIST:
        raise HTTPException(status_code=401, detail="هذا الحساب غير مصرح له بالدخول إلى AZVIO")
    user = await db.users.find_one({"email_lower": el}, {"_id": 0})
    if not user or not user.get("password_hash") or not bcrypt.checkpw(
        body.password.encode(), user["password_hash"].encode()
    ):
        raise HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة")
    return {"token": make_jwt(user["user_id"]), "user": public_user(user)}


@router.post("/auth/session")
async def google_session(body: SessionRequest):
    async with httpx.AsyncClient(timeout=20) as hc:
        r = await hc.get(SESSION_API, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="فشل التحقق من جلسة Google")
    data = r.json()
    el = (data.get("email") or "").strip().lower()
    if el not in WHITELIST:
        raise HTTPException(status_code=403, detail="هذا الحساب غير مصرح له بالدخول إلى AZVIO")
    user = await db.users.find_one({"email_lower": el}, {"_id": 0})
    if user:
        if data.get("picture"):
            await db.users.update_one({"email_lower": el}, {"$set": {"picture": data["picture"]}})
            user["picture"] = data["picture"]
    else:
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": data.get("email"),
            "email_lower": el,
            "name": data.get("name") or el,
            "picture": data.get("picture"),
            "role": "admin",
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(dict(user))
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    return {"token": session_token, "user": public_user(user)}


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/auth/logout")
async def logout(authorization: str = Header(default=None), user: dict = Depends(get_current_user)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@router.post("/auth/change-password")
async def change_password(body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    full_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not full_user.get("password_hash") or not bcrypt.checkpw(
        body.old_password.encode(), full_user["password_hash"].encode()
    ):
        raise HTTPException(status_code=401, detail="كلمة المرور الحالية غير صحيحة")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": new_hash}})
    return {"ok": True, "message": "تم تغيير كلمة المرور بنجاح"}
