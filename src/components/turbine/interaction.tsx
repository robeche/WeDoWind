"use client";

import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { PART_INFO, isTowerPart, type PartId } from "./parts";

/* ------------------------------------------------------------------ */
/* Shared hover / selection state (bridged into the R3F canvas)         */
/* ------------------------------------------------------------------ */

export interface InteractionState {
  hoveredId: PartId | null;
  selectedId: PartId | null;
  towerOpen: boolean;
  setHovered: (id: PartId | null, from?: PartId) => void;
  select: (id: PartId) => void;
}

const InteractionContext = createContext<InteractionState | null>(null);

export const InteractionProvider = InteractionContext.Provider;

export function useInteraction(): InteractionState {
  const ctx = useContext(InteractionContext);
  if (!ctx) throw new Error("useInteraction must be used inside <InteractionProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Highlight: tint every standard material below a group               */
/* ------------------------------------------------------------------ */

const NO_RAYCAST: THREE.Mesh["raycast"] = () => {};
const HOVER_COLOR = new THREE.Color("#38bdf8");
const SELECT_COLOR = new THREE.Color("#34d399");

type EmissiveMaterial = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number };

const hasEmissive = (m: THREE.Material): m is EmissiveMaterial =>
  (m as Partial<EmissiveMaterial>).emissive instanceof THREE.Color;

/**
 * Applies an emissive tint to all meshes under `ref` while `mode` is set, restoring each
 * material's own emissive (e.g. luminaires, status LEDs) afterwards.
 */
export function useHighlight(ref: React.RefObject<THREE.Object3D | null>, mode: "hover" | "selected" | null) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material || obj.userData.noHighlight) return;
      for (const m of Array.isArray(material) ? material : [material]) {
        if (!hasEmissive(m)) continue;
        if (!m.userData.baseEmissive) {
          m.userData.baseEmissive = m.emissive.clone();
          m.userData.baseEmissiveIntensity = m.emissiveIntensity;
        }
        if (mode) {
          m.emissive.copy(mode === "hover" ? HOVER_COLOR : SELECT_COLOR);
          m.emissiveIntensity = mode === "hover" ? 0.55 : 0.4;
        } else {
          m.emissive.copy(m.userData.baseEmissive as THREE.Color);
          m.emissiveIntensity = m.userData.baseEmissiveIntensity as number;
        }
      }
    });
  }, [ref, mode]);
}

/* ------------------------------------------------------------------ */
/* <Part>: a hoverable, selectable component of the turbine            */
/* ------------------------------------------------------------------ */

interface PartProps {
  id: PartId;
  /** When false the part ignores the pointer and lets events pass to what is behind it. */
  enabled?: boolean;
  /** Local position of the hover label. */
  labelAt?: [number, number, number];
  children: ReactNode;
}

export function Part({ id, enabled: enabledProp = true, labelAt, children }: PartProps) {
  const { hoveredId, selectedId, setHovered, select, towerOpen } = useInteraction();
  // Parts inside the tower only react while the tower is open.
  const enabled = enabledProp && (!isTowerPart(id) || towerOpen);
  const ref = useRef<THREE.Group>(null);
  const hovered = enabled && hoveredId === id;
  // An opened part (the tower) is not tinted while you look inside it.
  const selected = selectedId === id && !(PART_INFO[id].opens && towerOpen);
  useHighlight(ref, hovered ? "hover" : selected ? "selected" : null);

  // Release the hover if the part is disabled while the pointer is over it.
  useEffect(() => {
    if (!enabled) setHovered(null, id);
  }, [enabled, id, setHovered]);

  // A disabled part must not be hit by the raycaster at all: R3F keeps an object that was
  // hovered (and stopped propagation) "hovered" while the pointer stays on it, which would
  // otherwise block the parts behind it — e.g. the opened tower shell hiding its interior.
  useEffect(() => {
    ref.current?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) return;
      if (obj.userData.noHit) {
        mesh.raycast = NO_RAYCAST; // see-through surfaces (e.g. grating) never block the pointer
        return;
      }
      if (!obj.userData.ownRaycast) obj.userData.ownRaycast = mesh.raycast;
      mesh.raycast = enabled ? (obj.userData.ownRaycast as THREE.Mesh["raycast"]) : NO_RAYCAST;
    });
  }, [enabled]);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!enabled) return; // no stopPropagation: the event continues to objects behind
    e.stopPropagation();
    setHovered(id);
  };
  const onOut = (e: ThreeEvent<PointerEvent>) => {
    if (!enabled) return;
    e.stopPropagation();
    setHovered(null, id);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!enabled) return;
    e.stopPropagation();
    select(id);
  };

  return (
    <group ref={ref} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      {children}
      {hovered && labelAt && (
        <Html position={labelAt} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full bg-slate-950/85 px-4 py-1.5 text-[clamp(0.85rem,1.8vh,1.3rem)] font-semibold text-white shadow-lg ring-1 ring-sky-300/60">
            {PART_INFO[id].name}
            {PART_INFO[id].opens && <span className="ml-2 font-normal text-sky-200">· tap to open</span>}
          </div>
        </Html>
      )}
    </group>
  );
}
