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

## Demo mode

After 30 s without any input on the live 3D view (touch, mouse, keyboard or wheel), the kiosk starts
a guided tour: it opens the tower, nacelle, generator, hub and blades in turn and selects every
component inside each one, staying on each for 4.5–9 s (2 s camera flight plus time scaled to its panel
text), with the overview in between. The first input ends it.

Tap the clock (top right) to start or stop the tour by hand and to choose the time on each
component: Auto (above) or a fixed 4, 6, 10, 15 or 20 s; the choice is remembered on that screen.
A tour started from the menu ignores plain mouse movement and ends on a click, touch or key. The data tabs are not part of the tour; they return to the live
view after 3 minutes without input, as before. Tour order and timing: `src/components/turbine/demoTour.ts`;
idle time: `DEMO_IDLE_MS` in `src/app/page.tsx`.

## Charts

Every chart in the "Last hours" and "10-min statistics" tabs can be zoomed by window: drag across
the plot (mouse, pen or finger) to draw a selection and release to zoom into it — a time span on
time and bar charts, a rectangle on the power curve; repeat to zoom further, double-click or the ↺
button to reset; on time charts the zoom is shared by all the
charts of the tab, like the hover readout. The ⓘ button explains each figure (what it shows, why it
matters, what to look for) and ⤢ opens it full screen with the explanation alongside. Texts:
`src/components/charts/chartInfo.ts`.

## Static build (GitHub Pages)

The kiosk can also run with no server at all, e.g. on GitHub Pages:

```bash
npm run build:static        # → out/, served from /WeDoWind/ (BASE_PATH="" for a domain root)
```

In this build the `/api/ace/*` proxy routes are left out (a static host cannot run them) and the
browser calls the ACE API directly, which serves CORS headers for any origin. Everything else is
identical to the server build.

`.github/workflows/pages.yml` publishes it automatically on every push to `master`. One-time
setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site
is then at https://robeche.github.io/WeDoWind/. Optional `NEXT_PUBLIC_*` settings (see
Configuration) can be set as repository *variables*.

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

The server build (Vercel, `npm start`) fetches live data through the project’s API routes, which cache upstream requests shared by every screen. The static build (GitHub Pages) has no server, so each browser calls the ACE API directly.

## License

MIT
