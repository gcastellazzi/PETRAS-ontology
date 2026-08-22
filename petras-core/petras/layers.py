"""PETRAS ontology layer definitions and filesystem mapping."""
from __future__ import annotations

from enum import Enum


class OntologyLayer(str, Enum):
    """The seven PETRAS layers (core L1–L4, service L5–L7)."""

    DATALAKE = "DataLake"
    DATASET = "DataSet"
    DATALINK = "DataLink"
    DATASTORE = "DataStore"
    DATASOURCES = "DataSources"
    DATAANALYTICS = "DataAnalytics"
    DATAREPORTING = "DataReporting"


LAYER_DIRS: dict[OntologyLayer, str] = {
    OntologyLayer.DATALAKE: "datalake",
    OntologyLayer.DATASET: "datasets",
    OntologyLayer.DATALINK: "datalinks",
    OntologyLayer.DATASTORE: "datastore",
    OntologyLayer.DATASOURCES: "datasources",
    OntologyLayer.DATAANALYTICS: "analytics",
    OntologyLayer.DATAREPORTING: "reports",
}

DIR_TO_LAYER: dict[str, OntologyLayer] = {v: k for k, v in LAYER_DIRS.items()}

LAYER_ORDER: list[str] = list(LAYER_DIRS.values())

CORE_LAYERS = frozenset(
    {
        OntologyLayer.DATALAKE,
        OntologyLayer.DATASET,
        OntologyLayer.DATALINK,
        OntologyLayer.DATASTORE,
    }
)

SERVICE_LAYERS = frozenset(
    {
        OntologyLayer.DATASOURCES,
        OntologyLayer.DATAANALYTICS,
        OntologyLayer.DATAREPORTING,
    }
)

PETRAS_CONTEXT = "https://w3id.org/petras/context.jsonld"
PETRAS_ONTOLOGY_VERSION = "0.2.0"
MANIFEST_NAME = "petras.json"
ENTITY_FILENAME = "entity.jsonld"
LEGACY_ENTITY_FILENAME = "dataset.jsonld"
LEGACY_MANIFEST_NAME = "c2f4dt.json"
