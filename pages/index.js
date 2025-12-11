import React, { useEffect, useRef, useState } from 'react';

// Themed Face Analyzer single-file React component
// Uses Tailwind CSS utility classes for styling (no external CSS file)
// Behavior: keeps original logic but upgrades UI to match requested theme.

const API_ENDPOINT = {
  url: 'https://demo.api4ai.cloud/face-analyzer/v1/results',
  headers: {}
};

export default function FaceAnalyzerSingleView() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const abortRef = useRef(false);

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [sending, setSending] = useState(false);
  const [infoLog, setInfoLog] = useState([]); // each entry: {ts, text, level}
  const [showStartButton, setShowStartButton] = useState(true);
  const [status, setStatus] = useState('idle'); // idle, requesting, active, detecting, processing, success, error
  const [startAt, setStartAt] = useState(null);
  const [detectedAt, setDetectedAt] = useState(null);

  // pushLog supports level: info, warn, error, success
  const pushLog = (text, level = 'info') => {
    const entry = { ts: new Date(), text, level };
    setInfoLog((p) => [entry, ...p].slice(0, 200));
    // still console for debugging
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

      // Wait for a frame to be ready
      await new Promise((res) => {
        const video = videoRef.current;
        if (!video) return res();
        if (video.readyState >= 2) return res();
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          res();
        };
        video.addEventListener('loadeddata', onLoaded);
        // fallback timeout
        setTimeout(res, 800);
      });

      // start capture loop until valid face detected or aborted
      let attempt = 0;
      const maxAttempts = 12; // safety to avoid infinite loop

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
          pushLog(`Response singkat: ${typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200)}`, 'info');

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

  // helper to render elapsed duration
  const renderDuration = () => {
    if (!startAt) return '--';
    const end = detectedAt || new Date();
    const ms = Math.max(0, end - startAt);
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return `${h}h ${m}m ${s}s`;
  };

  // log line renderer: single-line formatted with color based on level
  const renderLogLine = (entry, idx) => {
    const time = entry.ts.toLocaleTimeString('id-ID');
    const base = 'text-sm leading-tight break-words';
    const color = entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-yellow-300' : entry.level === 'success' ? 'text-green-300' : 'text-sky-200';
    return (
      <div key={idx} className={`flex items-start gap-3 ${base}`}>
        <div className="w-20 text-xs text-zinc-400">{time}</div>
        <div className={`${color} flex-1`}>{entry.text}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 bg-[#071025] text-zinc-100 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Kamera & Face Analyzer (Themed)</h1>
            <p className="text-sm text-zinc-400">Demo dengan tampilan card dan log bergaya sistem.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Status badge */}
            <div className="text-sm px-3 py-2 rounded-xl bg-zinc-800/40 border border-zinc-700">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${status === 'active' || status === 'detecting' || status === 'processing' ? 'bg-amber-400' : status === 'success' ? 'bg-green-400' : status === 'error' ? 'bg-red-500' : 'bg-zinc-500'}`} />
                <div className="font-medium">{status.toUpperCase()}</div>
              </div>
            </div>

            {/* Duration / runtime */}
            <div className="text-sm text-zinc-400 px-3 py-2 rounded-xl bg-zinc-800/20 border border-zinc-700">
              Durasi: <span className="font-medium text-zinc-100 ml-2">{renderDuration()}</span>
            </div>

            {/* Start button area (kept like original logic) */}
            <div>
              {showStartButton && (
                <button
                  onClick={startAndCaptureFlow}
                  disabled={sending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 disabled:opacity-60 shadow-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="white">
                    <path d="M6.5 5.5v9l7-4.5-7-4.5z" />
                  </svg>
                  <span className="text-sm font-medium">{sending ? 'Mengirim...' : 'Mulai'}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Responsive layout: mobile stack, desktop grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: preview card spans 2 cols on desktop */}
          <div className="lg:col-span-2">
            <div className="bg-gradient-to-br from-[#0b1220] to-[#081226] rounded-2xl p-4 shadow-2xl border border-zinc-800">
              {/* Video card */}
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video ref={videoRef} playsInline muted autoPlay className="w-full h-[360px] object-cover bg-black" />

                {/* card overlay */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-4">
                  <div className="bg-zinc-900/60 backdrop-blur-sm p-3 rounded-xl border border-zinc-700 flex items-center gap-4">
                    <div className={`h-3 w-3 rounded-full ${status === 'active' || status === 'detecting' || status === 'processing' ? 'bg-amber-400' : status === 'success' ? 'bg-green-400' : status === 'error' ? 'bg-red-500' : 'bg-zinc-500'}`} />
                    <div>
                      <div className="text-xs text-zinc-300">Status</div>
                      <div className="text-sm font-medium">{status === 'idle' ? 'OFF' : status === 'requesting' ? 'Meminta izin' : status === 'active' ? 'ON' : status === 'detecting' ? 'Mendeteksi wajah' : status === 'processing' ? 'Memproses' : status === 'success' ? 'Berhasil' : 'Error'}</div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/60 backdrop-blur-sm p-3 rounded-xl border border-zinc-700 text-right">
                    <div className="text-xs text-zinc-300">Waktu aktif</div>
                    <div className="text-sm font-medium">{renderDuration()}</div>
                  </div>
                </div>

                {/* top-left small badge */}
                <div className="absolute top-4 left-4 bg-zinc-900/60 p-2 rounded-lg border border-zinc-700 text-xs">
                  <div className="font-medium">Preview Kamera</div>
                </div>
              </div>

              {/* below: system info card */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-1 md:col-span-2 bg-zinc-900/30 p-4 rounded-xl border border-zinc-800">
                  <div className="text-sm text-zinc-300">System Info</div>
                  <div className="mt-2 text-xs text-zinc-200">Izin Kamera: <span className="font-medium">{permissionGranted ? 'Diberikan' : status === 'error' ? 'Error / Ditolak' : 'Belum'}</span></div>
                  <div className="mt-1 text-xs text-zinc-200">Status: <span className="font-medium">{status}</span></div>
                  <div className="mt-1 text-xs text-zinc-200">Percobaan terakhir: <span className="font-medium">{infoLog.length ? infoLog[0].ts.toLocaleString('id-ID') : '--'}</span></div>
                </div>

                <div className="col-span-1 bg-zinc-900/20 p-4 rounded-xl border border-zinc-800">
                  <div className="text-sm text-zinc-300">Kontrol</div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={resetAll} className="px-3 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700">Reset</button>
                    <button onClick={() => { setInfoLog([]); pushLog('Log dibersihkan oleh pengguna.', 'warn'); }} className="px-3 py-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700">Bersihkan Log</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Log card (mobile: below preview) */}
          <div>
            <div className="bg-gradient-to-br from-[#071025] to-[#061021] rounded-2xl p-4 shadow-xl border border-zinc-800 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-zinc-300">Log Aktivitas</div>
                  <div className="text-xs text-zinc-500">Terurut terbaru di atas — warna mencerminkan level</div>
                </div>
                <div className="text-xs text-zinc-400">Total: <span className="font-medium">{infoLog.length}</span></div>
              </div>

              <div className="flex-1 overflow-auto bg-zinc-900/30 p-3 rounded-lg border border-zinc-800">
                {infoLog.length === 0 ? (
                  <div className="text-zinc-400">-- belum ada aktivitas --</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {infoLog.map((l, i) => renderLogLine(l, i))}
                  </div>
                )}
              </div>

              {/* small footer note */}
              <div className="mt-3 text-xs text-zinc-500">Tip: Tekan "Mulai" untuk meminta izin kamera. Jika ditolak, status akan berubah ke Error.</div>
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
