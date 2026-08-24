import { useEffect, useMemo, useRef } from "react";
import { DOC_PAGES, LAYER_DOCS, type DocBlock } from "./docs";

/*
 * One dialog for every piece of reading material — About, Paper, Details,
 * Standards — with a tab rail so a reader can move between them without
 * closing and reopening. The graphics settings deliberately do NOT live here:
 * they need the canvas visible while they are adjusted, so they get a drawer.
 */

type Props = {
  pageId: string | null;
  onPageChange: (id: string) => void;
  onClose: () => void;
  /** Layer to scroll into view when the Details page opens from an entity. */
  focusLayer?: string | null;
};

function LayerTable({ focusLayer }: { focusLayer?: string | null }) {
  const core = Object.entries(LAYER_DOCS).filter(([, d]) => d.group === "core");
  const service = Object.entries(LAYER_DOCS).filter(([, d]) => d.group === "service");

  const render = ([id, d]: [string, (typeof LAYER_DOCS)[string]]) => (
    <div key={id} className={`layer-card ${focusLayer === id ? "focus" : ""}`} id={`layer-${id}`}>
      <div className="layer-card-head">
        <span className="layer-code">{d.code}</span>
        <strong>{d.title}</strong>
        <code>{d.dir}</code>
      </div>
      <p>{d.role}</p>
      {d.classes.length ? (
        <ul className="layer-classes">
          {d.classes.map((c) => (
            <li key={c.name}>
              <code>petras:{c.name}</code> — {c.comment}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  return (
    <>
      <h4 className="layer-group-title">Core layers — the computational backbone</h4>
      {core.map(render)}
      <h4 className="layer-group-title">Service layers</h4>
      {service.map(render)}
    </>
  );
}

function Block({ block, focusLayer }: { block: DocBlock; focusLayer?: string | null }) {
  switch (block.kind) {
    case "p":
      return <p>{block.text}</p>;
    case "note":
      return <p className="doc-note">{block.text}</p>;
    case "code":
      return <pre className="doc-code">{block.text}</pre>;
    case "bullets":
      return (
        <ul className="doc-list">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{j === row.length - 1 && /^petras /.test(cell) ? <code>{cell}</code> : cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "layers":
      return <LayerTable focusLayer={focusLayer} />;
  }
}

export function DocsDialog({ pageId, onPageChange, onClose, focusLayer }: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const page = useMemo(() => DOC_PAGES.find((p) => p.id === pageId) ?? null, [pageId]);

  useEffect(() => {
    if (!pageId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageId, onClose]);

  // A page opens at its top, except when Details was opened from a selected
  // entity: then it lands on that entity's layer. One effect, so the two
  // cannot race each other.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !page) return;
    const target =
      page.id === "details" && focusLayer ? body.querySelector(`#layer-${focusLayer}`) : null;
    if (target) {
      const top = (target as HTMLElement).offsetTop - body.clientHeight / 2 + (target as HTMLElement).clientHeight / 2;
      body.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    } else {
      body.scrollTo({ top: 0 });
    }
  }, [page, focusLayer]);

  if (!page) return null;

  return (
    <div className="docs-backdrop" role="dialog" aria-modal="true" aria-label={page.title}>
      <button type="button" className="docs-scrim" onClick={onClose} aria-label="Close" />
      <div className="docs-dialog">
        <header className="docs-head">
          <nav className="docs-tabs">
            {DOC_PAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === page.id ? "active" : ""}
                onClick={() => onPageChange(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>
          <button type="button" className="docs-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="docs-body" ref={bodyRef}>
          <h2 className="docs-title">{page.title}</h2>
          <p className="docs-lede">{page.lede}</p>
          {page.sections.map((s) => (
            <section key={s.heading} className="docs-section">
              <h3>{s.heading}</h3>
              {s.blocks.map((b, i) => (
                <Block key={i} block={b} focusLayer={focusLayer} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
