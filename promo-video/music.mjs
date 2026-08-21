// Synthesizes the 30s background music track (128 BPM electronic ad groove)
// Output: audio/music.wav (44.1kHz stereo 16-bit)
import { writeFileSync, mkdirSync } from 'fs';

const SR = 44100;
const DUR = 30;
const N = SR * DUR;
const BPM = 128;
const BEAT = 60 / BPM;          // 0.46875s
const BAR = BEAT * 4;           // 1.875s → 16 bars in 30s
const L = new Float64Array(N);
const R = new Float64Array(N);

const TAU = Math.PI * 2;
// D minor progression: Dm — Bb — F — C  (one chord per bar)
const ROOTS = [73.42, 58.27, 87.31, 65.41];
const CHORDS = [
  [146.83, 174.61, 220.00],   // Dm
  [116.54, 146.83, 174.61],   // Bb
  [174.61, 220.00, 261.63],   // F
  [130.81, 164.81, 196.00],   // C
];

const secToIdx = t => Math.floor(t * SR);
function addMono(t0, dur, fn, pan = 0) {
  const i0 = Math.max(0, secToIdx(t0));
  const i1 = Math.min(N, secToIdx(t0 + dur));
  const gl = Math.min(1, 1 - pan), gr = Math.min(1, 1 + pan);
  for (let i = i0; i < i1; i++) {
    const t = i / SR - t0;
    const v = fn(t);
    L[i] += v * gl;
    R[i] += v * gr;
  }
}

// ---------- drum voices ----------
const kick = (t0, vol = 1) => addMono(t0, 0.32, t => {
  const f = 42 + 110 * Math.exp(-t * 38);
  return Math.sin(TAU * f * t - 4 * Math.exp(-t * 38)) * Math.exp(-t * 11) * 0.9 * vol;
});
let nseed = 1234567;
const nrand = () => { nseed = (nseed * 1103515245 + 12345) & 0x7fffffff; return nseed / 0x3fffffff - 1; };
const hat = (t0, vol = 1, open = false) => {
  let hp = 0, prev = 0;
  addMono(t0, open ? 0.18 : 0.055, t => {
    const n = nrand();
    hp = n - prev + hp * 0.72; prev = n;   // crude highpass
    return hp * Math.exp(-t * (open ? 26 : 80)) * 0.24 * vol;
  }, (t0 / BEAT) % 2 < 1 ? 0.25 : -0.25);
};
const clap = (t0, vol = 1) => {
  let bp = 0, bp2 = 0;
  addMono(t0, 0.22, t => {
    const n = nrand();
    bp = 0.92 * bp + 0.08 * n; bp2 = 0.85 * bp2 + 0.15 * (n - bp);
    const burst = (Math.exp(-t * 30) + 0.5 * Math.exp(-Math.max(0, t - 0.012) * 34) + 0.3 * Math.exp(-Math.max(0, t - 0.026) * 38));
    return bp2 * burst * 0.85 * vol;
  });
};
const impact = (t0, vol = 1) => {
  addMono(t0, 1.6, t => {
    const f = 30 + 46 * Math.exp(-t * 9);
    return Math.sin(TAU * f * t) * Math.exp(-t * 2.6) * 0.95 * vol;
  });
  let hp = 0, prev = 0;
  addMono(t0, 0.5, t => {
    const n = nrand(); hp = n - prev + hp * 0.6; prev = n;
    return hp * Math.exp(-t * 12) * 0.3 * vol;
  });
};
const riser = (t0, dur, vol = 1) => {
  let hp = 0, prev = 0;
  addMono(t0, dur, t => {
    const k = t / dur;
    const n = nrand();
    const a = 0.55 + 0.45 * k;                 // opening filter feel
    hp = n - prev + hp * a; prev = n;
    return hp * Math.pow(k, 2.2) * 0.34 * vol;
  });
};

// ---------- tonal voices ----------
const bassNote = (t0, f, dur, vol = 1) => {
  let lp = 0;
  addMono(t0, dur, t => {
    const raw = Math.sin(TAU * f * t) + 0.42 * Math.sin(TAU * f * 2 * t) + 0.18 * Math.sin(TAU * f * 3 * t);
    lp = lp + 0.16 * (raw - lp);
    const env = Math.min(1, t / 0.008) * Math.exp(-t * 6.5);
    return lp * env * 0.68 * vol;
  });
};
const pluck = (t0, f, vol = 1, pan = 0) => addMono(t0, 0.30, t => {
  const raw = Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2 * t + 0.4) + 0.22 * Math.sin(TAU * f * 3.01 * t);
  return raw * Math.exp(-t * 16) * 0.16 * vol;
}, pan);
const padChord = (t0, tones, dur, vol = 1) => {
  for (let k = 0; k < tones.length; k++) {
    const f = tones[k];
    const pan = (k - 1) * 0.4;
    addMono(t0, dur, t => {
      const det = 1 + 0.0021 * Math.sin(TAU * 0.31 * t + k);
      const v = Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * det * t + 1.3) + 0.3 * Math.sin(TAU * f * 0.5 * t);
      const att = Math.min(1, t / 0.5);
      const rel = Math.min(1, (dur - t) / 0.6);
      return v * att * rel * 0.085 * vol;
    }, pan);
  }
};

