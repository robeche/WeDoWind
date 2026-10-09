/**
 * Time series for the "Last hours" and "10-minute statistics" tabs (server side).
 *
 * ACE API limits (checked October 2026): page sizes up to 1000 records at 1 s, 2000 at 60 s and
 * 5000 at 10 min. Retention: 1 s ≈ 1 month, 60 s ≈ 2½ months, 10-minute statistics since
 * 21 July 2026 (≈ 90 days rolling).
 */

import { ASSET_BASE, PLAUSIBLE_TEMP_C, RATED_POWER_KW, normaliseDeg, upstreamJson, type AceDataResponse } from "./aceApi";

export type TrendWindow = "1h" | "6h" | "24h";
export const TREND_WINDOWS: TrendWindow[] = ["1h", "6h", "24h"];
export type StatsRange = 7 | 30 | 90;
export const STATS_RANGES: StatsRange[] = [7, 30, 90];

/** Column-oriented series: `t` in epoch ms, one array per field (null = missing). */
export interface SeriesTable<K extends string> {
  t: number[];
  series: Record<K, Array<number | null>>;
  resolutionSeconds: number;
  from: string;
  to: string;
  fetchedAt: string;
}

export type TrendField = "power" | "wind" | "rotor" | "nacelle" | "windFrom" | "reactive" | "frequency";
export type TrendData = SeriesTable<TrendField> & { window: TrendWindow };

export type StatsField =
  | "powerMean"
  | "powerMin"
  | "powerMax"
  | "windMean"
  | "windMin"
  | "windMax"
  | "rotorMean"
  | "bladeAngle"
  | "genWinding1"
  | "genWinding2"
  | "outsideTemp"
  | "transformerTemp";

export interface DailyEnergy {
  /** UK calendar day, YYYY-MM-DD. */
  day: string;
  /** Today: the day is not over yet. */
  partial: boolean;
  mwh: number;
  /** Share of the turbine's 4.2 MW × 24 h maximum. */
  capacityFactor: number;
}

export type StatsData = SeriesTable<StatsField> & { days: StatsRange; daily: DailyEnergy[] };

/* ------------------------------------------------------------------ */
/* Paged range fetch                                                   */
/* ------------------------------------------------------------------ */

// Moderate pages keep each upstream request well inside the timeout (a 5000-record 10-minute
// page with nine fields can take several seconds).
const PAGE_SIZE: Record<string, number> = { "1s": 1000, "60s": 2000, "10m": 2500 };
const MAX_PAGES = 12;
const RANGE_TIMEOUT_MS = 20_000;

interface RangeResult {
  t: number[];
  series: Record<string, Array<number | null>>;
}

async function fetchRange(family: string, resolution: string, fields: string[], start: Date, end: Date): Promise<RangeResult> {
  const t: number[] = [];
  const series: Record<string, Array<number | null>> = Object.fromEntries(fields.map((f) => [f, []]));
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      resolution,
      fields: fields.join(","),
      start: start.toISOString(),
      end: end.toISOString(),
      page_size: String(PAGE_SIZE[resolution] ?? 1000),
    };
    if (cursor) params.cursor = cursor;
    const res = await upstreamJson<AceDataResponse>(`${ASSET_BASE}/data/${family}/range`, params, RANGE_TIMEOUT_MS);
    res.timestamps.forEach((ts, i) => {
      t.push(ts / 1000);
      for (const f of fields) {
        const v = res.series?.[f]?.[i];
        series[f].push(typeof v === "number" && Number.isFinite(v) ? v : null);
      }
    });
    if (!res.page?.has_more || !res.page.next_cursor) break;
    cursor = res.page.next_cursor;
  }
  return { t, series };
}

/** Small promise cache per key; failures are never cached. */
function cached<T>(ttlMs: (key: string) => number, load: (key: string) => Promise<T>) {
  const entries = new Map<string, { at: number; promise: Promise<T> }>();
  return (key: string) => {
    const now = Date.now();
    const hit = entries.get(key);
    if (hit && now - hit.at < ttlMs(key)) return hit.promise;
    const promise = load(key);
    const entry = { at: now, promise };
    entries.set(key, entry);
    promise.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return promise;
  };
}

/* ------------------------------------------------------------------ */
/* Last hours (instantaneous data)                                     */
/* ------------------------------------------------------------------ */

const WINDOW_HOURS: Record<TrendWindow, number> = { "1h": 1, "6h": 6, "24h": 24 };

