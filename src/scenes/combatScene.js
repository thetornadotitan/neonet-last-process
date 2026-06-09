import {
  UPGRADE_KEYS,
  damageFor,
  damageScale,
  enemyHealthScale,
  enemySpeedScale,
  makeUpgradeLevels,
  maxHealthFor,
  moveSpeedFor,
  pickupRangeFor,
  regenFor,
  rollRarity,
  shotCooldownFor,
  spawnDelayFor,
  wholeUpgradeLevel,
  xpMultiplierFor,
  isExtraShotUpgrade,
  filterUpgradeChoices
} from "../upgrades.js";
import { clamp, distanceSquared, normalize, TWO_PI } from "../utils.js";
import { clear, drawGlowCircle, particleAlpha } from "../renderer.js";

export class CombatScene {
  constructor(app) {
    this.app = app;
    this.run = null;
  }

  enter() {
    const temporaryUpgrades = makeUpgradeLevels();
    const runShell = { temporaryUpgrades };
    const maxHealth = maxHealthFor(this.app.store.meta, runShell);

    this.run = {
      state: "running",
      time: 0,
      score: 0,
      spawnTimer: 0,
      shotTimer: 0,
      nextEnemyId: 1,
      shake: 0,
      reward: 0,
      level: 1,
      xp: 0,
      xpToNext: 20,
      temporaryUpgrades,
      levelChoices: [],
      selectedExtraShots: new Set(),
      extraShotRarities: {},
      rarityCounts: {},
      camera: { x: 0, y: 0 },
      player: {
        x: 0,
        y: 0,
        radius: 15,
        speed: 260,
        health: maxHealth,
        maxHealth,
        invulnerable: 0
      },
      enemies: [],
      bullets: [],
      particles: [],
      xpGems: []
    };

    this.app.ui.onLevelChoice = (choice) => this.chooseLevelUpgrade(choice);
    this.app.ui.closeLevelUp();
    this.app.ui.setMessage(null);
    this.app.ui.setPrompt("");
    this.app.ui.setCombat(this.run);
  }

