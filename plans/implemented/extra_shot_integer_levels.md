# Weapon Extra-Shot Upgrades: Integer Levels by Rarity

## Objective

Extra-shot weapon upgrades (multishot, frontShot, diagonalShot, reverseShot, homing, projectileBounce) currently store their level as `rarity.multiplier` (a float: 1, 1.25, 1.5, 2, 3) which is then `Math.floor()`'d via `wholeUpgradeLevel()`. This means uncommon (1.25x) and rare (1.5x) both floor to 1 — same effect as common. The fix: extra-shot upgrades should use **integer levels by rarity tier** (common=1, uncommon=2, rare=3, legendary=4, mythic=5) while **other upgrades** (permanent stats like fireRate, damage, etc.) continue using the float multiplier.

### Problem Today

| Rarity | Multiplier | `wholeUpgradeLevel()` | Extra-Shot Effect |
|---|---|---|---|
| Common | 1.0 | 1 | +1 (works) |
| Uncommon | 1.25 | **1** | +1 (same as common — broken) |
| Rare | 1.5 | **1** | +1 (same as common — broken) |
| Legendary | 2.0 | 2 | +2 (works) |
| Mythic | 3.0 | 3 | +3 (works) |

### After Fix

| Rarity | Extra-Shot Integer Level | Effect |
|---|---|---|
| Common | 1 | +1 |
| Uncommon | 2 | +2 |
| Rare | 3 | +3 |
| Legendary | 4 | +4 |
| Mythic | 5 | +5 |

Other upgrades keep using `rarity.multiplier` floats — no change.

---

## Design: Separate Config for Extra-Shot Rarity Scaling

Add an `extraShotRarityLevels` map to the upgrades config. This is the single source of truth for how rarity maps to integer levels for extra-shot upgrades. Permanent upgrades continue using `RARITY_TIERS[].multiplier` floats.

### 1. `src/configs/upgrades.js` — Add extra-shot rarity level map

```javascript
export const EXTRA_SHOT_RARITY_LEVELS = {
  common: 1,
  uncommon: 2,
  rare: 3,
  legendary: 4,
  mythic: 5
};
```

### 2. `src/configs/index.js` — Re-export new config

```javascript
export { UPGRADE_VALUES, EXTRA_SHOT_RARITY_LEVELS } from "./upgrades.js";
```

### 3. `src/upgrades/extraShotFilters.js` — Add `extraShotLevelForRarity` helper

```javascript
import { EXTRA_SHOT_RARITY_LEVELS } from "../configs/index.js";

export function extraShotLevelForRarity(rarityKey) {
  return EXTRA_SHOT_RARITY_LEVELS[rarityKey] || 1;
}
```

### 4. `src/upgrades/definitions.js` — Update `wholeUpgradeLevel` for extra-shot keys

Replace the generic `wholeUpgradeLevel` usage for extra-shot upgrades. Instead of `Math.floor(totalUpgradeLevel(meta, run, key))`, extra-shot upgrades store an integer level directly (set during `chooseLevelUpgrade`).

**No change to `wholeUpgradeLevel` itself** — it remains `Math.floor(totalUpgradeLevel(...))` for permanent upgrades. Extra-shot upgrades bypass it.

### 5. `src/upgrades/stats.js` — Add `extraShotLevel` helper

```javascript
export function extraShotLevel(run, key) {
  if (!isExtraShotUpgrade(key)) return 0;
  return run.temporaryUpgrades[key] || 0;
}
```

This replaces `wholeUpgradeLevel(meta, run, key)` calls for extra-shot keys. Since extra-shot upgrades now store integers directly, no flooring is needed.

### 6. `src/upgrades/index.js` — Re-export new helpers

Add `extraShotLevelForRarity` and `extraShotLevel` to the barrel exports.

### 7. `src/scenes/combat/ProgressionSystem.js` — Change `chooseLevelUpgrade` for extra-shots

**Current**:
```javascript
if (isExtraShotUpgrade(key)) {
  run.temporaryUpgrades[key] = rarity.multiplier;     // Float: 1.25, 1.5, etc.
  run.extraShotRarities[key] = rarity.key;
  run.selectedExtraShots.add(key);
}
```

**New**:
```javascript
if (isExtraShotUpgrade(key)) {
  run.temporaryUpgrades[key] = extraShotLevelForRarity(rarity.key);  // Integer: 1, 2, 3, 4, 5
  run.extraShotRarities[key] = rarity.key;
  run.selectedExtraShots.add(key);
}
```

### 8. `src/scenes/combat/WeaponSystem.js` — Use `extraShotLevel` instead of `wholeUpgradeLevel`

**Current**:
```javascript
const front = wholeUpgradeLevel(meta, run, "frontShot");
const multishot = wholeUpgradeLevel(meta, run, "multishot");
const diagonal = wholeUpgradeLevel(meta, run, "diagonalShot");
const reverse = wholeUpgradeLevel(meta, run, "reverseShot");
// ...
const homing = wholeUpgradeLevel(meta, run, "homing");
// ...
bouncesLeft: wholeUpgradeLevel(meta, run, "projectileBounce"),
```

**New**:
```javascript
const front = extraShotLevel(run, "frontShot");
const multishot = extraShotLevel(run, "multishot");
const diagonal = extraShotLevel(run, "diagonalShot");
const reverse = extraShotLevel(run, "reverseShot");
// ...
const homing = extraShotLevel(run, "homing");
// ...
bouncesLeft: extraShotLevel(run, "projectileBounce"),
```

