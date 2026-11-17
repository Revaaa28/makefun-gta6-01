// vehicles.js — everything about cars: how they spawn (parked, traffic, police,
// mission targets), the arcade driving physics the player uses, and the traffic
// AI that follows the road grid, keeps its lane, brakes for trouble and panics
// when the chaos gets close.

import { WORLD, CAR, CAR_COLORS } from './config.js';
import { S } from './state.js';
import { rng, clamp, angleDelta } from './random.js';
import { resolveCircle, nearestIntersection } from './world.js';
import { sfx } from './audio.js';

const HW = WORLD.ROAD_W / 2;
let nextCarId = 1;

const MODELS = [
  { name: 'sedan', len: 46, wid: 24, weight: 5 },
  { name: 'hatch', len: 40, wid: 23, weight: 3 },
  { name: 'muscle', len: 50, wid: 25, weight: 2 },
  { name: 'van', len: 54, wid: 27, weight: 2 },
  { name: 'taxi', len: 46, wid: 24, weight: 2 },
];

export function makeCar(x, y, angle, opts = {}) {
  const model = opts.model || rng.pick(MODELS);
  const car = {
    id: nextCarId++,
    x, y, angle, speed: 0,
    len: model.len, wid: model.wid, model: model.name,
    color: opts.color || (model.name === 'taxi' ? '#f2b33d' : rng.pick(CAR_COLORS)),
    kind: opts.kind || 'parked',     // parked | traffic | police | mission
    driver: null,                    // 'player' while the player drives it
    health: 100,
    ai: null,                        // traffic/police brain, set by spawners
    stolen: false,
    honkAt: 0,
    blockedTime: 0,
    dead: false,
    skidL: null, skidR: null,
  };
  S.cars.push(car);
  return car;
}

// --- Spawning ---------------------------------------------------------------

// Parked cars line the parking lots and the kerbs; they are the player's supply.
export function spawnParkedCars(world) {
  for (const lot of world.lots) {
    const cols = Math.max(1, Math.floor(lot.w / 64));
    const rows = Math.max(1, Math.floor(lot.h / 56));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!world.rng.chance(0.45)) continue;
      makeCar(lot.x + 34 + c * 64, lot.y + 28 + r * 56, Math.PI / 2, { kind: 'parked' });
    }
  }
  // Kerbside parking along a few avenues.
  for (const ry of [WORLD.ROADS_Y[1], WORLD.ROADS_Y[3]]) {
    for (let x = 420; x < WORLD.W - 300; x += 150) {
      if (!world.rng.chance(0.4)) continue;
      makeCar(x, ry - HW + 20, 0, { kind: 'parked' });
    }
  }
}

// A traffic car starts on a random intersection, picks a direction and drives.
export function spawnTrafficCar(world, anywhere = false) {
  const rx = rng.pick(WORLD.ROADS_X);
  const ry = rng.pick(WORLD.ROADS_Y);
  let x = rx, y = ry;
  if (!anywhere) {
    // Spawn away from the player so cars never pop in on screen.
    if (Math.hypot(x - S.player.x, y - S.player.y) < 700) { x = WORLD.ROADS_X[0]; y = WORLD.ROADS_Y[0]; }
  }
  const horizontal = rng.chance(0.5);
  const dir = rng.chance(0.5) ? 1 : -1;
  const car = makeCar(x, y, horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), { kind: 'traffic' });
  car.ai = {
    axis: horizontal ? 'h' : 'v',
    dir,
    laneCoord: horizontal ? ry + dir * WORLD.LANE : rx - dir * WORLD.LANE,
    target: null, cruise: CAR.TRAFFIC_CRUISE * rng.range(0.8, 1.1),
    panic: 0,
  };
  snapToLane(car);
  pickNextTarget(car);
  return car;
}

function snapToLane(car) {
  if (car.ai.axis === 'h') car.y = car.ai.laneCoord;
  else car.x = car.ai.laneCoord;
}

// Choose the intersection this car is heading for along its current road.
function pickNextTarget(car) {
  if (car.ai.axis === 'h') {
    const options = WORLD.ROADS_X.filter(rx => (rx - car.x) * car.ai.dir > 40);
    car.ai.target = options.length ? { x: rng.pick(options), y: car.y } : { x: car.x + car.ai.dir * 300, y: car.y };
  } else {
    const options = WORLD.ROADS_Y.filter(ry => (ry - car.y) * car.ai.dir > 40);
    car.ai.target = options.length ? { x: car.x, y: rng.pick(options) } : { x: car.x, y: car.y + car.ai.dir * 300 };
  }
}

