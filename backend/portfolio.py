"""Portfolio auto-sync — when a client is marked delivered, an item is auto-created with Sanad-generated title/desc/tags.
Supports manual regeneration and edits.
"""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import db
from llm_client import ask_text, LLMError

router = APIRouter(dependencies=[Depends(get_current_user)])



def now_iso():
    return datetime.now(timezone.utc).isoformat()


SANAD_ENHANCE_PROMPT = """أنت خبير كتابة عناوين ووصف احترافي للبورتفوليو (أعمال التصوير الجوي بالدرون والمونتاج) في السعودية.
اقرأ بيانات المشروع التالي وأعد JSON فقط بالصيغة:
{
  "title": "عنوان جذاب باللغة العربية (5-9 كلمات)",
  "description": "وصف احترافي 1-2 جملة يشرح المشروع ونوعه ومزاياه",
  "tags": ["وسم1", "وسم2", "وسم3", "وسم4"]
}

قواعد:
- العنوان يعكس هوية المشروع (لا يذكر اسم العميل).
- الوصف يستهدف عملاء محتملين — أظهر القيمة والاحتراف.
- 3-5 وسوم من: تصوير_جوي، درون، مونتاج، عقاري، فعاليات، أعراس، مطاعم، مباني، فيلا، مشروع_تجاري، دعاية_وإعلان، سوشيال_ميديا، مباني_تاريخية، رياضة، هوية_بصرية.
- لا شرح خارج JSON."""


def _parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


async def _sanad_enhance(client: dict) -> dict:
    """Ask Sanad to generate title/description/tags for a delivered client."""
    ctx = {
        "service_type": client.get("service_type") or "drone",
        "sub_category": client.get("sub_category") or "",
        "notes": (client.get("notes") or "")[:400],
        "agreed_price": client.get("agreed_price") or 0,
        "num_logs": len(client.get("logs") or []),
    }
    user_msg = "بيانات المشروع:\n" + json.dumps(ctx, ensure_ascii=False)
    try:
        text = await ask_text(
            system="أنت مساعد ذكي تجيب دائماً بصيغة JSON فقط.",
            user=SANAD_ENHANCE_PROMPT + "\n\n" + user_msg,
            task="suggest",
            temperature=0.6,
        )
        data = _parse_json(text)
    except LLMError:
        data = {}
    return {
        "title": (data.get("title") or (client.get("sub_category") or "مشروع") + " — " + (client.get("service_type") or "درون")).strip()[:120],
        "description": (data.get("description") or f"مشروع {client.get('sub_category', 'احترافي')} تم تنفيذه بجودة عالية.").strip()[:400],
        "tags": [str(t).strip()[:30] for t in (data.get("tags") or [])[:5] if str(t).strip()],
    }


def _extract_media_from_logs(logs: list) -> list:
    """Extract image/video attachments from client logs. Returns list of {kind, name, path (Supabase) or data (base64), mime}."""
    out = []
    for log in logs or []:
        att = log.get("attachment") if isinstance(log, dict) else None
        if not att or not isinstance(att, dict):
            continue
        mime = (att.get("mime") or "").lower()
        if not (mime.startswith("image/") or mime.startswith("video/")):
            continue
        media = {
            "name": att.get("name") or "media",
            "mime": mime,
        }
        if att.get("path"):
            media["kind"] = "supabase"
            media["path"] = att["path"]
        elif att.get("data"):
            media["kind"] = "base64"
            media["data_size"] = len(att.get("data") or "")
            # keep base64 out of portfolio item — reference log for retrieval
            media["log_id"] = log.get("id")
        else:
            continue
        out.append(media)
    return out


async def _build_portfolio_doc(client: dict, enhance: bool = True) -> dict:
    """Build portfolio doc from a delivered client."""
    media = _extract_media_from_logs(client.get("logs") or [])
    base = {
        "client_id": client["id"],
        "client_name": client.get("name") or "",
        "service_type": client.get("service_type") or "drone",
        "sub_category": client.get("sub_category") or "",
        "media": media,
        "public": False,
        "auto_generated": True,
    }
    if enhance:
        enhanced = await _sanad_enhance(client)
        base.update(enhanced)
    else:
        base.update({
            "title": (client.get("sub_category") or "مشروع") + " — " + (client.get("service_type") or "درون"),
            "description": f"مشروع {client.get('sub_category', 'احترافي')} تم تنفيذه.",
            "tags": [],
        })
    return base


