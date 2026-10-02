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

## Environment notes

The app fetches live data through the project’s API routes rather than directly from the browser, so it avoids client-side CORS and mixed-content issues.

## License

MIT
