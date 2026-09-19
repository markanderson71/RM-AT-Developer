// §12.2 — why each line scored what it did. Chris's cited statements are quoted inline; PSIA / form citations are
// collapsed; the level-by-level ladder is one click away. Takes a card (lib/scorecard.js), never a summary.
import React from "react";
import { C } from "../theme.js";
import { scoreColor } from "../components/ScoreViews.jsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (d) => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ""; };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const MENTORS = new Set(["chris", "gates", "mike"]);
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
export const mentorCites = (detail, key) => citesFor(detail, key).filter((c) => MENTORS.has(c.author));

export const MentorQuote = ({ c }) => (
  <div style={{ margin: "4px 0 0", padding: "5px 8px", borderLeft: `2px solid ${C.examiner}`, background: "rgba(224,160,64,0.05)", borderRadius: "0 4px 4px 0", fontSize: 12, lineHeight: 1.5 }}>
    <span style={{ fontWeight: 700, color: C.examiner }}>{cap(c.author)}{c.date ? `, ${shortDate(c.date)}` : ""}: </span>
    {c.title && <span style={{ color: C.dim, fontSize: 11 }}>[{c.title}] </span>}
    <span style={{ color: C.body }}>“{statement(c)}”</span>
  </div>
);

export default function Rationale({ card, open = false }) {
  const d = card?.detail;
  if (card?.status !== "scored" || !d?.score_rationale) return null;
  return (
    <details style={{ margin: "8px 0" }} open={open}>
      <summary style={{ fontSize: 12, color: C.muted, cursor: "pointer", fontWeight: 600 }}>Why each score</summary>
      <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginTop: 4 }}>
        {card.lines.map((l) => {
          const why = d.score_rationale[l.key]; if (!why) return null;
          const mentor = mentorCites(d, l.key), other = citesFor(d, l.key).filter((c) => !MENTORS.has(c.author));
          const ladder = d.justifications?.[l.key];
          return (
            <div key={l.key} style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
              <div><span style={{ fontWeight: 700, color: scoreColor(l.score) }}>{l.label} ({l.score ?? "—"}): </span><span style={{ color: "#b0b8c0" }}>{why}</span></div>
              {d.evidence_count?.[l.key] && <div style={{ color: C.dim, marginTop: 2 }}>Evidence — {d.evidence_count[l.key]}</div>}
              {mentor.map((c) => <MentorQuote key={c.id} c={c} />)}
              {(other.length > 0 || ladder) && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3 }}>
                  {other.length > 0 && (
                    <details><summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>{other.length} PSIA / form reference{other.length > 1 ? "s" : ""}</summary>
                      {other.map((c) => <div key={c.id} style={{ fontSize: 11, color: C.muted, margin: "3px 0 0 8px" }}><b>{c.author === "psia" ? "PSIA" : cap(c.author || c.source)}</b>{c.title ? ` — ${c.title}` : ""}: <span style={{ color: C.dim }}>{c.text}</span></div>)}
                    </details>
                  )}
                  {ladder && (
                    <details><summary style={{ fontSize: 11, color: C.dim, cursor: "pointer" }}>Case at each level</summary>
                      {["1", "2", "3", "4", "5"].filter((k) => ladder[k]).map((k) => <div key={k} style={{ fontSize: 11, color: Number(k) === l.score ? C.body : C.muted, margin: "3px 0 0 8px" }}><b style={{ color: scoreColor(Number(k)) }}>{k}</b> — {ladder[k]}</div>)}
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {d.shed?.includes("justifications") && <div style={{ fontSize: 11, color: C.dim }}>The level-by-level cases were trimmed to fit the Sheet cell. Rescore to see them.</div>}
      </div>
    </details>
  );
}
