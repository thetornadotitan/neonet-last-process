# Power Level Formula & Visualizer

## Objective

Create a consolidated "power level" formula that computes a single number for the player (based on all their stats) and a comparable number for enemies (based on their stats). This enables high-level balance adjustments: if player power >> enemy power at minute 15, configs need tuning. A visualizer page lets you tweak configs and see both power curves in real time.

---

## Part 1: Power Level Formula

### Player Power

Player power is the aggregate of offensive capability, survivability, and utility. Each component is weighted:

```
playerPower = wDPS * dpsComponent
            + wEHP * ehpComponent
            + wUtility * utilityComponent
```

#### DPS Component

Effective damage per second accounting for all shot patterns and multishot burst:

```javascript
function playerDps(meta, run) {
  const dmg = damageFor(meta, run) * damageScale(run.time);
  const cooldown = shotCooldownFor(meta, run);
  const shotsPerVolley = 1 + extraShotLevel(run, "multishot");
  const burstDelay = multishotBurstDelayFor(meta, run);
  const volleyTime = cooldown + (shotsPerVolley - 1) * burstDelay;
  const shotsPerSecond = shotsPerVolley / volleyTime;

  const bulletsPerShot = 1
    + extraShotLevel(run, "frontShot")
    + extraShotLevel(run, "diagonalShot") * 2
    + extraShotLevel(run, "reverseShot");

  return dmg * shotsPerSecond * bulletsPerShot;
}
```

**Note**: homing and bounce don't directly multiply DPS in the formula — they're captured in the utility component. Homing increases effective hit rate, bounce gives area coverage.

#### EHP (Effective Hit Points) Component

How much raw damage the player can absorb, factoring regen over a time window:

```javascript
function playerEhp(meta, run) {
  const hp = maxHealthFor(meta, run);
  const regen = regenFor(meta, run);
  const window = POWER.ehpRegenWindow.value; // e.g. 30s survival window
  return hp + regen * window;
}
```

#### Utility Component

Composite score for non-DPS combat advantages. Each utility is weighted:

```javascript
function playerUtility(meta, run) {
  const homing = extraShotLevel(run, "homing");
  const bounce = extraShotLevel(run, "projectileBounce");
  const pickup = pickupRangeFor(meta, run);
  const speed = moveSpeedFor(meta, run);

  return (homing * POWER.homingWeight.value)
       + (bounce * POWER.bounceWeight.value)
       + (pickup / PLAYER.basePickupRange.value * POWER.pickupWeight.value)
       + (speed / PLAYER.baseSpeed.value * POWER.speedWeight.value);
}
```

#### Final Player Power

```javascript
function playerPower(meta, run) {
  const dps = playerDps(meta, run);
  const ehp = playerEhp(meta, run);
  const util = playerUtility(meta, run);

  return POWER.wDPS.value * dps
       + POWER.wEHP.value * ehp
       + POWER.wUtility.value * util;
}
```

### Enemy Power

Enemy power is computed per enemy type and scaled by time (matching the difficulty curve). A "swarm power" accounts for spawn rate.

```
enemyPower = wEnemyDPS * enemyDpsComponent
           + wEnemyEHP * enemyEhpComponent
           + wSpawn * spawnComponent
```

#### Enemy DPS Component

Damage the enemy deals per second via contact (only meaningful metric currently):

```javascript
function enemyDps(enemyType, time) {
  const speed = enemyType.speed.value * enemySpeedScale(time);
  const contactDmg = PLAYER.contactDamage.value; // Enemy deals this on contact
  return contactDmg * POWER.enemyContactRate.value; // Expected contacts per second
}
```

**Note**: `enemyContactRate` is a tuning knob — how often enemies reach the player per second on average. This is an approximation since actual contact rate depends on player skill and movement.

#### Enemy EHP Component

```javascript
function enemyEhp(enemyType, time) {
  return enemyType.health.value * enemyHealthScale(time);
}
```

#### Spawn Component

