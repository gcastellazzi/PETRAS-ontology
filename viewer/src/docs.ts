/*
 * Descriptive material shown by the documentation dialog.
 *
 * Everything here is transcribed from the repository it documents —
 * ontology/petras.ttl for the classes and the alignment note, docs/layers.md
 * for the layer roles, README.md for the claim/verification table. When the
 * ontology changes, this file is what has to follow it.
 */

export type LayerDoc = {
  code: string;
  title: string;
  dir: string;
  group: "core" | "service";
  role: string;
  classes: { name: string; comment: string }[];
};

/** Keyed by the layer ids used in the exported graph. */
export const LAYER_DOCS: Record<string, LayerDoc> = {
  datalake: {
    code: "L1",
    title: "DataLake",
    dir: "datalake/",
    group: "core",
    role: "Raw artifacts as acquired (surveys, sensor exports), preserved exactly, without semantic interpretation.",
    classes: [
      { name: "SurveyData", comment: "Raw reality-capture artifact, e.g. a point cloud file." },
      { name: "IoTStream", comment: "Raw monitoring time series as exported by the acquisition system. Aligned with sosa:ObservationCollection." },
      { name: "DataEvent", comment: "Discrete occurrence that may affect the interpretation of data acquired around it — an earthquake, a flood, a sensor-drift episode." },
    ],
  },
  datasets: {
    code: "L2",
    title: "DataSet",
    dir: "datasets/",
    group: "core",
    role: "Artifacts carrying explicit geometric structure and semantic binding to the digital twin model.",
    classes: [
      { name: "PointCloudDataSet", comment: "Interpreted point cloud, typically carrying zone labels." },
      { name: "MeshDataSet", comment: "Surface or volumetric mesh discretization of the asset." },
      { name: "FEMDataSet", comment: "Finite element model with materials and boundary conditions assigned." },
      { name: "VoxelDataSet", comment: "Voxel discretization of the asset." },
    ],
  },
  datalinks: {
    code: "L3",
    title: "DataLink",
    dir: "datalinks/",
    group: "core",
    role: "Executable transformation connecting entities. Simultaneously operational provenance, geometric mapping and edge of the pipeline DAG. Aligned with prov:Activity.",
    classes: [
      { name: "GeometricMapping", comment: "Correspondence between the discretizations of two entities." },
      { name: "OperatorChain", comment: "Ordered sequence of operators applied as one transformation." },
    ],
  },
  datastore: {
    code: "L4",
    title: "DataStore",
    dir: "datastore/",
    group: "core",
    role: "Immutable computational facts — FEM results and other outputs that are recorded, never edited.",
    classes: [],
  },
  datasources: {
    code: "L5",
    title: "DataSources",
    dir: "datasources/",
    group: "service",
    role: "Documentary evidence: standards, photographs, historical and technical reports.",
    classes: [],
  },
  analytics: {
    code: "L6",
    title: "DataAnalytics",
    dir: "analytics/",
    group: "service",
    role: "Cross-layer analytics, ProjectIndex and decision support. Decisions and recommendations live here, citing evidence without introducing new geometry.",
    classes: [
      { name: "StatisticalModel", comment: "Model fitted across entities of the lower layers." },
      { name: "AnomalyDetection", comment: "Detection of departures from an expected regime." },
      { name: "DecisionTrigger", comment: "Condition whose satisfaction calls for a decision." },
      { name: "ProjectIndex", comment: "Cross-layer index of the project's entities." },
      { name: "Decision", comment: "Decision taken on the asset, citing the evidence it rests on." },
      { name: "Recommendation", comment: "Recommended course of action, cited rather than computed anew." },
    ],
  },
  reports: {
    code: "L7",
    title: "DataReporting",
    dir: "reports/",
    group: "service",
    role: "Cited synthesis: project reports and assistant sessions, traceable to the entities they cite.",
    classes: [
      { name: "AssistantChatSession", comment: "Recorded assistant session held on the project." },
      { name: "CommandExecutionRecord", comment: "Record of a command executed against the project." },
    ],
  },
};

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; text: string }
  | { kind: "layers" }
  | { kind: "note"; text: string };

