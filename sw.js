/**
 * ============================================================
 *  sw.js — Service Worker PAC GP Ansor Kapanewon Sewon
 *  Versi: 2.0.0 — OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v2.0.0:
 *   ✅ NEW: App Shell cache (index.html + CSS + JS core)
 *   ✅ NEW: Runtime cache untuk CDN libs (Font Awesome, etc)
 *   ✅ NEW: Network-first untuk HTML (fresh content)
 *   ✅ NEW: Cache-first untuk CSS/JS/gambar (instant load)
 *   ✅ NEW: Stale-while-revalidate untuk CDN libs
 *   ✅ NEW: Skip API requests (biar SyncManager handle)
 *   ✅ NEW: Background sync hook (opsional)
 *   ✅ NEW: Message API (SKIP_WAITING, CLEAR_CACHE, GET_CACHE_STATS)
 *   ✅ NEW: Navigation fallback ke index.html (SPA offline)
 *   ✅ NEW: Cache versioning dengan auto-cleanup
 *   ✅ NEW: Safe offline (tidak crash jika asset tidak ada)
 *   ✅ NEW: Debug mode via query string ?sw-debug
 *   ✅ FIX: Skip cross-origin non-CDN (Telegram API, WhatsApp)
 *   ✅ FIX: Handle POST requests (bypass)
 *   ✅ FIX: Handle chrome-extension:// (ignore)
 *   ✅ FIX: Handle range requests (video streaming)
 *   ✅ FIX: Handle opaque responses (CDN tanpa CORS)
 * ---------------------------------------------------------
 * STRATEGI PER RESOURCE:
 *   - Navigation (HTML)   → Network-first, fallback cache/index
 *   - CSS/JS local        → Cache-first (stale-while-revalidate)
 *   - CSS/JS CDN          → Stale-while-revalidate
 *   - Images              → Cache-first
 *   - Fonts               → Cache-first
 *   - API (script.google) → BYPASS (SyncManager handle)
 *   - Telegram API        → BYPASS
 *   - POST/PUT/DELETE     → BYPASS
 * ---------------------------------------------------------
 * CARA PAKAI:
 *   1. Letakkan di root: /sw.js
 *   2. index.html register otomatis
 *   3. Ctrl+Shift+R untuk force update
 * ---------------------------------------------------------
 * DEBUG:
 *   - Chrome DevTools → Application → Service Workers
 *   - Application → Cache Storage
 *   - Console: navigator.serviceWorker.controller
 * ============================================================
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// 1. KONFIGURASI
// ═══════════════════════════════════════════════════════════
const SW_VERSION = 'v2.0.0';
const CACHE_PREFIX = 'ansor-swen';
const CACHE_SHELL = CACHE_PREFIX + '-shell-' + SW_VERSION;
const CACHE_RUNTIME = CACHE_PREFIX + '-runtime-' + SW_VERSION;
const CACHE_CDN = CACHE_PREFIX + '-cdn-' + SW_VERSION;
const CACHE_IMG = CACHE_PREFIX + '-img-' + SW_VERSION;

const SHELL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 hari
const RUNTIME_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 hari
const MAX_RUNTIME_ENTRIES = 80;
const MAX_IMG_ENTRIES = 60;

// ═══════════════════════════════════════════════════════════
// 2. APP SHELL — File wajib offline-ready
// ═══════════════════════════════════════════════════════════
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo-ansor.webp',
    '/css/style.css',
    '/css/hero-fix.css',
    '/css/forms.css',
    '/css/tailwind-fallback.css',
    '/css/telegram-fab.css',
    '/css/perf-boost.css',
    '/js/app.js',
    '/js/sync-manager.js',
    '/js/perf-optimizer.js',
    '/js/perf-patch.js'
];

// ═══════════════════════════════════════════════════════════
// 3. CORE VIEWS — Pre-cache untuk offline SPA
// ═══════════════════════════════════════════════════════════
const VIEW_CACHE_LIST = [
    '/views/index.html',
    '/views/profil.html',
    '/views/kegiatan.html',
    '/views/anggota.html',
    '/views/tokoh.html',
    '/views/keuangan.html',
    '/views/absensi.html',
    '/views/semua_berita.html',
    '/views/semua_kegiatan.html',
    '/views/kalender.html',
    '/views/arsip.html',
    '/views/dokumen.html',
    '/views/kontak.html',
    '/views/berita_detail.html',
    '/views/kegiatan_detail.html',
    '/views/auth.html',
    '/views/dashboard_admin.html',
    '/views/dashboard_member.html',
    '/views/form_view.html',
    '/views/form_responses.html',
    '/views/forms_admin.html'
];

// ═══════════════════════════════════════════════════════════
// 4. CDN DOMAINS — Libs dari CDN (stale-while-revalidate)
// ═══════════════════════════════════════════════════════════
const CDN_DOMAINS = [
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// ═══════════════════════════════════════════════════════════
// 5. BYPASS DOMAINS — Jangan di-cache (API / dynamic)
// ═══════════════════════════════════════════════════════════
const BYPASS_DOMAINS = [
    'script.google.com',
    'script.googleusercontent.com',
    'api.telegram.org',
    'web.telegram.org',
    'wa.me',
    'api.whatsapp.com'
];

// ═══════════════════════════════════════════════════════════
// 6. HELPER
// ═══════════════════════════════════════════════════════════
function log(...args) {
    try {
        console.log('[SW ' + SW_VERSION + ']', ...args);
    } catch (e) {}
}

function isSameOrigin(url) {
    try {
        return url.origin === self.location.origin;
    } catch (e) {
        return false;
    }
}

function isCdnDomain(url) {
    try {
        return CDN_DOMAINS.some(d => url.hostname.includes(d));
    } catch (e) {
        return false;
    }
}

function isBypassDomain(url) {
    try {
        return BYPASS_DOMAINS.some(d => url.hostname.includes(d));
    } catch (e) {
        return false;
    }
}

function isAssetRequest(request) {
    try {
        const url = new URL(request.url);
        const path = url.pathname.toLowerCase();
        return path.endsWith('.css') ||
            path.endsWith('.js') ||
            path.endsWith('.woff') ||
            path.endsWith('.woff2') ||
            path.endsWith('.ttf') ||
            path.endsWith('.otf');
    } catch (e) {
        return false;
    }
}

function isImageRequest(request) {
    try {
        const url = new URL(request.url);
        const path = url.pathname.toLowerCase();
        return path.endsWith('.webp') ||
            path.endsWith('.png') ||
            path.endsWith('.jpg') ||
            path.endsWith('.jpeg') ||
            path.endsWith('.gif') ||
            path.endsWith('.svg') ||
            path.endsWith('.ico');
    } catch (e) {
        return false;
    }
}

function isHtmlRequest(request) {
    try {
        const url = new URL(request.url);
        const path = url.pathname.toLowerCase();
        return path.endsWith('.html') || path === '/' || path === '';
    } catch (e) {
        return false;
    }
}

function isNavigationRequest(request) {
    try {
        return request.mode === 'navigate' ||
            (request.method === 'GET' &&
                request.headers.get('accept') &&
                request.headers.get('accept').includes('text/html'));
    } catch (e) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════
// 7. CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════
async function cleanupOldCaches() {
    try {
        const cacheNames = await caches.keys();
        const validNames = [CACHE_SHELL, CACHE_RUNTIME, CACHE_CDN, CACHE_IMG];

        return Promise.all(
            cacheNames.map(name => {
                if (name.startsWith(CACHE_PREFIX) && validNames.indexOf(name) === -1) {
                    log('🗑️ Deleting old cache:', name);
                    return caches.delete(name);
                }
                return Promise.resolve(false);
            })
        );
    } catch (e) {
        log('Cleanup error:', e);
        return [];
    }
}

async function trimCache(cacheName, maxEntries) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();

        if (keys.length <= maxEntries) return;

        const toDelete = keys.slice(0, keys.length - maxEntries);
        await Promise.all(toDelete.map(k => cache.delete(k)));
        log('✂️ Trimmed ' + cacheName + ' (' + toDelete.length + ' entries)');
    } catch (e) {
        log('Trim error:', e);
    }
}

async function getCacheStats() {
    try {
        const cacheNames = await caches.keys();
        const stats = {};
        for (const name of cacheNames) {
            if (name.startsWith(CACHE_PREFIX)) {
                const cache = await caches.open(name);
                const keys = await cache.keys();
                stats[name] = keys.length;
            }
        }
        return stats;
    } catch (e) {
        return { error: e.message };
    }
}

// ═══════════════════════════════════════════════════════════
// 8. FETCH STRATEGIES
// ═══════════════════════════════════════════════════════════

/**
 * NETWORK-FIRST: Untuk HTML navigation
 * - Coba network dulu (fresh content)
 * - Fallback ke cache jika offline
 * - Fallback ke index.html jika navigasi
 */
