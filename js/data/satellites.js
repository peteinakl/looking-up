// Satellite data pipeline.
// Fetches CelesTrak OMM/JSON, parses with satellite.js json2satrec,
// propagates positions every 3s, runs horizon checks every 30s.

import { gmst } from '../utils/time.js';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080/api'
  : '/api';

const LS_PREFIX = 'celestrak_';
const LS_TS_SUFFIX = '_ts';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;  // 2 hours

const PROP_INTERVAL_MS    = 3000;
const HORIZON_INTERVAL_MS = 30000;
const CHUNK_SIZE          = 500;     // records per async microtask for json2satrec
const HORIZON_CHUNK       = 2000;    // sats per frame for Starlink horizon check

const R_EARTH_KM = 6371;
const DEG = Math.PI / 180;

// Module-level satrec stores keyed by NORAD ID
const _satrecs = { stations: new Map(), active: new Map(), starlink: new Map() };
const _names   = new Map();  // noradId → OBJECT_NAME

let _state = null;
let _propTimer    = null;
let _horizonTimer = null;
let _horizonChunkIdx = 0;  // for Starlink chunked processing

// ─── Public init ─────────────────────────────────────────────────────────────

// Returns a Promise that resolves when stations + active are both loaded,
// so the caller can chain enableStarlink() after the base groups are done.
export function initSatellites(state) {
  _state = state;

  const p1 = _fetchGroup('stations');
  const p2 = _fetchGroup('active');

  _startPropLoop();
  _startHorizonLoop();

  return Promise.all([p1, p2]);
}

// Called by toggles.js when Starlink is first enabled
export function enableStarlink() {
  if (_satrecs.starlink.size === 0) {
    _fetchGroup('starlink');
  }
}

// ─── Fetch + Parse ───────────────────────────────────────────────────────────

