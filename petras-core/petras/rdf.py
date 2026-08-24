"""Load a PETRAS project into an RDF graph, for SPARQL and SHACL.

Entities are stored as JSON-LD whose ``@context`` is the published URL
``https://w3id.org/petras/context.jsonld``. Resolving that URL at validation
time would make the result depend on the network, so the local
``ontology/context.jsonld`` is substituted before parsing: the graph a reviewer
validates is the one this repository ships.

Requires the optional dependencies::

    pip install -e "./petras-core[rdf]"
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .layers import OntologyLayer
from .project import Project

PETRAS_NS = "https://w3id.org/petras/ontology#"
REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_CONTEXT = REPO_ROOT / "ontology" / "context.jsonld"
LOCAL_SHAPES = REPO_ROOT / "ontology" / "shapes.ttl"
QUERY_DIR = REPO_ROOT / "queries"


def _require_rdflib():
    try:
        import rdflib  # noqa: F401
    except ModuleNotFoundError as exc:  # pragma: no cover - env-dependent
        raise SystemExit(
            'rdflib is required. Install with: pip install -e "./petras-core[rdf]"'
        ) from exc
    return __import__("rdflib")


def load_context() -> dict[str, Any]:
    """Return the local JSON-LD context document."""
    if not LOCAL_CONTEXT.is_file():
        raise FileNotFoundError(f"Context not found: {LOCAL_CONTEXT}")
    return json.loads(LOCAL_CONTEXT.read_text(encoding="utf-8"))


def project_graph(project_dir: Path | str, *, translate_legacy: bool = False):
    """Return an ``rdflib.Graph`` holding every entity of the project.

    Every layer is walked through :class:`~petras.project.Project`, so the
    definition of what counts as an entity stays in one place.
    """
    rdflib = _require_rdflib()
    context = load_context()

    proj = Project.open(Path(project_dir), translate_legacy=translate_legacy)
    graph = rdflib.Graph()
    graph.bind("petras", rdflib.Namespace(PETRAS_NS))
    graph.bind("prov", rdflib.Namespace("http://www.w3.org/ns/prov#"))

    in_layer = rdflib.URIRef(PETRAS_NS + "inLayer")
    for layer in OntologyLayer:
        layer_node = rdflib.URIRef(PETRAS_NS + layer.value)
        for storage_id in proj.list_entities(layer):
            data = dict(proj.read_entity(layer, storage_id))
            # Swap the published context URL for the local document.
            data["@context"] = context["@context"]
            graph.parse(data=json.dumps(data), format="json-ld")
            # Layer membership is structural in PETRAS: an entity belongs to the
            # layer whose directory holds it. Asserting it lets a query select by
            # layer without an OWL reasoner over the subclass hierarchy.
            entity_id = data.get("@id")
            if entity_id:
                graph.add((rdflib.URIRef(entity_id), in_layer, layer_node))

    return graph


def validate(project_dir: Path | str, *, shapes: Path | None = None) -> tuple[bool, str, int]:
    """Validate a project against the SHACL shapes.

    Returns ``(conforms, report_text, violation_count)``.
    """
    _require_rdflib()
    try:
        from pyshacl import validate as shacl_validate
    except ModuleNotFoundError as exc:  # pragma: no cover - env-dependent
        raise SystemExit(
            'pyshacl is required. Install with: pip install -e "./petras-core[rdf]"'
        ) from exc

    shapes_path = Path(shapes) if shapes else LOCAL_SHAPES
    if not shapes_path.is_file():
        raise FileNotFoundError(f"Shapes not found: {shapes_path}")

    data_graph = project_graph(project_dir)
    conforms, results_graph, report = shacl_validate(
        data_graph,
        shacl_graph=str(shapes_path),
        advanced=True,
        inference="none",
    )
    violations = report.count("Constraint Violation")
    return bool(conforms), report, violations


# ── competency questions ──────────────────────────────────────────────

def query_files() -> list[Path]:
    """Return the competency-question query files, in order."""
    if not QUERY_DIR.is_dir():
        return []
    return sorted(QUERY_DIR.glob("cq*.rq"))


def query_title(path: Path) -> str:
    """First ``#`` comment line of a query file, used as its question text."""
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            text = stripped.lstrip("# ").strip()
            if text:
                return text
        elif stripped:
            break
    return path.stem


def resolve_query(name: str) -> Path:
    """Map ``CQ4``/``cq4``/``cq04`` to its query file."""
    digits = "".join(ch for ch in name if ch.isdigit())
    if not digits:
        raise SystemExit(f"Not a competency-question name: {name}")
    target = f"cq{int(digits):02d}.rq"
    path = QUERY_DIR / target
    if not path.is_file():
        raise SystemExit(f"No query file for {name} (expected {path})")
    return path


def run_query(graph, path: Path) -> list[tuple[str, ...]]:
    """Run one SPARQL file and return its rows as tuples of strings."""
    detail = run_query_detail(graph, path)
    return [tuple(row) for row in detail["rows"]]


def run_query_detail(graph, path: Path) -> dict[str, Any]:
    """Run one SPARQL file; return columns, display rows, and raw cell IRIs."""
    query = path.read_text(encoding="utf-8")
    result = graph.query(query)
    columns = [str(v) for v in (result.vars or [])]
    rows: list[list[str]] = []
    raw_rows: list[list[str]] = []
    for row in result:
        display: list[str] = []
        raw: list[str] = []
        for value in row:
            raw.append(_raw(value))
            display.append(_short(value))
        rows.append(display)
        raw_rows.append(raw)
    return {
        "id": _cq_id(path),
        "file": path.name,
        "title": query_title(path),
        "columns": columns,
        "rows": rows,
        "rawRows": raw_rows,
        "rowCount": len(rows),
        "answered": len(rows) > 0,
    }


def _cq_id(path: Path) -> str:
    digits = "".join(ch for ch in path.stem if ch.isdigit())
    return f"CQ{int(digits)}" if digits else path.stem.upper()


def export_cq_answers(project_dir: Path | str, *, translate_legacy: bool = False) -> dict[str, Any]:
    """Run every competency question and return a JSON-serialisable payload."""
    graph = project_graph(project_dir, translate_legacy=translate_legacy)
    questions = [run_query_detail(graph, path) for path in query_files()]
    unanswered = [q["id"] for q in questions if not q["answered"]]
    return {
        "project": str(project_dir),
        "tripleCount": len(graph),
        "questions": questions,
        "unanswered": unanswered,
        "allAnswered": len(unanswered) == 0,
    }


def _raw(value: Any) -> str:
    return str(value) if value is not None else ""


def _short(value: Any) -> str:
    text = str(value) if value is not None else ""
    return text.replace(PETRAS_NS, "petras:").replace("urn:petras:", "")
