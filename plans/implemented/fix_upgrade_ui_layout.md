# Fix Upgrade UI Layout & Broken Level-Up System

## Problem Statement

Three bugs affect the upgrade panels, one of which is a **completely broken core game system**:

### Bug 1: Shop & Level-Up Tiles Shrink Below Content Height

When the scroll container (`.shop-list` / `.level-options`) has enough items to require scrolling, the flex layout with `flex: 1; min-height: 0` on the scroll container causes the **panel background** to correctly cap at `max-height`, but the individual tiles visually compress. The tiles have `min-height: 70px` which should prevent shrinking, but the real issue is: the panel's fixed `max-height` can be smaller than the total content on short viewports, and the flex container distributes space such that tiles appear crammed with the scrollbar barely visible. The panel background stays at its `max-height` while tile content gets visually tighter than intended — the gap between tiles shrinks and the tiles feel "scrunched."

Root cause: The panel uses `display:flex; flex-direction:column` with the scroll list as `flex:1; min-height:0`. This works for scrolling, but there's no guarantee of a minimum usable height for the scroll area. On very short viewports (or if the title/message/close-button take up too much space), the list area can shrink to near-zero, making tiles look crushed. Additionally, the tiles have no explicit `height` — only `min-height: 70px` — so when the scroll container is very short, tiles render at their minimum height with no padding room, looking cramped.

### Bug 2: Acquired Upgrades Panel Cannot Scroll & Has Scrunched Formatting

The `.active-upgrades` panel has `overflow-y: auto` and `max-height: calc(100vh - 32px)`, which should allow scrolling. However:
- `pointer-events: none` is set on the panel (to prevent clicks from blocking the game canvas underneath). This **also prevents scroll events** from reaching the panel in most browsers — the events pass through to the canvas.
- The 220px fixed width is too narrow for the upgrade detail text. Entries with rarity breakdowns (e.g. `"Common x2 + Rare x1 = +30% damage"`) wrap aggressively, creating a scrunched, hard-to-read layout.
- `.upgrade-entry` has no `line-height` set, making wrapped text very tight.
- The name and detail spans are inline, so long detail text wraps right after the short name, wasting the left-aligned name column.

### Bug 3: Combat Level-Up System Is Completely Broken

The in-combat level-up upgrade selection screen **never opens**. Players gain XP, level up silently, and never get to choose upgrades. This is a **dead game system** — the entire level-up UI exists but is never triggered.

**Root cause analysis:**

The break is in `ProgressionSystem.addXp()` (`src/scenes/combat/ProgressionSystem.js:30-37`):

```js
addXp(run, meta, value) {
  run.xp += value * xpMultiplierFor(meta, run);
  while (run.xp >= run.xpToNext && run.state === "running") {
    run.xp -= run.xpToNext;
    run.level += 1;
    run.xpToNext = Math.floor(...);
  }
}
```

This loop silently increments `run.level` for every level-up without:
1. Setting `run.state = "levelup"` to pause the game
2. Generating upgrade choices via `randomUpgradeChoices()`
3. Calling `UI.openLevelUp(choices)` to show the selection screen

Meanwhile, `CombatScene.update()` (`src/scenes/combat/CombatScene.js:79-87`) has a **complete handler** for the `"levelup"` state — it processes navigation input and confirms selections — but nothing ever transitions INTO that state.

**The full chain that should exist but doesn't:**

```
ProgressionSystem.addXp() detects level-up
  -> pauses game (run.state = "levelup")
  -> generates choices via randomUpgradeChoices()
  -> calls UI.openLevelUp(choices)
  -> [game loop skips update, only processes UI navigation]
  -> player selects upgrade
  -> CombatScene.chooseLevelUpgrade() applies the choice
  -> run.state = "running", UI closes
```

**Additional problems with the current `addXp()` loop:**
- Multiple level-ups in one frame (e.g., collecting a large XP gem) would skip all intermediate level-ups — the player only gets one choice for potentially many levels gained
- The loop condition checks `run.state === "running"` but `addXp` shouldn't be managing game state — that's the orchestrator's job

