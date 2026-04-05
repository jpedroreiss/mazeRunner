export const Sound = (() => {
  let audioCtx = null;

  function getContext() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, duration, type = 'sine', volume = 0.2) {
    const ctx = getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function sweep(f0, f1, duration, type = 'sine', volume = 0.2) {
    const ctx = getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(f0, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(f1, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  const effects = {
    collect() { sweep(330, 660, 0.07, 'sine', 0.15); setTimeout(() => sweep(660, 990, 0.05, 'sine', 0.1), 65); },
    powerup() { [220, 330, 440, 660].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.12), i * 50)); },
    exit() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sine', 0.2), i * 100)); },
    death() { sweep(380, 50, 0.6, 'sawtooth', 0.25); setTimeout(() => sweep(260, 30, 0.4, 'square', 0.15), 250); },
    wallshift() { sweep(80, 160, 0.3, 'triangle', 0.1); },
    nightfall() { sweep(300, 150, 0.8, 'sine', 0.12); },
    dawn() { sweep(150, 350, 0.6, 'sine', 0.12); },
    tick() { tone(880, 0.04, 'sine', 0.08); },
  };

  function play(name) {
    try {
      if (effects[name]) effects[name]();
    } catch (e) {
      // silently ignore audio errors
    }
  }

  return { play };
})();
