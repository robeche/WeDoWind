"use client";

import { OrbitControls, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import type { TurbineStatus } from "@/services/aceApi";

import {
  DEG,
  NACELLE_AXIS_Y,
  NACELLE_STRETCH,
  ROTOR_Z,
  SHAFT_TILT,
  TOWER_BASE_R,
  TOWER_TOP,
  TOWER_TOP_R,
  TWO_PI,
} from "./turbine/dimensions";
import { attachBladeHitRaycast, createBladeGeometry, createBladeHitGeometry } from "./turbine/blade";
import { BladeInternalsMemo } from "./turbine/BladeStructure";
import { HubInternalsMemo } from "./turbine/HubInternals";
import { GeneratorRotor, GeneratorStatic } from "./turbine/GeneratorInternals";
import { latheAlongZ } from "./turbine/geometry";
import InfoPanel from "./turbine/InfoPanel";
import { bladeLivery, nacelleLivery } from "./turbine/livery";
import { CalloutLayer, type AnchorId, type CalloutRegistry, type CalloutSpec } from "./turbine/Callouts";
import { HoverLabel, InteractionProvider, Part, useInteraction, type InteractionState } from "./turbine/interaction";
import { NacelleInterior, YawSystem } from "./turbine/NacelleInterior";
import { PART_INFO, TOWER_OPEN_FOCUS, type Focus, type OpenableId, type PartId } from "./turbine/parts";
import TowerInterior from "./turbine/TowerInterior";
import SiteSplat from "./turbine/SiteSplat";
import GridFlow from "./turbine/GridFlow";

const CAMERA_TARGET: [number, number, number] = [0, 78, 0];
const HOME_FOCUS: Focus = { target: CAMERA_TARGET, distance: 270, elevationDeg: 5 };
const AUTO_ORBIT_RESUME_MS = 15_000;
/** Fraction of the canvas width the picture shifts left while the info panel is open. */
const PANEL_SHIFT = 0.2;
/** Phone: fraction of the canvas height the picture moves up while the bottom sheet is open. */
const PANEL_SHIFT_COMPACT = 0.22;
/** Phone (narrow portrait screen): stand further back so the rotor fits. */
const HOME_FOCUS_COMPACT: Focus = { target: [0, 74, 0], distance: 400, elevationDeg: 5 };
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
  /** Live active power (kW): drives the energy flowing into the grid around the site. */
  powerKw?: number;
  status: TurbineStatus;
  hasData: boolean;
  className?: string;
  /** Called when a visitor starts / stops exploring (a part selected or the tower open). */
  onExploringChange?: (exploring: boolean) => void;
  /** Phone layout: full-screen scene, bottom-sheet panel, floating data signs. */
  compact?: boolean;
  /** Floating signs around the turbine (phone layout). */
  callouts?: CalloutSpec[];
  /** Show the photogrammetric site (Gaussian splat of the real surroundings). Default true. */
  site?: boolean;
}

type LiveInputs = Omit<Turbine3DProps, "className" | "onExploringChange" | "compact" | "callouts" | "site">;

/* ------------------------------------------------------------------ */
/* Procedural geometry                                                 */
/* ------------------------------------------------------------------ */

/**
 * EP3-style rear nacelle: a short faceted box (flat roof, vertical sides, large lower
 * chamfers, chamfered tail) rather than the older rounded "egg" ENERCON nacelle.
 * Built in the shaft frame: +Z towards the rotor, +Y up. Use with flatShading.
 */