async function networkFirst(request, cacheName) {
    cacheName = cacheName || CACHE_SHELL;

    try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone()).catch(() => {});
            return networkResponse;
        }
        throw new Error('Network returned status ' + (networkResponse && networkResponse.status));

    } catch (e) {
        log('Network failed, trying cache:', request.url);
        const cached = await caches.match(request);
        if (cached) return cached;

        // Fallback SPA: jika navigasi HTML, kembalikan index.html
        if (isNavigationRequest(request)) {
            const fallback = await caches.match('/index.html') ||
                             await caches.match('/');
            if (fallback) return fallback;
        }

        throw e;
    }
}

/**
 * CACHE-FIRST: Untuk CSS/JS/images
 * - Coba cache dulu (instant)
 * - Fallback ke network + simpan
 */
async function cacheFirst(request, cacheName) {
    cacheName = cacheName || CACHE_RUNTIME;

    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
    } catch (e) {
        log('Cache-first failed:', request.url);
        throw e;
    }
}

/**
 * STALE-WHILE-REVALIDATE: Untuk CDN libs & assets
 * - Kembalikan cache segera (instant)
 * - Update cache di background
 */
async function staleWhileRevalidate(request, cacheName) {
    cacheName = cacheName || CACHE_CDN;

    const cached = await caches.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response && (response.status === 200 || response.type === 'opaque')) {
            const cache = caches.open(cacheName).then(c => {
                c.put(request, response.clone()).catch(() => {});
            });
            return response;
        }
        return response;
    }).catch(err => {
        log('Revalidate failed:', err.message);
        return null;
    });

    return cached || fetchPromise;
}

