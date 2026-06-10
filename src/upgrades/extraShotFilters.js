import { EXTRA_SHOT_RARITY_LEVELS } from "../configs/index.js";

export const EXTRA_SHOT_UPGRADES = {
  multishot: { label: "Multishot", category: "extraShot" },
  frontShot: { label: "Front Shot", category: "extraShot" },
  diagonalShot: { label: "Diagonal Shot", category: "extraShot" },
  reverseShot: { label: "Reverse Shot", category: "extraShot" },
  homing: { label: "Homing", category: "extraShot" },
  projectileBounce: { label: "Bounce", category: "extraShot" }
};

export function isExtraShotUpgrade(key) {
  return key in EXTRA_SHOT_UPGRADES;
}

export function extraShotLevelForRarity(rarityKey) {
  return EXTRA_SHOT_RARITY_LEVELS[rarityKey] || 1;
}

export function extraShotLevel(run, key) {
  if (!isExtraShotUpgrade(key)) return 0;
  return run.temporaryUpgrades[key] || 0;
}

export function getSelectedExtraShots(run) {
  return run.selectedExtraShots || new Set();
}

export function getHighestExtraShotRarity(run, key) {
  if (!isExtraShotUpgrade(key)) return 0;
  return run.temporaryUpgrades[key] || 0;
}

export function filterUpgradeChoices(choices, run) {
  return choices.filter(choice => {
    if (!isExtraShotUpgrade(choice.key)) return true;
    if (!run.selectedExtraShots?.has(choice.key)) return true;
    const currentLevel = run.temporaryUpgrades[choice.key] || 0;
    const newLevel = extraShotLevelForRarity(choice.rarity.key);
    return newLevel > currentLevel;
  });
}
