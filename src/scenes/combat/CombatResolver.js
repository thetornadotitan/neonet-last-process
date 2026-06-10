import { distanceSquared, normalize } from "../../utils.js";
import { PLAYER, WEAPONS, CAMERA, PARTICLES, PROGRESSION } from "../../configs/index.js";
import { enemyContactDamageScale } from "../../upgrades/index.js";

export class CombatResolver {
  resolve(run, meta, burstFn, bounceFn) {
    this.resolveBulletHits(run, meta, burstFn, bounceFn);
    this.resolvePlayerCollisions(run, meta, burstFn);
  }

  resolveBulletHits(run, meta, burstFn, bounceFn) {
    for (const bullet of run.bullets) {
      for (const enemy of run.enemies) {
        if (enemy.health <= 0) continue;
        if (bullet.hitEnemyIds.has(enemy.id)) continue;
        const radius = bullet.radius + enemy.radius;
        if (distanceSquared(bullet, enemy) <= radius * radius) {
          bullet.hitEnemyIds.add(enemy.id);
          enemy.health -= bullet.damage;
          burstFn(bullet.x, bullet.y, enemy.color, PARTICLES.hitParticleCount.value);

          if (enemy.health <= 0) {
            run.score += enemy.value;
            this.dropXp(run, enemy);
            burstFn(enemy.x, enemy.y, enemy.color, PARTICLES.deathParticleCount.value);
          }
          bounceFn(bullet, enemy);
          break;
        }
      }
    }
  }

  resolvePlayerCollisions(run, meta, burstFn) {
    const player = run.player;
    const contactDmg = Math.round(PLAYER.contactDamage.value * enemyContactDamageScale(run.time));
    for (const enemy of run.enemies) {
      const radius = player.radius + enemy.radius;
      if (distanceSquared(player, enemy) <= radius * radius && player.invulnerable <= 0) {
        player.health -= contactDmg;
        player.invulnerable = PLAYER.invulnerableDuration.value;
        if (meta.settings.screenShake) run.shake = CAMERA.shakeIntensityOnHit.value;
        burstFn(player.x, player.y, "#00e0ff", PARTICLES.playerHitParticleCount.value);

        if (player.health <= 0) {
          player.health = 0;
        }
      }
    }
  }

  dropXp(run, enemy) {
    run.xpGems.push({
      x: enemy.x,
      y: enemy.y,
      radius: PROGRESSION.gemRadius.value,
      value: enemy.xp,
      color: "#52ff94"
    });
  }
}
