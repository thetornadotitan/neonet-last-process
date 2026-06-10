export const UPGRADE_VALUES = {
  maxHealth: {
    baseCost: { value: 10, unit: "diamonds" },
    effectPerLevel: { value: 20, unit: "HP" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
  healthRegen: {
    baseCost: { value: 12, unit: "diamonds" },
    effectPerLevel: { value: 0.25, unit: "HP/s" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
  fireRate: {
    baseCost: { value: 15, unit: "diamonds" },
    effectPerLevel: { value: 0.08, unit: "%" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
  xpGain: {
    baseCost: { value: 10, unit: "diamonds" },
    effectPerLevel: { value: 0.1, unit: "%" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
  pickupRange: {
    baseCost: { value: 10, unit: "diamonds" },
    effectPerLevel: { value: 18, unit: "px" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
  damage: {
    baseCost: { value: 14, unit: "diamonds" },
    effectPerLevel: { value: 0.2, unit: "%" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
  moveSpeed: {
    baseCost: { value: 12, unit: "diamonds" },
    effectPerLevel: { value: 0.07, unit: "%" },
    costFormula: "linear",
    costFormulaParams: { coefficient: 1 },
  },
};

export const EXTRA_SHOT_RARITY_LEVELS = {
  common: 1,
  uncommon: 2,
  rare: 3,
  legendary: 4,
  mythic: 5,
};
