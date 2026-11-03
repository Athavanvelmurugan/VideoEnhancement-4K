/**
 * Thamizh Web Studio — Lightweight Service Worker
 * Enables PWA installability on Android without native SDK compilation.
 */

const CACHE_NAME = 'thamizh-studio-v1';
const STATIC_ASSETS = [
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/app.js',
    './js/gl-engine.js',
    './js/timeline.js',
    './js/face-tracker.js',
    './js/exporter.js',
    './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[Thamizh SW] Pre-caching asset warning:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for local static assets
    if (event.request.method !== 'GET') return;
    
    // Ignore backend API calls to FastAPI/Groq
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api') || url.port === '8000') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).catch(() => {
                // Return cached index.html for navigation if offline
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
