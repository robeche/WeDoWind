"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  SLICE_RADII,
  downConductorCurve,
  leadingEdgeGeometry,
  receptorPoints,
  shearWebGeometries,
  sliceGeometries,
  sparCapGeometries,
  spanT,
  surfacePoint,
} from "./blade";
import { BLADE_ROOT_R } from "./dimensions";
import { Part } from "./interaction";

const COLOURS = {
  caps: "#2563eb", // unidirectional glass-fibre spar caps
  webs: "#f59e0b", // sandwich shear webs
  skin: "#e5e7eb", // GRP skins
  core: "#d9b77c", // balsa / foam core
  leadingEdge: "#f97316",
  copper: "#b87333",
  steel: "#9ca3af",
};

const ROOT_BOLT_COUNT = 64;
const ROOT_BOLT_CIRCLE = 1.2;

function useDisposeAll(geometries: THREE.BufferGeometry[]) {
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
}

/** Root bolts (steel) cast into the laminate and the root flange. */
function RootBolts() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < ROOT_BOLT_COUNT; i++) {
      const a = (i / ROOT_BOLT_COUNT) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * ROOT_BOLT_CIRCLE, BLADE_ROOT_R + 0.25, Math.sin(a) * ROOT_BOLT_CIRCLE);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ROOT_BOLT_COUNT]}>
      <cylinderGeometry args={[0.022, 0.022, 0.9, 6]} />
      <meshStandardMaterial color={COLOURS.steel} metalness={0.8} roughness={0.3} />
    </instancedMesh>
  );
}

/**
 * Internal structure of the inspected blade, in the blade's own (pitching) frame. Hidden until
 * the blades are opened; `progressRef` goes 0 → 1.
 */
function BladeInternals({ progressRef }: { progressRef: React.RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const slices = sliceGeometries();
    return {
      caps: sparCapGeometries(),
      webs: shearWebGeometries(),
      leadingEdge: leadingEdgeGeometry(),
      conductor: new THREE.TubeGeometry(downConductorCurve(), 120, 0.025, 6, false),
      slices,
    };
  }, []);
  useDisposeAll(
    useMemo(
      () => [
        ...geo.caps,
        ...geo.webs,
        geo.leadingEdge,
        geo.conductor,
        ...geo.slices.skins,
        ...geo.slices.cores,
        ...geo.slices.caps,
        ...geo.slices.webs,
      ],
      [geo],
    ),
  );
  const receptors = useMemo(() => receptorPoints(), []);
  const label = (r: number, x: number, side: 1 | -1, out = 0.6) =>
    surfacePoint(spanT(r), x, side, -out).toArray() as [number, number, number];

  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = progressRef.current > 0.02;
  });

  const surface = (colour: string, opacity = 1) => (
    <meshStandardMaterial
      color={colour}
      roughness={0.55}
      side={THREE.DoubleSide}
      transparent={opacity < 1}
      opacity={opacity}
      polygonOffset
      polygonOffsetFactor={-1}
    />
  );

  return (
    <group ref={groupRef} visible={false}>
      <Part id="sparCaps" labelAt={label(22, 0.38, -1, 0.5)}>
        {geo.caps.map((g, i) => (
          <mesh key={i} geometry={g}>
            {surface(COLOURS.caps)}
          </mesh>
        ))}
        {geo.slices.caps.map((g, i) => (
          <mesh key={`s${i}`} geometry={g}>
            {surface(COLOURS.caps)}
          </mesh>
        ))}
      </Part>

      <Part id="shearWebs" labelAt={label(30, 0.4, 1, 0.9)}>
        {geo.webs.map((g, i) => (
          <mesh key={i} geometry={g}>
            {surface(COLOURS.webs)}
          </mesh>
        ))}
        {geo.slices.webs.map((g, i) => (
          <mesh key={`s${i}`} geometry={g}>
            {surface(COLOURS.webs)}
          </mesh>
        ))}
      </Part>

      <Part id="bladeShell" labelAt={label(SLICE_RADII[0], 0.1, 1, 0.8)}>
        {geo.slices.skins.map((g, i) => (
          <mesh key={i} geometry={g}>
            {surface(COLOURS.skin)}
          </mesh>
        ))}
        {geo.slices.cores.map((g, i) => (
          <mesh key={`c${i}`} geometry={g}>
            {surface(COLOURS.core)}
          </mesh>
        ))}
      </Part>

      <Part id="leadingEdge" labelAt={label(48, 0, 1, 0.8)}>
        <mesh geometry={geo.leadingEdge}>{surface(COLOURS.leadingEdge, 0.85)}</mesh>
      </Part>

      <Part id="lightning" labelAt={label(52, 0.7, 1, 0.8)}>
        <mesh geometry={geo.conductor}>
          <meshStandardMaterial color={COLOURS.copper} metalness={0.8} roughness={0.3} />
        </mesh>
        {receptors.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.07, 12, 8]} />
            <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
      </Part>

      <Part id="bladeRoot" labelAt={[0, BLADE_ROOT_R + 1.2, -1.9]}>
        <RootBolts />
        <mesh position={[0, BLADE_ROOT_R + 0.04, 0]}>
          <cylinderGeometry args={[1.36, 1.36, 0.08, 48, 1, true]} />
          <meshStandardMaterial color={COLOURS.steel} metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
      </Part>
    </group>
  );
}

/**
 * Pitch bearing and electric pitch drive: fixed in the hub (they do not pitch with the blade).
 * Rendered in the blade's slot of the rotor, outside the pitching group.
 */
function PitchDrive({ progressRef }: { progressRef: React.RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = progressRef.current > 0.02;
  });
  return (
    <group ref={groupRef} visible={false}>
      <Part id="pitchSystem" labelAt={[-1.4, BLADE_ROOT_R - 0.2, 1.4]}>
        {/* Pitch bearing with its gear ring */}
        <mesh position={[0, BLADE_ROOT_R - 0.12, 0]}>
          <cylinderGeometry args={[1.5, 1.5, 0.22, 64, 1, true]} />
          <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, BLADE_ROOT_R - 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.42, 0.06, 8, 64]} />
          <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Electric pitch motor + gearbox, pinion on the gear ring */}
        <group position={[-1.05, BLADE_ROOT_R - 0.75, 0.9]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.5, 16]} />
            <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.36, 16]} />
            <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
        {/* Emergency power unit (batteries/capacitors) */}
        <mesh position={[1.0, BLADE_ROOT_R - 0.75, 0.95]}>
          <boxGeometry args={[0.4, 0.5, 0.25]} />
          <meshStandardMaterial color="#cfd3d6" roughness={0.55} />
        </mesh>
      </Part>
    </group>
  );
}

export const BladeInternalsMemo = memo(BladeInternals);
export const PitchDriveMemo = memo(PitchDrive);
