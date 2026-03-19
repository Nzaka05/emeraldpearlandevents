// Basic Service Worker for Command Center caching
const CACHE_NAME = 'command-center-v1';
const ASSETS_TO_CACHE = [
  '/admin/command-center',
  '/css/admin.css',
  '/js/socket.io.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(()=>console.log('Skipping missing assets'));
        })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
