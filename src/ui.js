import { formatTime } from "./utils.js";
import { PERMANENT_UPGRADE_KEYS, UPGRADE_KEYS, UPGRADES, RARITIES, upgradeCost, isExtraShotUpgrade, extraShotLevelForRarity } from "./upgrades/index.js";

export class UI {
  constructor(store, audioManager) {
    this.store = store;
    this.audioManager = audioManager;
    this.healthEl = document.getElementById("health");
    this.scoreEl = document.getElementById("score");
    this.timeEl = document.getElementById("time");
    this.levelEl = document.getElementById("level");
    this.diamondsEl = document.getElementById("diamonds");
    this.areaEl = document.getElementById("area");
    this.promptEl = document.getElementById("prompt");
    this.messageEl = document.getElementById("message");
    this.messageTitleEl = document.getElementById("message-title");
    this.messageCopyEl = document.getElementById("message-copy");
    this.settingsEl = document.getElementById("settings");
    this.shakeToggle = document.getElementById("screen-shake");
    this.difficultyEl = document.getElementById("difficulty");
    this.volumeSlider = document.getElementById("music-volume");
    this.muteToggle = document.getElementById("music-mute");
    this.closeSettingsButton = document.getElementById("close-settings");
    this.shopEl = document.getElementById("shop");
    this.shopListEl = document.getElementById("shop-list");
    this.shopMessageEl = document.getElementById("shop-message");
    this.closeShopButton = document.getElementById("close-shop");
    this.levelUpEl = document.getElementById("level-up");
    this.levelOptionsEl = document.getElementById("level-options");
    this.activeUpgradesEl = document.getElementById("active-upgrades");
    this.upgradeListEl = document.getElementById("upgrade-list");
    this.onSettingsClose = null;
    this.onShopClose = null;
    this.onShopBuy = null;
    this.onLevelChoice = null;
    this.shopSelection = 0;
    this.levelSelection = 0;
    this.levelChoices = [];

    this.shakeToggle.addEventListener("change", () => {
      this.store.setSetting("screenShake", this.shakeToggle.checked);
    });

    this.volumeSlider.addEventListener("input", () => {
      const volume = parseFloat(this.volumeSlider.value);
      this.store.setSetting("musicVolume", volume);
      this.audioManager.setVolume(volume);
    });

    this.muteToggle.addEventListener("change", () => {
      this.store.setSetting("musicMuted", this.muteToggle.checked);
      this.audioManager.setMuted(this.muteToggle.checked);
    });

    this.closeSettingsButton.addEventListener("click", () => {
      this.closeSettings();
      if (this.onSettingsClose) this.onSettingsClose();
    });

    this.closeShopButton.addEventListener("click", () => {
      this.closeShop();
      if (this.onShopClose) this.onShopClose();
    });
  }

  syncMeta() {
    this.diamondsEl.textContent = this.store.meta.diamonds;
    this.shakeToggle.checked = this.store.meta.settings.screenShake;
    this.difficultyEl.textContent = this.store.meta.settings.difficulty;
    this.volumeSlider.value = this.store.meta.settings.musicVolume ?? 0.5;
    this.muteToggle.checked = this.store.meta.settings.musicMuted ?? false;
  }

  setHub() {
    this.areaEl.textContent = "Hub";
    this.healthEl.textContent = "--";
    this.scoreEl.textContent = "--";
    this.timeEl.textContent = "--";
    this.levelEl.textContent = "--";
    this.activeUpgradesEl.classList.add("hidden");
    this.syncMeta();
  }

  setCombat(run) {
    this.areaEl.textContent = "Level";
    this.healthEl.textContent = Math.max(0, Math.ceil(run.player.health));
    this.scoreEl.textContent = run.score;
    this.timeEl.textContent = formatTime(run.time);
    this.levelEl.textContent = `${run.level} (${Math.floor(run.xp)}/${run.xpToNext})`;
    this.activeUpgradesEl.classList.remove("hidden");
    this.renderActiveUpgrades(this.store.meta, run);
    this.syncMeta();
  }

  setPrompt(text) {
    this.promptEl.textContent = text || "";
    this.promptEl.classList.toggle("hidden", !text);
  }

  setMessage(kind, reward = 0) {
    if (!kind) {
      this.messageEl.classList.add("hidden");
      return;
    }

    this.messageEl.classList.remove("hidden");
    if (kind === "paused") {
      this.messageTitleEl.textContent = "Paused";
      this.messageCopyEl.textContent = "Press P to resume";
    } else if (kind === "reward") {
      this.messageTitleEl.textContent = "Run Complete";
      this.messageCopyEl.textContent = `Earned ${reward} Diamonds. Press E or R to return to hub.`;
    }
  }

  openSettings() {
    this.syncMeta();
    this.settingsEl.classList.remove("hidden");
  }

