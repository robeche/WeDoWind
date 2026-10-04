/**
 * ACE (Ambition Community Energy) open data API client.
 * Data licence: CC-BY-4.0 — cite https://doi.org/10.5281/zenodo.22662372
 *
 * Server functions (fetchUpstream*) are used by the Next.js proxy routes in /api/ace/*.
 * Browser functions (getLive / getHistory) only ever call the same-origin proxy.
 */

export const ACE_API_BASE_URL = process.env.ACE_API_BASE_URL ?? "https://ace-api.duckdns.org";
export const ACE_SITE_ID = "ace";
export const ACE_TURBINE_ASSET_ID = "wec-1";
export const RATED_POWER_KW = 4200;

const UPSTREAM_TIMEOUT_MS = 6000;
export const STALE_AFTER_MS = 5 * 60 * 1000;
const USER_AGENT = "ACE-Community-Kiosk/1.0 (WeDoWind Challenge 5)";

/* ------------------------------------------------------------------ */
/* Upstream (raw) response types — mirrors /openapi.json v0.7.0        */
/* ------------------------------------------------------------------ */

export interface AceAttribution {
  dataset: string;
  license: string;
  license_url: string;
  attribution: string;
  citation_doi: string;
  citation_url: string;
  citation_instruction: string;
  project: string;
  project_url: string;
}

export interface AcePageMetadata {
  points: number;
  has_more: boolean;
  next_cursor?: string | null;
}

export interface AceFieldMetadata {
  name: string;
  display_name: string;
  unit?: string | null;
  description: string;
  native_name: string;
  native_index: number;
}

export interface AceDataResponse {
  site: string;
  asset?: string | null;
  family: string;
  resolution: string;
  resolution_seconds: number | null;
  poll_interval_seconds?: number | null;
  /** Unix epoch in microseconds. */
  timestamps: number[];
  series: Record<string, Array<number | null>>;
  quality: Array<string | null>;
  series_quality?: Record<string, Array<string | null>> | null;
  series_observed_at?: Record<string, Array<number | null>> | null;
  collection_timestamps?: number[] | null;
  fields: AceFieldMetadata[];
  page: AcePageMetadata;
  attribution: AceAttribution;
}

export interface AceStatusEventValues {
  main_status?: number;
  substatus?: number;
  fault_message_flag?: number;
  information?: number;
  additional_information?: number;
  warning_message_flag?: number;
  service_flag?: number;
  [key: string]: unknown;
}

export interface AceEventRecord {
  /** Unix epoch in microseconds. */
  observed_at: number;
  values: AceStatusEventValues;
  quality?: string | null;
}

export interface AceEventResponse {
  site: string;
  asset?: string | null;
  event_family: string;
  events: AceEventRecord[];
  page: AcePageMetadata;
  attribution: AceAttribution;
}

/* ------------------------------------------------------------------ */
/* Normalised kiosk types                                              */
/* ------------------------------------------------------------------ */

export type TurbineStatus = "Generating" | "Idling" | "Standby" | "Maintenance" | "Paused";

export interface TurbineStatusCode {
  main: number;
  sub: number;
  fault: boolean;
  service: boolean;
  observedAt: string;
}

export interface LiveSnapshot {
  /** ISO time of the SCADA observation. */
  observedAt: string;
  /** ISO time the proxy fetched the data. */
  fetchedAt: string;
  activePowerKw: number;
  rotorSpeedRpm: number;
  windSpeedMs: number;
  /** Direction the wind blows FROM, degrees clockwise from north. */
  windDirectionDeg: number;
  /** Nacelle heading (direction the rotor faces), degrees clockwise from north. */
  nacelleYawDeg: number;
  /** Wind vane angle relative to the nacelle, degrees. */
  vaneRelativeDeg: number;
  /** Lifetime exported energy counter, kWh. */
  energyExportedKwh: number | null;
  status: TurbineStatus;
  statusCode: TurbineStatusCode | null;
  /** True when the SCADA observation itself is older than 5 minutes. */
  scadaStale: boolean;
}

export interface HistoryPoint {
  /** Epoch milliseconds. */
  t: number;
  powerKw: number | null;
  windSpeedMs: number | null;
}