// At an intersection, turn (usually), go straight, or — rarely — U-turn.
function arriveAtIntersection(car) {
  const inter = nearestIntersection(car.x, car.y);
  car.x = inter.x; car.y = inter.y;
  const roll = rng.next();
  if (roll < 0.45) {
    // Turn: swap axis, pick a direction along the crossing road.
    const newDir = rng.chance(0.5) ? 1 : -1;
    if (car.ai.axis === 'h') {
      car.ai.axis = 'v'; car.ai.dir = newDir;
      car.ai.laneCoord = inter.x - newDir * WORLD.LANE;
      car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.ai.axis = 'h'; car.ai.dir = newDir;
      car.ai.laneCoord = inter.y + newDir * WORLD.LANE;
      car.angle = newDir > 0 ? 0 : Math.PI;
    }
    snapToLane(car);
  } else if (roll < 0.55) {
    car.ai.dir *= -1; // U-turn
    if (car.ai.axis === 'h') { car.ai.laneCoord = inter.y + car.ai.dir * WORLD.LANE; car.angle = car.ai.dir > 0 ? 0 : Math.PI; }
    else { car.ai.laneCoord = inter.x - car.ai.dir * WORLD.LANE; car.angle = car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    snapToLane(car);
  }
  pickNextTarget(car);
}

// --- Physics ----------------------------------------------------------------

// The player's driving model: throttle/brake/steer come in as -1..1 inputs.
// Handbrake loosens the rear end (faster yaw, speed scrubbed, skid marks).
export function driveCar(car, dt, input) {
  const { throttle, steer, handbrake } = input;
  if (throttle > 0) car.speed += CAR.ACCEL * throttle * dt * (1 - Math.max(0, car.speed) / (CAR.MAX_SPEED * 1.6));
  else if (throttle < 0) {
    if (car.speed > 12) car.speed -= CAR.BRAKE * dt;
    else car.speed = Math.max(-CAR.MAX_REVERSE, car.speed - CAR.REVERSE * 0.7 * dt);
  }
  car.speed -= car.speed * CAR.DRAG * dt;
  if (handbrake) car.speed -= car.speed * 1.4 * dt;
  const speedFactor = clamp(Math.abs(car.speed) / 120, 0, 1) * Math.sign(car.speed || 1);
  car.angle += steer * CAR.STEER * speedFactor * dt * (handbrake ? 1.7 : 1);
  moveCar(car, dt, handbrake);
}

export function moveCar(car, dt, drifting = false) {
  const prevX = car.x, prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const res = resolveCircle(S.world, car.x, car.y, car.wid * 0.72);
  if (res.impact > 0.5 && Math.abs(car.speed) > 60) {
    onCarCrash(car, Math.abs(car.speed));
  }
  car.x = res.x; car.y = res.y;
  if (res.impact > 0.5) car.speed *= -0.25;

  // Skid marks while drifting or braking hard at speed.
  const rearX = car.x - Math.cos(car.angle) * car.len * 0.38;
  const rearY = car.y - Math.sin(car.angle) * car.len * 0.38;
  const px = -Math.sin(car.angle), py = Math.cos(car.angle);
  const l = { x: rearX + px * car.wid * 0.36, y: rearY + py * car.wid * 0.36 };
  const r = { x: rearX - px * car.wid * 0.36, y: rearY - py * car.wid * 0.36 };
  if ((drifting && Math.abs(car.speed) > 90) || (car.brakingHard && Math.abs(car.speed) > 160)) {
    if (car.skidL) {
      S.skidmarks.push({ x1: car.skidL.x, y1: car.skidL.y, x2: l.x, y2: l.y, life: 14 });
      S.skidmarks.push({ x1: car.skidR.x, y1: car.skidR.y, x2: r.x, y2: r.y, life: 14 });
      if (S.skidmarks.length > 420) S.skidmarks.splice(0, S.skidmarks.length - 420);
    }
    car.skidL = l; car.skidR = r;
  } else { car.skidL = null; car.skidR = null; }
  car.movedDist = Math.hypot(car.x - prevX, car.y - prevY);
}

export function onCarCrash(car, speed) {
  car.health -= speed * 0.06;
  S.camera.shake = Math.min(14, S.camera.shake + speed * 0.03);
  sfx.crash(speed > 240);
  burst(car.x, car.y, 8, '#ffd27a');
  if (car.driver === 'player') {
    // Imported lazily by main through state flags to avoid a module cycle:
    S.player.lastDamageAt = S.time;
    S.player.health -= speed * 0.028;
  }
}

export function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), sp = rng.range(30, 190);
    S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rng.range(0.25, 0.6), maxLife: 0.6, color, size: rng.range(1.5, 3.5) });
  }
}

