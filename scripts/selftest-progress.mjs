// Offline checks for the Progress tab (session 8): assessment field ownership, trends and recurring gaps through
// scorecard() with the blind seal, the agreement view over lib/agreement.js, pending grouping, the AI-analysis
// context and reply parser, the examiner-prompt block, and the endpoint token gate.   npm run test:progress
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.window = { localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) } };

const P = await import('../src/lib/progress.js');
const PR = await import('../src/lib/prompts.js');
const { agreement } = await import('../lib/agreement.js');
const { requireToken, authMode } = await import('../lib/http.js');
const { formatScoreLine, parseSummary } = { ...(await import('../lib/mentorScores.js')), ...(await import('../lib/parseSummary.js')) };

const mark = { key: 'mark', role: 'candidate', name: 'Mark' }, chris = { key: 'chris', role: 'mentor', name: 'Chris' }, gates = { key: 'gates', role: 'mentor', name: 'Gates' };
let n = 0; const ok = (m) => { n++; console.log('ok  ', m); };

// ── fixtures: two 2026-form sessions (one scored blind by Chris), one old-scorer, one unscored ─────────────────────
const gaps = (o) => ({
  cause_effect: "Instead of 'whole-body rotation caused the ski to pivot,' say 'whole-body rotation means the legs cannot turn independently, so the ski pivots to an edge instead of being guided,' because the how is what makes the connection complete.",
  evaluate: "Instead of describing the turn, say 'you wanted a guided top of the turn; it was pivoted — and against the ideal for this task the intent itself was right,' because the comparison has to be made twice.",
  ...o,
});
const summary = (scores, extra = {}) => JSON.stringify({ scores, meta: { scorer: 'v2-rag-4', scored_at: '2026-09-18T20:00:00Z' }, score_rationale: { cause_effect: 'why' }, gap_to_next: gaps(extra.gaps || {}),
  citations: { cause_effect: ['c:aaaaaaaa'] }, citation_details: { 'c:aaaaaaaa': { author: 'chris', date: '2026-09-17', title: 'T', text: 'Chris on MA session x — T: answer the how' } }, ...extra });
const ai1 = { cause_effect: 3, evaluate: 4, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 4 };
const ai2 = { cause_effect: 2, evaluate: 3, prescription: 3, desired_performances: 2, biomechanics: 2, equipment: 2 };
const chrisCard = { cause_effect: 2, evaluate: 2, prescription: 3, desired_performances: 2, biomechanics: 3, equipment: 3 };
const blind = { userId: 'chris', kind: 'blind_score', form: '2026', blind: true, scores: chrisCard, note: 'Evaluate needs the ideal.', ai_at_submit: { form: '2026', scores: ai1, scorer: 'v2-rag-4' }, timestamp: '2026-09-19T00:00:00Z', text: formatScoreLine({ who: 'Chris', date: '2026-09-19', scores: chrisCard, blind: true }) };
const S1 = { id: 's1', date: '2026-09-18', type: 'AT MA Exam', who: 'Sam', activity: 'Fall Line Bumps', sections: { presentation: 'It was whole-body rotation, which caused the ski to pivot.' }, summary: summary(ai1), mentorFeedback: [blind] };
const S2 = { id: 's2', date: '2026-09-22', type: 'AT MA Exam', who: 'Ben', activity: 'Dynamic parallel', sections: { presentation: 'The rotation came from the hips.' }, summary: summary(ai2, { gaps: { cause_effect: "Instead of 'the hips rotated,' say 'hip rotation means the legs cannot turn independently under the pelvis, so the ski pivots rather than being guided,' because the how is what makes the connection complete." } }), mentorFeedback: [] };
const S3 = { id: 's3', date: '2026-05-01', type: 'MA', who: 'Chuck', activity: 'Old one', sections: {}, summary: JSON.stringify({ scores: { describe: 4, cause_effect: 3, evaluate: 4, prescription: 4, biomechanics: 3, communication: 4 } }), mentorFeedback: [] };
const S4 = { id: 's4', date: '2026-09-23', type: 'MA', who: 'Ann', activity: 'Unscored', sections: {}, summary: '', mentorFeedback: [] };
const sessions = [S2, S4, S1, S3];

