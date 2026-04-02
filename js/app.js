import { getLocation } from './data/location.js';
import { loadStars } from './data/stars.js';
import { loadConstellations } from './data/constellations.js';
import { initSatellites, enableStarlink } from './data/satellites.js';
import { initPlanets } from './data/planets.js';
import { initCanvas, startRenderLoop } from './render/canvas.js';
import { drawStars, drawConstellationLines, drawConstellationNames } from './render/stars.js';
import { drawHorizon } from './render/horizon.js';
import { drawSatellites } from './render/satellites.js';
import { drawPlanets } from './render/planets.js';
import { initViewport } from './ui/viewport.js';
import { initHud } from './ui/hud.js';
import { initCallout, drawCallout } from './ui/callout.js';
import { initLoadingBar } from './ui/loading.js';
import { initCompass } from './ui/compass.js';

// ─── Shared State ────────────────────────────────────────────────────────────
// Single mutable object passed by reference to all modules.
// All time-dependent code uses state.timestamp — never Date.now() directly,
// so the v2 time scrubber can substitute an arbitrary timestamp.
export const state = {
  observer: { lat: -36.85, lon: 174.76, displayName: 'Auckland, NZ' },
  timestamp: Date.now(),

  layers: {
    stars:           true,
    constellations:  true,
    satellites:      true,
    iss:             true,
    planets:         true,
    starlink:        true,
    grid:            false,
    visibleOnly:     false,
    starsAlpha:      0,       // fades 0→1 on first load
    starlinkFadeIn:  1,       // no delay — Starlink always on, natural load time is enough
  },

  viewport: {
    cx: 0, cy: 0, radius: 0,
    zoom: 1.0,   // radius = screen diagonal, so zoom=1 already fills the canvas
    panX: 0, panY: 0,
    rotation: 0,
  },

  // Populated each frame by render modules for hit-testing
  renderedObjects: [],

  selectedObject: null,  // { type, id, screenX, screenY, data }

  // Satellite state managed by data/satellites.js
  satellites: {
    stations:    [],  // SatRec[]
    active:      [],  // SatRec[]
    starlink:    [],  // SatRec[]
    starlinkIds: new Set(),   // noradId strings — for fast group membership check
    stationIds:  new Set(),   // noradId strings
    positions:   new Map(),   // noradId → { alt, az, lat, lon, height, sunlit, prevPos, nextPos, lastPropTime }
    aboveHorizon: new Set(),  // noradId
    counts: { stations: 0, active: 0, starlink: 0, aboveHorizon: 0 },
    loading: { stations: true, active: true, starlink: true },
    error: null,
  },

  iss: {
    trail:      [],   // [{alt, az}] historical (12 × 10s)
    projection: [],   // [{alt, az}] future (12 × 10s)
    nextRise:   null, // { azDeg, etaMs } or null if above horizon
    crewCount:  null,
  },

  // Planet/Moon state managed by data/planets.js
  planets: {
    bodies: [],  // [{ name, alt, az, data }]
    sunAlt: 0,
    sunAz:  0,
    moon:   null,  // { alt, az, phase, illumination, phaseName }
  },

  constellations: { lines: null, names: null },
  stars: null,  // GeoJSON FeatureCollection
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const canvas = document.getElementById('sky');
  initCanvas(canvas, state);

  // Start location lookup immediately
  const locationPromise = getLocation(state);

  // Load static data in parallel
  const [stars, constellations] = await Promise.all([
    loadStars(),
    loadConstellations(),
  ]);
  state.stars = stars;
  state.constellations = constellations;
  state.layers.starsAlpha = 0;  // will fade in on first frame

  // Wait for location before rendering accurately
  await locationPromise;

  // Init planets (sync, uses astronomy-engine)
  initPlanets(state);

  // Init satellite data pipeline: stations + active first, then Starlink
  initSatellites(state).then(() => enableStarlink());

  // Init UI
  initViewport(canvas, state);
  initHud(state);
  initCallout(canvas, state);
  initLoadingBar(state);
  initCompass(state);

  // Start render loop
  startRenderLoop(state, draw);
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
function draw(ctx, state) {
  const { width, height } = ctx.canvas;
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);

  // Reset hit-test list each frame
  state.renderedObjects = [];

  // Layer draw order: horizon → stars → constellations → planets → satellites → callout
  drawHorizon(ctx, state);

  if (state.layers.stars && state.stars) {
    ctx.globalAlpha = Math.min(state.layers.starsAlpha, 1);
    drawStars(ctx, state.stars, state);
    ctx.globalAlpha = 1;
  }

  if (state.layers.constellations && state.constellations.lines) {
    ctx.globalAlpha = Math.min(state.layers.starsAlpha * 0.8, 1);
    drawConstellationLines(ctx, state.constellations, state);
    drawConstellationNames(ctx, state.constellations, state);
    ctx.globalAlpha = 1;
  }

  if (state.layers.planets) {
    drawPlanets(ctx, state);
  }

  if (state.layers.satellites || state.layers.iss || state.layers.starlink) {
    drawSatellites(ctx, state);
  }

  drawCallout(ctx, state);

  // Advance fade-in: at 12.5fps, each frame is 80ms → 1s = ~12.5 frames → step = 1/12.5 ≈ 0.08
  if (state.layers.starsAlpha < 1) {
    state.layers.starsAlpha = Math.min(1, state.layers.starsAlpha + 0.08);
  }
}

init().catch(console.error);
