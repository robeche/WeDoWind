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
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`, { method: "HEAD", cache: "no-store" });
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

/** Elements marked with this attribute (the demo menu) do not count as visitor input. */
export const DEMO_CONTROL_ATTR = "data-demo-control";

export interface DemoMode {
  active: boolean;
  /** Start the tour now (from the kiosk menu). */
  start: () => void;
  stop: () => void;
}

/**
 * Demo mode: after `idleMs` without any visitor input (touch, mouse, keyboard, wheel) the kiosk
 * starts its self-running tour; the first input ends it. Only counts while `enabled`.
 * Started by hand, the tour ignores plain mouse movement and ends on a click, touch or key.
 */
export function useDemoMode(idleMs = 30_000, enabled = true): DemoMode {
  const [active, setActive] = useState(false);
  const [manual, setManual] = useState(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setActive(false);
      setManual(false);
      return;
    }
    let last = Date.now();
    const touch = (e: Event) => {
      if (e.target instanceof Element && e.target.closest(`[${DEMO_CONTROL_ATTR}]`)) return;
      if (manual && e.type === "pointermove") return;
      last = Date.now();
      setActive(false);
      setManual(false);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => {
      if (Date.now() - last > idleMs) setActive(true);
    }, 1_000);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [idleMs, enabled, manual, epoch]);
  const start = useCallback(() => {
    setManual(true);
    setActive(true);
  }, []);
  const stop = useCallback(() => {
    setManual(false);
    setActive(false);
    setEpoch((n) => n + 1); // restart the idle count
  }, []);
  return { active, start, stop };
}

const DWELL_KEY = "wedowind.demoDwellMs";

/** Time per demo stop chosen in the kiosk menu (`null` = automatic), remembered on this screen. */
export function useDemoDwell(): [number | null, (ms: number | null) => void] {
  const [dwell, setDwell] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(DWELL_KEY);
      if (v && Number.isFinite(Number(v))) setDwell(Number(v));
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);
  const set = useCallback((ms: number | null) => {
    setDwell(ms);
    try {
      if (ms === null) localStorage.removeItem(DWELL_KEY);
      else localStorage.setItem(DWELL_KEY, String(ms));
    } catch {
      // Not remembered, still applied.
    }
  }, []);
  return [dwell, set];
}