// ── 1. assessment ownership ──────────────────────────────────────────────────────────────────────────────────────────
const live = JSON.stringify({ chris: { whatsWorking: 'w', consistentGaps: 'g', progress: 'p', lastUpdated: '2026-05-01' }, gates: { whatsWorking: 'gw', lastUpdated: '2026-06-01' } });
const merged = P.mergeAssessment(live, 'chris', { challenge: 'Make him state the comparison twice.', consistentGaps: 'g2' }, '2026-09-24');
assert.equal(merged.gates.whatsWorking, 'gw'); assert.equal(merged.gates.lastUpdated, '2026-06-01');
assert.equal(merged.chris.challenge, 'Make him state the comparison twice.'); assert.equal(merged.chris.consistentGaps, 'g2'); assert.equal(merged.chris.whatsWorking, 'w'); assert.equal(merged.chris.lastUpdated, '2026-09-24');
assert.deepEqual(P.mergeAssessment('not json', 'mike', { progress: 'x' }, 'd'), { mike: { progress: 'x', lastUpdated: 'd' } });
assert.deepEqual(P.parseAssessments('[1,2]'), {}); assert.deepEqual(P.parseAssessments(''), {});
assert.equal(P.assessmentHash({ whatsWorking: 'a', lastUpdated: '1' }), P.assessmentHash({ whatsWorking: 'a', lastUpdated: '2' }), 'lastUpdated never triggers a save');
assert.equal(P.ASSESSMENT_FIELDS.length, 4); assert.equal(P.ASSESSMENT_FIELDS[3].key, 'challenge');
ok('assessment: a mentor\'s save merges only his four fields into the live blob; the fourth field is "challenge"');

// ── 2. trends through scorecard() ────────────────────────────────────────────────────────────────────────────────────
const tm = P.trendRows(sessions, mark);
assert.deepEqual(tm.rows.map((r) => r.id), ['s1', 's2'], 'oldest → newest, 2026 form only');
assert.equal(tm.legacy.length, 1); assert.equal(tm.legacy[0].id, 's3'); assert.equal(tm.unscored, 1); assert.equal(tm.sealed, 0);
assert.deepEqual(tm.rows[0].sections, { ma: 3.33, tu: 3 }); assert.equal(tm.rows[0].meets, false);
assert.equal(tm.rows[0].mentors.chris.scores.evaluate, 2);
const ls = P.lineSeries(tm.rows, 'chris');
assert.deepEqual(ls.find((l) => l.key === 'evaluate').ai, [4, 3]); assert.deepEqual(ls.find((l) => l.key === 'evaluate').mentor, [2, null], 'missing mentor line is null, never 0');
const tc = P.trendRows(sessions, chris);
assert.deepEqual(tc.rows.map((r) => r.id), ['s1'], 'Chris sees only the session he scored'); assert.equal(tc.sealed, 2, 's2 (2026) and s3 (legacy) are sealed for him'); assert.equal(tc.legacy.length, 0);
assert.equal(P.trendRows(sessions, gates).rows.length, 0, 'Gates has scored nothing → nothing');
ok('trends: 2026 rows, legacy separate, unscored counted; a mentor gets only the sessions he has scored');

// ── 3. recurring gaps ────────────────────────────────────────────────────────────────────────────────────────────────
const g = P.gapHistory(sessions, mark);
const ce = g.lines.find((l) => l.key === 'cause_effect');
assert.equal(ce.items.length, 2); assert.equal(ce.recurs, true); assert.equal(ce.items[0].sessionId, 's2', 'newest first'); assert.equal(ce.items[1].mentor, 2, "Chris's number beside the AI's where he scored");
assert.ok(ce.theme.includes('pivots') && ce.theme.includes('independently'), `theme names the shared words: ${ce.theme}`);
assert.equal(ce.same, true, 'the same gap both times');
assert.equal(ce.avg, 2.5); assert.equal(ce.items[1].cite.author, 'chris');
assert.equal(g.lines[0].key, 'cause_effect', 'lowest average first');
assert.equal(g.lines.find((l) => l.key === 'prescription').items.length, 0);
assert.equal(g.sessions, 2);
const gc = P.gapHistory(sessions, chris);
assert.equal(gc.sealed, 2); assert.equal(gc.lines.find((l) => l.key === 'cause_effect').items.length, 1, 'no gap text from a session Chris has not scored');
assert.equal(P.gapHistory(sessions, gates).lines.every((l) => !l.items.length), true);
ok('recurring gaps: grouped by line, recurrence + shared-theme detection, sealed sessions contribute nothing');

