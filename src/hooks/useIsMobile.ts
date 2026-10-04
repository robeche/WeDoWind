"use client";

import { useSyncExternalStore } from "react";

/** Phones and small tablets (portrait or landscape) get the full-screen 3D layout. */
const QUERY = "(max-width: 1023px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // server render: desktop layout, corrected on hydration
  );
}
