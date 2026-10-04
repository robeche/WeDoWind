/**
 * Catalogue of the turbine components visitors can hover and tap.
 * Text is public-facing (en-GB) and kept short enough for a kiosk panel.
 */

/** Exterior parts that can be opened to show what is inside. */
export type OpenableId = "tower" | "nacelle" | "generator" | "blades";
export type ExteriorPartId = OpenableId | "hub";
export type TowerPartId =
  | "ladder"
  | "lift"
  | "platforms"
  | "lights"
  | "controlCabinet"
  | "converter"
  | "transformer"
  | "switchgear"
  | "cables"
  | "dataCables";
export type NacellePartId = "mainCarrier" | "yawDrives" | "nacelleCabinets" | "cooling" | "nacelleCables";
export type GeneratorPartId = "stator" | "genRotor" | "airGap" | "excitation" | "axle";
export type BladePartId =
  | "sparCaps"
  | "shearWebs"
  | "bladeShell"
  | "bladeRoot"
  | "pitchSystem"
  | "lightning"
  | "leadingEdge";
export type SubPartId = TowerPartId | NacellePartId | GeneratorPartId | BladePartId;
export type PartId = ExteriorPartId | SubPartId;

/**
 * Coordinate frame of a focus target:
 * - world:   scene coordinates (tower)
 * - nacelle: the tilted nacelle frame (origin on the shaft axis above the tower, +Z towards the rotor)
 * - blade:   the inspected blade (origin at the hub centre, +Y along the span), parked horizontally
 */
export type Frame = "world" | "nacelle" | "blade";

/** Camera framing: orbit target, distance from it and elevation angle. */
export interface Focus {
  target: [number, number, number];
  distance: number;
  elevationDeg: number;
  frame?: Frame;
  /** Preferred horizontal viewing direction (from the target towards the camera), nacelle frame. */
  viewDir?: [number, number, number];
}

export interface PartInfo {
  id: PartId;
  name: string;
  description: string;
  /** Can be opened to show its interior. */
  opens?: boolean;
  /** Panel text while this part is open. */
  intro?: string;
  /** The opened part this component lives inside. */
  parent?: OpenableId;
  /** Where the camera looks when this part is opened / selected. */
  focus?: Focus;
}

export const EXTERIOR_PARTS: Record<ExteriorPartId, PartInfo> = {
  tower: {
    id: "tower",
    name: "Tower",
    description: "The steel tower lifts the hub about 92 m above the ground. Tap it to look inside.",
    opens: true,
    intro:
      "Equipment at the base turns the generator's output into grid power; a ladder, lift and platforms lead all the way up to the nacelle.",
  },
  nacelle: {
    id: "nacelle",
    name: "Nacelle",
    description: "The turbine's machine room, 92 m up. It turns to face the wind. Tap it to look inside.",
    opens: true,
    intro:
      "The nacelle carries the generator and rotor, turns them into the wind and houses the control, cooling and safety systems. It follows the live nacelle position of the real turbine.",
    focus: { target: [0, -0.4, -0.2], distance: 15, elevationDeg: 18, frame: "nacelle", viewDir: [1, 0, -0.25] },
  },
  generator: {
    id: "generator",
    name: "Ring generator",
    description: "ENERCON's direct-drive ring generator: no gearbox between rotor and generator. Tap it to look inside.",
    opens: true,
    intro:
      "A multipole synchronous ring generator, about 6.5 m across. Its rotor is bolted straight to the hub and turns at only 4.4–12.9 rpm, but with dozens of poles passing each coil that slow rotation still makes electricity. The magnetic field is created electrically: ENERCON generators use no permanent magnets or rare earths.",
    focus: { target: [0, 0, 2.8], distance: 13, elevationDeg: 12, frame: "nacelle", viewDir: [0.85, 0, 0.55] },
  },
  hub: {
    id: "hub",
    name: "Hub",
    description:
      "Holds the three blades. Inside, each blade has its own electric pitch drive with emergency power, so it can be turned to control power or to stop the rotor.",
  },
  blades: {
    id: "blades",
    name: "Blades",
    description: "Three 56 m blades sweep about 10,500 m² of sky — a bigger area than a football pitch. Tap to see inside one.",
    opens: true,
    intro:
      "The rotor stops so you can look inside one blade. ENERCON lists the blade materials as glass-fibre reinforced epoxy (GRP), balsa wood and foam; the internal layout shown here is a typical design for blades of this size.",
    focus: { target: [0, 28, 0], distance: 34, elevationDeg: 10, frame: "blade", viewDir: [0.75, 0, 0.66] },
  },
};

