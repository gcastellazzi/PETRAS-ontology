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


def generate_demo_project(out: Path, *, name: str = "Demo Project") -> Project:
    """Create a lightweight PETRAS project covering all 7 layers."""
    if out.exists() and any(out.iterdir()):
        # Rebuild into a clean tree under out
        pass
    proj = Project.create(
        out,
        name=name,
        description=(
            "Empty-shell demonstrator aligned with the PETRAS benchmark backbone "
            "(acquisition → mesh → FEM / kinematic → analytics → report)."
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

    # Alternative structural model: kinematic (mechanism) analysis of the same mesh.
    kinematic_model = new_urn_with_kind("kinematicmodel")
    proj.write_entity(
        OntologyLayer.DATASET,
        kinematic_model,
        _entity(
            kinematic_model,
            "KinematicModel",
            label="Kinematic mechanism model",
            description="Rigid-block kinematic model of the west façade (non-FEM)",
            sourceMeshDatasetId=mesh_ds,
            analysisFamily="kinematic",
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

    # --- L4 DataStore (5 FEM results + kinematic result) ---
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

    kinematic_result = new_urn_with_kind("kinematicresult")
    proj.write_entity(
        OntologyLayer.DATASTORE,
        kinematic_result,
        _entity(
            kinematic_result,
            "KinematicResultSet",
            label="Kinematic collapse multipliers",
            analysisType="kinematic_limit",
            sourceModelId=kinematic_model,
            comparedWithModelId=fem_model,
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
    fem_kinematic_compare = new_urn()

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
    proj.write_entity(
        OntologyLayer.DATAANALYTICS,
        fem_kinematic_compare,
        _entity(
            fem_kinematic_compare,
            "AnalysisComparison",
            label="FEM vs kinematic comparison",
            description="Cross-check of FEM stresses against kinematic collapse multipliers for the report",
            basedOn=[results[0], kinematic_result],
            comparedModels=[fem_model, kinematic_model],
        ),
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
        _entity(
            report_full,
            "ProjectReport",
            label="Full comprehensive report",
            template="full",
            description=(
                "Synthesis report citing the project index and the supporting "
                "FEM analysis, annotated survey, FEM/kinematic results, masonry "
                "checks, façade strengthening decision, and tie-rod recommendation"
            ),
        ),
    )
    proj.write_entity(
        OntologyLayer.DATAREPORTING,
        session,
        _entity(session, "AssistantChatSession", label="Assistant session"),
    )

    # --- L3 DataLinks (benchmark operators) ---
    chain: list[tuple[str, str, str, str]] = [
        (cloud_raw, cloud_ds, "cloud.import", "acquire_cloud"),
        (cloud_ds, slice_set, "cloud.slice", "slice2d"),
        (slice_set, mesh_ds, "cloud2fem.mesh", "cloud2fem"),
        (mesh_ds, fem_model, "fem.model", "fem_generator"),
        (mesh_ds, kinematic_model, "kinematic.model", "kinematic_generator"),
        (mat_def, fem_model, "fem.material", "material_library"),
        (fem_model, results[0], "fem.solve", "finetools_engine"),
        (fem_model, results[1], "fem.solve", "finetools_engine"),
        (fem_model, results[2], "fem.solve", "finetools_engine"),
        (fem_model, results[3], "fem.solve", "finetools_engine"),
        (fem_model, results[4], "fem.solve", "finetools_engine"),
        (fem_model, job, "fem.job", "finetools_engine"),
        (kinematic_model, kinematic_result, "kinematic.solve", "kinematic_engine"),
        (results[0], fem_kinematic_compare, "compare.fem", "diagnostics"),
        (kinematic_result, fem_kinematic_compare, "compare.kinematic", "diagnostics"),
        (sensor_sheet, cloud_ds, "documents.attach", "documents"),
        (ext_report, fem_model, "documents.attach", "documents"),
        (diag, mat_def, "documents.attach", "documents"),
        (sensor_raw, sensor_rec, "iot.import", "read_iot"),
        (results[0], masonry, "masonry.check", "masonry_checks"),
        (masonry, decision, "decision.support", "diagnostics"),
        (decision, recommendation, "decision.recommend", "diagnostics"),
        # Full comprehensive report: index hub + evidence cited in the narrative.
        (project_index, report_full, "report.cite", "indexer"),
        (job, report_full, "report.cite", "assistant"),
        (cloud_ds, report_full, "report.cite", "assistant"),
        (results[0], report_full, "report.cite", "assistant"),
        (results[1], report_full, "report.cite", "assistant"),
        (kinematic_result, report_full, "report.cite", "assistant"),
        (fem_kinematic_compare, report_full, "report.cite", "assistant"),
        (masonry, report_full, "report.cite", "assistant"),
        (decision, report_full, "report.cite", "assistant"),
        (recommendation, report_full, "report.cite", "assistant"),
        (temporal, report_full, "report.cite", "event_tracker"),
        (results[0], report_tech, "report.cite", "assistant"),
    ]
    for src, dst, operator, plugin in chain:
        if src == dst:
            continue
        lid = new_urn()
        proj.write_entity(
            OntologyLayer.DATALINK,
            lid,
            _link(lid, maps_from=src, maps_to=dst, operator=operator, plugin=plugin),
        )

    # Explicit inspect link: raw → annotated
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
