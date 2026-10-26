"use client";

/**
 * One line of text that always stays whole: when it does not fit its box at the CSS font size,
 * the font is scaled down (to `minScale` / `minPx` at most). If it still does not fit, it wraps onto
 * two lines (`wrap`) or is cut with an ellipsis.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  children: string;
  /** Tailwind classes, including the full-size font size. */
  className?: string;
  minScale?: number;
  /** Never smaller than this (px), whatever `minScale` allows. */
  minPx?: number;
  /** At the smallest size and still too long: two lines instead of an ellipsis. */
  wrap?: boolean;
  as?: "span" | "h1" | "h2" | "p" | "div";
}

export default function FitText({ children, className = "", minScale = 0.5, minPx = 0, wrap = false, as: Tag = "span" }: Props) {
  const boxRef = useRef<HTMLElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  const [overflow, setOverflow] = useState(false);

  const fit = useCallback(() => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;
    // The probe carries the full-size font; the ratio of widths gives the scale directly.
    const avail = box.clientWidth;
    const need = probe.scrollWidth;
    const base = parseFloat(getComputedStyle(probe).fontSize) || 16;
    const floor = Math.min(1, Math.max(minScale, minPx / base));
    const s = need > avail && need > 0 ? Math.max(floor, Math.floor((avail / need) * 1000) / 1000) : 1;
    setScale(s);
    setOverflow(need * s > avail + 1);
  }, [minScale, minPx]);

  useLayoutEffect(fit, [fit, children]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    // Web fonts change the width once they load.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [fit]);

  return (
    <Tag ref={boxRef as React.Ref<never>} className={`relative block min-w-0 overflow-hidden ${className}`} title={children}>
      <span ref={probeRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">
        {children}
      </span>
      <span className={`block ${wrap && overflow ? "line-clamp-2 leading-tight" : "truncate whitespace-nowrap"}`} style={scale < 1 ? { fontSize: `${scale}em` } : undefined}>
        {children}
      </span>
    </Tag>
  );
}
