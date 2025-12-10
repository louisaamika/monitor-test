import { useRef, useState, useEffect } from "react"

export default function Home() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)

  const [running, setRunning] = useState(false)
  const [cameraStatus, setCameraStatus] = useState("off") // off, connected, failed
  const [previewActive, setPreviewActive] = useState(false)
  const [moduleStatus, setModuleStatus] = useState("idle") // idle, proses, sukses, gagal
  const [logs, setLogs] = useState([])
  const [duration, setDuration] = useState(0)
  const [fps, setFps] = useState(0)
  const [resolution, setResolution] = useState("0x0")
  const [logStart, setLogStart] = useState(0)

  const version = "v5.81"
  const mode = "live stream"

  function uid(len = 12) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    let s = ""
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  function addLog(type, msg) {
    setLogs((l) => [...l, { id: uid(10), t: Date.now(), type, msg }])
  }

  // initial build logs (demo)
  useEffect(() => {
    addLog("build", "build: starting...")
    setTimeout(() => addLog("build", "build: compiling modules..."), 300)
    setTimeout(() => addLog("build", "build: ready"), 700)
  }, [])

  // duration timer
  useEffect(() => {
    let timer
    if (running && startTimeRef.current) {
      timer = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    } else {
      setDuration(0)
    }
    return () => clearInterval(timer)
  }, [running])

  // auto scroll windowStart if logs shrink/grow
  useEffect(() => {
    if (logs.length <= 12) setLogStart(0)
    else if (logStart > logs.length - 12) setLogStart(Math.max(0, logs.length - 12))
  }, [logs.length])

  async function startCamera() {
    addLog("system", "requesting camera permission...")
    setModuleStatus("proses")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      setCameraStatus("connected")

      // set resolution from track settings if available
      const track = stream.getVideoTracks()[0]
      const s = track.getSettings()
      setResolution(`${s.width || 640}x${s.height || 480}`)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
          setPreviewActive(true)
          addLog("system", "video.play() ok, preview active")
        } catch (playErr) {
          // autoplay policies can block play(); preview still considered active if srcObject exists
          setPreviewActive(!!videoRef.current.srcObject)
          addLog("error", "video.play() failed: " + (playErr?.message || playErr))
        }
      } else {
        setPreviewActive(true)
      }

      startTimeRef.current = Date.now()
      setRunning(true)

      // start capture interval: 1 photo per second (demo)
      let frames = 0
      let t0 = performance.now()
      intervalRef.current = setInterval(() => {
        captureOnce()
        frames++
        const now = performance.now()
        if (now - t0 >= 1000) {
          setFps(frames)
          frames = 0
          t0 = now
        }
      }, 1000)

      addLog("system", "camera permission granted. auto-capture started (1s).")
    } catch (err) {
      addLog("error", "camera permission denied or device error: " + (err?.message || err))
      setCameraStatus("failed")
      setModuleStatus("gagal")
      stopAll(false)
    }
  }

  function stopAll(stopStream = true) {
    setRunning(false)
    setModuleStatus("idle")

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const stream = videoRef.current?.srcObject
    if (stream && stopStream) {
      try {
        stream.getTracks().forEach((t) => t.stop())
      } catch (e) {
        // ignore
      }
      if (videoRef.current) videoRef.current.srcObject = null
    }

    setPreviewActive(false)
    if (cameraStatus !== "failed") setCameraStatus("off")
    addLog("system", "stopped all processes.")
  }

  function toggleStartStop() {
    if (running) {
      addLog("system", "user pressed STOP")
      stopAll()
    } else {
      addLog("system", "user pressed START")
      startCamera()
    }
  }

  function captureOnce() {
    const v = videoRef.current
    if (!v) {
      addLog("error", "capture aborted: video element not ready")
      return
    }
    const w = v.videoWidth || 640
    const h = v.videoHeight || 480
    const c = canvasRef.current
    c.width = w
    c.height = h
    const ctx = c.getContext("2d")
    ctx.drawImage(v, 0, 0, w, h)

    // simulate face detection: emit a log with UID, no filename
    const detectionUid = uid(14)
    const conf = (Math.random() * 0.4 + 0.5).toFixed(2)
    addLog("detect", `detected face uid:${detectionUid} confidence:${conf}`)

    // produce a blob just to simulate size and add a system log (no filename)
    c.toBlob((blob) => {
      addLog("system", `photo captured -> uid:${detectionUid} (blob size:${blob?.size || 0})`)
      // occasionally mark success
      if (Math.random() > 0.85) {
        setModuleStatus("sukses")
        addLog("system", "module status: sukses")
      } else {
        setModuleStatus("proses")
      }
    }, "image/png")
  }

  // visible logs window
  const visibleLogs = logs.slice(logStart, logStart + 12)

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={{ fontWeight: 700 }}>Face Detect Demo</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={toggleStartStop}
            style={running ? styles.btnStop : styles.btnStart}
          >
            {running ? "STOP" : "START"}
          </button>

          <div style={styles.badge}>Mode: {mode}</div>
          <div style={styles.badge}>Versi: {version}</div>
          <div style={styles.badge}>Durasi: {duration}s</div>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.monitor}>
          {(previewActive || (videoRef.current && videoRef.current.srcObject)) ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={styles.video}
            />
          ) : (
            <div style={styles.monitorOff}>
              {cameraStatus === "failed" ? "CAMERA FAILED — permission or device error" : "MONITOR OFF — press START"}
            </div>
          )}
        </div>

        <div style={styles.sidebar}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>System Info</div>
            <div style={styles.row}><span>Status Kamera</span><b>{cameraStatus}</b></div>
            <div style={styles.row}><span>Mode</span><b>{mode}</b></div>
            <div style={styles.row}><span>Versi Modul</span><b>{version}</b></div>
            <div style={styles.row}><span>Status Modul</span><b>{moduleStatus}</b></div>
            <div style={styles.row}><span>FPS</span><b>{fps}</b></div>
            <div style={styles.row}><span>Resolusi</span><b>{resolution}</b></div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Logs ({logs.length})</div>
            <div style={styles.logBox}>
              {visibleLogs.length === 0 && <div style={styles.logEmpty}>no logs yet</div>}
              {visibleLogs.map((l) => (
                <div key={l.id} style={{ ...styles.logItem, ...(colorForType(l.type)) }}>
                  <div style={styles.logTime}>{new Date(l.t).toLocaleTimeString()}</div>
                  <div style={styles.logText}>{l.msg}</div>
                </div>
              ))}
            </div>

            {logs.length > 12 && (
              <input
                type="range"
                min={0}
                max={Math.max(0, logs.length - 12)}
                value={logStart}
                onChange={(e) => setLogStart(Number(e.target.value))}
                style={{ width: "100%", marginTop: 8 }}
              />
            )}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* inline styles */}
      <style jsx>{`
        @media (max-width: 900px) {
          .responsive-main {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}

// small helper to color log items by type
function colorForType(t) {
  if (t === "error") return { background: "rgba(255,107,107,0.08)" }
  if (t === "detect") return { background: "rgba(99,102,241,0.06)" }
  if (t === "system") return { background: "rgba(34,197,94,0.04)" }
  if (t === "build") return { background: "rgba(59,130,246,0.04)" }
  return { background: "rgba(255,255,255,0.02)" }
}

const styles = {
  page: {
    padding: 18,
    background: "#071027",
    minHeight: "100vh",
    color: "#e6eef8",
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  btnStart: {
    background: "linear-gradient(90deg,#22c55e,#16a34a)",
    color: "#04260f",
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnStop: {
    background: "linear-gradient(90deg,#ef4444,#dc2626)",
    color: "#fff",
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
  },
  badge: {
    background: "rgba(255,255,255,0.04)",
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 13,
  },
  main: {
    display: "flex",
    gap: 18,
    alignItems: "flex-start",
  },
  monitor: {
    flex: 1,
    background: "#000",
    borderRadius: 10,
    height: 420,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  monitorOff: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    padding: 12,
  },
  sidebar: {
    width: 360,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  card: {
    padding: 12,
    background: "linear-gradient(180deg,#041827,#071229)",
    borderRadius: 10,
  },
  cardTitle: {
    fontWeight: 800,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px dashed rgba(255,255,255,0.03)",
  },
  logBox: {
    maxHeight: 260,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  logEmpty: {
    color: "#94a3b8",
    padding: 10,
    textAlign: "center",
  },
  logItem: {
    padding: 8,
    borderRadius: 8,
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  logTime: {
    minWidth: 70,
    fontFamily: "monospace",
    fontSize: 12,
    opacity: 0.8,
    color: "#9fb6d9",
  },
  logText: {
    fontSize: 13,
    color: "#e6f0ff",
  },
}