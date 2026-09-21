// Journal (§13 row 7): vocabulary, row ↔ entry mapping, and the merge rules for the two mentor-owned columns.
// Pure — no React, no fetch. Constants are harvested unchanged from ATDevelopmentJournal.jsx so the Sheet, the old
// app and this one agree on every id.
//
// Column ownership (same rule as MA History, §15): Mark's save writes the CONTENT columns only; `mentorPulse` and
// `mentorComments` are each written by their own call, after a re-read. The old app saved the whole row from memory
// on every action, so Chris's depth tap and an edit of Mark's could erase each other.

export const DOMAINS = [
  { id: "ma", label: "Movement Analysis", color: "#e07830" },
  { id: "skiing", label: "Skiing Performance", color: "#3088cc" },
  { id: "biomechanics", label: "Biomechanics", color: "#28a858" },
  { id: "physics", label: "Physics & Forces", color: "#a0a0d0" },
  { id: "skidesign", label: "Ski Design", color: "#90b050" },
  { id: "tactics", label: "Tactics & Line", color: "#c060a0" },
  { id: "teaching", label: "Teaching & Progression", color: "#e8a050" },
  { id: "groupdynamics", label: "Group Dynamics", color: "#6a90d0" },
  { id: "terrain", label: "Terrain & Conditions", color: "#70b870" },
  { id: "psychology", label: "Psychology & Mindset", color: "#d06060" },
  { id: "cap", label: "CAP Integration", color: "#d0a040" },
];

export const CONTEXTS = ["Clinic", "Free Skiing", "Shadow", "Assessment Task", "Training", "Self-Study", "Peer Observation"];

// Ordered low → high; topDepth() relies on the order.
export const PULSE_OPTIONS = [
  { id: "surface", label: "Surface", desc: "Described what happened but not why", color: "#e05028", icon: "△" },
  { id: "connecting", label: "Connecting", desc: "Linked cause and effect across domains", color: "#e07830", icon: "◇" },
  { id: "integrated", label: "Integrated", desc: "Hit the mark — saw the whole picture", color: "#28a858", icon: "★" },
];

export const ENTRY_TYPES = {
  coaching: { label: "On-Hill Coaching / MA", icon: "🎿" },
  personal: { label: "Personal Skiing", icon: "⛷" },
  clinic: { label: "Clinic Attended", icon: "📋" },
  feedback: { label: "Feedback Received", icon: "💬" },
  study: { label: "Study / Reading / Video", icon: "📖" },
  general: { label: "General Note", icon: "📝" },
};

/** The six text columns, in Sheet order. Every entry type maps its prompts onto these same columns. */
export const FIELDS = ["whatISaw", "whatWasGoingOn", "whatIDid", "whyThatApproach", "whatHappened", "whatIdDoDifferently"];

const P = (rows) => rows.map(([label, placeholder], i) => ({ id: FIELDS[i], label, placeholder }));
export const PROMPTS_BY_TYPE = {
  coaching: P([
    ["What did I see?", "Describe the moment — what was happening with the student, the group, or the skier you observed..."],
    ["What was really going on underneath?", "Root cause — connect the symptom to the underlying issue. Why was this happening?"],
    ["What did I do about it?", "Your teaching decision — terrain choice, exercise, progression, demo, verbal cue..."],
    ["Why that approach and not another?", "What made you choose this over other options? What were you considering?"],
    ["What happened?", "The outcome — did it work? What changed? What didn't change?"],
    ["What would I do differently?", "Knowing what you know now — what would you change? What did you learn?"],
  ]),
  personal: P([
    ["What was I working on?", "My focus for this session — what skill, movement, or feeling was I targeting?"],
    ["What did I feel vs what was actually happening?", "The gap between intention and execution — what sensations did I notice? What was actually going on?"],
    ["What adjustments did I make?", "What did I try? Terrain changes, focus shifts, drills, mental cues..."],
    ["What worked and what didn't?", "Which adjustments produced change? Which ones didn't? Why?"],
    ["Where am I now vs where I started?", "Did the session move me forward? What's the current state of this skill?"],
    ["What will I try next?", "Next session focus — what will I carry forward, what will I change?"],
  ]),
  clinic: P([
    ["What was the subject / focus?", "Topic of the clinic — who led it, what was the intended learning?"],
    ["Key takeaways", "The 2-3 things that stuck — concepts, drills, frameworks, aha moments..."],
    ["How does this connect to my development?", "Link to your AT gaps, your themes, or something your mentors have been pushing on..."],
    ["What resonated most and why?", "The thing that clicked — why did it land? What shifted in your understanding?"],
    ["What will I apply or try?", "Concrete next steps — what will you do differently because of this clinic?"],
    ["Questions that remain", "What are you still unsure about? What do you want to explore further?"],
  ]),
  feedback: P([
    ["Who gave the feedback and what was the context?", "Chris after watching me teach, Gates during a training session, a peer after a clinic..."],
    ["What did they say?", "Capture the feedback as accurately as you can — their words, their observations..."],
    ["What resonated?", "Which parts landed? What do you agree with or see in yourself?"],
    ["What challenged me?", "Which parts were hard to hear or that you're not sure about?"],
    ["How does this connect to other feedback?", "Is this a pattern? Have you heard this before? Does it connect to your themes?"],
    ["What will I work on?", "Concrete action — what changes based on this feedback?"],
  ]),
  study: P([
    ["What did I read, watch, or study?", "Article, video, manual section — include link if you have one..."],
    ["What clicked or connected?", "The concept or insight that resonated — what did you understand differently after?"],
    ["How does this relate to something I'm working on?", "Connect to your skiing, your teaching, your AT development, your themes..."],
    ["How does this change my understanding?", "What did you think before vs after? What shifted?"],
    ["How will I apply this?", "Next time on snow, in a clinic, or doing an MA — how will this show up?"],
    ["What do I want to explore further?", "Follow-up reading, questions to ask mentors, things to try..."],
  ]),
  general: P([
    ["What's on my mind?", "Free form — capture whatever is relevant to your development right now..."],
    ["Why does this matter?", "Why is this worth noting? How does it connect to your bigger picture?"],
    ["Additional thoughts", "Anything else you want to capture..."],
    ["", ""], ["", ""], ["", ""],
  ]),
};

