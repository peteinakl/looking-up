# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Looking Up** — fullscreen real-time zenithal sky viewer. Stars, satellites (ISS, Starlink), planets on HTML5 Canvas from the user's actual position. The experience reveals how much is above you, especially Starlink density. See [`looking-up-prd.md`](looking-up-prd.md) for full product spec.

## Commands

```bash
node proxy.js   # Terminal 1 — CelesTrak CORS proxy (local dev only)
npx serve .     # Terminal 2 — static file server → http://localhost:3000

cd worker/ && npx wrangler deploy   # Deploy Cloudflare Worker (production)
```

No build step. No frontend npm install — `satellite.js` via CDN. Proxy is the only Node dep.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for module layout, coordinate pipeline, projection formula, data sources, and performance budget.

## What Works / What Doesn't

See [`docs/project-notes.md`](docs/project-notes.md) — living log of implementation decisions, things that worked, and approaches to avoid.

## UX and Visual Design

**Always invoke `/frontend-design` before making any material decision about visual appearance, layout, or UX behaviour.** This includes: rendering aesthetics (colours, sizes, opacity), UI panel design, callout design, animation choices, and responsive layout. The PRD has strong design intent (dark-first, no chrome, authentic astronomical feel) — use `/frontend-design` to translate that intent into implementation.
