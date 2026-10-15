#!/usr/bin/env node
/**
 * Static build for GitHub Pages (or any static host): `npm run build:static`.
 *
 * Route handlers (src/app/api) need a server and break `output: "export"`, so they are moved out
 * of the app directory for the duration of the build and always put back afterwards. The result
 * is in `out/`. BASE_PATH defaults to "/WeDoWind" (https://<user>.github.io/WeDoWind/); pass
 * BASE_PATH="" for a site served from the domain root.
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const api = join(root, "src", "app", "api");
const parked = join(root, ".api-routes-parked");

if (existsSync(parked)) {
  console.error(`${parked} exists: a previous static build was interrupted. Move it back to src/app/api first.`);
  process.exit(1);
}

const env = { ...process.env, STATIC_EXPORT: "1", BASE_PATH: process.env.BASE_PATH ?? "/WeDoWind" };
let status = 1;
if (existsSync(api)) renameSync(api, parked);
try {
  const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env, shell: process.platform === "win32" });
  status = r.status ?? 1;
} finally {
  if (existsSync(parked)) renameSync(parked, api);
}
if (status === 0) {
  // Tell GitHub Pages not to run Jekyll (it would drop the _next/ folder).
  writeFileSync(join(root, "out", ".nojekyll"), "");
  console.log(`\nStatic site ready in out/ (base path "${env.BASE_PATH}").`);
}
process.exit(status);
