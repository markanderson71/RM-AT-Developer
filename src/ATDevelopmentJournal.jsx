import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════
// AT DEVELOPMENT JOURNAL
// A reflective development tool for Alpine Trainer certification
// ═══════════════════════════════════════════════════════════════════════

// ── Connection Domains ──────────────────────────────────
const DOMAINS = [
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

const CONTEXTS = ["Clinic", "Free Skiing", "Shadow", "Assessment Task", "Training", "Self-Study", "Peer Observation"];

const PULSE_OPTIONS = [
  { id: "surface", label: "Surface", desc: "Described what happened but not why", color: "#e05028", icon: "△" },
  { id: "connecting", label: "Connecting", desc: "Linked cause and effect across domains", color: "#e07830", icon: "◇" },
  { id: "integrated", label: "Integrated", desc: "Hit the mark — saw the whole picture", color: "#28a858", icon: "★" },
];

// ── Journal Entry Types with Adaptive Prompts ──────────
const ENTRY_TYPES = {
  coaching: { label: "On-Hill Coaching / MA", icon: "🎿" },
  personal: { label: "Personal Skiing", icon: "⛷" },
  clinic: { label: "Clinic Attended", icon: "📋" },
  feedback: { label: "Feedback Received", icon: "💬" },
  study: { label: "Study / Reading / Video", icon: "📖" },
  general: { label: "General Note", icon: "📝" },
};

const PROMPTS_BY_TYPE = {
  coaching: [
    { id: "whatISaw", label: "What did I see?", placeholder: "Describe the moment — what was happening with the student, the group, or the skier you observed..." },
    { id: "whatWasGoingOn", label: "What was really going on underneath?", placeholder: "Root cause — connect the symptom to the underlying issue. Why was this happening?" },
    { id: "whatIDid", label: "What did I do about it?", placeholder: "Your teaching decision — terrain choice, exercise, progression, demo, verbal cue..." },
    { id: "whyThatApproach", label: "Why that approach and not another?", placeholder: "What made you choose this over other options? What were you considering?" },
    { id: "whatHappened", label: "What happened?", placeholder: "The outcome — did it work? What changed? What didn't change?" },
    { id: "whatIdDoDifferently", label: "What would I do differently?", placeholder: "Knowing what you know now — what would you change? What did you learn?" },
  ],
  personal: [
    { id: "whatISaw", label: "What was I working on?", placeholder: "My focus for this session — what skill, movement, or feeling was I targeting?" },
    { id: "whatWasGoingOn", label: "What did I feel vs what was actually happening?", placeholder: "The gap between intention and execution — what sensations did I notice? What was actually going on?" },
    { id: "whatIDid", label: "What adjustments did I make?", placeholder: "What did I try? Terrain changes, focus shifts, drills, mental cues..." },
    { id: "whyThatApproach", label: "What worked and what didn't?", placeholder: "Which adjustments produced change? Which ones didn't? Why?" },
    { id: "whatHappened", label: "Where am I now vs where I started?", placeholder: "Did the session move me forward? What's the current state of this skill?" },
    { id: "whatIdDoDifferently", label: "What will I try next?", placeholder: "Next session focus — what will I carry forward, what will I change?" },
  ],
  clinic: [
    { id: "whatISaw", label: "What was the subject / focus?", placeholder: "Topic of the clinic — who led it, what was the intended learning?" },
    { id: "whatWasGoingOn", label: "Key takeaways", placeholder: "The 2-3 things that stuck — concepts, drills, frameworks, aha moments..." },
    { id: "whatIDid", label: "How does this connect to my development?", placeholder: "Link to your AT gaps, your themes, or something your mentors have been pushing on..." },
    { id: "whyThatApproach", label: "What resonated most and why?", placeholder: "The thing that clicked — why did it land? What shifted in your understanding?" },
    { id: "whatHappened", label: "What will I apply or try?", placeholder: "Concrete next steps — what will you do differently because of this clinic?" },
    { id: "whatIdDoDifferently", label: "Questions that remain", placeholder: "What are you still unsure about? What do you want to explore further?" },
  ],
  feedback: [
    { id: "whatISaw", label: "Who gave the feedback and what was the context?", placeholder: "Chris after watching me teach, Gates during a training session, a peer after a clinic..." },
    { id: "whatWasGoingOn", label: "What did they say?", placeholder: "Capture the feedback as accurately as you can — their words, their observations..." },
    { id: "whatIDid", label: "What resonated?", placeholder: "Which parts landed? What do you agree with or see in yourself?" },
    { id: "whyThatApproach", label: "What challenged me?", placeholder: "Which parts were hard to hear or that you're not sure about?" },
    { id: "whatHappened", label: "How does this connect to other feedback?", placeholder: "Is this a pattern? Have you heard this before? Does it connect to your themes?" },
    { id: "whatIdDoDifferently", label: "What will I work on?", placeholder: "Concrete action — what changes based on this feedback?" },
  ],
  study: [
    { id: "whatISaw", label: "What did I read, watch, or study?", placeholder: "Article, video, manual section — include link if you have one..." },
    { id: "whatWasGoingOn", label: "What clicked or connected?", placeholder: "The concept or insight that resonated — what did you understand differently after?" },
    { id: "whatIDid", label: "How does this relate to something I'm working on?", placeholder: "Connect to your skiing, your teaching, your AT development, your themes..." },
    { id: "whyThatApproach", label: "How does this change my understanding?", placeholder: "What did you think before vs after? What shifted?" },
    { id: "whatHappened", label: "How will I apply this?", placeholder: "Next time on snow, in a clinic, or doing an MA — how will this show up?" },
    { id: "whatIdDoDifferently", label: "What do I want to explore further?", placeholder: "Follow-up reading, questions to ask mentors, things to try..." },
  ],
  general: [
    { id: "whatISaw", label: "What's on my mind?", placeholder: "Free form — capture whatever is relevant to your development right now..." },
    { id: "whatWasGoingOn", label: "Why does this matter?", placeholder: "Why is this worth noting? How does it connect to your bigger picture?" },
    { id: "whatIDid", label: "Additional thoughts", placeholder: "Anything else you want to capture..." },
    { id: "whyThatApproach", label: "", placeholder: "" },
    { id: "whatHappened", label: "", placeholder: "" },
    { id: "whatIdDoDifferently", label: "", placeholder: "" },
  ],
};

const PROMPTS = PROMPTS_BY_TYPE.coaching;

// ── Speaker Colors (for dialog display) ──────────────
const SPEAKER = {
  mark: { color: "#60b0d0", label: "Mark" },
  peer: { color: "#c080d0", label: "Peer" },
  examiner: { color: "#e0a040", label: "Examiner" },
  ai: { color: "#7a9ab5", label: "AI" },
};

// ── Default Themes ──────────────────────────────────────
const DEFAULT_THEMES = [
  { id: "root-cause", question: "Can I see past the symptom to the root cause?", description: "The MA leap from L3 to AT. Connecting multiple skill interactions to explain why — using 3+ skills simultaneously.", active: true, createdAt: new Date().toISOString() },
  { id: "design-adapt", question: "Can I design and adapt in the moment?", description: "Progression design, terrain selection, exercise choice — and changing the plan when it's not working.", active: true, createdAt: new Date().toISOString() },
  { id: "skiing-expression", question: "Does my skiing express what I'm teaching?", description: "Intentional demonstration — showing the specific blend you're prescribing, on command.", active: true, createdAt: new Date().toISOString() },
];

// ── Resources (AT Program Guide Learning Experiences) ──
const RESOURCES = {
  "Theme 1 — Root Cause": {
    color: "#e07830",
    themeId: "root-cause",
    items: [
      { id: "R-MA1", title: "Multiple skill-to-skill cause-effect analysis", desc: "Observe a skier and identify 3+ interacting skills. Trace the primary cause." },
      { id: "R-MA2", title: "Blended MA using 3+ skills simultaneously", desc: "Practice analyzing movement through multiple lenses at once." },
      { id: "R-MA3", title: "Biomechanics, physics, ski design applied to MA", desc: "Connect what you see to the physics of why it's happening." },
      { id: "R-MA4", title: "Center Line and Common Threads in MA", desc: "Use the PSIA frameworks to deepen your analysis." },
      { id: "R-MA5", title: "Prescribe IDP activity + variations", desc: "Design an activity based on your MA — show the connection from diagnosis to prescription." },
    ]
  },
  "Theme 2 — Design & Adapt": {
    color: "#e8a050",
    themeId: "design-adapt",
    items: [
      { id: "R-CL1", title: "Create learning objectives from MA", desc: "Turn your analysis into a clear, achievable objective for the student." },
      { id: "R-CL2", title: "Plan and adapt learning experiences", desc: "Design a progression — then change it when conditions or students require it." },
      { id: "R-CL3", title: "Adapt to resort needs and diverse groups", desc: "Lead a session with mixed abilities or unexpected constraints." },
      { id: "R-CL4", title: "Foster reflection and 2-way communication", desc: "Get students thinking, not just doing. Ask questions that reveal understanding." },
      { id: "R-CL5", title: "Provide effective feedback", desc: "Practice timing, specificity, and framing of feedback that lands." },
      { id: "R-CL6", title: "Lead a 25-minute clinic", desc: "Full clinic experience — intro, assessment, progression, feedback, wrap-up." },
      { id: "R-CL7", title: "Foster positive group interaction", desc: "Encourage peer learning, group discussion, and collaborative goal-setting." },
    ]
  },
  "Theme 3 — Skiing Expression": {
    color: "#3088cc",
    themeId: "skiing-expression",
    items: [
      { id: "R-SK1", title: "Individual fundamental tasks", desc: "Pivot slips, hop turns, White Pass, stem Christie, outside ski turns — demonstrate with intention." },
      { id: "R-SK2", title: "Center Line milestone demonstrations", desc: "Wedge turn through dynamic parallel — show each with clarity and purpose." },
      { id: "R-SK3", title: "Performance versatility", desc: "Short/medium/long turns, bumps, variable terrain — adapt your skiing to express intent." },
      { id: "R-SK4", title: "Express intent of tactical choices", desc: "Show the connection between what you're demonstrating and why." },
      { id: "R-SK5", title: "Adapt skiing to varying conditions", desc: "Ice, powder, crud, steeps — demonstrate how your skiing changes and why." },
    ]
  },
  "General Development": {
    color: "#7a9ab5",
    themeId: null,
    items: [
      { id: "R-GEN1", title: "Professionalism & self-management", desc: "Preparation, punctuality, communication with supervisors, self-regulation." },
      { id: "R-GEN2", title: "Tactical analysis", desc: "Speed, line, turn shape, edge grip — read the mountain." },
      { id: "R-GEN3", title: "Trust and safety management", desc: "Physical and emotional safety — how you create the environment." },
      { id: "R-GEN4", title: "Interpersonal dynamics management", desc: "Reading the room, managing conflict, adapting communication style." },
    ]
  },
};

const ALL_RESOURCES = Object.values(RESOURCES).flatMap(r => r.items);

// ── Seasons ─────────────────────────────────────────────
const SEASONS = ["25/26", "26/27", "27/28"];
const getCurrentSeason = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 9) return `${String(year).slice(2)}/${String(year + 1).slice(2)}`;
  return `${String(year - 1).slice(2)}/${String(year).slice(2)}`;
};

// ═══════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════

const USERS = {
  mark:  { name: "Mark",  role: "candidate", pin: "1234", color: "#e07830" },
  chris: { name: "Chris", role: "mentor",    pin: "2345", color: "#28a858" },
  gates: { name: "Gates", role: "mentor",    pin: "3456", color: "#28a858" },
  mike:  { name: "Mike",  role: "mentor",    pin: "4567", color: "#3088cc" },
};

// ═══════════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════════

function getApiUrl() {
  return (typeof window !== "undefined" && window.__AT_API_URL__) || "https://script.google.com/macros/s/AKfycby2YyaH64zMSQH5Kmw2PPzfKpFYG-5fdOjn4MivWACs25Bnp9k8sBW2JtDaHlzlmP4l/exec";
}

async function apiGet(sheetName) {
  try {
    const res = await fetch("/api/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "getAll", _sheet: sheetName }),
    });
    const wrapper = await res.json();
    // The sheet proxy wraps the response: { ok: true, response: "..." }
    let data = wrapper;
    if (wrapper.response) {
      try { data = JSON.parse(wrapper.response); } catch(e) { data = wrapper.response; }
    }
    console.log("API response for", sheetName, ":", typeof data, Array.isArray(data), data?.rows ? data.rows.length + " rows" : "no rows key");
    if (Array.isArray(data)) return data;
    if (data?.rows && Array.isArray(data.rows)) return data.rows;
    if (data?.data && Array.isArray(data.data)) return data.data;
    console.warn("Unexpected API response format:", Object.keys(data || {}));
    return [];
  } catch (e) { console.error("API GET error:", sheetName, e); return []; }
}

