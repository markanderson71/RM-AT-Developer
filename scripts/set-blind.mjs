// Mark a stored scorecard as blind or not blind.   node scripts/set-blind.mjs <sessionId> <mentor> true|false [--dry]
//
// Why (10/2 call): Chris had seen the AI score for a session on the OLD app, then submitted the blind form on the new one,
// which stored `blind: true`. A seen card is still his card — kept, shown, used as an exemplar — but it must not count as
// a blind comparison (§9 agreement, §1 targets). This flips the flag on the thread item (and the text line the parsers
// read), then `npm run ingest:scores` re-ingests the exemplar so the store's `blind` matches.
import 'dotenv/config';
import { getAll, update } from '../lib/ops.js';
import { parseScoreLine } from '../lib/mentorScores.js';

const [sessionArg, mentorArg, valueArg, ...flags] = process.argv.slice(2);
const DRY = flags.includes('--dry');
if (!sessionArg || !mentorArg || !['true', 'false'].includes(valueArg)) { console.error('usage: node scripts/set-blind.mjs <sessionId> <mentor> true|false [--dry]'); process.exit(1); }
const id = `ma_${String(sessionArg).replace(/^ma_/, '')}`, mentor = mentorArg.toLowerCase(), blind = valueArg === 'true';

const { rows } = await getAll('MASessions');
const row = rows.find((r) => String(r.id) === id);
if (!row) { console.error(`no session ${id}`); process.exit(1); }
let thread; try { thread = JSON.parse(row.mentorFeedback || '[]'); } catch { thread = []; }
let changed = 0;
const next = thread.map((f) => {
  const isCard = (f.kind === 'blind_score' && f.scores) || parseScoreLine(f.text);
  const who = String(f.userId || '').toLowerCase(), named = String(f.text || '').match(/^\s*(\w+)\s+scorecard/i)?.[1]?.toLowerCase();
  if (!isCard || (who !== mentor && named !== mentor)) return f;
  changed++;
  const text = String(f.text || '').replace(/\(2026 form(, scored blind)?\)/, `(2026 form${blind ? ', scored blind' : ''})`);
  return { ...f, blind, text, blind_changed_at: new Date().toISOString(), blind_change_reason: blind ? null : 'mentor had seen the AI score before scoring (set by scripts/set-blind.mjs)' };
});
console.log(`${id}: ${changed} scorecard item(s) by ${mentor} → blind: ${blind}${DRY ? ' (dry run — nothing written)' : ''}`);
if (!changed) process.exit(2);
if (!DRY) {
  const r = await update('MASessions', { id, mentorFeedback: JSON.stringify(next) });
  if (r.error) { console.error(r.error); process.exit(1); }
  console.log('written. Now: npm run ingest:scores   (re-ingests the exemplar so the store agrees)');
}