const loadTrends = cached<TrendData>(
  (key) => (key === "1h" ? 15_000 : 60_000),
  async (key) => {
    const window = key as TrendWindow;
    const end = new Date();
    const start = new Date(end.getTime() - WINDOW_HOURS[window] * 3600_000);
    // Full 1-second detail for the last hour; 1-minute values for 6 h and 24 h.
    const resolution = window === "1h" ? "1s" : "60s";
    const fields = [
      "wec_active_power",
      "wec_wind_speed",
      "wec_rotor_speed",
      "wec_nacelle_position",
      "wec_wind_direction",
      "wec_reactive_power",
      "wec_frequency",
    ];
    const r = await fetchRange("wec_instantaneous", resolution, fields, start, end);
    const nacelle = r.series.wec_nacelle_position;
    const vane = r.series.wec_wind_direction;
    return {
      window,
      t: r.t,
      series: {
        power: r.series.wec_active_power.map((v) => (v === null ? null : Math.max(0, v))),
        wind: r.series.wec_wind_speed,
        rotor: r.series.wec_rotor_speed,
        nacelle: nacelle.map((v) => (v === null ? null : normaliseDeg(v))),
        // ENERCON "wind direction" is the vane angle relative to the nacelle.
        windFrom: nacelle.map((n, i) => (n === null || vane[i] === null ? null : normaliseDeg(n + (vane[i] as number)))),
        reactive: r.series.wec_reactive_power,
        frequency: r.series.wec_frequency,
      },
      resolutionSeconds: window === "1h" ? 1 : 60,
      from: start.toISOString(),
      to: end.toISOString(),
      fetchedAt: new Date().toISOString(),
    };
  },
);

export const fetchUpstreamTrends = (window: TrendWindow) => loadTrends(window);

/* ------------------------------------------------------------------ */
/* 10-minute statistics                                                */
/* ------------------------------------------------------------------ */

const UK_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Daily energy from the cumulative "energy produced" counter (differences of day-end readings).
 * The first day of the window is only partly covered, so it is dropped; today is marked partial.
 */
function dailyEnergy(t: number[], counter: Array<number | null>): DailyEnergy[] {
  const dayEnd = new Map<string, number>();
  const order: string[] = [];
  t.forEach((ms, i) => {
    const v = counter[i];
    if (v === null) return;
    const day = UK_DAY.format(new Date(ms));
    if (!dayEnd.has(day)) order.push(day);
    dayEnd.set(day, v);
  });
  const out: DailyEnergy[] = [];
  const today = UK_DAY.format(new Date());
  let prev: number | null = null;
  for (const day of order) {
    const end = dayEnd.get(day)!;
    const kwh = prev === null ? null : end - prev;
    prev = end;
    // Skip resets / implausible jumps (more than the turbine could make in a day).
    if (kwh === null || kwh < 0 || kwh > RATED_POWER_KW * 24 * 1.05) continue;
    out.push({ day, partial: day === today, mwh: kwh / 1000, capacityFactor: kwh / (RATED_POWER_KW * 24) });
  }
  return out;
}

const loadStats = cached<StatsData>(
  () => 10 * 60_000,
  async (key) => {
    const days = Number(key) as StatsRange;
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const [std, temps] = await Promise.all([
      fetchRange(
        "wecstd",
        "10m",
        [
          "active_power_mean",
          "active_power_min",
          "active_power_max",
          "wind_speed_mean",
          "wind_speed_min",
          "wind_speed_max",
          "rotor_speed_mean",
          "blade_angle_mean",
          "energy_produced",
        ],
        start,
        end,
      ),
      // Temperatures are optional: a failure here must not lose the whole tab.
      fetchRange(
        "tep3c021",
        "10m",
        ["rotor_1_temperature_mean", "rotor_2_temperature_mean", "outside_hub_height_temperature_mean", "transformer_temperature_mean"],
        start,
        end,
      ).catch(() => ({ t: [], series: {} as Record<string, Array<number | null>> })),
    ]);
    // Align temperatures on the wecstd timestamps.
    const tempAt = new Map<number, number>();
    temps.t.forEach((ms, i) => tempAt.set(ms, i));
    const plausible = (v: number | null | undefined) =>
      typeof v === "number" && v >= PLAUSIBLE_TEMP_C[0] && v <= PLAUSIBLE_TEMP_C[1] ? v : null;
    const temp = (field: string) =>
      std.t.map((ms) => {
        const i = tempAt.get(ms);
        return i === undefined ? null : plausible(temps.series[field]?.[i]);
      });
    const clamp0 = (a: Array<number | null>) => a.map((v) => (v === null ? null : Math.max(0, v)));
    return {
      days,
      t: std.t,
      series: {
        powerMean: clamp0(std.series.active_power_mean),
        powerMin: clamp0(std.series.active_power_min),
        powerMax: clamp0(std.series.active_power_max),
        windMean: std.series.wind_speed_mean,
        windMin: std.series.wind_speed_min,
        windMax: std.series.wind_speed_max,
        rotorMean: std.series.rotor_speed_mean,
        bladeAngle: std.series.blade_angle_mean,
        genWinding1: temp("rotor_1_temperature_mean"),
        genWinding2: temp("rotor_2_temperature_mean"),
        outsideTemp: temp("outside_hub_height_temperature_mean"),
        transformerTemp: temp("transformer_temperature_mean"),
      },
      daily: dailyEnergy(std.t, std.series.energy_produced),
      resolutionSeconds: 600,
      from: start.toISOString(),
      to: end.toISOString(),
      fetchedAt: new Date().toISOString(),
    };
  },
);

export const fetchUpstreamStats = (days: StatsRange) => loadStats(String(days));
