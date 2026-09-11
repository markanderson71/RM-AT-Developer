// PSIA document ingestion (architecture §6.1). Reads /reference/*.md, emits psia_doc chunks.
// Chunk by natural unit, not token count. Sonnet decides boundaries + tags; deterministic rules
// handle the IDP (one task = one chunk) and the exclusion list.
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { MODELS, completeJson } from '../llm.js';
import { CRITERIA, SKILLS, TYPES } from '../store.js';

// ─── Exclusions (§6.1): reading material, not scoring material. Stays in Resources tab. ───
const EXCLUDED_SECTIONS = [
  /AT CLINIC LEADING SCORECARD/i,
  /AT SKIING SCORECARD/i,
  /AT MA ASSESSMENT FLOW/i,          // flow is covered in assessment-guide-at-ma.md; keep one copy
  /AT SKIING ASSESSMENT FLOW/i,
  /AT PROGRAM OVERVIEW/i,
  /MODULE 2: SKIING PERFORMANCE/i,
  /MODULE 3: CLINIC LEADING/i,
  /PROFESSIONALISM & SELF-MANAGEMENT/i,
  /L3 TEACHING SCORECARD/i,
  /L3 SKIING SCORECARD/i,
  /IDP ASSESSMENT ACTIVITIES/i,      // superseded by skiing-idp-2025.md (full text)
  /ADD YOUR OWN NOTES BELOW/i,       // ingested separately as author=mark if non-empty
];

// ─── Keyword tagger: augments model tags. "Tag generously" (§5.4). ───
const SKILL_KEYWORDS = {
  edging: /\bedg(e|ing|es)\b|tipping|inclination|angulation|platform/i,
  pressure: /\bpressure\b|magnitude|flex(ion)?|extens/i,
  rotary: /rotar|rotation|steer|pivot|leg rotation/i,
  balance_fore_aft: /fore\/?aft|center of mass|base of support|\bCOM\b|\bBOS\b/,
  balance_lateral: /lateral|inside half|counter/i,
  ski_to_ski: /ski[- ]to[- ]ski|outside ski|inside ski|weight transfer|transfer weight/i,
  upper_lower_separation: /upper body|separation|stable upper|torso/i,
  turn_shape: /turn shape|radius|round|arc\b|corridor/i,
  turn_phase: /initiation|shaping|finish|transition|phase/i,
  dirt: /\bDIRT\b|duration|intensity|rate|timing/i,
  conditions: /condition|snow|groomed|ungroomed|bumps|crud|powder|ice|terrain/i,
  tactics: /tactic|line\b|speed control/i,
  equipment: /equipment|boot|alignment|tun(e|ing)|ski design/i,
  intent_verification: /intent|what (were|are) you (working|focus)|verify|ask(ed)? the (peer|skier)/i,
  peer_dialog: /\bpeer\b|clinic participant|candidate 2/i,
  idp_task: /\bIDP\b|assessment activit|individual fundamental|integrated fundamental|versatility/i,
  physics_sidecut: /sidecut|side cut/i,
  physics_forces: /centripetal|centrifugal|force|momentum|gravity|inertia/i,
  physics_camber: /camber|reverse camber|bend(s)? from (the )?center|decamber/i,
  fitts_posner: /fitts|posner|cognitive|associative|autonomous|1\s*=|6\s*=/i,
  l3_vs_at: /\bL3\b|\bAT\b|[Ll]evel 3|[Aa]lpine [Tt]rainer/,   // case-sensitive: /i would match the word "at"
};
const CRITERIA_KEYWORDS = {
  describe: /describ|observ|ski performance|body performance/i,
  cause_effect: /cause|effect|relationship|because|result/i,
  evaluate: /evaluat|intent|desired outcome|effective|ineffective|priorit/i,
  prescription: /prescri|change|activity|task|drill|exercise/i,
  biomechanics: /physics|biomechan|mechanic|anatom|force|sidecut|camber/i,
  communication: /communicat|clear|concise|language|audience|two-way|present/i,
};
export function keywordTags(text) {
  const skills = Object.entries(SKILL_KEYWORDS).filter(([, re]) => re.test(text)).map(([k]) => k);
  const criteria = Object.entries(CRITERIA_KEYWORDS).filter(([, re]) => re.test(text)).map(([k]) => k);
  return { skills, criteria };
}
export function mergeTags(a = [], b = [], allowed) {
  return [...new Set([...a, ...b])].filter((x) => allowed.includes(x));
}

