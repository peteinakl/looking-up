import { project } from './projection.js';
import { updatePlanets } from '../data/planets.js';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

/**
 * Draw all planets and the Moon.
 */
export function drawPlanets(ctx, state) {
  const { planets, viewport, timestamp } = state;

  // Trigger recompute if due
  updatePlanets(timestamp);

  // ─── Planets ──────────────────────────────────────────────────────────────
  for (const body of planets.bodies) {
    const pt = project(body.alt, body.az, viewport);
    if (!pt) continue;

    ctx.save();
    ctx.globalAlpha = pt.alpha;

    // Planet dot
    ctx.fillStyle = body.colour;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, body.radius, 0, TWO_PI);
    ctx.fill();

    // Label
    ctx.font         = '9px "Azeret Mono", monospace';
    ctx.fillStyle    = 'rgba(255, 255, 255, 0.65)';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(body.name, pt.x + body.radius + 4, pt.y);

    ctx.restore();

    // Hit-testing
    state.renderedObjects.push({
      type: 'planet',
      id:   body.name,
      x:    pt.x,
      y:    pt.y,
      data: {
        name: body.name,
        alt:  body.alt,
        az:   body.az,
      },
    });
  }

  // ─── Moon ─────────────────────────────────────────────────────────────────
  const moon = planets.moon;
  if (moon && moon.alt > 0) {
    const pt = project(moon.alt, moon.az, viewport);
    if (pt) {
      _drawMoon(ctx, pt, moon);

      // Moon label
      ctx.save();
      ctx.globalAlpha  = pt.alpha * 0.7;
      ctx.font         = '9px "Azeret Mono", monospace';
      ctx.fillStyle    = 'rgba(255, 255, 255, 0.65)';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`Moon · ${Math.round(moon.illumination * 100)}%`, pt.x + 12, pt.y);
      ctx.restore();

      state.renderedObjects.push({
        type: 'moon',
        id:   'moon',
        x:    pt.x,
        y:    pt.y,
        data: {
          name:         'Moon',
          alt:          moon.alt,
          az:           moon.az,
          phaseName:    moon.phaseName,
          illumination: moon.illumination,
        },
      });
    }
  }
}

function _drawMoon(ctx, pt, moon) {
  const MOON_RADIUS = 9;
  const { illumination, phase } = moon;

  ctx.save();
  ctx.globalAlpha = pt.alpha;

  // Base circle (dim white)
  ctx.fillStyle = 'rgba(200, 200, 210, 0.25)';
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, MOON_RADIUS, 0, TWO_PI);
  ctx.fill();

  // Lit portion — draw as arc clip
  // Phase 0° = new moon, 180° = full moon
  // illumination ∈ [0, 1]

  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, MOON_RADIUS, 0, TWO_PI);
  ctx.clip();

  const lit = ctx.createLinearGradient(pt.x - MOON_RADIUS, pt.y, pt.x + MOON_RADIUS, pt.y);

  if (phase < 180) {
    // Waxing: lit on the right
    const edge = 1 - illumination * 2;  // -1 to +1
    const xEdge = pt.x + edge * MOON_RADIUS;
    lit.addColorStop(0, 'rgba(220, 220, 230, 0)');
    lit.addColorStop(Math.max(0, (edge + 1) / 2 - 0.01), 'rgba(220, 220, 230, 0)');
    lit.addColorStop(Math.min(1, (edge + 1) / 2 + 0.01), 'rgba(220, 220, 230, 0.85)');
    lit.addColorStop(1, 'rgba(220, 220, 230, 0.85)');
  } else {
    // Waning: lit on the left
    const edge = illumination * 2 - 1;
    lit.addColorStop(0, 'rgba(220, 220, 230, 0.85)');
    lit.addColorStop(Math.max(0, (1 - edge) / 2 - 0.01), 'rgba(220, 220, 230, 0.85)');
    lit.addColorStop(Math.min(1, (1 - edge) / 2 + 0.01), 'rgba(220, 220, 230, 0)');
    lit.addColorStop(1, 'rgba(220, 220, 230, 0)');
  }

  ctx.fillStyle = lit;
  ctx.fillRect(pt.x - MOON_RADIUS, pt.y - MOON_RADIUS, MOON_RADIUS * 2, MOON_RADIUS * 2);
  ctx.restore();

  // Outer ring
  ctx.strokeStyle = 'rgba(200, 200, 210, 0.3)';
  ctx.lineWidth   = 0.5;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, MOON_RADIUS, 0, TWO_PI);
  ctx.stroke();

  ctx.restore();
}
