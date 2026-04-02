# Project Notes — What Works / What Doesn't

Living log of implementation decisions, confirmed approaches, and dead ends. Update this as the project develops.

---

## Format

Each entry: **date · area · finding**. Mark as ✅ confirmed working, ❌ avoid/failed, or ⚠️ caveat.

---

## 2026-04-02 · d3-celestial RA coordinate convention
❌ **The plan said `RA_rad = -lon_deg * π/180` — this is WRONG.**
✅ **Correct formula: `RA_rad = ((lon + 360) % 360) * π/180`**

d3-celestial stores RA directly as longitude in the standard GeoJSON range [-180°, +180°]. To recover RA in [0°, 360°] wrap with `(lon + 360) % 360`. Verified against Sirius (lon=101.29 → RA=6.75h ✓), Arcturus (lon=-146.08 → RA=14.26h ✓), Alpha Centauri (lon=-140.10 → RA=14.66h ✓).

## 2026-04-02 · stars.6.json feature count
✅ 5,044 features (slightly more than the PRD's estimate of ~4,500). Properties: `mag` (number), `bv` (string — must parseFloat). Geometry: GeoJSON Point with `[lon, lat]` = `[RA-as-lon, Dec]`.
⚠️ `bv` is a **string** in the JSON — call `parseFloat(feature.properties.bv)` before use.

## 2026-04-02 · Satellite group membership tracking
✅ Tracking Starlink/station IDs in `state.satellites.starlinkIds` (Set) and `state.satellites.stationIds` (Set), populated after each group finishes parsing. This replaces the NORAD ID range heuristic (>= 44235) which was unreliable.

## 2026-04-02 · Stars cache must store alt/az, not screen positions
❌ Caching star positions in screen (x, y) space breaks pan/zoom — cached coords are stale when viewport changes.
✅ Cache `{altRad, azRad, radius, colour}` and reproject via `project()` each frame. The 30s recompute saves the expensive `raDecToAltAz` calls; `altAzToScreen` per frame is cheap.

## 2026-04-02 · ctx.scale() accumulates on resize
❌ Calling `ctx.scale(dpr, dpr)` on every resize call multiplies the transform, shrinking the visible canvas area.
✅ Use `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` which sets an absolute transform.

## 2026-04-02 · Satellite OBJECT_NAME
✅ CelesTrak OMM JSON records include `OBJECT_NAME` field. Capture it during `_parseRecordsChunked` into `_names` Map (noradId → name). Export `getSatName(id)` for use in callouts.

## 2026-04-02 · astronomy-engine API
⚠️ `Astronomy.Equator()` returns RA in **hours** (not degrees). Multiply by 15 before converting to radians: `eq.ra * 15 * DEG`. Dec is in degrees directly. Confirmed in `data/planets.js`.

## 2026-04-02 · Full-screen sky projection (no circle)
✅ `radius = Math.hypot(w/2, h/2)` maps the horizon to the screen corners exactly.
   The canvas fills edge-to-edge with sky — no visible circle boundary. Horizon
   ring and compass labels removed (they'd be partially off-screen anyway).
   The 5° horizon fade alpha in `project()` provides a clean edge transition.

## 2026-04-02 · Sequential Starlink loading
✅ `initSatellites()` returns `Promise.all([stations, active])`.
   `app.js` chains `.then(() => enableStarlink())` so Starlink fetch never starts
   until base groups are done. Users see regular sats appear, then Starlink floods
   in as a second wave — the intended reveal effect.
   `starlinkFadeIn` initialised to 1 — no artificial delay on top of real load time.

## 2026-04-02 · loading.starlink must start true
❌ Initialising `loading.starlink: false` caused the loading bar to see `allDone=true`
   immediately (before Starlink even started fetching), skipping phase 2 entirely.
✅ Initialise `loading.starlink: true` in `app.js` state. `_fetchGroup` sets it
   `true` on start (no-op since already true) and `false` on completion. All 3
   loading bar phases now display correctly.

## 2026-04-02 · Horizon check must fire immediately after group parse
❌ Waiting up to 30s for the next scheduled horizon check meant sats were invisible
   even after their data had fully loaded and propagated.
✅ `_fetchGroup()` calls `_runHorizonCheck()` immediately after parse completes.
   Sats enter `aboveHorizon` within the next propagation cycle (≤3s).

## 2026-04-02 · Satellite trails — two-pass batch for fade
✅ Each position record stores `prev2Alt/prev2Az` (the previous `prevAlt/prevAz`,
   shifted forward each 3s propagation cycle — ~6s old).
   Trails are drawn in two batched passes per type:
   - Pass A: `prev2 → current` (faint) — full ~6s tail
   - Pass B: `prev → current`  (brighter) — overlaps recent ~3s, making head brighter
   No per-sat `createLinearGradient` — each sat type = exactly 2 `stroke()` calls.

## 2026-04-02 · Starlink not clickable by default
❌ Hit-test excluded Starlink (`!isStarlink` guard) as "too dense to select".
✅ All sats including Starlink are registered in `renderedObjects` every frame.
   1000+ entries is fine — hit-test is O(n) but only runs on click, not per frame.
   Callout shows type as "Starlink" (not "Satellite") using `data.isStarlink` flag.
