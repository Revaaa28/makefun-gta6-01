// police.js — the law in Costa Serena. A heat-based wanted system: crimes add
// heat, heat maps to 0–5 stars, and heat drains while no officer can see the
// player. Police cars spawn off-screen on the road grid, hunt the player's last
// known position, ram when close, and fill the bust meter when they corner a
// slow player. Presence scales with the star count.

import { WORLD, COP, WANTED } from './config.js';
import { S, showMessage } from './state.js';
import { rng, clamp, angleDelta } from './random.js';
import { resolveCircle } from './world.js';
import { makeCar, burst } from './vehicles.js';
import { sfx, sirenSound } from './audio.js';

const CRIME_HEAT = {
  theft: 34,        // stealing a car (worse when witnessed)
  theftWitnessed: 55,
  hitPed: 55,
  killPed: 130,
  hitCar: 26,
  shotFired: 14,
  shotHitCar: 20,
  meleePed: 40,
  resisting: 60,
};

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.THRESHOLDS.length; i++) if (heat >= WANTED.THRESHOLDS[i]) stars = i;
  return stars;
}

export function reportCrime(kind, x = S.player.x, y = S.player.y) {
  const heat = CRIME_HEAT[kind] || 10;
  const before = S.wanted.stars;
  S.wanted.heat = Math.min(WANTED.THRESHOLDS[5] + 160, S.wanted.heat + heat);
  S.wanted.stars = starsForHeat(S.wanted.heat);
  S.wanted.lastCrimeAt = S.time;
  S.wanted.lastKnown = { x, y };
  if (S.wanted.stars > before && S.wanted.stars > 0) {
    S.fx.starPulse = 1;   // red vignette pulse + the HUD stars swell
    showMessage(S.wanted.stars >= 3 ? 'The heat is on — lose them!' : 'Wanted: the police are coming', 2.4);
  }
}

export function clearWanted() {
  S.wanted.heat = 0;
  S.wanted.stars = 0;
  S.wanted.seenByCop = false;
}

export function desiredCops(stars) {
  return [0, 2, 3, 4, 6, 8][clamp(stars, 0, 5)];
}

function spawnCop(world) {
  // Spawn on a road, off-screen but not far: close enough to matter in seconds.
  const a = rng.range(0, Math.PI * 2);
  const d = rng.range(760, 980);
  let x = clamp(S.player.x + Math.cos(a) * d, 60, WORLD.W - 60);
  let y = clamp(S.player.y + Math.sin(a) * d, 60, WORLD.WATER_Y - 90);
  // Snap to the nearest road centre so the chase starts on tarmac.
  const nearX = WORLD.ROADS_X.reduce((p, c) => Math.abs(c - x) < Math.abs(p - x) ? c : p);
  const nearY = WORLD.ROADS_Y.reduce((p, c) => Math.abs(c - y) < Math.abs(p - y) ? c : p);
  if (Math.abs(nearX - x) < Math.abs(nearY - y)) x = nearX; else y = nearY;
  const car = makeCar(x, y, rng.range(0, Math.PI * 2), {
    kind: 'police', color: '#eef1f4', model: { name: 'cruiser', len: 48, wid: 25 },
  });
  car.ai = { hunt: { x: S.player.x, y: S.player.y }, lightPhase: rng.range(0, 6), searchAt: 0 };
  return car;
}

