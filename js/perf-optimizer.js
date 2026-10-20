/**
 * js/perf-optimizer.js
 * Performance Optimizer — v2.2.0 FINAL (Priority Prefetch Edition)
 * ---------------------------------------------------------
 * Sistem Informasi Terpadu PAC GP Ansor Kapanewon Sewon
 * Load SEBELUM app.js untuk mempercepat SEMUA menu.
 *
 * CHANGELOG v2.2.0:
 *   ✅ FIX: Priority prefetch — homepage dulu, sub-pages belakangan
 *   ✅ FIX: DATA_PUBLIC diperluas (+getEvents, +getForms, +getQrConfig, +getAbsensi)
 *   ✅ FIX: Concurrency dinaikkan (6→8 view, 4→6 data) untuk desktop
 *   ✅ FIX: Initial prefetch delay 500ms → 200ms (lebih responsif)
 *   ✅ FIX: Event `perfPrefetchDataFirstHit` untuk first data ready
 *   ✅ FIX: Reconcile comment — konsistensi key 'anon' dengan app.js
 *   ✅ Preserved: Semua fitur v2.1.0
 *
 * CHANGELOG v2.1.0 (preserved):
 *   ✅ SafeSessionStorage integration (anti Tracking Prevention)
 *   ✅ In-memory fallback untuk sessionStorage
 *   ✅ Guard _isStorageAvailable() — silent, no spam
 *   ✅ safeLocalGet/Set dengan SafeStorage integration
 *   ✅ clearAll/clearData tidak throw saat storage blocked
 *   ✅ getStats() tidak spam console saat blocked
 *   ✅ Prefetch paralel 6 workers
 *   ✅ Prefetch otomatis SEMUA role (public/admin/member)
 *   ✅ View cache memory + sessionStorage (TTL 1 jam)
 *   ✅ Data cache dengan TTL 30 menit - 2 jam
 *   ✅ Navigation dedup (anti double-click)
 *   ✅ Idle callback scheduling (tidak blocking)
 *   ✅ Auto re-prefetch saat login/logout
 *   ✅ Auto re-prefetch saat tab kembali aktif
 *   ✅ Fetch timeout 12s hard cap
 *   ✅ IntersectionObserver lazy load
 *   ✅ Anti-memory-leak (auto cleanup)
 *   ✅ Exposed API: window.__PERF
 *   ✅ Debug helper: window.__PERF.debug()
 * ---------------------------------------------------------
 */

