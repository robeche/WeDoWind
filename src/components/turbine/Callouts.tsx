"use client";

/**
 * Floating "signs" around the turbine (mobile layout). Each card sits in a screen slot and a
 * thin leader line connects it to a point on the 3D turbine; the line end is updated every
 * frame by <CalloutProjector> inside the canvas (no React re-renders).
 */

import { useRef, type ReactNode } from "react";

/** Points on the turbine a card can point at (resolved to world space each frame). */
export type AnchorId = "hub" | "rotorTop" | "nacelle" | "towerUpper" | "towerMid" | "towerLow" | "base";
export type CalloutSlot = "tl" | "tr" | "ml" | "mr" | "bl" | "br";

export interface CalloutSpec {
  id: string;
  slot: CalloutSlot;
  anchor: AnchorId;
  content: ReactNode;
}

export interface CalloutEntry {
  anchor: AnchorId;
  side: "left" | "right";
  card: HTMLDivElement | null;
  line: SVGLineElement | null;
  dot: SVGCircleElement | null;
}

/** Shared between the HTML layer and the in-canvas projector. */
export type CalloutRegistry = Map<string, CalloutEntry>;

const SLOT_CLASS: Record<CalloutSlot, string> = {
  tl: "left-[3vw] top-[17%]",
  tr: "right-[3vw] top-[17%]",
  ml: "left-[3vw] top-[42%]",
  mr: "right-[3vw] top-[42%]",
  bl: "left-[3vw] top-[64%]",
  br: "right-[3vw] top-[64%]",
};

const FLOAT_DELAY: Record<CalloutSlot, string> = {
  tl: "0s",
  tr: "-1.5s",
  ml: "-3s",
  mr: "-4.5s",
  bl: "-2.2s",
  br: "-0.8s",
};

export function CalloutLayer({
  callouts,
  registry,
  hidden,
}: {
  callouts: CalloutSpec[];
  registry: React.RefObject<CalloutRegistry>;
  hidden: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const entry = (c: CalloutSpec): CalloutEntry => {
    let e = registry.current.get(c.id);
    if (!e) {
      e = { anchor: c.anchor, side: c.slot.endsWith("l") ? "left" : "right", card: null, line: null, dot: null };
      registry.current.set(c.id, e);
    }
    e.anchor = c.anchor;
    return e;
  };

  return (
    <div
      className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${hidden ? "opacity-0" : "opacity-100"}`}
      aria-hidden={hidden}
    >
      <svg ref={svgRef} className="absolute inset-0 size-full overflow-visible">
        {callouts.map((c) => {
          const e = entry(c);
          return (
            <g key={c.id}>
              <line
                ref={(el) => {
                  e.line = el;
                }}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth={1.2}
                strokeDasharray="3 3"
              />
              <circle
                ref={(el) => {
                  e.dot = el;
                }}
                r={3.5}
                fill="#6ee7b7"
                stroke="rgba(2,6,23,0.6)"
                strokeWidth={1.5}
              />
            </g>
          );
        })}
      </svg>
      {callouts.map((c) => {
        const e = entry(c);
        return (
          <div
            key={c.id}
            ref={(el) => {
              e.card = el;
            }}
            className={`absolute w-[min(35vw,10.5rem)] ${SLOT_CLASS[c.slot]}`}
          >
            <div className="animate-float" style={{ animationDelay: FLOAT_DELAY[c.slot] }}>
              {c.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
