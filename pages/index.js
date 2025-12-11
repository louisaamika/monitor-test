import { useEffect, useRef, useState } from "react";

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

  const pushLog = (text) => {
    const entry = `${new Date().toLocaleString('id-ID')} — ${text}`;
    setInfoLog((p) => [entry, ...p]);
    console.log(entry);
  };

  const resetAll = () => {
    // stop camera and reset flags
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setPermissionGranted(false);
    setShowStartButton(true);
    setSending(false);
    abortRef.current = true;
    pushLog('Kembali ke kondisi awal.');
  };

  const startAndCaptureFlow = async () => {
    abortRef.current = false;

    try {
      pushLog('Meminta izin kamera...');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (abortRef.current) {
        // user or another flow aborted
        s.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = s;
      setPermissionGranted(true);
      setShowStartButton(false);

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        const playPromise = videoRef.current.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});
      }

      pushLog('Kamera aktif. Menunggu frame untuk menangkap foto...');

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
        pushLog(`Mengambil foto (percobaan ${attempt})...`);
        const capturedBlob = await captureBlobFromVideo();
        if (!capturedBlob) {
          pushLog('Gagal membuat blob dari video.');
          break;
        }

        setSending(true);
        pushLog('Mengirim foto ke API...');

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

          pushLog(`Status API: ${res.status}`);
          pushLog(`Response: ${typeof result === 'string' ? result : JSON.stringify(result)}`);

          const valid = checkFaceValid(result);
          if (valid) {
            pushLog('Wajah terdeteksi valid. Proses selesai.');
            // stop everything
            cleanupAfterSuccess();
            break;
          } else {
            pushLog('Wajah tidak valid/tdk terdeteksi. Mencoba ulang...');
            // if reached max attempts, stop
            if (attempt >= maxAttempts) {
              pushLog(`Mencapai batas percobaan (${maxAttempts}). Menghentikan proses.`);
              resetAll();
              break;
            }
            // small delay before next attempt to give camera a different frame
            await new Promise((r) => setTimeout(r, 700));
          }
        } catch (err) {
          pushLog('Error kirim API: ' + err.message);
          resetAll();
          break;
        } finally {
          setSending(false);
        }
      }
    } catch (err) {
      // permission denied or other error
      pushLog('Izin kamera ditolak atau error: ' + err.message);
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
    // Try common response shapes. Adjust if your API differs.
    try {
      if (!result) return false;
      // direct faces array
      if (Array.isArray(result.faces) && result.faces.length > 0) return true;
      // nested outputs -> entities -> faces
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
      // older api4ai shape: outputs[0].companies / faces etc
      const maybeFaces = result?.outputs?.[0]?.faces || result?.outputs?.[0]?.entities?.[0]?.faces;
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
    setShowStartButton(false); // keep button hidden per request
    abortRef.current = true;
  };

  useEffect(() => {
    return () => {
      // component unmount
      abortRef.current = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>Kamera & Face Analyzer (Demo)</h1>

      <div style={{ marginBottom: 12 }}>
        {showStartButton && (
          <button onClick={startAndCaptureFlow} disabled={sending}>
            {sending ? 'Mengirim...' : 'Mulai'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div>
          <p>Preview Kamera</p>
          <video
            ref={videoRef}
            style={{ width: 480, height: 360, background: '#000', borderRadius: 8 }}
            playsInline
            muted
            autoPlay
          />
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{ marginTop: 20 }}>
        <h3>Log</h3>
        <div
          style={{
            maxHeight: 320,
            overflowY: 'auto',
            background: '#0b1220',
            color: '#dbeafe',
            padding: 12,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, menlo, monospace'
          }}
        >
          {infoLog.length === 0 ? (
            <div style={{ opacity: 0.7 }}>-- belum ada aktivitas --</div>
          ) : (
            infoLog.map((l, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                {l}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
