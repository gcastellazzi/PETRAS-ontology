"""Layer colours and labels — same palette as the PETRAS desktop concept map."""
from __future__ import annotations

LAYER_COLORS: dict[str, str] = {
    "datalake": "#E5C07B",
    "datasets": "#98C379",
    "datalinks": "#61AFEF",
    "datastore": "#D19A66",
    "datasources": "#56B6C2",
    "analytics": "#C678DD",
    "reports": "#E06C75",
    "unknown": "#7F848E",
}

LAYER_LABELS: dict[str, str] = {
    "datalake": "DataLake",
    "datasets": "DataSet",
    "datalinks": "DataLink",
    "datastore": "DataStore",
    "datasources": "DataSources",
    "analytics": "DataAnalytics",
    "reports": "DataReporting",
}

CORE_LAYER_DIRS = ("datalake", "datasets", "datalinks", "datastore")
SERVICE_LAYER_DIRS = ("datasources", "analytics", "reports")
