# Enemy Difficulty Curve Overhaul — 10-15 Minute Balance

## Problem

The current difficulty curve is `log2(1 + t/600)`. This grows far too slowly to ever catch the player's compounding power. The game never gets harder — it gets easier over time.

### Why log2 is the wrong curve here

Player power scales **compounding**: damage and fire rate multiply each other, and extra-shot upgrades multiply bullet count on top. This is roughly exponential growth.

Enemy health scales as `1 + log2(1 + t/600) * 3`. At t=600s (10min): `1 + 1.0 * 3 = 4x`. At t=900s (15min): `1 + 1.17 * 3 = 4.5x`. This is barely growing.

The crossover never happens. The player's DPS doubles every few level-ups while enemy health inches up.

### Current numbers at key times

| Time | difficultyFor | enemyHealthScale | damageScale | Player DPS (5 dmg/5 rate) | Enemy EHP (normal) |
|---|---|---|---|---|---|
| 60s | 0.14 | 1.42x | 1.21x | ~12/s | 2.8 |
| 300s | 0.58 | 2.74x | 1.87x | ~12/s | 5.5 |
| 600s | 1.00 | 4.00x | 2.50x | ~12/s | 8.0 |
| 900s | 1.17 | 4.50x | 2.76x | ~12/s | 9.0 |

Player DPS column is constant because it only shows the time-scaling portion. But actual player DPS with upgrades at 10min is ~40-80/s (from level-up picks), while enemy EHP is only 8. The ratio is 5-10x in the player's favor and growing.

---

## Solution: Replace log2 with Exponential + Reductive Balance

Two changes:
1. **Replace the difficulty function** with an exponential curve that can actually outrun linear player scaling
2. **Tune all scaling configs** so the crossover (player power ≈ enemy power) lands around 10-15 minutes

### New difficulty function

```
difficultyFor(time) = (time / halfTime) ^ exponent
```

This is a **power curve** (not log, not pure exponential). It starts slow (like the current curve) but accelerates. The `halfTime` parameter controls when the curve hits 1.0 (the "halfway to overwhelming" mark). The `exponent` controls how sharply it accelerates after that.

Advantages over log2:
- Grows faster than linear at any exponent > 1, so it will eventually overtake the player
- Starts gentle (like log) when exponent > 1 and time < halfTime
- Two intuitive tuning knobs: `halfTime` (when difficulty "turns on") and `exponent` (how sharp the ramp is)
- Unlike pure exponential `e^(kt)`, it doesn't start at 0 (at t=0 the curve is 0, which is correct)

### Proposed config values

```javascript
export const DIFFICULTY = {
  halfTime: { value: 300, unit: "s" },           // difficulty reaches 1.0 at 5 minutes
  exponent: { value: 1.5, unit: "x" },            // superlinear ramp — accelerates over time
  enemyHealthCoefficient: { value: 6, unit: "x" },  // was 3 — doubled to keep pace with DPS
  damageScaleCoefficient: { value: 1.0, unit: "x" }, // was 1.5 — reduced so player time-scaling is slower
  enemySpeedCoefficient: { value: 0.3, unit: "x" }, // was 0.4 — slightly less speed ramp
  enemySpeedCap: { value: 1.3, unit: "x" },         // was 1.2 — slightly higher cap
  spawnDelayStart: { value: 0.9, unit: "s" },       // unchanged
  spawnDelayRate: { value: 0.012, unit: "s/s" },    // unchanged
  spawnDelayMin: { value: 0.15, unit: "s" },         // unchanged
};
```

### New difficulty curves at key times

With `halfTime=300`, `exponent=1.5`:

| Time | difficultyFor | enemyHealthScale (coef=6) | damageScale (coef=1.0) |
|---|---|---|---|
| 0s | 0.00 | 1.0x | 1.0x |
| 60s | 0.05 | 1.30x | 1.05x |
| 120s | 0.13 | 1.80x | 1.13x |
| 300s | 1.00 | 7.0x | 2.0x |
| 600s | 2.83 | 17.9x | 3.83x |
| 900s | 5.20 | 32.2x | 6.20x |

