# Architecture

Vanilla JS, ES modules, no build step.

## Module Layout

```
index.html
css/style.css
js/
  app.js                    # Entry point, shared state, draw loop
  data/
    stars.js                # Loads stars.6.json + starnames.json (HIP names)
    constellations.js       # Loads constellations.lines.json + constellations.json
    satellites.js           # CelesTrak fetch, SGP4 propagation, horizon checks
    planets.js              # Planet/Moon position via astronomy-engine
    location.js             # Geolocation + fallback manual input
  render/
    canvas.js               # Canvas setup, render loop (setTimeout ~12.5fps)
    projection.js           # Alt/Az ↔ screen (stereographic zenithal)
    stars.js                # Star dots + constellation lines/names
    satellites.js           # Trails + dots for all sat types; ISS special render
    planets.js              # Planet and Moon dots
    horizon.js              # Sun-direction ambient glow (no ring, no compass)
  ui/
    hud.js                  # Top-left: location, time, sun, moon, satellite count
    loading.js              # Bottom bar: sequential satellite acquisition status
    callout.js              # On-canvas callout anchored to selected object
    viewport.js             # Zoom/pan/rotation, hit-testing, gestures
  utils/
    time.js                 # Sidereal time, Julian date, formatting
    colour.js               # B-V colour index → RGB
data/
  stars.6.json              # d3-celestial/Hipparcos, ~5,044 stars (static)
  starnames.json            # HIP → {name, desig, constellation} (static)
  constellations.lines.json
  constellations.json
proxy.js                    # Local dev Node CORS proxy for CelesTrak
worker/
  index.js                  # Cloudflare Worker with Cache API (2hr TTL)
  wrangler.toml
```

## Coordinate Pipeline

```
Stars (RA/Dec J2000)  → Hour Angle → Alt/Az → screen
Satellites (SGP4 ECI) → eciToEcf() → ecfToLookAngles() → screen
Planets (ecliptic)    → RA/Dec → Hour Angle → Alt/Az → screen
                              ↑
                    Observer (lat/lon) + Local Sidereal Time
```

## Projection (Stereographic Zenithal)

```
radius = Math.hypot(w/2, h/2)   // screen diagonal — horizon maps to corners
r = cos(alt) / (1 + sin(alt))
x = cx + (r · sin(az) · radius + panX) · zoom
y = cy - (r · cos(az) · radius + panY) · zoom
```

North up, east right. The canvas is full-bleed sky — no circle boundary is
visible. Objects near the horizon fade over the bottom 5° of altitude.
Pan is allowed at any zoom level; at zoom=1 it is clamped to ±55% of radius.

## Key Library Choices

- **satellite.js v6** — SGP4 propagation. Use `json2satrec()` with CelesTrak OMM/JSON, not TLE strings (avoids 5-digit NORAD limit mid-2026).
- **astronomy-engine** — planet/Moon positions, lunar phase, sun position for satellite illumination.
- **d3-celestial data files** — star catalogue (`stars.6.json`), constellation geometry, star names (`starnames.json`). All static assets.

## Data Sources and Refresh Cadence

| Data | Source | TTL |
|---|---|---|
| Stars, constellations, star names | Static `/data/` JSON | Permanent |
| CelesTrak OMM | `/api/celestrak/*` → Worker → celestrak.org | 2 hrs (Worker Cache API + localStorage) |
| Planet/Moon | Computed client-side (astronomy-engine) | Every 60s |
| SGP4 positions (above-horizon sats) | In-memory | Every 3s |
| Full horizon check | In-memory, chunked for Starlink | Every 30s + on data load |

Worker cache is shared across all browser clients — CelesTrak sees ≤1 request per group per 2-hour window.

## Satellite Groups

All groups load on startup. Starlink loads sequentially *after* stations + active.

| Group | NORAD ID | Default | Notes |
|---|---|---|---|
| Space stations (ISS) | 25544 | On | Special rendering |
| Active satellites | various | On | Loads in parallel with stations |
| Starlink (~7,000+) | various | On | Loads after stations+active resolve |

