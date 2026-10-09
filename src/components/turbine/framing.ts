import * as THREE from "three";

/** Screen margin (fraction of the visible area) kept around a point that must be in view. */
const FIT_MARGIN = 0.05;
const MAX_FIT_DISTANCE = 450;

export interface FitView {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** Vertical field of view (degrees). */
  fov: number;
  /** Fraction of the canvas the picture is shifted while the info panel is open (0 = closed). */
  shift: number;
  /** Phone layout: the panel is a bottom sheet (shift is vertical) instead of a side panel. */
  compact: boolean;
}

const _cam = new THREE.PerspectiveCamera();
const _pos = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Smallest camera distance (≥ `minDistance`) at which every point in `points` lies inside the
 * part of the screen the info panel leaves free, when the camera looks at `target` from the
 * unit direction `dir`. The view offset applied by the camera rig moves the target to the
 * centre of that free area, which is [0, 1 − 2·shift] of the width (desktop) or height (phone).
 */
export function fitDistance(
  target: THREE.Vector3,
  dir: THREE.Vector3,
  minDistance: number,
  points: THREE.Vector3[],
  view: FitView,
): number {
  if (!points.length || view.width <= 0 || view.height <= 0) return minDistance;
  _cam.fov = view.fov;
  _cam.aspect = view.width / view.height;
  _cam.near = 0.5;
  _cam.far = 5000;
  if (view.shift === 0) _cam.clearViewOffset();
  else if (view.compact) _cam.setViewOffset(view.width, view.height, 0, view.shift * view.height, view.width, view.height);
  else _cam.setViewOffset(view.width, view.height, view.shift * view.width, 0, view.width, view.height);
  _cam.updateProjectionMatrix();
  const uMax = (view.compact ? 1 : 1 - 2 * view.shift) - FIT_MARGIN;
  const vMax = (view.compact ? 1 - 2 * view.shift : 1) - FIT_MARGIN;

  const fits = (d: number) => {
    _cam.position.copy(_pos.copy(target).addScaledVector(dir, d));
    _cam.lookAt(target);
    _cam.updateMatrixWorld(true);
    return points.every((pt) => {
      _p.copy(pt).project(_cam);
      const u = (_p.x + 1) / 2;
      const v = (1 - _p.y) / 2;
      return _p.z < 1 && u >= FIT_MARGIN && u <= uMax && v >= FIT_MARGIN && v <= vMax;
    });
  };

  let d = minDistance;
  while (!fits(d) && d < MAX_FIT_DISTANCE) d *= 1.04;
  return Math.min(d, MAX_FIT_DISTANCE);
}
