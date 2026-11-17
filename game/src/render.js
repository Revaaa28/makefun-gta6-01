// render.js — draws the whole world each frame: ground, beach and animated water,
// roads with lane markings and crosswalks, sidewalks, buildings with shadows and
// rooftop detail, props, skid marks, cars (with police light bars), pedestrians,
// the player, bullets, particles and floating text — all under a golden-hour
// tint, through a camera that follows smoothly and looks ahead at speed.

import { WORLD, PALETTE } from './config.js';
import { S } from './state.js';
import { clamp, lerp } from './random.js';
import { currentTarget } from './missions.js';
import { weapon } from './combat.js';

const HW = WORLD.ROAD_W / 2;

export function updateCamera(dt, viewW, viewH) {
  const cam = S.camera;
  const p = S.player;
  // Look ahead in the direction of travel so speed feels readable.
  const lookX = p.vx * 0.55, lookY = p.vy * 0.55;
  const tx = clamp(p.x + lookX, viewW / 2 - 60, WORLD.W - viewW / 2 + 60);
  const ty = clamp(p.y + lookY, viewH / 2 - 60, WORLD.H - viewH / 2 + 60);
  const k = 1 - Math.pow(0.0015, dt); // smooth, frame-rate independent
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 26);
}

export function draw(ctx, viewW, viewH) {
  const world = S.world;
  const cam = S.camera;
  const shakeX = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
  const shakeY = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
  const ox = cam.x - viewW / 2 + shakeX;
  const oy = cam.y - viewH / 2 + shakeY;
  S.viewOrigin = { x: ox, y: oy };

  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-ox, -oy);

  const vx0 = ox - 80, vy0 = oy - 80, vx1 = ox + viewW + 80, vy1 = oy + viewH + 80;
  drawGround(ctx, world, vx0, vy0, vx1, vy1);
  drawRoads(ctx, vx0, vy0, vx1, vy1);
  drawSkids(ctx);
  drawProps(ctx, world, vx0, vy0, vx1, vy1);
  drawMissionBeacon(ctx);
  for (const car of S.cars) if (inView(car.x, car.y, vx0, vy0, vx1, vy1)) drawCar(ctx, car);
  for (const ped of S.peds) if (inView(ped.x, ped.y, vx0, vy0, vx1, vy1)) drawPed(ctx, ped);
  if (S.mode !== 'title') drawPlayer(ctx);
  drawBullets(ctx);
  drawParticles(ctx);
  drawFloaters(ctx);
  ctx.restore();

  // Golden-hour wash + a soft vignette.
  const grad = ctx.createLinearGradient(0, 0, 0, viewH);
  grad.addColorStop(0, 'rgba(255,180,84,0.10)');
  grad.addColorStop(0.6, 'rgba(255,140,60,0.05)');
  grad.addColorStop(1, 'rgba(70,40,90,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
  const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.45, viewW / 2, viewH / 2, viewH * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,10,30,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, viewW, viewH);
}

function inView(x, y, x0, y0, x1, y1) { return x > x0 && x < x1 && y > y0 && y < y1; }