  resize() {
    this.updateCamera();
  }

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
    this.run.shake = Math.max(0, this.run.shake - dt * 22);
    this.updatePlayer(dt);
    this.updateCamera();
    this.updateSpawns(dt);
    this.updateWeapon(dt);
    this.updateActors(dt);
    this.resolveCombat();
    this.collectXp(dt);
    this.prune();
    this.app.ui.setCombat(this.run);
  }

  updatePlayer(dt) {
    const player = this.run.player;
    player.maxHealth = maxHealthFor(this.app.store.meta, this.run);
    player.speed = moveSpeedFor(this.app.store.meta, this.run);
    player.health = Math.min(player.maxHealth, player.health + regenFor(this.app.store.meta, this.run) * dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    const movement = this.app.input.movementVector();
    player.x += movement.x * player.speed * dt;
    player.y += movement.y * player.speed * dt;
  }

  updateCamera() {
    if (!this.run) return;
    this.run.camera.x = this.run.player.x - this.app.viewport.width / 2;
    this.run.camera.y = this.run.player.y - this.app.viewport.height / 2;
  }

  updateSpawns(dt) {
    const spawnDelay = spawnDelayFor(this.run.time);
    this.run.spawnTimer -= dt;
    while (this.run.spawnTimer <= 0) {
      this.spawnEnemy();
      this.run.spawnTimer += spawnDelay;
    }
  }

  spawnEnemy() {
    const { width, height } = this.app.viewport;
    const camera = this.run.camera;
    const edge = Math.floor(Math.random() * 4);
    const buffer = 90;
    let x = 0;
    let y = 0;

    if (edge === 0) {
      x = camera.x + Math.random() * width;
      y = camera.y - buffer;
    } else if (edge === 1) {
      x = camera.x + width + buffer;
      y = camera.y + Math.random() * height;
    } else if (edge === 2) {
      x = camera.x + Math.random() * width;
      y = camera.y + height + buffer;
    } else {
      x = camera.x - buffer;
      y = camera.y + Math.random() * height;
    }

    const fast = Math.random() < clamp(this.run.time / 95, 0.08, 0.36);
    const healthScale = enemyHealthScale(this.run.time);
    const speedScale = enemySpeedScale(this.run.time);
    this.run.enemies.push({
      id: this.run.nextEnemyId,
      x,
      y,
      radius: fast ? 10 : 16,
      speed: (fast ? 175 : 105) * speedScale,
      health: (fast ? 1 : 2) * healthScale,
      value: fast ? 15 : 25,
      xp: fast ? 5 : 8,
      color: fast ? "#ffe15c" : "#ff2e9a"
    });
    this.run.nextEnemyId += 1;
  }

  updateWeapon(dt) {
    this.run.shotTimer -= dt;
    if (this.run.shotTimer > 0) return;

    let nearest = null;
    let nearestDistance = Infinity;
    const range = 620;

    for (const enemy of this.run.enemies) {
      const dist = distanceSquared(this.run.player, enemy);
      if (dist < nearestDistance && dist <= range * range) {
        nearest = enemy;
        nearestDistance = dist;
      }
    }

    if (nearest) {
      const aim = normalize(nearest.x - this.run.player.x, nearest.y - this.run.player.y);
      this.firePattern(aim);
    }

    this.run.shotTimer = shotCooldownFor(this.app.store.meta, this.run);
  }

  firePattern(aim) {
    const meta = this.app.store.meta;
    const front = wholeUpgradeLevel(meta, this.run, "frontShot");
    const multishot = wholeUpgradeLevel(meta, this.run, "multishot");
    const diagonal = wholeUpgradeLevel(meta, this.run, "diagonalShot");
    const reverse = wholeUpgradeLevel(meta, this.run, "reverseShot");

    this.spawnBullet(aim);

    for (let i = 0; i < front; i += 1) {
      this.spawnBullet(aim, 0, (i + 1) * 9);
    }

    for (let i = 0; i < multishot; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const step = Math.floor(i / 2) + 1;
      this.spawnBullet(this.rotateVector(aim, side * (0.18 + step * 0.06)));
    }

    for (let i = 0; i < diagonal; i += 1) {
      const spread = Math.PI / 4 + i * 0.08;
      this.spawnBullet(this.rotateVector(aim, -spread));
      this.spawnBullet(this.rotateVector(aim, spread));
    }

    for (let i = 0; i < reverse; i += 1) {
      this.spawnBullet({ x: -aim.x, y: -aim.y }, 0, i * 8);
    }
  }

  spawnBullet(direction, angleOffset = 0, sideOffset = 0) {
    const aim = angleOffset === 0 ? direction : this.rotateVector(direction, angleOffset);
    const perpendicular = { x: -aim.y, y: aim.x };
    const homing = wholeUpgradeLevel(this.app.store.meta, this.run, "homing");
    
    this.run.bullets.push({
      x: this.run.player.x + aim.x * 22 + perpendicular.x * sideOffset,
      y: this.run.player.y + aim.y * 22 + perpendicular.y * sideOffset,
      vx: aim.x * 570,
      vy: aim.y * 570,
      radius: 5,
      damage: damageFor(this.app.store.meta, this.run) * damageScale(this.run.time),
      bouncesLeft: wholeUpgradeLevel(this.app.store.meta, this.run, "projectileBounce"),
      hitEnemyIds: new Set(),
      maxLife: 4,
      age: 0,
      homingStrength: homing > 0 ? homing * 0.8 : 0,
      homingRange: 500,
      targetEnemyId: null
    });
  }

  rotateVector(vector, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos
    };
  }

  updateActors(dt) {
    for (const bullet of this.run.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.age += dt;

      if (bullet.homingStrength > 0) {
        this.updateHoming(bullet, dt);
      }
    }

    for (const enemy of this.run.enemies) {
      const direction = normalize(this.run.player.x - enemy.x, this.run.player.y - enemy.y);
      enemy.x += direction.x * enemy.speed * dt;
      enemy.y += direction.y * enemy.speed * dt;
    }

    for (const particle of this.run.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - 3.2 * dt;
      particle.vy *= 1 - 3.2 * dt;
      particle.life -= dt;
    }
  }

  updateHoming(bullet, dt) {
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
      const turnRate = bullet.homingStrength * 4 * dt;
      let angle = Math.atan2(desired.y, desired.x) - Math.atan2(current.y, current.x);
      while (angle > Math.PI) angle -= TWO_PI;
      while (angle < -Math.PI) angle += TWO_PI;
      const clampedAngle = clamp(angle, -turnRate, turnRate);
      const newAngle = Math.atan2(current.y, current.x) + clampedAngle;
      const speed = Math.hypot(bullet.vx, bullet.vy);
      bullet.vx = Math.cos(newAngle) * speed;
      bullet.vy = Math.sin(newAngle) * speed;
    }
  }

  findNearestEnemy(x, y, range) {
    let nearest = null;
    let nearestDistance = Infinity;
    const rangeSq = range * range;

    for (const enemy of this.run.enemies) {
      if (enemy.health <= 0) continue;
      const dist = distanceSquared({ x, y }, enemy);
      if (dist < nearestDistance && dist <= rangeSq) {
        nearest = enemy;
        nearestDistance = dist;
      }
    }

    return nearest;
  }

  resolveCombat() {
    const player = this.run.player;

    for (const bullet of this.run.bullets) {
      for (const enemy of this.run.enemies) {
        if (enemy.health <= 0) continue;
        if (bullet.hitEnemyIds.has(enemy.id)) continue;
        const radius = bullet.radius + enemy.radius;
        if (distanceSquared(bullet, enemy) <= radius * radius) {
          bullet.hitEnemyIds.add(enemy.id);
          enemy.health -= bullet.damage;
          this.burst(bullet.x, bullet.y, enemy.color, 5);

          if (enemy.health <= 0) {
            this.run.score += enemy.value;
            this.dropXp(enemy);
            this.burst(enemy.x, enemy.y, enemy.color, 16);
          }
          this.resolveBulletBounce(bullet, enemy);
          break;
        }
      }
    }

    for (const enemy of this.run.enemies) {
      const radius = player.radius + enemy.radius;
      if (distanceSquared(player, enemy) <= radius * radius && player.invulnerable <= 0) {
        player.health -= 18;
        player.invulnerable = 0.45;
        if (this.app.store.meta.settings.screenShake) this.run.shake = 8;
        this.burst(player.x, player.y, "#00e0ff", 18);

        if (player.health <= 0) {
          player.health = 0;
          this.finishRun();
        }
      }
    }
  }

  resolveBulletBounce(bullet, hitEnemy) {
    if (bullet.bouncesLeft <= 0) {
      bullet.expired = true;
      return;
    }

    const nextEnemy = this.nearestBounceTarget(bullet, hitEnemy);
    if (!nextEnemy) {
      bullet.expired = true;
      return;
    }

    const direction = normalize(nextEnemy.x - bullet.x, nextEnemy.y - bullet.y);
    bullet.vx = direction.x * 570;
    bullet.vy = direction.y * 570;
    bullet.bouncesLeft -= 1;
    bullet.age = 0;
  }

  nearestBounceTarget(bullet, hitEnemy) {
    let nearest = null;
    let nearestDistance = Infinity;
    const range = 420;

    for (const enemy of this.run.enemies) {
      if (enemy.health <= 0 || enemy.id === hitEnemy.id || bullet.hitEnemyIds.has(enemy.id)) continue;
      const dist = distanceSquared(bullet, enemy);
      if (dist < nearestDistance && dist <= range * range) {
        nearest = enemy;
        nearestDistance = dist;
      }
    }

    return nearest;
  }

  dropXp(enemy) {
    this.run.xpGems.push({
      x: enemy.x,
      y: enemy.y,
      radius: 7,
      value: enemy.xp,
      color: "#52ff94"
    });
  }

  collectXp(dt) {
    const player = this.run.player;
    for (const gem of this.run.xpGems) {
      const attractRadius = pickupRangeFor(this.app.store.meta, this.run);
      const collectRadius = player.radius + gem.radius;
      const dist = Math.sqrt(distanceSquared(player, gem));

      if (dist < attractRadius) {
        const direction = normalize(player.x - gem.x, player.y - gem.y);
        const speed = 220 + (1 - dist / attractRadius) * 420;
        gem.x += direction.x * speed * dt;
        gem.y += direction.y * speed * dt;
      }

      if (distanceSquared(player, gem) <= collectRadius * collectRadius) {
        gem.collected = true;
        this.addXp(gem.value);
      }
    }
  }

  addXp(value) {
    this.run.xp += value * xpMultiplierFor(this.app.store.meta, this.run);
    while (this.run.xp >= this.run.xpToNext && this.run.state === "running") {
      this.run.xp -= this.run.xpToNext;
      this.run.level += 1;
      this.run.xpToNext = Math.floor(20 * this.run.level * 1.25);
      this.openLevelUp();
    }
  }

  openLevelUp() {
    this.run.state = "levelup";
    this.run.levelChoices = this.randomUpgradeChoices();
    this.app.ui.openLevelUp(this.run.levelChoices);
    this.app.ui.setCombat(this.run);
  }

  randomUpgradeChoices() {
    const pool = [...UPGRADE_KEYS].sort(() => Math.random() - 0.5);
    const choices = [];

    for (const key of pool) {
      if (choices.length >= 3) break;
      const rarity = rollRarity();
      const candidate = { key, rarity };
      const filtered = filterUpgradeChoices([candidate], this.run);
      if (filtered.length > 0) choices.push(candidate);
    }

    return choices;
  }

  chooseLevelUpgrade(choice) {
    const { key, rarity } = choice;

    if (isExtraShotUpgrade(key)) {
      this.run.temporaryUpgrades[key] = rarity.multiplier;
      this.run.extraShotRarities[key] = rarity.key;
      this.run.selectedExtraShots.add(key);
    } else {
      this.run.temporaryUpgrades[key] += rarity.multiplier;
      if (!this.run.rarityCounts[key]) this.run.rarityCounts[key] = {};
      const count = this.run.rarityCounts[key][rarity.key] || 0;
      this.run.rarityCounts[key][rarity.key] = count + 1;
    }
    
    const oldMax = this.run.player.maxHealth;
    this.run.player.maxHealth = maxHealthFor(this.app.store.meta, this.run);
    if (key === "maxHealth") {
      this.run.player.health += this.run.player.maxHealth - oldMax;
    }
    
    this.run.state = "running";
    this.app.ui.closeLevelUp();
    this.app.ui.setCombat(this.run);
  }

  finishRun() {
    this.run.reward = Math.floor(this.run.score / 100) + Math.floor(this.run.time / 30);
    this.app.store.addDiamonds(this.run.reward);
    this.run.state = "reward";
    this.app.ui.setCombat(this.run);
    this.app.ui.setMessage("reward", this.run.reward);
  }

  burst(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * TWO_PI;
      const speed = 70 + Math.random() * 240;
      this.run.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color
      });
    }
  }

  prune() {
    const { width, height } = this.app.viewport;
    const camera = this.run.camera;
    const margin = 820;
    const maxDist = Math.max(width, height) * 1.75;
    this.run.bullets = this.run.bullets.filter((bullet) => {
      if (bullet.expired) return false;
      if (bullet.age >= bullet.maxLife) return false;
      const dx = bullet.x - this.run.player.x;
      const dy = bullet.y - this.run.player.y;
      return dx * dx + dy * dy <= maxDist * maxDist;
    });
    this.run.enemies = this.run.enemies.filter((enemy) => enemy.health > 0 && this.isNearCamera(enemy, camera, width, height, margin));
    this.run.particles = this.run.particles.filter((particle) => particle.life > 0);
    this.run.xpGems = this.run.xpGems.filter((gem) => !gem.collected && this.isNearCamera(gem, camera, width, height, margin));
  }

  isNearCamera(entity, camera, width, height, margin) {
    return entity.x > camera.x - margin && entity.x < camera.x + width + margin && entity.y > camera.y - margin && entity.y < camera.y + height + margin;
  }

  worldToScreen(entity) {
    return {
      x: entity.x - this.run.camera.x,
      y: entity.y - this.run.camera.y
    };
  }

  render(ctx) {
    const { width, height } = this.app.viewport;
    const shake = this.app.store.meta.settings.screenShake ? this.run.shake : 0;

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    clear(ctx, width, height);
    this.drawWorldGrid(ctx, width, height);

    for (const particle of this.run.particles) {
      const screen = this.worldToScreen(particle);
      ctx.save();
      ctx.globalAlpha = particleAlpha(particle);
      drawGlowCircle(ctx, screen.x, screen.y, particle.radius, particle.color, particle.color, 1);
      ctx.restore();
    }

    for (const gem of this.run.xpGems) {
      const screen = this.worldToScreen(gem);
      drawGlowCircle(ctx, screen.x, screen.y, gem.radius, "rgba(8, 20, 16, 0.9)", gem.color, 2);
    }

    for (const bullet of this.run.bullets) {
      const screen = this.worldToScreen(bullet);
      drawGlowCircle(ctx, screen.x, screen.y, bullet.radius, "#f7feff", "#00e0ff", 2);
    }

    for (const enemy of this.run.enemies) {
      const screen = this.worldToScreen(enemy);
      drawGlowCircle(ctx, screen.x, screen.y, enemy.radius, "rgba(10, 8, 24, 0.9)", enemy.color, 2);
    }

    const playerScreen = this.worldToScreen(this.run.player);
    const playerAlpha = this.run.player.invulnerable > 0 ? 0.55 + Math.sin(this.run.time * 48) * 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = playerAlpha;
    drawGlowCircle(ctx, playerScreen.x, playerScreen.y, this.run.player.radius, "#071d2a", "#00e0ff", 3);
    ctx.restore();
    ctx.restore();
  }

  drawWorldGrid(ctx, width, height) {
    const spacing = 42;
    const camera = this.run.camera;
    const startX = Math.floor(camera.x / spacing) * spacing;
    const endX = camera.x + width + spacing;
    const startY = Math.floor(camera.y / spacing) * spacing;
    const endY = camera.y + height + spacing;

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#1a8ea3";
    ctx.lineWidth = 1;

    for (let x = startX; x < endX; x += spacing) {
      const screenX = x - camera.x;
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, height);
      ctx.stroke();
    }

    for (let y = startY; y < endY; y += spacing) {
      const screenY = y - camera.y;
      ctx.beginPath();
      ctx.moveTo(0, screenY);
      ctx.lineTo(width, screenY);
      ctx.stroke();
    }
    ctx.restore();
  }
}
