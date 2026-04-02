# Looking Up

A fullscreen real-time sky viewer showing every satellite, star, and planet above you right now. The Starlink density is the point.

Stars, constellation lines, planets, the Moon, ISS with trail, active satellites, and the full Starlink constellation rendered on a zoomable, pannable canvas using your actual GPS position. Satellite trails, a rotating compass, and a colour key are included.

![Looking Up — Auckland, NZ](looking_up.png)

## Status

**Desktop: working well.** Zoom, pan, rotate, click any object for details — all solid.

**Mobile: work in progress.** The core rendering works but the layout, touch interactions, and panel sizing need polish. Not ready for mobile use yet.

## Local development

```bash
node proxy.js   # Terminal 1 — CORS proxy for CelesTrak (local dev only)
npx serve .     # Terminal 2 — static file server → http://localhost:3000
```

No build step. No npm install for the frontend — `satellite.js` and `astronomy-engine` are loaded from CDN.

## Deploy

```bash
cd worker && npx wrangler deploy
```

The Cloudflare Worker proxies CelesTrak with a 2-hour Cache API TTL so the upstream sees minimal traffic.

## Browser support

Desktop browsers with ES module support. Requires HTTPS (or localhost) for the Geolocation API — falls back to a manual location input if permission is denied.

## Data sources

| Layer | Source |
|---|---|
| Stars (~5,000) | d3-celestial / Hipparcos catalogue |
| Star names | d3-celestial `starnames.json` |
| Constellation lines + names | d3-celestial |
| Satellites (all groups) | CelesTrak OMM/JSON via `/api/celestrak/*` |
| Planets, Moon, Sun | astronomy-engine (client-side computation) |
