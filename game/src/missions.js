// missions.js — the story of Costa Serena, told in five jobs from fixer Vince
// Marlowe. Each mission is data: an intro text for the phone, a reward, and a
// list of steps. A step is a place to reach (with optional conditions: be in
// the marked car, have zero wanted stars, beat a timer) plus an optional effect
// on arrival. Completing the last step pays out and offers the next job.

import { S, addFloater, showMessage } from './state.js';
import { PLACES } from './world.js';
import { makeCar } from './vehicles.js';
import { reportCrime, clearWanted, starsForHeat } from './police.js';
import { WANTED } from './config.js';
import { sfx } from './audio.js';
import { saveGame } from './save.js';

export const FIXER = 'Vince Marlowe';

export const MISSIONS = [
  {
    title: 'First Errand',
    reward: 250,
    intro: 'Welcome to Costa Serena, kid. Simple first job: a package is waiting at the beach kiosk, south-west shore. Pick it up and bring it to my garage across town. Do not open it.',
    steps: [
      { label: 'Pick up the package at the beach kiosk', at: 'kiosk', r: 55 },
      { label: 'Deliver the package to Marlowe’s Garage', at: 'garage', r: 70 },
    ],
  },
  {
    title: 'Borrowed Wheels',
    reward: 400,
    intro: 'A gold muscle car is parked up on Palmetto Row, mid-town. The owner owes me. Take it — quietly if you can — and bring it to the garage.',
    setup() {
      const car = makeCar(1342, 1150, Math.PI / 2, {
        kind: 'mission', color: '#f2c33d', model: { name: 'muscle', len: 50, wid: 25 },
      });
      S.mission.targetCar = car;
    },
    steps: [
      { label: 'Steal the gold muscle car', followCar: true, r: 60 },
      { label: 'Deliver the gold car to the garage', at: 'garage', r: 75, needThisCar: true },
    ],
  },
  {
    title: 'Hot Buyer',
    reward: 600,
    intro: 'A buyer waits down by the docks with cash in hand. Meet him. If the meeting goes loud — and it will — lose the police before you come back to close the deal.',
    steps: [
      { label: 'Meet the buyer at the docks', at: 'buyer', r: 60, setStars: 2 },
      { label: 'Lose the cops!', needStars0: true },
      { label: 'Return to the buyer', at: 'buyer', r: 60 },
    ],
  },
  {
    title: 'Four Minutes Flat',
    reward: 800,
    intro: 'A crate at the garage needs to be at the North Depot in four minutes. The whole town is in your way. Drive it like you stole it — because legally, you did.',
    steps: [
      { label: 'Collect the crate at the garage', at: 'garage', r: 70 },
      { label: 'Reach the North Depot before time runs out', at: 'depot', r: 75, timer: 240 },
    ],
  },
  {
    title: 'The Last Boat',
    reward: 1500,
    intro: 'Last job, kid, then you are made. Check in at the marina office — every cop in the county will light up when you do. Then run for the end of the pier. A boat is waiting. Do not stop.',
    steps: [
      { label: 'Check in at the marina office', at: 'marina', r: 60, setStars: 3 },
      { label: 'Escape! Reach the end of the pier', at: 'pierEnd', r: 65 },
    ],
  },
];

// --- Runtime -----------------------------------------------------------------

export function maybeOfferMission() {
  const m = S.mission;
  if (m.state !== 'idle' || m.index >= MISSIONS.length) return;
  m.state = 'offered';
  const mission = MISSIONS[m.index];
  S.phoneQueue.push({ from: FIXER, title: mission.title, text: mission.intro, reward: mission.reward });
  sfx.phone();
}

export function acceptMission() {
  const m = S.mission;
  const mission = MISSIONS[m.index];
  if (!mission) { m.state = 'done'; return; }
  m.state = 'active';
  m.step = 0;
  m.timer = -1;
  if (mission.setup) mission.setup();
  applyStepEffects();
  updateObjectiveText();
  showMessage('Mission: ' + mission.title, 2.6);
}

function currentStep() {
  const mission = MISSIONS[S.mission.index];
  if (!mission || S.mission.state !== 'active') return null;
  return mission.steps[S.mission.step] || null;
}