// ─── Sonnet boundary decisions ───
const CHUNK_SYSTEM = `You split PSIA ski-instruction reference text into retrieval chunks for an AI that scores Alpine Trainer Movement Analysis sessions.

Rules:
- Chunk by NATURAL UNIT, never by length. One criterion at one certification level = one chunk. One fundamental = one chunk. One physics concept = one chunk. One learning outcome or learning-experience item = one chunk. One exam-flow step group = one chunk.
- L3 vs AT comparison rows MUST stay together: the L3 statement and its AT counterpart are one chunk. Never split them.
- For physics concepts that depend on the previous concept, prepend a 1–2 sentence overlap from the previous concept so the chunk stands alone.
- Preserve the source wording. You may join wrapped lines and drop page furniture, but do not paraphrase, summarize, or omit content. Every substantive sentence in the input must land in exactly one chunk (except the deliberate overlap above).
- Each chunk gets: title (short), text, type, criteria[], skills[].
  type ∈ definition | principle | physics | mental_model | idp_task
  criteria ⊆ describe, cause_effect, evaluate, prescription, biomechanics, communication, general
  skills ⊆ edging, pressure, rotary, balance_fore_aft, balance_lateral, ski_to_ski, upper_lower_separation, turn_shape, turn_phase, dirt, conditions, tactics, equipment, intent_verification, peer_dialog, idp_task, physics_sidecut, physics_forces, physics_camber, fitts_posner, l3_vs_at
  Tag generously — tags are a pre-filter, not the ranking.
- Anything comparing Level 3 to Alpine Trainer, or stating what AT requires beyond L3, gets skill l3_vs_at.

Return ONLY a JSON array: [{"title": "...", "text": "...", "type": "...", "criteria": [...], "skills": [...]}]`;

async function sonnetChunk(sectionTitle, text, hint = '') {
  const user = `SECTION: ${sectionTitle}\n${hint ? `GUIDANCE: ${hint}\n` : ''}\n---\n${text}\n---\nReturn the JSON array of chunks.`;
  const arr = await completeJson({ model: MODELS.sonnet, system: CHUNK_SYSTEM, user, maxTokens: 16000 });
  if (!Array.isArray(arr)) throw new Error(`chunker returned non-array for ${sectionTitle}`);
  return arr.filter((c) => c && c.text && c.text.trim().length > 40);
}

/** Split oversized sections at paragraph boundaries so one Sonnet call stays well inside budget. */
function splitLarge(text, max = 14000) {
  if (text.length <= max) return [text];
  const paras = text.split(/\n\s*\n/);
  const out = []; let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > max && cur) { out.push(cur); cur = p; } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

function toChunk(c, { file, sectionTitle, author = 'psia', typeDefault = 'definition', extraSkills = [] }) {
  const kw = keywordTags(c.text);
  return {
    text: c.text.trim(),
    source: 'psia_doc',
    source_ref: `${file}#${sectionTitle}${c.title ? ` › ${c.title}` : ''}`,
    criteria: mergeTags(c.criteria, kw.criteria, CRITERIA),
    skills: mergeTags([...(c.skills || []), ...extraSkills], kw.skills, SKILLS),
    type: TYPES.includes(c.type) ? c.type : typeDefault,
    author,
    approved: true,
    metadata: { file, section: sectionTitle, title: c.title || null },
  };
}

// ─── Per-file strategies ───

