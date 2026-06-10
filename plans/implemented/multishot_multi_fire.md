# Multishot: Multi-Fire Per Interval

## Objective

Change the multishot upgrade from "spawn additional bullets per shot" to "fire multiple shots per shot interval with a small delay between each". Currently multishot adds side-angle projectiles to a single fire event. Instead, multishot should cause the weapon to fire N times per cooldown cycle, each separated by a fraction of the per-shot cooldown.

### Behavior

| Multishot Level | Firing Pattern |
|---|---|
| 0 | 1 shot per interval (no change) |
| 1 | Fire → wait `multishotDelay` → Fire → wait remainder of cooldown |
| 2 | Fire → wait `multishotDelay` → Fire → wait `multishotDelay` → Fire → wait remainder |
| N | N+1 shots, each separated by `multishotDelay`, total burst fits within one cooldown |

**`multishotDelay`** = a percentage of the current shot cooldown (configurable), with a minimum floor in ms. Example: if cooldown = 260ms and delay = 8% of cooldown, delay between multishot bursts = ~21ms. A floor of 15ms prevents absurdly fast bursting at very high fire rates.

Each shot in the burst fires the **same pattern** (front/diagonal/reverse/homing bullets all fire per burst shot). The burst count = `1 + wholeUpgradeLevel(meta, run, "multishot")`.

---

## Files to Modify

### 1. `src/configs/weapons.js` — Add multishot delay config

```javascript
// Add to WEAPONS:
multishotBurstDelayPercent: { value: 0.08, unit: "%" },
multishotBurstDelayFloor: { value: 0.015, unit: "s" },
```

- `multishotBurstDelayPercent` — fraction of shot cooldown used as inter-burst delay
- `multishotBurstDelayFloor` — minimum delay in seconds between burst shots (prevents zero-delay at extreme fire rates)

### 2. `src/upgrades/stats.js` — Add `multishotBurstDelayFor` helper

```javascript
export function multishotBurstDelayFor(meta, run) {
  const cooldown = shotCooldownFor(meta, run);
  const percent = WEAPONS.multishotBurstDelayPercent.value;
  const floor = WEAPONS.multishotBurstDelayFloor.value;
  return Math.max(cooldown * percent, floor);
}
```

### 3. `src/upgrades/index.js` — Re-export new helper

Add `multishotBurstDelayFor` to the stats re-export block.

### 4. `src/scenes/combat/WeaponSystem.js` — Replace multishot side-angle logic with burst fire

**Current** (`firePattern`): multishot level spawns side-angle bullets at `multishotBaseAngle + step * multishotAngleStep`.

**New**: multishot level determines **burst count**. The weapon system tracks a `burstState` object on `run`:

```javascript
run.burstState = { shotsRemaining: 0, burstDelay: 0 };
```

#### `update(run, meta, dt)` changes:

```javascript
update(run, meta, dt) {
  // Process ongoing burst
  if (run.burstState.shotsRemaining > 0) {
    run.burstState.burstDelay -= dt;
    if (run.burstState.burstDelay <= 0) {
      this.firePattern(run, meta, aim);
      run.burstState.shotsRemaining -= 1;
      if (run.burstState.shotsRemaining > 0) {
        run.burstState.burstDelay = multishotBurstDelayFor(meta, run);
      }
    }
    return;
  }

  // Normal cooldown tick
  run.shotTimer -= dt;
  if (run.shotTimer > 0) return;

  // Find target and fire first shot of burst
  let nearest = null;
  let nearestDistance = Infinity;
  const range = WEAPONS.targetingRange.value;

  for (const enemy of run.enemies) {
    const dist = distanceSquared(run.player, enemy);
    if (dist < nearestDistance && dist <= range * range) {
      nearest = enemy;
      nearestDistance = dist;
    }
  }

  if (nearest) {
    const aim = normalize(nearest.x - run.player.x, nearest.y - run.player.y);

    const multishot = wholeUpgradeLevel(meta, run, "multishot");
    const burstCount = 1 + multishot;

    this.firePattern(run, meta, aim);

    if (burstCount > 1) {
      run.burstState.shotsRemaining = burstCount - 1;
      run.burstState.burstDelay = multishotBurstDelayFor(meta, run);
    }
  }

  run.shotTimer = shotCooldownFor(meta, run);
}
```

#### `firePattern` changes:

Remove the multishot side-angle spawning loop entirely:

```javascript
firePattern(run, meta, aim) {
  const front = wholeUpgradeLevel(meta, run, "frontShot");
  const diagonal = wholeUpgradeLevel(meta, run, "diagonalShot");
  const reverse = wholeUpgradeLevel(meta, run, "reverseShot");

  this.spawnBullet(run, meta, aim);

  for (let i = 0; i < front; i += 1) {
    this.spawnBullet(run, meta, aim, 0, (i + 1) * WEAPONS.frontShotSpacing.value);
  }

  for (let i = 0; i < diagonal; i += 1) {
    const spread = WEAPONS.diagonalBaseAngle.value + i * WEAPONS.diagonalAngleStep.value;
    this.spawnBullet(run, meta, this.rotateVector(aim, -spread));
    this.spawnBullet(run, meta, this.rotateVector(aim, spread));
  }

  for (let i = 0; i < reverse; i += 1) {
    this.spawnBullet(run, meta, { x: -aim.x, y: -aim.y }, 0, i * WEAPONS.reverseShotSpacing.value);
  }
}
```

