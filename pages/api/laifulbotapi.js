// pages/api/laifulbotapi.js
import FormData from 'form-data';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb' // allow larger images
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { action, imageBase64, filename = 'photo.jpg', caption = '', extra = {} } = req.body || {};

  if (!action) return res.status(400).json({ ok: false, error: 'missing action' });

  // Helper: send photo to Telegram bot
  async function sendPhotoToTelegram(base64, fname, cap) {
    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return { ok: false, error: 'telegram config missing' };

    try {
      const buffer = Buffer.from(base64, 'base64');
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', cap || '');
      form.append('photo', buffer, { filename: fname });

      const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: form.getHeaders(),
        body: form
      });
      const json = await resp.json();
      if (!json.ok) return { ok: false, error: json };
      return { ok: true, result: json.result };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  // Helper: call api4.ai face-analysis
  async function callFaceAnalyzeAPI(base64) {
    const apiKey = process.env.API4AI_KEY;
    if (!apiKey) return { ok: false, error: 'api4ai key missing' };

    try {
      const buffer = Buffer.from(base64, 'base64');
      const form = new FormData();
      form.append('image', buffer, { filename: filename });

      // use official endpoint
      const endpoint = 'https://api4ai.cloud/face-analyzer/v1/results';
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'A4A-CLIENT-KEY': apiKey
        },
        body: form
      });
      const json = await resp.json();
      return { ok: true, result: json };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  // Routes
  try {
    if (action === 'sendPhoto') {
      if (!imageBase64) return res.status(400).json({ ok: false, error: 'missing imageBase64' });
      const send = await sendPhotoToTelegram(imageBase64, filename, caption || '');
      if (!send.ok) return res.status(500).json(send);
      return res.status(200).json(send);
    }

    if (action === 'faceAnalyze') {
      if (!imageBase64) return res.status(400).json({ ok: false, error: 'missing imageBase64' });
      const result = await callFaceAnalyzeAPI(imageBase64);
      if (!result.ok) return res.status(500).json(result);
      return res.status(200).json({ ok: true, result: result.result });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}