**Files involved:**
| File | Current Behavior | Needed Change |
|---|---|---|
| `src/scenes/combat/ProgressionSystem.js` | `addXp()` loops through all level-ups silently | `addXp()` should return level-up info to the orchestrator, not loop |
| `src/scenes/combat/CombatScene.js` | Never calls `openLevelUp`, never sets state to "levelup" | Orchestrator must detect level-up, pause game, open UI |
| `src/ui.js` | `openLevelUp()` exists but is never called | No changes needed — already correct |
| `src/input.js` | Already maps keys to `uiLeft/uiRight/uiUp/uiDown/uiConfirm` | No changes needed — already correct |

---

## Proposed Changes

### Fix 1: Shop & Level-Up Tiles — Consistent Sizing with Minimum Scroll Area

**Files:** `styles.css`

#### 1a. Set a minimum height on the panels

Add to `.shop-panel` and `.level-panel`:
```css
.shop-panel {
  min-height: min(360px, calc(100vh - 64px));
}

.level-panel {
  min-height: min(320px, calc(100vh - 64px));
}
```

This ensures the panel always has a minimum height, which in turn guarantees the flex child (scroll list) gets reasonable space. The `min()` clamp still respects small viewports.

#### 1b. Breathing room and scrollbar visibility on scroll containers

```css
.shop-list,
.level-options {
  padding: 4px 0;        /* NEW: breathing room at scroll edges */
  scrollbar-gutter: stable; /* NEW: reserve space for scrollbar */
}
```

#### 1c. Tile height consistency

Keep `min-height: 70px` on tiles (it's fine — tiles don't shrink below 70px). The real fix is 1a + 1b ensuring the scroll container always has enough room so tiles aren't compressed.

### Fix 2: Acquired Upgrades Panel — Scrollable + Better Formatting

**Files:** `styles.css`

#### 2a. Enable scrolling despite `pointer-events: none`

Keep `pointer-events: none` on the outer container, but set `pointer-events: auto` on the inner `.upgrade-list` scroll container. Move `overflow-y: auto` from the outer `.active-upgrades` to `.upgrade-list`.

```css
.active-upgrades {
  /* ...existing... */
  width: 260px;                   /* CHANGED: 220px -> 260px */
  overflow: hidden;               /* CHANGED: was overflow-y: auto */
  display: flex;                  /* NEW: flex column for header + scroll */
  flex-direction: column;         /* NEW */
}

.upgrade-list {
  /* ...existing display:grid; gap:4px... */
  overflow-y: auto;               /* NEW: scroll on inner container */
  flex: 1;                        /* NEW: fill remaining height */
  min-height: 0;                  /* NEW: allow flex shrink for scroll */
  pointer-events: auto;           /* NEW: enable scroll interaction */
  padding-right: 4px;             /* NEW: space for scrollbar thumb */
  scrollbar-gutter: stable;       /* NEW: prevent layout shift */
}
```

#### 2b. Improve entry formatting — two-line stacked layout

```css
.upgrade-entry {
  padding: 6px 8px;                    /* CHANGED: 5px -> 6px vertical */
  /* ...existing border, radius, bg... */
  line-height: 1.4;                    /* NEW: prevent scrunched text */
  display: flex;                       /* NEW */
  flex-direction: column;              /* NEW: stack name over detail */
  gap: 2px;                            /* NEW: small gap between name/detail */
}

.upgrade-entry .upgrade-name {
  /* ...existing color, font-weight... */
  font-size: 12px;                     /* NEW: explicit */
}

.upgrade-entry .upgrade-detail {
  /* ...existing color, font-size: 11px... */
  line-height: 1.35;                   /* NEW: slightly tighter for detail */
  word-break: break-word;              /* NEW: break long rarity strings */
}
```

### Fix 3: Wire Up the Level-Up System

**Files:** `src/scenes/combat/ProgressionSystem.js`, `src/scenes/combat/CombatScene.js`

#### 3a. Change `addXp()` to return level-up info instead of looping

Currently `addXp()` silently loops through all level-ups. Change it to process **only the first level-up** per call and return a flag so the orchestrator can pause and open the UI.

