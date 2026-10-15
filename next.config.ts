import type { NextConfig } from "next";

/**
 * Two ways to ship the kiosk:
 *  - default (Vercel / `next start`): server build with the /api/ace/* proxy routes.
 *  - STATIC_EXPORT=1 (GitHub Pages): plain static files in `out/`, no server at all. The browser
 *    then calls the ACE API directly (NEXT_PUBLIC_ACE_DIRECT) and every URL is prefixed with
 *    BASE_PATH (e.g. "/WeDoWind" for https://<user>.github.io/WeDoWind/).
 *    The /api route handlers cannot be exported: scripts/build-static.mjs moves them aside.
 */
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = isStatic ? (process.env.BASE_PATH ?? "").replace(/\/$/, "") : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_ACE_DIRECT: isStatic ? "1" : "",
  },
  ...(isStatic
    ? {
        output: "export",
        basePath: basePath || undefined,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // Response headers only exist when a server serves the app (GitHub Pages sets its own).
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                { key: "X-Frame-Options", value: "SAMEORIGIN" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
