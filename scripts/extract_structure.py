#!/usr/bin/env python3
"""Extract a minimal structure shell from a PETRAS / C2F4DT project."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "petras-core"))

from petras.extract_structure import clear_destination_layers, extract_structure  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--keep-legacy", action="store_true")
    parser.add_argument("--no-strip", action="store_true")
    parser.add_argument("--placeholders", action="store_true")
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    if args.clean and args.destination.exists():
        clear_destination_layers(args.destination)
    stats = extract_structure(
        args.source,
        args.destination,
        to_petras=not args.keep_legacy,
        strip=not args.no_strip,
        include_empty_placeholders=args.placeholders,
    )
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
