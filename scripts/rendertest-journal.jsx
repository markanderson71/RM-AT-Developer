// Render check for the Journal tab against a real Journal export: candidate list, mentor list, one entry as each, the form.
// npx esbuild scripts/rendertest-journal.jsx --bundle --platform=node --format=esm --jsx=automatic --loader:.js=jsx --external:react --external:react-dom --outfile=_rt.mjs && node _rt.mjs Journal.json [Config.json]
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import Journal from "../src/tabs/Journal.jsx";
import JournalEntryForm from "../src/tabs/JournalEntryForm.jsx";
import JournalThread from "../src/tabs/JournalThread.jsx";
import { normalizeJournalRow, hasTypeColumn, byEntryDesc, newEntry, DEFAULT_THEMES, saveDraft } from "../src/lib/journal.js";
import { USERS } from "../src/lib/users.js";

const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).rows;
const config = process.argv[3] ? Object.fromEntries(JSON.parse(fs.readFileSync(process.argv[3], "utf8")).rows.map((r) => [String(r.id).trim(), r.data])) : {};
const journal = { entries: rows.map(normalizeJournalRow).filter(Boolean).sort(byEntryDesc), typeColumn: hasTypeColumn(rows) };
const u = (k) => ({ key: k, ...USERS[k] });
const text = (h) => h.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&quot;/g, "'").replace(/\s+/g, " ");
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); };
const noop = () => {};
const props = { journal, loaded: true, config, mentorAssessments: {}, onEntries: noop };

const mark = text(renderToString(<Journal user={u("mark")} {...props} />));
const chris = text(renderToString(<Journal user={u("chris")} {...props} />));
const gates = text(renderToString(<Journal user={u("gates")} {...props} />));
ok(mark.includes("+ New Entry") && mark.includes("Entry types are not being saved") && mark.includes("Can I see past the symptom"), "candidate list: new-entry button, entryType warning, default theme filters (Config._THEMES is empty)");
ok(mark.includes("Chris challenge no ski to ski or edging at all.") && mark.includes("Ski is white over white"), "list card carries a second line of the entry");
ok(mark.includes("What was really going on underneath?") && mark.includes("Being able to detect"), "short first answer → second line is the next prompt, labelled");
ok(mark.includes("◇ Connecting") && mark.includes("💬 1"), "depth badge and comment count from the live rows");
ok(!chris.includes("+ New Entry") && !chris.includes("Entry types are not being saved") && !chris.includes("Delete entry"), "mentor list: read-only, no Sheet housekeeping");
ok((chris.match(/Needs your read/g) || []).length === journal.entries.filter((e) => !e.mentorPulse.chris).length && (gates.match(/Needs your read/g) || []).length === journal.entries.length, "mentor list flags the entries THIS mentor has not assessed");
ok(!mark.includes("🎿 On-Hill Coaching"), "an entry with no stored type is not labelled as Coaching");

const e = journal.entries.find((x) => x.mentorComments.length) || journal.entries[0];
const tChris = text(renderToString(<JournalThread entry={e} user={u("chris")} onChange={noop} />));
const tMark = text(renderToString(<JournalThread entry={e} user={u("mark")} onChange={noop} />));
ok(tChris.includes("How deep is Mark's thinking here?") && tChris.includes("tap your choice again to clear it") && /aria-pressed="true"[^>]*>[^<]*◇ Connecting/.test(renderToString(<JournalThread entry={e} user={u("chris")} onChange={noop} />)), "mentor: three depth buttons, his current choice pressed, clear hint");
ok(!tMark.includes("How deep is") && tMark.includes("Chris ◇ Connecting") && tMark.includes("What else could be a root cause?") && tMark.includes("Post"), "candidate: depth read-only with who gave it, thread, reply box");

const form = text(renderToString(<JournalEntryForm initial={newEntry("clinic")} saved={null} restored={false} themes={DEFAULT_THEMES} typeColumn={false} recipients={[{ key: "chris", email: "c@x" }]} onSave={noop} onBack={noop} onDiscard={noop} />));
ok(["🎿", "⛷", "📋", "💬", "📖", "📝"].every((i) => form.includes(i)) && form.includes("1. What was the subject / focus?") && form.includes("6. Questions that remain") && !form.includes("What did I see?"), "form: six types; prompts follow the selected type");
ok(form.includes("Movement Analysis") && form.includes("CAP Integration") && form.includes("Which themes does this push on?") && form.includes("R-MA1") && form.includes("Saving emails chris (c@x)"), "form: connection tags, theme tags, resource link, who gets mailed");
const gen = text(renderToString(<JournalEntryForm initial={{ ...newEntry("general"), whatHappened: "typed under Coaching" }} saved={null} themes={[]} typeColumn recipients={[]} onSave={noop} onBack={noop} onDiscard={noop} />));
ok(gen.includes("3. Additional thoughts") && !gen.includes("4.") && gen.includes("won't be saved") && gen.includes("nobody will be notified"), "General Note: three prompts; hidden answer and empty recipient list are called out");
saveDraft("new", { ...newEntry("study"), whatISaw: "half-written" });
ok(text(renderToString(<Journal user={u("mark")} {...props} />)).includes("Continue draft"), "an unsaved new entry is offered back from the list");

const vMark = text(renderToString(<Journal user={u("mark")} {...props} openId={e.id} />));
const vChris = text(renderToString(<Journal user={u("chris")} {...props} openId={e.id} />));
ok(vMark.includes("Challenge My Thinking") && vMark.includes("Edit") && vMark.includes("Delete entry") && vMark.includes("Inspired by") && vMark.includes("Themes"), "candidate entry view: challenge, edit, delete, resource, themes");
ok(!vChris.includes("Challenge My Thinking") && !vChris.includes("Delete entry") && !/>Edit</.test(renderToString(<Journal user={u("chris")} {...props} openId={e.id} />)) && vChris.includes("How deep is Mark's thinking here?"), "mentor entry view: no challenge / edit / delete; depth assessment present");
