"use client";

import { OrbitControls, Sky, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import type { TurbineStatus } from "@/services/aceApi";
import { sunPosition } from "@/utils/sun";

import {
  BLADE_ROOT_R,
  DEG,
  NACELLE_AXIS_Y,
  ROTOR_RADIUS,
  ROTOR_Z,
  SHAFT_TILT,
  TOWER_BASE_R,
  TOWER_TOP,
  TOWER_TOP_R,
  TWO_PI,
} from "./turbine/dimensions";
import InfoPanel from "./turbine/InfoPanel";
import { InteractionProvider, Part, useInteraction, type InteractionState } from "./turbine/interaction";
import { TOWER_OPEN_FOCUS, isTowerPart, PART_INFO, type Focus, type PartId } from "./turbine/parts";
import TowerInterior from "./turbine/TowerInterior";

const CAMERA_TARGET: [number, number, number] = [0, 78, 0];
const HOME_FOCUS: Focus = { target: CAMERA_TARGET, distance: 270, elevationDeg: 5 };
const AUTO_ORBIT_RESUME_MS = 15_000;
/** Fraction of the canvas width the picture shifts left while the info panel is open. */
const PANEL_SHIFT = 0.2;
/** A public kiosk should not stay "opened" forever: close after this long without input. */
const IDLE_CLOSE_MS = 90_000;
/** Wind particles move at live wind speed × this factor (m/s → scene m/s). */
const WIND_PARTICLE_SPEED_SCALE = 2.5;

const lerp = THREE.MathUtils.lerp;
const smoothstep = (x: number, min: number, max: number) => THREE.MathUtils.smoothstep(x, min, max);
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Frame-rate independent exponential approach factor for time constant tau (s). */
const approach = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

export interface Turbine3DProps {
  rotorSpeedRpm: number;
  /** Nacelle heading, degrees clockwise from north. */
  nacelleYawDeg: number;
  /** Direction wind blows from, degrees clockwise from north. */
  windDirectionDeg: number;
  windSpeedMs: number;
  status: TurbineStatus;
  hasData: boolean;
  className?: string;
  /** Called when a visitor starts / stops exploring (a part selected or the tower open). */
  onExploringChange?: (exploring: boolean) => void;
}

interface LiveInputs extends Omit<Turbine3DProps, "className" | "onExploringChange"> {
  nightFactor: number;
}

/* ------------------------------------------------------------------ */
/* Procedural geometry                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lofted aerodynamic blade along +Y: circular root → cambered NACA-style aerofoil,
 * with chord taper, twist and pre-bend. Leading edge faces +X (direction of travel
 * for a clockwise rotor viewed from upwind), pressure side faces upwind (+Z).
 */
function createBladeGeometry(rootR: number, tipR: number): THREE.BufferGeometry {
  const SECTIONS = 48;
  const RING = 32;
  const ROOT_DIAMETER = 2.7;
  const MAX_CHORD = 4.1;
  const MAX_CHORD_T = 0.2;
  const TIP_CHORD = 0.3;
  const span = tipR - rootR;

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < SECTIONS; i++) {
    const t = i / (SECTIONS - 1);
    const r = rootR + t * span;

    const chord =
      t < MAX_CHORD_T
        ? lerp(ROOT_DIAMETER, MAX_CHORD, smoothstep(t, 0.02, MAX_CHORD_T))
        : TIP_CHORD + (MAX_CHORD - TIP_CHORD) * Math.pow((1 - t) / (1 - MAX_CHORD_T), 1.1);
    const aerofoilBlend = smoothstep(t, 0.02, 0.22);
    const thickness =
      t < MAX_CHORD_T ? lerp(1, 0.4, smoothstep(t, 0.02, MAX_CHORD_T)) : lerp(0.4, 0.16, smoothstep(t, MAX_CHORD_T, 0.65));
    const twistDeg = t < MAX_CHORD_T ? 14 : 14 - 15 * Math.pow((t - MAX_CHORD_T) / (1 - MAX_CHORD_T), 0.7);
    const phi = twistDeg * DEG;
    const prebend = 1.8 * t * t;
    const pivot = lerp(0.5, 0.35, aerofoilBlend);

    // u: leading-edge direction, v: suction-side direction (both in the XZ plane).
    const ux = Math.cos(phi);
    const uz = Math.sin(phi);
    const vx = Math.sin(phi);
    const vz = -Math.cos(phi);

    for (let k = 0; k < RING; k++) {
      const theta = (k / RING) * TWO_PI;
      const x = 0.5 * (1 + Math.cos(theta));
      const side = Math.sin(theta) >= 0 ? 1 : -1;
      const yt =
        5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
      const camber = x < 0.4 ? 0.25 * (0.8 * x - x * x) : (0.04 / 0.36) * (0.2 + 0.8 * x - x * x);
      const y = lerp(0.5 * Math.sin(theta), camber + side * yt, aerofoilBlend);

      const sc = (pivot - x) * chord;
      const w = y * chord;
      positions.push(sc * ux + w * vx, r, sc * uz + w * vz + prebend);
    }
  }

  for (let i = 0; i < SECTIONS - 1; i++) {
    for (let k = 0; k < RING; k++) {
      const a = i * RING + k;
      const b = i * RING + ((k + 1) % RING);
      const c = (i + 1) * RING + k;
      const d = (i + 1) * RING + ((k + 1) % RING);
      indices.push(a, b, c, b, d, c);
    }
  }

  // Rounded tip cap.
  const last = (SECTIONS - 1) * RING;
  let cx = 0;
  let cz = 0;
  for (let k = 0; k < RING; k++) {
    cx += positions[(last + k) * 3];
    cz += positions[(last + k) * 3 + 2];
  }
  const tipIndex = positions.length / 3;
  positions.push(cx / RING, tipR + 0.25, cz / RING);
  for (let k = 0; k < RING; k++) indices.push(last + k, last + ((k + 1) % RING), tipIndex);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Lathe a (radius, z) profile around the +Z axis. */
function latheAlongZ(profile: Array<[number, number]>, segments = 48): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
  );
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * EP3-style rear nacelle: a short faceted box (flat roof, vertical sides, large lower
 * chamfers, chamfered tail) rather than the older rounded "egg" ENERCON nacelle.
 * Built in the shaft frame: +Z towards the rotor, +Y up. Use with flatShading.
 */
