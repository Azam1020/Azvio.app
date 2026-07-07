"""AZVIO Google Calendar integration.
OAuth 2.0 authorization code flow (with refresh token) + Calendar API operations.
Supports multiple linked Google accounts per authenticated app user.
"""
from __future__ import annotations
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
import jwt as pyjwt

from auth import get_current_user, JWT_SECRET, JWT_ALGO
from database import db

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")
APP_OAUTH_REDIRECT_URI = os.getenv("APP_OAUTH_REDIRECT_URI", "")

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI)


router = APIRouter(prefix="/google", tags=["google"])
# The callback endpoint is public (no JWT header from Google). We build a separate router for it.
public_router = APIRouter(prefix="/google", tags=["google-public"])


# ============ Auth URL ============

@router.get("/auth-url", dependencies=[Depends(get_current_user)])
async def google_auth_url(current_user=Depends(get_current_user)):
    """Return an OAuth 2.0 authorization URL for the current app user."""
    if not is_configured():
        raise HTTPException(status_code=500, detail="Google OAuth غير مُهيّأ")
    # Encode current user_id in the state parameter using a short-lived JWT
    state_payload = {
        "user_id": current_user["user_id"],
        "email": current_user.get("email", ""),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    state_token = pyjwt.encode(state_payload, JWT_SECRET, algorithm=JWT_ALGO)
    from urllib.parse import urlencode
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state_token,
    }
    return {"auth_url": f"{AUTH_URI}?{urlencode(params)}"}


# ============ Callback (public — no JWT header) ============

@public_router.get("/callback")
async def google_callback(request: Request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason={error}")
    if not code or not state:
        return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason=missing_code")

    # Decode state to identify app user
    try:
        payload = pyjwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGO])
        azvio_user_id = payload.get("user_id")
        if not azvio_user_id:
            raise ValueError("no user_id in state")
    except Exception:
        return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason=invalid_state")

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(TOKEN_URI, data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
            token_data = r.json()
        except Exception:
            return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason=token_exchange_failed")

        if "access_token" not in token_data:
            return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason=no_token")

        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")
        expires_in = int(token_data.get("expires_in", 3600))
        scope = token_data.get("scope", "")

        # Get user email
        try:
            ur = await client.get(USERINFO_URI, headers={"Authorization": f"Bearer {access_token}"})
            userinfo = ur.json()
        except Exception:
            return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason=userinfo_failed")

    email = userinfo.get("email")
    if not email:
        return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=error&reason=no_email")

    now = datetime.now(timezone.utc)
    expiry = now + timedelta(seconds=expires_in)

    # If no refresh_token returned (happens if user reconnects same account), reuse existing one
    if not refresh_token:
        existing = await db.google_accounts.find_one({"user_id": azvio_user_id, "email": email})
        if existing and existing.get("refresh_token"):
            refresh_token = existing["refresh_token"]

    doc = {
        "user_id": azvio_user_id,
        "email": email,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expiry": expiry.isoformat(),
        "scope": scope,
        "updated_at": now.isoformat(),
    }
    await db.google_accounts.update_one(
        {"user_id": azvio_user_id, "email": email},
        {
            "$set": doc,
            "$setOnInsert": {"id": uuid.uuid4().hex, "linked_at": now.isoformat()},
        },
        upsert=True,
    )

    return RedirectResponse(url=f"{APP_OAUTH_REDIRECT_URI}?status=connected&email={email}")


# ============ Manage accounts ============

@router.get("/accounts", dependencies=[Depends(get_current_user)])
async def list_google_accounts(current_user=Depends(get_current_user)):
    rows = await db.google_accounts.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "email": 1, "linked_at": 1, "updated_at": 1},
    ).to_list(20)
    return {"accounts": rows}


@router.delete("/accounts/{email}", dependencies=[Depends(get_current_user)])
async def disconnect_google_account(email: str, current_user=Depends(get_current_user)):
    r = await db.google_accounts.delete_one({"user_id": current_user["user_id"], "email": email})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الحساب غير مربوط")
    return {"ok": True, "email": email}


# ============ Token refresh helper ============

async def _get_valid_credentials(user_id: str, email: str) -> tuple[str, dict]:
    """Returns (access_token, account_doc). Refreshes token if expired."""
    doc = await db.google_accounts.find_one({"user_id": user_id, "email": email})
    if not doc:
        raise HTTPException(status_code=404, detail="حساب Google غير مربوط")
    expiry_str = doc.get("expiry")
    try:
        expiry = datetime.fromisoformat(expiry_str) if expiry_str else datetime.now(timezone.utc)
    except Exception:
        expiry = datetime.now(timezone.utc)
    now = datetime.now(timezone.utc)
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry - timedelta(minutes=2) > now:
        return doc["access_token"], doc

    # Refresh
    refresh_token = doc.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="لا يوجد refresh_token — أعد ربط الحساب")

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(TOKEN_URI, data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        })
    data = r.json()
    if "access_token" not in data:
        raise HTTPException(status_code=401, detail="فشل تحديث الرمز — أعد ربط الحساب")
    new_access = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    new_expiry = now + timedelta(seconds=expires_in)
    await db.google_accounts.update_one(
        {"user_id": user_id, "email": email},
        {"$set": {"access_token": new_access, "expiry": new_expiry.isoformat(), "updated_at": now.isoformat()}},
    )
    doc["access_token"] = new_access
    doc["expiry"] = new_expiry.isoformat()
    return new_access, doc


