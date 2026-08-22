"""Generate an empty-shell PETRAS demo aligned with the paper benchmark backbone."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .ids import new_urn, new_urn_with_kind
from .layers import OntologyLayer, PETRAS_CONTEXT
from .project import Project


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _entity(
    entity_id: str,
    etype: str,
    *,
    label: str,
    description: str = "",
    **extra: Any,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "@context": PETRAS_CONTEXT,
        "@id": entity_id,
        "@type": etype,
        "createdAt": _now(),
        "label": label,
        "description": description or "Empty shell — no binary payload",
    }
    data.update(extra)
    return data


def _link(
    link_id: str,
    *,
    maps_from: str,
    maps_to: str,
    operator: str,
    plugin: str,
) -> dict[str, Any]:
    return {
        "@context": PETRAS_CONTEXT,
        "@id": link_id,
        "@type": "DataLink",
        "createdAt": _now(),
        "mapsFrom": maps_from,
        "mapsTo": maps_to,
        "operator": operator,
        "plugin": plugin,
        "parameters": {},
        "label": operator,
    }


def generate_demo_project(out: Path, *, name: str = "Cathedral Shell") -> Project:
    """Create a lightweight PETRAS project covering all 7 layers."""
    if out.exists() and any(out.iterdir()):
        # Rebuild into a clean tree under out
        pass
    proj = Project.create(
        out,
        name=name,
        description=(
            "Empty-shell demonstrator aligned with the PETRAS benchmark backbone "
            "(acquisition → mesh → FEM → analytics → report)."
        ),
    )

    # --- L1 DataLake ---
    cloud_raw = new_urn()
    slice_set = new_urn()
    sensor_raw = new_urn()
    proj.write_entity(
        OntologyLayer.DATALAKE,
        cloud_raw,
        _entity(
            cloud_raw,
            "DataLake",
            label="TLS point cloud (raw)",
            description="Raw survey acquisition metadata only",
            format="las",
        ),
    )
    proj.write_entity(
        OntologyLayer.DATALAKE,
        slice_set,
        _entity(
            slice_set,
            "SliceSet",
            label="Cloud slices Z",
            sourceDatasetId="",  # filled after annotated cloud exists
            nSlices=12,
        ),
    )
    proj.write_entity(
        OntologyLayer.DATALAKE,
        sensor_raw,
        _entity(
            sensor_raw,
            "DataLake",
            label="IoT sensor export",
            format="csv",
        ),
    )

    # --- L2 DataSet ---
    cloud_ds = new_urn()
    mesh_ds = new_urn()
    fem_model = new_urn_with_kind("femmodel")
    proj.write_entity(
        OntologyLayer.DATASET,
        cloud_ds,
        _entity(
            cloud_ds,
            "DataSet",
            label="Annotated point cloud",
            geometryType="pointcloud",
            sourceDatalakeIDs=[cloud_raw],
            version=1,
        ),
    )
    # Fix slice source
    proj.write_entity(
        OntologyLayer.DATALAKE,
        slice_set,
        _entity(
            slice_set,
            "SliceSet",
            label="Cloud slices Z",
            sourceDatasetId=cloud_ds,
            nSlices=12,
        ),
    )
    proj.write_entity(
        OntologyLayer.DATASET,
        mesh_ds,
        _entity(
            mesh_ds,
            "DataSet",
            label="HEX8 solid mesh",
            geometryType="mesh3d",
            sourceDatasetIDs=[cloud_ds],
            version=1,
        ),
    )
    proj.write_entity(
        OntologyLayer.DATASET,
        fem_model,
        _entity(
            fem_model,
            "FEMModel",
            label="FinEtoolsModel_01",
            sourceMeshDatasetId=mesh_ds,
            solverElementType="Hex8",
            solverTheory="solid",
        ),
    )

    # --- L5 DataSources ---
    mat_def = new_urn_with_kind("datasources_mat")
    diag = new_urn_with_kind("datasources_diag")
    sensor_sheet = new_urn()
    ext_report = new_urn()
    for eid, etype, label in (
        (mat_def, "MaterialDefinition", "Clay brick M10"),
        (diag, "DiagnosticRecord", "In-situ stiffness test"),
        (sensor_sheet, "DataSources", "Sensor technical sheet"),
        (ext_report, "DataSources", "Previous external report"),
    ):
        proj.write_entity(
            OntologyLayer.DATASOURCES,
            eid,
            _entity(
                eid,
                etype,
                label=label,
                linkedEntities=[fem_model] if etype == "MaterialDefinition" else [cloud_ds],
            ),
        )

    # --- L4 DataStore (5 FEM results: 2 static + 3 modal) ---
    results: list[str] = []
    for i, kind in enumerate(["linear_statics", "linear_statics", "modal", "modal", "modal"], start=1):
        rid = new_urn_with_kind("femresult")
        results.append(rid)
        proj.write_entity(
            OntologyLayer.DATASTORE,
            rid,
            _entity(
                rid,
                "FEMResultSet",
                label=f"FEM result {i} ({kind})",
                analysisType=kind,
                sourceModelId=fem_model,
            ),
        )

    # --- L6 DataAnalytics ---
    job = new_urn_with_kind("analytics_finetools_job")
    masonry = new_urn_with_kind("analytics_masonry_check")
    point_sel = new_urn_with_kind("analytics")
    sensor_rec = new_urn()
    temporal = new_urn()
    project_index = new_urn()
    cmd_hist = new_urn()
    decision = new_urn()
    recommendation = new_urn()

    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        job,
        _entity(job, "FinEtoolsJob", label="Solver job linear_statics", sourceModelId=fem_model),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        masonry,
        _entity(masonry, "MasonryCheckResult", label="Masonry check NTC", basedOn=results[0]),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        point_sel,
        _entity(point_sel, "PointSelection3D", label="Damage region selection", sourceDatasetId=cloud_ds),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        sensor_rec,
        _entity(
            sensor_rec,
            "SensorRecord",
            label="Monitoring (T, DX, DY)",
            sourceDatalakeIDs=[sensor_raw],
            nSamples=48,
            channels=["Temperature", "DX", "DY"],
        ),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        temporal,
        _entity(
            temporal,
            "TemporalEvent",
            label="2012 Emilia seismic sequence",
            eventType="earthquake",
        ),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        project_index,
        _entity(project_index, "ProjectIndex", label="Project structural index"),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        cmd_hist,
        _entity(cmd_hist, "CommandHistorySnapshot", label="Command history snapshot"),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        decision,
        _entity(decision, "Decision", label="Strengthen west façade", basedOn=masonry),
    )
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        recommendation,
        _entity(recommendation, "Recommendation", label="Install tie rods", basedOn=decision),
    )

    # --- L7 DataReporting ---
    report_tech = new_urn_with_kind("project_report")
    report_full = new_urn_with_kind("project_report")
    session = new_urn_with_kind("assistant_session")
    proj.write_entity(
        OntologyLayer.DATAREPORTING,
        report_tech,
        _entity(report_tech, "ProjectReport", label="Technical internal report", template="technical"),
    )
    proj.write_entity(
        OntologyLayer.DATAREPORTING,
        report_full,
        _entity(report_full, "ProjectReport", label="Full comprehensive report", template="full"),
    )
    proj.write_entity(
        OntologyLayer.DATAREPORTING,
        session,
        _entity(session, "AssistantChatSession", label="Assistant session"),
    )

    # --- L3 DataLinks (benchmark operators) ---
    chain: list[tuple[str, str, str, str]] = [
        (cloud_raw, cloud_ds, "cloud.import", "acquire_cloud"),
        (cloud_ds, cloud_ds, "cloud.inspect", "acquire_cloud"),
        (cloud_ds, slice_set, "cloud.slice", "slice2d"),
        (slice_set, mesh_ds, "cloud2fem.mesh", "cloud2fem"),
        (mesh_ds, fem_model, "fem.model", "fem_generator"),
        (mat_def, fem_model, "fem.material", "material_library"),
        (fem_model, results[0], "fem.solve", "finetools_engine"),
        (fem_model, results[1], "fem.solve", "finetools_engine"),
        (fem_model, results[2], "fem.solve", "finetools_engine"),
        (fem_model, results[3], "fem.solve", "finetools_engine"),
        (fem_model, results[4], "fem.solve", "finetools_engine"),
        (fem_model, job, "fem.job", "finetools_engine"),
        (sensor_sheet, cloud_ds, "documents.attach", "documents"),
        (ext_report, fem_model, "documents.attach", "documents"),
        (diag, mat_def, "documents.attach", "documents"),
        (sensor_raw, sensor_rec, "iot.import", "read_iot"),
        (results[0], masonry, "masonry.check", "masonry_checks"),
        (masonry, decision, "decision.support", "diagnostics"),
        (decision, recommendation, "decision.recommend", "diagnostics"),
        (project_index, report_full, "report.cite", "indexer"),
        (results[0], report_tech, "report.cite", "assistant"),
        (temporal, report_full, "report.cite", "event_tracker"),
    ]
    # cloud.inspect self-edge is awkward; link inspect as cloud_ds → cloud_ds via a
    # separate inspect artifact is fine for demo, but skip self-loops for clarity.
    for src, dst, operator, plugin in chain:
        if src == dst:
            continue
        lid = new_urn()
        proj.write_entity(
            OntologyLayer.DATALINK,
            lid,
            _link(lid, maps_from=src, maps_to=dst, operator=operator, plugin=plugin),
        )

    # Explicit inspect link: raw → annotated (already have import); add inspect meta-link
    inspect_id = new_urn()
    proj.write_entity(
        OntologyLayer.DATALINK,
        inspect_id,
        _link(
            inspect_id,
            maps_from=cloud_raw,
            maps_to=cloud_ds,
            operator="cloud.inspect",
            plugin="acquire_cloud",
        ),
    )

    return proj
