import { clamp, TWO_PI } from "./utils.js";
import { CAMERA } from "./configs/index.js";

export function clear(ctx, width, height) {
  ctx.fillStyle = "#050610";
  ctx.fillRect(0, 0, width, height);
}

export function drawGrid(ctx, width, height, time, alpha = CAMERA.gridAlpha.value) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = CAMERA.gridColor;
  ctx.lineWidth = 1;
  const spacing = CAMERA.gridSpacing.value;
  const offset = (time * CAMERA.gridScrollSpeed.value) % spacing;

  for (let x = -spacing + offset; x < width + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = -spacing + offset; y < height + spacing; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGlowCircle(ctx, x, y, radius, fill, glow, lineWidth = 2) {
  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = glow;
  ctx.fillStyle = fill;
  ctx.strokeStyle = glow;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TWO_PI);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawNeonRect(ctx, x, y, width, height, stroke, fill = "rgba(5, 8, 20, 0.78)") {
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = stroke;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawLabel(ctx, text, x, y, color = "#f6fbff", size = 14, align = "center") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function particleAlpha(particle) {
  return clamp(particle.life / particle.maxLife, 0, 1);
}

