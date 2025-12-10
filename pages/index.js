import Link from 'next/link';

export default function Home() {
  return (
    <main className="wrap">
      <div className="card">
        <h1>Aplikasi Monitoring Kamera</h1>
        <p>Tekan mulai untuk memulai proses.</p>
        <Link href="/review">
          <button className="btn">Mulai</button>
        </Link>
      </div>

      <style jsx>{`
        .wrap {
          min-height:100vh;
          display:flex;
          justify-content:center;
          align-items:center;
          background:#0b1220;
          color:#fff;
        }
        .card {
          background:rgba(255,255,255,0.05);
          padding:24px;
          border-radius:12px;
          text-align:center;
        }
        .btn {
          margin-top:16px;
          padding:12px 20px;
          border:none;
          background:#06b6d4;
          border-radius:8px;
          cursor:pointer;
          font-weight:bold;
        }
      `}</style>
    </main>
  );
}