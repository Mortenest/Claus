/**
 * WebAudio-synthesized sound effects — no audio files, instant load. One
 * lazily-created AudioContext, unlocked by the first user gesture, master
 * gain gated by the sound setting, suspended when the tab hides. Every
 * effect is a tiny oscillator/noise recipe; sfx(name, {pitch, gain}).
 */

export function createAudio(soundEnabled) {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  const lastPlayed = new Map(); // throttle spammy effects

  function ensure() {
    if (ctx === null) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const seconds = 1;
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  /** Call from any first pointer event to satisfy autoplay policies. */
  function unlock() {
    if (soundEnabled()) ensure();
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (soundEnabled()) ctx.resume();
  });

  function tone({ freq = 440, to = null, type = 'triangle', duration = 0.1, gain = 0.2, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise({ duration = 0.15, gain = 0.2, from = 400, to = 2400, q = 1.4, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  const recipes = {
    swap: () => noise({ duration: 0.12, gain: 0.12, from: 500, to: 2600 }),
    reject: () => {
      tone({ freq: 140, type: 'square', duration: 0.07, gain: 0.12 });
      tone({ freq: 110, type: 'square', duration: 0.09, gain: 0.12, delay: 0.09 });
    },
    pop: (p) => tone({ freq: 330 * p, to: 660 * p, type: 'triangle', duration: 0.09, gain: 0.2 }),
    special: (p) => {
      tone({ freq: 440 * p, duration: 0.09, gain: 0.16 });
      tone({ freq: 660 * p, duration: 0.12, gain: 0.16, delay: 0.07 });
    },
    blast: () => {
      tone({ freq: 95, to: 42, type: 'sine', duration: 0.22, gain: 0.35 });
      noise({ duration: 0.18, gain: 0.16, from: 900, to: 240, q: 0.8 });
    },
    land: () => noise({ duration: 0.04, gain: 0.06, from: 700, to: 350, q: 2 }),
    shuffle: () => noise({ duration: 0.5, gain: 0.14, from: 300, to: 1800, q: 1 }),
    bonus: (p) => tone({ freq: 520 * p, to: 780 * p, duration: 0.07, gain: 0.16 }),
    star: (p) => tone({ freq: 880 * p, type: 'sine', duration: 0.3, gain: 0.2 }),
    win: () => {
      [523, 659, 784, 1047].forEach((freq, i) =>
        tone({ freq, duration: 0.22, gain: 0.18, delay: i * 0.11 }),
      );
    },
    lose: () => {
      tone({ freq: 392, duration: 0.25, gain: 0.16 });
      tone({ freq: 311, duration: 0.4, gain: 0.16, delay: 0.22 });
    },
  };

  const throttleMs = { land: 45, pop: 30 };

  function sfx(name, { pitch = 1 } = {}) {
    if (!soundEnabled() || !recipes[name]) return;
    if (!ensure()) return;
    const gap = throttleMs[name];
    if (gap) {
      const last = lastPlayed.get(name) ?? 0;
      if (ctx.currentTime * 1000 - last < gap) return;
      lastPlayed.set(name, ctx.currentTime * 1000);
    }
    recipes[name](pitch);
  }

  return { sfx, unlock };
}
