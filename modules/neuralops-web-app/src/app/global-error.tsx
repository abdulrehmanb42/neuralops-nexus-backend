"use client";

// Last-resort boundary: catches crashes in the root layout itself, so it
// must render its own <html>. Styles are inline — the stylesheet may be
// part of what failed.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0a12", color: "#edeaf7", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>NeuralOps Nexus hit a snag</h1>
          <p style={{ color: "#a29bbf", maxWidth: 420, margin: "10px auto 20px", fontSize: 14, lineHeight: 1.6 }}>
            The app failed to render. Your data is safe on your server.
          </p>
          <button
            onClick={reset}
            style={{ background: "linear-gradient(135deg,#a84b2f,#d97757)", color: "#fff", border: 0, borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
