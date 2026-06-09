export const ENEMY_TYPES = [
  {
    key: "normal",
    radius: { value: 16, unit: "px" },
    speed: { value: 105, unit: "px/s" },
    health: { value: 2, unit: "HP" },
    scoreValue: { value: 25, unit: "pts" },
    xpValue: { value: 8, unit: "XP" },
    color: "#ff2e9a",
  },
  {
    key: "fast",
    radius: { value: 10, unit: "px" },
    speed: { value: 175, unit: "px/s" },
    health: { value: 1, unit: "HP" },
    scoreValue: { value: 15, unit: "pts" },
    xpValue: { value: 5, unit: "XP" },
    color: "#ffe15c",
  },
];

export const ENEMIES = {
  fastChanceRampRate: { value: 95, unit: "s" },
  fastChanceMin: { value: 0.08, unit: "%" },
  fastChanceMax: { value: 0.36, unit: "%" },
  spawnBuffer: { value: 90, unit: "px" },
};