### 9. `src/upgrades/extraShotFilters.js` — Update `filterUpgradeChoices`

**Current** compares `rarity.multiplier` against `getHighestExtraShotRarity` (which returns a float multiplier).

**New** compares integer levels:

```javascript
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
```

### 10. `src/upgrades/definitions.js` — Update extra-shot describe methods

Since levels are now integers (not floats that need flooring), the `describe` methods simplify:

```javascript
multishot: {
  describe(level) {
    return `+${level} extra shots per volley`;
  }
},
frontShot: {
  describe(level) {
    return `+${level} forward projectiles`;
  }
},
diagonalShot: {
  describe(level) {
    return `+${level * 2} diagonal projectiles`;
  }
},
reverseShot: {
  describe(level) {
    return `+${level} rear projectiles`;
  }
},
projectileBounce: {
  describe(level) {
    return `+${level} bounces`;
  }
},
homing: {
  describe(level) {
    const strengths = ["Weak", "Moderate", "Strong", "Perfect", "Omniscient"];
    return `Homing: ${strengths[Math.min(level - 1, strengths.length - 1)]}`;
  }
},
```

---

## Summary of What Changes vs What Stays the Same

| Item | Changes? | Detail |
|---|---|---|
| `RARITY_TIERS[].multiplier` | **No** | Still 1, 1.25, 1.5, 2, 3 — used by permanent upgrades |
| `wholeUpgradeLevel()` | **No** | Still `Math.floor(totalUpgradeLevel(...))` — used by permanent upgrades |
| `totalUpgradeLevel()` | **No** | Still adds meta + run levels for permanent upgrades |
| Extra-shot `temporaryUpgrades[key]` | **Yes** | Now stores integer (1-5) instead of float (1-3) |
| Extra-shot level lookups | **Yes** | Use `extraShotLevel(run, key)` instead of `wholeUpgradeLevel(meta, run, key)` |
| `EXTRA_SHOT_RARITY_LEVELS` config | **New** | Maps rarity key → integer level for extra-shots |
| `extraShotLevelForRarity()` helper | **New** | Returns integer level from rarity key |
| `extraShotLevel()` helper | **New** | Returns integer level from run state for extra-shot keys |
| `filterUpgradeChoices()` | **Yes** | Compares integer levels instead of float multipliers |
| `chooseLevelUpgrade()` | **Yes** | Stores `extraShotLevelForRarity(rarity.key)` instead of `rarity.multiplier` |

---

## DRY / KISS / Clean Code Notes

1. **One mapping, one source of truth**: `EXTRA_SHOT_RARITY_LEVELS` in config is the single place that defines the rarity→integer mapping. Adding a new rarity tier means adding one line here and one line in `RARITY_TIERS`.
2. **No conditional branching in hot paths**: `extraShotLevel(run, key)` is a direct property lookup. No `isExtraShotUpgrade()` check at the call site in `WeaponSystem` — the caller already knows it's an extra-shot key.
3. **Separate concerns clearly**: Permanent upgrades use `totalUpgradeLevel` / `wholeUpgradeLevel` (float multiplier path). Extra-shot upgrades use `extraShotLevel` (integer path). No overloading.
4. **Config-driven**: The rarity→level map is in config, not hardcoded in logic. The viz pages can expose this for tuning.
5. **No double-encoding**: `getHighestExtraShotRarity` now just reads `run.temporaryUpgrades[key]` directly instead of doing a reverse lookup through `RARITIES`. Eliminates the indirection.

---

## Implementation Order

1. Add `EXTRA_SHOT_RARITY_LEVELS` to `src/configs/upgrades.js`
2. Re-export from `src/configs/index.js`
3. Add `extraShotLevelForRarity` to `src/upgrades/extraShotFilters.js`
4. Add `extraShotLevel` to `src/upgrades/stats.js`
5. Re-export both from `src/upgrades/index.js`
6. Update `chooseLevelUpgrade` in `src/scenes/combat/ProgressionSystem.js`
7. Update `filterUpgradeChoices` and `getHighestExtraShotRarity` in `src/upgrades/extraShotFilters.js`
8. Update `WeaponSystem.firePattern` and `spawnBullet` to use `extraShotLevel`
9. Update describe methods in `src/upgrades/definitions.js`

---

## Testing Checklist

- [ ] Common extra-shot: level = 1 (same as current behavior)
- [ ] Uncommon extra-shot: level = 2 (previously was 1 due to floor — now fixed)
- [ ] Rare extra-shot: level = 3 (previously was 1 due to floor — now fixed)
- [ ] Legendary extra-shot: level = 4 (previously was 2 — now correct)
- [ ] Mythic extra-shot: level = 5 (previously was 3 — now correct)
- [ ] Permanent upgrades still use float multipliers (fireRate, damage, etc. — no regression)
- [ ] `wholeUpgradeLevel` still works correctly for permanent upgrades
- [ ] Level-up choices filter correctly: can't re-pick same extra-shot at same or lower rarity
- [ ] Can upgrade an extra-shot by picking the same key at a higher rarity
- [ ] Describe methods show correct integer values (no fractional display)
- [ ] No references to `wholeUpgradeLevel` for extra-shot keys remain in WeaponSystem
