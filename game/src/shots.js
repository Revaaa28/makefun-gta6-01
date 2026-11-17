// shots.js — screenshot staging. When the page URL carries ?shot=<name>&seed=<n>,
// main.js boots straight into a fixed, deterministic scene instead of the title
// flow, plays it for a moment, and raises window.__shotReady so the capture
// tool knows the frame is composed. Scenes: chase, mission, drive, title.

import { S, addFloater } from './state.js';
import { makeCar } from './vehicles.js';
import { WORLD, WANTED } from './config.js';
import { starsForHeat } from './police.js';
import { acceptMission } from './missions.js';
import { spawnPed } from './pedestrians.js';
import { rng } from './random.js';

// A trail of tyre smoke behind a fast car, seeded by hand: the staged scenes
// run without input, so no wheelspin happens on its own. The puffs are given
// long lives so they survive the warm-up frames and hang in the frozen frame.
function seedSmokeTrail(x, y, back, count = 16) {
  for (let i = 0; i < count; i++) {
    const life = 1.7;
    S.particles.push({
      x: x - i * (back / count) + rng.range(-7, 7),
      y: y + (i % 2 === 0 ? -9 : 9) + rng.range(-5, 5),
      vx: rng.range(-110, -50), vy: rng.range(-12, 12),
      life, maxLife: life, color: '#dfe3e6', size: rng.range(7, 13),
      round: true, alphaMul: 0.55,
    });
  }
}

// Twin skid lines behind the rear wheels, as if the car just swung into frame.
function seedSkids(x, y, back) {
  for (let x0 = x - 30; x0 > x - back; x0 -= 30) {
    S.skidmarks.push({ x1: x0, y1: y - 9, x2: x0 - 30, y2: y - 9, life: 14 });
    S.skidmarks.push({ x1: x0, y1: y + 9, x2: x0 - 30, y2: y + 9, life: 14 });
  }
}

// The staged scenes play live for a moment before the freeze, and ambient
// traffic from boot wanders the whole map — a crossing car in the wrong
// intersection can T-bone the star of the shot. Clear a quiet stage first;
// the traffic manager only respawns far from the player, so it stays clear.
function purgeAmbient(cx, cy, radius = 1000) {
  for (let i = S.cars.length - 1; i >= 0; i--) {
    const c = S.cars[i];
    if (c.kind === 'traffic' && Math.hypot(c.x - cx, c.y - cy) < radius) S.cars.splice(i, 1);
  }
}

function cruiser(x, y, angle, speed, phase) {
  const cop = makeCar(x, y, angle, { kind: 'police', color: '#eef1f4', model: { name: 'cruiser', len: 48, wid: 25 } });
  cop.ai = { hunt: { x: 2280, y: 2087 }, lightPhase: phase, searchAt: 0 };
  cop.speed = speed;
  return cop;
}

