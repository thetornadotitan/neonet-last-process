import { makeUpgradeLevels, maxHealthFor, spawnDelayFor } from "../../upgrades/index.js";
import { PLAYER, CAMERA, PROGRESSION } from "../../configs/index.js";
import { PlayerController } from "./PlayerController.js";
import { EnemySpawner } from "./EnemySpawner.js";
import { WeaponSystem } from "./WeaponSystem.js";
import { CombatResolver } from "./CombatResolver.js";
import { ProgressionSystem } from "./ProgressionSystem.js";
import { CombatRenderer } from "./CombatRenderer.js";

export class CombatScene {
  constructor(app) {
    this.app = app;
    this.run = null;
    this.playerController = new PlayerController();
    this.enemySpawner = new EnemySpawner();
    this.weaponSystem = new WeaponSystem();
    this.combatResolver = new CombatResolver();
    this.progressionSystem = new ProgressionSystem();
    this.combatRenderer = new CombatRenderer();
  }

  enter() {
    const temporaryUpgrades = makeUpgradeLevels();
    const runShell = { temporaryUpgrades };
    const maxHealth = maxHealthFor(this.app.store.meta, runShell);

    this.run = {
      state: "running",
      time: 0,
      score: 0,
      spawnTimer: 0,
      shotTimer: 0,
      nextEnemyId: 1,
      shake: 0,
      reward: 0,
      level: 1,
      xp: 0,
      xpToNext: PROGRESSION.xpBase.value,
      temporaryUpgrades,
      levelChoices: [],
      selectedExtraShots: new Set(),
      extraShotRarities: {},
      rarityCounts: {},
      camera: { x: 0, y: 0 },
      player: {
        x: 0,
        y: 0,
        radius: PLAYER.radius.value,
        speed: PLAYER.baseSpeed.value,
        health: maxHealth,
        maxHealth,
        invulnerable: 0
      },
      enemies: [],
      bullets: [],
      particles: [],
      xpGems: []
    };

    this.app.ui.onLevelChoice = (choice) => this.chooseLevelUpgrade(choice);
    this.app.ui.closeLevelUp();
    this.app.ui.setMessage(null);
    this.app.ui.setPrompt("");
    this.app.ui.setCombat(this.run);
  }

  resize() {
    this.updateCamera();
  }

  update(dt) {
    if (this.run.state === "reward") {
      if (this.app.input.consumeAction("interact") || this.app.input.consumeAction("return")) {
        this.app.setScene("hub");
      }
      return;
    }

    if (this.run.state === "levelup") {
      if (this.app.input.consumeAction("uiLeft") || this.app.input.consumeAction("uiUp")) {
        this.app.ui.moveLevelSelection(-1);
      } else if (this.app.input.consumeAction("uiRight") || this.app.input.consumeAction("uiDown")) {
        this.app.ui.moveLevelSelection(1);
      } else if (this.app.input.consumeAction("uiConfirm") || this.app.input.consumeAction("interact")) {
        this.app.ui.confirmLevelSelection();
      }
      return;
    }

    if (this.app.input.consumeAction("pause")) {
      this.run.state = this.run.state === "paused" ? "running" : "paused";
      this.app.ui.setMessage(this.run.state === "paused" ? "paused" : null);
    }

    if (this.run.state !== "running") return;

    this.run.time += dt;
    this.run.shake = Math.max(0, this.run.shake - dt * CAMERA.shakeDecayRate.value);
    this.playerController.update(this.run, this.app.store.meta, this.app.input, dt);
    this.updateCamera();
    this.updateSpawns(dt);
    this.weaponSystem.update(this.run, this.app.store.meta, dt);
    this.weaponSystem.updateActors(this.run, dt);
    this.combatResolver.resolve(this.run, this.app.store.meta, (x, y, color, amount) => this.progressionSystem.burst(this.run, x, y, color, amount), (bullet, enemy) => this.weaponSystem.resolveBulletBounce(this.run, bullet, enemy));
    if (this.run.player.health <= 0 && this.run.state === "running") {
      this.finishRun();
    }
    this.progressionSystem.collectXp(this.run, this.app.store.meta, dt);
    this.progressionSystem.prune(this.run, this.app.viewport);
    this.app.ui.setCombat(this.run);
  }

  updateCamera() {
    if (!this.run) return;
    this.run.camera.x = this.run.player.x - this.app.viewport.width / 2;
    this.run.camera.y = this.run.player.y - this.app.viewport.height / 2;
  }

  updateSpawns(dt) {
    const spawnDelay = spawnDelayFor(this.run.time);
    this.run.spawnTimer -= dt;
    while (this.run.spawnTimer <= 0) {
      this.enemySpawner.spawn(this.run, this.app.viewport);
      this.run.spawnTimer += spawnDelay;
    }
  }

  chooseLevelUpgrade(choice) {
    this.progressionSystem.chooseLevelUpgrade(this.run, this.app.store.meta, choice);
    this.run.state = "running";
    this.app.ui.closeLevelUp();
    this.app.ui.setCombat(this.run);
  }

  finishRun() {
    this.progressionSystem.finishRun(this.run);
    this.app.store.addDiamonds(this.run.reward);
    this.run.state = "reward";
    this.app.ui.setCombat(this.run);
    this.app.ui.setMessage("reward", this.run.reward);
  }

  render(ctx) {
    this.combatRenderer.render(ctx, this.run, this.app.viewport, this.app.store.meta.settings.screenShake);
  }
}
