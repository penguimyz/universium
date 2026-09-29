/* UI sounds, synthesized with Web Audio. No audio files to download.
   The AudioContext is created on the first user gesture (browsers block it before that). */
window.sfx = (() => {
  let ctx = null, master = null, enabled = true;

  function ready() {
    if (!enabled) return false;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      // A touch of compression keeps overlapping blips from clipping.
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // One enveloped oscillator: freq can glide from f0 to f1.
  function tone({ f0, f1 = f0, dur = 0.08, type = 'sine', gain = 0.3, delay = 0, attack = 0.005 }) {
    if (!ready()) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.18, from = 400, to = 2400, gain = 0.12 }) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
  }

  const note = semi => 523.25 * Math.pow(2, semi / 12); // C5 based

  const api = {
    set enabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    unlock: () => ready(),
    tick:   () => tone({ f0: 1400, f1: 900, dur: 0.045, type: 'triangle', gain: 0.12 }),
    nav:    () => { tone({ f0: 660, f1: 880, dur: 0.07, type: 'sine', gain: 0.14 }); },
    pop:    () => tone({ f0: 420, f1: 900, dur: 0.09, type: 'triangle', gain: 0.2 }),
    close:  () => tone({ f0: 700, f1: 320, dur: 0.1, type: 'triangle', gain: 0.16 }),
    open:   () => noise({ dur: 0.22, from: 500, to: 3200, gain: 0.07 }),
    shut:   () => noise({ dur: 0.18, from: 2800, to: 500, gain: 0.06 }),
    toggle: on => tone({ f0: on ? 740 : 520, f1: on ? 988 : 392, dur: 0.07, type: 'sine', gain: 0.15 }),
    chime:  () => { tone({ f0: note(4), dur: 0.35, gain: 0.14 }); tone({ f0: note(11), dur: 0.5, gain: 0.11, delay: 0.08 }); },
    error:  () => { tone({ f0: 330, dur: 0.12, type: 'square', gain: 0.05 }); tone({ f0: 247, dur: 0.18, type: 'square', gain: 0.05, delay: 0.1 }); },
    launch: () => [0, 4, 7, 12].forEach((s, i) => tone({ f0: note(s), dur: 0.22, type: 'triangle', gain: 0.12, delay: i * 0.055 })),
    send:   () => tone({ f0: 500, f1: 1100, dur: 0.12, type: 'sine', gain: 0.14 }),
    recv:   () => { tone({ f0: note(7), dur: 0.14, gain: 0.1 }); tone({ f0: note(12), dur: 0.2, gain: 0.08, delay: 0.06 }); },
  };

  // Unlock on the first gesture so the first real sound isn't swallowed.
  const unlock = () => { if (enabled) ready(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  return api;
})();
