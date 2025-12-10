// pages/api/laifulbotapi.js
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: { bodyParser: { sizeLimit: "32mb" } } // beri margin lebih besar
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API4AI_KEY = process.env.API4AI_KEY;
const USE_DEMO = process.env.USE_DEMO === "true" || false; // set USE_DEMO=true di .env.local untuk demo

async function sendToTelegram(base64, id) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    return { ok: false, error: "telegram-config-missing" };
  }
  try {
    const buffer = Buffer.from(base64, "base64");
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    form.append("caption", id);
    form.append("photo", buffer, { filename: id });

    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form
    });
    const json = await resp.json();
    if (!json.ok) return { ok: false, error: json };
    return { ok: true, result: json.result };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function callFaceAnalyzer(base64) {
  // pilih endpoint
  const endpoint = USE_DEMO
    ? "https://demo.api4ai.cloud/face-analyzer/v1/results"
    : "https://api4ai.cloud/face-analyzer/v1/results";

  if (!API4AI_KEY && !USE_DEMO) {
    return { ok: false, error: "api4ai-key-missing" };
  }

  try {
    const buffer = Buffer.from(base64, "base64");
    const form = new FormData();
    // API expects field "image"
    form.append("image", buffer, { filename: "frame.jpg" });

    const headers = {
      ...form.getHeaders()
    };
    // pass key both ways: some examples use X-API-KEY, some A4A-CLIENT-KEY
    if (!USE_DEMO) {
      headers["X-API-KEY"] = API4AI_KEY;
      headers["A4A-CLIENT-KEY"] = API4AI_KEY;
    }

    const resp = await fetch(endpoint, { method: "POST", headers, body: form, timeout: 60000 });
    // check status
    if (resp.status === 413) return { ok: false, error: "request-too-large" };
    if (resp.status >= 400) {
      const t = await resp.text();
      return { ok: false, error: `api4ai-status-${resp.status}`, detail: t };
    }
    const json = await resp.json();

    // handle API-level failure in response body
    const results = json?.results || json?.result || [];
    if (!Array.isArray(results) || results.length === 0) {
      // no results, return raw
      return { ok: true, faces: 0, raw: json };
    }

    const r0 = results[0];
    // status.code may be 'failure'
    if (r0?.status?.code && r0.status.code !== "ok") {
      return { ok: true, faces: 0, status_code: r0.status.code, status_msg: r0.status.message, raw: json };
    }

    // Try to count objects -> results[0].entities[*].objects[*]
    let faces = 0;
    try {
      const entities = r0.entities || [];
      for (const ent of entities) {
        if (Array.isArray(ent.objects)) faces += ent.objects.length;
        // some structures may nest in ent.objects[*].entities...
      }
    } catch (e) {
      // ignore parse errors
    }

    return { ok: true, faces, raw: json };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method-not-allowed" });

  const { action, imageBase64, id } = req.body || {};
  if (!action) return res.status(400).json({ ok: false, error: "missing-action" });

  try {
    if (action === "send") {
      if (!imageBase64 || !id) return res.status(400).json({ ok: false, error: "missing-image-or-id" });
      const out = await sendToTelegram(imageBase64, id);
      return res.status(out.ok ? 200 : 500).json(out);
    }

    if (action === "detect") {
      if (!imageBase64) return res.status(400).json({ ok: false, error: "missing-image" });
      const out = await callFaceAnalyzer(imageBase64);
      return res.status(out.ok ? 200 : 500).json(out);
    }

    return res.status(400).json({ ok: false, error: "unknown-action" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}