export function setupShot(name) {
  const p = S.player;
  S.shotMode = name;
  if (name === 'title') {
    S.mode = 'title';
    S.camera.x = 1500; S.camera.y = 1050;
    return;
  }
  S.mode = 'playing';

  if (name === 'chase') {
    // The cover: a four-star flight along the coastal avenue at sunset — the
    // player flying east in a red muscle car, tyre smoke hanging over its
    // skid lines, three cruisers strung out on its tail, a braking sedan
    // ahead, and the beach, the bay and the pier filling the bottom of frame.
    // The cops start well back: with no driver input the player's car coasts
    // down while cruisers accelerate, and a tight start ends in a pile-up.
    purgeAmbient(2400, 2087);
    const car = makeCar(2400, 2087, 0, { kind: 'parked', color: '#d94f3d', model: { name: 'muscle', len: 50, wid: 25 } });
    car.driver = 'player';
    car.speed = 430; // staged scenes play ~1s before the freeze; start hot
    car.stolen = true;
    p.car = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    p.cash = 2740;
    S.wanted.heat = WANTED.THRESHOLDS[4] + 40;
    S.wanted.stars = starsForHeat(S.wanted.heat);
    S.wanted.lastCrimeAt = S.time;
    S.fx.starPulse = 1; // the HUD stars sit mid-swell in the frozen frame
    S.copSpawnTimer = 999; // the three staged cruisers are the whole pursuit
    cruiser(2130, 2036, -0.04, 310, 2.8);
    cruiser(2010, 2087, 0, 300, 1.2);
    cruiser(1910, 2118, 0.05, 285, 4.4);
    const ahead = makeCar(2870, 2087, 0, { kind: 'traffic', color: '#3d7bd9' });
    ahead.ai = { axis: 'h', dir: 1, laneCoord: 2087, target: { x: 3240, y: 2087 }, cruise: 150, panic: 2 };
    ahead.speed = 120;
    const slow = makeCar(2950, 2087, 0, { kind: 'traffic', color: '#e8e6df', model: { name: 'van', len: 54, wid: 27 } });
    slow.ai = { axis: 'h', dir: 1, laneCoord: 2087, target: { x: 3240, y: 2087 }, cruise: 40, panic: 0 };
    slow.speed = 35; // the sedan ahead is standing on its brakes for this van
    const oncoming = makeCar(2700, 2033, Math.PI, { kind: 'traffic', color: '#53b06a' });
    oncoming.ai = { axis: 'h', dir: -1, laneCoord: 2033, target: { x: 840, y: 2033 }, cruise: 165, panic: 0 };
    oncoming.speed = 150;
    seedSkids(car.x + 320, car.y, 560);
    seedSmokeTrail(car.x + 300, car.y, 520, 22);
    S.mission.index = 4;
    S.objective = 'Escape! Reach the end of the pier';
    S.camera.x = p.x; S.camera.y = p.y;
  }

  if (name === 'mission') {
    // On foot on the coastal sidewalk, first job active, the kiosk beacon down
    // the shore to the west, a "+$250" payout still floating where the last
    // errand ended, beach and palms in frame, people and cars around.
    p.x = 762; p.y = 1992; p.angle = Math.PI;
    p.cash = 370;
    makeCar(952, 2022, 0, { kind: 'parked', color: '#e58bb1' });
    makeCar(1120, 2098, Math.PI, { kind: 'parked', color: '#e8e6df' });
    const passing = makeCar(1080, 2087, 0, { kind: 'traffic', color: '#16a3a3' });
    passing.ai = { axis: 'h', dir: 1, laneCoord: 2087, target: { x: 2040, y: 2087 }, cruise: 150, panic: 0 };
    passing.speed = 145;
    spawnPed(S.world, 700, 1984);
    spawnPed(S.world, 838, 2002);
    spawnPed(S.world, 660, 2150);
    spawnPed(S.world, 905, 1980);
    S.mission.index = 0;
    S.mission.state = 'offered';
    acceptMission();
    addFloater(p.x + 6, p.y - 30, '+$250', '#7be495');
    S.camera.x = p.x; S.camera.y = p.y;
  }

  if (name === 'drive') {
    // Fast downtown run: the player closing on a taxi that is braking hard
    // behind a slow van, brake lights flaring, oncoming traffic in the west
    // lane, and the avenue's buildings throwing long sunset shadows. The heat
    // buffer sits deep negative so a stray warm-up collision somewhere in the
    // city cannot hand this calm scene a wanted star.
    purgeAmbient(1800, 767);
    const car = makeCar(1800, 767, 0, { kind: 'parked', color: '#3d7bd9', model: { name: 'sedan', len: 46, wid: 24 } });
    car.driver = 'player';
    car.speed = 430;
    car.stolen = true;
    p.car = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    p.cash = 860;
    S.wanted.heat = -400;
    const t1 = makeCar(2320, 767, 0, { kind: 'traffic', color: '#f2b33d', model: { name: 'taxi', len: 46, wid: 24 } });
    t1.ai = { axis: 'h', dir: 1, laneCoord: 767, target: { x: 3240, y: 767 }, cruise: 165, panic: 0 };
    t1.speed = 150;
    const van = makeCar(2395, 767, 0, { kind: 'traffic', color: '#e8e6df', model: { name: 'van', len: 54, wid: 27 } });
    van.ai = { axis: 'h', dir: 1, laneCoord: 767, target: { x: 3240, y: 767 }, cruise: 90, panic: 0 };
    van.speed = 90; // the taxi rides its brakes behind this van
    const t2 = makeCar(2560, 713, Math.PI, { kind: 'traffic', color: '#53b06a' });
    t2.ai = { axis: 'h', dir: -1, laneCoord: 713, target: { x: 840, y: 713 }, cruise: 165, panic: 0 };
    t2.speed = 155;
    seedSkids(car.x + 150, car.y, 380);
    seedSmokeTrail(car.x + 120, car.y, 300, 10);
    S.objective = '';
    S.camera.x = p.x; S.camera.y = p.y;
  }
}