Enemy health at 10min: 2 * 17.9 = 35.8 HP. At 15min: 2 * 32.2 = 64.4 HP.

A player with 5 damage upgrades and 5 fire rate upgrades deals ~12 base DPS × 3.83 time-scale = 46 DPS at 10min. Enemy EHP = 35.8. Player is ahead but not overwhelmingly — and with spawn pressure mounting, dodging becomes harder. At 15min, the curve is clearly winning.

---

## Detailed Changes

### 1. `src/configs/difficulty.js` — Replace config shape

**Old:**
```javascript
timeDivisor: { value: 600, unit: "s" },
```

**New:**
```javascript
halfTime: { value: 300, unit: "s" },
exponent: { value: 1.5, unit: "x" },
```

Plus adjust coefficients:
```javascript
enemyHealthCoefficient: { value: 6, unit: "x" },    // was 3
damageScaleCoefficient: { value: 1.0, unit: "x" },  // was 1.5
enemySpeedCoefficient: { value: 0.3, unit: "x" },   // was 0.4
enemySpeedCap: { value: 1.3, unit: "x" },            // was 1.2
```

### 2. `src/upgrades/difficulty.js` — Replace difficultyFor formula

**Old:**
```javascript
export function difficultyFor(time) {
  if (time <= 0) return 0;
  return Math.log2(1 + time / DIFFICULTY.timeDivisor.value);
}
```

**New:**
```javascript
export function difficultyFor(time) {
  if (time <= 0) return 0;
  const ratio = time / DIFFICULTY.halfTime.value;
  return Math.pow(ratio, DIFFICULTY.exponent.value);
}
```

The other functions (`enemyHealthScale`, `damageScale`, `enemySpeedScale`, `spawnDelayFor`) remain structurally the same — they all call `difficultyFor(time)` and multiply by their coefficient. Changing the difficulty function changes all of them automatically.

### 3. `src/upgrades/power.js` — No changes needed

`power.js` calls `enemyHealthScale`, `damageScale`, etc. which call `difficultyFor` internally. The power formula works with any difficulty function.

### 4. `viz/vizShared.js` — Update config module list

Already includes "difficulty". No change needed.

### 5. `viz/difficulty.html` — Update sliders

Replace `timeDivisor` slider with `halfTime` and `exponent` sliders. Update the chart computation to use the new formula.

---

## Why This Curve Over Alternatives

| Curve | Formula (at t=600s) | Behavior | Verdict |
|---|---|---|---|
| **Current log2** | `log2(1 + 600/600) = 1.0` | Never catches player | Rejected |
| **Linear** | `600/300 = 2.0` | Too even, no acceleration | Boring, but would work |
| **Power (proposed)** | `(600/300)^1.5 = 2.83` | Starts gentle, accelerates | **Recommended** |
| **Pure exponential** | `e^(0.003 * 600) = 6.05` | Too steep early, player dies before upgrading | Rejected |
| **Quadratic** | `(600/300)^2 = 4.0` | Works but less tunable | Fine, but power curve is more flexible |

The power curve `(t/halfTime)^exponent` is the best fit because:
- `exponent = 1.0` gives linear (most gentle)
- `exponent = 1.5` gives the recommended ramp
- `exponent = 2.0` gives quadratic (more aggressive)
- `halfTime` shifts the entire curve left/right — smaller halfTime = harder sooner

The two knobs give fine control over *when* the game gets hard and *how fast* it escalates once it does.

---

## Recommended Balance Targets

For a 10-15 minute run with the current upgrade system:

| Time | Desired Feel | Player:Enemy Ratio |
|---|---|---|
| 0-2min | Power fantasy, easy kills | 3-5x |
| 2-5min | Steady progression, some pressure | 2-3x |
| 5-10min | Escalating threat, need upgrades | 1-2x |
| 10-12min | Peak challenge, barely surviving | 0.8-1.2x |
| 12-15min+ | Overwhelmed, run ends | < 0.8x |

