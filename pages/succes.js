export default function Success() {
  return (
    <main className="wrap">
      <div className="card">
        <h1>BERHASIL</h1>
        <p>Wajah berhasil terdeteksi oleh sistem.</p>
      </div>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background: #02101f;
          color: #e2e8f0;
          padding: 20px;
        }
        .card {
          text-align: center;
          background: rgba(255, 255, 255, 0.05);
          padding: 30px;
          border-radius: 12px;
          max-width: 420px;
          width: 100%;
        }
        h1 {
          margin-bottom: 14px;
        }
        p {
          line-height: 1.4;
        }
      `}</style>
    </main>
  );
}