# Combat Balance & UI Improvements Plan

## Objective
Four improvements to polish combat and UI:
1. **Bullet max lifetime** — Add time-based expiry so homing/tracking bullets can't fly forever
2. **Projectile bounce as extra-shot upgrade** — One per run like other extra-shot types
3. **Difficulty scaling over time** — Enemy spawn rate, health, and player damage increase as run progresses
4. **Active upgrades panel & scrollable lists** — Show current upgrades during combat; make shop/level-up lists scroll within viewport

---

## Architecture Overview

### Key Design Decisions:
- **Bullet lifetime**: Add `maxLife` (seconds) to bullet spawn; decrement in `updateActors`; check in `prune()`. Distance check remains as secondary cull.
- **Bounce as extra-shot**: Add `projectileBounce` to `EXTRA_SHOT_UPGRADES`; reuse existing one-per-run enforcement
- **Difficulty scaling**: Use `run.time` as the sole driver for infinite scaling curves; centralize in `difficultyFor()` helper using logarithmic growth (same early curve, unbounded); ensures no build survives forever
- **UI scroll**: CSS `max-height` + `overflow-y: auto` on list containers; JS scroll-into-view for keyboard navigation

---

## File 1: `src/upgrades.js` (Edit)

### Changes:
1. Add `projectileBounce` to `EXTRA_SHOT_UPGRADES`
2. Add `difficultyFor(time)` helper — returns unbounded logarithmic growth (same early curve as before, never caps)

### Code:
```javascript
// In EXTRA_SHOT_UPGRADES, add:
projectileBounce: { label: "Bounce", category: "extraShot" }

// NEW: Difficulty scaling — logarithmic, unbounded
// At t=0: 0, t=600s(10min): ~1, t=1200s(20min): ~1.59, t=3600s(1hr): ~2.59
// Same early-game feel as the old linear clamp(0→1), but never stops growing
// Every ~10 minutes adds roughly another 1.0 to the difficulty value
export function difficultyFor(time) {
  if (time <= 0) return 0;
  return Math.log2(1 + time / 600);
}

// NEW: Multiplier for enemy health based on run time (unbounded)
// 1x at start → 4x at 10min → ~7.8x at 20min → keeps climbing
export function enemyHealthScale(time) {
  return 1 + difficultyFor(time) * 3;
}

// NEW: Multiplier for player damage scaling (smaller curve so enemies outscale eventually)
// 1x at start → 2.5x at 10min → ~4.8x at 20min — enemies still win the arms race
export function damageScale(time) {
  return 1 + difficultyFor(time) * 1.5;
}

// NEW: Multiplier for enemy speed (capped for readability — enemies zipping too fast feels bad)
// 1x at start → 1.8x at 10min → 2.2x cap at ~30min
export function enemySpeedScale(time) {
  return 1 + clamp(difficultyFor(time) * 0.4, 0, 1.2);
}

// NEW: Spawn interval multiplier (capped for performance — too many entities tanks framerate)
// Clamped so minimum interval is 0.15s (~6-7 spawns/sec) no matter how long the run
export function spawnDelayFor(time) {
  return clamp(0.9 - time * 0.012, 0.15, 0.9);
}
```

### Why in upgrades.js?
`difficultyFor()` is a balance function alongside the existing `damageFor()`, `maxHealthFor()`, etc. Keeping all stat-computation in one place is DRY — combatScene just calls the helper.

---

## File 2: `src/scenes/combatScene.js` (Edit)

### Changes:

#### 1. Bullet Max Lifetime
- In `spawnBullet()`: add `maxLife: 4` (seconds), `age: 0`
- In `updateActors(dt)`: increment `bullet.age += dt`
- In `prune()`: remove bullets where `bullet.age >= bullet.maxLife`
- In `resolveBulletBounce()`: after bounce, set `bullet.age = 0` (refresh lifetime on redirect — keeps bounce viable without letting bullets live forever)

