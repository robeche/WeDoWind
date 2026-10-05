# WeDoWind

A live public kiosk dashboard for the Lawrence Weston community wind turbine display, built as part of the WeDoWind Challenge 5: ACE public communication display.

## Overview

This project presents live turbine telemetry in a clear, public-facing format using:

- Next.js
- React
- TypeScript
- Three.js / React Three Fiber
- Tailwind CSS

It shows live power, rotor speed, wind conditions, and a 3D turbine model while translating raw data into accessible community impact metrics.

## Features

- Live ACE turbine data via a server-side proxy
- Public kiosk layout optimised for continuous display
- Animated 3D turbine digital twin
- Community impact metrics and equivalent summaries
- Automatic refresh and graceful fallback states

## Local development

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Production build

```bash
npm run build
npm run start
```

## The turbine

ENERCON E-115 E3, 4.2 MW: 115.7 m rotor (56 m blades), ~92 m hub height, 150 m to the blade tip.
The 3D twin in `src/components/Turbine3D.tsx` is built to these dimensions (1 unit = 1 m), with the
EP3-style faceted nacelle and ring generator.

### Site surroundings (Gaussian splat)

`public/splats/lawrence-weston.splat` (≈1.1 M splats, 38 MB) and `lawrence-weston-lite.splat` (400 k, phones)
are a 3D Gaussian splat of the real site, trained from a 360° Google Earth Studio orbit with COLMAP + Brush
(pipeline and re-training notes in `GEarth/splat_work/README.md`). They are already in scene units
(1 unit = 1 m, Y up, tower axis at the origin, -Z north) with the Google Earth turbine cut out, and are
drawn by `src/components/turbine/SiteSplat.tsx`. Pass `site={false}` to `Turbine3D` to hide them.

## Configuration

Copy `.env.example` to `.env.local`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ACE_API_BASE_URL` | `https://ace-api.duckdns.org` | Upstream ACE API (server only) |
| `NEXT_PUBLIC_HOUSEHOLD_KWH_PER_YEAR` | `2500` | Household use for "homes powered" (Ofgem TDCV) |
| `NEXT_PUBLIC_COMMUNITY_FUND_GBP_PER_KWH` | *(unset)* | Shows the community-fund card when set; otherwise lifetime energy is shown |

## Environment notes

The app fetches live data through the project’s API routes rather than directly from the browser, so it avoids client-side CORS and mixed-content issues.

## License

MIT
