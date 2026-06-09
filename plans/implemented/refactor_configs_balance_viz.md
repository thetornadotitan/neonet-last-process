# Refactor: Module Split, Config Extraction & Balance Visualization

## Objective

Three interdependent improvements to the codebase:

1. **Split `combatScene.js` (624 lines) and `upgrades.js` (315 lines)** into focused, single-responsibility modules per DRY/clean-code principles
2. **Extract all hardcoded game-balance numbers and formulae** from every source file into centralized config modules in a `src/configs/` directory
3. **Build balance-visualization pages** that render graphs of current and proposed values for testing game balance, served as standalone HTML pages

---

## Part 1: Module Splits

### 1A. Split `combatScene.js` → 6 modules

`combatScene.js` is a God Object (~624 lines, ~40% of all source code) handling initialization, player control, enemy spawning, weapon firing, bullet physics, homing AI, collision detection, XP/leveling, upgrade selection, run completion, particle effects, camera management, entity culling, and rendering. These are **7 distinct responsibility domains**:

| New Module | Lines (est.) | Extracted From | Responsibility |
|---|---|---|---|
| `src/scenes/combat/CombatScene.js` | ~80 | `combatScene.js` | Orchestrator: constructor, enter, resize, update dispatch. Imports and delegates to all subsystems |
| `src/scenes/combat/PlayerController.js` | ~35 | `combatScene.js:117-127` | Player stat recalculation, movement, regen, invulnerability decay |
| `src/scenes/combat/EnemySpawner.js` | ~55 | `combatScene.js:135-179` | Spawn timer, enemy type selection (fast/normal), spawn position, enemy stat assignment |
| `src/scenes/combat/WeaponSystem.js` | ~135 | `combatScene.js:181-263, 290-405` | Auto-targeting, fire patterns, bullet spawning, homing, bounce, nearest-enemy search |
| `src/scenes/combat/CombatResolver.js` | ~45 | `combatScene.js:332-370` | Bullet-enemy collision (damage, score, XP drop), enemy-player collision (damage, invulnerability, death) |
| `src/scenes/combat/ProgressionSystem.js` | ~75 | `combatScene.js:407-498` | XP gem drop, gem attraction/collection, XP add, level-up open, random choices, apply choice, finish run |
| `src/scenes/combat/CombatRenderer.js` | ~120 | `combatScene.js:500-617` | Particle burst, prune, world-to-screen, render all entities, draw world grid |

**`CombatScene.js` (orchestrator) will:**
- Own `this.run` state object
- Instantiate subsystems in `enter()`, passing them shared `run` reference and cross-subsystem method references (e.g. `WeaponSystem.findNearestEnemy` passed to `CombatResolver`)
- In `update(dt)`, call subsystems in order: `PlayerController.update` → `EnemySpawner.update` → `WeaponSystem.update` → `CombatResolver.resolve` → (orchestrator routes results to `ProgressionSystem` / `CombatRenderer`) → `ProgressionSystem.update` → `CombatRenderer.render`
- **Event mediation**: `CombatResolver.resolve()` returns structured results (e.g. `{ enemyKilled, hitPosition }`, `{ playerHit: true }`). Orchestrator dispatches side effects:
  - Enemy killed → `ProgressionSystem.dropXp()` + `CombatRenderer.burst()`
  - Player hit → `CombatRenderer.burst()`
  - Level up → `ProgressionSystem.openLevelUp()`
- Wire UI callbacks (level-up choices, pause, etc.)

**Directory structure:**
```
src/scenes/
  combat/
    CombatScene.js        (orchestrator)
    PlayerController.js
    EnemySpawner.js
    WeaponSystem.js
    CombatResolver.js
    ProgressionSystem.js
    CombatRenderer.js
  hubScene.js             (unchanged)
```

**Imports for `app.js`:**
- Change `import CombatScene from "./scenes/combatScene.js"` → `import CombatScene from "./scenes/combat/CombatScene.js"`

---

### 1B. Split `upgrades.js` → 5 modules

`upgrades.js` (315 lines) bundles 5 distinct concerns: definitions, stat calculation, difficulty scaling, rarity rolling, and extra-shot filtering.

| New Module | Lines (est.) | Extracted From | Responsibility |
|---|---|---|---|
| `src/upgrades/definitions.js` | ~150 | `upgrades.js:3-201, 220-222` | `PERMANENT_UPGRADE_KEYS`, `COMBAT_ONLY_UPGRADE_KEYS`, `UPGRADE_KEYS`, `UPGRADES` object (all 13 definitions), `upgradeCost()`, `EXTRA_SHOT_UPGRADES` |
| `src/upgrades/stats.js` | ~50 | `upgrades.js:224-259` | `makeUpgradeLevels`, `totalUpgradeLevel`, `wholeUpgradeLevel`, `maxHealthFor`, `regenFor`, `shotCooldownFor`, `xpMultiplierFor`, `pickupRangeFor`, `damageFor`, `moveSpeedFor` |
| `src/upgrades/difficulty.js` | ~25 | `upgrades.js:270-289` | `difficultyFor`, `enemyHealthScale`, `damageScale`, `enemySpeedScale`, `spawnDelayFor` |
| `src/upgrades/rarity.js` | ~30 | `upgrades.js:24-60, 207-218` | `RARITIES` constant, `rollRarity()` |
| `src/upgrades/extraShotFilters.js` | ~30 | `upgrades.js:291-313` | `isExtraShotUpgrade`, `getSelectedExtraShots`, `getHighestExtraShotRarity`, `filterUpgradeChoices` |

