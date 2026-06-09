import { PLAYER, UPGRADE_VALUES } from "../configs/index.js";
import { UPGRADES, totalUpgradeLevel } from "./definitions.js";

export function maxHealthFor(meta, run) {
  return PLAYER.baseHealth.value + totalUpgradeLevel(meta, run, "maxHealth") * UPGRADES.maxHealth.effectPerLevel;
}

export function regenFor(meta, run) {
  return totalUpgradeLevel(meta, run, "healthRegen") * UPGRADES.healthRegen.effectPerLevel;
}

export function shotCooldownFor(meta, run) {
  const fireRateBonus = totalUpgradeLevel(meta, run, "fireRate") * UPGRADES.fireRate.effectPerLevel;
  return PLAYER.baseShotCooldown.value / (1 + fireRateBonus);
}

export function xpMultiplierFor(meta, run) {
  return 1 + totalUpgradeLevel(meta, run, "xpGain") * UPGRADES.xpGain.effectPerLevel;
}

export function pickupRangeFor(meta, run) {
  return PLAYER.basePickupRange.value + totalUpgradeLevel(meta, run, "pickupRange") * UPGRADES.pickupRange.effectPerLevel;
}

export function damageFor(meta, run) {
  return PLAYER.baseDamage.value * (1 + totalUpgradeLevel(meta, run, "damage") * UPGRADES.damage.effectPerLevel);
}

export function moveSpeedFor(meta, run) {
  return PLAYER.baseSpeed.value * (1 + totalUpgradeLevel(meta, run, "moveSpeed") * UPGRADES.moveSpeed.effectPerLevel);
}