function createNacelleGeometry(): THREE.BufferGeometry {
  // [z, halfWidth, top, bottom, topChamfer, bottomChamfer]
  const sections: Array<[number, number, number, number, number, number]> = [
    [ROTOR_Z - 2.7, 2.05, 1.55, -2.65, 0.35, 0.95],
    [ROTOR_Z - 5.6, 2.05, 1.55, -2.65, 0.35, 0.95],
    [ROTOR_Z - 6.7, 1.8, 1.3, -1.55, 0.3, 0.7],
    [ROTOR_Z - 7.05, 1.55, 1.0, -0.95, 0.25, 0.5],
  ];
  const ring = ([z, w, top, bot, ct, cb]: (typeof sections)[number]) => [
    [-w + ct, top, z], [w - ct, top, z], [w, top - ct, z], [w, bot + cb, z],
    [w - cb, bot, z], [-w + cb, bot, z], [-w, bot + cb, z], [-w, top - ct, z],
  ];
  const rings = sections.map(ring);
  const n = rings[0].length;
  const positions = rings.flat(2);
  const indices: number[] = [];
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < n; i++) {
      const a = s * n + i;
      const b = s * n + ((i + 1) % n);
      const c = (s + 1) * n + i;
      const d = (s + 1) * n + ((i + 1) % n);
      // Rings run clockwise seen from upwind, so this winding gives outward normals.
      indices.push(a, b, c, b, d, c);
    }
  }
  // End caps (front one sits inside the generator).
  const lastRing = (rings.length - 1) * n;
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i + 1, i);
    indices.push(lastRing, lastRing + i, lastRing + i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

function useTurbineGeometries() {
  const geometries = useMemo(() => {
    // Compact spinner: rotor-local Z, nose upwind (+Z).
    const spinnerProfile: Array<[number, number]> = [
      [0, -1.0], [2.1, -0.95], [2.15, -0.75], [2.12, 0], [1.95, 0.9],
      [1.65, 1.6], [1.25, 2.15], [0.8, 2.5], [0.35, 2.7], [0, 2.75],
    ];
    // Direct-drive ring generator: wide disc with flat faces and bevelled rims.
    const g0 = ROTOR_Z - 2.75;
    const g1 = ROTOR_Z - 0.9;
    const generatorProfile: Array<[number, number]> = [
      [0, g0], [2.95, g0], [3.2, g0 + 0.2], [3.2, g1 - 0.15], [2.95, g1], [0, g1],
    ];
    return {
      blade: createBladeGeometry(BLADE_ROOT_R, ROTOR_RADIUS),
      spinner: latheAlongZ(spinnerProfile, 64),
      nacelle: createNacelleGeometry(),
      generator: latheAlongZ(generatorProfile, 96),
      // Tower shell in two halves (open-ended, seen from both sides) so it can be cut away.
      // θ = 0 is +Z: the "front" half is centred on +Z and is turned to face the camera.
      towerFront: new THREE.CylinderGeometry(TOWER_TOP_R, TOWER_BASE_R, TOWER_TOP, 40, 1, true, -Math.PI / 2, Math.PI),
      towerBack: new THREE.CylinderGeometry(TOWER_TOP_R, TOWER_BASE_R, TOWER_TOP, 40, 1, true, Math.PI / 2, Math.PI),
    };
  }, []);

  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries]);
  return geometries;
}

