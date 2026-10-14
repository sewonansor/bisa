/**
 * ============================================================
 *  app.js — Core SPA PAC GP Ansor Kapanewon Sewon
 *  Versi: 38.1.0 — Full Fix + Telegram Mobile UI
 *  ---------------------------------------------------------
 *  CHANGELOG v38.1.0:
 *   + Integrasi bottom nav (Telegram-style) — active state sync
 *   + Badge form notif sync ke bottom nav
 *   + Hapus logika mobile drawer lama (redundant)
 *   + Bottom nav safety: guard saat elemen tidak ada
 *   + Semua fitur v38.0.0 dipertahankan
 *
 *  FITUR v38.0.0:
 *   + Cache version guard (auto-clear stale cache)
 *   + Environment detection (mobile / slow net)
 *   + Adaptive timeout (45s mobile, 20s desktop)
 *   + Skip prefetch di mobile
 *   + JSONP auto-retry (mobile)
 *   + Fetch view retry + timeout
 *   + Quota auto-cleanup (sessionStorage)
 *   + Cache-busting query pada fetch view
 *   + Tailwind CDN fallback detection
 *   + Global error handler
 *   + Polling notifikasi adaptif
 * ============================================================
 */

(function() {
    'use strict';
    if (window.__APP_LOADED) return;
    window.__APP_LOADED = true;

    // ============================================================
    //  1. CACHE VERSION GUARD — Auto-clear stale cache
    // ============================================================
    const CACHE_VERSION = 'v38.1.0_20260101';

    try {
        const storedVer = localStorage.getItem('__cache_version');
        if (storedVer !== CACHE_VERSION) {
            console.warn('[App] 🔄 Cache version:', storedVer || '(none)', '→', CACHE_VERSION);
            console.warn('[App] 🧹 Clearing stale cache...');

            try { sessionStorage.clear(); } catch (e) {}

            try {
                const removeKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (
                        key.startsWith('cache_') ||
                        key.startsWith('__view_') ||
                        key.startsWith('__lastPrefetch') ||
                        key.startsWith('authTab') ||
                        key.startsWith('absensi_draft')
                    )) {
                        removeKeys.push(key);
                    }
                }
                removeKeys.forEach(k => localStorage.removeItem(k));
            } catch (e) {}

            try { localStorage.setItem('__cache_version', CACHE_VERSION); } catch (e) {}
            console.log('[App] ✅ Stale cache cleared');
        } else {
            console.log('[App] ✅ Cache version OK:', storedVer);
        }
    } catch (e) {
        console.warn('[App] Cache check failed:', e);
    }

    // ============================================================
    //  2. ENVIRONMENT DETECTION
    // ============================================================
    const __IS_LOCALHOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);
    const __IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                        || window.matchMedia('(max-width: 767px)').matches;
    const __IS_SLOW_NET = !!(navigator.connection && (
        navigator.connection.saveData ||
        /(^|-)2g$/.test(navigator.connection.effectiveType || '')
    ));

    window.__APP_ENV = {
        isLocalhost: __IS_LOCALHOST,
        isMobile: __IS_MOBILE,
        isSlowNet: __IS_SLOW_NET,
        version: CACHE_VERSION,
        ua: navigator.userAgent.slice(0, 80)
    };
    console.log('[App] ENV:', window.__APP_ENV);

    // ============================================================
    //  3. SAFE STORAGE (dengan quota auto-cleanup)
    // ============================================================
    const SafeStorage = {
        _mem: {}, _ok: null,
        _check() {
            if (this._ok !== null) return this._ok;
            try {
                const k = '__t__';
                localStorage.setItem(k, '1');
                localStorage.removeItem(k);
                this._ok = true;
            } catch (e) { this._ok = false; }
            return this._ok;
        },
        getItem(k) {
            if (this._check()) { try { return localStorage.getItem(k); } catch (e) {} }
            return this._mem['L_' + k] || null;
        },
        setItem(k, v) {
            if (this._check()) { try { localStorage.setItem(k, v); return; } catch (e) {} }
            this._mem['L_' + k] = String(v);
        },
        removeItem(k) {
            if (this._check()) { try { localStorage.removeItem(k); } catch (e) {} }
            delete this._mem['L_' + k];
        },
        clear() {
            if (this._check()) { try { localStorage.clear(); } catch (e) {} }
            this._mem = {};
        }
    };

    const SafeSessionStorage = {
        _mem: {}, _ok: null,
        _check() {
            if (this._ok !== null) return this._ok;
            try {
                const k = '__t__';
                sessionStorage.setItem(k, '1');
                sessionStorage.removeItem(k);
                this._ok = true;
            } catch (e) { this._ok = false; }
            return this._ok;
        },
        getItem(k) {
            if (this._check()) { try { return sessionStorage.getItem(k); } catch (e) {} }
            return this._mem['S_' + k] || null;
        },
        setItem(k, v) {
            if (this._check()) {
                try {
                    sessionStorage.setItem(k, v);
                    return;
                } catch (e) {
                    // ✅ Quota auto-cleanup
                    if (String(e).toLowerCase().indexOf('quota') > -1 ||
                        e.name === 'QuotaExceededError') {
                        console.warn('[SafeStorage] Quota exceeded — cleaning old cache');
                        try {
                            const keys = [];
                            for (let i = 0; i < sessionStorage.length; i++) {
                                const key = sessionStorage.key(i);
                                if (key && (key.startsWith('__view_') || key.startsWith('cache_'))) {
                                    keys.push(key);
                                }
                            }
                            keys.slice(0, Math.ceil(keys.length / 2))
                                .forEach(key => sessionStorage.removeItem(key));
                            sessionStorage.setItem(k, v);
                            return;
                        } catch (e2) {
                            console.warn('[SafeStorage] Still quota exceeded');
                        }
                    }
                    this._mem['S_' + k] = String(v);
                }
                return;
            }
            this._mem['S_' + k] = String(v);
        },
        removeItem(k) {
            if (this._check()) { try { sessionStorage.removeItem(k); } catch (e) {} }
            delete this._mem['S_' + k];
        },
        clear() {
            if (this._check()) { try { sessionStorage.clear(); } catch (e) {} }
            this._mem = {};
        }
    };

    window.SafeStorage = SafeStorage;
    window.SafeSessionStorage = SafeSessionStorage;

    // ============================================================
    //  4. KONFIGURASI
    // ============================================================
    const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzGF_EirYYL08RLQOY2bWvRoRbzt1R-5op0EednrtExhOgjqOXkf3Ww7KZp_nVREs6guQ/exec';
    const API_TIMEOUT = (__IS_MOBILE || __IS_SLOW_NET) ? 45000 : 20000;
    const POST_SIZE_THRESHOLD = 1500;
    const DEBOUNCE_DELAY = 500;
    const DEBUG = false;
    const PREFETCH_CONCURRENCY = 3;
    const PREFETCH_DATA_CONCURRENCY = 2;

    const CACHE_TTL_DYNAMIC = 10 * 60 * 1000;
    const CACHE_TTL_SEMI_STATIC = 30 * 60 * 1000;
    const CACHE_TTL_ABSENSI = 5 * 60 * 1000;
    const CACHE_TTL_PREFETCH = 15 * 60 * 1000;
    const CACHE_TTL_FORMS = 2 * 60 * 1000;

    // DEV mode hanya aktif di localhost
    window.__DEV_NO_VIEW_CACHE = __IS_LOCALHOST;

    const PREFETCH_SKIP_WINDOW = window.__DEV_NO_VIEW_CACHE ? 0 : 5 * 60 * 1000;

    const log = (...a) => { if (DEBUG) console.log('[App]', ...a); };
    const warn = (...a) => { if (DEBUG) console.warn('[App]', ...a); };

    // ============================================================
    //  5. STATE
    // ============================================================
    const _pending = {};
    const _cacheTimestamps = {};
    const loadedLibs = new Set();
    const loadingLibs = {};
    const loadedScripts = new Set();
    const viewCache = new Map();
    let __skipNextHashChange = null;
    let __formNotifTimer = null;

    const prefetchState = {
        isPrefetching: false,
        completed: 0,
        total: 0,
        dataCompleted: 0,
        dataTotal: 0,
        role: null,
        lastPrefetchAt: 0
    };

    // ============================================================
    //  6. ROUTE DATA ENDPOINTS MAP
    // ============================================================
    const ROUTE_DATA_ENDPOINTS = {
        '/':                ['getProfil', 'getStruktur', 'getBerita', 'getGaleri', 'getLogbook', 'getEvents', 'getArsip', 'getUsers'],
        '/profil':          ['getProfil', 'getStruktur'],
        '/kegiatan':        ['getLogbook'],
        '/semua_berita':    ['getBerita', 'getUsers'],
        '/semua_kegiatan':  ['getLogbook'],
        '/anggota':         ['getUsers'],
        '/dokumen':         ['getArsip'],
        '/kalender':        ['getLogbook', 'getEvents'],
        '/arsip':           ['getArsip'],
        '/keuangan':        ['getKeuanganPublik'],
        '/tokoh':           ['getTokoh'],
        '/absensi':         ['getQrConfig', 'getAbsensi'],
        '/form_view':       ['getForms', 'getFormFields'],
        '/dashboard_admin': ['getSurat', 'getLogbook', 'getUsers', 'getKeuangan'],
        '/surat_admin':     ['getSurat'],
        '/logbook_admin':   ['getLogbook'],
        '/berita_admin':    ['getBerita'],
        '/anggota_admin':   ['getUsers', 'getPendingUsers'],
        '/kader_admin':     ['getUsers'],
        '/profil_admin':    ['getProfil', 'getStruktur', 'getPhotoPositions'],
        '/tokoh_admin':     ['getTokoh'],
        '/arsip_admin':     ['getArsip'],
        '/kalender_admin':  ['getLogbook', 'getEvents'],
        '/galeri_admin':    ['getGaleri'],
        '/keuangan_admin':  ['getKeuangan'],
        '/inventaris_admin':['getInventaris', 'getPeminjaman'],
        '/proker_admin':    ['getProgramKerja'],
        '/forum_admin':     ['getForumTopics', 'getForumComments'],
        '/absensi_admin':   ['getQrConfig', 'getAbsensi'],
        '/ringkasan':       ['getSurat', 'getLogbook', 'getKeuangan'],
        '/forms_admin':     ['getForms', 'getFormResponses', 'getFormNotifications'],
        '/form_responses':  ['getForms', 'getFormResponses', 'getFormFields'],
        '/dashboard_member':['getSurat', 'getLogbook'],
        '/surat_member':    ['getSurat'],
        '/logbook_member':  ['getLogbook']
    };

    // ============================================================
    //  7. LIB MAP
    // ============================================================
    const LIB_MAP = {
        aos:          { js:'https://unpkg.com/aos@2.3.1/dist/aos.js',
                        css:'https://unpkg.com/aos@2.3.1/dist/aos.css',
                        jsFallback:'https://cdn.jsdelivr.net/npm/aos@2.3.1/dist/aos.js',
                        cssFallback:'https://cdn.jsdelivr.net/npm/aos@2.3.1/dist/aos.css' },
        swiper:       { js:'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
                        css:'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
                        jsFallback:'https://unpkg.com/swiper@11/swiper-bundle.min.js',
                        cssFallback:'https://unpkg.com/swiper@11/swiper-bundle.min.css' },
        fullcalendar: { js:'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js',
                        css:'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.css',
                        jsFallback:'https://unpkg.com/fullcalendar@6.1.8/index.global.min.js',
                        cssFallback:'https://unpkg.com/fullcalendar@6.1.8/index.global.min.css' },
        quill:        { js:'https://cdn.quilljs.com/1.3.6/quill.min.js',
                        css:'https://cdn.quilljs.com/1.3.6/quill.snow.css',
                        jsFallback:'https://cdn.jsdelivr.net/npm/quill@1.3.6/dist/quill.min.js',
                        cssFallback:'https://cdn.jsdelivr.net/npm/quill@1.3.6/dist/quill.snow.css' },
        jsplumb:      { js:'https://cdn.jsdelivr.net/npm/jsplumb@2.15.6/dist/js/jsplumb.min.js',
                        jsFallback:'https://unpkg.com/jsplumb@2.15.6/dist/js/jsplumb.min.js' },
        interact:     { js:'https://cdn.jsdelivr.net/npm/interactjs@1.10.27/dist/interact.min.js',
                        jsFallback:'https://unpkg.com/interactjs@1.10.27/dist/interact.min.js' },
        qrcode:       { js:'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
                        jsFallback:'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js' },
        jsbarcode:    { js:'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
                        jsFallback:'https://unpkg.com/jsbarcode@3.11.6/dist/JsBarcode.all.min.js' },
        html2canvas:  { js:'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
                        jsFallback:'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js' },
        jspdf:        { js:'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                        jsFallback:'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js' },
        docx:         { js:'https://cdnjs.cloudflare.com/ajax/libs/docx/8.2.0/docx.min.js',
                        jsFallback:'https://cdn.jsdelivr.net/npm/docx@8.2.0/build/index.umd.js' }
    };

    function loadScriptFile(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Gagal load: ' + src));
            document.head.appendChild(s);
        });
    }

    function loadCssFile(href) {
        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = () => resolve();
            document.head.appendChild(link);
        });
    }

    async function loadLib(libName) {
        if (loadedLibs.has(libName)) return;
        if (loadingLibs[libName]) return loadingLibs[libName];
        const lib = LIB_MAP[libName];
        if (!lib) { warn('Lib tidak dikenal:', libName); return; }

        loadingLibs[libName] = (async () => {
            const tasks = [];
            if (lib.css) {
                tasks.push((async () => {
                    try { await loadCssFile(lib.css); }
                    catch (e) { if (lib.cssFallback) await loadCssFile(lib.cssFallback).catch(()=>{}); }
                })());
            }
            if (lib.js) {
                tasks.push((async () => {
                    try { await loadScriptFile(lib.js); }
                    catch (e) {
                        if (lib.jsFallback) await loadScriptFile(lib.jsFallback);
                        else throw e;
                    }
                })());
            }
            await Promise.all(tasks);
            loadedLibs.add(libName);
            delete loadingLibs[libName];
            log('Lib loaded:', libName);
        })();

        return loadingLibs[libName];
    }

    // ============================================================
    //  8. CACHE TTL
    // ============================================================
    function getCacheTTL(action) {
        const a = String(action || '').toLowerCase();
        if (a.includes('qr') || a.includes('password') || a.includes('setting')) return 0;
        if (a.includes('absensi')) return CACHE_TTL_ABSENSI;
        if (a.includes('form') || a.includes('notification')) return CACHE_TTL_FORMS;
        if (a.includes('profil') || a.includes('struktur') ||
            a.includes('photoposition') || a.includes('tokoh')) return CACHE_TTL_SEMI_STATIC;
        return CACHE_TTL_DYNAMIC;
    }

    // ============================================================
    //  9. UTILITIES
    // ============================================================
    function safeParseUser() {
        const raw = SafeStorage.getItem('user');
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    const checkAuth = safeParseUser;

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatRupiah(a) {
        if (a === null || a === undefined || a === '') return 'Rp 0';
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(Number(a) || 0);
    }

    function startLoading(btn, text) {
        if (!btn || !btn.classList) return;
        text = text || 'Memproses...';
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
        btn.classList.add('btn-loading');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ' + text;
    }

    function stopLoading(btn) {
        if (!btn || !btn.classList) return;
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
            delete btn.dataset.originalText;
        }
    }

    const debounceMap = {};
    function debounceEvent(action, callback, delay) {
        if (debounceMap[action]) clearTimeout(debounceMap[action]);
        debounceMap[action] = setTimeout(() => {
            delete debounceMap[action];
            callback();
        }, delay || DEBOUNCE_DELAY);
    }

    function showToast(msg, type, dur) {
        type = type || 'info';
        dur = dur || 4000;
        try {
            const old = document.querySelector('.global-toast');
            if (old) old.remove();
            const colors = {
                success: 'bg-green-600',
                error: 'bg-red-600',
                info: 'bg-blue-600',
                warning: 'bg-yellow-500'
            };
            const icons = {
                success: 'check-circle',
                error: 'exclamation-circle',
                info: 'info-circle',
                warning: 'exclamation-triangle'
            };
            const t = document.createElement('div');
            t.className = 'global-toast fixed top-6 right-6 z-[99999] px-6 py-4 rounded-xl shadow-2xl text-white font-medium text-sm ' +
                (colors[type] || 'bg-blue-600') + ' transform translate-x-full transition-transform duration-300 ease-out';
            t.innerHTML = '<i class="fas fa-' + (icons[type] || 'info-circle') + ' mr-2"></i> ' + escapeHtml(msg);
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.remove('translate-x-full'));
            setTimeout(() => {
                t.classList.add('translate-x-full');
                setTimeout(() => t.remove(), 300);
            }, dur);
        } catch (e) {}
    }

    function showConfirm(message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        if (!modal) {
            if (window.confirm(message)) onConfirm();
            return;
        }
        const textEl = document.getElementById('confirm-text');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        if (textEl) textEl.textContent = message;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        const cleanup = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };
        okBtn.onclick = () => { cleanup(); onConfirm(); };
        cancelBtn.onclick = cleanup;
    }

    async function uploadFileToDrive(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    const result = await apiCall('uploadFile', 'POST', {
                        fileName: file.name,
                        mimeType: file.type,
                        base64Data: base64Data
                    });
                    resolve(result);
                } catch (err) {
                    resolve({ success: false, message: err.message });
                }
            };
            reader.onerror = () => resolve({ success: false, message: 'Gagal baca file' });
            reader.readAsDataURL(file);
        });
    }

    async function logActivity(action, module, targetId, details) {
        const user = safeParseUser();
        try {
            return await apiCall('createAuditLog', 'POST', {
                userId: user ? user.id : 'System',
                username: user ? user.username : 'System',
                action: action,
                module: module,
                targetId: targetId || '',
                details: details
            });
        } catch (e) { return { success: false }; }
    }

    function autoHideSkeleton(skeletonId, contentId, delay) {
        delay = delay || 800;
        const sk = document.getElementById(skeletonId);
        const ct = document.getElementById(contentId);
        if (!sk || !ct) return;
        setTimeout(() => {
            sk.classList.add('hidden');
            ct.classList.remove('hidden');
        }, delay);
    }

    function getCachedData(action, data) {
        const user = safeParseUser();
        if (!user) return null;
        data = data || {};
        const cKey = 'cache_' + action + '_' + user.id + '_' + JSON.stringify(data);
        const cached = SafeSessionStorage.getItem(cKey);
        if (!cached) return null;
        try {
            const parsed = JSON.parse(cached);
            const ttl = getCacheTTL(action);
            if (Date.now() - parsed._timestamp < ttl) {
                return parsed.data;
            }
        } catch (e) {}
        return null;
    }

    function isValidCachedHtml(html) {
        if (!html || typeof html !== 'string') return false;
        if (html.length < 100) return false;
        if (!html.includes('<') || !html.includes('>')) return false;
        if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(html)) return false;
        return true;
    }

    // ============================================================
    //  10. PREFETCH (skip di mobile)
    // ============================================================
    async function prefetchRoutes(role, force) {
        force = force || false;

        // ⚡ SKIP di mobile/slow network
        if (__IS_MOBILE || __IS_SLOW_NET) {
            console.log('[Prefetch] SKIP — mobile/slow network detected');
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('prefetchStart', {
                    detail: { role, total: 0 }
                }));
                window.dispatchEvent(new CustomEvent('prefetchComplete', {
                    detail: {
                        role, completed: 0, total: 0,
                        dataCompleted: 0, dataTotal: 0, skipped: true
                    }
                }));
            }, 100);
            return;
        }

        if (!force) {
            const lastTime = SafeSessionStorage.getItem('__lastPrefetch');
            const lastRole = SafeSessionStorage.getItem('__lastPrefetchRole');
            if (lastTime && lastRole === role && PREFETCH_SKIP_WINDOW > 0) {
                const ageMs = Date.now() - parseInt(lastTime, 10);
                if (ageMs < PREFETCH_SKIP_WINDOW) {
                    const ageSec = Math.round(ageMs / 1000);
                    console.log('[Prefetch] Skip — sudah di-prefetch ' + ageSec + 's lalu');
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('prefetchStart', { detail: { role, total: 0 } }));
                        window.dispatchEvent(new CustomEvent('prefetchComplete', {
                            detail: { role, completed: 0, total: 0, dataCompleted: 0, dataTotal: 0, fromCache: true }
                        }));
                    }, 100);
                    return;
                }
            }
        }

        if (prefetchState.isPrefetching) {
            console.log('[Prefetch] Sedang berjalan, skip.');
            return;
        }

        const routes = Object.entries(ROUTES).filter(([path, r]) => {
            if (role === 'admin') return r.layout === 'admin';
            if (role === 'member') return r.layout === 'member';
            return false;
        });

        if (routes.length === 0) return;

        prefetchState.isPrefetching = true;
        prefetchState.completed = 0;
        prefetchState.total = routes.length;
        prefetchState.dataCompleted = 0;
        prefetchState.dataTotal = 0;
        prefetchState.role = role;

        console.log('[Prefetch] Mulai ' + routes.length + ' halaman untuk: ' + role);

        window.dispatchEvent(new CustomEvent('prefetchStart', {
            detail: { role, total: routes.length }
        }));

        if (force) { clearPrefetchCache(); }

        // STAGE 1: View + Script
        const queue = [...routes];
        const workers = [];

        for (let i = 0; i < PREFETCH_CONCURRENCY; i++) {
            workers.push((async () => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (!item) break;
                    const [path, route] = item;

                    try {
                        if (!viewCache.has(route.file)) {
                            const cachedHtml = SafeSessionStorage.getItem('__view_' + route.file);
                            if (isValidCachedHtml(cachedHtml)) {
                                viewCache.set(route.file, cachedHtml);
                            } else {
                                if (cachedHtml) {
                                    SafeSessionStorage.removeItem('__view_' + route.file);
                                }
                                try {
                                    const res = await fetch(route.file);
                                    if (res.ok) {
                                        const html = await res.text();
                                        viewCache.set(route.file, html);
                                        if (!window.__DEV_NO_VIEW_CACHE) {
                                            try {
                                                SafeSessionStorage.setItem('__view_' + route.file, html);
                                            } catch (quotaErr) {
                                                console.warn('[Prefetch] Cache quota exceeded:', route.file);
                                            }
                                        }
                                    }
                                } catch (e) {}
                            }
                        }

                        if (route.js && !loadedScripts.has(route.js)) {
                            try { await loadScript(route.js); } catch (e) {}
                        }

                        if (route.libs && route.libs.length > 0) {
                            const lightLibs = route.libs.filter(l => ['aos','swiper','qrcode'].includes(l));
                            lightLibs.forEach(lib => { loadLib(lib).catch(() => {}); });
                        }

                        prefetchState.completed++;
                        window.dispatchEvent(new CustomEvent('prefetchProgress', {
                            detail: {
                                completed: prefetchState.completed,
                                total: prefetchState.total,
                                current: path
                            }
                        }));
                    } catch (e) {
                        prefetchState.completed++;
                    }
                }
            })());
        }

        await Promise.all(workers);
        console.log('[Prefetch] View+Script selesai — ' + prefetchState.completed + '/' + prefetchState.total);

        // STAGE 2: Data endpoints
        const uniqueEndpoints = new Set();
        routes.forEach(([path]) => {
            const endpoints = ROUTE_DATA_ENDPOINTS[path] || [];
            endpoints.forEach(e => {
                if (getCacheTTL(e) > 0) uniqueEndpoints.add(e);
            });
        });

        const dataQueue = Array.from(uniqueEndpoints);
        prefetchState.dataTotal = dataQueue.length;

        const currentUser = safeParseUser();

        if (!currentUser) {
            console.warn('[Prefetch] User tidak ditemukan, skip prefetch data');
            prefetchState.dataCompleted = prefetchState.dataTotal;
        } else if (dataQueue.length > 0) {
            console.log('[Prefetch] Mulai prefetch ' + dataQueue.length + ' endpoint');

            window.dispatchEvent(new CustomEvent('prefetchDataStart', {
                detail: { total: dataQueue.length }
            }));

            const dataQueueCopy = [...dataQueue];
            const dataWorkers = [];

            for (let i = 0; i < PREFETCH_DATA_CONCURRENCY; i++) {
                dataWorkers.push((async () => {
                    while (dataQueueCopy.length > 0) {
                        const action = dataQueueCopy.shift();
                        if (!action) break;

                        try {
                            const cKey = 'cache_' + action + '_' + currentUser.id + '_' + JSON.stringify({});
                            const cached = SafeSessionStorage.getItem(cKey);

                            if (cached) {
                                try {
                                    const parsed = JSON.parse(cached);
                                    if (Date.now() - parsed._timestamp < CACHE_TTL_PREFETCH) {
                                        prefetchState.dataCompleted++;
                                        window.dispatchEvent(new CustomEvent('prefetchDataProgress', {
                                            detail: {
                                                completed: prefetchState.dataCompleted,
                                                total: prefetchState.dataTotal,
                                                current: action
                                            }
                                        }));
                                        continue;
                                    }
                                } catch (e) {}
                            }

                            await new Promise((resolve) => {
                                const cbName = 'pd_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
                                const payload = {
                                    action: action,
                                    userId: currentUser.id,
                                    role: currentUser.role,
                                    callback: cbName
                                };
                                const qs = Object.keys(payload)
                                    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] == null ? '' : payload[k]))
                                    .join('&');

                                let responded = false;
                                const script = document.createElement('script');
                                const cleanup = () => {
                                    try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
                                    try { delete window[cbName]; } catch (e) {}
                                };

                                window[cbName] = function(responseData) {
                                    if (responded) return;
                                    responded = true;
                                    cleanup();
                                    clearTimeout(timer);
                                    if (responseData && responseData.success) {
                                        trySaveCacheRaw(cKey, responseData);
                                    }
                                    resolve();
                                };

                                const timer = setTimeout(() => {
                                    if (responded) return;
                                    responded = true;
                                    cleanup();
                                    resolve();
                                }, API_TIMEOUT);

                                script.onerror = function() {
                                    if (responded) return;
                                    responded = true;
                                    cleanup();
                                    clearTimeout(timer);
                                    resolve();
                                };

                                script.src = API_BASE_URL + '?' + qs;
                                document.head.appendChild(script);
                            });

                            prefetchState.dataCompleted++;
                            window.dispatchEvent(new CustomEvent('prefetchDataProgress', {
                                detail: {
                                    completed: prefetchState.dataCompleted,
                                    total: prefetchState.dataTotal,
                                    current: action
                                }
                            }));

                        } catch (e) {
                            prefetchState.dataCompleted++;
                        }
                    }
                })());
            }

            await Promise.all(dataWorkers);
        }

        console.log('[Prefetch] Data selesai — ' + prefetchState.dataCompleted + '/' + prefetchState.dataTotal);

        prefetchState.isPrefetching = false;
        prefetchState.lastPrefetchAt = Date.now();

        SafeSessionStorage.setItem('__lastPrefetch', String(Date.now()));
        SafeSessionStorage.setItem('__lastPrefetchRole', role);

        console.log('[Prefetch] SEMUA SELESAI — View: ' + prefetchState.completed + '/' + prefetchState.total + ', Data: ' + prefetchState.dataCompleted + '/' + prefetchState.dataTotal);

        window.dispatchEvent(new CustomEvent('prefetchComplete', {
            detail: {
                role,
                completed: prefetchState.completed,
                total: prefetchState.total,
                dataCompleted: prefetchState.dataCompleted,
                dataTotal: prefetchState.dataTotal
            }
        }));
    }

    function clearPrefetchCache() {
        viewCache.clear();
        try {
            const keys = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith('__view_')) keys.push(k);
            }
            keys.forEach(k => sessionStorage.removeItem(k));
            sessionStorage.removeItem('__lastPrefetch');
            sessionStorage.removeItem('__lastPrefetchRole');
        } catch (e) {}
        console.log('[Prefetch] View cache dibersihkan');
    }

    function resetPrefetchCache() {
        clearPrefetchCache();
        console.log('[Prefetch] Cache di-reset total');
    }

    // ============================================================
    //  11. API CORE
    // ============================================================
    function apiCall(action, method, data) {
        method = method || 'POST';
        data = data || {};
        return new Promise((resolve) => {
            try {
                const user = safeParseUser();
                const payload = Object.assign({ action: action }, data);
                if (user) {
                    payload.userId = user.id;
                    payload.role = user.role;
                }

                const isGet = /^get|^check/i.test(action);
                const cKey = isGet && user ? 'cache_' + action + '_' + user.id + '_' + JSON.stringify(data) : null;
                const ttl = getCacheTTL(action);

                if (isGet && cKey && ttl > 0) {
                    const cached = SafeSessionStorage.getItem(cKey);
                    if (cached) {
                        try {
                            const parsed = JSON.parse(cached);
                            if (Date.now() - parsed._timestamp < ttl) {
                                log('CACHE hit:', action);
                                resolve(parsed.data);
                                if (!_cacheTimestamps[cKey] || Date.now() - _cacheTimestamps[cKey] > ttl * 0.8) {
                                    _cacheTimestamps[cKey] = Date.now();
                                    backgroundRefresh(action, payload, cKey);
                                }
                                return;
                            }
                        } catch (e) {}
                    }
                }

                const dataHash = JSON.stringify(data || {}).slice(0, 120);
                const pKey = cKey || (action + '::' + dataHash);
                if (_pending[pKey]) {
                    _pending[pKey].then(resolve).catch(resolve);
                    return;
                }

                const payloadSize = JSON.stringify(payload).length;
                const needsPost = !!data.base64Data || payloadSize > POST_SIZE_THRESHOLD;

                const promise = needsPost
                    ? postRequest(payload)
                    : new Promise((res) => jsonpRequest(payload, cKey, res));

                _pending[pKey] = promise;
                promise.finally(() => { delete _pending[pKey]; });
                promise.then(resolve).catch(err => {
                    console.error('apiCall error:', action, err);
                    resolve({ success: false, message: 'Error: ' + err.message });
                });
            } catch (err) {
                console.error('apiCall exception:', err);
                resolve({ success: false, message: 'Error: ' + err.message });
            }
        });
    }

    async function postRequest(payload) {
        try {
            const res = await fetch(API_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                redirect: 'follow'
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const text = await res.text();
            try {
                const json = JSON.parse(text);
                if (json.success && payload.action && /^get/i.test(payload.action)) {
                    trySaveCache(payload, json);
                }
                return json;
            } catch (e) {
                return { success: false, message: 'Response bukan JSON' };
            }
        } catch (err) {
            return new Promise((resolve) => jsonpRequest(payload, null, resolve));
        }
    }

    function jsonpRequest(payload, cacheKey, resolve) {
        const cbName = 'gasCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        payload.callback = cbName;
        const qs = Object.keys(payload)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] == null ? '' : payload[k]))
            .join('&');

        let responded = false;
        const script = document.createElement('script');

        const cleanup = () => {
            try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
            try { delete window[cbName]; } catch (e) {}
        };

        window[cbName] = function(responseData) {
            if (responded) return;
            responded = true;
            cleanup();
            clearTimeout(timer);
            if (responseData && responseData.success && cacheKey) {
                trySaveCacheRaw(cacheKey, responseData);
            }
            resolve(responseData || { success: false, message: 'Empty response' });
        };

        const timer = setTimeout(() => {
            if (responded) return;
            responded = true;
            cleanup();
            resolve({ success: false, message: 'Server tidak merespon (timeout).' });
        }, API_TIMEOUT);

        script.onerror = function() {
            if (responded) return;
            responded = true;
            cleanup();
            clearTimeout(timer);

            // ✅ Auto-retry 1x untuk mobile
            if (__IS_MOBILE && !payload._retried) {
                console.warn('[JSONP] Retry:', payload.action);
                payload._retried = true;
                setTimeout(() => jsonpRequest(payload, cacheKey, resolve), 800);
                return;
            }

            resolve({ success: false, message: 'Gagal terhubung ke server.' });
        };

        script.src = API_BASE_URL + '?' + qs;
        document.head.appendChild(script);
    }

    function trySaveCache(payload, response) {
        const user = safeParseUser();
        if (!user) return;
        const action = payload.action;
        const data = Object.keys(payload)
            .filter(k => !['action','userId','role','callback','_retried'].includes(k))
            .reduce((acc, k) => {
                acc[k] = payload[k];
                return acc;
            }, {});
        trySaveCacheRaw('cache_' + action + '_' + user.id + '_' + JSON.stringify(data), response);
    }

    function trySaveCacheRaw(cKey, response) {
        try {
            SafeSessionStorage.setItem(cKey, JSON.stringify({
                data: response,
                _timestamp: Date.now()
            }));
            window.dispatchEvent(new CustomEvent('dataUpdated', {
                detail: { data: response, source: 'api' }
            }));
        } catch (e) {}
    }

    function backgroundRefresh(action, payload, cacheKey) {
        const cbName = 'bg_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        const bgPayload = Object.assign({}, payload, { callback: cbName });
        const qs = Object.keys(bgPayload)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(bgPayload[k] == null ? '' : bgPayload[k]))
            .join('&');

        let responded = false;
        const script = document.createElement('script');

        window[cbName] = function(responseData) {
            if (responded) return;
            responded = true;
            try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
            try { delete window[cbName]; } catch (e) {}
            clearTimeout(timer);
            if (responseData && responseData.success && cacheKey) {
                trySaveCacheRaw(cacheKey, responseData);
            }
        };

        const timer = setTimeout(() => {
            if (responded) return;
            responded = true;
            try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
            try { delete window[cbName]; } catch (e) {}
        }, API_TIMEOUT);

        script.src = API_BASE_URL + '?' + qs;
        document.head.appendChild(script);
    }

    // ============================================================
    //  12. forceRefreshData
    // ============================================================
    function forceRefreshData(action, data) {
        data = data || {};

        const shouldBypass = data.__fresh === true;
        const cleanData = Object.assign({}, data);
        delete cleanData.__fresh;

        if (!shouldBypass) {
            const user = safeParseUser();
            if (user) {
                const cKey = 'cache_' + action + '_' + user.id + '_' + JSON.stringify(cleanData);
                const cached = SafeSessionStorage.getItem(cKey);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        const ttl = getCacheTTL(action);
                        if (ttl > 0 && Date.now() - parsed._timestamp < ttl) {
                            console.log('[forceRefreshData] ' + action + ' dari cache');
                            return Promise.resolve(parsed.data);
                        }
                    } catch (e) {}
                }
            }
        }

        return new Promise((resolve) => {
            try {
                const user = safeParseUser();
                const payload = Object.assign({ action: action }, cleanData);
                if (user) {
                    payload.userId = user.id;
                    payload.role = user.role;
                }

                const cKey = user ? 'cache_' + action + '_' + user.id + '_' + JSON.stringify(cleanData) : null;
                if (cKey) {
                    SafeSessionStorage.removeItem(cKey);
                    delete _cacheTimestamps[cKey];
                }

                const payloadSize = JSON.stringify(payload).length;
                const needsPost = !!cleanData.base64Data || payloadSize > POST_SIZE_THRESHOLD;

                if (needsPost) {
                    postRequest(payload).then(resolve).catch(err => resolve({ success: false, message: err.message }));
                } else {
                    jsonpRequest(payload, cKey, resolve);
                }
            } catch (err) {
                resolve({ success: false, message: err.message });
            }
        });
    }

    // ============================================================
    //  13. DARK MODE
    // ============================================================
    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        document.querySelectorAll('.theme-icon-moon').forEach(el => el.classList.toggle('hidden', !isDark));
        document.querySelectorAll('.theme-icon-sun').forEach(el => el.classList.toggle('hidden', isDark));
    }

    function initDarkMode() {
        applyTheme(SafeStorage.getItem('color-theme') || 'light');
    }

    // ============================================================
    //  14. LOGOUT
    // ============================================================
    function logout() {
        SafeStorage.removeItem('user');
        SafeSessionStorage.clear();
        clearPrefetchCache();
        stopFormNotificationPolling();
        Object.keys(window).forEach(k => {
            if (k.startsWith('__') && (k.endsWith('Loaded') || k.endsWith('Init'))) {
                try { window[k] = false; } catch (e) {}
            }
        });
        router.load('/');
    }

    // ============================================================
    //  15. MODULE REGISTRY
    // ============================================================
    const App = {
        _modules: {},
        register(name, initFn) {
            this._modules[name] = initFn;
            log('Registered:', name);
        },
        run(name) {
            if (!this._modules[name]) {
                warn('Modul tidak ditemukan:', name);
                return;
            }
            try {
                this._modules[name]();
            } catch (err) {
                console.error('[App] Error in module ' + name + ':', err);
            }
        },
        clear() { this._modules = {}; }
    };

    // ============================================================
    //  16. ROUTES
    // ============================================================
    const ROUTES = {
        '/':                { layout:'public', file:'views/index.html', js:'js/index.js',
                              libs:['aos','swiper','fullcalendar','jsplumb'] },
        '/profil':          { layout:'public', file:'views/profil.html', js:'js/profil.js', libs:['jsplumb','aos'] },
        '/kegiatan':        { layout:'public', file:'views/kegiatan.html', js:'js/kegiatan.js' },
        '/semua_berita':    { layout:'public', file:'views/semua_berita.html', js:'js/semua_berita.js' },
        '/berita_detail':   { layout:'public', file:'views/berita_detail.html', js:'js/berita_detail.js' },
        '/semua_kegiatan':  { layout:'public', file:'views/semua_kegiatan.html', js:'js/semua_kegiatan.js' },
        '/kegiatan_detail': { layout:'public', file:'views/kegiatan_detail.html', js:'js/kegiatan_detail.js' },
        '/anggota':         { layout:'public', file:'views/anggota.html', js:'js/anggota.js' },
        '/dokumen':         { layout:'public', file:'views/dokumen.html', js:'js/dokumen.js' },
        '/kalender':        { layout:'public', file:'views/kalender.html', js:'js/kalender.js', libs:['fullcalendar'] },
        '/arsip':           { layout:'public', file:'views/arsip.html', js:'js/arsip.js' },
        '/keuangan':        { layout:'public', file:'views/keuangan.html', js:'js/keuangan.js' },
        '/tokoh':           { layout:'public', file:'views/tokoh.html', js:'js/tokoh.js' },
        '/absensi':         { layout:'public', file:'views/absensi.html', js:'js/absensi.js', libs:['qrcode'] },
        '/kontak':          { layout:'public', file:'views/kontak.html', libs:['aos'] },
        '/form_view':       { layout:'public', file:'views/form_view.html', js:'js/form_view.js' },
        '/auth':            { layout:'auth', file:'views/auth.html', js:'js/auth.js' },
        '/dashboard_admin': { layout:'admin', file:'views/dashboard_admin.html', js:'js/dashboard_admin.js' },
        '/surat_admin':     { layout:'admin', file:'views/surat_admin.html', js:'js/surat_admin.js' },
        '/surat_preview':   { layout:'admin', file:'views/surat_preview.html', js:'js/surat_preview.js' },
        '/logbook_admin':   { layout:'admin', file:'views/logbook_admin.html', js:'js/logbook_admin.js' },
        '/logbook_report':  { layout:'admin', file:'views/logbook_report.html', js:'js/logbook_report.js',
                              libs:['html2canvas','jspdf','docx'] },
        '/ringkasan':       { layout:'admin', file:'views/ringkasan.html', js:'js/ringkasan.js' },
        '/berita_admin':    { layout:'admin', file:'views/berita_admin.html', js:'js/berita_admin.js' },
        '/anggota_admin':   { layout:'admin', file:'views/anggota_admin.html', js:'js/anggota_admin.js' },
        '/kader_admin':     { layout:'admin', file:'views/kader_admin.html', js:'js/kader_admin.js' },
        '/profil_admin':    { layout:'admin', file:'views/profil_admin.html', js:'js/profil_admin.js',
                              libs:['jsplumb','interact'] },
        '/tokoh_admin':     { layout:'admin', file:'views/tokoh_admin.html', js:'js/tokoh_admin.js' },
        '/arsip_admin':     { layout:'admin', file:'views/arsip_admin.html', js:'js/arsip_admin.js' },
        '/kalender_admin':  { layout:'admin', file:'views/kalender_admin.html', js:'js/kalender_admin.js',
                              libs:['fullcalendar'] },
        '/galeri_admin':    { layout:'admin', file:'views/galeri_admin.html', js:'js/galeri_admin.js' },
        '/keuangan_admin':  { layout:'admin', file:'views/keuangan_admin.html', js:'js/keuangan_admin.js' },
        '/inventaris_admin':{ layout:'admin', file:'views/inventaris_admin.html', js:'js/inventaris_admin.js',
                              libs:['jsbarcode'] },
        '/proker_admin':    { layout:'admin', file:'views/proker_admin.html', js:'js/proker_admin.js' },
        '/forum_admin':     { layout:'admin', file:'views/forum_admin.html', js:'js/forum_admin.js' },
        '/absensi_admin':   { layout:'admin', file:'views/absensi_admin.html', js:'js/absensi_admin.js',
                              libs:['qrcode'] },
        '/forms_admin':     { layout:'admin', file:'views/forms_admin.html', js:'js/forms_admin.js', libs:['qrcode'] },
        '/form_responses':  { layout:'admin', file:'views/form_responses.html', js:'js/form_responses.js' },
        '/dashboard_member':{ layout:'member', file:'views/dashboard_member.html', js:'js/dashboard_member.js' },
        '/surat_member':    { layout:'member', file:'views/surat_member.html', js:'js/surat_member.js' },
        '/logbook_member':  { layout:'member', file:'views/logbook_member.html', js:'js/logbook_member.js',
                              libs:['html2canvas','jspdf','docx'] }
    };

    // ============================================================
    //  17. SCRIPT LOADER
    // ============================================================
    function loadScript(src) {
        if (loadedScripts.has(src)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => {
                loadedScripts.add(src);
                resolve();
            };
            s.onerror = () => reject(new Error('Gagal load: ' + src));
            document.head.appendChild(s);
        });
    }

    // ============================================================
    //  18. EXECUTE SCRIPTS (tahan error)
    // ============================================================
    function executeScripts(container) {
        const scripts = container.querySelectorAll('script');
        let successCount = 0;
        let failCount = 0;

        scripts.forEach(oldScript => {
            const code = oldScript.textContent;
            if (!code || !code.trim()) return;

            const hasCorruptChar = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(code);

            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            newScript.textContent = code;

            if (newScript.src) {
                try {
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                    successCount++;
                } catch (e) {
                    console.warn('[App] External script error:', e.message);
                    failCount++;
                }
                return;
            }

            if (hasCorruptChar) {
                console.warn('[App] Corrupt script skipped');
                failCount++;
                try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                return;
            }

            try {
                oldScript.parentNode.replaceChild(newScript, oldScript);
                successCount++;
            } catch (replaceErr) {
                console.warn('[App] Fallback to Function():', replaceErr.message);
                try {
                    (new Function(code))();
                    successCount++;
                    try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                } catch (execErr) {
                    console.warn('[App] Script exec failed:', execErr.message);
                    failCount++;
                    try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                }
            }
        });

        if (failCount > 0) {
            console.warn('[App] executeScripts: ' + successCount + ' OK, ' + failCount + ' failed');
        }
    }

    // ============================================================
    //  19. ROUTER
    // ============================================================
    const router = {
        async load(url, pushState) {
            if (pushState === undefined) pushState = true;

            if (window.__intervals && window.__intervals.length > 0) {
                window.__intervals.forEach(clearInterval);
                window.__intervals = [];
            }
            if (typeof window.__cleanupBeforeNavigate === 'function') {
                try { window.__cleanupBeforeNavigate(); } catch (e) {}
                window.__cleanupBeforeNavigate = null;
            }

            if (!url || url === '/index.html' || url === '/index') url = '/';
            if (url.length > 1 && url.endsWith('/')) url = url.slice(0, -1);

            const qIdx = url.indexOf('?');
            const path = qIdx === -1 ? url : url.slice(0, qIdx);
            const queryStr = qIdx === -1 ? '' : url.slice(qIdx + 1);
            try { window.__currentQuery = new URLSearchParams(queryStr); }
            catch (e) { window.__currentQuery = new URLSearchParams(); }

            let route = ROUTES[path] || ROUTES[path.startsWith('/') ? path : '/' + path];
            if (!route) { this.load404(); return; }

            const user = safeParseUser();
            if (route.layout === 'admin' && (!user || user.role !== 'admin')) {
                return this.load('/auth', pushState);
            }
            if (route.layout === 'member' && (!user || user.role !== 'member')) {
                return this.load('/auth', pushState);
            }

            this.switchLayout(route.layout);

            let moduleKey = path.replace(/^\//, '').replace(/\//g, '_');
            if (!moduleKey) moduleKey = 'index';
            const camelKey = moduleKey.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
            window['__' + camelKey + 'Loaded'] = false;
            window['__' + camelKey + 'Init'] = false;

            const libsPromise = (route.libs && route.libs.length > 0)
                ? Promise.allSettled(route.libs.map(lib => loadLib(lib)))
                : Promise.resolve([]);

            const scriptPromise = route.js
                ? loadScript(route.js).catch(e => {
                    warn('Script gagal:', route.js);
                    return null;
                })
                : Promise.resolve(null);

            const containerMap = {
                public: '#public-content',
                admin: '#admin-content',
                member: '#member-content',
                auth: '#auth-content'
            };
            const container = document.querySelector(containerMap[route.layout]);
            if (!container) {
                console.error('Container tidak ditemukan:', route.layout);
                return;
            }

            // 3-level cache lookup
            let html;
            let cacheSource = 'network';

            if (window.__DEV_NO_VIEW_CACHE) {
                // DEV: skip cache
            } else if (viewCache.has(route.file)) {
                html = viewCache.get(route.file);
                cacheSource = 'Map';
            } else {
                const cachedHtml = SafeSessionStorage.getItem('__view_' + route.file);
                if (isValidCachedHtml(cachedHtml)) {
                    html = cachedHtml;
                    viewCache.set(route.file, html);
                    cacheSource = 'sessionStorage';
                }
            }

            if (!html) {
                const cachedHtml = SafeSessionStorage.getItem('__view_' + route.file);
                if (cachedHtml && !isValidCachedHtml(cachedHtml)) {
                    console.warn('[Router] Cache corrupt, re-fetch:', route.file);
                    SafeSessionStorage.removeItem('__view_' + route.file);
                }

                container.innerHTML = '<div class="flex justify-center items-center h-64">' +
                    '<i class="fas fa-spinner fa-spin text-3xl text-[var(--text-main)]"></i></div>';

                try {
                    const fetchTimeout = (__IS_MOBILE || __IS_SLOW_NET) ? 12000 : 8000;

                    const fetchWithTimeout = async (urlToFetch, timeout) => {
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), timeout);
                        try {
                            const res = await fetch(urlToFetch, { signal: controller.signal });
                            clearTimeout(timer);
                            return res;
                        } catch (e) {
                            clearTimeout(timer);
                            throw e;
                        }
                    };

                    const fetchUrl = route.file + '?v=' + CACHE_VERSION.replace(/[^a-z0-9]/gi, '');

                    let response;
                    try {
                        response = await fetchWithTimeout(fetchUrl, fetchTimeout);
                    } catch (e) {
                        if (__IS_MOBILE) {
                            console.warn('[Router] Retry fetch:', route.file);
                            response = await fetchWithTimeout(fetchUrl, fetchTimeout);
                        } else {
                            throw e;
                        }
                    }

                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    html = await response.text();
                    viewCache.set(route.file, html);

                    if (!window.__DEV_NO_VIEW_CACHE) {
                        try {
                            SafeSessionStorage.setItem('__view_' + route.file, html);
                        } catch (e) {
                            console.warn('[Router] Cache write quota exceeded:', route.file);
                        }
                    }
                } catch (err) {
                    console.error('Router view error:', err);
                    container.innerHTML = '<div class="text-center text-red-500 p-8">' +
                        '<i class="fas fa-exclamation-triangle text-4xl mb-4"></i>' +
                        '<p>Error: ' + escapeHtml(err.message) + '</p>' +
                        '<button onclick="location.reload()" class="btn-primary mt-4 px-4 py-2 rounded-lg">' +
                        '<i class="fas fa-sync-alt mr-1"></i>Reload</button></div>';
                    return;
                }
            }

            if (cacheSource !== 'network') {
                console.log('[Router] View dari ' + cacheSource + ' cache:', route.file);
            }

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                container.innerHTML = doc.body.innerHTML;
                executeScripts(container);
            } catch (err) {
                console.error('Router inject error:', err);
                return;
            }

            await scriptPromise;
            requestAnimationFrame(() => App.run(moduleKey));

            libsPromise.then(results => {
                const ok = results.filter(r => r.status === 'fulfilled').length;
                const fail = results.length - ok;
                if (fail > 0) {
                    log('Libs selesai:', ok, 'ok,', fail, 'fail untuk', moduleKey);
                }
            });

            if (pushState) {
                const newHash = '#' + url;
                if (window.location.hash !== newHash) {
                    __skipNextHashChange = url;
                    window.location.hash = url;
                }
            }

            this.updateActiveMenus(path);
            this.updateBottomNav(path, route.layout);
            window.scrollTo(0, 0);
        },

        switchLayout(layout) {
            ['public','admin','member','auth'].forEach(l => {
                const el = document.getElementById('layout-' + l);
                if (!el) return;
                const isActive = l === layout;
                el.classList.toggle('hidden', !isActive);
                el.style.display = isActive ? (l === 'public' ? 'flex' : 'block') : 'none';
            });
            if (layout === 'admin' || layout === 'member') {
                const collapsed = SafeStorage.getItem('sidebarCollapsed') === 'true';
                const sidebar = document.getElementById(layout + '-sidebar');
                const content = document.getElementById(layout + '-content');
                if (sidebar) sidebar.classList.toggle('collapsed', collapsed);
                if (content) content.classList.toggle('expanded', collapsed);
            }
            if (layout === 'public') updateAuthLinks();
        },

        updateActiveMenus(path) {
            document.querySelectorAll('#public-navbar .nav-link').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === path);
            });
            document.querySelectorAll('#layout-admin .nav-links a').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === path);
            });
            document.querySelectorAll('#layout-member .nav-links a').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === path);
            });
        },

        // ⭐ NEW: Update bottom nav active state (Telegram-style)
        updateBottomNav(path, layout) {
            const nav = document.querySelector('.mobile-bottom-nav[data-role="' + layout + '"]');
            if (!nav) return;

            const items = nav.querySelectorAll('.bottom-nav-item[data-route]');
            items.forEach(item => {
                const route = item.getAttribute('data-route');
                const isActive = (route === path) ||
                    (route !== '/' && path.indexOf(route) === 0);
                item.classList.toggle('active', isActive);
            });
        },

        load404() {
            const container = document.querySelector('#public-content') ||
                              document.querySelector('#admin-content') ||
                              document.querySelector('#member-content');
            if (container) {
                container.innerHTML = '<div class="text-center py-20">' +
                    '<h1 class="text-6xl font-bold text-[var(--text-main)]">404</h1>' +
                    '<p class="text-xl mt-4 text-[var(--text-muted)]">Halaman tidak ditemukan.</p>' +
                    '<a href="/" class="btn-primary mt-6 inline-block px-6 py-2 rounded-lg">Kembali ke Beranda</a></div>';
            }
        }
    };

    // ============================================================
    //  20. AUTH LINKS
    // ============================================================
    function updateAuthLinks() {
        const user = safeParseUser();
        const desktop = document.getElementById('public-auth-links');

        if (desktop) {
            if (user) {
                const role = user.role || 'member';
                const name = user.nama || user.name || user.username || 'User';
                const firstName = String(name).trim().split(/\s+/)[0] || 'User';

                const dashUrl = role === 'admin' ? '/dashboard_admin' : '/dashboard_member';
                const roleClass = role === 'admin' ? 'role-badge-admin' : 'role-badge-member';
                const roleIcon = role === 'admin' ? 'fa-shield-alt' : 'fa-user';
                const roleLabel = role === 'admin' ? 'Admin' : 'Member';

                desktop.innerHTML = `
                    <a href="${dashUrl}" class="navbar-user-pill ${roleClass}" title="Buka Dashboard ${roleLabel}">
                        <span class="navbar-user-avatar">
                            <i class="fas ${roleIcon}"></i>
                        </span>
                        <span class="navbar-user-info">
                            <span class="navbar-user-name">${escapeHtml(firstName)}</span>
                            <span class="navbar-user-role">${roleLabel}</span>
                        </span>
                    </a>
                `;
            } else {
                desktop.innerHTML = `
                    <a href="/auth" class="navbar-login-btn">
                        <i class="fas fa-sign-in-alt"></i>
                        <span>Masuk</span>
                    </a>
                `;
            }
        }
    }

    // ============================================================
    //  21. SIDEBAR TOGGLE (Desktop only)
    // ============================================================
    function toggleSidebar(type) {
        const sidebar = document.getElementById(type + '-sidebar');
        const content = document.getElementById(type + '-content');
        const overlay = document.getElementById(
            type === 'admin' ? 'sidebar-overlay' : 'member-overlay'
        );
        if (!sidebar) return;

        if (window.innerWidth <= 768) {
            // Mobile: sidebar jadi drawer (kalaupun dibuka)
            sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('active');
            return;
        }
        const collapsed = !sidebar.classList.contains('collapsed');
        sidebar.classList.toggle('collapsed', collapsed);
        if (content) content.classList.toggle('expanded', collapsed);
        SafeStorage.setItem('sidebarCollapsed', String(collapsed));
    }

    // ============================================================
    //  22. FORM NOTIFICATION POLLING (adaptif + sync badge bottom nav)
    // ============================================================
    function checkFormNotifications() {
        const user = safeParseUser();
        if (!user || user.role !== 'admin') return;

        apiCall('getUnreadFormCount', 'POST', {}).then(res => {
            if (!res || !res.success) return;
            const count = Number(res.count) || 0;

            // ── Sidebar badge ──
            const badge = document.getElementById('forms-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }

            // ⭐ Sync ke bottom nav badge
            document.querySelectorAll('.bn-badge[data-badge="forms"]').forEach(b => {
                if (count > 0) {
                    b.textContent = count > 99 ? '99+' : count;
                    b.classList.remove('hidden');
                } else {
                    b.classList.add('hidden');
                }
            });
        }).catch(() => {});
    }

    function startFormNotificationPolling() {
        stopFormNotificationPolling();
        const interval = __IS_MOBILE ? 120000 : 60000;
        setTimeout(checkFormNotifications, __IS_MOBILE ? 8000 : 3000);
        __formNotifTimer = setInterval(() => {
            if (!document.hidden) checkFormNotifications();
        }, interval);
    }

    function stopFormNotificationPolling() {
        if (__formNotifTimer) {
            clearInterval(__formNotifTimer);
            __formNotifTimer = null;
        }
    }

    // ============================================================
    //  23. EVENT DELEGATION
    // ============================================================
    function attachGlobalListeners() {
        if (window.__globalListenersAttached) return;
        window.__globalListenersAttached = true;

        // Auto-clear cache saat tombol Refresh diklik
        document.addEventListener('click', function(e) {
            const btn = e.target.closest(
                '#refresh-btn, #refresh-surat-btn, #refresh-logbook-btn, #refresh-berita-btn, ' +
                '#refresh-anggota-btn, #refresh-kader-btn, #refresh-profil-btn, #refresh-tokoh-btn, ' +
                '#refresh-arsip-btn, #refresh-kalender-btn, #refresh-galeri-btn, ' +
                '#refresh-keuangan-btn, #refresh-inventaris-btn, #refresh-proker-btn, #refresh-forum-btn, ' +
                '#refresh-absensi-btn, #refresh-member-btn, #dashboard-refresh-btn, #refresh-logbook-member-btn, ' +
                '#refresh-forms-btn, #refresh-responses-btn, ' +
                '[data-refresh]'
            );
            if (!btn) return;

            const path = window.location.hash.replace('#', '').split('?')[0] || '/';
            const endpoints = ROUTE_DATA_ENDPOINTS[path] || [];
            const user = safeParseUser();

            if (user && endpoints.length > 0) {
                const cleared = [];
                endpoints.forEach(action => {
                    const cKey = 'cache_' + action + '_' + user.id + '_' + JSON.stringify({});
                    if (SafeSessionStorage.getItem(cKey)) {
                        SafeSessionStorage.removeItem(cKey);
                        cleared.push(action);
                    }
                });
                if (cleared.length > 0) {
                    console.log('[App] Refresh — cache cleared: ' + cleared.join(', '));
                }
            }
        });

        // Klik global
        document.addEventListener('click', function(e) {
            const target = e.target;

            // ── Theme toggles ──
            if (target.closest('#theme-toggle, #admin-theme-toggle, #admin-theme-toggle-mobile, #member-theme-toggle, #member-theme-toggle-mobile')) {
                const cur = SafeStorage.getItem('color-theme') || 'light';
                const next = cur === 'light' ? 'dark' : 'light';
                SafeStorage.setItem('color-theme', next);
                applyTheme(next);
                return;
            }

            // ── Sidebar toggle (desktop only) ──
            if (target.closest('#sidebar-toggle')) { toggleSidebar('admin'); return; }
            if (target.closest('#member-sidebar-toggle')) { toggleSidebar('member'); return; }

            // ── Sidebar overlay close ──
            if (target.id === 'sidebar-overlay' || target.id === 'member-overlay') {
                const sidebar = document.getElementById('admin-sidebar') || document.getElementById('member-sidebar');
                if (sidebar) sidebar.classList.remove('open');
                target.classList.remove('active');
                return;
            }

            // ── Submenu toggle (admin) ──
            const adminToggle = target.closest('#layout-admin .has-submenu > a');
            if (adminToggle) {
                e.preventDefault();
                const parent = adminToggle.parentElement;
                const sidebar = document.getElementById('admin-sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    sidebar.classList.remove('collapsed');
                    const content = document.getElementById('admin-content');
                    if (content) content.classList.remove('expanded');
                    SafeStorage.setItem('sidebarCollapsed', 'false');
                }
                parent.classList.toggle('open');
                return;
            }

            // ── Submenu toggle (member) ──
            const memberToggle = target.closest('#layout-member .has-submenu > a');
            if (memberToggle) {
                e.preventDefault();
                memberToggle.parentElement.classList.toggle('open');
                return;
            }

            // ── Logout buttons ──
            if (target.closest('#sidebar-logout, #member-logout, #navbar-logout')) {
                logout();
                return;
            }
        });

        // Scroll navbar
        window.addEventListener('scroll', function() {
            debounceEvent('navbar-scroll', function() {
                const nav = document.getElementById('public-navbar');
                if (nav) nav.classList.toggle('navbar-scrolled', window.scrollY > 50);
            }, 100);
        }, { passive: true });

        // Hash change
        window.addEventListener('hashchange', function() {
            const url = window.location.hash.replace('#', '') || '/';
            if (__skipNextHashChange === url) {
                __skipNextHashChange = null;
                return;
            }
            router.load(url, false);
        });

        // SPA link interception
        document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href) return;
            if (link.target === '_blank') return;
            if (link.hostname && link.hostname !== window.location.hostname) return;
            if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;
            if (href.startsWith('mailto:') || href.startsWith('tel:')) return;
            if (href === '#') return;
            if (href.startsWith('#')) return;

            let url = href;
            if (url.startsWith(window.location.origin)) {
                url = url.slice(window.location.origin.length);
            }
            if (url.endsWith('.html')) {
                url = '/' + url.replace(/^\/+/, '').slice(0, -5);
            }

            const pathOnly = url.split('?')[0];
            if (!ROUTES[pathOnly] && !ROUTES[pathOnly + '/']) return;

            e.preventDefault();
            router.load(url);
        });

        // ESC — close sidebar overlay (mobile safety)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const sidebar = document.getElementById('admin-sidebar') || document.getElementById('member-sidebar');
                const overlay = document.getElementById('sidebar-overlay') || document.getElementById('member-overlay');
                if (sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    if (overlay) overlay.classList.remove('active');
                }
            }
        });

        // Visibility change — refresh form notif
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) checkFormNotifications();
        });
    }

    // ============================================================
    //  24. CONFIRM MODAL
    // ============================================================
    function ensureConfirmModal() {
        if (document.getElementById('confirm-modal')) return;
        const html = '<div id="confirm-modal" class="fixed inset-0 z-[99999] hidden items-center justify-center bg-black/50 backdrop-blur-sm">' +
            '<div class="bg-[var(--card-bg)] rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-[var(--card-border)]">' +
            '<div class="flex items-start gap-3 mb-4">' +
            '<div class="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">' +
            '<i class="fas fa-question text-yellow-600"></i></div>' +
            '<p id="confirm-text" class="text-base font-medium text-[var(--text-main)] pt-2"></p></div>' +
            '<div class="flex justify-end gap-2">' +
            '<button id="confirm-cancel" type="button" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-[var(--text-main)] font-medium transition">Batal</button>' +
            '<button id="confirm-ok" type="button" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition">Ya, Lanjutkan</button>' +
            '</div></div></div>';
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    // ============================================================
    //  25. TAILWIND FALLBACK DETECTION
    // ============================================================
    function checkTailwindFallback() {
        setTimeout(() => {
            const testEl = document.querySelector('.flex');
            const isTWLoaded = typeof window.tailwind !== 'undefined' ||
                (testEl && window.getComputedStyle(testEl).display === 'flex');

            if (!isTWLoaded && !__IS_LOCALHOST) {
                console.warn('[App] Tailwind CDN blocked — fallback active');

                const banner = document.createElement('div');
                banner.id = 'network-error-banner';
                banner.style.cssText = `
                    position: fixed; top: 0; left: 0; right: 0;
                    background: linear-gradient(135deg, #fbbf24, #f59e0b);
                    color: #0f2922; padding: 10px 16px; text-align: center;
                    font-size: 0.8rem; font-weight: 600; z-index: 99999;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    font-family: system-ui, sans-serif;
                `;
                banner.innerHTML = '⚠️ Mode Hemat Data aktif. ' +
                    '<button onclick="this.parentNode.remove()" ' +
                    'style="background:none;border:none;color:#0f2922;font-weight:700;cursor:pointer;text-decoration:underline;margin-left:8px;">Tutup</button>';
                document.body.appendChild(banner);
                setTimeout(() => banner.remove(), 8000);
            }
        }, 2000);
    }

    // ============================================================
    //  26. GLOBAL ERROR HANDLER
    // ============================================================
    let __errorCount = 0;
    window.addEventListener('error', function(e) {
        if (!e.message) return;
        if (e.message.includes('Script error')) return;
        if (e.message.includes('ResizeObserver')) return;

        __errorCount++;
        console.error('[App] Error #' + __errorCount + ':', e.message);

        if (__errorCount >= 3) {
            __errorCount = 0;
            setTimeout(() => {
                if (typeof window.showToast === 'function') {
                    window.showToast('⚠️ Terdeteksi masalah. Refresh atau clear cache jika berlanjut.', 'warning', 6000);
                }
            }, 500);
        }
        setTimeout(() => { __errorCount = Math.max(0, __errorCount - 1); }, 10000);
    });

    // ============================================================
    //  27. INIT
    // ============================================================
    function init() {
        initDarkMode();
        attachGlobalListeners();
        ensureConfirmModal();

        window.__intervals = window.__intervals || [];

        // Detect Tailwind CDN
        checkTailwindFallback();

        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('tab') === 'register') {
                SafeSessionStorage.setItem('authTab', 'register');
            }
        } catch (e) {}

        const initialPath = window.location.hash.replace('#', '') || '/';
        router.load(initialPath, false);

        const user = safeParseUser();
        if (user && (user.role === 'admin' || user.role === 'member')) {
            // Prefetch hanya jalan di desktop (otomatis skip di mobile)
            setTimeout(() => {
                prefetchRoutes(user.role).catch(() => {});
            }, 1500);
        }

        // Start form notification polling jika admin
        if (user && user.role === 'admin') {
            startFormNotificationPolling();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================================
    //  28. EXPOSE GLOBAL
    // ============================================================
    window.router = router;
    window.App = App;
    window.logout = logout;
    window.checkAuth = checkAuth;
    window.apiCall = apiCall;
    window.forceRefreshData = forceRefreshData;
    window.showToast = showToast;
    window.showConfirm = showConfirm;
    window.formatDate = formatDate;
    window.formatRupiah = formatRupiah;
    window.escapeHtml = escapeHtml;
    window.startLoading = startLoading;
    window.stopLoading = stopLoading;
    window.uploadFileToDrive = uploadFileToDrive;
    window.logActivity = logActivity;
    window.debounceEvent = debounceEvent;
    window.autoHideSkeleton = autoHideSkeleton;
    window.toggleSidebar = toggleSidebar;
    window.applyTheme = applyTheme;
    window.loadLib = loadLib;
    window.updateAuthLinks = updateAuthLinks;
    window.checkFormNotifications = checkFormNotifications;

    window.getCachedData = getCachedData;
    window.prefetchRoutes = prefetchRoutes;
    window.clearPrefetchCache = clearPrefetchCache;
    window.resetPrefetchCache = resetPrefetchCache;
    window.getPrefetchState = () => ({ ...prefetchState });
    window.getViewCacheSize = () => viewCache.size;
    window.isDevNoViewCache = () => window.__DEV_NO_VIEW_CACHE;
    window.getCacheVersion = () => CACHE_VERSION;
    window.getEnvironment = () => window.__APP_ENV;

    console.log('✅ App.js v38.1.0 loaded — Full Fix + Telegram Mobile UI');
    console.log('   Cache version:', CACHE_VERSION);
    console.log('   Environment:', window.__APP_ENV.isMobile ? 'MOBILE' : 'DESKTOP',
                __IS_LOCALHOST ? '(DEV)' : '(PROD)');
    if (window.__DEV_NO_VIEW_CACHE) {
        console.log('   DEV MODE: view cache DISABLED');
    }

})();