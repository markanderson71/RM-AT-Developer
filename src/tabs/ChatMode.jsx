// Chat coaches (session 9, harvested from the old Sparring tab): Open Chat, Scenario Drill, Reverse MA, Compare &
// Contrast, Video Analysis. One AT coach, one mode instruction, mentor assessments folded in. A chat can be saved to
// MA History as its own type — unscored; the coach is not the scorer.
import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme.js";
import { Button, Composer, Hint, Thread, speakText } from "../components/index.jsx";
import { callClaude, saveMaSession } from "../api.js";
import { USERS } from "../lib/users.js";
import { mentorGapsBlock } from "../lib/prompts.js";
import { freshChat, chatEmpty, chatSession, loadMode, persistMode } from "../lib/sparring.js";

export default function ChatMode({ mode, mentorAssessments, onSaved }) {
  const [chat, setChat] = useState(() => loadMode(mode.id, freshChat));
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const ref = useRef(chat); ref.current = chat;
  useEffect(() => persistMode(mode.id, chat, chatEmpty), [chat, mode.id]);
  const system = `${mode.system}${mentorGapsBlock(mentorAssessments, USERS)}`;

  const send = async (text) => {
    const msgs = [...ref.current.messages, { role: "user", content: text }];
    setChat((c) => ({ ...c, messages: msgs, draft: "" }));
    setLoading(true);
    const resp = await callClaude(msgs, system);
    setChat((c) => ({ ...c, messages: [...msgs, { role: "assistant", content: resp }] }));
    setLoading(false);
  };
  const save = async () => {
    const s = chatSession(mode, ref.current);
    setSaveMsg("Saving…");
    const ok = await saveMaSession(s);
    if (ok) { setChat((c) => ({ ...c, savedId: s.id, savedCount: c.messages.length })); onSaved?.(s); setSaveMsg(`Saved to MA History as ${s.date} · ${mode.label}.`); }
    else setSaveMsg("Save failed — the conversation is still here.");
  };
  const reset = () => { if (chatEmpty(chat) || confirm("Start over? This conversation isn't saved.")) { setChat(freshChat()); setSaveMsg(""); } };
  const unsaved = chat.messages.length > 0 && chat.messages.length !== chat.savedCount;

  return (
    <div>
      {chat.messages.length === 0 && mode.opener && (
        <Button tone={mode.color} disabled={loading} onClick={() => send(mode.opener)} style={{ width: "100%", marginBottom: 10 }}>{loading ? "Coach is thinking…" : `${mode.icon} ${mode.label} — start`}</Button>
      )}
      {chat.messages.length === 0 && !mode.opener && (
        <div style={{ textAlign: "center", padding: "16px", color: C.faint, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: C.muted }}>{mode.id === "video" ? "Paste your written analysis of the video, then the coach pushes." : "Try: “I'm leading a clinic tomorrow on carved turns for L2 candidates.” · “What separates an AT prescription from an L3 one?”"}</div>
        </div>
      )}
      <Thread messages={chat.messages} me={C.mark} them={mode.color} meLabel="Mark" themLabel="Coach" loading={loading} loadingText="Coach is thinking…" maxHeight={380} />
      <Composer value={chat.draft} onChange={(v) => setChat((c) => ({ ...c, draft: v }))} onSend={send} disabled={loading} tone={mode.color} sendLabel="Send" placeholder={mode.id === "video" ? "Your analysis of the video…" : "Your answer…"} />
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {chat.messages.length > 0 && <button type="button" onClick={() => speakText(chat.messages[chat.messages.length - 1].content)} style={{ background: "none", border: "none", color: C.dim, fontSize: 12, cursor: "pointer" }}>🔊 read last reply</button>}
        <span style={{ flex: 1 }} />
        {chat.messages.length > 1 && <Button tone={C.green} disabled={loading || !unsaved} onClick={save} style={{ padding: "5px 12px", fontSize: 12 }}>{unsaved ? "Save to MA History" : "Saved"}</Button>}
        {chat.messages.length > 0 && <Button tone={C.muted} disabled={loading} onClick={reset} style={{ padding: "5px 12px", fontSize: 12 }}>＋ New</Button>}
      </div>
      {saveMsg && <Hint style={{ marginTop: 6, color: /failed/.test(saveMsg) ? C.red : C.green }}>{saveMsg}</Hint>}
    </div>
  );
}