# ============ Calendar operations ============

class EventCreate(BaseModel):
    account_email: str
    summary: str
    description: str = ""
    start: str  # ISO datetime or YYYY-MM-DD
    end: str
    all_day: bool = False
    timezone: str = "Asia/Riyadh"
    calendar_id: str = ""  # فاضي = أول تقويم مختار افتراضياً؛ حدده صراحة لو عندك أكثر من تقويم مختار


class EventUpdate(BaseModel):
    account_email: str
    google_event_id: str
    summary: Optional[str] = None
    description: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    all_day: Optional[bool] = None
    timezone: Optional[str] = None
    calendar_id: str = ""  # التقويم اللي فيه الحدث أصلاً (مهم لو مختار أكثر من تقويم)


def _build_event_body(summary: str, description: str, start: str, end: str, all_day: bool, tz: str) -> dict:
    if all_day:
        return {
            "summary": summary,
            "description": description,
            "start": {"date": start[:10]},
            "end": {"date": end[:10]},
        }
    return {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start, "timeZone": tz},
        "end": {"dateTime": end, "timeZone": tz},
    }


def _sync_calendar_insert(access_token: str, body: dict, calendar_id: str = "primary") -> dict:
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return service.events().insert(calendarId=calendar_id, body=body).execute()


def _sync_calendar_list(access_token: str, days_ahead: int, calendar_id: str = "primary") -> list:
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days_ahead)
    result = service.events().list(
        calendarId=calendar_id,
        timeMin=now.isoformat(),
        timeMax=end.isoformat(),
        maxResults=50,
        singleEvents=True,
        orderBy="startTime",
    ).execute()
    return result.get("items", [])


def _sync_calendar_update(access_token: str, event_id: str, patch: dict, calendar_id: str = "primary") -> dict:
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return service.events().patch(calendarId=calendar_id, eventId=event_id, body=patch).execute()


def _sync_calendar_delete(access_token: str, event_id: str, calendar_id: str = "primary") -> None:
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    service.events().delete(calendarId=calendar_id, eventId=event_id).execute()


def _sync_calendar_list_calendars(access_token: str) -> list:
    """كل التقاويم المتاحة بحساب المستخدم — يستخدمها المستخدم لاختيار أي تقويم يشتغل عليه التطبيق."""
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    creds = Credentials(token=access_token)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    result = service.calendarList().list().execute()
    return [
        {
            "id": c["id"],
            "summary": c.get("summary", c["id"]),
            "primary": c.get("primary", False),
            "access_role": c.get("accessRole", ""),
        }
        for c in result.get("items", [])
    ]


async def _get_selected_calendar_ids(user_id: str, account_email: str = "") -> list:
    """قائمة التقاويم المختارة من المستخدم — يدعم أكثر من تقويم بنفس الوقت.
    يرجع ['primary'] إذا ما اختار المستخدم شي بعد (توافق مع الحسابات القديمة)."""
    doc = await db.google_accounts.find_one(
        {"user_id": user_id} | ({"email": account_email} if account_email else {}),
        {"_id": 0, "selected_calendar_ids": 1, "selected_calendar_id": 1},
    )
    doc = doc or {}
    ids = doc.get("selected_calendar_ids")
    if ids:
        return ids
    # توافق مع النظام القديم (اختيار وحد قبل هذا التحديث)
    old_single = doc.get("selected_calendar_id")
    return [old_single] if old_single else ["primary"]


@router.post("/calendar/events", dependencies=[Depends(get_current_user)])
async def create_calendar_event(body: EventCreate, current_user=Depends(get_current_user)):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], body.account_email)
    calendar_ids = await _get_selected_calendar_ids(current_user["user_id"], body.account_email)
    target_calendar = body.calendar_id or calendar_ids[0]  # افتراضياً أول تقويم مختار، أو تقويم محدد صراحة
    ev_body = _build_event_body(body.summary, body.description, body.start, body.end, body.all_day, body.timezone)
    try:
        event = await run_in_threadpool(_sync_calendar_insert, access_token, ev_body, target_calendar)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل إنشاء الحدث: {e}")
    return {
        "google_event_id": event.get("id"),
        "html_link": event.get("htmlLink"),
        "account": body.account_email,
        "calendar_id": target_calendar,
    }


