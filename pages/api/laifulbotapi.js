import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } }
};

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method not allowed" });

  const { action, imageBase64, id } = req.body || {};

  if (!action) return res.status(400).json({ ok: false, error: "missing action" });

  async function sendToTelegram(base64, id) {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    const buffer = Buffer.from(base64, "base64");

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", id);
    form.append("photo", buffer, { filename: id });

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form
    });

    const json = await resp.json();
    return json.ok ? { ok: true } : { ok: false, error: json };
  }

  async function detectFace(base64) {
    const apiKey = process.env.API4AI_KEY;
    const buffer = Buffer.from(base64, "base64");

    const form = new FormData();
    form.append("image", buffer, { filename: "frame" });

    const resp = await fetch("https://api4ai.cloud/face-analyzer/v1/results", {
      method: "POST",
      headers: { "A4A-CLIENT-KEY": apiKey, ...form.getHeaders() },
      body: form
    });

    const json = await resp.json();
    return { ok: true, result: json };
  }

  try {
    if (action === "send") return res.json(await sendToTelegram(imageBase64, id));
    if (action === "detect") return res.json(await detectFace(imageBase64));
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}