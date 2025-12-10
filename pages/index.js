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

  useEffect(() => {
    addLog("build", "build: starting...")
    setTimeout(() => addLog("build", "build: compiling modules..."), 300)
    setTimeout(() => addLog("build", "build: ready"), 700)
  }, [])

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

  useEffect(() => {
    if (logs.length <= 12) setLogStart(0)
    else if (logStart > logs.length - 12) setLogStart(Math.max(0, logs.length - 12))
  }, [logs.length])

  async function startCamera() {
    addLog("system", "requesting camera permission...")
    setModuleStatus("proses")

    try {
      // try enumerateDevices to pick front camera if available
      let devices = []
      try {
        devices = await navigator.mediaDevices.enumerateDevices()
      } catch (e) {
        addLog("system", "enumerateDevices failed: " + (e?.message || e))
      }

      const videoInputs = devices.filter((d) => d.kind === "videoinput")
      let preferredDeviceId = null

      if (videoInputs.length) {
        // prefer devices with labels containing common front-camera keywords
        const front = videoInputs.find((d) => /front|facing|user|selfie/i.test(d.label))
        if (front) preferredDeviceId = front.deviceId
        else {
          // fallback heuristic: many mobiles list front camera last
          preferredDeviceId = videoInputs.length > 1 ? videoInputs[videoInputs.length - 1].deviceId : videoInputs[0].deviceId
        }
      }

      let stream = null
      const baseConstraints = { audio: false }

      if (preferredDeviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            ...baseConstraints,
            video: { deviceId: { exact: preferredDeviceId } },
          })
          addLog("system", "opened preferred deviceId camera")
        } catch (e) {
          addLog("system", "failed open deviceId, will fallback to facingMode:user -> " + (e?.message || e))
          stream = null
        }
      }

      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            ...baseConstraints,
            video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
          })
          addLog("system", "opened facingMode:user camera")
        } catch (e) {
          addLog("system", "facingMode:user failed -> " + (e?.message || e))
          // final generic fallback
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
          addLog("system", "opened generic video camera")
        }
      }

      if (!stream) throw new Error("no-stream")

      setCameraStatus("connected")
      const track = stream.getVideoTracks()[0]
      const s = track.getSettings ? track.getSettings() : {}
      setResolution(`${s.width || 480}x${s.height || 640}`)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
          setPreviewActive(true)
          addLog("system", "video.play() ok, preview active")
        } catch (playErr) {
          setPreviewActive(!!videoRef.current.srcObject)
          addLog("error", "video.play() failed: " + (playErr?.message || playErr))
        }
      } else {
        setPreviewActive(true)
      }

      startTimeRef.current = Date.now()
      setRunning(true)

      // capture interval (1s)
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

    const detectionUid = uid(14)
    const conf = (Math.random() * 0.4 + 0.5).toFixed(2)
    addLog("detect", `detected face uid:${detectionUid} confidence:${conf}`)

    c.toBlob((blob) => {
      addLog("system", `photo captured -> uid:${detectionUid} (blob size:${blob?.size || 0})`)
      if (Math.random() > 0.85) {
        setModuleStatus("sukses")
        addLog("system", "module status: sukses")
      } else {
        setModuleStatus("proses")
      }
    }, "image/png")
  }

  const visibleLogs = logs.slice(logStart, logStart + 12)

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={{ fontWeight: 700 }}>Face Detect Demo</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={toggleStartStop} style={running ? styles.btnStop : styles.btnStart}>
            {running ? "STOP" : "START"}
          </button>

          <div style={styles.badge}>Mode: {mode}</div>
          <div style={styles.badge}>Versi: {version}</div>
          <div style={styles.badge}>Durasi: {duration}s</div>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.monitorWrap}>
          <div style={styles.monitorFrame}>
            <div style={styles.screen}>
              {(previewActive || (videoRef.current && videoRef.current.srcObject)) ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
                  <div style={styles.overlayTop}>
                    <div style={styles.recDotRow}>
                      <div style={styles.recDot} />
                      <div style={{ marginLeft: 8, fontSize: 13 }}>REC</div>
                    </div>
                    <div style={{ fontSize: 13 }}>{resolution}</div>
                  </div>

                  <div style={styles.overlayBottom}>
                    <div style={{ fontSize: 13 }}>Preview • Live camera</div>
                    <div style={{ fontSize: 13 }}>FPS: {fps} • Logs: {logs.length}</div>
                  </div>

                  <div style={styles.detectBox} />
                </>
              ) : (
                <div style={styles.monitorOff}>
                  {cameraStatus === "failed" ? "CAMERA FAILED — permission or device error" : "MONITOR OFF — press START"}
                </div>
              )}
            </div>

            <div style={styles.bezel}>
              <div style={styles.bezelLeft} />
              <div style={styles.bezelRight} />
            </div>
          </div>

          <div style={styles.monitorFooter}>
            <div>Module: {moduleStatus}</div>
            <div>Elapsed: {duration}s</div>
          </div>
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
  monitorWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  monitorFrame: {
    borderRadius: 12,
    padding: 12,
    background: "linear-gradient(180deg,#0b1220,#071027)",
    boxShadow: "0 12px 40px rgba(2,6,23,0.6)",
  },
  screen: {
    position: "relative",
    width: "100%",
    height: 420,
    background: "#000",
    borderRadius: 8,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  overlayTop: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    pointerEvents: "none",
    color: "#fff",
    opacity: 0.95,
  },
  overlayBottom: {
    position: "absolute",
    bottom: 10,
    left: 12,
    right: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    pointerEvents: "none",
    color: "#fff",
    opacity: 0.85,
  },
  recDotRow: {
    display: "flex",
    alignItems: "center",
    fontWeight: 700,
    color: "#fff",
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ff2b2b",
    boxShadow: "0 0 8px rgba(255,43,43,0.9)",
  },
  detectBox: {
    position: "absolute",
    width: "40%",
    height: "30%",
    border: "2px dashed rgba(255,255,255,0.18)",
    borderRadius: 8,
    top: "35%",
    left: "30%",
    pointerEvents: "none",
    boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)",
  },
  bezel: {
    marginTop: 8,
    display: "flex",
    justifyContent: "space-between",
  },
  bezelLeft: {
    width: 60,
    height: 8,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 6,
  },
  bezelRight: {
    width: 140,
    height: 8,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 6,
  },
  monitorOff: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    padding: 12,
  },
  monitorFooter: {
    display: "flex",
    justifyContent: "space-between",
    color: "#9fb6d9",
    fontSize: 13,
    paddingTop: 6,
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