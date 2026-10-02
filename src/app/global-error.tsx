"use client";

import { useEffect } from "react";

/** Last-resort boundary (errors in the root layout): reload the page after 30 s. */
export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    console.error("[kiosk:global]", error);
    const id = setTimeout(() => window.location.reload(), 30_000);
    return () => clearTimeout(id);
  }, [error]);

  return (
    <html lang="en-GB">
      <body style={{ margin: 0, background: "#020617", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ height: "100vh", display: "grid", placeItems: "center", textAlign: "center" }}>
          <p style={{ fontSize: "2.5rem", fontWeight: 700 }}>Restarting the turbine display…</p>
        </main>
      </body>
    </html>
  );
}