// ── 4. agreement view over the real math ─────────────────────────────────────────────────────────────────────────────
const sheetShape = (s) => ({ ...s, parsedSummary: parseSummary(s.summary) });
const ag = agreement(sessions.map(sheetShape), { mentor: 'chris' });
assert.equal(ag.blind.overall.exact, 3); assert.equal(ag.blind.overall.within_one, 5);   // 9/18: exact 3/6 · within-one 5/6 · Evaluate +2
const av = P.agreementView(ag);
assert.equal(av.per.length, 6); assert.equal(av.per.find((l) => l.key === 'evaluate').lean, 'AI high'); assert.equal(av.per.find((l) => l.key === 'prescription').lean, 'even');
assert.equal(av.blind.overall.exact_pct, 50); assert.equal(av.targets.exact_pct, 60); assert.equal(av.trend.length, 1); assert.equal(av.sessions[0].session_id, 's1');
assert.equal(P.agreementView(null), null);
assert.equal(P.pctColor(90, 85), '#28a858'); assert.equal(P.pctColor(50, 60), '#e8a050'); assert.equal(P.pctColor(20, 60), '#e05028'); assert.equal(P.pctColor(null, 60), '#4d6888');
ok('agreement view reproduces the 9/18 comparison (3/6 · 5/6, Evaluate leans high) from lib/agreement.js output');

// ── 5. pending grouping / priority / tally ───────────────────────────────────────────────────────────────────────────
const pend = [
  { id: 'a', source_ref: 'zoom:2026-09-18', call_title: '9/18 call', timestamp: '00:10:00', type: 'principle' },
  { id: 'b', source_ref: 'zoom:2026-09-18', timestamp: '00:49:35', type: 'principle' },
  { id: 'c', source_ref: 'zoom:2026-09-18', timestamp: '00:42:23', type: 'principle' },
  { id: 'd', source_ref: 'zoom:2026-09-25', timestamp: '00:01:00', type: 'correction' },
];
const groups = P.groupPending(pend);
assert.deepEqual(groups.map((x) => x.ref), ['zoom:2026-09-25', 'zoom:2026-09-18'], 'newest call first');
assert.deepEqual(groups[1].items.map((x) => x.id), ['c', 'b', 'a'], 'the two Evaluate statements float to the top, then call order');
assert.equal(groups[1].title, '9/18 call');
assert.deepEqual(P.tallyDecisions([{ action: 'approve', type: 'principle', edited: true }, { action: 'approve', type: 'principle' }, { action: 'delete', type: 'exemplar' }]), { principle: { approved: 2, edited: 1, deleted: 0 }, exemplar: { approved: 0, edited: 0, deleted: 1 } });
assert.equal(P.secOf('01:02:03'), 3723); assert.equal(P.secOf('42:23'), 2543);
ok('pending: grouped by call, priority statements first, decision tally by type');

