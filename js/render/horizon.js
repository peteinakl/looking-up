/**
 * Draw ambient sun glow when sun is below horizon.
 */
export function drawHorizon(ctx, state) {
  const { viewport, planets } = state;
  const { cx, cy, radius, rotation } = viewport;

  ctx.save();

  // ─── Sun azimuth glow (subtle warm bloom from the direction of the sun) ────
  if (planets.sunAlt < -0.05) {  // only when clearly below horizon
    const sunAz = planets.sunAz - rotation;
    const glow  = radius * 0.9;
    const sx = cx + Math.sin(sunAz) * glow;
    const sy = cy - Math.cos(sunAz) * glow;

    const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 0.6);
    sunGrad.addColorStop(0, 'rgba(255, 190, 60, 0.08)');
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, ctx.canvas.width / (window.devicePixelRatio || 1), ctx.canvas.height / (window.devicePixelRatio || 1));
  }

  ctx.restore();
}
