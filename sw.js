/* Offline: cache the app shell up front, cache map tiles as you browse. */
const VERSION = 'v2';
const SHELL = `itin-shell-${VERSION}`;
const TILES = `itin-tiles-${VERSION}`;
const TILE_LIMIT = 1200;

const SHELL_FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/util.js',
  'js/store.js',
  'js/map.js',
  'js/ui.js',
  'js/app.js',
  'data/amsterdam-2026.json',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/images/marker-icon.png',
  'vendor/images/marker-icon-2x.png',
  'vendor/images/marker-shadow.png',
  'manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // Individually, so one 404 can't sink the whole install.
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > TILE_LIMIT) {
    await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map(k => c.delete(k)));
  }
}

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Map tiles: serve from cache when we have them, otherwise fetch and keep.
  if (/tile\.openstreetmap\.org$/.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(request);
      if (hit) return hit;
      try {
        const res = await fetch(request);
        if (res.ok) { c.put(request, res.clone()); trimTiles(); }
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  // Trip data: prefer the network so a published edit shows up, fall back to cache offline.
  if (url.pathname.endsWith('.json')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok) (await caches.open(SHELL)).put(request, res.clone());
        return res;
      } catch {
        return (await caches.match(request)) || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // App shell: try the network briefly so a deploy is picked up on the next open,
  // but never let a flaky hotel/roaming connection stall the app — fall back to cache fast.
  e.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const res = await Promise.race([
        fetch(request),
        new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 2500)),
      ]);
      if (res && res.ok) { (await caches.open(SHELL)).put(request, res.clone()); return res; }
      if (cached) return cached;
      return res;
    } catch {
      return cached || (await caches.match('index.html')) || new Response('Offline', { status: 503 });
    }
  })());
});
