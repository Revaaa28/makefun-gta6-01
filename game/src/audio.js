// audio.js — a tiny WebAudio synth. No audio files: every sound is an oscillator
// or a burst of filtered noise, built on the fly. The context is created lazily on
// the first user gesture (browser autoplay rules), and M toggles a master mute.

import { S } from './state.js';

let ctx = null;
let master = null;
let engineNodes = null;   // {osc, gain, filter} while the player is driving
let sirenNodes = null;    // {osc, gain, lfo} while wanted > 0 and a cop is near

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = S.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    S.audioOn = true;
  } catch { ctx = null; }
}

export function setMuted(m) {
  S.muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone({ freq = 440, freqEnd = null, dur = 0.15, type = 'sine', gain = 0.2, delay = 0 }) {
  if (!ctx || S.muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, freq = 1000, q = 0.8, gain = 0.25, delay = 0, type = 'bandpass' }) {
  if (!ctx || S.muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

export const sfx = {
  click() { tone({ freq: 660, dur: 0.06, type: 'triangle', gain: 0.15 }); },
  shot() {
    noise({ dur: 0.14, freq: 1800, gain: 0.32 });
    tone({ freq: 160, freqEnd: 60, dur: 0.1, type: 'square', gain: 0.12 });
  },
  dryFire() { tone({ freq: 1200, dur: 0.04, type: 'square', gain: 0.08 }); },
  reload() {
    tone({ freq: 300, dur: 0.05, type: 'square', gain: 0.1 });
    tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.1, delay: 0.35 });
  },
  punch() {
    noise({ dur: 0.09, freq: 500, gain: 0.3, type: 'lowpass' });
    tone({ freq: 120, freqEnd: 50, dur: 0.09, type: 'sine', gain: 0.25 });
  },
  crash(big = false) {
    noise({ dur: big ? 0.4 : 0.2, freq: 300, gain: big ? 0.4 : 0.22, type: 'lowpass' });
    tone({ freq: 90, freqEnd: 40, dur: big ? 0.35 : 0.18, type: 'triangle', gain: 0.2 });
  },
  honk() {
    tone({ freq: 370, dur: 0.22, type: 'square', gain: 0.07 });
    tone({ freq: 466, dur: 0.22, type: 'square', gain: 0.07 });
  },
  pickup() {
    tone({ freq: 880, dur: 0.09, type: 'sine', gain: 0.18 });
    tone({ freq: 1320, dur: 0.14, type: 'sine', gain: 0.18, delay: 0.08 });
  },
  cash() {
    tone({ freq: 1046, dur: 0.09, type: 'triangle', gain: 0.16 });
    tone({ freq: 1318, dur: 0.09, type: 'triangle', gain: 0.16, delay: 0.07 });
    tone({ freq: 1568, dur: 0.16, type: 'triangle', gain: 0.16, delay: 0.14 });
  },
  phone() {
    tone({ freq: 1174, dur: 0.1, type: 'sine', gain: 0.12 });
    tone({ freq: 1174, dur: 0.1, type: 'sine', gain: 0.12, delay: 0.16 });
  },
  busted() {
    tone({ freq: 392, dur: 0.22, type: 'sawtooth', gain: 0.14 });
    tone({ freq: 311, dur: 0.22, type: 'sawtooth', gain: 0.14, delay: 0.2 });
    tone({ freq: 233, dur: 0.4, type: 'sawtooth', gain: 0.14, delay: 0.4 });
  },
  wasted() {
    tone({ freq: 220, freqEnd: 55, dur: 0.9, type: 'sawtooth', gain: 0.16 });
  },
  door() { tone({ freq: 200, freqEnd: 120, dur: 0.08, type: 'triangle', gain: 0.15 }); },
};

// Continuous engine hum while driving; pitch follows speed.
export function engineSound(speedRatio, running) {
  if (!ctx) return;
  if (running && !engineNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    osc.connect(filter); filter.connect(g); g.connect(master);
    osc.start();
    engineNodes = { osc, g, filter };
  }
  if (engineNodes) {
    const t = ctx.currentTime;
    engineNodes.osc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
    engineNodes.filter.frequency.setTargetAtTime(300 + speedRatio * 900, t, 0.08);
    engineNodes.g.gain.setTargetAtTime(S.muted ? 0 : 0.05 + speedRatio * 0.05, t, 0.1);
    if (!running) {
      const nodes = engineNodes; engineNodes = null;
      nodes.g.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => { try { nodes.osc.stop(); } catch { /* already stopped */ } }, 300);
    }
  }
}

// Two-tone police siren, audible while a chase is on.
export function sirenSound(on) {
  if (!ctx) return;
  if (on && !sirenNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 160;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    const g = ctx.createGain(); g.gain.value = 0;
    osc.connect(g); g.connect(master);
    osc.start(); lfo.start();
    sirenNodes = { osc, lfo, g };
  }
  if (sirenNodes) {
    sirenNodes.g.gain.setTargetAtTime(on && !S.muted ? 0.028 : 0, ctx.currentTime, 0.2);
    if (!on) {
      const nodes = sirenNodes; sirenNodes = null;
      setTimeout(() => { try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* noop */ } }, 600);
    }
  }
}
