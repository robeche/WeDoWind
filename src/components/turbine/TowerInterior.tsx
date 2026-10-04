"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { DEG, GROUND_FLOOR_Y, TOWER_TOP, towerInnerR } from "./dimensions";
import { Part, useInteraction } from "./interaction";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* Angles are bearings around the tower axis: 0 = +Z (the door side),  */
/* point = (sin a · r, y, cos a · r).                                   */
/* ------------------------------------------------------------------ */

const LADDER_A = 30 * DEG;
const LADDER_HALF_W = 0.225;
const LADDER_WALL_GAP = 0.2;
const RUNG_PITCH = 0.3;

/** The service lift climbs the ladder itself: it rolls on the ladder rails and its pinion
 *  drives on a rack fixed to the middle of the ladder. */
const LIFT_LADDER_GAP = 0.12; // rollers + drive between ladder and cabin back
const LIFT_W = 0.8; // tangential
const LIFT_D = 0.8; // radial
const LIFT_H = 2.1;
const LIFT_SPEED = 1.6; // m/s (sped up from ~0.3 m/s so the motion reads on screen)
const LIFT_PAUSE_S = 4;

const CONTROL_A = -45 * DEG;
const TRANSFORMER_A = 180 * DEG;
const CONVERTER_AS = [195 * DEG, 235 * DEG];
const LIGHT_COLUMNS = [150 * DEG, 330 * DEG];
/** Power cables run down a cable tray on the wall at this bearing (between the converters). */
const TRAY_A = 215 * DEG;
const TRAY_TOP_Y = 74.8;
const TRAY_BOTTOM_Y = 6.4;
const CABLE_LOOP_BOTTOM_Y = 78;
const CABLE_R = 0.024;

/** Converter deck + rest platforms every 10 m + top platform under the yaw bearing. */
export const DECK_Y = 3.4;
export const TOP_PLATFORM_Y = 86.6;
export const PLATFORM_LEVELS = [...Array.from({ length: 8 }, (_, i) => DECK_Y + i * 10), TOP_PLATFORM_Y];

const LIFT_BOTTOM_Y = GROUND_FLOOR_Y;
const LIFT_TOP_Y = TOP_PLATFORM_Y;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const radial = (a: number) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
const tangent = (a: number) => new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
const polar = (a: number, r: number, y: number) => radial(a).multiplyScalar(r).setY(y);

/** Radial distance of a flat face of half-width `halfW` that keeps `gap` from the curved wall. */
const flatFaceR = (y: number, halfW: number, gap: number) => Math.sqrt((towerInnerR(y) - gap) ** 2 - halfW ** 2);

/** Linear path between the safe radii at two heights (safe everywhere: the exact curve is concave). */
function linearPath(y0: number, y1: number, rAt: (y: number) => number) {
  const r0 = rAt(y0);
  const r1 = rAt(y1);
  return (y: number) => r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
}

const ladderR = linearPath(GROUND_FLOOR_Y, TOWER_TOP - 0.4, (y) => flatFaceR(y, LADDER_HALF_W, LADDER_WALL_GAP));
/** Radius of the lift cabin's back face (it rides just in front of the ladder). */
const liftBackR = (y: number) => ladderR(y) - LIFT_LADDER_GAP;
/** Cable tray: a straight line a little in from the (linearly tapering) wall. */
const trayR = (y: number) => towerInnerR(y) - 0.1;

/** Position + rotation for a flat-backed box standing against the wall, front facing the axis. */
function wallMount(a: number, y: number, width: number, depth: number, gap = 0.06) {
  const back = flatFaceR(y, width / 2, gap);
  return {
    position: polar(a, back - depth / 2, y).toArray() as [number, number, number],
    rotation: [0, a + Math.PI, 0] as [number, number, number],
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** Cylinder between two points. */
function Beam({ from, to, radius, children }: { from: THREE.Vector3; to: THREE.Vector3; radius: number; children: ReactNode }) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = to.clone().sub(from);
    return {
      position: from.clone().add(to).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      length: dir.length(),
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      {children}
    </mesh>
  );
}

/** Flat bar between two points; `normal` is the direction its broad face looks at. */
function BoxBeam({
  from,
  to,
  width,
  thickness,
  normal,
  children,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  width: number;
  thickness: number;
  normal: THREE.Vector3;
  children: ReactNode;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const y = to.clone().sub(from);
    const len = y.length();
    y.normalize();
    const z = normal.clone().sub(y.clone().multiplyScalar(normal.dot(y))).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    return {
      position: from.clone().add(to).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)),
      length: len,
    };
  }, [from, to, normal]);
  return (
    <mesh position={position} quaternion={quaternion}>
      <boxGeometry args={[width, length, thickness]} />
      {children}
    </mesh>
  );
}

