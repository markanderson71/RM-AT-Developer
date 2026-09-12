// Ported unchanged from ATDevelopmentJournal.jsx. PINs live here as they did before — not in scope to change.
export const USERS = {
  mark:  { name: "Mark",  role: "candidate", pin: "1234", color: "#e07830" },
  chris: { name: "Chris", role: "mentor",    pin: "2345", color: "#28a858" },
  gates: { name: "Gates", role: "mentor",    pin: "3456", color: "#28a858" },
  mike:  { name: "Mike",  role: "mentor",    pin: "4567", color: "#3088cc" },
};

export const SPEAKER = {
  mark: { color: "#60b0d0", label: "Mark" },
  peer: { color: "#c080d0", label: "Peer" },
  examiner: { color: "#e0a040", label: "Examiner" },
  ai: { color: "#7a9ab5", label: "AI" },
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const today = () => new Date().toISOString().split("T")[0];
