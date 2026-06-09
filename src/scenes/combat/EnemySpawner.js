import { clamp } from "../../utils.js";
import { enemyHealthScale, enemySpeedScale, spawnDelayFor } from "../../upgrades/index.js";
import { ENEMY_TYPES, ENEMIES } from "../../configs/index.js";

export class EnemySpawner {
  update(run, dt) {
    const spawnDelay = spawnDelayFor(run.time);
    run.spawnTimer -= dt;
    while (run.spawnTimer <= 0) {
      run.spawnTimer += spawnDelay;
    }
  }

  spawn(run, viewport) {
    const { width, height } = viewport;
    const camera = run.camera;
    const edge = Math.floor(Math.random() * 4);
    const buffer = ENEMIES.spawnBuffer.value;
    let x = 0;
    let y = 0;

    if (edge === 0) {
      x = camera.x + Math.random() * width;
      y = camera.y - buffer;
    } else if (edge === 1) {
      x = camera.x + width + buffer;
      y = camera.y + Math.random() * height;
    } else if (edge === 2) {
      x = camera.x + Math.random() * width;
      y = camera.y + height + buffer;
    } else {
      x = camera.x - buffer;
      y = camera.y + Math.random() * height;
    }

    const fast = Math.random() < clamp(run.time / ENEMIES.fastChanceRampRate.value, ENEMIES.fastChanceMin.value, ENEMIES.fastChanceMax.value);
    const healthScale = enemyHealthScale(run.time);
    const speedScale = enemySpeedScale(run.time);
    const normalType = ENEMY_TYPES.find(t => t.key === "normal");
    const fastType = ENEMY_TYPES.find(t => t.key === "fast");
    const type = fast ? fastType : normalType;
    run.enemies.push({
      id: run.nextEnemyId,
      x, y,
      radius: type.radius.value,
      speed: type.speed.value * speedScale,
      health: type.health.value * healthScale,
      value: type.scoreValue.value,
      xp: type.xpValue.value,
      color: type.color
    });
    run.nextEnemyId += 1;
  }
}