`initSatellites(state)` returns `Promise.all([stations, active])`. The caller
chains `.then(() => enableStarlink())` to sequence the load. This creates the
intentional UX reveal: regular sats appear first, then Starlink floods in.

After each group finishes parsing, `_runHorizonCheck()` is called immediately
so sats appear within the next propagation cycle (≤3s) rather than waiting up
to 30s for the scheduled check.

## Satellite Trails

All non-ISS satellites have a ~10-second fading trail, rendered in three batched
passes per type (regular cyan / Starlink warm-white):

- **Pass A** — `prev3Alt/prev3Az` → current (faint). Covers ~9s of history.
- **Pass B** — `prev2Alt/prev2Az` → current (medium). Overlaps the recent ~6s.
- **Pass C** — `prevAlt/prevAz` → current (bright). Overlaps the recent ~3s.

The successive overlaps stack opacity: tail (A only) = very faint; mid (A+B) =
medium; head (A+B+C) = clearly visible. Head opacity ≈ 0.49 for regular sats,
≈ 0.36 for Starlink. No per-sat gradient creation — each type = 3 `stroke()` calls.

Position history is shifted forward each propagation cycle (every 3s):
`prev` → `prev2` → `prev3`. ISS has its own longer trail system (12 × 10s).

## Loading Bar

A slim bar at viewport bottom shows satellite acquisition in three phases:
1. **Acquiring** — stations + active loading (cyan pulse dot)
2. **Starlink incoming** — base sats visible, Starlink now fetching (warm pulse dot)
3. **All loaded** — counts shown, bar fades out after 3 seconds

`state.satellites.loading.starlink` initialises to `true` (not `false`) so the
bar correctly shows phase 2 while waiting for Starlink, rather than jumping to
phase 3 immediately.

## Compass Rose

`js/ui/compass.js` — fixed 52×52px circle, lower-right corner, above the scrubber slot.
The inner ring rotates via `transform: rotate(Xrad)` updated every 80ms from
`state.viewport.rotation`. N/E/S/W letters are positioned at the cardinal points;
N is always visually brightest. Dims to 0.35 opacity when north is up (default);
transitions to full opacity when the view is rotated more than ~5°.

## Colour Key

Static HTML strip (`#colour-key`) centred at the bottom, left of the compass.
Six items — Stars, Planets, Moon, ISS, Satellites, Starlink — each with a 5px
dot in the exact colour used to render that object. No JS required. Positioned
at `bottom: 66px`, above the loading bar zone. `right: 80px` keeps it clear of
the compass on all screen sizes; `flex-wrap` handles narrow viewports.

## ISS Special Rendering

Gold dot (5px), always-visible "ISS" label, 2-min solid historical trail +
2-min dashed projected trail (10s intervals), next-rise azimuth indicator at
the screen edge when ISS is below the horizon.

## Callout System

Tap/click any object (stars, planets, moon, satellites, Starlink) → on-canvas
pulsing ring + floating info panel anchored to it, tracks as object moves. One
active at a time. Auto-dismisses 3s after tracked object sets below horizon.
Dismisses on Escape, ✕, or tap on empty sky. Hit-test tolerances are generous
(14–22px radius) to compensate for small rendered sizes.

## Star Names

`starnames.json` (d3-celestial, keyed by Hipparcos number) is loaded alongside
`stars.6.json`. Each star record carries `name` (e.g. "Sirius") and `desig`
(e.g. "α CMa"). Stars with mag < 4.5 (~450 stars) are registered for
hit-testing. The callout shows proper name > Bayer designation > generic "Star".

## v1 Scope

Time scrubber is **v2 only**. The `#scrubber-slot` div (30px, bottom of viewport)
is reserved. All time-dependent code accepts `state.timestamp` rather than
`Date.now()` directly, so v2 can substitute an arbitrary time without refactoring.
