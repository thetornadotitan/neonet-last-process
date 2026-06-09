import { normalize } from "./utils.js";

const PREVENT_DEFAULT_KEYS = new Set([
  "arrowup",
  "arrowright",
  "arrowdown",
  "arrowleft",
  "w",
  "a",
  "s",
  "d",
  "e",
  "p",
  "r",
  "escape"
]);

const KEY_ACTIONS = {
  e: ["interact", "uiConfirm"],
  enter: ["uiConfirm"],
  " ": ["interact", "uiConfirm"],
  escape: ["back"],
  p: ["pause"],
  r: ["return"],
  arrowleft: ["uiLeft"],
  arrowright: ["uiRight"],
  arrowup: ["uiUp"],
  arrowdown: ["uiDown"],
  a: ["uiLeft"],
  d: ["uiRight"],
  w: ["uiUp"],
  s: ["uiDown"]
};

const GAMEPAD_BUTTONS = {
  0: ["interact", "uiConfirm"],
  1: ["back"],
  8: ["back"],
  9: ["pause"],
  12: ["uiUp"],
  13: ["uiDown"],
  14: ["uiLeft"],
  15: ["uiRight"]
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.actionsPressed = new Set();
    this.previousGamepadButtons = new Set();
    this.previousAxisActions = new Set();
    this.deadzone = 0.24;

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (PREVENT_DEFAULT_KEYS.has(key)) event.preventDefault();
      if (!this.keys.has(key)) this.pressed.add(key);
      this.keys.add(key);
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
  }

  consume(key) {
    const normalized = key.toLowerCase();
    const wasPressed = this.pressed.has(normalized);
    this.pressed.delete(normalized);
    return wasPressed;
  }

  consumeAction(action) {
    if (this.actionsPressed.has(action)) {
      this.actionsPressed.delete(action);
      return true;
    }

    for (const [key, actions] of Object.entries(KEY_ACTIONS)) {
      if (actions.includes(action) && this.consume(key)) return true;
    }

    return false;
  }

  movementVector() {
    const gamepad = this.primaryGamepad();
    const stickX = gamepad ? this.applyDeadzone(gamepad.axes[0] || 0) : 0;
    const stickY = gamepad ? this.applyDeadzone(gamepad.axes[1] || 0) : 0;
    const keyX = (this.keys.has("arrowright") || this.keys.has("d") ? 1 : 0) - (this.keys.has("arrowleft") || this.keys.has("a") ? 1 : 0);
    const keyY = (this.keys.has("arrowdown") || this.keys.has("s") ? 1 : 0) - (this.keys.has("arrowup") || this.keys.has("w") ? 1 : 0);
    const x = Math.abs(stickX) > 0 ? stickX : keyX;
    const y = Math.abs(stickY) > 0 ? stickY : keyY;
    return normalize(x, y);
  }

  updateGamepads() {
    const gamepad = this.primaryGamepad();
    const currentButtons = new Set();
    if (!gamepad) {
      this.previousGamepadButtons.clear();
      this.previousAxisActions.clear();
      return;
    }

    gamepad.buttons.forEach((button, index) => {
      if (!button.pressed) return;
      currentButtons.add(index);
      if (!this.previousGamepadButtons.has(index)) {
        for (const action of GAMEPAD_BUTTONS[index] || []) {
          this.actionsPressed.add(action);
        }
      }
    });

    const axisX = this.applyDeadzone(gamepad.axes[0] || 0);
    const axisY = this.applyDeadzone(gamepad.axes[1] || 0);
    this.addAxisAction(axisX, "uiLeft", "uiRight");
    this.addAxisAction(axisY, "uiUp", "uiDown");
    this.previousGamepadButtons = currentButtons;
  }

  addAxisAction(value, negativeAction, positiveAction) {
    const negativeIndex = `axis:${negativeAction}`;
    const positiveIndex = `axis:${positiveAction}`;
    if (value < -0.62 && !this.previousAxisActions.has(negativeIndex)) {
      this.actionsPressed.add(negativeAction);
      this.previousAxisActions.add(negativeIndex);
    } else if (value >= -0.4) {
      this.previousAxisActions.delete(negativeIndex);
    }

    if (value > 0.62 && !this.previousAxisActions.has(positiveIndex)) {
      this.actionsPressed.add(positiveAction);
      this.previousAxisActions.add(positiveIndex);
    } else if (value <= 0.4) {
      this.previousAxisActions.delete(positiveIndex);
    }
  }

  primaryGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    return Array.from(gamepads).find(Boolean);
  }

  applyDeadzone(value) {
    return Math.abs(value) < this.deadzone ? 0 : value;
  }

  endFrame() {
    this.pressed.clear();
    this.actionsPressed.clear();
  }
}
