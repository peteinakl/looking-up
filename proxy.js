#!/usr/bin/env node
// Local dev proxy — forwards /api/celestrak/:group to CelesTrak with CORS headers.
// No npm dependencies. Run: node proxy.js

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT = 8080;

// Simple in-memory cache: group → { body, ts }
const cache = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);

  // Only handle /api/celestrak/:group
  const match = parsed.pathname.match(/^\/api\/celestrak\/([a-z0-9_-]+)$/i);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...CORS });
    res.end('Not found');
    return;
  }

  const group = match[1].toLowerCase();
  const now   = Date.now();
  const cached = cache.get(group);

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    res.writeHead(200, {
      'Content-Type':  'application/json',
      'X-Cache':       'HIT',
      'Cache-Control': 'max-age=7200',
      ...CORS,
    });
    res.end(cached.body);
    return;
  }

  const target = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
  console.log(`[proxy] FETCH ${group} → ${target}`);

  https.get(target, { headers: { 'User-Agent': 'looking-up-dev-proxy/1.0' } }, (upstream) => {
    if (upstream.statusCode === 403 || upstream.statusCode === 429) {
      console.error(`[proxy] CelesTrak blocked: ${upstream.statusCode}`);
      res.writeHead(503, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({
        error: `CelesTrak returned ${upstream.statusCode}`,
        retryAfter: 7200,
      }));
      upstream.resume();
      return;
    }

    if (upstream.statusCode !== 200) {
      res.writeHead(upstream.statusCode, { ...CORS });
      upstream.pipe(res);
      return;
    }

    const chunks = [];
    upstream.on('data', chunk => chunks.push(chunk));
    upstream.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      cache.set(group, { body, ts: now });
      console.log(`[proxy] CACHED ${group} (${(body.length / 1024).toFixed(0)} KB)`);
      res.writeHead(200, {
        'Content-Type':  'application/json',
        'X-Cache':       'MISS',
        'Cache-Control': 'max-age=7200',
        ...CORS,
      });
      res.end(body);
    });

    upstream.on('error', err => {
      console.error('[proxy] upstream error:', err.message);
      res.writeHead(502, CORS);
      res.end();
    });
  }).on('error', err => {
    console.error('[proxy] request error:', err.message);
    res.writeHead(502, CORS);
    res.end();
  });
});

server.listen(PORT, () => {
  console.log(`[proxy] Listening on http://localhost:${PORT}`);
  console.log(`[proxy] Proxying /api/celestrak/:group → celestrak.org`);
});
