// main.js — boot and the game loop. Owns the canvas, the input listeners, the
// overlay screens (title / pause / phone / busted / wasted), the top-level state
// machine, and the per-frame update order for every other module. Everything
// else lives in its own file; this one just wires them together and keeps time.

import { S, resetRunState, spawnPoint, showMessage } from './state.js';
import { generateWorld, PLACES } from './world.js';
import { spawnParkedCars, spawnTrafficCar, updateTrafficCar, moveCar, separateCars, manageTraffic } from './vehicles.js';
import { populatePeds, managePeds, updatePed, carPedCollisions } from './pedestrians.js';
import { updatePlayer, regenHealth } from './player.js';
import { updateWanted, updateCop, decayBust, fineForStars, clearWanted, reportCrime } from './police.js';
import { tryShoot, tryMelee, startReload, updateBullets, resetWeapon } from './combat.js';
import { maybeOfferMission, acceptMission, updateMissions, FIXER } from './missions.js';
import { initHud, updateHud } from './hud.js';
import { draw, updateCamera } from './render.js';
import { initAudio, setMuted, sfx } from './audio.js';
import { hasSave, loadGame, saveGame, clearSave } from './save.js';
import { setupShot } from './shots.js';
import { resolveCircle } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewW = 0, viewH = 0;

function resize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = viewW;
  canvas.height = viewH;
}
window.addEventListener('resize', resize);
resize();

// --- URL parameters: ?shot=<name>&seed=<n> stages a screenshot scene. ---
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = parseInt(params.get('seed') || '1337', 10);
S.seed = Number.isFinite(seedParam) ? seedParam : 1337;

// --- World boot ---------------------------------------------------------------
S.world = generateWorld(S.seed);
spawnParkedCars(S.world);
populatePeds(S.world, 42);
for (let i = 0; i < 13; i++) spawnTrafficCar(S.world, true);
initHud();

const startPos = spawnPoint();
S.player.x = startPos.x; S.player.y = startPos.y;
S.camera.x = startPos.x; S.camera.y = startPos.y;

// --- DOM helpers ----------------------------------------------------------------
const $ = id => document.getElementById(id);
const overlays = {
  title: $('title-screen'), pause: $('pause-screen'), busted: $('busted-screen'),
  gameover: $('gameover-screen'), phone: $('phone'),
};
function showOverlay(name) {
  for (const key of Object.keys(overlays)) overlays[key].classList.toggle('show', key === name);
}
function hideOverlays() { showOverlay(null); }

$('btn-continue').disabled = !hasSave();