// ── 6. AI-analysis context respects the seal; reply parser ───────────────────────────────────────────────────────────
const ctxC = P.assessmentContext({ sessions, entries: [{ date: '2026-09-20', context: 'Clinic', whatISaw: 'saw', mentorPulse: { chris: 'connecting' }, mentorComments: [{ userId: 'chris', text: 'good' }] }], viewer: chris, assessment: { whatsWorking: 'w' }, users: { chris: { name: 'Chris' } } });
assert.equal(ctxC.ma.length, 4);
const s2ctx = ctxC.ma.find((t) => t.includes('Dynamic parallel')), s1ctx = ctxC.ma.find((t) => t.includes('Fall Line Bumps')), s3ctx = ctxC.ma.find((t) => t.includes('Old one'));
assert.ok(s2ctx.includes('not scored this one yet') && !/\b[1-6]\b/.test(s2ctx.replace(/2026-09-22/, '')), 'sealed session: no number at all');
assert.ok(s1ctx.includes('Your scores: CE 2') && s1ctx.includes('AI scores (v2-rag-4): CE 3') && s1ctx.includes('your note: Evaluate needs the ideal.') && s1ctx.includes('AI-suggested next moves'));
assert.ok(s3ctx.includes('not scored this one yet'), 'a legacy session Chris has not scored is sealed like any other');
assert.ok(ctxC.journal[0].includes('Depth reads: Chris: Connecting') && ctxC.journal[0].includes('Chris: good'));
assert.ok(ctxC.current.includes("What's working: w") && ctxC.current.includes('Where to challenge or push: (empty)'));
const ctxM = P.assessmentContext({ sessions, entries: [], viewer: mark, assessment: null });
assert.ok(ctxM.ma.find((t) => t.includes('Dynamic parallel')).includes('AI scores'), 'the candidate view is not sealed'); assert.equal(ctxM.current, '');
const s3m = ctxM.ma.find((t) => t.includes('Old one')); assert.ok(s3m.includes('Old-scorer result') && !s3m.includes('describe') && !/CE \d/.test(s3m), 'legacy numbers never shown');
const user = PR.buildAssessmentUser({ ...ctxC, mentorName: 'Chris' });
assert.ok(user.startsWith('Mentor: Chris.') && user.includes('MA SESSIONS') && user.includes('JOURNAL REFLECTIONS') && user.includes('CURRENT ASSESSMENT'));
assert.ok(PR.ASSESSMENT_SYSTEM.includes('WHERE TO CHALLENGE OR PUSH'));
const reply = "WHAT'S WORKING:\nHe names the fundamental (9/18).\n\nCONSISTENT GAPS:\nStops at the body.\n\nPROGRESS I'VE NOTICED:\nSome.\n\nWHERE TO CHALLENGE OR PUSH:\nMake him finish the chain.\nEvery time.";
assert.deepEqual(PR.parseAssessmentReply(reply), { whatsWorking: 'He names the fundamental (9/18).', consistentGaps: 'Stops at the body.', progress: 'Some.', challenge: 'Make him finish the chain.\nEvery time.' });
assert.deepEqual(PR.parseAssessmentReply("**WHAT’S WORKING**\nx\n\n**WHERE TO CHALLENGE OR PUSH**\ny"), { whatsWorking: 'x', challenge: 'y' }, 'bold and curly apostrophes tolerated; missing sections absent');
assert.deepEqual(PR.parseAssessmentReply('Error: request failed'), {});
ok('AI analysis: context carries no AI number for a sealed session; four-section reply parses');

// ── 7. examiner prompt block carries the fourth field ────────────────────────────────────────────────────────────────
const blk = PR.mentorGapsBlock({ chris: { consistentGaps: 'g', whatsWorking: 'w', challenge: 'the second comparison' } }, { chris: { name: 'Chris' } });
assert.ok(blk.includes('push him on — the second comparison') && blk.includes('probe the consistent gaps first'));
assert.equal(PR.mentorGapsBlock({ chris: { progress: 'only' } }), '', 'progress alone still says nothing to the examiner');
assert.ok(PR.mentorGapsBlock({ mike: { challenge: 'x' } }).includes('push him on — x'), 'challenge alone is enough');
ok('mentorGapsBlock: "where to push" reaches the examiner');

// ── 8. token gate ────────────────────────────────────────────────────────────────────────────────────────────────────
const fakeRes = () => { const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
delete process.env.MENTOR_TOKEN;
let r = fakeRes(); assert.equal(requireToken({ headers: {} }, r), false, 'unset → open'); assert.equal(r.code, null); assert.equal(authMode(), 'open');
process.env.MENTOR_TOKEN = 'sekrit';
r = fakeRes(); assert.equal(requireToken({ headers: {} }, r), true); assert.equal(r.code, 401); assert.equal(r.body.auth, 'required');
r = fakeRes(); assert.equal(requireToken({ headers: { 'x-at-token': 'wrong' } }, r), true); assert.equal(r.code, 401);
r = fakeRes(); assert.equal(requireToken({ headers: { 'x-at-token': 'sekrit' } }, r), false); assert.equal(r.code, null);
r = fakeRes(); assert.equal(requireToken({ headers: {}, query: { token: 'sekrit' } }, r), false, 'query form for GET');
assert.equal(authMode(), 'token');
P.setToken('abc'); assert.equal(P.getToken(), 'abc'); P.setToken(''); assert.equal(P.getToken(), '');
ok('token gate: open when unset, 401 { auth: "required" } on missing/wrong, header or query accepted');

console.log(`\nselftest-progress: ${n} groups passed`);
