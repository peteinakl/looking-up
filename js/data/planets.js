// Planet and Moon position computation using astronomy-engine.
// Recomputes every 60s. Uses state.timestamp (never Date.now() directly).

import { raDecToAltAz } from '../render/projection.js';
import { lst } from '../utils/time.js';

const DEG = Math.PI / 180;
const RECOMPUTE_INTERVAL_MS = 60000;

const BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

// Characteristic colours (PRD §6.4)
const PLANET_COLOURS = {
  Mercury: '#cccccc',
  Venus:   '#fffde0',
  Mars:    '#ff6644',
  Jupiter: '#fff0d0',
  Saturn:  '#ffe8a0',
};

const PLANET_RADII = {
  Mercury: 3,
  Venus:   5,
  Mars:    4,
  Jupiter: 6,
  Saturn:  5,
};

const MOON_PHASES = [
  'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
  'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
];

let _lastCompute = 0;
let _state       = null;

export function initPlanets(state) {
  _state = state;
  _compute(state.timestamp);
}

/**
 * Called each frame from the render loop — only recomputes every 60s.
 */
export function updatePlanets(ts) {
  if (!_state || ts - _lastCompute < RECOMPUTE_INTERVAL_MS) return;
  _compute(ts);
}

function _compute(ts) {
  if (typeof Astronomy === 'undefined') return;  // CDN not loaded yet
  _lastCompute = ts;

  const date    = new Date(ts);
  const obs     = _state.observer;
  const latRad  = obs.lat * DEG;
  const lstNow  = lst(ts, obs.lon);

  // ─── Sun ──────────────────────────────────────────────────────────────────
  try {
    const sunEq = Astronomy.Equator('Sun', date, _astroObserver(obs), true, true);
    const sunAltAz = raDecToAltAz(
      sunEq.ra * 15 * DEG,   // RA: hours → degrees → radians
      sunEq.dec * DEG,
      latRad,
      lstNow
    );
    _state.planets.sunAlt = sunAltAz.alt;
    _state.planets.sunAz  = sunAltAz.az;
  } catch {}

  // ─── Planets ──────────────────────────────────────────────────────────────
  const bodies = [];
  for (const body of BODIES) {
    try {
      const eq    = Astronomy.Equator(body, date, _astroObserver(obs), true, true);
      const altAz = raDecToAltAz(
        eq.ra * 15 * DEG,
        eq.dec * DEG,
        latRad,
        lstNow
      );
      if (altAz.alt < 0) continue;

      bodies.push({
        name:   body,
        alt:    altAz.alt,
        az:     altAz.az,
        colour: PLANET_COLOURS[body],
        radius: PLANET_RADII[body],
      });
    } catch {}
  }
  _state.planets.bodies = bodies;

  // ─── Moon ─────────────────────────────────────────────────────────────────
  try {
    const moonEq   = Astronomy.Equator('Moon', date, _astroObserver(obs), true, true);
    const moonAltAz = raDecToAltAz(
      moonEq.ra * 15 * DEG,
      moonEq.dec * DEG,
      latRad,
      lstNow
    );
    const phaseAngle  = Astronomy.MoonPhase(date);  // 0–360°
    const illumination = (1 - Math.cos(phaseAngle * DEG)) / 2;  // 0–1
    const phaseIdx    = Math.round(phaseAngle / 45) % 8;

    _state.planets.moon = {
      alt:          moonAltAz.alt,
      az:           moonAltAz.az,
      phase:        phaseAngle,
      illumination,
      phaseName:    MOON_PHASES[phaseIdx],
    };
  } catch {
    _state.planets.moon = null;
  }
}

function _astroObserver(obs) {
  return new Astronomy.Observer(obs.lat, obs.lon, 0);
}
