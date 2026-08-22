"""CLI entry point: ``petras``."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def cmd_init(args: argparse.Namespace) -> int:
    from .project import Project

    proj = Project.create(Path(args.path), name=args.name or "", description=args.description or "")
    print(f"Created PETRAS project at {proj.root}")
    return 0


def cmd_export_graph(args: argparse.Namespace) -> int:
    from .export_graph import export_graph

    export_graph(
        Path(args.project),
        Path(args.out),
        layout=args.layout,
        entity_id=args.entity,
        translate_legacy=args.legacy,
        hide_missing=args.hide_missing,
    )
    return 0


def cmd_generate_demo(args: argparse.Namespace) -> int:
    # Prefer repo script when available; fall back to bundled generator.
    repo_script = Path(__file__).resolve().parents[2] / "scripts" / "generate_demo_project.py"
    if repo_script.is_file():
        import runpy

        sys.argv = [
            str(repo_script),
            "--out",
            str(args.out),
            "--name",
            args.name or "Cathedral Shell",
        ]
        runpy.run_path(str(repo_script), run_name="__main__")
        return 0

    from .demo import generate_demo_project

    generate_demo_project(Path(args.out), name=args.name or "Cathedral Shell")
    print(f"Generated demo project at {args.out}")
    return 0


def cmd_extract_structure(args: argparse.Namespace) -> int:
    from .extract_structure import clear_destination_layers, extract_structure

    dest = Path(args.destination)
    if args.clean and dest.exists():
        clear_destination_layers(dest)
    stats = extract_structure(
        Path(args.source),
        dest,
        to_petras=not args.keep_legacy,
        strip=not args.no_strip,
        include_empty_placeholders=args.placeholders,
    )
    print(json.dumps(stats, indent=2))
    return 0


def cmd_summary(args: argparse.Namespace) -> int:
    from .project import Project

    proj = Project.open(Path(args.project), translate_legacy=args.legacy)
    print(json.dumps(proj.summary(), indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="petras",
        description="PETRAS ontology project tools (connectivity graphs)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Create an empty PETRAS project")
    p_init.add_argument("path", help="Project directory")
    p_init.add_argument("--name", default="")
    p_init.add_argument("--description", default="")
    p_init.set_defaults(func=cmd_init)

    p_export = sub.add_parser("export-graph", help="Export connectivity graph JSON")
    p_export.add_argument("project", help="Project directory")
    p_export.add_argument("--out", "-o", required=True, help="Output graph.json")
    p_export.add_argument("--layout", default="flow")
    p_export.add_argument("--entity", default=None)
    p_export.add_argument("--legacy", action="store_true")
    p_export.add_argument("--hide-missing", action="store_true")
    p_export.set_defaults(func=cmd_export_graph)

    p_demo = sub.add_parser("generate-demo", help="Generate empty-shell demo project")
    p_demo.add_argument("--out", required=True, help="Output project directory")
    p_demo.add_argument("--name", default="Cathedral Shell")
    p_demo.set_defaults(func=cmd_generate_demo)

    p_extract = sub.add_parser(
        "extract-structure",
        help="Copy project structure without binary/bulk data payloads",
    )
    p_extract.add_argument("source", help="Source project directory")
    p_extract.add_argument("destination", help="Destination directory for the shell")
    p_extract.add_argument(
        "--keep-legacy",
        action="store_true",
        help="Keep c2f4dt.json / urn:c2f4dt: / dataset.jsonld (default: convert to PETRAS)",
    )
    p_extract.add_argument(
        "--no-strip",
        action="store_true",
        help="Do not strip large arrays from JSON-LD (still skips binaries)",
    )
    p_extract.add_argument(
        "--placeholders",
        action="store_true",
        help="Write empty placeholder files for skipped binaries",
    )
    p_extract.add_argument(
        "--clean",
        action="store_true",
        help="Remove existing layer folders in destination before extract",
    )
    p_extract.set_defaults(func=cmd_extract_structure)

    p_sum = sub.add_parser("summary", help="Print project layer counts")
    p_sum.add_argument("project")
    p_sum.add_argument("--legacy", action="store_true")
    p_sum.set_defaults(func=cmd_summary)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
