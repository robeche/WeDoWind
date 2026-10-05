"use client";

/**
 * Inside the hub: the electric pitch system. Rotor frame (origin at the hub centre, +Z upwind,
 * blade i along +Y after a rotation of i·120° about Z). Hidden until the hub is opened.
 *
 * Per blade: a large slewing (pitch) bearing — outer ring bolted to the hub, toothed inner ring
 * bolted to the blade root — two pitch motors with gearboxes whose pinions mesh with that ring,
 * and a pitch cabinet with the drive electronics and emergency power. A central hub control
 * cabinet coordinates the three blades and is fed from the nacelle through the slip ring.
 */

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BLADE_ROOT_R } from "./dimensions";
import { tubeThrough } from "./geometry";
import { Part } from "./interaction";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TWO_PI = Math.PI * 2;

/** Pitch bearing plane, just inside the blade root. */
const BEARING_Y = BLADE_ROOT_R - 0.12;
const GEAR_R = 1.3; // pitch circle of the internal gear teeth
const PINION_R = 0.12;
const TEETH = 84;
/** Two pitch drives per blade, on the upwind side of the ring (angles in the blade's X–Z plane). */
const MOTOR_ANGLES = [-0.6, 0.6];
const MOTOR_R = GEAR_R - PINION_R - 0.02;
const motorXZ = (a: number): [number, number] => [Math.sin(a) * MOTOR_R, Math.cos(a) * MOTOR_R];
const MOTOR_TOP = BEARING_Y - 0.1;
const MOTOR_BOTTOM = BEARING_Y - 0.95;

const BLADE_CABINET = { y: 0.95, z: -0.72, w: 0.55, h: 0.6, d: 0.3 };
const HUB_CABINET = { z: 1.2, w: 0.85, h: 0.85, d: 0.42 };

const STEEL = { color: "#6b7280", metalness: 0.75, roughness: 0.32 } as const;

/** Teeth of one pitch bearing's inner ring (turns with the blade). */
function GearTeeth() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < TEETH; i++) {
      const a = (i / TEETH) * TWO_PI;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m.compose(V(Math.sin(a) * (GEAR_R + 0.03), 0, Math.cos(a) * (GEAR_R + 0.03)), q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, TEETH]}>
      <boxGeometry args={[0.05, 0.16, 0.07]} />
      <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
    </instancedMesh>
  );
}

