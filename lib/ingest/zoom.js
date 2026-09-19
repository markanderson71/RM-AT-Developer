// §6.2 — call transcript → pending chris_zoom chunks. Pure functions first (parse, window, guards), then the pipeline.
// Nothing here approves or embeds: pending chunks are stored without an embedding (store.insertPending), so they
// cannot be retrieved even if a filter is wrong. Embedding happens at approval (store.approveChunk).
import { MODELS, completeJson } from '../llm.js';
import { CRITERIA, SKILLS } from '../vocab.js';
import { zoomSystem, zoomUser, ZOOM_PROMPT_VERSION, ZOOM_TYPES } from '../prompts/zoom.js';

const WINDOW = { core: 12_000, before: 1_500, after: 2_500 };   // chars; 50–60K call → 4–5 parallel Opus calls
const GUARD = { quote: 0.6, overlap: 0.4 };

// ── parse ────────────────────────────────────────────────────────────────────────────────────────
const toSec = (t) => t.split(':').map(Number).reduce((a, n) => a * 60 + n, 0);

/** Plaud / Zoom-style "HH:MM:SS Speaker N\ntext" (also "[HH:MM:SS] Name: text" on one line). */
export function parseTranscript(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n');
  const turns = [];
  const head = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:\n]{1,40}?)(?::\s*(.*))?$/;
  let cur = null;
  for (const line of lines) {
    const m = line.match(head);
    if (m && (m[3] !== undefined || /^(speaker\b|[A-Z])/i.test(m[2]))) {
      if (cur) turns.push(cur);
      const t = m[1].split(':').length === 2 ? `00:${m[1].padStart(5, '0')}` : m[1].padStart(8, '0');
      cur = { t, sec: toSec(t), speaker: m[2].trim(), text: (m[3] || '').trim() };
    } else if (cur && line.trim()) cur.text = `${cur.text} ${line.trim()}`.trim();
  }
  if (cur) turns.push(cur);
  return turns.filter((x) => x.text).map((x, i) => ({ i, ...x }));
}

/** Dry-run report: who are the labels? Longest turns per label, and a guess (the mentor does most of the talking). */
export function speakerReport(turns, { mentor = 'chris', candidate = 'mark' } = {}) {
  const by = {};
  for (const x of turns) { (by[x.speaker] ??= { turns: 0, chars: 0, samples: [] }); by[x.speaker].turns++; by[x.speaker].chars += x.text.length; by[x.speaker].samples.push(x); }
  const ranked = Object.entries(by).sort((a, b) => b[1].chars - a[1].chars);
  const guess = {};
  ranked.forEach(([label], n) => { guess[label] = n === 0 ? mentor : n === 1 ? candidate : 'unknown'; });
  // Someone addressed by name is not the one speaking.
  for (const [label, v] of ranked) {
    const said = (name) => v.samples.filter((s) => new RegExp(`\\b${name}\\b`, 'i').test(s.text)).length;
    if (said(mentor) > said(candidate) + 1 && guess[label] === mentor) guess[label] = `${candidate}?`;
  }
  return {
    speakers: Object.fromEntries(ranked.map(([label, v]) => [label, {
      turns: v.turns, chars: v.chars,
      samples: v.samples.sort((a, b) => b.text.length - a.text.length).slice(0, 4).map((s) => `${s.t} ${s.text.slice(0, 220)}`),
    }])),
    guess,
    note: 'Guess = most talk → mentor. Diarization is unreliable within turns; the map is a prior for the extractor, which attributes by content.',
  };
}

// ── window ───────────────────────────────────────────────────────────────────────────────────────
/** Core windows of ~WINDOW.core chars on turn boundaries, each padded with context-only turns (ctx: true). */
export function windows(turns, size = WINDOW) {
  const cores = []; let cur = []; let n = 0;
  for (const x of turns) { cur.push(x); n += x.text.length; if (n >= size.core) { cores.push(cur); cur = []; n = 0; } }
  if (cur.length) { if (cores.length && n < size.core / 4) cores[cores.length - 1].push(...cur); else cores.push(cur); }
  return cores.map((core) => {
    const take = (from, step, budget) => { const out = []; let c = 0; for (let k = from; k >= 0 && k < turns.length && c < budget; k += step) { out.push({ ...turns[k], ctx: true }); c += turns[k].text.length; } return out; };
    const before = take(core[0].i - 1, -1, size.before).reverse();
    const after = take(core[core.length - 1].i + 1, 1, size.after);
    return [...before, ...core.map((x) => ({ ...x, ctx: false })), ...after];
  });
}

