// player.js — the player character: on-foot movement with WASD/arrows, sprinting,
// aiming with the mouse, and the enter/exit-car dance (walk up, press E, drive,
// press E again to get out). While driving, this module feeds the input into the
// vehicle physics and keeps the player glued to the driver's seat.

import { PLAYER, WORLD } from './config.js';
import { S, showMessage } from './state.js';
import { clamp, dist } from './random.js';
import { resolveCircle } from './world.js';
import { driveCar } from './vehicles.js';
import { reportCrime } from './police.js';
import { sfx, engineSound } from './audio.js';
import { scarePedsNear } from './pedestrians.js';

export function nearestEnterableCar() {
  let best = null, bd = 58;
  for (const car of S.cars) {
    if (car.dead || car.driver) continue;
    if (car.kind === 'police') continue;         // cruisers are locked, obviously
    const d = dist(S.player.x, S.player.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(car) {
  const p = S.player;
  p.car = car;
  car.driver = 'player';
  const wasParked = car.kind === 'parked' || car.kind === 'mission';
  if (car.kind === 'traffic') car.kind = 'parked'; // hijacked: its AI days are over
  car.ai = null;
  p.x = car.x; p.y = car.y;
  sfx.door();
  if (!car.stolen && wasParked) {
    car.stolen = true;
    S.stats.carsStolen++;
    // A theft with an audience is worth more heat than a quiet one.
    let witnessed = false;
    for (const ped of S.peds) {
      if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 240) { witnessed = true; break; }
    }
    for (const c of S.cars) if (c.kind === 'police' && dist(c.x, c.y, car.x, car.y) < 420) witnessed = true;
    reportCrime(witnessed ? 'theftWitnessed' : 'theft', car.x, car.y);
    if (witnessed) scarePedsNear(car.x, car.y, 200, 0.7);
  }
}

export function exitCar() {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  p.car = null;
  // Step out on the left side of the car, nudged clear of walls.
  const side = car.angle - Math.PI / 2;
  const res = resolveCircle(S.world, car.x + Math.cos(side) * (car.wid + 12), car.y + Math.sin(side) * (car.wid + 12), PLAYER.RADIUS);
  p.x = res.x; p.y = res.y;
  p.angle = car.angle;
  sfx.door();
  engineSound(0, false);
}

export function updatePlayer(dt) {
  const p = S.player;
  const input = S.input;
  const keys = input.keys;

  if (input.interactPressed) {
    input.interactPressed = false;
    if (p.car) exitCar();
    else {
      const car = nearestEnterableCar();
      if (car) enterCar(car);
    }
  }

  if (p.car) {
    const car = p.car;
    const throttle = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? -1 : 0);
    const steer = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
    const handbrake = !!keys['Space'];
    car.brakingHard = throttle < 0 && car.speed > 60;
    driveCar(car, dt, { throttle, steer, handbrake });
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    p.vx = Math.cos(car.angle) * car.speed;
    p.vy = Math.sin(car.angle) * car.speed;
    engineSound(clamp(Math.abs(car.speed) / 430, 0, 1), true);
    if (car.health <= 0 && !car.dead) { car.dead = true; showMessage('Your ride is wrecked!', 2.5); exitCar(); }
    return;
  }

  // On foot.
  engineSound(0, false);
  let mx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  let my = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = sprint ? PLAYER.SPRINT : PLAYER.WALK;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.vx = mx * speed; p.vy = my * speed;
    p.stepPhase += dt * (sprint ? 13 : 9);
    if (!input.mouseDown) p.angle = Math.atan2(my, mx);
  } else {
    p.vx = 0; p.vy = 0;
  }
  if (input.mouseDown || S.combatAiming) {
    p.angle = Math.atan2(S.mouseWorld.y - p.y, S.mouseWorld.x - p.x);
  }
  const res = resolveCircle(S.world, p.x + p.vx * dt, p.y + p.vy * dt, PLAYER.RADIUS);
  p.x = res.x; p.y = res.y;
  p.x = clamp(p.x, PLAYER.RADIUS, WORLD.W - PLAYER.RADIUS);
  p.y = clamp(p.y, PLAYER.RADIUS, WORLD.H - PLAYER.RADIUS);
}

export function regenHealth(dt) {
  const p = S.player;
  if (p.dead) return;
  if (S.time - p.lastDamageAt > PLAYER.REGEN_DELAY && p.health < PLAYER.MAX_HEALTH) {
    p.health = Math.min(PLAYER.MAX_HEALTH, p.health + PLAYER.REGEN_RATE * dt);
  }
}