async function apiPost(action, sheetName, rowData) {
  try {
    const payload = { ...rowData, _action: action, _sheet: sheetName };
    console.log("API POST:", action, "id:", rowData?.id, "keys:", Object.keys(rowData || {}));
    const res = await fetch("/api/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("API response:", action, res.status, JSON.stringify(data).slice(0, 300));
    if (!res.ok || data.error) {
      console.error("API save failed:", data.error || res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`API ${action} error:`, e);
    return false;
  }
}

function apiCreate(s, d) { return apiPost("create", s, d); }
function apiUpdate(s, d) { return apiPost("update", s, d); }
function apiDelete(s, id) { return apiPost("delete", s, { _id: id, id: id }); }
async function apiUpsert(s, d) {
  const ok = await apiUpdate(s, d);
  if (!ok) return apiCreate(s, d);
  return true;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const parseAIJson = (resp) => {
  if (!resp) return { raw: "", scores: null };
  
  // Strategy 1: Clean and parse directly
  try {
    let clean = resp.replace(/```json|```/g, "").trim();
    const jsonStart = clean.indexOf("{");
    const jsonEnd = clean.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const candidate = clean.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(candidate);
      if (parsed.scores) {
        // Ensure scores are numbers not strings
        Object.keys(parsed.scores).forEach(k => { parsed.scores[k] = Number(parsed.scores[k]) || 0; });
        return parsed;
      }
    }
  } catch(e) {}
  
  // Strategy 2: Find the scores object directly via regex
  try {
    const scoresMatch = resp.match(/"scores"\s*:\s*\{([^}]+)\}/);
    if (scoresMatch) {
      // Build a minimal valid JSON around the scores
      const scoresJson = `{${scoresMatch[0]}}`;
      const scoresObj = JSON.parse(scoresJson);
      Object.keys(scoresObj.scores).forEach(k => { scoresObj.scores[k] = Number(scoresObj.scores[k]) || 0; });
      
      // Try to extract other fields
      const result = { scores: scoresObj.scores };
      const extractArray = (key) => {
        const m = resp.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]+)\\]`));
        if (m) try { return JSON.parse(`[${m[1]}]`); } catch(e) { return m[1].split(",").map(s => s.replace(/"/g, "").trim()).filter(Boolean); }
        return null;
      };
      const extractStr = (key) => {
        const m = resp.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
        return m ? m[1] : null;
      };
      result.did_well = extractArray("did_well") || extractArray("strengths");
      result.opportunity = extractArray("opportunity") || extractArray("gaps");
      result.strengths = extractArray("strengths");
      result.gaps = extractArray("gaps");
      result.improvements = extractArray("improvements");
      result.persistent_gaps = extractArray("persistent_gaps");
      result.key_learning = extractStr("key_learning");
      result.cause_effect = extractStr("cause_effect");
      result.root_cause = extractStr("root_cause");
      return result;
    }
  } catch(e) {}
  
  // Strategy 3: Look for score numbers in text format
  try {
    const scorePatterns = {
      describe: /describe[:\s]*(\d)/i,
      cause_effect: /cause.?effect[:\s]*(\d)/i,
      evaluate: /evaluate[:\s]*(\d)/i,
      prescription: /prescription[:\s]*(\d)/i,
      biomechanics: /bio(?:mechanics|\/physics)[:\s]*(\d)/i,
      communication: /comm(?:unication)?[:\s]*(\d)/i,
    };
    const scores = {};
    let found = 0;
    Object.entries(scorePatterns).forEach(([key, pattern]) => {
      const m = resp.match(pattern);
      if (m) { scores[key] = Number(m[1]); found++; }
    });
    if (found >= 3) {
      return { scores, raw: resp };
    }
  } catch(e) {}
  
  return { raw: resp, scores: null };
};
const today = () => new Date().toISOString().split("T")[0];
const parseSummary = (summary) => {
  if (!summary) return null;
  try {
    // Handle double-stringified JSON
    let text = summary;
    if (typeof text === "string" && text.startsWith('"')) {
      try { text = JSON.parse(text); } catch(e) {}
    }
    const obj = typeof text === "string" ? JSON.parse(text) : text;
    if (obj?.scores) {
      Object.keys(obj.scores).forEach(k => { obj.scores[k] = Number(obj.scores[k]) || 0; });
      return obj;
    }
    if (obj?.raw) {
      const reparsed = parseAIJson(obj.raw);
      if (reparsed?.scores) return { ...obj, ...reparsed };
    }
    // Try parseAIJson on the whole object as string
    const fallback = parseAIJson(typeof summary === "string" ? summary : JSON.stringify(summary));
    if (fallback?.scores) return fallback;
    return obj;
  } catch(e) {
    if (typeof summary === "string") return parseAIJson(summary);
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// SPARRING PARTNER — Claude AT Coach
// ═══════════════════════════════════════════════════════════════════════

const AT_COACH_SYSTEM = `You are an Alpine Trainer examiner coaching Mark, a Level 3 certified instructor at Keystone Resort pursuing his AT certification. You are NOT a Level 3 examiner — you coach at the ALPINE TRAINER level.

CRITICAL: THE DIFFERENCE BETWEEN L3 AND AT
Level 3 MA: Works through all phases of the turn, relates ONE fundamental to ANOTHER fundamental, identifies cause and effect between those two. It's bilateral — A causes B. Example: "Pressure is affecting edging — the skier isn't directing enough pressure to the outside ski, so edge angles are insufficient."
AT-level MA: Sees the WHOLE PICTURE first, then PRIORITIZES which fundamental is the primary driver, then relates MULTIPLE fundamentals to each other with cause-effect chains that trace to a VERY SPECIFIC root cause. It's not A→B, it's "I see the whole turn, I know the primary issue is pressure management at the transition, and here's how that cascades: at the transition, rapid extension launches the CM forward (pressure), which delays edge engagement above the fall line (edging), which forces rotary-dominant steering in the shaping phase (rotary) because there's no edge grip to bend the ski into an arc. The root cause is the timing and direction of the extension at transition."

The key differences:
- L3 connects TWO fundamentals. AT connects MULTIPLE and names which one DRIVES the others.
- L3 describes cause-effect. AT PRIORITIZES — sees the whole picture, then zooms in on the root cause with specificity.
- L3 is accurate. AT is accurate AND specific — which phase, which leg, which joint, what the ski is doing vs what the body is doing, and WHY at the physics level.
- L3 prescribes a fix. AT prescribes AND connects the prescription to the subject's intent — showing how fixing the root cause serves what they were already trying to do.

The difference is: SPECIFICITY (which leg, which joint, which phase), CAUSE-EFFECT CHAIN (not just one cause, but how it cascades), PHYSICS (why the ski responds that way), CONDITION AWARENESS (how the prescription fits the snow/terrain), PROCESS (verify before diagnosing, celebrate before correcting), and CONNECTING TO THE SUBJECT'S INTENT (don't override their focus — show how your observation serves it. An L3 says "you need to work on edging, not steering." An AT says "you're working on steering — here's how earlier edge engagement makes that steering more effective by letting the ski do some of the turning work for you").

WHAT AN ALPINE TRAINER IS:
- An AT trains INSTRUCTORS (peers, L1-L3 candidates, new hires), not the public
- The AT exam tests the ability to BE a trainer — develop instructors' understanding, not just fix their skiing
- Mark must demonstrate blended MA using 3+ skill interactions simultaneously

YOUR COACHING APPROACH (based on Chris's actual feedback patterns):
When Mark gives a surface-level answer, push like Chris would:
- "WHERE in the turn? Which phase? Above or below the fall line?"
- "WHICH LEG? Both? One? What's the other leg doing?"
- "You said grip — what IS grip? What does it allow the ski to do? What's the impact on the ski's path of travel?"
- "WAS THAT THE TASK? Before you analyze the skiing, did the instructor do what was asked?"
- "IS THIS a rotary issue, a pressure issue, or an edge issue? You need to name the PRIMARY skill before connecting to others."
- "You connected two fundamentals — that's L3. Now see the WHOLE PICTURE. Which fundamental is DRIVING the others? How does it cascade through the rest?"
- "You jumped straight to a prescription — what QUESTIONS would you ask the instructor first to verify your observation?"
- "You said the ski is washing out — WHERE in the turn? What's the DIRT? Is it the rate of edge engagement or the timing of pressure?"
- "You're prescribing for groomed conditions — but they're on ice. Does your prescription still work? What would you change?"
- "What's the INSIDE ski doing? You described the outside ski but the relationship between the two tells the real story."
- "Is this a skill deficiency or a DIRT issue? Can they DO it but with wrong timing? Or can they not do it at all?"
- "What's WORKING? Say that before you say what's not. The instructor needs to hear success before correction."
- "You're prescribing a groomed-snow solution — look at the CONDITIONS. Does your prescription fit the environment?"
- "The subject said they're focused on steering. You identified edging. DON'T choose one or the other — show how your edging observation CONNECTS to their steering focus. How does fixing the edge make their steering work better?"
- "You described the whole turn as one event — break it down by PHASE: transition, above the fall line, at the fall line, below the fall line."
- "That's an observation, not a diagnosis. An observation is what you SEE. A diagnosis is what you've VERIFIED through dialog."

PUSH ON THESE AT-LEVEL REQUIREMENTS:
1. Describe by turn phase using DIRT (duration, intensity, rate, timing) for precision, not as a single event
2. See the WHOLE PICTURE first, then PRIORITIZE the primary fundamental, then connect MULTIPLE fundamentals with a full cascade to a very specific root cause. Look for Z-shaped patterns across phases.
3. Explain the PHYSICS of why the prescription works — sidecut engagement, forces, edging-rotary spectrum, three-joint constraint, not just "do this exercise"
4. Adapt the analysis to CONDITIONS — snow type, condition, pitch, and speed interact as a system. Ice demands different DIRT than groomed. Use the diagnostic framework: skill deficiency vs accuracy of use vs condition mismatch vs tactical upgrade.
5. Verify through DIALOG before diagnosing (statement-then-question technique)
6. Connect to BIOMECHANICS — which joint, three-joint constraint (ankle flex changes edge angle, femur rotation changes pressure), 65/35 upper/lower separation, inclination vs angulation, inside/outside ski independence
7. Prescribe using IDP activities with VARIATIONS and explain WHY — connect the task to the physics of the root cause and the conditions
8. Address all three CAP domains (cognitive: do they understand? affective: are they ready for feedback? physical: can they execute?)
9. Consider the instructor's CERT LEVEL — how does a new hire vs L2 vs peer change your approach?
10. CONNECT YOUR OBSERVATION TO THE SUBJECT'S INTENT — show how your observation SERVES their intent. An L3 overrides or defers. An AT connects. But the subject gets the WHAT and HOW, not the technical WHY — that goes to the examiner. If you're explaining physics to the subject, that's coaching, not MA communication.
11. Observe BOTH skis — inside and outside ski behavior, their relationship (parallel, diverging, A-frame), and what that reveals about the skill blend

Mark's development themes:
1. "Can I see past the symptom to the root cause?" — blended MA using 3+ skills
2. "Can I design and adapt in the moment?" — progression design, terrain selection, adapting
3. "Does my skiing express what I'm teaching?" — intentional demonstration

Be direct, warm but challenging. You genuinely want Mark to pass but you won't accept L3-level answers for an AT-level certification.`;

const MA_SCENARIO_SYSTEM = `${AT_COACH_SYSTEM}

CURRENT MODE: SCENARIO DRILL
You are presenting Mark with a training scenario for him to analyze. The people in these scenarios are INSTRUCTORS, not guests. When asked for a scenario:
1. Describe a specific instructor — their cert level (new hire, L1, L2, L3, or peer), experience, the terrain, snow conditions, what their skiing or teaching looks like
2. Vary the scenarios: sometimes it's MA of their skiing, sometimes it's observing them teach, sometimes it's a clinic Mark is leading for a group of instructors
3. Include enough observable detail for a blended MA using 3+ skills
4. Include subtle clues that point to a deeper root cause beyond the obvious symptom
5. After Mark responds with his analysis, push back:
   - "You identified X and Y — but what about the timing between those two?"
   - "Is that the cause or the symptom? What's creating that?"
   - "You mentioned 3 skills. What's the PRIMARY cause-effect relationship?"
   - "What would you prescribe? Why THAT and not something else?"
   - "How would you develop their UNDERSTANDING of the issue, not just fix their movement?"
   - "This is an L2 instructor — how does that change your approach vs. a new hire?"
6. Progressively increase difficulty: start with clear single-cause scenarios, move to multi-cause, then to scenarios where the obvious fix is wrong
7. Keep scenarios realistic — things Mark would actually see training instructors at Keystone`;

const MA_REVERSE_SYSTEM = `${AT_COACH_SYSTEM}

CURRENT MODE: REVERSE MA — PRESCRIPTION FIRST
You present Mark with a training decision (a prescription) and ask him to work BACKWARDS to the diagnosis. The context is always training INSTRUCTORS (new hires, L1/L2/L3 candidates, or peers).
1. Describe what the trainer did: the exercise chosen, the terrain selected, the progression used, the verbal cue or question asked, and the level of the instructor being trained
2. Ask Mark: "What did I probably see that led to this prescription? What's the diagnosis behind this choice?"
3. After Mark responds, reveal the actual scenario and discuss:
   - Did he identify the right root cause?
   - Were there other possible diagnoses that could lead to the same prescription?
   - How would the prescription differ if the instructor were a different cert level?
   - Did he think about developing the instructor's UNDERSTANDING or just fixing their movement?
4. This trains Mark to think about the WHY behind training choices, not just the WHAT`;

const MA_COMPARE_SYSTEM = `${AT_COACH_SYSTEM}

CURRENT MODE: COMPARE & CONTRAST
Present Mark with TWO instructors who show similar symptoms but have DIFFERENT root causes. These are instructors Mark is training, not guests.
1. Describe Instructor A and Instructor B — both show the same observable issue. Include their cert level and experience.
2. Include subtle differences in their movement patterns, terrain response, timing, or understanding
3. Ask Mark to:
   - Analyze each instructor separately
   - Identify what's DIFFERENT about the root cause
   - Prescribe differently for each
   - Explain how their cert level and experience changes his approach
   - Describe how he'd develop their UNDERSTANDING, not just fix the movement
4. This is the hardest drill — it trains Mark to look past the obvious and see the individual`;

const MA_VIDEO_SYSTEM = `${AT_COACH_SYSTEM}

CURRENT MODE: VIDEO SELF-ANALYSIS
Mark has watched a video of skiing (his own or a student's) and written his analysis. Your job:
1. Take his written analysis and push it deeper
2. Ask about things he might have missed: timing, terrain interaction, speed management, intent
3. Push for the PRIMARY cause-effect: "You listed 4 observations. Which one is driving the others?"
4. Ask about prescription: "Based on your analysis, what would you do? What terrain? What exercise? Why?"
5. Challenge his depth: "You're describing what you see — now tell me WHY it's happening"`;

const MA_ANALYZER_SYSTEM = `You are scoring an Alpine Trainer candidate's Movement Analysis practice session as Chris (the AT assessor/examiner) would score it. You score using the Fitts & Posner scale at the AT LEVEL.

FITTS & POSNER SCALE:
1 = Cognitive Low — guessing, no framework
2 = Cognitive High — understands concepts but can't apply consistently
3 = Associative Low — L3-level. Connects A→B but doesn't see the whole picture or prioritize
4 = Associative High (PASS) — AT-level. Whole picture, prioritizes primary fundamental, multi-skill cascade, phase-specific, physics explained, prescription connected to intent, technical WHY demonstrated
5 = Autonomous Low — Consistently above AT standard
6 = Autonomous High — Mastery

CALIBRATE AGAINST MENTOR ASSESSMENTS:
If mentor development assessments are provided, use them as ground truth. Score based on whether Mark has addressed what the mentors are pushing on. If a mentor says "cause-effect lacks specific timing and phase," don't give a 4 on cause/effect unless Mark actually addresses timing AND phase in this session.

SCORE HOLISTICALLY across the whole interaction.

WHAT SEPARATES A 3 FROM A 4:
- 3: Relates one fundamental to another with cause-effect: "Pressure is affecting edging" (bilateral, A→B)
- 4: Sees the whole picture, prioritizes the PRIMARY fundamental, then connects MULTIPLE fundamentals with a specific root cause: "The primary issue is pressure timing at the transition — here's how it cascades through edging and rotary"
- 3: Describes cause-effect accurately but between only two fundamentals
- 4: Prioritizes first, then traces a multi-fundamental chain to a VERY SPECIFIC root cause (which phase, which leg, what the ski does as a result)
- 3: Identifies an issue and overrides the subject's stated focus OR defers to it and drops their own observation
- 4: Connects their observation to the subject's intent — "You're working on steering, and here's how earlier edge engagement makes that steering more effective"
- 3: Prescribes a task and explains why to the examiner but doesn't help the subject see why it matters to THEM
- 4: Two distinct communications — delivers the task to the peer connected to their intent, then explains the technical WHY to the examiner at the biomechanics/physics level

WHAT CHRIS PUSHES ON:
- Anatomical vagueness ("both legs" without specifying which, when, where)
- Terms used without unpacking physics ("grip" without explaining what sidecut engagement and reverse camber produce)
- Skipping task compliance check
- Not adapting to conditions — defaulting to groomed-snow thinking
- Jumping to prescription before verifying through dialog
- Not acknowledging what's working (CAP affective)
- Describing the whole turn as one event instead of locating by phase with DIRT
- Not distinguishing inside vs outside ski behavior
- Not identifying whether issue is skill deficiency, accuracy of use, condition mismatch, or tactical upgrade
- Missing the three-joint constraint — how a movement for one skill affects others
- Contradictory descriptions (sign of not organizing by turn phase)

Assessment Scale: 1=Not observed, 2=Beginning, 3=L3-level (appear but inconsistently AT), 4=AT-level satisfactory (PASS), 5=Frequently above required, 6=Continuously superior

Score against these criteria:
- Describe Performance: Phase-specific? Both ski AND body? Which leg, which joint? DIRT used for precision? Inside vs outside ski distinguished?
- Cause and Effect: Multi-skill chain? Primary fundamental prioritized? Bidirectional analysis? Z-shaped patterns identified? Edging-pressure-rotary interactions through three-joint constraint?
- Evaluate: Task compliance checked? Compared to intended outcome using speed, turn shape, size, line, ski-snow interaction? Diagnostic framework applied (skill deficiency vs accuracy of use vs condition mismatch vs tactical upgrade)?
- Prescription: IDP activity chosen? Variations? Terrain justified? Adapted to conditions? Connected to subject's intent when delivered? Technical WHY explained using physics (sidecut, forces, edging-rotary spectrum)?
- Biomechanics/Physics: WHY at physics level? Sidecut engagement, reverse camber, centripetal forces, fore/aft through arc, three-joint constraint, 65/35 upper/lower separation, inclination vs angulation, inside/outside ski independence? A 3 names the skill. A 4 explains the physics.
- Communication: Two audiences — (1) Peer: problem, solution, how it helps — connected to their intent. NOT the technical WHY (that's coaching). Effective delivery = subject restates in their own words without being told. (2) Examiner: the technical WHY — physics, diagnostic reasoning, organized by phase with DIRT precision.

Respond ONLY in this JSON format (no markdown, no backticks):
{"did_well":["specific things done well"],"opportunity":["areas to focus NEXT"],"score_rationale":{"describe":"evidence and which level definition it meets","cause_effect":"evidence","evaluate":"evidence","prescription":"evidence","biomechanics":"evidence","communication":"evidence"},"scores":{"describe":0,"cause_effect":0,"evaluate":0,"prescription":0,"biomechanics":0,"communication":0},"key_learning":"the single most important thing to work on"}`;

const MA_DIALOG_SYSTEM = `${AT_COACH_SYSTEM}

CURRENT MODE: MA EXAMINER FOLLOW-UP (AT LEVEL)
Mark has just delivered his peer-to-peer MA analysis. You are now the examiner in the debrief. Push at the AT level, not L3.

YOUR QUESTIONING APPROACH (modeled on Chris's style):
1. Start with what he DID well — briefly acknowledge one strength before pushing
2. Then ask ONE focused follow-up that targets his weakest point. Examples:
   - If he didn't describe by phase: "Walk me through what happens at the TRANSITION specifically. What are the skis doing? What's the CM doing?"
   - If he used vague anatomy: "You said 'both legs extend' — which leg initiates? What's the inside leg doing differently from the outside?"
   - If he skipped physics: "You said the ski lacks grip. What IS grip at the physics level? What does edge angle + pressure create, and what does that allow the ski to do?"
   - If he didn't check task compliance: "Before we go further — was this the prescribed task? What was the instructor asked to do?"
   - If he jumped to prescription: "You went straight to a fix. What QUESTION would you ask the instructor first? What might they tell you that changes your diagnosis?"
   - If he didn't adapt to conditions: "You prescribed early edging for grip — but this is powder. Does the ski need grip the same way in powder? What changes?"
3. After his response, push ONE more layer deeper — never accept the first answer
4. After 2-3 exchanges, tell him what you have enough to score and give a brief honest assessment

Ask ONE question at a time. Be specific. Sound like Chris, not a textbook.`;

const MA_TREND_SCORER_SYSTEM = `You are scoring an Alpine Trainer candidate's MA practice session as Chris (the AT assessor/examiner) would score it, using the Fitts & Posner scale. You are comparing to previous sessions to identify trends.

SCORING APPROACH:
Score ONLY what the examiner heard — the peer dialog, prescription delivery to the peer, Mark's presentation to the examiner, and the examiner Q&A. Do NOT consider private notes. Score holistically across the whole interaction.

FITTS & POSNER SCALE — HOW CHRIS THINKS WHEN SCORING:
Chris asks three questions for each criterion: Does the candidate SEE it? Does it APPEAR in their work? Is it CONSISTENT?

1 = Not observed or not present — the candidate doesn't see it or attempt it at all
2 = Beginning to appear — the candidate sees it and attempts it, but it's surface-level or incomplete. The essential elements are emerging but not formed.
3 = Appears but not with consistency — the candidate demonstrates the skill, but it's inconsistent. Sometimes they get it, sometimes they miss pieces. They may do it well in one part of the MA but not carry it through. L3-level competence — the work is solid but not reliably AT-level.
4 = Appears regularly at a satisfactory level (PASS) — the candidate demonstrates the skill consistently across the whole interaction at AT standard. This is the bar.
5 = Frequently, above required level — consistently above AT standard with precision and fluidity
6 = Continuously, at a superior level — examiner-level mastery

PROMPTED vs UNPROMPTED — this affects where on the scale it lands:
- If Mark demonstrates a concept WITHOUT the examiner asking about it — it is genuinely present. Depending on consistency and depth, this could be 4, 5, or 6.
- If Mark demonstrates a concept only AFTER the examiner probes for it — distinguish two types:
  - PROMPTED CREATION: Mark didn't show it at all, examiner had to surface it. This caps at 4.
  - PROMPTED REFINEMENT: Mark showed it unprompted, examiner pushed deeper, Mark refined or extended. This is ADDITIVE — score based on the unprompted work, the refinement shows additional depth and does NOT lower the score.
- If the examiner probes and Mark STILL can't demonstrate it — it's not present at that level. The prompting revealed a gap.
- Unprompted + consistent = 5-6 (autonomous). Prompted creation + accurate = caps at 4. Prompted refinement = does not lower the unprompted score. Inconsistent whether prompted or not = 3 (associative, developing).

KEY: The difference between 3 and 4 is CONSISTENCY, not perfection.
- A candidate who demonstrates AT-level analysis once but reverts to L3 thinking elsewhere = 3
- A candidate who demonstrates AT-level analysis throughout the interaction = 4
- A candidate who demonstrates it without being asked and does it naturally = 5+
- Chris does NOT require every AT-level concept to give a 4. He requires that what IS presented appears REGULARLY and at a SATISFACTORY level.

SOPHISTICATION AND CONCISENESS:
- A concise statement can demonstrate MORE understanding than a lengthy explanation. "The extension timing at transition is driving the late edge engagement" condenses a multi-skill cascade into one sentence — that's sophistication, not absence.
- If something isn't explicitly mentioned, consider whether it's IMPLIED by what IS said. A candidate who says "the inside leg needs to shorten faster to allow the CM to cross" has implied inclination, ski-to-ski pressure, and transition mechanics without naming each one.
- Score the THINKING behind the words, not word count. A wordy explanation that walks through every step may be LESS sophisticated than a condensed statement that captures the same insight efficiently.
- Effective, concise, simple, well-understood communication is often a sign of HIGHER level thinking — making complex concepts accessible is harder than being verbose and technical. This applies especially to peer delivery where the AT must make deep analysis feel simple and relevant.
- If you're unsure whether brevity indicates depth or gap — look at the REST of the interaction for evidence. Does the candidate demonstrate the understanding elsewhere? Do their other statements support a deeper read?

CALIBRATE AGAINST CHRIS'S KNOWN ASSESSMENT:
If mentor development assessments are provided, use them as your calibration. If Chris says Mark's cause-effect "lacks specific timing, phase and impacted ski performance," then don't give a 4 on cause/effect unless Mark actually addresses timing, phase, AND ski performance impact CONSISTENTLY in THIS session. If Chris says Mark "jumps to prescription without verifying," don't give a 4 on prescription unless Mark verified through dialog. The mentor assessment is the ground truth.

CRITICAL SCORING GUIDANCE:
The advanced criteria (DIRT, diagnostic framework, inside/outside ski independence, sidecut physics, Z-shaped patterns, conditions adaptation) define what separates a 3 from a 4 — NOT what separates a 2 from a 3.
- If Mark describes by phase, identifies multiple skill interactions, chooses an appropriate task, connects to intent, and uses correct terminology — that is a 3 even if he doesn't use DIRT explicitly or explain sidecut physics. The essential elements APPEAR.
- If Mark does all of the above AND adds AT-level depth CONSISTENTLY — that is a 4.
- A 2 means the essential elements are only BEGINNING to appear — the candidate is attempting but fundamentally missing key components.
Do NOT score a 2 just because AT-level depth is missing. Score a 2 only when L3-level competence is missing.

SCORE THESE CRITERIA — what each level looks like:

IMPORTANT: The criteria below are evidence descriptors, not checklists. The question is NOT "did Mark check every box in the definition?" The question is "does the cognitive depth of Mark's work match this level?" A candidate who demonstrates Analyze-level thinking across the interaction but doesn't explicitly name DIRT has demonstrated a 4 — the depth of the work determines the level, not whether every specific term appears.

Describe:
- 2: Vague description, no phase specificity, doesn't separate ski from body performance
- 3: Describes by phase, separates ski and body performance, specifies which leg/joint
- 4: All of 3 PLUS uses DIRT for precision, distinguishes inside vs outside ski behavior, describes what the ski does on the snow as a result of body movements

Cause/Effect:
- 2: Identifies a single skill issue without connecting to others
- 3: Connects multiple fundamentals in a cause-effect chain (A→B→C), sees skill interactions
- 4: All of 3 PLUS prioritizes the PRIMARY fundamental driving the cascade, identifies Z-shaped patterns across phases, connects through three-joint constraint and edging-pressure interactions

Evaluate:
- 2: Does not check intent or task compliance. Jumps straight to diagnosis without comparing what was intended vs what was observed. No verification through dialog. The candidate prescribes without first understanding what the skier was trying to do.
- 3: Verifies intent through dialog (asking what the skier was working on, what they were trying to achieve) AND/OR checks task compliance. Compares intended vs observed performance in some form. Asking the skier about their focus and then diagnosing based on what they said IS evaluation — it demonstrates that the candidate understands evaluation requires knowing intent before diagnosing.
- 4: All of 3 PLUS explicitly compares using speed/turn shape/size/line/ski-snow interaction, applies diagnostic framework (skill deficiency vs accuracy of use vs condition mismatch vs tactical upgrade), considers how conditions interact

Prescription:
- 2: Suggests a general change without specific task or rationale
- 3: Chooses appropriate IDP task, connects to root cause, explains why to examiner
- 4: All of 3 PLUS includes variations, adapts to conditions, connects to subject's intent when DELIVERING to peer, explains technical WHY using physics (sidecut, forces, edging-rotary spectrum)

Biomechanics/Physics:
- 2: Uses terminology without connection to the analysis. Names skills ("grip," "edge angles," "counter") but the physics understanding doesn't show through the work — the cause-effect chain could be coincidentally correct without understanding WHY.
- 3: Physics understanding is IMPLIED through accurate analysis. The cause-effect chain is physically correct, the prescription mechanically targets the right issue, the explanation of what happens at the ski/snow level makes physical sense. The candidate may not name "reverse camber" or "sidecut engagement" explicitly but DESCRIBES what those concepts do (e.g., "opposite grooves in the snow cause the convergent relationship" demonstrates sidecut understanding without naming it). The physics is DRIVING the analysis accurately — the work demonstrates the understanding.
- 4: Physics understanding drives the analysis AND can be articulated explicitly. The candidate connects to mechanisms — what the ski does, what forces act, why the task produces change — either unprompted in the presentation or cleanly when the examiner probes. The examiner does not need to drill down to verify depth because the analysis already demonstrates it. If the examiner DOES probe, the candidate goes deeper without hesitation.
- 5: Physics is so internalized that it naturally EXTENDS the analysis beyond what was asked. The candidate predicts consequences, connects physics to what the skier FEELS, uses conditions as a physics variable, explains why THIS task works at the mechanism level (not just "it targets edging" but HOW it changes the ski/snow interaction). The examiner hears connections they didn't ask about and doesn't need to probe — the depth is evident and adds value.
- 6: Examiner-level physics. The candidate's analysis consistently adds insight the examiner didn't expect. Physics application is natural, fluid, and deepens every observation.
IMPORTANT: Examiners understand physics — they are listening for whether the physics is DRIVING the analysis accurately, not whether the candidate can lecture on physics. Implied understanding through correct application scores the same as explicit naming. An examiner drills to explicit physics to VERIFY depth, not because naming it is required.

Communication:
- 2: Delivers information but disorganized or unclear
- 3: Organized presentation, connects to subject's focus, clear to examiner
- 4: Depends on MA type:

  FOR AT MA EXAM (has peer dialog): Two-audience delivery where WHAT goes to each audience is appropriate:
    PEER gets: the problem, the solution, how it helps them — connected to their intent and their language. The peer should NOT get the technical WHY — if the candidate explains biomechanics/physics to the peer, that's coaching, not AT-level MA communication. The strongest evidence of effective peer delivery is when the subject restates the problem and solution in their own words without being explicitly told.
    EXAMINER gets: the technical WHY — physics, biomechanics, diagnostic reasoning. Expert-to-expert communication.

  FOR ALL OTHER MA TYPES (Written MA, Scenario, Reverse, Compare, Video): Single audience — examiner only. There is NO peer dialog in these formats. Do NOT penalize for missing peer delivery — it doesn't exist. Score Communication on:
    - Clarity and organization of the analysis
    - Technical depth appropriate for expert-to-expert
    - Efficient, concise delivery that gives the examiner a clear picture
    - A 4 is a clear, well-organized, technically deep presentation to the examiner

  FOR ALL TYPES:
  - Phase-by-phase organization is ONE way to be clear but NOT a requirement for a 4
  - Concise delivery that lands is HIGHER than verbose delivery that covers everything
  - The examiner does not need to be explicitly told every detail — if the picture is clear enough that the examiner can connect the dots, that's concise expert communication
  - Metacognition about dialog design does not need to be stated unless the examiner asks. The behavior IS the evidence.

HOW TO SCORE THE EXAMINER Q&A:
Examiner questions are verifiers, not justifiers. They serve multiple purposes:
- Checking for GREATER understanding (can bring scores UP)
- Validating or clarifying what Mark said
- Verifying understanding
- Seeing if Mark can approach from a different direction
Score based on HOW MARK RESPONDS, not on the fact that questions were asked.
If Mark demonstrates depth in Q&A that he didn't present unprompted — this is PROMPTED demonstration. It shows the skill is present but not yet autonomous. This can raise a 2 to a 3, or a 3 to a 4, but typically not higher than 4 since it required prompting.
If Mark presented it unprompted AND deepens it further in Q&A — that confirms a 4+ score.

CRITICAL SCORING ERRORS TO AVOID:

1. OPPORTUNITY DOES NOT LOWER THE SCORE:
Every score level has areas to improve — even a 5 has growth areas. The "opportunity" and "gaps" fields describe WHERE TO FOCUS NEXT, not evidence against the current score. Score based on what IS present, then describe what's next. A 4 with opportunities to grow is still a 4.

2. PROMPTED REFINEMENT vs PROMPTED CREATION:
If the unprompted presentation demonstrates AT-level work and the examiner Q&A pushes deeper, causing Mark to REFINE his position — score based on the UNPROMPTED work. The Q&A refinement is ADDITIVE — it shows more depth exists, it does not invalidate the initial presentation. Only score as "prompted" when the examiner had to SURFACE something Mark didn't show at all. If Mark presented a cascade and the examiner asked him to name the primary fundamental and he did — that's refinement, not creation. Score the presentation as unprompted AT-level work.

3. LOCATE GAPS ON THE SCALE — DO NOT USE NEXT-LEVEL GAPS TO LOWER CURRENT SCORE:
When you identify a gap, ask: is this the gap between 3 and 4, or between 4 and 5? "Didn't complete the full sidecut-to-groove physics chain when the examiner probed three levels deep" is a gap between 4 and 5 — it does NOT make the score a 3. "Didn't describe by phase at all" is a gap between 2 and 3. Always locate the gap on the scale before using it to determine a score.

4. VERIFY WITH COGNITIVE LEVEL:
Before finalizing each score, check: what cognitive level does the work demonstrate?
- Apply (uses the skill correctly, follows the framework) = 3
- Analyze (separates components, traces interactions, identifies what drives what) = 4
- Evaluate/Create (synthesizes frameworks, defends positions, designs strategies, extends beyond what's asked) = 5
If the cognitive level contradicts the score, the cognitive level wins. You cannot produce Analyze-level work with Apply-level ownership.

Score THIS session in isolation based on the evidence presented. Chris's mentor assessment is the ground truth for calibration — use it to understand where Mark is in his development, but score based on what you see in THIS session.

Respond ONLY in JSON (no markdown, no backticks).
IMPORTANT: For each criterion, CHECK FROM THE TOP DOWN — start at 5, not 3:
1. Check 5: Does the candidate EXTEND beyond what's expected? Unprompted depth that adds value the examiner didn't ask for? Intentional strategy that demonstrates the skill is autonomous and internalized — not just present but deliberately designed? If yes, score 5.
2. Check 4: Does the evidence meet the 4-level definition? Does it appear regularly at a satisfactory level? If yes, score 4.
3. If something is missing from 4, verify it's a genuine 4-level gap — not a 5-level requirement. If it's a 5-level gap, score is still 4.
4. Only fall to 3 if a genuine 4-level element is absent — something from the 4 definition that is NOT present, NOT something from 5 that could be added.
5. Write rationale showing this top-down process: "Checking 5: [yes/no because...]. Checking 4: [evidence meets/doesn't meet because...]"
Do NOT anchor at 3 and look upward for what's missing. Start at 5 and look for what's present.

{"did_well":["specific things done well"],"opportunity":["specific areas to improve — these describe where to focus NEXT, not reasons to lower the score"],"score_rationale":{"describe":"[What evidence: e.g. DIRT used, inside/outside distinguished, phase-specific. Which level definition this meets and why. If giving a 3, explain specifically what L3-level element is MISSING — not what AT-level element could be added.]","cause_effect":"[same format]","evaluate":"[same format]","prescription":"[same format]","biomechanics":"[same format]","communication":"[same format]"},"scores":{"describe":0,"cause_effect":0,"evaluate":0,"prescription":0,"biomechanics":0,"communication":0},"key_learning":"single most important focus"}`;

const MA_PEER_DIALOG_SYSTEM = `You are acting as a ski instructor PEER being observed and questioned by an Alpine Trainer candidate (Mark) during an MA practice exam. Mark has watched you ski and is now asking you questions to verify his observations.

YOUR ROLE: You are NOT a coach. You are the instructor Mark just observed. Answer his questions AS THAT INSTRUCTOR would — with your perspective on what you were doing, feeling, and intending.

HOW TO RESPOND:
- ONE sentence. No preamble. No "yeah good question" or "honestly." Just answer.
- Respond with what a real instructor would say: tactics, fundamentals, cues, ski performance, turn outcome
- Examples of realistic peer responses:
  - "I was focusing on getting my edges engaged before the fall line."
  - "I felt like the tails were washing out in the second half of the turn."
  - "My cue was to tip my feet and let the sidecut do the work."
  - "I wanted rounder turn shape but I think I was getting a bit of a Z at initiation."
  - "I'm not sure — it felt like I was carving but the tracks didn't look clean."
- Sometimes reveal a gap in YOUR understanding in one sentence: "I thought more speed would help me hold the edge."
- Sometimes state a focus DIFFERENT from what Mark identified: "I was really working on my steering."
- If Mark asks a follow-up, answer it directly in one sentence
- Keep answers to 1 sentence — you're an instructor, not giving a lecture
- Reference your cert level naturally. In AT exam context, you are ALWAYS L3 certified or above — you understand terminology, have teaching experience, and can discuss technique. Your self-awareness and precision vary by level:
  - Weak L3: understands basics but struggles to articulate what they feel vs what's happening. Self-assessment may be inaccurate.
  - Solid L3: good self-awareness, can describe what they feel, may not connect it to specific fundamentals
  - Strong L3: articulate about their skiing, connects to fundamentals, approaching AT-level self-analysis
  - Advanced AT candidate: highly self-aware, uses precise terminology, may challenge Mark's analysis constructively

ABOUT YOUR SKIING (use context from the scenario):
- You have strengths and weaknesses — but as an L3+ instructor you have a baseline of competence
- You may not fully understand WHY something is happening in your skiing, but you can describe what you feel
- You have opinions about what works for you that might not be technically accurate
- You're open to feedback but as a peer (not a student) you expect to understand the reasoning

If Mark says something doesn't make sense or pushes back on your answer, acknowledge it naturally: "Yeah, that's fair — maybe I was feeling something different from what was actually happening" and adjust. Mark is right to question you.`;

const MA_EXAM_DEBRIEF_SYSTEM = `${AT_COACH_SYSTEM}

CURRENT MODE: AT MA EXAM — EXAMINER DEBRIEF
Mark has just completed the peer-to-peer portion of an MA exam simulation. He observed a peer, asked questions, and prescribed a change. You are now the examiner conducting the debrief.

YOU HAVE ACCESS TO:
- Mark's written observations and identified root cause
- The peer-to-peer dialog (Mark's questions and the peer's answers)
- Mark's prescription (IDP task and reasoning)
- Mentor development assessments (if available)

YOUR DEBRIEF APPROACH (based on the real AT exam format):
Examiner questions serve MULTIPLE purposes — asking questions is NOT inherently negative:
- To CLARIFY missing criteria — if Mark didn't address something from the scorecard, ask about it
- To CHECK DEPTH of knowledge — verify the candidate understands the WHY, not just the WHAT
- To EVALUATE understanding of fundamentals, body-ski relationships, and evaluation states (impact on the skier, skiing outcomes, effect on performance)
You are a VERIFIER, not a justifier. You are checking whether the candidate has the depth, not making them defend themselves.

EXAMINER BEHAVIOR:
1. ONE sentence acknowledgment of something done well, then immediately ask your first question
2. ONE question at a time. ONE sentence. No preamble, no setup, no "I want to push on this." Just ask.
3. Questions target: missing criteria, depth of fundamentals, body-ski-snow connections, impact on performance
4. Examples of real examiner questions:
   - "Which fundamental is driving the others?"
   - "What is the outside ski doing on the snow at initiation?"
   - "Is this a skill deficiency or a DIRT issue?"
   - "How do the conditions change your prescription?"
   - "What would success look like for the skier?"
   - "What's the inside ski doing during that phase?"
   - "Connect that to ski design — what's happening at the sidecut level?"
5. Do NOT give multi-sentence responses. Do NOT restate what Mark said. Do NOT set up the question with context. Just ask.
6. After 3-4 exchanges, provide a brief honest summary before scoring.`;

const SPARRING_MODES = {
  open: { label: "Open Chat", desc: "Free conversation — ask anything", system: AT_COACH_SYSTEM, color: "#c060a0", icon: "💬" },
  scenario: { label: "Scenario Drill", desc: "I describe a student, you analyze", system: MA_SCENARIO_SYSTEM, color: "#e07830", icon: "🎯" },
  reverse: { label: "Reverse MA", desc: "I give the prescription, you find the diagnosis", system: MA_REVERSE_SYSTEM, color: "#28a858", icon: "🔄" },
  compare: { label: "Compare & Contrast", desc: "Two students, same symptom, different cause", system: MA_COMPARE_SYSTEM, color: "#3088cc", icon: "⚖️" },
  video: { label: "Video Analysis", desc: "Paste your MA, I'll challenge it", system: MA_VIDEO_SYSTEM, color: "#e8a050", icon: "🎥" },
  writtenma: { label: "Written MA", desc: "Write a full MA — AI scores it", system: MA_ANALYZER_SYSTEM, color: "#a0a0d0", icon: "📝" },
  atexam: { label: "AT MA Exam", desc: "Full exam simulation — observe, dialog, prescribe, debrief", system: MA_EXAM_DEBRIEF_SYSTEM, color: "#d06060", icon: "🏔️" },
};

async function callClaude(messages, systemOverride) {
  try {
    // Use Vercel serverless function — bypasses Apps Script bandwidth quota
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: systemOverride || AT_COACH_SYSTEM,
        messages,
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error("Claude API error:", data.error);
      return "Error: " + data.error;
    }
    return data.text || "No response.";
  } catch (e) {
    console.error("Claude API error:", e);
    return "Unable to connect to the sparring partner right now.";
  }
}

// ── Shared UI Components (must be outside main component to avoid remounting) ──
const ATIcon = ({ size = 28 }) => (
  <svg viewBox="0 0 300 300" width={size} height={size} style={{ borderRadius: size * 0.2, flexShrink: 0 }}>
    <rect width="300" height="300" rx="60" fill="#1a2538"/>
    <polygon points="0,230 90,90 130,130 180,70 240,150 300,230" fill="#2a4060"/>
    <polygon points="0,230 70,130 120,170 160,110 210,160 300,230" fill="#1e3350"/>
    <polygon points="0,260 50,170 100,210 140,150 190,190 250,160 300,260" fill="#162840"/>
    <polygon points="180,70 160,98 170,90 180,100 190,88 200,98" fill="#e0e8f0"/>
    <polygon points="90,90 75,110 85,104 95,112 105,102" fill="#d0dae6"/>
    <path d="M60,250 Q90,190 130,170 Q170,150 200,180 Q230,210 250,190" fill="none" stroke="#e07830" strokeWidth="3" strokeLinecap="round"/>
    <path d="M64,254 Q94,194 134,174 Q174,154 204,184 Q234,214 254,194" fill="none" stroke="#d06060" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
    <text x="150" y="58" textAnchor="middle" fontFamily="system-ui" fontSize="42" fontWeight="500" fill="#e8a050" letterSpacing="8">AT</text>
    <line x1="80" y1="270" x2="220" y2="270" stroke="#3a5068" strokeWidth="1"/>
    <line x1="90" y1="282" x2="210" y2="282" stroke="#3a5068" strokeWidth="1"/>
    <circle cx="95" cy="220" r="3" fill="#28a858" opacity="0.8"/>
    <circle cx="130" cy="198" r="4" fill="#e07830" opacity="0.9"/>
    <circle cx="170" cy="182" r="5" fill="#d06060"/>
    <circle cx="210" cy="192" r="4" fill="#e07830" opacity="0.9"/>
    <circle cx="240" cy="198" r="3" fill="#28a858" opacity="0.8"/>
  </svg>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 14px", marginBottom: 10, ...style }}>{children}</div>
);
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 11, color: "#7a9ab5", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{children}</div>
);
const INP_STYLE = { padding: "8px 10px", fontSize: 14, color: "#c0ccd8", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, outline: "none", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const TXTA_STYLE = { ...INP_STYLE, minHeight: 60, resize: "vertical", lineHeight: 1.6 };
const LBL_STYLE = { fontSize: 11, color: "#7a9ab5", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 4 };

// ═══════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════

export default function ATDevelopmentJournal() {
  // ── Auth ────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // ── Data ────────────────────────────────────────────────
  const [entries, setEntries] = useState([]);
  const [themes, setThemes] = useState(DEFAULT_THEMES);
  const [checkpoints, setCheckpoints] = useState([]);
  const [videos, setVideos] = useState([]); // [{ id, date, activity, url, notes, conditions, selfScore, season }]
  const [clinicFeedback, setClinicFeedback] = useState([]); // [{ id, date, topic, audience, duration, selfReflection, feedback, notes }]
  const [mentorCoachNotes, setMentorCoachNotes] = useState({}); // { chris: "...", gates: "...", mike: "..." }
  const [mentorAssessments, setMentorAssessments] = useState({});
  const [mentorProfiles, setMentorProfiles] = useState({}); // { chris: { email: "", notifications: true }, ... } // { chris: { whatsWorking, consistentGaps, progress, lastUpdated }, ... }
  const [maSessions, setMaSessions] = useState([
    {
      id: "ma-sample-3", date: "2025-04-01", context: "MA practice with Chris", who: "Peer (Dave)", activity: "Carved Long Turns",
      transcript: "For this performance, the turns lack symmetry, as evident by a longer finish through the initiation phase than through the shaping phase. This was due to the ski having the highest edge angles at the bottom of the turn because it was too far inside. The way you are moving your center of mass at initiation is to rapidly extend the new outside leg, which helps release the ski but puts you inside the turn. As you move inside the turn, edge angles are built late.",
      notes: "Chris: WAS THIS THE TASK? Description is confusing as there are contradictory statements. Is their issue tipping the ski or releasing it? Could add about grip late into the turn. Lack of grip on the outside ski. High edge angles at the fall line prevents her to rotate her skis at the bottom of the turn to help the turn to be more symmetrical.",
      summary: "",
    },
    {
      id: "ma-sample-2", date: "2025-03-15", context: "MA practice with Chris", who: "Peer", activity: "Variable Terrain",
      transcript: "For this performance, I'm observing that your skis are pivoting rather than steering through a large number of your variable turns, particularly on your left footers. This is due to the impact of your skis flattening as the skis match the slope of the hill and the fact that you struggle to maintain counter through transition. This allows the skis to pivot instead of steer through the bottom half of the turn on your left foot. By maintaining counter through transition will give you the opportunity to use lower leg tipping and rotate to create extra grip on your right footer and allow you to accurately use edge to help steer the ski rather than pivot it.",
      notes: "Chris: WHY DOES THIS SKIER NEED COUNTER OR GRIP? IT IS POWDER AND FRESH SNOW. IS THIS A ROTATION, S/S PRESSURE OR EDGE INACCURACY? Celebrate success if it is successful. Don't forget to call out not doing the task.",
      summary: "",
    },
    {
      id: "ma-sample-1", date: "2025-03-01", context: "MA practice with Chris", who: "Peer (Dave)", activity: "Performance Short Turns",
      transcript: "For this short-radius performance, I observed that the way you managed pressure at the end of the turn directly affected your ability to tip and turn your legs at the initiation of the turn. The extension in both legs with your knee and hip allowed you to be light at transition; however, this reduced your ability to use your lower legs to tip the ski and get purchase in the snow. The end result is that the ski had a tendency to pivot rather than be steered at the top half of the turn, having most of the steering occurred below the fall line. I feel this is particularly critical in firm snow conditions, where creating grip is challenging. The opportunity for you is to flex through transition equally with your hip, knee and ankle, which would still allow you to release your edge while maintaining ski-snow contact, and allow you to tip your legs to develop early grip.",
      notes: "Chris: Where is the extension? Which leg? Both? One? What is purchase and grip? MOST importantly what does that allow you to do? What impact does it have on the ski and its path of travel?",
      summary: "",
    },
  ]);
  const [referenceMaterials, setReferenceMaterials] = useState(`═══ PSIA-RM ASSESSMENT SCALE (All AT Scorecards) ═══

1 = Essential elements were not observed or not present
2 = Essential elements are beginning to appear
3 = Essential elements appear, but not with consistency
4 = Essential elements appear regularly at a satisfactory level (PASS)
5 = Essential elements appear frequently, above required level
6 = Essential elements appear continuously, at a superior level
All sections must average 4 or above to meet the Learning Outcome.

═══ AT MA/TECHNICAL UNDERSTANDING SCORECARD ═══

INSTRUCTOR DECISIONS & BEHAVIOR
Professionalism and Self-Management: Strengthens the professional environment by adapting to situations and other group members on behalf of themself and their resort. (Continual Assessment)
Needs/Safety: Monitors their own physical and emotional needs, adjusting to the needs of others in the group.
Behavior Management: Adapts to ambiguity, change, and/or challenges that arise in the day.

MOVEMENT ANALYSIS
LO: Demonstrates knowledge of cause-and-effect relationships to prepare certification candidates for assessments and enhance clinic participants' skiing.
- Describe Performance: Accurately describes detailed ski AND body performance to enhance skier's understanding.
- Cause and Effect: Prioritizes skiing fundamentals and cause-and-effect relationships using any combination of skiing fundamentals for the benefit of the skier's understanding.
- Evaluate: Comparison of observed performance to the intended specific outcome includes speed, turn shape, turn size, line, and/or ski-snow interaction as needed.
- Prescription: Prescribes specific changes to help the skier achieve their specific outcome and affect speed, turn shape, turn size, line, and/or ski-snow interaction as needed.
- Equipment: Identifies positive or negative effects of equipment on skier's performance towards desired outcomes.

TECHNICAL UNDERSTANDING
LO: Uses technical expertise to enhance clinic participants' knowledge; make technical, tactical, and/or equipment recommendations; and discuss the sport from various perspectives.
- Understanding of Desired Performances: Accurately identify and describe performances, using multiple skiing fundamentals in blended relationships.
- Understanding of Biomechanics/Physics: Accurately use and describe relevant biomechanics and physics principles to describe skiing outcomes.
- Utilizes Resources: Prioritizes information from multiple resources relative to the desired outcome for the skier's benefit.
- Communication: Descriptions and demonstrations aid in understanding for other participants.

═══ AT CLINIC LEADING SCORECARD ═══

PEOPLE SKILLS
- Communication: Maintains two-way communication with clinic participants on behalf of the organization. (Assessed when leading a clinic.)
- Communication: Customizes verbal and non-verbal communication to support individuals and represent PSIA-AASI.
- Active Listening: Uses varied active listening tactics to support the individuals and represent PSIA-AASI.
- Feedback Delivery: Adapts feedback delivery methods and timing to help participants engage with the clinic leader.

RELATIONSHIPS WITH OTHERS (Assessed when leading a clinic.)
- Interaction: Manage the group dynamic to maintain a positive relationship between individuals and PSIA-AASI.
- Motivations/Emotions: Builds group consensus when possible.

CLINIC LEADING SKILLS
- Assess & Plan: Plans learning experiences based on organizational and learner's needs.
- Assess: Continually assess participants' motivations, current performance, and understanding to adapt learning experiences and clinic plan when needed.
- Collaborate: Creates a collaborative environment with clinic participants to establish a clinic plan for achieving the learning outcomes on the outline.
- Plan Clinic: Plans creative, playful, and/or exploratory learning experiences that connect individual's needs to the learning outcomes on the outline.
- Implement: Adapts learning experiences to meet the clinic participants' needs without sacrificing the organizational needs.
- Adapt: Tailor the learning environment to align with the needs of the individuals and PSIA-AASI.
- Descriptions, Demonstrations, Feedback: Provide clear and relevant information that encourages understanding that can be used in ski lessons with the public.
- Manage Risk: Proactively manage physical and emotional risk to enhance professional growth in others.
- Reflect/Review: Fosters the ability to recognize, reflect upon, and assess experiences to enhance understanding and apply what was learned.
- Explore, Experiment, Play: Customize and pace learning experiences to allow participants time to explore, experiment, and/or play to achieve the desired outcomes.
- Describe Change: Encourage the students to communicate change in performance and/or understanding.
- Relate Change: Collaborate with students to apply gained skills to skiing situations.

═══ AT SKIING SCORECARD ═══

SKIING PERFORMANCE
- Adjusts and adapts the Alpine Skiing Fundamentals at all speeds for various training needs including: inspiration, participant understanding, highlighting skill blends, highlighting tactical choices, and problem solving.
- Integrate Fundamentals: Integrate all of the Technical Fundamentals to demonstrate prescribed outcomes.
- Individual Fundamentals: Highlight individual Technical Fundamentals as prescribed.
- Versatility: Vary turn shape, turn size, and line as needed or prescribed to highlight tactical choices and inspire or problem solve.

═══ AT MA ASSESSMENT FLOW ═══

SETUP
Two different Versatility tasks from PSIA-RM Skiing IDP. One session on groomed terrain, one on ungroomed.

THE SEQUENCE (per candidate)
1. Candidate (1) performs the assigned skiing task from starting location to examiners
2. Candidate (1) observes a fellow Candidate (2) performing the prescribed Versatility task
3. Candidate (1) provides a prescription for change and helpful observations/descriptions/details to Candidate (2) based on observed performance
4. The prescription includes a suggested skiing activity from the Individual or Integrated categories of the PSIA-RM Skiing IDP
5. Candidate (2) skis the prescribed task AWAY from Candidate (1) and Examiners
6. Candidate (1) then expands upon their peer-level technical presentation to Examiners — sharing necessary details and information gathered from observations and discussions relative to peer, while comparing Versatility and Integrated or Individual activity performances and answering any Examiner follow-up questions

KEY DETAILS
- Each candidate has TWO opportunities, each up to 15 minutes
- Other candidates lap the run skiing Versatility tasks when not being assessed
- Examiners may randomize order to ensure fair assessment
- Candidates analyze a DIFFERENT skier for each assessment activity

═══ AT SKIING ASSESSMENT FLOW ═══

- 10 Assessment Activities from PSIA-RM Skiing IDP: 3 Individual, 3 Integrated, 4 Versatility
- All conditions possible: groomed, bumps, crud, trees, powder, green through double black
- Variations in movements, mechanics, and tactics at examiner discretion
- Freeskiing may be included — also assessed
- Must display skiing recognizably ABOVE AND BEYOND Level 3

═══ AT PROGRAM OVERVIEW ═══

INTENT: The Alpine Trainer Program provides the best possible education for prospective Alpine Trainers. Comprehensive design aims to help you be a successful and effective Trainer for your home resort — delivering compelling training clinics that balance instructor needs and resort objectives.

STRUCTURE — 3 Modules: 1) Movement Analysis/Technical Understanding 2) Skiing Performance 3) Clinic Leading. Plus: Professionalism & Self-Management (assessed in every module independently)

PREREQUISITES: PSIA Level 3 Alpine Certification, Children's Specialist 2. Recommended: one season between L3 and AT Entrance Assessment to solidify skills.

ENTRANCE ASSESSMENT: Verifies current ability to meet L3 skiing standard. Follows L3 Assessment Activities, Criteria, and National Standards.

COMPLETION: Pass all 3 Module Assessments, attain Freestyle 1 Accreditation (FS1), 3 seasons to complete after passing Entrance Assessment. Previously passed modules don't need to be retaken.

═══ MODULE 1: TECHNICAL/MOVEMENT ANALYSIS ═══

DESCRIPTION: Focuses on using technical understanding to present movement analysis of all skiing up to AT level. Must prioritize information based on audience's understanding and provide analysis using several skill-to-skill relationships. An AT can use a wide body of technical knowledge to analyze a wide range of skiing and present findings to instructors with a wide range of experience.

LEARNING OUTCOMES:
1. Use technical expertise to enhance clinic participants' knowledge; make technical, tactical, and/or equipment recommendations; discuss the sport from various perspectives
2. Demonstrate knowledge of cause-and-effect relationships to prepare certification candidates for assessments and enhance clinic participants' skiing

LEARNING EXPERIENCES:
1. Analyzing Ideal Skiing Performance — analyze world-class skiing using observations, physics, biomechanics, ski design/tuning, boot alignment. What makes them successful? What are the skill-to-skill cause-and-effect relationships?
2. Differences Between Cert Levels — outline differences in standards between L1, L2, L3 for MA and Technical Understanding. What are the purposes behind the differences?
3. Prioritization — prioritize Fundamentals/Skills for a certification candidate. Create priorities based on: a) Largest impact on other skills b) Aligns with skier's perceived intentions c) Most immediately enhances tactical choices d) Addresses performance changes with speed or environment
4. Identifying Multiple Skill-to-Skill Relationships — how many can you identify with accurate body-to-ski cause-effect? Can you describe starting from EACH skill? (bidirectional analysis) Can you use biomechanics, physics, turn shape and speed control to see additional relationships?
5. Personal Alignment and Boot-fitting
6. Tactics — identify tactical choices, how would changes force changes in body-to-ski and skill-to-skill relationships?
7. Attend Physics, Ski Design & Tuning, or Biomechanics/Anatomy Clinics
8. Participate in minimum two MA practice sessions with mentor — practice delivering AT-level analysis with multiple skill-to-skill cause-effect relationships including a third skill for complex blended relationships
9. Center Line and Common Threads — explain how Common Threads highlight mechanical focuses observable at all levels. Identify a Common Thread needing improvement, choose IDP activities to improve it.

═══ MODULE 2: SKIING PERFORMANCE ═══

DESCRIPTION: Must display skiing skills recognizably above and beyond Level 3. Must ski exceptionally demanding conditions. Demonstration tasks of all ability levels in exacting manner. Adaptability to varying conditions and tasks must be second nature. Skiing ability respected by peers and employers as near the pinnacle within the profession.

LEARNING OUTCOME: Adjust and adapt the Alpine Skiing Fundamentals at all speeds for various training needs including: inspiration, participant understanding, highlighting skill blends, highlighting tactical choices, and problem solving.

LEARNING EXPERIENCES:
1. Comparison of Personal Skiing to Ideals — specific skill-to-skill differences, plan to change
2. Personal Skiing Development Over Time — what learned, extent of change, change in understanding, change in skill blending/equipment/tactics
3. On-piste closed environment race/drill-based practice
4. Problem Solving / Skill Development (50-50 failure/success training): a) Variations to Tasks b) Combine 2 Tasks (Reverse Javelin initiation with Javelin shaping, Pivot Slips/Most Flexed at Edge Change, Railroad Tracks/Garland, 1000 steps/Skating) c) Change Environment don't change Speed d) Change Speed without changing Environment e) Vary Skill Blends
5. Center Line and Common Threads — ski through all milestones maintaining consistent mechanics

═══ MODULE 3: CLINIC LEADING ═══

DESCRIPTION: The AT is the substance of quality for the educational program within PSIA-RM. Must have absolutely thorough knowledge of the art of teaching. Must readily demonstrate, use and vary the spectrum of teaching/learning styles. Recognized by peers and employers as ranking among the very best educators in the profession.

LEARNING OUTCOMES:
1. Strengthen professional environment by adapting to situations and group members on behalf of themselves and their resort
2. Plan learning experiences based on resort needs and learners' needs
3. Adapt learning experiences to meet participants' needs without sacrificing resort needs
4. Foster ability to recognize, reflect upon, and assess experiences to enhance understanding
5. Maintain 2-way communication with clinic participants on behalf of resort
6. Adapt to interpersonal dynamics within the group as ambassador of resort

LEARNING EXPERIENCES:
1. What Makes a Great Trainer? — analyze using LCM
2. Creating Learning Outcomes — vary for 1hr, 1-day, 2-day clinics; address New Hires through L3; various settings
3. Progressions connecting Skills/Fundamentals to Ski Design, Turning, Speed Control
4. Experiential Learning — 5 tasks developing skiing through skill-to-skill relationships with modifications for higher/lower skill
5. Variations and Lateral Learning — modify IDP tasks by changing Speed, Environment, Accuracy
6. Feedback — timeliness, detail/accuracy, right amount, relevance
7. Clinic Leading Active Observations/Auditing
8. Clinic Leading Reverse Audit

═══ ALPINE SKIING FUNDAMENTALS ═══

- Control the relationship of the Center of Mass to the Base of Support to direct pressure along the length of the skis (Fore/aft pressure)
- Control pressure from ski to ski and direct pressure toward the outside ski (Ski to ski pressure)
- Regulate the magnitude of pressure created through ski/snow interaction (Overall magnitude)
- Control edge angles through a combination of inclination and angulation
- Control the skis' rotation with leg rotation, separate from the upper body

Alpine Skiing Fundamentals Relative to the Skills Concept: Pressure Control, Edge Control, Rotational Control. Balance/stance is the outcome of the fundamentals working together.

═══ IDP ASSESSMENT ACTIVITIES WITH SKI/BODY PERFORMANCE ═══

LEVEL 3 INDIVIDUAL FUNDAMENTALS:

PIVOT SLIPS — Fore/aft pressure or Rotary
Ski: From a sideslip, ski tips turn downhill as skis pivot 180° to sideslip in other direction. Skis turn simultaneously at consistent rate. Skis pivot under center of foot. Skis bend from center. Corridor less than 1 cat track wide.
Body: Turn skis with leg rotation under stable upper body. Angulate to direct pressure towards the downhill foot while slipping.
Terrain: Blue terrain.

HOP TURNS — Rotary or Magnitude
Ski: Skis and pole come off the ground and land at the same time. Skis are close to parallel through take off, rotation, and landing. Pivot point is under the foot. Skis leave distinctly edged tracks upon landing to establish a stable platform for takeoff. Ski tracks are roughly 45 degrees from fall line (90 degrees total from each other).
Body: Time extension with edge release. Skis are turned in the air with counter rotation of the upper and lower body. Separate upper/lower body, flex, and weight outside ski to balance at finish phase. Use the pole plant to stabilize the upper body when landing.
Terrain: Groomed green terrain or easy blue terrain.

WHITE PASS TURN — Edge or Ski-to-ski pressure
Ski: Inside ski lifts in finish phase through initiation as it becomes the outside ski. Raised ski is relatively level to the snow. New outside ski returns to snow in shaping phase and bends from center. Only one ski is on the snow prior to edge change. Demonstration may be steered or carved depending on terrain and speed.
Body: Turn ski(s) at a consistent rate through all 3 turn phases. Direct pressure towards the outside ski starting in the shaping phase and remain balanced on the same ski through initiation with the unweighted ski lifted off the snow. In the shaping phase, extend the outside leg, place the ski on the snow, and angulate to direct pressure onto the outside ski.
Terrain: Green to blue terrain.

STEM CHRISTIE — Ski-to-ski pressure or Rotary
Ski: New outside ski rotates, brushing the snow at an angle (stem). Old downhill ski retains inside edge as new outside ski stems. Stemmed ski bends as new inside ski rotates, brushing the snow, creating a parallel relationship. Skis are parallel before the fall line. Both skis steer, leaving brushed tracks through turn completion. Skis maintain contact with snow at all times.
Body: Tip feet and legs sequentially at initiation, and simultaneously after matching occurs. Transfer weight to the outside foot (stemmed ski) to control the arc of the turn. Tip and turn (steer) the inside leg to a parallel relationship before the fall line. Start angulating in the shaping phase to aid balance toward the outside ski.
Terrain: Green or blue terrain.

SHORT RADIUS LEAPERS — Magnitude or Edge
Ski: Short Radius Turns with the edge change occurring in the air. Ski performance is as carved as possible given terrain, snow conditions, and turning radius of skis. The "leap" occurs with the skis on the edge at the finish of the turn. The amount of edge change is dependent on speed — more importantly, when the skis land, they are not on the old edges anymore. The trajectory of the skis doesn't change while they are in the air. There is a minimal change in where the skis are pointed when they are in the air.
Body: Time extension with forces that build at completion and change edges in the air. Flex upon landing to manage forces. Shape turn by tipping feet and lower legs at same rate and time. Angulate to direct pressure toward outside foot. Rotate legs at a consistent rate under a stable upper body throughout turn.
Terrain: Blue terrain.

OUTSIDE SKI TURN — Edge or Fore/aft pressure
Ski: New inside ski is off snow prior to edge change and through all turn phases. Inside ski is approximately parallel to snow surface. Outside ski bends through all turn phases. Outside ski leaves brushed track in snow.
Body: Upper/lower body separation helps maintain balance on outside ski as legs rotate under stable upper body. Flex inside leg to lift ski off the snow. Flex or extend progressively to maintain fore/aft balance. Rotate legs and edge ski(s) under a stable upper body.
Terrain: Gentle green to low angle blue terrain.

JAVELIN TURNS — Rotary or Magnitude
Ski: Forebody of outside ski steers under forebody of lifted ski and skis stay crossed until turn finish. Inside ski sets down parallel to outside ski, and becomes new outside ski. Outside ski leaves brushed track in the snow. Angle of crossed skis is maintained from shaping through finish phase of turn.
Body: Throughout the turn, rotate outside leg at a consistent rate under a stable upper body. Align lifted inside leg with the direction of the upper body, creating countered position. Angulate to allow for edge control throughout the turn. Exhibit upper/lower body separation through end of shaping and finish phases.
Terrain: Green or easy blue terrain. Control speed through turn shape.

REVERSE JAVELIN TURN — Fore/aft pressure or Rotary
Ski: Prior to edge change, upcoming outside is weighted as new inside ski comes off the snow. At initiation, tail of inside ski crosses above tail of outside ski. Inside ski points towards the apex of the turn. Outside ski steers towards the fall line until the skis are parallel in the shaping phase. Inside ski returns to snow just after fall line. Both skis are on snow through finish phase.
Body: Lift inside leg and align it to face the direction of the upper body towards the apex of the turn. Match outside ski parallel to inside ski in shaping phase and lower outside ski to snow. Steer leg(s) under a stable upper body throughout the turn. Angulate to control edge angle with outside foot/leg.
Terrain: Green or easy blue terrain. Turn shape controls speed.

FALLING LEAF WITH EDGE CHANGE — Fore/aft pressure or Edge
Ski: Skis sideslip diagonally forward and backward. After sideslipping forward, and backward once, the skis are pivoted roughly 180 degrees with the tips pointing downhill. Skis sideslip diagonally forward and backward pointing across the hill in the opposite direction from the previous Falling Leaf. Edge angle is managed and remains fairly consistent. There is no braking action from increasing edge angles.
Body: The lower body turns more than the upper body throughout the falling leaf. The upper and lower body align briefly during the pivot when Falling Leafs change sides.
Terrain: Moderate blue groomed terrain. Pivots happen near the center of the corridor of the Falling Leafs.

INTEGRATED FUNDAMENTALS (Center Line):

All performed in a medium radius turn, with consistent turn sizes and turn shapes that are symmetrical above and below the fall line, to maintain consistent speed.

COMMON THREADS observed across all milestones:
1. Both skis stay on the snow
2. The ankles work in unison creating matching forward angles
3. The skis are simultaneously guided to begin the turn
4. A countered relationship is maintained through the transition between turns
5. The legs flex and extend independently of each other to move the Center of Mass from turn to turn
6. Torso stability supports lower body mobility and movement

WEDGE TURN — Ski: Maintain consistent wedge shape, tips together tails apart on opposing edges. Skis maintain consistent wedge size. Skis turn at the same rate throughout the turn. Both skis steer into the fall line as the inside edge flattens and outside edge increases. Skis bend from center. Body: Turn legs inward to create narrow wedge, maintain consistent width. Center of Mass stays between feet all of the time, moving laterally toward the inside of the turn. Terrain: Green, no pole plant, control speed through turn shape.

WEDGE CHRISTIE — Ski: At initiation, edges of parallel skis release (flatten) and open to a small wedge. Both tips steer down the hill at the initiation as the wedge is created. The outside ski turns faster in the initiation as the wedge is created. From fall line, the inside ski turns faster and until it matches the outside ski to create a christie turn. Skis bend from center. Body: Allow turn forces to transfer more weight to the outside ski through the shaping phase. Steer lighter inside ski to match the outside ski and create a christie turn. The Center of Mass is in between the feet like a wedge for the wedge portion of the turn. The Center of Mass moves farther to the inside of the turn during the shaping phase like a parallel turn to promote the christie portion of the turn. Terrain: Green terrain, no pole plant, control speed through turn shape.

BASIC PARALLEL — Ski: Maintain a parallel relationship the same distance apart. Skis tip and turn at same time and rate. Both skis tip similar amount throughout turn. Skis bend from center. Body: Tipping movements and angulation start with the legs and are at the same rate and time. Center of Mass crosses from the inside one turn to the next in the transition. Terrain: Green or blue terrain, pole touch corresponds with edge change, control speed through turn shape.

DYNAMIC PARALLEL — Ski: Skis change edges simultaneously at initiation. Skis travel forward through the arc of the turn. Skis edge and bend most in shaping and finish phases. Pressure from the snow turns the skis from the shaping to finish phase. Both skis tip similar amount throughout turn. Body: Transfer weight early, tip feet and lower legs, and direct pressure towards the new outside ski. Direct the upper body towards the apex of upcoming turn. Center of Mass crosses from the inside one turn to the next in the transition. Terrain: Groomed blue terrain, pole touch corresponds with edge change, control speed through turn shape.

VERSATILITY — KEY ACTIVITIES:

DYNAMIC SHORT TURNS (L2) — Ski: Parallel skis turn in a short radius leaving round, carved, carved in phases, or narrow brushed tracks. Skis change edges simultaneously at initiation. Skis travel forward through the arc of the turn. Skis edge and bend most in shaping phase. Both skis tip similar amount throughout turn. Body: Transfer weight early, engage edges, and direct pressure towards the new outside ski. Orient the upper body down the hill. Rotate legs under stable upper body. Subtle fore/aft adjustments maintain balance. Terrain: Groomed blue terrain, corridor approximately one snowcat track wide, link turns of consistent size and speed.

CARVED LONG TURNS (L2) — Ski: Parallel skis turn in a medium radius leaving round, carved tracks. Edged skis are bowed, creating arcs with no to very minimal sideways travel. Skis travel forward through the arc of the turn. Skis edge and bend most in shaping phase. Both skis tip similar amount throughout turn. Body: Transfer weight early, tip feet and lower legs, and direct pressure towards the new outside ski. Orient the upper body towards the apex of upcoming turn. Subtle fore/aft adjustments keeps center of mass balanced over base of support. Legs rotate under stable upper body. Terrain: Groomed blue to black terrain, link turns of consistent speed and size (3 snowcat tracks wide).

PERFORMANCE SHORT TURNS (L3) — Ski: Ski performance is as carved as possible given terrain, snow conditions, and turning radius of skis. Skis travel primarily forward through the arc of the turn. Skis change edges before turning. Skis are parallel with similar edge angles. Both skis bend most in shaping phase. Body: Transfer weight early, tip feet and lower legs, and direct pressure towards the new outside ski. Orient the upper body down the fall line. Match the inside ski with the actions of the outside ski. Legs rotate under stable upper body. Adjust fore/aft stance to maintain balance. Terrain: Groomed blue to black terrain, link completed turns of consistent rhythm and size (not more than 1 snowcat track wide).

VARIABLE CONDITIONS AND TERRAIN (L3) — Ski: Parallel skis make different sized, linked turns that flow with speed, smoothly over varied terrain. Skis steer through turn, or carve in phases. Skis bend, edge, and turn to match terrain variations. Skis edge simultaneously commensurate with terrain. Skis maintain contact with the snow when appropriate. Body: Maintain relatively level upper body as legs and spine flex to absorb terrain and extend to maintain ski/snow contact. Vary intensity, rate, timing, and duration of skills to vary turn size and adjust to terrain/conditions. When absorbing terrain/pressure at turn initiation, body flexion flattens skis to facilitate turning. Flexion/extension movements enhance turn shape and help regulate pressure magnitude. Rotate legs and tip feet from the lower body, separate from and under a stable upper body. Terrain: Ungroomed black or double black terrain, pole plant is present and supports stability of the torso, speed down the hill may vary but does not get out of control, turn shape and line control speed.

SHORT TURNS BUMPS (L3) — Ski: Skis turn in large-radius linked turns, over, against, and around bumps. Skis bend from center as much as possible, but will vary with ski/snow contact in abrupt terrain. Skis edge/flatten at same times although edge angles may vary due to terrain. Skis turn at same time and rate. Skis maintain contact with snow wherever possible. Body: Turn feet/legs simultaneously. Engage edges to shape turns to match terrain. At initiation, upper body is oriented towards apex of turn. Maintain relatively level upper body as legs and spine flex to absorb terrain and extend to maintain ski/snow contact. Maintain upper/lower body separation to assist in edge and rotational control to promote dynamic balance. Adjust fore/aft stance to maintain balance. Terrain: Blue-Black to Black, moderately formed bumps. Distance across the fall line is similar for all turns. Pole swing aids in timing of Center of Mass movement forward and across Base of Support in transition of turns. Turn size and shape will vary based on conditions and demands of terrain.

═══ PROFESSIONALISM & SELF-MANAGEMENT ═══

Assessed in EVERY module from check-in until end of day. Includes follow-up questions, examiner interviews, observed interactions with candidates, resort employees, and guests.

LO: Strengthen the professional environment by adapting to situations and other group members on behalf of themselves and their resort.

Key Questions: How do you respond when things don't go according to plan? What do you need to manage emotionally and physically in a training environment? How do you support others when things are going your way but not theirs?

═══ SUPPLEMENTARY FRAMEWORKS (Not from Assessment Guide — widely used PSIA frameworks) ═══

CAP MODEL — Cognitive, Affective, Physical
Cognitive: Can the instructor explain WHY? Affective: How do they feel? Are they ready for feedback? Physical: Can they execute? What limitations exist?

LEARNING CONNECTION MODEL (LCM)
Technical Skills + Teaching Skills + People Skills. All three assessed simultaneously at AT level.

FITTS & POSNER — Motor Learning Stages
1-Cognitive Low, 2-Cognitive High, 3-Associative Low, 4-Associative High (PASS), 5-Autonomous Low, 6-Autonomous High

═══ L3 MA/TECHNICAL UNDERSTANDING SCORECARD ═══

MOVEMENT ANALYSIS
LO: Describes cause-and-effect relationships of all the Technical Fundamentals through all turn phases, resulting in an effective prescription for change for skiers through the advanced zone.
- Observe and Describe: Observe and describe the application of multiple Technical Fundamentals in all turn phases and from turn to turn.
- Evaluate and Describe: Evaluate and describe the cause and effect relationships between multiple Technical Fundamentals relative to the desired outcome.
- Prescription: Prescribe a specific change, related to multiple Technical Fundamentals, to achieve the desired outcome.

TECHNICAL UNDERSTANDING
LO: Describe specific performances using Technical Fundamentals and considering tactics and equipment choices using current PSIA-AASI resources.
- Describe specific performances using Technical Fundamentals and considering tactics and equipment choices.
- Synthesizes information from multiple PSIA-AASI and snowsports industry resources.
- Understanding of Biomechanics/Physics: Describe the application of the Technical Fundamentals and respective biomechanics and physics within the turn phases of a specific outcome.
- Fundamentals to Personal Performance: Compare the application of the Technical Fundamentals to personal performance.
- Tactics, Equipment, Physical, Environment: Describe the impacts of tactical decisions, equipment choices, physical development, terrain, and snow variation, to skiing outcomes.

═══ L3 TEACHING SCORECARD ═══

TEACHING SKILLS
- Assess & Plan: Plans learning outcomes and creates individualized experiences around a common theme for advanced students.
- Assess: Continually assess student motivations, performance, and understanding.
- Plan: Develop and manage clear learning experiences based on individual needs.
- Implement: Individualizes learning experiences to guide students toward agreed-upon outcomes and optimizes student engagement.
- Adapt: Adapt the learning environment to individual needs while proactively managing physical and emotional risk.
- Descriptions, Demonstrations, Feedback: Provide clear, accurate, and relevant descriptions, demonstrations, and feedback that encourage individualized learning.
- Reflect/Review: Fosters the ability to recognize, reflect upon, and assess experiences to enhance understanding.
- Explore, Experiment, Play: Optimize movement, practice time, and terrain usage.
- Describe & Relate Change: Promote ongoing reflection about students' performance and how it relates to their skiing/riding goals.

PEOPLE SKILLS
- Communication: Engages in and adapts verbal and non-verbal, two-way communication with all individuals.
- Communication: Customize verbal and non-verbal communication to match or influence individuals.
- Active Listening: Use varied, active-listening tactics to personalize the experience.
- Feedback Delivery: Deliver feedback that supports the emotions of the individuals in the group.

RELATIONSHIPS WITH OTHERS
- Interaction: Manage the group dynamic to positively influence individual experiences.
- Motivations/Emotions: Support and manage the motivations and emotions of all.

═══ L3 SKIING SCORECARD ═══

SKIING PERFORMANCE
LO: Continuously adjusts the Technical Fundamentals to demonstrate any specific skiing or ski performance outcome through the advanced zone. Continuously adjusts tactics and ski performance to:
- Integrate Fundamentals: Integrate the Technical Fundamentals through all turn phases to achieve prescribed ski performance.
- Individual Fundamentals: Adapt and blend each of the Technical Fundamentals as prescribed.
- Versatility: Vary turn shape, turn size, and line as needed or prescribed in all skier zones.

═══ L3 vs AT — CRITICAL DIFFERENCES ═══

PROFESSIONALISM
L3: "Promotes a professional environment by adapting behaviors to positively affect others"
AT: "Strengthens the professional environment by adapting to situations and other group members on behalf of themself and their resort"

MA LEARNING OUTCOME
L3: "Describes cause-and-effect relationships of all the Technical Fundamentals through all turn phases, resulting in an effective prescription for change for skiers through the advanced zone"
AT: "Demonstrates knowledge of cause-and-effect relationships to prepare certification candidates for assessments and enhance clinic participants' skiing"
Key shift: L3 describes for skiers. AT prepares CERTIFICATION CANDIDATES and enhances CLINIC PARTICIPANTS — the audience is instructors, not the public.

DESCRIBE PERFORMANCE
L3: "Observe and describe the application of multiple Technical Fundamentals in all turn phases and from turn to turn"
AT: "Accurately describes detailed ski AND body performance to enhance skier's understanding"

CAUSE AND EFFECT
L3: "Evaluate and describe the cause and effect relationships between multiple Technical Fundamentals relative to the desired outcome"
AT: "PRIORITIZES skiing fundamentals and cause-and-effect relationships using ANY COMBINATION of skiing fundamentals for the benefit of the skier's understanding"
Key shift: L3 describes. AT PRIORITIZES and uses ANY COMBINATION.

PRESCRIPTION
L3: "Prescribe a specific change, related to multiple Technical Fundamentals, to achieve the desired outcome"
AT: "Prescribes specific changes to help the skier achieve THEIR specific outcome and affect speed, turn shape, turn size, line, and/or ski-snow interaction as needed"
Key shift: L3 achieves "the" outcome. AT achieves "THEIR" outcome — connected to the subject's intent.

EQUIPMENT
L3: Not a separate criterion
AT: "Identifies positive or negative effects of equipment on skier's performance towards desired outcomes"

SKIING PERFORMANCE
L3: "Continuously adjusts the Technical Fundamentals to demonstrate any specific skiing or ski performance outcome through the advanced zone"
AT: "Adjusts and adapts the Alpine Skiing Fundamentals at all speeds for various training needs including: inspiration, participant understanding, highlighting skill blends, highlighting tactical choices, and problem solving"
Key shift: L3 demonstrates outcomes. AT adjusts for TRAINING NEEDS.

MA EXAM FLOW
L3: Observe peer, 8 minutes to analyze, must include AT LEAST TWO fundamentals. Peer waits OUT OF LISTENING RANGE. No prescription to the peer — only to examiner.
AT: Observe fellow candidate, provide prescription TO THE PEER including IDP task, peer SKIS THE TASK AWAY, then present technical analysis to examiners with up to 15 minutes. TWO sessions on different terrain.
Key shift: L3 talks only to examiner. AT talks to the PEER (prescription delivery) AND the examiner (technical presentation).

TEACHING vs CLINIC LEADING
L3: TEACHING — plans learning outcomes for advanced students in group lesson format, 20-25 minutes
AT: CLINIC LEADING — plans learning experiences for certification candidates based on organizational AND learner needs, 25 minutes, assigned outline emailed 1 week prior
Key shift: L3 teaches students. AT leads clinics for INSTRUCTORS while balancing RESORT NEEDS with learner needs.


═══ PHYSICS & BIOMECHANICS (Technical Understanding Reference) ═══

EDGE-SNOW INTERACTION:
- Flat ski: minimal lateral resistance, rotation is dominant turning force
- Edged ski: sidecut geometry activates. Contact at tip/tail, waist off snow. Pressure bends ski into reverse camber, creating carved arc
- Higher edge angle = deeper sidecut engagement = tighter turn radius
- Edge angle requires BOTH tipping AND pressure to produce a carved arc
- Excessive edge angle: ski breaks away from snow surface, especially in softer conditions where edge cuts through rather than grips
- Edge creates platform to resist centripetal forces through the arc

EDGING-ROTARY RELATIONSHIP:
- Edge creates the PLATFORM, rotary STEERS on it
- The ski needs minimal edge engagement that can hold in the given snow before rotary is effective — once the edge grips, leg rotation steers the ski through the arc
- Without edge grip: rotary just pivots/skids — no platform to steer on
- With edge grip: rotary steers the ski through a controlled arc on the edge platform
- Deeply edged ski resists rotation — edge locked into snow
- Flat ski rotates easily but has no lateral grip
- Most turns require a BLEND that changes through turn phases: initiation (edge engages to create grip, rotary begins steering), shaping (edge engagement increases, sidecut and steering work together), finish (blend shifts for next turn)
- Pure sidecut rarely produces ideal outcome through entire turn — rotary supplements edging
- Steering angle: difference between where ski points and direction of travel. Pure carve = zero. Rotary input creates steering angle.
- Spectrum: pure carve (max edge) to steered (edge platform + rotary blend) to skidded (rotary without edge platform)

CONDITIONS — HOW THEY AFFECT SKI/SNOW INTERACTION:
- Hard pack: supports higher edge angles, rewards precision, exposes edge timing flaws
- Ice: edge skips/chatters. Requires PROGRESSIVE edge engagement, LIGHTER pressure, EARLIER engagement, QUIET smooth movements. Abrupt edging or pressure causes loss of grip. Reduced carving expectations.
- Soft snow: edge cuts through at high angles, requires more steering and less edge
- Powder: ski floats, speed creates flotation. More equal pressure ski-to-ski. Rotary more important.
- Crud/variable: unpredictable resistance changes, continuous adaptation, independent leg absorption
- Steep terrain: gravity accelerates quickly, forces compound rapidly. Turn shape controls speed. Earlier edge engagement needed.
- Bumps: rapid flexion/extension, terrain dictates turn shape/line, maximum upper/lower separation
- Spring/corn: surface changes through the day — frozen AM to soft PM. Adapt within a single run.

PRESSURE MANAGEMENT:
- Pressure builds naturally from centripetal forces during a turn
- Centripetal force formula: F = mv²/r — force equals mass times velocity squared divided by radius
  - If velocity INCREASES: force increases exponentially (v² — double the speed = 4x the force)
  - If radius DECREASES (tighter turn): force increases
  - If mass increases: force increases
  - This is why speed compounds everything and why short turns are more demanding than long turns
- Turn radius defines the tightness of the arc. A smaller radius creates a tighter, more acute arc. Determined by sidecut geometry, edge angle, and steering input.
- The skier can also apply force actively by pushing (extending) against the ski — this adds to the centripetal forces already present
- First half (initiation to fall line): pressure relatively low — momentum and gravity aligned
- Second half (fall line to finish): pressure builds as momentum and ski direction diverge — gravity and inertia compound
- ALL skiers feel the greatest pressure build below the fall line — this is physics
- However, skilled skiers align to those forces HIGHER in the turn — engaging edge earlier, positioning CM earlier — so they are already balanced against the forces before the pressure peaks. They work WITH the forces rather than reacting to them at the bottom.
- Ski pushes on snow, snow pushes back (ground reaction force) from outside the turn
- Skier balances between gravity (down/inside) and ground reaction force (outside) through inclination and angulation
- Pressure as a resource: Absorb (flex = edge lightens), Resist (extend = sustain edge), Redirect (use energy for next turn)
- Pressure management directly affects edge engagement — linked, not independent

TRANSITION:
- How pressure releases from previous turn determines next turn entry
- Retraction (flex/pull feet): skis pushed under CM (crossunder) — quick transitions
- Extension: CM moves over skis (crossover) — more deliberate transitions

FORE/AFT BALANCE:
- Ski accelerates on snow faster than body — tends to get ahead
- Continuous flexion/extension of ankle, knee, hip maintains CM over BoS
- Terrain disrupts: drops accelerate ski (CM lags), rises decelerate (CM surges)
- Fore/aft pressure through the arc: forward (tip engagement at initiation), center (full sidecut in shaping), slight aft (release for transition)

TURN RADIUS AND BALANCE:
- Smaller radius = faster rebalancing required, higher rate of force change
- Speed compounds: more force at higher speed requires more precise adjustment

THE THREE-JOINT CONSTRAINT:
- Legs have three joints: ankle, knee, hip — serving ALL skills
- Any movement for one skill affects others: ankle flexion changes edge angle, femur rotation changes pressure and edge, hip angulation affects fore/aft and rotary
- Lower-level: movements leak across skills. Higher-level: minimize cross-effects through precise isolated joint movements
- This is WHY skill blending matters — skier manages interactions, not separate skills

UPPER/LOWER BODY SEPARATION (65/35):
- ~65% mass upper body, ~35% legs. CM just above hips.
- Small upper body movements have disproportionately large effect on balance and pressure
- Lower-level: upper body drives tipping, rotation, balance. Coupled movement. Spine twist.
- Higher-level: quiet stable upper body platform. All turning/tipping from feet up through ankle/knee/hip. Separation at femur-hip joint. Independent leg suspension.

SKI-TO-SKI PRESSURE & INCLINATION/ANGULATION:
- Leg length difference creates pressure shift — longer leg bears more weight
- Inside leg shortening + outside leg extending moves CM inside = inclination = increased edge angle
- Disadvantage of inclination: further CM moves inside, more time to cross to next turn
- Angulation compensates: hip angles keep upper body over outside ski, balancing against centripetal force
- Banking = inclination WITHOUT angulation. 65% of mass falls inside. Edge overwhelmed. Lower-level error.
- Two ways to shift: shorten inside leg (flex) or extend outside leg (push) — both simultaneously at different rates

INDEPENDENT LEG ACTION:
- Each leg can rotate, tip, flex, extend at different rates and timing independently
- Inside and outside ski can do different things simultaneously: different rotation rates, edge angles, flex/extension, fore/aft position
- Creates complex blending across ALL fundamentals simultaneously
- Higher-level: active inside leg with maintained tension and matching ankle flex
- Observe inside ski: excessive lead? diverging? flat vs matching edge? actively managed or passive? tension or collapse?
- Observe outside ski: tail follows tip? appropriate pressure? progressive edge? extending or flexing? rotation source?
- Relationship between skis tells the story: parallel matching = blended well, diverging = rotary mismatch, A-frame = inside edging without outside matching

TURN PHASES:
- Most specific (AT required): Initiation → Shaping → Finish → Transition
- Less specific: Above fall line / Below fall line
- General (insufficient for AT): "the turn" as one event
- AT communication: precise but efficient. "From initiation through shaping" not "at initiation and then into the first part of shaping"
- Z-shaped observation: cause-effect chain jumps across phases or across turns. Root cause may be in different phase than symptom.

DIRT — Duration, Intensity, Rate, Timing:
- Duration: how long a movement lasts
- Intensity: power/magnitude of movement
- Rate: speed of movement
- Timing: when movement occurs relative to phase or another movement
- DIRT applies independently to each fundamental on each leg
- DIRT + Phase = precise description: "intensity of edging in shaping is high but duration too short"
- Same task, different skiers: DIRT explains the difference

TURN SHAPES:
- C turn: round, complete. Skis cross fall line. Speed controlled through shape. DESIRED.
- S turn: skis change direction but don't fully cross fall line. Speed maintaining/generating. DESIRED for performance.
- J turn: half a C. Point downhill, gradually turn across and uphill. Speed check.
- Z turn (problem): sharp angular changes, no round shaping. Braking at one point. Rotary-dominant, defensive.
- Turn shape is an OUTCOME of skill blending, not a skill itself.

SPEED — TWO FRAMES:
- Linear: how fast down the hill. Determined by pitch, friction, turn shape, tactics.
- Angular: how fast through the arc. Affected by turn radius, edge angle, momentum carried in.
- Speed as input AND output: momentum brought INTO the turn may be desirable or not. Speed that RESULTS from the turn depends on shape, blend, conditions.

AT DIAGNOSTIC FRAMEWORK:
1. SKILL DEFICIENCY: Can't do it even in ideal conditions → IDP task
2. ACCURACY OF USE: Has the skill, wrong DIRT → adjust specific parameters
3. CONDITION MISMATCH: Intent doesn't match what conditions support → tactical adaptation
4. TACTICAL UPGRADE: Getting it done but not optimally → introduce better tactic for these conditions

THE FOUR VARIABLES INTERACT AS A SYSTEM:
- Snow type + condition + pitch + speed combine to create specific demands
- Same movement pattern produces different outcomes in different combinations
- AT must assess: what skier is DOING vs what conditions DEMAND vs the GAP between them
- The gap may be skill, accuracy, conditions, or tactics — prescription depends on which

═══ ADD YOUR OWN NOTES BELOW ═══`); // PSIA content from Assessment Guide 25-26 — editable by Mark
  const [dataLoaded, setDataLoaded] = useState(false);
  const [apiStatus, setApiStatus] = useState("loading"); // loading | connected | error | offline

  // ── UI State ────────────────────────────────────────────
  const [tab, setTab] = useState("journal");
  const [editingEntry, setEditingEntry] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [editingTheme, setEditingTheme] = useState(null);
  const [editingCheckpoint, setEditingCheckpoint] = useState(null);
  const [selectedThemeFilter, setSelectedThemeFilter] = useState(null);
  const [sparringMessages, setSparringMessages] = useState(() => {
    try { const saved = window.localStorage.getItem("at_sparring"); if (saved) { const p = JSON.parse(saved); return p.sparringMessages || []; } } catch(e) {} return [];
  });
  const [sparringInput, setSparringInput] = useState("");
  const [sparringLoading, setSparringLoading] = useState(false);
  const [sparringMode, setSparringMode] = useState(() => {
    try { const saved = window.localStorage.getItem("at_sparring"); if (saved) { const p = JSON.parse(saved); return p.sparringMode || "open"; } } catch(e) {} return "open";
  });
  // Written MA (free practice)
  const [writtenMA, setWrittenMA] = useState(() => {
    try {
      const saved = window.localStorage.getItem("at_writtenMA");
      if (saved) { const p = JSON.parse(saved); if (p.writtenMA) return p.writtenMA; }
    } catch(e) {}
    return { who: "", activity: "", conditions: "", transcript: "", videoUrl: "", videoSkier: "", videoTime: "" };
  });
  const [writtenMAResult, setWrittenMAResult] = useState(() => {
    try { const saved = window.localStorage.getItem("at_writtenMA"); if (saved) { const p = JSON.parse(saved); return p.writtenMAResult || null; } } catch(e) {} return null;
  });
  const [writtenMAScenario, setWrittenMAScenario] = useState(null);
  const [writtenMADialog, setWrittenMADialog] = useState(() => {
    try { const saved = window.localStorage.getItem("at_writtenMA"); if (saved) { const p = JSON.parse(saved); return p.writtenMADialog || []; } } catch(e) {} return [];
  });
  const [writtenMAPhase, setWrittenMAPhase] = useState(() => {
    try { const saved = window.localStorage.getItem("at_writtenMA"); if (saved) { const p = JSON.parse(saved); return p.writtenMAPhase || "setup"; } } catch(e) {} return "setup";
  });
  const [writtenMALoading, setWrittenMALoading] = useState(false);
  // AT MA Exam simulation — load from localStorage if mid-session
  const [examMA, setExamMA] = useState(() => {
    try {
      const saved = window.localStorage.getItem("at_examMA");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.phase && parsed.phase !== "setup") return parsed;
      }
    } catch(e) {}
    return {
      phase: "setup", videoUrl: "", videoSkier: "", videoTime: "", who: "", activity: "", conditions: "",
      observations: "", rootCause: "",
      dialogMessages: [], prescription: "", prescriptionReason: "", prescriptionDialog: [],
      presentation: "",
      debriefMessages: [], result: null,
      attempts: [],
      attemptNumber: 1,
    };
  });
  const [examMALoading, setExamMALoading] = useState(false);
  const [aiAssessmentLoading, setAiAssessmentLoading] = useState(false);
  const [aiAssessmentResult, setAiAssessmentResult] = useState(null);
  const [rescoringId, setRescoringId] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeResponse, setChallengeResponse] = useState(null);
  const [analyzingMA, setAnalyzingMA] = useState(null);

  // Persist exam state to localStorage on every change
  useEffect(() => {
    try {
      if (examMA.phase !== "setup") {
        window.localStorage.setItem("at_examMA", JSON.stringify(examMA));
      } else {
        window.localStorage.removeItem("at_examMA");
      }
    } catch(e) {}
  }, [examMA]);

  // Persist written MA state
  useEffect(() => {
    try {
      if (writtenMAPhase !== "setup") {
        window.localStorage.setItem("at_writtenMA", JSON.stringify({ writtenMA, writtenMAPhase, writtenMADialog, writtenMAResult }));
      } else {
        window.localStorage.removeItem("at_writtenMA");
      }
    } catch(e) {}
  }, [writtenMA, writtenMAPhase, writtenMADialog, writtenMAResult]);

  // Persist sparring messages
  useEffect(() => {
    try {
      if (sparringMessages.length > 0) {
        window.localStorage.setItem("at_sparring", JSON.stringify({ sparringMode, sparringMessages }));
      } else {
        window.localStorage.removeItem("at_sparring");
      }
    } catch(e) {}
  }, [sparringMessages, sparringMode]);

  const saveTimerRef = useRef({});
  const savedIdsRef = useRef(new Set());

  // ── Load data ──────────────────────────────────────────
  useEffect(() => {
    console.log("AT Journal init — loading from 3 tabs");
    async function loadAll() {
      try {
        // Load all 3 tabs in parallel
        const [journalRows, configRows, maRows] = await Promise.all([
          apiGet("Journal"),
          apiGet("Config"),
          apiGet("MASessions"),
        ]);

        // Determine if new tabs exist or need fallback to JournalEntries
        const hasNewTabs = configRows.length > 0 || maRows.length > 0;
        let fallbackRows = [];
        if (!hasNewTabs) {
          console.log("New tabs empty — loading from legacy JournalEntries");
          fallbackRows = await apiGet("JournalEntries");
          fallbackRows.forEach(r => { if (r.id) r.id = r.id.trim(); });
        }

        const allJournalRows = journalRows.length > 0 ? journalRows : fallbackRows;
        const allConfigRows = configRows.length > 0 ? configRows : fallbackRows;
        const allMaRows = maRows.length > 0 ? maRows : fallbackRows;

        allJournalRows.forEach(r => { if (r.id) r.id = r.id.trim(); });
        allConfigRows.forEach(r => { if (r.id) r.id = r.id.trim(); });
        allMaRows.forEach(r => { if (r.id) r.id = r.id.trim(); });

        const totalRows = allJournalRows.length + allConfigRows.length + allMaRows.length;
        console.log("Loaded rows — Journal:", allJournalRows.length, "Config:", allConfigRows.length, "MASessions:", allMaRows.length);
        if (totalRows === 0) { setApiStatus("error"); }
        else { setApiStatus("connected"); }

        // ── Parse Journal Entries ──
        const parsed = allJournalRows.filter(r => {
          const id = (r.id || "").trim();
          if (id.startsWith("_")) return false;
          if (id.startsWith("ma_")) return false;
          if (id) return true;
          if (r.date || r.whatISaw || r.context) return true;
          return false;
        }).map(r => {
          r.id = (r.id || "").trim();
          if (!r.id) r.id = uid();
          let connectionTags = [];
          let themeIds = [];
          let mentorPulse = {};
          let mentorComments = [];
          try { connectionTags = r.connectionTags ? JSON.parse(r.connectionTags) : []; } catch(e) {}
          try { themeIds = r.themeIds ? JSON.parse(r.themeIds) : []; } catch(e) {}
          try { mentorPulse = r.mentorPulse ? JSON.parse(r.mentorPulse) : {}; } catch(e) {}
          try { mentorComments = r.mentorComments ? JSON.parse(r.mentorComments) : []; } catch(e) {}
          return { ...r, connectionTags, themeIds, mentorPulse, mentorComments };
        });
        console.log("Parsed entries:", parsed.length);
        setEntries(parsed);
        parsed.forEach(e => savedIdsRef.current.add(e.id));

        // ── Parse Config ──
        const findConfig = (id) => allConfigRows.find(r => r.id === id);

        const themeRow = findConfig("_THEMES");
        if (themeRow?.data) { try { setThemes(JSON.parse(themeRow.data)); } catch(e) {} }

        const cpRows = allConfigRows.filter(r => r.id?.startsWith("cp_"));
        if (cpRows.length > 0) {
          const cps = cpRows.map(r => { try { return JSON.parse(r.data); } catch(e) { return null; } }).filter(Boolean);
          setCheckpoints(cps.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")));
          cps.forEach(c => { lastSavedRef.current[`cp_${c.id}`] = JSON.stringify(c); });
        } else {
          const cpRow = findConfig("_CHECKPOINTS");
          if (cpRow?.data) { try { setCheckpoints(JSON.parse(cpRow.data)); } catch(e) {} }
        }

        const cnRow = findConfig("_COACH_NOTES");
        if (cnRow?.data) { try { setMentorCoachNotes(JSON.parse(cnRow.data)); } catch(e) {} }

        const maRow2 = findConfig("_MENTOR_ASSESSMENTS");
        if (maRow2?.data) { try { setMentorAssessments(JSON.parse(maRow2.data)); } catch(e) {} }

        const rmRow = findConfig("_REFERENCE_MATERIALS");
        if (rmRow?.data) { setReferenceMaterials(rmRow.data); }

        const vidRows = allConfigRows.filter(r => r.id?.startsWith("vid_"));
        if (vidRows.length > 0) {
          const vids = vidRows.map(r => { try { return JSON.parse(r.data); } catch(e) { return null; } }).filter(Boolean);
          setVideos(vids.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")));
          vids.forEach(v => { lastSavedRef.current[`vid_${v.id}`] = JSON.stringify(v); });
        } else {
          const vidRow = findConfig("_VIDEOS");
          if (vidRow?.data) { try { setVideos(JSON.parse(vidRow.data)); } catch(e) {} }
        }

        const cliRows = allConfigRows.filter(r => r.id?.startsWith("cli_"));
        if (cliRows.length > 0) {
          const clis = cliRows.map(r => { try { return JSON.parse(r.data); } catch(e) { return null; } }).filter(Boolean);
          setClinicFeedback(clis.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")));
          clis.forEach(c => { lastSavedRef.current[`cli_${c.id}`] = JSON.stringify(c); });
        } else {
          const cfRow = findConfig("_CLINIC_FEEDBACK");
          if (cfRow?.data) { try { setClinicFeedback(JSON.parse(cfRow.data)); } catch(e) {} }
        }

        const mpRow = findConfig("_MENTOR_PROFILES");
        if (mpRow?.data) { try { setMentorProfiles(JSON.parse(mpRow.data)); } catch(e) {} }



        // ── Parse MA Sessions ──
        const maSessionRows = allMaRows.filter(r => r.id?.startsWith("ma_"));
        if (maSessionRows.length > 0) {
          const sessions = maSessionRows.map(r => {
            // Detect JSON blob in wrong column (migration put blob in column B which might be "date")
            const blobField = r.data || r.date || "";
            const looksLikeJson = typeof blobField === "string" && blobField.startsWith("{") && blobField.includes('"id"');
            
            if (!looksLikeJson && (r.transcript || r.type)) {
              // Proper column format — fields have real values
              let sections = {}, mentorFeedback = [];
              try { sections = r.sections ? JSON.parse(r.sections) : {}; } catch(e) {}
              try { mentorFeedback = r.mentorFeedback ? JSON.parse(r.mentorFeedback) : []; } catch(e) {}
              return {
                id: (r.id || "").replace(/^ma_/, ""),
                date: r.date || "",
                type: r.type || r.context || "",
                context: r.context || r.type || "",
                who: r.who || "",
                activity: r.activity || "",
                conditions: r.conditions || "",
                videoUrl: r.videoUrl || "",
                videoSkier: r.videoSkier || "",
                videoTime: r.videoTime || "",
                transcript: r.transcript || "",
                sections,
                summary: r.summary || "",
                notes: r.notes || "",
                mentorFeedback,
              };
            }
            // JSON blob format — try parsing from data column, then date column (migration bug)
            const blob = r.data || r.date || "";
            try {
              const parsed = JSON.parse(blob);
              return { ...parsed, id: parsed.id || (r.id || "").replace(/^ma_/, "") };
            } catch(e) { return null; }
          }).filter(Boolean);
          console.log("Loaded", sessions.length, "MA sessions from MASessions tab");
          setMaSessions(sessions.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")));
          sessions.forEach(s => { lastSavedRef.current[s.id] = JSON.stringify(s); });
        } else {
          // Legacy: single _MA_SESSIONS row or ma_* rows in JournalEntries
          const legacyMaRows = allConfigRows.filter(r => r.id?.startsWith("ma_"));
          let legacySessions = [];
          if (legacyMaRows.length > 0) {
            legacySessions = legacyMaRows.map(r => {
              try { return JSON.parse(r.data); } catch(e) { return null; }
            }).filter(Boolean);
            console.log("Found", legacySessions.length, "MA sessions in JournalEntries ma_* rows");
          } else {
            const legacyMA = allConfigRows.find(r => r.id === "_MA_SESSIONS");
            if (legacyMA?.data) {
              try { legacySessions = JSON.parse(legacyMA.data); } catch(e) {}
              console.log("Found", legacySessions.length, "MA sessions in legacy _MA_SESSIONS row");
            }
          }
          if (legacySessions.length > 0) {
            setMaSessions(legacySessions.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")));
          }
        }

        // ── Server-side migration if new tabs are empty ──
        if (!hasNewTabs && fallbackRows.length > 0) {
          console.log("Triggering server-side migration to new tab structure...");
          const ok = await apiPost("migrate", "JournalEntries", {});
          if (ok) console.log("Server-side migration complete — data copied to Journal, Config, MASessions tabs");
          else console.warn("Migration may have failed — check Apps Script execution logs");
        }

      } catch (e) { console.error("Failed to load:", e); setApiStatus("error"); }
      setDataLoaded(true);
    }
    loadAll();
  }, []);

  // ── Helpers ────────────────────────────────────────────
  // Track which IDs have been saved to the sheet

  const saveEntry = (entry) => {
    if (!entry.id) { console.error("saveEntry called without id!"); return; }
    const alreadySaved = savedIdsRef.current.has(entry.id);
    
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n; }
      return [entry, ...prev];
    });

    const sheetRow = {
      id: entry.id,
      date: entry.date || "",
      entryType: entry.entryType || "coaching",
      context: entry.context || "",
      location: entry.location || "",
      conditions: entry.conditions || "",
      whatISaw: entry.whatISaw || "",
      whatWasGoingOn: entry.whatWasGoingOn || "",
      whatIDid: entry.whatIDid || "",
      whyThatApproach: entry.whyThatApproach || "",
      whatHappened: entry.whatHappened || "",
      whatIdDoDifferently: entry.whatIdDoDifferently || "",
      videoUrl: entry.videoUrl || "",
      connectionTags: JSON.stringify(entry.connectionTags || []),
      themeIds: JSON.stringify(entry.themeIds || []),
      depthLevel: entry.depthLevel || "",
      resourceId: entry.resourceId || "",
      season: entry.season || getCurrentSeason(),
      timestamp: entry.timestamp || new Date().toISOString(),
      mentorPulse: JSON.stringify(entry.mentorPulse || {}),
      mentorComments: JSON.stringify(entry.mentorComments || []),
    };

    console.log("Saving entry:", entry.id, alreadySaved ? "UPDATE" : "CREATE");
    if (alreadySaved) {
      apiUpsert("Journal", sheetRow);
    } else {
      apiUpsert("Journal", sheetRow);
      savedIdsRef.current.add(entry.id);
      // Notify mentors of new entry
      const typeLabel = ENTRY_TYPES[entry.entryType]?.label || "Journal Entry";
      const preview = entry.whatISaw ? entry.whatISaw.slice(0, 100) : "New entry";
      notifyMentors(
        `AT Journal: New ${typeLabel} from Mark`,
        `Mark added a new ${typeLabel} (${entry.date || "today"}):\n\n${preview}\n\nView at: https://at-dev-tracker.vercel.app`
      );
    }
  };

  const saveThemes = (newThemes) => {
    setThemes(newThemes);
    apiUpsert("Config", { id: "_THEMES", data: JSON.stringify(newThemes) });
  };

  const saveCheckpoints = async (newCps) => {
    setCheckpoints(newCps);
    for (const cp of newCps) {
      const hash = JSON.stringify(cp);
      if (lastSavedRef.current[`cp_${cp.id}`] !== hash) {
        await apiUpsert("Config", { id: `cp_${cp.id}`, data: hash });
        lastSavedRef.current[`cp_${cp.id}`] = hash;
      }
    }
  };

  const deleteCheckpoint = async (cpId) => {
    await apiDelete("Config", `cp_${cpId}`);
    setCheckpoints(prev => prev.filter(c => c.id !== cpId));
  };

  const saveCoachNotes = (notes) => {
    setMentorCoachNotes(notes);
    apiUpsert("Config", { id: "_COACH_NOTES", data: JSON.stringify(notes) });
  };

  const saveMentorAssessments = (assessments) => {
    setMentorAssessments(assessments);
    apiUpsert("Config", { id: "_MENTOR_ASSESSMENTS", data: JSON.stringify(assessments) });
  };

  const saveReferenceMaterials = (text) => {
    setReferenceMaterials(text);
    if (saveTimerRef.current._ref) clearTimeout(saveTimerRef.current._ref);
    saveTimerRef.current._ref = setTimeout(() => {
      apiUpsert("Config", { id: "_REFERENCE_MATERIALS", data: text });
    }, 2000);
  };

  const saveMaSession = async (session) => {
    // Save individual session to its own row with proper columns
    const rowId = `ma_${session.id}`;
    const row = {
      id: rowId,
      date: session.date || "",
      type: session.type || session.context || "",
      context: session.context || session.type || "",
      who: session.who || "",
      activity: session.activity || "",
      conditions: session.conditions || "",
      videoUrl: session.videoUrl || "",
      videoSkier: session.videoSkier || "",
      videoTime: session.videoTime || "",
      transcript: session.transcript || "",
      sections: session.sections ? JSON.stringify(session.sections) : "",
      summary: typeof session.summary === "string" ? session.summary : (session.summary ? JSON.stringify(session.summary) : ""),
      notes: session.notes || "",
      mentorFeedback: session.mentorFeedback ? JSON.stringify(session.mentorFeedback) : "[]",
    };
    console.log("Saving MA session:", rowId, "type:", row.type, "cols:", Object.keys(row).length);
    const ok = await apiUpdate("MASessions", row);
    if (!ok) {
      const ok2 = await apiCreate("MASessions", row);
      if (!ok2) {
        setSaveError("MA session failed to save — data is in memory but NOT persisted. Don't refresh.");
        console.error("MA session save failed:", session.id);
        return false;
      }
    }
    setSaveError(null);
    return true;
  };

  const deleteMaSession = async (sessionId) => {
    const rowId = `ma_${sessionId}`;
    await apiDelete("MASessions", rowId);
    setMaSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const lastSavedRef = useRef({});

  const saveMaSessions = async (sessions) => {
    // Update state immediately
    setMaSessions(sessions);

    // Only save sessions that changed since last save
    let anyFailed = false;
    for (const session of sessions) {
      const hash = JSON.stringify(session);
      if (lastSavedRef.current[session.id] !== hash) {
        const ok = await saveMaSession(session);
        if (ok) {
          lastSavedRef.current[session.id] = hash;
        } else {
          anyFailed = true;
        }
      }
    }

    if (!anyFailed) setSaveError(null);
  };

  const buildScoreInput = (session) => {
    const ctx = (session.context || "").toLowerCase();
    const type = session.type || "";
    const transcript = session.transcript || "";
    const who = session.who || "unknown";
    const activity = session.activity || "unknown";
    const conditions = session.conditions || "";
    const sections = session.sections || {};
    const jsonReminder = `\n\nRESPOND ONLY IN JSON (no markdown, no backticks, no explanation before or after). CHECK FROM THE TOP DOWN starting at 5: Does the candidate extend beyond what's expected with intentional, autonomous skill? If yes, score 5. Then check 4: does it appear regularly at AT standard? If yes, score 4. If something's missing, verify it's a 4-level gap not a 5-level gap. Only fall to 3 if a genuine 4-level element is absent.\n{"did_well":["list"],"opportunity":["areas to focus NEXT, not reasons to lower score"],"score_rationale":{"describe":"check 5 then 4 — what's present?","cause_effect":"same","evaluate":"same","prescription":"same","biomechanics":"same","communication":"same"},"scores":{"describe":0,"cause_effect":0,"evaluate":0,"prescription":0,"biomechanics":0,"communication":0},"key_learning":"text"}`;

    // Include mentor feedback for this session if present (corrections are ground truth)
    const fb = session.mentorFeedback || [];
    let mentorContext = "";
    if (fb.length > 0) {
      mentorContext = "\n\nMENTOR CORRECTIONS FOR THIS SESSION (ground truth — adjust scoring accordingly):\n";
      fb.forEach(f => {
        const name = USERS[f.userId]?.name || f.userId;
        mentorContext += `${name}: ${f.text}\n`;
      });
    }

    // Detect type by explicit type field, then context, then content
    const hasPeerDialog = sections.peer_dialog || transcript.includes("PEER DIALOG:");
    const hasPrescription = sections.prescription_delivery || /PRESCRIPTION DELIVER[A-Z]*[^:]*:/i.test(transcript);
    const hasPresentation = sections.presentation || transcript.includes("PRESENTATION TO EXAMINER:");
    const hasExaminerQA = sections.examiner_qa || /EXAMINER Q&A|--- EXAMINER/i.test(transcript);
    const isATExam = type === "at_exam" || ctx.includes("at ma exam") || (hasPeerDialog && hasPresentation);
    const isWrittenMA = type === "written_ma" || (!isATExam && (ctx.includes("examiner q&a") || ctx.includes("free write") || (hasExaminerQA && !hasPeerDialog)));

    console.log("buildScoreInput type:", isATExam ? "AT Exam" : isWrittenMA ? "Written MA" : type || "Default", "| structured:", Object.keys(sections).length > 0);

    if (isATExam) {
      // Use structured sections if available, fall back to regex parsing
      const peerDialog = sections.peer_dialog || transcript.match(/PEER DIALOG:\n?([\s\S]*?)(?=\n?(?:PRESCRIPTION|PRESENTATION))/)?.[1]?.trim() || "";
      const prescription = sections.prescription_delivery || transcript.match(/PRESCRIPTION[^:]*:\n?([\s\S]*?)(?=\n?PRESENTATION TO EXAMINER)/)?.[1]?.trim() || "";
      const presentation = sections.presentation || transcript.match(/PRESENTATION TO EXAMINER:\n?([\s\S]*?)(?=\n?EXAMINER Q&A)/)?.[1]?.trim() || transcript.match(/PRESENTATION TO EXAMINER:\n?([\s\S]*?)$/)?.[1]?.trim() || "";
      const examinerQA = sections.examiner_qa || transcript.match(/EXAMINER Q&A:\n?([\s\S]*?)$/)?.[1]?.trim() || "";

      console.log("AT Exam sections — dialog:", peerDialog.length, "prescription:", prescription.length, "presentation:", presentation.length, "Q&A:", examinerQA.length, "structured:", !!sections.peer_dialog);

      return `SCORE ONLY WHAT THE EXAMINER HEARD — this is a full AT MA Exam with two audiences:\n\nPEER DIALOG (examiner observed):\n${peerDialog}\n\nPRESCRIPTION DELIVERY TO PEER (examiner observed):\n${prescription}\n\nPRESENTATION TO EXAMINER:\n${presentation}\n\nEXAMINER Q&A:\n${examinerQA}\n\nContext: ${who}, ${activity}${conditions ? ", " + conditions : ""}\n\nSCORING NOTES:\n- Score TWO communication audiences with CORRECT content split: (1) peer gets problem, solution, how it helps — NOT the technical WHY (2) examiner gets the technical WHY, physics, diagnostic reasoning by phase\n- If the subject restates the problem and solution in their own words without being told, that's a sign of effective communication\n- If the candidate explains physics/biomechanics TO the subject, that's coaching not AT communication — do not credit for Communication\n- Examiner questions are verifiers, not justifiers. Prompted depth can raise scores but typically caps at 4.\n- Evidence for ANY criterion can appear in ANY section. Dialog verification of intent counts toward Evaluate.\n- Score based on the TOTAL picture across all phases.${mentorContext}${jsonReminder}`;
    }

    if (isWrittenMA) {
      // Use structured sections if available, fall back to transcript parsing
      const analysis = sections.written_analysis || transcript.split(/---\s*EXAMINER Q&A\s*---/)[0]?.trim() || transcript;
      const dialog = sections.examiner_qa || transcript.split(/---\s*EXAMINER Q&A\s*---/)[1]?.trim() || "";

      return `SCORE THIS WRITTEN MA WITH EXAMINER Q&A — single audience (examiner only, no peer delivery):\n\nWRITTEN ANALYSIS:\n${analysis}\n\nEXAMINER Q&A:\n${dialog}\n\nContext: ${who}, ${activity}${conditions ? ", " + conditions : ""}\n\nSCORING NOTES:\n- There is NO peer dialog in this format — do NOT penalize Communication for missing peer delivery\n- Score Communication ONLY on clarity, organization, and technical depth of the written analysis and examiner responses\n- A clear, well-organized, technically deep presentation to the examiner IS a 4 on Communication for this format\n- Evidence for ANY criterion can appear in ANY section${mentorContext}${jsonReminder}`;
    }

    // Default — check if there's actually dialog content we should use
    if (hasPeerDialog || hasPresentation || hasPrescription) {
      // Has dialog-like content but wasn't detected as AT exam — score what's there
      return `SCORE THIS MA SESSION — it contains dialog and/or presentation elements:\n\n${transcript}\n\nContext: ${who}, ${activity}\n\nScore based on ALL content present including any peer dialog, prescription delivery, and examiner presentation.${mentorContext}${jsonReminder}`;
    }

    // Chat-based practice modes (Scenario Drill, Reverse MA, Compare & Contrast, Video Analysis)
    // Score like talking to an examiner — single audience, evaluating the analysis dialog
    const modeLabels = {
      scenario: "Scenario Drill — Mark analyzed an AI-generated scenario",
      reverse: "Reverse MA — Mark worked backward from a prescription to diagnosis",
      compare: "Compare & Contrast — Mark analyzed two skiers with similar symptoms but different root causes",
      video: "Video Analysis — Mark analyzed skiing from a video",
    };
    const modeKey = type || (ctx.includes("scenario") ? "scenario" : ctx.includes("reverse") ? "reverse" : ctx.includes("compare") ? "compare" : ctx.includes("video") ? "video" : null);
    
    if (modeKey) {
      return `SCORE THIS ${modeLabels[modeKey].toUpperCase()}:\n\nThis is a practice conversation where Mark is analyzed as if presenting to an examiner. Score the quality of Mark's analysis, observations, cause-effect reasoning, and any prescriptions within the dialog. Mark's messages are labeled "Mark:" and the AI coach responses are labeled "AI:".\n\n${transcript}\n\nContext: ${who || modeLabels[modeKey]}, ${activity}\n\nSCORING NOTES:\n- Single audience — score as if Mark is presenting to an examiner\n- There is NO peer dialog in this format — do NOT penalize Communication for missing peer delivery\n- Score Communication on clarity and technical depth of Mark's contributions only — a clear, technically deep analysis IS a 4 on Communication for this format\n- The AI coach may have pushed Mark deeper — evaluate Mark's responses including prompted depth\n- Evidence for scoring comes from Mark's messages, not the AI's${mentorContext}${jsonReminder}`;
    }

    // True default — basic MA observation/analysis
    return `SCORE THIS MA SESSION:\n\n${transcript}\n\nContext: ${who}, ${activity}\n\nScore based on the quality of the observation, analysis, and any prescription provided. Score Communication based on clarity and organization.${mentorContext}${jsonReminder}`;
  };

  // Lean prompt for scoring — only includes what the scorer needs
  const buildScorerPrompt = (baseSystem) => {
    let prompt = baseSystem;

    // Layer 1 ONLY: Mentor assessments for calibration (ground truth)
    const assessmentEntries = Object.entries(mentorAssessments).filter(([, v]) => v?.whatsWorking || v?.consistentGaps || v?.progress);
    if (assessmentEntries.length > 0) {
      prompt += "\n\n=== MENTOR DEVELOPMENT ASSESSMENTS (GROUND TRUTH) ===\nCalibrate your scores against these:\n";
      assessmentEntries.forEach(([key, a]) => {
        const name = USERS[key]?.name || key;
        prompt += `\n${name}'s Assessment:`;
        if (a.whatsWorking) prompt += `\n  What's working: ${a.whatsWorking}`;
        if (a.consistentGaps) prompt += `\n  Consistent gaps: ${a.consistentGaps}`;
        if (a.progress) prompt += `\n  Progress noticed: ${a.progress}`;
      });
    }

    // Recent mentor per-session feedback (qualitative calibration context)
    const recentMentorFb = maSessions
      .flatMap(s => (s.mentorFeedback || []).map(f => ({ ...f, date: s.date, activity: s.activity, context: s.context })))
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, 4);
    if (recentMentorFb.length > 0) {
      prompt += "\n\n=== RECENT MENTOR FEEDBACK ON MARK'S SESSIONS (qualitative context, not scoring instructions) ===\n";
      recentMentorFb.forEach(f => {
        const name = USERS[f.userId]?.name || f.userId;
        prompt += `${name} (${f.date || ""}, ${f.context || f.activity || ""}): ${f.text}\n`;
      });
    }


    // Filtered reference materials — only sections relevant to MA scoring
    if (referenceMaterials.trim()) {
      const sections = referenceMaterials.split(/═══\s*/);
      const keepPatterns = [
        /ASSESSMENT SCALE/i,
        /AT MA.*SCORECARD/i,
        /AT MA.*ASSESSMENT FLOW/i,
        /ALPINE SKIING FUNDAMENTALS/i,
        /IDP ASSESSMENT/i,
        /PROFESSIONALISM/i,
        /L3 MA.*SCORECARD/i,
        /L3 vs AT/i,
        /PHYSICS.*BIOMECHANICS/i,
        /SUPPLEMENTARY/i,
      ];
      const filteredSections = sections.filter(section => {
        const firstLine = section.split("\n")[0].trim();
        return keepPatterns.some(pattern => pattern.test(firstLine));
      });
      if (filteredSections.length > 0) {
        prompt += "\n\n=== REFERENCE MATERIALS (SCORING RELEVANT) ===\n";
        prompt += filteredSections.map(s => "═══ " + s).join("\n");
      }
    }

    console.log("Scorer prompt:", prompt.length, "chars vs full buildSystemPrompt would be ~65000+");
    return prompt;
  };

  const saveVideos = async (vids) => {
    setVideos(vids);
    for (const v of vids) {
      const hash = JSON.stringify(v);
      if (lastSavedRef.current[`vid_${v.id}`] !== hash) {
        await apiUpsert("Config", { id: `vid_${v.id}`, data: hash });
        lastSavedRef.current[`vid_${v.id}`] = hash;
      }
    }
  };

  const deleteVideo = async (vidId) => {
    await apiDelete("Config", `vid_${vidId}`);
    setVideos(prev => prev.filter(v => v.id !== vidId));
  };

  const saveClinicFeedback = async (fb) => {
    setClinicFeedback(fb);
    for (const c of fb) {
      const hash = JSON.stringify(c);
      if (lastSavedRef.current[`cli_${c.id}`] !== hash) {
        await apiUpsert("Config", { id: `cli_${c.id}`, data: hash });
        lastSavedRef.current[`cli_${c.id}`] = hash;
      }
    }
  };

  const deleteClinic = async (clinicId) => {
    await apiDelete("Config", `cli_${clinicId}`);
    setClinicFeedback(prev => prev.filter(c => c.id !== clinicId));
  };

  const saveMentorProfiles = (profiles) => {
    setMentorProfiles(profiles);
    apiUpsert("Config", { id: "_MENTOR_PROFILES", data: JSON.stringify(profiles) });
  };

  const notifyMentors = async (subject, body) => {
    return await apiPost("notify", "Config", { subject, body });
  };




  // Build enhanced system prompt with all context layers
  const buildSystemPrompt = (baseSystem) => {
    let prompt = baseSystem;

    // Layer 1: Mentor development assessments (HIGHEST PRIORITY — this is how mentors see Mark's development)
    const assessmentEntries = Object.entries(mentorAssessments).filter(([, v]) => v?.whatsWorking || v?.consistentGaps || v?.progress);
    if (assessmentEntries.length > 0) {
      prompt += "\n\n=== MENTOR DEVELOPMENT ASSESSMENTS (HIGHEST PRIORITY) ===\nThese are written by Mark's AT mentors/examiners. They represent the GROUND TRUTH of where Mark is. Your coaching must align with these assessments. If a mentor says a gap exists, push on it. If a mentor says something is working, acknowledge it.\n";
      assessmentEntries.forEach(([key, a]) => {
        const name = USERS[key]?.name || key;
        prompt += `\n${name}'s Assessment (updated ${a.lastUpdated || "undated"}):`;
        if (a.whatsWorking) prompt += `\n  What's working: ${a.whatsWorking}`;
        if (a.consistentGaps) prompt += `\n  Consistent gaps: ${a.consistentGaps}`;
        if (a.progress) prompt += `\n  Progress noticed: ${a.progress}`;
      });
    }

    // Layer 2: Mentor coaching notes (private per-mentor)
    const noteEntries = Object.entries(mentorCoachNotes).filter(([, v]) => v?.trim());
    if (noteEntries.length > 0) {
      prompt += "\n\n=== MENTOR COACHING NOTES ===\nThe following notes are from Mark's mentors. Use these to personalize your coaching:\n";
      noteEntries.forEach(([key, note]) => {
        const name = USERS[key]?.name || key;
        prompt += `\n${name}: "${note}"`;
      });
    }

    // Layer 3: Recent reflection history + mentor comments and pulse
    const recentEntries = [...entries]
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""))
      .slice(0, 8);
    if (recentEntries.length > 0) {
      prompt += "\n\n=== MARK'S RECENT REFLECTIONS (most recent first) ===\nUse these to track Mark's development arc. Reference them when relevant — notice patterns, growth, and recurring gaps.\n";
      recentEntries.forEach(e => {
        const tags = (e.connectionTags || []).join(", ");
        prompt += `\n[${e.date} · ${e.context}${e.location ? ` · ${e.location}` : ""} · Connections: ${tags || "none"}]`;
        if (e.whatISaw) prompt += `\nSaw: ${e.whatISaw.slice(0, 200)}`;
        if (e.whatWasGoingOn) prompt += `\nRoot cause: ${e.whatWasGoingOn.slice(0, 200)}`;
        if (e.whatIDid) prompt += `\nAction: ${e.whatIDid.slice(0, 150)}`;
        if (e.whyThatApproach) prompt += `\nWhy: ${e.whyThatApproach.slice(0, 150)}`;
        // Mentor depth assessment on this reflection
        const pulse = e.mentorPulse || {};
        const pulseEntries = Object.entries(pulse).filter(([, v]) => v);
        if (pulseEntries.length > 0) {
          prompt += `\nMentor depth assessment: ${pulseEntries.map(([k, v]) => {
            const depthLabels = { surface: "Surface (needs more depth)", connecting: "Connecting (linking cause-effect)", integrated: "Integrated (hit the mark)" };
            return `${USERS[k]?.name || k}: ${depthLabels[v] || v}`;
          }).join(", ")}`;
        }
        // Mentor comments on this reflection
        const comments = e.mentorComments || [];
        if (comments.length > 0) {
          prompt += "\nMentor comments:";
          comments.slice(-3).forEach(c => {
            const name = USERS[c.userId]?.name || c.userId;
            prompt += `\n  ${name}: "${(c.text || "").slice(0, 200)}"`;
          });
        }
        prompt += "\n";
      });
    }

    // Layer 4: Reference materials
    if (referenceMaterials.trim()) {
      prompt += `\n\n=== PSIA REFERENCE MATERIALS ===\nUse this knowledge when coaching Mark. Reference these frameworks, concepts, and criteria in your feedback:\n\n${referenceMaterials}`;
    }

    // Layer 5: MA session transcripts, analysis, and MENTOR FEEDBACK
    const recentMA = [...maSessions].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).slice(0, 4);
    if (recentMA.length > 0) {
      prompt += "\n\n=== MARK'S MA SESSION TRANSCRIPTS ===\nThese are Mark's actual MA practice sessions with AI analysis and MENTOR FEEDBACK. The mentor feedback is the most important calibration data — it shows you how real AT examiners evaluate Mark's work. Align your coaching with what the mentors push on.\n";
      recentMA.forEach(s => {
        prompt += `\n[${s.date} · ${s.context || ""} · Analyzing: ${s.who || "unknown"} · Activity: ${s.activity || ""}]`;
        if (s.summary) {
          try {
            const parsed = parseSummary(s.summary);
            if (parsed?.scores) {
              prompt += `\nAI Scores: Describe=${parsed.scores.describe} Cause/Effect=${parsed.scores.cause_effect} Evaluate=${parsed.scores.evaluate} Prescription=${parsed.scores.prescription} Bio/Physics=${parsed.scores.biomechanics} Communication=${parsed.scores.communication}`;
            }
            if (parsed.gaps) prompt += `\nAI Gaps: ${parsed.gaps.join(", ")}`;
            if (parsed.did_well) prompt += `\nDid well: ${parsed.did_well.join(", ")}`;
            if (parsed.opportunity) prompt += `\nOpportunity: ${parsed.opportunity.join(", ")}`;
            if (parsed.key_learning) prompt += `\nAI Key focus: ${parsed.key_learning}`;
            // Include revision data if available
            if (parsed.allAttempts?.length > 1) {
              prompt += `\nRevisions: ${parsed.allAttempts.length - 1} (best: attempt ${parsed.bestAttempt})`;
              parsed.allAttempts.forEach((a, i) => {
                if (a.scores) prompt += `\n  ${i === 0 ? "Initial" : "Rev " + i}: D=${a.scores.describe} C/E=${a.scores.cause_effect} E=${a.scores.evaluate} P=${a.scores.prescription}`;
              });
            }
          } catch(e) {
            prompt += `\n${(s.summary || "").slice(0, 400)}`;
          }
        } else {
          prompt += `\nMA: ${(s.transcript || "").slice(0, 400)}`;
          if (s.notes) prompt += `\nNotes: ${s.notes.slice(0, 200)}`;
        }
        // MENTOR FEEDBACK on this MA session
        const mentorFb = s.mentorFeedback || [];
        if (mentorFb.length > 0) {
          prompt += "\nMENTOR FEEDBACK (use this to calibrate your coaching):";
          mentorFb.forEach(f => {
            const name = USERS[f.userId]?.name || f.userId;
            prompt += `\n  ${name}: "${f.text.slice(0, 300)}"`;
          });
        }
        prompt += "\n";
      });

      // Aggregate ALL mentor feedback across MA sessions
      const allMentorFb = maSessions.flatMap(s => (s.mentorFeedback || []).map(f => ({ ...f, date: s.date, activity: s.activity })));
      if (allMentorFb.length > 2) {
        prompt += "\nMENTOR MA FEEDBACK PATTERNS (across all sessions — these show what mentors consistently push on):";
        const byMentor = {};
        allMentorFb.forEach(f => {
          const name = USERS[f.userId]?.name || f.userId;
          if (!byMentor[name]) byMentor[name] = [];
          byMentor[name].push(f.text.slice(0, 150));
        });
        Object.entries(byMentor).forEach(([name, texts]) => {
          prompt += `\n${name} (${texts.length} entries): ${texts.slice(-3).join(" | ")}`;
        });
      }
    }

    // Layer 6: Mentor comments on videos
    const videoComments = videos.flatMap(v => (v.comments || []).map(c => ({ ...c, activity: v.activity, date: v.date })));
    if (videoComments.length > 0) {
      prompt += "\n\n=== MENTOR VIDEO FEEDBACK ===\nFeedback from mentors on Mark's skiing videos:\n";
      const byMentor = {};
      videoComments.forEach(c => {
        const name = USERS[c.userId]?.name || c.userId;
        if (!byMentor[name]) byMentor[name] = [];
        byMentor[name].push(`[${c.date} · ${c.activity}] ${c.text.slice(0, 150)}`);
      });
      Object.entries(byMentor).forEach(([name, texts]) => {
        prompt += `\n${name}: ${texts.slice(-3).join(" | ")}`;
      });
    }

    // Layer 7: Clinic feedback patterns
    const clinicsWithFeedback = clinicFeedback.filter(c => c.notes?.trim() || c.participantFeedback?.trim());
    if (clinicsWithFeedback.length > 0) {
      prompt += "\n\n=== CLINIC LEADING FEEDBACK ===\nMark's clinic leading data — use this when coaching on Module 3:\n";
      clinicsWithFeedback.slice(-3).forEach(c => {
        prompt += `\n[${c.date} · ${c.topic} · ${c.audience}]`;
        if (c.whatWorked) prompt += `\nWorked: ${c.whatWorked.slice(0, 150)}`;
        if (c.whatIdChange) prompt += `\nWould change: ${c.whatIdChange.slice(0, 150)}`;
        if (c.notes) prompt += `\nMentor: ${c.notes.slice(0, 200)}`;
        if (c.participantFeedback) prompt += `\nParticipants: ${c.participantFeedback.slice(0, 150)}`;
      });
    }

    // Layer 8: Checkpoint reviews
    if (checkpoints.length > 0) {
      const recentCps = [...checkpoints].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).slice(0, 2);
      prompt += "\n\n=== MENTOR CHECKPOINT REVIEWS ===\n";
      recentCps.forEach(cp => {
        const name = USERS[cp.mentorId]?.name || cp.mentorId;
        prompt += `\n[${cp.date} · ${name}]`;
        if (cp.whatImSeeing) prompt += `\nSeeing: ${cp.whatImSeeing.slice(0, 200)}`;
        if (cp.nextSteps) prompt += `\nNext steps: ${cp.nextSteps.slice(0, 200)}`;
      });
    }

    return prompt;
  };

  const activeThemes = themes.filter(t => t.active);
  const isSubView = !!editingEntry || !!viewingEntry || !!editingTheme || !!editingCheckpoint;
  const isMentor = currentUser?.role === "mentor";
  const isCandidate = currentUser?.role === "candidate";

  const CANDIDATE_TABS = ["journal", "themes", "resources", "growth", "progress", "checkpoints", "videos", "mahistory", "timeline", "clinics", "sparring"];
  const MENTOR_TABS = ["journal", "themes", "growth", "progress", "checkpoints", "videos", "mahistory", "timeline", "profile"];
  const VISIBLE_TABS = isCandidate ? CANDIDATE_TABS : MENTOR_TABS;

  // ── Styles (aliased from constants for brevity) ──
  const inp = INP_STYLE;
  const txta = TXTA_STYLE;
  const lbl = LBL_STYLE;

  // ── Login ──────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "linear-gradient(178deg, #070c18 0%, #0d1828 35%, #101e34 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ width: "100%", maxWidth: 340, padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <ATIcon size={64} />
            <div style={{ fontSize: 28, fontWeight: 800, color: "#e8a050", letterSpacing: "-0.03em", marginTop: 12 }}>AT Journal</div>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginTop: 6 }}>Alpine Trainer Development</div>
          </div>
          {Object.entries(USERS).map(([key, user]) => (
            <button key={key} onClick={() => { setPinInput(""); setPinError(false); setCurrentUser({ ...user, key, pendingAuth: true }); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 14px", marginBottom: 8,
              borderRadius: 8, cursor: "pointer", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "left",
            }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${user.color}20`, border: `2px solid ${user.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: user.color }}>{user.name[0]}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#d0d8e0" }}>{user.name}</div>
                <div style={{ fontSize: 12, color: "#7a9ab5" }}>{user.role === "candidate" ? "Candidate" : "Mentor / Assessor"}</div>
              </div>
            </button>
          ))}
          {currentUser?.pendingAuth && (
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "#d0d8e0", marginBottom: 8 }}>PIN for {currentUser.name}</div>
              <input type="password" maxLength={4} value={pinInput} autoFocus onChange={e => {
                const v = e.target.value;
                setPinInput(v);
                setPinError(false);
                if (v.length === 4) {
                  if (v === currentUser.pin) { setCurrentUser(prev => ({ ...prev, pendingAuth: false })); }
                  else { setPinError(true); setPinInput(""); }
                }
              }} style={{ width: 120, textAlign: "center", padding: "10px", fontSize: 22, letterSpacing: 8, color: "#d0d8e0", background: "rgba(255,255,255,0.03)", border: `2px solid ${pinError ? "#e05028" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }} />
              {pinError && <div style={{ color: "#e05028", fontSize: 13, marginTop: 6 }}>Wrong PIN</div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentUser.pendingAuth) {
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "linear-gradient(178deg, #070c18 0%, #0d1828 35%, #101e34 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, color: "#d0d8e0", marginBottom: 12 }}>PIN for {currentUser.name}</div>
          <input type="password" maxLength={4} value={pinInput} autoFocus onChange={e => {
            const v = e.target.value;
            setPinInput(v);
            setPinError(false);
            if (v.length === 4) {
              if (v === currentUser.pin) { setCurrentUser(prev => ({ ...prev, pendingAuth: false })); }
              else { setPinError(true); setPinInput(""); }
            }
          }} style={{ width: 120, textAlign: "center", padding: "10px", fontSize: 22, letterSpacing: 8, color: "#d0d8e0", background: "rgba(255,255,255,0.03)", border: `2px solid ${pinError ? "#e05028" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }} />
          {pinError && <div style={{ color: "#e05028", fontSize: 13, marginTop: 6 }}>Wrong PIN</div>}
          <div><button onClick={() => setCurrentUser(null)} style={{ background: "none", border: "none", color: "#7a9ab5", fontSize: 13, cursor: "pointer", marginTop: 12 }}>← Back</button></div>
        </div>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "linear-gradient(178deg, #070c18 0%, #0d1828 35%, #101e34 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#7a9ab5" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        Loading...
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "linear-gradient(178deg, #070c18 0%, #0d1828 35%, #101e34 100%)", color: "#e0e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "18px 16px 12px", background: "rgba(255,255,255,0.01)" }}>
        <div className="at-container">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ATIcon size={28} />
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.04em", color: "#f0f4f8" }}>AT Journal</span>
              <span style={{ fontSize: 13, color: "#4d6888", fontWeight: 500 }}>Mark · Keystone</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${currentUser.color}20`, border: `1.5px solid ${currentUser.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: currentUser.color }}>{currentUser.name[0]}</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#d0d8e0" }}>{currentUser.name}</span>
              <button onClick={() => { setCurrentUser(null); setPinInput(""); }} style={{ background: "none", border: "none", color: "#4d6888", fontSize: 12, cursor: "pointer" }}>logout</button>
            </div>
          </div>

          {/* Tabs */}
          {saveError && (
            <div style={{ margin: "8px 0 0", padding: "8px 12px", borderRadius: 6, background: "rgba(224,80,40,0.12)", border: "1px solid rgba(224,80,40,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, color: "#e05028", fontWeight: 600 }}>{saveError}</div>
              <button onClick={async () => {
                let allOk = true;
                for (const session of maSessions) {
                  const ok = await saveMaSession(session);
                  if (!ok) allOk = false;
                }
                if (allOk) setSaveError(null);
                else alert("Some saves still failing — check connection or wait for quota reset.");
              }} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", background: "rgba(224,80,40,0.1)", border: "1px solid rgba(224,80,40,0.3)", color: "#e05028", flexShrink: 0 }}>Retry Save</button>
            </div>
          )}
          {!isSubView && (
            <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
              {[
                { id: "journal", label: `Journal (${entries.length})` },
                { id: "themes", label: "Themes" },
                { id: "resources", label: "Resources" },
                { id: "growth", label: "Growth" },
                { id: "progress", label: "Progress" },
                { id: "checkpoints", label: "Checkpoints" },
                { id: "videos", label: `Videos (${videos.length})` },
                { id: "mahistory", label: `MA History (${maSessions.length})` },
                { id: "timeline", label: "Timeline" },
                { id: "clinics", label: `Clinics (${clinicFeedback.length})` },
                { id: "sparring", label: "Sparring Partner" },
                { id: "profile", label: "Profile" },
              ].filter(t => VISIBLE_TABS.includes(t.id)).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: "6px 12px", borderRadius: 6, fontSize: 14, fontWeight: 600,
                  border: tab === t.id ? "1.5px solid rgba(224,120,48,0.45)" : "1.5px solid rgba(255,255,255,0.07)",
                  background: tab === t.id ? "rgba(224,120,48,0.1)" : "rgba(255,255,255,0.015)",
                  color: tab === t.id ? "#e8a050" : "#7a9ab5", cursor: "pointer",
                }}>{t.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="at-container" style={{ padding: "16px 16px 60px" }}>

        {/* ═══ JOURNAL — Entry List ═══ */}
        {tab === "journal" && !isSubView && (
          <>
            {isCandidate && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: "#7a9ab5" }}>Capture your development — coaching, skiing, clinics, feedback, study.</div>
                <button onClick={() => setEditingEntry({
                  id: uid(), date: today(), context: "", location: "", conditions: "",
                  entryType: "coaching",
                  whatISaw: "", whatWasGoingOn: "", whatIDid: "", whyThatApproach: "", whatHappened: "", whatIdDoDifferently: "",
                  videoUrl: "", connectionTags: [], themeIds: [], depthLevel: "", resourceId: "",
                  season: getCurrentSeason(), mentorPulse: {}, mentorComments: [], timestamp: new Date().toISOString(),
                })} style={{
                  padding: "7px 14px", borderRadius: 6, border: "1px solid rgba(224,120,48,0.4)",
                  background: "rgba(224,120,48,0.1)", color: "#e8a050", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", flexShrink: 0, marginLeft: 10,
                }}>+ New Entry</button>
              </div>
            )}

            {/* Theme filter */}
            {activeThemes.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
                <button onClick={() => setSelectedThemeFilter(null)} style={{
                  padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: !selectedThemeFilter ? "rgba(224,120,48,0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${!selectedThemeFilter ? "rgba(224,120,48,0.3)" : "rgba(255,255,255,0.05)"}`,
                  color: !selectedThemeFilter ? "#e8a050" : "#7a9ab5",
                }}>All</button>
                {activeThemes.map(t => (
                  <button key={t.id} onClick={() => setSelectedThemeFilter(t.id)} style={{
                    padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: selectedThemeFilter === t.id ? "rgba(224,120,48,0.1)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selectedThemeFilter === t.id ? "rgba(224,120,48,0.3)" : "rgba(255,255,255,0.05)"}`,
                    color: selectedThemeFilter === t.id ? "#e8a050" : "#7a9ab5",
                  }}>{t.question.length > 30 ? t.question.slice(0, 30) + "…" : t.question}</button>
                ))}
              </div>
            )}

            {entries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#3a5068" }}>
                <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>📓</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#7a9ab5" }}>No reflections yet</div>
                <div style={{ fontSize: 14, color: "#3a5068", marginTop: 4 }}>After your next on-snow session, come here and reflect on what happened.</div>
              </div>
            ) : (
              entries
                .filter(e => !selectedThemeFilter || (e.themeIds || []).includes(selectedThemeFilter))
                .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""))
                .map(e => {
                  const pulseValues = Object.values(e.mentorPulse || {});
                  const mentorDepth = pulseValues.length > 0 ? PULSE_OPTIONS.find(p => p.id === (pulseValues.includes("integrated") ? "integrated" : pulseValues.includes("connecting") ? "connecting" : pulseValues[0])) : null;
                  const commentCount = (e.mentorComments || []).length;
                  return (
                    <div key={e.id} onClick={() => setViewingEntry(e)} style={{ cursor: "pointer" }}>
                      <Card style={{ borderLeft: `3px solid ${mentorDepth ? mentorDepth.color : "rgba(255,255,255,0.06)"}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 4 }}>
                              {e.entryType && ENTRY_TYPES[e.entryType] ? `${ENTRY_TYPES[e.entryType].icon} ` : ""}
                              {e.date} · {e.context}{e.location ? ` · ${e.location}` : ""}
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#d0d8e0", lineHeight: 1.4 }}>
                              {e.whatISaw ? (e.whatISaw.length > 100 ? e.whatISaw.slice(0, 100) + "…" : e.whatISaw) : "Untitled entry"}
                            </div>
                          </div>
                          {mentorDepth && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: `${mentorDepth.color}15`, border: `1px solid ${mentorDepth.color}30`, color: mentorDepth.color, flexShrink: 0, marginLeft: 8 }}>
                              {mentorDepth.icon} {mentorDepth.label}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {(e.connectionTags || []).map(tagId => {
                            const dom = DOMAINS.find(d => d.id === tagId);
                            return dom ? <span key={tagId} style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${dom.color}12`, color: dom.color }}>{dom.label}</span> : null;
                          })}
                          {commentCount > 0 && <span style={{ fontSize: 10, color: "#28a858" }}>💬 {commentCount}</span>}
                          {e.videoUrl && <span style={{ fontSize: 10, color: "#3088cc" }}>🎥</span>}
                        </div>
                      </Card>
                    </div>
                  );
                })
            )}
          </>
        )}

        {/* ═══ JOURNAL — View Entry ═══ */}
        {viewingEntry && !editingEntry && (() => {
          const e = viewingEntry;
          return (
            <div>
              <button onClick={() => { setViewingEntry(null); setChallengeResponse(null); }} style={{ background: "none", border: "none", color: "#7a9ab5", fontSize: 14, cursor: "pointer", padding: "0 0 10px", fontWeight: 600 }}>← Back</button>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#7a9ab5" }}>
                    {e.entryType && ENTRY_TYPES[e.entryType] ? `${ENTRY_TYPES[e.entryType].icon} ${ENTRY_TYPES[e.entryType].label} · ` : ""}
                    {e.date} · {e.context}{e.location ? ` · ${e.location}` : ""}{e.conditions ? ` · ${e.conditions}` : ""}
                  </div>
                  {isCandidate && <button onClick={() => setEditingEntry({ ...e })} style={{ padding: "4px 10px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#7a9ab5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Edit</button>}
                </div>

                {(PROMPTS_BY_TYPE[e.entryType] || PROMPTS).filter(p => p.label).map(p => {
                  const val = e[p.id];
                  if (!val) return null;
                  return (
                    <div key={p.id} style={{ marginBottom: 14 }}>
                      <SectionLabel>{p.label}</SectionLabel>
                      <p style={{ fontSize: 15, color: "#d0d8e0", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{val}</p>
                    </div>
                  );
                })}

                {e.videoUrl && (
                  <div style={{ marginBottom: 14 }}>
                    <SectionLabel>Video</SectionLabel>
                    <a href={e.videoUrl} target="_blank" rel="noreferrer" style={{ color: "#3088cc", fontSize: 14, wordBreak: "break-all" }}>{e.videoUrl}</a>
                  </div>
                )}

                {/* Connection tags */}
                {(e.connectionTags || []).length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <SectionLabel>Connections</SectionLabel>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {e.connectionTags.map(tagId => {
                        const dom = DOMAINS.find(d => d.id === tagId);
                        return dom ? <span key={tagId} style={{ fontSize: 12, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: `${dom.color}12`, border: `1px solid ${dom.color}25`, color: dom.color }}>{dom.label}</span> : null;
                      })}
                    </div>
                  </div>
                )}

              </Card>

              {/* Challenge Me button */}
              {isCandidate && (
                <Card style={{ borderLeft: "3px solid #c060a0" }}>
                  <button onClick={async () => {
                    setChallengeLoading(true);
                    setChallengeResponse(null);
                    const entryPrompts = (PROMPTS_BY_TYPE[e.entryType] || PROMPTS).filter(p => p.label);
                    const reflectionText = entryPrompts.map(p => e[p.id] ? `${p.label}\n${e[p.id]}` : "").filter(Boolean).join("\n\n");
                    const resp = await callClaude([
                      { role: "user", content: `Here is my reflection from ${e.date} (${e.context}${e.location ? `, ${e.location}` : ""}):\n\n${reflectionText}\n\nI tagged these connections: ${(e.connectionTags || []).join(", ")}.\n\nChallenge my thinking. Push me to go deeper. What am I missing? What connections haven't I made?` }
                    ], buildSystemPrompt(AT_COACH_SYSTEM));
                    setChallengeResponse(resp);
                    setChallengeLoading(false);
                  }} disabled={challengeLoading} style={{
                    padding: "10px 16px", borderRadius: 7, border: "1px solid rgba(192,96,160,0.3)",
                    background: challengeLoading ? "rgba(255,255,255,0.03)" : "rgba(192,96,160,0.08)",
                    color: challengeLoading ? "#7a9ab5" : "#c060a0", fontSize: 14, fontWeight: 700, cursor: challengeLoading ? "default" : "pointer", width: "100%",
                  }}>
                    {challengeLoading ? "Thinking..." : "🧠 Challenge My Thinking"}
                  </button>
                  {challengeResponse && (
                    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: "rgba(192,96,160,0.04)", border: "1px solid rgba(192,96,160,0.1)" }}>
                      <div style={{ fontSize: 14, color: "#d0d8e0", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{challengeResponse}</div>
                    </div>
                  )}
                </Card>
              )}

              {/* Mentor depth assessment + comments */}
              <Card>
                <SectionLabel>Mentor Feedback</SectionLabel>

                {/* Existing depth assessments from OTHER mentors (mentor view only) */}
                {isMentor && Object.entries(e.mentorPulse || {}).filter(([k]) => k !== currentUser?.key).map(([mentorKey, pulseId]) => {
                  const mentor = USERS[mentorKey];
                  const pulse = PULSE_OPTIONS.find(p => p.id === pulseId);
                  if (!mentor || !pulse) return null;
                  return (
                    <div key={mentorKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", borderRadius: 5, background: `${pulse.color}08` }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${mentor.color}20`, border: `1.5px solid ${mentor.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: mentor.color }}>{mentor.name[0]}</div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: pulse.color }}>{pulse.icon} {pulse.label}</span>
                      <span style={{ fontSize: 11, color: "#4d6888" }}>{pulse.desc}</span>
                    </div>
                  );
                })}

                {/* Mentor can assess or change depth */}
                {isMentor && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 4 }}>How deep is Mark's thinking here?</div>
                    <div style={{ display: "flex", gap: 6 }}>
                    {PULSE_OPTIONS.map(p => {
                      const isSelected = e.mentorPulse?.[currentUser.key] === p.id;
                      return (
                        <button key={p.id} onClick={() => {
                          // Toggle off if clicking current selection, otherwise set new value
                          const newPulse = isSelected ? undefined : p.id;
                          const updatedPulse = { ...(e.mentorPulse || {}) };
                          if (newPulse) { updatedPulse[currentUser.key] = newPulse; }
                          else { delete updatedPulse[currentUser.key]; }
                          const updated = { ...e, mentorPulse: updatedPulse };
                          saveEntry(updated);
                          setViewingEntry(updated);
                        }} style={{
                          flex: 1, padding: "8px 6px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer",
                          background: isSelected ? `${p.color}20` : `${p.color}08`,
                          border: `1.5px solid ${isSelected ? p.color : p.color + "30"}`,
                          color: p.color,
                        }}>{p.icon} {p.label}</button>
                      );
                    })}
                    </div>
                  </div>
                )}

                {/* Show depth for non-mentors */}
                {!isMentor && Object.entries(e.mentorPulse || {}).map(([mentorKey, pulseId]) => {
                  const mentor = USERS[mentorKey];
                  const pulse = PULSE_OPTIONS.find(p => p.id === pulseId);
                  if (!mentor || !pulse) return null;
                  return (
                    <div key={mentorKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", borderRadius: 5, background: `${pulse.color}08` }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${mentor.color}20`, border: `1.5px solid ${mentor.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: mentor.color }}>{mentor.name[0]}</div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: pulse.color }}>{pulse.icon} {pulse.label}</span>
                      <span style={{ fontSize: 11, color: "#4d6888" }}>{pulse.desc}</span>
                    </div>
                  );
                })}

                {/* Comments */}
                {(e.mentorComments || []).map((c, ci) => {
                  const commenter = USERS[c.userId] || { name: c.userId, color: "#7a9ab5" };
                  return (
                    <div key={ci} style={{ display: "flex", gap: 8, marginBottom: 6, padding: "8px 10px", borderRadius: 6, background: `${commenter.color}06`, border: `1px solid ${commenter.color}12` }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: `${commenter.color}20`, border: `1.5px solid ${commenter.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: commenter.color }}>{commenter.name[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: commenter.color }}>{commenter.name}</span>
                          <span style={{ fontSize: 10, color: "#4d6888" }}>{c.timestamp ? new Date(c.timestamp).toLocaleDateString("en", { month: "short", day: "numeric" }) : ""}</span>
                        </div>
                        <div style={{ fontSize: 14, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 2 }}>{c.text}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Add comment */}
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 6 }}>
                  <textarea id="entry-comment" placeholder={isMentor ? "Coach Mark on this reflection..." : "Respond to mentor feedback..."} style={{ ...txta, minHeight: 36, flex: 1, fontSize: 13 }} />
                  <button onClick={() => {
                    const el = document.getElementById("entry-comment");
                    const text = el.value.trim();
                    if (!text) return;
                    const updated = { ...e, mentorComments: [...(e.mentorComments || []), { userId: currentUser.key, text, timestamp: new Date().toISOString() }] };
                    saveEntry(updated);
                    setViewingEntry(updated);
                    el.value = "";
                  }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 13, fontWeight: 700, background: `${currentUser.color}12`, border: `1px solid ${currentUser.color}30`, color: currentUser.color, cursor: "pointer", flexShrink: 0 }}>Post</button>
                </div>
              </Card>
            </div>
          );
        })()}

        {/* ═══ JOURNAL — Edit Entry ═══ */}
        {editingEntry && (() => {
          const e = editingEntry;
          const upd = (f, v) => setEditingEntry(p => ({ ...p, [f]: v }));
          const currentType = e.entryType || "coaching";
          const typePrompts = PROMPTS_BY_TYPE[currentType] || PROMPTS;
          const activePrompts = typePrompts.filter(p => p.label);
          const filledPrompts = activePrompts.filter(p => e[p.id]?.trim()).length;
          return (
            <div>
              <button onClick={() => setEditingEntry(null)} style={{ background: "none", border: "none", color: "#7a9ab5", fontSize: 14, cursor: "pointer", padding: "0 0 10px", fontWeight: 600 }}>← Cancel</button>
              <Card>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: "#e0e8f0" }}>
                  {entries.find(x => x.id === e.id) ? "Edit Entry" : "New Entry"}
                </div>

                {/* Entry type selector */}
                <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
                  {Object.entries(ENTRY_TYPES).map(([key, t]) => (
                    <button key={key} onClick={() => upd("entryType", key)} style={{
                      padding: "5px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: currentType === key ? "rgba(224,120,48,0.1)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${currentType === key ? "rgba(224,120,48,0.35)" : "rgba(255,255,255,0.06)"}`,
                      color: currentType === key ? "#e8a050" : "#7a9ab5",
                    }}>{t.icon} {t.label}</button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div><label style={lbl}>Date</label><input type="date" value={e.date} onChange={ev => upd("date", ev.target.value)} style={inp} /></div>
                  <div>
                    <label style={lbl}>Context</label>
                    <select value={e.context} onChange={ev => upd("context", ev.target.value)} style={{ ...inp, cursor: "pointer", appearance: "auto" }}>
                      {CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Location</label><input value={e.location} onChange={ev => upd("location", ev.target.value)} placeholder="e.g., Keystone — Run 6" style={inp} /></div>
                </div>

                {/* Adaptive Prompts based on entry type */}
                {activePrompts.map((p, pi) => (
                  <div key={p.id} style={{ marginBottom: 14 }}>
                    <label style={lbl}>{pi + 1}. {p.label}</label>
                    <textarea value={e[p.id] || ""} onChange={ev => upd(p.id, ev.target.value)} placeholder={p.placeholder} style={txta} />
                  </div>
                ))}

                {/* Video */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Video Link (optional)</label>
                  <input value={e.videoUrl || ""} onChange={ev => upd("videoUrl", ev.target.value)} placeholder="YouTube or Google Drive link" style={inp} />
                </div>

                {/* Connection Tags */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>What domains did you connect? (select all that apply)</label>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {DOMAINS.map(d => {
                      const on = (e.connectionTags || []).includes(d.id);
                      return (
                        <button key={d.id} onClick={() => upd("connectionTags", on ? e.connectionTags.filter(x => x !== d.id) : [...(e.connectionTags || []), d.id])} style={{
                          padding: "5px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: on ? `${d.color}15` : "rgba(255,255,255,0.02)",
                          border: `1.5px solid ${on ? d.color : "rgba(255,255,255,0.06)"}`,
                          color: on ? d.color : "#7a9ab5",
                        }}>{d.label}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Theme Tags */}
                {activeThemes.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={lbl}>Which themes does this push on?</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {activeThemes.map(t => {
                        const on = (e.themeIds || []).includes(t.id);
                        return (
                          <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: on ? "rgba(224,120,48,0.06)" : "rgba(255,255,255,0.015)", border: `1px solid ${on ? "rgba(224,120,48,0.2)" : "rgba(255,255,255,0.04)"}` }}>
                            <input type="checkbox" checked={on} onChange={() => upd("themeIds", on ? e.themeIds.filter(x => x !== t.id) : [...(e.themeIds || []), t.id])} style={{ marginTop: 2, accentColor: "#e07830" }} />
                            <span style={{ fontSize: 13, color: on ? "#d0d8e0" : "#7a9ab5", lineHeight: 1.4 }}>{t.question}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resource link */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Inspired by a resource? (optional)</label>
                  <select value={e.resourceId || ""} onChange={ev => upd("resourceId", ev.target.value)} style={{ ...inp, cursor: "pointer", appearance: "auto" }}>
                    <option value="">— None —</option>
                    {Object.entries(RESOURCES).map(([cat, r]) => (
                      <optgroup key={cat} label={cat}>
                        {r.items.map(item => <option key={item.id} value={item.id}>{item.id} — {item.title}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <button onClick={() => { saveEntry(e); setEditingEntry(null); setViewingEntry(null); }} style={{
                  width: "100%", padding: "12px", borderRadius: 7, border: "none",
                  background: "linear-gradient(135deg, #e07830, #c06020)", color: "#fff",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>Save Reflection</button>
              </Card>
            </div>
          );
        })()}

        {/* ═══ THEMES ═══ */}
        {tab === "themes" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
              Big developmental questions — not skills to check off. These evolve as you grow.
            </div>

            {themes.filter(t => t.active).map(t => {
              const count = entries.filter(e => (e.themeIds || []).includes(t.id)).length;
              return (
                <Card key={t.id} style={{ borderLeft: "3px solid #e07830" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#d0d8e0", marginBottom: 4, lineHeight: 1.4 }}>"{t.question}"</div>
                      <div style={{ fontSize: 13, color: "#7a9ab5", lineHeight: 1.5, marginBottom: 8 }}>{t.description}</div>
                    </div>
                    {isMentor && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        <button onClick={() => setEditingTheme({ ...t })} style={{ background: "none", border: "none", color: "#7a9ab5", fontSize: 11, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => {
                          if (confirm("Delete this theme?")) {
                            saveThemes(themes.filter(x => x.id !== t.id));
                          }
                        }} style={{ background: "none", border: "none", color: "#3a5068", fontSize: 11, cursor: "pointer" }}>Delete</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 12, color: "#4d6888" }}>{count} reflection{count !== 1 ? "s" : ""} tagged</div>
                    {isMentor && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {[
                          { id: "surface", label: "Surface", color: "#e05028" },
                          { id: "connecting", label: "Connecting", color: "#e8a050" },
                          { id: "integrated", label: "Integrated", color: "#28a858" },
                        ].map(d => (
                          <button key={d.id} onClick={() => {
                            const updated = themes.map(x => x.id === t.id ? { ...x, depthLevel: d.id } : x);
                            saveThemes(updated);
                          }} style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer",
                            background: t.depthLevel === d.id ? `${d.color}18` : "transparent",
                            border: `1px solid ${t.depthLevel === d.id ? d.color + "40" : "rgba(255,255,255,0.06)"}`,
                            color: t.depthLevel === d.id ? d.color : "#4d6888",
                          }}>{d.label}</button>
                        ))}
                      </div>
                    )}
                    {!isMentor && t.depthLevel && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        color: t.depthLevel === "surface" ? "#e05028" : t.depthLevel === "connecting" ? "#e8a050" : "#28a858",
                        background: t.depthLevel === "surface" ? "rgba(224,80,40,0.1)" : t.depthLevel === "connecting" ? "rgba(232,160,80,0.1)" : "rgba(40,168,88,0.1)",
                      }}>{t.depthLevel === "surface" ? "Surface" : t.depthLevel === "connecting" ? "Connecting" : "Integrated"}</span>
                    )}
                  </div>
                </Card>
              );
            })}

            {themes.filter(t => !t.active).length > 0 && (
              <>
                <SectionLabel>Retired Themes</SectionLabel>
                {themes.filter(t => !t.active).map(t => (
                  <Card key={t.id} style={{ opacity: 0.5 }}>
                    <div style={{ fontSize: 14, color: "#7a9ab5" }}>"{t.question}"</div>
                  </Card>
                ))}
              </>
            )}

            {isMentor && (
              <button onClick={() => setEditingTheme({ id: uid(), question: "", description: "", active: true, depthLevel: "", createdAt: new Date().toISOString() })} style={{
                padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(224,120,48,0.3)", background: "rgba(224,120,48,0.08)",
                color: "#e8a050", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8,
              }}>+ Add Theme</button>
            )}
          </>
        )}

        {/* ═══ THEME EDIT ═══ */}
        {editingTheme && (() => {
          const t = editingTheme;
          const upd = (f, v) => setEditingTheme(p => ({ ...p, [f]: v }));
          return (
            <div>
              <button onClick={() => setEditingTheme(null)} style={{ background: "none", border: "none", color: "#7a9ab5", fontSize: 14, cursor: "pointer", padding: "0 0 10px", fontWeight: 600 }}>← Cancel</button>
              <Card>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#e0e8f0", marginBottom: 14 }}>{themes.find(x => x.id === t.id) ? "Edit Theme" : "New Theme"}</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Development Question</label>
                  <input value={t.question || ""} onChange={e => upd("question", e.target.value)} placeholder="e.g., How do I prioritize the root cause in a multi-skill cascade?" style={inp} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Description</label>
                  <textarea value={t.description || ""} onChange={e => upd("description", e.target.value)} placeholder="Why this theme matters for your AT development..." style={txta} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Status</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => upd("active", true)} style={{ padding: "6px 14px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", background: t.active ? "rgba(40,168,88,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${t.active ? "rgba(40,168,88,0.3)" : "rgba(255,255,255,0.06)"}`, color: t.active ? "#28a858" : "#4d6888" }}>Active</button>
                    <button onClick={() => upd("active", false)} style={{ padding: "6px 14px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", background: !t.active ? "rgba(224,80,40,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${!t.active ? "rgba(224,80,40,0.3)" : "rgba(255,255,255,0.06)"}`, color: !t.active ? "#e05028" : "#4d6888" }}>Retired</button>
                  </div>
                </div>
                <button onClick={() => {
                  const isNew = !themes.find(x => x.id === t.id);
                  const updated = isNew ? [t, ...themes] : themes.map(x => x.id === t.id ? t : x);
                  saveThemes(updated);
                  setEditingTheme(null);
                }} style={{
                  width: "100%", padding: "12px", borderRadius: 7, border: "none",
                  background: "linear-gradient(135deg, #e07830, #c06020)", color: "#fff",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>Save Theme</button>
              </Card>
            </div>
          );
        })()}

        {/* ═══ THEMES — COACHING NOTES ═══ */}
        {tab === "themes" && !isSubView && (
          <>
            {/* Mentor Coaching Notes for AI */}
            {isMentor && (
              <Card style={{ marginTop: 20, borderLeft: "3px solid #c060a0" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#c060a0", marginBottom: 4 }}>Your Coaching Notes for the AI Sparring Partner</div>
                <div style={{ fontSize: 13, color: "#7a9ab5", marginBottom: 12, lineHeight: 1.5 }}>
                  These notes are fed into Claude when Mark practices. Tell the AI what Mark tends to miss, where he needs pushing, what patterns you've observed. This makes the sparring partner smarter and more personalized.
                </div>
                <textarea
                  value={mentorCoachNotes[currentUser.key] || ""}
                  onChange={ev => {
                    const updated = { ...mentorCoachNotes, [currentUser.key]: ev.target.value };
                    setMentorCoachNotes(updated);
                    if (saveTimerRef.current._cn) clearTimeout(saveTimerRef.current._cn);
                    saveTimerRef.current._cn = setTimeout(() => saveCoachNotes(updated), 1500);
                  }}
                  placeholder={`e.g., "Mark tends to jump to rotary explanations first. Push him to consider pressure and edge interactions. His self-MA is weaker than his student MA — push harder when he talks about his own skiing."`}
                  style={{
                    width: "100%", minHeight: 80, padding: "10px 12px", fontSize: 14, color: "#d0d8e0",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 6, outline: "none", fontFamily: "inherit", resize: "vertical",
                    lineHeight: 1.6, boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: 10, color: "#4d6888", marginTop: 4 }}>Auto-saves · Only you and the AI see your notes — Mark doesn't see them</div>
              </Card>
            )}

            {/* Show all mentor notes to candidate (read-only, without content — just who has contributed) */}
            {isCandidate && Object.values(mentorCoachNotes).some(n => n?.trim()) && (
              <Card style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, color: "#c060a0", fontWeight: 600 }}>
                  🧠 Your sparring partner has been enhanced with coaching notes from: {Object.entries(mentorCoachNotes).filter(([,v]) => v?.trim()).map(([k]) => USERS[k]?.name || k).join(", ")}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ═══ RESOURCES ═══ */}
        {tab === "resources" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
              Suggested activities from the AT Program Guide. Not a checklist — a menu of ideas for your development.
            </div>
            {Object.entries(RESOURCES).map(([catName, cat]) => (
              <div key={catName} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: cat.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${cat.color}25` }}>{catName}</div>
                {cat.items.map(item => {
                  const usedCount = entries.filter(e => e.resourceId === item.id).length;
                  return (
                    <Card key={item.id} style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cat.color }}>{item.id}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#d0d8e0", marginLeft: 8 }}>{item.title}</span>
                          <div style={{ fontSize: 13, color: "#7a9ab5", marginTop: 3, lineHeight: 1.5 }}>{item.desc}</div>
                        </div>
                        {usedCount > 0 && <span style={{ fontSize: 11, color: "#28a858", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{usedCount} reflection{usedCount !== 1 ? "s" : ""}</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ))}

            {/* MA Session Transcripts */}
            <Card style={{ marginTop: 20, borderLeft: "3px solid #e8a050" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#e8a050", marginBottom: 2 }}>MA Session Transcripts</div>
                  <div style={{ fontSize: 12, color: "#7a9ab5" }}>Record your MA practice sessions. The AI reads these to identify your analysis patterns.</div>
                </div>
                <button onClick={() => {
                  const newSession = { id: uid(), date: today(), type: "manual", context: "", who: "", activity: "", conditions: "", transcript: "", sections: {}, notes: "", summary: "", mentorFeedback: [] };
                  saveMaSessions([newSession, ...maSessions]);
                }} style={{
                  padding: "5px 12px", borderRadius: 5, fontSize: 12, fontWeight: 700,
                  background: "rgba(232,160,80,0.08)", border: "1px solid rgba(232,160,80,0.25)",
                  color: "#e8a050", cursor: "pointer", flexShrink: 0,
                }}>+ Add Session</button>
              </div>

              {maSessions.length === 0 && (
                <div style={{ fontSize: 13, color: "#4d6888", padding: "12px 0", fontStyle: "italic" }}>
                  No MA sessions recorded yet. After practicing MA with a mentor or peer, add a transcript here.
                </div>
              )}

              {maSessions.map((s, si) => (
                <div key={s.id} style={{
                  padding: "10px 12px", marginBottom: 8, borderRadius: 8,
                  background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>DATE</div>
                      <input type="date" value={s.date} onChange={ev => {
                        const updated = maSessions.map(x => x.id === s.id ? { ...x, date: ev.target.value } : x);
                        saveMaSessions(updated);
                      }} style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>WHO I ANALYZED</div>
                      <input value={s.who} onChange={ev => {
                        const updated = maSessions.map(x => x.id === s.id ? { ...x, who: ev.target.value } : x);
                        saveMaSessions(updated);
                      }} placeholder="e.g., L2 candidate, peer" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>ACTIVITY</div>
                      <input value={s.activity} onChange={ev => {
                        const updated = maSessions.map(x => x.id === s.id ? { ...x, activity: ev.target.value } : x);
                        saveMaSessions(updated);
                      }} placeholder="e.g., Dynamic Short Turns" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>CONTEXT</div>
                    <input value={s.context} onChange={ev => {
                      const updated = maSessions.map(x => x.id === s.id ? { ...x, context: ev.target.value } : x);
                      saveMaSessions(updated);
                    }} placeholder="e.g., Practice session with Chris on groomed blue, icy conditions" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>TRANSCRIPT / YOUR ANALYSIS</div>
                    <textarea value={s.transcript} onChange={ev => {
                      const updated = maSessions.map(x => x.id === s.id ? { ...x, transcript: ev.target.value } : x);
                      saveMaSessions(updated);
                    }} placeholder="Paste or type your MA here — exactly how you described what you saw, the skill interactions, root cause, and prescription..." style={{ ...txta, fontSize: 12, minHeight: 80 }} />
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>YOUR NOTES / MENTOR FEEDBACK</div>
                    <textarea value={s.notes} onChange={ev => {
                      const updated = maSessions.map(x => x.id === s.id ? { ...x, notes: ev.target.value } : x);
                      saveMaSessions(updated);
                    }} placeholder="What did your mentor say? What did you learn? What would you do differently?" style={{ ...txta, fontSize: 12, minHeight: 40 }} />
                  </div>

                  {/* Analyze button */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <button onClick={async () => {
                      if (!s.transcript?.trim()) return;
                      setAnalyzingMA(s.id);
                      const input = `MY MA:\n${s.transcript}\n\n${s.notes ? `MENTOR FEEDBACK:\n${s.notes}` : ""}\n\nContext: ${s.context || ""}, Analyzing: ${s.who || ""}, Activity: ${s.activity || ""}`;
                      const resp = await callClaude([{ role: "user", content: input }], buildScorerPrompt(MA_ANALYZER_SYSTEM));
                      const parsed = parseAIJson(resp);
                      const updated = maSessions.map(x => x.id === s.id ? { ...x, summary: JSON.stringify(parsed) } : x);
                      saveMaSessions(updated);
                      setAnalyzingMA(null);
                    }} disabled={analyzingMA === s.id || !s.transcript?.trim()} style={{
                      padding: "6px 14px", borderRadius: 5, fontSize: 12, fontWeight: 700,
                      background: analyzingMA === s.id ? "rgba(255,255,255,0.03)" : "rgba(192,96,160,0.08)",
                      border: "1px solid rgba(192,96,160,0.25)",
                      color: analyzingMA === s.id ? "#4d6888" : "#c060a0", cursor: analyzingMA === s.id ? "default" : "pointer",
                    }}>{analyzingMA === s.id ? "Analyzing..." : "🧠 Analyze My MA"}</button>
                    <button onClick={() => {
                      if (confirm("Delete this MA session?")) {
                        deleteMaSession(s.id);
                      }
                    }} style={{
                      background: "none", border: "none", color: "#4d6888", fontSize: 11, cursor: "pointer",
                    }}>Delete</button>
                  </div>

                  {/* Summary display */}
                  {s.summary && (() => {
                    let parsed = parseSummary(s.summary);

                    if (!parsed || !parsed.scores) {
                      // Clean fallback — strip JSON artifacts for readable display
                      const raw = typeof s.summary === "string" ? s.summary : JSON.stringify(s.summary, null, 2);
                      const cleaned = raw
                        .replace(/^\{|\}$/g, "")
                        .replace(/"scores"\s*:\s*\{[^}]*\},?/g, "")
                        .replace(/"(\w+)":/g, "\n$1:")
                        .replace(/[[\]"]/g, "")
                        .replace(/,\s*$/gm, "")
                        .trim();
                      return cleaned ? (
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(192,96,160,0.04)", border: "1px solid rgba(192,96,160,0.1)", fontSize: 12, color: "#d0d8e0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {cleaned}
                          <div style={{ fontSize: 10, color: "#4d6888", marginTop: 4 }}>Scores not extracted — use Rescore button</div>
                        </div>
                      ) : null;
                    }
                    const scoreColor = (v) => v >= 4 ? "#28a858" : v >= 3 ? "#e07830" : "#e05028";
                    return (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(192,96,160,0.04)", border: "1px solid rgba(192,96,160,0.1)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#c060a0", marginBottom: 8, textTransform: "uppercase" }}>AI Analysis</div>

                        {/* Scores */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {[
                            { key: "describe", label: "Describe" },
                            { key: "cause_effect", label: "Cause/Effect" },
                            { key: "evaluate", label: "Evaluate" },
                            { key: "prescription", label: "Prescription" },
                            { key: "biomechanics", label: "Bio/Physics" },
                            { key: "communication", label: "Communication" },
                          ].map(sc => (
                            <div key={sc.key} style={{ textAlign: "center", minWidth: 55 }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(parsed.scores[sc.key] || 0) }}>{parsed.scores[sc.key] || "—"}</div>
                              <div style={{ fontSize: 9, color: "#7a9ab5", fontWeight: 600 }}>{sc.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Strengths and gaps */}
                        {parsed.strengths?.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#28a858" }}>STRENGTHS: </span>
                            <span style={{ fontSize: 12, color: "#d0d8e0" }}>{parsed.strengths.join(" · ")}</span>
                          </div>
                        )}
                        {parsed.gaps?.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#e07830" }}>GAPS: </span>
                            <span style={{ fontSize: 12, color: "#d0d8e0" }}>{parsed.gaps.join(" · ")}</span>
                          </div>
                        )}
                        {parsed.mentor_corrections && (
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#3088cc" }}>MENTOR CORRECTIONS: </span>
                            <span style={{ fontSize: 12, color: "#d0d8e0" }}>{parsed.mentor_corrections}</span>
                          </div>
                        )}
                        {parsed.key_learning && (
                          <div style={{ padding: "6px 8px", borderRadius: 4, background: "rgba(224,120,48,0.06)", border: "1px solid rgba(224,120,48,0.12)", marginTop: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#e8a050" }}>KEY FOCUS: </span>
                            <span style={{ fontSize: 12, color: "#d0d8e0" }}>{parsed.key_learning}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}

              {maSessions.length > 0 && (
                <div style={{ fontSize: 10, color: "#4d6888", marginTop: 4 }}>
                  {maSessions.length} session{maSessions.length !== 1 ? "s" : ""} recorded · Last 4 are sent to the AI sparring partner
                </div>
              )}
            </Card>

            {/* Reference Materials for AI */}
            <Card style={{ marginTop: 20, borderLeft: "3px solid #c060a0" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#c060a0", marginBottom: 4 }}>PSIA Reference Materials for AI Coach</div>
              <div style={{ fontSize: 13, color: "#7a9ab5", marginBottom: 12, lineHeight: 1.5 }}>
                Paste key PSIA content here — Skills Concept, Center Line, Common Threads, AT assessment criteria, or anything you want your sparring partner to reference when coaching you. The more context it has, the smarter it gets.
              </div>
              <textarea
                value={referenceMaterials}
                onChange={ev => saveReferenceMaterials(ev.target.value)}
                placeholder={"Paste PSIA reference content here. For example:\n\nSKILLS CONCEPT\nThe four skills — edging, pressure, rotary, and balance/stance — interact simultaneously...\n\nCENTER LINE\nLevel 1: Wedge Turn — ...\nLevel 2: Wedge Christie / Basic Parallel — ...\n\nAT ASSESSMENT CRITERIA\nModule 1 (Technical/MA): Demonstrate blended MA using 3+ skills..."}
                style={{
                  width: "100%", minHeight: 150, padding: "10px 12px", fontSize: 13, color: "#d0d8e0",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6, outline: "none", fontFamily: "inherit", resize: "vertical",
                  lineHeight: 1.6, boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <div style={{ fontSize: 10, color: "#4d6888" }}>Auto-saves · {referenceMaterials.length > 0 ? `${referenceMaterials.length} characters` : "Empty"}</div>
                {referenceMaterials.length > 40000 && (
                  <div style={{ fontSize: 10, color: "#e07830" }}>Note: Very large reference materials may slow AI responses</div>
                )}
              </div>
            </Card>
          </>
        )}

        {/* ═══ GROWTH ═══ */}
        {tab === "growth" && !isSubView && (() => {
          const sorted = [...entries].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || "").localeCompare(b.id || ""));
          const depthCounts = { surface: 0, connecting: 0, integrated: 0 };
          sorted.forEach(e => { Object.values(e.mentorPulse || {}).forEach(v => { if (depthCounts[v] !== undefined) depthCounts[v]++; }); });
          const totalTagged = sorted.filter(e => (e.connectionTags || []).length > 0).length;
          const avgTags = totalTagged > 0 ? (sorted.reduce((sum, e) => sum + (e.connectionTags || []).length, 0) / totalTagged).toFixed(1) : "—";

          // Domain frequency
          const domainFreq = {};
          DOMAINS.forEach(d => { domainFreq[d.id] = 0; });
          entries.forEach(e => (e.connectionTags || []).forEach(t => { domainFreq[t] = (domainFreq[t] || 0) + 1; }));

          return (
            <>
              <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
                How your thinking is developing over time.
              </div>

              {/* Development Matrix — auto-derived from app data */}
              <Card style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e8a050", marginBottom: 10 }}>Development matrix</div>

                {/* MA Development — from MA session auto-summaries */}
                {(() => {
                  const analyzedSessions = maSessions.filter(s => s.summary);
                  const maScoreKeys = ["describe", "cause_effect", "evaluate", "prescription", "biomechanics", "communication"];
                  const maScoreLabels = { describe: "Describe", cause_effect: "Cause/Effect", evaluate: "Evaluate", prescription: "Prescription", biomechanics: "Bio/Physics", communication: "Communication" };
                  const scoreColor = (v) => v >= 4 ? "#28a858" : v >= 3 ? "#e07830" : v > 0 ? "#e05028" : "#4d6888";

                  // Build score history per criteria from all analyzed sessions
                  const scoreHistory = {};
                  maScoreKeys.forEach(k => { scoreHistory[k] = []; });
                  analyzedSessions.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || "").localeCompare(b.id || "")).forEach(s => {
                    try {
                      let parsed = parseSummary(s.summary);

                      if (parsed?.scores) {
                        maScoreKeys.forEach(k => {
                          if (parsed.scores[k]) scoreHistory[k].push({ score: parsed.scores[k], date: s.date, context: s.activity || s.who || "" });
                        });
                      }
                    } catch(e) {}
                  });

                  // Collect all gaps and strengths across sessions
                  const allGaps = [];
                  const allStrengths = [];
                  analyzedSessions.forEach(s => {
                    try {
                      let parsed = parseSummary(s.summary);

                      if (parsed?.gaps) allGaps.push(...parsed.gaps);
                      if (parsed?.strengths) allStrengths.push(...parsed.strengths);
                    } catch(e) {}
                  });

                  return (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#e8a050", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0", borderBottom: "1.5px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                        Module 1 — MA / Technical ({analyzedSessions.length} analyzed session{analyzedSessions.length !== 1 ? "s" : ""})
                      </div>

                      {analyzedSessions.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#4d6888", fontStyle: "italic", padding: "8px 0" }}>
                          Add MA sessions in Resources tab and tap "Analyze My MA" to populate scores
                        </div>
                      ) : (
                        <>
                          {maScoreKeys.map(k => {
                            const hist = scoreHistory[k];
                            if (hist.length === 0) return null;
                            const latest = hist[hist.length - 1];
                            const first = hist[0];
                            const totalDelta = hist.length > 1 ? latest.score - first.score : 0;
                            return (
                              <div key={k} style={{ padding: "6px 0", borderBottom: "0.5px solid rgba(255,255,255,0.03)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#d0d8e0", flex: 1 }}>{maScoreLabels[k]}</span>
                                  {totalDelta !== 0 && (
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: totalDelta > 0 ? "rgba(40,168,88,0.1)" : "rgba(224,80,40,0.1)", color: totalDelta > 0 ? "#28a858" : "#e05028" }}>
                                      {totalDelta > 0 ? `↑ +${totalDelta}` : `↓ ${totalDelta}`}
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
                                  {hist.map((h, hi) => {
                                    const delta = hi > 0 ? h.score - hist[hi - 1].score : null;
                                    const dateStr = h.date ? new Date(h.date + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : "";
                                    return (
                                      <div key={hi} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 38 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: scoreColor(h.score), background: `${scoreColor(h.score)}12`, border: `1.5px solid ${scoreColor(h.score)}30` }}>{h.score}</div>
                                        {delta !== null && delta !== 0 && <div style={{ fontSize: 9, fontWeight: 700, color: delta > 0 ? "#28a858" : "#e05028", marginTop: 1 }}>{delta > 0 ? `+${delta}` : delta}</div>}
                                        <div style={{ fontSize: 9, color: "#4d6888", marginTop: 1 }}>{dateStr}</div>
                                        <div style={{ fontSize: 8, color: "#3a5068", maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{h.context}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {/* Recurring patterns */}
                          {allGaps.length > 0 && (
                            <div style={{ marginTop: 8, padding: "6px 8px", borderRadius: 5, background: "rgba(224,120,48,0.04)", border: "1px solid rgba(224,120,48,0.1)" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#e07830", marginBottom: 3 }}>RECURRING GAPS</div>
                              <div style={{ fontSize: 12, color: "#d0d8e0", lineHeight: 1.5 }}>{[...new Set(allGaps)].slice(0, 5).join(" · ")}</div>
                            </div>
                          )}
                          {allStrengths.length > 0 && (
                            <div style={{ marginTop: 4, padding: "6px 8px", borderRadius: 5, background: "rgba(40,168,88,0.04)", border: "1px solid rgba(40,168,88,0.1)" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#28a858", marginBottom: 3 }}>CONSISTENT STRENGTHS</div>
                              <div style={{ fontSize: 12, color: "#d0d8e0", lineHeight: 1.5 }}>{[...new Set(allStrengths)].slice(0, 5).join(" · ")}</div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Clinic Leading — from clinic feedback entries */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e8a050", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0", borderBottom: "1.5px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                    Module 3 — Clinic leading ({clinicFeedback.length} clinic{clinicFeedback.length !== 1 ? "s" : ""} logged)
                  </div>
                  {clinicFeedback.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#4d6888", fontStyle: "italic", padding: "8px 0" }}>Log clinics in the Clinics tab to track clinic leading development</div>
                  ) : (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>CLINICS LED</div><div style={{ fontSize: 20, fontWeight: 700, color: "#e8a050" }}>{clinicFeedback.length}</div></div>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>WITH SELF-REFLECTION</div><div style={{ fontSize: 20, fontWeight: 700, color: "#28a858" }}>{clinicFeedback.filter(c => c.selfReflection?.trim() || c.whatWorked?.trim()).length}</div></div>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>WITH FEEDBACK</div><div style={{ fontSize: 20, fontWeight: 700, color: "#3088cc" }}>{clinicFeedback.filter(c => c.participantFeedback?.trim() || c.notes?.trim()).length}</div></div>
                    </div>
                  )}
                </div>

                {/* Reflection depth + mentor engagement */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e8a050", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0", borderBottom: "1.5px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
                    Reflection quality
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>REFLECTIONS</div><div style={{ fontSize: 20, fontWeight: 700, color: "#d0d8e0" }}>{entries.length}</div></div>
                    <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>★ HIT THE MARK</div><div style={{ fontSize: 20, fontWeight: 700, color: "#28a858" }}>{entries.filter(e => Object.values(e.mentorPulse || {}).includes("integrated")).length}</div></div>
                    <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>MENTOR COMMENTS</div><div style={{ fontSize: 20, fontWeight: 700, color: "#3088cc" }}>{entries.reduce((sum, e) => sum + (e.mentorComments || []).length, 0)}</div></div>
                    <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600 }}>MA SESSIONS</div><div style={{ fontSize: 20, fontWeight: 700, color: "#c060a0" }}>{maSessions.length}</div></div>
                  </div>
                </div>
              </Card>

              {entries.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 40, opacity: 0.4 }}>📊</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>No data yet — write some reflections first</div>
                </Card>
              ) : (
                <>
                  {/* Summary stats */}
                  <Card>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#7a9ab5", fontWeight: 700, textTransform: "uppercase" }}>Reflections</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#d0d8e0" }}>{entries.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#7a9ab5", fontWeight: 700, textTransform: "uppercase" }}>Avg Connections</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#e07830" }}>{avgTags}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#7a9ab5", fontWeight: 700, textTransform: "uppercase" }}>Depth Assessed</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#28a858" }}>{depthCounts.surface + depthCounts.connecting + depthCounts.integrated}</div>
                      </div>
                    </div>
                  </Card>

                  {/* Mentor depth distribution */}
                  {(depthCounts.surface + depthCounts.connecting + depthCounts.integrated) > 0 && (
                  <Card>
                    <SectionLabel>Mentor Depth Assessments</SectionLabel>
                    {PULSE_OPTIONS.map(d => {
                      const totalDepth = depthCounts.surface + depthCounts.connecting + depthCounts.integrated;
                      const pct = totalDepth > 0 ? (depthCounts[d.id] / totalDepth) * 100 : 0;
                      return (
                        <div key={d.id} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: d.color }}>{d.icon} {d.label}</span>
                            <span style={{ fontSize: 13, color: "#7a9ab5" }}>{depthCounts[d.id]} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: d.color, borderRadius: 3 }} />
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                  )}

                  {/* Domain map */}
                  <Card>
                    <SectionLabel>Connection Domains</SectionLabel>
                    {DOMAINS.sort((a, b) => (domainFreq[b.id] || 0) - (domainFreq[a.id] || 0)).map(d => {
                      const count = domainFreq[d.id] || 0;
                      const pct = totalTagged > 0 ? (count / totalTagged) * 100 : 0;
                      return (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: d.color, width: 140, flexShrink: 0 }}>{d.label}</span>
                          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: d.color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: "#7a9ab5", width: 24, textAlign: "right" }}>{count}</span>
                        </div>
                      );
                    })}
                  </Card>

                  {/* Mentor pulse pattern */}
                </>
              )}
            </>
          );
        })()}

        {/* ═══ PROGRESS ═══ */}
        {tab === "progress" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
              {isMentor
                ? "Your development assessment of Mark. This is the most important input for the AI — the sparring partner reads it every time Mark practices. Update it as he progresses."
                : "Your mentors' development assessments. These directly shape the AI sparring partner's coaching."}
            </div>

            {/* Mentor editable assessment */}
            {isMentor && (
              <>
                <Card style={{ borderLeft: "3px solid #28a858", marginBottom: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#28a858", marginBottom: 4 }}>Your Development Assessment of Mark</div>
                  {[
                    { key: "whatsWorking", label: "What's working", placeholder: "What is Mark doing well? What's consistent? What should he keep doing?" },
                    { key: "consistentGaps", label: "Consistent gaps", placeholder: "What patterns keep showing up? Where does he repeatedly fall short of AT level?" },
                    { key: "progress", label: "Progress I've noticed", placeholder: "How has Mark's thinking evolved? What's improved since we started working together?" },
                  ].map(field => (
                    <div key={field.key} style={{ marginBottom: 8 }}>
                      <label style={lbl}>{field.label}</label>
                      <textarea
                        value={(mentorAssessments[currentUser.key] || {})[field.key] || ""}
                        onChange={ev => {
                          const updated = {
                            ...mentorAssessments,
                            [currentUser.key]: {
                              ...(mentorAssessments[currentUser.key] || {}),
                              [field.key]: ev.target.value,
                              lastUpdated: today(),
                            }
                          };
                          setMentorAssessments(updated);
                          if (saveTimerRef.current._ma) clearTimeout(saveTimerRef.current._ma);
                          saveTimerRef.current._ma = setTimeout(() => saveMentorAssessments(updated), 1500);
                        }}
                        placeholder={field.placeholder}
                        style={{ ...txta, fontSize: 13, minHeight: 50 }}
                      />
                    </div>
                  ))}
                  {mentorAssessments[currentUser.key]?.lastUpdated && (
                    <div style={{ fontSize: 10, color: "#4d6888" }}>Last updated: {mentorAssessments[currentUser.key].lastUpdated} · Auto-saves</div>
                  )}
                </Card>

                {/* AI-generated assessment suggestion */}
                <Card style={{ borderLeft: "3px solid #c060a0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#c060a0", marginBottom: 4 }}>AI Analysis of Mark's Development</div>
                  <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 8, lineHeight: 1.4 }}>
                    Generate an AI analysis based on Mark's MA sessions, journal reflections, and existing feedback. Review it, then use what resonates to update your assessment above.
                  </div>
                  <button onClick={async () => {
                    setAiAssessmentLoading(true);
                    setAiAssessmentResult(null);

                    // Gather MA sessions data
                    let maContext = "";
                    const recentMA = [...maSessions].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).slice(0, 8);
                    if (recentMA.length > 0) {
                      maContext = "MA SESSIONS:\n";
                      recentMA.forEach(s => {
                        maContext += `\n[${s.date} · ${s.context || ""} · ${s.who || ""} · ${s.activity || ""}]`;
                        if (s.summary) {
                          try {
                            const p = parseSummary(s.summary);
                            if (p.scores) maContext += `\nScores: D=${p.scores.describe} C/E=${p.scores.cause_effect} E=${p.scores.evaluate} P=${p.scores.prescription} B=${p.scores.biomechanics} Co=${p.scores.communication}`;
                            if (p.did_well) maContext += `\nDid well: ${(Array.isArray(p.did_well) ? p.did_well : [p.did_well]).join(", ")}`;
                            if (p.opportunity) maContext += `\nOpportunity: ${(Array.isArray(p.opportunity) ? p.opportunity : [p.opportunity]).join(", ")}`;
                            if (p.gaps) maContext += `\nGaps: ${(Array.isArray(p.gaps) ? p.gaps : [p.gaps]).join(", ")}`;
                            if (p.key_learning) maContext += `\nKey focus: ${p.key_learning}`;
                          } catch(e) {}
                        }
                        const fb = s.mentorFeedback || [];
                        if (fb.length > 0) {
                          maContext += "\nMentor feedback:";
                          fb.forEach(f => { maContext += `\n  ${USERS[f.userId]?.name || f.userId}: ${f.text.slice(0, 200)}`; });
                        }
                      });
                    }

                    // Gather journal entries
                    let journalContext = "";
                    const recentEntries = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).slice(0, 8);
                    if (recentEntries.length > 0) {
                      journalContext = "\n\nJOURNAL REFLECTIONS:\n";
                      recentEntries.forEach(e => {
                        const pulseValues = Object.entries(e.mentorPulse || {}).filter(([, v]) => v);
                        const depthLabels = { surface: "Surface", connecting: "Connecting", integrated: "Integrated" };
                        journalContext += `\n[${e.date} · ${e.context}]`;
                        if (e.whatISaw) journalContext += `\nSaw: ${e.whatISaw.slice(0, 200)}`;
                        if (e.whatWasGoingOn) journalContext += `\nRoot cause: ${e.whatWasGoingOn.slice(0, 200)}`;
                        if (pulseValues.length > 0) journalContext += `\nMentor depth: ${pulseValues.map(([k, v]) => `${USERS[k]?.name || k}: ${depthLabels[v] || v}`).join(", ")}`;
                        const comments = e.mentorComments || [];
                        if (comments.length > 0) comments.slice(-2).forEach(c => { journalContext += `\n  ${USERS[c.userId]?.name || c.userId}: ${(c.text || "").slice(0, 150)}`; });
                      });
                    }

                    // Current assessment for context
                    let currentAssessment = "";
                    const myAssessment = mentorAssessments[currentUser.key];
                    if (myAssessment?.whatsWorking || myAssessment?.consistentGaps || myAssessment?.progress) {
                      currentAssessment = `\n\nYOUR CURRENT ASSESSMENT:\nWhat's working: ${myAssessment.whatsWorking || "(empty)"}\nConsistent gaps: ${myAssessment.consistentGaps || "(empty)"}\nProgress: ${myAssessment.progress || "(empty)"}`;
                    }

                    const prompt = `You are helping an AT examiner/mentor update their development assessment of Mark, an L3 instructor pursuing AT certification.

Based on the data below, produce an updated assessment in THREE sections. Be specific — reference actual sessions, scores, patterns, and growth. Write as if you are the mentor speaking.

${maContext}${journalContext}${currentAssessment}

Respond in this exact format (plain text, not JSON):

WHAT'S WORKING:
[specific things Mark is doing well, with evidence from sessions]

CONSISTENT GAPS:
[patterns that keep showing up, with specific examples]

PROGRESS I'VE NOTICED:
[how Mark's thinking has evolved over time, what's improved, what shifted]`;

                    const resp = await callClaude([{ role: "user", content: prompt }], AT_COACH_SYSTEM);
                    setAiAssessmentResult(resp);
                    setAiAssessmentLoading(false);
                  }} disabled={aiAssessmentLoading || (maSessions.length === 0 && entries.length === 0)} style={{
                    width: "100%", padding: "10px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: aiAssessmentLoading ? "default" : "pointer",
                    background: aiAssessmentLoading ? "rgba(255,255,255,0.03)" : "rgba(192,96,160,0.08)",
                    border: "1px solid rgba(192,96,160,0.25)", color: aiAssessmentLoading ? "#4d6888" : "#c060a0",
                  }}>{aiAssessmentLoading ? "Analyzing Mark's sessions and reflections..." : "Generate AI Analysis"}</button>

                  {aiAssessmentResult && (
                    <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 8, background: "rgba(192,96,160,0.04)", border: "1px solid rgba(192,96,160,0.1)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#c060a0", marginBottom: 6, textTransform: "uppercase" }}>AI Suggested Assessment</div>
                      <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{aiAssessmentResult}</div>
                      <div style={{ fontSize: 10, color: "#7a9ab5", marginTop: 8 }}>Review this analysis and use what resonates to update your assessment above. You are the ground truth — the AI is suggesting, not deciding.</div>
                    </div>
                  )}
                </Card>
              </>
            )}

            {/* Mark sees mentor assessments (read-only) */}
            {isCandidate && Object.entries(mentorAssessments).some(([, v]) => v?.whatsWorking || v?.consistentGaps || v?.progress) && (
              <Card style={{ borderLeft: "3px solid #28a858" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#28a858", marginBottom: 8 }}>Mentor Development Assessments</div>
                {Object.entries(mentorAssessments).filter(([, v]) => v?.whatsWorking || v?.consistentGaps || v?.progress).map(([key, a]) => {
                  const mentor = USERS[key] || { name: key, color: "#7a9ab5" };
                  return (
                    <div key={key} style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: `${mentor.color}06`, border: `1px solid ${mentor.color}12` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${mentor.color}20`, border: `1.5px solid ${mentor.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: mentor.color }}>{mentor.name[0]}</div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: mentor.color }}>{mentor.name}</span>
                        {a.lastUpdated && <span style={{ fontSize: 10, color: "#4d6888" }}>Updated {a.lastUpdated}</span>}
                      </div>
                      {a.whatsWorking && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#28a858" }}>WHAT'S WORKING: </span><span style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5 }}>{a.whatsWorking}</span></div>}
                      {a.consistentGaps && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#e07830" }}>CONSISTENT GAPS: </span><span style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5 }}>{a.consistentGaps}</span></div>}
                      {a.progress && <div><span style={{ fontSize: 10, fontWeight: 700, color: "#3088cc" }}>PROGRESS: </span><span style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5 }}>{a.progress}</span></div>}
                    </div>
                  );
                })}
              </Card>
            )}

            {isCandidate && !Object.entries(mentorAssessments).some(([, v]) => v?.whatsWorking || v?.consistentGaps || v?.progress) && (
              <Card style={{ textAlign: "center", padding: "50px 20px" }}>
                <div style={{ fontSize: 40, opacity: 0.4 }}>📊</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>No assessments yet</div>
                <div style={{ fontSize: 14, color: "#3a5068", marginTop: 4 }}>Your mentors will add their development assessments here.</div>
              </Card>
            )}

          </>
        )}

        {/* ═══ CHECKPOINTS ═══ */}
        {tab === "checkpoints" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
              Portfolio reviews every 6-8 weeks. Mentors read your recent reflections and videos, then share what they see in your development.
            </div>

            {isMentor && (
              <button onClick={() => {
                // Get most recent checkpoint from this mentor
                const prevCp = [...checkpoints]
                  .filter(c => c.mentorId === currentUser.key)
                  .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""))[0];
                const coachNotes = mentorCoachNotes[currentUser.key] || "";
                setEditingCheckpoint({
                  id: uid(), date: today(), mentorId: currentUser.key,
                  whatImSeeing: prevCp?.whatImSeeing || "",
                  pushOnNext: prevCp?.pushOnNext || "",
                  connectionsWell: prevCp?.connectionsWell || "",
                  connectionsMissing: prevCp?.connectionsMissing || "",
                  coachingNotes: coachNotes,
                  markResponse: "", timestamp: new Date().toISOString(),
                });
              }} style={{
                padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(224,120,48,0.3)", background: "rgba(224,120,48,0.08)",
                color: "#e8a050", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12,
              }}>+ New Checkpoint Review</button>
            )}

            {checkpoints.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 40, opacity: 0.4 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>No checkpoint reviews yet</div>
              </Card>
            ) : (
              checkpoints.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).map(cp => {
                const mentor = USERS[cp.mentorId] || { name: "Unknown", color: "#7a9ab5" };
                return (
                  <Card key={cp.id} style={{ borderLeft: `3px solid ${mentor.color}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: mentor.color }}>{mentor.name}'s Review</span>
                        <span style={{ fontSize: 12, color: "#7a9ab5", marginLeft: 8 }}>{cp.date}</span>
                      </div>
                    </div>
                    {[
                      { label: "What I'm Seeing", val: cp.whatImSeeing },
                      { label: "Push On Next", val: cp.pushOnNext },
                      { label: "Connections You're Making Well", val: cp.connectionsWell },
                      { label: "Connections You're Missing", val: cp.connectionsMissing },
                      { label: "Coaching Notes for AI Sparring Partner", val: cp.coachingNotes },
                    ].filter(s => s.val).map(s => (
                      <div key={s.label} style={{ marginBottom: 10 }}>
                        <SectionLabel>{s.label}</SectionLabel>
                        <p style={{ fontSize: 14, color: "#d0d8e0", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{s.val}</p>
                      </div>
                    ))}
                    {cp.markResponse && (
                      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(224,120,48,0.04)", border: "1px solid rgba(224,120,48,0.1)" }}>
                        <SectionLabel>Mark's Response</SectionLabel>
                        <p style={{ fontSize: 14, color: "#d0d8e0", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{cp.markResponse}</p>
                      </div>
                    )}
                    {isCandidate && !cp.markResponse && (
                      <div style={{ marginTop: 8 }}>
                        <textarea id={`cp-response-${cp.id}`} placeholder="Your response to this review..." style={{ ...txta, minHeight: 40, fontSize: 13 }} />
                        <button onClick={() => {
                          const el = document.getElementById(`cp-response-${cp.id}`);
                          const text = el.value.trim();
                          if (!text) return;
                          const updated = checkpoints.map(c => c.id === cp.id ? { ...c, markResponse: text } : c);
                          saveCheckpoints(updated);
                        }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 13, fontWeight: 700, background: "rgba(224,120,48,0.08)", border: "1px solid rgba(224,120,48,0.2)", color: "#e8a050", cursor: "pointer", marginTop: 4 }}>Save Response</button>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </>
        )}

        {/* ═══ CHECKPOINT EDIT ═══ */}
        {editingCheckpoint && (() => {
          const cp = editingCheckpoint;
          const upd = (f, v) => setEditingCheckpoint(p => ({ ...p, [f]: v }));
          return (
            <div>
              <button onClick={() => setEditingCheckpoint(null)} style={{ background: "none", border: "none", color: "#7a9ab5", fontSize: 14, cursor: "pointer", padding: "0 0 10px", fontWeight: 600 }}>← Cancel</button>
              <Card>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#e0e8f0", marginBottom: 14 }}>Portfolio Review</div>
                <div style={{ marginBottom: 12 }}><label style={lbl}>Date</label><input type="date" value={cp.date} onChange={e => upd("date", e.target.value)} style={inp} /></div>
                {[
                  { f: "whatImSeeing", l: "What I'm seeing in Mark's development", p: "Based on recent reflections and videos..." },
                  { f: "pushOnNext", l: "What I'd push on next", p: "Where should Mark focus his attention?" },
                  { f: "connectionsWell", l: "Connections he's making well", p: "Where is his thinking strongest?" },
                  { f: "connectionsMissing", l: "Connections he's missing", p: "Where is he still thinking in pieces?" },
                  { f: "coachingNotes", l: "Coaching Notes for AI Sparring Partner", p: "What should the AI push Mark on? This updates the active coaching notes when saved." },
                ].map(field => (
                  <div key={field.f} style={{ marginBottom: 12 }}>
                    <label style={lbl}>{field.l}</label>
                    <textarea value={cp[field.f] || ""} onChange={e => upd(field.f, e.target.value)} placeholder={field.p} style={txta} />
                  </div>
                ))}
                <button onClick={() => {
                  const isNew = !checkpoints.find(c => c.id === cp.id);
                  const updated = isNew ? [cp, ...checkpoints] : checkpoints.map(c => c.id === cp.id ? cp : c);
                  saveCheckpoints(updated);
                  // Sync coaching notes back to active coaching notes
                  if (cp.coachingNotes !== undefined) {
                    const updatedNotes = { ...mentorCoachNotes, [currentUser.key]: cp.coachingNotes };
                    setMentorCoachNotes(updatedNotes);
                    apiUpsert("Config", { id: "_COACH_NOTES", data: JSON.stringify(updatedNotes) });
                  }
                  setEditingCheckpoint(null);
                }} style={{
                  width: "100%", padding: "12px", borderRadius: 7, border: "none",
                  background: "linear-gradient(135deg, #e07830, #c06020)", color: "#fff",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}>Save Review</button>
              </Card>
            </div>
          );
        })()}

        {/* ═══ VIDEOS ═══ */}
        {tab === "videos" && !isSubView && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: "#7a9ab5", lineHeight: 1.5 }}>Track your skiing with video. Film IDP tasks, link YouTube or Drive, get mentor feedback.</div>
              {isCandidate && (
                <button onClick={() => {
                  saveVideos([{ id: uid(), date: today(), activity: "", url: "", notes: "", conditions: "", selfScore: "", season: getCurrentSeason(), comments: [] }, ...videos]);
                }} style={{
                  padding: "7px 14px", borderRadius: 6, border: "1px solid rgba(48,136,204,0.4)",
                  background: "rgba(48,136,204,0.1)", color: "#3088cc", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0, marginLeft: 10,
                }}>+ Add Video</button>
              )}
            </div>

            {videos.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "50px 20px" }}>
                <div style={{ fontSize: 40, opacity: 0.4 }}>🎥</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>No videos yet</div>
                <div style={{ fontSize: 14, color: "#3a5068", marginTop: 4 }}>Film yourself performing IDP tasks. Track your progression over time.</div>
              </Card>
            ) : videos.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).map(v => {
              // Extract YouTube thumbnail
              const ytMatch = (v.url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
              const thumbUrl = ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg` : null;

              return (
                <Card key={v.id} style={{ borderLeft: "3px solid #3088cc" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {/* Thumbnail */}
                    {thumbUrl ? (
                      <a href={v.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                        <img src={thumbUrl} alt="" style={{ width: 120, height: 68, borderRadius: 6, objectFit: "cover", display: "block" }} />
                      </a>
                    ) : v.url ? (
                      <a href={v.url} target="_blank" rel="noreferrer" style={{ width: 120, height: 68, borderRadius: 6, background: "rgba(48,136,204,0.08)", border: "1px solid rgba(48,136,204,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 24, color: "#3088cc", textDecoration: "none" }}>▶</a>
                    ) : null}

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 2 }}>
                        {v.date}{v.conditions ? ` · ${v.conditions}` : ""}{v.selfScore ? ` · Score: ${v.selfScore}/6` : ""}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#d0d8e0" }}>{v.activity || "Untitled"}</div>
                      {v.notes && <div style={{ fontSize: 13, color: "#7a9ab5", marginTop: 3, lineHeight: 1.4 }}>{v.notes.length > 100 ? v.notes.slice(0, 100) + "…" : v.notes}</div>}
                    </div>
                  </div>

                  {/* Edit fields (collapsed by default for clean list view) */}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 12, color: "#4d6888", cursor: "pointer" }}>Edit details</summary>
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>DATE</div><input type="date" value={v.date} onChange={ev => { saveVideos(videos.map(x => x.id === v.id ? { ...x, date: ev.target.value } : x)); }} style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>IDP ACTIVITY</div><input value={v.activity} onChange={ev => { saveVideos(videos.map(x => x.id === v.id ? { ...x, activity: ev.target.value } : x)); }} placeholder="e.g., Pivot Slips" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                    </div>
                    <div style={{ marginTop: 6 }}><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>VIDEO LINK</div><input value={v.url} onChange={ev => { saveVideos(videos.map(x => x.id === v.id ? { ...x, url: ev.target.value } : x)); }} placeholder="YouTube or Google Drive link" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>CONDITIONS</div><input value={v.conditions || ""} onChange={ev => { saveVideos(videos.map(x => x.id === v.id ? { ...x, conditions: ev.target.value } : x)); }} placeholder="e.g., Groomed blue, firm" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                      <div><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>SELF-ASSESSMENT (1-6)</div><select value={v.selfScore || ""} onChange={ev => { saveVideos(videos.map(x => x.id === v.id ? { ...x, selfScore: ev.target.value } : x)); }} style={{ ...inp, fontSize: 12, padding: "4px 6px", cursor: "pointer", appearance: "auto" }}><option value="">—</option>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                    </div>
                    <div style={{ marginTop: 6 }}><div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>NOTES</div><textarea value={v.notes || ""} onChange={ev => { saveVideos(videos.map(x => x.id === v.id ? { ...x, notes: ev.target.value } : x)); }} placeholder="What did you see? What's improving?" style={{ ...txta, fontSize: 12, minHeight: 40 }} /></div>
                    <button onClick={() => { if (confirm("Delete this video?")) deleteVideo(v.id); }} style={{ background: "none", border: "none", color: "#4d6888", fontSize: 11, cursor: "pointer", marginTop: 4 }}>Delete</button>
                  </details>

                  {/* Comments */}
                  {(v.comments || []).map((c, ci) => {
                    const commenter = USERS[c.userId] || { name: c.userId, color: "#7a9ab5" };
                    return (
                      <div key={ci} style={{ display: "flex", gap: 6, marginTop: 6, padding: "6px 8px", borderRadius: 5, background: `${commenter.color}06`, border: `1px solid ${commenter.color}12` }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, background: `${commenter.color}20`, border: `1px solid ${commenter.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: commenter.color }}>{commenter.name[0]}</div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: commenter.color }}>{commenter.name}</span>
                          <span style={{ fontSize: 10, color: "#4d6888", marginLeft: 6 }}>{c.timestamp ? new Date(c.timestamp).toLocaleDateString("en", { month: "short", day: "numeric" }) : ""}</span>
                          <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.4, marginTop: 2, whiteSpace: "pre-wrap" }}>{c.text}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 6 }}>
                    <textarea id={`vid-comment-${v.id}`} placeholder={isMentor ? "Coach on this video..." : "Add a note..."} style={{ ...txta, minHeight: 30, flex: 1, fontSize: 12 }} />
                    <button onClick={() => {
                      const el = document.getElementById(`vid-comment-${v.id}`);
                      const text = el.value.trim();
                      if (!text) return;
                      const updated = videos.map(x => x.id === v.id ? { ...x, comments: [...(x.comments || []), { userId: currentUser.key, text, timestamp: new Date().toISOString() }] } : x);
                      saveVideos(updated);
                      el.value = "";
                    }} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, background: "rgba(48,136,204,0.08)", border: "1px solid rgba(48,136,204,0.2)", color: "#3088cc", cursor: "pointer", flexShrink: 0 }}>Post</button>
                  </div>
                </Card>
              );
            })}
          </>
        )}

        {/* ═══ MA HISTORY ═══ */}
        {tab === "mahistory" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
              {isMentor
                ? "Review Mark's MA sessions. Add feedback to calibrate the AI sparring partner."
                : "Your MA practice history. Mentors can review and add feedback."}
            </div>

            {maSessions.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "50px 20px" }}>
                <div style={{ fontSize: 40, opacity: 0.4 }}>🧠</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>No MA sessions yet</div>
                <div style={{ fontSize: 14, color: "#3a5068", marginTop: 4 }}>
                  {isCandidate ? "Practice MA in the Sparring Partner tab (Written MA mode) or add sessions in Resources." : "Mark hasn't recorded any MA sessions yet."}
                </div>
              </Card>
            ) : [...maSessions].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).map(s => {
              let aiScores = parseSummary(s.summary);
              const scoreColor = (v) => v >= 4 ? "#28a858" : v >= 3 ? "#e07830" : "#e05028";
              const mentorFeedback = s.mentorFeedback || [];
              const didWell = aiScores?.did_well || aiScores?.strengths || [];
              const opportunity = aiScores?.opportunity || aiScores?.gaps || [];

              return (
                <Card key={s.id} style={{ borderLeft: "3px solid #c060a0" }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#7a9ab5" }}>{s.date}{s.context ? ` · ${s.context}` : ""}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#d0d8e0" }}>
                        {s.activity || "MA Session"}{s.who ? ` — analyzing ${s.who}` : ""}
                      </div>
                      {(s.context || "").toLowerCase().includes("at ma exam") && s.who && (() => {
                        const w = (s.who || "").toLowerCase();
                        const behavior = w.includes("weak") ? "May struggle to articulate, self-assessment may be inaccurate"
                          : w.includes("solid") ? "Good self-awareness, describes what they feel, may not connect to fundamentals"
                          : w.includes("strong") ? "Articulate, connects to fundamentals, approaching AT-level self-analysis"
                          : w.includes("advanced") ? "Highly self-aware, precise terminology, may challenge analysis"
                          : null;
                        return behavior ? <div style={{ fontSize: 10, color: "#4d6888", marginTop: 2, fontStyle: "italic" }}>Peer behavior: {behavior}</div> : null;
                      })()}
                    </div>
                    {aiScores?.scores ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ display: "flex", gap: 3 }}>
                          {[{ key: "describe", l: "D" }, { key: "cause_effect", l: "C" }, { key: "evaluate", l: "E" }, { key: "prescription", l: "P" }, { key: "biomechanics", l: "B" }, { key: "communication", l: "Co" }].map(sc => (
                            <div key={sc.key} style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: scoreColor(aiScores.scores[sc.key] || 0), background: `${scoreColor(aiScores.scores[sc.key] || 0)}12`, border: `1px solid ${scoreColor(aiScores.scores[sc.key] || 0)}30` }}>
                              {aiScores.scores[sc.key] || "—"}
                            </div>
                          ))}
                        </div>
                        {s.transcript && (rescoringId === s.id
                          ? <span style={{ fontSize: 10, color: "#c060a0", marginLeft: 4 }}>scoring...</span>
                          : <button onClick={async () => {
                              setRescoringId(s.id);
                              try {
                                const input = buildScoreInput(s);
                                const resp = await callClaude([{ role: "user", content: input }], buildScorerPrompt(MA_TREND_SCORER_SYSTEM));
                                console.log("Rescore response:", resp?.slice(0, 300));
                                const parsed = parseAIJson(resp);
                                console.log("Rescore parsed:", parsed?.scores);
                                if (parsed?.scores) {
                                  const cleanSummary = { ...parsed, scoredAt: new Date().toISOString() };
                                  delete cleanSummary.raw;
                                  const updated = maSessions.map(x => x.id === s.id ? { ...x, summary: JSON.stringify(cleanSummary) } : x);
                                  saveMaSessions(updated);
                                } else {
                                  console.warn("Rescore failed - no scores extracted. Raw:", resp);
                                  alert("Scoring failed — check console for details. The AI may not have returned valid JSON.");
                                }
                              } catch(err) {
                                console.error("Rescore error:", err);
                                alert("Scoring error: " + err.message);
                              }
                              setRescoringId(null);
                            }} style={{
                              padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, marginLeft: 2,
                              background: "rgba(122,154,181,0.08)", border: "1px solid rgba(122,154,181,0.2)", color: "#7a9ab5",
                            }}>↻</button>
                        )}
                      </div>
                    ) : s.transcript ? (
                      rescoringId === s.id
                        ? <span style={{ fontSize: 11, color: "#c060a0" }}>Scoring...</span>
                        : <button onClick={async () => {
                            setRescoringId(s.id);
                            try {
                              const input = buildScoreInput(s);
                              const resp = await callClaude([{ role: "user", content: input }], buildScorerPrompt(MA_TREND_SCORER_SYSTEM));
                              console.log("Score response:", resp?.slice(0, 300));
                              const parsed = parseAIJson(resp);
                              if (parsed?.scores) {
                                const cleanSummary = { ...parsed, scoredAt: new Date().toISOString() };
                                delete cleanSummary.raw;
                                const updated = maSessions.map(x => x.id === s.id ? { ...x, summary: JSON.stringify(cleanSummary) } : x);
                                saveMaSessions(updated);
                              } else {
                                console.warn("Score failed. Raw:", resp);
                                alert("Scoring failed — check console for details.");
                              }
                            } catch(err) {
                              console.error("Score error:", err);
                              alert("Scoring error: " + err.message);
                            }
                            setRescoringId(null);
                          }} style={{
                            padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                            background: "rgba(192,96,160,0.08)", border: "1px solid rgba(192,96,160,0.25)", color: "#c060a0",
                          }}>Score</button>
                    ) : null}
                  </div>

                  {/* Mark's MA transcript */}
                  <details style={{ marginBottom: 8 }}>
                    <summary style={{ fontSize: 12, color: "#c060a0", cursor: "pointer", fontWeight: 600 }}>Mark's MA analysis</summary>
                    <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 13, color: "#d0d8e0", lineHeight: 1.6, marginTop: 4 }}>
                      {(s.transcript || "No transcript").split("\n").map((line, li) => {
                        const markMatch = line.match(/^(Mark(?:\s*\(trainer\))?)\s*:/);
                        const peerMatch = line.match(/^(Peer|Chuck|Sarah|[A-Z][a-z]+\s*\(peer\))\s*:/);
                        const examinerMatch = line.match(/^(Examiner)\s*:/);
                        const aiMatch = line.match(/^(AI)\s*:/);
                        const sectionMatch = line.match(/^(PEER DIALOG|PRESCRIPTION DELIVER[A-Z]*[^:]*|PRESENTATION TO EXAMINER|EXAMINER Q&A|PRIVATE NOTES|Root cause)\s*:/);
                        if (sectionMatch) return <div key={li} style={{ fontWeight: 700, color: "#7a9ab5", marginTop: 10, marginBottom: 2, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{line}</div>;
                        if (markMatch) return <div key={li} style={{ marginBottom: 4 }}><span style={{ fontWeight: 700, color: SPEAKER.mark.color }}>{markMatch[1]}:</span>{line.slice(markMatch[0].length)}</div>;
                        if (peerMatch) return <div key={li} style={{ marginBottom: 4 }}><span style={{ fontWeight: 700, color: SPEAKER.peer.color }}>{peerMatch[1]}:</span>{line.slice(peerMatch[0].length)}</div>;
                        if (examinerMatch) return <div key={li} style={{ marginBottom: 4 }}><span style={{ fontWeight: 700, color: SPEAKER.examiner.color }}>{examinerMatch[1]}:</span>{line.slice(examinerMatch[0].length)}</div>;
                        if (aiMatch) return <div key={li} style={{ marginBottom: 4 }}><span style={{ fontWeight: 700, color: SPEAKER.ai.color }}>{aiMatch[1]}:</span>{line.slice(aiMatch[0].length)}</div>;
                        return <div key={li}>{line}</div>;
                      })}
                    </div>
                    {s.notes && (
                      <div style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(224,120,48,0.04)", border: "1px solid rgba(224,120,48,0.1)", fontSize: 12, color: "#d0d8e0", lineHeight: 1.5, marginTop: 4 }}>
                        {(() => {
                          const notes = s.notes || "";
                          const videoMatch = notes.match(/Video:\s*(https?:\/\/\S+)/);
                          const skierMatch = notes.match(/Skier:\s*([^|]+)/);
                          const timeMatch = notes.match(/Time:\s*([^|]+)/);
                          if (videoMatch) {
                            return (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                <a href={videoMatch[1].trim()} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, background: "rgba(48,136,204,0.08)", color: "#3088cc", fontSize: 11, textDecoration: "none" }}>▶ Video</a>
                                {skierMatch && <span style={{ fontSize: 11, color: "#7a9ab5" }}>Skier: {skierMatch[1].trim()}</span>}
                                {timeMatch && <span style={{ fontSize: 11, color: "#7a9ab5" }}>Time: {timeMatch[1].trim()}</span>}
                              </div>
                            );
                          }
                          return <div><span style={{ fontSize: 10, fontWeight: 700, color: "#e07830" }}>NOTES: </span>{notes}</div>;
                        })()}
                      </div>
                    )}
                  </details>

                  {/* AI analysis summary */}
                  {(aiScores || s.transcript) && (
                    <details style={{ marginBottom: 8 }}>
                      <summary style={{ fontSize: 12, color: "#a0a0d0", cursor: "pointer", fontWeight: 600 }}>AI analysis</summary>
                      <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(160,160,208,0.04)", marginTop: 4 }}>
                        {aiScores?.scores && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                            {[{ key: "describe", label: "Describe" }, { key: "cause_effect", label: "Cause/Effect" }, { key: "evaluate", label: "Evaluate" }, { key: "prescription", label: "Prescription" }, { key: "biomechanics", label: "Bio/Physics" }, { key: "communication", label: "Comm" }].map(sc => (
                              <div key={sc.key} style={{ textAlign: "center", minWidth: 40 }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(aiScores.scores[sc.key] || 0) }}>{aiScores.scores[sc.key] || "—"}</div>
                                <div style={{ fontSize: 9, color: "#7a9ab5" }}>{sc.label}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {aiScores?.score_rationale && (
                          <details style={{ marginBottom: 8 }}>
                            <summary style={{ fontSize: 10, color: "#7a9ab5", cursor: "pointer" }}>Score rationale</summary>
                            <div style={{ padding: "6px 8px", borderRadius: 4, background: "rgba(255,255,255,0.02)", marginTop: 4 }}>
                              {[{ key: "describe", label: "Describe" }, { key: "cause_effect", label: "Cause/Effect" }, { key: "evaluate", label: "Evaluate" }, { key: "prescription", label: "Prescription" }, { key: "biomechanics", label: "Bio/Physics" }, { key: "communication", label: "Comm" }].map(sc => {
                                const rationale = aiScores.score_rationale[sc.key];
                                if (!rationale) return null;
                                return (
                                  <div key={sc.key} style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor(aiScores.scores?.[sc.key] || 0) }}>{sc.label} ({aiScores.scores?.[sc.key] || "—"}): </span>
                                    <span style={{ fontSize: 11, color: "#b0b8c0", lineHeight: 1.4 }}>{rationale}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        )}
                        {didWell?.length > 0 && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#28a858" }}>WHAT YOU DID WELL: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{didWell.join(" · ")}</span></div>}
                        {opportunity?.length > 0 && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#e07830" }}>OPPORTUNITY TO IMPROVE: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{opportunity.join(" · ")}</span></div>}
                        {aiScores?.key_learning && <div><span style={{ fontSize: 10, fontWeight: 700, color: "#e8a050" }}>KEY FOCUS: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{aiScores.key_learning}</span></div>}
                        {!aiScores?.scores && didWell.length === 0 && opportunity.length === 0 && !aiScores?.key_learning && (
                          <div style={{ fontSize: 12, color: "#4d6888", marginBottom: 4 }}>No analysis yet — hit Rescore below.</div>
                        )}
                        {s.transcript && (
                          rescoringId === s.id
                            ? <div style={{ marginTop: 6, fontSize: 11, color: "#c060a0" }}>Rescoring...</div>
                            : <button onClick={async () => {
                                setRescoringId(s.id);
                                try {
                                  const input = buildScoreInput(s);
                                  const resp = await callClaude([{ role: "user", content: input }], buildScorerPrompt(MA_TREND_SCORER_SYSTEM));
                                  const parsed = parseAIJson(resp);
                                  if (parsed?.scores) {
                                    const cleanSummary = { ...parsed, scoredAt: new Date().toISOString() };
                                    delete cleanSummary.raw;
                                    const updated = maSessions.map(x => x.id === s.id ? { ...x, summary: JSON.stringify(cleanSummary) } : x);
                                    saveMaSessions(updated);
                                  } else {
                                    console.warn("Rescore failed. Raw:", resp);
                                    alert("Rescoring failed — check console for details.");
                                  }
                                } catch(err) {
                                  console.error("Rescore error:", err);
                                  alert("Rescore error: " + err.message);
                                }
                                setRescoringId(null);
                              }} style={{
                                marginTop: 6, padding: "6px 12px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                background: "rgba(192,96,160,0.08)", border: "1px solid rgba(192,96,160,0.2)", color: "#c060a0",
                              }}>Rescore</button>
                        )}
                        {aiScores?.scoredAt && (
                          <div style={{ marginTop: 4, fontSize: 10, color: "#4d6888" }}>Scored: {new Date(aiScores.scoredAt).toLocaleDateString()} {new Date(aiScores.scoredAt).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</div>
                        )}
                        {aiScores?.allAttempts?.length > 1 && (
                          <div style={{ marginTop: 6, fontSize: 11, color: "#7a9ab5" }}>
                            {aiScores.allAttempts.length - 1} revision{aiScores.allAttempts.length > 2 ? "s" : ""} · Best: {aiScores.bestAttempt === 1 ? "initial" : `revision ${aiScores.bestAttempt - 1}`}
                          </div>
                        )}
                      </div>
                    </details>
                  )}

                  {/* Score legend */}
                  {aiScores?.scores && (
                    <div style={{ fontSize: 10, color: "#4d6888", marginBottom: 8 }}>
                      D=Describe · C=Cause/Effect · E=Evaluate · P=Prescription · B=Bio/Physics · Co=Communication · <span style={{ color: "#28a858" }}>4+=pass</span>
                    </div>
                  )}

                  {/* Mentor feedback thread */}
                  {mentorFeedback.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#28a858", marginBottom: 4, textTransform: "uppercase" }}>Mentor feedback</div>
                      {mentorFeedback.map((f, fi) => {
                        const mentor = USERS[f.userId] || { name: f.userId, color: "#7a9ab5" };
                        return (
                          <div key={fi} style={{ display: "flex", gap: 6, marginBottom: 6, padding: "8px 10px", borderRadius: 6, background: `${mentor.color}06`, border: `1px solid ${mentor.color}12` }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: `${mentor.color}20`, border: `1.5px solid ${mentor.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: mentor.color }}>{mentor.name[0]}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: mentor.color }}>{mentor.name}</span>
                                <span style={{ fontSize: 10, color: "#4d6888" }}>{f.timestamp ? new Date(f.timestamp).toLocaleDateString("en", { month: "short", day: "numeric" }) : ""}</span>
                              </div>
                              <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 2 }}>{f.text}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add feedback */}
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    <textarea id={`ma-feedback-${s.id}`} placeholder={isMentor ? "Your feedback on this MA — what would you push on? Where did Mark miss? What's improving? The AI will learn from your comments." : "Add a note or respond to mentor feedback..."} style={{ ...txta, minHeight: 36, flex: 1, fontSize: 12 }} />
                    <button onClick={() => {
                      const el = document.getElementById(`ma-feedback-${s.id}`);
                      const text = el.value.trim();
                      if (!text) return;
                      const updatedSession = {
                        ...s,
                        mentorFeedback: [...(s.mentorFeedback || []), { userId: currentUser.key, text, timestamp: new Date().toISOString() }],
                      };
                      const updatedSessions = maSessions.map(x => x.id === s.id ? updatedSession : x);
                      saveMaSessions(updatedSessions);
                      el.value = "";
                    }} style={{ padding: "6px 12px", borderRadius: 5, fontSize: 12, fontWeight: 700, background: `${currentUser.color}12`, border: `1px solid ${currentUser.color}30`, color: currentUser.color, cursor: "pointer", flexShrink: 0 }}>Post</button>
                  </div>

                  {/* Delete session */}
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)", textAlign: "right" }}>
                    <button onClick={() => {
                      if (confirm("Delete this MA session? This cannot be undone.")) {
                        deleteMaSession(s.id);
                      }
                    }} style={{
                      background: "none", border: "1px solid rgba(224,80,40,0.15)", borderRadius: 4, padding: "4px 10px",
                      color: "#e05028", fontSize: 11, cursor: "pointer",
                    }}>Delete session</button>
                  </div>
                </Card>
              );
            })}
          </>
        )}

        {/* ═══ TIMELINE ═══ */}
        {tab === "timeline" && !isSubView && (() => {
          // Combine all events into one chronological feed
          const events = [];
          entries.forEach(e => events.push({ type: "reflection", date: e.date, data: e }));
          videos.forEach(v => events.push({ type: "video", date: v.date, data: v }));
          maSessions.forEach(m => events.push({ type: "ma", date: m.date, data: m }));
          checkpoints.forEach(c => events.push({ type: "checkpoint", date: c.date, data: c }));
          clinicFeedback.forEach(c => events.push({ type: "clinic", date: c.date, data: c }));
          events.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""));

          const typeColors = { reflection: "#e07830", video: "#3088cc", ma: "#c060a0", checkpoint: "#28a858", clinic: "#e8a050" };
          const typeIcons = { reflection: "📓", video: "🎥", ma: "🧠", checkpoint: "📋", clinic: "🎤" };
          const typeLabels = { reflection: "Reflection", video: "Video", ma: "MA Session", checkpoint: "Checkpoint", clinic: "Clinic" };

          return (
            <>
              <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14, lineHeight: 1.5 }}>
                Everything in one chronological view — reflections, videos, MA sessions, checkpoints, and clinics.
              </div>

              {events.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "50px 20px" }}>
                  <div style={{ fontSize: 40, opacity: 0.4 }}>📅</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>Nothing yet</div>
                </Card>
              ) : events.map((ev, i) => {
                const color = typeColors[ev.type];
                const d = ev.data;
                let title = "";
                let subtitle = "";
                if (ev.type === "reflection") { title = d.whatISaw ? (d.whatISaw.length > 80 ? d.whatISaw.slice(0, 80) + "…" : d.whatISaw) : "Reflection"; subtitle = `${d.context || ""}${d.location ? ` · ${d.location}` : ""}`; }
                else if (ev.type === "video") { title = d.activity || "Video"; subtitle = `${d.conditions || ""}${d.selfScore ? ` · Score: ${d.selfScore}` : ""}`; }
                else if (ev.type === "ma") { title = `MA: ${d.activity || d.who || "Session"}`; subtitle = d.context || ""; }
                else if (ev.type === "checkpoint") { const m = USERS[d.mentorId]; title = `${m?.name || "Mentor"}'s Review`; subtitle = d.whatImSeeing ? d.whatImSeeing.slice(0, 60) + "…" : ""; }
                else if (ev.type === "clinic") { title = d.topic || "Clinic"; subtitle = `${d.audience || ""}${d.duration ? ` · ${d.duration} min` : ""}`; }
                return (
                  <div key={`${ev.type}-${i}`} style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 40 }}>
                      <div style={{ fontSize: 11, color: "#4d6888", fontWeight: 600 }}>{ev.date ? new Date(ev.date + "T12:00:00").toLocaleDateString("en", { month: "short", day: "numeric" }) : ""}</div>
                      <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.06)", marginTop: 4 }} />
                    </div>
                    <Card style={{ flex: 1, borderLeft: `3px solid ${color}`, padding: "10px 12px", marginBottom: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span>{typeIcons[ev.type]}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase" }}>{typeLabels[ev.type]}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#d0d8e0", lineHeight: 1.4 }}>{title}</div>
                      {subtitle && <div style={{ fontSize: 12, color: "#7a9ab5", marginTop: 2 }}>{subtitle}</div>}
                    </Card>
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* ═══ CLINIC FEEDBACK ═══ */}
        {tab === "clinics" && !isSubView && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: "#7a9ab5", lineHeight: 1.5 }}>Track your clinic leading development. Reflect on what worked, what you'd change, and capture participant feedback.</div>
              <button onClick={() => {
                saveClinicFeedback([{ id: uid(), date: today(), topic: "", audience: "", duration: "", selfReflection: "", whatWorked: "", whatIdChange: "", participantFeedback: "", notes: "" }, ...clinicFeedback]);
              }} style={{
                padding: "7px 14px", borderRadius: 6, border: "1px solid rgba(232,160,80,0.4)",
                background: "rgba(232,160,80,0.1)", color: "#e8a050", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0, marginLeft: 10,
              }}>+ Add Clinic</button>
            </div>

            {clinicFeedback.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "50px 20px" }}>
                <div style={{ fontSize: 40, opacity: 0.4 }}>🎤</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#7a9ab5", marginTop: 8 }}>No clinics logged yet</div>
                <div style={{ fontSize: 14, color: "#3a5068", marginTop: 4 }}>After leading a training clinic for instructors, reflect here.</div>
              </Card>
            ) : clinicFeedback.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).map(c => (
              <Card key={c.id} style={{ borderLeft: "3px solid #e8a050" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>DATE</div>
                    <input type="date" value={c.date} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, date: ev.target.value } : x)); }} style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>TOPIC</div>
                    <input value={c.topic} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, topic: ev.target.value } : x)); }} placeholder="e.g., Carved Turns for L2s" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>AUDIENCE</div>
                    <input value={c.audience} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, audience: ev.target.value } : x)); }} placeholder="e.g., 6 L1/L2 instructors" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                  </div>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>DURATION (minutes)</div>
                  <input value={c.duration || ""} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, duration: ev.target.value } : x)); }} placeholder="e.g., 25" style={{ ...inp, fontSize: 12, padding: "4px 6px", maxWidth: 100 }} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>WHAT WORKED</div>
                  <textarea value={c.whatWorked || ""} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, whatWorked: ev.target.value } : x)); }} placeholder="What went well? What did participants respond to?" style={{ ...txta, fontSize: 12, minHeight: 40 }} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>WHAT I'D CHANGE</div>
                  <textarea value={c.whatIdChange || ""} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, whatIdChange: ev.target.value } : x)); }} placeholder="What would you do differently next time?" style={{ ...txta, fontSize: 12, minHeight: 40 }} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>SELF-REFLECTION</div>
                  <textarea value={c.selfReflection || ""} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, selfReflection: ev.target.value } : x)); }} placeholder="How did you address CAP? Did you develop understanding or just give exercises? How did you manage the group dynamics?" style={{ ...txta, fontSize: 12, minHeight: 50 }} />
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>PARTICIPANT FEEDBACK</div>
                  <textarea value={c.participantFeedback || ""} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, participantFeedback: ev.target.value } : x)); }} placeholder="What did participants say? Any direct quotes or observations?" style={{ ...txta, fontSize: 12, minHeight: 40 }} />
                </div>
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: "#7a9ab5", fontWeight: 600, marginBottom: 2 }}>MENTOR NOTES</div>
                  <textarea value={c.notes || ""} onChange={ev => { saveClinicFeedback(clinicFeedback.map(x => x.id === c.id ? { ...x, notes: ev.target.value } : x)); }} placeholder="Mentor feedback on this clinic" style={{ ...txta, fontSize: 12, minHeight: 40 }} />
                </div>
                <button onClick={() => { if (confirm("Delete this clinic?")) deleteClinic(c.id); }} style={{ background: "none", border: "none", color: "#4d6888", fontSize: 11, cursor: "pointer" }}>Delete</button>
              </Card>
            ))}
          </>
        )}

        {/* ═══ SPARRING PARTNER ═══ */}
        {tab === "sparring" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 10, lineHeight: 1.5 }}>
              Practice your thinking. Your sparring partner will push you to go deeper and make connections.
            </div>

            {/* Mode selector */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {Object.entries(SPARRING_MODES).map(([id, mode]) => (
                <button key={id} onClick={() => {
                  if (id !== sparringMode) {
                    setSparringMode(id);
                    setSparringMessages([]);
                    setWrittenMAScenario(null);
                    setWrittenMAResult(null);
                    setWrittenMADialog([]);
                    setWrittenMAPhase("setup");
                    setWrittenMA({ who: "", activity: "", conditions: "", transcript: "", videoUrl: "", videoSkier: "", videoTime: "" });
                    setExamMA({ phase: "setup", videoUrl: "", videoSkier: "", videoTime: "", who: "", activity: "", conditions: "", observations: "", rootCause: "", dialogMessages: [], prescription: "", prescriptionReason: "", prescriptionDialog: [], presentation: "", debriefMessages: [], result: null, attempts: [], attemptNumber: 1 });
                  }
                }} style={{
                  padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: sparringMode === id ? `${mode.color}12` : "rgba(255,255,255,0.02)",
                  border: `1.5px solid ${sparringMode === id ? mode.color : "rgba(255,255,255,0.06)"}`,
                  color: sparringMode === id ? mode.color : "#7a9ab5",
                }}>{mode.icon} {mode.label}</button>
              ))}
            </div>

            <Card style={{ minHeight: 300, display: "flex", flexDirection: "column" }}>
              {/* Mode description */}
              <div style={{
                fontSize: 12, color: SPARRING_MODES[sparringMode].color, marginBottom: 10,
                padding: "6px 10px", borderRadius: 5,
                background: `${SPARRING_MODES[sparringMode].color}08`,
                border: `1px solid ${SPARRING_MODES[sparringMode].color}15`,
              }}>
                {SPARRING_MODES[sparringMode].icon} <strong>{SPARRING_MODES[sparringMode].label}</strong> — {SPARRING_MODES[sparringMode].desc}
              </div>

              {/* Quick start buttons for specific modes */}
              {sparringMessages.length === 0 && (
                <div style={{ marginBottom: 12 }}>
                  {sparringMode === "open" && (
                    <div style={{ textAlign: "center", padding: "20px 16px", color: "#3a5068" }}>
                      <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 6 }}>Try something like:</div>
                      <div style={{ fontSize: 13, color: "#4d6888", lineHeight: 1.8 }}>
                        "I'm leading a clinic tomorrow on carved turns for L2 candidates."<br />
                        "Help me think through a progression for teaching parallel turns."<br />
                        "What should I focus on to improve my own short turns in bumps?"
                      </div>
                    </div>
                  )}
                  {sparringMode === "scenario" && (
                    <button onClick={async () => {
                      setSparringLoading(true);
                      const resp = await callClaude(
                        [{ role: "user", content: "Give me a scenario to analyze. Describe a student skiing in vivid detail — I'll do a blended MA." }],
                        buildSystemPrompt(MA_SCENARIO_SYSTEM)
                      );
                      setSparringMessages([
                        { role: "user", content: "Give me a scenario to analyze." },
                        { role: "assistant", content: resp },
                      ]);
                      setSparringLoading(false);
                    }} disabled={sparringLoading} style={{
                      width: "100%", padding: "14px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: sparringLoading ? "default" : "pointer",
                      background: sparringLoading ? "rgba(255,255,255,0.03)" : "rgba(224,120,48,0.08)",
                      border: "1px solid rgba(224,120,48,0.25)", color: sparringLoading ? "#4d6888" : "#e07830",
                    }}>{sparringLoading ? "Generating scenario..." : "🎯 Give Me a Scenario"}</button>
                  )}
                  {sparringMode === "reverse" && (
                    <button onClick={async () => {
                      setSparringLoading(true);
                      const resp = await callClaude(
                        [{ role: "user", content: "Give me a reverse MA drill. Describe what a trainer did — the exercise, terrain, and progression — and I'll work backwards to figure out what they probably saw." }],
                        buildSystemPrompt(MA_REVERSE_SYSTEM)
                      );
                      setSparringMessages([
                        { role: "user", content: "Give me a reverse MA drill." },
                        { role: "assistant", content: resp },
                      ]);
                      setSparringLoading(false);
                    }} disabled={sparringLoading} style={{
                      width: "100%", padding: "14px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: sparringLoading ? "default" : "pointer",
                      background: sparringLoading ? "rgba(255,255,255,0.03)" : "rgba(40,168,88,0.08)",
                      border: "1px solid rgba(40,168,88,0.25)", color: sparringLoading ? "#4d6888" : "#28a858",
                    }}>{sparringLoading ? "Generating..." : "🔄 Give Me a Prescription to Diagnose"}</button>
                  )}
                  {sparringMode === "compare" && (
                    <button onClick={async () => {
                      setSparringLoading(true);
                      const resp = await callClaude(
                        [{ role: "user", content: "Give me a compare and contrast drill. Describe two students with a similar symptom but different root causes. I'll analyze both and try to differentiate." }],
                        buildSystemPrompt(MA_COMPARE_SYSTEM)
                      );
                      setSparringMessages([
                        { role: "user", content: "Give me two students to compare." },
                        { role: "assistant", content: resp },
                      ]);
                      setSparringLoading(false);
                    }} disabled={sparringLoading} style={{
                      width: "100%", padding: "14px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: sparringLoading ? "default" : "pointer",
                      background: sparringLoading ? "rgba(255,255,255,0.03)" : "rgba(48,136,204,0.08)",
                      border: "1px solid rgba(48,136,204,0.25)", color: sparringLoading ? "#4d6888" : "#3088cc",
                    }}>{sparringLoading ? "Generating..." : "⚖️ Give Me Two Students to Compare"}</button>
                  )}
                  {sparringMode === "video" && (
                    <div style={{ textAlign: "center", padding: "20px 16px", color: "#3a5068" }}>
                      <div style={{ fontSize: 14, color: "#e8a050", marginBottom: 6 }}>🎥 Video Analysis Mode</div>
                      <div style={{ fontSize: 13, color: "#4d6888", lineHeight: 1.8 }}>
                        Watch your video, then describe what you see below.<br />
                        Include: what the student/skier is doing, the terrain, the conditions.<br />
                        Your sparring partner will challenge the depth of your analysis.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Written MA Practice — full exam simulation */}
              {sparringMode === "writtenma" ? (
                <div>
                  {/* Phase 1: Setup — choose video/scenario/free write */}
                  {writtenMAPhase === "setup" && (
                    <>
                      {/* Video link */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={lbl}>Video link (optional)</label>
                        <input value={writtenMA.videoUrl || ""} onChange={ev => setWrittenMA(p => ({ ...p, videoUrl: ev.target.value }))} placeholder="Paste a YouTube or Google Drive link to analyze" style={{ ...inp, fontSize: 13 }} />
                      </div>
                      {/* YouTube thumbnail preview */}
                      {(() => {
                        const ytMatch = (writtenMA.videoUrl || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
                        return ytMatch ? (
                          <a href={writtenMA.videoUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 10 }}>
                            <img src={`https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`} alt="" style={{ width: "100%", maxWidth: 320, borderRadius: 8, display: "block" }} />
                          </a>
                        ) : writtenMA.videoUrl ? (
                          <a href={writtenMA.videoUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", marginBottom: 10, borderRadius: 6, background: "rgba(48,136,204,0.06)", border: "1px solid rgba(48,136,204,0.15)", color: "#3088cc", fontSize: 13, textDecoration: "none" }}>▶ Open video</a>
                        ) : null;
                      })()}

                      {writtenMA.videoUrl && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                          <div><label style={lbl}>Skier description</label><input value={writtenMA.videoSkier || ""} onChange={ev => setWrittenMA(p => ({ ...p, videoSkier: ev.target.value }))} placeholder="e.g., Red jacket, second skier" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                          <div><label style={lbl}>Video time</label><input value={writtenMA.videoTime || ""} onChange={ev => setWrittenMA(p => ({ ...p, videoTime: ev.target.value }))} placeholder="e.g., 0:32 - 1:15" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        <div><label style={lbl}>Who</label><input value={writtenMA.who} onChange={ev => setWrittenMA(p => ({ ...p, who: ev.target.value }))} placeholder="e.g., L2 candidate" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                        <div><label style={lbl}>Activity</label><input value={writtenMA.activity} onChange={ev => setWrittenMA(p => ({ ...p, activity: ev.target.value }))} placeholder="e.g., Dynamic Short Turns" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                        <div><label style={lbl}>Conditions</label><input value={writtenMA.conditions} onChange={ev => setWrittenMA(p => ({ ...p, conditions: ev.target.value }))} placeholder="e.g., Groomed blue, firm" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setWrittenMAPhase("write")} style={{
                          flex: 1, padding: "12px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                          background: "rgba(160,160,208,0.08)", border: "1px solid rgba(160,160,208,0.25)", color: "#a0a0d0",
                        }}>📝 Write my MA</button>
                        <button onClick={async () => {
                          setWrittenMALoading(true);
                          const resp = await callClaude(
                            [{ role: "user", content: "Generate a detailed skiing scenario for me to analyze. Describe an instructor — their cert level, the terrain, conditions, what their skiing looks like. Give me enough detail for a blended MA. Don't include any analysis — just the observation." }],
                            buildSystemPrompt(MA_SCENARIO_SYSTEM)
                          );
                          setWrittenMAScenario(resp);
                          setWrittenMAPhase("write");
                          setWrittenMALoading(false);
                        }} disabled={writtenMALoading} style={{
                          flex: 1, padding: "12px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: writtenMALoading ? "default" : "pointer",
                          background: writtenMALoading ? "rgba(255,255,255,0.03)" : "rgba(224,120,48,0.08)",
                          border: "1px solid rgba(224,120,48,0.25)", color: writtenMALoading ? "#4d6888" : "#e07830",
                        }}>{writtenMALoading ? "Generating..." : "🎯 Generate a scenario"}</button>
                      </div>
                    </>
                  )}

                  {/* Phase 2: Write — MA text area */}
                  {writtenMAPhase === "write" && (
                    <>
                      {writtenMAScenario && (
                        <div style={{ padding: "10px 12px", borderRadius: 7, background: "rgba(224,120,48,0.04)", border: "1px solid rgba(224,120,48,0.1)", marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#e07830", marginBottom: 4 }}>SCENARIO</div>
                          <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{writtenMAScenario}</div>
                        </div>
                      )}
                      {writtenMA.videoUrl && (
                        <a href={writtenMA.videoUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", marginBottom: 8, borderRadius: 4, background: "rgba(48,136,204,0.06)", color: "#3088cc", fontSize: 12, textDecoration: "none" }}>▶ Rewatch video</a>
                      )}
                      <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 4 }}>{writtenMA.who && `Analyzing: ${writtenMA.who}`}{writtenMA.activity && ` · ${writtenMA.activity}`}{writtenMA.conditions && ` · ${writtenMA.conditions}`}</div>

                      <label style={lbl}>Your MA — write your full analysis</label>
                      <textarea value={writtenMA.transcript} onChange={ev => setWrittenMA(p => ({ ...p, transcript: ev.target.value }))} placeholder={"Write your complete MA:\n\n• What did you observe? (by turn phase)\n• What skill interactions do you see?\n• What's the root cause?\n• What would you prescribe? Why?\n• What terrain? Why?"} style={{ ...txta, minHeight: 150, marginBottom: 8, fontSize: 14, lineHeight: 1.7 }} />

                      <button onClick={async () => {
                        if (!writtenMA.transcript.trim()) return;
                        setWrittenMALoading(true);
                        // Send to AI for follow-up questions (examiner dialog)
                        const input = `Mark just delivered this MA:\n\n${writtenMA.transcript}\n\n${writtenMAScenario ? `The scenario was: ${writtenMAScenario.slice(0, 300)}` : `He was analyzing: ${writtenMA.who || "unknown"} doing ${writtenMA.activity || "unknown"} in ${writtenMA.conditions || "unknown conditions"}`}\n\nAsk your first follow-up question.`;
                        const resp = await callClaude([{ role: "user", content: input }], buildSystemPrompt(MA_DIALOG_SYSTEM));
                        setWrittenMADialog([{ role: "assistant", content: resp }]);
                        setWrittenMAPhase("dialog");
                        setWrittenMALoading(false);
                      }} disabled={writtenMALoading || !writtenMA.transcript.trim()} style={{
                        width: "100%", padding: "12px", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: writtenMALoading ? "default" : "pointer",
                        background: writtenMALoading ? "rgba(255,255,255,0.03)" : "rgba(160,160,208,0.08)",
                        border: "1px solid rgba(160,160,208,0.3)", color: writtenMALoading ? "#4d6888" : "#a0a0d0",
                      }}>{writtenMALoading ? "Preparing follow-up..." : "Submit MA → Examiner Q&A"}</button>
                    </>
                  )}

                  {/* Phase 3: Dialog — examiner follow-up questions */}
                  {writtenMAPhase === "dialog" && (
                    <>
                      {/* Show original MA collapsed */}
                      <details style={{ marginBottom: 10 }}>
                        <summary style={{ fontSize: 12, color: "#7a9ab5", cursor: "pointer" }}>Your MA (tap to review)</summary>
                        <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", fontSize: 13, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 4 }}>{writtenMA.transcript}</div>
                      </details>

                      {/* Dialog messages */}
                      <div style={{ marginBottom: 10, maxHeight: 300, overflowY: "auto" }}>
                        {writtenMADialog.map((m, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
                            <div style={{
                              maxWidth: "85%", padding: "10px 14px", borderRadius: 10,
                              background: m.role === "user" ? "rgba(160,160,208,0.08)" : "rgba(224,120,48,0.06)",
                              border: `1px solid ${m.role === "user" ? "rgba(160,160,208,0.15)" : "rgba(224,120,48,0.12)"}`,
                            }}>
                              <div style={{ fontSize: 14, color: "#d0d8e0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
                            </div>
                          </div>
                        ))}
                        {writtenMALoading && <div style={{ fontSize: 13, color: "#a0a0d0", padding: "6px" }}>Thinking...</div>}
                      </div>

                      {/* Response input */}
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                        <textarea id="ma-dialog-input" placeholder="Answer the examiner's question..." style={{ ...txta, minHeight: 40, flex: 1, fontSize: 14 }}
                          onKeyDown={async ev => {
                            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                              const text = ev.target.value.trim();
                              if (!text || writtenMALoading) return;
                              const newDialog = [...writtenMADialog, { role: "user", content: text }];
                              setWrittenMADialog(newDialog);
                              ev.target.value = "";
                              setWrittenMALoading(true);
                              const fullMessages = [{ role: "user", content: `Mark's initial MA:\n${writtenMA.transcript}` }, ...newDialog];
                              const resp = await callClaude(fullMessages, buildSystemPrompt(MA_DIALOG_SYSTEM));
                              setWrittenMADialog([...newDialog, { role: "assistant", content: resp }]);
                              setWrittenMALoading(false);
                            }
                          }}
                        />
                        <button onClick={async () => {
                          const el = document.getElementById("ma-dialog-input");
                          const text = el.value.trim();
                          if (!text || writtenMALoading) return;
                          const newDialog = [...writtenMADialog, { role: "user", content: text }];
                          setWrittenMADialog(newDialog);
                          el.value = "";
                          setWrittenMALoading(true);
                          const fullMessages = [{ role: "user", content: `Mark's initial MA:\n${writtenMA.transcript}` }, ...newDialog];
                          const resp = await callClaude(fullMessages, buildSystemPrompt(MA_DIALOG_SYSTEM));
                          setWrittenMADialog([...newDialog, { role: "assistant", content: resp }]);
                          setWrittenMALoading(false);
                        }} disabled={writtenMALoading} style={{
                          padding: "8px 14px", borderRadius: 6, fontSize: 14, fontWeight: 700,
                          background: "rgba(160,160,208,0.08)", border: "1px solid rgba(160,160,208,0.25)", color: "#a0a0d0",
                          cursor: writtenMALoading ? "default" : "pointer", flexShrink: 0,
                        }}>Reply</button>
                      </div>
                      <div style={{ fontSize: 10, color: "#3a5068", marginBottom: 8 }}>Ctrl+Enter to send</div>

                      {/* Score button — available after at least 1 exchange */}
                      {writtenMADialog.filter(m => m.role === "user").length >= 1 && (
                        <button onClick={async () => {
                          setWrittenMALoading(true);
                          // Build scoring input with dialog + past sessions for comparison
                          const dialogText = writtenMADialog.map(m => `${m.role === "user" ? "Mark" : "Examiner"}: ${m.content}`).join("\n");
                          const pastSessions = maSessions.filter(s => s.summary).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).slice(0, 3);
                          let pastContext = "";
                          if (pastSessions.length > 0) {
                            pastContext = "\n\nPREVIOUS SESSIONS FOR COMPARISON:\n";
                            pastSessions.forEach(s => {
                              try {
                                const p = parseSummary(s.summary);
                                if (p?.scores) pastContext += `[${s.date} · ${s.activity}] Scores: D=${p.scores.describe} C/E=${p.scores.cause_effect} E=${p.scores.evaluate} P=${p.scores.prescription} B=${p.scores.biomechanics} C=${p.scores.communication}. Gaps: ${(p.gaps||[]).join(", ")}\n`;
                              } catch(e) {}
                            });
                          }

                          const input = `INITIAL MA:\n${writtenMA.transcript}\n\nEXAMINER DIALOG:\n${dialogText}${pastContext}\n\nContext: ${writtenMA.who || ""}, ${writtenMA.activity || ""}, ${writtenMA.conditions || ""}\n\nRESPOND ONLY IN JSON (no markdown, no backticks). CHECK FROM THE TOP DOWN starting at 5: Does candidate extend beyond expected with autonomous skill? If yes, 5. Then check 4: appears regularly at AT standard? If yes, 4. If something missing, verify 4-level gap not 5-level. Only 3 if genuine 4-level element absent.\n{"did_well":["list"],"opportunity":["next focus"],"score_rationale":{"describe":"evidence","cause_effect":"evidence","evaluate":"evidence","prescription":"evidence","biomechanics":"evidence","communication":"evidence"},"scores":{"describe":0,"cause_effect":0,"evaluate":0,"prescription":0,"biomechanics":0,"communication":0},"key_learning":"text"}`;
                          const resp = await callClaude([{ role: "user", content: input }], buildScorerPrompt(MA_TREND_SCORER_SYSTEM));
                          const parsed = parseAIJson(resp);
                          setWrittenMAResult(parsed);
                          setWrittenMAPhase("scored");

                          // Auto-save to MA sessions
                          const newSession = {
                            id: uid(), date: today(),
                            type: "written_ma",
                            context: writtenMAScenario ? "AI scenario + examiner Q&A" : "Free write + examiner Q&A",
                            who: writtenMA.who, activity: writtenMA.activity, conditions: writtenMA.conditions || "",
                            transcript: writtenMA.transcript + "\n\n--- EXAMINER Q&A ---\n" + dialogText,
                            sections: {
                              written_analysis: writtenMA.transcript || "",
                              examiner_qa: dialogText,
                            },
                            notes: writtenMA.videoUrl ? `Video: ${writtenMA.videoUrl}${writtenMA.videoSkier ? ` | Skier: ${writtenMA.videoSkier}` : ""}${writtenMA.videoTime ? ` | Time: ${writtenMA.videoTime}` : ""}` : "",
                            summary: typeof parsed === "object" ? JSON.stringify(parsed) : parsed,
                            videoUrl: writtenMA.videoUrl || "",
                            videoSkier: writtenMA.videoSkier || "",
                            videoTime: writtenMA.videoTime || "",
                          };
                          saveMaSessions([newSession, ...maSessions]);
                          setWrittenMALoading(false);
                        }} disabled={writtenMALoading} style={{
                          width: "100%", padding: "12px", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: writtenMALoading ? "default" : "pointer",
                          background: writtenMALoading ? "rgba(255,255,255,0.03)" : "linear-gradient(135deg, rgba(160,160,208,0.12), rgba(224,120,48,0.08))",
                          border: "1px solid rgba(160,160,208,0.3)", color: writtenMALoading ? "#4d6888" : "#e8a050",
                        }}>{writtenMALoading ? "Scoring full session..." : "Score Full Session + Compare to Past"}</button>
                      )}
                    </>
                  )}

                  {/* Phase 4: Scored — results with trends */}
                  {writtenMAPhase === "scored" && writtenMAResult && (() => {
                    const p = typeof writtenMAResult === "object" ? writtenMAResult : null;
                    const hasScores = p?.scores;
                    const scoreColor = (v) => v >= 4 ? "#28a858" : v >= 3 ? "#e07830" : "#e05028";
                    const didWell = p?.did_well || p?.strengths || [];
                    const opp = p?.opportunity || p?.gaps || [];
                    return (
                      <div style={{ padding: "14px", borderRadius: 8, background: "rgba(160,160,208,0.04)", border: "1px solid rgba(160,160,208,0.1)" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#a0a0d0", marginBottom: 10 }}>AT SCORECARD — {today()}</div>
                        {hasScores ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                            {[{ key: "describe", label: "Describe" }, { key: "cause_effect", label: "Cause/Effect" }, { key: "evaluate", label: "Evaluate" }, { key: "prescription", label: "Prescription" }, { key: "biomechanics", label: "Bio/Physics" }, { key: "communication", label: "Comm" }].map(sc => (
                              <div key={sc.key} style={{ textAlign: "center", minWidth: 50 }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(p.scores[sc.key] || 0) }}>{p.scores[sc.key] || "—"}</div>
                                <div style={{ fontSize: 9, color: "#7a9ab5", fontWeight: 600 }}>{sc.label}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 10 }}>
                            <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {p?.raw || (typeof writtenMAResult === "string" ? writtenMAResult : JSON.stringify(writtenMAResult, null, 2))}
                            </div>
                          </div>
                        )}
                        {didWell.length > 0 && <div style={{ marginBottom: 6, padding: "6px 8px", borderRadius: 4, background: "rgba(40,168,88,0.06)", border: "1px solid rgba(40,168,88,0.12)" }}><span style={{ fontSize: 10, fontWeight: 700, color: "#28a858" }}>WHAT YOU DID WELL: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{didWell.join(" · ")}</span></div>}
                        {opp.length > 0 && <div style={{ marginBottom: 6, padding: "6px 8px", borderRadius: 4, background: "rgba(224,120,48,0.06)", border: "1px solid rgba(224,120,48,0.12)" }}><span style={{ fontSize: 10, fontWeight: 700, color: "#e07830" }}>OPPORTUNITY TO IMPROVE: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{opp.join(" · ")}</span></div>}
                        {p?.improvements?.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#3088cc" }}>IMPROVED VS PREVIOUS: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{p.improvements.join(" · ")}</span></div>}
                        {p?.key_learning && <div style={{ padding: "8px 10px", borderRadius: 5, background: "rgba(224,120,48,0.06)", border: "1px solid rgba(224,120,48,0.15)", marginTop: 8 }}><span style={{ fontSize: 11, fontWeight: 700, color: "#e8a050" }}>KEY FOCUS: </span><span style={{ fontSize: 13, color: "#d0d8e0" }}>{p.key_learning}</span></div>}
                        <div style={{ fontSize: 10, color: "#28a858", marginTop: 10 }}>Saved to MA Sessions · Feeds into Growth matrix</div>

                        <button onClick={() => {
                          setWrittenMAPhase("setup");
                          setWrittenMAScenario(null);
                          setWrittenMAResult(null);
                          setWrittenMADialog([]);
                          setWrittenMA({ who: "", activity: "", conditions: "", transcript: "", videoUrl: "", videoSkier: "", videoTime: "" });
                        }} style={{
                          marginTop: 10, width: "100%", padding: "10px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                          background: "rgba(160,160,208,0.08)", border: "1px solid rgba(160,160,208,0.2)", color: "#a0a0d0",
                        }}>Start New MA Practice</button>
                      </div>
                    );
                  })()}
                </div>
              ) : sparringMode === "atexam" ? (
                <div>
                  {/* AT MA EXAM — Phase 1: Setup */}
                  {examMA.phase === "setup" && (
                    <>
                      <div style={{ fontSize: 13, color: "#d06060", fontWeight: 600, marginBottom: 8 }}>Step 1: Set up your observation</div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={lbl}>Video link</label>
                        <input value={examMA.videoUrl} onChange={ev => setExamMA(p => ({ ...p, videoUrl: ev.target.value }))} placeholder="YouTube or Google Drive link to the skiing you'll analyze" style={{ ...inp, fontSize: 13 }} />
                      </div>
                      {examMA.videoUrl && (
                        <div style={{ marginBottom: 8 }}>
                          <label style={lbl}>Video time range</label>
                          <input value={examMA.videoTime || ""} onChange={ev => setExamMA(p => ({ ...p, videoTime: ev.target.value }))} placeholder="e.g., 0:32 - 1:15" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                        </div>
                      )}
                      {(() => { const yt = (examMA.videoUrl || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/); return yt ? <a href={examMA.videoUrl} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: 8 }}><img src={`https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg`} alt="" style={{ width: "100%", maxWidth: 320, borderRadius: 8 }} /></a> : null; })()}
                      <div style={{ marginBottom: 8 }}>
                        <label style={lbl}>Skier description</label>
                        <input value={examMA.videoSkier || ""} onChange={ev => setExamMA(p => ({ ...p, videoSkier: ev.target.value }))} placeholder="e.g., Red jacket, second skier from left" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        <div><label style={lbl}>Fellow candidate</label>
                          <select value={examMA.who} onChange={ev => setExamMA(p => ({ ...p, who: ev.target.value }))} style={{ ...inp, fontSize: 12, padding: "4px 6px" }}>
                            <option value="">Select level...</option>
                            <option value="Weak L3 candidate">Weak L3</option>
                            <option value="Solid L3 candidate">Solid L3</option>
                            <option value="Strong L3 candidate">Strong L3</option>
                            <option value="Advanced AT candidate">Advanced AT candidate</option>
                          </select>
                        </div>
                        <div><label style={lbl}>Activity</label><input value={examMA.activity} onChange={ev => setExamMA(p => ({ ...p, activity: ev.target.value }))} placeholder="e.g., Dynamic Short Turns" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                        <div><label style={lbl}>Conditions</label><input value={examMA.conditions} onChange={ev => setExamMA(p => ({ ...p, conditions: ev.target.value }))} placeholder="e.g., Groomed blue, firm" style={{ ...inp, fontSize: 12, padding: "4px 6px" }} /></div>
                      </div>
                      <button onClick={() => setExamMA(p => ({ ...p, phase: "observe" }))} disabled={!examMA.who || !examMA.activity} style={{
                        width: "100%", padding: "12px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: examMA.who && examMA.activity ? "pointer" : "default",
                        background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.25)", color: examMA.who && examMA.activity ? "#d06060" : "#4d6888",
                      }}>Start Observation →</button>
                    </>
                  )}

                  {/* Phase 2: Observe — write what you see */}
                  {examMA.phase === "observe" && (
                    <>
                      <div style={{ fontSize: 13, color: "#d06060", fontWeight: 600, marginBottom: 8 }}>Step 2: What do you observe?</div>
                      {examMA.videoUrl && <a href={examMA.videoUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", marginBottom: 8, borderRadius: 4, background: "rgba(48,136,204,0.06)", color: "#3088cc", fontSize: 12, textDecoration: "none" }}>▶ Watch video</a>}
                      <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 6 }}>Analyzing: {examMA.who} · {examMA.activity} · {examMA.conditions}</div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={lbl}>What do you see? (describe by turn phase)</label>
                        <textarea value={examMA.observations} onChange={ev => setExamMA(p => ({ ...p, observations: ev.target.value }))} placeholder="Describe what you observe — ski performance, body performance, organized by turn phase (transition, above fall line, at fall line, below fall line)..." style={{ ...txta, minHeight: 100, fontSize: 14, lineHeight: 1.7 }} />
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={lbl}>What is the root cause?</label>
                        <textarea value={examMA.rootCause} onChange={ev => setExamMA(p => ({ ...p, rootCause: ev.target.value }))} placeholder="What's the primary skill breakdown? What cause-effect chain do you see? Which skill is driving the issue?" style={{ ...txta, minHeight: 60, fontSize: 14, lineHeight: 1.7 }} />
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setExamMA(p => ({ ...p, phase: "dialog" }))} style={{
                          flex: 1, padding: "12px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                          background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.25)", color: "#d06060",
                        }}>{examMA.observations.trim() ? "Begin Peer Dialog →" : "Skip Notes → Start Dialog"}</button>
                      </div>
                      {!examMA.observations.trim() && (
                        <div style={{ fontSize: 10, color: "#4d6888", marginTop: 4, textAlign: "center" }}>Notes are optional — you can go straight to dialog if your observations are clear</div>
                      )}
                    </>
                  )}

                  {/* Phase 3: Peer-to-peer dialog */}
                  {examMA.phase === "dialog" && (
                    <>
                      <div style={{ fontSize: 13, color: "#d06060", fontWeight: 600, marginBottom: 4 }}>Step 3: Peer-to-peer dialog (~3 questions)</div>
                      <div style={{ fontSize: 11, color: "#7a9ab5", marginBottom: 8 }}>Ask the instructor about their intent, fundamentals, tactics, ski performance, and outcome. They'll respond as a real {examMA.who} would.</div>

                      <details style={{ marginBottom: 6 }}><summary style={{ fontSize: 11, color: "#4d6888", cursor: "pointer" }}>Your observations (review)</summary><div style={{ padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.02)", fontSize: 12, color: "#d0d8e0", whiteSpace: "pre-wrap", marginTop: 4 }}>{examMA.observations}{examMA.rootCause ? `\n\nRoot cause: ${examMA.rootCause}` : ""}</div></details>

                      <div style={{ marginBottom: 8, maxHeight: 250, overflowY: "auto" }}>
                        {examMA.dialogMessages.map((m, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
                            <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: 10, background: m.role === "user" ? "rgba(208,96,96,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${m.role === "user" ? "rgba(208,96,96,0.15)" : "rgba(255,255,255,0.06)"}` }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: m.role === "user" ? SPEAKER.mark.color : SPEAKER.peer.color, marginBottom: 2 }}>{m.role === "user" ? "Mark (trainer)" : `${examMA.who || "Peer"}`}</div>
                              <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
                            </div>
                          </div>
                        ))}
                        {examMALoading && <div style={{ fontSize: 12, color: "#7a9ab5", padding: "4px" }}>Peer is thinking...</div>}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                        <textarea id="exam-dialog-input" placeholder="Ask the instructor a question about their intent, fundamentals, tactics, or ski performance..." style={{ ...txta, minHeight: 36, flex: 1, fontSize: 13 }}
                          onKeyDown={async ev => {
                            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                              const text = ev.target.value.trim();
                              if (!text || examMALoading) return;
                              const newMsgs = [...examMA.dialogMessages, { role: "user", content: text }];
                              setExamMA(p => ({ ...p, dialogMessages: newMsgs }));
                              ev.target.value = "";
                              setExamMALoading(true);
                              const context = `You are a fellow AT candidate (${examMA.who}) who just performed ${examMA.activity} on ${examMA.conditions} during an AT assessment. You are L3 certified or above. The trainer (another AT candidate) observed you and now has questions. You understand skiing terminology and can discuss technique — but your level of self-awareness and precision varies based on whether you are a weak L3, solid L3, strong L3, or advanced AT candidate.`;
                              const msgs = [{ role: "user", content: context }, ...newMsgs];
                              const resp = await callClaude(msgs, buildSystemPrompt(MA_PEER_DIALOG_SYSTEM));
                              setExamMA(p => ({ ...p, dialogMessages: [...newMsgs, { role: "assistant", content: resp }] }));
                              setExamMALoading(false);
                            }
                          }}
                        />
                        <button onClick={async () => {
                          const el = document.getElementById("exam-dialog-input");
                          const text = el.value.trim();
                          if (!text || examMALoading) return;
                          const newMsgs = [...examMA.dialogMessages, { role: "user", content: text }];
                          setExamMA(p => ({ ...p, dialogMessages: newMsgs }));
                          el.value = "";
                          setExamMALoading(true);
                          const context = `You are a fellow AT candidate (${examMA.who}) who just performed ${examMA.activity} on ${examMA.conditions} during an AT assessment. You are L3 certified or above. The trainer (another AT candidate) observed you and now has questions. You understand skiing terminology and can discuss technique — but your level of self-awareness and precision varies based on whether you are a weak L3, solid L3, strong L3, or advanced AT candidate.`;
                          const msgs = [{ role: "user", content: context }, ...newMsgs];
                          const resp = await callClaude(msgs, buildSystemPrompt(MA_PEER_DIALOG_SYSTEM));
                          setExamMA(p => ({ ...p, dialogMessages: [...newMsgs, { role: "assistant", content: resp }] }));
                          setExamMALoading(false);
                        }} disabled={examMALoading} style={{
                          padding: "6px 12px", borderRadius: 5, fontSize: 13, fontWeight: 700,
                          background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.2)", color: "#d06060", cursor: examMALoading ? "default" : "pointer", flexShrink: 0,
                        }}>Ask</button>
                      </div>
                      <div style={{ fontSize: 10, color: "#3a5068", marginBottom: 8 }}>Ctrl+Enter to send · {examMA.dialogMessages.filter(m => m.role === "user").length}/3 questions asked</div>

                      {examMA.dialogMessages.filter(m => m.role === "user").length >= 1 && (
                        <button onClick={() => setExamMA(p => ({ ...p, phase: "prescribe" }))} style={{
                          width: "100%", padding: "10px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                          background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.25)", color: "#d06060",
                        }}>Move to Prescription →</button>
                      )}
                    </>
                  )}

                  {/* Phase 4: Prescription — delivered as dialog with peer */}
                  {examMA.phase === "prescribe" && (
                    <>
                      <div style={{ fontSize: 13, color: "#d06060", fontWeight: 600, marginBottom: 4 }}>Step 4: Prescribe to the subject</div>
                      <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 8, lineHeight: 1.5 }}>
                        Deliver your prescription as you would to the instructor. Include the IDP task, variations, terrain, and connect it to their stated intent. This is NOT a coaching moment — but they need to understand WHY this task is relevant to what they're working on.
                      </div>

                      <details style={{ marginBottom: 6 }}><summary style={{ fontSize: 11, color: "#4d6888", cursor: "pointer" }}>Previous dialog (review)</summary><div style={{ padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.02)", fontSize: 12, color: "#d0d8e0", maxHeight: 150, overflowY: "auto", marginTop: 4 }}>{examMA.dialogMessages.map((m, i) => <div key={i} style={{ marginBottom: 4 }}><span style={{ fontWeight: 600, color: m.role === "user" ? SPEAKER.mark.color : SPEAKER.peer.color }}>{m.role === "user" ? "Mark: " : "Peer: "}</span>{m.content}</div>)}</div></details>

                      {/* Prescription dialog messages */}
                      <div style={{ marginBottom: 8, maxHeight: 250, overflowY: "auto" }}>
                        {(examMA.prescriptionDialog || []).map((m, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
                            <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: 10, background: m.role === "user" ? "rgba(208,96,96,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${m.role === "user" ? "rgba(208,96,96,0.15)" : "rgba(255,255,255,0.06)"}` }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: m.role === "user" ? SPEAKER.mark.color : SPEAKER.peer.color, marginBottom: 2 }}>{m.role === "user" ? "Mark (trainer)" : `${examMA.who || "Peer"}`}</div>
                              <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
                            </div>
                          </div>
                        ))}
                        {examMALoading && <div style={{ fontSize: 12, color: "#7a9ab5", padding: "4px" }}>Peer is responding...</div>}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                        <textarea id="exam-prescribe-input" placeholder={(examMA.prescriptionDialog || []).length === 0
                          ? "Deliver your prescription: IDP task, variations, terrain, and how it connects to their focus..."
                          : "Continue the conversation — respond to the peer's question..."
                        } style={{ ...txta, minHeight: 36, flex: 1, fontSize: 13 }}
                          onKeyDown={async ev => {
                            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                              const text = ev.target.value.trim();
                              if (!text || examMALoading) return;
                              const newMsgs = [...(examMA.prescriptionDialog || []), { role: "user", content: text }];
                              setExamMA(p => ({ ...p, prescriptionDialog: newMsgs, prescription: newMsgs.filter(m => m.role === "user").map(m => m.content).join("\n\n") }));
                              ev.target.value = "";
                              setExamMALoading(true);
                              const prevDialog = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                              const context = `You are a fellow AT candidate (${examMA.who}) who just performed ${examMA.activity} on ${examMA.conditions} during an AT assessment. You are L3 certified or above. You had a dialog with the trainer (Mark, another AT candidate) about your skiing. Now Mark is delivering a prescription — telling you what to work on and why.\n\nPrevious dialog:\n${prevDialog}\n\nRespond as the peer receiving this prescription. You might:\n- Acknowledge and show you understand the connection to your focus\n- Ask a clarifying question: "Why pivot slips specifically? How does that help my steering?"\n- Express uncertainty: "I'm not sure I see how that connects to what I was working on"\n- Push back if something doesn't make sense\nONE sentence. No preamble. Natural. As an L3+ instructor you understand terminology.`;
                              const msgs = [{ role: "user", content: context }, ...newMsgs];
                              const resp = await callClaude(msgs, buildSystemPrompt(MA_PEER_DIALOG_SYSTEM));
                              setExamMA(p => ({ ...p, prescriptionDialog: [...newMsgs, { role: "assistant", content: resp }] }));
                              setExamMALoading(false);
                            }
                          }}
                        />
                        <button onClick={async () => {
                          const el = document.getElementById("exam-prescribe-input");
                          const text = el.value.trim();
                          if (!text || examMALoading) return;
                          const newMsgs = [...(examMA.prescriptionDialog || []), { role: "user", content: text }];
                          setExamMA(p => ({ ...p, prescriptionDialog: newMsgs, prescription: newMsgs.filter(m => m.role === "user").map(m => m.content).join("\n\n") }));
                          el.value = "";
                          setExamMALoading(true);
                          const prevDialog = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                          const context = `You are a fellow AT candidate (${examMA.who}) who just performed ${examMA.activity} on ${examMA.conditions} during an AT assessment. You are L3 certified or above. You had a dialog with the trainer (Mark, another AT candidate) about your skiing. Now Mark is delivering a prescription — telling you what to work on and why.\n\nPrevious dialog:\n${prevDialog}\n\nRespond as the peer receiving this prescription. You might:\n- Acknowledge and show you understand the connection to your focus\n- Ask a clarifying question: "Why pivot slips specifically? How does that help my steering?"\n- Express uncertainty: "I'm not sure I see how that connects to what I was working on"\n- Push back if something doesn't make sense\nONE sentence. No preamble. Natural. As an L3+ instructor you understand terminology.`;
                          const msgs = [{ role: "user", content: context }, ...newMsgs];
                          const resp = await callClaude(msgs, buildSystemPrompt(MA_PEER_DIALOG_SYSTEM));
                          setExamMA(p => ({ ...p, prescriptionDialog: [...newMsgs, { role: "assistant", content: resp }] }));
                          setExamMALoading(false);
                        }} disabled={examMALoading} style={{
                          padding: "6px 12px", borderRadius: 5, fontSize: 13, fontWeight: 700,
                          background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.2)", color: "#d06060", cursor: examMALoading ? "default" : "pointer", flexShrink: 0,
                        }}>Send</button>
                      </div>
                      <div style={{ fontSize: 10, color: "#3a5068", marginBottom: 8 }}>Ctrl+Enter to send</div>

                      {(examMA.prescriptionDialog || []).filter(m => m.role === "user").length >= 1 && (
                        <button onClick={() => setExamMA(p => ({ ...p, phase: "present" }))} style={{
                          width: "100%", padding: "12px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                          background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.25)", color: "#d06060",
                        }}>Present to Examiner →</button>
                      )}
                    </>
                  )}

                  {/* Phase 5: Present to Examiner */}
                  {examMA.phase === "present" && (
                    <>
                      <div style={{ fontSize: 13, color: "#d06060", fontWeight: 600, marginBottom: 4 }}>Step 5: Present your analysis to the examiner</div>
                      <div style={{ fontSize: 12, color: "#7a9ab5", marginBottom: 10, lineHeight: 1.5 }}>
                        The examiner heard your dialog and prescription. Now explain the technical WHY — your observations, root cause, why this task targets it, the biomechanics and skill relationships behind your choice. This is you demonstrating your knowledge, not coaching.
                      </div>

                      {/* Private notes reference */}
                      <details style={{ marginBottom: 8 }}>
                        <summary style={{ fontSize: 11, color: "#4d6888", cursor: "pointer" }}>Your private notes (reference only — examiner doesn't see these)</summary>
                        <div style={{ padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.02)", fontSize: 11, color: "#7a9ab5", whiteSpace: "pre-wrap", marginTop: 4 }}>
                          Observations: {examMA.observations}{"\n\n"}Root cause: {examMA.rootCause}
                        </div>
                      </details>

                      <label style={lbl}>Your presentation to the examiner</label>
                      <textarea value={examMA.presentation} onChange={ev => setExamMA(p => ({ ...p, presentation: ev.target.value }))} placeholder={"Present to the examiner:\n\n• What you observed by turn phase — ski performance and body performance\n• The cause-effect chain and root cause — which fundamental is driving the others\n• WHY you chose this IDP task — what it targets at the biomechanics/physics level\n• Why this terrain, why these variations\n• How the task addresses the root cause and serves the subject's stated intent"} style={{ ...txta, minHeight: 150, fontSize: 14, lineHeight: 1.7, marginBottom: 8 }} />

                      <button onClick={async () => {
                        if (!examMA.presentation.trim()) return;
                        setExamMALoading(true);
                        setExamMA(p => ({ ...p, phase: "debrief" }));
                        const dialogText = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                        const prescribeText = (examMA.prescriptionDialog || []).map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                        const fullContext = `THE EXAMINER HEARD THE FOLLOWING:\n\nPEER DIALOG (examiner observed this):\n${dialogText}\n\nPRESCRIPTION DELIVERY TO PEER (examiner observed this conversation):\n${prescribeText}\n\nMARK'S PRESENTATION TO EXAMINER (technical analysis and WHY):\n${examMA.presentation}\n\nContext: ${examMA.who}, ${examMA.activity}, ${examMA.conditions}\n\nBegin your examiner debrief. You only know what you heard — the peer dialog, the prescription delivery conversation, and Mark's technical presentation. Start by acknowledging one thing Mark did well, then ask your first probing question.`;
                        const resp = await callClaude([{ role: "user", content: fullContext }], buildSystemPrompt(MA_EXAM_DEBRIEF_SYSTEM));
                        setExamMA(p => ({ ...p, debriefMessages: [{ role: "assistant", content: resp }] }));
                        setExamMALoading(false);
                      }} disabled={!examMA.presentation.trim() || examMALoading} style={{
                        width: "100%", padding: "12px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: examMA.presentation.trim() && !examMALoading ? "pointer" : "default",
                        background: examMALoading ? "rgba(255,255,255,0.03)" : "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.25)", color: examMALoading ? "#4d6888" : "#d06060",
                      }}>{examMALoading ? "Examiner preparing..." : "Submit → Examiner Q&A"}</button>
                    </>
                  )}

                  {/* Phase 6: Examiner debrief */}
                  {examMA.phase === "debrief" && (
                    <>
                      <div style={{ fontSize: 13, color: "#d06060", fontWeight: 600, marginBottom: 4 }}>Step 6: Examiner Q&A</div>
                      <details style={{ marginBottom: 6 }}><summary style={{ fontSize: 11, color: "#4d6888", cursor: "pointer" }}>Your presentation (what examiner heard)</summary>
                        <div style={{ padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.02)", fontSize: 11, color: "#d0d8e0", whiteSpace: "pre-wrap", marginTop: 4 }}>
                          {examMA.presentation}
                        </div>
                      </details>

                      <div style={{ marginBottom: 8, maxHeight: 300, overflowY: "auto" }}>
                        {examMA.debriefMessages.map((m, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
                            <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: 10, background: m.role === "user" ? "rgba(208,96,96,0.08)" : "rgba(224,120,48,0.06)", border: `1px solid ${m.role === "user" ? "rgba(208,96,96,0.15)" : "rgba(224,120,48,0.12)"}` }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: m.role === "user" ? SPEAKER.mark.color : SPEAKER.examiner.color, marginBottom: 2 }}>{m.role === "user" ? "Mark" : "Examiner"}</div>
                              <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
                            </div>
                          </div>
                        ))}
                        {examMALoading && <div style={{ fontSize: 12, color: "#e07830", padding: "4px" }}>Examiner thinking...</div>}
                      </div>

                      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
                        <textarea id="exam-debrief-input" placeholder="Respond to the examiner..." style={{ ...txta, minHeight: 36, flex: 1, fontSize: 13 }}
                          onKeyDown={async ev => {
                            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                              const text = ev.target.value.trim();
                              if (!text || examMALoading) return;
                              const newMsgs = [...examMA.debriefMessages, { role: "user", content: text }];
                              setExamMA(p => ({ ...p, debriefMessages: newMsgs }));
                              ev.target.value = "";
                              setExamMALoading(true);
                              const dialogText = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                              const prescribeText = (examMA.prescriptionDialog || []).map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                              const baseContext = `Mark's presentation: ${examMA.presentation}\nPeer dialog: ${dialogText}\nPrescription delivery: ${prescribeText}`;
                              const msgs = [{ role: "user", content: baseContext }, ...newMsgs];
                              const resp = await callClaude(msgs, buildSystemPrompt(MA_EXAM_DEBRIEF_SYSTEM));
                              setExamMA(p => ({ ...p, debriefMessages: [...newMsgs, { role: "assistant", content: resp }] }));
                              setExamMALoading(false);
                            }
                          }}
                        />
                        <button onClick={async () => {
                          const el = document.getElementById("exam-debrief-input");
                          const text = el.value.trim();
                          if (!text || examMALoading) return;
                          const newMsgs = [...examMA.debriefMessages, { role: "user", content: text }];
                          setExamMA(p => ({ ...p, debriefMessages: newMsgs }));
                          el.value = "";
                          setExamMALoading(true);
                          const dialogText = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                          const prescribeText = (examMA.prescriptionDialog || []).map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                              const baseContext = `Mark's presentation: ${examMA.presentation}\nPeer dialog: ${dialogText}\nPrescription delivery: ${prescribeText}`;
                          const msgs = [{ role: "user", content: baseContext }, ...newMsgs];
                          const resp = await callClaude(msgs, buildSystemPrompt(MA_EXAM_DEBRIEF_SYSTEM));
                          setExamMA(p => ({ ...p, debriefMessages: [...newMsgs, { role: "assistant", content: resp }] }));
                          setExamMALoading(false);
                        }} disabled={examMALoading} style={{
                          padding: "6px 12px", borderRadius: 5, fontSize: 13, fontWeight: 700,
                          background: "rgba(208,96,96,0.08)", border: "1px solid rgba(208,96,96,0.2)", color: "#d06060", cursor: examMALoading ? "default" : "pointer", flexShrink: 0,
                        }}>Reply</button>
                      </div>
                      <div style={{ fontSize: 10, color: "#3a5068", marginBottom: 8 }}>Ctrl+Enter to send</div>

                      {examMA.debriefMessages.filter(m => m.role === "user").length >= 1 && (
                        <button onClick={async () => {
                          setExamMALoading(true);
                          const dialogText = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                          const debriefText = examMA.debriefMessages.map(m => `${m.role === "user" ? "Mark" : "Examiner"}: ${m.content}`).join("\n");
                          const pastSessions = maSessions.filter(s => s.summary).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || "")).slice(0, 3);
                          let pastContext = "";
                          if (pastSessions.length > 0) {
                            pastContext = "\n\nPREVIOUS SESSIONS FOR COMPARISON:\n";
                            pastSessions.forEach(s => { try { const p = parseSummary(s.summary); if (p?.scores) pastContext += `[${s.date}] D=${p.scores.describe} C/E=${p.scores.cause_effect} E=${p.scores.evaluate} P=${p.scores.prescription} B=${p.scores.biomechanics} C=${p.scores.communication}. Gaps: ${(p.gaps||[]).join(", ")}\n`; } catch(e) {} });
                          }
                          // Include previous attempt context if revising
                          let revisionContext = "";
                          if (examMA.attempts.length > 0) {
                            revisionContext = `\n\nThis is revision ${examMA.attempts.length} of 3. Mark has revised his observations, root cause, and/or prescription based on previous feedback. Previous scores:\n`;
                            examMA.attempts.forEach((a, i) => {
                              const sc = a.scores || {};
                              revisionContext += `${i === 0 ? "Initial" : "Revision " + i}: D=${sc.describe} C/E=${sc.cause_effect} E=${sc.evaluate} P=${sc.prescription} B=${sc.biomechanics} C=${sc.communication}. Gaps: ${(a.gaps||[]).join(", ")}\n`;
                            });
                            revisionContext += "Score this attempt on its own merits but note what improved from previous attempts.\n";
                          }
                          const prescribeText = (examMA.prescriptionDialog || []).map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                          const input = `SCORE ONLY WHAT THE EXAMINER HEARD:\n\nPEER DIALOG (examiner observed):\n${dialogText}\n\nPRESCRIPTION DELIVERY TO PEER (examiner observed):\n${prescribeText}\n\nMARK'S PRESENTATION TO EXAMINER:\n${examMA.presentation}\n\nEXAMINER Q&A:\n${debriefText}${revisionContext}${pastContext}\n\nContext: ${examMA.who}, ${examMA.activity}, ${examMA.conditions}\n\nScore ONLY what the examiner heard. Do NOT consider any private notes. Evaluate: (1) Did he connect the task to the subject's intent when delivering it? (2) Did he explain the technical WHY to the examiner?\n"did_well": ["list of specific things Mark did well"]\n"opportunity": ["list of specific areas to improve"]\n\nRESPOND ONLY IN JSON (no markdown, no backticks). CHECK FROM THE TOP DOWN starting at 5: Does candidate extend beyond expected with autonomous skill? If yes, 5. Then check 4: appears regularly at AT standard? If yes, 4. If something missing, verify 4-level gap not 5-level. Only 3 if genuine 4-level element absent.\n{"did_well":["list"],"opportunity":["next focus"],"score_rationale":{"describe":"evidence","cause_effect":"evidence","evaluate":"evidence","prescription":"evidence","biomechanics":"evidence","communication":"evidence"},"scores":{"describe":0,"cause_effect":0,"evaluate":0,"prescription":0,"biomechanics":0,"communication":0},"key_learning":"text"}`;
                          const resp = await callClaude([{ role: "user", content: input }], buildScorerPrompt(MA_TREND_SCORER_SYSTEM));
                          const parsed = parseAIJson(resp);

                          // Add to attempts
                          const newAttempt = typeof parsed === "object" ? { ...parsed, timestamp: new Date().toISOString(), attemptNum: examMA.attemptNumber } : { raw: parsed, timestamp: new Date().toISOString(), attemptNum: examMA.attemptNumber };
                          const updatedAttempts = [...examMA.attempts, newAttempt];
                          setExamMA(p => ({ ...p, phase: "scored", result: parsed, attempts: updatedAttempts, attemptNumber: p.attemptNumber + 1 }));
                          setExamMALoading(false);
                        }} disabled={examMALoading} style={{
                          width: "100%", padding: "12px", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: examMALoading ? "default" : "pointer",
                          background: examMALoading ? "rgba(255,255,255,0.03)" : "linear-gradient(135deg, rgba(208,96,96,0.12), rgba(224,120,48,0.08))",
                          border: "1px solid rgba(208,96,96,0.3)", color: examMALoading ? "#4d6888" : "#e8a050",
                        }}>{examMALoading ? "Scoring..." : examMA.attempts.length === 0 ? "Score My MA" : `Score Revision ${examMA.attempts.length} of 3`}</button>
                      )}
                    </>
                  )}

                  {/* Phase 7: Scored — with retry */}
                  {examMA.phase === "scored" && examMA.result && (() => {
                    const scoreColor = (v) => v >= 4 ? "#28a858" : v >= 3 ? "#e07830" : "#e05028";
                    const scoreKeys = [{ key: "describe", label: "Describe" }, { key: "cause_effect", label: "Cause/Effect" }, { key: "evaluate", label: "Evaluate" }, { key: "prescription", label: "Prescription" }, { key: "biomechanics", label: "Bio/Physics" }, { key: "communication", label: "Comm" }];

                    // Calculate best attempt
                    const getTotal = (a) => a?.scores ? scoreKeys.reduce((sum, sc) => sum + (a.scores[sc.key] || 0), 0) : 0;
                    const bestAttempt = examMA.attempts.length > 0 ? examMA.attempts.reduce((best, a) => getTotal(a) > getTotal(best) ? a : best, examMA.attempts[0]) : null;
                    const canRetry = examMA.attempts.length < 4; // 1 initial + 3 revisions
                    const currentAttempt = examMA.attempts.length > 0 ? examMA.attempts[examMA.attempts.length - 1] : null;
                    const hasScores = currentAttempt?.scores;

                    return (
                      <div style={{ padding: "14px", borderRadius: 8, background: "rgba(208,96,96,0.04)", border: "1px solid rgba(208,96,96,0.1)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#d06060" }}>{examMA.attempts.length <= 1 ? "INITIAL SCORE" : `REVISION ${examMA.attempts.length - 1} OF 3`} — {today()}</div>
                          {examMA.attempts.length > 1 && <div style={{ fontSize: 11, fontWeight: 600, color: "#28a858" }}>Best score highlighted below</div>}
                        </div>

                        {hasScores ? (
                          <>
                            {/* Scores */}
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                              {scoreKeys.map(sc => (
                                <div key={sc.key} style={{ textAlign: "center", minWidth: 50 }}>
                                  <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(currentAttempt.scores[sc.key] || 0) }}>{currentAttempt.scores[sc.key] || "—"}</div>
                                  <div style={{ fontSize: 9, color: "#7a9ab5", fontWeight: 600 }}>{sc.label}</div>
                                </div>
                              ))}
                            </div>

                            {/* What you did well */}
                            {(currentAttempt.did_well?.length > 0 || currentAttempt.strengths?.length > 0) && (
                              <div style={{ marginBottom: 6, padding: "6px 8px", borderRadius: 4, background: "rgba(40,168,88,0.06)", border: "1px solid rgba(40,168,88,0.12)" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#28a858" }}>WHAT YOU DID WELL: </span>
                                <span style={{ fontSize: 12, color: "#d0d8e0" }}>{(currentAttempt.did_well || currentAttempt.strengths || []).join(" · ")}</span>
                              </div>
                            )}

                            {/* Opportunity to improve */}
                            {(currentAttempt.opportunity?.length > 0 || currentAttempt.gaps?.length > 0) && (
                              <div style={{ marginBottom: 6, padding: "6px 8px", borderRadius: 4, background: "rgba(224,120,48,0.06)", border: "1px solid rgba(224,120,48,0.12)" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#e07830" }}>OPPORTUNITY TO IMPROVE: </span>
                                <span style={{ fontSize: 12, color: "#d0d8e0" }}>{(currentAttempt.opportunity || currentAttempt.gaps || []).join(" · ")}</span>
                              </div>
                            )}

                            {currentAttempt.improvements?.length > 0 && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 10, fontWeight: 700, color: "#3088cc" }}>IMPROVED VS PREVIOUS: </span><span style={{ fontSize: 12, color: "#d0d8e0" }}>{currentAttempt.improvements.join(" · ")}</span></div>}
                            {currentAttempt.key_learning && <div style={{ padding: "8px 10px", borderRadius: 5, background: "rgba(224,120,48,0.06)", border: "1px solid rgba(224,120,48,0.15)", marginTop: 6 }}><span style={{ fontSize: 11, fontWeight: 700, color: "#e8a050" }}>KEY FOCUS: </span><span style={{ fontSize: 13, color: "#d0d8e0" }}>{currentAttempt.key_learning}</span></div>}
                          </>
                        ) : (
                          /* Fallback: display as readable text */
                          <div style={{ padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 10 }}>
                            <div style={{ fontSize: 13, color: "#d0d8e0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {(() => {
                                const raw = currentAttempt?.raw || examMA.result?.raw || (typeof examMA.result === "string" ? examMA.result : "");
                                if (!raw) return "Score could not be parsed. Try again.";
                                // Clean up any JSON artifacts for display
                                return String(raw)
                                  .replace(/[{}[\]"]/g, "")
                                  .replace(/,\s*/g, "\n")
                                  .replace(/scores:\s*/i, "SCORES:\n")
                                  .replace(/did_well:\s*/i, "\nDID WELL:\n")
                                  .replace(/opportunity:\s*/i, "\nOPPORTUNITY:\n")
                                  .replace(/gaps:\s*/i, "\nGAPS:\n")
                                  .replace(/strengths:\s*/i, "\nSTRENGTHS:\n")
                                  .replace(/key_learning:\s*/i, "\nKEY FOCUS:\n")
                                  .trim();
                              })()}
                            </div>
                            <div style={{ fontSize: 10, color: "#e07830", marginTop: 6 }}>Score format could not be fully parsed — feedback shown as text</div>
                          </div>
                        )}

                        {/* All attempts comparison */}
                        {examMA.attempts.length > 1 && examMA.attempts.some(a => a.scores) && (
                          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a9ab5", marginBottom: 6 }}>ALL ATTEMPTS</div>
                            {examMA.attempts.map((a, ai) => {
                              const isBest = a === bestAttempt;
                              const total = getTotal(a);
                              return (
                                <div key={ai} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid rgba(255,255,255,0.03)" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: isBest ? "#28a858" : "#7a9ab5", minWidth: 75 }}>{isBest ? "★ " : ""}{ai === 0 ? "Initial" : `Rev ${ai}`}</span>
                                  <div style={{ display: "flex", gap: 3 }}>
                                    {scoreKeys.map(sc => (
                                      <div key={sc.key} style={{ width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: scoreColor(a.scores?.[sc.key] || 0), background: `${scoreColor(a.scores?.[sc.key] || 0)}12`, border: isBest ? `1.5px solid ${scoreColor(a.scores?.[sc.key] || 0)}40` : "none" }}>
                                        {a.scores?.[sc.key] || "—"}
                                      </div>
                                    ))}
                                  </div>
                                  <span style={{ fontSize: 11, color: "#4d6888" }}>Total: {total}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                          {canRetry && (
                            <button onClick={() => {
                              setExamMA(p => ({ ...p, phase: "dialog", prescription: "", prescriptionDialog: [], presentation: "", debriefMessages: [], result: null }));
                            }} style={{
                              flex: 1, padding: "10px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                              background: "rgba(48,136,204,0.08)", border: "1px solid rgba(48,136,204,0.25)", color: "#3088cc",
                            }}>Revise ({4 - examMA.attempts.length} revision{4 - examMA.attempts.length !== 1 ? "s" : ""} left)</button>
                          )}
                          <button onClick={() => {
                            // Re-parse attempts to extract any scores we can
                            const cleanedAttempts = examMA.attempts.map(a => {
                              if (a.scores) return a;
                              if (a.raw) {
                                const reparsed = parseAIJson(a.raw);
                                if (reparsed?.scores) return { ...a, ...reparsed };
                              }
                              return a;
                            });

                            // Find best from cleaned attempts
                            const getTotal = (a) => a?.scores ? [{ key: "describe" }, { key: "cause_effect" }, { key: "evaluate" }, { key: "prescription" }, { key: "biomechanics" }, { key: "communication" }].reduce((sum, sc) => sum + (a.scores[sc.key] || 0), 0) : 0;
                            const best = cleanedAttempts.length > 0 ? cleanedAttempts.reduce((b, a) => getTotal(a) > getTotal(b) ? a : b, cleanedAttempts[0]) : null;

                            const dialogText = examMA.dialogMessages.map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                            const debriefText = examMA.debriefMessages.map(m => `${m.role === "user" ? "Mark" : "Examiner"}: ${m.content}`).join("\n");
                            const prescribeDialogText = (examMA.prescriptionDialog || []).map(m => `${m.role === "user" ? "Mark" : "Peer"}: ${m.content}`).join("\n");
                            const fullTranscript = `PRIVATE NOTES:\n${examMA.observations}\nRoot cause: ${examMA.rootCause}\n\nPEER DIALOG:\n${dialogText}\n\nPRESCRIPTION DELIVERY (to peer):\n${prescribeDialogText}\n\nPRESENTATION TO EXAMINER:\n${examMA.presentation}\n\nEXAMINER Q&A:\n${debriefText}`;

                            // Build summary — strip raw text to save space, keep structured data
                            const cleanForSave = (a) => {
                              const { raw, timestamp, attemptNum, ...rest } = a;
                              return rest;
                            };
                            const summaryObj = {
                              ...(typeof best === "object" ? cleanForSave(best) : {}),
                              allAttempts: cleanedAttempts.map((a, i) => ({
                                attempt: i + 1,
                                scores: a.scores || null,
                                did_well: a.did_well || a.strengths || [],
                                opportunity: a.opportunity || a.gaps || [],
                                key_learning: a.key_learning || "",
                              })),
                              bestAttempt: cleanedAttempts.indexOf(best) + 1,
                              totalAttempts: cleanedAttempts.length,
                              scoredAt: new Date().toISOString(),
                            };

                            const revCount = examMA.attempts.length - 1;
                            const newSession = {
                              id: uid(), date: today(),
                              type: "at_exam",
                              context: `AT MA Exam${revCount > 0 ? " (" + revCount + " revision" + (revCount > 1 ? "s" : "") + ")" : ""}`,
                              who: examMA.who, activity: examMA.activity, conditions: examMA.conditions,
                              transcript: fullTranscript,
                              sections: {
                                private_notes: examMA.observations || "",
                                root_cause: examMA.rootCause || "",
                                peer_dialog: dialogText,
                                prescription_delivery: prescribeDialogText,
                                presentation: examMA.presentation || "",
                                examiner_qa: debriefText,
                              },
                              notes: examMA.videoUrl ? `Video: ${examMA.videoUrl}${examMA.videoSkier ? ` | Skier: ${examMA.videoSkier}` : ""}${examMA.videoTime ? ` | Time: ${examMA.videoTime}` : ""}` : "",
                              summary: JSON.stringify(summaryObj),
                              mentorFeedback: [],
                              videoUrl: examMA.videoUrl,
                              videoSkier: examMA.videoSkier || "",
                              videoTime: examMA.videoTime || "",
                            };
                            saveMaSessions([newSession, ...maSessions]);

                            setExamMA({ phase: "setup", videoUrl: "", videoSkier: "", videoTime: "", who: "", activity: "", conditions: "", observations: "", rootCause: "", dialogMessages: [], prescription: "", prescriptionReason: "", prescriptionDialog: [], presentation: "", debriefMessages: [], result: null, attempts: [], attemptNumber: 1 });
                          }} style={{
                            flex: 1, padding: "10px", borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: "pointer",
                            background: "rgba(40,168,88,0.08)", border: "1px solid rgba(40,168,88,0.25)", color: "#28a858",
                          }}>{ examMA.attempts.length === 1 ? "Accept Score & Finish" : "Save Best Score & Finish"}</button>
                        </div>
                        <div style={{ fontSize: 10, color: "#28a858", marginTop: 6, textAlign: "center" }}>Saved to MA History · Mentors can review and add feedback</div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
              <>
              {/* Regular chat interface for all other modes */}
              <div style={{ flex: 1, marginBottom: 12, maxHeight: 400, overflowY: "auto" }}>
                {sparringMessages.map((m, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8,
                  }}>
                    <div style={{
                      maxWidth: "85%", padding: "10px 14px", borderRadius: 10,
                      background: m.role === "user" ? "rgba(224,120,48,0.08)" : `${SPARRING_MODES[sparringMode].color}06`,
                      border: `1px solid ${m.role === "user" ? "rgba(224,120,48,0.15)" : `${SPARRING_MODES[sparringMode].color}12`}`,
                    }}>
                      <div style={{ fontSize: 14, color: "#d0d8e0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
                    </div>
                  </div>
                ))}
                {sparringLoading && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: `${SPARRING_MODES[sparringMode].color}06`, border: `1px solid ${SPARRING_MODES[sparringMode].color}12` }}>
                      <div style={{ fontSize: 14, color: SPARRING_MODES[sparringMode].color }}>Thinking...</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                <textarea
                  value={sparringInput}
                  onChange={e => setSparringInput(e.target.value)}
                  placeholder={sparringMode === "video" ? "Describe what you see in the video — body position, ski behavior, timing, terrain..." :
                    sparringMode === "scenario" ? "Write your MA analysis here..." :
                    sparringMode === "reverse" ? "What did the trainer probably see? What's the diagnosis?" :
                    sparringMode === "compare" ? "Analyze both students — what's different about the root cause?" :
                    "Ask a question or describe a scenario..."}
                  style={{ ...txta, minHeight: 40, flex: 1, fontSize: 14 }}
                  onKeyDown={async ev => {
                    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
                      const text = sparringInput.trim();
                      if (!text || sparringLoading) return;
                      const newMessages = [...sparringMessages, { role: "user", content: text }];
                      setSparringMessages(newMessages);
                      setSparringInput("");
                      setSparringLoading(true);
                      const resp = await callClaude(newMessages, buildSystemPrompt(SPARRING_MODES[sparringMode].system));
                      setSparringMessages([...newMessages, { role: "assistant", content: resp }]);
                      setSparringLoading(false);
                    }
                  }}
                />
                <button onClick={async () => {
                  const text = sparringInput.trim();
                  if (!text || sparringLoading) return;
                  const newMessages = [...sparringMessages, { role: "user", content: text }];
                  setSparringMessages(newMessages);
                  setSparringInput("");
                  setSparringLoading(true);
                  const resp = await callClaude(newMessages, buildSystemPrompt(SPARRING_MODES[sparringMode].system));
                  setSparringMessages([...newMessages, { role: "assistant", content: resp }]);
                  setSparringLoading(false);
                }} disabled={sparringLoading} style={{
                  padding: "8px 14px", borderRadius: 6, fontSize: 14, fontWeight: 700,
                  background: sparringLoading ? "rgba(255,255,255,0.03)" : `${SPARRING_MODES[sparringMode].color}08`,
                  border: `1px solid ${SPARRING_MODES[sparringMode].color}25`,
                  color: sparringLoading ? "#4d6888" : SPARRING_MODES[sparringMode].color,
                  cursor: sparringLoading ? "default" : "pointer", flexShrink: 0,
                }}>Send</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <div style={{ fontSize: 10, color: "#3a5068" }}>Ctrl+Enter to send</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {sparringMessages.length > 2 && ["scenario", "reverse", "compare", "video"].includes(sparringMode) && (
                    <button onClick={() => {
                      const modeLabels = { scenario: "Scenario Drill", reverse: "Reverse MA", compare: "Compare & Contrast", video: "Video Analysis" };
                      const transcript = sparringMessages.map(m => `${m.role === "user" ? "Mark" : "AI"}: ${m.content}`).join("\n\n");
                      const newSession = {
                        id: uid(), date: today(),
                        type: sparringMode,
                        context: modeLabels[sparringMode],
                        who: "", activity: sparringMode, conditions: "",
                        transcript, sections: { conversation: transcript },
                        notes: "", summary: "", mentorFeedback: [],
                      };
                      saveMaSessions([newSession, ...maSessions]);
                      setSparringMessages([]);
                    }} style={{
                      background: "none", border: "none", color: "#28a858", fontSize: 10, cursor: "pointer", fontWeight: 600,
                    }}>Save to MA History</button>
                  )}
                  {sparringMessages.length > 0 && (
                    <button onClick={() => setSparringMessages([])} style={{
                      background: "none", border: "none", color: "#3a5068", fontSize: 10, cursor: "pointer",
                    }}>Clear conversation</button>
                  )}
                </div>
              </div>
              </>
              )}
            </Card>
          </>
        )}

        {/* ═══ PROFILE ═══ */}
        {tab === "profile" && !isSubView && (
          <>
            <div style={{ fontSize: 14, color: "#7a9ab5", marginBottom: 14 }}>Manage your notification preferences.</div>
            <Card>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#e0e8f0", marginBottom: 14 }}>Notification Settings</div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Email Address</label>
                <input
                  value={mentorProfiles[currentUser.key]?.email || ""}
                  onChange={ev => {
                    const updated = { ...mentorProfiles, [currentUser.key]: { ...(mentorProfiles[currentUser.key] || {}), email: ev.target.value } };
                    setMentorProfiles(updated);
                  }}
                  placeholder="your.email@example.com"
                  style={inp}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <button
                  onClick={() => {
                    const current = mentorProfiles[currentUser.key]?.notifications !== false;
                    const updated = { ...mentorProfiles, [currentUser.key]: { ...(mentorProfiles[currentUser.key] || {}), notifications: !current } };
                    setMentorProfiles(updated);
                  }}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: (mentorProfiles[currentUser.key]?.notifications !== false) ? "#28a858" : "rgba(255,255,255,0.1)",
                    position: "relative", transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3,
                    left: (mentorProfiles[currentUser.key]?.notifications !== false) ? 23 : 3,
                    transition: "left 0.2s",
                  }} />
                </button>
                <span style={{ fontSize: 14, color: "#d0d8e0" }}>
                  Email notifications {(mentorProfiles[currentUser.key]?.notifications !== false) ? "on" : "off"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#4d6888", marginBottom: 14 }}>
                When enabled, you'll receive an email when Mark creates a new journal entry. Updates to existing entries do not trigger notifications.
              </div>
              <button
                onClick={() => saveMentorProfiles(mentorProfiles)}
                style={{
                  padding: "10px 20px", borderRadius: 7, border: "none",
                  background: "linear-gradient(135deg, #e07830, #c06020)", color: "#fff",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                }}
              >Save Profile</button>
              {mentorProfiles[currentUser.key]?.email && (
                <button
                  onClick={async () => {
                    const ok = await notifyMentors("AT Journal: Test Notification", `This is a test notification for ${currentUser.name}.\n\nIf you received this, notifications are working.`);
                    alert(ok ? "Test email sent — check your inbox" : "Send failed — check console for details");
                  }}
                  style={{
                    marginLeft: 10, padding: "10px 20px", borderRadius: 7,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#7a9ab5", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >Send Test Email</button>
              )}
            </Card>
          </>
        )}
      </div>

      <style>{`
        .at-container { max-width: 720px; margin: 0 auto; }
        @media (min-width: 768px) { .at-container { max-width: 1024px; } }
        input:focus, textarea:focus, select:focus {
          border-color: rgba(224,120,48,0.35) !important;
          box-shadow: 0 0 0 2px rgba(224,120,48,0.06);
        }
        select { appearance: auto; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 3px; }
      `}</style>
    </div>
  );
}
