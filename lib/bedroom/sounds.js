/**
 * Sleep sounds, made right here with Web Audio — no files to download, nothing
 * streamed, and they loop forever without a seam:
 *
 *   rain     filtered noise with soft gusts
 *   ocean    noise swelling and falling like waves (~10 s)
 *   fire     low crackle and pops
 *   night    crickets and a warm hum
 *   lullaby  a slow, gentle chord progression
 *
 * createSleepSound(kind) → { start(), stop(fadeSeconds), setVolume(0..1) }.
 * Each phone plays its own copy; which sound and the timer are shared
 * (public.couple_bedroom), so you hear the same thing together.
 */
export const SLEEP_SOUNDS = Object.freeze([
  { id: "rain", label: "Rain", emoji: "🌧️" },
  { id: "ocean", label: "Ocean", emoji: "🌊" },
  { id: "fire", label: "Fireplace", emoji: "🔥" },
  { id: "night", label: "Summer night", emoji: "🦗" },
  { id: "lullaby", label: "Soft music", emoji: "🎶" },
]);
export const SLEEP_TIMERS = Object.freeze([15, 30, 60, 120, null]);

let shared = null;
function audio() {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) return null;
  shared ??= new Context();
  return shared;
}

function noiseBuffer(ctx, seconds = 4, color = "white") {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "brown") {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white;
  }
  return buffer;
}

function loopNoise(ctx, color) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 4, color);
  source.loop = true;
  return source;
}

/** A slow wobble on an AudioParam (an LFO). */
function wobble(ctx, param, { rate, depth, base }) {
  const lfo = ctx.createOscillator();
  const gain = ctx.createGain();
  lfo.frequency.value = rate;
  gain.gain.value = depth;
  param.value = base;
  lfo.connect(gain).connect(param);
  lfo.start();
  return lfo;
}

const BUILDERS = {
  rain(ctx, out) {
    const noise = loopNoise(ctx, "white");
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 2400;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 400;
    const level = ctx.createGain();
    const lfo = wobble(ctx, level.gain, { rate: 0.07, depth: 0.12, base: 0.38 });
    noise.connect(high).connect(low).connect(level).connect(out);
    noise.start();
    return [noise, lfo];
  },
  ocean(ctx, out) {
    const noise = loopNoise(ctx, "brown");
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const level = ctx.createGain();
    const lfoLevel = wobble(ctx, level.gain, { rate: 0.1, depth: 0.42, base: 0.48 });
    const lfoFilter = wobble(ctx, filter.frequency, { rate: 0.1, depth: 500, base: 800 });
    noise.connect(filter).connect(level).connect(out);
    noise.start();
    return [noise, lfoLevel, lfoFilter];
  },
  fire(ctx, out) {
    const rumble = loopNoise(ctx, "brown");
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 300;
    const level = ctx.createGain();
    level.gain.value = 0.5;
    rumble.connect(low).connect(level).connect(out);
    rumble.start();
    // Crackles: tiny bursts of filtered noise at random moments.
    const crackle = ctx.createBufferSource();
    const length = ctx.sampleRate * 6;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0;
    crackle.buffer = buffer;
    crackle.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2500;
    crackle.connect(band).connect(out);
    crackle.start();
    return [rumble, crackle];
  },
  night(ctx, out) {
    const hum = loopNoise(ctx, "brown");
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 180;
    const humLevel = ctx.createGain();
    humLevel.gain.value = 0.25;
    hum.connect(low).connect(humLevel).connect(out);
    hum.start();
    // Crickets: a high tone chirping on and off.
    const chirp = ctx.createOscillator();
    chirp.frequency.value = 4300;
    const chirpLevel = ctx.createGain();
    const gate = ctx.createOscillator();
    gate.type = "square";
    gate.frequency.value = 14;
    const gateDepth = ctx.createGain();
    gateDepth.gain.value = 0.02;
    gate.connect(gateDepth).connect(chirpLevel.gain);
    const breath = wobble(ctx, gateDepth.gain, { rate: 0.6, depth: 0.02, base: 0.015 });
    chirpLevel.gain.value = 0;
    chirp.connect(chirpLevel).connect(out);
    chirp.start();
    gate.start();
    return [hum, chirp, gate, breath];
  },
  lullaby(ctx, out) {
    // Four slow chords (C · Am · F · G), each a soft pad that swells in and out.
    const chords = [
      [261.63, 329.63, 392.0],
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
    ];
    const level = ctx.createGain();
    level.gain.value = 0.16;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 1400;
    level.connect(warm).connect(out);
    const CHORD_S = 6;
    let timer = null;
    let index = 0;
    const play = () => {
      const at = ctx.currentTime;
      for (const frequency of chords[index % chords.length]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = frequency;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(0.33, at + 2);
        env.gain.linearRampToValueAtTime(0, at + CHORD_S + 1.5);
        osc.connect(env).connect(level);
        osc.start(at);
        osc.stop(at + CHORD_S + 1.6); // each chord ends by itself
      }
      index += 1;
    };
    play();
    timer = setInterval(play, CHORD_S * 1000);
    return [{ stop: () => clearInterval(timer) }];
  },
};

export function createSleepSound(kind) {
  const ctx = audio();
  if (!ctx || !BUILDERS[kind]) return null;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  let parts = null;
  let volume = 0.7;
  return {
    get blocked() {
      return ctx.state !== "running";
    },
    async start() {
      if (ctx.state !== "running") await ctx.resume().catch(() => {});
      if (!parts) parts = BUILDERS[kind](ctx, master);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2.5); // fade in
      return ctx.state === "running";
    },
    stop(fadeSeconds = 2) {
      if (!parts) return;
      const finishing = parts;
      parts = null;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSeconds);
      setTimeout(() => {
        for (const part of finishing) {
          try {
            part.stop();
          } catch {
            // already stopped
          }
        }
        master.disconnect();
      }, fadeSeconds * 1000 + 100);
    },
    setVolume(next) {
      volume = Math.max(0, Math.min(1, next));
      if (parts) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.2);
    },
  };
}