export function currentTarget() {
  const step = currentStep();
  if (!step) return null;
  if (step.followCar) {
    const car = S.mission.targetCar;
    return car && !car.dead ? { x: car.x, y: car.y } : null;
  }
  if (step.needStars0) return null;      // no marker: just break line of sight
  const place = PLACES[step.at];
  return place ? { x: place.x, y: place.y } : null;
}

function applyStepEffects() {
  const step = currentStep();
  if (!step) return;
  if (typeof step.timer === 'number') S.mission.timer = step.timer;
}

function updateObjectiveText() {
  const step = currentStep();
  const mission = MISSIONS[S.mission.index];
  if (!step || !mission) { S.objective = ''; return; }
  let text = step.label;
  if (S.mission.timer > 0) text += '  (' + Math.ceil(S.mission.timer) + 's)';
  S.objective = text;
}

function setStars(n) {
  S.wanted.heat = WANTED.THRESHOLDS[n] + 15;
  S.wanted.stars = starsForHeat(S.wanted.heat);
  S.wanted.lastCrimeAt = S.time;
  S.fx.starPulse = 1;
  reportCrimeSilent();
}
function reportCrimeSilent() { /* heat already set; just keep the cops informed */ S.wanted.lastKnown = { x: S.player.x, y: S.player.y }; }

function completeMission() {
  const mission = MISSIONS[S.mission.index];
  S.player.cash += mission.reward;
  addFloater(S.player.x, S.player.y - 34, '+$' + mission.reward, '#7be495');
  showMessage('Mission complete: ' + mission.title + '  +$' + mission.reward, 3.4);
  sfx.cash();
  S.mission.index++;
  S.mission.step = 0;
  S.mission.timer = -1;
  S.mission.targetCar = null;
  if (S.mission.index >= MISSIONS.length) {
    S.mission.state = 'done';
    S.objective = 'All jobs done. Costa Serena is yours — free roam!';
    showMessage('Story complete! Vince: "You are made, kid. The city is yours."', 5);
  } else {
    S.mission.state = 'idle';
    S.objective = '';
  }
  saveGame();
}

function failMission(reason) {
  showMessage('Mission failed: ' + reason + ' — Vince sends you back out.', 3.4);
  sfx.busted();
  const mission = MISSIONS[S.mission.index];
  S.mission.step = 0;
  S.mission.timer = -1;
  if (mission && mission.setup) mission.setup();
  applyStepEffects();
  updateObjectiveText();
}

export function updateMissions(dt) {
  const m = S.mission;
  if (m.state !== 'active') return;
  const step = currentStep();
  if (!step) { completeMission(); return; }

  if (m.timer > 0) {
    m.timer -= dt;
    updateObjectiveText();
    if (m.timer <= 0) { failMission('Out of time'); return; }
  }

  // Step conditions.
  if (step.needStars0) {
    if (S.wanted.stars === 0) advanceStep();
    return;
  }
  const target = currentTarget();
  if (!target) return;
  const d = Math.hypot(S.player.x - target.x, S.player.y - target.y);
  if (d > step.r) return;
  if (step.needThisCar && S.player.car !== S.mission.targetCar) {
    S.objective = step.label + ' — you need the gold car!';
    return;
  }
  if (step.followCar && !S.player.car) {
    return; // standing next to it is not stealing it; wait for enterCar
  }
  if (step.followCar && S.player.car !== S.mission.targetCar) return;
  advanceStep(step);
}

function advanceStep(arrivedStep) {
  const step = arrivedStep || currentStep();
  if (step && typeof step.setStars === 'number') {
    setStars(step.setStars);
    showMessage('It went loud — the police are on you!', 2.6);
  }
  sfx.pickup();
  S.mission.step++;
  S.mission.timer = -1;
  const mission = MISSIONS[S.mission.index];
  if (S.mission.step >= mission.steps.length) {
    if (S.mission.index === MISSIONS.length - 1) clearWanted(); // the boat outruns the law
    completeMission();
  } else {
    applyStepEffects();
    updateObjectiveText();
  }
}
