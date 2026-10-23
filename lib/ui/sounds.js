/**
 * Subtle UI sounds, synthesised (no audio files). Optional: a single on/off
 * preference in localStorage, toggled from the account menu. Sounds only play
 * after the page has had a user gesture (browser autoplay rules) and never
 * while the tab is hidden.
 *
 *   message   soft two-note chime (a partner message while chat is closed)
 *   voiceOn   gentle rising tone      voiceOff   gentle falling tone
 *   dice      three quick ticks (a die lands)   capture   a short drop (a piece sent back)
 *   shot      a short noise burst (the range)   hit / bullseye   a ding when a target is hit
 */
const KEY = "our-place:sounds";
let context = null;
const listeners = new Set();

export function soundsEnabled() {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(enabled) {
  try {
    window.localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    // preference just isn't remembered
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSounds(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NOTES = {
  message: [
    [880, 0, 0.09],
    [1174.66, 0.08, 0.14],
  ],
  voiceOn: [
    [523.25, 0, 0.08],
    [783.99, 0.07, 0.12],
  ],
  voiceOff: [
    [783.99, 0, 0.08],
    [523.25, 0.07, 0.12],
  ],
  dice: [
    [392, 0, 0.035],
    [466.16, 0.05, 0.035],
    [587.33, 0.1, 0.06],
  ],
  move: [[587.33, 0, 0.05]],
  card: [
    [880, 0, 0.03],
    [698.46, 0.035, 0.05],
  ],
  snap: [
    [987.77, 0, 0.04],
    [1318.51, 0.04, 0.07],
  ],
  capture: [
    [659.25, 0, 0.06],
    [392, 0.06, 0.13],
  ],
  // A game ends: a bright rising arpeggio for a win (or finishing together), a soft fall otherwise.
  win: [
    [523.25, 0, 0.09],
    [659.25, 0.09, 0.09],
    [783.99, 0.18, 0.09],
    [1046.5, 0.27, 0.22],
  ],
  lose: [
    [493.88, 0, 0.12],
    [392, 0.12, 0.2],
  ],
  hit: [[1318.51, 0, 0.09]],
  bullseye: [
    [1318.51, 0, 0.07],
    [1975.53, 0.06, 0.16],
  ],
};

/** The range's shot: a short burst of filtered noise (no audio files). */
function noiseBurst(ctx, start) {
  const length = Math.floor(ctx.sampleRate * 0.16);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = 0.22;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
}

export function playSound(name) {
  if (typeof window === "undefined" || !(NOTES[name] || name === "shot") || !soundsEnabled() || document.visibilityState !== "visible") return;
  if (!navigator.userActivation?.hasBeenActive && navigator.userActivation) return;
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") context.resume().catch(() => {});
    const start = context.currentTime + 0.01;
    if (name === "shot") return noiseBurst(context, start);
    for (const [frequency, offset, length] of NOTES[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + offset);
      gain.gain.linearRampToValueAtTime(0.045, start + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + length + 0.02);
    }
  } catch {
    // sound is decoration; never let it break anything
  }
}
