import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap">
      <div className="card">
        <h1>Aplikasi Monitoring Kamera</h1>
        <p>Tekan mulai untuk memulai proses monitoring & deteksi wajah.</p>

        <Link href="/review">
          <button className="btn">Mulai</button>
        </Link>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #0b1220;
          color: #e6eef8;
          padding: 20px;
        }
        .card {
          text-align: center;
          background: rgba(255, 255, 255, 0.05);
          padding: 28px;
          border-radius: 12px;
          max-width: 420px;
          width: 100%;
        }
        h1 {
          margin-bottom: 12px;
        }
        p {
          margin-bottom: 20px;
          line-height: 1.4;
        }
        .btn {
          padding: 12px 20px;
          background: #06b6d4;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          width: 100%;
        }
      `}</style>
    </main>
  );
}