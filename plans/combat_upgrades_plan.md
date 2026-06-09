# Combat Upgrades & Bullet System Plan

## Objective
Enhance the combat system with three major improvements:
1. **Distance-based bullet lifetime** - Bullets persist until 1.5-2 screen widths away from player
2. **Extra shot upgrade limits** - One of each extra-shot type per combat run, with rarity upgrades replacing current
3. **Tracking/Homing upgrade** - New upgrade with steering behaviors for natural curved projectile paths

---

## Architecture Overview

### Key Design Decisions:
- **Bullet lifetime**: Replace time-based `life` with distance-from-player check in `prune()`
- **Upgrade limits**: Track selected extra-shot upgrades per combat run, enforce single-instance with rarity replacement
- **Tracking upgrade**: Add new `homing` combat-only upgrade; implement steering behavior in bullet update
- **Clean separation**: Keep upgrade logic in `upgrades.js`, combat logic in `combatScene.js`

---

## File 1: `src/upgrades.js` (Edit)

### Changes:
1. Add `homing` to `COMBAT_ONLY_UPGRADE_KEYS`
2. Add `homing` upgrade definition with steering force parameters
3. Add helper to get homing level for a run
4. Add upgrade category metadata for extra-shot types

### Code:
```javascript
export const COMBAT_ONLY_UPGRADE_KEYS = [
  "projectileBounce",
  "multishot",
  "frontShot",
  "diagonalShot",
  "reverseShot",
  "homing"  // NEW
];

// In UPGRADES object, add:
homing: {
  key: "homing",
  label: "Homing Projectiles",
  unit: "Tracking",
  effectPerLevel: 1,  // Levels = steering strength tiers
  permanent: false,
  describe(level) {
    const strengths = ["Weak", "Moderate", "Strong", "Perfect"];
    return `Homing: ${strengths[Math.min(Math.floor(level), strengths.length - 1)]}`;
  }
},

// NEW: Category metadata for extra-shot upgrades (enforces one-per-run)
export const EXTRA_SHOT_UPGRADES = {
  multishot: { label: "Side Shot", category: "extraShot" },
  frontShot: { label: "Front Shot", category: "extraShot" },
  diagonalShot: { label: "Diagonal Shot", category: "extraShot" },
  reverseShot: { label: "Reverse Shot", category: "extraShot" },
  homing: { label: "Homing", category: "extraShot" }  // Also counts as extra shot for limit purposes
};
```

---

## File 2: `src/scenes/combatScene.js` (Edit)

### Changes:

#### 1. Bullet Lifetime (Distance-based)
- Remove `life` timer from bullet spawn
- In `prune()`, calculate distance from player; remove if > `maxScreenDistance`
- `maxScreenDistance = Math.max(width, height) * 1.75` (configurable 1.5-2)

#### 2. Extra Shot Upgrade Limit Enforcement
- Track `selectedExtraShots: Set<string>` in run state
- In `chooseLevelUpgrade()`: if upgrade is in `EXTRA_SHOT_UPGRADES` category:
  - If already has that specific key → replace with higher rarity only
  - If has different extra-shot key → block (or show as unavailable in level-up choices)
- In `randomUpgradeChoices()`: filter out extra-shot upgrades already selected (unless higher rarity available)

#### 3. Homing/Tracking Behavior
- In `spawnBullet()`: if homing level > 0, add `homingStrength` and `targetEnemyId` (null initially)
- In `updateActors()`: for homing bullets, find nearest enemy within range, apply steering force
- Steering: `desiredVelocity = normalize(target - bullet) * bulletSpeed; steering = desired - current; apply limited steering force`

### Code Structure:

```javascript
// In enter(), add to run:
selectedExtraShots: new Set(),  // Tracks which extra-shot keys player has taken

// In firePattern(), get homing level:
const homing = wholeUpgradeLevel(meta, this.run, "homing");

// In spawnBullet(), add homing properties:
if (homing > 0) {
  bullet.homingStrength = homing * 0.8;  // Tunable base strength per level
  bullet.homingRange = 500;              // Search range for targets
  bullet.targetEnemyId = null;
}

// In updateActors(dt), for each bullet:
if (bullet.homingStrength > 0) {
  this.updateHoming(bullet, dt);
}

// NEW method:
updateHoming(bullet, dt) {
  // Find or keep current target
  let target = bullet.targetEnemyId 
    ? this.run.enemies.find(e => e.id === bullet.targetEnemyId) 
    : null;
  
  if (!target || target.health <= 0) {
    target = this.findNearestEnemy(bullet.x, bullet.y, bullet.homingRange);
    bullet.targetEnemyId = target?.id ?? null;
  }
  
  if (target) {
    const desired = normalize(target.x - bullet.x, target.y - bullet.y);
    const current = normalize(bullet.vx, bullet.vy);
    // Steering force - limited turn rate for natural curves
    const turnRate = bullet.homingStrength * 4 * dt;  // Radians per second
    const angle = Math.atan2(desired.y, desired.x) - Math.atan2(current.y, current.x);
    const clampedAngle = clamp(angle, -turnRate, turnRate);
    const newAngle = Math.atan2(current.y, current.x) + clampedAngle;
    bullet.vx = Math.cos(newAngle) * 570;
    bullet.vy = Math.sin(newAngle) * 570;
  }
}

// In prune(), replace life check:
const maxDist = Math.max(width, height) * 1.75;
const dx = bullet.x - this.run.player.x;
const dy = bullet.y - this.run.player.y;
if (dx * dx + dy * dy > maxDist * maxDist) return false;  // Remove bullet
```

---

## File 3: `src/upgrades.js` - Additional Helper Functions

### Add:
```javascript
// Check if upgrade is an extra-shot type
export function isExtraShotUpgrade(key) {
  return key in EXTRA_SHOT_UPGRADES;
}

// Get all extra-shot keys player has selected this run
export function getSelectedExtraShots(run) {
  return run.selectedExtraShots || new Set();
}

// Filter level-up choices to respect extra-shot limits
export function filterUpgradeChoices(choices, run) {
  const selected = getSelectedExtraShots(run);
  return choices.filter(choice => {
    if (!isExtraShotUpgrade(choice.key)) return true;
    if (!selected.has(choice.key)) return true;  // Don't have this one yet
    // Have it - only allow if higher rarity (would replace)
    const currentLevel = run.temporaryUpgrades[choice.key] || 0;
    return choice.rarity.multiplier > currentLevel;
  });
}
```

---

## Implementation Order

1. **Bullet Lifetime** - Simplest, isolated change in `prune()` and `spawnBullet()`
2. **Extra Shot Limits** - Requires run state tracking, choice filtering, and upgrade replacement logic
3. **Homing Upgrade** - New upgrade definition + steering behavior in bullet update

---

## Testing Checklist

- [ ] Bullets travel ~1.75 screen widths before despawning
- [ ] Can only pick one multishot/frontShot/diagonalShot/reverseShot/homing per run
- [ ] Picking same extra-shot upgrade replaces with higher rarity
- [ ] Homing bullets curve naturally toward enemies (not snap)
- [ ] Homing respects upgrade level (weak → perfect tracking)
- [ ] No performance regression with many homing bullets

---

## DRY & Clean Code Principles

1. **Single source of truth**: `EXTRA_SHOT_UPGRADES` defines which upgrades are mutually exclusive
2. **Separation**: Upgrade definitions in `upgrades.js`, runtime logic in `combatScene.js`
3. **Reusability**: `filterUpgradeChoices()` can be used by UI for preview
4. **Extensibility**: New extra-shot types only need adding to `EXTRA_SHOT_UPGRADES`