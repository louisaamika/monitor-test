import React, { useEffect, useRef, useState } from 'react';

// Face Analyzer - Themed to match provided dashboard colors (deep navy + cyan/green/purple accents).
// Single-file React component. No external panel/editor required.
// Keep original mechanics (start → ask permission → start view / logs / hide button; handle denied permission).
//
// Notes:
// - You can drop this file into a React app. It uses inline styles + utility classes; Tailwind classnames are left
//   for convenience but styling is mainly controlled via the color variables below so it also works with plain CSS setups.

const API_ENDPOINT = {
  url: 'https://demo.api4ai.cloud/face-analyzer/v1/results',
  headers: {}
};

export default function FaceAnalyzerSingleView() {
  // refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef = useRef(false);

  // state
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [sending, setSending] = useState(false);
  const [infoLog, setInfoLog] = useState([]); // entries: { ts, text, level }
  const [showStartButton, setShowStartButton] = useState(true);
  const [status, setStatus] = useState('idle'); // idle, requesting, active, detecting, processing, success, error
  const [startAt, setStartAt] = useState(null);
  const [detectedAt, setDetectedAt] = useState(null);

  // theme colours (match screenshot feel)
  const THEME = {
    background: '#081026', // deep navy
    card: '#0b1220', // card dark
    cardBorder: 'rgba(255,255,255,0.03)',
    accentCyan: '#57d7ff',
    accentGreen: '#39e07a',
    accentPurple: '#b77bff',
    mutedText: 'rgba(220,230,255,0.55)',
    logBg: 'rgba(6,12,22,0.6)'
  };

  const pushLog = (text, level = 'info') => {
    const entry = { ts: new Date(), text, level };
    setInfoLog((p) => [entry, ...p].slice(0, 300));
    // keep console debug
    console.log(`${entry.ts.toLocaleString('id-ID')} — [${level}] ${text}`);
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
    setStatus('idle');
    setStartAt(null);
    setDetectedAt(null);
    pushLog('Kembali ke kondisi awal.', 'warn');
  };

  const startAndCaptureFlow = async () => {
    abortRef.current = false;
    setStatus('requesting');
    pushLog('Meminta izin kamera...', 'info');

    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (abortRef.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = s;
      setPermissionGranted(true);
      setShowStartButton(false);
      setStatus('active');
      setStartAt(new Date());
      pushLog('Izin diberikan. Kamera aktif.', 'success');

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        const playPromise = videoRef.current.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});
      }

      // wait for a stabilized frame
      await new Promise((res) => {
        const video = videoRef.current;
        if (!video) return res();
        if (video.readyState >= 2) return res();
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          res();
        };
        video.addEventListener('loadeddata', onLoaded);
        setTimeout(res, 800);
      });

      // capture loop
      let attempt = 0;
      const maxAttempts = 12;

      while (!abortRef.current) {
        attempt += 1;
        setStatus('detecting');
        pushLog(`Mengambil foto (percobaan ${attempt})...`, 'info');
        const capturedBlob = await captureBlobFromVideo();
        if (!capturedBlob) {
          pushLog('Gagal membuat blob dari video.', 'error');
          break;
        }

        setSending(true);
        setStatus('processing');
        pushLog('Mengirim foto ke API...', 'info');

        try {
          const fd = new FormData();
          fd.append('image', capturedBlob, 'face.jpg');

          const res = await fetch(API_ENDPOINT.url, {
            method: 'POST',
            headers: API_ENDPOINT.headers,
            body: fd
          });

          const contentType = res.headers.get('content-type') || '';
          let result;
          if (contentType.includes('application/json')) result = await res.json();
          else result = await res.text();

          pushLog(`Status API: ${res.status}`, 'info');

          const valid = checkFaceValid(result);
          if (valid) {
            pushLog('Wajah terdeteksi valid. Proses selesai.', 'success');
            setDetectedAt(new Date());
            setStatus('success');
            cleanupAfterSuccess();
            break;
          } else {
            pushLog('Wajah tidak valid atau tidak terdeteksi. Mencoba ulang...', 'warn');
            if (attempt >= maxAttempts) {
              pushLog(`Mencapai batas percobaan (${maxAttempts}). Menghentikan proses.`, 'error');
              resetAll();
              break;
            }
            await new Promise((r) => setTimeout(r, 700));
          }
        } catch (err) {
          pushLog('Error kirim API: ' + (err.message || err), 'error');
          setStatus('error');
          resetAll();
          break;
        } finally {
          setSending(false);
        }
      }
    } catch (err) {
      pushLog('Izin kamera ditolak atau error: ' + (err.message || err), 'error');
      setStatus('error');
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
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
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
              if (ent.type && ent.type.includes('face')) return true;
              if (ent.faces && Array.isArray(ent.faces) && ent.faces.length > 0) return true;
            }
          }
        }
      }
      const maybeFaces = result?.outputs?.[0]?.faces || result?.outputs?.[0]?.entities?.[0]?.faces;
      if (Array.isArray(maybeFaces) && maybeFaces.length > 0) return true;
    } catch (e) {}
    return false;
  };

  const cleanupAfterSuccess = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPermissionGranted(false);
    // keep button hidden per request
    setShowStartButton(false);
    abortRef.current = true;
  };

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const renderDuration = () => {
    if (!startAt) return '--';
    const end = detectedAt || new Date();
    const ms = Math.max(0, end - startAt);
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return `${h}h ${m}m ${s}s`;
  };

  const renderLogLine = (entry, idx) => {
    const time = entry.ts.toLocaleTimeString('id-ID');
    const color = entry.level === 'error'
      ? THEME.accentPurple // use purple for errors to match screenshot purple emphasis
      : entry.level === 'warn'
        ? THEME.accentGreen
        : entry.level === 'success'
          ? THEME.accentGreen
          : THEME.accentCyan;

    const style = {
      color,
      whiteSpace: 'pre-wrap'
    };

    return (
      <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.25 }}>
        <div style={{ width: 70, color: THEME.mutedText, fontSize: 12 }}>{time}</div>
        <div style={style}>{entry.text}</div>
      </div>
    );
  };

  // small UI helpers
  const statusLabel = () => {
    switch (status) {
      case 'idle': return 'OFF';
      case 'requesting': return 'Meminta izin';
      case 'active': return 'ON';
      case 'detecting': return 'Mendeteksi wajah';
      case 'processing': return 'Memproses';
      case 'success': return 'Berhasil';
      case 'error': return 'Error';
      default: return status;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: THEME.background, color: '#e6eefc', padding: 24, fontFamily: 'Inter, system-ui, -apple-system, Roboto, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Kamera & Face Analyzer</div>
            <div style={{ color: THEME.mutedText, fontSize: 13, marginTop: 4 }}>Tema: deep navy • aksen cyan / green / purple</div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: `1px solid ${THEME.cardBorder}`, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{
                height: 10,
                width: 10,
                borderRadius: 999,
                background: (status === 'active' || status === 'detecting' || status === 'processing') ? '#f5a623' : (status === 'success' ? THEME.accentGreen : (status === 'error' ? THEME.accentPurple : '#314156'))
              }} />
              <div style={{ fontWeight: 600, fontSize: 13 }}>{status.toUpperCase()}</div>
            </div>

            <div style={{ padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: `1px solid ${THEME.cardBorder}`, fontSize: 13, color: THEME.mutedText }}>
              Durasi: <span style={{ marginLeft: 8, color: '#fff', fontWeight: 600 }}>{renderDuration()}</span>
            </div>

            <div>
              {showStartButton && (
                <button
                  onClick={startAndCaptureFlow}
                  disabled={sending}
                  style={{
                    background: `linear-gradient(90deg, ${THEME.accentCyan} 0%, ${THEME.accentPurple} 100%)`,
                    color: '#081026',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: 999,
                    fontWeight: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                  }}
                >
                  {sending ? 'Mengirim...' : 'Mulai'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* main layout (responsive) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {/* use CSS media query inline via style attribute isn't straightforward; adopt simple responsive layout via wrapping */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* preview card */}
            <div style={{
              borderRadius: 14,
              padding: 14,
              background: `linear-gradient(180deg, rgba(8,12,22,0.95), rgba(6,10,18,0.92))`,
              border: `1px solid ${THEME.cardBorder}`,
              boxShadow: '0 10px 30px rgba(2,8,20,0.6)'
            }}>
              <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000', border: `1px solid rgba(255,255,255,0.02)` }}>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{ width: '100%', height: 360, objectFit: 'cover', background: '#000' }}
                />

                {/* overlay status card */}
                <div style={{ position: 'absolute', left: 12, top: 12, background: 'rgba(8,12,20,0.6)', padding: 8, borderRadius: 10, border: `1px solid rgba(255,255,255,0.03)`, color: THEME.mutedText }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dbeafe' }}>Preview Kamera</div>
                </div>

                <div style={{ position: 'absolute', left: 12, bottom: 12, right: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 12, background: 'rgba(5,9,16,0.6)', backdropFilter: 'blur(6px)', border: `1px solid rgba(255,255,255,0.02)` }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: (status === 'active' || status === 'detecting' || status === 'processing') ? '#f5a623' : (status === 'success' ? THEME.accentGreen : (status === 'error' ? THEME.accentPurple : '#2f3d49'))
                    }} />
                    <div>
                      <div style={{ fontSize: 11, color: THEME.mutedText }}>Status</div>
                      <div style={{ fontSize: 14, color: '#e6eefc', fontWeight: 700 }}>{statusLabel()}</div>
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 12, background: 'rgba(5,9,16,0.6)', border: `1px solid rgba(255,255,255,0.02)`, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: THEME.mutedText }}>Waktu aktif</div>
                    <div style={{ fontSize: 14, color: '#e6eefc', fontWeight: 700 }}>{renderDuration()}</div>
                  </div>
                </div>
              </div>

              {/* system info + control row */}
              <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240, background: THEME.card, borderRadius: 12, padding: 12, border: `1px solid ${THEME.cardBorder}` }}>
                  <div style={{ fontSize: 13, color: THEME.mutedText }}>System Info</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: '#dbeafe' }}>
                    <div><strong>Izin Kamera:</strong> <span style={{ color: '#fff', marginLeft: 6 }}>{permissionGranted ? 'Diberikan' : (status === 'error' ? 'Error / Ditolak' : 'Belum')}</span></div>
                    <div style={{ marginTop: 6 }}><strong>Status:</strong> <span style={{ marginLeft: 6 }}>{status}</span></div>
                    <div style={{ marginTop: 6 }}><strong>Percobaan:</strong> <span style={{ marginLeft: 6 }}>{infoLog.length ? infoLog[0].ts.toLocaleString('id-ID') : '--'}</span></div>
                  </div>
                </div>

                <div style={{ width: 220, background: THEME.card, borderRadius: 12, padding: 12, border: `1px solid ${THEME.cardBorder}` }}>
                  <div style={{ fontSize: 13, color: THEME.mutedText }}>Kontrol</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button onClick={resetAll} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'transparent', border: `1px solid ${THEME.cardBorder}`, color: '#dbeafe', cursor: 'pointer' }}>Reset</button>
                    <button onClick={() => { setInfoLog([]); pushLog('Log dibersihkan oleh pengguna.', 'warn'); }} style={{ padding: '8px 10px', borderRadius: 8, background: 'transparent', border: `1px solid ${THEME.cardBorder}`, color: '#dbeafe', cursor: 'pointer' }}>Bersihkan</button>
                  </div>
                </div>
              </div>
            </div>

            {/* log card (mobile: below preview) */}
            <div style={{
              borderRadius: 14,
              padding: 14,
              background: THEME.card,
              border: `1px solid ${THEME.cardBorder}`,
              boxShadow: '0 8px 20px rgba(2,8,20,0.6)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ color: THEME.mutedText, fontSize: 13 }}>Log Aktivitas</div>
                  <div style={{ color: '#a6b8d9', fontSize: 12 }}>Terurut terbaru di atas — warna menunjukkan level</div>
                </div>
                <div style={{ color: THEME.mutedText, fontSize: 13 }}>Total: <span style={{ color: '#e6eefc', fontWeight: 700 }}>{infoLog.length}</span></div>
              </div>

              <div style={{ background: THEME.logBg, padding: 12, borderRadius: 10, border: `1px solid rgba(255,255,255,0.02)`, maxHeight: 280, overflow: 'auto' }}>
                {infoLog.length === 0 ? (
                  <div style={{ color: THEME.mutedText }}>-- belum ada aktivitas --</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {infoLog.map((l, i) => renderLogLine(l, i))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 10, color: THEME.mutedText, fontSize: 12 }}>Tip: Tekan "Mulai" untuk meminta izin kamera. Jika ditolak, status akan berubah menjadi Error.</div>
            </div>
          </div>

          {/* desktop layout: small right column with log + preview side-by-side mimic */}
          <style>{`
            @media (min-width: 992px) {
              .themed-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
              .desktop-only-hide { display: none; }
            }
            @media (max-width: 991px) {
              .themed-grid { display: block; }
              .desktop-only-hide { display: block; }
            }
          `}</style>

          <div className="desktop-only-hide" style={{ display: 'none' }} />
        </div>

        {/* invisible canvas for captures */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
