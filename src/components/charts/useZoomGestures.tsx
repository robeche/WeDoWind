"use client";

/**
 * Window zoom for a chart's plot area: press and drag to draw a selection window, release to
 * zoom into it (again inside a zoomed view, as often as you like). Double click resets.
 * Works the same with a mouse, a pen or one finger; a simple tap still shows the readout.
 *
 * `axis: "x"` selects a band across the whole plot height (time and bar charts);
 * `axis: "xy"` selects a rectangle (scatter plots). Coordinates are plot-container pixels.
 */

import { useEffect, useRef, useState } from "react";

export interface Selection {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface PlotBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Options {
  axis: "x" | "xy";
  /** Plot area inside the container, read at gesture time. */
  bounds: () => PlotBounds | null;
  onSelect: (s: Selection) => void;
  onReset: () => void;
}

/** Movement (px) before a press becomes a selection rather than a tap. */
const DRAG_THRESHOLD = 6;
/** Smallest window that zooms (px). */
const MIN_WINDOW = 10;

/** Attach to the plot container (pass the element itself, e.g. from `useSize`). */
export function useZoomWindow(el: HTMLElement | null, options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [selection, setSelection] = useState<Selection | null>(null);
  /** True while a window is being drawn (charts hide their hover readout meanwhile). */
  const busyRef = useRef(false);

  useEffect(() => {
    if (!el) return;
    let start: { x: number; y: number; id: number } | null = null;
    let current: Selection | null = null;

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (start) return; // a second finger: ignore
      const b = optionsRef.current.bounds();
      const p = local(e);
      if (!b || p.x < b.left || p.x > b.right || p.y < b.top || p.y > b.bottom) return;
      start = { ...p, id: e.pointerId };
      current = null;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture only keeps the drag going outside the plot.
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const b = optionsRef.current.bounds();
      if (!b) return;
      const p = local(e);
      if (!busyRef.current && Math.abs(p.x - start.x) + Math.abs(p.y - start.y) < DRAG_THRESHOLD) return;
      busyRef.current = true;
      const xa = clamp(start.x, b.left, b.right);
      const xb = clamp(p.x, b.left, b.right);
      const ya = optionsRef.current.axis === "x" ? b.top : clamp(start.y, b.top, b.bottom);
      const yb = optionsRef.current.axis === "x" ? b.bottom : clamp(p.y, b.top, b.bottom);
      current = { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: Math.min(ya, yb), y1: Math.max(ya, yb) };
      setSelection(current);
    };

    const finish = (e: PointerEvent, apply: boolean) => {
      if (!start || e.pointerId !== start.id) return;
      const s = current;
      start = null;
      current = null;
      setSelection(null);
      if (apply && s && s.x1 - s.x0 >= MIN_WINDOW && (optionsRef.current.axis === "x" || s.y1 - s.y0 >= MIN_WINDOW)) {
        optionsRef.current.onSelect(s);
      }
      setTimeout(() => (busyRef.current = false), 0);
    };
    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);
    const onDouble = () => optionsRef.current.onReset();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("dblclick", onDouble);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("dblclick", onDouble);
    };
  }, [el]);

  return { selection, busyRef };
}

/**
 * Domain range for a selected pixel span, inside the full extent and at least `minSpan` wide
 * (widened around its centre when the window was smaller). `null` = the whole extent.
 */
export function rangeFromPixels(
  px0: number,
  px1: number,
  plotLeft: number,
  plotWidth: number,
  visible: [number, number],
  full: [number, number],
  minSpan: number,
): [number, number] | null {
  const toValue = (px: number) => visible[0] + ((px - plotLeft) / plotWidth) * (visible[1] - visible[0]);
  let a = toValue(px0);
  let b = toValue(px1);
  if (b - a < minSpan) {
    const mid = (a + b) / 2;
    a = mid - minSpan / 2;
    b = mid + minSpan / 2;
  }
  const span = Math.min(b - a, full[1] - full[0]);
  a = Math.min(full[1] - span, Math.max(full[0], a));
  b = a + span;
  return span >= (full[1] - full[0]) * 0.999 ? null : [a, b];
}

/** Translucent selection window drawn over the plot while dragging. */
export function SelectionRect({ s }: { s: Selection | null }) {
  if (!s) return null;
  return (
    <rect
      x={s.x0}
      y={s.y0}
      width={s.x1 - s.x0}
      height={s.y1 - s.y0}
      fill="#34d399"
      fillOpacity={0.14}
      stroke="#34d399"
      strokeOpacity={0.8}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  );
}
