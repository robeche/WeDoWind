/**
 * Live SCADA signals shown as tiles on the component panels while a part is open.
 * Values come from the ACE open data API (CC-BY-4.0); any of them may be missing.
 */

import type { LiveSnapshot, TemperatureId } from "@/services/aceApi";
import { ROTOR_RADIUS } from "./dimensions";
import type { OpenableId, PartId } from "./parts";

export type SignalId =
  | "power"
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
  rotorSpeed: { id: "rotorSpeed", label: "Rotor speed", unit: "rpm", digits: 1, read: (s) => s.rotorSpeedRpm },
  torque: {
    id: "torque",
    label: "Torque",
    unit: "kN·m",
    digits: 0,
    // Direct drive: generator speed = rotor speed. T = P / ω (electrical, so a slight underestimate).
    read: (s) => (s.rotorSpeedRpm > 0.5 ? (s.activePowerKw * 1000) / ((s.rotorSpeedRpm * 2 * Math.PI) / 60) / 1000 : 0),
  },
  tipSpeed: {
    id: "tipSpeed",
    label: "Tip speed",
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

/** Tiles for each opened part, in display order. */
export const PART_SIGNALS: Record<OpenableId, SignalSpec[]> = {
  generator: [
    SPECS.power,
    SPECS.rotorSpeed,
    SPECS.torque,
    SPECS.reactivePower,
    temp("genRotor1", "Rotor winding 1"),
    temp("genRotor2", "Rotor winding 2"),
    temp("frontBearing", "Front bearing"),
    temp("rearBearing", "Rear bearing"),
    temp("coolingWater", "Cooling water"),
  ],
  hub: [
    SPECS.pitch,
    SPECS.rotorSpeed,
    SPECS.windSpeed,
    temp("spinner", "Spinner"),
    temp("pitchCabinetA", "Pitch cabinet A"),
    temp("pitchCabinetB", "Pitch cabinet B"),
    temp("pitchCabinetC", "Pitch cabinet C"),
  ],
  blades: [
    SPECS.rotorSpeed,
    SPECS.pitch,
    SPECS.tipSpeed,
    SPECS.windSpeed,
    temp("bladeA", "Blade A"),
    temp("bladeB", "Blade B"),
    temp("bladeC", "Blade C"),
  ],
  nacelle: [
    SPECS.windSpeed,
    SPECS.windFrom,
    SPECS.heading,
    SPECS.yawError,
    temp("nacelle", "Nacelle air"),
    temp("outsideHub", "Outside (hub)"),
    temp("mainCarrier", "Main carrier"),
    temp("nacelleCabinet", "Control cabinet"),
    temp("coolingWater", "Cooling water"),
    temp("fanInverter", "Fan inverter"),
    temp("yawInverter", "Yaw inverter"),
  ],
  tower: [
    SPECS.power,
    SPECS.reactivePower,
    SPECS.voltage,
    SPECS.current,
    SPECS.frequency,
    SPECS.powerFactor,
    temp("transformer", "Transformer"),
    temp("inverterMax", "Hottest inverter"),
    temp("controlCabinet", "Control cabinet"),
    temp("tower", "Tower air"),
    temp("outsideGround", "Outside (ground)"),
    SPECS.operatingHours,
  ],
};

/** Signals that belong to a specific inner component: highlighted (and listed first) when it is selected. */
export const PART_FOCUS_SIGNALS: Partial<Record<PartId, SignalId[]>> = {
  // Generator
  stator: ["power", "temp:coolingWater", "reactivePower"],
  genRotor: ["rotorSpeed", "torque", "temp:genRotor1", "temp:genRotor2"],
  airGap: ["torque", "power"],
  excitation: ["temp:genRotor1", "temp:genRotor2"],
  axle: ["temp:frontBearing", "temp:rearBearing", "rotorSpeed"],
  // Hub
  pitchBearings: ["pitch"],
  pitchMotors: ["pitch", "rotorSpeed"],
  bladeCabinets: ["temp:pitchCabinetA", "temp:pitchCabinetB", "temp:pitchCabinetC"],
  hubCabinet: ["temp:spinner", "pitch"],
  // Blades
  bladeRoot: ["pitch"],
  leadingEdge: ["tipSpeed"],
  sparCaps: ["rotorSpeed", "tipSpeed"],
  // Nacelle
  yawDrives: ["heading", "yawError", "windFrom", "temp:yawInverter"],
  nacelleCabinets: ["temp:nacelleCabinet"],
  cooling: ["temp:coolingWater", "temp:fanInverter", "temp:nacelle"],
  mainCarrier: ["temp:mainCarrier"],
  // Tower
  transformer: ["temp:transformer", "voltage", "power"],
  converter: ["temp:inverterMax", "current", "power", "reactivePower"],
  controlCabinet: ["temp:controlCabinet", "operatingHours"],
  switchgear: ["voltage", "current", "frequency"],
  cables: ["current", "power"],
};

export interface SignalTile {
  id: SignalId;
  label: string;
  value: string;
  unit: string;
  highlight: boolean;
}

function format(spec: SignalSpec, v: number): { value: string; unit: string } {
  if (spec.id === "windFrom" || spec.id === "heading") return { value: `${Math.round(v)}° ${compass(v)}`, unit: "" };
  if (spec.id === "operatingHours") return { value: Math.round(v).toLocaleString("en-GB"), unit: spec.unit };
  return { value: v.toLocaleString("en-GB", { minimumFractionDigits: spec.digits, maximumFractionDigits: spec.digits }), unit: spec.unit };
}

/** Tiles for the open part; the selected component's own signals are highlighted and moved to the front. */
export function signalTiles(openPart: OpenableId, selectedId: PartId | null, snapshot: LiveSnapshot | null): SignalTile[] {
  const focus = new Set(selectedId ? (PART_FOCUS_SIGNALS[selectedId] ?? []) : []);
  const tiles: SignalTile[] = [];
  for (const spec of PART_SIGNALS[openPart]) {
    const v = snapshot ? spec.read(snapshot) : null;
    if (v === null && spec.optional && snapshot) continue;
    const f = v === null ? { value: "—", unit: "" } : format(spec, v);
    tiles.push({ id: spec.id, label: spec.label, ...f, highlight: focus.has(spec.id) });
  }
  return [...tiles.filter((t) => t.highlight), ...tiles.filter((t) => !t.highlight)];
}
