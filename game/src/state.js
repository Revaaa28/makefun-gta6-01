// state.js — the single mutable game state object every module reads and writes.
// Keeping it in one place means modules never import each other just to share data;
// behaviour lives in the owning module, data lives here.

import { WORLD } from './config.js';

export const S = {
  mode: 'title',          // title | playing | paused | busted | gameover | phone
  time: 0,                // seconds since boot (drives animations)
  world: null,            // filled by world.js generateWorld()
  seed: 1337,

  player: {
    x: 840, y: 900, angle: -Math.PI / 2, vx: 0, vy: 0,
    health: 100, cash: 120, dead: false,
    car: null,            // car object while driving, null on foot
    lastDamageAt: -99,
    meleeAt: -99,
    stepPhase: 0,         // walk bob animation
  },

  cars: [],               // every car in the world (traffic, parked, police, mission)
  peds: [],
  bullets: [],
  particles: [],
  skidmarks: [],          // {x1,y1,x2,y2,life}
  floaters: [],           // floating text popups {x,y,text,color,life}

  wanted: {
    heat: 0, stars: 0, seenByCop: false, lastCrimeAt: -99,
  },
  bust: { meter: 0, active: false },

  mission: {
    index: 0,             // which mission in the chain is current
    step: 0,              // step inside the mission
    state: 'idle',        // idle | offered | active | done (all missions finished)
    timer: -1,            // seconds left for timed steps, -1 = untimed
    targetCar: null,      // the marked car for the steal mission
    failedAt: -99,
  },

  camera: { x: 840, y: 900, shake: 0, zoom: 1 },
  input: {
    keys: {}, mouseX: 0, mouseY: 0, mouseDown: false,
    interactPressed: false,   // edge-triggered E
    pausePressed: false,
  },
  mouseWorld: { x: 0, y: 0 },

  audioOn: false,
  muted: false,
  message: '',              // transient centre-screen message
  messageAt: -99,
  objective: '',            // current objective banner text
  phoneQueue: [],           // pending phone intros [{from, text, mission}]
  stats: { shotsFired: 0, carsStolen: 0, pedsHit: 0 },

  shotMode: null,           // name of the staged screenshot scene, if any
  shotReady: false,
};

export function resetRunState() {
  S.cars.length = 0;
  S.peds.length = 0;
  S.bullets.length = 0;
  S.particles.length = 0;
  S.skidmarks.length = 0;
  S.floaters.length = 0;
  S.wanted.heat = 0; S.wanted.stars = 0; S.wanted.seenByCop = false;
  S.bust.meter = 0; S.bust.active = false;
  S.player.health = 100; S.player.dead = false; S.player.car = null;
  S.player.vx = 0; S.player.vy = 0;
  S.mission.step = 0; S.mission.state = 'idle'; S.mission.timer = -1;
  S.mission.targetCar = null;
  S.objective = '';
}

export function spawnPoint() {
  // On the sidewalk by the second vertical road, mid-town: a calm place to start.
  return { x: WORLD.ROADS_X[1] + WORLD.ROAD_W / 2 + 24, y: 980 };
}

export function addFloater(x, y, text, color = '#ffe9a8') {
  S.floaters.push({ x, y, text, color, life: 1.6 });
  if (S.floaters.length > 24) S.floaters.shift();
}

export function showMessage(text, seconds = 3) {
  S.message = text;
  S.messageAt = S.time;
  S.messageTtl = seconds;
}