function drawGround(ctx, world, x0, y0, x1, y1) {
  // Grass texture: two tones in a checker of large squares.
  ctx.fillStyle = PALETTE.grassDark;
  const cell = 240;
  for (let gx = Math.floor(x0 / cell) * cell; gx < x1; gx += cell) {
    for (let gy = Math.floor(y0 / cell) * cell; gy < y1; gy += cell) {
      if (((gx / cell) + (gy / cell)) % 2 === 0) ctx.fillRect(gx, gy, cell, cell);
    }
  }
  // Parking lots.
  for (const lot of world.lots) {
    ctx.fillStyle = '#555a60';
    ctx.fillRect(lot.x - 6, lot.y - 6, lot.w + 12, lot.h + 12);
    ctx.strokeStyle = 'rgba(240,240,230,0.5)';
    ctx.lineWidth = 2;
    const cols = Math.max(1, Math.floor(lot.w / 64));
    const rows = Math.max(1, Math.floor(lot.h / 56));
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      ctx.strokeRect(lot.x + 8 + c * 64, lot.y + 6 + r * 56, 48, 44);
    }
  }
  // Beach sand, wet band, then animated water.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, WORLD.SAND_Y, WORLD.W, WORLD.WATER_Y - WORLD.SAND_Y);
  ctx.fillStyle = PALETTE.sandWet;
  ctx.fillRect(0, WORLD.WATER_Y - 26, WORLD.W, 26);
  const wg = ctx.createLinearGradient(0, WORLD.WATER_Y, 0, WORLD.H);
  wg.addColorStop(0, PALETTE.water);
  wg.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = wg;
  ctx.fillRect(0, WORLD.WATER_Y, WORLD.W, WORLD.H - WORLD.WATER_Y);
  // Foam line + drifting sparkle.
  ctx.strokeStyle = PALETTE.waterFoam;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = Math.max(0, x0); x < Math.min(WORLD.W, x1); x += 26) {
    const y = WORLD.WATER_Y + 4 + Math.sin(x * 0.02 + S.time * 1.4) * 3;
    if (x === Math.max(0, x0)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 26; i++) {
    const sx = ((i * 613 + Math.floor(S.time * 22)) % WORLD.W);
    const sy = WORLD.WATER_Y + 24 + ((i * 197) % (WORLD.H - WORLD.WATER_Y - 40));
    if (sx > x0 && sx < x1) ctx.fillRect(sx, sy, 16, 2);
  }
  // The pier: wooden decking over the water at the south-east.
  const pier = world.pier;
  ctx.fillStyle = PALETTE.dockDark;
  ctx.fillRect(pier.x - 6, pier.y, pier.w + 12, pier.h);
  ctx.fillStyle = PALETTE.dockWood;
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.strokeStyle = 'rgba(60,40,20,0.5)';
  ctx.lineWidth = 2;
  for (let y = pier.y + 14; y < pier.y + pier.h; y += 22) {
    ctx.beginPath(); ctx.moveTo(pier.x, y); ctx.lineTo(pier.x + pier.w, y); ctx.stroke();
  }
  // A waiting boat at the pier end.
  const bx = pier.x + pier.w / 2, by = pier.y + pier.h - 6;
  ctx.save();
  ctx.translate(bx, by);
  ctx.fillStyle = '#f2f0e8';
  ctx.beginPath();
  ctx.moveTo(-52, 0); ctx.lineTo(52, 0); ctx.lineTo(34, 22); ctx.lineTo(-34, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d94f3d';
  ctx.fillRect(-30, -12, 60, 12);
  ctx.restore();
}

function drawRoads(ctx, x0, y0, x1, y1) {
  // Sidewalk bands first (they sit under the asphalt edges).
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of WORLD.ROADS_X) ctx.fillRect(rx - HW - 16, 0, WORLD.ROAD_W + 32, WORLD.SAND_Y + 30);
  for (const ry of WORLD.ROADS_Y) ctx.fillRect(0, ry - HW - 16, WORLD.W, WORLD.ROAD_W + 32);
  // Asphalt.
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of WORLD.ROADS_X) ctx.fillRect(rx - HW, 0, WORLD.ROAD_W, WORLD.SAND_Y + 30);
  for (const ry of WORLD.ROADS_Y) ctx.fillRect(0, ry - HW, WORLD.W, WORLD.ROAD_W);
  // Centre dashes.
  ctx.fillStyle = PALETTE.centreLine;
  for (const rx of WORLD.ROADS_X) {
    for (let y = 12; y < WORLD.SAND_Y; y += 52) if (y > y0 - 60 && y < y1) ctx.fillRect(rx - 2, y, 4, 30);
  }
  for (const ry of WORLD.ROADS_Y) {
    for (let x = 12; x < WORLD.W; x += 52) if (x > x0 - 60 && x < x1) ctx.fillRect(x, ry - 2, 30, 4);
  }
  // Lane edge lines.
  ctx.fillStyle = 'rgba(232,220,192,0.65)';
  for (const rx of WORLD.ROADS_X) { ctx.fillRect(rx - HW + 5, 0, 3, WORLD.SAND_Y + 30); ctx.fillRect(rx + HW - 8, 0, 3, WORLD.SAND_Y + 30); }
  for (const ry of WORLD.ROADS_Y) { ctx.fillRect(0, ry - HW + 5, WORLD.W, 3); ctx.fillRect(0, ry + HW - 8, WORLD.W, 3); }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,235,0.55)';
  for (const rx of WORLD.ROADS_X) for (const ry of WORLD.ROADS_Y) {
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(rx + i * 20 - 6, ry - HW - 12, 12, 9);
      ctx.fillRect(rx + i * 20 - 6, ry + HW + 3, 12, 9);
      ctx.fillRect(rx - HW - 12, ry + i * 20 - 6, 9, 12);
      ctx.fillRect(rx + HW + 3, ry + i * 20 - 6, 9, 12);
    }
  }
}

