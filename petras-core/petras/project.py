"""Read-only PETRAS project I/O (JSON-LD layers)."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .ids import safe_entity_id
from .layers import (
    ENTITY_FILENAME,
    LAYER_DIRS,
    LEGACY_ENTITY_FILENAME,
    LEGACY_MANIFEST_NAME,
    MANIFEST_NAME,
    OntologyLayer,
    PETRAS_CONTEXT,
    PETRAS_ONTOLOGY_VERSION,
)

log = logging.getLogger(__name__)


class Project:
    """An open PETRAS project directory on disk."""

    def __init__(self, root: Path, *, translate_legacy: bool = False) -> None:
        self.root = root.resolve()
        self.config: dict[str, Any] = {}
        self.translate_legacy = translate_legacy
        self._legacy = False

    @classmethod
    def create(cls, root: Path, name: str = "", description: str = "") -> Project:
        """Initialize a new PETRAS project directory structure."""
        root = root.resolve()
        root.mkdir(parents=True, exist_ok=True)
        for layer_dir in LAYER_DIRS.values():
            (root / layer_dir).mkdir(exist_ok=True)

        proj = cls(root)
        proj.config = {
            "name": name or root.name,
            "description": description,
            "version": "0.1.0",
            "ontology": "PETRAS",
            "ontologyVersion": PETRAS_ONTOLOGY_VERSION,
            "context": PETRAS_CONTEXT,
        }
        proj._save_config()
        return proj

    @classmethod
    def open(cls, root: Path, *, translate_legacy: bool = False) -> Project:
        """Open an existing PETRAS or legacy C2F4DT project."""
        root = root.resolve()
        petras_cfg = root / MANIFEST_NAME
        legacy_cfg = root / LEGACY_MANIFEST_NAME
        if not petras_cfg.exists() and not legacy_cfg.exists():
            raise FileNotFoundError(f"No PETRAS project found at {root}")

        proj = cls(root, translate_legacy=translate_legacy)
        if petras_cfg.exists():
            proj.config = _load_json(petras_cfg)
            proj._legacy = False
        else:
            proj.config = _load_json(legacy_cfg)
            proj._legacy = True
            if translate_legacy:
                from .legacy_import import translate_config

                proj.config = translate_config(proj.config)
        log.info("Opened project: %s", proj.config.get("name", root.name))
        return proj

    @property
    def is_legacy(self) -> bool:
        return self._legacy

    def _save_config(self) -> None:
        path = self.root / MANIFEST_NAME
        path.write_text(json.dumps(self.config, indent=2) + "\n", encoding="utf-8")

    def layer_path(self, layer: OntologyLayer) -> Path:
        return self.root / LAYER_DIRS[layer]

    def list_entities(self, layer: OntologyLayer) -> list[str]:
        """Return storage folder names for entities in *layer*."""
        base = self.layer_path(layer)
        if not base.is_dir():
            return []
        out: list[str] = []
        for child in sorted(base.iterdir()):
            if not child.is_dir():
                continue
            if self._entity_file(child) is not None:
                out.append(child.name)
        return out

    def _entity_file(self, entity_dir: Path) -> Path | None:
        preferred = entity_dir / ENTITY_FILENAME
        if preferred.is_file():
            return preferred
        legacy = entity_dir / LEGACY_ENTITY_FILENAME
        if legacy.is_file():
            return legacy
        # Some legacy entities use alternate names; pick first *.jsonld
        candidates = sorted(entity_dir.glob("*.jsonld"))
        return candidates[0] if candidates else None

    def read_entity(self, layer: OntologyLayer, storage_id: str) -> dict[str, Any]:
        entity_dir = self.layer_path(layer) / storage_id
        path = self._entity_file(entity_dir)
        if path is None:
            raise FileNotFoundError(f"No entity JSON-LD in {entity_dir}")
        data = _load_json(path)
        if self.translate_legacy or self._legacy:
            from .legacy_import import translate_entity

            data = translate_entity(data)
        return data

    def write_entity(
        self,
        layer: OntologyLayer,
        entity_id: str,
        data: dict[str, Any],
    ) -> Path:
        """Write a PETRAS-canonical entity (always ``entity.jsonld``)."""
        safe = safe_entity_id(entity_id)
        entity_dir = self.layer_path(layer) / safe
        entity_dir.mkdir(parents=True, exist_ok=True)
        payload = dict(data)
        payload.setdefault("@context", PETRAS_CONTEXT)
        payload.setdefault("@id", entity_id)
        path = entity_dir / ENTITY_FILENAME
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        return path

    def layer_counts(self) -> dict[str, int]:
        return {
            LAYER_DIRS[layer]: len(self.list_entities(layer))
            for layer in OntologyLayer
        }

    def summary(self) -> dict[str, Any]:
        counts = self.layer_counts()
        return {
            "name": self.config.get("name", self.root.name),
            "description": self.config.get("description", ""),
            "ontology": self.config.get("ontology", "PETRAS"),
            "root": str(self.root),
            "legacy": self._legacy,
            "layerCounts": counts,
            "totalEntities": sum(counts.values()),
        }


def _load_json(path: Path) -> dict[str, Any]:
    try:
        import orjson

        raw = orjson.loads(path.read_bytes())
    except Exception:
        raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Expected JSON object in {path}")
    return raw
