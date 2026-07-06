"""Push notifications — Expo push token registration + send helper.

Real, server-triggered notifications: they reach the phone even if the app
is closed, because Expo's push service (not this backend) holds the
connection to Apple/Google. This backend only needs to POST to Expo's
push API whenever something is worth telling the user about.

NOTE ON RELIABILITY: the scheduled reminder job in this file only fires
while this backend process is actually running. On Render's free tier the
service spins down after ~15 minutes of inactivity, so a reminder due
during that window is skipped until the next request wakes it up. For
reminders that must fire at a specific time every day, the Starter plan
(no spin-down) is required.
"""
from __future__ import annotations
import logging
import random
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db
from user_settings import get_notification_prefs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

MOTIVATIONAL_QUOTES = [
    "يوم جديد، فرصة جديدة تسوّي فيها شغل يفتخر بيه AZVIO.",
    "التفاصيل الصغيرة هي اللي تفرّق بين شغل عادي وشغل يتذكره العميل.",
    "خطوة كل يوم أفضل من قفزة تتأخر شهر.",
    "أفضل وقت تبدأ فيه المهمة الصعبة هو الحين، قبل لا تكبر بمخيلتك.",
    "الاتساق يبني الاسم التجاري أكثر من أي حملة تسويقية.",
]


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class RegisterTokenBody(BaseModel):
    push_token: str


@router.post("/register-token")
async def register_token(body: RegisterTokenBody, user: dict = Depends(get_current_user)):
    if not body.push_token:
        raise HTTPException(status_code=400, detail="push_token مطلوب")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"push_token": body.push_token}})
    return {"ok": True}


async def send_expo_push(push_token: str, title: str, body: str) -> bool:
    if not push_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            r = await hc.post(
                EXPO_PUSH_URL,
                json={"to": push_token, "title": title, "body": body, "sound": "default"},
                headers={"Content-Type": "application/json"},
            )
            return r.status_code == 200
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Expo push failed: {e}")
        return False


async def build_daily_summary() -> str:
    """Overdue clients + today's events, in one short line."""
    overdue = await db.clients.count_documents({"status": "in_progress"})
    today_events = await db.events.count_documents({"date": today_str()})
    parts = []
    if today_events:
        parts.append(f"عندك {today_events} موعد اليوم")
    if overdue:
        parts.append(f"{overdue} عميل لسا قيد التنفيذ")
    return " — ".join(parts) if parts else "لا يوجد مواعيد اليوم، يوم مناسب تتفرّغ لمتابعة عملائك."


def month_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def check_budget_alert() -> str | None:
    """Returns an alert message if this month's expenses exceed the configured
    budget and we haven't already alerted for this month, else None."""
    settings = await db.business_settings.find_one({"id": "default"}) or {}
    budget = settings.get("monthly_expense_budget")
    if not budget:
        return None
    this_month = month_str()
    if settings.get("budget_alert_sent_month") == this_month:
        return None
    txs = await db.transactions.find(
        {"type": "expense", "date": {"$regex": f"^{this_month}"}}, {"amount": 1}
    ).to_list(10000)
    total = sum(t.get("amount", 0) for t in txs)
    if total <= budget:
        return None
    await db.business_settings.update_one(
        {"id": "default"}, {"$set": {"budget_alert_sent_month": this_month}}, upsert=True
    )
    return f"مصاريف هذا الشهر ({total:,.0f} ر.س) تجاوزت الميزانية المحددة ({budget:,.0f} ر.س)."


async def run_daily_reminders():
    """Called by the scheduler once a day. Sends every user with a
    registered push token a task summary + a motivational line."""
    summary = await build_daily_summary()
    quote = random.choice(MOTIVATIONAL_QUOTES)
    budget_alert = await check_budget_alert()
    users = await db.users.find({"push_token": {"$exists": True, "$ne": ""}}, {"_id": 0}).to_list(500)
    for u in users:
        prefs = await get_notification_prefs(u["user_id"])
        if prefs.get("project", True):
            await send_expo_push(u["push_token"], "AZVIO — تذكير يومي", summary)
        if prefs.get("motivational", True):
            await send_expo_push(u["push_token"], "سند", quote)
        if budget_alert and prefs.get("project", True):
            await send_expo_push(u["push_token"], "⚠️ تنبيه الميزانية", budget_alert)
