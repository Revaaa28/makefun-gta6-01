// save.js — localStorage persistence: cash, mission progress and player position.
// Saved whenever a mission completes, a fine is paid, and every few seconds of play,
// so the title screen's Continue button can pick the run back up.

import { SAVE_KEY } from './config.js';
import { S, spawnPoint } from './state.js';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame() {
  try {
    const data = {
      cash: Math.round(S.player.cash),
      missionIndex: S.mission.index,
      allDone: S.mission.state === 'done',
      x: Math.round(S.player.x),
      y: Math.round(S.player.y),
      health: Math.round(S.player.health),
      stats: S.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* storage unavailable (private mode etc.) — play on without saving */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    S.player.cash = data.cash ?? S.player.cash;
    S.mission.index = data.missionIndex ?? 0;
    if (data.allDone) S.mission.state = 'done';
    const sp = spawnPoint();
    S.player.x = typeof data.x === 'number' ? data.x : sp.x;
    S.player.y = typeof data.y === 'number' ? data.y : sp.y;
    S.player.health = Math.min(100, Math.max(30, data.health ?? 100));
    if (data.stats) S.stats = data.stats;
    return true;
  } catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
}
