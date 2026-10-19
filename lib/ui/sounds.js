/**
 * Subtle UI sounds, synthesised (no audio files). Optional: a single on/off
 * preference in localStorage, toggled from the account menu. Sounds only play
 * after the page has had a user gesture (browser autoplay rules) and never
 * while the tab is hidden.
 *
 *   message   soft two-note chime (a partner message while chat is closed)
 *   voiceOn   gentle rising tone      voiceOff   gentle falling tone
 *   dice      three quick ticks (a die lands)   capture   a short drop (a piece sent back)
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
};

export function playSound(name) {
  if (typeof window === "undefined" || !NOTES[name] || !soundsEnabled() || document.visibilityState !== "visible") return;
  if (!navigator.userActivation?.hasBeenActive && navigator.userActivation) return;
  try {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") context.resume().catch(() => {});
    const start = context.currentTime + 0.01;
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
