"""Extract a minimal on-disk project structure without binary / bulk payloads.

Copies layer folders and entity JSON-LD descriptors while stripping large arrays
(geometry groups, point indices, monitoring series, …) so the result stays
small enough for git while preserving connectivity metadata.
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any

from .layers import (
    ENTITY_FILENAME,
    LAYER_DIRS,
    LEGACY_ENTITY_FILENAME,
    LEGACY_MANIFEST_NAME,
    MANIFEST_NAME,
)
from .legacy_import import translate_config, translate_entity

log = logging.getLogger(__name__)

# Skip these top-level directories entirely (runtime / caches / logs).
SKIP_DIRS = frozenset(
    {
        ".git",
        ".venv",
        "__pycache__",
        "logs",
        "cache",
        "iot_web_cache",
        "event_web_cache",
        "repair_backups",
        ".c2f4dt_finetools_jobs",
        "node_modules",
        "viewer",
    }
)

# Binary / bulky payloads — never copy.
SKIP_SUFFIXES = frozenset(
    {
        ".npz",
        ".npy",
        ".npydir",
        ".parquet",
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".ply",
        ".las",
        ".laz",
        ".csv",
        ".tsv",
        ".sqlite",
        ".db",
        ".pv",
        ".vtk",
        ".vtu",
        ".vtp",
        ".stl",
        ".obj",
        ".h5",
        ".hdf5",
        ".zip",
        ".tar",
        ".gz",
        ".bz2",
        ".DS_Store",
    }
)

# Root files that are structural (copy as-is or translated).
ROOT_KEEP_NAMES = frozenset(
    {
        MANIFEST_NAME,
        LEGACY_MANIFEST_NAME,
        "aliases.json",
        "dataset_aliases.json",
        "tombstones.jsonl",
        "iot_source_registry.json",
    }
)

# Keys known to hold bulk geometry / series even when nested under a small dict.
BULK_KEYS = frozenset(
    {
        "nodeGroups",
        "edgeGroups",
        "faceGroups",
        "cellGroups",
        "points",
        "vertices",
        "cells",
        "faces",
        "edges",
        "indices",
        "point_indices",
        "pointIndices",
        "scalars",
        "colors",
        "normals",
        "displacements",
        "stresses",
        "series",
        "samples",
        "values",
        "data",
        "matrix",
        "connectivity",
        "elements",
        "nodes",
        "coordinates",
        "sliceZCoords",
        "commandHistory",
        "commands",
        "events",
        "entities",
        "artifacts",
        "referencedEntities",
    }
)

DEFAULT_MAX_LIST = 24
DEFAULT_MAX_DICT = 48
DEFAULT_MAX_STRING = 4000


# Keys that usually hold absolute filesystem paths — keep basename only in shells.
PATH_KEYS = frozenset(
    {
        "uri",
        "fileURI",
        "geometryURI",
        "julia_script_path",
        "input_model_path",
        "solver_config_path",
        "stdout_log_path",
        "stderr_log_path",
        "result_path",
        "path",
        "file_path",
        "localPath",
    }
)


def strip_payload(
    value: Any,
    *,
    max_list: int = DEFAULT_MAX_LIST,
    max_dict: int = DEFAULT_MAX_DICT,
    max_string: int = DEFAULT_MAX_STRING,
    key: str | None = None,
    depth: int = 0,
) -> Any:
    """Return a structure-preserving stub of *value*, dropping bulk payloads."""
    if isinstance(value, str):
        if key in PATH_KEYS and ("/" in value or "\\" in value):
            name = value.replace("\\", "/").rstrip("/").split("/")[-1]
            return {
                "_stripped": True,
                "kind": "path",
                "name": name,
            }
        if len(value) > max_string:
            return {
                "_stripped": True,
                "kind": "string",
                "length": len(value),
                "preview": value[:120] + "…",
            }
        return value

    if isinstance(value, (int, float, bool)) or value is None:
        return value

    if isinstance(value, list):
        if key in BULK_KEYS or len(value) > max_list:
            sample = []
            for item in value[:2]:
                sample.append(
                    strip_payload(
                        item,
                        max_list=max_list,
                        max_dict=max_dict,
                        max_string=max_string,
                        depth=depth + 1,
                    )
                )
            return {
                "_stripped": True,
                "kind": "list",
                "count": len(value),
                "sample": sample,
            }
        return [
            strip_payload(
                item,
                max_list=max_list,
                max_dict=max_dict,
                max_string=max_string,
                depth=depth + 1,
            )
            for item in value
        ]

    if isinstance(value, dict):
        items = list(value.items())
        # Very wide maps under bulk keys (e.g. thousands of entity ids) → key list only.
        if key in BULK_KEYS and len(items) > max_dict:
            return {
                "_stripped": True,
                "kind": "object",
                "keys": [str(k) for k, _ in items[:max_dict]],
                "keyCount": len(items),
            }
        out: dict[str, Any] = {}
        for k, child in items:
            out[str(k)] = strip_payload(
                child,
                max_list=max_list,
                max_dict=max_dict,
                max_string=max_string,
                key=str(k),
                depth=depth + 1,
            )
        return out

    # Fallback: stringify exotic types
    text = str(value)
    if len(text) > max_string:
        return {"_stripped": True, "kind": "value", "preview": text[:120]}
    return text


def _load_json(path: Path) -> Any:
    try:
        import orjson

        return orjson.loads(path.read_bytes())
    except Exception:
        return json.loads(path.read_text(encoding="utf-8"))


def _dump_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _should_skip_file(path: Path) -> bool:
    name = path.name
    if name.startswith(".") and name not in {".gitkeep"}:
        return True
    suffix = path.suffix.lower()
    if suffix in SKIP_SUFFIXES:
        return True
    # Skip large markdown audits at project root / misc
    if suffix == ".md" and path.parent.name not in {"docs"}:
        return True
    return False


def _process_jsonld(
    src: Path,
    dst: Path,
    *,
    to_petras: bool,
    strip: bool,
) -> None:
    data = _load_json(src)
    if not isinstance(data, dict):
        # Non-object JSON-LD — skip or write empty stub
        _dump_json(dst, {"_stripped": True, "note": "non-object jsonld skipped"})
        return
    if strip:
        data = strip_payload(data)
    if to_petras:
        data = translate_entity(data)
        # Canonical filename for PETRAS
        if dst.name == LEGACY_ENTITY_FILENAME:
            dst = dst.with_name(ENTITY_FILENAME)
    _dump_json(dst, data)


def _copy_root_json(
    src: Path,
    dest_root: Path,
    *,
    to_petras: bool,
) -> None:
    name = src.name

    # JSON Lines (e.g. tombstones.jsonl)
    if src.suffix.lower() == ".jsonl":
        from .legacy_import import translate_value

        lines_out: list[str] = []
        for line in src.read_text(encoding="utf-8").splitlines():
            text = line.strip()
            if not text:
                continue
            try:
                row = json.loads(text)
            except json.JSONDecodeError:
                continue
            if to_petras:
                row = translate_value(row)
            row = strip_payload(row)
            lines_out.append(json.dumps(row, ensure_ascii=False))
        out_path = dest_root / name
        out_path.write_text("\n".join(lines_out) + ("\n" if lines_out else ""), encoding="utf-8")
        return

    data = _load_json(src)
    if name == LEGACY_MANIFEST_NAME and to_petras:
        if isinstance(data, dict):
            data = translate_config(data)
            # Drop bulky GUI camera views to keep shell small
            data.pop("gui_saved_views", None)
        _dump_json(dest_root / MANIFEST_NAME, data)
        return
    if name == MANIFEST_NAME:
        if isinstance(data, dict):
            data.pop("gui_saved_views", None)
        _dump_json(dest_root / MANIFEST_NAME, data)
        return
    if name == "dataset_aliases.json" and to_petras:
        if isinstance(data, dict):
            from .legacy_import import translate_value

            data = translate_value(data)
        _dump_json(dest_root / "aliases.json", data)
        return
    if name == "aliases.json":
        _dump_json(dest_root / "aliases.json", data)
        return
    # Other small root JSON — strip if needed
    if isinstance(data, (dict, list)):
        data = strip_payload(data)
        if to_petras:
            from .legacy_import import translate_value

            data = translate_value(data)
    _dump_json(dest_root / name, data)


def extract_structure(
    source: Path,
    destination: Path,
    *,
    to_petras: bool = True,
    strip: bool = True,
    include_empty_placeholders: bool = False,
) -> dict[str, Any]:
    """Copy *source* project structure into *destination* without bulk data.

    Args:
        source: Existing PETRAS or legacy C2F4DT project directory.
        destination: Target directory (created / overwritten for layer trees).
        to_petras: Translate identifiers and write ``petras.json`` / ``entity.jsonld``.
        strip: Strip large arrays from JSON-LD.
        include_empty_placeholders: If True, write zero-byte stubs for skipped
            binary files so paths referenced in metadata still exist.

    Returns:
        Stats dict with counts and byte totals.
    """
    source = source.resolve()
    destination = destination.resolve()
    if not source.is_dir():
        raise FileNotFoundError(f"Source project not found: {source}")

    dest_existed = destination.exists()
    destination.mkdir(parents=True, exist_ok=True)

    stats: dict[str, Any] = {
        "source": str(source),
        "destination": str(destination),
        "entities": 0,
        "jsonldWritten": 0,
        "binariesSkipped": 0,
        "placeholders": 0,
        "rootFiles": 0,
        "layers": {},
    }

    # Root config / aliases
    for name in ROOT_KEEP_NAMES:
        src = source / name
        if src.is_file():
            _copy_root_json(src, destination, to_petras=to_petras)
            stats["rootFiles"] += 1

    # Ensure PETRAS manifest exists when translating from legacy
    if to_petras and not (destination / MANIFEST_NAME).exists():
        legacy = source / LEGACY_MANIFEST_NAME
        if legacy.is_file():
            _copy_root_json(legacy, destination, to_petras=True)
            stats["rootFiles"] += 1

    layer_names = list(LAYER_DIRS.values())
    for layer_dir in layer_names:
        src_layer = source / layer_dir
        dst_layer = destination / layer_dir
        dst_layer.mkdir(parents=True, exist_ok=True)
        layer_count = 0
        if not src_layer.is_dir():
            stats["layers"][layer_dir] = 0
            continue

        for entity_dir in sorted(src_layer.iterdir()):
            if not entity_dir.is_dir():
                continue
            if entity_dir.name.startswith("."):
                continue
            dst_entity = dst_layer / entity_dir.name
            # When translating to PETRAS, rename urn_c2f4dt_* folders
            if to_petras and entity_dir.name.startswith("urn_c2f4dt_"):
                dst_entity = dst_layer / entity_dir.name.replace("urn_c2f4dt_", "urn_petras_", 1)
            dst_entity.mkdir(parents=True, exist_ok=True)
            layer_count += 1
            stats["entities"] += 1

            for path in sorted(entity_dir.rglob("*")):
                if path.is_dir():
                    continue
                rel = path.relative_to(entity_dir)
                # Skip nested caches
                if any(part in SKIP_DIRS or part.startswith(".c2f4dt") for part in rel.parts):
                    continue

                if path.suffix.lower() == ".jsonld" or path.name in {
                    ENTITY_FILENAME,
                    LEGACY_ENTITY_FILENAME,
                }:
                    out_name = path.name
                    if to_petras and path.name == LEGACY_ENTITY_FILENAME:
                        out_name = ENTITY_FILENAME
                    dst_file = dst_entity / out_name
                    # Flatten: only keep top-level jsonld in entity dir for shell
                    if len(rel.parts) > 1:
                        # Keep relative structure for sub-object metadata (pointcloud.jsonld)
                        dst_file = dst_entity / rel
                        if to_petras and dst_file.name == LEGACY_ENTITY_FILENAME:
                            dst_file = dst_file.with_name(ENTITY_FILENAME)
                    _process_jsonld(path, dst_file, to_petras=to_petras, strip=strip)
                    stats["jsonldWritten"] += 1
                    continue

                if path.suffix.lower() == ".json":
                    # Small sidecar JSON (e.g. slice_materials) — strip and keep
                    data = _load_json(path)
                    data = strip_payload(data) if strip else data
                    if to_petras:
                        from .legacy_import import translate_value

                        data = translate_value(data)
                    dst_file = dst_entity / rel
                    _dump_json(dst_file, data)
                    continue

                if _should_skip_file(path):
                    stats["binariesSkipped"] += 1
                    if include_empty_placeholders:
                        stub = dst_entity / rel
                        stub.parent.mkdir(parents=True, exist_ok=True)
                        stub.write_bytes(b"")
                        stats["placeholders"] += 1
                    continue

                # Unknown small text files — skip by default to stay minimal
                stats["binariesSkipped"] += 1

        stats["layers"][layer_dir] = layer_count

    # Write a short README in the shell project
    readme = destination / "STRUCTURE_SHELL.md"
    readme.write_text(
        "\n".join(
            [
                "# Structure shell",
                "",
                f"Extracted from `{source}` without binary payloads.",
                "Large JSON-LD arrays are replaced with `_stripped` stubs.",
                "Use this tree for connectivity maps and format demos only.",
                "",
                f"to_petras={to_petras}  strip={strip}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    total_bytes = sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())
    stats["totalBytes"] = total_bytes
    stats["destExisted"] = dest_existed
    log.info(
        "Extracted structure: %s entities, %s jsonld, %s bytes → %s",
        stats["entities"],
        stats["jsonldWritten"],
        total_bytes,
        destination,
    )
    return stats


def clear_destination_layers(destination: Path) -> None:
    """Remove existing layer directories under *destination* before a clean extract."""
    for layer_dir in LAYER_DIRS.values():
        path = destination / layer_dir
        if path.is_dir():
            shutil.rmtree(path)
