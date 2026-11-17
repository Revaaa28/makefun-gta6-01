// pedestrians.js — the people of Costa Serena. They stroll the sidewalk ring
// around each intersection, chat in pairs, and run screaming (well, silently but
// quickly) when gunfire, crashes or a car on the sidewalk ruins their day.

import { WORLD } from './config.js';
import { S } from './state.js';
import { rng, clamp } from './random.js';
import { sidewalkPointNear, resolveCircle } from './world.js';

const SHIRTS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#ecf0f1', '#e67e22', '#9b59b6', '#1abc9c', '#fd79a8', '#dfe6e9'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function spawnPed(world, x, y) {
  const home = sidewalkPointNear(x, y, world.rng);
  const ped = {
    x: home.x, y: home.y, angle: rng.range(0, Math.PI * 2),
    speed: 0, walkSpeed: rng.range(52, 78),
    target: null, waitTime: rng.range(0, 3),
    state: 'walk',            // walk | wait | flee | down
    fleeFrom: null, fleeTime: 0,
    health: 100, dead: false, downTime: 0,
    shirt: rng.pick(SHIRTS), skin: rng.pick(SKINS),
    phase: rng.range(0, Math.PI * 2),
  };
  ped.target = sidewalkPointNear(home.x, home.y, world.rng);
  S.peds.push(ped);
  return ped;
}

export function populatePeds(world, count = 42) {
  for (let i = 0; i < count; i++) {
    const rx = world.rng.pick(WORLD.ROADS_X);
    const ry = world.rng.pick(WORLD.ROADS_Y);
    spawnPed(world, rx + world.rng.range(-80, 80), ry + world.rng.range(-80, 80));
  }
}

// Keep a living population near the player; recycle the far-away and the fallen.
export function managePeds(world, dt) {
  let near = 0;
  for (let i = S.peds.length - 1; i >= 0; i--) {
    const ped = S.peds[i];
    const d = Math.hypot(ped.x - S.player.x, ped.y - S.player.y);
    if (d < 900) near++;
    if (d > 2400 || (ped.dead && d > 700)) S.peds.splice(i, 1);
  }
  if (near < 26) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(650, 850);
    spawnPed(world, S.player.x + Math.cos(a) * d, S.player.y + Math.sin(a) * d);
  }
}

export function updatePed(ped, dt, world) {
  if (ped.dead) return;
  if (ped.state === 'down') {
    ped.downTime -= dt;
    if (ped.downTime <= 0) { ped.state = 'walk'; ped.health = Math.max(30, ped.health); }
    return;
  }
  let speed = 0;
  if (ped.state === 'flee') {
    ped.fleeTime -= dt;
    if (ped.fleeTime <= 0 || !ped.fleeFrom) { ped.state = 'walk'; ped.target = null; }
    else {
      const away = Math.atan2(ped.y - ped.fleeFrom.y, ped.x - ped.fleeFrom.x);
      ped.angle = away;
      speed = 215;
    }
  }
  if (ped.state === 'walk') {
    if (ped.waitTime > 0) { ped.waitTime -= dt; }
    else {
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 12) {
        ped.target = sidewalkPointNear(ped.x, ped.y, rng);
        if (rng.chance(0.25)) ped.waitTime = rng.range(0.6, 2.6); // pause, check phone, admire the bay
      }
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      ped.angle = want;
      speed = ped.walkSpeed;
    }
  }
  ped.speed = speed;
  if (speed > 0) {
    const nx = ped.x + Math.cos(ped.angle) * speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * speed * dt;
    const res = resolveCircle(world, nx, ny, 9);
    ped.x = res.x; ped.y = res.y;
    ped.phase += dt * speed * 0.09;
  }
}

export function scarePedsNear(x, y, radius = 300, strength = 1) {
  for (const ped of S.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.y - y) < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, y };
      ped.fleeTime = 1.6 * strength + rng.range(0, 0.8);
    }
  }
}

export function hurtPed(ped, damage, cause) {
  if (ped.dead) return { died: false };
  ped.health -= damage;
  if (ped.health <= 0) {
    ped.dead = true;
    ped.state = 'down';
    return { died: true, cause };
  }
  if (damage >= 40) { ped.state = 'down'; ped.downTime = 2.4; }
  else { ped.state = 'flee'; ped.fleeFrom = { x: S.player.x, y: S.player.y }; ped.fleeTime = 2; }
  return { died: false };
}

// Cars meeting pedestrians at speed: the ugly part of the sandbox. Called from
// the main loop for every moving car; returns true when a ped was struck so the
// caller can attribute the crime.
export function carPedCollisions(car) {
  if (Math.abs(car.speed) < 40) return false;
  let hit = false;
  for (const ped of S.peds) {
    if (ped.dead) continue;
    const dx = ped.x - car.x, dy = ped.y - car.y;
    if (Math.abs(dx) > 40 || Math.abs(dy) > 40) continue;
    if (Math.hypot(dx, dy) < car.wid * 0.72 + 9) {
      const dmg = clamp(Math.abs(car.speed) * 0.45, 25, 130);
      const res = hurtPed(ped, dmg, 'car');
      ped.x += Math.cos(car.angle) * 16;
      ped.y += Math.sin(car.angle) * 16;
      hit = true;
      if (res.died) S.stats.pedsHit++;
    }
  }
  return hit;
}
