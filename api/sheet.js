// /api/sheet — operational data endpoint (session 7b). Same request and response shapes as the Apps Script proxy it
// replaces (archive/sheet-appsscript.js): POST { _action, _sheet, ...row } → the action's JSON. Logic errors come back
// as 200 { error } exactly as the script sent them (every caller checks `data.error`); a store failure is 502 { error }
// so the client's transient retry still applies. Backed by Postgres through lib/ops.js — no Apps Script, no proxy hops.
import { handle } from "../lib/ops.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = typeof req.body === "string" ? safeParse(req.body) : (req.body || {});
  const t0 = Date.now();
  const out = await handle(body);
  const ms = Date.now() - t0;
  if (out?.transient) {
    console.warn(`sheet: ${body._action} ${body._sheet} → store error in ${ms} ms: ${out.error}`);
    return res.status(502).json({ error: out.error });
  }
  if (ms > 2000) console.warn(`sheet: ${body._action} ${body._sheet} took ${ms} ms`);
  return res.status(200).json(out);
}

function safeParse(text) { try { return JSON.parse(text); } catch { return {}; } }