**Barrel file** — `src/upgrades/index.js` re-exports everything for convenient importing:
```javascript
export * from "./definitions.js";
export * from "./stats.js";
export * from "./difficulty.js";
export * from "./rarity.js";
export * from "./extraShotFilters.js";
```

This way, existing `import { damageFor, UPGRADE_KEYS } from "../upgrades.js"` can remain `import { damageFor, UPGRADE_KEYS } from "../upgrades/index.js"` (or just `"../upgrades/"` with module resolution). Consumers that want specific submodules can import directly.

**Dependency graph after split:**
```
utils.js (clamp)
  ├── upgrades/difficulty.js
  └── upgrades/stats.js ──► upgrades/definitions.js (for UPGRADES.effectPerLevel)

upgrades/definitions.js ──► upgrades/rarity.js (RARITIES used in describe methods)
upgrades/extraShotFilters.js ──► upgrades/definitions.js (EXTRA_SHOT_UPGRADES)
                                ──► upgrades/rarity.js (RARITIES)
```

---

## Part 2: Config Extraction

### 2A. New `src/configs/` directory

All hardcoded game-balance numbers get extracted into config files. Config files are **pure data** — no functions, no logic, just numbers, strings, and metadata. Each numeric value uses the `{ value, unit }` format for viz auto-labeling and dev clarity. Game-logic consumers access via `.value`. Functions in `upgrades/stats.js`, `upgrades/difficulty.js`, `combat/EnemySpawner.js`, etc. import their values from configs.

| Config File | Contents |
|---|---|
| `src/configs/player.js` | Player base stats with units: `baseHealth` (HP), `baseSpeed` (px/s), `baseDamage` (x), `baseShotCooldown` (s), `basePickupRange` (px), `radius` (px), `invulnerableDuration` (s), `contactDamage` (HP). Hub scene uses same `baseSpeed` — no separate hub speed. |
| `src/configs/enemies.js` | Enemy type definitions array: `{ key, radius, speed, health, scoreValue, xpValue, color }` for normal and fast (extensible for future types). Plus spawn config: `fastChanceRampRate`, `fastChanceMin`, `fastChanceMax`, `spawnBuffer` |
| `src/configs/weapons.js` | Bullet speed, radius, targeting range, spawn offset, max life. Pattern offsets: frontShotSpacing, multishotBaseAngle, multishotAngleStep, diagonalBaseAngle, diagonalAngleStep, reverseShotSpacing. Bounce: searchRange. Homing: strengthPerLevel, turnRateMultiplier, searchRange |
| `src/configs/difficulty.js` | `difficultyTimeDivisor` (600s), `enemyHealthCoefficient` (3x), `damageScaleCoefficient` (1.5x), `enemySpeedCoefficient` (0.4x), `enemySpeedCap` (1.2x), `spawnDelayStart` (0.9s), `spawnDelayRate` (-0.012/s), `spawnDelayMin` (0.15s) |
| `src/configs/upgrades.js` | All `baseCost` and `effectPerLevel` values for each of the 13 upgrades (with units). `costFormula` (`"linear"` or `"exponential"`) and `costFormulaParams` (e.g. `{ coefficient: 1 }`) per upgrade |
| `src/configs/rarity.js` | Rarity tier definitions array: `{ key, label, multiplier, color, weight }` for all 5 tiers |
| `src/configs/progression.js` | `xpBase`, `xpLevelMultiplier`, `levelUpChoices`, `diamondRewardScoreDivisor`, `diamondRewardTimeDivisor`. XP gem: `radius`, `attractSpeedMin`, `attractSpeedBonus` |
| `src/configs/camera.js` | `pruneMargin`, `bulletMaxTravelMultiplier`, `shakeDecayRate`, `shakeIntensityOnHit`, `gridSpacing`, `gridAlpha`, `gridColor` |
| `src/configs/particles.js` | `hitParticleCount`, `deathParticleCount`, `playerHitParticleCount`, `speedMin`, `speedRange`, `radiusMin`, `radiusRange`, `lifeMin`, `lifeRange`, `maxLife`, `dragCoefficient` |
| `src/configs/hub.js` | `roomWidth`, `roomHeight`, `interactDistance`, `playerRadius`, `playerSpawnOffset`, `boundaryPadding`, station positions. No `playerSpeed` — uses `PLAYER.baseSpeed` from `configs/player.js` |
| `src/configs/engine.js` | `maxDeltaTime`, `gamepadDeadzone`, `gamepadTriggerThreshold`, `gamepadReleaseThreshold` |

### 2B. How configs are consumed

Example — `src/upgrades/stats.js` before:
```javascript
export function maxHealthFor(meta, run) {
  return 100 + totalUpgradeLevel(meta, run, "maxHealth") * UPGRADES.maxHealth.effectPerLevel;
}
```

After:
```javascript
import { PLAYER } from "../configs/index.js";
import { UPGRADES } from "./definitions.js";

export function maxHealthFor(meta, run) {
return PLAYER.baseHealth.value + totalUpgradeLevel(meta, run, "maxHealth") * UPGRADES.maxHealth.effectPerLevel.value;
}
```

