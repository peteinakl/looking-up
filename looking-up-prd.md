# Looking Up — Real-Time Zenithal Sky Viewer

## Product Requirements Document

**Version:** 1.1
**Date:** 2 April 2026
**Status:** Draft

---

## 1. Purpose

A fullscreen web application called **Looking Up** that shows the sky directly above the user in real time. Stars, satellites, the ISS, Starlink constellations, planets, and the Moon are rendered on a dark canvas from the user's actual geographic position. Everything moves at its true angular rate — satellites drift visibly across the sky, the star field rotates with the Earth, planets shift over hours.

The name works on two levels — it's what you're doing (looking at the sky above you), and it's the optimistic version of what people say when things are going well.

The goal is not another satellite tracker. It is an experience that helps people realise how much is above them — especially the sheer density of Starlink — even if they cannot see most of it with the naked eye. The Starlink layer defaults to off; toggling it on is the reveal.

## 2. Design Principles

- **Zenithal perspective.** The screen represents the sky dome as seen lying on your back. Zenith is at the centre. The horizon is at the edge. North is at the top, south at the bottom, east at the right, west at the left. This is astronomically correct for a sky view (mirrored from a ground map).
- **Dark-first.** Pure black background. All objects rendered as light points or faint lines. No chrome, no panels, no visual clutter by default. The UI recedes; the sky is the interface.
- **Accurate, not decorative.** Every object is positioned using proper astronomical or orbital mechanics. Star positions use standard epoch J2000 coordinates transformed to local alt/az. Satellite positions use SGP4 propagation from current TLE/OMM data. Planet positions use Keplerian elements. Nothing is approximate or illustrative.
- **Unhurried animation.** The sky moves slowly and the render loop reflects that. No 60fps overhead. Objects animate at their true angular velocity, which for LEO satellites is roughly 2-3 pixels per second on a 1080p display. The frame rate is set to match this cadence, not a gaming refresh rate.
- **Progressive reveal.** Stars appear immediately (static data, baked in). Satellites populate as TLE data loads and positions are computed. Each layer fades in rather than popping. The experience unfolds.
- **Zero ongoing cost.** All data sources are free. No paid APIs. No backend database. The only infrastructure is static hosting and a thin edge proxy for CORS.

## 3. Technical Stack

| Component | Choice | Rationale |
|---|---|---|
| **Renderer** | HTML5 Canvas 2D | Drawing dots and lines on a black circle. Canvas 2D is more than sufficient at 10-15fps and avoids WebGL complexity. Can upgrade to WebGL later for glow/bloom effects if desired. |
| **Orbital propagation** | satellite.js (v6+) | Mature JavaScript port of SGP4/SDP4. Runs entirely client-side. Supports both TLE and OMM/JSON input via `twoline2satrec` and `json2satrec`. Includes coordinate transforms and look-angle computation. Available on CDN. |
| **Star data** | d3-celestial star catalogue (stars.6.json) | GeoJSON format, Hipparcos catalogue, ~4,500 stars to magnitude 6. Includes b-v colour index for spectral colouring. Well-structured, freely licensed, battle-tested. Baked into the app as a static asset (~300KB). |
| **Constellation lines** | d3-celestial constellations.lines.json | GeoJSON MultiLineString features for all 88 IAU constellations. Pairs with the star data. ~15KB. |
| **Constellation names** | d3-celestial constellations.json | GeoJSON points with IAU names in multiple languages. ~8KB. |
| **Planet positions** | d3-celestial planets.json (Keplerian elements) + custom computation | Keplerian orbital elements for the major planets, computed to alt/az at render time. Moon position via standard lunar algorithm (Meeus). Alternatively, a lightweight JS astronomy library such as `astronomy-engine` (public domain, zero dependencies). |
| **TLE/OMM data source** | CelesTrak GP API | Free, no authentication. Provides OMM data in JSON format for all tracked objects. Grouped queries available (e.g., `GROUP=starlink`, `GROUP=active`, `GROUP=stations`). CORS disabled — requires proxy. |
| **API proxy** | Cloudflare Worker (production) / Node proxy (local dev) | Proxies CelesTrak requests, adds CORS headers, caches responses. Same pattern as ak-live. No API keys needed for CelesTrak, but the proxy handles CORS and rate-limit-respectful caching. |
| **Framework** | Vanilla JS, ES modules, no build step | Consistent with ak-live. Single HTML entry point. Modules for each concern (projection, propagation, rendering, UI). |
| **Hosting** | Cloudflare Pages + Workers | Free tier. Static site on Pages, Worker for CelesTrak proxy. Same deployment pattern as ak-live. |

## 4. Data Sources

### 4.1 Stars — Static Catalogue

**Source:** d3-celestial / Hipparcos catalogue
**Files:** `stars.6.json` (stars to mag 6.0), `starnames.json` (proper names)
**Format:** GeoJSON FeatureCollection. Each feature has coordinates (RA converted to longitude, Dec as latitude) and properties including magnitude (`mag`) and colour index (`bv`).
**Size:** ~300KB for mag 6 limit (approximately 4,500 stars — all naked-eye visible stars)
**Update cadence:** Never. Baked into the app as a static asset.
**Licence:** Public domain (original Hipparcos data is ESA, freely redistributable; d3-celestial data files are BSD-3-Clause)

**Usage notes:**
- Coordinates are J2000 epoch. For a sky viewer, precession correction from J2000 to current date is ~0.4° over 25 years — less than a pixel at typical viewport resolution. Can be ignored for v1.
- The b-v colour index maps to star colour: negative values are blue-white, 0.0 is white, 0.6 is yellow, 1.5 is orange-red. This provides authentic colouring at negligible cost.
- The d3-celestial coordinate convention converts RA (0-24h) to longitude (-180° to +180°). This must be accounted for in the RA/Dec to alt/az transform.

