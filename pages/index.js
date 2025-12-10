import { useEffect, useRef, useState } from "react";

const API4AI_KEY = process.env.NEXT_PUBLIC_API4AI_KEY || "";

const API_ENDPOINTS = {
  demo: {
    url: "https://demo.api4ai.cloud/face-analyzer/v1/results",
    headers: {}
  },
  normal: {
    url: "https://api4ai.cloud/face-analyzer/v1/results",
    headers: { "X-API-KEY": API4AI_KEY }
  }
};

// mode API (ubah jika ingin memakai demo atau normal)
const API_MODE = "demo"; // "demo" | "normal"

export default function Home() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [sending, setSending] = useState(false);
  const [infoLog, setInfoLog] = useState([]);

  const API_URL = API_ENDPOINTS[API_MODE].url;
  const API_HEADERS = API_ENDPOINTS[API_MODE].headers;

  const pushLog = (text) => {
    setInfoLog((p) => [new Date().toISOString() + " — " + text, ...p]);
    console.log(text);
  };

  const startCamera = async () => {
    try {
      pushLog("Meminta izin kamera...");
      const constraints = { video: { facingMode: "user" }, audio: false };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      setPermissionGranted(true);

      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch((e) => pushLog("Video play error: " + e.message));
      }

      pushLog("Kamera aktif.");
    } catch (err) {
      setPermissionGranted(false);
      pushLog("Izin kamera ditolak: " + err.message);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      setPermissionGranted(false);
      pushLog("Kamera dihentikan.");
    }
  };

  const captureAndSend = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedUrl(dataUrl);
    pushLog("Foto diambil.");

    setSending(true);

    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));

      const fd = new FormData();
      fd.append("image", blob, "face.jpg");

      pushLog("Mengirim ke API: " + API_URL);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: API_HEADERS,
        body: fd
      });

      const contentType = response.headers.get("content-type") || "";
      let result;
      if (contentType.includes("application/json")) {
        result = await response.json();
      } else {
        result = await response.text();
      }

      pushLog("Status API: " + response.status);
      pushLog("Response: " + JSON.stringify(result));
    } catch (err) {
      pushLog("Error kirim API: " + err.message);
    }

    setSending(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Kamera & Face Analyzer</h1>

      <div style={{ marginBottom: 12 }}>
        {!permissionGranted ? (
          <button onClick={startCamera}>Buka Kamera</button>
        ) : (
          <button onClick={stopCamera}>Tutup Kamera</button>
        )}

        <button
          onClick={captureAndSend}
          disabled={!permissionGranted || sending}
          style={{ marginLeft: 8 }}
        >
          {sending ? "Mengirim..." : "Tangkap & Kirim"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div>
          <p>Preview Kamera</p>
          <video
            ref={videoRef}
            style={{ width: 320, height: 240, background: "#000", borderRadius: 8 }}
            playsInline
            muted
          />
        </div>

        <div>
          <p>Hasil Foto</p>
          {capturedUrl ? (
            <img
              src={capturedUrl}
              alt="captured"
              style={{ width: 320, height: 240, borderRadius: 8 }}
            />
          ) : (
            <div
              style={{
                width: 320,
                height: 240,
                background: "#eee",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              Belum ada foto
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div style={{ marginTop: 20 }}>
        <h3>Log</h3>
        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            background: "#111",
            color: "#eee",
            padding: 12,
            borderRadius: 6,
            fontSize: 12
          }}
        >
          {infoLog.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
