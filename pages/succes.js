import Link from 'next/link';

export default function Success() {
  return (
    <main className="wrap">
      <div className="card">
        <h1>Selamat — BERHASIL</h1>
        <p>Deteksi wajah berhasil. Terima kasih.</p>
        <Link href="/">
          <button className="btn">Kembali ke Awal</button>
        </Link>
      </div>

      <style jsx>{`
        .wrap {
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px;
          background:linear-gradient(180deg,#021220,#021018);
          color:#e6f7ff;
        }
        .card {
          width:100%;
          max-width:720px;
          background:rgba(255,255,255,0.03);
          padding:28px;
          border-radius:12px;
          text-align:center;
        }
        .btn {
          padding:10px 18px;
          margin-top:16px;
          border-radius:8px;
          border:0;
          background:#06b6d4;
          color:#021; font-weight:600;
        }
      `}</style>
    </main>
  );
}