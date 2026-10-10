/**
 * Live SCADA signals shown in small boxes floating beside the components while a part is open.
 * Values come from the ACE open data API (CC-BY-4.0); any of them may be missing.
 */

import { RATED_POWER_KW, type LiveSnapshot, type TemperatureId } from "@/services/aceApi";
import { NACELLE_STRETCH, ROTOR_RADIUS, ROTOR_Z } from "./dimensions";
import { PART_INFO, type Focus, type OpenableId, type PartId } from "./parts";

export type SignalId =
  | "power"
  | "capacity"
  | "rotorSpeed"
  | "torque"
  | "tipSpeed"
  | "pitch"
  | "windSpeed"
  | "windFrom"
  | "heading"
  | "yawError"
  | "reactivePower"
  | "powerFactor"
  | "voltage"
  | "current"
  | "frequency"
  | "operatingHours"
  | `temp:${TemperatureId}`;

export interface SignalSpec {
  id: SignalId;
  label: string;
  unit: string;
  digits: number;
  read: (s: LiveSnapshot) => number | null;
  /** Hide the tile when the value is missing (optional sensors), instead of showing "—". */
  optional?: boolean;
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const temp = (id: TemperatureId, label: string): SignalSpec => ({
  id: `temp:${id}`,
  label,
  unit: "°C",
  digits: 0,
  read: (s) => num(s.signals?.temperatures[id]),
  optional: true,
});

const SPECS: Record<Exclude<SignalId, `temp:${string}`>, SignalSpec> = {
  power: { id: "power", label: "Power", unit: "kW", digits: 0, read: (s) => s.activePowerKw },
  capacity: {
    id: "capacity",
    label: "Of its 4.2 MW maximum",
    unit: "%",
    digits: 0,
    read: (s) => Math.min(100, (s.activePowerKw / RATED_POWER_KW) * 100),
  },
  rotorSpeed: { id: "rotorSpeed", label: "Rotor speed", unit: "rpm", digits: 1, read: (s) => s.rotorSpeedRpm },
  torque: {
    id: "torque",
    label: "Torque (calc.)",
    unit: "kN·m",
    digits: 0,
    // Direct drive: generator speed = rotor speed. T = P / ω (electrical, so a slight underestimate).
    read: (s) => (s.rotorSpeedRpm > 0.5 ? (s.activePowerKw * 1000) / ((s.rotorSpeedRpm * 2 * Math.PI) / 60) / 1000 : 0),
  },
  tipSpeed: {
    id: "tipSpeed",
    label: "Tip speed (calc.)",
    unit: "km/h",
    digits: 0,
    read: (s) => ((s.rotorSpeedRpm * 2 * Math.PI) / 60) * ROTOR_RADIUS * 3.6,
  },
  pitch: { id: "pitch", label: "Pitch angle", unit: "°", digits: 1, read: (s) => num(s.signals?.bladeAngleDeg) },
  windSpeed: { id: "windSpeed", label: "Wind speed", unit: "m/s", digits: 1, read: (s) => s.windSpeedMs },
  windFrom: { id: "windFrom", label: "Wind from", unit: "°", digits: 0, read: (s) => s.windDirectionDeg },
  heading: { id: "heading", label: "Nacelle heading", unit: "°", digits: 0, read: (s) => s.nacelleYawDeg },
  yawError: { id: "yawError", label: "Yaw misalignment", unit: "°", digits: 1, read: (s) => s.vaneRelativeDeg },
  reactivePower: { id: "reactivePower", label: "Reactive power", unit: "kvar", digits: 0, read: (s) => num(s.signals?.reactivePowerKvar) },
  powerFactor: { id: "powerFactor", label: "Power factor", unit: "", digits: 3, read: (s) => num(s.signals?.powerFactor) },
  voltage: { id: "voltage", label: "Voltage (LV)", unit: "V", digits: 0, read: (s) => num(s.signals?.voltageV) },
  current: { id: "current", label: "Grid current", unit: "A", digits: 0, read: (s) => num(s.signals?.currentA) },
  frequency: { id: "frequency", label: "Grid frequency", unit: "Hz", digits: 2, read: (s) => num(s.signals?.frequencyHz) },
  operatingHours: { id: "operatingHours", label: "Operating hours", unit: "h", digits: 0, read: (s) => num(s.signals?.operatingHours) },
};

/** Where a box points: a component (its focus target) or a named point in one of the scene frames. */
type Anchor = PartId | { name: string; focus: Focus };

interface SignalGroupSpec {
  at: Anchor;
  /** Box title; defaults to the component's name. */
  title?: string;
  /** Preferred screen direction of the box from its anchor (degrees, 0 = right, 90 = up). */
  dir?: number;
  signals: SignalSpec[];
}

/** Anemometer / wind vane on the rear of the nacelle roof (nacelle frame). */
const ANEMOMETER: Anchor = { name: "Wind sensors", focus: { target: [0, 2.2, -3.4 - NACELLE_STRETCH / 2], distance: 0, elevationDeg: 0, frame: "nacelle" } };
/** Blade tip of the inspected blade (blade frame). */
const BLADE_TIP: Anchor = { name: "Blade tip", focus: { target: [0, ROTOR_RADIUS - 1.5, 0], distance: 0, elevationDeg: 0, frame: "blade" } };
/** Air outside the tower door (world frame). */
const OUTSIDE_BASE: Anchor = { name: "Outside", focus: { target: [0, 2.2, 4.2], distance: 0, elevationDeg: 0 } };

/** Points on the whole turbine for the overview boxes (nacelle frame, spread out so they read apart). */
const nacellePoint = (name: string, target: [number, number, number]): Anchor => ({
  name,
  focus: { target, distance: 0, elevationDeg: 0, frame: "nacelle" },
});

/** Boxes on the turbine while nobody is exploring: the headline machine signals. */
const OVERVIEW_GROUPS: SignalGroupSpec[] = [
  // Each box gets its own side of the turbine so they spread around it instead of bunching up.
  { at: nacellePoint("Rotor", [0, 0, ROTOR_Z + 2.8]), dir: 195, signals: [SPECS.rotorSpeed] },
  { at: nacellePoint("Blade pitch", [0, 30, ROTOR_Z]), dir: 140, signals: [SPECS.pitch] },
  { at: nacellePoint("Generator", [0, 3.2, ROTOR_Z - 1.8]), dir: 40, signals: [SPECS.power, SPECS.capacity] },
  { at: nacellePoint("Nacelle direction", [0, 1.6, -3.5 - NACELLE_STRETCH]), dir: -25, signals: [SPECS.heading, SPECS.yawError] },
];

/** One floating box per component, for each opened part. */
export const PART_SIGNAL_GROUPS: Record<OpenableId, SignalGroupSpec[]> = {
  generator: [
    { at: "stator", signals: [SPECS.power, SPECS.reactivePower, temp("coolingWater", "Cooling water")] },
    {
      at: "genRotor",
      signals: [SPECS.rotorSpeed, SPECS.torque, temp("genRotor1", "Winding 1"), temp("genRotor2", "Winding 2")],
    },
    { at: "axle", title: "Main bearings", signals: [temp("frontBearing", "Front"), temp("rearBearing", "Rear")] },
  ],
  hub: [
    { at: "pitchBearings", title: "Pitch", signals: [SPECS.pitch, SPECS.rotorSpeed] },
    {
      at: "bladeCabinets",
      signals: [temp("pitchCabinetA", "Cabinet A"), temp("pitchCabinetB", "Cabinet B"), temp("pitchCabinetC", "Cabinet C")],
    },
    { at: "hubCabinet", title: "Spinner", signals: [temp("spinner", "Air inside")] },
  ],
  blades: [
    { at: "bladeRoot", signals: [SPECS.rotorSpeed, SPECS.pitch] },
    { at: BLADE_TIP, signals: [SPECS.tipSpeed, SPECS.windSpeed] },
    { at: "bladeShell", title: "Blade sensors", signals: [temp("bladeA", "Blade A"), temp("bladeB", "Blade B"), temp("bladeC", "Blade C")] },
  ],
  nacelle: [
    { at: ANEMOMETER, signals: [SPECS.windSpeed, SPECS.windFrom, SPECS.yawError, temp("outsideHub", "Outside")] },
    { at: "yawDrives", signals: [SPECS.heading, temp("yawInverter", "Yaw inverter")] },
    { at: "mainCarrier", signals: [temp("mainCarrier", "Main carrier"), temp("nacelle", "Nacelle air")] },
    { at: "nacelleCabinets", signals: [temp("nacelleCabinet", "Cabinet")] },
    { at: "cooling", signals: [temp("coolingWater", "Cooling water"), temp("fanInverter", "Fan inverter")] },
  ],
  tower: [
    { at: "converter", signals: [SPECS.power, SPECS.reactivePower, temp("inverterMax", "Hottest inverter")] },
    { at: "transformer", signals: [temp("transformer", "Temperature"), SPECS.voltage, SPECS.current] },
    { at: "switchgear", title: "Grid connection", signals: [SPECS.frequency, SPECS.powerFactor] },
    { at: "controlCabinet", signals: [temp("controlCabinet", "Temperature"), SPECS.operatingHours] },
    { at: "platforms", title: "Inside the tower", signals: [temp("tower", "Air")] },
    { at: OUTSIDE_BASE, signals: [temp("outsideGround", "Air")] },
  ],
};

export interface SignalRow {
  id: SignalId;
  label: string;
  value: string;
  unit: string;
}

export interface SignalGroup {
  key: string;
  title: string;
  /** Point the box's leader line ends at (same frame conventions as a camera focus). */
  focus: Focus;
  /** The selected component's own box. */
  highlight: boolean;
  /** Preferred screen direction from the anchor (degrees, 0 = right, 90 = up). */
  dir?: number;
  rows: SignalRow[];
}

function format(spec: SignalSpec, v: number): { value: string; unit: string } {
  if (spec.id === "windFrom" || spec.id === "heading") return { value: `${Math.round(v)}° ${compass(v)}`, unit: "" };
  if (spec.id === "operatingHours") return { value: Math.round(v).toLocaleString("en-GB"), unit: spec.unit };
  return { value: v.toLocaleString("en-GB", { minimumFractionDigits: spec.digits, maximumFractionDigits: spec.digits }), unit: spec.unit };
}

/**
 * Floating boxes for the open part: one per component, listing its live signals. Optional
 * sensors with no (plausible) reading are left out, and a box with nothing left is dropped.
 */
export function signalGroups(openPart: OpenableId, selectedId: PartId | null, snapshot: LiveSnapshot | null): SignalGroup[] {
  return buildGroups(PART_SIGNAL_GROUPS[openPart], selectedId, snapshot);
}

/** Overview boxes on the turbine (rotor speed, pitch, power, nacelle direction). */
export function overviewSignalGroups(snapshot: LiveSnapshot | null): SignalGroup[] {
  return buildGroups(OVERVIEW_GROUPS, null, snapshot);
}

function buildGroups(specs: SignalGroupSpec[], selectedId: PartId | null, snapshot: LiveSnapshot | null): SignalGroup[] {
  const groups: SignalGroup[] = [];
  for (const g of specs) {
    const rows: SignalRow[] = [];
    for (const spec of g.signals) {
      const v = snapshot ? spec.read(snapshot) : null;
      if (v === null && spec.optional && snapshot) continue;
      rows.push({ id: spec.id, label: spec.label, ...(v === null ? { value: "—", unit: "" } : format(spec, v)) });
    }
    if (!rows.length) continue;
    const isPart = typeof g.at === "string";
    const focus = isPart ? PART_INFO[g.at as PartId].focus : (g.at as { focus: Focus }).focus;
    if (!focus) continue;
    groups.push({
      key: isPart ? (g.at as string) : (g.at as { name: string }).name,
      title: g.title ?? (isPart ? PART_INFO[g.at as PartId].name : (g.at as { name: string }).name),
      focus,
      highlight: isPart && selectedId === g.at,
      dir: g.dir,
      rows,
    });
  }
  return groups;
}
