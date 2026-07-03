"""AZVIO Supabase Storage integration.
Handles bucket creation, uploads, signed URL generation and deletion for client attachments.
"""
from __future__ import annotations
import os
import uuid
from typing import Optional

from fastapi.concurrency import run_in_threadpool
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = os.getenv("SUPABASE_BUCKET", "client-attachments")

# Bucket options
ALLOWED_MIME_TYPES = ["image/*", "application/pdf", "application/msword",
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                     "application/vnd.ms-excel",
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     "text/plain"]
MAX_FILE_BYTES = 15 * 1024 * 1024  # 15MB
DEFAULT_SIGNED_TTL = 3600  # 1 hour

_client: Optional[Client] = None
_bucket_ready = False


def get_client() -> Optional[Client]:
    global _client
    if _client is not None:
        return _client
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    try:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        return _client
    except Exception as e:
        print(f"[supabase] init failed: {e}")
        return None


def ensure_bucket_sync() -> bool:
    """Idempotent bucket creation with allowed mime types + size limit."""
    global _bucket_ready
    if _bucket_ready:
        return True
    c = get_client()
    if c is None:
        return False
    try:
        buckets = c.storage.list_buckets()
        # supabase-py returns a list of Bucket objects
        existing = {getattr(b, "id", None) or getattr(b, "name", None) for b in buckets}
        if BUCKET in existing:
            _bucket_ready = True
            return True
        c.storage.create_bucket(
            BUCKET,
            options={
                "public": False,
                "allowed_mime_types": ALLOWED_MIME_TYPES,
                "file_size_limit": MAX_FILE_BYTES,
            },
        )
        _bucket_ready = True
        return True
    except Exception as e:
        print(f"[supabase] ensure_bucket failed: {e}")
        return False


async def ensure_bucket() -> bool:
    return await run_in_threadpool(ensure_bucket_sync)


def _upload_sync(path: str, data: bytes, content_type: str) -> None:
    c = get_client()
    if c is None:
        raise RuntimeError("Supabase not configured")
    c.storage.from_(BUCKET).upload(
        path=path,
        file=data,
        file_options={
            "content-type": content_type,
            "cache-control": "3600",
            "upsert": "false",
        },
    )


def _signed_url_sync(path: str, ttl: int = DEFAULT_SIGNED_TTL) -> str:
    c = get_client()
    if c is None:
        raise RuntimeError("Supabase not configured")
    resp = c.storage.from_(BUCKET).create_signed_url(path, ttl)
    if isinstance(resp, dict):
        return resp.get("signedURL") or resp.get("signed_url") or ""
    return getattr(resp, "signedURL", "") or getattr(resp, "signed_url", "") or ""


def _remove_sync(paths: list[str]) -> None:
    c = get_client()
    if c is None:
        return
    try:
        c.storage.from_(BUCKET).remove(paths)
    except Exception as e:
        print(f"[supabase] remove failed for {paths}: {e}")


async def upload_bytes(client_id: str, log_id: str, filename: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to Supabase, return {path, url, expires_in, filename, mime}."""
    ok = await ensure_bucket()
    if not ok:
        raise RuntimeError("Supabase Storage غير مُهيّأ. تحقق من إعدادات المفاتيح.")

    safe_name = filename.replace("/", "_").replace("\\", "_")
    unique = uuid.uuid4().hex[:12]
    path = f"{client_id}/{log_id}/{unique}_{safe_name}"

    await run_in_threadpool(_upload_sync, path, data, content_type)
    url = await run_in_threadpool(_signed_url_sync, path, DEFAULT_SIGNED_TTL)
    return {
        "path": path,
        "url": url,
        "expires_in": DEFAULT_SIGNED_TTL,
        "name": filename,
        "mime": content_type,
    }


async def get_signed_url(path: str, ttl: int = DEFAULT_SIGNED_TTL) -> str:
    return await run_in_threadpool(_signed_url_sync, path, ttl)


async def remove_paths(paths: list[str]) -> None:
    if not paths:
        return
    await run_in_threadpool(_remove_sync, paths)


def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)
