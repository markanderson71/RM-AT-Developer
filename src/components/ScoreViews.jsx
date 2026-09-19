// Score views. They take a CARD from lib/scorecard.js and draw it — they never see a summary and never do arithmetic.
// Used by the AT Exam score screen and MA History, so a session looks the same in both.
import React from "react";
import { C } from "../theme.js";
import { SECTIONS } from "../lib/scorecard.js";

export const scoreColor = (v) => (v == null ? C.faint : v >= 4 ? C.green : v >= 3 ? C.orange : C.red);
const chip = (s, extra = {}) => ({ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: scoreColor(s), background: `${scoreColor(s)}12`, border: `1px solid ${scoreColor(s)}30`, ...extra });

export const MeetsBadge = ({ meets, small }) => meets == null ? null : (
  <span style={{ fontSize: small ? 10 : 12, fontWeight: 800, padding: small ? "2px 6px" : "3px 10px", borderRadius: 5, whiteSpace: "nowrap", color: meets ? C.green : C.red, background: `${meets ? C.green : C.red}14`, border: `1px solid ${meets ? C.green : C.red}40` }}>{meets ? "Meets Standards" : "Does Not Meet"}</span>
);

export const ScorerTag = ({ card }) => card.form === "legacy"
  ? <span title="Pre-2026 lines from the old single-prompt scorer. Runs 1–2 high against Chris. Not comparable with 2026-form scores." style={{ fontSize: 10, fontWeight: 700, color: C.orange, border: `1px solid ${C.orange}40`, borderRadius: 4, padding: "1px 5px" }}>OLD SCORER</span>
  : card.scorer ? <span style={{ fontSize: 10, color: C.dim }}>{card.scorer}</span> : null;

/** One row of chips. 2026: CE Ev Rx | DP Bio Eq. Legacy: D C E P B Co, tagged. */
export const ScoreChips = ({ card, who }) => {
  if (card.status !== "scored") return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }} aria-label={`${who || "AI"} scores`}>
      {who && <span style={{ fontSize: 10, color: C.dim, marginRight: 3, minWidth: 28 }}>{who}</span>}
      {card.lines.map((l, i) => <div key={l.key} title={l.label} style={chip(l.score, { marginLeft: card.form === "2026" && i === 3 ? 6 : 0 })}>{l.score ?? "—"}</div>)}
    </div>
  );
};

/** Full grid: sections, lines, section averages, and an optional second row of numbers (mentor) with per-line delta. */
export const ScoreGrid = ({ card, compare, compareLabel }) => {
  if (card.status !== "scored") return null;
  if (card.form === "legacy") return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
      {card.lines.map((l) => <Cell key={l.key} line={l} />)}
    </div>
  );
  return SECTIONS.map((sec) => {
    const avg = card.sections?.[sec.key], cavg = compare?.sections?.[sec.key];
    return (
      <div key={sec.key} style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{sec.label}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            section average <b style={{ color: scoreColor(avg) }}>{avg != null ? avg.toFixed(2) : "—"}</b>
            {compare && <> · {compareLabel} <b style={{ color: scoreColor(cavg) }}>{cavg != null ? cavg.toFixed(2) : "—"}</b></>}
            <span style={{ color: C.faint }}> / 4 to pass</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {sec.lines.map((l) => <Cell key={l.key} line={card.lines.find((x) => x.key === l.key)} other={compare ? compare.scores[l.key] : undefined} otherLabel={compareLabel} />)}
        </div>
      </div>
    );
  });
};

const Cell = ({ line, other, otherLabel }) => {
  const d = other != null && line.score != null ? line.score - other : null;
  return (
    <div style={{ textAlign: "center", minWidth: 92, flex: 1, padding: "6px 4px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(line.score) }}>{line.score ?? "—"}</div>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{line.label}</div>
      {other !== undefined && (
        <div style={{ fontSize: 11, marginTop: 3, color: C.dim }}>
          {otherLabel} <b style={{ color: scoreColor(other) }}>{other ?? "—"}</b>
          {d != null && <span style={{ marginLeft: 5, fontWeight: 700, color: d === 0 ? C.green : Math.abs(d) === 1 ? C.amber : C.red }}>{d === 0 ? "=" : `AI ${d > 0 ? "+" : ""}${d}`}</span>}
        </div>
      )}
    </div>
  );
};

export const LegacyNotice = ({ card, style }) => card.form !== "legacy" ? null : (
  <div style={{ fontSize: 11, color: C.orange, lineHeight: 1.5, marginBottom: 8, ...style }}>
    Scored by the old scorer on the pre-2026 lines. It has run 1–2 points high against Chris, has no Equipment or Desired Performances line, and gives no pass/fail. These numbers are kept for history and are never averaged with 2026-form scores. Rescore to put this session on the 2026 form.
  </div>
);

export const Diagnostics = ({ card }) => !card.diagnostics?.length ? null : (
  <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>Diagnostics (not on the 2026 form): {card.diagnostics.map((d) => `${d.label} ${d.score ?? "—"}`).join(" · ")}</div>
);

export const Block = ({ tone, label, children }) => (
  <div style={{ marginBottom: 6, padding: "6px 8px", borderRadius: 4, background: `${tone}0f`, border: `1px solid ${tone}1f` }}>
    <span style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}: </span>
    <span style={{ fontSize: 12, color: C.body }}>{children}</span>
  </div>
);