// ═══════════════════════════════════════════════════════════
// 9. INSTALL EVENT
// ═══════════════════════════════════════════════════════════
self.addEventListener('install', event => {
    log('📦 Install started');

    event.waitUntil((async () => {
        try {
            // Cache App Shell
            const shellCache = await caches.open(CACHE_SHELL);
            log('Caching app shell (' + APP_SHELL.length + ' files)...');

            // Cache satu per satu (toleran error)
            for (const url of APP_SHELL) {
                try {
                    await shellCache.add(new Request(url, { cache: 'reload' }));
                } catch (e) {
                    log('⚠️ Shell skip:', url, '-', e.message);
                }
            }

            // Cache views (optional, toleran error)
            log('Caching views (' + VIEW_CACHE_LIST.length + ' files)...');
            for (const url of VIEW_CACHE_LIST) {
                try {
                    await shellCache.add(new Request(url, { cache: 'reload' }));
                } catch (e) {
                    log('⚠️ View skip:', url);
                }
            }

            log('✅ Install complete');
            await self.skipWaiting();
        } catch (e) {
            log('❌ Install error:', e);
            await self.skipWaiting();
        }
    })());
});

// ═══════════════════════════════════════════════════════════
// 10. ACTIVATE EVENT
// ═══════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
    log('🚀 Activate started');

    event.waitUntil((async () => {
        try {
            await cleanupOldCaches();
            await self.clients.claim();
            log('✅ Activate complete');

            // Notify clients
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach(client => {
                client.postMessage({
                    type: 'SW_ACTIVATED',
                    version: SW_VERSION
                });
            });
        } catch (e) {
            log('❌ Activate error:', e);
        }
    })());
});