The proposed `halfTime=300` (5min), `exponent=1.5` with `enemyHealthCoefficient=6` and `damageScaleCoefficient=1.0` produces exactly this pattern.

---

## Secondary Balance Tweaks

These are smaller adjustments that help the 10-15 minute target without changing the difficulty curve:

### Reduce player time-scaling, increase upgrade importance

The current `damageScaleCoefficient=1.5` means the player gets 2.5x damage at 10min just from time. This reduces the value of upgrades (why pick damage when time gives it for free?). Reducing it to 1.0 means:
- At 10min: damageScale = 2.83x (down from 4.0x with old formula)
- Upgrades matter more — the player *needs* to pick damage/fire rate to keep up
- This creates the positive feedback loop: upgrades → survive longer → harder enemies → need more upgrades

### Enemy contact damage increase over time

Currently `PLAYER.contactDamage` (18 HP) is constant. Adding a time-based ramp makes late-game contact much more threatening:

Add to `src/configs/difficulty.js`:
```javascript
enemyContactDamageCoefficient: { value: 2, unit: "x" },
```

Add to `src/upgrades/difficulty.js`:
```javascript
export function enemyContactDamageScale(time) {
  return 1 + difficultyFor(time) * DIFFICULTY.enemyContactDamageCoefficient.value;
}
```

Update `src/scenes/combat/CombatResolver.js`:
```javascript
player.health -= Math.round(PLAYER.contactDamage.value * enemyContactDamageScale(run.time));
```

Import `enemyContactDamageScale` in CombatResolver.

At 10min: contact damage = 18 * (1 + 2.83 * 2) = 18 * 6.66 = 120 HP. At 5min: 18 * (1 + 1.0 * 2) = 54 HP. This makes dodging critically important after 5 minutes.

---

## Implementation Order

1. Update `src/configs/difficulty.js` — replace `timeDivisor` with `halfTime` + `exponent`, adjust coefficients, add `enemyContactDamageCoefficient`
2. Update `src/upgrades/difficulty.js` — replace `difficultyFor` formula, add `enemyContactDamageScale`
3. Update `src/upgrades/index.js` — re-export `enemyContactDamageScale`
4. Update `src/scenes/combat/CombatResolver.js` — scale contact damage over time
5. Update `viz/difficulty.html` — replace `timeDivisor` slider with `halfTime`/`exponent`, add new sliders
6. Verify via power-level viz that the crossover lands at 10-15 minutes

---

## DRY / KISS / Clean Code Notes

1. **One function change**: `difficultyFor()` is the single place the curve shape is defined. All consumers (health, damage, speed, contact) automatically follow.
2. **Backward compatible structure**: `enemyHealthScale`, `damageScale`, `enemySpeedScale` still have the same signature `(time) → number`. No downstream changes needed beyond `difficultyFor` and the new `enemyContactDamageScale`.
3. **Config-driven**: `halfTime`, `exponent`, and all coefficients are in the config. The viz pages can plot the new curve and allow interactive tuning.
4. **No dead config**: `timeDivisor` is fully replaced by `halfTime` and `exponent`. No vestigial values.

---

## Testing Checklist

- [ ] At t=0, difficultyFor returns 0 (enemies at base stats)
- [ ] At t=300s, difficultyFor returns 1.0 (by definition of halfTime)
- [ ] enemyHealthScale at 10min is ~18x (dangerous but killable with upgrades)
- [ ] damageScale at 10min is ~3.8x (player keeps pace only with upgrades)
- [ ] enemyContactDamageScale at 5min is ~3x, at 10min is ~6.7x
- [ ] Power-level viz shows crossover at 10-15min for a mid-upgraded player
- [ ] Early game (0-2min) feels easy — player kills enemies quickly
- [ ] Late game (12min+) feels overwhelming — enemies are spongy and contact is lethal
- [ ] No references to `timeDivisor` remain in source code
- [ ] Viz difficulty page has halfTime and exponent sliders that update the chart
