"use client";

/**
 * ENERCON-style direct-drive ring generator (electrically excited synchronous machine).
 *
 * - Stator (fixed, nacelle frame): laminated core with form-wound aluminium coils.
 * - Rotor (turns with the hub): a ring of wound salient poles fed with DC through slip rings.
 * - No permanent magnets: the field strength is set by the excitation current.
 *
 * Nacelle frame: +Z towards the rotor; the rotor hub centre is at z = ROTOR_Z.
 * Proportions are illustrative (the real air gap is millimetres; here it is exaggerated).
 */

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ROTOR_Z } from "./dimensions";
import { ringAlongZ } from "./geometry";
import { Part } from "./interaction";

/* Stator / rotor dimensions (nacelle frame, metres) */
const CORE_Z0 = 2.05;
const CORE_Z1 = 3.45;
const STATOR_IN = 2.66;
const STATOR_OUT = 3.02;
const GAP_R = 2.635;
const POLE_OUTER = 2.61;
const RIM_IN = 2.18;
const RIM_OUT = 2.32;
const POLE_COUNT = 84;
const COIL_COUNT = 144;
const AXLE_R = 0.55;

/** Rotor-local z (the rotor group sits at z = ROTOR_Z). */
const rz = (z: number) => z - ROTOR_Z;

function useSlotTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(0, 0, 256, 16);
    ctx.fillStyle = "#9ca3af";
    for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 0, 6, 16); // coil sides in the slots
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(COIL_COUNT / 16, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Instanced boxes arranged round the shaft: radius r, centre z, box size [tangential, radial, axial]. */
function RingOfBoxes({
  count,
  r,
  z,
  size,
  color,
  metalness = 0.5,
  roughness = 0.4,
  phase = 0,
}: {
  count: number;
  r: number;
  z: number;
  size: [number, number, number];
  color: string;
  metalness?: number;
  roughness?: number;
  phase?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * Math.PI * 2;
      // Box X = tangential, Y = radial (outwards), Z = axial.
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      p.set(Math.cos(a) * r, Math.sin(a) * r, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, r, z, phase]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </instancedMesh>
  );
}

function useVisible(progressRef: React.RefObject<number>) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = progressRef.current > 0.02;
  });
  return ref;
}

/** Fixed parts, in the nacelle frame: stator, air-gap marker, axle and bearings, brushes. */
function GeneratorStaticImpl({ progressRef }: { progressRef: React.RefObject<number> }) {
  const groupRef = useVisible(progressRef);
  const slots = useSlotTexture();
  const geo = useMemo(
    () => ({
      core: ringAlongZ(STATOR_IN, STATOR_OUT, CORE_Z0, CORE_Z1, 144),
      bore: new THREE.CylinderGeometry(STATOR_IN + 0.002, STATOR_IN + 0.002, CORE_Z1 - CORE_Z0, 144, 1, true)
        .rotateX(Math.PI / 2)
        .translate(0, 0, (CORE_Z0 + CORE_Z1) / 2),
      gap: new THREE.CylinderGeometry(GAP_R, GAP_R, CORE_Z1 - CORE_Z0 + 0.1, 144, 1, true)
        .rotateX(Math.PI / 2)
        .translate(0, 0, (CORE_Z0 + CORE_Z1) / 2),
      axle: new THREE.CylinderGeometry(AXLE_R, AXLE_R * 1.15, 3.9, 32).rotateX(Math.PI / 2).translate(0, 0, 3.75),
      statorCarrier: ringAlongZ(AXLE_R + 0.05, STATOR_IN - 0.02, 1.88, 2.0, 96),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group ref={groupRef} visible={false}>
      <Part id="stator" labelAt={[0, STATOR_OUT + 0.5, 2.6]}>
        <mesh geometry={geo.core}>
          <meshStandardMaterial color="#5b6470" metalness={0.6} roughness={0.45} />
        </mesh>
        {/* Bore face: slots with the coil sides of the form-wound aluminium coils */}
        <mesh geometry={geo.bore}>
          <meshStandardMaterial map={slots} metalness={0.6} roughness={0.4} side={THREE.BackSide} />
        </mesh>
        {/* Coil end-windings at both ends of the core */}
        {[CORE_Z0 - 0.08, CORE_Z1 + 0.08].map((z) => (
          <RingOfBoxes key={z} count={COIL_COUNT} r={2.82} z={z} size={[0.07, 0.26, 0.14]} color="#c3c9cf" metalness={0.75} roughness={0.3} />
        ))}
        {/* Stator carrier: fixes the stator ring to the axle / main carrier */}
        <mesh geometry={geo.statorCarrier}>
          <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.45} />
        </mesh>
        {/* Terminal box where the power cables leave the stator */}
        <mesh position={[-2.0, -1.95, 1.72]}>
          <boxGeometry args={[0.55, 0.4, 0.25]} />
          <meshStandardMaterial color="#9aa1a6" metalness={0.4} roughness={0.5} />
        </mesh>
      </Part>

      <Part id="airGap" labelAt={[GAP_R * 0.72, GAP_R * 0.72, CORE_Z1 + 0.3]}>
        <mesh geometry={geo.gap} userData={{ noHighlight: false }}>
          <meshStandardMaterial
            color="#22d3ee"
            emissive="#22d3ee"
            emissiveIntensity={0.6}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </Part>

      <Part id="axle" labelAt={[0, AXLE_R + 0.5, 4.6]}>
        <mesh geometry={geo.axle}>
          <meshStandardMaterial color="#7b848c" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Two large main bearings carrying hub and generator rotor */}
        {[4.25, 5.2].map((z) => (
          <mesh key={z} position={[0, 0, z]}>
            <torusGeometry args={[AXLE_R + 0.12, 0.1, 12, 48]} />
            <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.35} />
          </mesh>
        ))}
      </Part>

      {/* Brush holder (static) on the slip rings */}
      <Part id="excitation" labelAt={[0, 1.4, 3.75]}>
        <mesh position={[0, 0.82, 3.8]}>
          <boxGeometry args={[0.3, 0.16, 0.36]} />
          <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.5} />
        </mesh>
      </Part>
    </group>
  );
}