The `UPGRADES.maxHealth.effectPerLevel` value itself is still defined in `UPGRADES` but its source is the config:
```javascript
// src/upgrades/definitions.js
import { UPGRADE_VALUES } from "../configs/index.js";

export const UPGRADES = {
maxHealth: {
key: "maxHealth",
label: "Max Health",
baseCost: UPGRADE_VALUES.maxHealth.baseCost.value,
effectPerLevel: UPGRADE_VALUES.maxHealth.effectPerLevel.value,
unit: "HP",
permanent: true,
describe(level) { return `+${level * UPGRADE_VALUES.maxHealth.effectPerLevel.value} HP`; }
},
// ...
};
```

Example — `src/scenes/combat/EnemySpawner.js` after:
```javascript
import { ENEMIES, ENEMY_TYPES } from "../../configs/index.js";
import { enemyHealthScale, enemySpeedScale } from "../../upgrades/difficulty.js";

export function spawnEnemy(run, camera, width, height) {
const type = selectEnemyType(run.time, ENEMY_TYPES, ENEMIES); // uses ENEMIES.fastChanceRampRate etc.
const healthScale = enemyHealthScale(run.time);
const speedScale = enemySpeedScale(run.time);
const position = randomEdgePosition(camera, width, height, ENEMIES.spawnBuffer.value);
return {
id: run.nextEnemyId++,
...position,
radius: type.radius.value,
speed: type.speed.value * speedScale,
health: type.health.value * healthScale,
value: type.scoreValue.value,
xp: type.xpValue.value,
color: type.color
};
}
```

### 2C. Why separate configs from the modules that use them?

- **Tunable without touching logic**: Balance designers can tweak numbers in one place without risk of accidentally breaking code
- **Shareable with visualization**: The balance-viz pages import the same config files to plot curves
- **Comparable**: Proposed configs can sit alongside current configs for A/B testing
- **DRY**: Values like `bulletSpeed: 570` currently duplicated in `spawnBullet` and `resolveBulletBounce` become a single `WEAPONS.bulletSpeed`

---

## Part 3: Balance Visualization Pages

### 3A. New `viz/` directory

Standalone HTML pages that import config modules and render interactive graphs. These are **not** part of the game build — they're developer tools for balance testing.

```
viz/
  index.html              (landing page with links to all graphs)
  difficulty.html         (difficulty curves over time)
  upgrade-scaling.html    (upgrade cost & effect curves)
  enemy-scaling.html      (enemy stat growth over time)
  economy.html            (diamond income vs upgrade cost over time)
  combat-dps.html         (DPS curves: damage * fire rate over time)
```

### 3B. Library recommendation: Chart.js

**Chart.js** (via CDN, ~65KB) is the recommended charting library for these pages:

- **Zero build step**: Load via `<script>` tag — fits the project's no-bundler architecture
- **Rich chart types**: Line charts for curves, scatter for distributions, bar for comparisons
- **Interactive**: Hover tooltips, click-to-toggle datasets, zoom plugin available
- **Lightweight**: Single dependency, no framework required
- **Well-documented**: Extensive examples and API docs

Alternative considered: **D3.js** — more powerful but heavier (~250KB), steeper learning curve, overkill for line/bar charts. Not recommended unless custom visualizations are needed later.

Alternative considered: **Plotly.js** — feature-rich but very heavy (~3MB). Overkill.

Alternative considered: **Pure canvas** — no dependency but would require building chart utilities from scratch (axes, tooltips, legends, responsiveness). Not worth the effort when Chart.js handles all of this.

**CDN usage:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script type="module">
  import { DIFFICULTY } from "../src/configs/difficulty.js";
  // ... build datasets from config values ...