@router.get("/calendar/events", dependencies=[Depends(get_current_user)])
async def list_calendar_events(
    account: str = Query(...),
    days_ahead: int = Query(30, ge=1, le=365),
    current_user=Depends(get_current_user),
):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    calendar_ids = await _get_selected_calendar_ids(current_user["user_id"], account)
    all_items = []
    errors = []
    # نجمع الأحداث من كل التقاويم المختارة مع بعض بقائمة واحدة، كل حدث نحط فيه أي تقويم طلع منه
    for cal_id in calendar_ids:
        try:
            items = await run_in_threadpool(_sync_calendar_list, access_token, days_ahead, cal_id)
            for it in items:
                it["_azvio_calendar_id"] = cal_id
            all_items.extend(items)
        except Exception as e:
            errors.append(f"{cal_id}: {e}")
    if not all_items and errors:
        raise HTTPException(status_code=400, detail=f"فشل جلب المواعيد: {'; '.join(errors)}")
    all_items.sort(key=lambda x: x.get("start", {}).get("dateTime") or x.get("start", {}).get("date") or "")
    return {"events": all_items, "account": account, "count": len(all_items)}


@router.put("/calendar/events", dependencies=[Depends(get_current_user)])
async def update_calendar_event(body: EventUpdate, current_user=Depends(get_current_user)):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], body.account_email)
    # لو الفرونت اند بعت لنا أي تقويم كان فيه الحدث أصلاً (من _azvio_calendar_id) نستخدمه بالضبط،
    # وإلا نرجع لأول تقويم مختار كافتراضي احتياطي.
    calendar_ids = await _get_selected_calendar_ids(current_user["user_id"], body.account_email)
    target_calendar = body.calendar_id or calendar_ids[0]
    patch: dict = {}
    if body.summary is not None:
        patch["summary"] = body.summary
    if body.description is not None:
        patch["description"] = body.description
    if body.start is not None and body.end is not None:
        if body.all_day:
            patch["start"] = {"date": body.start[:10]}
            patch["end"] = {"date": body.end[:10]}
        else:
            tz = body.timezone or "Asia/Riyadh"
            patch["start"] = {"dateTime": body.start, "timeZone": tz}
            patch["end"] = {"dateTime": body.end, "timeZone": tz}
    try:
        updated = await run_in_threadpool(_sync_calendar_update, access_token, body.google_event_id, patch, target_calendar)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل التحديث: {e}")
    return {"google_event_id": updated.get("id"), "account": body.account_email}


@router.delete("/calendar/events/{event_id}", dependencies=[Depends(get_current_user)])
async def delete_calendar_event(
    event_id: str,
    account: str = Query(...),
    calendar_id: str = Query(""),
    current_user=Depends(get_current_user),
):
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    calendar_ids = await _get_selected_calendar_ids(current_user["user_id"], account)
    target_calendar = calendar_id or calendar_ids[0]
    try:
        await run_in_threadpool(_sync_calendar_delete, access_token, event_id, target_calendar)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل الحذف: {e}")
    return {"ok": True, "event_id": event_id}


@router.get("/calendar/list", dependencies=[Depends(get_current_user)])
async def list_calendars(account: str = Query(...), current_user=Depends(get_current_user)):
    """كل التقاويم المتاحة بحساب Google — تُعرض للمستخدم يختار منها (يدعم اختيار أكثر من تقويم)."""
    access_token, _ = await _get_valid_credentials(current_user["user_id"], account)
    try:
        calendars = await run_in_threadpool(_sync_calendar_list_calendars, access_token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل جلب قائمة التقاويم: {e}")
    selected = await _get_selected_calendar_ids(current_user["user_id"], account)
    return {"calendars": calendars, "selected_calendar_ids": selected}


@router.post("/calendar/select", dependencies=[Depends(get_current_user)])
async def select_calendar(
    account: str = Query(...),
    calendar_ids: str = Query(..., description="قائمة معرّفات تقاويم مفصولة بفاصلة"),
    current_user=Depends(get_current_user),
):
    """يحفظ اختيار المستخدم لأي تقاويم (واحد أو أكثر) يشتغل عليها التطبيق."""
    ids_list = [c.strip() for c in calendar_ids.split(",") if c.strip()]
    if not ids_list:
        raise HTTPException(status_code=400, detail="لازم تختار تقويم واحد على الأقل")
    result = await db.google_accounts.update_one(
        {"user_id": current_user["user_id"], "email": account},
        {"$set": {"selected_calendar_ids": ids_list}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="الحساب غير موجود")
    return {"ok": True, "selected_calendar_ids": ids_list}


@router.get("/status", dependencies=[Depends(get_current_user)])
async def google_status():
    return {"configured": is_configured(), "redirect_uri": GOOGLE_REDIRECT_URI}