function convexHull(points: THREE.Vector2[]): THREE.Vector2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: THREE.Vector2[] = [];
  for (const pt of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Corners of a radial rectangle (angle a, radii r0..r1, tangential ±w) in Shape coordinates (x, −z). */
function hatchCorners(a: number, r0: number, r1: number, w: number) {
  const u = radial(a);
  const t = tangent(a);
  return [
    [r0, -w],
    [r1, -w],
    [r1, w],
    [r0, w],
  ].map(([r, s]) => new THREE.Vector2(u.x * r + t.x * s, -(u.z * r + t.z * s)));
}

/* ------------------------------------------------------------------ */
/* Tramex (steel grating) texture                                      */
/* ------------------------------------------------------------------ */

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat: [number, number]) {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Tramex steel grating. ShapeGeometry UVs are in metres → one tile ≈ 45 cm. */
const useGratingTexture = () =>
  useCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#b5bbc0";
      for (let x = 0; x < size; x += 16) ctx.fillRect(x, 0, 4, size); // bearing bars
      for (let y = 0; y < size; y += 42) ctx.fillRect(0, y, size, 3); // cross bars
    },
    [2.2, 2.2],
  );

/** Welded wire mesh for the transformer cage (UVs in metres → 5 cm squares). */
const useWireMeshTexture = () =>
  useCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#c9ced2";
      for (let i = 0; i < size; i += 16) {
        ctx.fillRect(i, 0, 2, size);
        ctx.fillRect(0, i, size, 2);
      }
    },
    [2.5, 2.5],
  );

/** Rack teeth along the ladder (box UVs run 0–1 along the bar → repeat set per length). */
const useRackTexture = (length: number) =>
  useCanvasTexture(
    (ctx, size) => {
      ctx.fillStyle = "#5b6166";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#a3a9ae";
      for (let y = 0; y < size; y += 32) ctx.fillRect(0, y, size, 14);
    },
    [1, length / 0.2],
  );

