"use client";

import { Splat } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import SafeBoundary from "../SafeBoundary";

/**
 * Photogrammetric surroundings of the Lawrence Weston turbine: a 3D Gaussian splat trained
 * from a 360° Google Earth Studio orbit (COLMAP + Brush, see GEarth/splat_work/README.md).
 *
 * The file is already in scene units (1 unit = 1 m, tower axis at x = z = 0, ground at y = 0,
 * -Z = north) and the Google Earth turbine has been cut out, so the procedural twin stands in
 * its place. It is stored pre-rotated 180° about X because drei's <Splat> assumes the COLMAP
 * (y-down) convention and flips it on load. `.splat` = 32 bytes per splat: position f32×3,
 * scale f32×3, RGBA u8, quaternion u8×4.
 */
/** Bump when the files are re-exported, so browsers and kiosks do not keep a cached copy. */
const SPLAT_VERSION = 2;
export const SITE_SPLAT_URL = `/splats/lawrence-weston.splat?v=${SPLAT_VERSION}`;
/** Lighter version (fewer, larger splats) for phones. */
export const SITE_SPLAT_LITE_URL = `/splats/lawrence-weston-lite.splat?v=${SPLAT_VERSION}`;

/**
 * drei's splat loader needs a Content-Length header, but hosts that compress on the fly
 * (Vercel serves the file with brotli) drop it. Downloading the file ourselves and handing
 * drei a Blob URL works everywhere, and still benefits from the compressed transfer.
 */
function useBlobUrl(src: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | null = null;
    fetch(src, { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!abort.signal.aborted) console.error("[SiteSplat]", err);
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [src]);
  return url;
}

export default function SiteSplat({ compact = false }: { compact?: boolean }) {
  const url = useBlobUrl(compact ? SITE_SPLAT_LITE_URL : SITE_SPLAT_URL);
  if (!url) return null;
  return (
    // A missing or broken file must never take the turbine down with it: just show no surroundings.
    <SafeBoundary name="SiteSplat" fallback={null} retryAfterMs={10 * 60_000}>
      <Suspense fallback={null}>
        <Splat src={url} chunkSize={50_000} />
      </Suspense>
    </SafeBoundary>
  );
}