  closeSettings() {
    this.settingsEl.classList.add("hidden");
  }

  isSettingsOpen() {
    return !this.settingsEl.classList.contains("hidden");
  }

  openShop() {
    this.shopSelection = 0;
    this.shopMessageEl.textContent = "";
    this.renderShop();
    this.shopEl.classList.remove("hidden");
  }

  closeShop() {
    this.shopEl.classList.add("hidden");
  }

  isShopOpen() {
    return !this.shopEl.classList.contains("hidden");
  }

  moveShopSelection(direction) {
    this.shopSelection = (this.shopSelection + direction + PERMANENT_UPGRADE_KEYS.length) % PERMANENT_UPGRADE_KEYS.length;
    this.renderShop();
    this.scrollShopSelectionIntoView();
  }

  confirmShopSelection() {
    const key = PERMANENT_UPGRADE_KEYS[this.shopSelection];
    if (this.onShopBuy) this.onShopBuy(key);
  }

  setShopMessage(text) {
    this.shopMessageEl.textContent = text;
  }

  renderShop() {
    this.syncMeta();
    this.shopListEl.innerHTML = "";

    PERMANENT_UPGRADE_KEYS.forEach((key, index) => {
      const upgrade = UPGRADES[key];
      const level = this.store.meta.upgrades[key] || 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `shop-item${index === this.shopSelection ? " selected" : ""}`;
      button.innerHTML = `
        <div>
          <h3>${upgrade.label} Lv ${level}</h3>
          <p>${upgrade.describe(level)} -> ${upgrade.describe(level + 1)}</p>
        </div>
        <span class="shop-cost">${upgradeCost(key, level)} Diamonds</span>
      `;
      button.addEventListener("click", () => {
        this.shopSelection = index;
        this.renderShop();
        if (this.onShopBuy) this.onShopBuy(key);
      });
      this.shopListEl.appendChild(button);
    });
  }

  openLevelUp(choices) {
    this.levelChoices = choices;
    this.levelSelection = 0;
    this.renderLevelChoices();
    this.levelUpEl.classList.remove("hidden");
  }

  closeLevelUp() {
    this.levelUpEl.classList.add("hidden");
  }

  isLevelUpOpen() {
    return !this.levelUpEl.classList.contains("hidden");
  }

  moveLevelSelection(direction) {
    this.levelSelection = (this.levelSelection + direction + this.levelChoices.length) % this.levelChoices.length;
    this.renderLevelChoices();
    this.scrollLevelSelectionIntoView();
  }

  confirmLevelSelection() {
    const choice = this.levelChoices[this.levelSelection];
    if (choice && this.onLevelChoice) this.onLevelChoice(choice);
  }

  renderLevelChoices() {
    this.levelOptionsEl.innerHTML = "";
    this.levelChoices.forEach((choice, index) => {
      const upgrade = UPGRADES[choice.key];
      const rarity = choice.rarity;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `level-option${index === this.levelSelection ? " selected" : ""}`;
      button.style.setProperty("--rarity-color", rarity.color);
      const multiplierDisplay = isExtraShotUpgrade(choice.key) ? extraShotLevelForRarity(rarity.key) : rarity.multiplier;
      button.innerHTML = `
        <div>
          <h3>${upgrade.label}</h3>
          <p><span class="rarity-label">${rarity.label}</span> ${upgrade.unit} x ${multiplierDisplay}</p>
        </div>
      `;
      button.addEventListener("click", () => {
        this.levelSelection = index;
        if (this.onLevelChoice) this.onLevelChoice(choice);
      });
      this.levelOptionsEl.appendChild(button);
    });
  }

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
        const rarityKey = run.extraShotRarities?.[key] || "common";
        const rarity = RARITIES[rarityKey];
        entry.style.borderColor = rarity.color + "44";
        entry.innerHTML = `<span class="upgrade-name" style="color:${rarity.color}">${upgrade.label}</span><span class="upgrade-detail">${rarity.label} · ${upgrade.describe(tempLevel)}</span>`;
      } else if (upgrade.permanent && tempLevel === 0) {
        entry.innerHTML = `<span class="upgrade-name">${upgrade.label}</span><span class="upgrade-detail">Lv ${permLevel} · ${upgrade.describe(permLevel)}</span>`;
      } else {
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
        entry.innerHTML = `<span class="upgrade-name">${upgrade.label}</span><span class="upgrade-detail">${permPart}${detail}</span>`;
      }

      this.upgradeListEl.appendChild(entry);
    }
  }

  scrollShopSelectionIntoView() {
    const selected = this.shopListEl.querySelector(".shop-item.selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  scrollLevelSelectionIntoView() {
    const selected = this.levelOptionsEl.querySelector(".level-option.selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }
}
