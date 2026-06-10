import { clamp } from "../utils.js";
import { DIFFICULTY } from "../configs/index.js";

export function difficultyFor(time) {
  if (time <= 0) return 0;
  const ratio = time / DIFFICULTY.halfTime.value;
  return Math.pow(ratio, DIFFICULTY.exponent.value);
}

export function enemyHealthScale(time) {
  return 1 + difficultyFor(time) * DIFFICULTY.enemyHealthCoefficient.value;
}

export function damageScale(time) {
  return 1 + difficultyFor(time) * DIFFICULTY.damageScaleCoefficient.value;
}

export function enemySpeedScale(time) {
  return 1 + clamp(difficultyFor(time) * DIFFICULTY.enemySpeedCoefficient.value, 0, DIFFICULTY.enemySpeedCap.value);
}

export function enemyContactDamageScale(time) {
  return 1 + difficultyFor(time) * DIFFICULTY.enemyContactDamageCoefficient.value;
}

export function spawnDelayFor(time) {
  return clamp(DIFFICULTY.spawnDelayStart.value - time * DIFFICULTY.spawnDelayRate.value, DIFFICULTY.spawnDelayMin.value, DIFFICULTY.spawnDelayStart.value);
}
