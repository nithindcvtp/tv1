/* S1 TV service worker: lets the TV page and the remote be installed as apps and open quickly.
   It always asks the internet first, so a file you update on GitHub shows up straight away; the saved copy
   is only used when the internet is not available. It never touches streams or other websites. */
var CACHE = 's1-shell-v2';
var FILES = ['./', 'index.html', 'remote.html', 'config.js', 's1-host.js', 's1-remote.js', 'qrcode.js', 'channels_ml.json',
  'manifest-tv.json', 'manifest-remote.json', 'icon-tv-192.png', 'icon-tv-512.png', 'icon-remote-192.png', 'icon-remote-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || r.headers.has('range')) return;
  var key = u.origin + u.pathname;                      /* ignore ?ts=... so the cache does not fill up */
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(key).then(function (m) { return m || (r.mode === 'navigate' ? caches.match(u.origin + u.pathname.replace(/[^\/]*$/, '') ) : undefined) || Response.error(); });
  }));
});