/** psia.md — the ═══ sectioned document from the old app. */
async function ingestPsiaMd(file, text, log) {
  const parts = text.split(/═══\s*(.+?)\s*═══\n?/);
  const chunks = [];
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim(); const body = (parts[i + 1] || '').trim();
    if (!body) continue;
    if (/ADD YOUR OWN NOTES/i.test(title)) {
      // Mark's own notes: ingest as author=mark, type=principle.
      for (const piece of splitLarge(body)) {
        for (const c of await sonnetChunk(title, piece, "These are the candidate's own study notes; type=principle unless clearly a physics explanation.")) {
          chunks.push(toChunk(c, { file, sectionTitle: title, author: 'mark', typeDefault: 'principle' }));
        }
      }
      continue;
    }
    if (EXCLUDED_SECTIONS.some((re) => re.test(title))) { log(`  skip (excluded §6.1): ${title}`); continue; }
    let hint = '';
    if (/L3 vs AT/i.test(title)) hint = 'Paired comparison. Each L3/AT pair is ONE chunk. Add skill l3_vs_at to every chunk.';
    else if (/PHYSICS/i.test(title)) hint = 'One chunk per concept; type=physics (or mental_model for pendulum/three-joint style models). Add overlap where a concept depends on the prior one.';
    else if (/SCORECARD/i.test(title)) hint = 'One chunk per criterion. type=definition. Include the Learning Outcome sentence in each criterion chunk so it stands alone.';
    else if (/FUNDAMENTALS/i.test(title)) hint = 'One chunk per fundamental, one for the Skills Concept blend explanation. type=definition.';
    else if (/ASSESSMENT SCALE/i.test(title)) hint = 'Single chunk. type=definition, skills include fitts_posner.';
    else if (/SUPPLEMENTARY/i.test(title)) hint = 'One chunk per framework (CAP, LCM, Fitts & Posner). type=mental_model.';
    else if (/MODULE 1/i.test(title)) hint = 'One chunk for description + learning outcomes; one per learning experience group. type=definition or principle.';
    for (const piece of splitLarge(body)) {
      const out = await sonnetChunk(title, piece, hint);
      log(`  ${title}: ${out.length} chunks`);
      for (const c of out) chunks.push(toChunk(c, { file, sectionTitle: title }));
    }
  }
  return chunks;
}