```js
// ProgressionSystem.js

addXp(run, meta, value) {
  run.xp += value * xpMultiplierFor(meta, run);
  if (run.xp >= run.xpToNext && run.state === "running") {
    run.xp -= run.xpToNext;
    run.level += 1;
    run.xpToNext = Math.floor(
      PROGRESSION.xpBase.value * run.level * PROGRESSION.xpLevelMultiplier.value
    );
    return true;  // SIGNAL: level-up happened
  }
  return false;
}
```

Key changes:
- **Removed the `while` loop** — replaced with a single `if` check. Only one level-up per `addXp` call.
- **Returns `true`** when a level-up occurs, `false` otherwise. The orchestrator decides what to do with this signal.
- Remaining XP overflow (if any) will be handled on the next `collectXp` call — the player's leftover XP stays in `run.xp` and will trigger another level-up the next frame. Since the game is paused during `"levelup"` state, no further `addXp` calls happen until the player picks an upgrade and returns to `"running"`.

This means rapid multi-level-ups (e.g., huge XP gem) are handled one at a time across frames — the player gets one choice per level gained, which is the intended UX.

#### 3b. CombatScene orchestrator detects level-up and opens UI

In `CombatScene.update()`, after `collectXp`, check the return value and transition to the level-up state:

```js
// CombatScene.js — inside update(), after progressionSystem.collectXp()

const leveledUp = this.progressionSystem.checkLevelUp(this.run, this.app.store.meta);
if (leveledUp) {
  this.openLevelUp();
  return;
}
```

New method on CombatScene:

```js
openLevelUp() {
  this.run.state = "levelup";
  const choices = this.progressionSystem.randomUpgradeChoices(this.run);
  this.app.ui.openLevelUp(choices);
}
```

**Full revised `update()` flow:**

```js
update(dt) {
  if (this.run.state === "reward") {
    if (this.app.input.consumeAction("interact") || this.app.input.consumeAction("return")) {
      this.app.setScene("hub");
    }
    return;
  }

  if (this.run.state === "levelup") {
    if (this.app.input.consumeAction("uiLeft") || this.app.input.consumeAction("uiUp")) {
      this.app.ui.moveLevelSelection(-1);
    } else if (this.app.input.consumeAction("uiRight") || this.app.input.consumeAction("uiDown")) {
      this.app.ui.moveLevelSelection(1);
    } else if (this.app.input.consumeAction("uiConfirm") || this.app.input.consumeAction("interact")) {
      this.app.ui.confirmLevelSelection();
    }
    return;
  }

  if (this.app.input.consumeAction("pause")) {
    this.run.state = this.run.state === "paused" ? "running" : "paused";
    this.app.ui.setMessage(this.run.state === "paused" ? "paused" : null);
  }

  if (this.run.state !== "running") return;

  this.run.time += dt;
  this.run.shake = Math.max(0, this.run.shake - dt * CAMERA.shakeDecayRate.value);
  this.playerController.update(this.run, this.app.store.meta, this.app.input, dt);
  this.updateCamera();
  this.updateSpawns(dt);
  this.weaponSystem.update(this.run, this.app.store.meta, dt);
  this.weaponSystem.updateActors(this.run, dt);
  this.combatResolver.resolve(
    this.run, this.app.store.meta,
    (x, y, color, amount) => this.progressionSystem.burst(this.run, x, y, color, amount),
    (bullet, enemy) => this.weaponSystem.resolveBulletBounce(this.run, bullet, enemy)
  );
  if (this.run.player.health <= 0 && this.run.state === "running") {
    this.finishRun();
    return;
  }
  this.progressionSystem.collectXp(this.run, this.app.store.meta, dt);
  this.progressionSystem.prune(this.run, this.app.viewport);
  this.app.ui.setCombat(this.run);

  // Check for level-up AFTER collectXp and UI sync
  const leveledUp = this.progressionSystem.checkLevelUp(this.run, this.app.store.meta);
  if (leveledUp) {
    this.openLevelUp();
  }
}
```

#### 3c. Refactor: split `collectXp` and level-up check

To keep `collectXp` clean (it already handles gem attraction + collection), add a separate `checkLevelUp` method on `ProgressionSystem` that the orchestrator calls after collection:

```js
// ProgressionSystem.js

collectXp(run, meta, dt) {
  const player = run.player;
  for (const gem of run.xpGems) {
    // ...existing attraction and collection logic...
    // When gem is collected:
    if (distanceSquared(player, gem) <= collectRadius * collectRadius) {
      gem.collected = true;
      run.xp += gem.value * xpMultiplierFor(meta, run);
    }
  }
}

checkLevelUp(run) {
  if (run.xp >= run.xpToNext && run.state === "running") {
    run.xp -= run.xpToNext;
    run.level += 1;
    run.xpToNext = Math.floor(
      PROGRESSION.xpBase.value * run.level * PROGRESSION.xpLevelMultiplier.value
    );
    return true;
  }
  return false;
}
```

This is cleaner than having `collectXp` return a boolean (since it processes multiple gems per frame, the return value semantics would be muddy). The orchestrator simply calls `checkLevelUp` after all XP has been added.

**Why this works for multi-level-ups:** If the player has enough XP for 2+ level-ups, `checkLevelUp` returns `true` for the first one. The game pauses, player picks an upgrade, `chooseLevelUpgrade` runs, state goes back to `"running"`. On the next frame, `collectXp` doesn't add more XP (gems are already collected), but `checkLevelUp` is still called — it sees `run.xp >= run.xpToNext` again (from the leftover XP), returns `true`, and the process repeats. Each level-up gets its own choice screen.

#### 3d. Ensure `renderActiveUpgrades` is called after applying the upgrade

In `chooseLevelUpgrade` (CombatScene.js), the existing code already calls `this.app.ui.setCombat(this.run)` which calls `renderActiveUpgrades`. No change needed here — the active upgrades panel will automatically refresh when the player returns to running state.

#### 3e. UI click handler for level-up choices

The current `renderLevelChoices()` in `ui.js` already attaches click handlers that call `onLevelChoice`. And `CombatScene.enter()` already wires `this.app.ui.onLevelChoice = (choice) => this.chooseLevelUpgrade(choice)`. The existing `chooseLevelUpgrade` method correctly:
1. Applies the upgrade via `progressionSystem.chooseLevelUpgrade(run, meta, choice)`
2. Sets `run.state = "running"`
3. Closes the level-up UI
4. Syncs the combat HUD

**No changes needed to ui.js.** The click path works. The keyboard path works (the `"levelup"` state handler in `update()` processes `uiConfirm` which calls `confirmLevelSelection` which calls `onLevelChoice`). All that was missing was the trigger.

---

## Summary of All Changes

| File | Change | Reason |
|---|---|---|
| `styles.css` `.shop-panel` | Add `min-height: min(360px, calc(100vh - 64px))` | Panel never shrinks below usable size |
| `styles.css` `.level-panel` | Add `min-height: min(320px, calc(100vh - 64px))` | Same for level-up panel |
| `styles.css` `.shop-list, .level-options` | Add `padding: 4px 0; scrollbar-gutter: stable` | Breathing room + visible scrollbar |
| `styles.css` `.active-upgrades` | `width: 220px` -> `260px`; `overflow-y: auto` -> `overflow: hidden`; add `display: flex; flex-direction: column` | Wider panel, flex layout for inner scroll |
| `styles.css` `.upgrade-list` | Add `overflow-y: auto; flex: 1; min-height: 0; pointer-events: auto; padding-right: 4px; scrollbar-gutter: stable` | Scroll on inner container, pointer events enabled |
| `styles.css` `.upgrade-entry` | Add `line-height: 1.4; display: flex; flex-direction: column; gap: 2px`; padding `5px 8px` -> `6px 8px` | Two-line stacked layout, better spacing |
| `styles.css` `.upgrade-entry .upgrade-detail` | Add `line-height: 1.35; word-break: break-word` | Readable wrapped text |
| `src/scenes/combat/ProgressionSystem.js` | Remove `addXp` method; move XP addition into `collectXp`; add `checkLevelUp(run)` returning boolean | Separate XP collection from level-up detection |
| `src/scenes/combat/CombatScene.js` | Call `checkLevelUp()` after `collectXp()`; add `openLevelUp()` method that sets state + generates choices + opens UI | Wire the broken trigger for level-up flow |

---

## Wireframes

### Bug 1 Fix: Shop / Level-Up Panel (before vs after)

#### BEFORE (current — tiles compress on short viewport)