</script>
```

### 3C. Graph specifications

#### `viz/difficulty.html` — Difficulty Curves Over Time
- **X-axis**: Run time (0–3600 seconds, 1 hour)
- **Y-axis**: Multiplier value
- **Lines**:
  - `difficultyFor(t)` — raw difficulty value
  - `enemyHealthScale(t)` — enemy HP multiplier
  - `damageScale(t)` — player damage multiplier
  - `enemySpeedScale(t)` — enemy speed multiplier
- **Secondary Y-axis** or separate chart: `spawnDelayFor(t)` — spawn interval in seconds
- **Annotations**: Mark key time points (10min, 20min, 30min, 1hr)
- **Proposed overlay**: If a `src/configs/difficulty.proposed.js` exists, plot its curves as dashed lines alongside current (solid)

#### `viz/upgrade-scaling.html` — Upgrade Cost & Effect Curves
- **Chart 1: Cost per level** — X: upgrade level (0–20), Y: diamond cost. One line per permanent upgrade. Toggle between linear (`baseCost * (level + 1)`) and exponential (`baseCost * coefficient^level`) via slider
- **Chart 2: Cumulative cost** — X: level, Y: total diamonds spent to reach that level. Shows snowball effect. Both linear and exponential overlays
- **Chart 3: Effect per level** — X: level, Y: stat value. One line per upgrade (e.g. max HP: 100, 120, 140...; damage: 1.0, 1.2, 1.4...). Y-axis auto-labeled from config `.unit` metadata
- **Interactive**: Sliders for cost formula coefficient, toggle between linear/exponential, per-upgrade baseCost adjustments

#### `viz/enemy-scaling.html` — Enemy Stat Growth
- **Chart 1: Enemy effective health over time** — Shows `baseHealth * enemyHealthScale(t)` for each enemy type
- **Chart 2: Enemy effective speed over time** — Shows `baseSpeed * enemySpeedScale(t)`
- **Chart 3: Effective DPS required to kill** — `effectiveHealth / shotCooldown` showing how many seconds of continuous fire to kill one enemy over time
- **Overlay**: Player effective DPS over time (`damageFor * damageScale / shotCooldown`)

#### `viz/economy.html` — Diamond Economy
- **Chart 1: Income rate** — Diamonds per minute from score + time survival at different performance levels
- **Chart 2: Time to afford each upgrade level** — Cost / income-rate for each upgrade at each level
- **Chart 3: Cumulative diamonds earned vs cumulative upgrade cost** — When can you afford what?

#### `viz/combat-dps.html` — Combat DPS Curves
- **Chart 1: Player DPS over time** — `(damageFor * damageScale) / shotCooldown` at different upgrade investment levels
- **Chart 2: Time-to-kill a normal enemy** — `enemyEffectiveHealth / playerDPS` over time
- **Chart 3: Survivability** — `playerEffectiveHP / enemyContactDPS` (enemy spawns per second * contact damage) over time

### 3D. Interactive slider workflow

Each viz page provides **real-time slider controls** for adjusting config values and instantly seeing the impact on balance curves:

1. On page load, sliders are populated with current config values
2. On slider change, curves are recomputed and the chart updates in real-time (no page reload)
3. A **"Copy Config"** button outputs the adjusted values as a JS config snippet that can be pasted into the actual config file
4. Slider state is persisted via URL search params — shareable balance-test URLs (e.g. `difficulty.html?enemyHealthCoefficient=4&damageScaleCoefficient=2`)
5. A **"Reset"** button restores all sliders to the current config defaults

Example:
```javascript
// viz/difficulty.html
import { DIFFICULTY } from "../src/configs/difficulty.js";
import { Chart } from "chart.js/auto";

// Read overrides from URL params, fall back to config defaults
const params = new URLSearchParams(location.search);
const enemyHealthCoefficient = Number(params.get("enemyHealthCoefficient")) ?? DIFFICULTY.enemyHealthCoefficient.value;

// Create slider control
const slider = createSlider("Enemy Health Coefficient", enemyHealthCoefficient, 1, 6, 0.1);
slider.oninput = () => {
  updateURL("enemyHealthCoefficient", slider.value);
  recomputeAndRender();
};