function createNacelleGeometry(): THREE.BufferGeometry {
  // [z, halfWidth, top, bottom, topChamfer, bottomChamfer]
  const sections: Array<[number, number, number, number, number, number]> = [
    [ROTOR_Z - 2.7, 2.05, 1.55, -2.65, 0.35, 0.95],
    [ROTOR_Z - 5.6 - NACELLE_STRETCH, 2.05, 1.55, -2.65, 0.35, 0.95],
    [ROTOR_Z - 6.7 - NACELLE_STRETCH, 1.8, 1.3, -1.55, 0.3, 0.7],
    [ROTOR_Z - 7.05 - NACELLE_STRETCH, 1.55, 1.0, -0.95, 0.25, 0.5],
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
      blade: createBladeGeometry(),
      bladeHit: createBladeHitGeometry(),
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

/** Rotor angle at which blade 0 lies horizontal (pointing to nacelle +X) for inspection. */
export const BLADE_PARK = Math.PI / 2;

type ProgressRefs = Record<OpenableId, React.RefObject<number>>;

function TurbineModel({
  liveRef,
  workLightYRef,
  yawOutRef,
}: {
  liveRef: React.RefObject<LiveInputs>;
  workLightYRef: React.RefObject<number>;
  yawOutRef: React.RefObject<number>;
}) {
  const geo = useTurbineGeometries();
  const yawRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Group>(null);
  const bladeRefs = useRef<Array<THREE.Group | null>>([]);
  const bladeInternalsRef = useRef<THREE.Group | null>(null);
  const sim = useRef({ rpm: 0, theta: 0, yaw: Math.PI - 225 * DEG, yawInitialised: false, pitch: 88 * DEG });

  // Opening state: each openable part animates 0 → 1 while it is open.
  const { openPart } = useInteraction();
  const openRef = useRef(openPart);
  openRef.current = openPart;
  const towerP = useRef(0);
  const nacelleP = useRef(0);
  const generatorP = useRef(0);
  const hubP = useRef(0);
  const bladesP = useRef(0);
  /** Current blade pitch (rad), read by the hub's pitch drives. */
  const pitchRef = useRef(88 * DEG);
  const progress = useMemo<ProgressRefs>(
    () => ({ tower: towerP, nacelle: nacelleP, generator: generatorP, hub: hubP, blades: bladesP }),
    [],
  );

  const shellRef = useRef<THREE.Group>(null);
  const frontRef = useRef<THREE.Mesh>(null);
  const frontMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const doorRef = useRef<THREE.Mesh>(null);
  const nacelleMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const generatorMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const spinnerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const inspectedBladeMatRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, delta) => {
    const live = liveRef.current;
    const s = sim.current;
    // `delta` is R3F's per-frame state.clock.getDelta(); calling getDelta() again here would return ~0.
    // Capped so a backgrounded tab doesn't produce one huge jump when it resumes.
    const dt = Math.min(delta, 0.25);
    const bladesOpen = openRef.current === "blades";
    const hubOpen = openRef.current === "hub";
    // The rotor is stopped (and parked) while someone looks at a blade or inside the hub.
    const parked = bladesOpen || hubOpen;

    // Rotor: smooth to the live RPM (rotor inertia), then Δθ = (RPM · 2π / 60) · Δt.
    // While a blade or the hub is being inspected the rotor brakes to a stop and parks blade 0 level.
    const targetRpm = parked ? 0 : live.hasData ? Math.max(0, live.rotorSpeedRpm) : 0;
    s.rpm += (targetRpm - s.rpm) * approach(dt, parked ? 1.2 : targetRpm > s.rpm ? 3 : 6);
    if (targetRpm === 0 && s.rpm < 0.01) s.rpm = 0;
    s.theta = (s.theta + ((s.rpm * 2 * Math.PI) / 60) * dt) % TWO_PI;
    if (parked && s.rpm < 0.8) s.theta += wrapPi(BLADE_PARK - s.theta) * approach(dt, 0.8);
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
    yawOutRef.current = s.yaw;

    // Blade pitch: feathered when stopped, fine pitch when generating; 0° while a blade is
    // inspected. With the hub open (rotor stopped) the drives demonstrate a slow 0–45° sweep.
    const demoPitch = 22.5 * DEG * (1 - Math.cos(state.clock.elapsedTime * 0.5));
    const pitchTarget = bladesOpen ? 0 : hubOpen ? (s.rpm < 0.3 ? demoPitch : 0) : targetPitchRad(live);
    s.pitch += (pitchTarget - s.pitch) * approach(dt, parked ? 2 : 4);
    pitchRef.current = s.pitch;
    for (const blade of bladeRefs.current) if (blade) blade.rotation.y = -s.pitch;
    if (bladeInternalsRef.current) bladeInternalsRef.current.rotation.y = -s.pitch;

    // Opening animations.
    (Object.keys(progress) as OpenableId[]).forEach((id) => {
      const ref = progress[id];
      const target = openRef.current === id ? 1 : 0;
      ref.current += (target - ref.current) * approach(dt, 0.35);
      if (Math.abs(target - ref.current) < 0.002) ref.current = target;
    });

    // Tower cut-away: the removable half is always turned towards the camera.
    const p = towerP.current;
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

    // Nacelle, generator housing, hub and the inspected blade fade to ghosts when opened.
    const ghost = (mat: THREE.MeshStandardMaterial | null, k: number, min = 0.14) => {
      if (!mat) return;
      mat.opacity = 1 - (1 - min) * k;
      mat.depthWrite = k < 0.05;
    };
    ghost(nacelleMatRef.current, nacelleP.current, 0.12);
    ghost(generatorMatRef.current, generatorP.current, 0.1);
    ghost(spinnerMatRef.current, Math.max(generatorP.current, hubP.current), 0.15);
    ghost(inspectedBladeMatRef.current, bladesP.current, 0.16);

  });

  return (
    <group>
      {/* Foundation + tower */}
      <mesh position={[0, 0.3, 0]} receiveShadow>
        <cylinderGeometry args={[7, 7.4, 0.6, 48]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.95} />
      </mesh>
      {/* Plain light-grey tower (no green base bands on the Lawrence Weston turbine) */}
      <Part id="tower" labelAt={[0, 32, 0]}>
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
      <TowerInterior progressRef={towerP} workLightYRef={workLightYRef} />

      {/* Yaw system: everything above the tower top rotates about Y */}
      <group ref={yawRef} position={[0, TOWER_TOP, 0]}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[TOWER_TOP_R + 0.05, TOWER_TOP_R + 0.05, 0.7, 48]} />
          <meshStandardMaterial color="#d9dde1" roughness={0.5} />
        </mesh>
        <YawSystem progressRef={nacelleP} />

        <group position={[0, NACELLE_AXIS_Y, 0]} rotation={[-SHAFT_TILT, 0, 0]}>
          <Part id="nacelle" labelAt={[0, 3.4, ROTOR_Z - 4.8 - NACELLE_STRETCH / 2]}>
            <mesh geometry={geo.nacelle} castShadow receiveShadow>
              <meshStandardMaterial
                ref={nacelleMatRef}
                onBeforeCompile={nacelleLivery.onBeforeCompile}
                customProgramCacheKey={nacelleLivery.customProgramCacheKey}
                color="#e9ecee"
                roughness={0.45}
                metalness={0.08}
                flatShading
                side={THREE.DoubleSide}
                transparent
              />
            </mesh>
            {/* Met mast with anemometer on the roof */}
            <mesh position={[0, 1.55 + 0.55, ROTOR_Z - 3.3 - NACELLE_STRETCH]}>
              <cylinderGeometry args={[0.05, 0.05, 1.1, 8]} />
              <meshStandardMaterial color="#4b5055" roughness={0.6} />
            </mesh>
          </Part>
          <NacelleInterior progressRef={nacelleP} />

          <Part id="generator" labelAt={[0, 4.4, ROTOR_Z - 1.8]}>
            <mesh geometry={geo.generator} castShadow>
              <meshStandardMaterial
                ref={generatorMatRef}
                color="#e8ebee"
                roughness={0.4}
                metalness={0.15}
                side={THREE.DoubleSide}
                transparent
              />
            </mesh>
          </Part>
          <GeneratorStatic progressRef={generatorP} />

          {/* Rotor: hub + generator rotor + three blades spinning about the shaft (local Z) */}
          <group ref={rotorRef} position={[0, 0, ROTOR_Z]}>
            {/* Labels sit on the shaft axis so they stay put while the rotor turns. */}
            <Part id="hub" labelAt={[0, 0, 4.2]}>
              <mesh geometry={geo.spinner} castShadow>
                <meshStandardMaterial
                  ref={spinnerMatRef}
                  color="#f4f5f6"
                  roughness={0.35}
                  metalness={0.1}
                  side={THREE.DoubleSide}
                  transparent
                />
              </mesh>
            </Part>
            <GeneratorRotor progressRef={generatorP} />
            <HubInternalsMemo progressRef={hubP} pitchRef={pitchRef} />
            {/* Blades stay clickable except while you look inside the hub (their roots would block it). */}
            <Part id="blades" labelAt={[0, 0, 4.2]} enabled={openPart !== "hub"}>
              {[0, 1, 2].map((i) => (
                <group key={i} rotation={[0, 0, (i * TWO_PI) / 3]}>
                  {/* Pitching group: the blade (and, for blade 0, its internal structure) */}
                  <group
                    ref={(g) => {
                      bladeRefs.current[i] = g;
                    }}
                  >
                    <mesh geometry={geo.blade} castShadow>
                      <meshStandardMaterial
                        ref={i === 0 ? inspectedBladeMatRef : undefined}
                        onBeforeCompile={bladeLivery.onBeforeCompile}
                        customProgramCacheKey={bladeLivery.customProgramCacheKey}
                        color="#f2f3f4"
                        roughness={0.42}
                        metalness={0.02}
                        side={THREE.DoubleSide}
                        transparent={i === 0}
                      />
                    </mesh>
                    {/* Invisible hit area 3× the chord wide so the slender blade is easy to hover/tap;
                        it ignores rays through the hub, which keeps its own hover and click. */}
                    <mesh geometry={geo.bladeHit} ref={attachBladeHitRaycast}>
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                  </group>
                </group>
              ))}
            </Part>
            {/* Blade 0 internals live outside the "blades" part so they can be hovered on their own. */}
            <group
              ref={(g) => {
                bladeInternalsRef.current = g;
              }}
            >
              <BladeInternalsMemo progressRef={bladesP} />
            </group>
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
/* Atmosphere: fixed daylight (a clear afternoon) → sky, lights, fog    */
/* ------------------------------------------------------------------ */

/** Always daylight, so every component is clearly visible: sun high in the south-west. */
const DAYLIGHT_SUN = { elevationDeg: 38, azimuthDeg: 215 };

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
    fogColor: mix("#0a1224", "#c8daea", day).lerp(new THREE.Color("#f0a878"), golden * 0.5),
    groundTint: mix("#18221a", "#5f7d45", day),
    rayleigh: lerp(0.4, 1.5, day) + golden * 1.5,
  };
}

