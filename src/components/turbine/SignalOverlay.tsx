"use client";

/**
 * Live-signal boxes floating beside the components of the opened part. Each box is an HTML
 * card with a leader line to its component; <SignalProjector> (inside the canvas) projects the
 * anchors and lays the boxes out every frame without React re-renders: boxes are pushed away
 * from the middle of the free view, kept apart from each other and out from under the panel.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Focus } from "./parts";
import type { SignalGroup } from "./signals";

export interface SignalBoxEntry {
  focus: Focus;
  box: HTMLDivElement | null;
  line: SVGLineElement | null;
  dot: SVGCircleElement | null;
  /** Current top-left position (px), smoothed between frames. */
  x: number;
  y: number;
  placed: boolean;
}

/** Shared between the HTML layer and the in-canvas projector. */
export type SignalRegistry = Map<string, SignalBoxEntry>;

/** Part of the canvas not covered by the info panel, as fractions of width / height. */
export interface FreeArea {
  right: number;
  bottom: number;
}

/** How far (px) a box sits from its anchor, away from the middle of the view. */
const OFFSET = 70;
const MARGIN = 10;
const GAP = 8;
const SMOOTHING = 0.22;

export function SignalLayer({
  groups,
  registry,
  compact,
}: {
  groups: SignalGroup[];
  registry: React.RefObject<SignalRegistry>;
  compact: boolean;
}) {
  const entry = (g: SignalGroup): SignalBoxEntry => {
    let e = registry.current.get(g.key);
    if (!e) {
      e = { focus: g.focus, box: null, line: null, dot: null, x: 0, y: 0, placed: false };
      registry.current.set(g.key, e);
    }
    e.focus = g.focus;
    return e;
  };

  // Forget boxes that are no longer shown.
  const keys = groups.map((g) => g.key).join("|");
  useEffect(() => {
    const live = new Set(keys ? keys.split("|") : []);
    for (const k of [...registry.current.keys()]) if (!live.has(k)) registry.current.delete(k);
  }, [keys, registry]);

  const text = compact ? "text-[0.68rem]" : "text-[clamp(0.62rem,1.3vh,0.95rem)]";
  const value = compact ? "text-[0.8rem]" : "text-[clamp(0.75rem,1.6vh,1.2rem)]";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Live signals">
      <svg className="absolute inset-0 size-full overflow-visible">
        {groups.map((g) => {
          const e = entry(g);
          const color = g.highlight ? "#6ee7b7" : "rgba(186,230,253,0.8)";
          return (
            <g key={g.key}>
              <line
                ref={(el) => {
                  e.line = el;
                }}
                stroke={color}
                strokeWidth={1.2}
                strokeDasharray="3 3"
                visibility="hidden"
              />
              <circle
                ref={(el) => {
                  e.dot = el;
                }}
                r={3.5}
                fill={color}
                stroke="rgba(2,6,23,0.7)"
                strokeWidth={1.5}
                visibility="hidden"
              />
            </g>
          );
        })}
      </svg>
      {groups.map((g) => {
        const e = entry(g);
        return (
          <div
            key={g.key}
            ref={(el) => {
              e.box = el;
            }}
            style={{ visibility: "hidden" }}
            className={`absolute left-0 top-0 rounded-lg px-2 py-1 shadow-lg ring-1 backdrop-blur ${
              g.highlight ? "bg-emerald-950/85 ring-emerald-300/80" : "bg-slate-950/75 ring-sky-200/25"
            }`}
          >
            <div className={`${text} font-semibold uppercase tracking-wide ${g.highlight ? "text-emerald-300" : "text-sky-200/80"}`}>
              {g.title}
            </div>
            {g.rows.map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-3 whitespace-nowrap leading-tight">
                <span className={`${text} text-white/65`}>{r.label}</span>
                <span className={`${value} font-bold tabular-nums text-white`}>
                  {r.value}
                  {r.unit && <span className="ml-0.5 text-[0.75em] font-semibold text-white/60">{r.unit}</span>}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface Slot {
  e: SignalBoxEntry;
  ax: number;
  ay: number;
  w: number;
  h: number;
  x: number;
  y: number;
}

/**
 * Projects each box's anchor and places the boxes. `resolve` turns a focus (in its frame) into
 * a world point for the current yaw / rotor position.
 */
export function SignalProjector({
  registry,
  freeRef,
  resolve,
}: {
  registry: React.RefObject<SignalRegistry>;
  freeRef: React.RefObject<FreeArea>;
  resolve: (f: Focus, out: THREE.Vector3) => THREE.Vector3;
}) {
  const v = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useFrame(() => {
    const W = size.width;
    const H = size.height;
    const R = W * freeRef.current.right;
    const B = H * freeRef.current.bottom;
    const cx = R / 2;
    const cy = B / 2;
    const slots: Slot[] = [];

    registry.current.forEach((e) => {
      if (!e.box || !e.line || !e.dot) return;
      // Project with the full canvas: the camera's view offset already shifts the picture.
      resolve(e.focus, v.current).project(camera);
      const ax = ((v.current.x + 1) / 2) * W;
      const ay = ((1 - v.current.y) / 2) * H;
      const onScreen = v.current.z < 1 && ax > -40 && ax < R + 40 && ay > -40 && ay < B + 40;
      const vis = onScreen ? "visible" : "hidden";
      e.box.style.visibility = vis;
      e.line.setAttribute("visibility", vis);
      e.dot.setAttribute("visibility", vis);
      if (!onScreen) {
        e.placed = false;
        return;
      }
      const w = e.box.offsetWidth;
      const h = e.box.offsetHeight;
      // Push the box outwards from the middle of the free view.
      let dx = ax - cx;
      let dy = ay - cy;
      const len = Math.hypot(dx, dy);
      if (len < 1) {
        dx = -1;
        dy = -0.6;
      }
      const n = Math.hypot(dx, dy);
      const bx = ax + (dx / n) * OFFSET + (dx >= 0 ? 0 : -w);
      const by = ay + (dy / n) * OFFSET - h / 2;
      slots.push({ e, ax, ay, w, h, x: bx, y: by });
    });

    // Keep boxes apart (a few relaxation passes), then inside the free area.
    for (let pass = 0; pass < 10; pass++) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i];
          const b = slots[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + GAP;
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + GAP;
          if (ox <= 0 || oy <= 0) continue;
          // Separate along the axis that needs the smaller move.
          if (oy < ox) {
            const s = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1;
            a.y += (s * oy) / 2;
            b.y -= (s * oy) / 2;
          } else {
            const s = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
            a.x += (s * ox) / 2;
            b.x -= (s * ox) / 2;
          }
        }
      }
      for (const s of slots) {
        s.x = THREE.MathUtils.clamp(s.x, MARGIN, Math.max(MARGIN, R - s.w - MARGIN));
        s.y = THREE.MathUtils.clamp(s.y, MARGIN, Math.max(MARGIN, B - s.h - MARGIN));
      }
    }

    for (const s of slots) {
      const e = s.e;
      if (!e.placed) {
        e.x = s.x;
        e.y = s.y;
        e.placed = true;
      } else {
        e.x += (s.x - e.x) * SMOOTHING;
        e.y += (s.y - e.y) * SMOOTHING;
      }
      e.box!.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px)`;
      // Leader line: from the anchor to the nearest point of the box.
      const px = THREE.MathUtils.clamp(s.ax, e.x, e.x + s.w);
      const py = THREE.MathUtils.clamp(s.ay, e.y, e.y + s.h);
      e.line!.setAttribute("x1", s.ax.toFixed(1));
      e.line!.setAttribute("y1", s.ay.toFixed(1));
      e.line!.setAttribute("x2", px.toFixed(1));
      e.line!.setAttribute("y2", py.toFixed(1));
      e.dot!.setAttribute("cx", s.ax.toFixed(1));
      e.dot!.setAttribute("cy", s.ay.toFixed(1));
    }
  });

  return null;
}
