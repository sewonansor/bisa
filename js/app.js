/**
 * ============================================================
 *  app.js — Core SPA PAC GP Ansor Kapanewon Sewon
 *  Versi: 48.2.0 — SEKRETARIS RANTING + ABSENSI EDITION
 *  ---------------------------------------------------------
 *  CHANGELOG v48.2.0 (vs v48.1.0):
 *   ✅ NEW: Route /sekretaris_absensi + endpoints
 *   ✅ NEW: Cache invalidation untuk write actions
 *   ✅ NEW: router.onLeave hook (cleanup per route)
 *   ✅ NEW: runCleanupForPath — auto-cleanup
 *   ✅ NEW: Sidebar submenu auto-expand
 *   ✅ NEW: Mobile sidebar auto-close
 *   ✅ FIX: updateActiveMenus semua layout
 *   ✅ FIX: jsonpRequest timer cleanup
 *   ✅ FIX: executeScripts skip executed
 *   ✅ PRESERVED: Semua fitur v48.1.0
 * ============================================================
 */

(function() {
    'use strict';

    // ══════════════════════════════════════════════════════════
    //  0. GUARD — anti double init
    // ══════════════════════════════════════════════════════════
    if (window.__APP_LOADED) {
        console.log('[App] Already loaded, skip re-init');
        return;
    }
    window.__APP_LOADED = true;

    // ══════════════════════════════════════════════════════════
    //  0b. GLOBAL togglePassword FALLBACK
    // ══════════════════════════════════════════════════════════
    if (typeof window.togglePassword !== 'function') {
        window.togglePassword = function(inputId, btn) {
            try {
                const input = document.getElementById(inputId);
                if (!input || !btn) return;
                input.type = input.type === 'password' ? 'text' : 'password';
                btn.innerHTML = input.type === 'password'
                    ? '<i class="fas fa-eye"></i>'
                    : '<i class="fas fa-eye-slash"></i>';
            } catch (e) {
                console.warn('[App:togglePassword] error:', e);
            }
        };
    }

    // ══════════════════════════════════════════════════════════
    //  1. CACHE VERSION & BOOT
    // ══════════════════════════════════════════════════════════
    const CACHE_VERSION = 'v48.2.0_20261113';
    const BOOT_FLAG_KEY = '__boot_done';
    const QUEUE_KEY = 'offline_sync_queue_v2';

    let __STORAGE_AVAILABLE = null;
    function _isStorageAvailable() {
        if (__STORAGE_AVAILABLE !== null) return __STORAGE_AVAILABLE;
        try {
            const k = '__app_test__' + Date.now();
            localStorage.setItem(k, '1');
            localStorage.removeItem(k);
            __STORAGE_AVAILABLE = true;
        } catch (e) {
            __STORAGE_AVAILABLE = false;
        }
        return __STORAGE_AVAILABLE;
    }

    let __SESSION_AVAILABLE = null;
    function _isSessionAvailable() {
        if (__SESSION_AVAILABLE !== null) return __SESSION_AVAILABLE;
        try {
            const k = '__app_stest__' + Date.now();
            sessionStorage.setItem(k, '1');
            sessionStorage.removeItem(k);
            __SESSION_AVAILABLE = true;
        } catch (e) {
            __SESSION_AVAILABLE = false;
        }
        return __SESSION_AVAILABLE;
    }

    // ══════════════════════════════════════════════════════════
    //  2. SAFE STORAGE
    // ══════════════════════════════════════════════════════════
    const SafeStorage = {
        _mem: {},
        _ok: null,
        _check() {
            if (this._ok !== null) return this._ok;
            this._ok = _isStorageAvailable();
            return this._ok;
        },
        getItem(k) {
            if (this._check()) {
                try { return localStorage.getItem(k); } catch (e) {}
            }
            return this._mem['L_' + k] !== undefined ? this._mem['L_' + k] : null;
        },
        setItem(k, v) {
            if (this._check()) {
                try { localStorage.setItem(k, v); return; } catch (e) {}
            }
            this._mem['L_' + k] = String(v);
        },
        removeItem(k) {
            if (this._check()) {
                try { localStorage.removeItem(k); } catch (e) {}
            }
            delete this._mem['L_' + k];
        },
        clear() {
            if (this._check()) {
                try { localStorage.clear(); } catch (e) {}
            }
            this._mem = {};
        }
    };

    const SafeSessionStorage = {
        _mem: {},
        _ok: null,
        _check() {
            if (this._ok !== null) return this._ok;
            this._ok = _isSessionAvailable();
            return this._ok;
        },
        getItem(k) {
            if (this._check()) {
                try { return sessionStorage.getItem(k); } catch (e) {}
            }
            return this._mem['S_' + k] !== undefined ? this._mem['S_' + k] : null;
        },
        setItem(k, v) {
            if (this._check()) {
                try {
                    sessionStorage.setItem(k, v);
                    return;
                } catch (e) {
                    if (String(e).toLowerCase().indexOf('quota') > -1 ||
                        e.name === 'QuotaExceededError') {
                        try {
                            const keys = [];
                            for (let i = 0; i < sessionStorage.length; i++) {
                                const key = sessionStorage.key(i);
                                if (key && (key.startsWith('__view_') || key.startsWith('cache_'))) {
                                    keys.push(key);
                                }
                            }
                            const viewKeys = keys.filter(k => k.startsWith('__view_'));
                            const dataKeys = keys.filter(k => k.startsWith('cache_'));
                            const toDelete = viewKeys.concat(dataKeys)
                                .slice(0, Math.ceil(keys.length / 2));
                            toDelete.forEach(key => sessionStorage.removeItem(key));
                            sessionStorage.setItem(k, v);
                            return;
                        } catch (e2) {}
                    }
                }
            }
            this._mem['S_' + k] = String(v);
        },
        removeItem(k) {
            if (this._check()) {
                try { sessionStorage.removeItem(k); } catch (e) {}
            }
            delete this._mem['S_' + k];
        },
        clear() {
            if (this._check()) {
                try { sessionStorage.clear(); } catch (e) {}
            }
            this._mem = {};
        }
    };

    window.SafeStorage = SafeStorage;
    window.SafeSessionStorage = SafeSessionStorage;

    // ══════════════════════════════════════════════════════════
    //  3. CACHE VERSION CHECK
    // ══════════════════════════════════════════════════════════
    try {
        const storedVer = SafeStorage.getItem('__cache_version');
        if (storedVer !== CACHE_VERSION) {
            console.warn('[App] 🔄 Cache version:', storedVer || '(none)', '→', CACHE_VERSION);
            try { SafeSessionStorage.clear(); } catch (e) {}
            try {
                if (_isStorageAvailable()) {
                    const removeKeys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (
                            key.startsWith('cache_') ||
                            key.startsWith('__view_') ||
                            key.startsWith('__lastPrefetch') ||
                            key.startsWith('authTab')
                        )) {
                            removeKeys.push(key);
                        }
                    }
                    removeKeys.forEach(k => localStorage.removeItem(k));
                }
            } catch (e) {}
            SafeStorage.setItem('__cache_version', CACHE_VERSION);
            console.log('[App] ✅ Stale cache cleared');
        }
    } catch (e) {
        console.warn('[App] Cache check failed:', e);
    }

    // ══════════════════════════════════════════════════════════
    //  4. ENVIRONMENT DETECTION
    // ══════════════════════════════════════════════════════════
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
        storageAvailable: _isStorageAvailable(),
        sessionAvailable: _isSessionAvailable(),
        version: CACHE_VERSION
    };

    // ══════════════════════════════════════════════════════════
    //  5. KONFIGURASI
    // ══════════════════════════════════════════════════════════
    const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzYnNwVkkuh1qU0WLczK4BrJo3GIJa_fosXVbouEPzfJdHaDkmsDu6JKL3mTdIHye9u/exec';
    const API_TIMEOUT = (__IS_MOBILE || __IS_SLOW_NET) ? 45000 : 25000;
    const POST_SIZE_THRESHOLD = 1500;
    const JSONP_MAX_URL_LENGTH = 7000;
    const CHUNK_SIZE = 5000;
    const DEBOUNCE_DELAY = 500;
    const DEBUG = false;

    const CACHE_TTL_DYNAMIC = 10 * 60 * 1000;
    const CACHE_TTL_SEMI_STATIC = 30 * 60 * 1000;
    const CACHE_TTL_ABSENSI = 5 * 60 * 1000;
    const CACHE_TTL_PREFETCH = 15 * 60 * 1000;
    const CACHE_TTL_FORMS = 2 * 60 * 1000;

    window.__DEV_NO_VIEW_CACHE = __IS_LOCALHOST;

    const log = (...a) => { if (DEBUG) console.log('[App]', ...a); };
    const warn = (...a) => { if (DEBUG) console.warn('[App]', ...a); };

    // ══════════════════════════════════════════════════════════
    //  6. STATE
    // ══════════════════════════════════════════════════════════
    const _pending = {};
    const _cacheTimestamps = {};
    const loadedLibs = new Set();
    const loadingLibs = {};
    const loadedScripts = new Set();
    const viewCache = new Map();
    const ROUTE_LEAVE_HOOKS = {};
    let __skipNextHashChange = null;
    let __formNotifTimer = null;
    const _activeJsonpCallbacks = new Set();
    const _chunkedUploads = {};

    // ══════════════════════════════════════════════════════════
    //  7. ROUTE DATA ENDPOINTS
    // ══════════════════════════════════════════════════════════
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
        '/logbook_member':  ['getLogbook'],
        // ─── SEKRETARIS ROUTES ───
        '/sekretaris_dashboard': ['getSekretarisStats'],
        '/sekretaris_surat':     ['getSurat'],
        '/sekretaris_logbook':   ['getLogbook'],
        '/sekretaris_absensi':   ['getAbsensiSekretaris', 'getQrConfigSekretaris', 'getAbsensiStatsSekretaris'],
        '/sekretaris_laporan':   ['getLogbook', 'getKeuangan', 'getUsers']
    };

    // ══════════════════════════════════════════════════════════
    //  8. LIB MAP
    // ══════════════════════════════════════════════════════════
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
                        jsFallback:'https://cdn.jsdelivr.net/npm/docx@8.2.0/build/index.umd.js' },
        pdflib:       { js:'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.4.2/dist/pdf-lib.min.js',
                        jsFallback:'https://unpkg.com/@cantoo/pdf-lib@2.4.2/dist/pdf-lib.min.js' }
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

    // ══════════════════════════════════════════════════════════
    //  9. CACHE TTL
    // ══════════════════════════════════════════════════════════
    function getCacheTTL(action) {
        const a = String(action || '').toLowerCase();
        if (a.includes('qr') || a.includes('password') || a.includes('setting')) return 0;
        if (a.includes('absensi')) return CACHE_TTL_ABSENSI;
        if (a.includes('form') || a.includes('notification')) return CACHE_TTL_FORMS;
        if (a.includes('profil') || a.includes('struktur') ||
            a.includes('photoposition') || a.includes('tokoh')) return CACHE_TTL_SEMI_STATIC;
        return CACHE_TTL_DYNAMIC;
    }

    // ══════════════════════════════════════════════════════════
    //  10. UTILITIES
    // ══════════════════════════════════════════════════════════
    function safeParseUser() {
        const raw = SafeStorage.getItem('user');
        if (!raw) return null;
        try {
            const u = JSON.parse(raw);
            if (!u || typeof u !== 'object') return null;
            return u;
        } catch (e) { return null; }
    }

    const checkAuth = safeParseUser;

    function getUserKey() {
        const user = safeParseUser();
        return user ? String(user.id) : 'anon';
    }

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
            try { callback(); } catch (e) { console.error(e); }
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

            let prefix = '';
            if (!navigator.onLine) {
                prefix = '<i class="fas fa-wifi mr-1" style="opacity: 0.7;"></i>';
            }

            const t = document.createElement('div');
            t.className = 'global-toast fixed top-6 right-6 z-[99999] px-6 py-4 rounded-xl shadow-2xl text-white font-medium text-sm ' +
                (colors[type] || 'bg-blue-600') + ' transform translate-x-full transition-transform duration-300 ease-out';
            t.innerHTML = prefix + '<i class="fas fa-' + (icons[type] || 'info-circle') + ' mr-2"></i> ' + escapeHtml(msg);
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

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target.result || '';
                const base64 = result.split(',')[1] || '';
                if (base64) resolve(base64);
                else reject(new Error('Gagal konversi file'));
            };
            reader.onerror = () => reject(new Error('Gagal baca file'));
            reader.readAsDataURL(file);
        });
    }

    async function uploadFileToDrive(file) {
        try {
            if (!file) {
                return { success: false, message: 'File tidak ditemukan' };
            }
            const maxSize = 20 * 1024 * 1024;
            if (file.size > maxSize) {
                return {
                    success: false,
                    message: 'File terlalu besar (max 20 MB). Ukuran: ' +
                             (file.size / 1024 / 1024).toFixed(2) + ' MB'
                };
            }

            if (!navigator.onLine) {
                return {
                    success: false,
                    message: 'Upload file memerlukan koneksi internet.',
                    _offline: true
                };
            }

            const base64Data = await fileToBase64(file);
            const estimatedUrlLength = base64Data.length + 500;
            if (estimatedUrlLength > JSONP_MAX_URL_LENGTH) {
                return await chunkedUpload(file, base64Data);
            }

            const result = await apiCall('uploadFile', 'POST', {
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                base64Data: base64Data
            });
            return result;
        } catch (err) {
            console.error('[App] uploadFileToDrive error:', err);
            return { success: false, message: err.message || 'Gagal upload file' };
        }
    }

    async function chunkedUpload(file, base64Data) {
        const uploadId = 'up_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

        _chunkedUploads[uploadId] = {
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            totalChunks: totalChunks,
            uploadedChunks: 0
        };

        try {
            const initRes = await apiCall('uploadFileInit', 'POST', {
                uploadId: uploadId,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                totalChunks: totalChunks,
                fileSize: file.size
            });

            if (!initRes || !initRes.success) {
                throw new Error((initRes && initRes.message) || 'Init upload gagal');
            }

            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, base64Data.length);
                const chunk = base64Data.substring(start, end);

                showToast(
                    'Mengunggah file: ' + Math.round(((i + 1) / totalChunks) * 100) + '%',
                    'info', 1500
                );

                const chunkRes = await apiCall('uploadFileChunk', 'POST', {
                    uploadId: uploadId,
                    chunkIndex: i,
                    totalChunks: totalChunks,
                    data: chunk
                });

                if (!chunkRes || !chunkRes.success) {
                    throw new Error('Chunk ' + i + ' gagal: ' + (chunkRes && chunkRes.message));
                }
                _chunkedUploads[uploadId].uploadedChunks = i + 1;
            }

            const finalRes = await apiCall('uploadFileFinalize', 'POST', {
                uploadId: uploadId
            });

            delete _chunkedUploads[uploadId];

            if (finalRes && finalRes.success) {
                return finalRes;
            }
            throw new Error((finalRes && finalRes.message) || 'Finalize upload gagal');
        } catch (err) {
            delete _chunkedUploads[uploadId];
            console.error('[App] Chunked upload error:', err);
            return { success: false, message: err.message };
        }
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

    // ══════════════════════════════════════════════════════════
    //  11. FORMPHOTO UTILITY
    // ══════════════════════════════════════════════════════════
    window.FormPhoto = {
        MAX_SIZE: 5 * 1024 * 1024,
        ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],

        validate: function(file) {
            if (!file) return { ok: false, msg: 'File kosong' };
            if (file.size > this.MAX_SIZE) {
                var mb = (this.MAX_SIZE / 1024 / 1024).toFixed(0);
                return { ok: false, msg: 'File terlalu besar (maks ' + mb + ' MB)' };
            }
            if (this.ALLOWED_TYPES.indexOf(file.type) === -1) {
                return { ok: false, msg: 'Format tidak didukung (harus JPG/PNG/WEBP/GIF)' };
            }
            return { ok: true };
        },

        attach: function(inputId, previewId, removeBtnId, opts) {
            opts = opts || {};
            var input = document.getElementById(inputId);
            var preview = document.getElementById(previewId);
            var removeBtn = removeBtnId ? document.getElementById(removeBtnId) : null;

            if (!input) return null;

            var fresh = input.cloneNode(true);
            input.parentNode.replaceChild(fresh, input);
            input = fresh;

            var pendingFile = null;

            input.addEventListener('change', function() {
                var file = this.files && this.files[0];
                if (!file) {
                    FormPhoto._clearPreview(preview, removeBtn);
                    pendingFile = null;
                    return;
                }
                var check = FormPhoto.validate(file);
                if (!check.ok) {
                    if (typeof showToast === 'function') showToast(check.msg, 'warning', 3000);
                    this.value = '';
                    pendingFile = null;
                    return;
                }
                pendingFile = file;
                var reader = new FileReader();
                reader.onload = function(e) {
                    if (preview) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    }
                    if (removeBtn) removeBtn.style.display = 'inline-flex';
                    if (typeof opts.onPreview === 'function') {
                        try { opts.onPreview(file, e.target.result); } catch (err) {}
                    }
                };
                reader.readAsDataURL(file);
            });

            if (removeBtn) {
                var freshBtn = removeBtn.cloneNode(true);
                removeBtn.parentNode.replaceChild(freshBtn, removeBtn);
                removeBtn = freshBtn;
                removeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    pendingFile = null;
                    input.value = '';
                    FormPhoto._clearPreview(preview, removeBtn);
                    if (typeof opts.onClear === 'function') {
                        try { opts.onClear(); } catch (err) {}
                    }
                });
            }

            return {
                getPendingFile: function() { return pendingFile; },
                hasFile: function() { return !!pendingFile; },
                reset: function() {
                    pendingFile = null;
                    input.value = '';
                    FormPhoto._clearPreview(preview, removeBtn);
                },
                setExisting: function(url) {
                    if (!preview) return;
                    if (url) {
                        preview.src = url;
                        preview.style.display = 'block';
                        if (removeBtn) removeBtn.style.display = 'inline-flex';
                    } else {
                        FormPhoto._clearPreview(preview, removeBtn);
                    }
                    pendingFile = null;
                },
                getFile: function() { return pendingFile; }
            };
        },

        _clearPreview: function(preview, removeBtn) {
            if (preview) {
                preview.src = '';
                preview.style.display = 'none';
                preview.removeAttribute('src');
            }
            if (removeBtn) removeBtn.style.display = 'none';
        },

        uploadIfAny: async function(controller, existingUrl, opts) {
            opts = opts || {};
            if (!controller) return existingUrl || '';
            var file = controller.getPendingFile();
            if (!file) return existingUrl || '';

            try {
                var res = await uploadFileToDrive(file);
                if (res && res.success && res.url) return res.url;
                var errMsg = (res && res.message) || 'Upload gagal tanpa pesan';
                if (typeof opts.onError === 'function') {
                    try { opts.onError(errMsg); } catch (e) {}
                }
                throw new Error(errMsg);
            } catch (err) {
                if (typeof opts.onError === 'function') {
                    try { opts.onError(err.message); } catch (e) {}
                }
                throw err;
            }
        },

        hasPendingFile: function(controller) {
            return !!(controller && controller.getPendingFile && controller.getPendingFile());
        }
    };

    // ══════════════════════════════════════════════════════════
    //  12. BOOT LOADER HELPERS
    // ══════════════════════════════════════════════════════════
    function markBootDone() {
        try { SafeSessionStorage.setItem(BOOT_FLAG_KEY, 'true'); } catch (e) {}
    }

    function resetBootFlag() {
        try {
            SafeSessionStorage.removeItem(BOOT_FLAG_KEY);
            sessionStorage.removeItem(BOOT_FLAG_KEY);
            localStorage.removeItem(BOOT_FLAG_KEY);
        } catch (e) {}
    }

    function forceHideBootLoader() {
        try {
            const loader = document.getElementById('app-boot-loader');
            if (loader) {
                if (typeof window.__hideBootLoader === 'function') {
                    window.__hideBootLoader(true);
                } else {
                    loader.style.display = 'none';
                    loader.classList.add('app-boot-done');
                    setTimeout(() => {
                        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
                    }, 100);
                }
            }
        } catch (e) {}
    }

    // ══════════════════════════════════════════════════════════
    //  13. CACHE FUNCTIONS
    // ══════════════════════════════════════════════════════════
    function getCachedData(action, data) {
        const userKey = getUserKey();
        data = data || {};
        const cKey = 'cache_' + action + '_' + userKey + '_' + JSON.stringify(data);
        const cached = SafeSessionStorage.getItem(cKey);
        if (!cached) return null;
        try {
            const parsed = JSON.parse(cached);
            const ttl = getCacheTTL(action);
            if (ttl > 0 && Date.now() - parsed._timestamp < ttl) {
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

    /**
     * Invalidate cache untuk action tertentu (semua user).
     */
    function invalidateCacheForAction(action) {
        if (!action) return;
        try {
            const keysToRemove = [];
            if (_isSessionAvailable()) {
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && key.startsWith('cache_' + action + '_')) {
                        keysToRemove.push(key);
                    }
                }
            }
            keysToRemove.forEach(k => SafeSessionStorage.removeItem(k));
            Object.keys(_cacheTimestamps).forEach(k => {
                if (k.startsWith('cache_' + action + '_')) delete _cacheTimestamps[k];
            });
            log('Cache invalidated:', action);
        } catch (e) {}
    }

    /**
     * Auto-invalidate cache saat ada write action.
     * Pattern: createX → invalidate getX, updateX → getX, deleteX → getX
     */
    function autoInvalidateAfterWrite(action) {
        const a = String(action || '');
        let targetAction = null;

        const match = a.match(/^(create|update|delete|upload|approve|reject|kembalikan|set|reset|verify)([A-Z][a-zA-Z]+)$/);
        if (match) {
            const verb = match[1];
            const noun = match[2];
            // Map noun → getter action
            const getterMap = {
                'Surat': 'getSurat',
                'Logbook': 'getLogbook',
                'Keuangan': 'getKeuangan',
                'Berita': 'getBerita',
                'Galeri': 'getGaleri',
                'Arsip': 'getArsip',
                'Inventaris': 'getInventaris',
                'Peminjaman': 'getPeminjaman',
                'ProgramKerja': 'getProgramKerja',
                'Event': 'getEvents',
                'Tokoh': 'getTokoh',
                'ForumTopic': 'getForumTopics',
                'ForumComment': 'getForumComments',
                'Form': 'getForms',
                'FormField': 'getFormFields',
                'FormResponse': 'getFormResponses',
                'FormNotification': 'getFormNotifications',
                'User': 'getUsers',
                'Absensi': 'getAbsensi',
                'Struktur': 'getStruktur',
                'Profil': 'getProfil',
                'PhotoPositions': 'getPhotoPositions',
                'QrStatus': 'getQrConfig',
                'QrStatusSekretaris': 'getQrConfigSekretaris'
            };
            targetAction = getterMap[noun] || null;
        }

        if (targetAction) {
            invalidateCacheForAction(targetAction);
            log('Auto-invalidate:', a, '→', targetAction);
        }

        // Special cases
        if (a === 'updateQrStatusSekretaris' || a === 'updateQrStatus') {
            invalidateCacheForAction('getQrConfig');
            invalidateCacheForAction('getQrConfigSekretaris');
        }
        if (a === 'createAbsensi' || a === 'updateAbsensi' || a === 'deleteAbsensi') {
            invalidateCacheForAction('getAbsensi');
            invalidateCacheForAction('getAbsensiSekretaris');
            invalidateCacheForAction('getAbsensiStatsSekretaris');
        }
    }

    // ══════════════════════════════════════════════════════════
    //  14. OFFLINE HELPER
    // ══════════════════════════════════════════════════════════
    function isOffline() { return !navigator.onLine; }
    function isReadAction(action) {
        return /^get|^check/i.test(String(action || ''));
    }
    function isWriteAction(action) {
        return /^(create|update|delete|upload|set|approve|reject|kembalikan|verify|reset|register)/i.test(String(action || ''));
    }

    // ══════════════════════════════════════════════════════════
    //  15. API CORE — OFFLINE-FIRST
    // ══════════════════════════════════════════════════════════
    function apiCall(action, method, data) {
        method = method || 'POST';
        data = data || {};

        // Auto-invalidate cache setelah write action (fire & forget)
        if (isWriteAction(action)) {
            try { autoInvalidateAfterWrite(action); } catch (e) {}
        }

        if (isOffline()) {
            if (isReadAction(action)) {
                console.log('[Offline] GET ' + action + ' → cache');
                const cached = getCachedData(action, data);
                if (cached) return Promise.resolve(cached);

                const userKey = getUserKey();
                const cKey = 'cache_' + action + '_' + userKey + '_' + JSON.stringify(data);
                const rawCached = SafeSessionStorage.getItem(cKey);
                if (rawCached) {
                    try { return Promise.resolve(JSON.parse(rawCached).data); } catch (e) {}
                }

                return Promise.resolve({
                    success: false,
                    message: 'Anda sedang offline dan data tidak tersedia di cache.',
                    _offline: true
                });
            }

            if (isWriteAction(action) && window.SyncManager) {
                console.log('[Offline] POST ' + action + ' → queue');
                return Promise.resolve(window.SyncManager.addToQueue(action, method, data));
            }

            return Promise.resolve({
                success: false,
                message: 'Aksi ini memerlukan koneksi internet.',
                _offline: true
            });
        }

        return originalApiCall(action, method, data);
    }

    function originalApiCall(action, method, data) {
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
                const userKey = user ? user.id : 'anon';
                const cKey = isGet ? 'cache_' + action + '_' + userKey + '_' + JSON.stringify(data) : null;
                const ttl = getCacheTTL(action);

                if (isGet && cKey && ttl > 0) {
                    const cached = SafeSessionStorage.getItem(cKey);
                    if (cached) {
                        try {
                            const parsed = JSON.parse(cached);
                            if (Date.now() - parsed._timestamp < ttl) {
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

                let promise;
                if (needsPost) {
                    promise = postRequestWithFallback(payload, cKey);
                } else {
                    promise = new Promise((res) => jsonpRequest(payload, cKey, res));
                }

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

    async function postRequestWithFallback(payload, cKey) {
        try {
            const result = await postRequest(payload);
            if (result && result.success === false &&
                (result.message || '').indexOf('CORS') !== -1) {
                return await jsonpFallback(payload, cKey);
            }
            return result;
        } catch (err) {
            return await jsonpFallback(payload, cKey);
        }
    }

    async function jsonpFallback(payload, cKey) {
        const qsLength = Object.keys(payload)
            .map(k => encodeURIComponent(k).length + encodeURIComponent(payload[k] == null ? '' : payload[k]).length + 2)
            .reduce((a, b) => a + b, 0);

        if (qsLength > JSONP_MAX_URL_LENGTH) {
            return await iframePost(payload);
        }

        return new Promise((resolve) => {
            jsonpRequest(payload, cKey, resolve);
        });
    }

    function iframePost(payload) {
        return new Promise((resolve) => {
            try {
                const iframeName = 'iframe_post_' + Date.now();
                const iframe = document.createElement('iframe');
                iframe.name = iframeName;
                iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
                document.body.appendChild(iframe);

                const form = document.createElement('form');
                form.method = 'POST';
                form.action = API_BASE_URL;
                form.target = iframeName;
                form.style.display = 'none';

                Object.keys(payload).forEach(key => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = payload[key] == null ? '' : String(payload[key]);
                    form.appendChild(input);
                });

                document.body.appendChild(form);
                form.submit();

                setTimeout(() => {
                    try { document.body.removeChild(form); } catch (e) {}
                    try { document.body.removeChild(iframe); } catch (e) {}
                    resolve({ success: true, message: 'Request terkirim via iframe', _iframePost: true });
                }, 3000);
            } catch (err) {
                console.error('[App] iframePost error:', err);
                resolve({ success: false, message: err.message });
            }
        });
    }

    async function postRequest(payload) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
        try {
            const res = await fetch(API_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                redirect: 'follow',
                mode: 'cors',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
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
            clearTimeout(timeoutId);
            throw err;
        }
    }

    function jsonpRequest(payload, cacheKey, resolve) {
        const cbName = 'gasCb_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
        _activeJsonpCallbacks.add(cbName);
        payload.callback = cbName;

        const qsParts = [];
        Object.keys(payload).forEach(k => {
            const v = payload[k] == null ? '' : String(payload[k]);
            qsParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
        });
        const qs = qsParts.join('&');
        const fullUrl = API_BASE_URL + '?' + qs;

        let responded = false;
        let scriptEl = null;

        const cleanup = () => {
            try {
                if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
            } catch (e) {}
            try { delete window[cbName]; } catch (e) {}
            _activeJsonpCallbacks.delete(cbName);
        };

        window[cbName] = function(responseData) {
            if (responded) return;
            responded = true;
            clearTimeout(softTimer);
            clearTimeout(hardTimer);
            cleanup();
            if (responseData && responseData.success && cacheKey) {
                trySaveCacheRaw(cacheKey, responseData);
            }
            resolve(responseData || { success: false, message: 'Empty response' });
        };

        const hardTimer = setTimeout(() => {
            if (responded) return;
            responded = true;
            cleanup();
            if (!payload._retried) {
                payload._retried = true;
                setTimeout(() => jsonpRequest(payload, cacheKey, resolve), 800);
                return;
            }
            resolve({
                success: false,
                message: 'Server tidak merespon (timeout ' + (API_TIMEOUT/1000) + 's). Cek koneksi.',
                _jsonpTimeout: true,
                _action: payload.action
            });
        }, API_TIMEOUT + 5000);

        const softTimer = setTimeout(() => {
            if (responded) return;
        }, API_TIMEOUT);

        const handleError = function(ev) {
            if (responded) return;
            responded = true;
            clearTimeout(softTimer);
            clearTimeout(hardTimer);
            cleanup();
            if (!payload._retried) {
                payload._retried = true;
                setTimeout(() => jsonpRequest(payload, cacheKey, resolve), 1000);
                return;
            }
            resolve({
                success: false,
                message: 'Gagal terhubung ke server. Periksa koneksi internet.',
                _jsonpError: true,
                _action: payload.action
            });
        };

        scriptEl = document.createElement('script');
        scriptEl.src = fullUrl;
        scriptEl.async = true;
        scriptEl.onerror = handleError;

        try {
            document.head.appendChild(scriptEl);
        } catch (e) {
            responded = true;
            clearTimeout(softTimer);
            clearTimeout(hardTimer);
            cleanup();
            resolve({ success: false, message: 'Gagal append script: ' + e.message });
        }
    }

    function trySaveCache(payload, response) {
        const user = safeParseUser();
        const userKey = user ? user.id : 'anon';
        const action = payload.action;
        const data = Object.keys(payload)
            .filter(k => !['action','userId','role','callback','_retried'].includes(k))
            .reduce((acc, k) => { acc[k] = payload[k]; return acc; }, {});
        trySaveCacheRaw('cache_' + action + '_' + userKey + '_' + JSON.stringify(data), response);
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

    function forceRefreshData(action, data) {
        data = data || {};
        const shouldBypass = data.__fresh === true;
        const cleanData = Object.assign({}, data);
        delete cleanData.__fresh;

        const user = safeParseUser();
        const userKey = user ? user.id : 'anon';

        if (!shouldBypass) {
            const cKey = 'cache_' + action + '_' + userKey + '_' + JSON.stringify(cleanData);
            const cached = SafeSessionStorage.getItem(cKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    const ttl = getCacheTTL(action);
                    if (ttl > 0 && Date.now() - parsed._timestamp < ttl) {
                        return Promise.resolve(parsed.data);
                    }
                } catch (e) {}
            }
        }

        return new Promise((resolve) => {
            try {
                if (isOffline() && isReadAction(action)) {
                    const cKey = 'cache_' + action + '_' + userKey + '_' + JSON.stringify(cleanData);
                    const cached = SafeSessionStorage.getItem(cKey);
                    if (cached) {
                        try { return resolve(JSON.parse(cached).data); } catch (e) {}
                    }
                }

                const payload = Object.assign({ action: action }, cleanData);
                if (user) {
                    payload.userId = user.id;
                    payload.role = user.role;
                }

                const cKey = 'cache_' + action + '_' + userKey + '_' + JSON.stringify(cleanData);
                if (cKey) {
                    SafeSessionStorage.removeItem(cKey);
                    delete _cacheTimestamps[cKey];
                }

                const payloadSize = JSON.stringify(payload).length;
                const needsPost = !!cleanData.base64Data || payloadSize > POST_SIZE_THRESHOLD;

                if (needsPost) {
                    postRequestWithFallback(payload, cKey).then(resolve).catch(err => resolve({ success: false, message: err.message }));
                } else {
                    jsonpRequest(payload, cKey, resolve);
                }
            } catch (err) {
                resolve({ success: false, message: err.message });
            }
        });
    }

    // ══════════════════════════════════════════════════════════
    //  15b. PRESERVE ORIGINAL
    // ══════════════════════════════════════════════════════════
    window.__originalApiCall = originalApiCall;

    // ══════════════════════════════════════════════════════════
    //  16. DARK MODE
    // ══════════════════════════════════════════════════════════
    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        document.querySelectorAll('.theme-icon-moon').forEach(el => el.classList.toggle('hidden', !isDark));
        document.querySelectorAll('.theme-icon-sun').forEach(el => el.classList.toggle('hidden', isDark));
    }

    function initDarkMode() {
        applyTheme(SafeStorage.getItem('color-theme') || 'light');
    }

    // ══════════════════════════════════════════════════════════
    //  17. LOGOUT
    // ══════════════════════════════════════════════════════════
    function logout() {
        SafeStorage.removeItem('user');
        SafeSessionStorage.clear();
        resetBootFlag();
        clearPrefetchCache();
        stopFormNotificationPolling();

        try {
            if (window.SyncManager && typeof window.SyncManager.clearQueue === 'function') {
                window.SyncManager.clearQueue();
            }
        } catch (e) {}

        Object.keys(window).forEach(k => {
            if (k.startsWith('__') && (k.endsWith('Loaded') || k.endsWith('Init'))) {
                try { window[k] = false; } catch (e) {}
            }
        });
        router.load('/');

        try { window.dispatchEvent(new CustomEvent('logout-success')); } catch (e) {}
    }

    // ══════════════════════════════════════════════════════════
    //  18. MODULE REGISTRY
    // ══════════════════════════════════════════════════════════
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
        has(name) {
            return !!this._modules[name];
        },
        clear() { this._modules = {}; }
    };

    // ══════════════════════════════════════════════════════════
    //  19. ROUTES — v48.2.0
    // ══════════════════════════════════════════════════════════
    const ROUTES = {
        // ── PUBLIC ──
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

        // ── AUTH ──
        '/auth':            { layout:'auth', file:'views/auth.html', js:'js/auth.js' },

        // ── ADMIN ──
        '/dashboard_admin': { layout:'admin', file:'views/dashboard_admin.html', js:'js/dashboard_admin.js' },
        '/surat_admin':     { layout:'admin', file:'views/surat_admin.html', js:'js/surat_admin.js' },
        '/surat_preview':   { layout:'admin', file:'views/surat_preview.html', js:'js/surat_preview.js' },
        '/logbook_admin':   { layout:'admin', file:'views/logbook_admin.html', js:'js/logbook_admin.js' },
        '/logbook_report':  { layout:'admin', file:'views/logbook_report.html', js:'js/logbook_report.js',
                              libs:['html2canvas','jspdf','docx','pdflib'] },
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

        // ── MEMBER ──
        '/dashboard_member':{ layout:'member', file:'views/dashboard_member.html', js:'js/dashboard_member.js' },
        '/surat_member':    { layout:'member', file:'views/surat_member.html', js:'js/surat_member.js' },
        '/logbook_member':  { layout:'member', file:'views/logbook_member.html', js:'js/logbook_member.js',
                              libs:['html2canvas','jspdf','docx'] },

        // ── SEKRETARIS (standalone files) ──
        '/sekretaris_dashboard': {
            layout: 'sekretaris',
            file: 'views/sekretaris_dashboard.html',
            js: 'js/sekretaris_dashboard.js'
        },
        '/sekretaris_surat': {
            layout: 'sekretaris',
            file: 'views/sekretaris_surat.html',
            js: 'js/sekretaris_surat.js'
        },
        '/sekretaris_logbook': {
            layout: 'sekretaris',
            file: 'views/sekretaris_logbook.html',
            js: 'js/sekretaris_logbook.js',
            libs: ['html2canvas', 'jspdf', 'docx']
        },
        '/sekretaris_absensi': {
            layout: 'sekretaris',
            file: 'views/sekretaris_absensi.html',
            js: 'js/sekretaris_absensi.js',
            libs: ['qrcode']
        },
        '/sekretaris_laporan': {
            layout: 'sekretaris',
            file: 'views/sekretaris_laporan.html',
            js: 'js/sekretaris_laporan.js',
            libs: ['html2canvas', 'jspdf', 'docx']
        }
    };

    // ══════════════════════════════════════════════════════════
    //  20. SCRIPT LOADER
    // ══════════════════════════════════════════════════════════
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

    // ══════════════════════════════════════════════════════════
    //  21. EXECUTE SCRIPTS
    // ══════════════════════════════════════════════════════════
    function executeScripts(container) {
        const scripts = container.querySelectorAll('script');
        let successCount = 0;
        let failCount = 0;

        scripts.forEach(oldScript => {
            const code = oldScript.textContent;
            if (!code || !code.trim()) return;

            if (code.indexOf('__CDN_FALLBACK_DONE') !== -1 ||
                (code.indexOf('[CDN]') !== -1 && code.indexOf('Fallback:') !== -1) ||
                (code.indexOf('FALLBACKS') !== -1 && code.indexOf('loading fallback') !== -1)) {
                try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                return;
            }

            if (oldScript.dataset && oldScript.dataset.appExecuted === 'true') {
                try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                return;
            }

            if (code.indexOf('StorageGuard') !== -1 ||
                code.indexOf('Tracking Prevention') !== -1) {
                try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                return;
            }

            const hasCorruptChar = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(code);

            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            newScript.dataset.appExecuted = 'true';
            newScript.textContent = code;

            if (newScript.src) {
                try {
                    oldScript.parentNode.replaceChild(newScript, oldScript);
                    successCount++;
                } catch (e) {
                    failCount++;
                }
                return;
            }

            if (hasCorruptChar) {
                failCount++;
                try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                return;
            }

            try {
                oldScript.parentNode.replaceChild(newScript, oldScript);
                successCount++;
            } catch (replaceErr) {
                try {
                    (new Function(code))();
                    successCount++;
                    try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                } catch (execErr) {
                    failCount++;
                    try { oldScript.parentNode.removeChild(oldScript); } catch (e) {}
                }
            }
        });

        if (failCount > 0) {
            console.warn('[App] executeScripts: ' + successCount + ' OK, ' + failCount + ' failed');
        }
    }

    // ══════════════════════════════════════════════════════════
    //  22. ROUTER — v48.2.0
    // ══════════════════════════════════════════════════════════
    const router = {
        async load(url, pushState) {
            if (pushState === undefined) pushState = true;

            // ═══ CLEANUP MODULE SEBELUMNYA ═══
            try {
                if (window.__intervals && window.__intervals.length > 0) {
                    window.__intervals.forEach(clearInterval);
                    window.__intervals = [];
                }
                if (typeof window.__cleanupBeforeNavigate === 'function') {
                    try { window.__cleanupBeforeNavigate(); } catch (e) {}
                    window.__cleanupBeforeNavigate = null;
                }

                const currentHash = window.location.hash.replace('#', '').split('?')[0];
                runCleanupForPath(currentHash);
            } catch (cleanupErr) {
                console.warn('[App] Cleanup error:', cleanupErr.message);
            }

            // Normalize URL
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

            // ═══ ROLE-BASED ROUTE PROTECTION ═══
            if (route.layout === 'admin' && (!user || user.role !== 'admin')) {
                return this.load('/auth', pushState);
            }
            if (route.layout === 'member' && (!user || user.role !== 'member')) {
                return this.load('/auth', pushState);
            }
            if (route.layout === 'sekretaris' && (!user || user.role !== 'sekretaris')) {
                return this.load('/auth', pushState);
            }

            this.switchLayout(route.layout);

            // Reset module flags
            let moduleKey = path.replace(/^\//, '').replace(/\//g, '_');
            if (!moduleKey) moduleKey = 'index';
            const camelKey = moduleKey.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
            window['__' + camelKey + 'Loaded'] = false;
            window['__' + camelKey + 'Init'] = false;

            const libsPromise = (route.libs && route.libs.length > 0)
                ? Promise.allSettled(route.libs.map(lib => loadLib(lib)))
                : Promise.resolve([]);

            const scriptPromise = route.js
                ? loadScript(route.js).catch(e => { return null; })
                : Promise.resolve(null);

            const containerMap = {
                public: '#public-content',
                admin: '#admin-content',
                member: '#member-content',
                sekretaris: '#sekretaris-content',
                auth: '#auth-content'
            };
            const container = document.querySelector(containerMap[route.layout]);
            if (!container) {
                console.error('[App] Container tidak ditemukan untuk layout:', route.layout);
                return;
            }

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
                            response = await fetchWithTimeout(fetchUrl, fetchTimeout);
                        } else {
                            throw e;
                        }
                    }

                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    html = await response.text();
                    viewCache.set(route.file, html);

                    if (!window.__DEV_NO_VIEW_CACHE) {
                        try { SafeSessionStorage.setItem('__view_' + route.file, html); } catch (e) {}
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

            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    Promise.resolve().then(function() {
                        App.run(moduleKey);
                    });
                });
            });

            libsPromise.then(results => {
                const ok = results.filter(r => r.status === 'fulfilled').length;
                const fail = results.length - ok;
                if (fail > 0) log('Libs selesai:', ok, 'ok,', fail, 'fail untuk', moduleKey);
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
            this.autoExpandSubmenu(path);
            window.scrollTo(0, 0);

            try {
                markBootDone();
                const bootLoader = document.getElementById('app-boot-loader');
                if (bootLoader && !bootLoader.classList.contains('app-boot-done')) {
                    forceHideBootLoader();
                }
            } catch (e) {}

            try {
                window.dispatchEvent(new CustomEvent('router:page-ready', {
                    detail: { path: path, layout: route.layout }
                }));
            } catch (e) {}
        },

        switchLayout(layout) {
            ['public','admin','member','sekretaris','auth'].forEach(l => {
                const el = document.getElementById('layout-' + l);
                if (!el) return;
                const isActive = l === layout;
                el.classList.toggle('hidden', !isActive);
                el.style.display = isActive ? (l === 'public' ? 'flex' : 'block') : 'none';
            });

            if (layout === 'admin' || layout === 'member' || layout === 'sekretaris') {
                const collapsed = SafeStorage.getItem('sidebarCollapsed') === 'true';
                const sidebar = document.getElementById(layout + '-sidebar');
                const content = document.getElementById(layout + '-content');
                if (sidebar) sidebar.classList.toggle('collapsed', collapsed);
                if (content) content.classList.toggle('expanded', collapsed);
            }
            if (layout === 'public') updateAuthLinks();
        },

        updateActiveMenus(path) {
            ['#public-navbar', '#layout-admin', '#layout-member', '#layout-sekretaris'].forEach(sel => {
                document.querySelectorAll(sel + ' .nav-links a, ' + sel + ' .nav-link').forEach(el => {
                    const href = el.getAttribute('href') || '';
                    const hrefPath = href.startsWith('#') ? href.slice(1) : href;
                    const isActive = hrefPath === path;
                    el.classList.toggle('active', isActive);
                });
            });
        },

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

        autoExpandSubmenu(path) {
            // Auto-expand submenu yang berisi route aktif
            ['#layout-admin', '#layout-member', '#layout-sekretaris'].forEach(sel => {
                const layoutEl = document.querySelector(sel);
                if (!layoutEl) return;
                layoutEl.querySelectorAll('.has-submenu').forEach(sub => {
                    const hasActive = sub.querySelector('a[href="' + path + '"]');
                    if (hasActive) sub.classList.add('open');
                });
            });
        },

        load404() {
            const container = document.querySelector('#public-content') ||
                              document.querySelector('#admin-content') ||
                              document.querySelector('#member-content') ||
                              document.querySelector('#sekretaris-content');
            if (container) {
                container.innerHTML = '<div class="text-center py-20">' +
                    '<h1 class="text-6xl font-bold text-[var(--text-main)]">404</h1>' +
                    '<p class="text-xl mt-4 text-[var(--text-muted)]">Halaman tidak ditemukan.</p>' +
                    '<a href="/" class="btn-primary mt-6 inline-block px-6 py-2 rounded-lg">Kembali ke Beranda</a></div>';
            }
        }
    };

    /**
     * Panggil cleanup function modul untuk path tertentu.
     */
    function runCleanupForPath(path) {
        if (!path) return;
        let moduleKey = path.replace(/^\//, '').replace(/\//g, '_');
        if (!moduleKey) moduleKey = 'index';
        const camelKey = moduleKey.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
        const cleanupFn = window['__' + camelKey + 'Cleanup'];
        if (typeof cleanupFn === 'function') {
            try {
                cleanupFn();
                log('Cleanup called:', camelKey);
            } catch (e) {
                console.warn('[App] Cleanup error for ' + camelKey + ':', e.message);
            }
        }

        // Also run route-specific leave hook
        const hook = ROUTE_LEAVE_HOOKS[path];
        if (typeof hook === 'function') {
            try { hook(); } catch (e) {}
        }
    }

    // ══════════════════════════════════════════════════════════
    //  23. AUTH LINKS
    // ══════════════════════════════════════════════════════════
    function updateAuthLinks() {
        const user = safeParseUser();
        const desktop = document.getElementById('public-auth-links');
        if (desktop) {
            if (user) {
                const role = user.role || 'member';
                const name = user.nama || user.name || user.username || 'User';
                const firstName = String(name).trim().split(/\s+/)[0] || 'User';

                let dashUrl, roleClass, roleIcon, roleLabel;
                if (role === 'admin') {
                    dashUrl = '/dashboard_admin';
                    roleClass = 'role-badge-admin';
                    roleIcon = 'fa-shield-alt';
                    roleLabel = 'Admin';
                } else if (role === 'sekretaris') {
                    dashUrl = '/sekretaris_dashboard';
                    roleClass = 'role-badge-sekretaris';
                    roleIcon = 'fa-user-edit';
                    roleLabel = 'Sekretaris';
                } else {
                    dashUrl = '/dashboard_member';
                    roleClass = 'role-badge-member';
                    roleIcon = 'fa-user';
                    roleLabel = 'Member';
                }

                desktop.innerHTML =
                    '<a href="' + dashUrl + '" class="navbar-user-pill ' + roleClass + '" title="Buka Dashboard ' + roleLabel + '">' +
                        '<span class="navbar-user-avatar"><i class="fas ' + roleIcon + '"></i></span>' +
                        '<span class="navbar-user-info">' +
                            '<span class="navbar-user-name">' + escapeHtml(firstName) + '</span>' +
                            '<span class="navbar-user-role">' + roleLabel + '</span>' +
                        '</span></a>';
            } else {
                desktop.innerHTML =
                    '<a href="/auth" class="navbar-login-btn">' +
                        '<i class="fas fa-sign-in-alt"></i><span>Masuk</span></a>';
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //  24. SIDEBAR TOGGLE
    // ══════════════════════════════════════════════════════════
    function toggleSidebar(type) {
        const sidebar = document.getElementById(type + '-sidebar');
        const content = document.getElementById(type + '-content');
        const overlay = document.getElementById(
            type === 'admin' ? 'sidebar-overlay' :
            type === 'sekretaris' ? 'sekretaris-overlay' :
            'member-overlay'
        );
        if (!sidebar) return;
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('active');
            return;
        }
        const collapsed = !sidebar.classList.contains('collapsed');
        sidebar.classList.toggle('collapsed', collapsed);
        if (content) content.classList.toggle('expanded', collapsed);
        SafeStorage.setItem('sidebarCollapsed', String(collapsed));
    }

    // ══════════════════════════════════════════════════════════
    //  25. FORM NOTIFICATION POLLING
    // ══════════════════════════════════════════════════════════
    function checkFormNotifications() {
        const user = safeParseUser();
        if (!user || user.role !== 'admin') return;
        if (!navigator.onLine) return;

        apiCall('getUnreadFormCount', 'POST', {}).then(res => {
            if (!res || !res.success) return;
            const count = Number(res.count) || 0;
            const badge = document.getElementById('forms-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
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

    // ══════════════════════════════════════════════════════════
    //  26. EVENT DELEGATION
    // ══════════════════════════════════════════════════════════
    function attachGlobalListeners() {
        if (window.__globalListenersAttached) return;
        window.__globalListenersAttached = true;

        // Refresh buttons — clear cache
        document.addEventListener('click', function(e) {
            const btn = e.target.closest(
                '#refresh-btn, #refresh-surat-btn, #refresh-logbook-btn, #refresh-berita-btn, ' +
                '#refresh-anggota-btn, #refresh-kader-btn, #refresh-profil-btn, #refresh-tokoh-btn, ' +
                '#refresh-arsip-btn, #refresh-kalender-btn, #refresh-galeri-btn, ' +
                '#refresh-keuangan-btn, #refresh-inventaris-btn, #refresh-proker-btn, #refresh-forum-btn, ' +
                '#refresh-absensi-btn, #refresh-member-btn, #dashboard-refresh-btn, #refresh-logbook-member-btn, ' +
                '#refresh-forms-btn, #refresh-responses-btn, #refresh-kegiatan-btn, #refresh-surat-member-btn, ' +
                '#sek-dash-refresh, #refresh-sekretaris-btn, #refresh-logbook-btn-sek, #refresh-laporan-btn, ' +
                '#sk-refresh-btn, [data-refresh]'
            );
            if (!btn) return;
            const path = window.location.hash.replace('#', '').split('?')[0] || '/';
            const endpoints = ROUTE_DATA_ENDPOINTS[path] || [];
            const user = safeParseUser();
            if (user && endpoints.length > 0) {
                endpoints.forEach(action => invalidateCacheForAction(action));
            }
        });

        // Main click delegation
        document.addEventListener('click', function(e) {
            const target = e.target;

            // Theme toggle
            if (target.closest('#theme-toggle, #admin-theme-toggle, #admin-theme-toggle-mobile, #member-theme-toggle, #member-theme-toggle-mobile, #sekretaris-theme-toggle, #sekretaris-theme-toggle-mobile')) {
                const cur = SafeStorage.getItem('color-theme') || 'light';
                const next = cur === 'light' ? 'dark' : 'light';
                SafeStorage.setItem('color-theme', next);
                applyTheme(next);
                return;
            }

            // Sidebar toggle
            if (target.closest('#sidebar-toggle')) { toggleSidebar('admin'); return; }
            if (target.closest('#member-sidebar-toggle')) { toggleSidebar('member'); return; }
            if (target.closest('#sekretaris-sidebar-toggle')) { toggleSidebar('sekretaris'); return; }

            // Overlay close
            if (target.id === 'sidebar-overlay' || target.id === 'member-overlay' || target.id === 'sekretaris-overlay') {
                const sidebar = document.getElementById('admin-sidebar') ||
                                document.getElementById('member-sidebar') ||
                                document.getElementById('sekretaris-sidebar');
                if (sidebar) sidebar.classList.remove('open');
                target.classList.remove('active');
                return;
            }

            // Submenu toggles
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

            const memberToggle = target.closest('#layout-member .has-submenu > a');
            if (memberToggle) {
                e.preventDefault();
                memberToggle.parentElement.classList.toggle('open');
                return;
            }

            const sekretarisToggle = target.closest('#layout-sekretaris .has-submenu > a');
            if (sekretarisToggle) {
                e.preventDefault();
                sekretarisToggle.parentElement.classList.toggle('open');
                return;
            }

            // Logout
            if (target.closest('#sidebar-logout, #member-logout, #sekretaris-logout, #navbar-logout, ' +
                              '#admin-logout-mobile, #member-logout-mobile, #sekretaris-logout-mobile')) {
                logout();
                return;
            }

            // Mobile sidebar auto-close saat nav link di-click
            const navLink = target.closest('.sidebar .nav-links a');
            if (navLink && window.innerWidth <= 768) {
                const sidebar = document.getElementById('admin-sidebar') ||
                                document.getElementById('member-sidebar') ||
                                document.getElementById('sekretaris-sidebar');
                const overlay = document.getElementById('sidebar-overlay') ||
                                document.getElementById('member-overlay') ||
                                document.getElementById('sekretaris-overlay');
                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('active');
            }
        });

        // Navbar scroll
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

        // Link interception
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

        // ESC to close sidebar
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const sidebar = document.getElementById('admin-sidebar') ||
                                document.getElementById('member-sidebar') ||
                                document.getElementById('sekretaris-sidebar');
                const overlay = document.getElementById('sidebar-overlay') ||
                                document.getElementById('member-overlay') ||
                                document.getElementById('sekretaris-overlay');
                if (sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    if (overlay) overlay.classList.remove('active');
                }
            }
        });

        // Visibility change — refresh notif
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) checkFormNotifications();
        });
    }

    // ══════════════════════════════════════════════════════════
    //  27. CONFIRM MODAL
    // ══════════════════════════════════════════════════════════
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

    // ══════════════════════════════════════════════════════════
    //  28. TAILWIND FALLBACK DETECTION
    // ══════════════════════════════════════════════════════════
    function checkTailwindFallback() {
        setTimeout(() => {
            const testEl = document.querySelector('.flex');
            const isTWLoaded = typeof window.tailwind !== 'undefined' ||
                (testEl && window.getComputedStyle(testEl).display === 'flex');

            if (!isTWLoaded && !__IS_LOCALHOST) {
                const banner = document.createElement('div');
                banner.id = 'network-error-banner';
                banner.style.cssText =
                    'position: fixed; top: 0; left: 0; right: 0;' +
                    'background: linear-gradient(135deg, #fbbf24, #f59e0b);' +
                    'color: #0f2922; padding: 10px 16px; text-align: center;' +
                    'font-size: 0.8rem; font-weight: 600; z-index: 99999;' +
                    'box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-family: system-ui, sans-serif;';
                banner.innerHTML = '⚠️ Mode Hemat Data aktif. ' +
                    '<button onclick="this.parentNode.remove()" style="background:none;border:none;color:#0f2922;font-weight:700;cursor:pointer;text-decoration:underline;margin-left:8px;">Tutup</button>';
                document.body.appendChild(banner);
                setTimeout(() => banner.remove(), 8000);
            }
        }, 2000);
    }

    // ══════════════════════════════════════════════════════════
    //  29. GLOBAL ERROR HANDLER
    // ══════════════════════════════════════════════════════════
    let __errorCount = 0;
    window.addEventListener('error', function(e) {
        if (!e.message) return;
        if (e.message.includes('Script error')) return;
        if (e.message.includes('ResizeObserver')) return;
        if (e.message.includes('Tracking Prevention')) return;
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

    // ══════════════════════════════════════════════════════════
    //  30. INIT
    // ══════════════════════════════════════════════════════════
    function init() {
        initDarkMode();
        attachGlobalListeners();
        ensureConfirmModal();

        window.__intervals = window.__intervals || [];

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
        if (user && (user.role === 'admin' || user.role === 'member' || user.role === 'sekretaris')) {
            setTimeout(() => {
                if (typeof window.prefetchRoutes === 'function') {
                    prefetchRoutes(user.role).catch(() => {});
                }
            }, 1500);
        }

        if (user && user.role === 'admin') {
            startFormNotificationPolling();
        }

        // Online/Offline listeners
        window.addEventListener('online', function() {
            console.log('[App] 🟢 Online — checking pending queue');
            if (window.SyncManager && typeof window.SyncManager.syncNow === 'function') {
                setTimeout(() => {
                    const q = window.SyncManager.getQueue();
                    if (q && q.length > 0) {
                        window.SyncManager.syncNow();
                    }
                }, 1000);
            }
        });

        window.addEventListener('offline', function() {
            console.log('[App] 🔴 Offline — switching to cache mode');
            showToast('📴 Mode Offline — perubahan akan disimpan lokal', 'warning', 4000);
        });

        console.log('[App] ✅ Init complete — v48.2.0 SEKRETARIS RANTING + ABSENSI EDITION');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ══════════════════════════════════════════════════════════
    //  31. EXPOSE GLOBAL
    // ══════════════════════════════════════════════════════════
    window.router = router;
    window.router.onLeave = function(routeName, callback) {
        if (typeof callback === 'function' && routeName) {
            ROUTE_LEAVE_HOOKS[routeName] = callback;
        }
    };
    window.router.routes = ROUTES;
    window.router.getCurrentPath = function() {
        return window.location.hash.replace('#', '').split('?')[0] || '/';
    };
    window.router.getCurrentQuery = function() {
        try {
            const hash = window.location.hash;
            const qIdx = hash.indexOf('?');
            if (qIdx === -1) return new URLSearchParams();
            return new URLSearchParams(hash.substring(qIdx + 1));
        } catch (e) { return new URLSearchParams(); }
    };

    window.App = App;
    window.logout = logout;
    window.checkAuth = checkAuth;
    window.apiCall = apiCall;
    window.__originalApiCall = originalApiCall;
    window.forceRefreshData = forceRefreshData;
    window.showToast = showToast;
    window.showConfirm = showConfirm;
    window.formatDate = formatDate;
    window.formatRupiah = formatRupiah;
    window.escapeHtml = escapeHtml;
    window.startLoading = startLoading;
    window.stopLoading = stopLoading;
    window.uploadFileToDrive = uploadFileToDrive;
    window.fileToBase64 = fileToBase64;
    window.chunkedUpload = chunkedUpload;
    window.logActivity = logActivity;
    window.debounceEvent = debounceEvent;
    window.toggleSidebar = toggleSidebar;
    window.applyTheme = applyTheme;
    window.loadLib = loadLib;
    window.updateAuthLinks = updateAuthLinks;
    window.checkFormNotifications = checkFormNotifications;
    window.getCachedData = getCachedData;
    window.invalidateCacheForAction = invalidateCacheForAction;
    window.prefetchRoutes = prefetchRoutes;
    window.clearPrefetchCache = clearPrefetchCache;
    window.resetPrefetchCache = resetPrefetchCache;
    window.getPrefetchState = () => ({});
    window.getViewCacheSize = () => viewCache.size;
    window.isDevNoViewCache = () => window.__DEV_NO_VIEW_CACHE;
    window.getCacheVersion = () => CACHE_VERSION;
    window.getEnvironment = () => window.__APP_ENV;
    window.getChunkedUploads = () => ({ ..._chunkedUploads });
    window.getActiveJsonpCallbacks = () => Array.from(_activeJsonpCallbacks);
    window.markBootDone = markBootDone;
    window.resetBootFlag = resetBootFlag;
    window.forceHideBootLoader = forceHideBootLoader;

    // ══════════════════════════════════════════════════════════
    //  32. PREFETCH STUBS
    // ══════════════════════════════════════════════════════════
    async function prefetchRoutes(role, force) {
        if (__IS_MOBILE || __IS_SLOW_NET) return;
        if (window.__PERF && typeof window.__PERF.startAutoPrefetch === 'function') {
            return window.__PERF.startAutoPrefetch(force === true);
        }
    }

    function clearPrefetchCache() {
        viewCache.clear();
        try {
            if (_isSessionAvailable()) {
                const keys = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const k = sessionStorage.key(i);
                    if (k && k.startsWith('__view_')) keys.push(k);
                }
                keys.forEach(k => sessionStorage.removeItem(k));
                sessionStorage.removeItem('__lastPrefetch');
                sessionStorage.removeItem('__lastPrefetchRole');
            }
        } catch (e) {}
    }

    function resetPrefetchCache() {
        clearPrefetchCache();
    }

    // ══════════════════════════════════════════════════════════
    //  33. DEBUG HELPERS
    // ══════════════════════════════════════════════════════════
    window.debugCache = function() {
        console.log('');
        console.log('═══════════════════════════════════════');
        console.log('   CACHE INSPECTOR');
        console.log('═══════════════════════════════════════');
        const userKey = getUserKey();
        console.log('User Key:', userKey);
        console.log('Boot Done:', SafeSessionStorage.getItem(BOOT_FLAG_KEY));
        console.log('Cache Version:', CACHE_VERSION);
        console.log('');
        try {
            const keys = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && (k.startsWith('cache_') || k.startsWith('__view_'))) {
                    keys.push(k);
                }
            }
            console.log('Cache keys:', keys.length);
            keys.forEach(k => {
                try {
                    const v = JSON.parse(sessionStorage.getItem(k));
                    const age = v._timestamp ? Math.round((Date.now() - v._timestamp) / 1000) + 's' : 'N/A';
                    console.log('  -', k.substring(0, 80), '| age:', age);
                } catch (e) {
                    console.log('  -', k.substring(0, 80), '| parse error');
                }
            });
        } catch (e) {
            console.error('Storage error:', e);
        }
    };

    window.debugRoutes = function() {
        console.log('');
        console.log('═══════════════════════════════════════');
        console.log('   ROUTES INSPECTOR (' + Object.keys(ROUTES).length + ' routes)');
        console.log('═══════════════════════════════════════');
        Object.keys(ROUTES).forEach(path => {
            const r = ROUTES[path];
            console.log('  ' + path.padEnd(28), '→', r.layout.padEnd(12), r.file);
        });
        console.log('═══════════════════════════════════════');
    };

    window.getAppInfo = function() {
        return {
            version: CACHE_VERSION,
            routes: Object.keys(ROUTES).length,
            env: window.__APP_ENV,
            user: safeParseUser(),
            cacheKeys: (function() {
                try {
                    let n = 0;
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const k = sessionStorage.key(i);
                        if (k && (k.startsWith('cache_') || k.startsWith('__view_'))) n++;
                    }
                    return n;
                } catch (e) { return 0; }
            })()
        };
    };

    // ══════════════════════════════════════════════════════════
    //  FINAL LOG
    // ══════════════════════════════════════════════════════════
    console.log('✅ App.js v48.2.0 loaded — SEKRETARIS RANTING + ABSENSI EDITION');
    console.log('   Cache version:', CACHE_VERSION);
    console.log('   Environment:', window.__APP_ENV.isMobile ? 'MOBILE' : 'DESKTOP',
                __IS_LOCALHOST ? '(DEV)' : '(PROD)');
    console.log('   Storage:', window.__APP_ENV.storageAvailable ? 'OK' : 'BLOCKED (in-memory fallback)');
    console.log('   Routes:', Object.keys(ROUTES).length);
    console.log('   Layouts: public, admin, member, sekretaris, auth');
    console.log('   Offline mode: ✅ Enabled (SyncManager auto-detect)');
    console.log('   FormPhoto utility: ✅ loaded');
    console.log('   Auto cache invalidation: ✅ enabled');
    console.log('   Route cleanup hooks: ✅ enabled');
    console.log('');
    console.log('   💡 Debug helpers:');
    console.log('   - window.debugCache()');
    console.log('   - window.debugRoutes()');
    console.log('   - window.getAppInfo()');

})();