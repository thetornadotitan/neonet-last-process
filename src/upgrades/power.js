import { PLAYER, ENEMY_TYPES, ENEMIES, POWER } from "../configs/index.js";
import { damageFor, shotCooldownFor, maxHealthFor, regenFor, pickupRangeFor, moveSpeedFor, multishotBurstDelayFor } from "./stats.js";
import { damageScale, enemyHealthScale, enemySpeedScale, enemyContactDamageScale, spawnDelayFor } from "./difficulty.js";
import { extraShotLevel } from "./extraShotFilters.js";
import { clamp } from "../utils.js";

export function playerDps(meta, run) {
  const dmg = damageFor(meta, run) * damageScale(run.time);
  const cooldown = shotCooldownFor(meta, run);
  const shotsPerVolley = 1 + extraShotLevel(run, "multishot");
  const burstDelay = multishotBurstDelayFor(meta, run);
  const volleyTime = cooldown + Math.max(0, shotsPerVolley - 1) * burstDelay;
  const shotsPerSecond = shotsPerVolley / volleyTime;

  const bulletsPerShot = 1
    + extraShotLevel(run, "frontShot")
    + extraShotLevel(run, "diagonalShot") * 2
    + extraShotLevel(run, "reverseShot");

  return dmg * shotsPerSecond * bulletsPerShot;
}

export function playerEhp(meta, run) {
  return maxHealthFor(meta, run) + regenFor(meta, run) * POWER.ehpRegenWindow.value;
}

export function playerUtility(meta, run) {
  const homing = extraShotLevel(run, "homing");
  const bounce = extraShotLevel(run, "projectileBounce");
  const pickup = pickupRangeFor(meta, run);
  const speed = moveSpeedFor(meta, run);

  return (homing * POWER.homingWeight.value)
       + (bounce * POWER.bounceWeight.value)
       + (pickup / PLAYER.basePickupRange.value * POWER.pickupWeight.value)
       + (speed / PLAYER.baseSpeed.value * POWER.speedWeight.value);
}

export function playerPower(meta, run) {
  return POWER.wDPS.value * playerDps(meta, run)
       + POWER.wEHP.value * playerEhp(meta, run)
       + POWER.wUtility.value * playerUtility(meta, run);
}

export function enemyEhp(enemyType, time) {
  return enemyType.health.value * enemyHealthScale(time);
}

export function enemyDps(time) {
  return PLAYER.contactDamage.value * enemyContactDamageScale(time) * POWER.enemyContactRate.value;
}

export function spawnPower(time) {
  const spawnDelay = spawnDelayFor(time);
  const spawnsPerSecond = 1 / spawnDelay;
  const fastChance = clamp(
    time / ENEMIES.fastChanceRampRate.value,
    ENEMIES.fastChanceMin.value,
    ENEMIES.fastChanceMax.value
  );
  const normal = ENEMY_TYPES.find(t => t.key === "normal");
  const fast = ENEMY_TYPES.find(t => t.key === "fast");
  const avgEhp = (1 - fastChance) * enemyEhp(normal, time) + fastChance * enemyEhp(fast, time);
  return avgEhp * spawnsPerSecond;
}

export function enemyPower(time) {
  return POWER.wEnemyDPS.value * enemyDps(time)
       + POWER.wEnemyEHP.value * spawnPower(time)
       + POWER.wSpawn.value * spawnPower(time);
}