### 5. `src/scenes/combat/CombatScene.js` — Add `burstState` to run init

```javascript
burstState: { shotsRemaining: 0, burstDelay: 0 },
```

### 6. `src/configs/weapons.js` — Remove unused multishot angle configs

Remove `multishotBaseAngle` and `multishotAngleStep` (no longer used). These are superseded by the burst-delay config.

### 7. `src/upgrades/definitions.js` — Update multishot describe

```javascript
multishot: {
  key: "multishot",
  label: "Multishot",
  unit: "+1 shot per volley",
  effectPerLevel: 1,
  permanent: false,
  describe(level) {
    return `+${Math.floor(level * this.effectPerLevel)} extra shots per volley`;
  }
},
```

### 8. `src/upgrades/extraShotFilters.js` — No changes needed

Multishot remains in `EXTRA_SHOT_UPGRADES`. The one-per-run limit still applies, but its mechanical effect changes from side-bullets to burst-fire count.

---

## Burst Timing Example

With `baseShotCooldown = 0.26s`, `multishotBurstDelayPercent = 0.08`, `multishotBurstDelayFloor = 0.015s`:

| Multishot Lv | Burst Count | Delay Between | Total Burst Time | Cooldown Remaining |
|---|---|---|---|---|
| 0 | 1 | — | 0ms | 260ms (just cooldown) |
| 1 | 2 | max(260*0.08, 15) = 21ms | 21ms | 239ms |
| 2 | 3 | 21ms | 42ms | 218ms |
| 3 | 4 | 21ms | 63ms | 197ms |

At high fire rate (cooldown = 0.10s):
| Multishot Lv | Delay Between | Total Burst Time |
|---|---|---|
| 1 | max(100*0.08, 15) = 15ms (floor) | 15ms |
| 3 | 15ms | 45ms |

The floor prevents the burst from collapsing into a single frame at high fire rates.

---

## Aiming During Burst

Each burst shot re-acquires the nearest target independently. This gives multishot a "strafing" feel — if the player rotates or enemies move, successive burst shots can track different targets.

```javascript
// In update, for each burst shot:
if (nearest) {
  const aim = normalize(nearest.x - run.player.x, nearest.y - run.player.y);
  this.firePattern(run, meta, aim);
}
```

If no enemy is in range during a burst shot, that burst shot is skipped (shotsRemaining still decrements).

---

## What This Replaces

| Before | After |
|---|---|
| multishot = side-angle projectiles (0.18 rad + step * 0.06 rad) | multishot = extra shots per volley with inter-shot delay |
| More bullets on screen per fire event | Same bullet pattern repeated N+1 times per cooldown |
| Multishot only effective when enemies are spread out | Multishot is pure DPS multiplier + strafing |
| `WEAPONS.multishotBaseAngle`, `WEAPONS.multishotAngleStep` | `WEAPONS.multishotBurstDelayPercent`, `WEAPONS.multishotBurstDelayFloor` |

---

## DRY / KISS / Clean Code Notes

1. **Single responsibility**: `multishotBurstDelayFor()` is the one place that computes inter-burst timing. Changing the formula (e.g. from percent to fixed ms) means editing one function.
2. **No duplication**: Burst count is always `1 + wholeUpgradeLevel(meta, run, "multishot")`. No other code path computes multishot count.
3. **Config over code**: The two burst-delay tuning knobs are in `WEAPONS` config, not hardcoded. The viz pages can plot burst timing curves.
4. **Minimal state**: `burstState` is two numbers on the run object. No arrays, no timers, no callbacks.
5. **Removal of dead config**: `multishotBaseAngle` and `multishotAngleStep` are deleted, not left as unused vestigial values.

---

## Implementation Order

1. Add `multishotBurstDelayPercent` and `multishotBurstDelayFloor` to `src/configs/weapons.js`
2. Add `multishotBurstDelayFor` to `src/upgrades/stats.js` and re-export from `src/upgrades/index.js`
3. Add `burstState` to run initialization in `src/scenes/combat/CombatScene.js`
4. Refactor `WeaponSystem.update()` to handle burst state
5. Remove multishot side-angle loop from `WeaponSystem.firePattern()`
6. Remove `multishotBaseAngle` and `multishotAngleStep` from `src/configs/weapons.js`
7. Update `multishot` describe in `src/upgrades/definitions.js`

---

## Testing Checklist

- [ ] With 0 multishot: fires exactly once per cooldown (no change)
- [ ] With 1 multishot: fires twice per cooldown with visible delay between shots
- [ ] Burst shots re-acquire nearest target independently
- [ ] Burst delay respects floor at high fire rates
- [ ] Burst delay scales with cooldown at low fire rates
- [ ] No side-angle bullets spawned by multishot
- [ ] frontShot, diagonalShot, reverseShot, homing still work per burst shot
- [ ] multishotBurstDelayPercent and multishotBurstDelayFloor are tunable via viz
- [ ] multishotBaseAngle and multishotAngleStep removed (no references remain)
