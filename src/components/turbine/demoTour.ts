/**
 * Self-running tour for the kiosk's demo mode: the overview, then every openable part followed by
 * each component inside it, back to the overview between parts. Each stop stays on screen long
 * enough to read its panel text.
 */

import { OPEN_CHILDREN, PART_INFO, type OpenableId, type PartId } from "./parts";

/** `null` = the overview (nothing selected, the camera back on its slow orbit). */
export type DemoStep = PartId | null;

const ORDER: OpenableId[] = ["tower", "nacelle", "generator", "hub", "blades"];

export const DEMO_STEPS: DemoStep[] = ORDER.flatMap((part) => [part, ...OPEN_CHILDREN[part], null]);

/** Overview pause, and the time the camera needs to fly to a new view. */
const OVERVIEW_MS = 12_000;
const FLIGHT_MS = 2_000;
/** Pace at which the panel text is given time on screen (characters per second). */
const READ_CPS = 28;
/** Time on each part, after the flight. */
const MIN_READ_MS = 2_500;
const MAX_READ_MS = 7_000;

/** Choices offered in the kiosk menu: time on each component, `null` = automatic. */
export const DEMO_DWELL_OPTIONS: Array<{ label: string; ms: number | null }> = [
  { label: "Auto", ms: null },
  { label: "4 s", ms: 4_000 },
  { label: "6 s", ms: 6_000 },
  { label: "10 s", ms: 10_000 },
  { label: "15 s", ms: 15_000 },
  { label: "20 s", ms: 20_000 },
];

/** Pause before the first stop. */
export const DEMO_START_MS = 1_500;

/**
 * How long to stay on a step. Automatic: the flight, then time scaled to the panel text, with a
 * 12 s overview between parts. Fixed (`fixedMs`): that time on every component, flight included,
 * and on the overview too.
 */
export function demoDwellMs(step: DemoStep, fixedMs: number | null = null): number {
  if (fixedMs !== null) return Math.max(FLIGHT_MS + 1_000, fixedMs);
  if (step === null) return OVERVIEW_MS;
  const info = PART_INFO[step];
  const text = info.opens ? `${info.name} ${info.intro ?? info.description}` : `${info.name} ${info.description}`;
  const read = (text.length / READ_CPS) * 1000;
  return FLIGHT_MS + Math.min(MAX_READ_MS, Math.max(MIN_READ_MS, read));
}
