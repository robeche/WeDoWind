/**
 * Aviation marking ("livery"): red bands painted in the shader by local height, so a band
 * cuts cleanly across faceted surfaces without extra geometry.
 *
 * - Nacelle: a 2 m red belt around the middle of the machine house.
 * - Blades: the outer 18 m in three 6 m fields, red – white – red (red at the tip).
 */

import * as THREE from "three";
import { ROTOR_RADIUS } from "./dimensions";

/** Traffic red (RAL 3020 style). */
export const MARKING_RED = "#c4161c";

type Band = [lo: number, hi: number];

function bandedMaterialHook(bands: Band[], key: string) {
  const c = new THREE.Color(MARKING_RED); // linear components
  const red = `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  const test = bands
    .map(([lo, hi]) => `band = max(band, step(${lo.toFixed(3)}, vLiveryPos.y) * step(vLiveryPos.y, ${hi.toFixed(3)}));`)
    .join("\n");

  const onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLiveryPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLiveryPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLiveryPos;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nfloat band = 0.0;\n${test}\ndiffuseColor.rgb = mix(diffuseColor.rgb, ${red}, band);`,
      );
  };
  return { onBeforeCompile, customProgramCacheKey: () => key };
}

/** Nacelle frame: shaft axis at y = 0; the box spans about −2.65 … 1.55 m. */
export const NACELLE_BAND: Band = [-1.45, 0.55];
export const nacelleLivery = bandedMaterialHook([NACELLE_BAND], "livery-nacelle");

/** Blade frame: local y is the radius from the rotor axis (root at BLADE_ROOT_R). */
const FIELD = 6;
export const BLADE_BANDS: Band[] = [
  [ROTOR_RADIUS - FIELD, ROTOR_RADIUS + 1], // tip field
  [ROTOR_RADIUS - 3 * FIELD, ROTOR_RADIUS - 2 * FIELD],
];
export const bladeLivery = bandedMaterialHook(BLADE_BANDS, "livery-blade");