```javascript
function spawnPower(time) {
  const spawnDelay = spawnDelayFor(time);
  const spawnsPerSecond = 1 / spawnDelay;
  const fastChance = clamp(time / ENEMIES.fastChanceRampRate.value, ENEMIES.fastChanceMin.value, ENEMIES.fastChanceMax.value);

  const normalEhp = enemyEhp(normalType, time);
  const fastEhp = enemyEhp(fastType, time);
  const avgEhp = (1 - fastChance) * normalEhp + fastChance * fastEhp;

  return avgEhp * spawnsPerSecond;
}
```

#### Final Enemy Power

```javascript
function enemyPower(time) {
  const dpsComp = POWER.wEnemyDPS.value * enemyDps(normalType, time);
  const ehpComp = POWER.wEnemyEHP.value * spawnPower(time);
  const spawnComp = POWER.wSpawn.value * spawnPower(time);

  return dpsComp + ehpComp + spawnComp;
}
```

---

## Part 2: Power Config

### `src/configs/power.js` — New file

```javascript
export const POWER = {
  // Player power weights
  wDPS: { value: 1.0, unit: "x" },
  wEHP: { value: 0.3, unit: "x" },
  wUtility: { value: 0.1, unit: "x" },

  // EHP calculation
  ehpRegenWindow: { value: 30, unit: "s" },

  // Utility weights
  homingWeight: { value: 2, unit: "x" },
  bounceWeight: { value: 1.5, unit: "x" },
  pickupWeight: { value: 0.2, unit: "x" },
  speedWeight: { value: 0.3, unit: "x" },

  // Enemy power weights
  wEnemyDPS: { value: 0.5, unit: "x" },
  wEnemyEHP: { value: 1.0, unit: "x" },
  wSpawn: { value: 0.5, unit: "x" },

  // Enemy approximation knobs
  enemyContactRate: { value: 0.5, unit: "hits/s" },
};
```

### `src/configs/index.js` — Re-export

```javascript
export { POWER } from "./power.js";
```

---

## Part 3: Power Calculation Module

### `src/upgrades/power.js` — New file

```javascript
import { PLAYER, ENEMY_TYPES, POWER } from "../configs/index.js";
import { damageFor, shotCooldownFor, maxHealthFor, regenFor, pickupRangeFor, moveSpeedFor } from "./stats.js";
import { damageScale, enemyHealthScale, enemySpeedScale, spawnDelayFor } from "./difficulty.js";
import { extraShotLevel } from "./extraShotFilters.js";
import { multishotBurstDelayFor } from "./stats.js";
import { clamp } from "../utils.js";

export function playerDps(meta, run) {
  const dmg = damageFor(meta, run) * damageScale(run.time);
  const cooldown = shotCooldownFor(meta, run);
  const shotsPerVolley = 1 + extraShotLevel(run, "multishot");
  const burstDelay = multishotBurstDelayFor(meta, run);
  const volleyTime = cooldown + Math.max(0, shotsPerVolley - 1) * burstDelay;
  const shotsPerSecond = shotsPerVolley / volleyTime;

  const bulletsPerShot = 1
    + extraShotLevel(run, "frontShot")
    + extraShotLevel(run, "diagonalShot") * 2
    + extraShotLevel(run, "reverseShot");

  return dmg * shotsPerSecond * bulletsPerShot;
}

export function playerEhp(meta, run) {
  return maxHealthFor(meta, run) + regenFor(meta, run) * POWER.ehpRegenWindow.value;
}

export function playerUtility(meta, run) {
  const homing = extraShotLevel(run, "homing");
  const bounce = extraShotLevel(run, "projectileBounce");
  const pickup = pickupRangeFor(meta, run);
  const speed = moveSpeedFor(meta, run);

  return (homing * POWER.homingWeight.value)
       + (bounce * POWER.bounceWeight.value)
       + (pickup / PLAYER.basePickupRange.value * POWER.pickupWeight.value)
       + (speed / PLAYER.baseSpeed.value * POWER.speedWeight.value);
}

export function playerPower(meta, run) {
  return POWER.wDPS.value * playerDps(meta, run)
       + POWER.wEHP.value * playerEhp(meta, run)
       + POWER.wUtility.value * playerUtility(meta, run);
}

export function enemyEhp(enemyType, time) {
  return enemyType.health.value * enemyHealthScale(time);
}

export function enemyDps(time) {
  return PLAYER.contactDamage.value * POWER.enemyContactRate.value;
}

export function spawnPower(time) {
  const spawnDelay = spawnDelayFor(time);
  const spawnsPerSecond = 1 / spawnDelay;
  const fastChance = clamp(
    time / ENEMIES.fastChanceRampRate.value,
    ENEMIES.fastChanceMin.value,
    ENEMIES.fastChanceMax.value
  );
  const normal = ENEMY_TYPES.find(t => t.key === "normal");
  const fast = ENEMY_TYPES.find(t => t.key === "fast");
  const avgEhp = (1 - fastChance) * enemyEhp(normal, time) + fastChance * enemyEhp(fast, time);
  return avgEhp * spawnsPerSecond;
}

export function enemyPower(time) {
  return POWER.wEnemyDPS.value * enemyDps(time)
       + POWER.wEnemyEHP.value * spawnPower(time)
       + POWER.wSpawn.value * spawnPower(time);
}
```

