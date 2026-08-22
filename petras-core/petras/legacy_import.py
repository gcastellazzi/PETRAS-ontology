"""In-memory translation of legacy C2F4DT project identifiers to PETRAS."""
from __future__ import annotations

from typing import Any

from .ids import translate_urn_to_petras
from .layers import PETRAS_CONTEXT, PETRAS_ONTOLOGY_VERSION


def translate_config(config: dict[str, Any]) -> dict[str, Any]:
    """Return a PETRAS-flavoured view of a legacy ``c2f4dt.json`` manifest."""
    out = dict(config)
    out["ontology"] = "PETRAS"
    out.setdefault("ontologyVersion", PETRAS_ONTOLOGY_VERSION)
    out["context"] = PETRAS_CONTEXT
    return out


def translate_value(value: Any) -> Any:
    """Recursively rewrite ``urn:c2f4dt:`` and ``c2f4dt.org`` tokens."""
    if isinstance(value, str):
        text = translate_urn_to_petras(value)
        text = text.replace("https://c2f4dt.org/context.jsonld", PETRAS_CONTEXT)
        text = text.replace("https://c2f4dt.org/context/v1", PETRAS_CONTEXT)
        text = text.replace("https://c2f4dt.org/ontology#", "https://w3id.org/petras/ontology#")
        text = text.replace("urn_c2f4dt_", "urn_petras_")
        text = text.replace("c2f4dt.indexer", "petras.indexer")
        text = text.replace(".c2f4dt_finetools_jobs", ".petras_finetools_jobs")
        text = text.replace("c2f4dt.json", "petras.json")
        return text
    if isinstance(value, list):
        return [translate_value(item) for item in value]
    if isinstance(value, dict):
        return {
            translate_value(k) if isinstance(k, str) else k: translate_value(v)
            for k, v in value.items()
        }
    return value


def translate_entity(data: dict[str, Any]) -> dict[str, Any]:
    """Translate a legacy entity JSON-LD document in memory."""
    out = translate_value(data)
    if isinstance(out, dict):
        out["@context"] = PETRAS_CONTEXT
        return out
    return data