#### 2. Bounce as Extra-Shot (one per run)
- No combatScene changes needed — `EXTRA_SHOT_UPGRADES` inclusion + existing `filterUpgradeChoices()` / `chooseLevelUpgrade()` logic handles it automatically

#### 3. Difficulty Scaling (infinite)
- In `spawnEnemy()`: scale `health` by `enemyHealthScale(time)`, `speed` by `enemySpeedScale(time)`
- In `updateSpawns()`: use `spawnDelayFor(time)` for interval (capped at 0.15s floor)
- In `spawnBullet()`: scale `damage` by `damageScale(time)`

### Code:

```javascript
// In spawnBullet(), replace damage line:
damage: damageFor(this.app.store.meta, this.run) * damageScale(this.run.time),

// In spawnBullet(), add after homingRange:
maxLife: 4,
age: 0

// In updateActors(dt), inside bullet loop, add:
bullet.age += dt;

// In resolveBulletBounce(), after redirecting velocity, add:
bullet.age = 0;

// In prune(), add to bullet filter:
if (bullet.age >= bullet.maxLife) return false;

// In spawnEnemy(), scale health and speed:
const healthScale = enemyHealthScale(this.run.time);
const speedScale = enemySpeedScale(this.run.time);
this.run.enemies.push({
  id: this.run.nextEnemyId,
  x, y,
  radius: fast ? 10 : 16,
  speed: (fast ? 175 : 105) * speedScale,
  health: (fast ? 1 : 2) * healthScale,
  value: fast ? 15 : 25,
  xp: fast ? 5 : 8,
  color: fast ? "#ffe15c" : "#ff2e9a"
});

// In updateSpawns(), use the helper (capped floor at 0.15s):
const spawnDelay = spawnDelayFor(this.run.time);
```

### Import changes:
```javascript
import {
// ...existing...
  difficultyFor,
  enemyHealthScale,
  enemySpeedScale,
  spawnDelayFor,
  damageScale
} from "../upgrades.js";
```

---

## File 3: `index.html` (Edit)

### Changes:
1. Add active-upgrades panel HTML to the HUD
2. The panel is only visible during combat

### Code:
```html
<!-- After the .hud div, add: -->
<div id="active-upgrades" class="active-upgrades hidden">
  <h3>Upgrades</h3>
  <div id="upgrade-list" class="upgrade-list"></div>
</div>
```

---

## File 4: `styles.css` (Edit)

### Changes:
1. Add active-upgrades panel styles (positioned right side, scrollable list)
2. Make shop-list scrollable within the panel
3. Make level-options scrollable within the panel

### Code:
```css
.active-upgrades {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 220px;
  max-height: calc(100vh - 32px);
  padding: 12px;
  border: 1px solid rgba(156, 246, 255, 0.2);
  border-radius: 8px;
  background: rgba(5, 8, 20, 0.68);
  box-shadow: 0 0 24px rgba(0, 224, 255, 0.08);
  backdrop-filter: blur(10px);
  pointer-events: none;
  overflow-y: auto;
}

.active-upgrades.hidden {
  display: none;
}

.active-upgrades h3 {
  margin: 0 0 8px;
  color: #a6bdc8;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.upgrade-list {
  display: grid;
  gap: 4px;
}

.upgrade-entry {
  padding: 5px 8px;
  border: 1px solid rgba(156, 246, 255, 0.1);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.035);
  font-size: 12px;
}

.upgrade-entry .upgrade-name {
  color: #dceff5;
  font-weight: 700;
}

.upgrade-entry .upgrade-detail {
  color: #8ea8b6;
  font-size: 11px;
}

/* Scrollable shop list — constrain to viewport */
.shop-panel {
  display: flex;
  flex-direction: column;
  max-height: min(520px, calc(100vh - 64px));
}

.shop-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* Scrollable level options — constrain to viewport */
.level-panel {
  display: flex;
  flex-direction: column;
  max-height: min(480px, calc(100vh - 64px));
}

.level-options {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* Scrollbar styling for upgrade/shop/level lists */
.shop-list::-webkit-scrollbar,
.level-options::-webkit-scrollbar,
.upgrade-list::-webkit-scrollbar,
.active-upgrades::-webkit-scrollbar {
  width: 4px;
}

.shop-list::-webkit-scrollbar-thumb,
.level-options::-webkit-scrollbar-thumb,
.upgrade-list::-webkit-scrollbar-thumb,
.active-upgrades::-webkit-scrollbar-thumb {
  background: rgba(0, 224, 255, 0.3);
  border-radius: 2px;
}
```

