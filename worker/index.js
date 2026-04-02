// Cloudflare Worker — CelesTrak CORS proxy.
// Adds CORS headers, caches responses for 2 hours, streams response body.
// Never buffers large JSON bodies in Worker memory.

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const CACHE_TTL_S    = 7200;  // 2 hours

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url   = new URL(request.url);
    const match = url.pathname.match(/^\/api\/celestrak\/([a-z0-9_-]+)$/i);

    if (!match) {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }

    const group   = match[1].toLowerCase();
    const cacheUrl = new Request(
      `https://celestrak-cache.internal/${group}`,
      { method: 'GET' }
    );

    // Check Worker cache
    const cache = caches.default;
    let cached  = await cache.match(cacheUrl);
    if (cached) {
      return _addCors(cached);
    }

    // Fetch from CelesTrak
    const upstream = await fetch(
      `${CELESTRAK_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=json`,
      {
        headers: {
          'User-Agent': 'looking-up-cloudflare-worker/1.0',
        },
      }
    );

    if (upstream.status === 403 || upstream.status === 429) {
      return new Response(
        JSON.stringify({ error: `CelesTrak returned ${upstream.status}`, retryAfter: CACHE_TTL_S }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
      );
    }

    if (!upstream.ok) {
      return new Response(upstream.statusText, {
        status: upstream.status,
        headers: CORS_HEADERS,
      });
    }

    // Build cacheable response — stream body directly, do not buffer
    const response = new Response(upstream.body, {
      status:  200,
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_S}`,
        ...CORS_HEADERS,
      },
    });

    // Store in cache asynchronously (don't block the response)
    ctx.waitUntil(cache.put(cacheUrl, response.clone()));

    return response;
  },
};

function _addCors(response) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status:  response.status,
    headers: newHeaders,
  });
}
