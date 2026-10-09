/**
 * Blade geometry for the E-115 E3 (56 m blades) and builders for its internal structure.
 *
 * Blade-local frame: span along +Y (root at BLADE_ROOT_R from the hub centre), leading edge
 * towards +X, suction side towards −Z (pressure side faces upwind, +Z).
 * Section parameter: x = chord fraction (0 = leading edge, 1 = trailing edge),
 * side = +1 suction surface / −1 pressure surface.
 */

import * as THREE from "three";
import { BLADE_ROOT_R, DEG, ROTOR_RADIUS } from "./dimensions";

const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

const ROOT_DIAMETER = 2.7;
const MAX_CHORD = 4.1;
const MAX_CHORD_T = 0.2;
const TIP_CHORD = 0.3;
const SPAN = ROTOR_RADIUS - BLADE_ROOT_R;

export interface BladeSection {
  t: number;
  r: number;
  chord: number;
  thickness: number;
  blend: number;
  pivot: number;
  prebend: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
}

/** Planform, thickness, twist and pre-bend at span fraction t (0 = root, 1 = tip). */
export function bladeSection(t: number): BladeSection {
  const chord =
    t < MAX_CHORD_T
      ? lerp(ROOT_DIAMETER, MAX_CHORD, smoothstep(t, 0.02, MAX_CHORD_T))
      : TIP_CHORD + (MAX_CHORD - TIP_CHORD) * Math.pow((1 - t) / (1 - MAX_CHORD_T), 1.1);
  const blend = smoothstep(t, 0.02, 0.22);
  const thickness =
    t < MAX_CHORD_T ? lerp(1, 0.4, smoothstep(t, 0.02, MAX_CHORD_T)) : lerp(0.4, 0.16, smoothstep(t, MAX_CHORD_T, 0.65));
  const twistDeg = t < MAX_CHORD_T ? 14 : 14 - 15 * Math.pow((t - MAX_CHORD_T) / (1 - MAX_CHORD_T), 0.7);
  const phi = twistDeg * DEG;
  return {
    t,
    r: BLADE_ROOT_R + t * SPAN,
    chord,
    thickness,
    blend,
    pivot: lerp(0.5, 0.35, blend),
    prebend: 1.8 * t * t,
    // u: leading-edge direction, v: suction-side direction (both in the XZ plane).
    ux: Math.cos(phi),
    uz: Math.sin(phi),
    vx: Math.sin(phi),
    vz: -Math.cos(phi),
  };
}

/** Span fraction for a radius measured from the hub centre. */
export const spanT = (r: number) => THREE.MathUtils.clamp((r - BLADE_ROOT_R) / SPAN, 0, 1);

/** Normalised half-thickness (y / chord) at angle θ around the section, optionally moved inwards. */
function sectionY(sec: BladeSection, theta: number, inset: number) {
  const x = 0.5 * (1 + Math.cos(theta));
  const side = Math.sin(theta) >= 0 ? 1 : -1;
  const tk = sec.thickness;
  const yt = 5 * tk * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const camber = x < 0.4 ? 0.25 * (0.8 * x - x * x) : (0.04 / 0.36) * (0.2 + 0.8 * x - x * x);
  const y = lerp(0.5 * Math.sin(theta), camber + side * yt, sec.blend);
  // Never move inwards past (nearly) the mid-line, so thin trailing edges don't fold over.
  const half = Math.abs(y - lerp(0, camber, sec.blend));
  const ins = inset > 0 ? Math.min(inset, 0.48 * half) : inset;
  return { x, y: y - side * ins };
}

/** Section-plane coordinates (a along the chord line towards the LE, b towards the suction side), metres. */
export function sectionAB(sec: BladeSection, theta: number, inset = 0): [number, number] {
  const { x, y } = sectionY(sec, theta, inset);
  return [(sec.pivot - x) * sec.chord, y * sec.chord];
}