// --- Input ----------------------------------------------------------------------
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  initAudio();
  if (e.repeat) return;
  S.input.keys[e.code] = true;
  if (e.code === 'KeyE') S.input.interactPressed = true;
  if (e.code === 'KeyM') { setMuted(!S.muted); showMessage(S.muted ? 'Sound off' : 'Sound on', 1.2); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyF') tryMelee();
  if (e.code === 'Space' && S.mode === 'playing' && !S.player.car) tryMelee();
  if ((e.code === 'Escape' || e.code === 'KeyP')) {
    if (S.mode === 'playing') { S.mode = 'paused'; showOverlay('pause'); }
    else if (S.mode === 'paused') { S.mode = 'playing'; hideOverlays(); }
  }
});
window.addEventListener('keyup', e => { S.input.keys[e.code] = false; });
canvas.addEventListener('mousemove', e => { S.input.mouseX = e.clientX; S.input.mouseY = e.clientY; });
canvas.addEventListener('mousedown', e => { initAudio(); if (e.button === 0) S.input.mouseDown = true; });
window.addEventListener('mouseup', () => { S.input.mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// --- Game flow --------------------------------------------------------------------
function startGame(continueRun) {
  resetRunState();
  resetWeapon();
  const sp = spawnPoint();
  S.player.x = sp.x; S.player.y = sp.y; S.player.angle = -Math.PI / 2;
  S.camera.x = sp.x; S.camera.y = sp.y;
  if (continueRun) {
    loadGame();
    const res = resolveCircle(S.world, S.player.x, S.player.y, 13);
    S.player.x = res.x; S.player.y = res.y;
    S.camera.x = S.player.x; S.camera.y = S.player.y;
    showMessage('Welcome back to Costa Serena', 2.4);
  } else {
    clearSave();
    S.player.cash = 120;
    S.mission.index = 0;
    S.mission.state = 'idle';
    showMessage('Costa Serena. Make yourself known.', 3);
  }
  S.mode = 'playing';
  hideOverlays();
  sfx.click();
}

function doBusted() {
  const fine = fineForStars(S.wanted.stars);
  S.player.cash -= fine;
  $('busted-text').textContent =
    'The police walk you to the station, take $' + fine + ' as their cut, and let you go — this time.';
  clearWanted();
  S.bust.meter = 0; S.bust.triggered = false;
  if (S.player.car) { S.player.car.driver = null; S.player.car = null; }
  S.mode = 'busted';
  sfx.busted();
  showOverlay('busted');
  saveGame();
}

function respawnAtStation() {
  const res = resolveCircle(S.world, PLACES.station.x + 76, PLACES.station.y + 76, 13);
  S.player.x = res.x; S.player.y = res.y;
  S.camera.x = res.x; S.camera.y = res.y;
  S.mode = 'playing';
  hideOverlays();
}

function doGameOver() {
  S.mode = 'gameover';
  sfx.wasted();
  showOverlay('gameover');
}

function getUp() {
  const fee = Math.min(S.player.cash, 150);
  S.player.cash -= fee;
  S.player.health = 100;
  S.player.dead = false;
  clearWanted();
  if (S.player.car) { S.player.car.driver = null; S.player.car = null; }
  respawnAtStation();
  showMessage('The clinic patched you up (-$' + fee + ')', 2.6);
  saveGame();
}

function openPhone() {
  const call = S.phoneQueue[0];
  if (!call) return;
  $('phone-from').textContent = 'Incoming call — ' + call.from;
  $('phone-title').textContent = call.title;
  $('phone-text').textContent = call.text;
  $('phone-reward').textContent = 'Pays $' + call.reward;
  S.mode = 'phone';
  showOverlay('phone');
}

$('btn-start').addEventListener('click', () => { initAudio(); startGame(false); });
$('btn-continue').addEventListener('click', () => { initAudio(); startGame(true); });
$('btn-resume').addEventListener('click', () => { S.mode = 'playing'; hideOverlays(); sfx.click(); });
$('btn-busted-ok').addEventListener('click', () => { respawnAtStation(); sfx.click(); });
$('btn-restart').addEventListener('click', () => { getUp(); sfx.click(); });
$('btn-accept').addEventListener('click', () => {
  S.phoneQueue.shift();
  acceptMission();
  S.mode = 'playing';
  hideOverlays();
  sfx.click();
});

// --- Per-frame updates --------------------------------------------------------------
let autosaveAt = 0;
let pedCrimeCooldown = 0;

function updatePlaying(dt) {
  updatePlayer(dt);
  regenHealth(dt);
  if (S.input.mouseDown) tryShoot(S.world);

  for (const car of S.cars) {
    if (car.driver === 'player') continue;
    if (car.kind === 'traffic' && car.ai) updateTrafficCar(car, dt);
    else if (car.kind === 'police') updateCop(car, dt);
    else if (car.speed !== 0) { car.speed -= car.speed * 1.8 * dt; if (Math.abs(car.speed) < 2) car.speed = 0; moveCar(car, dt); }
  }
  separateCars();
  if (S.crimeCarHit) {
    S.crimeCarHit = false;
    if (S.player.car && pedCrimeCooldown <= 0) { reportCrime('hitCar'); pedCrimeCooldown = 0.6; }
  }
  pedCrimeCooldown -= dt;

  // Cars vs pedestrians, with blame where it belongs.
  for (const car of S.cars) {
    if (Math.abs(car.speed) < 40) continue;
    const hit = carPedCollisions(car);
    if (hit) {
      if (car.driver === 'player' && pedCrimeCooldown <= 0) {
        reportCrime('hitPed', car.x, car.y);
        pedCrimeCooldown = 0.9;
      }
      if (car.kind === 'traffic' && car.ai) car.ai.panic = 2;
    }
  }

  for (const ped of S.peds) updatePed(ped, dt, S.world);
  updateBullets(S.world, dt);
  updateWanted(S.world, dt);
  decayBust(dt);
  updateMissions(dt);
  if (!S.shotMode) maybeOfferMission();
  if (S.phoneQueue.length && S.mode === 'playing' && !S.shotMode) openPhone();

  manageTraffic(S.world, dt);
  managePeds(S.world, dt);

  if (S.bust.triggered) { S.bust.triggered = false; doBusted(); return; }
  if (S.player.dead) { doGameOver(); return; }

  if (S.time > autosaveAt) { autosaveAt = S.time + 8; saveGame(); }
}

function updateAmbient(dt) {
  // Title screen / overlays: the city keeps living behind the panels.
  for (const car of S.cars) {
    if (car.kind === 'traffic' && car.ai) updateTrafficCar(car, dt);
  }
  for (const ped of S.peds) updatePed(ped, dt, S.world);
  separateCars();
  manageTraffic(S.world, dt);
  managePeds(S.world, dt);
}

function updateFx(dt) {
  if (S.fx.starPulse > 0) S.fx.starPulse = Math.max(0, S.fx.starPulse - dt * 1.25);
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const pt = S.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.92; pt.vy *= 0.92;
    if (pt.life <= 0) S.particles.splice(i, 1);
  }
  for (let i = S.skidmarks.length - 1; i >= 0; i--) {
    S.skidmarks[i].life -= dt;
    if (S.skidmarks[i].life <= 0) S.skidmarks.splice(i, 1);
  }
  for (let i = S.floaters.length - 1; i >= 0; i--) {
    S.floaters[i].life -= dt;
    if (S.floaters[i].life <= 0) S.floaters.splice(i, 1);
  }
}

// --- Screenshot staging ---------------------------------------------------------------
let shotFrames = 0;
if (shotName) {
  setupShot(shotName);
  if (shotName === 'title') showOverlay('title');
  else hideOverlays();
}

// --- The loop ---------------------------------------------------------------------------
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  S.time += dt;

  // Mouse position in world space (uses last frame's view origin).
  const origin = S.viewOrigin || { x: S.camera.x - viewW / 2, y: S.camera.y - viewH / 2 };
  S.mouseWorld.x = S.input.mouseX + origin.x;
  S.mouseWorld.y = S.input.mouseY + origin.y;

  if (S.shotReady) {
    // Screenshot staging: freeze the composed scene so the capture lands on it
    // no matter when the capture tool fires after __shotReady.
    draw(ctx, viewW, viewH);
    if (S.mode !== 'title') updateHud();
    return;
  }

  if (S.mode === 'playing') updatePlaying(dt);
  else if (S.mode === 'title') {
    updateAmbient(dt);
    // A slow drift over mid-town behind the title.
    S.camera.x = 1500 + Math.sin(S.time * 0.045) * 330;
    S.camera.y = 1050 + Math.cos(S.time * 0.032) * 210;
  } else {
    updateAmbient(dt);
  }
  updateFx(dt);

  if (S.mode !== 'title') updateCamera(dt, viewW, viewH);
  draw(ctx, viewW, viewH);
  if (S.mode !== 'title') updateHud();

  if (shotName && !S.shotReady) {
    shotFrames++;
    if (shotFrames > 30) { S.shotReady = true; window.__shotReady = true; }
  }
  document.body.classList.toggle('on-title', S.mode === 'title');
}
requestAnimationFrame(frame);
