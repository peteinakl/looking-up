# Architecture

Vanilla JS, ES modules, no build step.

## Module Layout

```
index.html
css/style.css
js/
  app.js                    # Entry point, initialises all modules
  data/
    stars.js                # Loads stars.6.json
    constellations.js       # Loads constellations.lines.json + constellations.json
    satellites.js           # TLE fetcher + SGP4 propagation manager
    planets.js              # Planet/Moon position computation
    location.js             # Geolocation handler + fallback input
  render/
    canvas.js               # Canvas setup, render loop (setTimeout 10-15fps), draw primitives
    projection.js           # Alt/Az ↔ screen (stereographic)
    stars.js
    satellites.js           # General + ISS + Starlink
    planets.js
    horizon.js              # Horizon circle, compass labels, glow
  ui/
    hud.js                  # Top-left info panel
    toggles.js              # Top-right layer toggles
    callout.js              # On-canvas callout anchored to selected object
    viewport.js             # Zoom/pan/rotation, hit-testing, gestures
  utils/
    time.js                 # Sidereal time, Julian date, formatting
    colour.js               # B-V index → RGB
data/
  stars.6.json              # d3-celestial/Hipparcos, ~4,500 stars (static)
  constellations.lines.json
  constellations.json
  planets.json              # Keplerian elements (if not using astronomy-engine)
proxy.js                    # Local dev Node proxy
worker/
  index.js                  # Cloudflare Worker
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
r = cos(alt) / (1 + sin(alt))
x = centre_x + r · sin(az) · radius
y = centre_y - r · cos(az) · radius   // north-up: az=0 → top
```

North up, east right. Mirrored from a ground map.

## Key Library Choices

- **satellite.js v6** — SGP4 propagation. Use `json2satrec()` with CelesTrak OMM/JSON, not TLE strings (avoids 5-digit NORAD limit mid-2026).
- **astronomy-engine** — planet/Moon positions, lunar phase, sun position for satellite illumination. Preferred over manual Keplerian implementation.
- **d3-celestial data files** — star catalogue, constellation lines/names (static assets, never fetched at runtime).

## Data Sources and Refresh Cadence

| Data | Source | TTL |
|---|---|---|
| Stars, constellations | Static `/data/` JSON | Permanent |
| CelesTrak TLEs | `/api/celestrak/*` → Worker → celestrak.org | 2 hrs (Worker cache + localStorage) |
| Planet/Moon | Computed client-side | Every 60s |
| SGP4 positions (above-horizon) | In-memory | Every 3s |
| Full horizon check | In-memory, chunked 2,000/frame | Every 30s |

Worker cache is shared across all browser clients — CelesTrak sees ≤1 request per group per 2-hour window.

## Satellite Groups

| Group | `GROUP=` param | Default |
|---|---|---|
| Space stations (ISS = NORAD 25544) | `stations` | On |
| Active | `active` | On |
| Starlink (~7,000+) | `starlink` | **Off** |

## Performance Budget

- Frame render: ~2ms. Frame interval: 66-100ms (`setTimeout`, not `rAF`).
- SGP4 propagation: ~5-15ms every 3s for 300-500 above-horizon satellites.
- Horizon check with Starlink: chunk at 2,000 satellites/frame to avoid >30ms blocks.
- Tab hidden (`document.hidden`) → pause all computation.

## ISS Special Rendering

Gold dot (~5px), always-visible "ISS" label, 2-min historical trail + 2-min projected trail (10s intervals), next-rise azimuth indicator at horizon edge when below horizon.

## Callout System

Tap/click any object → on-canvas callout anchored to it, tracks as object moves. One active at a time. Auto-dismisses 3s after tracked object sets. Dismisses on Escape, ✕, or tap on empty sky.

## v1 Scope

Time scrubber is **v2 only**. Reserve 40px at viewport bottom. Design the time pipeline to accept an arbitrary timestamp instead of `Date.now()` so v2 can slot the scrubber in.
