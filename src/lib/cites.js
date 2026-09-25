// Citation readers shared by Rationale, CoachingPanel and the Progress tab. Pure (no React), so scripts can import them.
export const MENTORS = new Set(["chris", "gates", "mike"]);
/**
 * Chunk text is stored as "Chris on MA session … — <title>\n\n<his words>". The provenance line and the title were
 * written at ingest, not by Chris — only what follows goes inside the quotation marks.
 */
export const statement = (d) => {
  const t = String(d.text || ""); const i = t.indexOf("\n\n");
  const body = i > 0 && i < 260 && t.slice(0, i).includes(" — ") ? t.slice(i + 2) : t;
  return body.replace(/\s*\n+\s*/g, " ").trim();
};

export const citesFor = (detail, key) => (detail?.citations?.[key] || []).map((id) => ({ id, ...(detail.citation_details?.[id] || {}) })).filter((c) => c.text || c.title);
/** A mentor's STATEMENTS — what goes inside quotation marks. A scored session (exemplar) is his number, not his words. */
export const mentorCites = (detail, key) => citesFor(detail, key).filter((c) => MENTORS.has(c.author) && c.type !== "exemplar");
export const exemplarCites = (detail, key) => citesFor(detail, key).filter((c) => MENTORS.has(c.author) && c.type === "exemplar");

