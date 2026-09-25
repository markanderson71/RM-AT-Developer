// §12.4 — how often the scorer agrees with a mentor's blind scorecard. Draws /api/agreement (lib/agreement.js does the
// math). The response carries AI numbers, so a mentor asks only for his own rows (every one a session he has scored);
// the candidate can look at any mentor's. Blind is the headline; not-blind cards are shown but never count (§9).
import React, { useEffect, useState } from "react";
import { C } from "../theme.js";
import { Card, Hint } from "../components/index.jsx";
import { USERS } from "../lib/users.js";
import { loadAgreement } from "../api.js";
import { agreementView, pctColor } from "../lib/progress.js";
import { shortDate } from "./Rationale.jsx";

const MENTORS = ["chris", "gates", "mike"];
const Pct = ({ v, target, big }) => <span style={{ fontSize: big ? 26 : 14, fontWeight: 800, color: pctColor(v, target) }}>{v == null ? "—" : `${v}%`}</span>;
const Stat = ({ label, v, target, n, big }) => (
  <div style={{ textAlign: "center", minWidth: 96, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
    <Pct v={v} target={target} big={big} />
    <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{label}</div>
    {n != null && <div style={{ fontSize: 10, color: C.dim }}>{n} line{n === 1 ? "" : "s"}{target ? ` · target ${target}%` : ""}</div>}
  </div>
);

export default function AgreementPanel({ viewer, onAuth }) {
  const isMentor = viewer.role === "mentor";
  const [mentor, setMentor] = useState(isMentor ? viewer.key : "chris");
  const [state, setState] = useState({ loading: true, error: "", data: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: "", data: null });
    loadAgreement(mentor).then((d) => alive && setState({ loading: false, error: "", data: d }))
      .catch((e) => { if (!alive) return; if (e.auth) onAuth?.(); setState({ loading: false, error: e.auth ? "auth" : String(e.message || e), data: null }); });
    return () => { alive = false; };
  }, [mentor, viewer.key]);
  const v = agreementView(state.data);

  return (
    <Card style={{ borderLeft: `3px solid ${C.blue}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.blue }}>Agreement — AI scorer vs {USERS[mentor]?.name || mentor}</div>
        {!isMentor && (
          <div style={{ display: "flex", gap: 4 }}>
            {MENTORS.map((m) => <button key={m} type="button" onClick={() => setMentor(m)} style={{ padding: "3px 10px", borderRadius: 5, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${mentor === m ? C.blue : C.faint}`, background: mentor === m ? `${C.blue}18` : "transparent", color: mentor === m ? C.blue : C.muted }}>{USERS[m].name}</button>)}
          </div>
        )}
      </div>
      <Hint style={{ margin: "4px 0 10px", lineHeight: 1.5 }}>Per line, the AI number is the one {isMentor ? "you were" : "the mentor was"} blind to when the card was submitted — a later rescore never moves a past comparison. Only blind cards count toward the targets.</Hint>
      {state.loading && <Hint>Loading…</Hint>}
      {state.error === "auth" && <div style={{ fontSize: 12, color: C.orange }}>Enter the mentor access code above to see agreement.</div>}
      {state.error && state.error !== "auth" && <div style={{ fontSize: 12, color: C.red }}>Couldn't load agreement: {state.error}</div>}
      {v && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Stat label="Exact — blind" v={v.blind.overall?.exact_pct} target={v.targets.exact_pct} n={v.blind.overall?.n} big />
            <Stat label="Within one — blind" v={v.blind.overall?.within_one_pct} target={v.targets.within_one_pct} n={v.blind.overall?.n} big />
            <Stat label="Same result" v={v.blind.same_result?.n ? Math.round((v.blind.same_result.agree / v.blind.same_result.n) * 100) : null} n={v.blind.same_result?.n} big />
            {v.notBlind.overall?.n > 0 && <Stat label="Not blind (reported, not counted)" v={v.notBlind.overall.exact_pct} n={v.notBlind.overall.n} />}
          </div>
          {v.blind.overall?.n === 0 && <Hint style={{ marginTop: 6 }}>No blind scorecard yet{v.notBlind.overall?.n ? " — the cards below were given after the AI score was visible, or the scorer was calibrated on them." : "."}</Hint>}

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
              <thead><tr style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={th}>Line</th><th style={th}>n</th><th style={th}>Exact</th><th style={th}>Within one</th><th style={th}>AI leans</th><th style={th}>Mean Δ (AI − {USERS[mentor]?.name})</th>
              </tr></thead>
              <tbody>{v.per.map((l) => (
                <tr key={l.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={td}><b style={{ color: C.body }}>{l.label}</b></td>
                  <td style={td}>{l.blind.n || 0}</td>
                  <td style={td}><Pct v={l.blind.exact_pct} target={v.targets.exact_pct} /></td>
                  <td style={td}><Pct v={l.blind.within_one_pct} target={v.targets.within_one_pct} /></td>
                  <td style={{ ...td, color: l.lean === "even" ? C.green : l.lean ? C.amber : C.dim }}>{l.lean ? (l.lean === "even" ? "even" : `${l.lean} (${l.blind.ai_over}↑ ${l.blind.ai_under}↓)`) : "—"}</td>
                  <td style={td}>{l.blind.mean_delta == null ? "—" : (l.blind.mean_delta > 0 ? "+" : "") + l.blind.mean_delta}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {v.trend.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Trend — last {v.trend.length} blind card{v.trend.length === 1 ? "" : "s"} (window {v.window})</div>
              <Trend trend={v.trend} targets={v.targets} />
            </div>
          )}
          {Object.keys(v.byScorer).length > 1 && (
            <Hint style={{ marginTop: 6 }}>By scorer version: {Object.entries(v.byScorer).map(([k, t]) => `${k} — exact ${t.exact_pct ?? "—"}% · within one ${t.within_one_pct ?? "—"}% (${t.n})`).join(" · ")}</Hint>
          )}
          {v.sessions.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, color: C.muted, cursor: "pointer", fontWeight: 600 }}>{v.sessions.length} scored session{v.sessions.length === 1 ? "" : "s"}</summary>
              {v.sessions.map((s) => (
                <div key={s.session_id} style={{ fontSize: 12, padding: "4px 0", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: C.body, fontWeight: 600 }}>{shortDate(s.date) || s.session_id}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: s.blind ? C.green : C.orange, border: `1px solid ${s.blind ? C.green : C.orange}40`, borderRadius: 4, padding: "1px 6px" }}>{s.blind ? "blind" : "not blind"}</span>
                  <span style={{ color: C.muted }}>exact {s.exact}/{s.n} · within one {s.within_one}/{s.n}{s.same_result != null ? ` · ${s.same_result ? "same result" : "different result"}` : ""}</span>
                  <span style={{ color: C.dim }}>{v.per.map((l) => { const p = s.per[l.key]; return p?.d == null ? null : <span key={l.key} style={{ marginRight: 6, color: p.d === 0 ? C.green : Math.abs(p.d) === 1 ? C.amber : C.red }}>{l.short} {p.d > 0 ? "+" : ""}{p.d}</span>; })}</span>
                  {s.unpinned && <span style={{ fontSize: 10, color: C.orange }}>compared with the current summary (not pinned)</span>}
                </div>
              ))}
            </details>
          )}
          {v.excluded.length > 0 && <Hint style={{ marginTop: 6 }}>Not compared: {v.excluded.map((e) => `${shortDate(e.date) || e.session_id} — ${e.reason}`).join("; ")}.</Hint>}
        </>
      )}
    </Card>
  );
}