export interface HistorySeries {
  hours: number;
  resolutionSeconds: number;
  points: HistoryPoint[];
  /** Energy generated over the window, kWh (turbine energy counter; falls back to integrating 10-minute means). */
  energyKwh: number;
  /** How energyKwh was obtained. */
  energySource: "counter" | "integrated";
  fetchedAt: string;
}

export class AceApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AceApiError";
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const LIVE_FIELDS = [
  "wec_active_power",
  "wec_rotor_speed",
  "wec_wind_speed",
  "wec_wind_direction",
  "wec_nacelle_position",
  "wec_energy_exported",
] as const;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const normaliseDeg = (deg: number): number => ((deg % 360) + 360) % 360;

const microsToIso = (us: number): string => new Date(us / 1000).toISOString();

function lastValue(series: Array<number | null> | undefined): number | null {
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (isFiniteNumber(v)) return v;
  }
  return null;
}

async function upstreamJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, ACE_API_BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new AceApiError(`ACE API ${res.status} for ${url.pathname}`, res.status);
  return (await res.json()) as T;
}

export function deriveStatus(input: {
  activePowerKw: number;
  rotorSpeedRpm: number;
  windSpeedMs: number;
  statusCode: TurbineStatusCode | null;
}): TurbineStatus {
  const { activePowerKw, rotorSpeedRpm, windSpeedMs, statusCode } = input;
  if (activePowerKw > 10) return "Generating";
  if (statusCode?.service) return "Maintenance";
  if (rotorSpeedRpm > 0.5) return "Idling";
  // ENERCON cut-in is ~2.5 m/s; below that a stopped rotor is simply waiting for wind.
  if (windSpeedMs < 3) return "Standby";
  if (statusCode && (statusCode.fault || statusCode.main !== 0)) return "Paused";
  return "Standby";
}

function pickLatestStatus(events: AceEventRecord[]): TurbineStatusCode | null {
  if (!events.length) return null;
  const newest = Math.max(...events.map((e) => e.observed_at));
  const current = events.filter((e) => e.observed_at === newest);
  const num = (v: unknown) => (isFiniteNumber(v) ? v : 0);
  return {
    main: num(current[0].values.main_status),
    sub: num(current[0].values.substatus),
    fault: current.some((e) => num(e.values.fault_message_flag) === 1),
    service: current.some((e) => num(e.values.service_flag) === 1),
    observedAt: microsToIso(newest),
  };
}

/* ------------------------------------------------------------------ */
/* Server-side upstream calls (used by the proxy route handlers)       */
/* ------------------------------------------------------------------ */

export async function fetchUpstreamLive(): Promise<LiveSnapshot> {
  const assetBase = `/v1/sites/${ACE_SITE_ID}/assets/${ACE_TURBINE_ASSET_ID}`;

  const [dataResult, statusResult] = await Promise.allSettled([
    upstreamJson<AceDataResponse>(`${assetBase}/data/wec_instantaneous/latest`, {
      resolution: "1s",
      fields: LIVE_FIELDS.join(","),
      limit: "5",
    }),
    upstreamJson<AceEventResponse>(`${assetBase}/events/status/latest`, { limit: "10" }),
  ]);

  if (dataResult.status === "rejected") throw dataResult.reason;
  const data = dataResult.value;

  const power = lastValue(data.series?.wec_active_power);
  const rpm = lastValue(data.series?.wec_rotor_speed);
  const wind = lastValue(data.series?.wec_wind_speed);
  const nacelle = lastValue(data.series?.wec_nacelle_position);
  const vane = lastValue(data.series?.wec_wind_direction);
  const latestTs = data.timestamps?.length ? data.timestamps[data.timestamps.length - 1] : null;

  if (power === null || rpm === null || wind === null || nacelle === null || latestTs === null) {
    throw new AceApiError("ACE API returned an incomplete live record");
  }

  // Status events are optional: a failure there must not blank the display.
  const statusCode =
    statusResult.status === "fulfilled" ? pickLatestStatus(statusResult.value.events ?? []) : null;

  const activePowerKw = Math.max(0, power);
  const rotorSpeedRpm = Math.max(0, rpm);
  const windSpeedMs = Math.max(0, wind);
  const vaneRelativeDeg = vane ?? 0;
  const observedMs = latestTs / 1000;

  return {
    observedAt: new Date(observedMs).toISOString(),
    fetchedAt: new Date().toISOString(),
    activePowerKw,
    rotorSpeedRpm,
    windSpeedMs,
    // ENERCON "Vane" is measured relative to the nacelle axis.
    windDirectionDeg: normaliseDeg(nacelle + vaneRelativeDeg),
    nacelleYawDeg: normaliseDeg(nacelle),
    vaneRelativeDeg,
    energyExportedKwh: lastValue(data.series?.wec_energy_exported),
    status: deriveStatus({ activePowerKw, rotorSpeedRpm, windSpeedMs, statusCode }),
    statusCode,
    scadaStale: Date.now() - observedMs > STALE_AFTER_MS,
  };
}

