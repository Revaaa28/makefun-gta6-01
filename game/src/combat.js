// combat.js — the player's violence: a mouse-aimed pistol (12-round mag, R to
// reload) and a shove-like melee swing. Bullets are short-lived tracers tested
// against buildings, cars and people; every hit feeds the wanted system and the
// particle system, and gunfire panics everyone nearby.

import { COMBAT } from './config.js';
import { S, showMessage } from './state.js';
import { rng } from './random.js';
import { isSolid } from './world.js';
import { hurtPed, scarePedsNear } from './pedestrians.js';
import { reportCrime, } from './police.js';
import { burst, smoke, panicTrafficNear } from './vehicles.js';
import { sfx } from './audio.js';

export const weapon = {
  ammo: COMBAT.MAG,
  reloadingUntil: 0,
  lastShotAt: -99,
  muzzle: 0,            // seconds of muzzle flash left to draw
};

export function resetWeapon() {
  weapon.ammo = COMBAT.MAG;
  weapon.reloadingUntil = 0;
  weapon.lastShotAt = -99;
  weapon.muzzle = 0;
}

export function tryShoot(world) {
  const p = S.player;
  if (p.car) return;                       // no drive-bys in Costa Serena
  if (S.time < weapon.reloadingUntil) return;
  if (S.time - weapon.lastShotAt < COMBAT.FIRE_RATE) return;
  if (weapon.ammo <= 0) {
    sfx.dryFire();
    startReload();
    return;
  }
  weapon.lastShotAt = S.time;
  weapon.ammo--;
  S.stats.shotsFired++;
  const angle = Math.atan2(S.mouseWorld.y - p.y, S.mouseWorld.x - p.x) + rng.range(-0.016, 0.016);
  S.bullets.push({
    x: p.x + Math.cos(angle) * 18, y: p.y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * COMBAT.BULLET_SPEED, vy: Math.sin(angle) * COMBAT.BULLET_SPEED,
    life: COMBAT.BULLET_RANGE / COMBAT.BULLET_SPEED,
  });
  weapon.muzzle = 0.05;
  p.angle = angle;
  // A tongue of sparks and a breath of smoke at the muzzle.
  burst(p.x + Math.cos(angle) * 30, p.y + Math.sin(angle) * 30, 3, '#ffd76a');
  smoke(p.x + Math.cos(angle) * 34, p.y + Math.sin(angle) * 34, 1, 4);
  S.camera.shake = Math.min(10, S.camera.shake + 1.2);
  sfx.shot();
  reportCrime('shotFired');
  scarePedsNear(p.x, p.y, 330);
  panicTrafficNear(p.x, p.y, 330);
  if (weapon.ammo === 0) startReload();
}

export function startReload() {
  if (S.time < weapon.reloadingUntil || weapon.ammo === COMBAT.MAG) return;
  weapon.reloadingUntil = S.time + COMBAT.RELOAD_TIME;
  sfx.reload();
}

export function tryMelee() {
  const p = S.player;
  if (p.car) return;
  if (S.time - p.meleeAt < COMBAT.MELEE_RATE) return;
  p.meleeAt = S.time;
  sfx.punch();
  const facing = p.angle;
  for (const ped of S.peds) {
    if (ped.dead) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d > COMBAT.MELEE_RANGE) continue;
    const a = Math.atan2(ped.y - p.y, ped.x - p.x);
    if (Math.abs(((a - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.15) {
      const res = hurtPed(ped, COMBAT.MELEE_DAMAGE, 'melee');
      burst(ped.x, ped.y, 5, '#e8e0cc');
      reportCrime(res.died ? 'killPed' : 'meleePed', ped.x, ped.y);
      scarePedsNear(ped.x, ped.y, 260);
    }
  }
  // Thumping a car panel counts too.
  for (const car of S.cars) {
    if (Math.hypot(car.x - p.x, car.y - p.y) < COMBAT.MELEE_RANGE + car.wid) {
      car.health -= 8;
      burst(p.x + Math.cos(facing) * 24, p.y + Math.sin(facing) * 24, 4, '#cfd6dd');
      reportCrime('hitCar', car.x, car.y);
    }
  }
}

export function updateBullets(world, dt) {
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.life -= dt;
    const steps = 3;
    let consumed = false;
    for (let s = 0; s < steps && !consumed; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      if (isSolid(world, b.x, b.y, -2)) {
        burst(b.x, b.y, 7, '#ffd76a');       // impact sparks off masonry
        smoke(b.x, b.y, 1, 5);               // and a puff of dust
        consumed = true;
        break;
      }
      for (const ped of S.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 11) {
          const res = hurtPed(ped, COMBAT.BULLET_DAMAGE, 'shot');
          burst(ped.x, ped.y, 6, '#c0392b');
          reportCrime(res.died ? 'killPed' : 'hitPed', ped.x, ped.y);
          scarePedsNear(ped.x, ped.y, 300);
          consumed = true;
          break;
        }
      }
      if (consumed) break;
      for (const car of S.cars) {
        if (car.dead) continue;
        if (Math.abs(car.x - b.x) < car.len / 2 && Math.abs(car.y - b.y) < car.len / 2 &&
            Math.hypot(car.x - b.x, car.y - b.y) < car.len * 0.55) {
          car.health -= COMBAT.BULLET_DAMAGE;
          burst(b.x, b.y, 8, '#ffd76a');     // sparks off bodywork
          smoke(b.x, b.y, 1, 5);
          if (car.kind === 'police' || car.driver === 'player') reportCrime('resisting', car.x, car.y);
          else reportCrime('shotHitCar', car.x, car.y);
          if (car.health <= 0 && !car.dead) { car.dead = true; burst(car.x, car.y, 24, '#3a3f45'); }
          consumed = true;
          break;
        }
      }
    }
    if (consumed || b.life <= 0) S.bullets.splice(i, 1);
  }
  if (weapon.reloadingUntil && S.time >= weapon.reloadingUntil) {
    weapon.ammo = COMBAT.MAG;
    weapon.reloadingUntil = 0;
  }
  if (weapon.muzzle > 0) weapon.muzzle -= dt;
}

export function damagePlayer(amount) {
  const p = S.player;
  p.health -= amount;
  p.lastDamageAt = S.time;
  if (p.health <= 0 && !p.dead) {
    p.health = 0;
    p.dead = true;
  }
}

export { showMessage };