### `src/upgrades/index.js` — Re-export power functions

```javascript
export {
  playerDps, playerEhp, playerUtility, playerPower,
  enemyEhp, enemyDps, spawnPower, enemyPower
} from "./power.js";
```

---

## Part 4: Power Visualizer Page

### `viz/power-level.html` — New file

A single interactive page showing player power vs enemy power over time, with sliders for all power weights and game configs.

#### Charts

| Chart | X-Axis | Y-Axis | Lines |
|---|---|---|---|
| **Power Over Time** | Run time (0–3600s) | Power level | Player power (various upgrade levels), Enemy power |
| **Power Ratio** | Run time | Ratio (player/enemy) | Ratio at 0 upgrades, 5 upgrades, 10 upgrades. Horizontal line at 1.0 (balance point) |
| **Component Breakdown** | Upgrade level (0–20) | Component value | DPS component, EHP component, Utility component (stacked) |

#### Sliders

**Power Weights** (from `POWER` config):
- `wDPS` (0–3, step 0.1)
- `wEHP` (0–3, step 0.1)
- `wUtility` (0–3, step 0.1)
- `ehpRegenWindow` (5–120s, step 5)
- `homingWeight`, `bounceWeight`, `pickupWeight`, `speedWeight`
- `wEnemyDPS`, `wEnemyEHP`, `wSpawn`
- `enemyContactRate` (0.1–3, step 0.1)

**Key Game Configs** (subset that most affects power):
- `PLAYER.baseDamage`, `PLAYER.baseShotCooldown`, `PLAYER.baseHealth`
- `DIFFICULTY.enemyHealthCoefficient`, `DIFFICULTY.damageScaleCoefficient`
- `WEAPONS.multishotBurstDelayPercent`

#### Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Power Level - Balance Viz</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <link rel="stylesheet" href="viz.css">
</head>
<body>
  <a class="back-link" href="index.html">&larr; Back</a>
  <h1 class="page-title">Power Level Balance</h1>
  <div class="layout">
    <div class="sidebar" id="controls">
      <h3>Player Power Weights</h3>
      <div id="player-weight-sliders"></div>
      <h3>Enemy Power Weights</h3>
      <div id="enemy-weight-sliders"></div>
      <h3>Game Configs</h3>
      <div id="game-sliders"></div>
    </div>
    <div class="chart-area">
      <canvas id="powerChart"></canvas>
      <canvas id="ratioChart" style="margin-top: 24px;"></canvas>
      <canvas id="componentChart" style="margin-top: 24px;"></canvas>
    </div>
  </div>
  <script type="module">
    // Import vizShared utilities and power calculation functions
    // Recompute power curves on any slider change
    // Plot player power at different upgrade investment levels
    // Plot enemy power scaling with time
    // Plot ratio with 1.0 balance reference line
  </script>
