import { clamp } from "./utils.js";

export const PERMANENT_UPGRADE_KEYS = [
  "maxHealth",
  "healthRegen",
  "fireRate",
  "xpGain",
  "pickupRange",
  "damage",
  "moveSpeed"
];

export const COMBAT_ONLY_UPGRADE_KEYS = [
  "projectileBounce",
  "multishot",
  "frontShot",
  "diagonalShot",
  "reverseShot",
  "homing"
];

export const UPGRADE_KEYS = [...PERMANENT_UPGRADE_KEYS, ...COMBAT_ONLY_UPGRADE_KEYS];

export const RARITIES = {
  common: {
    key: "common",
    label: "Common",
    multiplier: 1,
    color: "#00e0ff",
    weight: 58
  },
  uncommon: {
    key: "uncommon",
    label: "Uncommon",
    multiplier: 1.25,
    color: "#52ff94",
    weight: 24
  },
  rare: {
    key: "rare",
    label: "Rare",
    multiplier: 1.5,
    color: "#b967ff",
    weight: 12
  },
  legendary: {
    key: "legendary",
    label: "Legendary",
    multiplier: 2,
    color: "#ffe15c",
    weight: 5
  },
  mythic: {
    key: "mythic",
    label: "Mythic",
    multiplier: 3,
    color: "#ff8a2a",
    weight: 1
  }
};

export const UPGRADES = {
  maxHealth: {
    key: "maxHealth",
    label: "Max Health",
    baseCost: 10,
    unit: "+20 health",
    effectPerLevel: 20,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel)} max health`;
    }
  },
  healthRegen: {
    key: "healthRegen",
    label: "Health Regen",
    baseCost: 12,
    unit: "+0.25/sec",
    effectPerLevel: 0.25,
    permanent: true,
    describe(level) {
      return `+${(level * this.effectPerLevel).toFixed(2)} health/sec`;
    }
  },
  fireRate: {
    key: "fireRate",
    label: "Fire Rate",
    baseCost: 15,
    unit: "+8%",
    effectPerLevel: 0.08,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% fire rate`;
    }
  },
  xpGain: {
    key: "xpGain",
    label: "XP Gain",
    baseCost: 10,
    unit: "+10%",
    effectPerLevel: 0.1,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% XP`;
    }
  },
  pickupRange: {
    key: "pickupRange",
    label: "Pickup Range",
    baseCost: 10,
    unit: "+18 range",
    effectPerLevel: 18,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel)} pickup range`;
    }
  },
  damage: {
    key: "damage",
    label: "Damage",
    baseCost: 14,
    unit: "+20%",
    effectPerLevel: 0.2,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% damage`;
    }
  },
  moveSpeed: {
    key: "moveSpeed",
    label: "Move Speed",
    baseCost: 12,
    unit: "+7%",
    effectPerLevel: 0.07,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% move speed`;
    }
  },
  projectileBounce: {
    key: "projectileBounce",
    label: "Projectile Bounce",
    unit: "+1 bounce",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${Math.floor(level * this.effectPerLevel)} bounces`;
    }
  },
  multishot: {
    key: "multishot",
    label: "Multishot",
    unit: "+1 projectile",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${Math.floor(level * this.effectPerLevel)} side projectiles`;
    }
  },
  frontShot: {
    key: "frontShot",
    label: "Front Shot",
    unit: "+1 forward projectile",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${Math.floor(level * this.effectPerLevel)} forward projectiles`;
    }
  },
  diagonalShot: {
    key: "diagonalShot",
    label: "Diagonal Shot",
    unit: "+2 diagonal projectiles",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${Math.floor(level * this.effectPerLevel) * 2} diagonal projectiles`;
    }
  },
  reverseShot: {
    key: "reverseShot",
    label: "Reverse Shot",
    unit: "+1 rear projectile",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${Math.floor(level * this.effectPerLevel)} rear projectiles`;
    }
  },
  homing: {
    key: "homing",
    label: "Homing Projectiles",
    unit: "Tracking",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      const strengths = ["Weak", "Moderate", "Strong", "Perfect"];
      return `Homing: ${strengths[Math.min(Math.floor(level), strengths.length - 1)]}`;
    }
  }
};

export function makeUpgradeLevels(value = 0, keys = UPGRADE_KEYS) {
  return Object.fromEntries(keys.map((key) => [key, value]));
}

export function rollRarity() {
  const entries = Object.values(RARITIES);
  const totalWeight = entries.reduce((sum, rarity) => sum + rarity.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const rarity of entries) {
    roll -= rarity.weight;
    if (roll <= 0) return rarity;
  }

  return RARITIES.common;
}

export function upgradeCost(key, level) {
  return UPGRADES[key].baseCost * (level + 1);
}

export function totalUpgradeLevel(meta, run, key) {
  return (meta.upgrades?.[key] || 0) + (run?.temporaryUpgrades?.[key] || 0);
}

export function wholeUpgradeLevel(meta, run, key) {
  return Math.floor(totalUpgradeLevel(meta, run, key));
}

export function maxHealthFor(meta, run) {
  return 100 + totalUpgradeLevel(meta, run, "maxHealth") * UPGRADES.maxHealth.effectPerLevel;
}

export function regenFor(meta, run) {
  return totalUpgradeLevel(meta, run, "healthRegen") * UPGRADES.healthRegen.effectPerLevel;
}

export function shotCooldownFor(meta, run) {
  const fireRateBonus = totalUpgradeLevel(meta, run, "fireRate") * UPGRADES.fireRate.effectPerLevel;
  return 0.26 / (1 + fireRateBonus);
}

export function xpMultiplierFor(meta, run) {
  return 1 + totalUpgradeLevel(meta, run, "xpGain") * UPGRADES.xpGain.effectPerLevel;
}

export function pickupRangeFor(meta, run) {
  return 145 + totalUpgradeLevel(meta, run, "pickupRange") * UPGRADES.pickupRange.effectPerLevel;
}

export function damageFor(meta, run) {
  return 1 * (1 + totalUpgradeLevel(meta, run, "damage") * UPGRADES.damage.effectPerLevel);
}

export function moveSpeedFor(meta, run) {
  return 260 * (1 + totalUpgradeLevel(meta, run, "moveSpeed") * UPGRADES.moveSpeed.effectPerLevel);
}

export const EXTRA_SHOT_UPGRADES = {
  multishot: { label: "Side Shot", category: "extraShot" },
  frontShot: { label: "Front Shot", category: "extraShot" },
  diagonalShot: { label: "Diagonal Shot", category: "extraShot" },
  reverseShot: { label: "Reverse Shot", category: "extraShot" },
  homing: { label: "Homing", category: "extraShot" },
  projectileBounce: { label: "Bounce", category: "extraShot" }
};

export function difficultyFor(time) {
  if (time <= 0) return 0;
  return Math.log2(1 + time / 600);
}

export function enemyHealthScale(time) {
  return 1 + difficultyFor(time) * 3;
}

export function damageScale(time) {
  return 1 + difficultyFor(time) * 1.5;
}

export function enemySpeedScale(time) {
  return 1 + clamp(difficultyFor(time) * 0.4, 0, 1.2);
}

export function spawnDelayFor(time) {
  return clamp(0.9 - time * 0.012, 0.15, 0.9);
}

export function isExtraShotUpgrade(key) {
  return key in EXTRA_SHOT_UPGRADES;
}

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
