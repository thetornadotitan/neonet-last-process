import { Input } from "./input.js";
import { Store } from "./store.js";
import { UI } from "./ui.js";
import { AudioManager } from "./audio.js";
import { HubScene } from "./scenes/hubScene.js";
import { CombatScene } from "./scenes/combat/CombatScene.js";
import { ENGINE } from "./configs/index.js";

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.viewport = { width: 0, height: 0, dpr: 1 };
    this.input = new Input();
    this.store = new Store();
    this.audioManager = new AudioManager(this.store);
    this.ui = new UI(this.store, this.audioManager);
    this.scenes = {
      hub: new HubScene(this),
      combat: new CombatScene(this)
    };
    this.scene = null;
    this.lastFrame = performance.now();

    window.addEventListener("resize", () => {
      this.resize();
      if (this.scene?.resize) this.scene.resize();
    });
  }

  start() {
    this.resize();
    this.setScene("hub");
    requestAnimationFrame((now) => this.frame(now));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.viewport = { width, height, dpr };
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setScene(name) {
    this.scene = this.scenes[name];
    this.scene.enter();
    this.lastFrame = performance.now();
  }

  frame(now) {
    const dt = Math.min((now - this.lastFrame) / 1000, ENGINE.maxDeltaTime.value);
    this.lastFrame = now;
    this.input.updateGamepads();
    this.scene.update(dt);
    this.scene.render(this.ctx);
    this.input.endFrame();
    requestAnimationFrame((next) => this.frame(next));
  }
}