```
┌─────────────────────────────────────┐
│  Diamond Shop                       │  ← title
│  Purchased.                         │  ← message
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Max Health Lv 2    15 Diamonds  │ │  ← tile (compressed)
│ │ +40 -> +60 max health           │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Health Regen Lv 1  12 Diamonds  │ │  ← tile (compressed)
│ │ +0.25 -> +0.5 health/sec        │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │  ← tiles crammed,
│ │ Fire Rate Lv 0    10 Diamonds   │ │     minimal gap
│ │ +0% -> +8% fire rate            │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ XP Gain Lv 1       8 Diamonds   │ │  ← tile barely 70px
│ │ +10% -> +20% XP                 │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Pickup Range Lv 0  15 Diamonds  │ │  ▲ scrollbar area
│ │ +0 -> +18 pickup range          │ │  │ very short,
│ └─────────────────────────────────┘ │  │ tiles feel
│ ┌─────────────────────────────────┐ │  │ compressed
│ │ Damage Lv 2        8 Diamonds   │ │  │
│ │ +40% -> +60% damage             │ │  ▼
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Move Speed Lv 0   10 Diamonds   │ │  ← cut off, need scroll
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│           [ Close ]                 │
└─────────────────────────────────────┘
  ▲ panel at max-height (520px)
    but on short viewport the list
    area is tiny, tiles feel crushed
```

#### AFTER (fixed — consistent tile sizing, min scroll area)

```
┌─────────────────────────────────────┐
│  Diamond Shop                       │  ← title
│  Purchased.                         │  ← message
├─────────────────────────────────────┤
│  ╭─ scroll area (min 360px tall) ─╮ │
│ │ ┌───────────────────────────────┐ │ │
│ │ │ Max Health Lv 2   15 Diamonds │ │ │  ← tile: consistent
│ │ │ +40 -> +60 max health         │ │ │     70px min-height
│ │ └───────────────────────────────┘ │ │
│ │                                   │ │  ← 8px gap
│ │ ┌───────────────────────────────┐ │ │
│ │ │ Health Regen Lv 1  12 Diamonds│ │ │  ← consistent tile
│ │ │ +0.25 -> +0.5 health/sec      │ │ │
│ │ └───────────────────────────────┘ │ │
│ │                                   │ │
│ │ ┌───────────────────────────────┐ │ │
│ │ │ Fire Rate Lv 0   10 Diamonds  │ │ │
│ │ │ +0% -> +8% fire rate          │ │ │
│ │ └───────────────────────────────┘ │ │
│ │                                   │ │
│ │ ┌───────────────────────────────┐ │ │
│ │ │ XP Gain Lv 1      8 Diamonds  │ │ │
│ │ │ +10% -> +20% XP              │ │ │
│ │ └───────────────────────────────┘ │ │  ▲ scroll area
│ │           ·                       │ │  │ guaranteed
│ │           ·  (scroll continues)   │ │  │ minimum
│ │           ·                       │ │  ▼ height
│ ╰───────────────────────────────────╯ │
├─────────────────────────────────────┤
│           [ Close ]                 │
└─────────────────────────────────────┘
  ▲ panel min-height ensures
    scroll area never shrinks
    below usable size
```

### Bug 2 Fix: Acquired Upgrades Panel (before vs after)

#### BEFORE (current — no scroll, scrunched text in 220px)

```
 ┌───────────────────────┐
 │  UPGRADES             │  ← header (11px uppercase)
 │ ┌───────────────────┐ │
 │ │Max Health         │ │
 │ │Lv 2 · +40 max    │ │  ← text wraps after "max"
 │ │health             │ │     scrunched into 2nd line
 │ └───────────────────┘ │
 │ ┌───────────────────┐ │
 │ │Damage             │ │
 │ │Lv 1 + Common x2  │ │  ← rarity text wraps badly
 │ │+ Rare x1 =       │ │     at 220px width
 │ │+30% damage        │ │
 │ └───────────────────┘ │
 │ ┌───────────────────┐ │
 │ │Fire Rate          │ │
 │ │+8% fire rate      │ │
 │ └───────────────────┘ │
 │ ┌───────────────────┐ │
 │ │Multishot          │
 │ │+1 side projectiles│  ← entries cut off below,
 │ └───────────────────┘     NO SCROLL (pointer-events:
 │ ┌───────────────────┐     none blocks it)
 │ │Front Shot         │
 │ │+1 forward projec─ │  ← text even clips
 │ └───────────────────┘
 │ ... (hidden, no scroll)
 └───────────────────────┘
    220px wide, cannot scroll
```

