/**
 * Community Value Translation Engine.
 * Turns raw turbine output (kW) into benefits residents can picture.
 * All factors are published as constants so they can be audited and updated.
 */

import type { HistorySeries, LiveSnapshot } from "@/services/aceApi";
import { RATED_POWER_KW } from "@/services/aceApi";

/** Average UK household: ~3,900 kWh/year ÷ 8,760 h ≈ 0.45 kW continuous. */
export const UK_HOUSEHOLD_AVG_KW = 0.45;
/** UK National Grid displacement average, kg CO2 per kWh. */
export const GRID_CARBON_KG_PER_KWH = 0.21;
/** Typical UK kettle element rating. */
export const KETTLE_KW = 2.5;
/** Typical UK EV efficiency (~0.29 kWh per mile). */
export const EV_MILES_PER_KWH = 3.5;
/** Energy to fully charge a typical smartphone. */
export const PHONE_CHARGE_KWH = 0.015;
/** A typical 10 W LED bulb. */
export const LED_BULB_KW = 0.01;

/**
 * Estimated surplus flowing to Ambition Lawrence Weston per kWh generated.
 * Illustrative default — set NEXT_PUBLIC_COMMUNITY_FUND_GBP_PER_KWH to ACE's published figure.
 */
export const COMMUNITY_FUND_GBP_PER_KWH = (() => {
  const v = Number.parseFloat(process.env.NEXT_PUBLIC_COMMUNITY_FUND_GBP_PER_KWH ?? "");
  return Number.isFinite(v) && v >= 0 ? v : 0.01;
})();

const safe = (kw: number) => (Number.isFinite(kw) && kw > 0 ? kw : 0);

/** Homes powered right now = kW / 0.45 kW. */
export const homesPowered = (kw: number) => safe(kw) / UK_HOUSEHOLD_AVG_KW;

/** CO2 avoided per hour at the current output = kW × 0.21 kg/kWh. */
export const co2AvoidedKgPerHour = (kw: number) => safe(kw) * GRID_CARBON_KG_PER_KWH;

/** Kettles that could be boiling simultaneously = kW / 2.5 kW. */
export const kettlesBoiling = (kw: number) => safe(kw) / KETTLE_KW;

/** EV miles generated per hour of running at this output. */
export const evMilesPerHour = (kw: number) => safe(kw) * EV_MILES_PER_KWH;

/** Phone charges generated per hour of running at this output. */
export const phoneChargesPerHour = (kw: number) => safe(kw) / PHONE_CHARGE_KWH;

/** LED bulbs that could be lit right now. */
export const ledBulbsLit = (kw: number) => safe(kw) / LED_BULB_KW;

/** Estimated community fund generated per hour at this output (GBP). */
export const communityFundGbpPerHour = (kw: number) => safe(kw) * COMMUNITY_FUND_GBP_PER_KWH;

/** Estimated community fund for a given amount of energy (GBP). */
export const communityFundGbp = (kwh: number) => safe(kwh) * COMMUNITY_FUND_GBP_PER_KWH;

/** Share of the 4.2 MW rated capacity currently being produced (0–1). */
export const capacityShare = (kw: number) => Math.min(1, safe(kw) / RATED_POWER_KW);

export type EquivalentId = "kettles" | "ev" | "phones" | "bulbs";

export interface Equivalent {
  id: EquivalentId;
  value: number;
  label: string;
  unit: string;
}

export interface CommunityMetrics {
  powerKw: number;
  capacityShare: number;
  homesPowered: number;
  co2KgPerHour: number;
  fundGbpPerHour: number;
  /** Rolling 24 h figures (null until history has loaded). */
  energy24hKwh: number | null;
  co2Tonnes24h: number | null;
  fundGbp24h: number | null;
  equivalents: Equivalent[];
}

export function computeCommunityMetrics(
  live: Pick<LiveSnapshot, "activePowerKw"> | null | undefined,
  history?: Pick<HistorySeries, "energyKwh"> | null,
): CommunityMetrics {
  const kw = safe(live?.activePowerKw ?? 0);
  const energy24hKwh = history ? safe(history.energyKwh) : null;

  return {
    powerKw: kw,
    capacityShare: capacityShare(kw),
    homesPowered: homesPowered(kw),
    co2KgPerHour: co2AvoidedKgPerHour(kw),
    fundGbpPerHour: communityFundGbpPerHour(kw),
    energy24hKwh,
    co2Tonnes24h: energy24hKwh === null ? null : (energy24hKwh * GRID_CARBON_KG_PER_KWH) / 1000,
    fundGbp24h: energy24hKwh === null ? null : communityFundGbp(energy24hKwh),
    equivalents: [
      { id: "kettles", value: kettlesBoiling(kw), label: "kettles boiling at the same time", unit: "kettles" },
      { id: "ev", value: evMilesPerHour(kw), label: "electric car miles every hour", unit: "miles" },
      { id: "phones", value: phoneChargesPerHour(kw), label: "phone charges every hour", unit: "phones" },
      { id: "bulbs", value: ledBulbsLit(kw), label: "LED light bulbs lit right now", unit: "bulbs" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Plain-English helpers                                               */
/* ------------------------------------------------------------------ */

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const COMPASS_NAMES: Record<(typeof COMPASS)[number], string> = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
};

export function compassPoint(deg: number) {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  const short = COMPASS[idx];
  return { short, long: COMPASS_NAMES[short] };
}

/** Beaufort-scale description of a wind speed. */
export function describeWind(ms: number): string {
  const scale: Array<[number, string]> = [
    [0.5, "Calm"],
    [1.6, "Light air"],
    [3.4, "Light breeze"],
    [5.5, "Gentle breeze"],
    [8.0, "Moderate breeze"],
    [10.8, "Fresh breeze"],
    [13.9, "Strong breeze"],
    [17.2, "Near gale"],
    [20.8, "Gale"],
    [24.5, "Strong gale"],
  ];
  return scale.find(([max]) => ms < max)?.[1] ?? "Storm";
}
