// Proxy to the Apps Script web app. Contract unchanged: the caller's JSON body is forwarded, the script's JSON comes back
// as-is (or { ok, response } for non-JSON), an upstream failure is { error } with the upstream status.
//
// Measured 2026-09-22 (18 MASessions rows, 380 KB): a good round trip is ~2 s; about one request in four instead hangs
// for 20–70 s and then comes back as Google's HTML "page not found" (the 302 to googleusercontent drops the request).
// The browser retried — but only after the whole hang, so a login that loads three sheets in parallel waited 20–70 s
// more than half the time, and minutes when two hangs lined up. Each upstream attempt is now cut off at
// ATTEMPT_MS and retried here, so a bad attempt costs ~10 s instead of ~40; the browser's own retry stays as the
// second layer.
// 2026-09-24: 10 s × 3 was too eager. Under concurrent load the script is slow but alive (12–29 s), and aborting the
// fetch does not stop the execution on Google's side — each retry stacked another one. Two longer attempts fit in the
// 60 s function limit and give a slow-but-alive call room to finish; the browser now sends one request at a time.
const ATTEMPT_MS = 25_000;
const ATTEMPTS = 2;
const looksTransient = (status, text) => status === 404 || status >= 500 || /<!DOCTYPE|<html/i.test(text.slice(0, 200)) || /"error"\s*:\s*"Unknown action:\s*"/.test(text);

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) return res.status(500).json({ error: "APPS_SCRIPT_URL not configured" });

  const body = JSON.stringify(req.body);
  let last = { status: 502, text: "" };
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      // Apps Script answers 302 → googleusercontent; fetch follows it (the redirect is a GET carrying the response).
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        redirect: "follow",
        signal: AbortSignal.timeout(ATTEMPT_MS),
      });
      const text = await response.text();
      last = { status: response.status, text };
      if (response.ok && !looksTransient(response.status, text)) {
        try { return res.status(200).json(JSON.parse(text)); }
        catch { return res.status(200).json({ ok: true, response: text }); }
      }
      console.warn(`sheet proxy: ${req.body?._action} ${req.body?._sheet} attempt ${i + 1}/${ATTEMPTS} → HTTP ${response.status} ${text.slice(0, 60).replace(/\s+/g, " ")}`);
    } catch (err) {
      last = { status: 504, text: err.name === "TimeoutError" || err.name === "AbortError" ? `Apps Script did not answer within ${ATTEMPT_MS / 1000} s` : String(err.message || err) };
      console.warn(`sheet proxy: ${req.body?._action} ${req.body?._sheet} attempt ${i + 1}/${ATTEMPTS} → ${last.text}`);
    }
  }
  return res.status(last.status >= 400 ? last.status : 502).json({ error: last.text.slice(0, 500) });
}
