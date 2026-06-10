import { UPGRADE_VALUES, RARITY_TIERS } from "../configs/index.js";

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

export const RARITIES = {};
for (const tier of RARITY_TIERS) {
  RARITIES[tier.key] = {
    key: tier.key,
    label: tier.label,
    multiplier: tier.multiplier.value,
    color: tier.color,
    weight: tier.weight.value
  };
}

export const UPGRADES = {
  maxHealth: {
    key: "maxHealth",
    label: "Max Health",
    baseCost: UPGRADE_VALUES.maxHealth.baseCost.value,
    unit: "+20 health",
    effectPerLevel: UPGRADE_VALUES.maxHealth.effectPerLevel.value,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel)} max health`;
    }
  },
  healthRegen: {
    key: "healthRegen",
    label: "Health Regen",
    baseCost: UPGRADE_VALUES.healthRegen.baseCost.value,
    unit: "+0.25/sec",
    effectPerLevel: UPGRADE_VALUES.healthRegen.effectPerLevel.value,
    permanent: true,
    describe(level) {
      return `+${(level * this.effectPerLevel).toFixed(2)} health/sec`;
    }
  },
  fireRate: {
    key: "fireRate",
    label: "Fire Rate",
    baseCost: UPGRADE_VALUES.fireRate.baseCost.value,
    unit: "+8%",
    effectPerLevel: UPGRADE_VALUES.fireRate.effectPerLevel.value,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% fire rate`;
    }
  },
  xpGain: {
    key: "xpGain",
    label: "XP Gain",
    baseCost: UPGRADE_VALUES.xpGain.baseCost.value,
    unit: "+10%",
    effectPerLevel: UPGRADE_VALUES.xpGain.effectPerLevel.value,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% XP`;
    }
  },
  pickupRange: {
    key: "pickupRange",
    label: "Pickup Range",
    baseCost: UPGRADE_VALUES.pickupRange.baseCost.value,
    unit: "+18 range",
    effectPerLevel: UPGRADE_VALUES.pickupRange.effectPerLevel.value,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel)} pickup range`;
    }
  },
  damage: {
    key: "damage",
    label: "Damage",
    baseCost: UPGRADE_VALUES.damage.baseCost.value,
    unit: "+20%",
    effectPerLevel: UPGRADE_VALUES.damage.effectPerLevel.value,
    permanent: true,
    describe(level) {
      return `+${Math.round(level * this.effectPerLevel * 100)}% damage`;
    }
  },
  moveSpeed: {
    key: "moveSpeed",
    label: "Move Speed",
    baseCost: UPGRADE_VALUES.moveSpeed.baseCost.value,
    unit: "+7%",
    effectPerLevel: UPGRADE_VALUES.moveSpeed.effectPerLevel.value,
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
      return `+${level} bounces`;
    }
  },
  multishot: {
    key: "multishot",
    label: "Multishot",
    unit: "+1 shot per volley",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${level} extra shots per volley`;
    }
  },
  frontShot: {
    key: "frontShot",
    label: "Front Shot",
    unit: "+1 forward projectile",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${level} forward projectiles`;
    }
  },
  diagonalShot: {
    key: "diagonalShot",
    label: "Diagonal Shot",
    unit: "+2 diagonal projectiles",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${level * 2} diagonal projectiles`;
    }
  },
  reverseShot: {
    key: "reverseShot",
    label: "Reverse Shot",
    unit: "+1 rear projectile",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      return `+${level} rear projectiles`;
    }
  },
  homing: {
    key: "homing",
    label: "Homing Projectiles",
    unit: "Tracking",
    effectPerLevel: 1,
    permanent: false,
    describe(level) {
      const strengths = ["Weak", "Moderate", "Strong", "Perfect", "Omniscient"];
      return `Homing: ${strengths[Math.min(level - 1, strengths.length - 1)]}`;
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
  const config = UPGRADE_VALUES[key];
  if (!config) return UPGRADES[key].baseCost * (level + 1);
  const formula = config.costFormula || "linear";
  const base = config.baseCost.value;
  if (formula === "exponential") {
    const rate = config.costFormulaParams?.rate ?? 1.5;
    return Math.floor(base * Math.pow(rate, level));
  }
  const coeff = config.costFormulaParams?.coefficient ?? 1;
  return Math.floor(base * (level + 1) * coeff);
}

export function totalUpgradeLevel(meta, run, key) {
  return (meta.upgrades?.[key] || 0) + (run?.temporaryUpgrades?.[key] || 0);
}

export function wholeUpgradeLevel(meta, run, key) {
  return Math.floor(totalUpgradeLevel(meta, run, key));
}
