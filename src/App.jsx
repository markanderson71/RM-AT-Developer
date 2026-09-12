import React, { useEffect, useState } from "react";
import { C, font, GLOBAL_CSS } from "./theme.js";
import { ATIcon, Card } from "./components/index.jsx";
import { USERS } from "./lib/users.js";
import { loadConfig, loadMaSessions } from "./api.js";
import Sparring from "./tabs/Sparring.jsx";
import referenceText from "../reference/psia.md?raw";

const OLD_APP = "https://at-dev-tracker.vercel.app";

// Tabs land here one session at a time (§13). Until then, the link to the old app covers the rest.
const TABS = [
  { id: "sparring", label: "Sparring Partner", roles: ["candidate"] },
];

const Shell = ({ children, center }) => (
  <div style={{ fontFamily: font, minHeight: "100vh", background: C.bg, color: C.text, ...(center ? { display: "flex", alignItems: "center", justifyContent: "center" } : {}) }}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
    <style>{GLOBAL_CSS}</style>
    {children}
  </div>
);

const PinInput = ({ user, onOk, onBack }) => {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(false);
  return (
    <div style={{ marginTop: 16, textAlign: "center" }}>
      <div style={{ fontSize: 14, color: C.body, marginBottom: 8 }}>PIN for {user.name}</div>
      <input type="password" inputMode="numeric" maxLength={4} value={pin} autoFocus onChange={(e) => {
        const v = e.target.value; setPin(v); setErr(false);
        if (v.length === 4) { if (v === user.pin) onOk(); else { setErr(true); setPin(""); } }
      }} style={{ width: 120, textAlign: "center", padding: 10, fontSize: 22, letterSpacing: 8, color: C.body, background: "rgba(255,255,255,0.03)", border: `2px solid ${err ? C.red : "rgba(255,255,255,0.1)"}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }} />
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>Wrong PIN</div>}
      <div><button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", marginTop: 12 }}>← Back</button></div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);         // { key, ...USERS[key] }
  const [pending, setPending] = useState(null);   // key awaiting PIN
  const [tab, setTab] = useState("sparring");
  const [data, setData] = useState({ loaded: false, error: false, maSessions: [], config: {} });

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [maSessions, config] = await Promise.all([loadMaSessions(), loadConfig()]);
      if (!alive) return;
      setData({ loaded: true, error: maSessions.length === 0 && Object.keys(config).length === 0, maSessions, config });
    })();
    return () => { alive = false; };
  }, [user]);

  if (!user) {
    return (
      <Shell center>
        <div style={{ width: "100%", maxWidth: 340, padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <ATIcon size={64} />
            <div style={{ fontSize: 28, fontWeight: 800, color: C.amber, letterSpacing: "-0.03em", marginTop: 12 }}>AT Journal</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Alpine Trainer Development</div>
          </div>
          {!pending && Object.entries(USERS).map(([key, u]) => (
            <button key={key} onClick={() => setPending(key)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", marginBottom: 8, borderRadius: 8, cursor: "pointer", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "left", fontFamily: "inherit" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${u.color}20`, border: `2px solid ${u.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: u.color }}>{u.name[0]}</div>
              <div><div style={{ fontSize: 15, fontWeight: 700, color: C.body }}>{u.name}</div><div style={{ fontSize: 12, color: C.muted }}>{u.role === "candidate" ? "Candidate" : "Mentor / Assessor"}</div></div>
            </button>
          ))}
          {pending && <PinInput user={USERS[pending]} onOk={() => { setUser({ key: pending, ...USERS[pending] }); setPending(null); }} onBack={() => setPending(null)} />}
        </div>
      </Shell>
    );
  }

  const visibleTabs = TABS.filter((t) => t.roles.includes(user.role));
  const mentorAssessments = (() => { try { return data.config._MENTOR_ASSESSMENTS ? JSON.parse(data.config._MENTOR_ASSESSMENTS) : {}; } catch { return {}; } })();

  return (
    <Shell>
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "18px 16px 12px", background: "rgba(255,255,255,0.01)" }}>
        <div className="at-container">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ATIcon size={28} />
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.04em", color: "#f0f4f8" }}>AT Journal</span>
              <span style={{ fontSize: 13, color: C.dim, fontWeight: 500 }}>Mark · Keystone</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${user.color}20`, border: `1.5px solid ${user.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: user.color }}>{user.name[0]}</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.body }}>{user.name}</span>
              <button onClick={() => setUser(null)} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer" }}>logout</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {visibleTabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: tab === t.id ? "1.5px solid rgba(224,120,48,0.45)" : "1.5px solid rgba(255,255,255,0.07)", background: tab === t.id ? "rgba(224,120,48,0.1)" : "rgba(255,255,255,0.015)", color: tab === t.id ? C.amber : C.muted }}>{t.label}</button>
            ))}
            <a href={OLD_APP} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: C.dim, textDecoration: "none" }}>Everything else is on the old app ↗</a>
          </div>
          {data.loaded && data.error && (
            <div style={{ margin: "8px 0 0", padding: "8px 12px", borderRadius: 6, background: "rgba(224,80,40,0.12)", border: "1px solid rgba(224,80,40,0.3)", fontSize: 12, color: C.red, fontWeight: 600 }}>Couldn't load data from the Sheet. You can still run an exam; saving will retry the connection.</div>
          )}
        </div>
      </div>

      <div className="at-container" style={{ padding: "16px 16px 60px" }}>
        {!data.loaded ? <div style={{ color: C.muted, padding: 20 }}>Loading…</div> : (
          <>
            {tab === "sparring" && <Sparring maSessions={data.maSessions} mentorAssessments={mentorAssessments} referenceText={referenceText}
              onSaved={(s) => setData((d) => ({ ...d, maSessions: [s, ...d.maSessions.filter((x) => x.id !== s.id)] }))} />}
            {visibleTabs.length === 0 && <Card><div style={{ fontSize: 14, color: C.muted }}>Mentor views arrive in sessions 5–8. Until then, use the <a href={OLD_APP} style={{ color: C.blue }}>old app</a>.</div></Card>}
          </>
        )}
      </div>
    </Shell>
  );
}
