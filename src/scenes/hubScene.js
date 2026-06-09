import { clamp, distanceSquared } from "../utils.js";
import { clear, drawGlowCircle, drawGrid, drawLabel, drawNeonRect } from "../renderer.js";

const ROOM = {
  width: 760,
  height: 460
};

const INTERACT_DISTANCE = 74;

export class HubScene {
  constructor(app) {
    this.app = app;
    this.player = {
      x: 0,
      y: 0,
      radius: 15,
      speed: 250
    };
    this.time = 0;
    this.stations = [];
  }

  enter() {
    this.layoutRoom();
    this.player.x = this.room.x + this.room.width / 2;
    this.player.y = this.room.y + this.room.height / 2 + 80;
    this.app.ui.setHub();
    this.app.ui.setMessage(null);
    this.app.ui.closeSettings();
    this.app.ui.closeShop();
    this.app.ui.onSettingsClose = () => {
      this.app.ui.setHub();
    };
    this.app.ui.onShopClose = () => {
      this.app.ui.setHub();
    };
    this.app.ui.onShopBuy = (key) => {
      if (this.app.store.purchaseUpgrade(key)) {
        this.app.ui.setShopMessage("Purchased.");
      } else {
        this.app.ui.setShopMessage("Not enough Diamonds.");
      }
      this.app.ui.renderShop();
      this.app.ui.syncMeta();
    };
  }

  resize() {
    const previousCenter = {
      x: this.player.x - this.room.x,
      y: this.player.y - this.room.y
    };
    this.layoutRoom();
    this.player.x = clamp(this.room.x + previousCenter.x, this.room.x + 28, this.room.x + this.room.width - 28);
    this.player.y = clamp(this.room.y + previousCenter.y, this.room.y + 28, this.room.y + this.room.height - 28);
  }

  layoutRoom() {
    const { width, height } = this.app.viewport;
    this.room = {
      x: Math.max(24, width / 2 - ROOM.width / 2),
      y: Math.max(86, height / 2 - ROOM.height / 2),
      width: Math.min(ROOM.width, width - 48),
      height: Math.min(ROOM.height, height - 120)
    };
    this.configureStations();
  }

  configureStations() {
    this.stations = [
      {
        id: "start",
        label: "Start Level",
        prompt: "Press E / A to start level",
        x: this.room.x + this.room.width * 0.28,
        y: this.room.y + 116,
        color: "#00e0ff"
      },
      {
        id: "settings",
        label: "Settings",
        prompt: "Press E / A for settings",
        x: this.room.x + this.room.width * 0.5,
        y: this.room.y + 116,
        color: "#ffe15c"
      },
      {
        id: "shop",
        label: "Shop",
        prompt: "Press E / A for shop",
        x: this.room.x + this.room.width * 0.72,
        y: this.room.y + 116,
        color: "#52ff94"
      }
    ];
  }

  update(dt) {
    this.time += dt;

    if (this.app.ui.isSettingsOpen()) {
      if (this.app.input.consumeAction("back") || this.app.input.consumeAction("interact")) {
        this.app.ui.closeSettings();
      }
      this.app.ui.setPrompt("");
      this.app.ui.setHub();
      return;
    }

    if (this.app.ui.isShopOpen()) {
      if (this.app.input.consumeAction("back")) {
        this.app.ui.closeShop();
      } else if (this.app.input.consumeAction("uiUp") || this.app.input.consumeAction("uiLeft")) {
        this.app.ui.moveShopSelection(-1);
      } else if (this.app.input.consumeAction("uiDown") || this.app.input.consumeAction("uiRight")) {
        this.app.ui.moveShopSelection(1);
      } else if (this.app.input.consumeAction("uiConfirm") || this.app.input.consumeAction("interact")) {
        this.app.ui.confirmShopSelection();
      }
      this.app.ui.setPrompt("");
      this.app.ui.setHub();
      return;
    }

    const movement = this.app.input.movementVector();
    this.player.x = clamp(this.player.x + movement.x * this.player.speed * dt, this.room.x + 28, this.room.x + this.room.width - 28);
    this.player.y = clamp(this.player.y + movement.y * this.player.speed * dt, this.room.y + 28, this.room.y + this.room.height - 28);

    const station = this.nearestStation();
    this.app.ui.setPrompt(station ? station.prompt : "");

    if (station && this.app.input.consumeAction("interact")) {
      if (station.id === "start") {
        this.app.setScene("combat");
      } else if (station.id === "settings") {
        this.app.ui.openSettings();
      } else {
        this.app.ui.openShop();
      }
    }

    this.app.ui.setHub();
  }

  nearestStation() {
    return this.stations.find((station) => distanceSquared(this.player, station) <= INTERACT_DISTANCE * INTERACT_DISTANCE);
  }

  render(ctx) {
    const { width, height } = this.app.viewport;
    clear(ctx, width, height);
    drawGrid(ctx, width, height, this.time, 0.14);

    drawNeonRect(ctx, this.room.x, this.room.y, this.room.width, this.room.height, "#1a8ea3", "rgba(5, 8, 20, 0.7)");
    drawLabel(ctx, "DIAMOND HUB", this.room.x + this.room.width / 2, this.room.y + 34, "#f6fbff", 17);

    for (const station of this.stations) {
      const active = distanceSquared(this.player, station) <= INTERACT_DISTANCE * INTERACT_DISTANCE;
      drawGlowCircle(ctx, station.x, station.y, active ? 28 : 24, "rgba(10, 8, 24, 0.9)", station.color, active ? 4 : 2);
      drawLabel(ctx, station.label, station.x, station.y + 52, station.color, 13);
    }

    drawGlowCircle(ctx, this.player.x, this.player.y, this.player.radius, "#071d2a", "#00e0ff", 3);
  }
}
