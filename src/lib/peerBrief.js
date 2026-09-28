// Peer brief (§17 "Peer brief — Chris's design", call 9/24 46:23–47:33). The peer is dealt ONE outcome and ONE ski
// performance from Chris's fixed menu, plus the IDP task text; every answer comes from that intent, so there is always
// something for Mark to verify and to prescribe against. Mark never sees the brief until the score screen.
export const OUTCOMES = [
  { key: "speed_up", text: "speed up", peer: "I wanted to carry more speed" },
  { key: "slow_down", text: "slow down", peer: "I wanted to slow down without skidding" },
  { key: "corridor_shape", text: "maintain the corridor and turn shape", peer: "I was trying to hold the corridor and keep the turns the same shape" },
  { key: "speed_contact", text: "maintain speed and snow contact", peer: "I wanted to keep my speed steady and keep the skis on the snow" },
];
export const SKI_PERFORMANCES = [
  { key: "guide", text: "guide the ski", peer: "guiding the skis through the top of the turn" },
  { key: "smooth_arc", text: "keep the ski travelling smoothly through the arc", peer: "keeping the skis travelling smoothly through the whole arc" },
  { key: "push", text: "let the ski push me from turn to turn", peer: "letting the ski push me from one turn into the next" },
  { key: "bend_exit", text: "bend the ski most deeply as I exit the fall line", peer: "bending the ski hardest as I come out of the fall line" },
  { key: "carve", text: "carve when conditions allow", peer: "carving wherever the snow let me" },
];

/** Deterministic from a seed so a brief survives reload and a test can reproduce it. */
export function dealIntent(seed) {
  let h = 2166136261; for (const ch of String(seed || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const o = OUTCOMES[h % OUTCOMES.length], s = SKI_PERFORMANCES[Math.floor(h / OUTCOMES.length) % SKI_PERFORMANCES.length];
  return { outcome: o.key, ski: s.key, seed: String(seed || "") };
}
export const intentText = (i) => { const o = OUTCOMES.find((x) => x.key === i?.outcome), s = SKI_PERFORMANCES.find((x) => x.key === i?.ski); return o && s ? `${o.text} by trying to ${s.text}` : ""; };
export const intentPeerWords = (i) => { const o = OUTCOMES.find((x) => x.key === i?.outcome), s = SKI_PERFORMANCES.find((x) => x.key === i?.ski); return o && s ? `${o.peer}, ${s.peer}` : ""; };

/** What the peer is told, and only the peer. `skierBrief` is a mentor-written note when one exists (per-video brief). */
export function renderPeerBrief({ intent, taskText, skierBrief, who, activity, conditions }) {
  return [
    `YOUR BRIEF (private — Mark does not know this; he has to find it out by asking):`,
    `- On this run you were trying to ${intentText(intent)}. That is your intent. Every answer about what you were doing, feeling or going for comes from it. In your own words it sounds like: "${intentPeerWords(intent)}."`,
    `- You are a ${who || "certified instructor"} skiing ${activity || "the task"}${conditions ? ` on ${conditions}` : ""}.`,
    taskText ? `- What the task asks for (you know this as an instructor; you may or may not have delivered it):\n${taskText.split("\n").map((l) => `  ${l}`).join("\n")}` : null,
    skierBrief ? `- What your mentor wrote about this skier's actual movement (this is what Mark saw; your feel may not match it):\n  ${skierBrief}` : null,
    `- Volunteer nothing. Answer what is asked. If he never asks what you were going for, he never learns it.`,
  ].filter(Boolean).join("\n");
}

/** Score-screen reveal: the dealt intent beside what the peer actually said when asked (from the extraction, when present). */
export function revealIntent({ intent, extraction, dialogMessages }) {
  const asked = (dialogMessages || []).filter((m) => m.role === "user").map((m) => m.content);
  const answers = extraction?.intent_verification?.peer_answers || [];
  const askedIntent = extraction?.intent_verification?.asked === true || asked.some((q) => /intent|working on|trying to|going for|focus|want(ed)? to|goal/i.test(q));
  return { dealt: intentText(intent), peerWords: intentPeerWords(intent), askedIntent, questions: asked, peerAnswers: answers };
}
