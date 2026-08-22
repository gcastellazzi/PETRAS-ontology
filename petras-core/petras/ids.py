"""URN helpers for PETRAS entities."""
from __future__ import annotations

import re
import uuid

URN_PREFIX = "urn:petras:"
STORAGE_PREFIX = "urn_petras_"


def new_urn() -> str:
    """Allocate a fresh ``urn:petras:<12hex>`` identifier."""
    return f"{URN_PREFIX}{uuid.uuid4().hex[:12]}"


def new_urn_with_kind(kind: str) -> str:
    """Allocate ``urn:petras:<kind>:<12hex>`` (runtime subtypes such as femmodel)."""
    kind_clean = re.sub(r"[^a-z0-9_]", "", kind.lower()) or "entity"
    return f"{URN_PREFIX}{kind_clean}:{uuid.uuid4().hex[:12]}"


def safe_entity_id(entity_id: str) -> str:
    """Filesystem-safe folder name from a URN (``:`` → ``_``)."""
    return str(entity_id or "").strip().replace(":", "_").replace("/", "_")


def canonical_from_storage_id(storage_id: str) -> str | None:
    """Best-effort conversion from storage folder ID to canonical URN."""
    token = str(storage_id or "").strip()
    if token.startswith(STORAGE_PREFIX) and len(token) > len(STORAGE_PREFIX):
        return f"{URN_PREFIX}{token[len(STORAGE_PREFIX):]}"
    if token.startswith("urn_c2f4dt_") and len(token) > len("urn_c2f4dt_"):
        return f"urn:c2f4dt:{token[len('urn_c2f4dt_'):]}"
    return None


def short_entity_id(urn: str, length: int = 12) -> str:
    value = str(urn or "").strip()
    if not value:
        return "-"
    tail = value.split(":")[-1]
    return tail[-max(1, int(length)) :]


def translate_urn_to_petras(value: str) -> str:
    """Rewrite a legacy ``urn:c2f4dt:`` token to ``urn:petras:`` in memory."""
    text = str(value or "")
    if text.startswith("urn:c2f4dt:"):
        return "urn:petras:" + text[len("urn:c2f4dt:") :]
    return text