#### AFTER (fixed — 260px, scrollable, stacked name/detail)

```
 ┌─────────────────────────────┐
 │  UPGRADES                   │  ← header
 │ ╭─ scroll area ───────────╮ │
 │ │ ┌─────────────────────┐ │ │
 │ │ │ Max Health          │ │ │  ← name: bold, own line
 │ │ │ Lv 2 · +40 max     │ │ │  ← detail: full width,
 │ │ │ health              │ │ │     word-break for long text
 │ │ └─────────────────────┘ │ │
 │ │                          │ │
 │ │ ┌─────────────────────┐ │ │
 │ │ │ Damage              │ │ │  ← name on its own line
 │ │ │ Lv 1 + Common x2 + │ │ │  ← detail uses full 260px,
 │ │ │ Rare x1 = +30%     │ │ │     wraps more gracefully
 │ │ │ damage              │ │ │
 │ │ └─────────────────────┘ │ │
 │ │                          │ │
 │ │ ┌─────────────────────┐ │ │
 │ │ │ Fire Rate           │ │ │
 │ │ │ +8% fire rate       │ │ │
 │ │ └─────────────────────┘ │ │
 │ │                          │ │
 │ │ ┌─────────────────────┐ │ │
 │ │ │ Multishot           │ │ │
 │ │ │ +1 side projectiles │ │ │
 │ │ └─────────────────────┘ │ │
 │ │                          │ │  ▲ scroll works!
 │ │ ┌─────────────────────┐ │ │  │ pointer-events: auto
 │ │ │ Front Shot          │ │ │  │ on inner list
 │ │ │ +1 forward          │ │ │  ▼
 │ │ │ projectiles         │ │ │
 │ │ └─────────────────────┘ │ │
 │ │           ·              │ │
 │ │           ·  (scrolls)   │ │
 │ │           ·              │ │
 │ ╰──────────────────────────╯ │
 └─────────────────────────────┘
    260px wide, scrollable inner,
    pointer-events: auto on list
```

### Bug 3 Fix: Level-Up Flow (before vs after)

#### BEFORE (current — broken, level-ups are silent)

```
  Game Loop (each frame):
  ┌──────────────────────────────────────────────┐
  │ 1. Process input                              │
  │ 2. Update player, enemies, weapons, resolver  │
  │ 3. collectXp() → addXp() → SILENT LEVEL-UP   │
  │    ┌────────────────────────────────────┐      │
  │    │ while (xp >= xpToNext) {           │      │
  │    │   xp -= xpToNext;                  │      │
  │    │   level++;   ← INVISIBLE TO PLAYER │      │
  │    │   xpToNext = ...;                  │      │
  │    │ }                                  │      │
  │    └────────────────────────────────────┘      │
  │ 4. prune, sync UI                             │
  └──────────────────────────────────────────────┘

  Result: Player sees "Level 5" in HUD but never
  got to pick any upgrades. All 5 level-ups were
  consumed silently in the while-loop.
```

#### AFTER (fixed — level-up pauses game, shows choices)

