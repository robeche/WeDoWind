/**
 * Catalogue of the turbine components visitors can hover and tap.
 * Text is public-facing (en-GB) and kept short enough for a kiosk panel.
 */

export type ExteriorPartId = "tower" | "nacelle" | "generator" | "hub" | "blades";
export type TowerPartId =
  | "ladder"
  | "lift"
  | "platforms"
  | "lights"
  | "controlCabinet"
  | "converter"
  | "transformer"
  | "cables";
export type PartId = ExteriorPartId | TowerPartId;

/** Camera framing: orbit target, distance from it and elevation angle. */
export interface Focus {
  target: [number, number, number];
  distance: number;
  elevationDeg: number;
}

export interface PartInfo {
  id: PartId;
  name: string;
  description: string;
  /** Can be opened to show its interior. */
  opens?: boolean;
  /** Where the camera should look when this part is selected inside the open tower. */
  focus?: Focus;
}

export const EXTERIOR_PARTS: Record<ExteriorPartId, PartInfo> = {
  tower: {
    id: "tower",
    name: "Tower",
    description: "The steel tower lifts the hub about 92 m above the ground. Tap it to look inside.",
    opens: true,
  },
  nacelle: {
    id: "nacelle",
    name: "Nacelle",
    description:
      "Houses the yaw drives, cooling and control electronics. It turns to face the wind, following the live nacelle position.",
  },
  generator: {
    id: "generator",
    name: "Ring generator",
    description:
      "ENERCON's direct-drive ring generator: no gearbox. The rotor turns it directly, at the same slow speed as the blades.",
  },
  hub: {
    id: "hub",
    name: "Hub",
    description: "Holds the three blades and the pitch drives that twist each blade to control how much power it catches.",
  },
  blades: {
    id: "blades",
    name: "Blades",
    description: "Three 56 m blades sweep about 10,500 m² of sky — a bigger area than a football pitch.",
  },
};

export const TOWER_PARTS: Record<TowerPartId, PartInfo> = {
  transformer: {
    id: "transformer",
    name: "Transformer",
    description:
      "Steps the electricity up to medium voltage for the local grid. It sits inside a locked mesh cage: only authorised electricians may open it.",
    focus: { target: [0, 1.6, -1.7], distance: 9, elevationDeg: 14 },
  },
  converter: {
    id: "converter",
    name: "Power converter",
    description:
      "Turns the generator's variable-speed output into steady 50 Hz electricity that matches the grid.",
    focus: { target: [-1.2, 4.6, -1.7], distance: 9, elevationDeg: 16 },
  },
  controlCabinet: {
    id: "controlCabinet",
    name: "Control cabinet",
    description:
      "The turbine's computer: it watches wind, blade pitch, yaw and grid, and sends the data that feeds this screen.",
    focus: { target: [-1.6, 1.5, 1.6], distance: 8, elevationDeg: 12 },
  },
  lift: {
    id: "lift",
    name: "Service lift",
    description:
      "A lift for two technicians and their tools that climbs the ladder itself: rollers grip the ladder rails while a motor-driven pinion climbs a toothed rack fixed to the ladder.",
    focus: { target: [1.0, 1.8, 1.7], distance: 9, elevationDeg: 14 },
  },
  ladder: {
    id: "ladder",
    name: "Ladder",
    description:
      "A fixed steel ladder runs the full height of the tower. It carries the lift's toothed rack and a safety rail that climbers clip their harness to.",
    focus: { target: [1.2, 14, 2.0], distance: 13, elevationDeg: 10 },
  },
  platforms: {
    id: "platforms",
    name: "Rest platforms",
    description:
      "Steel-grating (Tramex) platforms at regular heights, with hatches for the ladder and lift, so climbers can rest and work safely.",
    focus: { target: [0, 13, 0], distance: 11, elevationDeg: 28 },
  },
  cables: {
    id: "cables",
    name: "Power cables",
    description:
      "Heavy cables hang from the nacelle in a free loop (so it can turn with the wind), run down a tray on the tower wall to the power converter, then on to the transformer and out to the grid.",
    focus: { target: [-1.1, 5.2, -1.5], distance: 12, elevationDeg: 16 },
  },
  lights: {
    id: "lights",
    name: "Lighting",
    description: "LED luminaires light the ladder and every platform, with battery-backed emergency lighting.",
    focus: { target: [0, 22, 0], distance: 13, elevationDeg: 8 },
  },
};

export const PART_INFO: Record<PartId, PartInfo> = { ...EXTERIOR_PARTS, ...TOWER_PARTS };

export const isTowerPart = (id: PartId | null): id is TowerPartId => id !== null && id in TOWER_PARTS;

/** Quick-jump levels inside the open tower. */
export const TOWER_LEVELS: Array<{ label: string; focus: Focus }> = [
  { label: "Base", focus: { target: [0, 2.8, 0], distance: 15, elevationDeg: 14 } },
  { label: "Converter deck", focus: { target: [0, 4.8, 0], distance: 13, elevationDeg: 20 } },
  { label: "Mid tower", focus: { target: [0, 45, 0], distance: 14, elevationDeg: 12 } },
  { label: "Top", focus: { target: [0, 86, 0], distance: 14, elevationDeg: 8 } },
];

export const TOWER_OPEN_FOCUS: Focus = TOWER_LEVELS[0].focus;