</body>
</html>
```

#### Computation in Viz

The viz page imports the power functions directly:

```javascript
import { playerPower, enemyPower, playerDps, playerEhp, playerUtility } from "../src/upgrades/power.js";
```

Since `power.js` depends on configs that the viz can override via `setConfigValue`, slider changes propagate through the same code path the game uses. No duplicate formula in the viz — **DRY**.

For the "various upgrade levels" lines, the viz constructs mock `meta` and `run` objects:

```javascript
function mockMetaRun(fireRateLevel, damageLevel, multishotLevel, frontShotLevel, time) {
  const meta = { upgrades: { fireRate: fireRateLevel, damage: damageLevel } };
  const run = {
    time,
    temporaryUpgrades: {
      multishot: multishotLevel,
      frontShot: frontShotLevel,
      diagonalShot: 0,
      reverseShot: 0,
      homing: 0,
      projectileBounce: 0
    },
    selectedExtraShots: new Set(["multishot", "frontShot"]),
    extraShotRarities: {}
  };
  return { meta, run };
}
```

#### Key Visualization: The Ratio Chart

The ratio chart (player power / enemy power) is the most useful for balance:

- **Ratio > 1**: Player is stronger than enemies at this time/upgrade level
- **Ratio = 1**: Balanced
- **Ratio < 1**: Player is weaker — run will feel hard/impossible

A healthy game curve has:
- Ratio starts high (player feels strong early)
- Ratio gradually decreases (enemies scale, challenging the player)
- Ratio never drops below ~0.5 (player can always progress with skill)
- Ratio increases when player gets upgrades (spiky curve upward at level-ups)

#### Annotations

Time markers at 60s, 300s, 600s, 1800s, 3600s. Upgrade-level markers on the component chart.

---

## Part 5: Update Viz Index

### `viz/index.html` — Add link to power-level page

Add a card/link for the new power level visualizer alongside the existing viz pages.

---

## Implementation Order

1. Create `src/configs/power.js` with all weight and tuning configs
2. Re-export `POWER` from `src/configs/index.js`
3. Create `src/upgrades/power.js` with all power calculation functions
4. Re-export power functions from `src/upgrades/index.js`
5. Build `viz/power-level.html` with all three charts and interactive sliders
6. Add link to `viz/index.html`

---

## DRY / KISS / Clean Code Notes

1. **Same formula in game and viz**: The viz imports `power.js` directly. No duplicate power formula in the viz page. Changing the formula in one place changes both.
2. **Config-driven weights**: All power weights are in `POWER` config with `{ value, unit }` format. Tunable via viz sliders, shareable via URL params.
3. **Composable functions**: `playerDps`, `playerEhp`, `playerUtility` are independent. You can inspect each component in the component breakdown chart without computing the others.
4. **Separation of formula from display**: `power.js` returns numbers. The viz decides how to plot them. The game could display power in a UI overlay without importing any charting code.
5. **Mock objects for viz**: The viz uses lightweight mock `meta`/`run` objects. No need to instantiate the full game engine to compute power.
6. **Extensible**: Adding a new enemy type or upgrade only requires updating the relevant component function + config. The overall formula structure stays the same.

---

## Testing Checklist

- [ ] Player power increases with each upgrade level
- [ ] Enemy power increases over time (difficulty scaling)
- [ ] Power ratio chart shows expected decline over time
- [ ] Sliders update all charts in real-time
- [ ] URL params persist slider state (shareable)
- [ ] "Copy Config" outputs POWER config snippet
- [ ] Component breakdown shows relative contribution of DPS/EHP/Utility
- [ ] Power values are positive and non-zero for valid inputs
- [ ] multishot burst correctly increases DPS component
- [ ] Extra-shot integer levels correctly increase bullet count in DPS calc
- [ ] No import errors in viz page (power.js imports resolve correctly)
