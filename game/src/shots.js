// shots.js — screenshot staging. When the page URL carries ?shot=<name>&seed=<n>,
// main.js boots straight into a fixed, deterministic scene instead of the title
// flow, plays it for a moment, and raises window.__shotReady so the capture
// tool knows the frame is composed. Scenes: chase, mission, drive, title.

import { S } from './state.js';
import { makeCar } from './vehicles.js';
import { WORLD, WANTED } from './config.js';
import { starsForHeat } from './police.js';
import { acceptMission } from './missions.js';
import { spawnPed } from './pedestrians.js';

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
    // Mid-pursuit downtown: player flooring it east, two cruisers on the tail,
    // three stars, and the final mission's escape objective on the banner.
    purgeAmbient(1440, 1267);
    const car = makeCar(1440, 1267, 0, { kind: 'parked', color: '#d94f3d', model: { name: 'muscle', len: 50, wid: 25 } });
    car.driver = 'player';
    car.speed = 305;
    car.stolen = true;
    p.car = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    p.cash = 2740;
    S.wanted.heat = WANTED.THRESHOLDS[3] + 30;
    S.wanted.stars = starsForHeat(S.wanted.heat);
    S.wanted.lastCrimeAt = S.time;
    const cop1 = makeCar(1246, 1267, 0, { kind: 'police', color: '#eef1f4', model: { name: 'cruiser', len: 48, wid: 25 } });
    cop1.ai = { hunt: { x: p.x, y: p.y }, lightPhase: 1.2, searchAt: 0 };
    cop1.speed = 290;
    const cop2 = makeCar(1085, 1213, 0.06, { kind: 'police', color: '#eef1f4', model: { name: 'cruiser', len: 48, wid: 25 } });
    cop2.ai = { hunt: { x: p.x, y: p.y }, lightPhase: 4.4, searchAt: 0 };
    cop2.speed = 235;
    const ahead = makeCar(1985, 1267, 0, { kind: 'traffic', color: '#3d7bd9' });
    ahead.ai = { axis: 'h', dir: 1, laneCoord: 1240 + WORLD.LANE, target: { x: 2640, y: 1267 }, cruise: 150, panic: 2 };
    ahead.speed = 140;
    S.mission.index = 4;
    S.objective = 'Escape! Reach the end of the pier';
    S.camera.x = p.x; S.camera.y = p.y;
  }

  if (name === 'mission') {
    // On foot on the coastal sidewalk, first job active, the kiosk beacon down
    // the shore to the west, beach and palms in frame, people and cars around.
    p.x = 762; p.y = 1992; p.angle = Math.PI;
    p.cash = 120;
    makeCar(952, 2022, 0, { kind: 'parked', color: '#e58bb1' });
    makeCar(1120, 2098, Math.PI, { kind: 'parked', color: '#e8e6df' });
    spawnPed(S.world, 700, 1984);
    spawnPed(S.world, 838, 2002);
    spawnPed(S.world, 660, 2150);
    spawnPed(S.world, 905, 1980);
    S.mission.index = 0;
    S.mission.state = 'offered';
    acceptMission();
    S.camera.x = p.x; S.camera.y = p.y;
  }

  if (name === 'drive') {
    // Fast downtown run, traffic ahead, buildings either side.
    purgeAmbient(1980, 767);
    const car = makeCar(1980, 767, 0, { kind: 'parked', color: '#3d7bd9', model: { name: 'sedan', len: 46, wid: 24 } });
    car.driver = 'player';
    car.speed = 385;
    car.stolen = true;
    p.car = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    p.cash = 860;
    const t1 = makeCar(2330, 767, 0, { kind: 'traffic', color: '#f2b33d' });
    t1.ai = { axis: 'h', dir: 1, laneCoord: 767, target: { x: 3240, y: 767 }, cruise: 165, panic: 0 };
    t1.speed = 150;
    const t2 = makeCar(2560, 713, Math.PI, { kind: 'traffic', color: '#53b06a' });
    t2.ai = { axis: 'h', dir: -1, laneCoord: 713, target: { x: 840, y: 713 }, cruise: 165, panic: 0 };
    t2.speed = 155;
    S.objective = '';
    S.camera.x = p.x; S.camera.y = p.y;
  }
}