function Atmosphere({
  elevationDeg,
  azimuthDeg,
  groundY = 0,
}: {
  elevationDeg: number;
  azimuthDeg: number;
  /** Lowered under the site splat so its photographed ground is not hidden by the plain disc. */
  groundY?: number;
}) {
  const env = useMemo(() => computeEnvironment(elevationDeg, azimuthDeg), [elevationDeg, azimuthDeg]);

  return (
    <>
      <Sky distance={450000} sunPosition={env.sunDir} turbidity={8} rayleigh={env.rayleigh} mieCoefficient={0.005} mieDirectionalG={0.8} />
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
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
  clampToTower,
  compact,
  workLightYRef,
}: {
  focus: Focus | null;
  panelOpen: boolean;
  /** Keep panning inside the tower (while the tower is open). */
  clampToTower: boolean;
  /** Phone layout: portrait framing, info panel as a bottom sheet. */
  compact: boolean;
  workLightYRef: React.RefObject<number>;
}) {
  const homeFocus = compact ? HOME_FOCUS_COMPACT : HOME_FOCUS;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const clampRef = useRef(clampToTower);
  clampRef.current = clampToTower;
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
      if (!focus) {
        // Start at the overview distance for this layout (further away on a narrow phone screen).
        const d = camera.position.clone().sub(controls.target);
        camera.position.copy(controls.target).addScaledVector(d.normalize(), homeFocus.distance);
        controls.update();
        return;
      }
    }
    const goal = focus ?? homeFocus;
    const fromTarget = controls.target.clone();
    const toTarget = new THREE.Vector3(...goal.target);
    // Use the part's preferred viewing direction, else keep the visitor's current one.
    const dir = goal.viewDir ? new THREE.Vector3(...goal.viewDir) : camera.position.clone().sub(fromTarget).setY(0);
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
  }, [focus, camera, homeFocus]);

  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    // Desktop: the panel is on the right → shift the picture left. Phone: the panel is a bottom
    // sheet → shift the picture up.
    const targetShift = panelOpenRef.current ? (compactRef.current ? PANEL_SHIFT_COMPACT : PANEL_SHIFT) : 0;
    const applyShift = () => {
      if (shiftRef.current === 0) cam.clearViewOffset();
      else if (compactRef.current) cam.setViewOffset(size.width, size.height, 0, shiftRef.current * size.height, size.width, size.height);
      else cam.setViewOffset(size.width, size.height, shiftRef.current * size.width, 0, size.width, size.height);
    };
    if (Math.abs(targetShift - shiftRef.current) > 1e-4) {
      shiftRef.current += (targetShift - shiftRef.current) * approach(Math.min(delta, 0.1), 0.3);
      if (Math.abs(targetShift - shiftRef.current) < 1e-3) shiftRef.current = targetShift;
      applyShift();
    } else if (shiftRef.current !== 0 && cam.view && (cam.view.fullWidth !== size.width || cam.view.fullHeight !== size.height)) {
      applyShift();
    }

    const controls = controlsRef.current;
    if (controls && focusedRef.current && clampRef.current) {
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

/* ------------------------------------------------------------------ */
/* Focus targets given in the nacelle / blade frames → world            */
/* ------------------------------------------------------------------ */

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** Nacelle-frame vector → world, for the current yaw (`point`: also translate). */
function nacelleToWorld(v: THREE.Vector3, yaw: number, point: boolean) {
  v.applyAxisAngle(AXIS_X, -SHAFT_TILT);
  if (point) v.y += NACELLE_AXIS_Y;
  v.applyAxisAngle(AXIS_Y, yaw);
  if (point) v.y += TOWER_TOP;
  return v;
}

function resolveFocus(f: Focus, yaw: number): Focus {
  const frame = f.frame ?? "world";
  const target = new THREE.Vector3(...f.target);
  if (frame === "blade") {
    // Inspected blade, parked level: blade frame → rotor frame → nacelle frame.
    target.applyAxisAngle(AXIS_Z, -BLADE_PARK);
    target.z += ROTOR_Z;
  }
  if (frame !== "world") nacelleToWorld(target, yaw, true);
  let viewDir: [number, number, number] | undefined;
  if (f.viewDir) {
    const d = new THREE.Vector3(...f.viewDir);
    if (frame !== "world") nacelleToWorld(d, yaw, false);
    d.setY(0).normalize();
    viewDir = d.toArray() as [number, number, number];
  }
  return { target: target.toArray() as [number, number, number], distance: f.distance, elevationDeg: f.elevationDeg, viewDir };
}

/* ------------------------------------------------------------------ */
/* Floating signs: project turbine anchor points to the screen          */
/* ------------------------------------------------------------------ */

function anchorWorld(id: AnchorId, yaw: number, out: THREE.Vector3) {
  switch (id) {
    case "hub":
      return nacelleToWorld(out.set(0, 0, ROTOR_Z), yaw, true);
    case "nacelle":
      return nacelleToWorld(out.set(0, 0.8, 0), yaw, true);
    case "rotorTop":
      return nacelleToWorld(out.set(0, 0, ROTOR_Z), yaw, true).add(new THREE.Vector3(0, 34, 0));
    case "towerUpper":
      return out.set(0, 66, 0);
    case "towerMid":
      return out.set(0, 45, 0);
    case "towerLow":
      return out.set(0, 22, 0);
    case "base":
      return out.set(0, 3, 0);
  }
}

function CalloutProjector({
  registry,
  yawRef,
}: {
  registry: React.RefObject<CalloutRegistry>;
  yawRef: React.RefObject<number>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    registry.current.forEach((e) => {
      if (!e.line || !e.dot || !e.card) return;
      anchorWorld(e.anchor, yawRef.current, v).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      const ax = ((v.x + 1) / 2) * size.width;
      const ay = ((1 - v.y) / 2) * size.height;
      // Attach to the card's inner edge, vertically centred.
      const c = e.card;
      const cx = e.side === "left" ? c.offsetLeft + c.offsetWidth : c.offsetLeft;
      const cy = c.offsetTop + c.offsetHeight / 2;
      e.line.setAttribute("x1", String(cx));
      e.line.setAttribute("y1", String(cy));
      e.line.setAttribute("x2", String(ax));
      e.line.setAttribute("y2", String(ay));
      e.dot.setAttribute("cx", String(ax));
      e.dot.setAttribute("cy", String(ay));
      e.line.style.visibility = visible ? "visible" : "hidden";
      e.dot.style.visibility = visible ? "visible" : "hidden";
    });
  });
  return null;
}

