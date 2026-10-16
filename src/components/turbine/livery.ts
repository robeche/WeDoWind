/**
 * Aviation marking ("livery"): red bands painted in the shader by local height, so a band
 * cuts cleanly across faceted surfaces without extra geometry.
 *
 * - Nacelle: a 2 m red belt around the middle of the machine house.
 * The blades carry no bands (plain white).
 */

import * as THREE from "three";

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