---

## File 5: `src/ui.js` (Edit)

### Changes:
1. Add `activeUpgradesEl` and `upgradeListEl` element references
2. Add `renderActiveUpgrades(meta, run)` method — builds the current-upgrade list shown during combat
3. Call `renderActiveUpgrades` from `setCombat()`
4. Add scroll-into-view for shop and level-up keyboard navigation
5. Import new helpers from `upgrades.js`

### Code:

```javascript
// In constructor, add element references:
this.activeUpgradesEl = document.getElementById("active-upgrades");
this.upgradeListEl = document.getElementById("upgrade-list");

// In setHub(), hide the panel:
this.activeUpgradesEl.classList.add("hidden");

// In setCombat(), show and render:
setCombat(run) {
  this.areaEl.textContent = "Level";
  this.healthEl.textContent = Math.max(0, Math.ceil(run.player.health));
  this.scoreEl.textContent = run.score;
  this.timeEl.textContent = formatTime(run.time);
  this.levelEl.textContent = `${run.level} (${Math.floor(run.xp)}/${run.xpToNext})`;
  this.syncMeta();
  this.activeUpgradesEl.classList.remove("hidden");
  this.renderActiveUpgrades(this.store.meta, run);
}

// NEW: Render active upgrades panel
renderActiveUpgrades(meta, run) {
  this.upgradeListEl.innerHTML = "";
  const temporary = run.temporaryUpgrades;
  const permanent = meta.upgrades;

  for (const key of UPGRADE_KEYS) {
    const permLevel = permanent[key] || 0;
    const tempLevel = temporary[key] || 0;
    if (permLevel === 0 && tempLevel === 0) continue;

    const upgrade = UPGRADES[key];
    const entry = document.createElement("div");
    entry.className = "upgrade-entry";

    const totalLevel = permLevel + tempLevel;

    if (isExtraShotUpgrade(key)) {
      // Extra-shot: show rarity and upgrade amount
      const rarityKey = run.extraShotRarities?.[key] || "common";
      const rarity = RARITIES[rarityKey];
      entry.style.borderColor = rarity.color + "44";
      entry.innerHTML = `
        <span class="upgrade-name" style="color:${rarity.color}">${upgrade.label}</span>
        <span class="upgrade-detail">${rarity.label} · ${upgrade.describe(tempLevel)}</span>
      `;
    } else if (upgrade.permanent && tempLevel === 0) {
      // Permanent-only: show level and effect
      entry.innerHTML = `
        <span class="upgrade-name">${upgrade.label}</span>
        <span class="upgrade-detail">Lv ${permLevel} · ${upgrade.describe(permLevel)}</span>
      `;
    } else {
      // Stackable temporary: show per-rarity counts and total
      const counts = run.rarityCounts?.[key];
      let detail = "";
      if (counts && Object.keys(counts).length > 0) {
        const parts = Object.entries(counts)
          .filter(([, c]) => c > 0)
          .map(([rKey, c]) => {
            const r = RARITIES[rKey];
            return `<span style="color:${r.color}">${r.label} x${c}</span>`;
          });
        detail = parts.join(" + ") + ` = ${upgrade.describe(totalLevel)}`;
      } else {
        detail = upgrade.describe(totalLevel);
      }

      const permPart = permLevel > 0 ? `Lv ${permLevel} + ` : "";
      entry.innerHTML = `
        <span class="upgrade-name">${upgrade.label}</span>
        <span class="upgrade-detail">${permPart}${detail}</span>
      `;
    }

    this.upgradeListEl.appendChild(entry);
  }
}
```

