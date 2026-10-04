"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { PART_INFO, type OpenableId, type PartId } from "./parts";

/* ------------------------------------------------------------------ */
/* Shared hover / selection state (bridged into the R3F canvas)         */
/* ------------------------------------------------------------------ */

export interface InteractionState {
  hoveredId: PartId | null;
  selectedId: PartId | null;
  /** The exterior part currently opened (tower, nacelle, generator or blades). */
  openPart: OpenableId | null;
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
/* Hover label: ONE persistent <Html> that follows the hovered part.    */
/* (Mounting/unmounting drei <Html> on every hover trips React 19's     */
/* "unmount a root while rendering" error, so it is never unmounted.)   */
/* ------------------------------------------------------------------ */

const labelAnchor: { id: PartId | null; object: THREE.Object3D | null; local: THREE.Vector3; world: THREE.Vector3 } = {
  id: null,
  object: null,
  local: new THREE.Vector3(),
  world: new THREE.Vector3(),
};

export function HoverLabel() {
  const { hoveredId } = useInteraction();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (labelAnchor.object) g.position.copy(labelAnchor.object.localToWorld(labelAnchor.world.copy(labelAnchor.local)));
    else g.position.copy(labelAnchor.world);
  });
  const info = hoveredId ? PART_INFO[hoveredId] : null;
  return (
    <group ref={groupRef}>
      <Html center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
        <div
          className={`whitespace-nowrap rounded-full bg-slate-950/85 px-4 py-1.5 text-[clamp(0.85rem,1.8vh,1.3rem)] font-semibold text-white shadow-lg ring-1 ring-sky-300/60 transition-opacity duration-150 ${
            info ? "opacity-100" : "opacity-0"
          }`}
        >
          {info?.name ?? ""}
          {info?.opens && <span className="ml-2 font-normal text-sky-200">· tap to open</span>}
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* <Part>: a hoverable, selectable component of the turbine            */
/* ------------------------------------------------------------------ */

interface PartProps {
  id: PartId;
  /** When false the part ignores the pointer and lets events pass to what is behind it. */
  enabled?: boolean;
  /** Position of the hover label, local to the part (or to `labelAnchor`). Default: where the pointer hit. */
  labelAt?: [number, number, number];
  /** Optional moving child the label follows (e.g. the lift cabin). */
  labelAnchorRef?: React.RefObject<THREE.Object3D | null>;
  children: ReactNode;
}

export function Part({ id, enabled: enabledProp = true, labelAt, labelAnchorRef, children }: PartProps) {
  const { hoveredId, selectedId, setHovered, select, openPart } = useInteraction();
  // Inner components only react while their parent is open; an opened part itself is inert.
  const parent = PART_INFO[id].parent;
  const enabled = enabledProp && (parent ? openPart === parent : openPart !== id);
  const ref = useRef<THREE.Group>(null);
  const hovered = enabled && hoveredId === id;
  // An opened part (the tower) is not tinted while you look inside it.
  const selected = selectedId === id && openPart !== id;
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
    labelAnchor.id = id;
    if (labelAt) {
      labelAnchor.object = labelAnchorRef?.current ?? ref.current;
      labelAnchor.local.set(...labelAt);
    } else {
      labelAnchor.object = null;
      labelAnchor.world.copy(e.point).y += 1;
    }
    setHovered(id);
  };
  const onOut = (e: ThreeEvent<PointerEvent>) => {
    if (!enabled) return;
    e.stopPropagation();
    if (labelAnchor.id === id) labelAnchor.id = null;
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
    </group>
  );
}