function drawSkids(ctx) {
  ctx.strokeStyle = 'rgba(18,18,20,0.5)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (const s of S.skidmarks) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
  ctx.stroke();
}

function drawProps(ctx, world, x0, y0, x1, y1) {
  // Building shadows first (offset by "height"), then the buildings themselves.
  for (const b of world.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, x0 - 200, y0 - 200, x1 + 200, y1 + 200)) continue;
    const lift = 4 + b.floors * 2.1;
    ctx.fillStyle = PALETTE.roofShadow;
    ctx.fillRect(b.x + lift, b.y + lift, b.w, b.h);
  }
  for (const b of world.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, x0 - 200, y0 - 200, x1 + 200, y1 + 200)) continue;
    const lift = 4 + b.floors * 2.1;
    // Walls (the offset slab) then roof.
    ctx.fillStyle = shade(b.roof, -28);
    ctx.fillRect(b.x + lift * 0.5, b.y + lift * 0.5, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.trim;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    // Rooftop clutter: AC units and a water tank on the taller blocks.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const ac of b.ac) ctx.fillRect(b.x + ac.dx, b.y + ac.dy, 18, 13);
    if (b.floors > 7) {
      ctx.fillStyle = 'rgba(90,60,30,0.55)';
      ctx.beginPath(); ctx.arc(b.x + b.w * 0.72, b.y + b.h * 0.3, 11, 0, Math.PI * 2); ctx.fill();
    }
    if (b.sign) {
      ctx.save();
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,244,214,0.92)';
      ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      ctx.restore();
    }
  }
  // Crates.
  for (const c of world.crates) {
    if (!inView(c.x, c.y, x0, y0, x1, y1)) continue;
    ctx.fillStyle = '#a4713a';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = '#6f4a22';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + c.w, c.y + c.h); ctx.stroke();
  }
  // Lamps.
  ctx.fillStyle = '#2f3338';
  for (const l of world.lamps) {
    if (!inView(l.x, l.y, x0, y0, x1, y1)) continue;
    ctx.beginPath(); ctx.arc(l.x, l.y, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(l.x, l.y, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f3338';
  }
  // Palms: trunk + a star of fronds, swaying gently.
  for (const p of world.palms) {
    if (!inView(p.x, p.y, x0, y0, x1, y1)) continue;
    const sway = Math.sin(S.time * 1.3 + p.x * 0.05) * 2.2;
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 4 * p.s;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + sway, p.y - 10 * p.s, p.x + sway * 1.6, p.y - 16 * p.s); ctx.stroke();
    ctx.strokeStyle = '#3f9142';
    ctx.lineWidth = 3 * p.s;
    const tx = p.x + sway * 1.6, ty = p.y - 16 * p.s;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + p.x;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * 12 * p.s, ty + Math.sin(a) * 8 * p.s - 3, tx + Math.cos(a) * 19 * p.s, ty + Math.sin(a) * 12 * p.s + 4);
      ctx.stroke();
    }
  }
}

