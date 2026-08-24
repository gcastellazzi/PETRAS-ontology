import { matchEntityIds, type CqAnswers, type CqQuestion } from "./cq";

type Props = {
  answers: CqAnswers | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  highlightOn: boolean;
  onHighlightChange: (on: boolean) => void;
  onPickEntities: (ids: Set<string>) => void;
  graphNodeIds: string[];
};

export function CompetencyPanel({
  answers,
  loading,
  error,
  selectedId,
  onSelect,
  highlightOn,
  onHighlightChange,
  onPickEntities,
  graphNodeIds,
}: Props) {
  const selected: CqQuestion | null =
    answers?.questions.find((q) => q.id === selectedId) ?? null;

  return (
    <div className="cq-panel">
      <div className="cq-panel-head">
        <h2>Competency questions</h2>
        {answers ? (
          <span className={`cq-badge ${answers.allAnswered ? "ok" : "warn"}`}>
            {answers.questions.filter((q) => q.answered).length}/{answers.questions.length} answered
          </span>
        ) : null}
      </div>

      {loading ? <p className="hint">Loading SPARQL answers…</p> : null}
      {error ? <p className="hint cq-error">{error}</p> : null}

      {answers ? (
        <>
          <div className="cq-list">
            {answers.questions.map((q) => (
              <button
                key={q.id}
                type="button"
                className={`cq-item ${selectedId === q.id ? "active" : ""} ${q.answered ? "" : "empty"}`}
                onClick={() => onSelect(selectedId === q.id ? null : q.id)}
                title={q.title}
              >
                <span className="cq-id">{q.id}</span>
                <span className="cq-rows">{q.rowCount}</span>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="cq-detail">
              <p className="cq-question">{selected.title}</p>
              <div className="cq-detail-actions">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={highlightOn}
                    onChange={(e) => onHighlightChange(e.target.checked)}
                  />
                  Highlight in graph
                </label>
                <button
                  type="button"
                  className="cq-mini"
                  onClick={() => {
                    const cells = selected.rawRows.flat().concat(selected.rows.flat());
                    onPickEntities(matchEntityIds(graphNodeIds, cells));
                    onHighlightChange(true);
                  }}
                >
                  Focus answers
                </button>
              </div>
              <p className="cq-meta">
                {selected.rowCount} row{selected.rowCount === 1 ? "" : "s"}
                {!selected.answered ? " · unanswered" : ""}
                {" · "}
                <code>petras ask {selected.id}</code>
              </p>
              {selected.rowCount === 0 ? (
                <p className="hint">No bindings — this CQ is unanswered on this project.</p>
              ) : (
                <div className="cq-table-wrap">
                  <table className="cq-table">
                    <thead>
                      <tr>
                        {selected.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.rows.map((row, i) => (
                        <tr
                          key={i}
                          onClick={() => {
                            const ids = matchEntityIds(graphNodeIds, [
                              ...(selected.rawRows[i] || []),
                              ...row,
                            ]);
                            if (ids.size) {
                              onPickEntities(ids);
                              onHighlightChange(true);
                            }
                          }}
                        >
                          {row.map((cell, j) => (
                            <td key={j} title={selected.rawRows[i]?.[j] || cell}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="hint">
              Select CQ1–CQ10 to inspect the SPARQL answer (same results as{" "}
              <code>petras ask</code>).
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
