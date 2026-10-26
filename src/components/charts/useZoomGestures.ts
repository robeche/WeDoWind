"use client";

/**
 * Zoom / pan gestures for a chart's plot area, reported in plot pixels so each chart maps them
 * onto its own axes:
 *  - mouse wheel or trackpad: zoom around the pointer
 *  - two-finger pinch: zoom around the fingers' midpoint
 *  - drag (one finger or the mouse): pan
 *  - double click: reset
 * `factor` > 1 zooms out (the visible span grows by that factor), < 1 zooms in.
 */

import { useEffect, useRef } from "react";

export interface ZoomHandlers {
  onZoom: (factor: number, x: number, y: number) => void;
  onPan: (dx: number, dy: number) => void;
  onReset: () => void;
}

/** Movement (px) before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 5;

/** Attach to the plot container (pass the element itself, e.g. from `useSize`). */
export function useZoomGestures(el: HTMLElement | null, handlers: ZoomHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  /** True while a drag or pinch is in progress (charts hide their hover readout meanwhile). */
  const busyRef = useRef(false);

  useEffect(() => {
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let travelled = 0;
    let pinchDist: number | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      handlersRef.current.onZoom(Math.exp(Math.max(-200, Math.min(200, dy)) * 0.002), p.x, p.y);
    };

    const onDown = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.pointerType === "mouse" && pe.button !== 0) return;
      pointers.set(pe.pointerId, local(pe));
      travelled = 0;
      pinchDist = null;
      try {
        el.setPointerCapture(pe.pointerId);
      } catch {
        // Capture is a nicety (keeps the drag going outside the plot).
      }
    };

    const onMove = (e: Event) => {
      const pe = e as PointerEvent;
      const prev = pointers.get(pe.pointerId);
      if (!prev) return;
      const p = local(pe);
      pointers.set(pe.pointerId, p);
      if (pointers.size === 1) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        travelled += Math.abs(dx) + Math.abs(dy);
        if (travelled > DRAG_THRESHOLD) {
          busyRef.current = true;
          handlersRef.current.onPan(dx, dy);
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist !== null && d > 0) handlersRef.current.onZoom(pinchDist / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = d;
        busyRef.current = true;
      }
    };

    const onUp = (e: Event) => {
      pointers.delete((e as PointerEvent).pointerId);
      pinchDist = null;
      if (pointers.size === 0) setTimeout(() => (busyRef.current = false), 0);
    };

    const onDouble = () => handlersRef.current.onReset();

    el.addEventListener("wheel", onWheel as EventListener, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("dblclick", onDouble);
    return () => {
      el.removeEventListener("wheel", onWheel as EventListener);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("dblclick", onDouble);
    };
  }, [el]);

  return busyRef;
}

/**
 * Zoom/pan a 1-D range inside its full extent. Returns the new range, or `null` when it covers
 * (almost) everything, meaning "not zoomed".
 */
export function zoomRange(
  full: [number, number],
  view: [number, number] | null,
  factor: number,
  anchorFrac: number,
  minSpan: number,
): [number, number] | null {
  const [f0, f1] = full;
  const [a, b] = view ?? full;
  const fullSpan = f1 - f0;
  const span = Math.min(fullSpan, Math.max(minSpan, (b - a) * factor));
  const anchor = a + (b - a) * Math.min(1, Math.max(0, anchorFrac));
  let lo = anchor - (anchor - a) * (span / (b - a || 1));
  lo = Math.min(f1 - span, Math.max(f0, lo));
  return span >= fullSpan * 0.999 ? null : [lo, lo + span];
}

/** Shift a 1-D range by `delta` (domain units), kept inside its full extent. */
export function panRange(full: [number, number], view: [number, number] | null, delta: number): [number, number] | null {
  if (!view) return null;
  const span = view[1] - view[0];
  const lo = Math.min(full[1] - span, Math.max(full[0], view[0] + delta));
  return [lo, lo + span];
}
