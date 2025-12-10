import { useRef, useState, useEffect } from 'react'

export default function Home() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)

  const [running, setRunning] = useState(false)
  const [cameraStatus, setCameraStatus] = useState("off") // off, connected, failed
  const [moduleStatus, setModuleStatus] = useState("idle") // idle, proses, sukses, gagal
  const [logs, setLogs] = useState([])
  const [duration, setDuration] = useState(0)
  const [fps, setFps] = useState(0)
  const [resolution, setResolution] = useState("0x0")
  const [logStart, setLogStart] = useState(0)

  const version = "v5.81"
  const mode = "live stream"

  function uid(len = 10) {
    const c = "abcdefghijklmnopqrstuvwxyz0123456789"
    let s = ""
    for (let i = 0; i < len; i++) s += c[Math.floor(Math.random() * c.length)]
    return s
  }

  function addLog(type, msg) {
    setLogs(l => [...l, { id: uid(), t: Date.now(), type, msg }])
  }

  useEffect(() => {
    addLog("system", "build: starting…")
    setTimeout(() => addLog("system", "build: compiling modules…"), 300)
    setTimeout(() => addLog("system", "build: ready."), 600)
  }, [])

  useEffect(() => {
    let timer
    if (running) {
      timer = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    }
    return () => clearInterval(timer)
  }, [running])

  async function startCamera() {
    addLog("system", "requesting camera permission…")
    setModuleStatus("proses")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraStatus("connected")
      const track = stream.getVideoTracks()[0]
      const s = track.getSettings()
      setResolution(`${s.width || 640}x${s.height || 480}`)
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      startTimeRef.current = Date.now()
      setRunning(true)

      let frames = 0
      let t0 = performance.now()

      intervalRef.current = setInterval(() => {
        capture()
        frames++
        const now = performance.now()
        if (now - t0 >= 1000) {
          setFps(frames)
          frames = 0
          t0 = now
        }
      }, 1000)

      addLog("system", "camera permission granted. start capture.")
    } catch (err) {
      addLog("error", "permission denied or device error.")
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

    if (stopStream && videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }

    if (cameraStatus !== "failed") setCameraStatus("off")
    addLog("system", "stopped all.")
  }

  function toggle() {
    if (running) {
      addLog("system", "user pressed STOP")
      stopAll()
    } else {
      addLog("system", "user pressed START")
      startCamera()
    }
  }

  function capture() {
    const v = videoRef.current
    if (!v) return
    const w = v.videoWidth || 640
    const h = v.videoHeight || 480

    canvasRef.current.width = w
    canvasRef.current.height = h
    const ctx = canvasRef.current.getContext("2d")
    ctx.drawImage(v, 0, 0, w, h)

    const id = uid(12)
    const conf = (Math.random() * 0.5 + 0.5).toFixed(2)

    addLog("detect", `face uid:${id} conf:${conf}`)

    canvasRef.current.toBlob(blob => {
      addLog("system", `photo blob -> uid:${id} size:${blob?.size || 0}`)
      if (Math.random() > 0.85) {
        setModuleStatus("sukses")
        addLog("system", "module sukses")
      }
    })
  }

  const visibleLogs = logs.slice(logStart, logStart + 12)

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={{ fontWeight: 700 }}>Face Detect Demo</div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={running ? styles.btnStop : styles.btnStart}
            onClick={toggle}
          >
            {running ? "STOP" : "START"}
          </button>
          <div style={styles.info}>Mode: {mode}</div>
          <div style={styles.info}>Versi: {version}</div>
          <div style={styles.info}>Durasi: {duration}s</div>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.monitor}>
          {running && cameraStatus === "connected" ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={styles.video}
            />
          ) : (
            <div style={styles.monitorOff}>
              {cameraStatus === "failed" ? "CAMERA FAILED" : "MONITOR OFF"}
            </div>
          )}
        </div>

        <div style={styles.sidebar}>

          {/* SYSTEM INFO */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>System Info</div>

            <div style={styles.row}><span>Status Kamera</span><b>{cameraStatus}</b></div>
            <div style={styles.row}><span>Module Status</span><b>{moduleStatus}</b></div>
            <div style={styles.row}><span>FPS</span><b>{fps}</b></div>
            <div style={styles.row}><span>Resolusi</span><b>{resolution}</b></div>
          </div>

          {/* LOGS */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Logs ({logs.length})</div>

            <div style={styles.logBox}>
              {visibleLogs.map(l => (
                <div key={l.id} style={styles.logItem}>
                  <span style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(l.t).toLocaleTimeString()}
                  </span>
                  <div>{l.msg}</div>
                </div>
              ))}
            </div>

            {logs.length > 12 && (
              <input
                type="range"
                min={0}
                max={logs.length - 12}
                value={logStart}
                onChange={e => setLogStart(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            )}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  )
}

const styles = {
  page: {
    padding: 20,
    background: "#0f172a",
    minHeight: "100vh",
    color: "#e2e8f0",
    fontFamily: "sans-serif"
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 20,
    alignItems: "center"
  },
  btnStart: {
    background: "#22c55e",
    color: "#052e16",
    padding: "8px 14px",
    border: "0",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  },
  btnStop: {
    background: "#ef4444",
    color: "white",
    padding: "8px 14px",
    border: "0",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  },
  info: {
    background: "rgba(255,255,255,0.05)",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 13
  },
  main: {
    display: "flex",
    gap: 20
  },
  monitor: {
    flex: 1,
    background: "black",
    height: 400,
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  monitorOff: {
    color: "#94a3b8",
    fontSize: 18
  },
  sidebar: {
    width: 350,
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  card: {
    padding: 14,
    background: "#1e293b",
    borderRadius: 10
  },
  cardTitle: {
    fontWeight: 700,
    marginBottom: 10
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.05)"
  },
  logBox: {
    maxHeight: 250,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  logItem: {
    background: "rgba(255,255,255,0.05)",
    padding: 8,
    borderRadius: 6,
    fontSize: 13
  }
}
