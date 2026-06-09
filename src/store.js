import { PERMANENT_UPGRADE_KEYS, makeUpgradeLevels, upgradeCost } from "./upgrades.js";

const STORAGE_KEY = "neonAutoShooter.meta.v1";

const defaultMeta = {
  diamonds: 0,
  upgrades: makeUpgradeLevels(0, PERMANENT_UPGRADE_KEYS),
  settings: {
    screenShake: true,
    difficulty: "Normal",
    musicVolume: 0.5,
    musicMuted: false
  }
};

function makeDefaultMeta() {
  return {
    diamonds: defaultMeta.diamonds,
    upgrades: { ...defaultMeta.upgrades },
    settings: { ...defaultMeta.settings }
  };
}

function readMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultMeta();
    const parsed = JSON.parse(raw);
    return {
      diamonds: Number.isFinite(parsed.diamonds) ? parsed.diamonds : 0,
      upgrades: {
        ...defaultMeta.upgrades,
        ...(parsed.upgrades || {})
      },
      settings: {
        ...defaultMeta.settings,
        ...(parsed.settings || {})
      }
    };
  } catch {
    return makeDefaultMeta();
  }
}

export class Store {
  constructor() {
    this.meta = readMeta();
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.meta));
  }

  addDiamonds(amount) {
    this.meta.diamonds += Math.max(0, Math.floor(amount));
    this.save();
  }

  spendDiamonds(amount) {
    const cost = Math.max(0, Math.floor(amount));
    if (this.meta.diamonds < cost) return false;
    this.meta.diamonds -= cost;
    this.save();
    return true;
  }

  purchaseUpgrade(key) {
    const level = this.meta.upgrades[key] || 0;
    const cost = upgradeCost(key, level);
    if (!this.spendDiamonds(cost)) return false;
    this.meta.upgrades[key] = level + 1;
    this.save();
    return true;
  }

  setSetting(key, value) {
    this.meta.settings[key] = value;
    this.save();
  }
}
