#!/usr/bin/env python3
"""CLI wrapper: generate empty-shell PETRAS demo project."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "petras-core"))

from petras.demo import generate_demo_project  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--name", default="Demo Project")
    args = parser.parse_args()
    proj = generate_demo_project(args.out, name=args.name)
    counts = proj.layer_counts()
    print(f"Generated {proj.root}")
    for layer, n in counts.items():
        print(f"  {layer}: {n}")
    print(f"  total: {sum(counts.values())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
