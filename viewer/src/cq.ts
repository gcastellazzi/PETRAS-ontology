export type CqQuestion = {
  id: string;
  file: string;
  title: string;
  columns: string[];
  rows: string[][];
  rawRows: string[][];
  rowCount: number;
  answered: boolean;
};

export type CqAnswers = {
  project: string;
  tripleCount: number;
  questions: CqQuestion[];
  unanswered: string[];
  allAnswered: boolean;
};

/** Map SPARQL cell values to graph node ids present in the payload. */
export function matchEntityIds(
  graphNodeIds: Iterable<string>,
  cells: Iterable<string>,
): Set<string> {
  const known = [...graphNodeIds];
  const knownSet = new Set(known);
  const out = new Set<string>();

  for (const cell of cells) {
    const token = String(cell || "").trim();
    if (!token) continue;
    if (knownSet.has(token)) {
      out.add(token);
      continue;
    }
    if (token.startsWith("urn:") && knownSet.has(token)) {
      out.add(token);
      continue;
    }
    const asUrn = token.startsWith("urn:") ? token : `urn:petras:${token}`;
    if (knownSet.has(asUrn)) {
      out.add(asUrn);
      continue;
    }
    // Short ids / typed local names (e.g. femresult:abc…)
    if (token.length < 6) continue;
    for (const id of known) {
      if (id === token || id.endsWith(token) || id.endsWith(`:${token}`) || id.endsWith(`/${token}`)) {
        out.add(id);
      } else if (token.includes(":") && id.includes(token.split(":").pop() || "___")) {
        const local = token.split(":").pop()!;
        if (local.length >= 8 && (id.endsWith(local) || id.includes(local))) out.add(id);
      }
    }
  }
  return out;
}

export function entitiesInQuestion(q: CqQuestion, graphNodeIds: Iterable<string>): Set<string> {
  const cells: string[] = [];
  for (const row of q.rawRows) cells.push(...row);
  for (const row of q.rows) cells.push(...row);
  return matchEntityIds(graphNodeIds, cells);
}
