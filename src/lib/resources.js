// Learning experiences from the AT Program Guide. Harvested verbatim from ATDevelopmentJournal.jsx (session 7, for the
// Journal's "inspired by a resource" link); the Resources tab (session 10) reads the same list.
export const RESOURCES = {
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

export const ALL_RESOURCES = Object.values(RESOURCES).flatMap((r) => r.items);
export const resourceById = (id) => ALL_RESOURCES.find((r) => r.id === id) || null;
