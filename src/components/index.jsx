import React, { useEffect, useRef, useState } from "react";
import { C, inp, txta, lbl, btn } from "../theme.js";

export const ATIcon = ({ size = 28 }) => (
  <svg viewBox="0 0 300 300" width={size} height={size} style={{ borderRadius: size * 0.2, flexShrink: 0 }} aria-hidden="true">
    <rect width="300" height="300" rx="60" fill="#1a2538"/>
    <polygon points="0,230 90,90 130,130 180,70 240,150 300,230" fill="#2a4060"/>
    <polygon points="0,230 70,130 120,170 160,110 210,160 300,230" fill="#1e3350"/>
    <polygon points="0,260 50,170 100,210 140,150 190,190 250,160 300,260" fill="#162840"/>
    <polygon points="180,70 160,98 170,90 180,100 190,88 200,98" fill="#e0e8f0"/>
    <polygon points="90,90 75,110 85,104 95,112 105,102" fill="#d0dae6"/>
    <path d="M60,250 Q90,190 130,170 Q170,150 200,180 Q230,210 250,190" fill="none" stroke="#e07830" strokeWidth="3" strokeLinecap="round"/>
    <text x="150" y="58" textAnchor="middle" fontFamily="system-ui" fontSize="42" fontWeight="500" fill="#e8a050" letterSpacing="8">AT</text>
    <circle cx="130" cy="198" r="4" fill="#e07830"/><circle cx="170" cy="182" r="5" fill="#d06060"/><circle cx="210" cy="192" r="4" fill="#e07830"/>
  </svg>
);

export const Card = ({ children, style = {} }) => (
  <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 14px", marginBottom: 10, ...style }}>{children}</div>
);

export const SectionLabel = ({ children, style }) => <div style={{ ...lbl, marginBottom: 6, ...style }}>{children}</div>;

export const Field = ({ label, children }) => (
  <div style={{ marginBottom: 8 }}>{label && <label style={lbl}>{label}</label>}{children}</div>
);

export const Input = (props) => <input {...props} style={{ ...inp, ...(props.style || {}) }} />;
export const Select = (props) => <select {...props} style={{ ...inp, cursor: "pointer", appearance: "auto", ...(props.style || {}) }} />;

/** Controlled textarea with optional mic. Mic output appends to the controlled value — never to the DOM. */
export const Textarea = ({ value, onChange, mic = true, style, ...rest }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} {...rest} style={{ ...txta, flex: 1, ...(style || {}) }} />
    {mic && <MicButton onResult={(t) => onChange(value ? `${value} ${t}` : t)} />}
  </div>
);

export const Button = ({ tone = C.orange, solid, disabled, style, children, ...rest }) => (
  <button disabled={disabled} {...rest} style={{ ...btn(tone, { solid, disabled }), ...(style || {}) }}>{children}</button>
);

export const Hint = ({ children, style }) => <div style={{ fontSize: 11, color: C.dim, ...(style || {}) }}>{children}</div>;

// ── Speech (harvested) ───────────────────────────────────────────────────────
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const MicButton = ({ onResult, style }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const cb = useRef(onResult); cb.current = onResult;
  useEffect(() => () => recRef.current?.stop(), []);
  const toggle = () => {
    if (listening && recRef.current) { recRef.current.stop(); setListening(false); return; }
    if (!SR) { alert("Speech recognition isn't available in this browser. Use Chrome or Edge."); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
    rec.onresult = (ev) => {
      let text = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) text += ev.results[i][0].transcript;
      if (text.trim()) cb.current(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
  };
  return (
    <button type="button" onClick={toggle} title={listening ? "Stop" : "Speak"} aria-pressed={listening} style={{
      padding: "6px 10px", borderRadius: 6, fontSize: 16, cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
      background: listening ? "rgba(224,60,60,0.15)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${listening ? "rgba(224,60,60,0.4)" : "rgba(255,255,255,0.1)"}`,
      color: listening ? "#e04040" : C.muted, animation: listening ? "pulse 1.5s infinite" : "none", ...style,
    }}>{listening ? "⏹" : "🎤"}</button>
  );
};

export function speakText(text) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, "").replace(/\n+/g, ". "));
  utt.rate = 1.0; utt.pitch = 1.0;
  window.speechSynthesis.speak(utt);
}

export const SpeakButton = ({ text }) => (
  <button type="button" onClick={() => speakText(text)} title="Listen" style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer", padding: "2px 4px" }}>🔊</button>
);

// ── Chat thread + composer ──────────────────────────────────────────────────
export const Thread = ({ messages, me, them, meLabel, themLabel, loading, loadingText, maxHeight = 300 }) => {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, loading]);
  return (
    <div style={{ marginBottom: 8, maxHeight, overflowY: "auto" }}>
      {messages.map((m, i) => {
        const mine = m.role === "user";
        return (
          <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 6 }}>
            <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: 10, background: mine ? `${me}14` : `${them}0c`, border: `1px solid ${mine ? me + "26" : them + "1f"}` }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: mine ? me : them, marginBottom: 2 }}>{mine ? meLabel : themLabel}</div>
              <div style={{ fontSize: 13, color: C.body, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}{!mine && <SpeakButton text={m.content} />}</div>
            </div>
          </div>
        );
      })}
      {loading && <div style={{ fontSize: 12, color: them, padding: 4 }}>{loadingText}</div>}
      <div ref={endRef} />
    </div>
  );
};

/** Controlled composer: draft survives re-renders and reloads (parent owns it). Ctrl/⌘+Enter sends. */
export const Composer = ({ value, onChange, onSend, disabled, placeholder, tone, sendLabel = "Send" }) => {
  const send = () => { const t = value.trim(); if (t && !disabled) onSend(t); };
  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 4 }}>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          style={{ ...txta, minHeight: 40, flex: 1, fontSize: 13 }} />
        <Button tone={tone} onClick={send} disabled={disabled || !value.trim()} style={{ padding: "8px 12px", fontSize: 13 }}>{sendLabel}</Button>
        <MicButton onResult={(t) => onChange(value ? `${value} ${t}` : t)} />
      </div>
      <Hint style={{ marginBottom: 8 }}>Ctrl+Enter to send · 🎤 to speak</Hint>
    </>
  );
};
