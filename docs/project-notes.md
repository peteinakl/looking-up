# Project Notes — What Works / What Doesn't

Living log of implementation decisions, confirmed approaches, and dead ends. Update this as the project develops.

---

## Format

Each entry: **date · area · finding**. Mark as ✅ confirmed working, ❌ avoid/failed, or ⚠️ caveat.

---

<!-- Add entries below as implementation progresses. Examples:

## 2026-04-xx · Projection
✅ Stereographic formula from PRD §5.3 produces correct zenithal output. Objects near the horizon (alt < 5°) render at the expected edge position.

## 2026-04-xx · satellite.js
❌ `twoline2satrec()` fails on NORAD IDs > 99999. Use `json2satrec()` with OMM/JSON from CelesTrak instead.

## 2026-04-xx · CelesTrak proxy
⚠️ The `active` group JSON is ~4MB. Ensure Worker streams the response rather than buffering — buffering caused timeout on first load.

-->