/** Section-plane (a, b) → blade-local 3D point. */
export function abToLocal(sec: BladeSection, a: number, b: number, out = new THREE.Vector3()) {
  return out.set(a * sec.ux + b * sec.vx, sec.r, a * sec.uz + b * sec.vz + sec.prebend);
}

/** θ for a chord fraction on a given side (θ ∈ [0, π] suction, (−π, 0) pressure). */
export const thetaFor = (x: number, side: 1 | -1) => side * Math.acos(THREE.MathUtils.clamp(2 * x - 1, -1, 1));

export function surfacePoint(t: number, x: number, side: 1 | -1, inset = 0) {
  const sec = bladeSection(t);
  const [a, b] = sectionAB(sec, thetaFor(x, side), inset);
  return abToLocal(sec, a, b);
}

/* ------------------------------------------------------------------ */
/* Outer shell                                                         */
/* ------------------------------------------------------------------ */

export function createBladeGeometry(): THREE.BufferGeometry {
  const SECTIONS = 48;
  const RING = 32;
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();

  for (let i = 0; i < SECTIONS; i++) {
    const sec = bladeSection(i / (SECTIONS - 1));
    for (let k = 0; k < RING; k++) {
      const [a, b] = sectionAB(sec, (k / RING) * Math.PI * 2);
      abToLocal(sec, a, b, p);
      positions.push(p.x, p.y, p.z);
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
  positions.push(cx / RING, ROTOR_RADIUS + 0.25, cz / RING);
  for (let k = 0; k < RING; k++) indices.push(last + k, last + ((k + 1) % RING), tipIndex);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Pointer hit area                                                    */
/* ------------------------------------------------------------------ */

/**
 * Radius (from the hub centre) inside which the blade hit area never catches the pointer:
 * clears the spinner (max. 2.75 m from the rotor centre) so the hub keeps its own hover/click.
 */
export const BLADE_HIT_HUB_CLEAR = 3.0;
/** Hit-area width as a multiple of the local chord (3 = three times as wide as the blade). */
const HIT_WIDTH_FACTOR = 3;
/** Minimum hit-area width / depth (m), so the slender tip is still easy to tap. */
const HIT_MIN_WIDTH = 2.4;
const HIT_MIN_DEPTH = 2.0;
/** Maximum hit-area depth (m) along the thickness direction, to keep it off the nacelle nose. */
const HIT_MAX_DEPTH = 3.0;

/**
 * Invisible, fattened copy of the blade used only for raycasting: an elliptical tube that
 * follows the blade's twist and pre-bend, HIT_WIDTH_FACTOR × the chord wide, starting
 * outside the spinner and running a little past the tip.
 */
export function createBladeHitGeometry(): THREE.BufferGeometry {
  const SECTIONS = 28;
  const RING = 16;
  const t0 = spanT(BLADE_HIT_HUB_CLEAR);
  const positions: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const centres: THREE.Vector3[] = [];

  for (let i = 0; i < SECTIONS; i++) {
    const sec = bladeSection(lerp(t0, 1, i / (SECTIONS - 1)));
    const halfW = Math.max(HIT_WIDTH_FACTOR * sec.chord, HIT_MIN_WIDTH) / 2;
    const depth = THREE.MathUtils.clamp(HIT_WIDTH_FACTOR * sec.chord * sec.thickness, HIT_MIN_DEPTH, HIT_MAX_DEPTH);
    const midA = (sec.pivot - 0.5) * sec.chord; // centred on mid-chord, like the real section
    centres.push(abToLocal(sec, midA, 0));
    for (let k = 0; k < RING; k++) {
      const ang = (k / RING) * Math.PI * 2;
      abToLocal(sec, midA + halfW * Math.cos(ang), (depth / 2) * Math.sin(ang), p);
      positions.push(p.x, p.y, p.z);
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
  // Caps: root (flat) and tip (pointed, 1.5 m past the real tip).
  const rootIndex = positions.length / 3;
  positions.push(centres[0].x, centres[0].y, centres[0].z);
  const tip = centres[SECTIONS - 1];
  const tipIndex = rootIndex + 1;
  positions.push(tip.x, ROTOR_RADIUS + 1.5, tip.z);
  const last = (SECTIONS - 1) * RING;
  for (let k = 0; k < RING; k++) {
    indices.push(rootIndex, (k + 1) % RING, k);
    indices.push(last + k, last + ((k + 1) % RING), tipIndex);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const _hubCentre = new THREE.Vector3();

/**
 * Raycast for the blade hit area: ignores any ray that passes through the hub (within
 * BLADE_HIT_HUB_CLEAR of the rotor centre), so the fattened blades never steal the hub's
 * hover or click from any viewing angle. The mesh must sit in a blade frame whose origin is
 * the rotor centre (true for the rotor/pitch groups in Turbine3D).
 */
export function hubAwareRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  _hubCentre.setFromMatrixPosition(this.matrixWorld);
  if (raycaster.ray.distanceSqToPoint(_hubCentre) < BLADE_HIT_HUB_CLEAR ** 2) return;
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
}

/**
 * Stable ref callback for the blade hit mesh. Stores the hub-aware raycast as the mesh's
 * "own" raycast so <Part> keeps using it (and can still switch it off when disabled).
 */
export function attachBladeHitRaycast(mesh: THREE.Mesh | null) {
  if (!mesh || mesh.userData.ownRaycast) return;
  mesh.userData.ownRaycast = hubAwareRaycast;
  mesh.raycast = hubAwareRaycast;
}

/* ------------------------------------------------------------------ */
/* Internal structure                                                  */
/* ------------------------------------------------------------------ */

/** Grid surface: rows along the span (t0..t1), columns from `colPoint(t, 0)` to `colPoint(t, 1)`. */
function gridSurface(t0: number, t1: number, rows: number, cols: number, colPoint: (t: number, u: number) => THREE.Vector3) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = lerp(t0, t1, i / rows);
    for (let j = 0; j <= cols; j++) {
      const p = colPoint(t, j / cols);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export const SPAR = { x0: 0.27, x1: 0.5, insetOuter: 0.004, insetInner: 0.03, t0: 0.07, t1: 0.96 };
export const WEBS = { xs: [0.3, 0.47], t0: 0.1, t1: 0.9, halfWidth: 0.006 };

/** Spar caps: thick UD bands just inside the suction and pressure skins. */
export function sparCapGeometries() {
  const mid = (SPAR.insetOuter + SPAR.insetInner) / 2;
  return ([1, -1] as const).map((side) =>
    gridSurface(SPAR.t0, SPAR.t1, 80, 6, (t, u) => surfacePoint(t, lerp(SPAR.x0, SPAR.x1, u), side, mid)),
  );
}

/** Shear webs: flat walls joining the two spar caps. */
export function shearWebGeometries() {
  return WEBS.xs.map((x) =>
    gridSurface(WEBS.t0, WEBS.t1, 70, 1, (t, u) =>
      u === 0 ? surfacePoint(t, x, 1, SPAR.insetInner) : surfacePoint(t, x, -1, SPAR.insetInner),
    ),
  );
}

/** Leading-edge protection: a band wrapped round the outer leading edge, just proud of the skin. */
export function leadingEdgeGeometry() {
  return gridSurface(0.62, 0.995, 60, 14, (t, u) => {
    const sec = bladeSection(t);
    const theta = Math.PI + lerp(-0.75, 0.75, u); // around the LE (θ = π)
    const [a, b] = sectionAB(sec, theta, -0.004);
    return abToLocal(sec, a, b);
  });
}

/** Lightning down-conductor: runs inside along the rear web from the tip receptors to the root. */
export function downConductorCurve() {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = lerp(0.97, 0.03, i / 24);
    const up = surfacePoint(t, 0.5, 1, 0.05);
    const lo = surfacePoint(t, 0.5, -1, 0.05);
    pts.push(up.add(lo).multiplyScalar(0.5));
  }
  pts.push(new THREE.Vector3(0, BLADE_ROOT_R - 0.6, 0));
  return new THREE.CatmullRomCurve3(pts);
}

/** Receptor positions (blade surface, both sides, near the tip). */
export function receptorPoints() {
  return [0.86, 0.975].flatMap((t) => ([1, -1] as const).map((side) => surfacePoint(t, 0.7, side, -0.002)));
}

/* Cross-section slices ------------------------------------------------ */

/** A closed ring (outer outline minus inner outline) at inset distances (chord fractions). */
function ringShape(sec: BladeSection, insetOut: number, insetIn: number, n = 64) {
  const outer = new THREE.Shape();
  const hole = new THREE.Path();
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * Math.PI * 2;
    const [a, b] = sectionAB(sec, th, insetOut);
    if (k === 0) outer.moveTo(a, b);
    else outer.lineTo(a, b);
  }
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * Math.PI * 2;
    const [a, b] = sectionAB(sec, th, insetIn);
    if (k === 0) hole.moveTo(a, b);
    else hole.lineTo(a, b);
  }
  outer.holes.push(hole);
  return outer;
}

/** Band between two insets over a chord range on one side (spar cap section). */
function bandShape(sec: BladeSection, x0: number, x1: number, side: 1 | -1, insetOut: number, insetIn: number, n = 10) {
  const s = new THREE.Shape();
  for (let k = 0; k <= n; k++) {
    const [a, b] = sectionAB(sec, thetaFor(lerp(x0, x1, k / n), side), insetOut);
    if (k === 0) s.moveTo(a, b);
    else s.lineTo(a, b);
  }
  for (let k = n; k >= 0; k--) {
    const [a, b] = sectionAB(sec, thetaFor(lerp(x0, x1, k / n), side), insetIn);
    s.lineTo(a, b);
  }
  return s;
}

/** Thin wall between the caps at chord fraction x (web section). */
function webShape(sec: BladeSection, x: number) {
  const s = new THREE.Shape();
  const hw = WEBS.halfWidth;
  const corners: Array<[number, 1 | -1]> = [
    [x - hw, 1],
    [x + hw, 1],
    [x + hw, -1],
    [x - hw, -1],
  ];
  corners.forEach(([cx, side], i) => {
    const [a, b] = sectionAB(sec, thetaFor(cx, side), SPAR.insetInner);
    if (i === 0) s.moveTo(a, b);
    else s.lineTo(a, b);
  });
  return s;
}

/** Shape (in section a/b coordinates) → geometry placed in the blade frame at that section. */
function placeShape(sec: BladeSection, shape: THREE.Shape, spanOffset = 0) {
  const g = new THREE.ShapeGeometry(shape, 1);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    abToLocal(sec, pos.getX(i), pos.getY(i), v);
    pos.setXYZ(i, v.x, v.y + spanOffset, v.z); // small offsets keep overlapping layers from z-fighting
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export const SLICE_RADII = [14, 28, 42];

export interface SliceGeometries {
  skins: THREE.BufferGeometry[];
  cores: THREE.BufferGeometry[];
  caps: THREE.BufferGeometry[];
  webs: THREE.BufferGeometry[];
}

/** Coloured cross-sections at a few radii: GRP skins, balsa/foam core, spar caps and webs. */
export function sliceGeometries(): SliceGeometries {
  const out: SliceGeometries = { skins: [], cores: [], caps: [], webs: [] };
  for (const r of SLICE_RADII) {
    const sec = bladeSection(spanT(r));
    out.skins.push(placeShape(sec, ringShape(sec, 0, 0.005)), placeShape(sec, ringShape(sec, 0.017, 0.021)));
    out.cores.push(placeShape(sec, ringShape(sec, 0.005, 0.017), 0.01));
    for (const side of [1, -1] as const) {
      out.caps.push(placeShape(sec, bandShape(sec, SPAR.x0, SPAR.x1, side, SPAR.insetOuter, SPAR.insetInner), 0.02));
    }
    for (const x of WEBS.xs) out.webs.push(placeShape(sec, webShape(sec, x), 0.02));
  }
  return out;
}