export async function fetchUpstreamHistory(hours: number): Promise<HistorySeries> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const path = `/v1/sites/${ACE_SITE_ID}/assets/${ACE_TURBINE_ASSET_ID}/data/wecstd/range`;

  const points: HistoryPoint[] = [];
  const counter: Array<{ t: number; kwh: number }> = [];
  let resolutionSeconds = 600;
  let cursor: string | null | undefined;

  for (let page = 0; page < 5; page++) {
    const params: Record<string, string> = {
      resolution: "10m",
      fields: "active_power_mean,wind_speed_mean,energy_produced",
      start: start.toISOString(),
      end: end.toISOString(),
      page_size: "500",
    };
    if (cursor) params.cursor = cursor;

    const res = await upstreamJson<AceDataResponse>(path, params);
    resolutionSeconds = res.resolution_seconds ?? resolutionSeconds;
    const p = res.series?.active_power_mean ?? [];
    const w = res.series?.wind_speed_mean ?? [];
    const e = res.series?.energy_produced ?? [];
    res.timestamps.forEach((ts, i) => {
      if (isFiniteNumber(e[i])) counter.push({ t: ts / 1000, kwh: e[i] as number });
      points.push({
        t: ts / 1000,
        powerKw: isFiniteNumber(p[i]) ? Math.max(0, p[i] as number) : null,
        windSpeedMs: isFiniteNumber(w[i]) ? (w[i] as number) : null,
      });
    });

    if (!res.page?.has_more || !res.page.next_cursor) break;
    cursor = res.page.next_cursor;
  }

  points.sort((a, b) => a.t - b.t);
  counter.sort((a, b) => a.t - b.t);

  // Preferred: difference of the turbine's cumulative "energy produced" counter. It is exact and
  // unaffected by gaps in the 10-minute means. Fall back to integration if the counter is missing,
  // covers less than 80 % of the window, or looks implausible (reset / > rated power).
  const hoursPerPoint = resolutionSeconds / 3600;
  const integrated = points.reduce((sum, pt) => sum + (pt.powerKw ?? 0) * hoursPerPoint, 0);
  let energyKwh = integrated;
  let energySource: HistorySeries["energySource"] = "integrated";
  if (counter.length >= 2) {
    const first = counter[0];
    const last = counter[counter.length - 1];
    const delta = last.kwh - first.kwh;
    const spanH = (last.t - first.t) / 3_600_000;
    if (delta >= 0 && spanH >= hours * 0.8 && delta <= RATED_POWER_KW * spanH * 1.05) {
      energyKwh = delta;
      energySource = "counter";
    }
  }

  return { hours, resolutionSeconds, points, energyKwh, energySource, fetchedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Browser-side calls (same-origin proxy — no CORS / mixed content)    */
/* ------------------------------------------------------------------ */

async function proxyJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new AceApiError(`Proxy error ${res.status}`, res.status);
  return (await res.json()) as T;
}

export const getLive = (signal?: AbortSignal) => proxyJson<LiveSnapshot>("/api/ace/live", signal);

export const getHistory = (hours = 24, signal?: AbortSignal) =>
  proxyJson<HistorySeries>(`/api/ace/history?hours=${encodeURIComponent(hours)}`, signal);
