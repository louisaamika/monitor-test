import Link from 'next/link';

export default function Home() {
  return (
    <main className="wrap">
      <div className="card">
        <h1 id="title">Aplikasi Kamera Otomatis</h1>
        <p id="description">
          Demo: minta izin kamera, ambil foto tiap detik, kirim ke Telegram, lalu deteksi wajah via API.
        </p>
        <Link href="/review">
          <button id="button-mulai" className="btn">Mulai</button>
        </Link>
      </div>

      <style jsx>{`
        .wrap {
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px;
          background:linear-gradient(180deg,#0f172a,#071028);
          color:#fff;
        }
        .card {
          width:100%;
          max-width:720px;
          background:rgba(255,255,255,0.03);
          padding:28px;
          border-radius:12px;
          box-shadow: 0 6px 30px rgba(2,6,23,0.6);
          text-align:center;
        }
        h1 { margin:0 0 12px 0; font-size:24px; }
        p { margin:0 0 20px 0; color:#cbd5e1; }
        .btn {
          padding:12px 20px;
          font-size:16px;
          border-radius:8px;
          border:0;
          background:#06b6d4;
          color:#04203a;
          cursor:pointer;
        }
        .btn:active{ transform: translateY(1px); }
      `}</style>
    </main>
  );
}