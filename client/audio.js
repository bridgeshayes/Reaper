// Procedural sound effects (Web Audio). No audio files: every sound is synthesized from noise and oscillators.
// window.SFX.play(name, volume) · SFX.toggle() mutes/unmutes (remembered per browser).
(() => {
let ac = null, master = null, noiseBuf = null, muted = false, vol = 1;
try { muted = localStorage.getItem('ro_mute') === '1'; } catch (e) { /* storage blocked: default unmuted */ }
function init() {
  if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function env(g, t0, dur, v, attack) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * vol), t0 + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
function nz(dt, dur, o) {
  const t0 = ac.currentTime + dt, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
  f.frequency.setValueAtTime(o.f0, t0); f.frequency.exponentialRampToValueAtTime(o.f1 || o.f0, t0 + dur);
  env(g, t0, dur, o.v, o.a); s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
}
function tone(dt, dur, o) {
  const t0 = ac.currentTime + dt, s = ac.createOscillator(), g = ac.createGain();
  s.type = o.type || 'sine'; s.frequency.setValueAtTime(o.f0, t0); s.frequency.exponentialRampToValueAtTime(o.f1 || o.f0, t0 + dur);
  env(g, t0, dur, o.v, o.a); s.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
}
const BANK = {
  razor: () => { nz(0, 0.17, { f0: 2600, f1: 500, q: 1.4, v: 0.4 }); tone(0.02, 0.1, { type: 'triangle', f0: 3200, f1: 2200, v: 0.03 }); },
  whip: () => { nz(0, 0.2, { f0: 300, f1: 2800, q: 2, v: 0.28 }); nz(0.15, 0.05, { type: 'highpass', f0: 2500, v: 0.7 }); tone(0.15, 0.03, { type: 'square', f0: 1900, f1: 900, v: 0.08 }); },
  fist: () => { tone(0, 0.55, { f0: 150, f1: 32, v: 0.9 }); nz(0, 0.5, { type: 'lowpass', f0: 1400, f1: 90, v: 0.6 }); tone(0, 0.3, { type: 'sawtooth', f0: 80, f1: 30, v: 0.18 }); nz(0.02, 0.25, { f0: 5000, f1: 1200, q: 0.7, v: 0.12 }); },
  dash: () => { nz(0, 0.24, { f0: 500, f1: 2600, q: 0.8, v: 0.25 }); },
  guard: () => { tone(0, 0.06, { type: 'triangle', f0: 900, f1: 700, v: 0.05 }); },
  parry: () => { for (const [f, v] of [[1320, 0.12], [1985, 0.08], [2650, 0.06], [3960, 0.03]]) tone(0, 0.6, { type: 'triangle', f0: f, f1: f * 0.98, v }); nz(0, 0.06, { type: 'highpass', f0: 3000, v: 0.4 }); },
  hit: () => { tone(0, 0.12, { f0: 190, f1: 60, v: 0.45 }); nz(0, 0.09, { f0: 1300, f1: 400, q: 1, v: 0.35 }); },
  crit: () => { tone(0, 0.15, { f0: 220, f1: 50, v: 0.55 }); nz(0, 0.1, { f0: 2000, f1: 500, v: 0.4 }); tone(0, 0.18, { type: 'triangle', f0: 1500, f1: 1450, v: 0.07 }); },
  hurt: () => { tone(0, 0.22, { type: 'square', f0: 130, f1: 55, v: 0.12 }); nz(0, 0.2, { type: 'lowpass', f0: 900, f1: 200, v: 0.5 }); },
  die: () => { nz(0, 0.55, { type: 'lowpass', f0: 1600, f1: 90, v: 0.35 }); tone(0, 0.4, { type: 'triangle', f0: 320, f1: 60, v: 0.14 }); },
  mslash: () => { nz(0, 0.14, { f0: 1300, f1: 450, q: 1.2, v: 0.22 }); },
  mshot: () => { tone(0, 0.16, { type: 'square', f0: 1100, f1: 260, v: 0.07 }); nz(0, 0.08, { type: 'highpass', f0: 2500, v: 0.18 }); },
  mslam: () => { tone(0, 0.5, { f0: 95, f1: 30, v: 0.75 }); nz(0, 0.45, { type: 'lowpass', f0: 500, f1: 60, v: 0.5 }); },
  wall: () => { tone(0, 0.3, { f0: 85, f1: 38, v: 0.6 }); nz(0, 0.25, { type: 'lowpass', f0: 1200, f1: 120, v: 0.45 }); },
  lvl: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(i * 0.09, 0.5, { type: 'triangle', f0: f, v: 0.14 })); },
  quest: () => { [784, 988, 1175].forEach((f, i) => tone(i * 0.07, 0.35, { type: 'triangle', f0: f, v: 0.1 })); },
  block: () => { tone(0, 0.18, { type: 'square', f0: 620, f1: 540, v: 0.06 }); tone(0, 0.25, { type: 'triangle', f0: 1240, f1: 1180, v: 0.07 }); nz(0, 0.05, { type: 'highpass', f0: 2500, v: 0.35 }); },
  engine: () => { nz(0, 1.4, { type: 'lowpass', f0: 180, f1: 1400, v: 0.45, a: 0.4 }); tone(0, 1.4, { type: 'sawtooth', f0: 55, f1: 160, v: 0.12, a: 0.5 }); nz(0.3, 1.1, { f0: 800, f1: 4000, q: 0.8, v: 0.18, a: 0.5 }); },
  land: () => { nz(0, 1.2, { type: 'lowpass', f0: 1600, f1: 150, v: 0.35, a: 0.05 }); tone(0, 1.0, { type: 'sawtooth', f0: 150, f1: 50, v: 0.08 }); tone(1.0, 0.12, { f0: 90, f1: 50, v: 0.4 }); },
  coin: () => { tone(0, 0.12, { type: 'triangle', f0: 1760, v: 0.07 }); tone(0.06, 0.2, { type: 'triangle', f0: 2349, v: 0.06 }); },
  gather: () => { nz(0, 0.12, { f0: 1800, f1: 900, q: 2, v: 0.25 }); tone(0.05, 0.25, { type: 'triangle', f0: 1320, f1: 1480, v: 0.07 }); tone(0.12, 0.3, { type: 'triangle', f0: 1980, v: 0.05 }); },
  anvil: () => { for (const [f, v] of [[880, 0.12], [1320, 0.09], [2217, 0.05]]) tone(0, 0.7, { type: 'triangle', f0: f, v }); nz(0, 0.05, { type: 'highpass', f0: 3000, v: 0.5 }); tone(0.25, 0.6, { type: 'triangle', f0: 1320, v: 0.06 }); },
  click: () => { tone(0, 0.04, { type: 'triangle', f0: 1200, f1: 900, v: 0.05 }); },
  deny: () => { tone(0, 0.08, { type: 'square', f0: 180, f1: 150, v: 0.04 }); },
};
window.SFX = {
  play(name, v) { if (muted || !BANK[name] || !init()) return; vol = v == null ? 1 : Math.max(0, Math.min(1, v)); if (vol < 0.03) return; BANK[name](); },
  unlock() { init(); },
  toggle() { muted = !muted; try { localStorage.setItem('ro_mute', muted ? '1' : '0'); } catch (e) { /* not persisted */ } if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
  get muted() { return muted; },
};
})();