const th = { textAlign: "left", padding: "4px 8px", fontWeight: 700 };
const td = { padding: "5px 8px", color: C.muted, whiteSpace: "nowrap" };

/** Inline SVG: exact % and within-one % per blind card, oldest → newest, with the target lines. */
function Trend({ trend, targets }) {
  const W = 420, H = 90, pad = 22, n = trend.length;
  const x = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1));
  const y = (v) => H - 8 - ((v || 0) / 100) * (H - 16);
  const path = (k) => trend.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", display: "block" }} role="img" aria-label="agreement trend">
      {[[targets.exact_pct, C.orange], [targets.within_one_pct, C.green]].map(([t, col]) => <line key={t} x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} stroke={col} strokeOpacity="0.25" strokeDasharray="3 3" />)}
      <path d={path("within_one_pct")} fill="none" stroke={C.green} strokeWidth="2" />
      <path d={path("exact_pct")} fill="none" stroke={C.orange} strokeWidth="2" />
      {trend.map((t, i) => <g key={t.session_id}><circle cx={x(i)} cy={y(t.within_one_pct)} r="3" fill={C.green} /><circle cx={x(i)} cy={y(t.exact_pct)} r="3" fill={C.orange} /><text x={x(i)} y={H - 1} fontSize="8" fill="#4d6888" textAnchor="middle">{shortDate(t.date)}</text></g>)}
      <text x={pad} y="9" fontSize="8" fill={C.orange}>exact</text><text x={pad + 30} y="9" fontSize="8" fill={C.green}>within one</text>
    </svg>
  );
}