/* ------------------------------------------------------------------ */
/* Turbine model + kinematics                                          */
/* ------------------------------------------------------------------ */

function targetPitchRad(live: LiveInputs): number {
  if (!live.hasData) return 88 * DEG;
  switch (live.status) {
    case "Generating":
      // Above rated wind the blades pitch out to shed excess power.
      return Math.max(0, (live.windSpeedMs - 12.5) * 2.2) * DEG;
    case "Idling":
      return 30 * DEG;
    default:
      return 88 * DEG;
  }
}

function TurbineModel({
  liveRef,
  workLightYRef,
}: {
  liveRef: React.RefObject<LiveInputs>;
  workLightYRef: React.RefObject<number>;
}) {
  const geo = useTurbineGeometries();
  const yawRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Group>(null);
  const bladeRefs = useRef<Array<THREE.Mesh | null>>([]);
  const beaconRef = useRef<THREE.Mesh>(null);
  const sim = useRef({ rpm: 0, theta: 0, yaw: Math.PI - 225 * DEG, yawInitialised: false, pitch: 88 * DEG });

  // Tower cut-away state.
  const { towerOpen } = useInteraction();
  const openRef = useRef(towerOpen);
  openRef.current = towerOpen;
  const progressRef = useRef(0);
  const shellRef = useRef<THREE.Group>(null);
  const frontRef = useRef<THREE.Mesh>(null);
  const frontMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const doorRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const live = liveRef.current;
    const s = sim.current;
    // `delta` is R3F's per-frame state.clock.getDelta(); calling getDelta() again here would return ~0.
    // Capped so a backgrounded tab doesn't produce one huge jump when it resumes.
    const dt = Math.min(delta, 0.25);

    // Rotor: smooth to the live RPM (rotor inertia), then Δθ = (RPM · 2π / 60) · Δt.
    const targetRpm = live.hasData ? Math.max(0, live.rotorSpeedRpm) : 0;
    s.rpm += (targetRpm - s.rpm) * approach(dt, targetRpm > s.rpm ? 3 : 6);
    if (targetRpm === 0 && s.rpm < 0.01) s.rpm = 0;
    const deltaTheta = ((s.rpm * 2 * Math.PI) / 60) * dt;
    s.theta = (s.theta + deltaTheta) % TWO_PI;
    // Clockwise when viewed from upwind (+Z), as ENERCON rotors turn.
    if (rotorRef.current) rotorRef.current.rotation.z = -s.theta;

    // Nacelle yaw: bearing b (clockwise from north, north = -Z) → rotation.y = π − b.
    const targetYaw = Math.PI - live.nacelleYawDeg * DEG;
    if (live.hasData && !s.yawInitialised) {
      s.yaw = targetYaw;
      s.yawInitialised = true;
    }
    s.yaw = wrapPi(s.yaw + wrapPi(targetYaw - s.yaw) * approach(dt, 2.5));
    if (yawRef.current) yawRef.current.rotation.y = s.yaw;

    // Blade pitch: feathered when stopped, fine pitch when generating.
    s.pitch += (targetPitchRad(live) - s.pitch) * approach(dt, 4);
    for (const blade of bladeRefs.current) if (blade) blade.rotation.y = -s.pitch;

    // Tower cut-away: progress 0 → 1. The removable half is always turned towards the
    // camera, so visitors can orbit and still see inside.
    const openTarget = openRef.current ? 1 : 0;
    progressRef.current += (openTarget - progressRef.current) * approach(dt, 0.35);
    if (Math.abs(openTarget - progressRef.current) < 0.002) progressRef.current = openTarget;
    const p = progressRef.current;
    if (shellRef.current) {
      shellRef.current.rotation.y = Math.atan2(state.camera.position.x, state.camera.position.z);
    }
    if (frontRef.current) {
      frontRef.current.position.z = p * 3.5; // slides out towards the viewer…
      frontRef.current.castShadow = p < 0.5;
    }
    if (frontMatRef.current) {
      frontMatRef.current.opacity = 1 - 0.92 * p; // …and fades to a faint ghost
      frontMatRef.current.depthWrite = p < 0.05;
    }
    if (doorRef.current) doorRef.current.visible = p < 0.05;

    // Aviation warning light, lit from dusk to dawn.
    if (beaconRef.current) {
      beaconRef.current.visible = live.nightFactor > 0.35 && state.clock.elapsedTime % 2 < 1.3;
    }
  });

  return (
    <group>
      {/* Foundation + tower */}
      <mesh position={[0, 0.3, 0]} receiveShadow>
        <cylinderGeometry args={[7, 7.4, 0.6, 48]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.95} />
      </mesh>
      {/* Plain light-grey tower (no green base bands on the Lawrence Weston turbine) */}
      <Part id="tower" enabled={!towerOpen} labelAt={[0, 32, 0]}>
        <group ref={shellRef} position={[0, TOWER_TOP / 2, 0]}>
          <mesh geometry={geo.towerBack} castShadow receiveShadow>
            <meshStandardMaterial color="#e4e7ea" roughness={0.6} metalness={0.05} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={frontRef} geometry={geo.towerFront} castShadow receiveShadow>
            <meshStandardMaterial
              ref={frontMatRef}
              color="#e4e7ea"
              roughness={0.6}
              metalness={0.05}
              side={THREE.DoubleSide}
              transparent
            />
          </mesh>
        </group>
        {/* Invisible, fatter hit area so the slender tower is easy to tap on a touch screen */}
        <mesh position={[0, TOWER_TOP / 2, 0]}>
          <cylinderGeometry args={[TOWER_TOP_R + 3, TOWER_BASE_R + 4, TOWER_TOP, 12, 1, true]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {/* Tower door */}
        <mesh ref={doorRef} position={[0, 1.75, TOWER_BASE_R - 0.02]}>
          <boxGeometry args={[1.1, 2.3, 0.12]} />
          <meshStandardMaterial color="#5f6468" roughness={0.6} />
        </mesh>
      </Part>
      <TowerInterior progressRef={progressRef} workLightYRef={workLightYRef} />

      {/* Yaw system: everything above the tower top rotates about Y */}
      <group ref={yawRef} position={[0, TOWER_TOP, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[TOWER_TOP_R + 0.05, TOWER_TOP_R + 0.05, 0.7, 48]} />
          <meshStandardMaterial color="#d9dde1" roughness={0.5} />
        </mesh>

        <group position={[0, NACELLE_AXIS_Y, 0]} rotation={[-SHAFT_TILT, 0, 0]}>
          <Part id="nacelle" labelAt={[0, 3.4, ROTOR_Z - 4.8]}>
            <mesh geometry={geo.nacelle} castShadow receiveShadow>
              <meshStandardMaterial color="#e9ecee" roughness={0.45} metalness={0.08} flatShading side={THREE.DoubleSide} />
            </mesh>
            {/* Met mast with anemometer on the roof */}
            <mesh position={[0, 1.55 + 0.55, ROTOR_Z - 3.3]}>
              <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
              <meshStandardMaterial color="#4b5055" roughness={0.6} />
            </mesh>
          </Part>
          <Part id="generator" labelAt={[0, 4.4, ROTOR_Z - 1.8]}>
            <mesh geometry={geo.generator} castShadow>
              <meshStandardMaterial color="#e8ebee" roughness={0.4} metalness={0.15} side={THREE.DoubleSide} />
            </mesh>
          </Part>
          <mesh ref={beaconRef} position={[0, 1.55 + 0.5, ROTOR_Z - 5.4]} visible={false}>
            <sphereGeometry args={[0.45, 16, 12]} />
            <meshBasicMaterial color="#ff2a1a" toneMapped={false} />
          </mesh>

          {/* Rotor: hub + three blades spinning about the shaft (local Z) */}
          <group ref={rotorRef} position={[0, 0, ROTOR_Z]}>
            {/* Labels sit on the shaft axis so they stay put while the rotor turns. */}
            <Part id="hub" labelAt={[0, 0, 4.2]}>
              <mesh geometry={geo.spinner} castShadow>
                <meshStandardMaterial color="#f4f5f6" roughness={0.35} metalness={0.1} side={THREE.DoubleSide} />
              </mesh>
            </Part>
            <Part id="blades" labelAt={[0, 0, 4.2]}>
            {[0, 1, 2].map((i) => (
              <group key={i} rotation={[0, 0, (i * TWO_PI) / 3]}>
                <mesh
                  ref={(m) => {
                    bladeRefs.current[i] = m;
                  }}
                  geometry={geo.blade}
                  castShadow
                >
                  <meshStandardMaterial color="#f2f3f4" roughness={0.42} metalness={0.02} side={THREE.DoubleSide} />
                </mesh>
              </group>
            ))}
            </Part>
          </group>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Wind particles                                                      */
/* ------------------------------------------------------------------ */

const PARTICLE_COUNT = 420;
const FIELD_HALF = 320;
const FIELD_Y_MIN = 4;
const FIELD_Y_MAX = 185;

function WindParticles({ liveRef }: { liveRef: React.RefObject<LiveInputs> }) {
  const segmentPositions = useMemo(() => new Float32Array(PARTICLE_COUNT * 6), []);
  const particles = useMemo(() => {
    const p = new Float32Array(PARTICLE_COUNT * 4);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      p[i * 4] = (Math.random() * 2 - 1) * FIELD_HALF;
      p[i * 4 + 1] = lerp(FIELD_Y_MIN, FIELD_Y_MAX, Math.random());
      p[i * 4 + 2] = (Math.random() * 2 - 1) * FIELD_HALF;
      p[i * 4 + 3] = Math.random() * TWO_PI;
    }
    return p;
  }, []);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const flow = useRef({ bearing: 225 * DEG, speed: 0 });

  useFrame((state, delta) => {
    const live = liveRef.current;
    const dt = Math.min(delta, 0.1);
    const f = flow.current;
    f.bearing = wrapPi(f.bearing + wrapPi(live.windDirectionDeg * DEG - f.bearing) * approach(dt, 2));
    f.speed += ((live.hasData ? live.windSpeedMs : 3) - f.speed) * approach(dt, 2);

    // Flow is towards the opposite of the "from" bearing (north = -Z, east = +X).
    const fx = -Math.sin(f.bearing);
    const fz = Math.cos(f.bearing);
    const v = f.speed * WIND_PARTICLE_SPEED_SCALE;
    const len = THREE.MathUtils.clamp(f.speed * 1.6, 1.5, 30);
    const t = state.clock.elapsedTime;
    const span = FIELD_HALF * 2;
    const ySpan = FIELD_Y_MAX - FIELD_Y_MIN;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * 4;
      let x = particles[o] + fx * v * dt;
      let y = particles[o + 1] + Math.sin(t * 0.6 + particles[o + 3]) * 0.08 * v * dt;
      let z = particles[o + 2] + fz * v * dt;
      if (x > FIELD_HALF) x -= span;
      else if (x < -FIELD_HALF) x += span;
      if (z > FIELD_HALF) z -= span;
      else if (z < -FIELD_HALF) z += span;
      if (y > FIELD_Y_MAX) y -= ySpan;
      else if (y < FIELD_Y_MIN) y += ySpan;
      particles[o] = x;
      particles[o + 1] = y;
      particles[o + 2] = z;

      const s = i * 6;
      segmentPositions[s] = x;
      segmentPositions[s + 1] = y;
      segmentPositions[s + 2] = z;
      segmentPositions[s + 3] = x - fx * len;
      segmentPositions[s + 4] = y;
      segmentPositions[s + 5] = z - fz * len;
    }

    const attr = geometryRef.current?.getAttribute("position");
    if (attr) attr.needsUpdate = true;
    if (materialRef.current) materialRef.current.opacity = THREE.MathUtils.clamp(f.speed / 12, 0.1, 0.45);
  });

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[segmentPositions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial ref={materialRef} color="#ffffff" transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ */
/* Atmosphere: real Bristol sun position → sky, lights, fog            */
/* ------------------------------------------------------------------ */

function computeEnvironment(elevationDeg: number, azimuthDeg: number) {
  const e = elevationDeg * DEG;
  const a = azimuthDeg * DEG;
  const sunDir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  const day = smoothstep(elevationDeg, -8, 12);
  const golden = (1 - smoothstep(elevationDeg, 4, 20)) * smoothstep(elevationDeg, -6, 2);
  const mix = (from: string, to: string, t: number) => new THREE.Color(from).lerp(new THREE.Color(to), t);
  const lightPos = sunDir.clone().multiplyScalar(420);
  lightPos.y = Math.max(lightPos.y, 25);

  return {
    sunDir: sunDir.toArray() as [number, number, number],
    lightPos: lightPos.toArray() as [number, number, number],
    sunColor: mix("#fff4e5", "#ff8c4a", golden),
    sunIntensity: 2.6 * smoothstep(elevationDeg, -2, 10),
    skyColor: mix("#1a2744", "#cfe3ff", day),
    groundColor: mix("#0a0d12", "#56663f", day),
    hemiIntensity: lerp(0.35, 1.0, day),
    moonIntensity: 0.4 * (1 - day),
    fogColor: mix("#0a1224", "#c8daea", day).lerp(new THREE.Color("#f0a878"), golden * 0.5),
    groundTint: mix("#18221a", "#5f7d45", day),
    rayleigh: lerp(0.4, 1.5, day) + golden * 1.5,
    night: 1 - day,
  };
}

function Atmosphere({ elevationDeg, azimuthDeg }: { elevationDeg: number; azimuthDeg: number }) {
  const env = useMemo(() => computeEnvironment(elevationDeg, azimuthDeg), [elevationDeg, azimuthDeg]);

  return (
    <>
      <Sky distance={450000} sunPosition={env.sunDir} turbidity={8} rayleigh={env.rayleigh} mieCoefficient={0.005} mieDirectionalG={0.8} />
      {env.night > 0.4 && <Stars radius={900} depth={200} count={4000} factor={5} saturation={0} fade speed={0.3} />}
      <fog attach="fog" args={[env.fogColor, 350, 1900]} />
      <hemisphereLight color={env.skyColor} groundColor={env.groundColor} intensity={env.hemiIntensity} />
      <directionalLight
        castShadow
        position={env.lightPos}
        color={env.sunColor}
        intensity={env.sunIntensity}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      >
        <orthographicCamera attach="shadow-camera" args={[-170, 170, 170, -170, 1, 1400]} />
      </directionalLight>
      <directionalLight position={[-200, 300, 150]} color="#9bb4ff" intensity={env.moonIntensity} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2600, 64]} />
        <meshStandardMaterial color={env.groundTint} roughness={1} />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Camera: auto-orbit when idle, pauses while someone interacts        */
/* ------------------------------------------------------------------ */

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/**
 * Orbit controls plus a short fly-to animation whenever `focus` changes. With no focus the
 * camera returns to the overview and the slow auto-orbit resumes.
 */
/** Left drag orbits, middle (or right) drag pans, wheel zooms. */
const MOUSE_BUTTONS = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
/** How far the pan target may wander from the tower axis while exploring (m). */
const PAN_RADIUS = 7;

const CameraRig = memo(function CameraRig({
  focus,
  panelOpen,
  workLightYRef,
}: {
  focus: Focus | null;
  panelOpen: boolean;
  workLightYRef: React.RefObject<number>;
}) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // While the info panel covers the right of the view, shift the picture left (view offset)
  // so the subject stays centred in the visible part.
  const shiftRef = useRef(0);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  const focusedRef = useRef(false);
  focusedRef.current = focus !== null;
  const firstRun = useRef(true);
  const flight = useRef<{
    t: number;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
  } | null>(null);

  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (firstRun.current) {
      firstRun.current = false;
      if (!focus) return;
    }
    const goal = focus ?? HOME_FOCUS;
    const fromTarget = controls.target.clone();
    const toTarget = new THREE.Vector3(...goal.target);
    // Keep the visitor's current viewing direction; only distance and height change.
    const dir = camera.position.clone().sub(fromTarget).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const elev = goal.elevationDeg * DEG;
    const toPos = toTarget
      .clone()
      .addScaledVector(dir, goal.distance * Math.cos(elev))
      .add(new THREE.Vector3(0, goal.distance * Math.sin(elev), 0));
    flight.current = { t: 0, fromTarget, toTarget, fromPos: camera.position.clone(), toPos };
    clearTimeout(resumeTimer.current);
    controls.autoRotate = false;
    controls.minDistance = 3; // allow close-ups (and don't clamp mid-flight)
  }, [focus, camera]);

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const targetShift = panelOpenRef.current ? PANEL_SHIFT : 0;
    if (Math.abs(targetShift - shiftRef.current) > 1e-4) {
      shiftRef.current += (targetShift - shiftRef.current) * approach(Math.min(delta, 0.1), 0.3);
      if (Math.abs(targetShift - shiftRef.current) < 1e-3) shiftRef.current = targetShift;
      if (shiftRef.current === 0) cam.clearViewOffset();
      else cam.setViewOffset(size.width, size.height, shiftRef.current * size.width, 0, size.width, size.height);
    } else if (shiftRef.current !== 0 && cam.view && cam.view.fullWidth !== size.width) {
      cam.setViewOffset(size.width, size.height, shiftRef.current * size.width, 0, size.width, size.height);
    }

    const controls = controlsRef.current;
    if (controls && focusedRef.current) {
      // Keep panning inside (and just around) the tower, from the foundation to the nacelle.
      const tg = controls.target;
      const r = Math.hypot(tg.x, tg.z);
      if (r > PAN_RADIUS) {
        tg.x *= PAN_RADIUS / r;
        tg.z *= PAN_RADIUS / r;
      }
      tg.y = THREE.MathUtils.clamp(tg.y, 0.5, TOWER_TOP + 6);
      workLightYRef.current = tg.y + 1.5; // the interior work light follows what you look at
    }

    const f = flight.current;
    if (!f || !controls) return;
    f.t = Math.min(1, f.t + Math.min(delta, 0.1) / 1.6);
    const k = easeInOut(f.t);
    controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    controls.update();
    if (f.t >= 1) {
      flight.current = null;
      if (!focusedRef.current) {
        controls.minDistance = 70;
        controls.autoRotate = true;
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={CAMERA_TARGET}
      autoRotate
      autoRotateSpeed={0.35}
      enablePan={focus !== null}
      mouseButtons={MOUSE_BUTTONS}
      screenSpacePanning
      enableDamping
      dampingFactor={0.08}
      minDistance={70}
      maxDistance={450}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2 - 0.04}
      onStart={() => {
        flight.current = null; // the visitor takes over
        clearTimeout(resumeTimer.current);
        if (controlsRef.current) controlsRef.current.autoRotate = false;
      }}
      onEnd={() => {
        clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => {
          if (controlsRef.current && !focusedRef.current) controlsRef.current.autoRotate = true;
        }, AUTO_ORBIT_RESUME_MS);
      }}
    />
  );
});

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export default function Turbine3D({ className, onExploringChange, ...props }: Turbine3DProps) {
  const [now, setNow] = useState(() => new Date());
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sun = useMemo(() => sunPosition(now), [now]);
  const nightFactor = 1 - smoothstep(sun.elevationDeg, -8, 12);

  // Values read inside the render loop without re-creating it.
  const liveRef = useRef<LiveInputs>({ ...props, nightFactor });
  useEffect(() => {
    liveRef.current = { ...props, nightFactor };
  });

  /* ---------------- Exploration state (hover / select / open tower) ---------------- */
  const [hoveredId, setHoveredId] = useState<PartId | null>(null);
  const [selectedId, setSelectedId] = useState<PartId | null>(null);
  const [towerOpen, setTowerOpen] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const workLightYRef = useRef(8);
  const lastInputRef = useRef(Date.now());


  const setHovered = useCallback((id: PartId | null, from?: PartId) => {
    // `from`: only clear the hover if it still belongs to the part that is leaving.
    setHoveredId((current) => (id === null && from !== undefined && current !== from ? current : id));
  }, []);

  const select = useCallback((id: PartId) => {
    lastInputRef.current = Date.now();
    setSelectedId(id);
    if (id === "tower") {
      setTowerOpen(true);
      setFocus({ ...TOWER_OPEN_FOCUS }); // new object: re-fly even if the framing is unchanged
    } else if (isTowerPart(id)) {
      setFocus({ ...(PART_INFO[id].focus ?? TOWER_OPEN_FOCUS) });
    }
  }, []);

  const close = useCallback(() => {
    setTowerOpen(false);
    setSelectedId(null);
    setHoveredId(null);
    setFocus(null);
  }, []);

  const goTo = useCallback((f: Focus) => {
    lastInputRef.current = Date.now();
    setSelectedId("tower");
    setFocus({ ...f });
  }, []);

  const interaction = useMemo<InteractionState>(
    () => ({ hoveredId, selectedId, towerOpen, setHovered, select }),
    [hoveredId, selectedId, towerOpen, setHovered, select],
  );

  const exploring = towerOpen || selectedId !== null;
  useEffect(() => {
    onExploringChange?.(exploring);
  }, [exploring, onExploringChange]);

  // Pointer cursor while over a part.
  useEffect(() => {
    document.body.style.cursor = hoveredId ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hoveredId]);

  // Esc closes; the kiosk closes itself after a while without input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!towerOpen && !selectedId) return;
    const id = setInterval(() => {
      if (Date.now() - lastInputRef.current > IDLE_CLOSE_MS) close();
    }, 5_000);
    return () => clearInterval(id);
  }, [towerOpen, selectedId, close]);

  // Recover from a lost GPU context (driver reset, sleep/wake) by remounting the canvas.
  const onCreated = useCallback(({ gl }: RootState) => {
    const canvas = gl.domElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    canvas.addEventListener("webglcontextlost", () => {
      timer = setTimeout(() => setCanvasKey((k) => k + 1), 8000);
    });
    canvas.addEventListener("webglcontextrestored", () => clearTimeout(timer));
  }, []);

  return (
    <div
      className={className}
      onPointerDown={() => (lastInputRef.current = Date.now())}
      onWheel={() => (lastInputRef.current = Date.now())}
    >
      <InteractionProvider value={interaction}>
        <Canvas
          key={canvasKey}
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [175, 60, 200], fov: 38, near: 0.5, far: 5000 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={onCreated}
          onPointerMissed={() => {
            // Tap on empty sky/ground: drop the selection, but keep the tower open.
            if (!towerOpen) setSelectedId(null);
            else if (selectedId !== "tower") setSelectedId("tower");
          }}
        >
          <Atmosphere elevationDeg={sun.elevationDeg} azimuthDeg={sun.azimuthDeg} />
          <TurbineModel liveRef={liveRef} workLightYRef={workLightYRef} />
          <WindParticles liveRef={liveRef} />
          <CameraRig focus={focus} panelOpen={exploring} workLightYRef={workLightYRef} />
        </Canvas>
      </InteractionProvider>
      <InfoPanel
        selectedId={selectedId}
        towerOpen={towerOpen}
        onSelect={select}
        onGoTo={goTo}
        onClose={close}
      />
    </div>
  );
}