/** skiing-idp-2025.md — deterministic: one `## ` block = one chunk. No model call. */
function ingestIdp(file, text, log) {
  const blocks = text.split(/\n(?=## )/).filter((b) => b.startsWith('## '));
  const chunks = [];
  for (const b of blocks) {
    const title = b.split('\n')[0].replace(/^##\s*/, '').trim();
    const body = b.trim();
    const isTask = /Individual Fundamentals|Integrated Fundamentals|Versatility/.test(title) && /\*\*(Ski|Body) Performance/.test(body);
    const kw = keywordTags(body);
    chunks.push({
      text: body,
      source: 'psia_doc',
      source_ref: `${file}#${title}`,
      criteria: isTask ? ['prescription', 'describe'] : mergeTags(['general'], kw.criteria, CRITERIA),
      skills: mergeTags(isTask ? ['idp_task'] : [], kw.skills, SKILLS),
      type: isTask ? 'idp_task' : 'definition',
      author: 'psia', approved: true,
      metadata: { file, section: title, title, task: isTask ? title.split(' — ')[0] : null, category: isTask ? title.split(' — ')[1] : null },
    });
  }
  log(`  IDP: ${chunks.length} chunks (${chunks.filter((c) => c.type === 'idp_task').length} tasks)`);
  return chunks;
}

/** performance-guide-l1-3.md — Sonnet, one chunk per criterion per level. */
async function ingestPerfGuide(file, text, log) {
  const raw = text.split(/\n(?=(?:TECHNICAL UNDERSTANDING|MOVEMENT ANALYSIS): LEVEL \d)/);
  // The PDF repeats the section header on every page; merge consecutive same-key pages so a criterion
  // that wraps a page break is chunked whole.
  const merged = [];
  for (const sec of raw) {
    const m = sec.match(/^(TECHNICAL UNDERSTANDING|MOVEMENT ANALYSIS): LEVEL (\d)/);
    if (!m) continue;
    const key = `${m[1]} L${m[2]}`;
    const body = sec.replace(/^.*\n/, '').trim();
    if (merged.length && merged[merged.length - 1].key === key) merged[merged.length - 1].body += `\n${body}`;
    else merged.push({ key, m, body });
  }
  const chunks = [];
  const seen = new Set();
  for (const { key, m, body } of merged) {
    const title = key;
    const hint = `Level ${m[2]} ${m[1].toLowerCase()} assessment criteria. One chunk per Assessment Criterion, containing the criterion statement AND its Successful and Unsuccessful Performance Contributors (rows are flattened with ' | ' between successful | unsuccessful). type=definition. ${m[2] === '3' ? 'Add skill l3_vs_at — Level 3 is the baseline the Alpine Trainer standard is compared against.' : ''}`;
    for (const piece of splitLarge(body)) {
      const out = await sonnetChunk(title, piece, hint);
      for (const c of out) {
        const ch = toChunk(c, { file, sectionTitle: title, extraSkills: m[2] === '3' ? ['l3_vs_at'] : [] });
        ch.metadata.level = Number(m[2]);
        if (seen.has(ch.text)) continue; seen.add(ch.text);
        chunks.push(ch);
      }
    }
    log(`  ${title}: ${chunks.length} cumulative`);
  }
  return chunks;
}

/** Generic prose docs (AT program guide, assessment guide AT section) — Sonnet by natural unit. */
async function ingestProse(file, text, log, hint) {
  const sections = text.split(/\n(?=## )/);
  const chunks = [];
  for (const sec of sections) {
    const title = (sec.match(/^##\s*(.+)/)?.[1] || sec.split('\n')[0].replace(/^#\s*/, '')).trim();
    const body = sec.replace(/^##?\s*.+\n/, '').trim();
    if (!body || body.length < 80) continue;
    for (const piece of splitLarge(body)) {
      const out = await sonnetChunk(title, piece, hint);
      log(`  ${title}: ${out.length} chunks`);
      for (const c of out) chunks.push(toChunk(c, { file, sectionTitle: title, extraSkills: ['l3_vs_at'] }));
    }
  }
  return chunks;
}

const STRATEGIES = [
  { match: /^psia\.md$/, run: ingestPsiaMd },
  { match: /^skiing-idp/, run: (f, t, l) => ingestIdp(f, t, l) },
  { match: /^performance-guide/, run: ingestPerfGuide },
  { match: /^at-program-guide/, run: (f, t, l) => ingestProse(f, t, l, 'Alpine Trainer Program Guide, MA module. One chunk for description + learning outcomes (type=definition). One chunk per numbered Learning Experience (type=principle). One chunk per assessment-activity paragraph group (type=definition). Everything here describes the AT standard: add skill l3_vs_at.') },
  { match: /^assessment-guide/, run: (f, t, l) => ingestProse(f, t, l, 'PSIA-RM Assessment Guide, Alpine Trainer MA/TU overview. One chunk for learning outcomes (type=definition), one for the assessment-activity sequence (type=definition), skip schedule/logistics/results-announcement boilerplate. Add skill l3_vs_at.') },
];

/**
 * Chunk every file in /reference. Returns chunks (not yet inserted).
 * @param {string} dir absolute path to /reference
 * @param {(msg:string)=>void} log
 * @param {string[]} [only] filenames to restrict to
 */
export async function chunkReferenceDir(dir, log = console.log, only = null) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).filter((f) => !only || only.includes(f)).sort();
  const all = [];
  for (const f of files) {
    const strat = STRATEGIES.find((s) => s.match.test(f));
    if (!strat) { log(`  no strategy for ${f}, using generic prose`); }
    log(`reference/${f}`);
    const text = readFileSync(join(dir, f), 'utf8');
    const chunks = strat ? await strat.run(f, text, log) : await ingestProse(f, text, log, '');
    all.push(...chunks);
  }
  return all;
}