/** Plane whose UVs are in metres (so tiled textures keep a constant density). */
function metricPlane(w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  uv.needsUpdate = true;
  return g;
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

const LADDER_T = tangent(LADDER_A);
const LADDER_U = radial(LADDER_A);
const INWARD = LADDER_U.clone().negate();

function Ladder() {
  const y0 = GROUND_FLOOR_Y;
  const y1 = TOWER_TOP - 0.4;
  const t = LADDER_T;
  const u = LADDER_U;
  const bottom = polar(LADDER_A, ladderR(y0), y0);
  const top = polar(LADDER_A, ladderR(y1), y1);
  const rails = [-LADDER_HALF_W, LADDER_HALF_W].map((s) => ({
    from: bottom.clone().addScaledVector(t, s),
    to: top.clone().addScaledVector(t, s),
  }));
  // Fall-arrest rail just off-centre, rack for the lift pinion on the centre line (inner face).
  const safety = {
    from: bottom.clone().addScaledVector(t, 0.12).addScaledVector(u, 0.03),
    to: top.clone().addScaledVector(t, 0.12).addScaledVector(u, 0.03),
  };
  const rack = { from: bottom.clone().addScaledVector(u, -0.035), to: top.clone().addScaledVector(u, -0.035) };
  const rackTexture = useRackTexture(y1 - y0);

  const rungsRef = useRef<THREE.InstancedMesh>(null);
  const rungCount = Math.floor((y1 - y0) / RUNG_PITCH) - 1;
  useLayoutEffect(() => {
    const mesh = rungsRef.current;
    if (!mesh) return;
    const q = new THREE.Quaternion().setFromUnitVectors(UP, t);
    const m = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < rungCount; i++) {
      const y = y0 + RUNG_PITCH * (i + 1);
      m.compose(polar(LADDER_A, ladderR(y), y), q, one);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [rungCount, t]);

  return (
    <Part id="ladder" labelAt={polar(LADDER_A, ladderR(8) - 0.3, 8).toArray()}>
      {rails.map((r, i) => (
        <BoxBeam key={i} from={r.from} to={r.to} width={0.05} thickness={0.07} normal={INWARD}>
          <meshStandardMaterial color="#9ca3a9" metalness={0.6} roughness={0.4} />
        </BoxBeam>
      ))}
      <Beam from={safety.from} to={safety.to} radius={0.016}>
        <meshStandardMaterial color="#e2a12b" metalness={0.3} roughness={0.5} />
      </Beam>
      <BoxBeam from={rack.from} to={rack.to} width={0.07} thickness={0.03} normal={INWARD}>
        <meshStandardMaterial map={rackTexture} metalness={0.7} roughness={0.35} />
      </BoxBeam>
      <instancedMesh ref={rungsRef} args={[undefined, undefined, rungCount]}>
        <cylinderGeometry args={[0.016, 0.016, LADDER_HALF_W * 2, 6]} />
        <meshStandardMaterial color="#b0b6bb" metalness={0.6} roughness={0.4} />
      </instancedMesh>
    </Part>
  );
}

function ServiceLift({ visibleRef }: { visibleRef: React.RefObject<boolean> }) {
  const { selectedId, hoveredId } = useInteraction();
  const cabinRef = useRef<THREE.Group>(null);
  const motion = useRef({ y: LIFT_BOTTOM_Y, dir: 1, pause: LIFT_PAUSE_S });
  const parkRef = useRef(false);
  parkRef.current = selectedId === "lift";

  useFrame((_, delta) => {
    const cabin = cabinRef.current;
    if (!cabin || !visibleRef.current) return;
    const s = motion.current;
    const dt = Math.min(delta, 0.1);
    if (parkRef.current) {
      // Selected: come down and wait at the base so visitors can see it.
      s.y = Math.max(LIFT_BOTTOM_Y, s.y - LIFT_SPEED * 2 * dt);
      s.dir = 1;
      s.pause = LIFT_PAUSE_S;
    } else if (s.pause > 0) {
      s.pause -= dt;
    } else {
      s.y += s.dir * LIFT_SPEED * dt;
      if (s.y >= LIFT_TOP_Y || s.y <= LIFT_BOTTOM_Y) {
        s.y = THREE.MathUtils.clamp(s.y, LIFT_BOTTOM_Y, LIFT_TOP_Y);
        s.dir *= -1;
        s.pause = LIFT_PAUSE_S;
      }
    }
    // The cabin follows the ladder (which leans in very slightly with the tower taper).
    const r = liftBackR(s.y + LIFT_H / 2) - LIFT_D / 2;
    cabin.position.set(Math.sin(LADDER_A) * r, s.y, Math.cos(LADDER_A) * r);
  });

  const back = -LIFT_D / 2;
  return (
    <Part id="lift">
      <group
        ref={cabinRef}
        rotation={[0, LADDER_A + Math.PI, 0]}
        position={polar(LADDER_A, liftBackR(LIFT_BOTTOM_Y) - LIFT_D / 2, LIFT_BOTTOM_Y).toArray()}
      >
        <mesh position={[0, LIFT_H / 2, 0]}>
          <boxGeometry args={[LIFT_W, LIFT_H, LIFT_D]} />
          <meshStandardMaterial color="#d6dadd" metalness={0.4} roughness={0.45} />
        </mesh>
        {/* Orange roof guard and floor frame */}
        {[LIFT_H + 0.06, 0.05].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[LIFT_W + 0.04, y > 1 ? 0.12 : 0.1, LIFT_D + 0.04]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
        ))}
        {/* Door window facing the tower axis */}
        <mesh position={[0, 1.35, LIFT_D / 2 + 0.005]}>
          <planeGeometry args={[0.45, 0.6]} />
          <meshStandardMaterial color="#1e293b" metalness={0.2} roughness={0.15} />
        </mesh>
        {/* Drive unit on the ladder side: its pinion engages the rack on the ladder */}
        <mesh position={[0, 1.5, back - 0.05]}>
          <boxGeometry args={[0.3, 0.55, 0.1]} />
          <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.5, back - LIFT_LADDER_GAP + 0.05]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.06, 16]} />
          <meshStandardMaterial color="#2f3438" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Guide rollers gripping the ladder rails, top and bottom */}
        {[0.35, LIFT_H - 0.25].flatMap((y) =>
          [-LADDER_HALF_W, LADDER_HALF_W].map((x) => (
            <mesh key={`${x}-${y}`} position={[x, y, back - LIFT_LADDER_GAP + 0.04]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.05, 12]} />
              <meshStandardMaterial color="#1f2937" roughness={0.6} />
            </mesh>
          )),
        )}
        {[-LADDER_HALF_W, LADDER_HALF_W].map((x) => (
          <mesh key={`arm-${x}`} position={[x, LIFT_H / 2, back - 0.04]}>
            <boxGeometry args={[0.04, LIFT_H - 0.4, 0.08]} />
            <meshStandardMaterial color="#6b7176" metalness={0.5} />
          </mesh>
        ))}
        {hoveredId === "lift" && (
          <Html position={[0, LIFT_H + 0.5, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
            <div className="whitespace-nowrap rounded-full bg-slate-950/85 px-4 py-1.5 text-[clamp(0.85rem,1.8vh,1.3rem)] font-semibold text-white shadow-lg ring-1 ring-sky-300/60">
              Service lift
            </div>
          </Html>
        )}
      </group>
    </Part>
  );
}