export const TOWER_PARTS: Record<TowerPartId, PartInfo> = {
  transformer: {
    id: "transformer",
    name: "Transformer",
    description:
      "Steps the electricity up to medium voltage for the local grid. It sits inside a locked mesh cage: only authorised electricians may open it.",
    focus: { target: [0, 4.6, -1.7], distance: 10, elevationDeg: 16 },
  },
  converter: {
    id: "converter",
    name: "Power converter",
    description:
      "Turns the generator's variable-speed output into steady 50 Hz electricity that matches the grid.",
    focus: { target: [-1.2, 1.7, -1.7], distance: 9, elevationDeg: 14 },
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
  switchgear: {
    id: "switchgear",
    name: "Grid switchgear",
    description:
      "The turbine's connection to the grid: a medium-voltage switch that links it to the local network and can disconnect it safely for maintenance or if there is a fault.",
    focus: { target: [-2.0, 4.5, -0.4], distance: 9, elevationDeg: 14 },
  },
  dataCables: {
    id: "dataCables",
    name: "Control cables",
    description:
      "Signal and data cables link the control cabinet to the power converters and run all the way up the tower to the control cabinets in the nacelle.",
    focus: { target: [-1.6, 2.6, -0.6], distance: 10, elevationDeg: 18 },
  },
  cables: {
    id: "cables",
    name: "Power cables",
    description:
      "Heavy cables hang from the nacelle in a free loop (so it can turn with the wind), run down a tray on the tower wall to the power converter, then on to the transformer and out to the grid.",
    focus: { target: [-1.1, 3.6, -1.6], distance: 12, elevationDeg: 14 },
  },
  lights: {
    id: "lights",
    name: "Lighting",
    description: "LED luminaires light the ladder and every platform, with battery-backed emergency lighting.",
    focus: { target: [0, 22, 0], distance: 13, elevationDeg: 8 },
  },
};

const nacelleFocus = (target: [number, number, number], distance = 8, viewDir: [number, number, number] = [1, 0, -0.2]): Focus => ({
  target,
  distance,
  elevationDeg: 16,
  frame: "nacelle",
  viewDir,
});

export const NACELLE_PARTS: Record<NacellePartId, PartInfo> = {
  mainCarrier: {
    id: "mainCarrier",
    name: "Main carrier",
    description:
      "A massive cast-steel frame. It holds the generator and the rotor's axle and passes all their weight and wind loads down into the yaw bearing and the tower.",
    focus: nacelleFocus([0, -1.2, 0.6], 9),
  },
  yawDrives: {
    id: "yawDrives",
    name: "Yaw drives",
    description:
      "Electric motors with gearboxes, whose pinions mesh with a large toothed ring on top of the tower. Together they turn the whole nacelle to face the wind.",
    focus: nacelleFocus([0, -2.0, 0], 8),
  },
  nacelleCabinets: {
    id: "nacelleCabinets",
    name: "Nacelle control cabinets",
    description:
      "Collect the signals from the wind sensors, pitch, yaw, generator and cooling, and talk to the control cabinet at the tower base through the control cables.",
    focus: nacelleFocus([1.45, -1.2, 0.3], 7),
  },
  cooling: {
    id: "cooling",
    name: "Cooling system",
    description:
      "Pumps circulate coolant from the generator and electronics to a heat exchanger at the back of the nacelle, where fans blow the heat out into the air.",
    focus: nacelleFocus([0, -0.2, -1.8], 8, [0.6, 0, -1]),
  },
  nacelleCables: {
    id: "nacelleCables",
    name: "Power & control cables",
    description:
      "Power cables leave the generator and drop through the middle of the yaw bearing into the tower; control cables run alongside them down to the tower base.",
    focus: nacelleFocus([-0.6, -1.6, 0.6], 8),
  },
};

const genFocus = (target: [number, number, number], distance = 9): Focus => ({
  target,
  distance,
  elevationDeg: 12,
  frame: "nacelle",
  viewDir: [0.85, 0, 0.55],
});

export const GENERATOR_PARTS: Record<GeneratorPartId, PartInfo> = {
  stator: {
    id: "stator",
    name: "Stator",
    description:
      "The fixed outer ring. Its laminated steel core carries form-wound aluminium coils (on ENERCON's EP3 platform). As the rotor's poles sweep past, they induce alternating current in these coils.",
    focus: genFocus([1.9, 1.9, 2.8]),
  },
  genRotor: {
    id: "genRotor",
    name: "Rotor & poles",
    description:
      "Bolted to the hub, it turns with the blades. Around its rim sit many electromagnet poles: steel cores wrapped in field coils. Direct current in the coils makes them alternate north–south.",
    focus: genFocus([1.6, 1.6, 3.0]),
  },
  airGap: {
    id: "airGap",
    name: "Air gap",
    description:
      "Rotor and stator never touch: only a narrow gap of a few millimetres separates them all round the ring, so the generator must be built and kept very precise.",
    focus: genFocus([2.0, 1.4, 2.8], 7),
  },
  excitation: {
    id: "excitation",
    name: "Excitation (slip rings)",
    description:
      "The DC current for the rotor poles enters through slip rings and brushes. By adjusting it, the control system sets the strength of the magnetic field — and so the generator's voltage — without any magnets.",
    focus: genFocus([0, 0.7, 3.6], 6),
  },
  axle: {
    id: "axle",
    name: "Axle & main bearings",
    description:
      "A stationary axle pin, fixed to the main carrier, carries the hub and generator rotor on large bearings. The converter in the tower base turns the generator's variable-frequency output into steady 50 Hz.",
    focus: genFocus([0, 0, 3.8], 7),
  },
};

const bladeFocus = (spanY: number, distance: number): Focus => ({
  target: [0, spanY, 0],
  distance,
  elevationDeg: 10,
  frame: "blade",
  viewDir: [0.75, 0, 0.66],
});

export const BLADE_PARTS: Record<BladePartId, PartInfo> = {
  sparCaps: {
    id: "sparCaps",
    name: "Spar caps",
    description:
      "Thick bands of glass fibre with all fibres running along the blade, inside its top and bottom faces. They carry most of the bending load — like the flanges of an I-beam.",
    focus: bladeFocus(20, 16),
  },
  shearWebs: {
    id: "shearWebs",
    name: "Shear webs",
    description:
      "Two walls joining the spar caps, made as a sandwich of GRP skins around a balsa or foam core. Caps and webs together form the blade's backbone: a box beam.",
    focus: bladeFocus(24, 14),
  },
  bladeShell: {
    id: "bladeShell",
    name: "Shell (sandwich)",
    description:
      "The aerodynamic skin: thin GRP layers around a lightweight balsa/foam core. It is moulded in two halves and bonded together along the leading and trailing edges and onto the webs.",
    focus: bladeFocus(16, 12),
  },
  bladeRoot: {
    id: "bladeRoot",
    name: "Blade root",
    description:
      "The thick, round end of the blade. A ring of steel bolts set into the laminate fastens it to the pitch bearing in the hub.",
    focus: bladeFocus(2.5, 8),
  },
  pitchSystem: {
    id: "pitchSystem",
    name: "Pitch system",
    description:
      "Each blade has its own electric pitch drive with emergency power. It turns the blade on its bearing to control power — and to feather the blades and stop the rotor safely.",
    focus: bladeFocus(1.5, 8),
  },
  lightning: {
    id: "lightning",
    name: "Lightning protection",
    description:
      "Metal receptors on the blade surface catch lightning strikes; a thick down-conductor inside carries the current to the hub and safely to earth through the tower.",
    focus: bladeFocus(48, 14),
  },
  leadingEdge: {
    id: "leadingEdge",
    name: "Leading-edge protection",
    description:
      "A tough coating on the outer leading edge, where rain and dust hit the blade at up to about 280 km/h at the tip, protects it from erosion.",
    focus: bladeFocus(46, 12),
  },
};

const withParent = <T extends string>(parts: Record<T, PartInfo>, parent: OpenableId) =>
  Object.fromEntries(Object.entries<PartInfo>(parts).map(([k, v]) => [k, { ...v, parent }])) as Record<T, PartInfo>;

export const SUB_PARTS: Record<SubPartId, PartInfo> = {
  ...withParent(TOWER_PARTS, "tower"),
  ...withParent(NACELLE_PARTS, "nacelle"),
  ...withParent(GENERATOR_PARTS, "generator"),
  ...withParent(BLADE_PARTS, "blades"),
};

export const PART_INFO: Record<PartId, PartInfo> = { ...EXTERIOR_PARTS, ...SUB_PARTS };

export const parentOf = (id: PartId | null): OpenableId | undefined => (id ? PART_INFO[id].parent : undefined);
export const isTowerPart = (id: PartId | null): id is TowerPartId => parentOf(id) === "tower";
export const isOpenable = (id: PartId | null): id is OpenableId => id !== null && !!PART_INFO[id].opens;

/** Components listed in the panel while a part is open, in display order. */
export const OPEN_CHILDREN: Record<OpenableId, SubPartId[]> = {
  tower: ["converter", "transformer", "switchgear", "controlCabinet", "cables", "dataCables", "lift", "ladder", "platforms", "lights"],
  nacelle: ["mainCarrier", "yawDrives", "nacelleCabinets", "cooling", "nacelleCables"],
  generator: ["stator", "genRotor", "airGap", "excitation", "axle"],
  blades: ["sparCaps", "shearWebs", "bladeShell", "bladeRoot", "pitchSystem", "lightning", "leadingEdge"],
};

/** Quick-jump levels inside the open tower. */
export const TOWER_LEVELS: Array<{ label: string; focus: Focus }> = [
  { label: "Base", focus: { target: [0, 2.8, 0], distance: 15, elevationDeg: 14 } },
  { label: "Transformer deck", focus: { target: [0, 4.8, 0], distance: 13, elevationDeg: 20 } },
  { label: "Mid tower", focus: { target: [0, 45, 0], distance: 14, elevationDeg: 12 } },
  { label: "Top", focus: { target: [0, 86, 0], distance: 14, elevationDeg: 8 } },
];

export const TOWER_OPEN_FOCUS: Focus = TOWER_LEVELS[0].focus;
EXTERIOR_PARTS.tower.focus = TOWER_OPEN_FOCUS;
