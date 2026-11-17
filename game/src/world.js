// world.js — generates the city of Costa Serena from a seed and answers spatial
// questions for everyone else: Is this point solid? Am I on a road? Where is the
// nearest intersection? The layout is a road grid over a coastal strip: five
// horizontal avenues, six vertical streets, beach and water along the south edge,
// and a wooden pier reaching into the bay at the south-east (the docks).

import { WORLD, PALETTE, ROOF_COLORS, NEON_COLORS, AWNING_COLORS } from './config.js';
import { RNG } from './random.js';

const HW = WORLD.ROAD_W / 2; // half road width

// Named places the missions and the bust respawn refer to.
export const PLACES = {
  garage: { x: 2910, y: 560, label: 'Marlowe’s Garage' },
  kiosk: { x: 420, y: 1990, label: 'Beach Kiosk' },
  buyer: { x: 3060, y: 2130, label: 'The Buyer' },
  depot: { x: 420, y: 420, label: 'North Depot' },
  marina: { x: 2760, y: 2130, label: 'Marina Office' },
  pierEnd: { x: 3120, y: 2470, label: 'Pier End' },
  station: { x: 1500, y: 1330, label: 'Police Station' },
  start: { x: 864, y: 980, label: 'Palmetto Row' },
};

export function generateWorld(seed) {
  const rand = new RNG(seed);
  const world = {
    seed,
    buildings: [],   // {x,y,w,h,floors,roof,trim,ac:[...],sign}
    palms: [],       // {x,y,s}
    lamps: [],       // {x,y}
    crates: [],      // {x,y,w,h} solid props
    lots: [],        // parking lots {x,y,w,h}
    pier: { x: 2980, y: WORLD.WATER_Y - 40, w: 280, h: WORLD.H - WORLD.WATER_Y + 40 },
    rng: rand,
  };

  // --- City blocks: the rectangles of land between neighbouring roads. ---
  const xEdges = [-60, ...WORLD.ROADS_X.flatMap(x => [x - HW, x + HW]), WORLD.W + 60];
  const yEdges = [-60, ...WORLD.ROADS_Y.flatMap(y => [y - HW, y + HW]), WORLD.SAND_Y];
  // xEdges/yEdges list land-strip boundaries: strips sit at index pairs (0,1),(2,3),...
  for (let yi = 0; yi + 1 < yEdges.length; yi += 2) {
    for (let xi = 0; xi + 1 < xEdges.length; xi += 2) {
      const bx = Math.max(10, xEdges[xi] + WORLD.SIDEWALK);
      const by = Math.max(10, yEdges[yi] + WORLD.SIDEWALK);
      const bw = Math.min(xEdges[xi + 1] - WORLD.SIDEWALK, WORLD.W - 10) - bx;
      const bh = Math.min(yEdges[yi + 1] - WORLD.SIDEWALK, WORLD.SAND_Y) - by;
      if (bw < 120 || bh < 100) continue;
      fillBlock(world, rand, bx, by, bw, bh);
    }
  }

  // --- Palms: along the coastal avenue and scattered on the sand. ---
  for (let x = 90; x < WORLD.W - 60; x += 90) {
    if (rand.chance(0.75)) world.palms.push({ x: x + rand.range(-16, 16), y: WORLD.ROADS_Y[4] + HW + 44, s: rand.range(0.8, 1.25) });
    if (rand.chance(0.5)) world.palms.push({ x: x + rand.range(-20, 20), y: rand.range(WORLD.SAND_Y + 30, WORLD.WATER_Y - 50), s: rand.range(0.85, 1.4) });
  }
  // --- Lamps: at intersections, offset to the corners. ---
  for (const rx of WORLD.ROADS_X) for (const ry of WORLD.ROADS_Y) {
    world.lamps.push({ x: rx - HW - 10, y: ry - HW - 10 });
    world.lamps.push({ x: rx + HW + 10, y: ry + HW + 10 });
  }
  // --- Crates near the docks and the depot. ---
  for (let i = 0; i < 10; i++) {
    world.crates.push({ x: 2880 + rand.range(0, 260), y: 2160 + rand.range(0, 90), w: 26, h: 26 });
  }
  for (let i = 0; i < 5; i++) {
    world.crates.push({ x: 330 + rand.range(0, 200), y: 330 + rand.range(0, 160), w: 26, h: 26 });
  }
  return world;
}