/** Where the converter → transformer cables drop through the converter deck. */
const DECK_CABLE_HOLES = CONVERTER_AS.map((a) => ({ a, r: 1.95 }));

function Platforms() {
  const grating = useGratingTexture();
  const platforms = useMemo(
    () =>
      PLATFORM_LEVELS.map((y) => {
        const rP = towerInnerR(y) - 0.02;
        const shape = new THREE.Shape();
        shape.absarc(0, 0, rP, 0, Math.PI * 2, false);
        const edge = (w: number) => Math.sqrt((rP - 0.05) ** 2 - w ** 2);

        // Shared hatch for the ladder and the lift that rides on it.
        const hw = LIFT_W / 2 + 0.1;
        shape.holes.push(new THREE.Path(hatchCorners(LADDER_A, liftBackR(y) - LIFT_D - 0.1, edge(hw), hw)));
        // Slot where the cable tray passes through.
        if (y > TRAY_BOTTOM_Y && y < TRAY_TOP_Y) {
          shape.holes.push(new THREE.Path(hatchCorners(TRAY_A, trayR(y) - 0.25, edge(0.2), 0.2)));
        }
        // Converter deck: cable holes down to the transformer.
        if (y === DECK_Y) {
          for (const { a, r } of DECK_CABLE_HOLES) shape.holes.push(new THREE.Path(hatchCorners(a, r - 0.12, r + 0.12, 0.14)));
        }
        // Top platform: central opening for the hanging cable loop.
        if (y === TOP_PLATFORM_Y) {
          const hole = new THREE.Path();
          hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true);
          shape.holes.push(hole);
        }

        const geometry = new THREE.ShapeGeometry(shape, 48);
        geometry.rotateX(-Math.PI / 2); // shape (x, y) → world (x, 0, −y)
        return { y, rP, geometry };
      }),
    [],
  );
  useEffect(() => () => platforms.forEach((p) => p.geometry.dispose()), [platforms]);

  return (
    <Part id="platforms" labelAt={[0, PLATFORM_LEVELS[1] + 0.4, -1.2]}>
      {platforms.map(({ y, rP, geometry }) => (
        <group key={y} position={[0, y, 0]}>
          {/* The grating is see-through, so it does not catch the pointer (the rim does). */}
          <mesh geometry={geometry} userData={{ noHit: true }}>
            <meshStandardMaterial map={grating} alphaTest={0.45} side={THREE.DoubleSide} metalness={0.5} roughness={0.55} />
          </mesh>
          {/* Edge frame */}
          <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[rP, rP, 0.12, 48, 1, true]} />
            <meshStandardMaterial color="#8f969b" metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </Part>
  );
}

function Luminaires() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const placements = useMemo(() => {
    const out: Array<{ a: number; y: number }> = [];
    LIGHT_COLUMNS.forEach((a, col) => {
      for (let y = 2.4 + col * 3; y < TOWER_TOP - 1; y += 6) out.push({ a, y });
    });
    return out;
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    placements.forEach(({ a, y }, i) => {
      q.setFromAxisAngle(UP, a + Math.PI);
      m.compose(polar(a, towerInnerR(y) - 0.06, y), q, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  return (
    <Part id="lights" labelAt={polar(LIGHT_COLUMNS[0], 1.6, 14.4).toArray()}>
      <instancedMesh ref={ref} args={[undefined, undefined, placements.length]}>
        <boxGeometry args={[0.1, 0.7, 0.07]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff1d0" emissiveIntensity={2.4} toneMapped={false} />
      </instancedMesh>
    </Part>
  );
}

const CABINET_GREY = "#cfd3d6";

/** Door seams, handle and vents on the front (+Z) face of a cabinet of size w × h × d. */
function CabinetFront({ w, h, d, doors }: { w: number; h: number; d: number; doors: number }) {
  const z = d / 2 + 0.004;
  return (
    <>
      {Array.from({ length: doors - 1 }, (_, i) => (
        <mesh key={`seam-${i}`} position={[-w / 2 + ((i + 1) * w) / doors, h / 2, z]}>
          <boxGeometry args={[0.012, h - 0.08, 0.004]} />
          <meshStandardMaterial color="#555b60" />
        </mesh>
      ))}
      {Array.from({ length: doors }, (_, i) => (
        <group key={`door-${i}`} position={[-w / 2 + ((i + 0.5) * w) / doors, 0, z]}>
          <mesh position={[w / doors / 2 - 0.08, h * 0.55, 0.012]}>
            <boxGeometry args={[0.03, 0.18, 0.03]} />
            <meshStandardMaterial color="#2f3438" metalness={0.5} />
          </mesh>
          <mesh position={[0, h * 0.18, 0]}>
            <boxGeometry args={[Math.min(0.4, w / doors - 0.15), 0.22, 0.004]} />
            <meshStandardMaterial color="#6b7176" />
          </mesh>
        </group>
      ))}
    </>
  );
}

function ControlCabinet() {
  const w = 0.8;
  const h = 1.9;
  const d = 0.4;
  const mount = wallMount(CONTROL_A, GROUND_FLOOR_Y, w, d);
  return (
    <Part id="controlCabinet" labelAt={[mount.position[0], GROUND_FLOOR_Y + h + 0.35, mount.position[2]]}>
      <group {...mount}>
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={CABINET_GREY} roughness={0.55} />
        </mesh>
        <CabinetFront w={w} h={h} d={d} doors={1} />
        {/* Touch panel */}
        <mesh position={[-0.05, h * 0.72, d / 2 + 0.006]} userData={{ noHighlight: true }}>
          <planeGeometry args={[0.36, 0.24]} />
          <meshStandardMaterial color="#0b1220" emissive="#38bdf8" emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
        {/* Status LEDs */}
        {["#22c55e", "#22c55e", "#f59e0b"].map((c, i) => (
          <mesh key={i} position={[-0.2 + i * 0.08, h * 0.58, d / 2 + 0.01]} userData={{ noHighlight: true }}>
            <sphereGeometry args={[0.014, 8, 6]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={2} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </Part>
  );
}

function ConverterCabinets() {
  const w = 1.1;
  const h = 2.1;
  const d = 0.6;
  const mounts = CONVERTER_AS.map((a) => wallMount(a, DECK_Y, w, d));
  const mid = mounts[0].position.map((v, i) => (v + mounts[1].position[i]) / 2) as [number, number, number];
  return (
    <Part id="converter" labelAt={[mid[0], DECK_Y + h + 0.4, mid[2]]}>
      {mounts.map((mount, k) => (
        <group key={k} {...mount}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={CABINET_GREY} roughness={0.55} />
          </mesh>
          <CabinetFront w={w} h={h} d={d} doors={2} />
          {/* Fan outlet on the roof */}
          <mesh position={[0, h + 0.06, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
            <meshStandardMaterial color="#4b5563" metalness={0.4} />
          </mesh>
          <mesh position={[w / 4, h * 0.8, d / 2 + 0.008]} userData={{ noHighlight: true }}>
            <sphereGeometry args={[0.016, 8, 6]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </Part>
  );
}

/* Transformer + its locked safety cage ------------------------------ */

const TRANSFORMER_W = 1.7;
const TRANSFORMER_D = 0.95;
const TRANSFORMER_MOUNT = wallMount(TRANSFORMER_A, GROUND_FLOOR_Y, TRANSFORMER_W, TRANSFORMER_D, 0.25);
const COIL_X = [-0.55, 0, 0.55];
const CAGE_W = 2.1;
const CAGE_D = 1.3;
const CAGE_H = 2.3;
const CAGE_MOUNT = wallMount(TRANSFORMER_A, GROUND_FLOOR_Y, CAGE_W, CAGE_D);
const CAGE_DOOR_W = 0.9;

/** World position of a point given in the transformer's local frame. */
function transformerPoint(x: number, y: number, z: number) {
  const [px, py, pz] = TRANSFORMER_MOUNT.position;
  const a = TRANSFORMER_MOUNT.rotation[1];
  return new THREE.Vector3(px + x * Math.cos(a) + z * Math.sin(a), py + y, pz - x * Math.sin(a) + z * Math.cos(a));
}

function TransformerCage() {
  const mesh = useWireMeshTexture();
  const geos = useMemo(
    () => ({
      side: metricPlane(CAGE_D, CAGE_H),
      back: metricPlane(CAGE_W, CAGE_H),
      top: metricPlane(CAGE_W, CAGE_D),
      frontFixed: metricPlane(CAGE_W - CAGE_DOOR_W, CAGE_H),
      door: metricPlane(CAGE_DOOR_W - 0.06, CAGE_H - 0.1),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  const W = CAGE_W / 2;
  const D = CAGE_D / 2;
  const H = CAGE_H;
  const doorX = W - CAGE_DOOR_W / 2; // door on the right-hand side of the front
  // 12 box edges + the door jamb, as [centre, size].
  const tubes: Array<[[number, number, number], [number, number, number]]> = [
    ...[-W, W].flatMap((x) => [-D, D].map((z) => [[x, H / 2, z], [0.05, H, 0.05]] as [[number, number, number], [number, number, number]])),
    ...[0.02, H].flatMap((y) => [
      [[0, y, -D], [CAGE_W, 0.05, 0.05]] as [[number, number, number], [number, number, number]],
      [[0, y, D], [CAGE_W, 0.05, 0.05]] as [[number, number, number], [number, number, number]],
      [[-W, y, 0], [0.05, 0.05, CAGE_D]] as [[number, number, number], [number, number, number]],
      [[W, y, 0], [0.05, 0.05, CAGE_D]] as [[number, number, number], [number, number, number]],
    ]),
    [[W - CAGE_DOOR_W, H / 2, D], [0.05, H, 0.05]],
  ];
  const meshMaterial = (
    <meshStandardMaterial map={mesh} alphaTest={0.4} side={THREE.DoubleSide} metalness={0.6} roughness={0.45} />
  );

  return (
    <group {...CAGE_MOUNT}>
      <mesh geometry={geos.back} position={[0, H / 2, -D]}>{meshMaterial}</mesh>
      <mesh geometry={geos.side} position={[-W, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>{meshMaterial}</mesh>
      <mesh geometry={geos.side} position={[W, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>{meshMaterial}</mesh>
      <mesh geometry={geos.top} position={[0, H, 0]} rotation={[-Math.PI / 2, 0, 0]}>{meshMaterial}</mesh>
      <mesh geometry={geos.frontFixed} position={[-W + (CAGE_W - CAGE_DOOR_W) / 2, H / 2, D]}>{meshMaterial}</mesh>
      {/* Locked door */}
      <group position={[doorX, 0, D + 0.01]}>
        <mesh geometry={geos.door} position={[0, H / 2, 0]}>{meshMaterial}</mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[(sx * (CAGE_DOOR_W - 0.06)) / 2, H / 2, 0]}>
            <boxGeometry args={[0.04, H - 0.1, 0.04]} />
            <meshStandardMaterial color="#5b6166" metalness={0.5} />
          </mesh>
        ))}
        {/* Handle + padlock */}
        <mesh position={[-CAGE_DOOR_W / 2 + 0.1, 1.1, 0.04]}>
          <boxGeometry args={[0.03, 0.2, 0.04]} />
          <meshStandardMaterial color="#1f2937" metalness={0.6} />
        </mesh>
        <mesh position={[-CAGE_DOOR_W / 2 + 0.1, 0.92, 0.06]}>
          <boxGeometry args={[0.07, 0.08, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[-CAGE_DOOR_W / 2 + 0.1, 0.98, 0.06]}>
          <torusGeometry args={[0.025, 0.007, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#c0c4c8" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* "Danger – high voltage" sign */}
        <mesh position={[0, 1.55, 0.03]} userData={{ noHighlight: true }}>
          <planeGeometry args={[0.42, 0.3]} />
          <meshStandardMaterial color="#facc15" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.57, 0.035]} rotation={[0, 0, Math.PI]} userData={{ noHighlight: true }}>
          <circleGeometry args={[0.1, 3]} />
          <meshStandardMaterial color="#111827" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.57, 0.04]} rotation={[0, 0, Math.PI]} userData={{ noHighlight: true }}>
          <circleGeometry args={[0.075, 3]} />
          <meshStandardMaterial color="#facc15" side={THREE.DoubleSide} />
        </mesh>
      </group>
      {tubes.map(([pos, size], i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#5b6166" metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

function Transformer() {
  const w = TRANSFORMER_W;
  const d = TRANSFORMER_D;
  return (
    <Part id="transformer" labelAt={[CAGE_MOUNT.position[0], GROUND_FLOOR_Y + CAGE_H + 0.35, CAGE_MOUNT.position[2]]}>
      <group {...TRANSFORMER_MOUNT}>
        {/* Base frame */}
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[w, 0.12, d - 0.1]} />
          <meshStandardMaterial color="#374151" metalness={0.4} />
        </mesh>
        {/* Core yokes */}
        {[0.3, 1.66].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[w - 0.1, 0.24, 0.34]} />
            <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        {/* Three cast-resin coils */}
        {COIL_X.map((x) => (
          <mesh key={x} position={[x, 0.98, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 1.12, 32]} />
            <meshStandardMaterial color="#8a3b2e" roughness={0.35} />
          </mesh>
        ))}
        {/* HV bushings and LV busbars */}
        {COIL_X.map((x) => (
          <group key={`t-${x}`}>
            <mesh position={[x, 1.9, -0.08]}>
              <cylinderGeometry args={[0.04, 0.05, 0.22, 10]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.3} />
            </mesh>
            <mesh position={[x, 1.25, 0.3]}>
              <boxGeometry args={[0.06, 0.5, 0.02]} />
              <meshStandardMaterial color="#c47b3c" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>
      <TransformerCage />
    </Part>
  );
}

/* Power cables: nacelle → converter → transformer → grid -------------- */

/** Converter mounts (same maths as ConverterCabinets). */
const CONVERTER_W = 1.1;
const CONVERTER_DEPTH = 0.6;
const CONVERTER_H = 2.1;
const converterCentreR = flatFaceR(DECK_Y, CONVERTER_W / 2, 0.06) - CONVERTER_DEPTH / 2;

function cableTube(points: THREE.Vector3[], segments: number) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  return new THREE.TubeGeometry(curve, segments, CABLE_R, 6, false);
}

function PowerCables() {
  const geometries = useMemo(() => {
    const t = tangent(TRAY_A);
    const trayTop = polar(TRAY_A, trayR(TRAY_TOP_Y), TRAY_TOP_Y);
    const trayBottom = polar(TRAY_A, trayR(TRAY_BOTTOM_Y), TRAY_BOTTOM_Y);
    // Cables leave the nacelle through the yaw bearing, hang in a free loop down the middle of
    // the tower (so the nacelle can turn), then a saddle guides them onto the wall tray.
    const drop = [
      new THREE.Vector3(0, TOWER_TOP + 0.6, 0),
      new THREE.Vector3(0, TOWER_TOP - 3, 0),
      new THREE.Vector3(0, CABLE_LOOP_BOTTOM_Y + 1.5, 0),
      polar(TRAY_A, 0.45, CABLE_LOOP_BOTTOM_Y - 0.4),
      polar(TRAY_A, trayR(TRAY_TOP_Y + 1.5) - 0.25, TRAY_TOP_Y + 1.2),
      trayTop,
      polar(TRAY_A, trayR(40), 40),
      trayBottom,
    ];
    const out: THREE.BufferGeometry[] = [];

    CONVERTER_AS.forEach((a, k) => {
      // Top-down feed into the converter cabinet roof (near its back).
      const entry = polar(a, converterCentreR + 0.23, DECK_Y + CONVERTER_H + 0.02);
      const midA = (TRAY_A + a) / 2;
      for (let j = 0; j < 3; j++) {
        const off = t.clone().multiplyScalar((k * 3 + j - 2.5) * 0.055);
        const pts = [
          ...drop.map((p) => p.clone().add(off)),
          polar(midA, trayR(6) - 0.15, DECK_Y + CONVERTER_H + 0.55).addScaledVector(t, (j - 1) * 0.05),
          entry.clone().add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(tangent(a), (j - 1) * 0.07),
          entry.clone().addScaledVector(tangent(a), (j - 1) * 0.07),
        ];
        out.push(cableTube(pts, 420));
      }

      // Converter output → down through the deck → over the cage → transformer LV busbars.
      for (let j = 0; j < 3; j++) {
        const s = (j - 1) * 0.06;
        const busbar = transformerPoint(COIL_X[j], 1.5, 0.3 + k * 0.05);
        const pts = [
          polar(a, converterCentreR - CONVERTER_DEPTH / 2 + 0.05, DECK_Y + 0.35).addScaledVector(tangent(a), s),
          polar(a, 1.98, DECK_Y + 0.05).addScaledVector(tangent(a), s),
          polar(a, 1.92, DECK_Y - 0.3).addScaledVector(tangent(a), s),
          new THREE.Vector3(busbar.x, GROUND_FLOOR_Y + CAGE_H + 0.15, busbar.z),
          new THREE.Vector3(busbar.x, busbar.y + 0.35, busbar.z),
          busbar,
        ];
        out.push(cableTube(pts, 60));
      }
    });

    // Medium-voltage cables from the HV bushings down into the foundation (to the grid).
    COIL_X.forEach((x) => {
      const bushing = transformerPoint(x, 2.0, -0.08);
      const pts = [
        bushing,
        transformerPoint(x, 2.18, -0.1),
        transformerPoint(x * 0.6, 2.15, -0.42),
        transformerPoint(x * 0.6, 1.0, -0.5),
        transformerPoint(x * 0.6, -0.3, -0.5),
      ];
      out.push(cableTube(pts, 40));
    });
    return out;
  }, []);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);

  // Cable tray on the wall behind the vertical run.
  const tray = useMemo(() => {
    const n = radial(TRAY_A).negate();
    const t = tangent(TRAY_A);
    const from = polar(TRAY_A, trayR(TRAY_BOTTOM_Y - 0.4) + 0.03, TRAY_BOTTOM_Y - 0.4);
    const to = polar(TRAY_A, trayR(TRAY_TOP_Y + 0.4) + 0.03, TRAY_TOP_Y + 0.4);
    return {
      n,
      from,
      to,
      sides: [-0.18, 0.18].map((s) => ({
        from: from.clone().addScaledVector(t, s).addScaledVector(n, 0.04),
        to: to.clone().addScaledVector(t, s).addScaledVector(n, 0.04),
      })),
    };
  }, []);

  return (
    <Part id="cables" labelAt={polar(TRAY_A, trayR(20) - 0.3, 20).toArray()}>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#141619" roughness={0.55} metalness={0.05} />
        </mesh>
      ))}
      <BoxBeam from={tray.from} to={tray.to} width={0.38} thickness={0.015} normal={tray.n}>
        <meshStandardMaterial color="#9aa1a6" metalness={0.6} roughness={0.4} />
      </BoxBeam>
      {tray.sides.map((side, i) => (
        <BoxBeam key={i} from={side.from} to={side.to} width={0.015} thickness={0.08} normal={tray.n}>
          <meshStandardMaterial color="#9aa1a6" metalness={0.6} roughness={0.4} />
        </BoxBeam>
      ))}
    </Part>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

/**
 * Everything inside the tower. Always mounted (so adding lights never forces a shader
 * recompile) but hidden until the tower opens; `progressRef` goes 0 → 1 as it opens.
 */
function TowerInterior({
  progressRef,
  workLightYRef,
}: {
  progressRef: React.RefObject<number>;
  workLightYRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const baseLightRef = useRef<THREE.PointLight>(null);
  const workLightRef = useRef<THREE.PointLight>(null);
  const visibleRef = useRef(false);

  useFrame(() => {
    const p = progressRef.current;
    const visible = p > 0.02;
    visibleRef.current = visible;
    if (groupRef.current) groupRef.current.visible = visible;
    if (baseLightRef.current) baseLightRef.current.intensity = 22 * p;
    if (workLightRef.current) {
      workLightRef.current.intensity = 26 * p;
      const target = THREE.MathUtils.clamp(workLightYRef.current, 2, TOWER_TOP - 2);
      workLightRef.current.position.y += (target - workLightRef.current.position.y) * 0.08;
    }
  });

  return (
    <>
      <pointLight ref={baseLightRef} position={[0, 2.8, 0]} intensity={0} distance={16} decay={2} color="#fff4e0" />
      <pointLight ref={workLightRef} position={[0, 8, 0]} intensity={0} distance={22} decay={2} color="#fff4e0" />
      <group ref={groupRef} visible={false}>
        <Ladder />
        <ServiceLift visibleRef={visibleRef} />
        <Platforms />
        <Luminaires />
        <ControlCabinet />
        <ConverterCabinets />
        <Transformer />
        <PowerCables />
      </group>
    </>
  );
}

export default memo(TowerInterior);