export type DocSection = { heading: string; blocks: DocBlock[] };
export type DocPage = { id: string; label: string; title: string; lede: string; sections: DocSection[] };

export const PAPER_TITLE =
  "PETRAS: a discrete, temporal, multi-layer ontology for structural digital twins of historical buildings";
export const PETRAS_VERSION = "0.2.0";
export const PETRAS_AUTHOR = "Giovanni Castellazzi";
export const PETRAS_NS = "https://w3id.org/petras/ontology#";

export const DOC_PAGES: DocPage[] = [
  {
    id: "details",
    label: "Details",
    title: "The technical construct",
    lede: "How the ontology is built: what the seven layers are, why their boundaries are sharp, and what makes a DataLink the load-bearing element of the whole scheme.",
    sections: [
      {
        heading: "Seven layers, four of them computational",
        blocks: [
          {
            kind: "p",
            text: "PETRAS organises a structural digital twin into four core layers, which carry the computation, and three service layers, which carry evidence, analysis and synthesis. Every artifact produced during an assessment belongs to exactly one of them.",
          },
          { kind: "layers" },
        ],
      },
      {
        heading: "The boundaries are disjoint, and now formally so",
        blocks: [
          {
            kind: "p",
            text: "Section 4.5 of the specification calls the boundaries between layers deliberately sharp. Ontology linting showed the claim had never been formalized, so the seven layers are now declared mutually disjoint: an artifact is raw or interpreted, a fact or an inference, never both.",
          },
          {
            kind: "note",
            text: "This is what stops a mesh from quietly being treated as a survey, or an inferred value from being stored as a measured one.",
          },
        ],
      },
      {
        heading: "The DataLink carries three roles at once",
        blocks: [
          {
            kind: "p",
            text: "A DataLink is an executable transformation connecting entities. It is simultaneously the operational provenance of its output, the geometric mapping between two discretizations, and an edge of the pipeline DAG. This is why the viewer can draw the project as a graph without a separate edge vocabulary: the edges are DataLinks.",
          },
          {
            kind: "bullets",
            items: [
              "As provenance, it is a prov:Activity — what ran, with which operator and plugin.",
              "As geometry, a GeometricMapping records the correspondence between the discretizations it relates.",
              "As pipeline, an OperatorChain records an ordered sequence applied as one transformation.",
            ],
          },
        ],
      },
      {
        heading: "Entities are produced, not authored",
        blocks: [
          {
            kind: "p",
            text: "Every entity is written by an operator that ran, together with the DataLink recording the run. Nothing in a project is hand-authored, which is what makes the provenance graph complete rather than decorative.",
          },
          {
            kind: "code",
            text: "python scripts/walkthrough.py --clean   # the graph growing, step by step",
          },
        ],
      },
      {
        heading: "Identity and serialization",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Each entity carries a stable urn:petras: identifier and an entity.jsonld descriptor.",
              "A project is a directory with petras.json at its root and one subdirectory per layer.",
              "The namespace is persistent: " + PETRAS_NS,
            ],
          },
        ],
      },
      {
        heading: "What this viewer shows, and what it does not",
        blocks: [
          {
            kind: "p",
            text: "The viewer reads a connectivity map exported from a project. It shows entities, layers and the DataLinks between them; it never loads geometry payloads. Node size follows the complexity index — degree within the provenance graph — so the entities that carry the pipeline stand out.",
          },
        ],
      },
    ],
  },
  {
    id: "standards",
    label: "Standards",
    title: "Standards and alignments",
    lede: "PETRAS is written in W3C vocabularies and anchored to two of them by subclassing rather than by import.",
    sections: [
      {
        heading: "Built on",
        blocks: [
          {
            kind: "table",
            head: ["Standard", "Role in PETRAS"],
            rows: [
              ["OWL 2 / RDFS", "The ontology itself: classes, subclassing, disjointness."],
              ["JSON-LD 1.1", "Serialization of every entity descriptor, with context.jsonld."],
              ["SHACL", "Validation: ontology/shapes.ttl, run by petras validate."],
              ["SPARQL 1.1", "The ten competency questions, one file each in queries/."],
              ["Dublin Core Terms", "Title, creator and licence of the ontology."],
              ["VANN", "Preferred namespace prefix and URI."],
            ],
          },
        ],
      },
      {
        heading: "Aligned with",
        blocks: [
          {
            kind: "table",
            head: ["Vocabulary", "Alignment"],
            rows: [
              ["PROV-O", "petras:DataLink rdfs:subClassOf prov:Activity"],
              ["SOSA / SSN", "petras:IoTStream rdfs:subClassOf sosa:ObservationCollection"],
            ],
          },
          {
            kind: "note",
            text: "Both are referenced as external anchors and deliberately NOT pulled in with owl:imports. Importing them makes a linter report the pitfalls of the imported vocabularies rather than of PETRAS itself, which drowns the signal. Consumers needing the full axiomatization should import both alongside petras.ttl.",
          },
        ],
      },
      {
        heading: "Identifiers and licence",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Namespace: " + PETRAS_NS + " (persistent, via w3id.org)",
              "Preferred prefix: petras",
              "Ontology version: " + PETRAS_VERSION,
              "Licence: Creative Commons Attribution 4.0",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "paper",
    label: "Paper",
    title: PAPER_TITLE,
    lede: "Each claim the manuscript makes is checkable here, with one command and no account, server or desktop application.",
    sections: [
      {
        heading: "Claims and how to verify them",
        blocks: [
          {
            kind: "table",
            head: ["Claim in the paper", "Command"],
            rows: [
              ["The ontology is serialized in JSON-LD and validated with SHACL", "petras validate demos/cathedral-shell"],
              ["Each competency question is answered by SPARQL over the populated ontology", "petras ask --all --project demos/cathedral-shell"],
              ["One competency question, in isolation", "petras ask CQ4"],
              ["Entities are produced by operators, not authored by hand", "python scripts/walkthrough.py --clean"],
              ["All seven layers are populated through ordinary use", "petras summary demos/cathedral-shell"],
              ["The structure of a real project, without its payloads", "petras summary demos/benchmark-shell"],
            ],
          },
          {
            kind: "note",
            text: "petras ask exits non-zero if any question returns no rows: an unanswered competency question is a failure of the demonstration, not a query that happens to match nothing. The same commands run in CI on every push.",
          },
        ],
      },
      {
        heading: "Nothing here is generated",
        blocks: [
          {
            kind: "p",
            text: "The queries live in queries/, one file per competency question, each opening with the question it answers. The shapes are in ontology/shapes.ttl. Both are read by petras-core; neither is generated, so what you run is what the paper describes.",
          },
        ],
      },
    ],
  },
  {
    id: "about",
    label: "About",
    title: "About PETRAS",
    lede: "Provenance-Enabled digital Twin ontology for Restoration and Structural Analysis.",
    sections: [
      {
        heading: "What it is",
        blocks: [
          {
            kind: "p",
            text: "The semantic backbone of an engineering digital twin of a historical structure: every artifact produced during assessment is represented together with the operations that produced it.",
          },
          {
            kind: "p",
            text: "This repository is independent of the C2F4DTc desktop application. It implements the PETRAS project file format and visualises connectivity and provenance graphs with the same seven-layer colour semantics used in the reference desktop maps.",
          },
        ],
      },
      {
        heading: "Credits",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Author: " + PETRAS_AUTHOR,
              "Ontology version: " + PETRAS_VERSION,
              "Licence: Creative Commons Attribution 4.0",
              "Viewer: React and Vite, static — suitable for GitHub Pages",
            ],
          },
        ],
      },
      {
        heading: "Reading the map",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Colour is the layer; the palette matches the figures in the paper and does not follow the page theme.",
              "Size is the complexity index: an entity's degree in the provenance graph.",
              "An edge is a DataLink — the operator that produced the target from the source.",
              "Selecting an entity narrows the map to its provenance neighbourhood.",
            ],
          },
        ],
      },
    ],
  },
];

/** One-line role per layer, for the entity panel. Derived from LAYER_DOCS. */
export const LayerDocsShort: Record<string, string> = Object.fromEntries(
  Object.entries(LAYER_DOCS).map(([id, d]) => [id, `${d.code} ${d.title} — ${d.role}`]),
);
