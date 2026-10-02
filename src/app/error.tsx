"use client";

import { useEffect } from "react";

/** Route-level fallback: never leave the kiosk on an error screen — retry automatically. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[kiosk]", error);
    const id = setTimeout(reset, 10_000);
    return () => clearTimeout(id);
  }, [error, reset]);

  return (
    <main className="grid h-dvh place-items-center bg-slate-950 text-center text-white">
      <div>
        <p className="text-4xl font-bold">Reconnecting to the ACE turbine…</p>
        <p className="mt-4 text-2xl text-white/60">The display will restart in a moment.</p>
      </div>
    </main>
  );
}
