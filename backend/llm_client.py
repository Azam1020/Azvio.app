"""Unified LLM client — direct Anthropic Claude + Google Gemini calls via LiteLLM.

Bypasses Emergent proxy. Uses user's own ANTHROPIC_API_KEY and GEMINI_API_KEY.

Task routing:
- chat / insight / advice   -> Claude Sonnet 4.5  (fallback: Gemini 2.5 Pro)
- suggest / short JSON      -> Gemini 2.5 Flash   (fallback: Claude Haiku 4.5)
- vision (PDF/image)        -> Gemini 2.5 Pro     (fallback: Claude Sonnet 4.5)

Automatic single-shot fallback: if primary raises, retry once with alternate provider.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
from typing import Optional, Tuple

from dotenv import load_dotenv
from litellm import acompletion

load_dotenv()

logger = logging.getLogger(__name__)

# ============ Latest model constants (June 2026) ============
CLAUDE_SONNET = "anthropic/claude-sonnet-4-5"
CLAUDE_HAIKU = "anthropic/claude-haiku-4-5"
GEMINI_PRO = "gemini/gemini-2.5-pro"
GEMINI_FLASH = "gemini/gemini-2.5-flash"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


class LLMError(Exception):
    """Raised when both primary and fallback LLM calls fail."""


# ============ Task routing ============

_TEXT_TASK_MAP = {
    "chat": (CLAUDE_SONNET, GEMINI_PRO),
    "insight": (CLAUDE_SONNET, GEMINI_PRO),
    "advice": (CLAUDE_SONNET, GEMINI_PRO),
    "analyze": (CLAUDE_SONNET, GEMINI_PRO),
    "suggest": (GEMINI_FLASH, CLAUDE_HAIKU),
    "quick": (GEMINI_FLASH, CLAUDE_HAIKU),
}

_VISION_TASK_MAP = {
    "vision": (GEMINI_PRO, CLAUDE_SONNET),
    "extract": (GEMINI_PRO, CLAUDE_SONNET),
    "ocr": (GEMINI_PRO, CLAUDE_SONNET),
}


def _pick_models(task: str, is_vision: bool = False) -> Tuple[str, str]:
    key = (task or "").lower().strip()
    table = _VISION_TASK_MAP if is_vision else _TEXT_TASK_MAP
    if key in table:
        return table[key]
    return (GEMINI_PRO, CLAUDE_SONNET) if is_vision else (CLAUDE_SONNET, GEMINI_PRO)


def _api_key_for(model: str) -> str:
    if model.startswith("anthropic/"):
        return ANTHROPIC_API_KEY
    if model.startswith("gemini/"):
        return GEMINI_API_KEY
    return ""


def _extract_text(resp) -> str:
    """Robustly extract text content from a LiteLLM response."""
    try:
        content = resp.choices[0].message.content
        if isinstance(content, list):
            parts = []
            for seg in content:
                if isinstance(seg, dict):
                    parts.append(seg.get("text", "") or "")
                else:
                    parts.append(str(seg))
            return "".join(parts).strip()
        return str(content).strip()
    except Exception:
        # Fallback: dict-like
        try:
            content = resp["choices"][0]["message"]["content"]
            if isinstance(content, list):
                return "".join(seg.get("text", "") if isinstance(seg, dict) else str(seg) for seg in content).strip()
            return str(content).strip()
        except Exception as e:
            raise LLMError(f"Unexpected LLM response shape: {e}")


async def _call_text(model: str, system: str, user: str, temperature: float = 0.7) -> str:
    api_key = _api_key_for(model)
    if not api_key:
        raise LLMError(f"مفتاح API غير مضبوط للنموذج {model}")
    try:
        resp = await acompletion(
            model=model,
            api_key=api_key,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=4096,
            timeout=60,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"_call_text raw failure for {model}: {type(e).__module__}.{type(e).__name__}: {e!r}", exc_info=True)
        raise LLMError(f"{model} فشل: {e}") from e
    return _extract_text(resp)


async def _call_with_file(model: str, system: str, prompt: str, file_path: str, mime: str) -> str:
    api_key = _api_key_for(model)
    if not api_key:
        raise LLMError(f"مفتاح API غير مضبوط للنموذج {model}")

    # Read + encode file
    try:
        with open(file_path, "rb") as f:
            data = f.read()
    except Exception as e:
        raise LLMError(f"تعذّر قراءة الملف: {e}") from e
    b64 = base64.b64encode(data).decode("ascii")
    data_uri = f"data:{mime};base64,{b64}"

    is_image = (mime or "").startswith("image/")

    # Build multimodal content (LiteLLM unified content parts)
    if is_image:
        user_content = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": data_uri}},
        ]
    else:
        # PDF or other document — LiteLLM document understanding uses "file" content type
        user_content = [
            {"type": "text", "text": prompt},
            {"type": "file", "file": {"file_data": data_uri, "filename": os.path.basename(file_path)}},
        ]

    try:
        resp = await acompletion(
            model=model,
            api_key=api_key,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=4096,
            timeout=90,
        )
    except Exception as e:
        # Some models (Claude via LiteLLM) prefer a different PDF payload shape — retry as image if PDF failed
        if not is_image and mime == "application/pdf":
            try:
                user_content_alt = [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ]
                resp = await acompletion(
                    model=model,
                    api_key=api_key,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_content_alt},
                    ],
                    temperature=0.3,
                    max_tokens=4096,
                    timeout=90,
                )
            except Exception as e2:
                raise LLMError(f"{model} فشل: {e2}") from e2
        else:
            raise LLMError(f"{model} فشل: {e}") from e
    return _extract_text(resp)


# ============ Public helpers ============

async def ask_text(system: str, user: str, task: str = "chat", temperature: float = 0.7) -> str:
    """Text-only interaction with automatic provider fallback."""
    primary, fallback = _pick_models(task, is_vision=False)
    try:
        return await _call_text(primary, system, user, temperature)
    except LLMError as e1:
        logger.warning("Primary %s failed for task=%s: %s — trying fallback %s", primary, task, e1, fallback)
        try:
            return await _call_text(fallback, system, user, temperature)
        except LLMError as e2:
            raise LLMError(
                f"تعذّر الاتصال بسند — Primary({primary}): {e1}. Fallback({fallback}): {e2}"
            ) from e2


async def ask_with_file(system: str, prompt: str, file_path: str, mime: str, task: str = "vision") -> str:
    """Multimodal (PDF/image) interaction with automatic provider fallback."""
    primary, fallback = _pick_models(task, is_vision=True)
    try:
        return await _call_with_file(primary, system, prompt, file_path, mime)
    except LLMError as e1:
        logger.warning("Vision primary %s failed: %s — trying fallback %s", primary, e1, fallback)
        try:
            return await _call_with_file(fallback, system, prompt, file_path, mime)
        except LLMError as e2:
            raise LLMError(
                f"تعذّر تحليل الملف — Primary({primary}): {e1}. Fallback({fallback}): {e2}"
            ) from e2


async def stream_chat(system: str, user: str, history: Optional[list] = None, task: str = "chat"):
    """Streaming text generator using primary text model (no fallback). Yields text chunks."""
    primary, _ = _pick_models(task, is_vision=False)
    api_key = _api_key_for(primary)
    if not api_key:
        yield "[خطأ: مفتاح API غير مضبوط]"
        return
    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})
    try:
        stream = await acompletion(
            model=primary,
            api_key=api_key,
            messages=messages,
            stream=True,
            temperature=0.7,
            max_tokens=4096,
            timeout=90,
        )
        async for chunk in stream:
            try:
                delta = chunk.choices[0].delta
                text = getattr(delta, "content", None) or ""
                if text:
                    yield text
            except Exception:
                continue
    except Exception as e:
        yield f"[تعذّر البث: {e}]"


def is_configured() -> bool:
    return bool(ANTHROPIC_API_KEY or GEMINI_API_KEY)