// Config._THEMES is empty in the live Sheet; the old app falls back to these, and existing entries are tagged with these ids.
export const DEFAULT_THEMES = [
  { id: "root-cause", question: "Can I see past the symptom to the root cause?", description: "The MA leap from L3 to AT. Connecting multiple skill interactions to explain why — using 3+ skills simultaneously.", active: true },
  { id: "design-adapt", question: "Can I design and adapt in the moment?", description: "Progression design, terrain selection, exercise choice — and changing the plan when it's not working.", active: true },
  { id: "skiing-expression", question: "Does my skiing express what I'm teaching?", description: "Intentional demonstration — showing the specific blend you're prescribing, on command.", active: true },
];

/** Themes from Config (JSON string or array); falls back to the defaults exactly as the old app does. */
export function themesFromConfig(raw) {
  let list = raw;
  if (typeof raw === "string") { try { list = raw.trim() ? JSON.parse(raw) : null; } catch { list = null; } }
  return Array.isArray(list) && list.length ? list : DEFAULT_THEMES;
}

export const getCurrentSeason = (now = new Date()) => {
  const y = now.getFullYear();
  return now.getMonth() >= 9 ? `${String(y).slice(2)}/${String(y + 1).slice(2)}` : `${String(y - 1).slice(2)}/${String(y).slice(2)}`;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const newEntry = (entryType = "coaching") => ({
  id: uid(), date: localDay(), entryType, typeKnown: true, context: CONTEXTS[0], location: "", conditions: "",
  ...Object.fromEntries(FIELDS.map((f) => [f, ""])),
  videoUrl: "", connectionTags: [], themeIds: [], depthLevel: "", resourceId: "",
  season: getCurrentSeason(), timestamp: new Date().toISOString(), mentorPulse: {}, mentorComments: [],
});

// ── Sheet row → entry ────────────────────────────────────────────────────────
const parse = (v, fb) => { if (v == null || v === "") return fb; if (typeof v !== "string") return v; try { const p = JSON.parse(v); return p ?? fb; } catch { return fb; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** A date cell the Sheet reformatted ("Tue Apr 21 2026 …") comes back as yyyy-mm-dd; anything unreadable as "". */
export function cleanDate(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : localDay(d);
}

/**
 * Harvested guards: Config (`_…`) and MA (`ma_…`) rows that older migrations left in this tab are skipped; an id-less
 * row is kept only if it has content, and gets a stable id derived from its timestamp (the old app gave it a random
 * one on every load, so it could never be updated). JSON columns parse-or-default, and each is type-checked.
 */
export function normalizeJournalRow(r) {
  if (!r || typeof r !== "object") return null;
  let id = String(r.id ?? "").trim();
  if (id.startsWith("_") || id.startsWith("ma_") || /^(cp|vid|clinic)_/.test(id)) return null;
  const hasContent = FIELDS.some((f) => String(r[f] ?? "").trim()) || String(r.date ?? "").trim() || String(r.context ?? "").trim();
  if (!id && !hasContent) return null;
  if (!id) id = `row_${String(r.timestamp || r.date || "").replace(/\W/g, "").slice(0, 17) || "x"}`;
  const rawType = String(r.entryType ?? "").trim();
  const typeKnown = !!ENTRY_TYPES[rawType];
  const pulse = Object.fromEntries(Object.entries(obj(parse(r.mentorPulse, {}))).filter(([, v]) => PULSE_OPTIONS.some((p) => p.id === v)));
  return {
    id, date: cleanDate(r.date), entryType: typeKnown ? rawType : "coaching", typeKnown,
    context: String(r.context ?? ""), location: String(r.location ?? ""), conditions: String(r.conditions ?? ""),
    ...Object.fromEntries(FIELDS.map((f) => [f, String(r[f] ?? "")])),
    videoUrl: String(r.videoUrl ?? ""), connectionTags: arr(parse(r.connectionTags, [])).map(String), themeIds: arr(parse(r.themeIds, [])).map(String),
    depthLevel: String(r.depthLevel ?? ""), resourceId: String(r.resourceId ?? ""), season: String(r.season ?? ""), timestamp: String(r.timestamp ?? ""),
    mentorPulse: pulse,
    mentorComments: arr(parse(r.mentorComments, [])).filter((c) => c && typeof c.text === "string" && c.text.trim()),
  };
}

/**
 * Does the Journal tab have an `entryType` column? The Apps Script writes only keys that match a header, and the tab
 * it auto-creates has none — so the old app has never persisted an entry's type. getAll returns every header as a key
 * on every row, so one row is enough to tell. null = no rows to judge from.
 */
export function hasTypeColumn(rawRows) {
  const rows = (rawRows || []).filter((r) => r && typeof r === "object");
  return rows.length ? rows.some((r) => Object.prototype.hasOwnProperty.call(r, "entryType")) : null;
}

export const entryDay = (e) => e.date || cleanDate(e.timestamp);
/** Newest first; date, then timestamp, then id — never an unstable order between two entries on one day. */
export const byEntryDesc = (a, b) => entryDay(b).localeCompare(entryDay(a)) || String(b.timestamp || "").localeCompare(String(a.timestamp || "")) || String(b.id).localeCompare(String(a.id));

// ── entry → Sheet row ────────────────────────────────────────────────────────
export const activePrompts = (type) => (PROMPTS_BY_TYPE[type] || PROMPTS_BY_TYPE.coaching).filter((p) => p.label);

/**
 * The candidate-owned columns. A field the entry's type has no prompt for is written empty: switching a drafted
 * Coaching entry to General Note would otherwise save three answers nobody can see or edit.
 * Never includes mentorPulse / mentorComments.
 */
export function contentRow(entry) {
  const shown = new Set(activePrompts(entry.entryType).map((p) => p.id));
  return {
    id: entry.id, date: entry.date || "", entryType: entry.entryType || "coaching",
    context: entry.context || "", location: entry.location || "", conditions: entry.conditions || "",
    ...Object.fromEntries(FIELDS.map((f) => [f, shown.has(f) ? String(entry[f] || "").trim() : ""])),
    videoUrl: (entry.videoUrl || "").trim(), connectionTags: JSON.stringify(entry.connectionTags || []), themeIds: JSON.stringify(entry.themeIds || []),
    depthLevel: entry.depthLevel || "", resourceId: entry.resourceId || "",
    season: entry.season || getCurrentSeason(), timestamp: entry.timestamp || new Date().toISOString(),
  };
}
/** First write of a new entry also initialises the two mentor columns. */
export const createRow = (entry) => ({ ...contentRow(entry), mentorPulse: "{}", mentorComments: "[]" });

/** Hash-diff (harvested idea): an edit that changes nothing writes nothing. */
export const contentHash = (entry) => JSON.stringify(contentRow(entry));
export const hasText = (entry) => activePrompts(entry.entryType).some((p) => String(entry[p.id] || "").trim());

// ── mentor columns: merge against the live row ───────────────────────────────
/** value = pulse id to set, or null to deselect. Only this mentor's key changes; everyone else's is the live value. */
export function applyPulse(livePulse, mentorKey, value) {
  const next = { ...obj(livePulse) };
  if (value && PULSE_OPTIONS.some((p) => p.id === value)) next[mentorKey] = value; else delete next[mentorKey];
  return next;
}
const commentKey = (c) => `${c.userId}|${c.timestamp}|${String(c.text || "").slice(0, 40)}`;
export function mergeComment(liveComments, item) {
  const merged = [...arr(liveComments)];
  if (!merged.some((c) => commentKey(c) === commentKey(item))) merged.push(item);
  return merged.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
}

/** Badge on the list: the highest depth any mentor gave (as the old app), with who gave it. */
export function topDepth(entry) {
  const given = Object.entries(entry.mentorPulse || {});
  if (!given.length) return null;
  let best = null;
  for (const [who, id] of given) { const i = PULSE_OPTIONS.findIndex((p) => p.id === id); if (i >= 0 && (!best || i > best.i)) best = { i, who }; }
  return best ? { ...PULSE_OPTIONS[best.i], who: best.who, count: given.length } : null;
}

// ── list card text ───────────────────────────────────────────────────────────
const clip = (s, n) => { const t = s.replace(/\s+/g, " ").trim(); if (t.length <= n) return t; const cut = t.slice(0, n); return `${cut.slice(0, cut.lastIndexOf(" ") > n * 0.6 ? cut.lastIndexOf(" ") : n).replace(/[,;:\s]+$/, "")}…`; };

/**
 * Two lines for the list (Mark, session 7: one line wasn't enough to tell entries apart).
 * title — the first line of the first answered prompt. more — what follows it: the rest of that same answer when it
 * ran on, otherwise the next answered prompt, labelled so it reads as an answer and not as a continuation.
 */
export function listSummary(entry, { titleLen = 100, moreLen = 170 } = {}) {
  const answered = activePrompts(entry.entryType).map((p) => ({ label: p.label, text: String(entry[p.id] || "").trim() })).filter((x) => x.text);
  if (!answered.length) return { title: "Untitled entry", more: "", moreLabel: "" };
  const first = answered[0].text;
  const lines = first.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  let head = lines[0], rest = lines.slice(1).join(" ");
  if (head.length > titleLen) { const t = clip(head, titleLen); rest = `${head.slice(t.length - 1).replace(/^[\s,;:]+/, "")} ${rest}`.trim(); head = t; }
  if (rest.length >= 25) return { title: head, more: clip(rest, moreLen), moreLabel: "" };
  const next = answered[1];
  return next ? { title: head, more: clip(next.text, moreLen), moreLabel: next.label } : { title: head, more: "", moreLabel: "" };
}

/** Plain-text rendering of an entry under its own type's prompts — what Challenge Me and the email preview read. */
export const reflectionText = (entry) => activePrompts(entry.entryType).map((p) => (String(entry[p.id] || "").trim() ? `${p.label}\n${String(entry[p.id]).trim()}` : "")).filter(Boolean).join("\n\n");

export function notificationFor(entry, appUrl) {
  const label = ENTRY_TYPES[entry.entryType]?.label || "Journal Entry";
  const s = listSummary(entry, { titleLen: 140, moreLen: 240 });
  return {
    subject: `AT Journal: New ${label} from Mark`,
    body: `Mark added a new ${label} (${entry.date || "today"}${entry.context ? ` · ${entry.context}` : ""}):\n\n${s.title}${s.more ? `\n${s.moreLabel ? `${s.moreLabel} ` : ""}${s.more}` : ""}\n\nRead it and mark the depth: ${appUrl}`,
  };
}

/** Who the Apps Script will mail: profiles with an email and notifications not switched off. */
export function notifyRecipients(rawProfiles) {
  const profiles = obj(parse(rawProfiles, {}));
  return Object.entries(profiles).filter(([, p]) => p && p.email && p.notifications !== false).map(([key, p]) => ({ key, email: String(p.email) }));
}

// ── drafts (localStorage; one per entry id, "new" for an unsaved entry) ──────
const DRAFT = (id) => `rmat_journal_draft_${id}`;
const ls = () => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };
export function loadDraft(id) { try { const raw = ls()?.getItem(DRAFT(id)); const d = raw ? JSON.parse(raw) : null; return d && typeof d === "object" && d.id ? d : null; } catch { return null; } }
export function saveDraft(id, entry) { try { ls()?.setItem(DRAFT(id), JSON.stringify(entry)); } catch { /* quota / private mode */ } }
export function clearDraft(id) { try { ls()?.removeItem(DRAFT(id)); } catch { /* ignore */ } }

// Challenge Me replies are kept per entry AND per text: edit the entry and the old challenge no longer applies.
const CH = (id) => `rmat_journal_challenge_${id}`;
const textKey = (entry) => { const s = reflectionText(entry); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return `${s.length}:${h}`; };
export function loadChallenge(entry) { try { const d = JSON.parse(ls()?.getItem(CH(entry.id)) || "null"); return d && d.key === textKey(entry) ? d : null; } catch { return null; } }
export function saveChallenge(entry, text) { try { ls()?.setItem(CH(entry.id), JSON.stringify({ key: textKey(entry), text, at: new Date().toISOString() })); } catch { /* ignore */ } }
