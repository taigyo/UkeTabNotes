// ウクレレ Tab ノート：オフライン用 Service Worker
// 画面（HTML）は「まず保存済みを表示し、裏で最新版を確認して保存」します。
// 最新版が見つかると、画面に「新しいバージョンがあります」と出ます。
const CACHE = 'uke-tab-shell-v1';
const ROOT = new URL('./', self.registration.scope).href;
const PRECACHE = [ROOT, ROOT + 'manifest.webmanifest', ROOT + 'icons/icon-192.png', ROOT + 'icons/icon-512.png', ROOT + 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    await notify('ready');
  })());
});

async function notify(type) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage({ type });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(staleWhileRevalidate(e));
  else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req));
});

async function staleWhileRevalidate(e) {
  const req = e.request;
  const cache = await caches.open(CACHE);
  const isNav = req.mode === 'navigate';
  const key = isNav ? ROOT : req;
  const cached = await cache.match(key, { ignoreSearch: isNav });
  const update = fetch(req).then(async res => {
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      const before = cached && (cached.headers.get('etag') || cached.headers.get('last-modified'));
      const after = res.headers.get('etag') || res.headers.get('last-modified');
      await cache.put(key, res.clone());
      if (cached && before && after && before !== after) await notify('updated');
    }
    return res;
  }).catch(() => null);
  e.waitUntil(update);
  if (cached) return cached;
  const res = await update;
  return res || (isNav ? await cache.match(ROOT) : null) || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) { return Response.error(); }
}
