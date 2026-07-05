"""Tickets — bugs/feature-requests Sanad collects in-chat, for admin review.

This is the safe alternative to letting Sanad edit code directly: the user
tells Sanad about a problem or a wanted feature while using the app, Sanad
files it here as a ticket, and a human (Azzam, with Claude) reviews and
implements it — same workflow as this chat, just fed by in-app reports.
"""
from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_admin
from database import db

router = APIRouter(prefix="/tickets", tags=["tickets"])


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@router.get("", dependencies=[Depends(get_current_admin)])
async def list_tickets(status: str | None = None):
    query = {"status": status} if status else {}
    return await db.tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.patch("/{ticket_id}/resolve", dependencies=[Depends(get_current_admin)])
async def resolve_ticket(ticket_id: str):
    result = await db.tickets.update_one(
        {"id": ticket_id}, {"$set": {"status": "resolved", "resolved_at": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    return {"ok": True}


@router.patch("/{ticket_id}/reopen", dependencies=[Depends(get_current_admin)])
async def reopen_ticket(ticket_id: str):
    result = await db.tickets.update_one({"id": ticket_id}, {"$set": {"status": "open"}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="التذكرة غير موجودة")
    return {"ok": True}
