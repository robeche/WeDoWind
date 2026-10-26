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
/** Comfortable reading speed for a public screen (characters per second). */
const READ_CPS = 14;

/** How long to stay on a step: the flight, then the time to read what the panel shows. */
export function demoDwellMs(step: DemoStep): number {
  if (step === null) return OVERVIEW_MS;
  const info = PART_INFO[step];
  const text = info.opens ? `${info.name} ${info.intro ?? info.description}` : `${info.name} ${info.description}`;
  const read = (text.length / READ_CPS) * 1000;
  return FLIGHT_MS + Math.min(16_000, Math.max(6_000, read));
}