export default function Turbine3D({
  className,
  onExploringChange,
  compact = false,
  callouts,
  site = true,
  ...props
}: Turbine3DProps) {
  const calloutRegistry = useRef<CalloutRegistry>(new Map());
  const [canvasKey, setCanvasKey] = useState(0);

  // Values read inside the render loop without re-creating it.
  const liveRef = useRef<LiveInputs>({ ...props });
  useEffect(() => {
    liveRef.current = { ...props };
  });

  /* ---------------- Exploration state (hover / select / open a part) ---------------- */
  const [hoveredId, setHoveredId] = useState<PartId | null>(null);
  const [selectedId, setSelectedId] = useState<PartId | null>(null);
  const [openPart, setOpenPart] = useState<OpenableId | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const workLightYRef = useRef(8);
  const yawRef = useRef(0);
  const lastInputRef = useRef(Date.now());

  const setHovered = useCallback((id: PartId | null, from?: PartId) => {
    // `from`: only clear the hover if it still belongs to the part that is leaving.
    setHoveredId((current) => (id === null && from !== undefined && current !== from ? current : id));
  }, []);

  const select = useCallback((id: PartId) => {
    lastInputRef.current = Date.now();
    setSelectedId(id);
    const info = PART_INFO[id];
    const opened = info.opens ? (id as OpenableId) : info.parent;
    if (!opened) return;
    setOpenPart(opened);
    const f = info.focus ?? PART_INFO[opened].focus ?? TOWER_OPEN_FOCUS;
    setFocus(resolveFocus(f, yawRef.current)); // always a new object: re-fly even if unchanged
  }, []);

  const close = useCallback(() => {
    setOpenPart(null);
    setSelectedId(null);
    setHoveredId(null);
    setFocus(null);
  }, []);

  const goTo = useCallback((f: Focus) => {
    lastInputRef.current = Date.now();
    setSelectedId("tower");
    setFocus(resolveFocus(f, yawRef.current));
  }, []);

  const interaction = useMemo<InteractionState>(
    () => ({ hoveredId, selectedId, openPart, setHovered, select }),
    [hoveredId, selectedId, openPart, setHovered, select],
  );

  const exploring = openPart !== null || selectedId !== null;
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
    if (!openPart && !selectedId) return;
    const id = setInterval(() => {
      if (Date.now() - lastInputRef.current > IDLE_CLOSE_MS) close();
    }, 5_000);
    return () => clearInterval(id);
  }, [openPart, selectedId, close]);

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
            // Tap on empty sky/ground: drop the selection, but keep the opened part open.
            if (!openPart) setSelectedId(null);
            else if (selectedId !== openPart) setSelectedId(openPart);
          }}
        >
          <Atmosphere
            elevationDeg={DAYLIGHT_SUN.elevationDeg}
            azimuthDeg={DAYLIGHT_SUN.azimuthDeg}
            groundY={site ? -2.5 : 0}
          />
          {site && <SiteSplat compact={compact} />}
          {site && <GridFlow liveRef={liveRef} />}
          <TurbineModel liveRef={liveRef} workLightYRef={workLightYRef} yawOutRef={yawRef} />
          <WindParticles liveRef={liveRef} />
          <HoverLabel />
          {callouts && <CalloutProjector registry={calloutRegistry} yawRef={yawRef} />}
          <CameraRig
            focus={focus}
            panelOpen={exploring}
            clampToTower={openPart === "tower"}
            compact={compact}
            workLightYRef={workLightYRef}
          />
        </Canvas>
      </InteractionProvider>
      {callouts && <CalloutLayer callouts={callouts} registry={calloutRegistry} hidden={exploring} />}
      <InfoPanel
        compact={compact}
        selectedId={selectedId}
        openPart={openPart}
        onSelect={select}
        onGoTo={goTo}
        onClose={close}
      />
    </div>
  );
}
