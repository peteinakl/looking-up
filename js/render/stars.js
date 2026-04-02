import { lst } from '../utils/time.js';
import { bvToRgb, magToRadius } from '../utils/colour.js';
import { raDecToAltAz, project } from './projection.js';

// Cache alt/az positions (NOT screen positions) — recomputed every 30s.
// Each frame reprojects from alt/az through the current viewport, so
// pan/zoom/rotation always work correctly.

const RECOMPUTE_INTERVAL_MS = 30000;

let _cachedAltAz  = null;  // [{altRad, azRad, radius, colour}]
let _lastComputeTs = 0;
let _lastLst       = 0;

/**
 * Draw all stars above the horizon.
 */
export function drawStars(ctx, stars, state) {
  const { observer, timestamp, viewport } = state;
  const latRad = observer.lat * Math.PI / 180;
  const lstNow = lst(timestamp, observer.lon);

  const needRecompute = !_cachedAltAz
    || (timestamp - _lastComputeTs) > RECOMPUTE_INTERVAL_MS;

  if (needRecompute) {
    _cachedAltAz   = _computeAltAz(stars, latRad, lstNow);
    _lastComputeTs = timestamp;
    _lastLst       = lstNow;
  }

  // Reproject from alt/az through current viewport every frame.
  // altAzToScreen() applies zoom, pan, and rotation, so all layers stay in sync.
  for (const s of _cachedAltAz) {
    const pt = project(s.altRad, s.azRad, viewport);
    if (!pt || pt.alpha <= 0) continue;

    ctx.globalAlpha = pt.alpha;
    ctx.fillStyle   = s.colour;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, s.radius, 0, 2 * Math.PI);
    ctx.fill();

    // Register stars for hit-testing (mag < 4.5 — all easily visible stars)
    if (s.mag < 4.5) {
      state.renderedObjects.push({
        type: 'star',
        id:   `star_${s.desig || s.mag.toFixed(2)}_${s.altRad.toFixed(3)}`,
        x:    pt.x,
        y:    pt.y,
        data: { alt: s.altRad, az: s.azRad, mag: s.mag, bv: s.bv, name: s.name, desig: s.desig },
      });
    }
  }

  ctx.globalAlpha = 1;
}

function _computeAltAz(stars, latRad, lstRad) {
  const results = [];
  for (const star of stars) {
    const { alt, az } = raDecToAltAz(star.raRad, star.decRad, latRad, lstRad);
    if (alt < 0) continue;
    results.push({
      altRad: alt,
      azRad:  az,
      radius: magToRadius(star.mag),
      colour: bvToRgb(star.bv),
      mag:    star.mag,
      bv:     star.bv,
      name:   star.name,
      desig:  star.desig,
    });
  }
  return results;
}

// ─── Constellation Lines ──────────────────────────────────────────────────────

export function drawConstellationLines(ctx, constellations, state) {
  const { observer, timestamp, viewport } = state;
  const latRad = observer.lat * Math.PI / 180;
  const lstNow = lst(timestamp, observer.lon);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth   = 0.8;

  for (const { segments } of constellations.lines) {
    for (const line of segments) {
      let started = false;
      ctx.beginPath();

      for (const [raRad, decRad] of line) {
        const { alt, az } = raDecToAltAz(raRad, decRad, latRad, lstNow);
        if (alt < 0) { started = false; continue; }
        const pt = project(alt, az, viewport);
        if (!pt) { started = false; continue; }

        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawConstellationNames(ctx, constellations, state) {
  const { observer, timestamp, viewport } = state;
  if (viewport.zoom < 0.75) return;

  const latRad = observer.lat * Math.PI / 180;
  const lstNow = lst(timestamp, observer.lon);

  ctx.save();
  ctx.font      = '11px "Azeret Mono", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
  ctx.textAlign = 'center';

  for (const { raRad, decRad, name } of constellations.names) {
    const { alt, az } = raDecToAltAz(raRad, decRad, latRad, lstNow);
    if (alt < 5 * Math.PI / 180) continue;
    const pt = project(alt, az, viewport);
    if (!pt) continue;

    ctx.globalAlpha = pt.alpha * 0.9;
    ctx.fillText(name.toUpperCase(), pt.x, pt.y);
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}
