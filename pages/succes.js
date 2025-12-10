export default function Success() {
  return (
    <main className="wrap">
      <h1>BERHASIL</h1>
      <p>Wajah berhasil terdeteksi.</p>

      <style jsx>{`
        .wrap {
          height:100vh;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          background:#02101f;
          color:#e2e8f0;
        }
      `}</style>
    </main>
  );
}