// IDP tasks (reference/skiing-idp-2025.md), parsed deterministically — one object per Assessment Activity. The file is
// 44 KB, so it is loaded with a dynamic import (its own chunk) only when a mode needs a task list; the parser is pure.
const LEVEL_ORDER = ["LEVEL I", "LEVEL II", "LEVEL III"];

export function parseIdp(text) {
  const out = [];
  const blocks = String(text || "").split(/\n(?=## )/);
  for (const b of blocks) {
    const head = b.match(/^## (.+?) — (Individual Fundamentals|Integrated Fundamentals|Versatility) \(([^)]+)\)/);
    if (!head) continue;
    const section = (label) => { const m = b.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n\\n\\n|$)`)); return m ? m[1].split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean) : []; };
    const focus = b.match(/\*\*Fundamental Focus:\*\*\s*([^\n]+)/)?.[1]?.trim() || "";
    const levels = head[3].split(",").map((s) => s.trim()).filter((s) => LEVEL_ORDER.includes(s));
    out.push({ name: head[1].trim(), category: head[2], levels, focus, ski: section("Ski Performance"), body: section("Body Performance"), terrain: section("Terrain and Tactics") });
  }
  return out;
}

let cache = null;
/** Browser: the task list, loaded once. Node (tests/scripts) can call parseIdp on the file directly. */
export async function loadIdpTasks() {
  if (cache) return cache;
  const mod = await import("../../reference/skiing-idp-2025.md?raw");
  cache = parseIdp(mod.default || mod);
  return cache;
}

/** Tasks an AT candidate is examined on: Level III individual fundamentals plus every integrated / versatility activity. */
export const atTasks = (tasks) => (tasks || []).filter((t) => t.levels.includes("LEVEL III"));
export const findTask = (tasks, name) => { const n = String(name || "").toLowerCase().replace(/\s*\(variant [ab]\)/, "").trim(); return (tasks || []).find((t) => t.name.toLowerCase() === n) || (tasks || []).find((t) => n && t.name.toLowerCase().includes(n)) || null; };

/** The task as text for a prompt: what it requires, skied well. */
export function renderTask(t) {
  if (!t) return "";
  return [`IDP TASK: ${t.name} (${t.category}${t.levels.length ? `; ${t.levels.join(", ")}` : ""})`, t.focus ? `Fundamental focus: ${t.focus}` : null,
    t.ski.length ? `Ski performance:\n${t.ski.map((s) => `- ${s}`).join("\n")}` : null, t.body.length ? `Body performance:\n${t.body.map((s) => `- ${s}`).join("\n")}` : null,
    t.terrain.length ? `Terrain and tactics:\n${t.terrain.map((s) => `- ${s}`).join("\n")}` : null].filter(Boolean).join("\n");
}
