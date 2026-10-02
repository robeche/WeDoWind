/** Lawrence Weston, Bristol. */
export const SITE_LAT = 51.503;
export const SITE_LON = -2.683;
export const UK_TIME_ZONE = "Europe/London";

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397;

export interface SunPosition {
  /** Degrees above the horizon (negative = below). */
  elevationDeg: number;
  /** Bearing from north, clockwise, degrees. */
  azimuthDeg: number;
}

/** Low-cost solar position (SunCalc / NOAA approximation, ~0.5° accuracy). */
export function sunPosition(date: Date, lat = SITE_LAT, lon = SITE_LON): SunPosition {
  const d = date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;

  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra;
  const phi = RAD * lat;

  const elevation = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuthFromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

  return {
    elevationDeg: elevation / RAD,
    azimuthDeg: (((azimuthFromSouth / RAD + 180) % 360) + 360) % 360,
  };
}

export type DayPhase = "day" | "sunset" | "night";

export function dayPhase(elevationDeg: number): DayPhase {
  if (elevationDeg > 8) return "day";
  if (elevationDeg > -6) return "sunset";
  return "night";
}

export function formatUkTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatUkDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
