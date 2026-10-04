import * as THREE from "three";

/** Lathe a (radius, z) profile around the +Z axis (the rotor shaft). */
export function latheAlongZ(profile: Array<[number, number]>, segments = 48): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
  );
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Closed rectangular ring (annulus × length) around +Z, from z0 to z1. */
export function ringAlongZ(rIn: number, rOut: number, z0: number, z1: number, segments = 96) {
  return latheAlongZ(
    [
      [rIn, z0],
      [rOut, z0],
      [rOut, z1],
      [rIn, z1],
      [rIn, z0],
    ],
    segments,
  );
}

/** Cylinder whose axis runs between two points (radii at each end). */
export function cylinderBetween(from: THREE.Vector3, to: THREE.Vector3, rFrom: number, rTo: number, segments = 24) {
  const dir = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(rTo, rFrom, dir.length(), segments);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Tube along a smooth curve through points. */
export function tubeThrough(points: THREE.Vector3[], radius: number, segments = 48) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, "centripetal"), segments, radius, 8, false);
}
