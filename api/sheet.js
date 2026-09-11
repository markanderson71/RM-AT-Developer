export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({ error: "APPS_SCRIPT_URL not configured" });
  }

  try {
    // Apps Script returns a 302 redirect. Follow it manually to preserve POST body.
    let response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(req.body),
      redirect: "follow",
    });

    // If we got a redirect response, follow it
    if (response.status === 302 || response.status === 301) {
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        response = await fetch(redirectUrl);
      }
    }

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: text.slice(0, 500) });
    }

    // Try to parse as JSON, otherwise return as text
    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch (e) {
      return res.status(200).json({ ok: true, response: text });
    }
  } catch (err) {
    console.error("Sheet proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