// ---------- arrangement ----------
const FULL_START = 2 * BAR;          // groove kicks in at 3.75s
const PEAK_START = 8 * BAR;          // 15.0s dashboard: peak energy
const BREAK_START = Math.round(22.5 / BAR) * BAR; // 22.5s: breakdown
const FINAL = 27.2;                  // logo impact

for (let bar = 0; bar < 16; bar++) {
  const t0 = bar * BAR;
  const chord = CHORDS[bar % 4];
  const root = ROOTS[bar % 4];
  const inIntro = t0 < FULL_START;
  const inBreak = t0 >= BREAK_START - 0.01 && t0 < FINAL;
  const inFinal = t0 >= FINAL - 0.3;
  const peak = t0 >= PEAK_START - 0.01 && t0 < BREAK_START;

  // pads always (quiet in intro, swell at final)
  padChord(t0, chord, BAR + 0.1, inIntro ? 0.7 : inFinal ? 1.25 : inBreak ? 1.0 : 0.85);

  if (inFinal) continue; // final section handled below

  // kick: 4 on the floor (not in intro bar 1)
  for (let b = 0; b < 4; b++) {
    const tb = t0 + b * BEAT;
    if (tb >= FINAL - 0.05) break;
    if (!inIntro || bar === 1) kick(tb, inBreak ? 0.8 : 1);
    // offbeat hats
    if (!inIntro) hat(tb + BEAT / 2, inBreak ? 0.55 : 0.9);
    // 16th shaker at peak
    if (peak) { hat(tb + BEAT / 4, 0.35); hat(tb + 3 * BEAT / 4, 0.35); }
    // clap on 2 & 4
    if ((b === 1 || b === 3) && !inIntro && !inBreak) clap(tb, peak ? 0.9 : 0.7);
    // rolling bass on 8ths
    if (!inIntro) {
      const oct = b % 2 === 0 ? 1 : 2;
      bassNote(tb, root * (inBreak ? 1 : oct === 2 && b === 3 ? 2 : 1), BEAT * 0.48, inBreak ? 0.7 : 1);
      bassNote(tb + BEAT / 2, root, BEAT * 0.4, inBreak ? 0.5 : 0.8);
    }
  }
  // arp: 16ths cycling chord tones up an octave
  if (!inIntro || bar === 1) {
    const seq = [0, 1, 2, 1];
    for (let s = 0; s < 16; s++) {
      const tt = t0 + s * BEAT / 4;
      if (tt >= FINAL - 0.05) break;
      const tone = chord[seq[s % 4]] * 2 * (s % 8 === 7 ? 2 : 1);
      pluck(tt, tone, inBreak ? 0.5 : peak ? 1.0 : 0.75, s % 2 ? 0.45 : -0.45);
      // echo
      pluck(tt + BEAT * 0.75, tone, 0.28 * (inBreak ? 0.5 : 1), s % 2 ? -0.4 : 0.4);
    }
  }
}

// transitions: risers into groove, peak, and finale; impacts at drops
riser(FULL_START - 1.4, 1.4, 0.8);
impact(FULL_START, 0.75);
riser(PEAK_START - 1.5, 1.5, 1.0);
impact(PEAK_START, 0.85);
riser(FINAL - 1.6, 1.6, 1.05);
impact(FINAL, 1.15);

// finale: big sustained Dm chord + sparse kicks
padChord(FINAL, [146.83, 174.61, 220.00, 293.66], 2.6, 1.5);
bassNote(FINAL, 73.42, 1.8, 1.1);
kick(FINAL + BEAT * 2, 0.7);

// ---------- master ----------
// gentle stereo widen + soft clip + fades
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let fade = 1;
  if (t < 0.05) fade = t / 0.05;
  if (t > 28.9) fade = Math.max(0, (30 - t) / 1.1);
  const mid = (L[i] + R[i]) / 2, side = (L[i] - R[i]) / 2;
  let l = (mid + side * 1.25) * fade, r = (mid - side * 1.25) * fade;
  L[i] = Math.tanh(l * 1.15) * 0.92;
  R[i] = Math.tanh(r * 1.15) * 0.92;
}

// ---------- write WAV ----------
mkdirSync('audio', { recursive: true });
const bytes = new ArrayBuffer(44 + N * 4);
const dv = new DataView(bytes);
const wstr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
wstr(0, 'RIFF'); dv.setUint32(4, 36 + N * 4, true); wstr(8, 'WAVE');
wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
wstr(36, 'data'); dv.setUint32(40, N * 4, true);
for (let i = 0; i < N; i++) {
  dv.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, L[i] * 32767)), true);
  dv.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, R[i] * 32767)), true);
}
writeFileSync('audio/music.wav', Buffer.from(bytes));
console.log('audio/music.wav written:', (bytes.byteLength / 1e6).toFixed(1), 'MB');