### Import changes for ui.js:
```javascript
import {
  PERMANENT_UPGRADE_KEYS,
  UPGRADE_KEYS,
  UPGRADES,
  RARITIES,
  upgradeCost,
  isExtraShotUpgrade
} from "./upgrades.js";
```

---

## File 6: `src/scenes/combatScene.js` — Rarity Count Tracking

### Change:
Track per-upgrade rarity counts in `chooseLevelUpgrade()` so the UI can display "Common x2 + Rare x1 = +60% damage".

### Code:
```javascript
// In enter(), add to run state:
rarityCounts: {},

// In chooseLevelUpgrade(), for non-extra-shot temporary upgrades:
if (isExtraShotUpgrade(key)) {
  // ...existing extra-shot logic...
} else {
  this.run.temporaryUpgrades[key] += rarity.multiplier;
  if (!this.run.rarityCounts[key]) this.run.rarityCounts[key] = {};
  const count = this.run.rarityCounts[key][rarity.key] || 0;
  this.run.rarityCounts[key][rarity.key] = count + 1;
}
```

---

## Implementation Order

1. **Bullet max lifetime** — Small, isolated change in spawnBullet/updateActors/prune
2. **Bounce as extra-shot** — Single-line addition to EXTRA_SHOT_UPGRADES
3. **Difficulty scaling** — Add helpers, apply in spawnEnemy/spawnBullet/updateSpawns
4. **Rarity count tracking** — Add rarityCounts to run state, populate in chooseLevelUpgrade
5. **Active upgrades panel** — HTML + CSS + renderActiveUpgrades in ui.js
6. **Scrollable lists** — CSS changes for shop and level-up panels

---

## Testing Checklist

- [ ] Bullets expire after 4 seconds even when homing with no target
- [ ] Bouncing bullets get lifetime refreshed on each bounce
- [ ] Can only pick one projectileBounce per run (like other extra-shots)
- [ ] Re-offered bounce only at higher rarity than current
- [ ] Enemy health visibly increases over a long run (e.g. 5+ min)
- [ ] Enemy health/speed keep scaling at 20+ min — no cap (player eventually overwhelmed)
- [ ] Player damage scales but slower than enemy health — enemies win the arms race
- [ ] Enemy speed increases over time but caps at 2.2x (still dodge-able)
- [ ] Spawn rate increases over time but floors at 0.15s interval (performance safe)
- [ ] Active upgrades panel appears during combat, hides in hub
- [ ] Each acquired upgrade shows name, rarity color, and effect amount
- [ ] Stackable upgrades show per-rarity counts (e.g. "Common x2 + Rare x1")
- [ ] Extra-shot upgrades show their single rarity tier
- [ ] Upgrade list scrolls when many upgrades are acquired
- [ ] Shop list scrolls when items exceed viewport
- [ ] Level-up choices scroll if needed
- [ ] Keyboard navigation scrolls selected item into view

---

## DRY & Clean Code Principles

1. **Single source of truth**: `difficultyFor()` is the one unbounded scaling driver using `log2(1 + t/600)`; `enemyHealthScale` and `damageScale` derive from it with different coefficients so enemies always outscale the player eventually
2. **Reuse**: `EXTRA_SHOT_UPGRADES` already drives one-per-run enforcement; adding bounce is one line
3. **Separation**: Difficulty helpers in `upgrades.js`, application in `combatScene.js`, display in `ui.js`
4. **No duplication**: `renderActiveUpgrades` uses `UPGRADE_KEYS`, `UPGRADES`, `RARITIES` — all from `upgrades.js`
5. **Consistent patterns**: Rarity count tracking follows the same `run.state` → `chooseLevelUpgrade` → UI flow as extra-shot rarities
