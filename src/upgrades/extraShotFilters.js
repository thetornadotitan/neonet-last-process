import { RARITIES } from "./definitions.js";

export function isExtraShotUpgrade(key) {
  return key in EXTRA_SHOT_UPGRADES;
}

export const EXTRA_SHOT_UPGRADES = {
  multishot: { label: "Side Shot", category: "extraShot" },
  frontShot: { label: "Front Shot", category: "extraShot" },
  diagonalShot: { label: "Diagonal Shot", category: "extraShot" },
  reverseShot: { label: "Reverse Shot", category: "extraShot" },
  homing: { label: "Homing", category: "extraShot" },
  projectileBounce: { label: "Bounce", category: "extraShot" }
};

export function getSelectedExtraShots(run) {
  return run.selectedExtraShots || new Set();
}

export function getHighestExtraShotRarity(run, key) {
  if (!isExtraShotUpgrade(key)) return 0;
  const rarityKey = run.extraShotRarities?.[key];
  if (!rarityKey) return 0;
  return RARITIES[rarityKey]?.multiplier || 0;
}

export function filterUpgradeChoices(choices, run) {
  const selected = getSelectedExtraShots(run);
  return choices.filter(choice => {
    if (!isExtraShotUpgrade(choice.key)) return true;
    if (!selected.has(choice.key)) return true;
    const currentHighestMultiplier = getHighestExtraShotRarity(run, choice.key);
    return choice.rarity.multiplier > currentHighestMultiplier;
  });
}
