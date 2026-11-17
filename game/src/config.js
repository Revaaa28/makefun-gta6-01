// config.js — every tuning constant and the colour palette for Costa Serena in one place.
// If a number shapes how the game feels, it lives here so the rest of the code stays readable.

export const WORLD = {
  W: 3480,            // world width in pixels
  H: 2520,            // world height in pixels
  ROAD_W: 120,        // full width of a road (both lanes + centre line)
  LANE: 27,           // lane centre offset from the road centre line (right-hand traffic)
  SIDEWALK: 26,       // sidewalk band between road edge and building line
  ROADS_X: [240, 840, 1440, 2040, 2640, 3240],   // vertical road centre lines
  ROADS_Y: [240, 740, 1240, 1740, 2060],          // horizontal road centre lines (last = coastal)
  SAND_Y: 2180,       // beach sand starts here
  WATER_Y: 2380,      // open water starts here (south edge of the map)
};

export const PLAYER = {
  RADIUS: 13,
  WALK: 155,
  SPRINT: 250,
  ACCEL: 1400,
  MAX_HEALTH: 100,
  REGEN_DELAY: 5,     // seconds without damage before health creeps back
  REGEN_RATE: 6,      // hp per second while regenerating
};

export const CAR = {
  LENGTH: 46,
  WIDTH: 24,
  ACCEL: 300,
  REVERSE: 130,
  BRAKE: 520,
  DRAG: 0.55,         // rolling drag coefficient on speed
  MAX_SPEED: 430,
  MAX_REVERSE: 120,
  STEER: 2.35,        // steering rate at full lock, rad/s (scaled by speed)
  TRAFFIC_CRUISE: 175,
  TRAFFIC_ACCEL: 150,
  TRAFFIC_BRAKE: 340,
};

export const COP = {
  BASE_SPEED: 300,    // plus a per-star bonus, see police.js
  PER_STAR: 16,
  SPAWN_EVERY: 7,     // seconds between reinforcement checks
  BUST_RADIUS: 95,    // a cop this close to a slow player starts the bust meter
  BUST_TIME: 2.1,     // seconds of pressure to fill the meter
};

export const WANTED = {
  // heat points needed to reach each star level (index = stars)
  THRESHOLDS: [0, 30, 80, 160, 280, 450],
  DECAY: 9,           // heat per second lost while no cop can see the player
  SIGHT: 560,         // a cop closer than this "sees" the player and stops decay
};

export const COMBAT = {
  BULLET_SPEED: 950,
  BULLET_RANGE: 460,
  BULLET_DAMAGE: 34,
  MAG: 12,
  FIRE_RATE: 0.16,    // seconds between shots
  RELOAD_TIME: 0.9,
  MELEE_RANGE: 46,
  MELEE_DAMAGE: 55,
  MELEE_RATE: 0.38,
};

export const PALETTE = {
  grass: '#5da24e',
  grassDark: '#4c8a41',
  asphalt: '#3c4048',
  asphaltEdge: '#2f3238',
  laneLine: '#e8dcc0',
  centreLine: '#f4b942',
  sidewalk: '#cbb99a',
  sidewalkEdge: '#b3a180',
  sand: '#eed9a0',
  sandWet: '#e2c684',
  water: '#2e7fb8',
  waterDeep: '#256a9c',
  waterFoam: '#bfe6f5',
  roofShadow: 'rgba(46,32,16,0.35)',
  sunShadow: 'rgba(43,24,38,0.30)',   // long dusk shadow cast by buildings and cars
  tint: 'rgba(255,166,66,0.10)',   // golden-hour wash over everything
  dockWood: '#8a6a44',
  dockDark: '#6f5433',
  wetSheen: 'rgba(255,241,205,0.20)',  // sunset light skimming the wet sand
};

// Building colour families: walls are only hinted at top-down, roofs carry the colour.
export const ROOF_COLORS = [
  '#c96f4a', '#d98e5f', '#b8573f', '#e0aa72', '#a8b8c8', '#7fa3b8',
  '#cfcfc4', '#9c8d7a', '#e3d3ae', '#88a06a', '#c45f6e', '#6e7f9c',
];

export const CAR_COLORS = [
  '#d94f3d', '#3d7bd9', '#f2b33d', '#53b06a', '#e8e6df', '#33383f',
  '#8e44ad', '#e67e22', '#16a3a3', '#c0c6cc', '#7a4a2b', '#e58bb1',
  '#274156', '#7f1d2d', '#2e6f5e', '#d9c26a', '#5b8dd9', '#9046c9',
  '#c75b39', '#4a4e57', '#8fb8c9', '#6aa84f', '#b03a5b', '#e3e0d5',
];

// Neon sign colours for the clubs and bars, and awning stripes for shop fronts.
export const NEON_COLORS = {
  CLUB: ['#ff4fd8', '#b26bff', '#4fd8ff'],
  BAR: ['#ffb347', '#ff5e5e', '#ffd23d'],
  HOTEL: ['#57c7ff', '#7be495'],
};
export const AWNING_COLORS = ['#d94f3d', '#3d7bd9', '#e2703a', '#17a398', '#c75b39'];

export const SAVE_KEY = 'costa-serena-save-v1';