function fillBlock(world, rand, bx, by, bw, bh) {
  const kind = rand.weighted([['buildings', 62], ['parking', 16], ['park', 12], ['plaza', 10]]);
  if (kind === 'parking') {
    world.lots.push({ x: bx, y: by, w: bw, h: bh });
    return;
  }
  if (kind === 'park') {
    const n = Math.floor((bw * bh) / 16000);
    for (let i = 0; i < n; i++) {
      world.palms.push({ x: bx + rand.range(20, bw - 20), y: by + rand.range(20, bh - 20), s: rand.range(0.9, 1.5) });
    }
    return;
  }
  if (kind === 'plaza') {
    for (let i = 0; i < 4; i++) {
      world.crates.push({ x: bx + rand.range(10, bw - 40), y: by + rand.range(10, bh - 40), w: 24, h: 24 });
    }
    return;
  }
  // Buildings: split the block into a 1x1, 2x1, 1x2 or 2x2 arrangement with alleys.
  const cols = bw > 340 ? 2 : 1;
  const rows = bh > 300 ? 2 : 1;
  const gap = 26;
  const cw = (bw - gap * (cols - 1)) / cols;
  const ch = (bh - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (rand.chance(0.12)) continue; // the odd empty lot keeps the grid breathing
    const w = cw * rand.range(0.78, 0.97);
    const h = ch * rand.range(0.78, 0.97);
    const x = bx + c * (cw + gap) + (cw - w) / 2;
    const y = by + r * (ch + gap) + (ch - h) / 2;
    const floors = rand.int(2, 11);
    const ac = [];
    const acCount = rand.int(1, 4);
    for (let i = 0; i < acCount; i++) {
      ac.push({ dx: rand.range(6, w - 26), dy: rand.range(6, h - 20), kind: rand.weighted([['ac', 5], ['vent', 2], ['box', 2]]) });
    }
    const sign = rand.chance(0.4) ? rand.pick(SIGN_WORDS) : null;
    // Clubs and bars burn neon after dark; some hotels join in. Signed shops
    // often wear a striped awning over the pavement.
    const neonSet = sign ? NEON_COLORS[sign] : null;
    const neon = neonSet && (sign !== 'HOTEL' || rand.chance(0.5)) ? rand.pick(neonSet) : null;
    world.buildings.push({
      x, y, w, h, floors,
      roof: rand.pick(ROOF_COLORS),
      trim: rand.pick(['#f5efe2', '#d8cdb4', '#aebfd0', '#e8b4a0']),
      ac,
      sign,
      neon,
      awning: sign && rand.chance(0.55) ? rand.pick(AWNING_COLORS) : null,
    });
  }
}

const SIGN_WORDS = ['HOTEL', 'CAFE', 'BAR', 'GYM', 'DINER', 'SHOP', 'CLUB', 'TACO', 'SURF', 'PAWN'];

// --- Spatial queries -------------------------------------------------------

export function isWater(x, y) {
  return y >= WORLD.WATER_Y && !(x >= 2980 - 6 && x <= 2980 + 280 + 6 && y >= WORLD.WATER_Y - 46);
}

export function isSolid(world, x, y, pad = 0) {
  if (x < 8 || y < 8 || x > WORLD.W - 8 || y > WORLD.H - 8) return true;
  if (isWater(x, y)) return true;
  for (const b of world.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  for (const c of world.crates) {
    if (x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad) return true;
  }
  return false;
}

// Push a circle out of every building/crate it overlaps; returns the corrected
// position plus the strongest impact speed along the push (for crash effects).
export function resolveCircle(world, x, y, r) {
  let impact = 0;
  const solids = world.buildings.concat(world.crates);
  for (const b of solids) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
        impact = Math.max(impact, r - d);
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r; else y = b.y + b.h + r;
        impact = Math.max(impact, 6);
      }
    }
  }
  x = Math.max(r, Math.min(WORLD.W - r, x));
  y = Math.max(r, Math.min(WORLD.H - r, y));
  if (isWater(x, y)) y = WORLD.WATER_Y - r - 2;
  return { x, y, impact };
}

export function onRoad(x, y) {
  for (const rx of WORLD.ROADS_X) if (Math.abs(x - rx) <= HW) return true;
  for (const ry of WORLD.ROADS_Y) if (Math.abs(y - ry) <= HW) return true;
  return false;
}

export function nearestIntersection(x, y) {
  let best = null, bd = Infinity;
  for (const rx of WORLD.ROADS_X) for (const ry of WORLD.ROADS_Y) {
    const d = (x - rx) ** 2 + (y - ry) ** 2;
    if (d < bd) { bd = d; best = { x: rx, y: ry }; }
  }
  return best;
}

// A point on the sidewalk ring around a road intersection, used for ped targets
// and mission markers that must be reachable on foot.
export function sidewalkPointNear(x, y, rand) {
  const n = nearestIntersection(x, y);
  const off = HW + 16;
  const side = rand.int(0, 3);
  const along = rand.range(-HW + 10, HW - 10);
  if (side === 0) return { x: n.x + along, y: n.y - off };
  if (side === 1) return { x: n.x + along, y: n.y + off };
  if (side === 2) return { x: n.x - off, y: n.y + along };
  return { x: n.x + off, y: n.y + along };
}

export { PALETTE };
