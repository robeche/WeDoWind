"use client";

/**
 * Inside the nacelle (machine room). Two frames:
 * - NacelleInterior: tilted nacelle frame (+Z towards the rotor, origin on the shaft axis).
 * - YawSystem: the un-tilted yaw frame (origin at the tower top, on the tower axis).
 * Both are hidden until the nacelle is opened (`progressRef` 0 → 1).
 */

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { NACELLE_AXIS_Y, NACELLE_STRETCH } from "./dimensions";
import { cylinderBetween, tubeThrough } from "./geometry";
import { Part } from "./interaction";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Where the tower cable loop meets the nacelle: the yaw axis, just above the tower top. */
export const YAW_AXIS_CABLE_ENTRY = V(0, 0.6 - NACELLE_AXIS_Y, 0);

const CABINET = { w: 0.4, h: 1.5, d: 0.9, x: 1.45, floorY: -2.0, zs: [-0.1, 0.95] };
const PUMP = { x: -1.45, z: 0.3 };
/** Heat exchanger across the back wall of the (stretched) machine house. */
const COOLER_Z = -1.72 - NACELLE_STRETCH;

function useVisible(progressRef: React.RefObject<number>) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = progressRef.current > 0.02;
  });
  return ref;
}

/** Heat-exchanger core size (m) and the open fin pack's spacing. */
const COOLER = { w: 2.1, h: 1.9, d: 0.16, y: -0.25 };
/** Fins across the core (one per texture tile); the gaps between them are see-through. */
const FIN_COUNT = 26;
/** Wire-mesh cage around the core: mesh pitch (m) and how far it stands off the core. */
const CAGE_PITCH = 0.16;
const CAGE_GAP = 0.1;

/**
 * One fin per tile: an opaque aluminium strip with a coolant tube crossing it, transparent
 * elsewhere (alphaTest), so the fans behind the exchanger stay visible.
 */
function useFinTexture() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 16, 64);
    ctx.fillStyle = "#b9c1c8";
    ctx.fillRect(0, 0, 4, 64); // fin
    ctx.fillStyle = "#8a939b";
    ctx.fillRect(4, 0, 1, 64); // fin edge shading
    ctx.fillStyle = "#c97a4a";
    for (const y of [10, 42]) ctx.fillRect(0, y, 16, 3); // copper coolant tubes through the fins
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(FIN_COUNT, 3);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function Fan({ position }: { position: [number, number, number] }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.z += Math.min(dt, 0.1) * 9;
  });
  return (
    <group position={position}>
      <mesh>
        <torusGeometry args={[0.46, 0.04, 8, 32]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>
      <group ref={rotor}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} rotation={[0.35, 0, (i / 5) * Math.PI * 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.12, 0.8, 0.015]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.1, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      </group>
    </group>
  );
}

