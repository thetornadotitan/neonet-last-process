import { clear, drawGlowCircle, particleAlpha } from "../../renderer.js";
import { CAMERA, PARTICLES } from "../../configs/index.js";

export class CombatRenderer {
  render(ctx, run, viewport, screenShakeEnabled) {
    const { width, height } = viewport;
    const shake = screenShakeEnabled ? run.shake : 0;

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    clear(ctx, width, height);
    this.drawWorldGrid(ctx, run, width, height);

    for (const particle of run.particles) {
      const screen = this.worldToScreen(particle, run);
      ctx.save();
      ctx.globalAlpha = particleAlpha(particle);
      drawGlowCircle(ctx, screen.x, screen.y, particle.radius, particle.color, particle.color, 1);
      ctx.restore();
    }

    for (const gem of run.xpGems) {
      const screen = this.worldToScreen(gem, run);
      drawGlowCircle(ctx, screen.x, screen.y, gem.radius, "rgba(8, 20, 16, 0.9)", gem.color, 2);
    }

    for (const bullet of run.bullets) {
      const screen = this.worldToScreen(bullet, run);
      drawGlowCircle(ctx, screen.x, screen.y, bullet.radius, "#f7feff", "#00e0ff", 2);
    }

    for (const enemy of run.enemies) {
      const screen = this.worldToScreen(enemy, run);
      drawGlowCircle(ctx, screen.x, screen.y, enemy.radius, "rgba(10, 8, 24, 0.9)", enemy.color, 2);
    }

    const playerScreen = this.worldToScreen(run.player, run);
    const playerAlpha = run.player.invulnerable > 0 ? 0.55 + Math.sin(run.time * 48) * 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = playerAlpha;
    drawGlowCircle(ctx, playerScreen.x, playerScreen.y, run.player.radius, "#071d2a", "#00e0ff", 3);
    ctx.restore();
    ctx.restore();
  }

  drawWorldGrid(ctx, run, width, height) {
    const spacing = CAMERA.gridSpacing.value;
    const camera = run.camera;
    const startX = Math.floor(camera.x / spacing) * spacing;
    const endX = camera.x + width + spacing;
    const startY = Math.floor(camera.y / spacing) * spacing;
    const endY = camera.y + height + spacing;

    ctx.save();
    ctx.globalAlpha = CAMERA.gridAlpha.value;
    ctx.strokeStyle = CAMERA.gridColor;
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

  worldToScreen(entity, run) {
    return {
      x: entity.x - run.camera.x,
      y: entity.y - run.camera.y
    };
  }
}