// ── guards ───────────────────────────────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('that this with from have what when where which they them then than your you’re youre just like going gonna there their about would could should into more some because really being been were will also very much only even does doing those these here'.split(' '));
const stem = (w) => { const x = w.replace(/(ing|ed|es|s)$/, ''); return x.length >= 4 ? x : w; };   // cleaning changes inflection, not substance
const content = (s) => norm(s).split(' ').filter((w) => w.length >= 4 && !STOP.has(w)).map(stem);

/** Share of 5-word shingles of the quote found verbatim in the transcript. Quote is meant to be raw, so this is strict. */
export function quoteGrounded(quote, sourceNorm) {
  const w = norm(quote).split(' ').filter(Boolean);
  if (w.length < 6) return 0;
  let hit = 0, total = 0;
  for (let k = 0; k + 5 <= w.length; k += 2) { total++; if (sourceNorm.includes(w.slice(k, k + 5).join(' '))) hit++; }
  return total ? hit / total : 0;
}
/** Share of the cleaned text's content words that occur in the cited turns (±1). Catches generalizing and added reasoning. */
export function textOverlap(text, localText, asrFixes = []) {
  const restored = asrFixes.map((f) => String(f).split('→')[1] || '').join(' ');
  const have = new Set(content(`${localText} ${restored}`));
  const words = content(text.replace(/\[[^\]]*\]/g, ' '));
  if (!words.length) return 0;
  return words.filter((x) => have.has(x)).length / words.length;
}

// §17 items waiting on this transcript. Marked so they are easy to find in the pending list; not a filter.
const WATCH = [
  ['evaluate_comparison', (c) => c.criteria.includes('evaluate') || /\b(ideal|intent|intended|desired outcome|compar)/i.test(c.text)],
  ['peer_vocabulary', (c) => /\bpivot/i.test(`${c.text} ${c.metadata.context}`)],
];

/**
 * Model statements → store chunks. Returns { chunks, rejected }.
 * Rejections are mechanical only (not in transcript / drifted from it / outside the core window / bad shape).
 */
export function toChunks(statements, { window, turns, sourceNorm, date, sourceRef, author, speakerMap = {}, part }) {
  const byI = new Map(turns.map((x) => [x.i, x]));
  const core = new Set(window.filter((x) => !x.ctx).map((x) => x.i));
  const chunks = []; const rejected = [];
  for (const s of statements || []) {
    const no = (why) => rejected.push({ why, timestamp: s?.timestamp, text: String(s?.text || '').slice(0, 160) });
    if (!s?.text || !s?.quote || !Array.isArray(s.turns) || !s.turns.length) { no('bad shape'); continue; }
    const cited = s.turns.map(Number).filter((k) => byI.has(k)).sort((a, b) => a - b);
    if (!cited.length) { no('cited turns not in transcript'); continue; }
    if (!core.has(cited[0])) { no('starts in a context-only turn'); continue; }
    const q = quoteGrounded(s.quote, sourceNorm);
    if (q < GUARD.quote) { no(`quote not in transcript (${Math.round(q * 100)}%)`); continue; }
    const local = []; for (let k = cited[0] - 1; k <= cited[cited.length - 1] + 1; k++) if (byI.has(k)) local.push(byI.get(k).text);
    const o = textOverlap(s.text, local.join(' '), s.asr_fixes);
    if (o < GUARD.overlap) { no(`text drifted from what was said (${Math.round(o * 100)}% overlap)`); continue; }

    const labels = [...new Set(cited.map((k) => byI.get(k).speaker))];
    const mapped = labels.map((l) => String(speakerMap[l] || 'unknown').toLowerCase());
    const labelAgrees = mapped.every((m) => m === author);
    const type = ZOOM_TYPES.includes(s.type) ? s.type : 'principle';
    const first = byI.get(cited[0]);
    chunks.push({
      text: s.text.trim(),
      source: 'chris_zoom',
      source_ref: sourceRef,
      criteria: (s.criteria || []).filter((c) => CRITERIA.includes(c)),
      skills: (s.skills || []).filter((k) => SKILLS.includes(k)),
      type, author, date, approved: false,
      metadata: {
        context: String(s.context || '').trim(),
        timestamp: first.t, sec: first.sec, turns: cited,
        quote: String(s.quote).trim(),
        modeled: !!s.modeled,
        hedged: !!s.hedged, hedge_note: s.hedge_note || null,
        asr_fixes: Array.isArray(s.asr_fixes) ? s.asr_fixes.map(String) : [],
        attribution: { basis: s.speaker_basis || 'label', labels, check: !labelAgrees || s.speaker_basis !== 'label' },
        guard: { quote: Number(q.toFixed(2)), overlap: Number(o.toFixed(2)) },
        prompt_version: ZOOM_PROMPT_VERSION, part,
      },
    });
  }
  for (const c of chunks) { const w = WATCH.filter(([, f]) => f(c)).map(([k]) => k); if (w.length) c.metadata.watch = w; }
  return { chunks, rejected };
}

