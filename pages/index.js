import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  // minta izin kamera pada halaman index (user gesture)
  async function requestCameraOnIndex() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // simpan bahwa permission diberikan
      sessionStorage.setItem("cameraAllowed", "true");
      // stop tracks immediately - preview will be started on review page
      stream.getTracks().forEach((t) => t.stop());
      alert("Izin kamera diberikan. Tekan Mulai untuk lanjut.");
    } catch (e) {
      sessionStorage.removeItem("cameraAllowed");
      alert("Izin kamera ditolak atau tidak tersedia.");
    }
  }

  function goReview() {
    router.push("/review");
  }

  return (
    <main className="wrap">
      <div className="card">
        <h1>Aplikasi Monitoring Kamera</h1>
        <p>Tekan "Minta Izin Kamera" agar browser memunculkan prompt, lalu tekan "Mulai".</p>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={requestCameraOnIndex}>Minta Izin Kamera</button>
          <button className="btn ghost" onClick={goReview}>Mulai</button>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          min-height:100vh;
          display:flex;
          justify-content:center;
          align-items:center;
          background:#0b1220;
          color:#e6eef8;
          padding:20px;
        }
        .card {
          text-align:center;
          background:rgba(255,255,255,0.04);
          padding:28px;
          border-radius:12px;
          max-width:520px;
          width:100%;
        }
        .btn {
          padding:10px 16px;
          background:#06b6d4;
          border-radius:8px;
          border:0;
          color:#022;
          font-weight:700;
          cursor:pointer;
        }
        .btn.ghost {
          background:transparent;
          color:#e6eef8;
          border:1px solid rgba(255,255,255,0.06);
        }
      `}</style>
    </main>
  );
}