```
  Game Loop (frame where XP crosses threshold):
  ┌──────────────────────────────────────────────┐
  │ 1. Process input                              │
  │ 2. Update player, enemies, weapons, resolver  │
  │ 3. collectXp() → adds XP to run.xp           │
  │ 4. prune, sync UI                             │
  │ 5. checkLevelUp() → run.xp >= run.xpToNext?  │
  │    YES → openLevelUp()                        │
  │         ┌────────────────────────────┐        │
  │         │ run.state = "levelup"      │        │
  │         │ choices = randomChoices()  │        │
  │         │ UI.openLevelUp(choices)    │        │
  │         └────────────────────────────┘        │
  │    RETURN (skip further processing)           │
  └──────────────────────────────────────────────┘

  Next frames while level-up screen is open:
  ┌──────────────────────────────────────────────┐
  │ run.state === "levelup"                       │
  │ → only process UI navigation input            │
  │   (uiLeft/uiRight/uiConfirm)                  │
  │ → game is FROZEN (no enemies, no physics)     │
  │                                               │
  │  ╔═══════════════════════════════════════╗    │
  │  ║  Level Up                             ║    │
  │  ║  Choose a temporary boost             ║    │
  │  ║                                       ║    │
  │  ║  ┌─────────────────────────────────┐  ║    │
  │  ║  │ Damage           ◄ SELECTED ►   │  ║    │
  │  ║  │ Rare  +20% x 1.5               │  ║    │
  │  ║  └─────────────────────────────────┘  ║    │
  │  ║  ┌─────────────────────────────────┐  ║    │
  │  ║  │ Fire Rate                       │  ║    │
  │  ║  │ Common  +8% x 1.0              │  ║    │
  │  ║  └─────────────────────────────────┘  ║    │
  │  ║  ┌─────────────────────────────────┐  ║    │
  │  ║  │ Pickup Range                    │  ║    │
  │  ║  │ Uncommon  +18 x 1.2            │  ║    │
  │  ║  └─────────────────────────────────┘  ║    │
  │  ╚═══════════════════════════════════════╝    │
  │                                               │
  │  Player presses E/Enter/click → confirm       │
  └──────────────────────────────────────────────┘

  Frame after player confirms:
  ┌──────────────────────────────────────────────┐
  │ chooseLevelUpgrade(choice)                    │
  │   → applies upgrade to run.temporaryUpgrades  │
  │   → run.state = "running"                    │
  │   → UI.closeLevelUp()                        │
  │   → UI.setCombat(run) ← refreshes HUD +      │
  │                          acquired upgrades    │
  │                                               │
  │ If leftover XP >= xpToNext again:             │
  │   → checkLevelUp() returns true next frame    │
  │   → another level-up screen opens             │
  │   (one choice per level, as intended)          │
  └──────────────────────────────────────────────┘
```

---

## Implementation Order

1. **`src/scenes/combat/ProgressionSystem.js`** — Refactor `addXp` out of `collectXp`, add `checkLevelUp()`
2. **`src/scenes/combat/CombatScene.js`** — Add `openLevelUp()`, wire `checkLevelUp()` call after `collectXp()` in `update()`
3. **`styles.css`** — Apply all CSS changes (Fix 1 + Fix 2) in one pass

## Risk / Considerations

- **`pointer-events: auto` on `.upgrade-list`**: This makes the list area clickable/scrollable. The game canvas below will NOT receive events when the mouse is over the list. This is acceptable because:
  - The panel is on the right edge, not covering the main play area
  - The list is only visible during combat, and scrolling the upgrade list is a valid user intent
  - The outer `.active-upgrades` padding area (12px around the list) still has `pointer-events: none`, so the border/padding zone passes events through

- **Width increase 220px -> 260px**: On very narrow viewports (< 400px), the panel + left HUD could overlap. Consider adding a responsive rule:

```css
@media (max-width: 480px) {
  .active-upgrades {
    width: calc(100vw - 32px);
    right: 16px;
  }
}
```

- **Multi-level-up edge case**: If a player collects enough XP for 2+ levels at once, they get one choice screen per frame. This creates a brief "flash" of the UI between choices. An alternative would be to queue up level-ups and show them sequentially with a brief animation, but the per-frame approach is simpler and matches how other survivor-like games handle it (Vampire Survivors etc.).

- **`checkLevelUp` must be called after `collectXp` but before `setCombat`**: The HUD shows the current level, so we want the level incremented before the HUD sync. However, we also want the level-up UI to open after the HUD updates. The current ordering in the proposed `update()` method handles this: `collectXp` adds XP, `prune` runs, `setCombat` syncs HUD with the new level, then `checkLevelUp` detects the overflow and opens the UI. This means the HUD briefly shows the new level before the overlay appears — which is fine, it's the same frame.

- **No changes to `ui.js` or `input.js`**: The level-up UI code is already fully implemented. `openLevelUp()`, `closeLevelUp()`, `moveLevelSelection()`, `confirmLevelSelection()`, `renderLevelChoices()`, and the keyboard/click handlers all work correctly. The only missing piece was the trigger from the game loop.
