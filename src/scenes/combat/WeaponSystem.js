import { clamp, distanceSquared, normalize, TWO_PI } from "../../utils.js";
import { damageFor, damageScale, shotCooldownFor, multishotBurstDelayFor, extraShotLevel } from "../../upgrades/index.js";
import { WEAPONS, PARTICLES } from "../../configs/index.js";

export class WeaponSystem {
  update(run, meta, dt) {
    if (run.burstState.shotsRemaining > 0) {
      run.burstState.burstDelay -= dt;
      if (run.burstState.burstDelay <= 0) {
        const nearest = this.findNearest(run);
        if (nearest) {
          const aim = normalize(nearest.x - run.player.x, nearest.y - run.player.y);
          this.firePattern(run, meta, aim);
        }
        run.burstState.shotsRemaining -= 1;
        if (run.burstState.shotsRemaining > 0) {
          run.burstState.burstDelay = multishotBurstDelayFor(meta, run);
        }
      }
      return;
    }

    run.shotTimer -= dt;
    if (run.shotTimer > 0) return;

    const nearest = this.findNearest(run);
    if (nearest) {
      const aim = normalize(nearest.x - run.player.x, nearest.y - run.player.y);
      const multishot = extraShotLevel(run, "multishot");
      const burstCount = 1 + multishot;

      this.firePattern(run, meta, aim);

      if (burstCount > 1) {
        run.burstState.shotsRemaining = burstCount - 1;
        run.burstState.burstDelay = multishotBurstDelayFor(meta, run);
      }
    }

    run.shotTimer = shotCooldownFor(meta, run);
  }

  findNearest(run) {
    let nearest = null;
    let nearestDistance = Infinity;
    const range = WEAPONS.targetingRange.value;

    for (const enemy of run.enemies) {
      const dist = distanceSquared(run.player, enemy);
      if (dist < nearestDistance && dist <= range * range) {
        nearest = enemy;
        nearestDistance = dist;
      }
    }

    return nearest;
  }

  firePattern(run, meta, aim) {
    const front = extraShotLevel(run, "frontShot");
    const diagonal = extraShotLevel(run, "diagonalShot");
    const reverse = extraShotLevel(run, "reverseShot");

    this.spawnBullet(run, meta, aim);

    for (let i = 0; i < front; i += 1) {
      this.spawnBullet(run, meta, aim, 0, (i + 1) * WEAPONS.frontShotSpacing.value);
    }

    for (let i = 0; i < diagonal; i += 1) {
      const spread = WEAPONS.diagonalBaseAngle.value + i * WEAPONS.diagonalAngleStep.value;
      this.spawnBullet(run, meta, this.rotateVector(aim, -spread));
      this.spawnBullet(run, meta, this.rotateVector(aim, spread));
    }

    for (let i = 0; i < reverse; i += 1) {
      this.spawnBullet(run, meta, { x: -aim.x, y: -aim.y }, 0, i * WEAPONS.reverseShotSpacing.value);
    }
  }

  spawnBullet(run, meta, direction, angleOffset = 0, sideOffset = 0) {
    const aim = angleOffset === 0 ? direction : this.rotateVector(direction, angleOffset);
    const perpendicular = { x: -aim.y, y: aim.x };
    const homing = extraShotLevel(run, "homing");

    run.bullets.push({
      x: run.player.x + aim.x * WEAPONS.spawnOffset.value + perpendicular.x * sideOffset,
      y: run.player.y + aim.y * WEAPONS.spawnOffset.value + perpendicular.y * sideOffset,
      vx: aim.x * WEAPONS.bulletSpeed.value,
      vy: aim.y * WEAPONS.bulletSpeed.value,
      radius: WEAPONS.bulletRadius.value,
      damage: damageFor(meta, run) * damageScale(run.time),
      bouncesLeft: extraShotLevel(run, "projectileBounce"),
      hitEnemyIds: new Set(),
      maxLife: WEAPONS.bulletMaxLife.value,
      age: 0,
      homingStrength: homing > 0 ? homing * WEAPONS.homingStrengthPerLevel.value : 0,
      homingRange: WEAPONS.homingSearchRange.value,
      targetEnemyId: null
    });
  }

  updateActors(run, dt) {
    for (const bullet of run.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.age += dt;

      if (bullet.homingStrength > 0) {
        this.updateHoming(run, bullet, dt);
      }
    }

    for (const enemy of run.enemies) {
      const direction = normalize(run.player.x - enemy.x, run.player.y - enemy.y);
      enemy.x += direction.x * enemy.speed * dt;
      enemy.y += direction.y * enemy.speed * dt;
    }

    for (const particle of run.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - PARTICLES.dragCoefficient.value * dt;
      particle.vy *= 1 - PARTICLES.dragCoefficient.value * dt;
      particle.life -= dt;
    }
  }

  updateHoming(run, bullet, dt) {
    let target = bullet.targetEnemyId
      ? run.enemies.find(e => e.id === bullet.targetEnemyId)
      : null;

    if (!target || target.health <= 0) {
      target = this.findNearestEnemy(run, bullet.x, bullet.y, bullet.homingRange);
      bullet.targetEnemyId = target?.id ?? null;
    }

    if (target) {
      const desired = normalize(target.x - bullet.x, target.y - bullet.y);
      const current = normalize(bullet.vx, bullet.vy);
      const turnRate = bullet.homingStrength * WEAPONS.homingTurnRateMultiplier.value * dt;
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

  findNearestEnemy(run, x, y, range) {
    let nearest = null;
    let nearestDistance = Infinity;
    const rangeSq = range * range;

    for (const enemy of run.enemies) {
      if (enemy.health <= 0) continue;
      const dist = distanceSquared({ x, y }, enemy);
      if (dist < nearestDistance && dist <= rangeSq) {
        nearest = enemy;
        nearestDistance = dist;
      }
    }

    return nearest;
  }

  resolveBulletBounce(run, bullet, hitEnemy) {
    if (bullet.bouncesLeft <= 0) {
      bullet.expired = true;
      return;
    }

    const nextEnemy = this.nearestBounceTarget(run, bullet, hitEnemy);
    if (!nextEnemy) {
      bullet.expired = true;
      return;
    }

    const direction = normalize(nextEnemy.x - bullet.x, nextEnemy.y - bullet.y);
    bullet.vx = direction.x * WEAPONS.bulletSpeed.value;
    bullet.vy = direction.y * WEAPONS.bulletSpeed.value;
    bullet.bouncesLeft -= 1;
    bullet.age = 0;
  }

  nearestBounceTarget(run, bullet, hitEnemy) {
    let nearest = null;
    let nearestDistance = Infinity;
    const range = WEAPONS.bounceSearchRange.value;

    for (const enemy of run.enemies) {
      if (enemy.health <= 0 || enemy.id === hitEnemy.id || bullet.hitEnemyIds.has(enemy.id)) continue;
      const dist = distanceSquared(bullet, enemy);
      if (dist < nearestDistance && dist <= range * range) {
        nearest = enemy;
        nearestDistance = dist;
      }
    }

    return nearest;
  }

  rotateVector(vector, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos
    };
  }
}