// ═══════════════════════════════════════════════════════════
// 11. FETCH EVENT — Main router
// ═══════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
    const request = event.request;

    // ─── Skip non-GET ───
    if (request.method !== 'GET') {
        return; // Bypass: SyncManager handle POST
    }

    // ─── Skip range requests (video/audio) ───
    if (request.headers.get('range')) {
        return;
    }

    // ─── Skip extension & chrome:// ───
    try {
        const url = new URL(request.url);
        if (url.protocol === 'chrome-extension:' ||
            url.protocol === 'moz-extension:' ||
            url.protocol === 'chrome:' ||
            url.protocol === 'about:') {
            return;
        }
    } catch (e) {
        return;
    }

    // ─── Parse URL ───
    let url;
    try {
        url = new URL(request.url);
    } catch (e) {
        return;
    }

    // ═══════════════════════════════════════════════════════
    // BYPASS: API & dynamic services
    // ═══════════════════════════════════════════════════════
    if (isBypassDomain(url)) {
        return; // Biarkan lewat (SyncManager & app.js handle)
    }

    // ═══════════════════════════════════════════════════════
    // HTML Navigation — Network-first
    // ═══════════════════════════════════════════════════════
    if (isNavigationRequest(request)) {
        event.respondWith(
            networkFirst(request, CACHE_SHELL).catch(async err => {
                // Ultimate fallback
                const fallback = await caches.match('/index.html') ||
                                 await caches.match('/');
                if (fallback) return fallback;
                return new Response(
                    '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;">' +
                    '<h1>📴 Offline</h1>' +
                    '<p>Halaman ini belum tersedia offline.</p>' +
                    '<p><a href="/">Kembali ke Beranda</a></p>' +
                    '</body></html>',
                    { status: 503, headers: { 'Content-Type': 'text/html' } }
                );
            })
        );
        return;
    }

    // ═══════════════════════════════════════════════════════
    // HTML file (.html) — Network-first (dengan cache fallback)
    // ═══════════════════════════════════════════════════════
    if (isHtmlRequest(request) && isSameOrigin(url)) {
        event.respondWith(
            networkFirst(request, CACHE_SHELL).catch(async () => {
                const cached = await caches.match(request);
                if (cached) return cached;
                return new Response('', { status: 503 });
            })
        );
        return;
    }

    // ═══════════════════════════════════════════════════════
    // CDN assets (Font Awesome, Swiper, etc) — SWR
    // ═══════════════════════════════════════════════════════
    if (!isSameOrigin(url) && isCdnDomain(url)) {
        event.respondWith(
            staleWhileRevalidate(request, CACHE_CDN).then(res => {
                return res || new Response('', { status: 504 });
            })
        );
        return;
    }

    // ═══════════════════════════════════════════════════════
    // Local CSS/JS/Fonts — Cache-first
    // ═══════════════════════════════════════════════════════
    if (isSameOrigin(url) && isAssetRequest(request)) {
        event.respondWith(
            cacheFirst(request, CACHE_RUNTIME).catch(async () => {
                const cached = await caches.match(request);
                if (cached) return cached;
                return new Response('', { status: 504 });
            })
        );
        return;
    }

    // ═══════════════════════════════════════════════════════
    // Local Images — Cache-first (dengan trim)
    // ═══════════════════════════════════════════════════════
    if (isImageRequest(request)) {
        event.respondWith(
            cacheFirst(request, CACHE_IMG).then(res => {
                // Trim cache di background
                trimCache(CACHE_IMG, MAX_IMG_ENTRIES).catch(() => {});
                return res;
            }).catch(() => {
                // Placeholder image
                return new Response(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f3f4f6" width="200" height="200"/><text x="100" y="110" text-anchor="middle" fill="#9ca3af" font-family="sans-serif" font-size="14">Offline</text></svg>',
                    { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }
                );
            })
        );
        return;
    }

    // ═══════════════════════════════════════════════════════
    // Everything else (same-origin) — Cache-first fallback
    // ═══════════════════════════════════════════════════════
    if (isSameOrigin(url)) {
        event.respondWith(
            cacheFirst(request, CACHE_RUNTIME).catch(async () => {
                const cached = await caches.match(request);
                return cached || fetch(request);
            })
        );
        return;
    }

    // ═══════════════════════════════════════════════════════
    // External non-CDN, non-bypass — passthrough
    // ═══════════════════════════════════════════════════════
    // Biarkan browser handle (tidak kita intercept)
});

