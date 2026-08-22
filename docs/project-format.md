# PETRAS project format

Canonical on-disk layout for PETRAS ontology projects. No `c2f4dt` identifiers
appear in files written by this tooling.

## Directory layout

```
<project>/
├── petras.json              # project manifest
├── aliases.json             # optional human aliases → URN
├── datalake/                # L1 DataLake (core)
├── datasets/                # L2 DataSet (core)
├── datalinks/               # L3 DataLink (core)
├── datastore/               # L4 DataStore (core)
├── datasources/             # L5 DataSources (service)
├── analytics/               # L6 DataAnalytics (service)
└── reports/                 # L7 DataReporting (service)
```

## Manifest `petras.json`

```json
{
  "name": "Cathedral Demo",
  "description": "Demonstrative PETRAS project",
  "version": "0.1.0",
  "ontology": "PETRAS",
  "ontologyVersion": "0.2.0",
  "context": "https://w3id.org/petras/context.jsonld"
}
```

## Entities

Each entity lives in `<layer>/urn_petras_<hex>/entity.jsonld`:

```json
{
  "@context": "https://w3id.org/petras/context.jsonld",
  "@id": "urn:petras:a1b2c3d4e5f6",
  "@type": "DataSet",
  "createdAt": "2026-08-22T12:00:00Z",
  "label": "TLS Survey 2024",
  "description": "Empty shell — no geometry attached"
}
```

Empty (shell) projects omit binary payloads (`geometryURI`, NPZ, PDF) but keep
full JSON-LD metadata and DataLink edges so connectivity maps populate.

## Naming: `c2f4dt` → `petras`

| Legacy (C2F4DT desktop) | PETRAS canonical |
|-------------------------|------------------|
| `https://c2f4dt.org/ontology#` | `https://w3id.org/petras/ontology#` |
| prefix `c2f:` | prefix `petras:` |
| `urn:c2f4dt:<hex>` | `urn:petras:<hex>` |
| `c2f4dt.json` | `petras.json` |
| `dataset.jsonld` | `entity.jsonld` |

Legacy projects can be opened read-only via `petras import-legacy` / the
`legacy_import` module, which translates namespaces in memory without writing
`c2f4dt` strings into PETRAS-canonical files.

## Seven-layer architecture

| Layer | Role | Group |
|-------|------|-------|
| L1 DataLake | Raw artifacts | Core |
| L2 DataSet | Geometry-anchored interpretation | Core |
| L3 DataLink | Executable provenance DAG | Core |
| L4 DataStore | Immutable computational facts | Core |
| L5 DataSources | Documentary evidence | Service |
| L6 DataAnalytics | Cross-layer analytics & decision support | Service |
| L7 DataReporting | Cited reports & session logs | Service |