/** Safety net behind the core/context split: same first turn and mostly the same words → keep the first. */
export function dedupe(chunks) {
  const out = [];
  for (const c of chunks) {
    const a = new Set(content(c.text));
    const dup = out.find((d) => Math.abs(d.metadata.sec - c.metadata.sec) <= 45 && (() => { const b = new Set(content(d.text)); const inter = [...a].filter((x) => b.has(x)).length; return inter / Math.max(1, Math.min(a.size, b.size)) >= 0.7; })());
    if (!dup) out.push(c);
  }
  return out.sort((x, y) => x.metadata.sec - y.metadata.sec);
}

// ── pipeline ─────────────────────────────────────────────────────────────────────────────────────
/**
 * opts: { transcript, date (YYYY-MM-DD), title?, mentor='chris', candidate='mark', speakerMap?, dryRun?, replacePending? }
 * Without a speakerMap this is always a dry run: it returns the speaker report and extracts nothing.
 * deps are injectable for the offline selftest.
 */
export async function ingestZoom(opts, deps = {}) {
  const { transcript, date, title = null, mentor = 'chris', candidate = 'mark', speakerMap = null, dryRun = false, replacePending = false, onStep = () => {} } = opts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Object.assign(new Error('date (YYYY-MM-DD) required'), { status: 400 });
  const turns = parseTranscript(transcript);
  if (turns.length < 5) throw Object.assign(new Error(`transcript not recognised (${turns.length} turns parsed; expected "HH:MM:SS Speaker" lines)`), { status: 400 });
  const report = speakerReport(turns, { mentor, candidate });
  const base = { date, source_ref: `zoom:${date}`, turns: turns.length, chars: turns.reduce((a, x) => a + x.text.length, 0), duration: turns[turns.length - 1].t };
  if (!speakerMap) return { ...base, needs: 'speakerMap', ...report };

  const store = deps.store || await import('../store.js');
  const llm = deps.completeJson || completeJson;
  const sourceRef = base.source_ref;

  const existing = await store.countBySourceRef('chris_zoom', sourceRef);
  if (!dryRun && (existing.pending || existing.approved) && !replacePending) {
    throw Object.assign(new Error(`${sourceRef} already ingested (${existing.pending} pending, ${existing.approved} approved). Pass replacePending: true to re-extract; approved chunks are never touched.`), { status: 409 });
  }

  const wins = windows(turns);
  const sourceNorm = norm(turns.map((x) => x.text).join(' '));
  onStep(`${turns.length} turns · ${wins.length} windows · extracting (${MODELS.opus})`);
  const system = zoomSystem({ mentor, candidate });
  const t0 = Date.now();
  const results = await Promise.all(wins.map(async (w, n) => {
    const out = await llm({ model: MODELS.opus, system, user: zoomUser({ turns: w, date, title, speakerMap, part: n + 1, parts: wins.length }), maxTokens: 12_000 });
    onStep(`window ${n + 1}/${wins.length}: ${out.statements?.length ?? 0} statements`);
    return { n, out, w };
  }));

  let all = []; const rejected = []; const toolFeedback = [];
  for (const { n, out, w } of results) {
    const r = toChunks(out.statements, { window: w, turns, sourceNorm, date, sourceRef, author: mentor, speakerMap, part: n + 1 });
    all.push(...r.chunks); rejected.push(...r.rejected.map((x) => ({ part: n + 1, ...x })));
    for (const f of out.tool_feedback || []) if (f?.text) toolFeedback.push({ timestamp: f.timestamp || null, text: String(f.text) });
  }
  const before = all.length; all = dedupe(all);
  for (const c of all) if (title) c.metadata.call_title = title;

  const summary = {
    ...base, prompt_version: ZOOM_PROMPT_VERSION, ms: Date.now() - t0, windows: wins.length,
    extracted: before, duplicates: before - all.length, rejected, tool_feedback: toolFeedback,
    flagged: { hedged: all.filter((c) => c.metadata.hedged).length, attribution_check: all.filter((c) => c.metadata.attribution.check).length, watch: all.filter((c) => c.metadata.watch).length },
  };
  if (dryRun) return { ...summary, dryRun: true, would_insert: all.length, chunks: all };

  let replaced = 0;
  if (replacePending && existing.pending) replaced = await store.deletePendingBySourceRef('chris_zoom', sourceRef);
  const ins = await store.insertPending(all);
  onStep(`inserted ${ins.inserted} pending (skipped ${ins.skipped}${replaced ? `, replaced ${replaced}` : ''})`);
  return { ...summary, inserted: ins.inserted, skipped: ins.skipped, replaced_pending: replaced };
}
