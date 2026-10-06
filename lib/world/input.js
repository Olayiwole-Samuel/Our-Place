/**
 * Movement input shared by the keyboard and the touch joystick. It is a plain
 * mutable object read inside the render loop — deliberately not React or
 * Zustand state, so holding a key or dragging the joystick never re-renders
 * anything.
 *
 * getMove() returns a vector in "screen" terms: x = right, y = forward,
 * length ≤ 1. The player converts it to world space using the camera's yaw.
 */
const KEY_DIRECTIONS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export const MOVEMENT_KEYS = Object.freeze(Object.keys(KEY_DIRECTIONS));

export function createInputState() {
  const pressed = new Set();
  const joystick = { x: 0, y: 0 };

  return {
    pressKey(code) {
      if (KEY_DIRECTIONS[code]) pressed.add(code);
    },
    releaseKey(code) {
      pressed.delete(code);
    },
    releaseAll() {
      pressed.clear();
      joystick.x = 0;
      joystick.y = 0;
    },
    setJoystick(x, y) {
      joystick.x = x;
      joystick.y = y;
    },
    getMove() {
      let x = joystick.x;
      let y = joystick.y;
      for (const code of pressed) {
        x += KEY_DIRECTIONS[code][0];
        y += KEY_DIRECTIONS[code][1];
      }
      const length = Math.hypot(x, y);
      return length > 1 ? { x: x / length, y: y / length } : { x, y };
    },
  };
}

/** True when a keyboard event targets a text field, where WASD must type letters. */
export function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true;
}
