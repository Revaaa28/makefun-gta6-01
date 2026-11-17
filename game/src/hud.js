// hud.js — everything the player reads: the DOM heads-up display (cash, health,
// wanted stars, objective banner, ammo, speed, bust meter, messages) and the
// minimap, a small canvas that draws the road grid, the water, the player's
// arrow, police blips and the mission marker.

import { WORLD } from './config.js';
import { S } from './state.js';
import { weapon } from './combat.js';
import { currentTarget } from './missions.js';
import { nearestEnterableCar } from './player.js';

let els = null;
let mapCtx = null;

export function initHud() {
  els = {
    cash: document.getElementById('hud-cash'),
    healthFill: document.getElementById('hud-health-fill'),
    healthWrap: document.getElementById('hud-health'),
    stars: document.getElementById('hud-stars'),
    objective: document.getElementById('hud-objective'),
    objectiveText: document.getElementById('hud-objective-text'),
    ammo: document.getElementById('hud-ammo'),
    speed: document.getElementById('hud-speed'),
    bust: document.getElementById('hud-bust'),
    bustFill: document.getElementById('hud-bust-fill'),
    message: document.getElementById('hud-message'),
    hint: document.getElementById('hud-hint'),
    missionTimer: document.getElementById('hud-timer'),
  };
  const map = document.getElementById('minimap');
  if (map) mapCtx = map.getContext('2d');
}

export function updateHud() {
  if (!els) return;
  const p = S.player;
  els.cash.textContent = '$' + Math.floor(p.cash).toLocaleString('en-US');
  els.healthFill.style.width = Math.max(0, p.health) + '%';
  els.healthFill.style.background = p.health > 50 ? '#58c472' : p.health > 25 ? '#e8a13a' : '#d94f3d';
  els.healthWrap.style.opacity = p.car ? '0.55' : '1';

  const stars = S.wanted.stars;
  els.stars.textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';
  els.stars.style.opacity = stars > 0 ? '1' : '0';

  if (S.objective) {
    els.objective.style.display = 'block';
    els.objectiveText.textContent = S.objective;
  } else els.objective.style.display = 'none';

  if (p.car) {
    els.ammo.style.display = 'none';
    els.speed.style.display = 'block';
    els.speed.textContent = Math.round(Math.abs(p.car.speed) * 0.24) + ' mph';
  } else {
    els.speed.style.display = 'none';
    els.ammo.style.display = 'block';
    els.ammo.textContent = weapon.reloadingUntil > S.time ? 'RELOADING' : 'PISTOL  ' + weapon.ammo + ' / ∞';
  }

  if (S.bust.meter > 0.02 && S.wanted.stars > 0) {
    els.bust.style.display = 'block';
    els.bustFill.style.width = (S.bust.meter * 100) + '%';
  } else els.bust.style.display = 'none';

  if (S.message && S.time - S.messageAt < (S.messageTtl || 3)) {
    els.message.style.display = 'block';
    els.message.textContent = S.message;
  } else els.message.style.display = 'none';

  if (S.mission.timer > 0 && S.mission.state === 'active') {
    els.missionTimer.style.display = 'block';
    const t = Math.max(0, S.mission.timer);
    els.missionTimer.textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    els.missionTimer.style.color = t < 30 ? '#ff6b5e' : '#ffe9a8';
  } else els.missionTimer.style.display = 'none';

  // Context hint: the one key the player probably wants right now.
  let hint = '';
  if (S.mode === 'playing') {
    if (p.car) hint = 'E — get out · Space — handbrake';
    else if (nearestEnterableCar()) hint = 'E — steal car';
    else hint = 'Click — shoot · F — melee · R — reload';
  }
  els.hint.textContent = hint;

  drawMinimap();
}

function drawMinimap() {
  if (!mapCtx) return;
  const c = mapCtx;
  const W = 216, H = 156;
  const sx = W / WORLD.W, sy = H / WORLD.H;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#4c8a41';
  c.fillRect(0, 0, W, H);
  // Water + sand.
  c.fillStyle = '#eed9a0';
  c.fillRect(0, WORLD.SAND_Y * sy, W, (WORLD.WATER_Y - WORLD.SAND_Y) * sy);
  c.fillStyle = '#2e7fb8';
  c.fillRect(0, WORLD.WATER_Y * sy, W, (WORLD.H - WORLD.WATER_Y) * sy);
  // Roads.
  c.fillStyle = '#3c4048';
  for (const rx of WORLD.ROADS_X) c.fillRect((rx - WORLD.ROAD_W / 2) * sx, 0, WORLD.ROAD_W * sx, H);
  for (const ry of WORLD.ROADS_Y) c.fillRect(0, (ry - WORLD.ROAD_W / 2) * sy, W, WORLD.ROAD_W * sy);
  // Buildings as faint blocks.
  if (S.world) {
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (const b of S.world.buildings) c.fillRect(b.x * sx, b.y * sy, Math.max(1.5, b.w * sx), Math.max(1.5, b.h * sy));
  }
  // Mission marker: a pulsing gold diamond.
  const target = currentTarget();
  if (target) {
    const pulse = 3 + Math.sin(S.time * 5) * 1.2;
    c.fillStyle = '#ffd23d';
    c.beginPath();
    const tx = target.x * sx, ty = target.y * sy;
    c.moveTo(tx, ty - pulse - 2); c.lineTo(tx + pulse + 2, ty); c.lineTo(tx, ty + pulse + 2); c.lineTo(tx - pulse - 2, ty);
    c.closePath(); c.fill();
  }
  // Police blips flash blue/red.
  const flash = Math.sin(S.time * 9) > 0;
  for (const car of S.cars) {
    if (car.kind !== 'police' || car.dead) continue;
    c.fillStyle = flash ? '#3d7bd9' : '#d94f3d';
    c.beginPath(); c.arc(car.x * sx, car.y * sy, 3, 0, Math.PI * 2); c.fill();
  }
  // The mission car gets a gold dot so it can be tracked across town.
  const tc = S.mission.targetCar;
  if (tc && !tc.dead && S.player.car !== tc) {
    c.fillStyle = '#ffd23d';
    c.beginPath(); c.arc(tc.x * sx, tc.y * sy, 3, 0, Math.PI * 2); c.fill();
  }
  // Player arrow.
  const px = S.player.x * sx, py = S.player.y * sy;
  c.save();
  c.translate(px, py);
  c.rotate(S.player.angle);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#22252a';
  c.beginPath();
  c.moveTo(6, 0); c.lineTo(-4, -3.6); c.lineTo(-4, 3.6);
  c.closePath(); c.fill(); c.stroke();
  c.restore();
}