/** Steel frame around the heat-exchanger core. */
function CoolerFrame() {
  const t = 0.06;
  const bars: Array<[[number, number, number], [number, number, number]]> = [
    [[0, COOLER.h / 2 + t / 2, 0], [COOLER.w + 2 * t, t, COOLER.d]],
    [[0, -COOLER.h / 2 - t / 2, 0], [COOLER.w + 2 * t, t, COOLER.d]],
    [[COOLER.w / 2 + t / 2, 0, 0], [t, COOLER.h, COOLER.d]],
    [[-COOLER.w / 2 - t / 2, 0, 0], [t, COOLER.h, COOLER.d]],
    [[0, 0, 0], [0.04, COOLER.h, COOLER.d]], // centre post between the two fans
  ];
  return (
    <group position={[0, COOLER.y, COOLER_Z]}>
      {bars.map(([pos, size], i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Thin wire-mesh guard on the machine-room side of the exchanger (lines: nearly see-through). */
function CoolerCage() {
  const geometry = useMemo(() => {
    const w = COOLER.w / 2 + 0.06;
    const h = COOLER.h / 2 + 0.06;
    const z = CAGE_GAP + COOLER.d / 2;
    const pts: number[] = [];
    const seg = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b);
    // Mesh on the face and the four sides (a shallow box over the core).
    for (let x = -w; x <= w + 1e-6; x += CAGE_PITCH) seg([x, -h, z], [x, h, z]);
    for (let y = -h; y <= h + 1e-6; y += CAGE_PITCH) seg([-w, y, z], [w, y, z]);
    for (const sx of [-w, w]) {
      seg([sx, -h, 0], [sx, -h, z]);
      seg([sx, h, 0], [sx, h, z]);
      for (let y = -h; y <= h + 1e-6; y += CAGE_PITCH * 2) seg([sx, y, 0], [sx, y, z]);
    }
    for (const sy of [-h, h]) for (let x = -w; x <= w + 1e-6; x += CAGE_PITCH * 2) seg([x, sy, 0], [x, sy, z]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    // Lines would otherwise catch the pointer from ~1 m away (raycaster line threshold).
    <lineSegments geometry={geometry} position={[0, COOLER.y, COOLER_Z]} raycast={() => null}>
      <lineBasicMaterial color="#6b7280" transparent opacity={0.75} />
    </lineSegments>
  );
}

function NacelleInteriorImpl({ progressRef }: { progressRef: React.RefObject<number> }) {
  const groupRef = useVisible(progressRef);
  const fins = useFinTexture();

  const geo = useMemo(() => {
    // Main carrier: cast "elbow" from the yaw bearing up to the axle flange behind the generator.
    const carrier = cylinderBetween(V(0, -2.3, 0), V(0, 0, 1.82), 1.25, 0.9, 40);
    // Power cables: yaw axis → up beside the carrier → stator terminal box.
    const power = [-0.06, 0, 0.06].map((o) =>
      tubeThrough(
        [
          YAW_AXIS_CABLE_ENTRY.clone().add(V(o, 0, 0)),
          V(o - 0.1, -2.15, 0.15),
          V(-0.9 + o, -2.2, 0.5),
          V(-1.6 + o, -2.15, 1.15),
          V(-1.95 + o, -1.98, 1.55),
          V(-2.0 + o * 1.5, -1.95, 1.62),
        ],
        0.03,
        60,
      ),
    );
    // Control cables: yaw axis → nacelle control cabinets (bottom entry).
    const data = [0, 1, 2].map((j) =>
      tubeThrough(
        [
          YAW_AXIS_CABLE_ENTRY.clone().add(V(0.12, 0, 0.04 * (j - 1))),
          V(0.3, -2.25, 0.05 * (j - 1)),
          V(0.9, -2.25, 0.1 + 0.05 * j),
          V(CABINET.x - 0.05, CABINET.floorY - 0.05, CABINET.zs[0] + 0.1 * (j - 1)),
          V(CABINET.x, CABINET.floorY + 0.05, CABINET.zs[0] + 0.1 * (j - 1)),
        ],
        0.014,
        48,
      ),
    );
    // Coolant circuit: generator stator ↔ pump skid ↔ rear heat exchanger (red = hot, blue = cooled).
    const hot = tubeThrough([V(-2.45, 1.0, 1.85), V(-1.9, 0.4, 1.3), V(PUMP.x, -1.1, PUMP.z + 0.3), V(-1.2, -1.2, -1.2), V(-1.1, -1.1, COOLER_Z + 0.6), V(-0.95, -0.9, COOLER_Z + 0.02)], 0.05, 60);
    const cold = tubeThrough([V(0.95, -0.9, COOLER_Z + 0.02), V(1.1, -1.3, COOLER_Z + 0.6), V(1.25, -1.5, -1.2), V(0.6, -2.05, -0.6), V(PUMP.x + 0.15, -1.55, PUMP.z - 0.25), V(-1.75, -0.2, 1.25), V(-2.3, 0.75, 1.85)], 0.05, 60);
    const toCabinet = tubeThrough([V(PUMP.x + 0.2, -1.4, PUMP.z), V(0.2, -1.95, 0.6), V(CABINET.x - 0.25, -1.3, CABINET.zs[1])], 0.025, 40);
    return { carrier, power, data, hot, cold, toCabinet };
  }, []);
  useEffect(
    () => () => {
      geo.carrier.dispose();
      [...geo.power, ...geo.data, geo.hot, geo.cold, geo.toCabinet].forEach((g) => g.dispose());
    },
    [geo],
  );

  return (
    <group ref={groupRef} visible={false}>
      <Part id="mainCarrier" labelAt={[0, 0.6, 0.6]}>
        <mesh geometry={geo.carrier}>
          <meshStandardMaterial color="#5f6b74" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Axle flange and base ring on the yaw bearing */}
        <mesh position={[0, 0, 1.8]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.1, 1.1, 0.16, 40]} />
          <meshStandardMaterial color="#5f6b74" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, -2.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.32, 0.12, 10, 48]} />
          <meshStandardMaterial color="#5f6b74" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Service floor (grating) either side */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.55, CABINET.floorY - 0.02, 0.45 - NACELLE_STRETCH / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.7, 2.6 + NACELLE_STRETCH]} />
            <meshStandardMaterial color="#8f969b" metalness={0.5} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </Part>

      <Part id="nacelleCabinets" labelAt={[CABINET.x, CABINET.floorY + CABINET.h + 0.4, 0.45]}>
        {CABINET.zs.map((z) => (
          <group key={z} position={[CABINET.x, CABINET.floorY, z]}>
            <mesh position={[0, CABINET.h / 2, 0]}>
              <boxGeometry args={[CABINET.w, CABINET.h, CABINET.d]} />
              <meshStandardMaterial color="#cfd3d6" roughness={0.55} />
            </mesh>
            {/* Door seam + handle + status LED on the inward face (−X) */}
            <mesh position={[-CABINET.w / 2 - 0.003, CABINET.h / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[0.01, CABINET.h - 0.1]} />
              <meshStandardMaterial color="#555b60" />
            </mesh>
            <mesh position={[-CABINET.w / 2 - 0.02, CABINET.h * 0.55, 0.3]}>
              <boxGeometry args={[0.03, 0.16, 0.03]} />
              <meshStandardMaterial color="#2f3438" />
            </mesh>
            <mesh position={[-CABINET.w / 2 - 0.006, CABINET.h * 0.8, -0.25]} userData={{ noHighlight: true }}>
              <sphereGeometry args={[0.015, 8, 6]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </Part>

      <Part id="cooling" labelAt={[0, 1.1, COOLER_Z - 0.1]}>
        {/* Heat exchanger across the back of the nacelle: an open fin pack in a frame, guarded
            by a wire-mesh cage, so the fans behind it stay visible. */}
        <mesh position={[0, COOLER.y, COOLER_Z]}>
          <planeGeometry args={[COOLER.w, COOLER.h]} />
          <meshStandardMaterial map={fins} alphaTest={0.5} side={THREE.DoubleSide} metalness={0.55} roughness={0.4} />
        </mesh>
        <CoolerFrame />
        <CoolerCage />
        <Fan position={[-0.52, -0.25, COOLER_Z - 0.16]} />
        <Fan position={[0.52, -0.25, COOLER_Z - 0.16]} />
        {/* Pump skid */}
        <group position={[PUMP.x, -1.85, PUMP.z]}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[0.45, 0.5, 0.8]} />
            <meshStandardMaterial color="#3b82f6" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.62, -0.15]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.14, 0.14, 0.4, 16]} />
            <meshStandardMaterial color="#1e3a8a" metalness={0.4} />
          </mesh>
          {/* Expansion tank */}
          <mesh position={[0, 0.75, 0.22]}>
            <cylinderGeometry args={[0.12, 0.12, 0.35, 16]} />
            <meshStandardMaterial color="#e5e7eb" metalness={0.3} />
          </mesh>
        </group>
        <mesh geometry={geo.hot}>
          <meshStandardMaterial color="#dc2626" roughness={0.45} />
        </mesh>
        <mesh geometry={geo.cold}>
          <meshStandardMaterial color="#2563eb" roughness={0.45} />
        </mesh>
        <mesh geometry={geo.toCabinet}>
          <meshStandardMaterial color="#2563eb" roughness={0.45} />
        </mesh>
      </Part>

      <Part id="nacelleCables" labelAt={[-1.0, -1.3, 0.6]}>
        {geo.power.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color="#141619" roughness={0.55} />
          </mesh>
        ))}
        {geo.data.map((g, i) => (
          <mesh key={`d${i}`} geometry={g}>
            <meshStandardMaterial color={["#475569", "#1d4ed8", "#15803d"][i]} roughness={0.5} />
          </mesh>
        ))}
      </Part>
    </group>
  );
}

const YAW_DRIVES = 6;
const YAW_RING_R = 1.55;

/** Yaw bearing gear ring (on the tower top) and the yaw drives that turn the nacelle. */
function YawSystemImpl({ progressRef }: { progressRef: React.RefObject<number> }) {
  const groupRef = useVisible(progressRef);
  const drives = Array.from({ length: YAW_DRIVES }, (_, i) => {
    const a = ((i + 0.5) / YAW_DRIVES) * Math.PI * 2;
    return [Math.sin(a) * (YAW_RING_R - 0.2), Math.cos(a) * (YAW_RING_R - 0.2)] as [number, number];
  });
  return (
    <group ref={groupRef} visible={false}>
      <Part id="yawDrives" labelAt={[0, 1.8, 1.6]}>
        <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[YAW_RING_R, 0.08, 8, 64]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.35} />
        </mesh>
        {drives.map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.2, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.14, 12]} />
              <meshStandardMaterial color="#111827" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.55, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.5, 16]} />
              <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.0, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.42, 16]} />
              <meshStandardMaterial color="#2563eb" metalness={0.3} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </Part>
    </group>
  );
}

export const NacelleInterior = memo(NacelleInteriorImpl);
export const YawSystem = memo(YawSystemImpl);
