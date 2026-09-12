// Visual tokens ported from ATDevelopmentJournal.jsx — same look, one place.
export const C = {
  bg: "linear-gradient(178deg, #070c18 0%, #0d1828 35%, #101e34 100%)",
  text: "#e0e8f0", body: "#d0d8e0", muted: "#7a9ab5", dim: "#4d6888", faint: "#3a5068",
  orange: "#e07830", amber: "#e8a050", red: "#e05028", green: "#28a858", blue: "#3088cc",
  exam: "#d06060", purple: "#c060a0",
  mark: "#60b0d0", peer: "#c080d0", examiner: "#e0a040",
};

export const font = "'DM Sans', system-ui, sans-serif";

export const inp = {
  padding: "8px 10px", fontSize: 14, color: "#c0ccd8", background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box", width: "100%",
};
export const txta = { ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.6 };
export const lbl = {
  fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
  display: "block", marginBottom: 4,
};

/** Tinted button style. tone = hex accent. */
export const btn = (tone, { solid = false, disabled = false } = {}) => ({
  padding: "10px 14px", borderRadius: 7, fontSize: 14, fontWeight: 700, fontFamily: "inherit",
  cursor: disabled ? "default" : "pointer",
  background: disabled ? "rgba(255,255,255,0.03)" : solid ? `linear-gradient(135deg, ${tone}, ${tone}cc)` : `${tone}14`,
  border: solid ? "none" : `1px solid ${disabled ? "rgba(255,255,255,0.06)" : tone + "40"}`,
  color: disabled ? C.dim : solid ? "#fff" : tone,
});

export const GLOBAL_CSS = `
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
  .at-container { max-width: 760px; margin: 0 auto; }
  textarea:focus, input:focus, select:focus { border-color: rgba(224,120,48,0.5) !important; }
  button:focus-visible { outline: 2px solid rgba(224,120,48,0.6); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;
