# Music System Implementation Plan

## Objective
Implement a continuous background music system for the Neon Auto-Shooter game that:
- Plays all music tracks in **random order** from `res/aduio/music/`
- Is **immune to scene changes** (hub <-> combat transitions do not interrupt playback)
- Includes a **working volume slider** in the settings menu
- Follows **clean code** and **DRY (Don't Repeat Yourself)** principles

---

## Architecture Overview

The core principle is **separation of concerns** and **single responsibility**.
The `AudioManager` is a standalone, globally-scoped service. It owns the playlist, the `Audio` element, and the playback state. It does not care which scene is active, only that music should keep playing.

**Key Design Decisions:**
- **`src/audio.js`** (The Engine): A self-contained module with a single exported `AudioManager` class. It will manage the playlist, including the random shuffle logic.
- **Scene Agnostic**: The `AudioManager` is instantiated once in `App` and is never closed or recreated. Scene changes simply don't interfere with it.
- **Settings-Driven**: The `AudioManager` subscribes to the `Store` so that when the user changes the volume in the settings panel, the change is reflected immediately in the audio.

---

## File 1: `src/audio.js` (New File)

**Description:**
Creates the `AudioManager` class. This class is responsible for all in-game audio playback. It ensures that a randomized, continuous playlist is always playing.

**Code:**
```javascript
/**
 * @file src/audio.js
 * @description Manages all game audio, ensuring a continuous, shuffled background music playlist.
 */

const MUSIC_TRACKS = [
  "res/aduio/music/Neon Byte Raid.mp3",
  "res/aduio/music/Pixel Drift Loop.mp3",
  "res/aduio/music/Pixel Rain Relay.mp3",
];

/**
 * @class AudioManager
 * @description Handles background music playback, playlist shuffling, and volume control.
 */
export class AudioManager {
  /**
   * @param {Store} store - The application's Store instance to read/save audio settings.
   */
  constructor(store) {
    this.store = store;

    // Core audio element
    this.audio = new Audio();
    this.audio.loop = false; // We handle looping across the playlist manually

    // Playlist state
    this.tracks = [...MUSIC_TRACKS];
    this.shuffle();
    this.currentTrackIndex = -1;

    // Bind track completion to play the next track
    this.audio.addEventListener("ended", () => this.playNextTrack());

    // Initial setup based on persisted settings
    this.syncFromStore();

    // Start the first track
    this.playNextTrack();
  }

  /**
   * @description Syncs the volume and muted state from the Store instance.
   */
  syncFromStore() {
    const settings = this.store.meta.settings;
    this.setVolume(settings.musicVolume ?? 0.5);
    this.setMuted(settings.musicMuted ?? false);
  }

  /**
   * @description Shuffles the internal track list using the Fisher-Yates algorithm.
   */
  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  /**
   * @description Advances to the next track in the shuffled list and plays it.
   */
  playNextTrack() {
    this.currentTrackIndex++;

    // If we've reached the end, reshuffle and wrap around
    if (this.currentTrackIndex >= this.tracks.length) {
      this.shuffle();
      this.currentTrackIndex = 0;
    }

    const track = this.tracks[this.currentTrackIndex];
    this.audio.src = track;
    this.audio.play().catch((error) => {
      console.warn("Audio playback failed (likely due to user interaction policy):", error);
    });
  }

  /**
   * @param {number} value - A value between 0.0 and 1.0.
   */
  setVolume(value) {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  /**
   * @param {boolean} value - True to mute, false to unmute.
   */
  setMuted(value) {
    this.audio.muted = value;
  }

  /**
   * @description Cleans up the audio manager (useful if the game module is ever reloaded/hot-swapped).
   */
  destroy() {
    this.audio.pause();
    this.audio.src = "";
    // Remove the event listener to prevent memory leaks
    this.audio.removeEventListener("ended", this.playNextTrack);
  }
}
```

---

## File 2: `src/app.js` (Edit)

**Description:**
Integrates `AudioManager` into the main `App` class. It creates a single, persistent instance that survives scene transitions.

**Changes:**
Insert `import { AudioManager } from "./audio.js";` and initialize it in the constructor.

**Code:**
```javascript
import { Input } from "./input.js";
import { Store } from "./store.js";
import { UI } from "./ui.js";
import { AudioManager } from "./audio.js"; // NEW
import { HubScene } from "./scenes/hubScene.js";
import { CombatScene } from "./scenes/combatScene.js";

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.viewport = { width: 0, height: 0, dpr: 1 };
    this.input = new Input();
    this.store = new Store();
    this.ui = new UI(this.store);

    // NEW: Initialize the AudioManager. It will begin playing immediately.
    this.audioManager = new AudioManager(this.store);

    this.scenes = {
      hub: new HubScene(this),
      combat: new CombatScene(this)
    };
    this.scene = null;
    this.lastFrame = performance.now();

    window.addEventListener("resize", () => {
      this.resize();
      if (this.scene?.resize) this.scene.resize();
    });
  }

  start() {
    this.resize();
    this.setScene("hub");
    requestAnimationFrame((now) => this.frame(now));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.viewport = { width, height, dpr };
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setScene(name) {
    this.scene = this.scenes[name];
    this.scene.enter();
    this.lastFrame = performance.now();
  }

  frame(now) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.033);
    this.lastFrame = now;
    this.input.updateGamepads();
    this.scene.update(dt);
    this.scene.render(this.ctx);
    this.input.endFrame();
    requestAnimationFrame((next) => this.frame(next));
  }
}
```

---

## File 3: `src/store.js` (Edit)

**Description:**
Adds `musicVolume` and `musicMuted` keys to the default settings metadata. This allows user audio preferences to be persisted in `localStorage` just like `screenShake` and `difficulty`.

**Changes:**
Add two new default properties to the `defaultMeta` object.

**Code:**
```javascript
import { PERMANENT_UPGRADE_KEYS, makeUpgradeLevels, upgradeCost } from "./upgrades.js";

const STORAGE_KEY = "neonAutoShooter.meta.v1";

const defaultMeta = {
  diamonds: 0,
  upgrades: makeUpgradeLevels(0, PERMANENT_UPGRADE_KEYS),
  settings: {
    screenShake: true,
    difficulty: "Normal",
    musicVolume: 0.5, // NEW: Default volume at 50%
    musicMuted: false, // NEW: Default unmuted
  }
};

// ... rest of the file remains identical ...
```

---

## File 4: `src/ui.js` (Edit)

**Description:**
Adds DOM hooks for the new volume controls, event listeners to handle user interaction, and syncs the UI state when the settings menu is opened.

**Changes:**
1. Store references to the new `music-volume` input and `music-mute` checkbox.
2. In `syncMeta()`, update the values of these new controls.
3. In the constructor, add event listeners to update the `store` and `audioManager` on change.

**Code:**
```javascript
import { formatTime } from "./utils.js";
import { PERMANENT_UPGRADE_KEYS, UPGRADES, upgradeCost } from "./upgrades.js";

export class UI {
  constructor(store, audioManager) { // MODIFIED: Accept audioManager
    this.store = store;
    this.audioManager = audioManager; // NEW: Store reference to audio manager

    // ... existing DOM references ...
    this.settingsEl = document.getElementById("settings");
    this.shakeToggle = document.getElementById("screen-shake");
    this.difficultyEl = document.getElementById("difficulty");

    // NEW: DOM references for audio controls
    this.volumeSlider = document.getElementById("music-volume");
    this.muteToggle = document.getElementById("music-mute");

    this.closeSettingsButton = document.getElementById("close-settings");
    // ... rest of existing references ...

    this.shakeToggle.addEventListener("change", () => {
      this.store.setSetting("screenShake", this.shakeToggle.checked);
    });

    // NEW: Event listener for volume slider
    this.volumeSlider.addEventListener("input", () => {
      const volume = parseFloat(this.volumeSlider.value);
      this.store.setSetting("musicVolume", volume);
      this.audioManager.setVolume(volume);
    });

    // NEW: Event listener for mute toggle
    this.muteToggle.addEventListener("change", () => {
      this.store.setSetting("musicMuted", this.muteToggle.checked);
      this.audioManager.setMuted(this.muteToggle.checked);
    });

    this.closeSettingsButton.addEventListener("click", () => {
      this.closeSettings();
      if (this.onSettingsClose) this.onSettingsClose();
    });

    // ... rest of existing code ...
  }

  syncMeta() {
    this.diamondsEl.textContent = this.store.meta.diamonds;
    this.shakeToggle.checked = this.store.meta.settings.screenShake;
    this.difficultyEl.textContent = this.store.meta.settings.difficulty;

    // NEW: Sync audio controls with persisted settings
    this.volumeSlider.value = this.store.meta.settings.musicVolume ?? 0.5;
    this.muteToggle.checked = this.store.meta.settings.musicMuted ?? false;
  }

  // ... rest of the file remains identical ...
}
```

---

## File 5: `src/main.js` (Edit)

**Description:**
Ensures that global user interaction is captured once, which satisfies the browser's autoplay policy and allows the music to begin seamlessly.

**Changes:**
None required for the core logic, as `AudioManager` is initiated inside `App`. However, if browser autoplay policies are strictly enforced, we might consider adding a single global click listener to bootstrap the audio context. For this plan, we will assume the current flow is sufficient, as the music starts immediately when `App` is constructed.

**Code:**
*(No changes needed in this initial plan, but it is the entry point if permissions need to be triggered.)*

---

## File 6: `index.html` (Edit)

**Description:**
Adds the interactive HTML elements for the volume slider and the mute checkbox inside the existing `#settings` panel.

**Changes:**
Insert two new `.setting-row` elements after the existing `Screen shake` row.

**Code:**
```html
    <div id="settings" class="settings hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="settings-panel">
        <h2 id="settings-title">Settings</h2>
        <label class="setting-row">
          <span>Screen shake</span>
          <input id="screen-shake" type="checkbox" checked>
        </label>
        <label class="setting-row">
          <span>Music Volume</span>
          <input id="music-volume" type="range" min="0" max="1" step="0.05" value="0.5">
        </label>
        <label class="setting-row">
          <span>Mute Music</span>
          <input id="music-mute" type="checkbox">
        </label>
        <div class="setting-row">
          <span>Difficulty</span>
          <strong id="difficulty">Normal</strong>
        </div>
        <button id="close-settings" type="button">Close</button>
      </div>
    </div>
```

---

## File 7: `styles.css` (Edit)

**Description:**
Provides styling for the new range input and checkbox to match the existing neon aesthetic.

**Changes:**
Add CSS rules to ensure the new range slider and mute checkbox are visually consistent with the current UI.

**Code:**
```css
/* Add inside the existing CSS file */

#music-volume {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 6px;
  background: rgba(0, 224, 255, 0.2);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

#music-volume::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #00e0ff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0, 224, 255, 0.6);
}

#music-volume::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #00e0ff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0, 224, 255, 0.6);
}

#music-mute {
  /* The default checkbox styles in the existing file are already sufficient,
     but we can explicitly ensure the accent color is consistent */
  accent-color: #00e0ff;
}
```

---

## Summary of Changes

| File | Action | Key Changes |
| :--- | :--- | :--- |
| `src/audio.js` | Create | `AudioManager` class, playlist shuffling, volume control, continuous playback. |
| `src/app.js` | Edit | Instantiate `AudioManager` in `App` constructor. |
| `src/store.js` | Edit | Add `musicVolume` and `musicMuted` to default settings. |
| `src/ui.js` | Edit | Wire up `music-volume` slider and `music-mute` checkbox to `store` and `audioManager`. |
| `index.html` | Edit | Add volume and mute controls to the `#settings` panel. |
| `styles.css` | Edit | Style the new range input and checkbox to match the neon theme. |
| `src/main.js` | No Change | Remains as the entry point; `App` handles the rest. |

---

## DRY & Clean Code Principles Applied

1.  **Single Source of Truth:** The list of available music tracks is defined only once in `src/audio.js`. The `AudioManager` is the sole owner of the playlist logic.
2.  **Separation of Concerns:** The `AudioManager` handles all audio playback logic. `UI` only handles user input and visual feedback. `Store` only handles data persistence. `App` only manages high-level application state.
3.  **No Code Duplication:** The assignment `this.audioManager = new AudioManager(this.store)` in `src/app.js` is the only place the audio system is instantiated. All other files reference this single instance.
4.  **Impervious to Scenes:** Because the `AudioManager` is created in the `App` and never recreated or closed during `setScene()`, music playback is completely isolated from Hub/Combat transitions.
5.  **DRY Settings:** The volume/mute state is read from and written to the `Store` in exactly one place (inside the `UI` event listeners), ensuring the UI, the audio engine, and the persistent storage are always in sync.
