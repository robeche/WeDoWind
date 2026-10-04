/**
 * ENERCON E-115 E3 (4.2 MW) at Lawrence Weston — shared dimensions, 1 unit = 1 m.
 * 115.7 m rotor, 56 m blades, ~92 m hub height, 150 m tip height.
 */

export const DEG = Math.PI / 180;
export const TWO_PI = Math.PI * 2;

export const TIP_HEIGHT = 150;
export const ROTOR_RADIUS = 115.7 / 2; // 57.85 m
export const BLADE_LENGTH = 56;
export const BLADE_ROOT_R = ROTOR_RADIUS - BLADE_LENGTH; // 1.85 m
export const HUB_HEIGHT = TIP_HEIGHT - ROTOR_RADIUS; // 92.15 m
export const NACELLE_AXIS_Y = 3.05;
export const TOWER_TOP = HUB_HEIGHT - NACELLE_AXIS_Y; // 89.1 m
export const TOWER_BASE_R = 2.9;
export const TOWER_TOP_R = 1.65;
export const TOWER_WALL = 0.05;
export const SHAFT_TILT = 5 * DEG;
/** Distance from the tower axis to the rotor centre (rotor is upwind, +Z). */
export const ROTOR_Z = 4.6;
/** Top of the foundation slab = tower ground floor. */
export const GROUND_FLOOR_Y = 0.6;

/** Outer tower radius at height y. */
export const towerOuterR = (y: number) => TOWER_BASE_R + (TOWER_TOP_R - TOWER_BASE_R) * (y / TOWER_TOP);
/** Inner (wall) radius at height y. */
export const towerInnerR = (y: number) => towerOuterR(y) - TOWER_WALL;
