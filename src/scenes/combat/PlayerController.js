import { maxHealthFor, moveSpeedFor, regenFor } from "../../upgrades/index.js";
import { PLAYER } from "../../configs/index.js";

export class PlayerController {
  update(run, meta, input, dt) {
    const player = run.player;
    player.maxHealth = maxHealthFor(meta, run);
    player.speed = moveSpeedFor(meta, run);
    player.health = Math.min(player.maxHealth, player.health + regenFor(meta, run) * dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);

    const movement = input.movementVector();
    player.x += movement.x * player.speed * dt;
    player.y += movement.y * player.speed * dt;
  }
}