### 4.2 Constellations — Static Data

**Source:** d3-celestial
**Files:** `constellations.lines.json` (stick figures), `constellations.json` (names and positions)
**Format:** GeoJSON. Lines are MultiLineString features; names are Point features.
**Size:** ~25KB combined
**Update cadence:** Never. Static asset.
**Licence:** BSD-3-Clause (d3-celestial), original data from IAU

### 4.3 Satellites — CelesTrak GP Data

**Source:** CelesTrak GP API
**Endpoint:** `https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=json`
**Auth:** None required
**CORS:** Disabled — must proxy
**Format:** JSON array of OMM records. Each record contains the full set of mean orbital elements needed for SGP4 propagation.
**Update cadence:** CelesTrak checks for new data every 2 hours. The app should fetch no more than once per 2 hours per group. Cache aggressively.

**Satellite groups to fetch:**

| Group | CelesTrak GROUP param | Approx. count | Default visibility |
|---|---|---|---|
| Space stations | `stations` | ~10 | On |
| Bright/active satellites | `active` | ~10,000 | On (filtered to visible) |
| Starlink | `starlink` | ~7,000+ | **Off** |

**Usage notes:**
- The `active` group is large (~10,000 satellites). Not all are above the observer's horizon at any time. Typically 200-500 will be visible from any location. Pre-filter by computing alt/az and discarding objects below 0° altitude before rendering.
- The `starlink` group is similarly large. When enabled, it should be visually distinct from other satellites and the density itself is the point.
- satellite.js v6 supports OMM/JSON directly via `json2satrec()`, so no TLE string parsing is needed. This also avoids the 5-digit catalogue number limitation approaching in mid-2026.
- ISS is NORAD ID 25544, present in the `stations` group. It receives special rendering treatment (see section 6.3).

**CelesTrak rate limits and etiquette:**
- Do not fetch the same group more than once per 2 hours.
- The proxy must cache responses and serve from cache for all subsequent requests within the window.
- If the IP is blocked (HTTP 403), CelesTrak provides a message explaining why. The proxy should detect this and back off.
- CelesTrak is a 501(c)(3) non-profit. Be respectful of their resources.

### 4.4 Planets and Moon

**Source:** Keplerian orbital elements (NASA JPL approximate positions) or `astronomy-engine` library
**Format:** Computed client-side from orbital elements and current time
**Data required:** Orbital elements for Mercury, Venus, Mars, Jupiter, Saturn (naked-eye planets), plus Sun and Moon
**Update cadence:** Recompute every 60 seconds (planets move <0.01° per minute)

**Approach options (choose one during implementation):**
- **Option A:** Use d3-celestial's `planets.json` (Keplerian elements from JPL) and implement the position computation manually. More work, fewer dependencies.
- **Option B:** Use `astronomy-engine` (github.com/cosinekitty/astronomy, public domain). A comprehensive, zero-dependency JS library that computes positions for all solar system bodies, rise/set times, lunar phase, etc. ~150KB minified. This is the recommended approach as it handles the Moon (which is not well-modelled by simple Keplerian elements) and provides sun position for satellite illumination calculations.

### 4.5 Geolocation

**Source:** Browser Geolocation API (`navigator.geolocation`)
**Accuracy needed:** City-level (~1km) is sufficient. The sky doesn't change perceptibly within a few kilometres.
**Fallback:** If geolocation is denied, prompt the user to enter a city or lat/lon manually. Default to a sensible location (Auckland: -36.85, 174.76) with a notice.
**Privacy:** Position is used client-side only. Never transmitted to any server. No analytics, no tracking.

## 5. Coordinate Transforms and Projection

This is the mathematical core of the application. All objects must be converted from their native coordinate system to screen pixels.

### 5.1 Coordinate Pipeline

```
Stars (RA/Dec J2000)  ──→  Hour Angle / Dec  ──→  Alt/Az  ──→  Screen (x, y)
                              ↑
Satellites (ECI via SGP4) → ECF → Look angles (Alt/Az) ──→  Screen (x, y)
                              ↑
Planets (ecliptic coords) → RA/Dec → Hour Angle / Dec → Alt/Az → Screen (x, y)
                              ↑
                      Observer position (lat, lon)
                      Local Sidereal Time (from UTC + lon)
```

### 5.2 Key Transforms

**Local Sidereal Time (LST):** Computed from current UTC and observer's longitude. This rotates the celestial sphere to the observer's local sky. Standard formula from Meeus or any astronomy reference.

**RA/Dec to Alt/Az:** Standard spherical astronomy. Given a star's RA and Dec, the observer's latitude, and the current LST:
- Hour Angle = LST - RA
- Alt = arcsin(sin(Dec)·sin(Lat) + cos(Dec)·cos(Lat)·cos(HA))
- Az = arctan2(-sin(HA)·cos(Dec), cos(Lat)·sin(Dec) - sin(Lat)·cos(Dec)·cos(HA))

**Satellite ECI to Look Angles:** satellite.js provides `ecfToLookAngles(observerGeodetic, satelliteEcf)` which returns azimuth, elevation, and range. The ECI-to-ECF conversion is also provided by the library. This is the standard pipeline: `sgp4()` → `eciToEcf()` → `ecfToLookAngles()`.

### 5.3 Sky Projection (Alt/Az to Screen)

The viewport represents the sky dome projected onto a flat surface. The projection maps altitude (0° horizon to 90° zenith) and azimuth (0° N, 90° E, 180° S, 270° W) to (x, y) screen coordinates.

**Projection: Stereographic (zenithal)**

A stereographic projection from the zenith preserves angles (it is conformal) and maps the hemisphere to a disc. It is the standard projection for planisphere-style sky charts.