async function _fetchGroup(group) {
  const sats = _state.satellites;
  sats.loading[group] = true;

  let records = _loadFromStorage(group);
  if (!records) {
    try {
      const res = await fetch(`${API_BASE}/celestrak/${group}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        sats.error = err.error || 'CelesTrak unavailable';
        sats.loading[group] = false;
        return;
      }
      records = await res.json();
      _saveToStorage(group, records);
    } catch (e) {
      sats.error = 'Network error fetching satellite data';
      sats.loading[group] = false;
      return;
    }
  }

  sats.error = null;

  // Chunked json2satrec to avoid blocking main thread
  await _parseRecordsChunked(group, records);

  sats.loading[group] = false;
  sats.counts[group]  = _satrecs[group].size;

  // Maintain group membership sets for fast lookup in render
  if (group === 'starlink') {
    sats.starlinkIds = new Set(_satrecs.starlink.keys());
  }
  if (group === 'stations') {
    sats.stationIds = new Set(_satrecs.stations.keys());
  }

  // Immediately re-run horizon check so new sats appear within the next
  // propagation cycle (3s) rather than waiting up to 30s for the scheduled check.
  _runHorizonCheck();
}

async function _parseRecordsChunked(group, records) {
  const map = _satrecs[group];
  map.clear();

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    for (const rec of chunk) {
      try {
        const satrec = satellite.json2satrec(rec);
        if (satrec && satrec.satnum) {
          const id = String(satrec.satnum);
          map.set(id, satrec);
          if (rec.OBJECT_NAME) _names.set(id, rec.OBJECT_NAME);
        }
      } catch {}
    }
    // Yield to main thread between chunks
    await new Promise(r => setTimeout(r, 0));
  }
}

// ─── Local Storage Cache ─────────────────────────────────────────────────────

function _loadFromStorage(group) {
  try {
    const ts   = parseInt(localStorage.getItem(LS_PREFIX + group + LS_TS_SUFFIX) || '0', 10);
    const body = localStorage.getItem(LS_PREFIX + group);
    if (body && Date.now() - ts < CACHE_TTL_MS) {
      return JSON.parse(body);
    }
  } catch {}
  return null;
}

function _saveToStorage(group, records) {
  try {
    localStorage.setItem(LS_PREFIX + group, JSON.stringify(records));
    localStorage.setItem(LS_PREFIX + group + LS_TS_SUFFIX, String(Date.now()));
  } catch (e) {
    // QuotaExceededError — store in memory only, no crash
    if (e.name === 'QuotaExceededError') {
      console.warn(`[satellites] localStorage quota exceeded for group ${group}, using memory only`);
    }
  }
}

// ─── SGP4 Propagation ────────────────────────────────────────────────────────

function _startPropLoop() {
  _propagateAll();
  _propTimer = setInterval(_propagateAll, PROP_INTERVAL_MS);
}

function _propagateAll() {
  if (!_state) return;
  const ts  = _state.timestamp;
  const now = new Date(ts);
  const gm  = gmst(ts);
  const obs = _state.observer;

  const observerGeodetic = {
    longitude: obs.lon * DEG,
    latitude:  obs.lat * DEG,
    height:    0.001,  // km above sea level (nominal)
  };

  // Sun ECI position (for illumination check)
  const sunEci = _getSunEci(ts);

  const aboveHorizon = _state.satellites.aboveHorizon;
  const positions    = _state.satellites.positions;

  for (const [id, satrec] of _iterAllAbove()) {
    try {
      const posVel = satellite.propagate(satrec, now);
      if (!posVel.position) continue;

      const ecf       = satellite.eciToEcf(posVel.position, gm);
      const lookAngles = satellite.ecfToLookAngles(observerGeodetic, ecf);

      if (lookAngles.elevation < 0) continue;

      const height = Math.sqrt(
        posVel.position.x ** 2 +
        posVel.position.y ** 2 +
        posVel.position.z ** 2
      ) - R_EARTH_KM;

      const sunlit = _isSunlit(posVel.position, sunEci);

      const prev    = positions.get(id);
      const current = {
        alt:      lookAngles.elevation,
        az:       ((lookAngles.azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
        height,
        sunlit,
        eciPos:   posVel.position,
        propTime: ts,
        prevAlt:  prev ? prev.alt               : lookAngles.elevation,
        prevAz:   prev ? prev.az                : lookAngles.azimuth,
        prev2Alt: prev ? (prev.prevAlt ?? null)  : null,  // ~6s ago
        prev2Az:  prev ? (prev.prevAz  ?? null)  : null,
        prev3Alt: prev ? (prev.prev2Alt ?? null) : null,  // ~9s ago
        prev3Az:  prev ? (prev.prev2Az  ?? null) : null,
      };

      positions.set(id, current);
    } catch {}
  }

  // Propagate ISS trail
  _updateISSTrail(obs, observerGeodetic, gm, ts);

  _state.satellites.counts.aboveHorizon = aboveHorizon.size;
}

function* _iterAllAbove() {
  for (const id of _state.satellites.aboveHorizon) {
    const satrec = _satrecs.stations.get(id)
      || _satrecs.active.get(id)
      || (_state.layers.starlink ? _satrecs.starlink.get(id) : null);
    if (satrec) yield [id, satrec];
  }
}

// ─── Horizon Check ───────────────────────────────────────────────────────────

function _startHorizonLoop() {
  _runHorizonCheck();
  _horizonTimer = setInterval(_runHorizonCheck, HORIZON_INTERVAL_MS);
}

function _runHorizonCheck() {
  if (!_state) return;
  const ts  = _state.timestamp;
  const now = new Date(ts);
  const gm  = gmst(ts);
  const obs = _state.observer;

  const observerGeodetic = {
    longitude: obs.lon * DEG,
    latitude:  obs.lat * DEG,
    height:    0.001,
  };

  const aboveHorizon = new Set();

  // Stations + active: process synchronously (~10k, ~50ms)
  for (const map of [_satrecs.stations, _satrecs.active]) {
    for (const [id, satrec] of map) {
      if (_isAboveHorizon(satrec, now, gm, observerGeodetic)) {
        aboveHorizon.add(id);
      }
    }
  }

  // Starlink: if enabled and loaded, start chunked processing
  if (_state.layers.starlink && _satrecs.starlink.size > 0) {
    _horizonChunkIdx = 0;
    _runStarlinkHorizonChunk(aboveHorizon, [..._satrecs.starlink.entries()], now, gm, observerGeodetic);
  }

  _state.satellites.aboveHorizon = aboveHorizon;
}

function _runStarlinkHorizonChunk(set, entries, now, gm, obs) {
  const end = Math.min(_horizonChunkIdx + HORIZON_CHUNK, entries.length);
  for (let i = _horizonChunkIdx; i < end; i++) {
    const [id, satrec] = entries[i];
    if (_isAboveHorizon(satrec, now, gm, obs)) set.add(id);
  }
  _horizonChunkIdx = end;

  if (_horizonChunkIdx < entries.length) {
    setTimeout(() => _runStarlinkHorizonChunk(set, entries, now, gm, obs), 0);
  }
}

function _isAboveHorizon(satrec, now, gm, observerGeodetic) {
  try {
    const pv = satellite.propagate(satrec, now);
    if (!pv.position) return false;
    const ecf = satellite.eciToEcf(pv.position, gm);
    const la  = satellite.ecfToLookAngles(observerGeodetic, ecf);
    return la.elevation > 0;
  } catch {
    return false;
  }
}

// ─── ISS Special ─────────────────────────────────────────────────────────────

const ISS_ID = '25544';
const ISS_TRAIL_STEPS = 12;
const ISS_TRAIL_STEP_S = 10;

function _updateISSTrail(obs, observerGeodetic, gm, ts) {
  const satrec = _satrecs.stations.get(ISS_ID);
  if (!satrec) return;

  const trail      = [];
  const projection = [];

  for (let i = ISS_TRAIL_STEPS; i >= 1; i--) {
    const t   = new Date(ts - i * ISS_TRAIL_STEP_S * 1000);
    const pos = _propagateToAltAz(satrec, t, gmst(ts - i * ISS_TRAIL_STEP_S * 1000), observerGeodetic);
    if (pos) trail.push(pos);
  }

  for (let i = 1; i <= ISS_TRAIL_STEPS; i++) {
    const t   = new Date(ts + i * ISS_TRAIL_STEP_S * 1000);
    const pos = _propagateToAltAz(satrec, t, gmst(ts + i * ISS_TRAIL_STEP_S * 1000), observerGeodetic);
    if (pos) projection.push(pos);
  }

  _state.iss.trail      = trail;
  _state.iss.projection = projection;

  // Next-rise prediction (when ISS is below horizon)
  const issPos = _state.satellites.positions.get(ISS_ID);
  if (!issPos || issPos.alt <= 0) {
    _predictISSRise(satrec, ts, observerGeodetic);
  } else {
    _state.iss.nextRise = null;
  }
}

function _predictISSRise(satrec, ts, observerGeodetic) {
  const MAX_STEPS = 720;  // 2 hours in 10s steps
  for (let i = 1; i <= MAX_STEPS; i++) {
    const futureTs = ts + i * 10000;
    const t   = new Date(futureTs);
    const pos = _propagateToAltAz(satrec, t, gmst(futureTs), observerGeodetic);
    if (pos && pos.alt > 0) {
      _state.iss.nextRise = {
        azDeg: pos.az * 180 / Math.PI,
        etaMs: i * 10000,
      };
      return;
    }
  }
  _state.iss.nextRise = null;
}

function _propagateToAltAz(satrec, date, gm, observerGeodetic) {
  try {
    const pv = satellite.propagate(satrec, date);
    if (!pv.position) return null;
    const ecf = satellite.eciToEcf(pv.position, gm);
    const la  = satellite.ecfToLookAngles(observerGeodetic, ecf);
    return {
      alt: la.elevation,
      az:  ((la.azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
    };
  } catch {
    return null;
  }
}

// ─── Sun position & illumination ─────────────────────────────────────────────

function _getSunEci(ts) {
  // Use astronomy-engine to get sun position
  try {
    const date   = new Date(ts);
    const sunPos = Astronomy.SunPosition(date);
    // sunPos gives ecliptic coords; we need ECI (equatorial)
    const equ    = Astronomy.Ecliptic(Astronomy.GeoVector('Sun', date, false));
    // Simpler: use Astronomy.GeoVector for Sun in ECI-like coords
    const gv     = Astronomy.GeoVector('Sun', date, false);
    // GeoVector is in AU; convert to km
    const AU_KM  = 149597870.7;
    return { x: gv.x * AU_KM, y: gv.y * AU_KM, z: gv.z * AU_KM };
  } catch {
    return null;
  }
}

function _isSunlit(satEci, sunEci) {
  if (!sunEci) return true;  // assume sunlit if can't compute

  // Satellite is in Earth's shadow if:
  // 1. It is on the opposite side of Earth from the Sun
  // 2. Its angular distance from the shadow axis exceeds arcsin(R_earth / |satPos|)

  const satDist = Math.sqrt(satEci.x ** 2 + satEci.y ** 2 + satEci.z ** 2);
  const sunDist = Math.sqrt(sunEci.x ** 2 + sunEci.y ** 2 + sunEci.z ** 2);

  // Dot product (normalised)
  const dot = (satEci.x * sunEci.x + satEci.y * sunEci.y + satEci.z * sunEci.z)
    / (satDist * sunDist);

  if (dot > 0) return true;  // same hemisphere as Sun → sunlit

  // Check shadow cone
  const shadowAngle  = Math.asin(R_EARTH_KM / satDist);
  const angleFromAxis = Math.acos(Math.max(-1, Math.min(1, -dot)));  // angle from anti-sun direction

  return angleFromAxis > shadowAngle;
}

// ─── ISS crew (once per session) ─────────────────────────────────────────────

let _crewFetched = false;

export async function fetchISSCrew() {
  if (_crewFetched) return;
  _crewFetched = true;
  try {
    const res  = await fetch('https://corsproxy.io/?url=http://api.open-notify.org/astros.json');
    const data = await res.json();
    if (data.people) {
      const iss = data.people.filter(p => p.craft === 'ISS');
      _state.iss.crewCount = iss.length;
    }
  } catch {
    _state.iss.crewCount = null;
  }
}

export function getSatName(id) {
  return _names.get(id) || null;
}

export { ISS_ID };