(function() {
    'use strict';

    // ══════════════════════════════════════════════════════════
    //  GUARD — anti double init
    // ══════════════════════════════════════════════════════════
    if (window.__PERF_OPTIMIZER) {
        console.log('[PerfOptimizer] Already initialized, skip.');
        return;
    }
    window.__PERF_OPTIMIZER = true;

    var VERSION = 'v2.2.0';
    console.log('[PerfOptimizer] 🚀 Init ' + VERSION);

    // ══════════════════════════════════════════════════════════
    //  1. KONFIGURASI PERFORMA
    // ══════════════════════════════════════════════════════════
    var PERF_CONFIG = {
        // TTL Cache (ms)
        TTL_VIEW:            60 * 60 * 1000,          // 1 jam
        TTL_DATA_DYNAMIC:    30 * 60 * 1000,          // 30 menit
        TTL_DATA_STATIC:     2 * 60 * 60 * 1000,      // 2 jam
        TTL_DATA_CRITICAL:   5 * 60 * 1000,           // 5 menit
        TTL_PREFETCH_DATA:   60 * 60 * 1000,          // 1 jam

        // Timeout
        NETWORK_TIMEOUT:     8000,
        HARD_TIMEOUT:        12000,

        // Prefetch — ⚡ v2.2.0: bumped untuk desktop
        PREFETCH_CONCURRENCY:      8,                 // 6 → 8
        PREFETCH_DATA_CONCURRENCY: 6,                 // 4 → 6
        PREFETCH_IDLE_DELAY:       200,
        PREFETCH_RETRY_DELAY:      1000,

        // Mobile
        MOBILE_PREFETCH_ENABLED: true,
        MOBILE_PREFETCH_LIMIT:   3,

        // Navigation
        NAV_DEDUP_WINDOW: 400,
        RE_PREFETCH_INTERVAL: 10 * 60 * 1000,

        // SessionStorage
        SESSION_MAX_ENTRIES: 200,

        // Debug
        DEBUG: false
    };

    // ══════════════════════════════════════════════════════════
    //  2. LOGGER
    // ══════════════════════════════════════════════════════════
    function log() {
        if (!PERF_CONFIG.DEBUG) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[PerfOptimizer]');
        console.log.apply(console, args);
    }

    function warn() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[PerfOptimizer]');
        console.warn.apply(console, args);
    }

    // ══════════════════════════════════════════════════════════
    //  3. ENVIRONMENT DETECTION
    // ══════════════════════════════════════════════════════════
    var IS_MOBILE = (function() {
        try {
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                return true;
            }
            return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
        } catch (e) {
            return false;
        }
    })();

    var IS_SLOW_NET = (function() {
        try {
            var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (!conn) return false;
            if (conn.saveData) return true;
            var type = String(conn.effectiveType || '');
            return /(^|-)2g$/.test(type);
        } catch (e) {
            return false;
        }
    })();

    // ══════════════════════════════════════════════════════════
    //  4. PRECONNECT KE API
    // ══════════════════════════════════════════════════════════
    function preconnectAPI() {
        try {
            var hosts = [
                'https://script.google.com',
                'https://fonts.gstatic.com'
            ];
            hosts.forEach(function(host) {
                var pc = document.createElement('link');
                pc.rel = 'preconnect';
                pc.href = host;
                pc.crossOrigin = 'anonymous';
                document.head.appendChild(pc);

                var dns = document.createElement('link');
                dns.rel = 'dns-prefetch';
                dns.href = host;
                document.head.appendChild(dns);
            });
        } catch (e) {
            warn('Preconnect failed:', e.message);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  5. IDLE CALLBACK HELPER
    // ══════════════════════════════════════════════════════════
    var idle = (function() {
        if (typeof window.requestIdleCallback === 'function') {
            return function(cb) {
                return window.requestIdleCallback(cb, { timeout: 2000 });
            };
        }
        return function(cb) {
            return setTimeout(cb, PERF_CONFIG.PREFETCH_IDLE_DELAY);
        };
    })();

    // ══════════════════════════════════════════════════════════
    //  6. SAFE STORAGE HELPERS — Tracking Prevention Safe
    // ══════════════════════════════════════════════════════════

    var __STORAGE_AVAILABLE = null;
    var __MEM_STORAGE = {};

    function _isStorageAvailable() {
        if (__STORAGE_AVAILABLE !== null) return __STORAGE_AVAILABLE;
        try {
            var k = '__perf_test__' + Date.now();
            sessionStorage.setItem(k, '1');
            sessionStorage.removeItem(k);
            __STORAGE_AVAILABLE = true;
        } catch (e) {
            __STORAGE_AVAILABLE = false;
        }
        return __STORAGE_AVAILABLE;
    }

    function safeSessionGet(key) {
        if (window.SafeSessionStorage && typeof window.SafeSessionStorage.getItem === 'function') {
            try {
                var v = window.SafeSessionStorage.getItem(key);
                if (v !== null && v !== undefined) return v;
            } catch (e) {}
        }
        if (!_isStorageAvailable()) return __MEM_STORAGE[key] || null;
        try {
            return sessionStorage.getItem(key);
        } catch (e) {
            return __MEM_STORAGE[key] || null;
        }
    }

    function safeSessionSet(key, value) {
        if (window.SafeSessionStorage && typeof window.SafeSessionStorage.setItem === 'function') {
            try {
                window.SafeSessionStorage.setItem(key, value);
                return true;
            } catch (e) {}
        }
        if (!_isStorageAvailable()) {
            __MEM_STORAGE[key] = String(value);
            return true;
        }
        try {
            sessionStorage.setItem(key, value);
            return true;
        } catch (e) {
            __MEM_STORAGE[key] = String(value);
            return false;
        }
    }

    function safeSessionRemove(key) {
        delete __MEM_STORAGE[key];
        if (window.SafeSessionStorage && typeof window.SafeSessionStorage.removeItem === 'function') {
            try { window.SafeSessionStorage.removeItem(key); } catch (e) {}
            return;
        }
        if (!_isStorageAvailable()) return;
        try { sessionStorage.removeItem(key); } catch (e) {}
    }

    function safeLocalGet(key) {
        if (window.SafeStorage && typeof window.SafeStorage.getItem === 'function') {
            try { return window.SafeStorage.getItem(key); } catch (e) {}
        }
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function safeLocalSet(key, value) {
        if (window.SafeStorage && typeof window.SafeStorage.setItem === 'function') {
            try {
                window.SafeStorage.setItem(key, value);
                return true;
            } catch (e) {}
        }
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) { return false; }
    }

    // ══════════════════════════════════════════════════════════
    //  7. VIEW CACHE (Memory + SessionStorage)
    // ══════════════════════════════════════════════════════════
    var viewCacheMemory = new Map();
    var viewCachePending = new Map();

    function getViewCacheKey(url) {
        return '__v_cache_' + url;
    }

    function getViewFromCache(url) {
        if (viewCacheMemory.has(url)) {
            log('View cache HIT (memory):', url);
            return viewCacheMemory.get(url);
        }

        var cached = safeSessionGet(getViewCacheKey(url));
        if (cached) {
            try {
                var parsed = JSON.parse(cached);
                if (Date.now() - parsed.t < PERF_CONFIG.TTL_VIEW) {
                    viewCacheMemory.set(url, parsed.html);
                    log('View cache HIT (session):', url);
                    return parsed.html;
                }
                safeSessionRemove(getViewCacheKey(url));
            } catch (e) {}
        }

        return null;
    }

    function setViewCache(url, html) {
        if (!html || typeof html !== 'string' || html.length < 50) return;

        viewCacheMemory.set(url, html);

        safeSessionSet(getViewCacheKey(url), JSON.stringify({
            html: html,
            t: Date.now()
        }));
    }

    function clearViewCache(url) {
        viewCacheMemory.delete(url);
        safeSessionRemove(getViewCacheKey(url));
    }

    // ══════════════════════════════════════════════════════════
    //  8. DATA CACHE
    //  ⚡ v2.2.0 RECONCILE: key format harus SAMA dengan app.js
    //     Format: cache_{action}_{userKey}_{paramsJSON}
    //     - app.js apiCall() pakai userKey = user.id OR 'anon'
    //     - perf-optimizer getDataCacheKey() pakai userId OR 'anon'
    //     → KONSISTEN ✓
    // ══════════════════════════════════════════════════════════
    function getDataCacheKey(action, userId, params) {
        var pStr;
        try {
            pStr = JSON.stringify(params || {});
        } catch (e) {
            pStr = '{}';
        }
        return 'cache_' + action + '_' + (userId || 'anon') + '_' + pStr;
    }

    function getDataFromCache(action, userId, params) {
        try {
            var key = getDataCacheKey(action, userId, params);
            var cached = safeSessionGet(key);
            if (!cached) return null;

            var parsed = JSON.parse(cached);
            var ttl = getPerfTTL(action);

            if (Date.now() - parsed._timestamp < ttl) {
                log('Data cache HIT:', action);
                return parsed.data;
            }

            safeSessionRemove(key);
        } catch (e) {}
        return null;
    }

    function setDataCache(action, userId, params, data) {
        try {
            var key = getDataCacheKey(action, userId, params);
            safeSessionSet(key, JSON.stringify({
                data: data,
                _timestamp: Date.now()
            }));
        } catch (e) {}
    }

    function getPerfTTL(action) {
        var a = String(action || '').toLowerCase();

        if (a.indexOf('qr') !== -1 ||
            a.indexOf('password') !== -1 ||
            a.indexOf('notification') !== -1 ||
            a.indexOf('unread') !== -1) {
            return PERF_CONFIG.TTL_DATA_CRITICAL;
        }

        if (a.indexOf('profil') !== -1 ||
            a.indexOf('struktur') !== -1 ||
            a.indexOf('photoposition') !== -1 ||
            a.indexOf('tokoh') !== -1 ||
            a.indexOf('programkerja') !== -1) {
            return PERF_CONFIG.TTL_DATA_STATIC;
        }

        return PERF_CONFIG.TTL_DATA_DYNAMIC;
    }

    // ══════════════════════════════════════════════════════════
    //  9. USER ROLE HELPER
    // ══════════════════════════════════════════════════════════
    function getUserRole() {
        try {
            var raw = safeLocalGet('user');
            if (!raw) return 'public';
            var u = JSON.parse(raw);
            if (!u) return 'public';
            var role = u.role || 'member';
            if (role === 'admin' || role === 'member') return role;
            return 'public';
        } catch (e) {
            return 'public';
        }
    }

    function getUserId() {
        try {
            var raw = safeLocalGet('user');
            if (!raw) return 'anon';
            var u = JSON.parse(raw);
            return (u && u.id) || 'anon';
        } catch (e) {
            return 'anon';
        }
    }

    // ══════════════════════════════════════════════════════════
    //  10. PREFETCH VIEW — LIST SEMUA VIEW
    // ══════════════════════════════════════════════════════════

    var VIEWS_PUBLIC = [
        'views/index.html',
        'views/profil.html',
        'views/kegiatan.html',
        'views/semua_berita.html',
        'views/berita_detail.html',
        'views/semua_kegiatan.html',
        'views/kegiatan_detail.html',
        'views/anggota.html',
        'views/dokumen.html',
        'views/kalender.html',
        'views/arsip.html',
        'views/keuangan.html',
        'views/tokoh.html',
        'views/absensi.html',
        'views/kontak.html',
        'views/form_view.html'
    ];

    var VIEWS_AUTH = [
        'views/auth.html'
    ];

    var VIEWS_ADMIN = [
        'views/dashboard_admin.html',
        'views/surat_admin.html',
        'views/surat_preview.html',
        'views/logbook_admin.html',
        'views/logbook_report.html',
        'views/ringkasan.html',
        'views/berita_admin.html',
        'views/anggota_admin.html',
        'views/kader_admin.html',
        'views/profil_admin.html',
        'views/tokoh_admin.html',
        'views/arsip_admin.html',
        'views/kalender_admin.html',
        'views/galeri_admin.html',
        'views/keuangan_admin.html',
        'views/inventaris_admin.html',
        'views/proker_admin.html',
        'views/forum_admin.html',
        'views/absensi_admin.html',
        'views/forms_admin.html',
        'views/form_responses.html'
    ];

    var VIEWS_MEMBER = [
        'views/dashboard_member.html',
        'views/surat_member.html',
        'views/logbook_member.html'
    ];

    function prefetchView(url) {
        if (viewCacheMemory.has(url)) {
            return Promise.resolve();
        }

        if (viewCachePending.has(url)) {
            return viewCachePending.get(url);
        }

        var promise = new Promise(function(resolve) {
            try {
                fetch(url, {
                    cache: 'force-cache',
                    priority: 'low',
                    credentials: 'same-origin'
                }).then(function(res) {
                    if (res.ok) {
                        return res.text().then(function(html) {
                            setViewCache(url, html);
                            log('Prefetched:', url);
                        });
                    }
                }).catch(function(err) {
                    log('Prefetch failed:', url, err.message);
                }).then(function() {
                    viewCachePending.delete(url);
                    resolve();
                });
            } catch (e) {
                viewCachePending.delete(url);
                resolve();
            }
        });

        viewCachePending.set(url, promise);
        return promise;
    }

    function prefetchViewsParallel(views, concurrency) {
        concurrency = Math.max(1, concurrency || PERF_CONFIG.PREFETCH_CONCURRENCY);

        return new Promise(function(resolve) {
            var queue = views.slice();
            var total = views.length;
            var completed = 0;

            if (total === 0) return resolve();

            function onWorkerDone() {
                if (completed >= total) {
                    resolve();
                }
            }

            for (var i = 0; i < concurrency; i++) {
                (function() {
                    (async function() {
                        while (queue.length > 0) {
                            var url = queue.shift();
                            if (!url) break;
                            await prefetchView(url);
                            completed++;
                            onWorkerDone();
                        }
                    })();
                })();
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    //  11. DATA PREFETCH — Endpoint penting per role
    //  ⚡ v2.2.0: DATA_PUBLIC diperluas
    // ══════════════════════════════════════════════════════════

    var DATA_PUBLIC = [
        // ── Homepage critical ──
        'getProfil',
        'getStruktur',
        'getBerita',
        'getLogbook',
        'getGaleri',
        'getArsip',
        'getUsers',
        'getTokoh',
        'getKeuanganPublik',
        'getEvents',           // ⚡ v2.2.0 — kalender
        // ── Sub-page endpoints ──
        'getForms',            // ⚡ v2.2.0 — form_view
        'getQrConfig',         // ⚡ v2.2.0 — absensi
        'getAbsensi'           // ⚡ v2.2.0 — absensi list
    ];

    var DATA_ADMIN = [
        'getSurat',
        'getLogbook',
        'getUsers',
        'getKeuangan',
        'getInventaris',
        'getPeminjaman',
        'getProgramKerja',
        'getForumTopics',
        'getTokoh',
        'getAbsensi',
        'getForms',
        'getFormResponses',
        'getFormNotifications'
    ];

    var DATA_MEMBER = [
        'getSurat',
        'getLogbook'
    ];

    // ══════════════════════════════════════════════════════════
    //  12. PREFETCH DATA (via JSONP)
    // ══════════════════════════════════════════════════════════
    var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwxL8wL7G__dlIHeEgVc8FWsjjC235t42ZyStwSADDIqlxxcUp7FGqmsQUHEMJeNpN5ow/exec';

    function prefetchDataEndpoint(action) {
        var userId = getUserId();
        var role = getUserRole();

        var cached = getDataFromCache(action, userId, {});
        if (cached) {
            log('Data prefetch SKIP (cached):', action);
            return Promise.resolve();
        }

        return new Promise(function(resolve) {
            try {
                var cbName = 'pd_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
                var payload = {
                    action: action,
                    userId: userId,
                    role: role,
                    callback: cbName
                };

                var qsParts = [];
                Object.keys(payload).forEach(function(k) {
                    var v = payload[k] == null ? '' : String(payload[k]);
                    qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
                });
                var qs = qsParts.join('&');

                var responded = false;
                var script = document.createElement('script');
                var timer = null;

                function cleanup() {
                    try {
                        if (script && script.parentNode) {
                            script.parentNode.removeChild(script);
                        }
                    } catch (e) {}
                    try { delete window[cbName]; } catch (e) {}
                    if (timer) clearTimeout(timer);
                }

                window[cbName] = function(responseData) {
                    if (responded) return;
                    responded = true;

                    if (responseData && responseData.success) {
                        var cKey = 'cache_' + action + '_' + userId + '_' + JSON.stringify({});
                        safeSessionSet(cKey, JSON.stringify({
                            data: responseData,
                            _timestamp: Date.now()
                        }));
                        log('Data prefetched:', action);

                        // ⚡ v2.2.0: event per action selesai
                        try {
                            window.dispatchEvent(new CustomEvent('perfPrefetchDataFirstHit', {
                                detail: { action: action }
                            }));
                        } catch (e) {}
                    }

                    cleanup();
                    resolve();
                };

                timer = setTimeout(function() {
                    if (responded) return;
                    responded = true;
                    cleanup();
                    resolve();
                }, PERF_CONFIG.NETWORK_TIMEOUT);

                script.src = API_BASE_URL + '?' + qs;
                script.async = true;
                script.onerror = function() {
                    if (responded) return;
                    responded = true;
                    cleanup();
                    resolve();
                };

                document.head.appendChild(script);
            } catch (e) {
                resolve();
            }
        });
    }

    function prefetchDataParallel(endpoints, concurrency) {
        concurrency = Math.max(1, concurrency || PERF_CONFIG.PREFETCH_DATA_CONCURRENCY);

        return new Promise(function(resolve) {
            var queue = endpoints.slice();
            var total = endpoints.length;
            var completed = 0;

            if (total === 0) return resolve();

            function checkDone() {
                if (completed >= total) resolve();
            }

            for (var i = 0; i < concurrency; i++) {
                (function() {
                    (async function() {
                        while (queue.length > 0) {
                            var action = queue.shift();
                            if (!action) break;
                            await prefetchDataEndpoint(action);
                            completed++;
                            checkDone();
                        }
                    })();
                })();
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    //  13. START AUTO PREFETCH (view + data)
    //  ⚡ v2.2.0: PRIORITY — homepage dulu, sub-pages belakangan
    // ══════════════════════════════════════════════════════════
    var isPrefetching = false;
    var lastPrefetchAt = 0;

    // Priority lists
    var HOME_VIEWS = ['views/index.html'];
    var HOME_DATA = [
        'getProfil',
        'getStruktur',
        'getBerita',
        'getLogbook',
        'getGaleri',
        'getArsip',
        'getUsers',
        'getTokoh',
        'getKeuanganPublik'
    ];

    function startAutoPrefetch(force) {
        if (IS_SLOW_NET) {
            log('Skip prefetch — slow network detected');
            return Promise.resolve();
        }

        if (isPrefetching) {
            log('Prefetch already running, skip');
            return Promise.resolve();
        }

        var now = Date.now();
        if (!force && (now - lastPrefetchAt) < PERF_CONFIG.RE_PREFETCH_INTERVAL) {
            log('Skip prefetch — too recent');
            return Promise.resolve();
        }

        isPrefetching = true;
        lastPrefetchAt = now;

        var role = getUserRole();
        log('🔄 Auto-prefetch for role:', role);

        // ══════════════════════════════════════════════════════
        //  ⚡ PRIORITY QUEUE: Homepage dulu, baru sub-pages
        // ══════════════════════════════════════════════════════
        var views = HOME_VIEWS.slice();
        var dataEndpoints = HOME_DATA.slice();

        if (role === 'admin') {
            views = views.concat(VIEWS_ADMIN);
            dataEndpoints = dataEndpoints.concat(
                DATA_ADMIN.filter(function(e) { return HOME_DATA.indexOf(e) === -1; })
            );
        } else if (role === 'member') {
            views = views.concat(VIEWS_MEMBER);
            dataEndpoints = dataEndpoints.concat(
                DATA_MEMBER.filter(function(e) { return HOME_DATA.indexOf(e) === -1; })
            );
        } else {
            // Public — tambah view publik + sisa endpoint
            var otherViews = VIEWS_PUBLIC.filter(function(v) {
                return HOME_VIEWS.indexOf(v) === -1;
            });
            views = views.concat(otherViews);
            dataEndpoints = dataEndpoints.concat(
                DATA_PUBLIC.filter(function(e) { return HOME_DATA.indexOf(e) === -1; })
            );
        }

        // Mobile limit
        if (IS_MOBILE) {
            var commonLen = HOME_VIEWS.length + PERF_CONFIG.MOBILE_PREFETCH_LIMIT;
            views = views.slice(0, commonLen);
        }

        // Concurrency
        var viewConcurrency = IS_MOBILE ? 3 : PERF_CONFIG.PREFETCH_CONCURRENCY;
        var dataConcurrency = IS_MOBILE ? 2 : PERF_CONFIG.PREFETCH_DATA_CONCURRENCY;

        return prefetchViewsParallel(views, viewConcurrency)
            .then(function() {
                log('✅ Views prefetched:', views.length);
                return prefetchDataParallel(dataEndpoints, dataConcurrency);
            })
            .then(function() {
                log('✅ Data prefetched:', dataEndpoints.length);
                isPrefetching = false;
                window.dispatchEvent(new CustomEvent('perfPrefetchComplete', {
                    detail: {
                        role: role,
                        views: views.length,
                        data: dataEndpoints.length,
                        duration: Date.now() - now
                    }
                }));
            })
            .catch(function(err) {
                warn('Prefetch error:', err.message);
                isPrefetching = false;
            });
    }

    // ══════════════════════════════════════════════════════════
    //  14. NAVIGATION DEDUP
    // ══════════════════════════════════════════════════════════
    var navHistory = {
        lastUrl: '',
        lastTime: 0
    };

    function shouldBlockNavigation(url) {
        var now = Date.now();
        var isSameUrl = String(url || '') === navHistory.lastUrl;
        var isWithinWindow = (now - navHistory.lastTime) < PERF_CONFIG.NAV_DEDUP_WINDOW;

        if (isSameUrl && isWithinWindow) {
            log('Block duplicate nav:', url);
            return true;
        }

        navHistory.lastUrl = String(url || '');
        navHistory.lastTime = now;
        return false;
    }

    // ══════════════════════════════════════════════════════════
    //  15. GLOBAL FETCH TIMEOUT PATCH
    // ══════════════════════════════════════════════════════════
    function patchFetchTimeout() {
        if (window.__FETCH_PATCHED) return;
        window.__FETCH_PATCHED = true;

        var originalFetch = window.fetch;
        if (!originalFetch || typeof AbortController === 'undefined') return;

        window.fetch = function(input, init) {
            init = init || {};

            if (init.signal) {
                return originalFetch.call(this, input, init);
            }

            try {
                var controller = new AbortController();
                init.signal = controller.signal;

                setTimeout(function() {
                    try { controller.abort(); } catch (e) {}
                }, PERF_CONFIG.HARD_TIMEOUT);

                return originalFetch.call(this, input, init);
            } catch (e) {
                return originalFetch.call(this, input, init);
            }
        };

        log('fetch timeout patched (' + (PERF_CONFIG.HARD_TIMEOUT / 1000) + 's cap)');
    }

    // ══════════════════════════════════════════════════════════
    //  16. LAZY IMAGE OBSERVER
    // ══════════════════════════════════════════════════════════
    function initLazyImageObserver() {
        if (!('IntersectionObserver' in window)) return;

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    if (img.dataset && img.dataset.src && !img.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                    }
                    img.setAttribute('data-loaded', 'true');
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '200px',
            threshold: 0.01
        });

        function observeAll() {
            try {
                var imgs = document.querySelectorAll('img:not([data-loaded]):not([data-observed])');
                for (var i = 0; i < imgs.length; i++) {
                    imgs[i].setAttribute('data-observed', 'true');
                    observer.observe(imgs[i]);
                }
            } catch (e) {}
        }

        observeAll();

        if ('MutationObserver' in window) {
            var mo = new MutationObserver(function() {
                requestAnimationFrame(observeAll);
            });
            mo.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });
        }

        log('Lazy image observer active');
    }

    // ══════════════════════════════════════════════════════════
    //  17. EXPOSE GLOBAL API
    // ══════════════════════════════════════════════════════════
    window.__PERF = {
        version: VERSION,
        config: PERF_CONFIG,

        // ─── View Cache ───
        getView: getViewFromCache,
        setView: setViewCache,
        clearView: clearViewCache,

        // ─── Data Cache ───
        getData: getDataFromCache,
        setData: setDataCache,

        // ─── Prefetch ───
        prefetch: prefetchViewsParallel,
        prefetchViews: prefetchView,
        prefetchData: prefetchDataParallel,
        startAutoPrefetch: startAutoPrefetch,

        // ─── Navigation ───
        shouldBlockNavigation: shouldBlockNavigation,

        // ─── Cache Management ───
        clearAll: function() {
            viewCacheMemory.clear();
            __MEM_STORAGE = {};
            try {
                var keys = [];
                for (var i = 0; i < sessionStorage.length; i++) {
                    var k = sessionStorage.key(i);
                    if (k && (k.indexOf('__v_cache_') === 0 || k.indexOf('cache_') === 0)) {
                        keys.push(k);
                    }
                }
                keys.forEach(function(k) {
                    try { sessionStorage.removeItem(k); } catch (e) {}
                });
            } catch (e) {}
            log('All caches cleared');
        },

        clearData: function() {
            try {
                var keys = [];
                for (var i = 0; i < sessionStorage.length; i++) {
                    var k = sessionStorage.key(i);
                    if (k && k.indexOf('cache_') === 0) {
                        keys.push(k);
                    }
                }
                keys.forEach(function(k) {
                    try { sessionStorage.removeItem(k); } catch (e) {}
                });
            } catch (e) {}
            log('Data caches cleared');
        },

        // ─── Stats ───
        getStats: function() {
            var sessionCount = 0;
            var dataCount = 0;
            var viewCount = 0;

            try {
                for (var i = 0; i < sessionStorage.length; i++) {
                    var k = sessionStorage.key(i);
                    if (k && k.indexOf('__v_cache_') === 0) {
                        viewCount++;
                        sessionCount++;
                    } else if (k && k.indexOf('cache_') === 0) {
                        dataCount++;
                        sessionCount++;
                    }
                }
            } catch (e) {
                Object.keys(__MEM_STORAGE).forEach(function(k) {
                    if (k.indexOf('__v_cache_') === 0) { viewCount++; sessionCount++; }
                    else if (k.indexOf('cache_') === 0) { dataCount++; sessionCount++; }
                });
            }

            return {
                version: VERSION,
                storage_blocked: !_isStorageAvailable(),
                memory_views: viewCacheMemory.size,
                session_views: viewCount,
                session_data: dataCount,
                total_session: sessionCount,
                pending: viewCachePending.size,
                role: getUserRole(),
                user: getUserId(),
                is_mobile: IS_MOBILE,
                is_slow_net: IS_SLOW_NET,
                is_prefetching: isPrefetching,
                last_prefetch_at: lastPrefetchAt
            };
        },

        // ─── Debug Helper ───
        debug: function() {
            var stats = this.getStats();
            console.group('🔍 PerfOptimizer Debug — ' + VERSION);
            console.log('Storage Blocked:', stats.storage_blocked);
            console.log('Role:', stats.role);
            console.log('User ID:', stats.user);
            console.log('Is Mobile:', stats.is_mobile);
            console.log('Is Slow Net:', stats.is_slow_net);
            console.log('Memory Views:', stats.memory_views);
            console.log('Session Views:', stats.session_views);
            console.log('Session Data:', stats.session_data);
            console.log('Pending Fetches:', stats.pending);
            console.log('Prefetching:', stats.is_prefetching);
            console.log('Last Prefetch:', new Date(stats.last_prefetch_at).toLocaleString('id-ID'));
            console.groupEnd();
            return stats;
        }
    };

    // ══════════════════════════════════════════════════════════
    //  18. INIT
    // ══════════════════════════════════════════════════════════
    function init() {
        preconnectAPI();
        patchFetchTimeout();
        initLazyImageObserver();

        // ⚡ v2.2.0: delay 500ms → 200ms (lebih responsif)
        setTimeout(function() {
            startAutoPrefetch().catch(function(err) {
                warn('Initial prefetch failed:', err.message);
            });
        }, 200);

        // Listen storage changes (login/logout di tab lain)
        window.addEventListener('storage', function(e) {
            if (e.key === 'user') {
                log('Storage user changed, re-prefetch in 1s...');
                setTimeout(function() {
                    startAutoPrefetch(true);
                }, 1000);
            }
        });

        // Re-prefetch saat tab kembali aktif
        var lastVisibilityRefresh = Date.now();
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                var elapsed = Date.now() - lastVisibilityRefresh;
                if (elapsed > PERF_CONFIG.RE_PREFETCH_INTERVAL) {
                    lastVisibilityRefresh = Date.now();
                    log('Tab active again, re-prefetch...');
                    startAutoPrefetch(true);
                }
            }
        });

        // Listen event custom dari app.js
        window.addEventListener('login-success', function() {
            setTimeout(function() {
                startAutoPrefetch(true);
            }, 800);
        });

        window.addEventListener('logout-success', function() {
            window.__PERF.clearAll();
            setTimeout(function() {
                startAutoPrefetch(true);
            }, 500);
        });

        // Listen router navigation untuk prefetch halaman berikutnya
        window.addEventListener('hashchange', function() {
            var path = (window.location.hash || '').replace('#', '').split('?')[0];
            if (path) {
                var viewFile = 'views/' + path.replace(/^\//, '') + '.html';
                if (viewFile === 'views/.html') viewFile = 'views/index.html';
                prefetchView(viewFile).catch(function() {});
            }
        });

        log('✅ Init complete');
    }

    // ══════════════════════════════════════════════════════════
    //  19. START
    // ══════════════════════════════════════════════════════════
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[PerfOptimizer] ✅ Ready — ' + VERSION +
                ' | mobile:' + IS_MOBILE +
                ' | slowNet:' + IS_SLOW_NET +
                ' | storage:' + (_isStorageAvailable() ? 'OK' : 'BLOCKED'));
    console.log('[PerfOptimizer] 💡 Debug: window.__PERF.debug()');
    console.log('[PerfOptimizer] ⚡ Priority prefetch active — homepage first');

})();