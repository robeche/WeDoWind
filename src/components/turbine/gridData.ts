/**
 * Electrical surroundings of the turbine, in scene units (1 unit = 1 m, Y up, -Z north).
 * Overhead lines and substations: OpenStreetMap (© OpenStreetMap contributors, ODbL), projected
 * into the site splat's frame with a similarity fitted to the pylons visible in the splat
 * (12 towers matched, 3.9 m RMS). Tower heights are measured from the splat. Each line runs
 * from its substation outwards, so energy pulses flow away from the substation.
 * The cable from the turbine to Seabank substation is a schematic underground route.
 */
export interface GridLine { name: string; kv: number; towers: [number, number, number][] }

export const SEABANK_SUBSTATION: [number, number] = [249.9, 156.8];

/** Underground cable, turbine base → Seabank substation, drawn 0.5 m above ground. */
export const CABLE_ROUTE: [number, number, number][] = [[0.0, 0.5, 0.0], [25.9, 0.5, 16.2], [51.7, 0.5, 32.4], [77.6, 0.5, 48.7], [103.4, 0.5, 64.9], [129.3, 0.5, 81.1], [155.1, 0.5, 97.3], [181.0, 0.5, 113.6], [206.8, 0.5, 129.8], [232.7, 0.5, 146.0], [249.9, 0.5, 156.8]];

export const GRID_LINES: GridLine[] = [
  { name: "2VL", kv: 400, towers: [[318.5, 39.1, 116.3], [657.8, 42.0, 119.0], [1126.4, 49.6, 120.9], [1314.0, 46.0, -139.0], [1482.0, 46.0, -374.4], [1599.0, 46.0, -636.7]] },
  { name: "Iron Acton-Seabank", kv: 132, towers: [[474.3, 30.5, 168.6], [695.0, 28.0, 205.4], [854.2, 25.0, 210.4], [1172.4, 24.5, 199.1]] },
  { name: "400 kV", kv: 400, towers: [[347.0, 16.5, -33.0], [308.1, 16.6, 7.3], [270.5, 15.0, 48.7]] },
  { name: "Iron Acton-Seabank", kv: 132, towers: [[1172.4, 24.5, 199.1], [1324.9, 28.0, 349.6], [1556.6, 28.0, 526.9]] },
  { name: "G", kv: 132, towers: [[482.5, 29.7, 255.5], [629.8, 25.9, 388.1], [752.5, 28.0, 574.3], [795.9, 31.0, 640.2], [955.1, 28.0, 811.7], [1099.6, 28.0, 961.3], [1270.3, 28.0, 1162.3]] },
  { name: "BW", kv: 132, towers: [[499.6, 30.5, 226.6], [658.2, 28.0, 369.7], [822.7, 31.0, 610.1], [986.3, 28.0, 784.3], [1130.1, 28.0, 933.3], [1307.5, 28.0, 1145.0]] },
  { name: "Iron Acton-Seabank", kv: 132, towers: [[258.9, 28.0, 164.0], [270.7, 28.0, 172.2]] },
  { name: "National Grid Seabank - Sandford", kv: 400, towers: [[354.3, 49.1, 182.6], [537.9, 46.4, 393.5], [636.6, 37.1, 663.8], [561.0, 46.0, 875.8], [775.0, 46.0, 1129.5], [994.9, 46.0, 1417.9]] },
  { name: "National Grid Melksham - Seabank - Sandford", kv: 400, towers: [[318.5, 39.1, 116.3], [354.3, 49.1, 182.6]] },
];
