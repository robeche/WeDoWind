"use client";

import { useCallback, useEffect, useState } from "react";
import { UK_TIME_ZONE } from "@/utils/sun";

/** Current time, ticking every `intervalMs`. Null until mounted to avoid SSR hydration mismatches. */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Hides the cursor after `timeoutMs` without input. Returns true while idle. */
export function useIdleCursor(timeoutMs = 5000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeoutMs);
    };
    const events = ["mousemove", "pointerdown", "touchstart", "keydown", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    wake();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [timeoutMs]);

  useEffect(() => {
    document.documentElement.classList.toggle("cursor-hidden", idle);
  }, [idle]);

  return idle;
}

/** Fullscreen API toggle; also bound to the "F" key. F11 browser fullscreen works independently. */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen({ navigationUI: "hide" });
    request?.catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggle();
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle]);

  return { isFullscreen, toggle };
}

/**
 * Kiosk hygiene: blocks the long-press/right-click menu, and reloads the page once a
 * night (UK time) to reclaim memory — only if the server is reachable, so an outage
 * never leaves the screen on a browser error page.
 */
export function useKioskMaintenance(reloadAtUk = "04:00") {
  useEffect(() => {
    const blockMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", blockMenu);

    const startedAt = Date.now();
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
    const id = setInterval(async () => {
      if (fmt.format(new Date()) !== reloadAtUk || Date.now() - startedAt < 60 * 60_000) return;
      try {
        const res = await fetch("/", { method: "HEAD", cache: "no-store" });
        if (res.ok) window.location.reload();
      } catch {
        // Offline: keep running on cached data and try again tomorrow.
      }
    }, 30_000);

    return () => {
      window.removeEventListener("contextmenu", blockMenu);
      clearInterval(id);
    };
  }, [reloadAtUk]);
}