// Compute curve using slider value (not config value)
function enemyHealthScale(t, coef) {
  return 1 + difficultyFor(t) * coef;
}
```

---

## Part 4: Other Library Recommendations

| Library | Purpose | Why | Size |
|---|---|---|---|
| **Chart.js 4.x** | Balance visualization graphs | Zero-build CDN, rich chart types, interactive tooltips | ~65KB |
| **chartjs-plugin-annotation** | Mark key timepoints on graphs (e.g. "10 min mark") | Companion plugin for Chart.js | ~12KB |
| **chartjs-plugin-zoom** | Zoom/pan on balance graphs to inspect specific time ranges | Useful for long time-axis graphs | ~25KB |

No other libraries are recommended. The game itself remains pure vanilla JS with zero dependencies. Libraries are only used in the `viz/` developer tooling.

---

## Implementation Order

### Phase 1: Config extraction (foundation for everything else)
1. Create `src/configs/` directory and all 11 config files
2. Populate each config file with the hardcoded values currently in source (see Appendix A for the full mapping)
3. Update all source modules to import from configs instead of using inline magic numbers
4. Verify: game runs identically — no behavior changes, just moved numbers

### Phase 2: Module splits
5. Split `upgrades.js` → `src/upgrades/` (5 modules + barrel index)
6. Update all consumers of `upgrades.js` to import from `src/upgrades/index.js` (or direct submodules)
7. Verify: game runs identically
8. Split `combatScene.js` → `src/scenes/combat/` (7 modules)
9. Update `app.js` import path for CombatScene
10. Verify: game runs identically

### Phase 3: Balance visualization
11. Create `viz/index.html` landing page (with instructions: serve via `npx serve .` or `python -m http.server`)
12. Build `viz/difficulty.html` (most impactful graph for balance testing) with interactive sliders
13. Build `viz/upgrade-scaling.html` with linear/exponential cost toggle sliders
14. Build `viz/enemy-scaling.html` with sliders
15. Build `viz/economy.html` with sliders
16. Build `viz/combat-dps.html` with sliders
17. Add URL-param persistence and "Copy Config" button to all viz pages

---

## Resolved Decisions

### Architecture

1. **Shared mutable state across combat subsystems** — **Decision: (B)** Each subsystem holds a `this.run` reference set in `enter()`. Matches current patterns, minimal refactoring friction. Subsystems access shared state through the same `run` object reference.

2. **Cross-subsystem communication** — **Decision: (B) — Orchestrator-mediated (event-style)** The orchestrator mediates between subsystems. `CombatResolver` returns results (e.g. "enemy died", "player hit"), and the orchestrator dispatches side effects to other subsystems (`ProgressionSystem.dropXp()`, `CombatRenderer.burst()`). This is effectively a lightweight pub/sub or event system — subsystems emit events via return values, the orchestrator routes them. Keeps subsystems decoupled while avoiding callback spaghetti.

   **Event flow examples:**
   - `CombatResolver.resolve()` → returns `{ enemyKilled: enemy, hitPosition: {x,y} }` → orchestrator calls `ProgressionSystem.dropXp(enemy)` + `CombatRenderer.burst(x, y, enemy.color, deathParticleCount)`
   - `CombatResolver.resolve()` → returns `{ playerHit: true }` → orchestrator calls `CombatRenderer.burst(player.x, player.y, color, playerHitParticleCount)`
   - `ProgressionSystem.addXp()` → returns `{ leveledUp: true }` → orchestrator calls `ProgressionSystem.openLevelUp()`

   Shared utilities like `findNearestEnemy()` live on `WeaponSystem` and are passed to `CombatResolver` as a reference in `enter()` (not as a callback per call — just a method reference set once).

3. **Barrel file for upgrades** — **Decision: Yes, use barrel file.** `src/upgrades/index.js` re-exports everything. Consumers import from `"../upgrades/index.js"` for convenience. Direct submodule imports also available when only a specific concern is needed.

4. **Config import path** — **Decision: (B)** Create `src/configs/index.js` barrel that re-exports all configs. Imports become `import { PLAYER, ENEMIES, WEAPONS, DIFFICULTY } from "../../configs/index.js"`. Keeps individual config files modular while avoiding verbose per-config imports in consumers.

### Config Design

5. **Upgrade `describe()` methods** — **Decision: (A)** Keep `describe()` in `definitions.js`, referencing config values via import. Simplest, matches current code. The `describe()` functions are UI-facing logic, not pure data, so they belong in the definitions module alongside the `UPGRADES` object.

6. **Cost formula configurability** — **Decision: (A)** Add a `costFormula` field to the upgrade config supporting `"linear"` and `"exponential"` types, with `upgradeCost()` dispatching on it. This enables balance testing of non-linear cost curves in the viz pages.

   **Config shape:**
   ```javascript
   export const UPGRADE_VALUES = {
     maxHealth: {
       baseCost: { value: 10, unit: "diamonds" },
       effectPerLevel: { value: 20, unit: "HP" },
       costFormula: "linear",        // "linear" | "exponential"
       costFormulaParams: { coefficient: 1 }  // linear: baseCost * (level + coefficient)
                                               // exponential: baseCost * coefficient^level
     },
     // ...
   };
   ```

   **`upgradeCost()` dispatch:**
   ```javascript
   export function upgradeCost(key, level) {
     const def = UPGRADE_VALUES[key];
     if (!def) return Infinity;
     switch (def.costFormula) {
       case "linear": return def.baseCost.value * (level + def.costFormulaParams.coefficient);
       case "exponential": return def.baseCost.value * Math.pow(def.costFormulaParams.coefficient, level);
       default: return def.baseCost.value * (level + 1);
     }
   }
   ```

7. **Config value metadata** — **Decision: Include `{ value, unit }` metadata** on all config values. This aids viz page auto-labeling of axes and developer understanding. Game-logic consumers access via `.value` (e.g. `PLAYER.baseHealth.value`). Viz pages use `.unit` for axis labels.

   **Config shape:**
   ```javascript
   export const PLAYER = {
     baseHealth: { value: 100, unit: "HP" },
     baseSpeed: { value: 260, unit: "px/s" },
     baseDamage: { value: 1, unit: "x" },
     baseShotCooldown: { value: 0.26, unit: "s" },
     basePickupRange: { value: 145, unit: "px" },
     radius: { value: 15, unit: "px" },
     invulnerableDuration: { value: 0.45, unit: "s" },
     contactDamage: { value: 18, unit: "HP" },
   };
   ```

   **Consumer pattern:**
   ```javascript
   import { PLAYER } from "../../configs/index.js";
   // In game logic — access .value
   return PLAYER.baseHealth.value + totalUpgradeLevel(meta, run, "maxHealth") * UPGRADES.maxHealth.effectPerLevel.value;
   // In viz — access .unit for labels
   yAxisLabel = `Health (${PLAYER.baseHealth.unit})`;
   ```

8. **Enemy type system** — **Decision: (A)** Array of enemy type objects. More enemy types are planned for the future, so the extensible array approach is worth it now.

   ```javascript
   export const ENEMY_TYPES = [
     { key: "normal", radius: { value: 16, unit: "px" }, speed: { value: 105, unit: "px/s" }, health: { value: 2, unit: "HP" }, scoreValue: { value: 25, unit: "pts" }, xpValue: { value: 8, unit: "XP" }, color: "#ff2e9a" },
     { key: "fast", radius: { value: 10, unit: "px" }, speed: { value: 175, unit: "px/s" }, health: { value: 1, unit: "HP" }, scoreValue: { value: 15, unit: "pts" }, xpValue: { value: 5, unit: "XP" }, color: "#ffe15c" },
   ];
   ```

### Balance Visualization

9. **Viz pages: served how** — **Decision: (B)** Serve via a simple static server (e.g. `npx serve .` or `python -m http.server`). No `package.json` added — the project remains zero-dependency vanilla JS. Document the serve command in viz page instructions.

10. **Viz page scope** — **Decision: 5 pages are sufficient for now.** Can expand later with additional views (rarity distributions, build diversity, Monte Carlo simulations) as needed.

11. **Proposed config workflow** — **Decision: (B)** UI sliders on the viz pages that let you adjust config values in real-time. This is the most iteration-friendly approach — adjust a slider, see the curve update instantly, then finalize values into the actual config file when satisfied.

   **Implementation approach:**
   - Each viz page reads current config values and populates slider controls
   - On slider change, recompute curves and update the chart in real-time
   - A "Copy to Clipboard" button outputs the final values as a JS config snippet that can be pasted into the config file
   - Sliders remember their state via URL params (so you can share a balance-test URL)

### Game Balance — Resolved

12. **Difficulty scaling implementation** — **Resolved: Verified as fully implemented.** `enemyHealthScale`, `enemySpeedScale`, and `damageScale` are all applied in `spawnEnemy()` (lines 167-168) and `spawnBullet()` (line 248). The `combat_balance_ui_plan.md` has been fully implemented. No action needed.

13. **Hub vs combat player speed discrepancy** — **Decision: Unify.** Hub player speed (`250`) and combat base speed (`260`) are not intentionally different. Unify to a single `PLAYER.baseSpeed` value in config. The hub scene will import `PLAYER.baseSpeed` instead of using its own hardcoded speed. Remove the separate `hubSpeed` concept.

14. **`damageScale(time)` design** — **Resolved: Working as designed.** Per the verified implementation, `damageScale(time)` is applied as a multiplier on bullet damage (`damageFor(meta, run) * damageScale(time)` in `spawnBullet()` line 248). This creates a dual-axis damage system: upgrades provide permanent investment scaling, while time-scaling ensures the player keeps pace with enemy health growth during a single run. Both axes are intended and working correctly.

15. **Upgrade cost formula** — **Decision: Configurable between linear and exponential.** See decision #6 above. The `costFormula` field in the upgrade config supports `"linear"` and `"exponential"`. Default remains `"linear"` for now. The viz pages will allow testing both curves interactively.

16. **XP formula** — **Decision: Tunable via configs, keep current values for now.** The XP base and multiplier are extracted to `PROGRESSION.xpBase` and `PROGRESSION.xpLevelMultiplier` in config. Current values (`20`, `1.25`) preserved. Can be adjusted later through config or viz slider experimentation without code changes.

---

## Appendix A: Complete Hardcoded Value → Config Mapping

### → `src/configs/player.js`
| Value | Current Location | Config Key |
|---|---|---|
| `100` (base health) | `upgrades.js:233` | `baseHealth` |
| `260` (base speed, unified hub+combat) | `upgrades.js:258`, `hubScene.js:18` | `baseSpeed` |
| `1` (base damage) | `upgrades.js:254` | `baseDamage` |
| `0.26` (base shot cooldown) | `upgrades.js:242` | `baseShotCooldown` |
| `145` (base pickup range) | `upgrades.js:250` | `basePickupRange` |
| `15` (player radius) | `combatScene.js:55` | `radius` |
| `0.45` (invulnerable duration) | `combatScene.js:362` | `invulnerableDuration` |
| `18` (enemy contact damage) | `combatScene.js:361` | `contactDamage` |

### → `src/configs/enemies.js`
| Value | Current Location | Config Key |
|---|---|---|
| `16` (normal radius) | `combatScene.js:173` | (in `ENEMY_TYPES` array) |
| `10` (fast radius) | `combatScene.js:173` | (in `ENEMY_TYPES` array) |
| `105` (normal speed) | `combatScene.js:174` | (in `ENEMY_TYPES` array) |
| `175` (fast speed) | `combatScene.js:174` | (in `ENEMY_TYPES` array) |
| `2` (normal health) | `combatScene.js:175` | (in `ENEMY_TYPES` array) |
| `1` (fast health) | `combatScene.js:175` | (in `ENEMY_TYPES` array) |
| `25` (normal score value) | `combatScene.js:176` | (in `ENEMY_TYPES` array) |
| `15` (fast score value) | `combatScene.js:176` | (in `ENEMY_TYPES` array) |
| `8` (normal XP) | `combatScene.js:177` | (in `ENEMY_TYPES` array) |
| `5` (fast XP) | `combatScene.js:177` | (in `ENEMY_TYPES` array) |
| `"#ff2e9a"` / `"#ffe15c"` (colors) | `combatScene.js:178` | (in `ENEMY_TYPES` array) |
| `95` (fast chance ramp rate) | `combatScene.js:166` | `fastChanceRampRate` |
| `0.08` (fast chance min) | `combatScene.js:166` | `fastChanceMin` |
| `0.36` (fast chance max) | `combatScene.js:166` | `fastChanceMax` |
| `90` (spawn buffer) | `combatScene.js:148` | `spawnBuffer` |

### → `src/configs/weapons.js`
| Value | Current Location | Config Key |
|---|---|---|
| `570` (bullet speed) | `combatScene.js:245-246, 387-388` | `bulletSpeed` |
| `5` (bullet radius) | `combatScene.js:247` | `bulletRadius` |
| `620` (targeting range) | `combatScene.js:189` | `targetingRange` |
| `22` (bullet spawn offset) | `combatScene.js:241-242` | `spawnOffset` |
| `4` (bullet max life) | (from plan) | `bulletMaxLife` |
| `9` (front shot spacing) | `combatScene.js:214-215` | `frontShotSpacing` |
| `0.18` (multishot base angle) | `combatScene.js:221` | `multishotBaseAngle` |
| `0.06` (multishot angle step) | `combatScene.js:221` | `multishotAngleStep` |
| `π/4` (diagonal base angle) | `combatScene.js:225` | `diagonalBaseAngle` |
| `0.08` (diagonal angle step) | `combatScene.js:225` | `diagonalAngleStep` |
| `8` (reverse shot spacing) | `combatScene.js:231` | `reverseShotSpacing` |
| `420` (bounce search range) | `combatScene.js:395` | `bounceSearchRange` |
| `0.8` (homing strength per level) | `combatScene.js:252` | `homingStrengthPerLevel` |
| `4` (homing turn rate multiplier) | `combatScene.js:305` | `homingTurnRateMultiplier` |
| `500` (homing search range) | `combatScene.js:253` | `homingSearchRange` |

### → `src/configs/difficulty.js`
| Value | Current Location | Config Key |
|---|---|---|
| `600` (time divisor) | `upgrades.js:272` | `timeDivisor` |
| `3` (enemy health coefficient) | `upgrades.js:276` | `enemyHealthCoefficient` |
| `1.5` (damage scale coefficient) | `upgrades.js:280` | `damageScaleCoefficient` |
| `0.4` (enemy speed coefficient) | `upgrades.js:284` | `enemySpeedCoefficient` |
| `1.2` (enemy speed cap) | `upgrades.js:284` | `enemySpeedCap` |
| `0.9` (spawn delay start) | `upgrades.js:288` | `spawnDelayStart` |
| `0.012` (spawn delay rate) | `upgrades.js:288` | `spawnDelayRate` |
| `0.15` (spawn delay min) | `upgrades.js:288` | `spawnDelayMin` |

### → `src/configs/upgrades.js`
| Value | Current Location | Config Key |
|---|---|---|
| `10` (maxHealth baseCost) | `upgrades.js:66` | `maxHealth.baseCost` |
| `20` (maxHealth effectPerLevel) | `upgrades.js:68` | `maxHealth.effectPerLevel` |
| `12` (healthRegen baseCost) | `upgrades.js:77` | `healthRegen.baseCost` |
| `0.25` (healthRegen effectPerLevel) | `upgrades.js:79` | `healthRegen.effectPerLevel` |
| `15` (fireRate baseCost) | `upgrades.js:88` | `fireRate.baseCost` |
| `0.08` (fireRate effectPerLevel) | `upgrades.js:90` | `fireRate.effectPerLevel` |
| `10` (xpGain baseCost) | `upgrades.js:99` | `xpGain.baseCost` |
| `0.1` (xpGain effectPerLevel) | `upgrades.js:101` | `xpGain.effectPerLevel` |
| `10` (pickupRange baseCost) | `upgrades.js:110` | `pickupRange.baseCost` |
| `18` (pickupRange effectPerLevel) | `upgrades.js:112` | `pickupRange.effectPerLevel` |
| `14` (damage baseCost) | `upgrades.js:121` | `damage.baseCost` |
| `0.2` (damage effectPerLevel) | `upgrades.js:123` | `damage.effectPerLevel` |
| `12` (moveSpeed baseCost) | `upgrades.js:131` | `moveSpeed.baseCost` |
| `0.07` (moveSpeed effectPerLevel) | `upgrades.js:133` | `moveSpeed.effectPerLevel` |

### → `src/configs/rarity.js`
| Value | Current Location | Config Key |
|---|---|---|
| 5 rarity tier definitions (key, label, multiplier, color, weight) | `upgrades.js:24-60` | Array of tier objects |

### → `src/configs/progression.js`
| Value | Current Location | Config Key |
|---|---|---|
| `20` (XP base) | `combatScene.js:45, 445` | `xpBase` |
| `1.25` (XP level multiplier) | `combatScene.js:445` | `xpLevelMultiplier` |
| `3` (level-up choices) | `combatScene.js:462` | `levelUpChoices` |
| `100` (diamond score divisor) | `combatScene.js:495` | `diamondRewardScoreDivisor` |
| `30` (diamond time divisor) | `combatScene.js:495` | `diamondRewardTimeDivisor` |
| `7` (XP gem radius) | `combatScene.js:413` | `gemRadius` |
| `220` (gem attract speed min) | `combatScene.js:428` | `gemAttractSpeedMin` |
| `420` (gem attract speed bonus) | `combatScene.js:428` | `gemAttractSpeedBonus` |

### → `src/configs/camera.js`
| Value | Current Location | Config Key |
|---|---|---|
| `820` (prune margin) | `combatScene.js:522` | `pruneMargin` |
| `1.75` (bullet max travel multiplier) | `combatScene.js:523` | `bulletMaxTravelMultiplier` |
| `22` (shake decay rate) | `combatScene.js:105` | `shakeDecayRate` |
| `8` (shake intensity on hit) | `combatScene.js:363` | `shakeIntensityOnHit` |
| `42` (grid spacing) | `combatScene.js:591` | `gridSpacing` |
| `0.24` (grid alpha) | `combatScene.js:597` | `gridAlpha` |
| `"#1a8ea3"` (grid color) | `combatScene.js:598` | `gridColor` |

### → `src/configs/particles.js`
| Value | Current Location | Config Key |
|---|---|---|
| `5` (hit particles) | `combatScene.js:345` | `hitParticleCount` |
| `16` (death particles) | `combatScene.js:351` | `deathParticleCount` |
| `18` (player hit particles) | `combatScene.js:364` | `playerHitParticleCount` |
| `70` / `240` (speed min/range) | `combatScene.js:505` | `speedMin`, `speedRange` |
| `2` / `3` (radius min/range) | `combatScene.js:511` | `radiusMin`, `radiusRange` |
| `0.35` / `0.35` (life min/range) | `combatScene.js:512` | `lifeMin`, `lifeRange` |
| `0.7` (max life) | `combatScene.js:513` | `maxLife` |
| `3.2` (drag coefficient) | `combatScene.js:284` | `dragCoefficient` |

### → `src/configs/hub.js`
| Value | Current Location | Config Key |
|---|---|---|
| `760` / `460` (room size) | `hubScene.js:5-6` | `roomWidth`, `roomHeight` |
| `74` (interact distance) | `hubScene.js:9` | `interactDistance` |
| `15` (hub player radius) | `hubScene.js:17` | `playerRadius` |
| `80` (spawn offset) | `hubScene.js:27` | `playerSpawnOffset` |
| `28` (boundary padding) | `hubScene.js:55-56` | `boundaryPadding` |
| Station positions (3) | `hubScene.js:76-94` | `stationPositions` array |

> **Note**: Hub player speed (`250` in `hubScene.js:18`) is removed — hub scene now imports `PLAYER.baseSpeed` from `configs/player.js`. See decision #13.

### → `src/configs/engine.js`
| Value | Current Location | Config Key |
|---|---|---|
| `0.033` (max delta time) | `app.js:53` | `maxDeltaTime` |
| `0.24` (gamepad deadzone) | `input.js:53` | `gamepadDeadzone` |
| `0.62` (gamepad trigger threshold) | `input.js:127` | `gamepadTriggerThreshold` |
| `0.4` (gamepad release threshold) | `input.js:130` | `gamepadReleaseThreshold` |

---

## Appendix B: Files Modified (Complete List)

### New files
- `src/configs/player.js`
- `src/configs/enemies.js`
- `src/configs/weapons.js`
- `src/configs/difficulty.js`
- `src/configs/upgrades.js`
- `src/configs/rarity.js`
- `src/configs/progression.js`
- `src/configs/camera.js`
- `src/configs/particles.js`
- `src/configs/hub.js`
- `src/configs/engine.js`
- `src/configs/index.js` (barrel re-export)
- `src/upgrades/definitions.js`
- `src/upgrades/stats.js`
- `src/upgrades/difficulty.js`
- `src/upgrades/rarity.js`
- `src/upgrades/extraShotFilters.js`
- `src/upgrades/index.js` (barrel re-export)
- `src/scenes/combat/CombatScene.js`
- `src/scenes/combat/PlayerController.js`
- `src/scenes/combat/EnemySpawner.js`
- `src/scenes/combat/WeaponSystem.js`
- `src/scenes/combat/CombatResolver.js`
- `src/scenes/combat/ProgressionSystem.js`
- `src/scenes/combat/CombatRenderer.js`
- `viz/index.html`
- `viz/difficulty.html`
- `viz/upgrade-scaling.html`
- `viz/enemy-scaling.html`
- `viz/economy.html`
- `viz/combat-dps.html`

### Modified files
- `src/app.js` — Update CombatScene import path
- `src/ui.js` — Update upgrades import path
- `src/store.js` — Update upgrades import path
- `src/scenes/hubScene.js` — Replace hardcoded hub values with config imports
- `src/input.js` — Replace hardcoded gamepad values with config imports
- `src/renderer.js` — Replace hardcoded render values with config imports

### Deleted files
- `src/upgrades.js` — Replaced by `src/upgrades/` directory
- `src/scenes/combatScene.js` — Replaced by `src/scenes/combat/` directory

---

## Appendix C: DRY & Clean Code Principles Applied

1. **Single source of truth**: Every game-balance number exists in exactly one config file. No more duplicated `570` bullet speed in two places. Hub and combat share `PLAYER.baseSpeed` — no more separate `250` vs `260` discrepancy.
2. **Open/closed principle**: Adding a new enemy type = adding an entry to `configs/enemies.js` `ENEMY_TYPES` array + the spawner handles it. No combat logic changes needed.
3. **Separation of concerns**: Configs hold data + metadata. Upgrades modules hold upgrade logic. Combat modules hold game-loop behavior. Viz pages hold visualization + sliders. No module does two of these.
4. **Dependency inversion**: Combat modules depend on config abstractions (imported values), not hardcoded concrete numbers. Changing a value in config changes behavior without touching logic code.
5. **No magic numbers**: After extraction, zero inline numeric literals in game-logic code. Every number has a name, a home, and a unit.
6. **Testable balance**: Viz sliders allow real-time curve adjustment with URL-param sharing. "Copy Config" button bridges the gap between experimentation and implementation.
7. **Module cohesion**: Each combat subsystem has one job. Each upgrades submodule has one job. Each config has one domain.
8. **Configurable cost formula**: `upgradeCost()` dispatches on `costFormula` type (`"linear"` or `"exponential"`) — open for extension without modifying existing logic.
9. **Orchestrator as mediator**: Combat subsystems emit results, orchestrator routes side effects — no circular dependencies between subsystems.