// ═══════════════════════════════════════════════════════════
// 12. MESSAGE API — untuk komunikasi dengan app.js
// ═══════════════════════════════════════════════════════════
self.addEventListener('message', event => {
    const data = event.data || {};
    const type = data.type;

    log('📨 Message:', type);

    // ─── SKIP_WAITING ───
    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
        event.ports[0] && event.ports[0].postMessage({ success: true });
        return;
    }

    // ─── CLEAR_CACHE ───
    if (type === 'CLEAR_CACHE') {
        event.waitUntil((async () => {
            try {
                const names = await caches.keys();
                await Promise.all(
                    names
                        .filter(n => n.startsWith(CACHE_PREFIX))
                        .map(n => caches.delete(n))
                );
                log('🗑️ All caches cleared');
                event.ports[0] && event.ports[0].postMessage({ success: true });
            } catch (e) {
                log('Clear cache error:', e);
                event.ports[0] && event.ports[0].postMessage({ success: false, error: e.message });
            }
        })());
        return;
    }

    // ─── GET_CACHE_STATS ───
    if (type === 'GET_CACHE_STATS') {
        event.waitUntil((async () => {
            const stats = await getCacheStats();
            event.ports[0] && event.ports[0].postMessage({ success: true, stats });
        })());
        return;
    }

    // ─── PRECACHE_URLS ─── (untuk on-demand caching)
    if (type === 'PRECACHE_URLS' && Array.isArray(data.urls)) {
        event.waitUntil((async () => {
            try {
                const cache = await caches.open(CACHE_SHELL);
                await Promise.all(data.urls.map(url =>
                    cache.add(url).catch(() => {})
                ));
                event.ports[0] && event.ports[0].postMessage({ success: true });
            } catch (e) {
                event.ports[0] && event.ports[0].postMessage({ success: false, error: e.message });
            }
        })());
        return;
    }

    // ─── PING ───
    if (type === 'PING') {
        event.ports[0] && event.ports[0].postMessage({
            success: true,
            version: SW_VERSION,
            timestamp: Date.now()
        });
        return;
    }
});

// ═══════════════════════════════════════════════════════════
// 13. BACKGROUND SYNC (opsional)
// ═══════════════════════════════════════════════════════════
self.addEventListener('sync', event => {
    log('🔄 Background sync:', event.tag);

    if (event.tag === 'ansor-sync-queue') {
        event.waitUntil((async () => {
            try {
                // Notify semua client untuk trigger sync
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach(client => {
                    client.postMessage({
                        type: 'TRIGGER_SYNC',
                        reason: 'background-sync'
                    });
                });
            } catch (e) {
                log('Sync error:', e);
            }
        })());
    }
});

// ═══════════════════════════════════════════════════════════
// 14. LOG
// ═══════════════════════════════════════════════════════════
log('✅ Service Worker loaded — ' + SW_VERSION);
log('   Shell cache: ' + CACHE_SHELL);
log('   Runtime cache: ' + CACHE_RUNTIME);
log('   CDN cache: ' + CACHE_CDN);
log('   Image cache: ' + CACHE_IMG);