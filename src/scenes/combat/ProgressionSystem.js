import {
  UPGRADE_KEYS, makeUpgradeLevels, maxHealthFor, pickupRangeFor,
  xpMultiplierFor, rollRarity, isExtraShotUpgrade, filterUpgradeChoices
} from "../../upgrades/index.js";
import { distanceSquared, normalize } from "../../utils.js";
import { PROGRESSION, CAMERA, PARTICLES } from "../../configs/index.js";

export class ProgressionSystem {
  collectXp(run, meta, dt) {
    const player = run.player;
    for (const gem of run.xpGems) {
      const attractRadius = pickupRangeFor(meta, run);
      const collectRadius = player.radius + gem.radius;
      const dist = Math.sqrt(distanceSquared(player, gem));

      if (dist < attractRadius) {
        const direction = normalize(player.x - gem.x, player.y - gem.y);
        const speed = PROGRESSION.gemAttractSpeedMin.value + (1 - dist / attractRadius) * PROGRESSION.gemAttractSpeedBonus.value;
        gem.x += direction.x * speed * dt;
        gem.y += direction.y * speed * dt;
      }

      if (distanceSquared(player, gem) <= collectRadius * collectRadius) {
        gem.collected = true;
        this.addXp(run, meta, gem.value);
      }
    }
  }

  addXp(run, meta, value) {
    run.xp += value * xpMultiplierFor(meta, run);
    while (run.xp >= run.xpToNext && run.state === "running") {
      run.xp -= run.xpToNext;
      run.level += 1;
      run.xpToNext = Math.floor(PROGRESSION.xpBase.value * run.level * PROGRESSION.xpLevelMultiplier.value);
    }
  }

  randomUpgradeChoices(run) {
    const pool = [...UPGRADE_KEYS].sort(() => Math.random() - 0.5);
    const choices = [];

    for (const key of pool) {
      if (choices.length >= PROGRESSION.levelUpChoices.value) break;
      const rarity = rollRarity();
      const candidate = { key, rarity };
      const filtered = filterUpgradeChoices([candidate], run);
      if (filtered.length > 0) choices.push(candidate);
    }

    return choices;
  }

  chooseLevelUpgrade(run, meta, choice) {
    const { key, rarity } = choice;

    if (isExtraShotUpgrade(key)) {
      run.temporaryUpgrades[key] = rarity.multiplier;
      run.extraShotRarities[key] = rarity.key;
      run.selectedExtraShots.add(key);
    } else {
      run.temporaryUpgrades[key] += rarity.multiplier;
      if (!run.rarityCounts[key]) run.rarityCounts[key] = {};
      const count = run.rarityCounts[key][rarity.key] || 0;
      run.rarityCounts[key][rarity.key] = count + 1;
    }

    const oldMax = run.player.maxHealth;
    run.player.maxHealth = maxHealthFor(meta, run);
    if (key === "maxHealth") {
      run.player.health += run.player.maxHealth - oldMax;
    }
  }

  finishRun(run) {
    run.reward = Math.floor(run.score / PROGRESSION.diamondRewardScoreDivisor.value) + Math.floor(run.time / PROGRESSION.diamondRewardTimeDivisor.value);
  }

  burst(run, x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLES.speedMin.value + Math.random() * PARTICLES.speedRange.value;
      run.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: PARTICLES.radiusMin.value + Math.random() * PARTICLES.radiusRange.value,
        life: PARTICLES.lifeMin.value + Math.random() * PARTICLES.lifeRange.value,
        maxLife: PARTICLES.maxLife.value,
        color
      });
    }
  }

  prune(run, viewport) {
    const { width, height } = viewport;
    const camera = run.camera;
    const margin = CAMERA.pruneMargin.value;
    const maxDist = Math.max(width, height) * CAMERA.bulletMaxTravelMultiplier.value;
    run.bullets = run.bullets.filter((bullet) => {
      if (bullet.expired) return false;
      if (bullet.age >= bullet.maxLife) return false;
      const dx = bullet.x - run.player.x;
      const dy = bullet.y - run.player.y;
      return dx * dx + dy * dy <= maxDist * maxDist;
    });
    run.enemies = run.enemies.filter((enemy) => enemy.health > 0 && this.isNearCamera(enemy, camera, width, height, margin));
    run.particles = run.particles.filter((particle) => particle.life > 0);
    run.xpGems = run.xpGems.filter((gem) => !gem.collected && this.isNearCamera(gem, camera, width, height, margin));
  }

  isNearCamera(entity, camera, width, height, margin) {
    return entity.x > camera.x - margin && entity.x < camera.x + width + margin && entity.y > camera.y - margin && entity.y < camera.y + height + margin;
  }
}