/** Rotating parts, in the rotor frame (spins with the hub): rim, wound poles, slip rings. */
function GeneratorRotorImpl({ progressRef }: { progressRef: React.RefObject<number> }) {
  const groupRef = useVisible(progressRef);
  const geo = useMemo(
    () => ({
      rim: ringAlongZ(RIM_IN, RIM_OUT, rz(CORE_Z0 + 0.02), rz(CORE_Z1 - 0.02), 120),
      disc: ringAlongZ(0.75, RIM_IN + 0.02, rz(CORE_Z1 - 0.12), rz(CORE_Z1 + 0.05), 96),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const zMid = rz((CORE_Z0 + CORE_Z1) / 2);
  const len = CORE_Z1 - CORE_Z0 - 0.06;

  return (
    <group ref={groupRef} visible={false}>
      <Part id="genRotor" labelAt={[0, -RIM_IN + 0.4, rz(CORE_Z1) + 0.6]}>
        <mesh geometry={geo.rim}>
          <meshStandardMaterial color="#3f4650" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh geometry={geo.disc}>
          <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.45} />
        </mesh>
        {/* Salient poles: steel core, copper field coil wound round it, pole shoe facing the stator */}
        <RingOfBoxes count={POLE_COUNT} r={2.43} z={zMid} size={[0.1, 0.24, len]} color="#4b5563" metalness={0.6} />
        <RingOfBoxes count={POLE_COUNT} r={2.43} z={zMid} size={[0.15, 0.16, len + 0.08]} color="#b87333" metalness={0.8} roughness={0.3} />
        <RingOfBoxes count={POLE_COUNT} r={POLE_OUTER - 0.02} z={zMid} size={[0.16, 0.04, len]} color="#6b7280" metalness={0.6} />
      </Part>

      <Part id="excitation">
        {/* Three slip rings feeding DC to the field coils */}
        {[-0.95, -0.82, -0.69].map((z) => (
          <mesh key={z} position={[0, 0, z]}>
            <torusGeometry args={[AXLE_R + 0.1, 0.04, 10, 48]} />
            <meshStandardMaterial color="#c47b3c" metalness={0.85} roughness={0.25} />
          </mesh>
        ))}
      </Part>
    </group>
  );
}

export const GeneratorStatic = memo(GeneratorStaticImpl);
export const GeneratorRotor = memo(GeneratorRotorImpl);
