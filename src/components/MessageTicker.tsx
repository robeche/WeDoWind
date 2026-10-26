"use client";

/**
 * Rotating community messages at the bottom of the kiosk. The banner keeps the same height for
 * every message, so the panels above it never jump: on the big screen each message stays on one
 * line, on phones (compact) on at most two. A message that would not fit is shown in a smaller
 * font instead of wrapping.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const COMMUNITY_MESSAGES = [
  "Owned by the community · Ambition Community Energy & Ambition Lawrence Weston.",
  "Did you know? This 4.2 MW turbine is community-owned by Lawrence Weston.",
  "Surplus income from this turbine goes to Ambition Lawrence Weston for projects in the local community.",
  "The blades on this screen turn at exactly the same speed as the real turbine — right now.",
  "At around 150 metres to the blade tip, this is one of the tallest onshore wind turbines in England.",
  "Each of the three blades is 56 metres long — longer than an Olympic swimming pool.",
  "Wind is free, local and clean. Every unit made here means less gas burned in power stations.",
];

/** Base font size; a message that does not fit is scaled down from it. */
const FONT = { full: "clamp(1.1rem,2.9vh,2.3rem)", compact: "0.8rem" };
/** Smallest scale before the text is cut with an ellipsis (it never wraps beyond its lines). */
const MIN_SCALE = 0.55;

export default function MessageTicker({ intervalMs = 12_000, compact = false }: { intervalMs?: number; compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % COMMUNITY_MESSAGES.length), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const base = compact ? FONT.compact : FONT.full;
  const message = COMMUNITY_MESSAGES[index];

  // Fit the message: shrink the font of an invisible copy until it fits the fixed box.
  const fit = useCallback(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const fits = () => (compact ? probe.scrollHeight <= probe.clientHeight + 1 : probe.scrollWidth <= probe.clientWidth + 1);
    let s = 1;
    probe.style.fontSize = base;
    while (s > MIN_SCALE && !fits()) {
      s = Math.max(MIN_SCALE, s - 0.03);
      probe.style.fontSize = `calc(${base} * ${s})`;
    }
    setScale(s);
  }, [base, compact]);

  useLayoutEffect(fit, [fit, message]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [fit]);

  const text = `${compact ? "font-medium leading-snug" : "font-semibold leading-tight"}`;
  const lines = compact ? "line-clamp-2" : "truncate whitespace-nowrap";

  return (
    <div
      className={`flex shrink-0 items-center overflow-hidden rounded-2xl ring-1 ring-emerald-400/30 ${
        compact ? "h-[3.4rem] gap-2 bg-slate-950/70 px-3 backdrop-blur" : "h-[7vh] min-h-[3.2rem] gap-4 bg-emerald-500/15 px-6"
      }`}
    >
      <Info className={`shrink-0 text-emerald-300 ${compact ? "size-4" : "size-[3.6vh]"}`} strokeWidth={2.4} />
      <div ref={boxRef} className={`relative flex h-full min-w-0 flex-1 items-center ${compact ? "py-1.5" : ""}`}>
        {/* Invisible copy used to measure the font size that fits. */}
        <p
          ref={probeRef}
          aria-hidden
          className={`invisible absolute inset-x-0 ${compact ? "inset-y-1.5 overflow-hidden" : "top-0 whitespace-nowrap"} ${text}`}
        >
          {message}
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`w-full ${lines} ${text}`}
            style={{ fontSize: scale < 1 ? `calc(${base} * ${scale})` : base }}
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
