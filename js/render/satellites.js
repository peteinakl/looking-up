import { project } from './projection.js';
import { ISS_ID, getSatName } from '../data/satellites.js';
import { formatDuration } from '../utils/time.js';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

// Satellite colours
const COL_SAT      = '#66cccc';
const COL_SAT_DIM  = 'rgba(102, 204, 204, 0.4)';
const COL_ISS      = '#ffd700';
const COL_STARLINK = '#ffe0b0';
const COL_STL_DIM  = 'rgba(255, 224, 176, 0.35)';

/**
 * Draw all satellites, ISS, and Starlink.
 * Two-pass render: trails first (all types batched), then dots on top.
 */
export function drawSatellites(ctx, state) {
  const { satellites, iss, layers, viewport, timestamp } = state;
  const { positions, aboveHorizon, starlinkIds, stationIds } = satellites;

  // ─── Pass 1: Trails (two-pass fade: older segment faint, newer brighter) ──────
  // Each type is drawn twice:
  //   Sub-pass A: prev2 → current  (faint)  — covers the full ~6s tail
  //   Sub-pass B: prev  → current  (brighter) — overlaps the newer ~3s portion
  // The overlap makes the head visibly brighter than the tail.

  const curInterps = new Map();  // cache per-sat interpolated position

  // Three-pass overlap: A (oldest→current), B (prev2→current), C (prev→current).
  // Each successive pass starts closer to now, so the overlapping region near the
  // head accumulates opacity — a smooth fade without per-sat gradient creation.
  // Combined head opacity: A+B+C. Tail (oldest segment only): A alone.
  function _trailBatch(filter, colA, colB, colC, lwA, lwB, lwC) {
    const head = [];
    for (const id of aboveHorizon) {
      if (!filter(id)) continue;
      const pos = positions.get(id);
      if (!pos || pos.alt <= 0 || pos.prevAlt == null) continue;
      const i0 = _interpolatePos(pos, timestamp);
      curInterps.set(id, i0);
      head.push({ id, pos, i0 });
    }

    // Pass A: oldest anchor (prev3 → prev2 → prev, whichever exists) → current
    ctx.save();
    ctx.strokeStyle = colA;
    ctx.lineWidth   = lwA;
    ctx.beginPath();
    for (const { pos, i0 } of head) {
      const tailAlt = pos.prev3Alt ?? pos.prev2Alt ?? pos.prevAlt;
      const tailAz  = pos.prev3Az  ?? pos.prev2Az  ?? pos.prevAz;
      const p0 = project(tailAlt, tailAz, viewport);
      const p1 = project(i0.alt, i0.az, viewport);
      if (!p0 || !p1) continue;
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
    }
    ctx.stroke();
    ctx.restore();

    // Pass B: prev2 → current
    ctx.save();
    ctx.strokeStyle = colB;
    ctx.lineWidth   = lwB;
    ctx.beginPath();
    for (const { pos, i0 } of head) {
      if (pos.prev2Alt == null) continue;
      const p0 = project(pos.prev2Alt, pos.prev2Az, viewport);
      const p1 = project(i0.alt, i0.az, viewport);
      if (!p0 || !p1) continue;
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
    }
    ctx.stroke();
    ctx.restore();

    // Pass C: prev → current (brightest — recent 3s)
    ctx.save();
    ctx.strokeStyle = colC;
    ctx.lineWidth   = lwC;
    ctx.beginPath();
    for (const { pos, i0 } of head) {
      const p0 = project(pos.prevAlt, pos.prevAz, viewport);
      const p1 = project(i0.alt, i0.az, viewport);
      if (!p0 || !p1) continue;
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Regular sat trails — head opacity ≈ 0.08+0.15+0.26 = 0.49
  if (layers.satellites) {
    _trailBatch(
      id => id !== ISS_ID && !starlinkIds.has(id) && !stationIds.has(id),
      'rgba(102, 204, 204, 0.08)',
      'rgba(102, 204, 204, 0.15)',
      'rgba(102, 204, 204, 0.26)',
      0.6, 0.8, 1.0
    );
  }

  // Starlink trails — head opacity ≈ 0.05+0.11+0.20 = 0.36
  if (layers.starlink) {
    _trailBatch(
      id => starlinkIds.has(id),
      'rgba(255, 224, 176, 0.05)',
      'rgba(255, 224, 176, 0.11)',
      'rgba(255, 224, 176, 0.20)',
      0.5, 0.7, 0.9
    );
  }

  // ─── Pass 2: Dots + hit-test ─────────────────────────────────────────────────

  for (const id of aboveHorizon) {
    const pos = positions.get(id);
    if (!pos || pos.alt <= 0) continue;

    // Reuse interpolated position computed during trail pass if available
    const interp = curInterps.get(id) || _interpolatePos(pos, timestamp);
    const pt     = project(interp.alt, interp.az, viewport);
    if (!pt) continue;

    const isISS      = id === ISS_ID;
    const isStarlink = !_isStation(id, state) && layers.starlink && _satrec_is_starlink(state, id);

    if (isISS) {
      if (!layers.iss) continue;
      _drawISS(ctx, pt, iss, viewport, state);
    } else if (isStarlink) {
      ctx.globalAlpha = pt.alpha;
      ctx.fillStyle   = pos.sunlit ? COL_STARLINK : COL_STL_DIM;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, TWO_PI);
      ctx.fill();
    } else {
      if (!layers.satellites) continue;
      ctx.globalAlpha = pt.alpha * (pos.sunlit ? 1 : 0.45);
      ctx.fillStyle   = pos.sunlit ? COL_SAT : COL_SAT_DIM;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, TWO_PI);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Register all visible sats for hit-testing (including Starlink)
    state.renderedObjects.push({
      type: isISS ? 'iss' : 'satellite',
      id,
      x: pt.x,
      y: pt.y,
      data: _buildSatData(id, pos, isStarlink, state),
    });
  }
}

// ─── ISS ─────────────────────────────────────────────────────────────────────

function _drawISS(ctx, pt, iss, viewport, state) {
  const { timestamp } = state;

  // Trail (historical — solid)
  if (iss.trail.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    let started = false;
    for (const p of iss.trail) {
      const tp = project(p.alt, p.az, viewport);
      if (!tp) { started = false; continue; }
      if (!started) { ctx.moveTo(tp.x, tp.y); started = true; }
      else ctx.lineTo(tp.x, tp.y);
    }
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();
  }

  // Projection (future — dashed)
  if (iss.projection.length > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.15)';
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    let started = true;
    for (const p of iss.projection) {
      const tp = project(p.alt, p.az, viewport);
      if (!tp) { started = false; continue; }
      if (!started) { ctx.moveTo(tp.x, tp.y); started = true; }
      else ctx.lineTo(tp.x, tp.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ISS dot
  ctx.globalAlpha = pt.alpha;
  ctx.fillStyle   = COL_ISS;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 5, 0, TWO_PI);
  ctx.fill();

  // ISS label
  ctx.font         = '9px "Azeret Mono", monospace';
  ctx.fillStyle    = 'rgba(255, 215, 0, 0.8)';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('ISS', pt.x + 7, pt.y - 2);

  ctx.globalAlpha = 1;

  // Next-rise indicator
  if (iss.nextRise) {
    _drawISSNextRise(ctx, iss.nextRise, viewport);
  }
}

function _drawISSNextRise(ctx, nextRise, viewport) {
  const { cx, cy, radius, rotation } = viewport;
  const az = nextRise.azDeg * DEG - rotation;
  const sx = cx + Math.sin(az) * (radius - 4);
  const sy = cy - Math.cos(az) * (radius - 4);

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, TWO_PI);
  ctx.stroke();

  const eta = formatDuration(nextRise.etaMs);
  ctx.font      = '8px "Azeret Mono", monospace';
  ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
  ctx.textAlign = 'center';
  ctx.fillText(`ISS ${eta}`, sx, sy - 10);
  ctx.restore();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _interpolatePos(pos, ts) {
  if (!pos.propTime) return pos;
  const frac = Math.min(1, (ts - pos.propTime) / 3000);
  if (frac <= 0) return pos;

  // Interpolate in Cartesian unit-sphere space to avoid azimuth wraparound
  const a1 = pos.prevAlt ?? pos.alt, az1 = pos.prevAz ?? pos.az;
  const a2  = pos.alt,               az2  = pos.az;

  const x1 = Math.cos(a1) * Math.sin(az1), y1 = Math.cos(a1) * Math.cos(az1), z1 = Math.sin(a1);
  const x2 = Math.cos(a2) * Math.sin(az2), y2 = Math.cos(a2) * Math.cos(az2), z2 = Math.sin(a2);

  const xi = x1 + (x2 - x1) * frac;
  const yi = y1 + (y2 - y1) * frac;
  const zi = z1 + (z2 - z1) * frac;

  const alt = Math.asin(Math.max(-1, Math.min(1, zi / Math.sqrt(xi * xi + yi * yi + zi * zi))));
  const az  = ((Math.atan2(xi, yi) + TWO_PI) % TWO_PI);

  return { ...pos, alt, az };
}

function _isStation(id, state) {
  return state.satellites.stationIds.has(id) || id === ISS_ID;
}

function _satrec_is_starlink(state, id) {
  return state.satellites.starlinkIds.has(id);
}

function _buildSatData(id, pos, isStarlink, state) {
  const altKm = pos.height ? pos.height.toFixed(0) : '—';
  const r     = (pos.height || 400) + 6371;
  const speed = Math.sqrt(398600 / r).toFixed(1);
  const name  = getSatName(id) || (id === ISS_ID ? 'ISS (ZARYA)' : `NORAD ${id}`);

  return {
    name,
    norad:     id,
    altKm,
    speed,
    sunlit:    pos.sunlit,
    alt:       pos.alt,
    az:        pos.az,
    isStarlink,
    crew:      id === ISS_ID ? state.iss.crewCount : null,
  };
}
