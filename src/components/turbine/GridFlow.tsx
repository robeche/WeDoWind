"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Line2 } from "three-stdlib";
import { RATED_POWER_KW } from "@/services/aceApi";
import { CABLE_ROUTE, GRID_LINES, SEABANK_SUBSTATION, type GridLine } from "./gridData";

/** Rated output of the turbine (kW): full flow speed and brightness at this power. */
const RATED_KW = RATED_POWER_KW;
/** Gantry height (m) where the lines leave the substation. */
const GANTRY_Y = 12;
const ENERGY_COLOR = "#fde047";
const CONDUCTOR_COLOR = "#dbe4ee";

type V3 = [number, number, number];

/**
 * Two conductor paths per overhead line (one per circuit, either side of the towers), hung a little
 * below each tower top with a parabolic sag between towers.
 */
function conductorPaths(line: GridLine): V3[][] {
  const towers = line.towers.slice();
  // Start the line at the substation gantry when its first tower is next to it.
  const [sx, sz] = SEABANK_SUBSTATION;
  if (Math.hypot(towers[0][0] - sx, towers[0][2] - sz) < 150) towers.unshift([sx, GANTRY_Y, sz]);

  const is400 = line.kv >= 400;
  const arm = is400 ? 8.5 : 5; // half spread between the two circuits (m)
  const drop = is400 ? 9 : 6; // conductors hang this far below the tower top (m)
  const n = towers.length;

  // Horizontal normal at each tower: bisector of the adjacent spans, so conductors stay continuous.
  const normals = towers.map((_, i) => {
    const a = towers[Math.max(0, i - 1)];
    const b = towers[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l] as [number, number];
  });

  return [-1, 1].map((side) => {
    const pts: V3[] = [];
    for (let i = 0; i < n - 1; i++) {
      const [x1, y1, z1] = towers[i];
      const [x2, y2, z2] = towers[i + 1];
      const o1 = normals[i].map((v) => v * arm * side);
      const o2 = normals[i + 1].map((v) => v * arm * side);
      const h1 = Math.max(4, y1 - (i === 0 && y1 === GANTRY_Y ? 0 : drop));
      const h2 = Math.max(4, y2 - drop);
      const span = Math.hypot(x2 - x1, z2 - z1);
      const sag = Math.min(0.03 * span, 10);
      const steps = Math.max(4, Math.round(span / 25));
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps;
        pts.push([
          x1 + o1[0] + (x2 + o2[0] - x1 - o1[0]) * t,
          h1 + (h2 - h1) * t - 4 * sag * t * (1 - t),
          z1 + o1[1] + (z2 + o2[1] - z1 - o1[1]) * t,
        ]);
      }
    }
    return pts;
  });
}

/**
 * Where the energy goes: a glowing cable from the turbine base to Seabank substation and the
 * overhead lines leaving it. While the turbine generates, bright pulses run along them; their
 * speed and brightness follow the live power output. Without power the wires are just wires.
 */
export default function GridFlow({
  liveRef,
}: {
  /** Live inputs of the scene; only `powerKw` (and `hasData`) are read, every frame. */
  liveRef: React.RefObject<{ powerKw?: number; hasData: boolean }>;
}) {
  const paths = useMemo(() => GRID_LINES.flatMap((l) => conductorPaths(l).map((p) => ({ points: p, kv: l.kv }))), []);
  const energyRefs = useRef<Array<Line2 | null>>([]);
  const cableRef = useRef<Line2 | null>(null);
  const flow = useRef({ level: 0, offset: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.25);
    const live = liveRef.current;
    const p = live.hasData ? THREE.MathUtils.clamp((live.powerKw ?? 0) / RATED_KW, 0, 1) : 0;
    const f = flow.current;
    // Visible as soon as the turbine produces anything; eases in/out with production.
    const target = p > 0.005 ? 0.35 + 0.65 * Math.sqrt(p) : 0;
    f.level += (target - f.level) * (1 - Math.exp(-dt / 0.8));
    // Pulses travel faster with more power (m/s, purely illustrative).
    f.offset -= (12 + 90 * p) * dt;
    const lines = [...energyRefs.current, cableRef.current];
    for (const line of lines) {
      if (!line) continue;
      const m = line.material;
      m.dashOffset = f.offset;
      m.opacity = f.level;
      line.visible = f.level > 0.01;
    }
  });

  // Drawn after the splat (renderOrder) so the photographed ground never hides the wires; the
  // opaque turbine still occludes them through the depth test.
  return (
    <group>
      {/* Underground cable: a dim trace always, pulses on top while generating */}
      <Line
        points={CABLE_ROUTE}
        color="#94a3b8"
        lineWidth={1.5}
        transparent
        opacity={0.35}
        depthWrite={false}
        renderOrder={2}
      />
      <Line
        ref={cableRef}
        points={CABLE_ROUTE}
        color={ENERGY_COLOR}
        lineWidth={4}
        dashed
        dashSize={10}
        gapSize={18}
        transparent
        opacity={0}
        depthWrite={false}
        renderOrder={2}
        toneMapped={false}
      />
      {paths.map(({ points, kv }, i) => (
        <group key={i}>
          <Line
            points={points}
            color={CONDUCTOR_COLOR}
            lineWidth={kv >= 400 ? 1.4 : 1.1}
            transparent
            opacity={0.5}
            renderOrder={1}
          />
          <Line
            ref={(el) => {
              energyRefs.current[i] = el as Line2 | null;
            }}
            points={points}
            color={ENERGY_COLOR}
            lineWidth={kv >= 400 ? 3.5 : 2.8}
            dashed
            dashSize={14}
            gapSize={26}
            transparent
            opacity={0}
            depthWrite={false}
            renderOrder={2}
            toneMapped={false}
          />
        </group>
      ))}
    </group>
  );
}
