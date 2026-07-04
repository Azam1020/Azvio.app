import os
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from database import db

load_dotenv()

router = APIRouter()
# Public router: Google redirects the browser here directly, with no
# Authorization header, so this must NOT go through get_current_user.
public_router = APIRouter()

JWT_SECRET = os.environ.get("JWT_SECRET", "azvio-dev-secret")
JWT_ALGO = "HS256"
WHITELIST = {"info@azvio.co", "azzam@azvio.co"}
DEFAULT_PASSWORD = "Azvio@2026"

# --- Direct Google OAuth (login) — no third-party proxy ---
# Uses AZVIO's own Google Cloud OAuth client (same project as the
# Calendar integration is fine, or a dedicated one). Configure these in
# the backend .env — see google_calendar.py for the calendar-linking
# equivalent, which is a separate, already-independent flow.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_LOGIN_REDIRECT_URI = os.environ.get("GOOGLE_LOGIN_REDIRECT_URI", "")
APP_LOGIN_REDIRECT_URI = os.environ.get("APP_LOGIN_REDIRECT_URI", "")

GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"


def google_login_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_LOGIN_REDIRECT_URI)


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


@router.get("/auth/google/login-url")
async def google_login_url():
    """Build Google's own consent-screen URL — no third-party auth proxy."""
    if not google_login_configured():
        raise HTTPException(status_code=500, detail="Google Login غير مُهيّأ على السيرفر")
    state_payload = {
        "purpose": "login",
        "nonce": uuid.uuid4().hex,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    state_token = jwt.encode(state_payload, JWT_SECRET, algorithm=JWT_ALGO)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_LOGIN_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "include_granted_scopes": "true",
        "prompt": "select_account",
        "state": state_token,
    }
    return {"auth_url": f"{GOOGLE_AUTH_URI}?{urlencode(params)}"}


@public_router.get("/auth/google/callback")
async def google_login_callback(request: Request):
    """Google redirects the browser here after consent. Public endpoint —
    no Authorization header is sent by Google, so no get_current_user."""
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason={error}")
    if not code or not state:
        return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason=missing_code")
    try:
        jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason=invalid_state")

    async with httpx.AsyncClient(timeout=30) as hc:
        try:
            r = await hc.post(GOOGLE_TOKEN_URI, data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_LOGIN_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
            token_data = r.json()
        except Exception:
            return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason=token_exchange_failed")
        if "access_token" not in token_data:
            return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason=no_token")
        try:
            ur = await hc.get(GOOGLE_USERINFO_URI, headers={"Authorization": f"Bearer {token_data['access_token']}"})
            userinfo = ur.json()
        except Exception:
            return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason=userinfo_failed")

    email = userinfo.get("email")
    el = (email or "").strip().lower()
    if el not in WHITELIST:
        return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=error&reason=not_whitelisted")

    user = await db.users.find_one({"email_lower": el}, {"_id": 0})
    if user:
        if userinfo.get("picture"):
            await db.users.update_one({"email_lower": el}, {"$set": {"picture": userinfo["picture"]}})
            user["picture"] = userinfo["picture"]
    else:
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "email_lower": el,
            "name": userinfo.get("name") or el,
            "picture": userinfo.get("picture"),
            "role": "admin",
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(dict(user))

    # We mint our own opaque session token — never Google's or a proxy's.
    session_token = uuid.uuid4().hex
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    return RedirectResponse(url=f"{APP_LOGIN_REDIRECT_URI}?status=connected&token={session_token}")


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