function drawMissionBeacon(ctx) {
  const target = currentTarget();
  if (!target || S.mode === 'title') return;
  const pulse = 0.55 + Math.sin(S.time * 4) * 0.2;
  const grad = ctx.createLinearGradient(0, target.y - 340, 0, target.y);
  grad.addColorStop(0, 'rgba(255,210,61,0)');
  grad.addColorStop(1, 'rgba(255,210,61,' + pulse + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(target.x - 13, target.y - 340, 26, 340);
  ctx.strokeStyle = 'rgba(255,210,61,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 26 + Math.sin(S.time * 4) * 4, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len, Wd = car.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(30,22,12,0.35)';
  ctx.fillRect(-L / 2 + 4, -Wd / 2 + 5, L, Wd);
  // Body.
  ctx.fillStyle = car.dead ? '#4a4d52' : car.color;
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7);
  ctx.fill();
  // Cabin + windows.
  ctx.fillStyle = 'rgba(18,24,32,0.88)';
  roundRect(ctx, -L * 0.16, -Wd * 0.4, L * 0.4, Wd * 0.8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,190,230,0.5)';
  roundRect(ctx, -L * 0.2, -Wd * 0.4, L * 0.07, Wd * 0.8, 3);
  ctx.fill();
  // Racing stripe for the muscle car, taxi sign, mission glow.
  if (car.model === 'muscle') { ctx.fillStyle = 'rgba(20,20,20,0.6)'; ctx.fillRect(-L / 2, -2.4, L, 4.8); }
  if (car.model === 'taxi') { ctx.fillStyle = '#fff6c9'; ctx.fillRect(-4, -5, 9, 10); }
  if (car.kind === 'mission') {
    ctx.strokeStyle = 'rgba(255,210,61,' + (0.65 + Math.sin(S.time * 5) * 0.3) + ')';
    ctx.lineWidth = 2.6;
    roundRect(ctx, -L / 2 - 3, -Wd / 2 - 3, L + 6, Wd + 6, 9);
    ctx.stroke();
  }
  // Headlights + taillights.
  ctx.fillStyle = '#fff7cf';
  ctx.fillRect(L / 2 - 3, -Wd * 0.32, 3, 5); ctx.fillRect(L / 2 - 3, Wd * 0.32 - 5, 3, 5);
  ctx.fillStyle = '#e0483a';
  ctx.fillRect(-L / 2, -Wd * 0.32, 3, 5); ctx.fillRect(-L / 2, Wd * 0.32 - 5, 3, 5);
  // Police livery + light bar.
  if (car.kind === 'police') {
    ctx.fillStyle = '#22304a';
    ctx.fillRect(-L * 0.32, -Wd / 2, L * 0.2, Wd);
    const flash = Math.sin((car.ai ? car.ai.lightPhase : 0)) > 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    roundRect(ctx, -7, -Wd * 0.34, 14, Wd * 0.3, 3); ctx.fill();
    ctx.fillStyle = flash ? '#4060ff' : '#ff4040';
    roundRect(ctx, -7, Wd * 0.04, 14, Wd * 0.3, 3); ctx.fill();
    ctx.fillStyle = flash ? 'rgba(255,64,64,0.20)' : 'rgba(64,96,255,0.20)';
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
  }
  // Damage smoke.
  if (car.health < 45 && !car.dead) {
    ctx.fillStyle = 'rgba(60,60,60,' + (0.35 + Math.random() * 0.2) + ')';
    ctx.beginPath(); ctx.arc(L * 0.3, 0, 6 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7); ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.dead) {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    roundRect(ctx, -11, -5, 22, 10, 5); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(14, 0, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = ped.speed > 4 ? Math.sin(ped.phase) * 1.6 : 0;
  ctx.fillStyle = 'rgba(30,22,12,0.3)';
  ctx.beginPath(); ctx.ellipse(1.5, 2.5, 8, 5.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(ped.angle);
  // Legs (simple stride scissor).
  ctx.strokeStyle = '#3a3f4a';
  ctx.lineWidth = 3.4;
  const stride = ped.speed > 4 ? Math.sin(ped.phase) * 5 : 0;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-3 + stride * 0.4, -4.6);
  ctx.moveTo(0, 0); ctx.lineTo(-3 - stride * 0.4, 4.6);
  ctx.stroke();
  // Body + head.
  ctx.fillStyle = ped.shirt;
  roundRect(ctx, -6.4, -5.4 + bob * 0.2, 12, 10.8, 4.4); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(3.4, bob * 0.2, 4.6, 0, Math.PI * 2); ctx.fill();
  if (ped.state === 'flee') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText('!', 6, -8);
  }
  ctx.restore();
}

function drawPlayer(ctx) {
  const p = S.player;
  if (p.car) {
    // While driving, a small "you" ring under the car keeps the eye anchored.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.car.len * 0.72, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  // A soft pulsing ring marks the player on foot, like the ring under their car.
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + Math.sin(S.time * 4) * 0.15) + ')';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 0, 15.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(30,22,12,0.32)';
  ctx.beginPath(); ctx.ellipse(1.5, 3, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(p.angle);
  const bob = (p.vx || p.vy) ? Math.sin(p.stepPhase) * 1.8 : 0;
  ctx.strokeStyle = '#27324a';
  ctx.lineWidth = 3.8;
  const stride = (p.vx || p.vy) ? Math.sin(p.stepPhase) * 5.4 : 0;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-3 + stride * 0.4, -5);
  ctx.moveTo(0, 0); ctx.lineTo(-3 - stride * 0.4, 5);
  ctx.stroke();
  // Torso: the player's signature teal jacket.
  ctx.fillStyle = '#17a398';
  roundRect(ctx, -7, -6 + bob * 0.2, 13.4, 12, 5); ctx.fill();
  ctx.fillStyle = '#f4d35e';
  ctx.fillRect(-7, -1.4 + bob * 0.2, 13.4, 2.8);
  // Head + cap.
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath(); ctx.arc(3.6, bob * 0.2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d94f3d';
  ctx.beginPath(); ctx.arc(3.2, bob * 0.2, 5, Math.PI * 0.9, Math.PI * 1.9); ctx.fill();
  // Gun arm while aiming or firing.
  if (S.input.mouseDown || weapon.muzzle > 0) {
    ctx.strokeStyle = '#e0ac69';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(15, 2); ctx.stroke();
    ctx.fillStyle = '#22252a';
    ctx.fillRect(13, 0.4, 9, 3.2);
    if (weapon.muzzle > 0) {
      ctx.fillStyle = 'rgba(255,210,90,0.95)';
      ctx.beginPath();
      ctx.moveTo(22, 2); ctx.lineTo(31, -1.6); ctx.lineTo(29, 2); ctx.lineTo(31, 5.4);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

function drawBullets(ctx) {
  ctx.strokeStyle = 'rgba(255,230,150,0.9)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const b of S.bullets) {
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
  }
  ctx.stroke();
}

function drawParticles(ctx) {
  for (const pt of S.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 17px system-ui, sans-serif';
  for (const f of S.floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    const y = f.y - (1.6 - f.life) * 26;
    ctx.strokeText(f.text, f.x, y);
    ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Darken/lighten a #rrggbb colour by an amount (-255..255).
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) + amt), 0, 255);
  const g = clamp(((n >> 8 & 0xff) + amt), 0, 255);
  const b = clamp(((n & 0xff) + amt), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