export function updateWanted(world, dt) {
  const w = S.wanted;
  // Sight check: any living police car close to the player counts as seeing them.
  w.seenByCop = false;
  for (const car of S.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    if (Math.hypot(car.x - S.player.x, car.y - S.player.y) < WANTED.SIGHT) { w.seenByCop = true; break; }
  }
  if (!w.seenByCop && w.stars > 0 && S.time - w.lastCrimeAt > 2.5) {
    w.heat = Math.max(0, w.heat - WANTED.DECAY * dt);
    const ns = starsForHeat(w.heat);
    if (ns < w.stars) { w.stars = ns; if (ns === 0) showMessage('You lost the cops', 2); }
  }

  // Spawn / retire police to match the wanted level.
  const cops = S.cars.filter(c => c.kind === 'police');
  const want = desiredCops(w.stars);
  S.copSpawnTimer = (S.copSpawnTimer || 0) - dt;
  if (cops.filter(c => !c.dead).length < want && S.copSpawnTimer <= 0) {
    spawnCop(world);
    S.copSpawnTimer = COP.SPAWN_EVERY * 0.4;
  }
  if (w.stars === 0) {
    // No heat: officers peel off and leave the world.
    for (let i = S.cars.length - 1; i >= 0; i--) {
      const c = S.cars[i];
      if (c.kind === 'police' && Math.hypot(c.x - S.player.x, c.y - S.player.y) > 800) S.cars.splice(i, 1);
    }
  }
  sirenSound(w.stars > 0 && cops.some(c => !c.dead && Math.hypot(c.x - S.player.x, c.y - S.player.y) < 700));
}

// One police car's brain: chase the player (or their last known position),
// steer hard, ram on contact, and lean on the bust meter when they're cornered.
export function updateCop(car, dt) {
  const ai = car.ai;
  ai.lightPhase += dt * 9;
  const p = S.player;
  const distP = Math.hypot(p.x - car.x, p.y - car.y);
  if (distP < WANTED.SIGHT) ai.hunt = { x: p.x, y: p.y };

  const targetSpeed = COP.BASE_SPEED + S.wanted.stars * COP.PER_STAR + (distP > 500 ? 55 : 0);
  const wantAngle = Math.atan2(ai.hunt.y - car.y, ai.hunt.x - car.x);
  const delta = angleDelta(car.angle, wantAngle);
  const turnRate = 2.5 - clamp(Math.abs(car.speed) / 420, 0, 0.9);
  car.angle += clamp(delta, -turnRate * dt, turnRate * dt);

  const distHunt = Math.hypot(ai.hunt.x - car.x, ai.hunt.y - car.y);
  if (distHunt < 60 && distP >= WANTED.SIGHT) {
    // At the last known spot with no sign of the player: slow down and search.
    car.speed = Math.max(0, car.speed - 260 * dt);
  } else if (Math.abs(delta) > 2.4 && car.speed > 60) {
    car.speed -= 300 * dt; // target behind: brake and swing round
  } else {
    car.speed = Math.min(targetSpeed, car.speed + 320 * dt);
  }
  car.speed -= car.speed * 0.35 * dt;

  const prevSpeed = Math.abs(car.speed);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const res = resolveCircle(S.world, car.x, car.y, car.wid * 0.72);
  car.x = res.x; car.y = res.y;
  if (res.impact > 0.5) {
    if (prevSpeed > 120) { burst(car.x, car.y, 6, '#ffd27a'); sfx.crash(false); car.health -= 6; }
    car.speed *= -0.2;
  }
  if (car.health <= 0 && !car.dead) { car.dead = true; car.speed = 0; burst(car.x, car.y, 26, '#3a3f45'); }

  updateBust(car, dt);
}

// The bust meter: a live cop close to a slow or on-foot player fills it;
// fill it completely and the run ends in handcuffs.
function updateBust(car, dt) {
  if (car.dead || S.mode !== 'playing') return;
  const p = S.player;
  const d = Math.hypot(p.x - car.x, p.y - car.y);
  const playerSpeed = p.car ? Math.abs(p.car.speed) : Math.hypot(p.vx, p.vy);
  const cornered = d < COP.BUST_RADIUS && playerSpeed < 45;
  if (cornered && S.wanted.stars > 0) {
    S.bust.meter = Math.min(1, S.bust.meter + dt / COP.BUST_TIME);
    S.bust.active = true;
    if (S.bust.meter >= 1) S.bust.triggered = true;
  }
}

export function decayBust(dt) {
  if (!S.bust.active) S.bust.meter = Math.max(0, S.bust.meter - dt * 0.7);
  S.bust.active = false;
}

export function fineForStars(stars) {
  return Math.min(S.player.cash, 120 + stars * 160);
}
