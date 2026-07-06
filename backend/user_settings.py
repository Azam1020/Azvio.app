"""User settings/preferences endpoints — dashboard widget order, visibility, etc."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_admin, get_current_user
from database import db

router = APIRouter(dependencies=[Depends(get_current_user)])


DEFAULT_WIDGETS_ORDER = ["stats", "incomeChart", "contentChart", "nav", "events"]
DEFAULT_WIDGETS_VISIBLE: Dict[str, bool] = {
    "stats": True,
    "incomeChart": True,
    "contentChart": True,
    "nav": True,
    "events": True,
}

DEFAULT_NOTIF_PREFS: Dict[str, bool] = {
    "project": True,      # task/project reminders (daily summary, budget alerts)
    "team": True,          # team-related notifications
    "motivational": True,  # daily motivational quote from Sanad
}


class NotificationPrefsUpdate(BaseModel):
    project: Optional[bool] = None
    team: Optional[bool] = None
    motivational: Optional[bool] = None


class DashboardPrefsUpdate(BaseModel):
    order: Optional[List[str]] = None
    visible: Optional[Dict[str, bool]] = None


def _default_prefs() -> Dict[str, Any]:
    return {
        "dashboard": {
            "order": DEFAULT_WIDGETS_ORDER[:],
            "visible": dict(DEFAULT_WIDGETS_VISIBLE),
        },
        "notifications": dict(DEFAULT_NOTIF_PREFS),
    }


async def _get_user_prefs(user_id: str) -> Dict[str, Any]:
    doc = await db.user_prefs.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return _default_prefs()
    dashboard = doc.get("dashboard") or {}
    # Merge with defaults so newly added widgets always appear
    saved_order = dashboard.get("order") or []
    saved_visible = dashboard.get("visible") or {}
    # Ensure all default widget keys exist in order
    order = [w for w in saved_order if w in DEFAULT_WIDGETS_ORDER]
    for w in DEFAULT_WIDGETS_ORDER:
        if w not in order:
            order.append(w)
    visible = {**DEFAULT_WIDGETS_VISIBLE, **{k: v for k, v in saved_visible.items() if k in DEFAULT_WIDGETS_ORDER}}
    notif = {**DEFAULT_NOTIF_PREFS, **{k: v for k, v in (doc.get("notifications") or {}).items() if k in DEFAULT_NOTIF_PREFS}}
    return {"dashboard": {"order": order, "visible": visible}, "notifications": notif}


async def get_notification_prefs(user_id: str) -> Dict[str, bool]:
    prefs = await _get_user_prefs(user_id)
    return prefs["notifications"]


class BusinessSettingsUpdate(BaseModel):
    monthly_expense_budget: Optional[float] = None


@router.get("/business/settings")
async def get_business_settings():
    doc = await db.business_settings.find_one({"id": "default"}, {"_id": 0})
    return doc or {"id": "default", "monthly_expense_budget": None}


@router.put("/business/settings", dependencies=[Depends(get_current_admin)])
async def update_business_settings(body: BusinessSettingsUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.business_settings.update_one({"id": "default"}, {"$set": updates}, upsert=True)
    return await db.business_settings.find_one({"id": "default"}, {"_id": 0})


@router.get("/user/settings")
async def get_settings(user=Depends(get_current_user)):
    return await _get_user_prefs(user["user_id"])


@router.put("/user/settings/dashboard")
async def update_dashboard(body: DashboardPrefsUpdate, user=Depends(get_current_user)):
    prefs = await _get_user_prefs(user["user_id"])
    dashboard = prefs["dashboard"]
    if body.order is not None:
        # Validate: only known widget keys, no dupes, must cover all defaults
        cleaned = []
        seen = set()
        for k in body.order:
            if k in DEFAULT_WIDGETS_ORDER and k not in seen:
                cleaned.append(k)
                seen.add(k)
        # Add any missing
        for k in DEFAULT_WIDGETS_ORDER:
            if k not in seen:
                cleaned.append(k)
        dashboard["order"] = cleaned
    if body.visible is not None:
        merged = {**DEFAULT_WIDGETS_VISIBLE}
        for k, v in body.visible.items():
            if k in DEFAULT_WIDGETS_ORDER:
                merged[k] = bool(v)
        dashboard["visible"] = merged
    await db.user_prefs.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "dashboard": dashboard}},
        upsert=True,
    )
    return {"dashboard": dashboard}


@router.put("/user/settings/notifications")
async def update_notification_prefs(body: NotificationPrefsUpdate, user=Depends(get_current_user)):
    prefs = await _get_user_prefs(user["user_id"])
    notif = prefs["notifications"]
    for k, v in body.model_dump().items():
        if v is not None and k in DEFAULT_NOTIF_PREFS:
            notif[k] = bool(v)
    await db.user_prefs.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "notifications": notif}},
        upsert=True,
    )
    return {"notifications": notif}


@router.post("/user/settings/dashboard/reset")
async def reset_dashboard(user=Depends(get_current_user)):
    default = _default_prefs()
    await db.user_prefs.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "dashboard": default["dashboard"]}},
        upsert=True,
    )
    return default