```
r = cos(alt) / (1 + sin(alt))    // radial distance from centre (0 at zenith, 1 at horizon)
x = centre_x + r · sin(az) · radius
y = centre_y - r · cos(az) · radius    // negative because north is up (az=0)
```

Where `radius` is the pixel radius of the sky dome on screen, and `centre_x`, `centre_y` are the centre of the viewport.

**Viewport geometry:**
- The sky dome is rendered as a circle. On desktop, it is inscribed in the viewport (diameter = min(width, height)). On mobile in portrait, the circle may extend slightly beyond the left/right edges so the vertical extent fills the screen, reducing dead space.
- Objects below 0° altitude are not rendered (below the horizon).
- A subtle fade at the horizon edge (last 5° of altitude) prevents hard clipping.

### 5.4 Orientation

- **North** (az = 0°) points toward the **top** of the screen
- **East** (az = 90°) points toward the **right** of the screen
- **South** (az = 180°) toward the **bottom**
- **West** (az = 270°) toward the **left**

This is the correct orientation for a zenithal sky view (as if looking up). It is mirrored left-right compared to a ground map — east appears on the right when looking up, whereas it appears on the left on a north-up ground map.

## 6. Rendering

### 6.1 Stars

- Rendered as filled circles on the canvas.
- **Size:** Mapped from apparent magnitude using an inverse logarithmic scale. Mag -1 (Sirius) → ~4px radius. Mag 6 → ~0.5px radius. The exact mapping should be tuned visually.
- **Colour:** Derived from the b-v colour index in the star data. A simple mapping: bv < 0 → blue-white (#A0C0FF), bv 0.0 → white (#FFFFFF), bv 0.6 → yellow-white (#FFF4E0), bv 1.0 → orange (#FFCC80), bv 1.5+ → red-orange (#FF8866). Interpolated linearly between these anchors.
- **Constellation lines:** Rendered as thin lines (1px, ~15% opacity white) connecting the appropriate stars. Drawn behind the star dots.
- **Constellation names:** Rendered as small text labels near the constellation centroid. Very low opacity (~20%). Uppercase. Hidden when zoomed out to avoid clutter; shown when the constellation fits within the viewport at a readable scale. Toggle-able.
- **Update cadence:** The entire star field is recomputed (RA/Dec → alt/az → screen) every 30 seconds. Between recomputations, the field is rotated by applying a single LST-delta rotation. This is computationally trivial — one angle computation applied to the whole layer.

### 6.2 Satellites (General)

- Rendered as small filled circles, uniform size (~2px radius), in a single colour distinct from stars (e.g., a muted cyan #66CCCC or green #88CC88).
- Only satellites above the horizon (alt > 0°) are rendered.
- **Sunlit indicator:** Satellites in Earth's shadow are rendered dimmer (50% opacity) or in a darker shade. Sunlit satellites are full brightness. The illumination state is computed using the sun's position relative to the satellite — satellite.js v6 includes a `sunPos()` function, and the shadow calculation is a standard geometric test (satellite altitude vs Earth's shadow cone at that distance).
- **Visibility filter toggle:** "Visible now" mode shows only satellites that are both above the horizon AND sunlit AND the observer is in darkness/twilight (sun altitude < -6°). This filters to what you could actually see if you went outside.
- **SGP4 propagation cadence:** Compute true positions every 3 seconds for all above-horizon satellites. Between computations, linearly interpolate positions for render frames. At ~2.8 px/s angular velocity, linear interpolation over 3 seconds introduces sub-pixel error.
- **Rise/set handling:** Every 30 seconds, recompute the full set of above-horizon satellites from the complete TLE catalogue. Satellites newly risen fade in over 1 second. Satellites that have set fade out over 1 second.
- **On click/tap:** Show an on-canvas callout anchored to the object (see section 6.7 Callouts).

### 6.3 ISS — Special Treatment

The ISS (NORAD 25544) is the most recognisable satellite and deserves distinct rendering:

- **Icon:** Larger dot (~5px radius) in a distinctive colour (gold/amber #FFD700).
- **Label:** Always visible when above the horizon: "ISS" in small text adjacent to the dot.
- **Trail:** A faint line showing the ISS path over the preceding 2 minutes (computed from SGP4 at 10-second intervals into the past) and a dotted line showing the projected path for the next 2 minutes.
- **Brightness:** The ISS reaches magnitude -4 or brighter when sunlit. It should be one of the most prominent objects on screen when visible.
- **Rise/set prediction:** When the ISS is below the horizon, a small indicator at the edge of the sky dome shows the azimuth where it will next rise, with a countdown timer. This is computed by propagating forward in 10-second steps until alt > 0°.

### 6.4 Starlink — The Density Layer

Starlink satellites are rendered distinctly from other satellites to support the "reveal" moment when the user toggles the layer on:

- **Colour:** A distinct hue from general satellites — e.g., a warm orange-white (#FFE0B0) that contrasts with the cooler cyan of other satellites.
- **Default state:** Off. The toggle label should hint at what's there: "Starlink (7,200+)" with the current count.
- **Animation on toggle:** When Starlink is switched on, the dots fade in over 2 seconds rather than appearing instantly. This makes the density increase feel like a reveal rather than a glitch.
- **Counter:** When Starlink is visible, a counter in the UI shows "X Starlink satellites above you right now" with the live count of those above the horizon.
- **Recently launched trains:** Starlink satellites launched within the past few days travel in a visible "train" formation. These will naturally appear as closely-spaced dots moving in a line because their TLEs produce similar orbital positions. No special rendering logic is needed — the data creates the effect.

### 6.5 Planets and Moon

- **Planets:** Rendered as filled circles slightly larger than the brightest stars (~4-5px radius), each in a characteristic colour: Mercury (grey #CCCCCC), Venus (bright white-yellow #FFFDE0), Mars (red-orange #FF6644), Jupiter (cream #FFF0D0), Saturn (pale gold #FFE8A0). Labelled with the planet name, always visible.
- **Moon:** Rendered as a larger circle (~8-12px radius depending on zoom) with a rough phase indicator (filled portion corresponding to current illumination fraction). Labelled "Moon" with phase name (e.g., "Waxing Gibbous, 73%"). The Moon's apparent diameter is ~0.5° — at typical viewport sizes this is a few pixels, so phase rendering is symbolic rather than geometrically accurate.
- **Sun position (below horizon):** When the sun is below the horizon, its azimuth is indicated by a faint warm glow at the corresponding edge of the sky dome. This provides orientation and indicates twilight direction. The sun is never rendered as a dot (the viewer is for night sky).
- **Update cadence:** Recompute every 60 seconds. Planets move imperceptibly between updates.

### 6.6 Horizon and Orientation

- **Horizon circle:** A subtle ring at the edge of the sky dome, rendered as a 1px line at ~30% opacity. This defines the boundary of the visible sky.
- **Compass labels:** N, E, S, W positioned just outside the horizon circle at the four cardinal points. Small text, low opacity.
- **Horizon glow:** A very subtle radial gradient from the edge of the sky dome inward, simulating ambient light pollution. Fades from ~5% opacity warm white at the horizon to transparent by about 10° altitude. This is cosmetic — it makes the edge feel like a horizon rather than a hard cutoff.
- **Altitude reference (optional toggle):** Concentric circles at 30° and 60° altitude, rendered as very faint dashed lines. Off by default.

### 6.7 Callouts — On-Canvas Object Inspection

When the user clicks or taps any celestial object, an on-canvas callout appears anchored to that object. This follows the ak-live pattern of tracking a selected vehicle — the callout moves with the object as it drifts across the sky.

**Visual design:**
- A thin leader line connects the object to a floating label panel, offset above and to the right (or repositioned to stay within the viewport).
- The label panel uses the frosted-glass style (backdrop-filter blur, semi-transparent dark background, subtle border) consistent with the UI panels.
- The selected object gets a subtle pulsing ring around it (two concentric rings, staggered animation) to indicate lock-on, similar to ak-live's vehicle follow mode.

**Callout content by object type:**

- **Star:** Name (e.g., "Sirius"), constellation, Bayer/Flamsteed designation (e.g., "α CMa"), apparent magnitude, spectral class, colour description (e.g., "Blue-white"), distance in light-years where known.
- **Satellite:** Name, NORAD catalogue ID, altitude (km), speed (km/s), sunlit/shadow status, orbital inclination, object purpose/group where available (e.g., "Weather/Earth observation").
- **ISS:** As satellite, plus current crew count (fetched once per session from Open Notify), next visible pass time if currently below horizon.
- **Starlink satellite:** As satellite, with "Starlink" group label and launch date if identifiable from the designation.
- **Planet:** Name, current altitude and azimuth, distance from Earth (AU and km), apparent magnitude, phase angle (for inner planets), angular diameter.
- **Moon:** Phase name (e.g., "Waxing Gibbous"), illumination percentage, altitude, azimuth, rise/set times for today, distance (km), angular diameter.

**Behaviour:**
- Only one callout can be active at a time. Tapping a new object dismisses the previous callout and opens a new one.
- The callout tracks the object in real time — as a satellite moves across the sky, the callout follows it. Data in the callout updates live (altitude, speed, etc.).
- Tapping empty sky or pressing Escape dismisses the callout.
- On mobile, the callout panel repositions itself to avoid being clipped by the viewport edge. On very small screens, it may render as a compact bar at the bottom rather than a floating panel, but still with the leader line to the object.
- The callout includes a small ✕ dismiss button.
- If the tracked object sets below the horizon, the callout shows "Below horizon" and auto-dismisses after 3 seconds with a fade.

## 7. Render Loop and Performance

### 7.1 Frame Rate

**Target: 10-15 frames per second.**

Rationale: The fastest-moving objects (LEO satellites) traverse the sky at ~2.8 pixels per second on a 1080p display. At 10fps, each frame moves a satellite by ~0.28 pixels — sub-pixel rendering handles this smoothly via anti-aliasing. At 15fps, motion is imperceptibly smooth. 60fps provides no visual benefit and wastes CPU/battery.

The render loop uses `setTimeout` (not `requestAnimationFrame`) to enforce the target interval of 66-100ms. `requestAnimationFrame` targets 60fps by design and would waste cycles.

### 7.2 Computation Budget Per Frame

| Task | Cadence | Cost per cycle |
|---|---|---|
| Render all visible objects to canvas | Every frame (10-15fps) | ~2ms (drawing ~5,000 dots + lines) |
| Interpolate satellite positions | Every frame | ~0.5ms (linear lerp for ~300-500 objects) |
| SGP4 propagation (above-horizon satellites) | Every 3 seconds | ~5-15ms (300-500 propagations × 10-30µs each) |
| Full horizon check (all satellites) | Every 30 seconds | ~50-150ms (7,000-17,000 propagations, can be chunked across frames) |
| Star field recomputation | Every 30 seconds | ~5ms (4,500 coordinate transforms) |
| Planet/Moon positions | Every 60 seconds | <1ms |

**Chunked computation for large catalogues:** When Starlink is enabled, the full horizon check involves ~17,000 satellites. Rather than computing all positions in one blocking call, spread the work across multiple frames: process 2,000 satellites per frame over ~9 frames. This prevents any single frame from exceeding 30ms.

### 7.3 Battery and Background Behaviour

- When the browser tab is not visible (`document.hidden === true`), pause all computation and rendering. Resume immediately when the tab becomes visible, with a fresh data check.
- On mobile, consider reducing the render rate to 8fps if `navigator.getBattery()` reports battery saver mode.
- No wake locks. The app does not prevent the screen from sleeping.

## 8. User Interface

### 8.1 Layout

The UI is minimal. The sky fills the entire viewport. Controls overlay the sky and are translucent.

```
┌──────────────────────────────────────────────────────────────────┐
│ (N)                                                              │
│                                                                  │
│   ┌─ Info HUD (top-left) ──────────┐    ┌─ Layer toggles ─────┐ │
│   │ Location: Auckland, NZ         │    │ ☑ Stars             │ │
│   │ 21:34 NZST · 09:34 UTC        │    │ ☑ Constellations    │ │
│   │ Facing: Zenith                 │    │ ☑ Satellites (312)  │ │
│   └────────────────────────────────┘    │ ☑ ISS              │ │
│                                         │ ☑ Planets           │ │
│(W)              ·  ·                    │ ☐ Starlink (7,213)  │(E)
│              · ·  ★   ·                │ ─────────────────── │ │
│            ·    ·ISS·    ·             │ ☐ Grid lines        │ │
│              · ·    · ·                │ ☑ Visible only      │ │
│                  ·  ·                   └───────────────────-─┘ │
│              ·    ·                                              │
│                ♃ Jupiter                                         │
│                       ╭───────────────────────────╮              │
│              ·  ◎────│ NOAA-20 · Alt: 834km      │              │
│                       │ Speed: 7.4 km/s · Sunlit  │              │
│                       │ NORAD 43013            ✕  │              │
│                       ╰───────────────────────────╯              │
│ (S)                                                              │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 Info HUD (Top Left)

A small translucent panel showing:
- Observer location (city name via reverse geocoding, or lat/lon if unavailable)
- Current local time and UTC
- Sun altitude (e.g., "Sun: -12° (astronomical twilight)")
- Moon phase and altitude if above horizon

Uses a frosted-glass aesthetic consistent with ak-live's UI style (backdrop-filter, subtle border, low-opacity background).

### 8.3 Layer Toggles (Top Right)

Toggle switches for each data layer. Each shows an entity count in parentheses. Toggles are styled as minimal switches — not full checkboxes. The Starlink toggle is visually separated from the others (a divider line above it) to signal that it is different.

When a layer is loading for the first time, the toggle shows a subtle loading indicator (pulsing dot or spinner) instead of a count.

### 8.4 Object Callout

When the user clicks/taps any celestial object, an on-canvas callout appears anchored to the object and tracks it as it moves. This replaces a traditional detail panel — the information stays spatially connected to what you're inspecting. Full specification in section 6.7.

### 8.5 Zoom, Pan, and Rotation

The sky dome supports full spatial navigation. The user can explore any part of the visible hemisphere, but cannot navigate below the horizon — the view is constrained to the sky above.

**Zoom:**
- **Pinch-to-zoom** on mobile, **scroll wheel** on desktop.
- Zooming in narrows the field of view, revealing more space between objects. Star labels and fainter constellation names appear as the view tightens. Satellite dots become more distinguishable in dense regions.
- Minimum zoom: full sky dome visible (default view, hemisphere fills viewport). Maximum zoom: ~10° field of view (roughly binocular magnification).
- Zoom is centred on the cursor/pinch point, not the viewport centre. This lets the user zoom into a specific object or region directly.

**Pan:**
- **Drag** (mouse or touch) to shift the view across the sky dome.
- When zoomed in, dragging moves the visible region. The view slides smoothly across the sky.
- Panning is clamped to the hemisphere — the user cannot pan beyond the horizon in any direction. When the edge of the sky dome reaches the viewport edge, further dragging in that direction is blocked with a subtle elastic resistance (slight overscroll that snaps back), signalling the boundary.
- At full zoom-out (whole sky visible), panning is disabled — there's nowhere to go.

**Rotation:**
- **Two-finger rotate** on mobile, **Ctrl+drag** or **right-click drag** on desktop.
- Rotates the sky view around the zenith point. This lets the user reorient north to any edge of the screen if they prefer a different reference direction, or if they're physically facing a different way and want the screen to match.
- The compass labels (N/E/S/W) rotate with the view to remain accurate.
- Rotation is free (0°-360°), not snapped to cardinal points.

**Reset:**
- **Double-tap** on mobile, **double-click** on desktop, or a small reset button (⟲) in the UI.
- Animates smoothly back to the default view: full sky dome, north at top, zenith centred.

**Compass rose:**
- When zoomed in or rotated, a small compass rose appears in a corner of the viewport, showing which direction is north relative to the current view orientation. This replaces the cardinal labels at the dome edge, which may no longer be visible when zoomed in.

**Horizon constraint rationale:** The app is about what's above you right now. Allowing the view to tilt below the horizon would break this premise and introduce rendering edge cases (what's below the horizon is empty — no terrain, no cityscape). The constraint keeps the experience focused. If the user wants to see where the ISS will rise, the next-rise indicator at the horizon edge serves that purpose without breaking the overhead perspective.

### 8.6 Responsive Behaviour

- **Desktop (>1024px):** Sky dome inscribed in viewport. UI panels in corners. Comfortable mouse interaction. Scroll-wheel zoom, drag to pan, Ctrl+drag or right-click drag to rotate.
- **Tablet (768-1024px):** Same layout, slightly larger touch targets. Pinch-zoom, drag-pan, two-finger-rotate all active.
- **Mobile portrait (<768px):** Sky dome diameter equals viewport width. The dome extends slightly above and below the visible area — pan/zoom to explore. Layer toggles collapse behind a floating action button (☰). Callouts reposition to avoid viewport clipping, falling back to a compact bar at the bottom if space is tight.
- **Mobile landscape:** Sky dome inscribed in the shorter dimension (height). Minimal dead space at sides. Best experience for "hold phone up and look at the sky" usage.

## 9. Interaction Design

### 9.1 First Load Experience

1. **Geolocation prompt.** Browser requests permission. While waiting, show a subtle "Locating you…" message on the dark canvas. If denied, show a location input field.
2. **Stars appear first** (0-1 seconds). The star field fades in from black. This is instant — data is baked in, only the coordinate transform needs to run.
3. **Constellation lines appear** (0.5-1.5 seconds). Fade in slightly after stars.
4. **Planets and Moon appear** (1-2 seconds). Computed client-side, very fast.
5. **Satellites begin populating** (2-5 seconds). TLE data loads from CelesTrak via proxy. As positions are computed, dots fade in progressively — not all at once.
6. **ISS appears** (within the satellite load, but rendered distinctly). If above the horizon, it's immediately prominent. If below, the next-rise indicator appears at the horizon edge.
7. **Starlink remains off.** The toggle reads "Starlink (7,213)" with the count, inviting curiosity.

### 9.2 Time Scrubber (v2 Feature — Design Now, Build Later)

A horizontal slider at the bottom of the screen that allows the user to move forward and backward in time. Dragging it forward fast-forwards the sky — satellites stream across, stars rotate, the ISS arcs overhead. Dragging backward reverses the motion.

Range: -12 hours to +12 hours from now. Centre position = now (live mode).

This is computationally cheap — all positions are computed from the same TLE/orbital data, just with a different timestamp. The render loop simply uses the scrubber's time instead of `Date.now()`.

Design the UI slot and the data pipeline to support this, but do not implement the scrubber control in v1. Reserve the bottom 40px of the viewport for it.

## 10. Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│                                                                  │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Canvas   │  │ Projection │  │ SGP4      │  │ UI           │ │
│  │ Renderer │←─│ Engine     │←─│ Propagator│  │ Components   │ │
│  └──────────┘  └────────────┘  └───────────┘  └──────────────┘ │
│       ↑              ↑              ↑               ↑           │
│       └──────────────┴──────┬───────┴───────────────┘           │
│                             │                                    │
│                    ┌────────┴────────┐                           │
│                    │  Data Store     │                           │
│                    │  (in-memory)    │                           │
│                    │                 │                           │
│                    │ • Star catalogue│                           │
│                    │ • Constellation │                           │
│                    │   lines/names   │                           │
│                    │ • Satellite TLEs│                           │
│                    │ • Planet elems  │                           │
│                    │ • Observer pos  │                           │
│                    │ • Computed      │                           │
│                    │   positions     │                           │
│                    └────────┬────────┘                           │
│                             │                                    │
│                    ┌────────┴────────┐                           │
│                    │ Fetch Scheduler │                           │
│                    │                 │                           │
│                    │ CelesTrak:      │                           │
│                    │   every 2hrs    │                           │
│                    │   (via proxy)   │                           │
│                    │                 │                           │
│                    │ Open Notify:    │                           │
│                    │   once/session  │                           │
│                    │   (ISS crew)    │                           │
│                    └────────┬────────┘                           │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │  Cloudflare Worker      │
                │  (edge proxy)           │
                │                         │
                │  /api/celestrak/*       │
                │    → celestrak.org      │
                │    + CORS headers       │
                │    + 2hr response cache │
                │    + rate limit guard   │
                └─────────────────────────┘
```

### 10.1 Caching Strategy

| Data | Cache Location | TTL | Invalidation |
|---|---|---|---|
| Star catalogue | Bundled static asset | Permanent | App update only |
| Constellation data | Bundled static asset | Permanent | App update only |
| CelesTrak TLEs (stations) | Worker cache + browser localStorage | 2 hours | TTL expiry |
| CelesTrak TLEs (active) | Worker cache + browser localStorage | 2 hours | TTL expiry |
| CelesTrak TLEs (starlink) | Worker cache + browser localStorage | 2 hours | TTL expiry |
| Planet elements | Bundled static asset | Permanent | Valid for decades |
| Computed satellite positions | In-memory only | 3 seconds | Recomputed continuously |
| Observer position | In-memory (sessionStorage) | Session | Manual change only |

The Worker cache is the primary defence against hammering CelesTrak. All browser instances share the same Worker cache, so even if 1,000 users load the app within 2 hours, CelesTrak sees only one request per group per 2-hour window.

Browser localStorage provides offline resilience — if the Worker cache fails or CelesTrak is down, the app can use the last-fetched TLEs. TLEs remain usable for position prediction for several days (with degrading accuracy).

## 11. Deployment

### 11.1 Local Development

```
project/
├── index.html              # Single entry point
├── css/
│   └── style.css           # Minimal — mostly canvas, dark background
├── js/
│   ├── app.js              # Entry module, initialises everything
│   ├── data/
│   │   ├── stars.js        # Star catalogue loader
│   │   ├── constellations.js # Constellation data loader
│   │   ├── satellites.js   # TLE fetcher + SGP4 propagation manager
│   │   ├── planets.js      # Planet/Moon position computation
│   │   └── location.js     # Geolocation handler
│   ├── render/
│   │   ├── canvas.js       # Canvas setup, render loop, draw primitives
│   │   ├── projection.js   # Alt/Az ↔ screen coordinate transforms
│   │   ├── stars.js        # Star rendering
│   │   ├── satellites.js   # Satellite rendering (general + ISS + Starlink)
│   │   ├── planets.js      # Planet/Moon rendering
│   │   └── horizon.js      # Horizon circle, compass, glow
│   ├── ui/
│   │   ├── hud.js          # Info panel
│   │   ├── toggles.js      # Layer toggle controls
│   │   ├── callout.js      # On-canvas callout anchored to selected object
│   │   └── viewport.js     # Zoom, pan, rotation, hit-testing, gesture handling
│   └── utils/
│       ├── time.js         # Sidereal time, Julian date, time formatting
│       └── colour.js       # B-V to RGB mapping, colour utilities
├── data/
│   ├── stars.6.json        # d3-celestial star data (baked in)
│   ├── starnames.json      # Star proper names
│   ├── constellations.lines.json
│   ├── constellations.json
│   └── planets.json        # Keplerian elements (if not using astronomy-engine)
├── proxy.js                # Local dev proxy (Node, handles CelesTrak CORS)
├── worker/
│   ├── index.js            # Cloudflare Worker source
│   └── wrangler.toml       # Wrangler config
├── config.local.example.js # Template for local config
├── config.local.js          # (gitignored) Local dev overrides
├── package.json            # Minimal — just proxy dependencies
├── CLAUDE.md               # Claude Code project context
├── .gitignore
├── LICENSE                 # MIT
└── README.md
```

**Local dev workflow:**

```bash
# Terminal 1 — proxy server (handles CelesTrak CORS)
node proxy.js

# Terminal 2 — static file server
npx serve .

# Open http://localhost:3000
```

No build step. No npm install for the frontend (satellite.js loaded via CDN). The proxy requires Node for local dev only.

### 11.2 Production Deployment (Cloudflare Pages + Workers)

```bash
# One-time setup
# 1. Create Cloudflare Pages project linked to Git repo
# 2. Deploy the Worker:
cd worker/
npx wrangler deploy

# That's it. No API keys to configure — CelesTrak is keyless.
# The Worker only needs to add CORS headers and cache responses.
```

**Cloudflare Pages settings:**
- Build command: (none — static site)
- Build output directory: `/` (root)
- No environment variables needed (no API keys for any data source)

**Worker routes:**
```
/api/celestrak/* → proxies to celestrak.org (adds CORS, caches 2hrs)
```

### 11.3 Production Architecture

```
Cloudflare Pages (free tier)
├── Static assets (HTML, JS, CSS, star data JSON)
├── Custom domain (optional)
└── Linked Cloudflare Worker
    └── /api/celestrak/* → celestrak.org
        + CORS headers
        + 2-hour response cache
        + Rate limit guard (max 1 origin request per group per 2hrs)
```

Total ongoing cost: zero.

## 12. Performance Targets

| Metric | Target |
|---|---|
| Initial render (stars visible) | < 1 second after geolocation |
| Time to first satellite | < 4 seconds |
| Render frame rate | 10-15 fps sustained |
| Frame time budget | < 20ms per frame |
| Memory (stars + constellations only) | < 15 MB |
| Memory (all layers including Starlink) | < 80 MB |
| CelesTrak requests per session | ≤ 3 (one per group, cached 2hrs) |
| Battery drain (mobile, screen on) | Comparable to a weather app, not a game |

## 13. Error Handling

- **Geolocation denied:** Show a location input field (city search or lat/lon). Default to Auckland with a notice. The app is fully functional without precise location — the sky simply shows what's above the default position.
- **CelesTrak unavailable:** Use cached TLEs from localStorage if available (with a "Data from X hours ago" notice). If no cache exists, disable satellite layers and show a notice. Stars, constellations, and planets still work — they need no external data.
- **CelesTrak rate-limited (403):** The proxy detects the 403, logs it, and serves from cache. If no cache, back off for 2 hours. Display a notice to the user.
- **Browser tab backgrounded:** Pause all computation and rendering. On resume, refresh data if the cache has expired and restart the render loop.
- **Low-end device detected:** If frame time consistently exceeds 50ms, automatically reduce: (1) drop render rate to 8fps, (2) reduce satellite horizon check frequency to every 60 seconds, (3) suggest disabling Starlink if it's on. Show a subtle performance notice.
- **Canvas not supported:** Show a message. This should be vanishingly rare in 2026.

## 14. Accessibility

- **Keyboard navigation:** Tab between layer toggles. Enter/Space to toggle. Arrow keys to pan when zoomed in. +/- to zoom.
- **Screen reader:** The canvas is inherently non-accessible. Provide an aria-live region that announces significant state changes: "ISS is now visible, altitude 45 degrees, azimuth north-east" or "312 satellites currently above your location."
- **Colour choices:** Satellite colours chosen to be distinguishable for common forms of colour vision deficiency. Avoid red-green distinctions as the primary differentiator. Use brightness and hue together.
- **Reduced motion:** Respect `prefers-reduced-motion`. If set, render static frames (no animation) and update positions on a slower cadence (every 10 seconds). Objects jump to new positions rather than drifting.

## 15. Future Enhancements (Out of Scope for v1)

Noted for design consideration but explicitly excluded from the initial build:

- **Time scrubber** — fast-forward/rewind the sky. Data pipeline designed to support this (parameterised time input), but UI control deferred to v2.
- **Augmented reality mode** — use device orientation (gyroscope/accelerometer) to show the part of the sky the phone is physically pointing at, rather than the full dome. Requires the DeviceOrientation API and a different projection model.
- **Deep sky objects** — galaxies, nebulae, clusters from the d3-celestial DSO data. Low priority for the "density of stuff above you" narrative.
- **Satellite orbit paths** — show the full orbital ground track or sky track for a selected satellite.
- **Light pollution overlay** — use the World Atlas of Artificial Night Sky Brightness to tint the sky based on local light pollution, adjusting which stars would actually be visible.
- **ISS crew information** — fetch from Open Notify API and display in the ISS detail panel.
- **Pass predictions** — compute and display upcoming visible passes for the ISS or selected satellites at the user's location, with time, direction, and brightness.
- **Share/embed** — generate a snapshot image or shareable link with the current sky state.
- **Multiple sky cultures** — show constellation patterns from Māori, Chinese, or other astronomical traditions using d3-celestial's alternate sky culture data.
- **Sound** — subtle ambient audio that responds to the density of visible objects. Experimental.

---

## Appendix A: Data Source Reference

| Data | Source | URL | Auth | CORS | Format | Size | Refresh |
|---|---|---|---|---|---|---|---|
| Stars (mag ≤ 6) | d3-celestial / Hipparcos | Static asset (bundled) | None | N/A | GeoJSON | ~300KB | Never |
| Star names | d3-celestial | Static asset (bundled) | None | N/A | JSON | ~50KB | Never |
| Constellation lines | d3-celestial | Static asset (bundled) | None | N/A | GeoJSON | ~15KB | Never |
| Constellation names | d3-celestial | Static asset (bundled) | None | N/A | GeoJSON | ~8KB | Never |
| Satellite TLEs (stations) | CelesTrak GP API | `celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json` | None | **No** — proxy required | JSON (OMM) | ~5KB | ≤ every 2hrs |
| Satellite TLEs (active) | CelesTrak GP API | `celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json` | None | **No** — proxy required | JSON (OMM) | ~4MB | ≤ every 2hrs |
| Satellite TLEs (starlink) | CelesTrak GP API | `celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json` | None | **No** — proxy required | JSON (OMM) | ~3MB | ≤ every 2hrs |
| Planet elements | d3-celestial / JPL | Static asset (bundled) | None | N/A | JSON | ~2KB | Valid for decades |
| ISS crew | Open Notify API | `api.open-notify.org/astros.json` | None | Yes | JSON | ~1KB | Once per session |
| Observer position | Browser Geolocation API | `navigator.geolocation` | User permission | N/A | API | N/A | Once per session |

## Appendix B: Key Libraries

| Library | Version | Source | Size (min) | Purpose |
|---|---|---|---|---|
| satellite.js | 6.x | CDN (cdnjs or unpkg) | ~45KB | SGP4/SDP4 propagation, coordinate transforms |
| astronomy-engine | latest | CDN or bundled | ~150KB | Planet/Moon positions, sun position, lunar phase (recommended over manual Keplerian computation) |

No framework dependencies. No build tools. No package manager for the frontend.

## Appendix C: Projection Reference

**Stereographic zenithal projection:**

```
Input: altitude (alt, 0°-90°), azimuth (az, 0°-360°, 0°=N clockwise)
Output: screen coordinates (x, y) relative to viewport centre

r = cos(alt) / (1 + sin(alt))         // 0 at zenith, 1 at horizon
x = centre_x + r × sin(az) × R        // R = pixel radius of sky dome
y = centre_y - r × cos(az) × R        // negative: north (az=0) is up

Inverse (for hit-testing clicks):
r = sqrt((x - cx)² + (y - cy)²) / R
az = atan2(x - cx, -(y - cy))         // note sign convention
alt = arcsin((1 - r²) / (1 + r²))     // inverse stereographic
```

## Appendix D: CelesTrak OMM JSON Record Structure

Each record in the JSON array from CelesTrak contains these fields (subset relevant to this app):

```json
{
  "OBJECT_NAME": "ISS (ZARYA)",
  "OBJECT_ID": "1998-067A",
  "NORAD_CAT_ID": 25544,
  "EPOCH": "2026-04-01T12:00:00.000000",
  "MEAN_MOTION": 15.49,
  "ECCENTRICITY": 0.0001,
  "INCLINATION": 51.64,
  "RA_OF_ASC_NODE": 120.5,
  "ARG_OF_PERICENTER": 45.2,
  "MEAN_ANOMALY": 315.1,
  "BSTAR": 0.00003,
  "MEAN_MOTION_DOT": 0.00001,
  "MEAN_MOTION_DDOT": 0
}
```

These fields are passed to `satellite.js` `json2satrec()` to create a propagation-ready satellite record.

## Appendix E: CLAUDE.md Template

The following should be placed in the project root as `CLAUDE.md` to provide context when working with Claude Code:

```markdown
# Looking Up

Real-time zenithal sky viewer. Shows stars, satellites, ISS, Starlink, planets,
and Moon from the user's position. The name is a double meaning.

## Architecture

- Vanilla JS ES modules, no build step
- HTML5 Canvas 2D rendering at 10-15fps
- satellite.js (CDN) for SGP4 orbital propagation
- Static star/constellation data from d3-celestial (bundled JSON)
- CelesTrak GP API for satellite TLEs (proxied via Cloudflare Worker)
- astronomy-engine for planet/Moon positions

## Running locally

Terminal 1: `node proxy.js` (CelesTrak CORS proxy on :3001)
Terminal 2: `npx serve .` (static files on :3000)

## Key files

- `index.html` — single page entry point
- `js/app.js` — initialisation and render loop
- `js/render/projection.js` — stereographic zenithal projection (alt/az ↔ screen)
- `js/data/satellites.js` — TLE fetching and SGP4 propagation
- `proxy.js` — local dev proxy for CelesTrak
- `worker/index.js` — Cloudflare Worker (production proxy)
- `data/*.json` — static star and constellation data

## Coordinate conventions

- Sky projection: stereographic zenithal, north at top, east at right
- Star data: d3-celestial GeoJSON (RA as longitude -180..180, Dec as latitude)
- Satellite positions: SGP4 → ECI → ECF → look angles (alt/az)
- Screen: (0,0) top-left, y increases downward

## Interaction model

- Zoom: scroll wheel (desktop), pinch (mobile). Clamped to hemisphere.
- Pan: drag. Constrained to sky dome — cannot pan below horizon.
- Rotate: Ctrl+drag / right-click drag (desktop), two-finger rotate (mobile).
- Click/tap any object: on-canvas callout anchored to object, tracks it live.
- Double-click/tap: reset to default view (full dome, north up).

## Deployment

Cloudflare Pages (static) + Cloudflare Worker (CelesTrak proxy).
No API keys needed — CelesTrak is keyless.
```
