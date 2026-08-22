# PETRAS seven layers

PETRAS organises a structural digital twin into **four core layers** and
**three service layers**.

## Core layers (computational backbone)

| Layer | Directory | Role |
|-------|-----------|------|
| L1 DataLake | `datalake/` | Raw artifacts as acquired (surveys, sensor exports) |
| L2 DataSet | `datasets/` | Geometry-anchored, semantically bound models |
| L3 DataLink | `datalinks/` | Executable provenance / geometric mapping / DAG edges |
| L4 DataStore | `datastore/` | Immutable computational facts (e.g. FEM results) |

## Service layers

| Layer | Directory | Role |
|-------|-----------|------|
| L5 DataSources | `datasources/` | Documentary evidence (standards, photos, reports) |
| L6 DataAnalytics | `analytics/` | Cross-layer analytics, ProjectIndex, decision support |
| L7 DataReporting | `reports/` | Cited synthesis, project reports, assistant sessions |

Decision and recommendation objects live in **L6 DataAnalytics**, citing
evidence without introducing new geometry.

Colour palette used by the project map matches the desktop reference
implementation (DataLake gold, DataSet green, DataLink blue, …).