async def create_or_update_from_client(client_id: str, enhance: bool = True) -> Optional[dict]:
    """Public helper — called from client update route when status transitions to delivered."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        return None
    if client.get("status") != "delivered":
        return None
    existing = await db.portfolio_items.find_one({"client_id": client_id}, {"_id": 0})
    doc_fields = await _build_portfolio_doc(client, enhance=enhance)
    if existing:
        # Only update auto-generated fields if user hasn't customized (auto_generated flag)
        if existing.get("auto_generated") is False:
            # Keep title/desc/tags user-set. Update only media snapshot.
            await db.portfolio_items.update_one(
                {"id": existing["id"]},
                {"$set": {"media": doc_fields["media"], "updated_at": now_iso()}},
            )
        else:
            await db.portfolio_items.update_one(
                {"id": existing["id"]},
                {"$set": {**doc_fields, "updated_at": now_iso()}},
            )
        return await db.portfolio_items.find_one({"id": existing["id"]}, {"_id": 0})
    new_doc = {
        "id": uuid.uuid4().hex,
        **doc_fields,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.portfolio_items.insert_one(dict(new_doc))
    new_doc.pop("_id", None)
    return new_doc


@router.get("/portfolio")
async def list_portfolio():
    items = await db.portfolio_items.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Attach signed URL to the first supabase media item (cover) for grid preview
    try:
        from supabase_storage import get_signed_url, is_configured
        if is_configured():
            for item in items:
                cover = next((m for m in (item.get("media") or []) if m.get("kind") == "supabase" and m.get("path")), None)
                if cover:
                    try:
                        item["cover_url"] = await get_signed_url(cover["path"])
                    except Exception:
                        pass
    except Exception:
        pass
    return items


@router.get("/portfolio/{item_id}")
async def get_portfolio_item(item_id: str):
    doc = await db.portfolio_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="عنصر البورتفوليو غير موجود")
    # Enrich media with signed URLs on-demand
    try:
        from supabase_storage import get_signed_url, is_configured
        if is_configured():
            for m in doc.get("media", []):
                if m.get("kind") == "supabase" and m.get("path") and not m.get("url"):
                    try:
                        m["url"] = await get_signed_url(m["path"])
                    except Exception:
                        pass
    except Exception:
        pass
    return doc


class PortfolioUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list] = None
    public: Optional[bool] = None


async def _enrich_media_urls(doc: dict) -> dict:
    """يبني روابط موقّعة فعلية لوسائط Supabase قبل أي استخدام خارجي (مزامنة الموقع مثلاً)."""
    from supabase_storage import get_signed_url, is_configured
    if is_configured():
        for m in (doc.get("media") or []):
            if m.get("kind") == "supabase" and m.get("path") and not m.get("url"):
                try:
                    m["url"] = await get_signed_url(m["path"], ttl=60 * 60 * 24 * 365 * 5)
                except Exception:
                    pass
    return doc


def _to_pg_uuid(hex_id: str) -> str:
    """معرّفات portfolio_items عندنا hex بدون شرطات (uuid4().hex) — Postgres/Supabase
    يتوقع صيغة UUID القياسية بالشرطات (8-4-4-4-12)، وإلا يرفض الإدراج بصمت."""
    h = hex_id.replace("-", "")
    if len(h) != 32:
        return hex_id  # شكل غير متوقع، نرجعه كما هو بدل ما نكسره
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


async def _sync_item_to_website(item: dict) -> None:
    """ينشر عنصر بورتفوليو بموقع azvio.co/work مباشرة — الموقع يقرأ من نفس جداول Supabase
    هذي (projects + project_media)، فما يحتاج أي تعديل بكود الموقع نفسه (طلب #6)."""
    from supabase_storage import get_client, is_configured
    if not is_configured():
        return
    client = get_client()
    if client is None:
        return

    # أول صورة غلاف نستخدمها كـ image_url الرئيسي بشبكة الأعمال بالموقع
    cover_url = item.get("cover_url") or ""
    if not cover_url:
        for m in (item.get("media") or []):
            if m.get("url"):
                cover_url = m["url"]
                break

    category = item.get("sub_category") or item.get("service_type") or "تصوير"
    pg_id = _to_pg_uuid(item["id"])

    row = {
        "id": pg_id,  # نفس المعرّف بالتطبيق (محوّل لصيغة UUID) — عشان التحديث يصير upsert سليم
        "title": item.get("title") or "مشروع",
        "category": category,
        "image_url": cover_url,
        "description": item.get("description") or "",
        "sort_order": 0,
    }
    try:
        client.table("projects").upsert(row).execute()
    except Exception as e:
        print(f"[portfolio-sync] فشل نشر المشروع {item['id']} بالموقع: {e}")
        return

    # ملفات الوسائط الإضافية (غير صورة الغلاف)
    try:
        client.table("project_media").delete().eq("project_id", pg_id).execute()
        media_rows = []
        for m in (item.get("media") or []):
            url = m.get("url")
            if not url or url == cover_url:
                continue
            media_rows.append({"project_id": pg_id, "media_url": url})
        if media_rows:
            client.table("project_media").insert(media_rows).execute()
    except Exception as e:
        print(f"[portfolio-sync] فشل مزامنة وسائط المشروع {item['id']}: {e}")


async def _unpublish_from_website(item_id: str) -> None:
    """يحذف المشروع من موقع azvio.co/work — يُستدعى عند إلغاء النشر أو الحذف."""
    from supabase_storage import get_client, is_configured
    if not is_configured():
        return
    client = get_client()
    if client is None:
        return
    pg_id = _to_pg_uuid(item_id)
    try:
        client.table("project_media").delete().eq("project_id", pg_id).execute()
        client.table("projects").delete().eq("id", pg_id).execute()
    except Exception as e:
        print(f"[portfolio-sync] فشل حذف المشروع {item_id} من الموقع: {e}")


@router.put("/portfolio/{item_id}")
async def update_portfolio_item(item_id: str, body: PortfolioUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["auto_generated"] = False  # user edited → protect from auto overwrite
    updates["updated_at"] = now_iso()
    r = await db.portfolio_items.update_one({"id": item_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="عنصر البورتفوليو غير موجود")
    doc = await db.portfolio_items.find_one({"id": item_id}, {"_id": 0})

    # مزامنة تلقائية مع الموقع: نشر لو public=true، حذف لو رجع private
    if "public" in updates:
        if updates["public"]:
            doc = await _enrich_media_urls(doc)
            await _sync_item_to_website(doc)
        else:
            await _unpublish_from_website(item_id)
    elif doc.get("public"):
        # عدّل العنوان/الوصف بس والعنصر أصلاً منشور — حدّث نسخة الموقع كمان
        doc = await _enrich_media_urls(doc)
        await _sync_item_to_website(doc)

    return doc


@router.delete("/portfolio/{item_id}")
async def delete_portfolio_item(item_id: str):
    r = await db.portfolio_items.delete_one({"id": item_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="عنصر البورتفوليو غير موجود")
    await _unpublish_from_website(item_id)  # يضمن حذفه من الموقع أيضاً لو كان منشوراً
    return {"ok": True}


@router.post("/portfolio/{item_id}/regenerate")
async def regenerate_portfolio_item(item_id: str):
    """Force Sanad to regenerate title/description/tags for this item."""
    doc = await db.portfolio_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="عنصر البورتفوليو غير موجود")
    client = await db.clients.find_one({"id": doc["client_id"]}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="العميل المرتبط لم يعد موجوداً")
    enhanced = await _sanad_enhance(client)
    await db.portfolio_items.update_one(
        {"id": item_id},
        {"$set": {**enhanced, "auto_generated": True, "updated_at": now_iso()}},
    )
    return await db.portfolio_items.find_one({"id": item_id}, {"_id": 0})


@router.post("/portfolio/sync-all")
async def sync_all_delivered():
    """Manually sync all delivered clients into portfolio (safe to call anytime)."""
    delivered = await db.clients.find({"status": "delivered"}, {"_id": 0}).to_list(1000)
    added = 0
    updated = 0
    for c in delivered:
        exists = await db.portfolio_items.find_one({"client_id": c["id"]}, {"_id": 0})
        result = await create_or_update_from_client(c["id"], enhance=(not exists))
        if result:
            if exists:
                updated += 1
            else:
                added += 1
    return {"added": added, "updated": updated}
