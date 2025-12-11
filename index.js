import { useEffect, useRef, useState } from "react";

/**
 * Upgraded FaceAnalyzerSingleView
 * - Keeps your original logic & flow intact
 * - Adds a dark "system monitor" theme inspired by your screenshot:
 *   • Card-style preview with overlay status & duration
 *   • Clean start button layout (keeps existing mechanics)
 *   • System info card (camera & attempt info)
 *   • Styled single-line log entries with colorized severity
 *   • Responsive layout: mobile stacked (preview -> log), desktop side-by-side
 *
 * Notes:
 * - I intentionally preserved your function names & flow (startAndCaptureFlow, captureBlobFromVideo, etc.)
 * - Only UI/UX and a few small state fields were added to enable the appearance and status info.
 * - No external CSS files required — styles included via a CSS block inside component.
 */

const API_ENDPOINT = {
  url: "https://demo.api4ai.cloud/face-analyzer/v1/results",
  headers: {}
};

export default function FaceAnalyzerSingleView() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [sending, setSending] = useState(false);
  const [infoLog, setInfoLog] = useState([]);
  const [showStartButton, setShowStartButton] = useState(true);
  const abortRef = useRef(false);

  // New UI states
  const [status, setStatus] = useState("idle"); // idle | requesting | active | detecting | processing | error | success
  const [attempts, setAttempts] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedStartRef = useRef(null);
  const elapsedTimerRef = useRef(null);

  const pushLog = (text) => {
    // Keep logs single-line and concise; we add a severity tag for coloring later
    const entry = `${new Date().toLocaleString("id-ID")} — ${text}`.replace(/\n/g, " ");
    setInfoLog((p) => [entry, ...p].slice(0, 200)); // cap to 200 entries
    console.log(entry);
  };

  const resetAll = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPermissionGranted(false);
    setShowStartButton(true);
    setSending(false);
    abortRef.current = true;
    setStatus("idle");
    setAttempts(0);
    stopElapsedTimer();
    pushLog("Kembali ke kondisi awal.");
  };

  const startElapsedTimer = () => {
    elapsedStartRef.current = Date.now();
    setElapsedMs(0);
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - (elapsedStartRef.current || Date.now()));
    }, 250);
  };

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const startAndCaptureFlow = async () => {
    abortRef.current = false;
    setAttempts(0);
    setStatus("requesting");
    pushLog("Meminta izin kamera...");

    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });

      if (abortRef.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = s;
      setPermissionGranted(true);
      setShowStartButton(false);
      setStatus("active");
      startElapsedTimer();
      pushLog("Kamera aktif. Menunggu frame untuk menangkap foto...");

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        const playPromise = videoRef.current.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});
      }

      // Wait for a frame to be ready
      await new Promise((res) => {
        const video = videoRef.current;
        if (!video) return res();
        if (video.readyState >= 2) return res();
        const onLoaded = () => {
          video.removeEventListener("loadeddata", onLoaded);
          res();
        };
        video.addEventListener("loadeddata", onLoaded);
        setTimeout(res, 800); // fallback
      });

      // start capture loop until valid face detected or aborted
      let attempt = 0;
      const maxAttempts = 12; // safety to avoid infinite loop

      while (!abortRef.current) {
        attempt += 1;
        setAttempts(attempt);
        setStatus("detecting");
        pushLog(`Mengambil foto (percobaan ${attempt})...`);

        const capturedBlob = await captureBlobFromVideo();
        if (!capturedBlob) {
          pushLog("Gagal membuat blob dari video.");
          setStatus("error");
          break;
        }

        setSending(true);
        setStatus("processing");
        pushLog("Mengirim foto ke API...");

        try {
          const fd = new FormData();
          fd.append("image", capturedBlob, "face.jpg");

          const res = await fetch(API_ENDPOINT.url, {
            method: "POST",
            headers: API_ENDPOINT.headers,
            body: fd
          });

          const contentType = res.headers.get("content-type") || "";
          let result;
          if (contentType.includes("application/json")) result = await res.json();
          else result = await res.text();

          pushLog(`Status API: ${res.status}`);
          pushLog(`Response: ${typeof result === "string" ? result : JSON.stringify(result)}`);

          const valid = checkFaceValid(result);
          if (valid) {
            pushLog("Wajah terdeteksi valid. Proses selesai.");
            setStatus("success");
            cleanupAfterSuccess();
            break;
          } else {
            pushLog("Wajah tidak valid/tdk terdeteksi. Mencoba ulang...");
            setStatus("detecting");
            if (attempt >= maxAttempts) {
              pushLog(`Mencapai batas percobaan (${maxAttempts}). Menghentikan proses.`);
              setStatus("error");
              resetAll();
              break;
            }
            await new Promise((r) => setTimeout(r, 700));
          }
        } catch (err) {
          pushLog("Error kirim API: " + (err?.message || String(err)));
          setStatus("error");
          resetAll();
          break;
        } finally {
          setSending(false);
        }
      }
    } catch (err) {
      pushLog("Izin kamera ditolak atau error: " + (err?.message || String(err)));
      setStatus("error");
      resetAll();
    }
  };

  const captureBlobFromVideo = () => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return resolve(null);

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });
  };

  const checkFaceValid = (result) => {
    try {
      if (!result) return false;
      if (Array.isArray(result.faces) && result.faces.length > 0) return true;
      if (result.outputs && Array.isArray(result.outputs)) {
        for (const out of result.outputs) {
          if (out.entities && Array.isArray(out.entities)) {
            for (const ent of out.entities) {
              if (ent.type && ent.type.includes("face")) return true;
              if (ent.faces && Array.isArray(ent.faces) && ent.faces.length > 0) return true;
            }
          }
        }
      }
      const maybeFaces =
        result?.outputs?.[0]?.faces || result?.outputs?.[0]?.entities?.[0]?.faces;
      if (Array.isArray(maybeFaces) && maybeFaces.length > 0) return true;
    } catch (e) {
      // ignore parsing errors
    }
    return false;
  };

  const cleanupAfterSuccess = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPermissionGranted(false);
    setShowStartButton(false); // keep hidden per request
    abortRef.current = true;
    stopElapsedTimer();
  };

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      stopElapsedTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // small helper to format elapsed as MM:SS
  const formatElapsed = (ms) => {
    if (!ms) return "00:00";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // pick badge color for status
  const statusColor = {
    idle: "#6b7280",
    requesting: "#f59e0b",
    active: "#10b981",
    detecting: "#06b6d4",
    processing: "#7c3aed",
    error: "#ef4444",
    success: "#22c55e"
  }[status || "idle"];

  // classify log severity by keywords for coloring
  const classifyLog = (text) => {
    const t = text.toLowerCase();
    if (t.includes("error") || t.includes("gagal") || t.includes("ditolak") || t.includes("henti"))
      return "error";
    if (t.includes("berhasil") || t.includes("terdeteksi") || t.includes("sukses")) return "success";
    if (t.includes("mengirim") || t.includes("meminta") || t.includes("mencoba")) return "processing";
    return "info";
  };

  // Responsive layout break: use CSS below

  return (
    <div className="fa-root">
      <style>{`
        .fa-root {
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          color: #e6eef8;
          background: linear-gradient(180deg, #071022 0%, #071423 100%);
          min-height: 100vh;
          padding: 28px;
        }

        .fa-container {
          max-width: 1100px;
          margin: 0 auto;
        }

        .fa-title {
          display:flex;
          justify-content:space-between;
          align-items:center;
          margin-bottom:16px;
        }
        .fa-title h1 {
          font-size:20px;
          margin:0;
          color:#f8fafc;
        }
        .fa-latency {
          color:#a78bfa;
          font-weight:600;
        }

        .fa-grid {
          display:flex;
          gap:18px;
          align-items:flex-start;
          flex-wrap:wrap;
        }

        /* left column: preview */
        .fa-preview-card {
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
          border-radius:12px;
          padding:12px;
          width:100%;
          box-shadow: 0 6px 18px rgba(3,7,18,0.6);
          border: 1px solid rgba(255,255,255,0.03);
        }

        @media(min-width:900px) {
          .fa-preview-card { width: 640px; }
        }

        .fa-preview-inner {
          position:relative;
          border-radius:10px;
          overflow:hidden;
          background:#000;
        }

        .fa-video {
          display:block;
          width:100%;
          height:360px;
          object-fit:cover;
          background:#000;
        }

        .fa-overlay {
          position:absolute;
          left:12px;
          top:12px;
          background: rgba(7,11,22,0.6);
          backdrop-filter: blur(6px);
          padding:8px 10px;
          border-radius:8px;
          border: 1px solid rgba(255,255,255,0.03);
          display:flex;
          gap:12px;
          align-items:center;
        }

        .fa-badge {
          display:inline-flex;
          gap:8px;
          align-items:center;
          font-size:13px;
        }

        .fa-status-dot {
          width:10px;
          height:10px;
          border-radius:999px;
          display:inline-block;
          box-shadow: 0 0 10px rgba(0,0,0,0.6);
        }

        .fa-small {
          font-size:12px;
          color:#cbd5e1;
        }

        .fa-controls {
          margin-top:12px;
          display:flex;
          gap:12px;
          align-items:center;
          justify-content:space-between;
        }

        .fa-start-btn {
          background: linear-gradient(90deg,#6366f1,#8b5cf6);
          color:white;
          border:none;
          padding:10px 18px;
          border-radius:10px;
          cursor:pointer;
          font-weight:600;
          box-shadow: 0 6px 18px rgba(99,102,241,0.12);
        }

        .fa-start-btn[disabled] {
          opacity:0.6;
          cursor:not-allowed;
        }

        .fa-system-info {
          background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005));
          border-radius:12px;
          padding:12px;
          width:100%;
          border: 1px solid rgba(255,255,255,0.02);
          margin-top:12px;
          color:#cfe7ff;
          font-size:13px;
        }

        /* right column: log */
        .fa-log-card {
          flex:1;
          min-width:280px;
          border-radius:12px;
          padding:12px;
          background: linear-gradient(180deg, rgba(3,7,18,0.5), rgba(3,7,18,0.35));
          border: 1px solid rgba(255,255,255,0.02);
          box-shadow: 0 6px 18px rgba(2,6,14,0.6);
        }

        .fa-log-title {
          font-weight:700;
          color:#cbd5e1;
          margin-bottom:8px;
        }

        .fa-log-list {
          max-height:420px;
          overflow:auto;
          background: linear-gradient(180deg, rgba(2,6,23,0.6), rgba(2,6,23,0.45));
          padding:12px;
          border-radius:8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
          font-size:13px;
          color:#dbeafe;
          border: 1px solid rgba(255,255,255,0.015);
        }

        .fa-log-item { margin-bottom:10px; line-height:1.22; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .fa-log-item.info { color:#cfe7ff; }
        .fa-log-item.processing { color:#fcd34d; }
        .fa-log-item.success { color:#86efac; }
        .fa-log-item.error { color:#fca5a5; }

        .fa-meta-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px; }

        /* layout: mobile stacked, desktop 2-col */
        @media(min-width:900px) {
          .fa-grid { align-items:flex-start; }
          .fa-preview-card { flex-shrink:0; }
          .fa-log-card { width: 420px; }
        }
      `}</style>

      <div className="fa-container">
        <div className="fa-title">
          <h1>System Monitor · Face Analyzer (Demo)</h1>
          <div className="fa-latency">Demo UI theme</div>
        </div>

        <div className="fa-grid">
          {/* PREVIEW + SYSTEM INFO */}
          <div className="fa-preview-card">
            <div className="fa-preview-inner">
              <video
                ref={videoRef}
                className="fa-video"
                playsInline
                muted
                autoPlay
                style={{ background: "#000", objectFit: "cover" }}
              />

              {/* overlay: status + elapsed */}
              <div className="fa-overlay" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                <div className="fa-badge">
                  <span
                    className="fa-status-dot"
                    style={{ background: statusColor, boxShadow: `0 6px 18px ${statusColor}33` }}
                    aria-hidden
                  />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontWeight: 700, color: "#e6f0ff", fontSize: 13 }}>
                      {status === "idle" && "Idle"}
                      {status === "requesting" && "Meminta izin"}
                      {status === "active" && "Kamera aktif"}
                      {status === "detecting" && "Mendeteksi wajah"}
                      {status === "processing" && "Memproses"}
                      {status === "error" && "Error"}
                      {status === "success" && "Berhasil"}
                    </div>
                    <div className="fa-small">Durasi: {formatElapsed(elapsedMs)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="fa-controls">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {showStartButton && (
                  <button
                    onClick={startAndCaptureFlow}
                    disabled={sending || status === "requesting"}
                    className="fa-start-btn"
                  >
                    {sending ? "Mengirim..." : "Mulai"}
                  </button>
                )}

                {/* small status text */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 13, color: "#cfe7ff", fontWeight: 600 }}>
                    Permission:{" "}
                    <span style={{ color: permissionGranted ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
                      {permissionGranted ? "Granted" : "Not granted"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9fb7d9" }}>Attempts: {attempts}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="fa-small">Status:</div>
                <div
                  style={{
                    background: statusColor,
                    color: "#041018",
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 13
                  }}
                >
                  {status.toUpperCase()}
                </div>
              </div>
            </div>

            {/* system info card */}
            <div className="fa-system-info" aria-hidden={false}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#e6f0ff" }}>System Info</div>
                  <div style={{ marginTop: 8, color: "#bcd7f5" }}>
                    <div>Camera: {streamRef.current ? (streamRef.current.getVideoTracks()[0]?.label || "User Camera") : "—"}</div>
                    <div>Resolution: {videoRef.current?.videoWidth ? `${videoRef.current.videoWidth}×${videoRef.current.videoHeight}` : "—"}</div>
                    <div>Runtime: {formatElapsed(elapsedMs)}</div>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#9fb7d9" }}>Mode</div>
                  <div style={{ marginTop: 6, fontWeight: 700 }}>{sending ? "Sending" : "Idle"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* LOG card */}
          <div className="fa-log-card">
            <div className="fa-log-title">Log Aktivitas</div>

            <div className="fa-log-list" role="log" aria-live="polite">
              {infoLog.length === 0 ? (
                <div style={{ opacity: 0.6 }}>-- belum ada aktivitas --</div>
              ) : (
                infoLog.map((l, i) => {
                  const cls = classifyLog(l);
                  return (
                    <div key={i} className={`fa-log-item ${cls}`} title={l}>
                      {l}
                    </div>
                  );
                })
              )}
            </div>

            <div className="fa-meta-row" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "#9fb7d9" }}>Hints:</div>
              <div style={{ fontSize: 12, color: "#cfe7ff" }}>Logs are single-line, color-coded: errors (red), processing (yellow), success (green).</div>
            </div>
          </div>
        </div>

        {/* keep hidden canvas for capture */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}