// --- Traffic AI ---------------------------------------------------------------

function obstacleAhead(car, lookDist) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const check = (ox, oy, orad) => {
    const dx = ox - car.x, dy = oy - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 6 || ahead > lookDist) return false;
    const side = Math.abs(-dx * fy + dy * fx);
    return side < (car.wid / 2 + orad);
  };
  if (S.player.car !== car && check(S.player.x, S.player.y, S.player.car ? 20 : 12)) return true;
  for (const other of S.cars) {
    if (other === car || other.dead) continue;
    if (other.kind === 'parked' && !other.driver) continue;
    if (check(other.x, other.y, other.wid * 0.7)) return true;
  }
  for (const ped of S.peds) {
    if (!ped.dead && check(ped.x, ped.y, 9)) return true;
  }
  return false;
}

export function updateTrafficCar(car, dt) {
  const ai = car.ai;
  if (ai.panic > 0) ai.panic -= dt;
  const cruise = ai.panic > 0 ? ai.cruise * 1.7 : ai.cruise;
  const blocked = obstacleAhead(car, 86);
  car.brakingHard = blocked && car.speed > 40;
  if (blocked) {
    car.speed = Math.max(0, car.speed - CAR.TRAFFIC_BRAKE * dt);
    car.blockedTime += dt;
    if (car.blockedTime > 1.6 && S.time > car.honkAt) {
      car.honkAt = S.time + rng.range(2, 5);
      if (Math.hypot(car.x - S.player.x, car.y - S.player.y) < 480) sfx.honk();
    }
  } else {
    car.blockedTime = 0;
    car.speed = Math.min(cruise, car.speed + CAR.TRAFFIC_ACCEL * dt);
  }
  moveCar(car, dt);
  // Reached the target intersection? Decide the next leg.
  const dx = ai.target.x - car.x, dy = ai.target.y - car.y;
  const along = ai.axis === 'h' ? dx * ai.dir : dy * ai.dir;
  if (along < 14 && Math.hypot(dx, dy) < 90) arriveAtIntersection(car);
  if (car.health <= 0 && !car.dead) { car.dead = true; burst(car.x, car.y, 22, '#555'); }
}

// A chaos event (gunshot, crash, explosion of honking) spooks nearby traffic.
export function panicTrafficNear(x, y, radius = 320) {
  for (const car of S.cars) {
    if (car.kind === 'traffic' && car.ai && Math.hypot(car.x - x, car.y - y) < radius) {
      car.ai.panic = rng.range(1.5, 3);
    }
  }
}

// Separate overlapping cars so the world never stacks two bodies in one spot.
export function separateCars() {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = (a.wid + b.wid) * 0.78;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        const aParked = a.kind === 'parked' && !a.driver;
        const bParked = b.kind === 'parked' && !b.driver;
        if (!aParked) { a.x -= nx * push; a.y -= ny * push; }
        if (!bParked) { b.x += nx * push; b.y += ny * push; }
        const relSpeed = Math.abs(a.speed - b.speed);
        if (relSpeed > 90) {
          onCarCrash(a, relSpeed); onCarCrash(b, relSpeed);
          a.speed *= 0.45; b.speed *= 0.45;
          S.crimeCarHit = true; // main loop attributes blame to the player when relevant
        }
      }
    }
  }
}

// Keep the traffic population topped up; remove wrecks and cars left far away.
export function manageTraffic(world, dt) {
  let trafficCount = 0;
  for (let i = S.cars.length - 1; i >= 0; i--) {
    const car = S.cars[i];
    if (car.kind === 'traffic') {
      trafficCount++;
      const d = Math.hypot(car.x - S.player.x, car.y - S.player.y);
      if ((car.dead && d > 500) || d > 2600) { S.cars.splice(i, 1); trafficCount--; }
    }
    if (car.kind === 'parked' && car.dead && Math.hypot(car.x - S.player.x, car.y - S.player.y) > 900) {
      S.cars.splice(i, 1);
    }
  }
  if (trafficCount < 15) spawnTrafficCar(world);
}