function HubInternals({
  progressRef,
  pitchRef,
}: {
  progressRef: React.RefObject<number>;
  /** Current blade pitch angle (rad), shared with the blades. */
  pitchRef: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const innerRings = useRef<Array<THREE.Group | null>>([]);
  const pinions = useRef<Array<THREE.Group | null>>([]);

  useFrame(() => {
    const visible = progressRef.current > 0.02;
    if (groupRef.current) groupRef.current.visible = visible;
    if (!visible) return;
    const pitch = pitchRef.current;
    for (const ring of innerRings.current) if (ring) ring.rotation.y = -pitch;
    // Pinion turns gear-ratio times faster than the ring it drives (and the other way round).
    for (const pinion of pinions.current) if (pinion) pinion.rotation.y = pitch * (GEAR_R / PINION_R);
  });

  const geo = useMemo(() => {
    const hubCabinetBack = HUB_CABINET.z - HUB_CABINET.d / 2;
    const cabinetTop = BLADE_CABINET.y + BLADE_CABINET.h / 2;
    // Hub cabinet → blade pitch cabinet (one bundle per blade, built in blade-0 frame).
    const toBladeCabinet = [-0.05, 0.05].map((o) =>
      tubeThrough(
        [
          V(o, HUB_CABINET.h / 2 - 0.1, hubCabinetBack),
          V(o, 0.62, hubCabinetBack - 0.35),
          V(o, 0.8, -0.2),
          V(o, cabinetTop - 0.05, BLADE_CABINET.z + 0.18),
          V(o, cabinetTop, BLADE_CABINET.z),
        ],
        0.022,
        40,
      ),
    );
    // Blade pitch cabinet → each pitch motor (enters the motor from below).
    const toMotors = MOTOR_ANGLES.map((a) => {
      const [x, z] = motorXZ(a);
      const sx = Math.sign(x);
      return tubeThrough(
        [
          V(sx * (BLADE_CABINET.w / 2), BLADE_CABINET.y + 0.1, BLADE_CABINET.z + 0.05),
          V(sx * 0.55, BLADE_CABINET.y + 0.05, -0.2),
          V(x * 0.95, MOTOR_BOTTOM - 0.12, z * 0.55),
          V(x, MOTOR_BOTTOM - 0.08, z),
          V(x, MOTOR_BOTTOM + 0.02, z),
        ],
        0.03,
        40,
      );
    });
    // Feed from the nacelle: through the slip ring at the back of the hub to the hub cabinet.
    const feed = [-0.07, 0, 0.07].map((o) =>
      tubeThrough([V(o, 0.12, -1.05), V(o, 0.14, 0), V(o, 0.12, hubCabinetBack - 0.15), V(o, 0.05, hubCabinetBack)], 0.028, 24),
    );
    return { toBladeCabinet, toMotors, feed };
  }, []);
  useEffect(
    () => () => [...geo.toBladeCabinet, ...geo.toMotors, ...geo.feed].forEach((g) => g.dispose()),
    [geo],
  );

  const slots = [0, 1, 2];

  return (
    <group ref={groupRef} visible={false}>
      {/* Cast hub body (context only): rear flange onto the generator rotor and a central boss */}
      <mesh position={[0, 0, -0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.25, 1.35, 0.4, 48, 1, true]} />
        <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>

      <Part id="pitchBearings" labelAt={[0, BEARING_Y + 0.35, 1.2]}>
        {slots.map((i) => (
          <group key={i} rotation={[0, 0, (i * TWO_PI) / 3]}>
            {/* Outer ring: bolted to the hub */}
            <mesh position={[0, BEARING_Y, 0]}>
              <cylinderGeometry args={[1.55, 1.55, 0.24, 64, 1, true]} />
              <meshStandardMaterial {...STEEL} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, BEARING_Y - 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.55, 0.05, 8, 64]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
            {/* Inner ring with internal teeth: bolted to the blade, turns as the blade pitches */}
            <group
              position={[0, BEARING_Y, 0]}
              ref={(g) => {
                innerRings.current[i] = g;
              }}
            >
              <mesh>
                <cylinderGeometry args={[1.42, 1.42, 0.22, 64, 1, true]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.28} side={THREE.DoubleSide} />
              </mesh>
              <GearTeeth />
              {/* Paint mark so the turning is easy to see */}
              <mesh position={[0, 0.12, 1.42]}>
                <boxGeometry args={[0.12, 0.03, 0.1]} />
                <meshStandardMaterial color="#facc15" />
              </mesh>
            </group>
          </group>
        ))}
      </Part>

      <Part id="pitchMotors" labelAt={[0.9, BEARING_Y - 0.5, 1.1]}>
        {slots.map((i) => (
          <group key={i} rotation={[0, 0, (i * TWO_PI) / 3]}>
            {MOTOR_ANGLES.map((a, k) => {
              const [x, z] = motorXZ(a);
              return (
                <group key={k} position={[x, 0, z]}>
                  {/* Motor (bottom) + planetary gearbox (top) */}
                  <mesh position={[0, MOTOR_BOTTOM + 0.22, 0]}>
                    <cylinderGeometry args={[0.15, 0.15, 0.44, 20]} />
                    <meshStandardMaterial color="#1f2937" metalness={0.45} roughness={0.45} />
                  </mesh>
                  <mesh position={[0, MOTOR_BOTTOM + 0.6, 0]}>
                    <cylinderGeometry args={[0.12, 0.14, 0.32, 20]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.35} />
                  </mesh>
                  {/* Mounting bracket onto the hub */}
                  <mesh position={[0, MOTOR_TOP - 0.12, 0]}>
                    <boxGeometry args={[0.38, 0.06, 0.38]} />
                    <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.5} />
                  </mesh>
                  {/* Pinion meshing with the inner ring's teeth */}
                  <group
                    position={[0, BEARING_Y, 0]}
                    ref={(g) => {
                      pinions.current[i * MOTOR_ANGLES.length + k] = g;
                    }}
                  >
                    {/* Output shaft from the gearbox */}
                    <mesh position={[0, -0.13, 0]}>
                      <cylinderGeometry args={[0.04, 0.04, 0.16, 10]} />
                      <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
                    </mesh>
                    <mesh>
                      <cylinderGeometry args={[PINION_R, PINION_R, 0.16, 12]} />
                      <meshStandardMaterial color="#d1d5db" metalness={0.85} roughness={0.25} flatShading />
                    </mesh>
                    <mesh position={[PINION_R, 0.09, 0]}>
                      <boxGeometry args={[0.05, 0.02, 0.03]} />
                      <meshStandardMaterial color="#facc15" />
                    </mesh>
                  </group>
                </group>
              );
            })}
          </group>
        ))}
      </Part>

      <Part id="bladeCabinets" labelAt={[0, BLADE_CABINET.y + 0.6, BLADE_CABINET.z]}>
        {slots.map((i) => (
          <group key={i} rotation={[0, 0, (i * TWO_PI) / 3]}>
            <group position={[0, BLADE_CABINET.y, BLADE_CABINET.z]}>
              <mesh>
                <boxGeometry args={[BLADE_CABINET.w, BLADE_CABINET.h, BLADE_CABINET.d]} />
                <meshStandardMaterial color="#cfd3d6" roughness={0.55} />
              </mesh>
              {/* Door seam, handle and status LED on the upwind face */}
              <mesh position={[0, 0, BLADE_CABINET.d / 2 + 0.003]}>
                <planeGeometry args={[0.01, BLADE_CABINET.h - 0.08]} />
                <meshStandardMaterial color="#555b60" />
              </mesh>
              <mesh position={[0.12, 0, BLADE_CABINET.d / 2 + 0.02]}>
                <boxGeometry args={[0.03, 0.12, 0.03]} />
                <meshStandardMaterial color="#2f3438" />
              </mesh>
              <mesh position={[-0.18, 0.22, BLADE_CABINET.d / 2 + 0.008]} userData={{ noHighlight: true }}>
                <sphereGeometry args={[0.014, 8, 6]} />
                <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} toneMapped={false} />
              </mesh>
            </group>
          </group>
        ))}
      </Part>

      <Part id="hubCabinet" labelAt={[0, HUB_CABINET.h / 2 + 0.35, HUB_CABINET.z]}>
        <group position={[0, 0, HUB_CABINET.z]}>
          <mesh>
            <boxGeometry args={[HUB_CABINET.w, HUB_CABINET.h, HUB_CABINET.d]} />
            <meshStandardMaterial color="#bfc5ca" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, HUB_CABINET.d / 2 + 0.003]}>
            <planeGeometry args={[0.01, HUB_CABINET.h - 0.08]} />
            <meshStandardMaterial color="#555b60" />
          </mesh>
          <mesh position={[0.2, 0, HUB_CABINET.d / 2 + 0.02]}>
            <boxGeometry args={[0.03, 0.14, 0.03]} />
            <meshStandardMaterial color="#2f3438" />
          </mesh>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[-0.3 + k * 0.06, 0.32, HUB_CABINET.d / 2 + 0.008]} userData={{ noHighlight: true }}>
              <sphereGeometry args={[0.014, 8, 6]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </Part>

      <Part id="hubCables" labelAt={[0.3, 0.7, -0.2]}>
        {slots.map((i) => (
          <group key={i} rotation={[0, 0, (i * TWO_PI) / 3]}>
            {geo.toBladeCabinet.map((g, k) => (
              <mesh key={`c${k}`} geometry={g}>
                <meshStandardMaterial color={k ? "#1d4ed8" : "#475569"} roughness={0.5} />
              </mesh>
            ))}
            {geo.toMotors.map((g, k) => (
              <mesh key={`m${k}`} geometry={g}>
                <meshStandardMaterial color="#141619" roughness={0.55} />
              </mesh>
            ))}
          </group>
        ))}
        {geo.feed.map((g, k) => (
          <mesh key={`f${k}`} geometry={g}>
            <meshStandardMaterial color={k === 1 ? "#1d4ed8" : "#141619"} roughness={0.55} />
          </mesh>
        ))}
      </Part>
    </group>
  );
}

export const HubInternalsMemo = memo(HubInternals);
