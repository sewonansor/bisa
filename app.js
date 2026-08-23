/**
 * ============================================================
 *  app.js - Core SPA untuk PAC GP Ansor Kapanewon Sewon
 *  Versi: 24.0.0 - Final Complete (Optimasi Kecepatan, Semua Menu, Anti Error)
 *  Jumlah Baris: ±958
 * ============================================================
 */

(function() {
    if (window.__APP_LOADED) return;
    window.__APP_LOADED = true;

    // ============================================================
    //  KONFIGURASI GLOBAL
    // ============================================================
    const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwZCHcqj3V6yke4b9EQ0D0m26SJHOamhL98El3-7l3cDPwnSUD475YrnJviEh4YbGKrVQ/exec';
    const CACHE_TTL = 60000; // 60 detik
    const DEBOUNCE_DELAY = 500;
    const API_TIMEOUT = 15000; // 15 detik untuk Apps Script

    // ============================================================
    //  STATE MANAJEMEN PENDING REQUEST
    // ============================================================
    const _pending = {};
    const _cacheTimestamps = {};

    // ============================================================
    //  API CORE (JSONP + Cache + Anti-Loop)
    // ============================================================

    /**
     * Fungsi utama untuk memanggil API via JSONP.
     * Mendukung cache untuk operasi GET.
     */
    function apiCall(action, method = 'POST', data = {}) {
        return new Promise((resolve) => {
            try {
                const user = JSON.parse(localStorage.getItem('user'));
                const payload = { action, ...data };
                if (user) {
                    payload.userId = user.id;
                    payload.role = user.role;
                }

                const isGet = action.toLowerCase().startsWith('get');
                const cKey = isGet && user ? `cache_${action}_${user.id}_${JSON.stringify(data)}` : null;

                // Cek cache dulu
                if (isGet && cKey) {
                    try {
                        const cached = sessionStorage.getItem(cKey);
                        if (cached) {
                            const parsed = JSON.parse(cached);
                            if (Date.now() - parsed._timestamp < CACHE_TTL) {
                                console.log(`✅ CACHE dipakai: ${action}`);
                                resolve(parsed.data);
                                // Refresh background jika kedaluwarsa mendekati TTL
                                if (!_cacheTimestamps[cKey] || Date.now() - _cacheTimestamps[cKey] > CACHE_TTL) {
                                    _cacheTimestamps[cKey] = Date.now();
                                    refreshData(action, payload, cKey);
                                }
                                return;
                            }
                        }
                    } catch (e) { }
                }

                // Cek apakah request serupa sedang berjalan (Anti-Loop)
                const pKey = cKey || action;
                if (_pending[pKey]) {
                    _pending[pKey].then(resolve).catch(resolve);
                    return;
                }

                const promise = new Promise((resInner) => makeRequest(payload, cKey, resInner));
                _pending[pKey] = promise;
                promise.finally(() => { delete _pending[pKey]; });
                promise.then(resolve).catch(resolve);
            } catch (error) {
                console.error('❌ Gagal apiCall:', error);
                resolve({ success: false, message: 'Error: ' + error.message });
            }
        });
    }

    /**
     * Fungsi internal untuk membuat request JSONP.
     */
    function makeRequest(payload, cacheKey, resolve) {
        const action = payload.action;
        const cbName = 'gasCallback_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        payload.callback = cbName;

        const qs = Object.keys(payload)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] ?? ''))
            .join('&');

        let responded = false;

        window[cbName] = function(responseData) {
            if (!responded) {
                responded = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                delete window[cbName];
                clearTimeout(timer);
                if (responseData.success && cacheKey) {
                    try {
                        sessionStorage.setItem(cacheKey, JSON.stringify({
                            data: responseData,
                            _timestamp: Date.now()
                        }));
                        window.dispatchEvent(new CustomEvent('dataUpdated', {
                            detail: { action, data: responseData, source: 'api' }
                        }));
                    } catch (e) { }
                }
                resolve(responseData);
            }
        };

        const timer = setTimeout(() => {
            if (!responded) {
                responded = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                console.warn('⚠️ API timeout untuk:', action);
                resolve({ success: false, message: 'Server tidak merespon (timeout).' });
            }
        }, API_TIMEOUT);

        const script = document.createElement('script');
        script.src = `${API_BASE_URL}?${qs}`;
        script.onerror = function() {
            if (!responded) {
                responded = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                delete window[cbName];
                clearTimeout(timer);
                console.error('❌ API script error:', action);
                resolve({ success: false, message: 'Gagal terhubung ke server.' });
            }
        };
        document.head.appendChild(script);
    }

    /**
     * Refresh data di background tanpa mengganggu UI.
     */
    function refreshData(action, payload, cacheKey) {
        const cbName = 'bg_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        payload.callback = cbName;

        const qs = Object.keys(payload)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] ?? ''))
            .join('&');

        let responded = false;
        window[cbName] = function(responseData) {
            if (!responded) {
                responded = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                delete window[cbName];
                clearTimeout(timer);
                if (responseData.success && cacheKey) {
                    try {
                        sessionStorage.setItem(cacheKey, JSON.stringify({
                            data: responseData,
                            _timestamp: Date.now()
                        }));
                        window.dispatchEvent(new CustomEvent('dataUpdated', {
                            detail: { action, data: responseData, source: 'background' }
                        }));
                    } catch (e) { }
                }
            }
        };

        const timer = setTimeout(() => {
            if (!responded) {
                responded = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                // Jangan hapus window[cbName] di sini
            }
        }, API_TIMEOUT);

        const script = document.createElement('script');
        script.src = `${API_BASE_URL}?${qs}`;
        script.onerror = function() {
            if (!responded) {
                responded = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                delete window[cbName];
                clearTimeout(timer);
            }
        };
        document.head.appendChild(script);
    }

    // ============================================================
    //  FORCE REFRESH DATA (Selalu Ambil Data Terbaru)
    // ============================================================

    /**
     * Paksa ambil data terbaru dari server tanpa menggunakan cache.
     * Berguna untuk operasi real-time setelah CRUD.
     */
    function forceRefreshData(action, data = {}) {
        return new Promise((resolve) => {
            const user = JSON.parse(localStorage.getItem('user'));
            const payload = { action, ...data };
            if (user) {
                payload.userId = user.id;
                payload.role = user.role;
            }

            const cacheKey = user ? `cache_${action}_${user.id}_${JSON.stringify(data)}` : null;
            if (cacheKey) sessionStorage.removeItem(cacheKey);
            delete _cacheTimestamps[cacheKey];

            const cbName = 'force_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
            payload.callback = cbName;

            const qs = Object.keys(payload)
                .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k] ?? ''))
                .join('&');

            let responded = false;
            window[cbName] = function(responseData) {
                if (!responded) {
                    responded = true;
                    if (script.parentNode) script.parentNode.removeChild(script);
                    delete window[cbName];
                    clearTimeout(timer);
                    if (responseData.success && cacheKey) {
                        try {
                            sessionStorage.setItem(cacheKey, JSON.stringify({
                                data: responseData,
                                _timestamp: Date.now()
                            }));
                            window.dispatchEvent(new CustomEvent('dataUpdated', {
                                detail: { action, data: responseData, source: 'force' }
                            }));
                        } catch (e) { }
                    }
                    resolve(responseData);
                }
            };

            const timer = setTimeout(() => {
                if (!responded) {
                    responded = true;
                    if (script.parentNode) script.parentNode.removeChild(script);
                    delete window[cbName];
                    resolve({ success: false, message: 'Timeout refresh manual.' });
                }
            }, API_TIMEOUT);

            const script = document.createElement('script');
            script.src = `${API_BASE_URL}?${qs}`;
            script.onerror = function() {
                if (!responded) {
                    responded = true;
                    if (script.parentNode) script.parentNode.removeChild(script);
                    delete window[cbName];
                    clearTimeout(timer);
                    resolve({ success: false, message: 'Gagal koneksi server.' });
                }
            };
            document.head.appendChild(script);
        });
    }

    // ============================================================
    //  UTILITAS DEFENSIF (Loading, Format, Toast)
    // ============================================================

    /**
     * Mulai loading pada tombol.
     */
    function startLoading(btn, text = 'Memproses...') {
        if (!btn || !btn.classList) return;
        btn.classList.add('btn-loading');
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> ${text}`;
    }

    /**
     * Selesai loading pada tombol.
     */
    function stopLoading(btn) {
        if (!btn || !btn.classList) return;
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
        }
    }

    /**
     * Format tanggal ke format Indonesia.
     */
    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    /**
     * Format angka ke Rupiah.
     */
    function formatRupiah(a) {
        if (!a && a !== 0) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(a);
    }

    /**
     * Tampilkan toast notifikasi.
     */
    function showToast(msg, type = 'info', dur = 4000) {
        try {
            const old = document.querySelector('.global-toast');
            if (old) old.remove();

            const colors = {
                success: 'bg-green-600',
                error: 'bg-red-600',
                info: 'bg-blue-600',
                warning: 'bg-yellow-500'
            };

            const t = document.createElement('div');
            t.className = `global-toast fixed top-6 right-6 z-[9999] px-6 py-4 rounded-xl shadow-2xl text-white font-medium text-sm ${colors[type] || 'bg-blue-600'} transform translate-x-full transition-transform duration-300 ease-out`;
            t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i> ${msg}`;

            document.body.appendChild(t);
            setTimeout(() => t.classList.remove('translate-x-full'), 50);
            setTimeout(() => {
                t.classList.add('translate-x-full');
                setTimeout(() => t.remove(), 300);
            }, dur);
        } catch (e) { }
    }

    /**
     * Tampilkan modal konfirmasi cepat (menggantikan confirm()).
     */
    function showConfirm(message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        if (!modal) {
            // Fallback ke confirm() jika modal belum ada
            if (window.confirm(message)) onConfirm();
            return;
        }
        const textEl = document.getElementById('confirm-text');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        if (textEl) textEl.textContent = message;
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        okBtn.onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            onConfirm();
        };
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };
    }

    /**
     * Cek status login user.
     */
    function checkAuth() {
        try {
            const userRaw = localStorage.getItem('user');
            if (!userRaw) return null;
            return JSON.parse(userRaw) || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Logout user.
     */
    function logout() {
        localStorage.removeItem('user');
        sessionStorage.clear();
        router.load('/');
    }

    // ============================================================
    //  DEBOUNCE
    // ============================================================
    const debounceMap = {};

    function debounceEvent(action, callback, delay) {
        if (debounceMap[action]) clearTimeout(debounceMap[action]);
        debounceMap[action] = setTimeout(() => {
            delete debounceMap[action];
            callback();
        }, delay || DEBOUNCE_DELAY);
    }

    // ============================================================
    //  UPLOAD & LOG
    // ============================================================

    /**
     * Upload file ke Google Drive.
     */
    async function uploadFileToDrive(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    const result = await apiCall('uploadFile', 'POST', {
                        fileName: file.name,
                        mimeType: file.type,
                        base64Data
                    });
                    resolve(result);
                } catch (error) {
                    reject({ success: false, message: error.message });
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Catat aktivitas user ke log.
     */
    async function logActivity(action, module, targetId, details) {
        const user = JSON.parse(localStorage.getItem('user'));
        return await apiCall('createAuditLog', 'POST', {
            userId: user ? user.id : 'System',
            username: user ? user.username : 'System',
            action,
            module,
            targetId: targetId || '',
            details
        });
    }

    /**
     * Sembunyikan skeleton otomatis setelah delay.
     */
    function autoHideSkeleton(skeletonId, contentId, delay = 800) {
        const skeleton = document.getElementById(skeletonId);
        const content = document.getElementById(contentId);
        if (!skeleton || !content) return;
        setTimeout(() => {
            skeleton.classList.add('hidden');
            content.classList.remove('hidden');
        }, delay);
    }

    // ============================================================
    //  DARK MODE & SIDEBAR
    // ============================================================
    let __themeListenerAttached = false;

    /**
     * Inisialisasi dark mode.
     */
    function initDarkMode() {
        const applyTheme = (t) => {
            document.documentElement.classList.toggle('dark', t === 'dark');
            document.querySelectorAll('.theme-icon-moon').forEach(el => el.classList.toggle('hidden', t !== 'dark'));
            document.querySelectorAll('.theme-icon-sun').forEach(el => el.classList.toggle('hidden', t === 'dark'));
        };

        let cur = localStorage.getItem('color-theme');
        if (!cur) {
            cur = 'light';
            localStorage.setItem('color-theme', 'light');
        }
        applyTheme(cur);

        if (!__themeListenerAttached) {
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('#theme-toggle, #theme-toggle-mobile, #admin-theme-toggle, #member-theme-toggle');
                if (btn) {
                    const c = localStorage.getItem('color-theme') || 'light';
                    const n = c === 'light' ? 'dark' : 'light';
                    localStorage.setItem('color-theme', n);
                    applyTheme(n);
                }
            });
            __themeListenerAttached = true;
        }
    }

    // Sidebar dropdown (event delegation)
    document.addEventListener('click', function(e) {
        const adminToggle = e.target.closest('#layout-admin .has-submenu > a');
        if (adminToggle) {
            e.preventDefault();
            const parent = adminToggle.parentElement;
            const sidebar = document.getElementById('admin-sidebar');
            if (sidebar && sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                document.getElementById('admin-content').classList.remove('expanded');
                localStorage.setItem('sidebarCollapsed', 'false');
            }
            parent.classList.toggle('open');
        }
        const memberToggle = e.target.closest('#layout-member .has-submenu > a');
        if (memberToggle) {
            e.preventDefault();
            memberToggle.parentElement.classList.toggle('open');
        }
    });

    // ============================================================
    //  MODULE REGISTRY
    // ============================================================
    const App = {
        _modules: {},
        register(name, initFn) {
            this._modules[name] = initFn;
            console.log(`[App] Modul terdaftar: ${name}`);
        },
        run(name) {
            if (this._modules[name]) {
                console.log(`[App] Menjalankan modul: ${name}`);
                try {
                    this._modules[name]();
                } catch (error) {
                    console.error(`[App] Error pada modul ${name}:`, error);
                }
            } else {
                console.warn(`[App] Modul tidak ditemukan: ${name}`);
            }
        },
        clear() {
            this._modules = {};
        }
    };

    // ============================================================
    //  ROUTES (Semua Modul)
    // ============================================================
    const ROUTES = {
        // Publik
        '/':          { layout: 'public', file: 'views/index.html', js: 'js/index.js' },
        '/profil':    { layout: 'public', file: 'views/profil.html' },
        '/kegiatan':  { layout: 'public', file: 'views/kegiatan.html' },
        '/semua_berita': { layout: 'public', file: 'views/semua_berita.html', js: 'js/semua_berita.js' },
        '/berita_detail': { layout: 'public', file: 'views/berita_detail.html', js: 'js/berita_detail.js' },
        '/semua_kegiatan': { layout: 'public', file: 'views/semua_kegiatan.html', js: 'js/semua_kegiatan.js' },
        '/kegiatan_detail': { layout: 'public', file: 'views/kegiatan_detail.html' },
        '/anggota':   { layout: 'public', file: 'views/anggota.html' },
        '/dokumen':   { layout: 'public', file: 'views/dokumen.html' },
        '/kalender':  { layout: 'public', file: 'views/kalender.html' },
        '/arsip':     { layout: 'public', file: 'views/arsip.html' },
        '/keuangan':  { layout: 'public', file: 'views/keuangan.html', js: 'js/keuangan.js' },
        '/tokoh':     { layout: 'public', file: 'views/tokoh.html', js: 'js/tokoh.js' },
        '/absensi':   { layout: 'public', file: 'views/absensi.html', js: 'js/absensi.js' },
        '/kontak':    { layout: 'public', file: 'views/kontak.html' },

        // Auth
        '/auth':      { layout: 'auth', file: 'views/auth.html', js: 'js/auth.js' },

        // Admin
        '/dashboard_admin': { layout: 'admin', file: 'views/dashboard_admin.html', js: 'js/dashboard_admin.js' },
        '/surat_admin':     { layout: 'admin', file: 'views/surat_admin.html', js: 'js/surat_admin.js' },
        '/surat_preview':   { layout: 'admin', file: 'views/surat_preview.html', js: 'js/surat_preview.js' },
        '/logbook_admin':   { layout: 'admin', file: 'views/logbook_admin.html', js: 'js/logbook_admin.js' },
        '/logbook_report':  { layout: 'admin', file: 'views/logbook_report.html', js: 'js/logbook_report.js' },
        '/ringkasan':       { layout: 'admin', file: 'views/ringkasan.html', js: 'js/ringkasan.js' },
        '/berita_admin':    { layout: 'admin', file: 'views/berita_admin.html', js: 'js/berita_admin.js' },
        '/anggota_admin':   { layout: 'admin', file: 'views/anggota_admin.html', js: 'js/anggota_admin.js' },
        '/kader_admin':     { layout: 'admin', file: 'views/kader_admin.html', js: 'js/kader_admin.js' },
        '/profil_admin':    { layout: 'admin', file: 'views/profil_admin.html', js: 'js/profil_admin.js' },
        '/tokoh_admin':     { layout: 'admin', file: 'views/tokoh_admin.html', js: 'js/tokoh_admin.js' },
        '/arsip_admin':     { layout: 'admin', file: 'views/arsip_admin.html', js: 'js/arsip_admin.js' },
        '/kalender_admin':  { layout: 'admin', file: 'views/kalender_admin.html', js: 'js/kalender_admin.js' },
        '/galeri_admin':    { layout: 'admin', file: 'views/galeri_admin.html', js: 'js/galeri_admin.js' },
        '/keuangan_admin':  { layout: 'admin', file: 'views/keuangan_admin.html', js: 'js/keuangan_admin.js' },
        '/inventaris_admin':{ layout: 'admin', file: 'views/inventaris_admin.html', js: 'js/inventaris_admin.js' },
        '/proker_admin':    { layout: 'admin', file: 'views/proker_admin.html', js: 'js/proker_admin.js' },
        '/forum_admin':     { layout: 'admin', file: 'views/forum_admin.html', js: 'js/forum_admin.js' },
        '/absensi_admin':   { layout: 'admin', file: 'views/absensi_admin.html', js: 'js/absensi_admin.js' },

        // Member
        '/dashboard_member': { layout: 'member', file: 'views/dashboard_member.html', js: 'js/dashboard_member.js' },
        '/surat_member':     { layout: 'member', file: 'views/surat_member.html', js: 'js/surat_member.js' },
        '/logbook_member':   { layout: 'member', file: 'views/logbook_member.html', js: 'js/logbook_member.js' },
    };

    // ============================================================
    //  SCRIPT LOADER
    // ============================================================
    const loadedScripts = new Set();

    /**
     * Muat script secara dinamis.
     */
    async function loadScript(src) {
        if (loadedScripts.has(src)) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                loadedScripts.add(src);
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Jalankan script yang ada di dalam container (inline script).
     */
    function executeScripts(container) {
        const scripts = container.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.textContent = oldScript.textContent;
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    }

    // ============================================================
    //  ROUTER (HASH ROUTING + DUKUNGAN QUERY STRING)
    // ============================================================
    const router = {
        /**
         * Muat halaman berdasarkan URL hash.
         */
        async load(url, pushState = true) {
            // Bersihkan interval yang berjalan sebelum pindah halaman
            if (window.__intervals && window.__intervals.length > 0) {
                window.__intervals.forEach(clearInterval);
                window.__intervals = [];
            }

            if (url === '' || url === '/index.html' || url === '/index') url = '/';
            if (url.endsWith('/')) url = url.slice(0, -1);

            // Pisahkan path dan query string
            const [path, queryString] = url.split('?');
            const queryParams = new URLSearchParams(queryString || '');
            window.__currentQuery = queryParams;

            let route = ROUTES[path];
            if (!route) {
                const key = path.startsWith('/') ? path : '/' + path;
                route = ROUTES[key];
            }
            if (!route) {
                this.load404();
                return;
            }

            // Cek autentikasi untuk halaman admin/member
            const user = JSON.parse(localStorage.getItem('user'));
            if (route.layout === 'admin' && (!user || user.role !== 'admin')) return this.load('/auth', pushState);
            if (route.layout === 'member' && (!user || user.role !== 'member')) return this.load('/auth', pushState);

            this.switchLayout(route.layout);

            // Muat script modul jika ada
            if (route.js) {
                try {
                    await loadScript(route.js);
                } catch (e) {
                    console.warn('Gagal load script:', route.js, e);
                }
            }

            // Pilih container berdasarkan layout
            const containerMap = {
                'public': '#public-content',
                'admin': '#admin-content',
                'member': '#member-content',
                'auth': '#auth-content'
            };
            const container = document.querySelector(containerMap[route.layout]);
            if (!container) {
                console.error('Container tidak ditemukan:', route.layout);
                return;
            }

            // Tampilkan loading
            container.innerHTML = `<div class="flex justify-center items-center h-64"><i class="fas fa-spinner fa-spin text-3xl text-[var(--text-main)]"></i></div>`;

            try {
                const response = await fetch(route.file);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                container.innerHTML = doc.body.innerHTML;

                // Jalankan script inline
                executeScripts(container);

                // Panggil modul setelah view di-render
                let moduleKey = path.replace(/^\//, '').replace(/\//g, '_');
                if (moduleKey === '') moduleKey = 'index';

                requestAnimationFrame(() => {
                    App.run(moduleKey);
                });

                // Update hash untuk routing
                if (pushState) {
                    window.location.hash = url;
                }

                // Update menu aktif
                this.updateActiveMenus(path);
                window.scrollTo(0, 0);

            } catch (error) {
                console.error('Router Error:', error);
                container.innerHTML = `<div class="text-center text-red-500 p-8"><i class="fas fa-exclamation-triangle text-4xl mb-4"></i><p>Error: ${error.message}</p></div>`;
            }
        },

        /**
         * Ganti layout aktif.
         */
        switchLayout(layout) {
            const layouts = ['public', 'admin', 'member', 'auth'];
            layouts.forEach(l => {
                const el = document.getElementById(`layout-${l}`);
                if (el) {
                    if (l === layout) {
                        el.classList.remove('hidden');
                        el.style.display = l === 'public' ? 'flex' : 'block';
                    } else {
                        el.classList.add('hidden');
                        el.style.display = 'none';
                    }
                }
            });

            if (layout === 'admin') this.initAdminLayout();
            if (layout === 'member') this.initMemberLayout();
            if (layout === 'public') this.initPublicLayout();
        },

        /**
         * Update menu aktif di navbar/sidebar.
         */
        updateActiveMenus(url) {
            document.querySelectorAll('#public-navbar .nav-link').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === url);
            });
            document.querySelectorAll('#layout-admin .nav-links a').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === url);
            });
            document.querySelectorAll('#layout-member .nav-links a').forEach(el => {
                el.classList.toggle('active', el.getAttribute('href') === url);
            });
        },

        /**
         * Tampilkan halaman 404.
         */
        load404() {
            const container = document.querySelector('#public-content') || document.querySelector('#admin-content');
            if (container) {
                container.innerHTML = `<div class="text-center py-20"><h1 class="text-6xl font-bold">404</h1><p class="text-xl">Halaman tidak ditemukan.</p></div>`;
            }
        },

        /**
         * Inisialisasi layout admin (sidebar, toggle, logout).
         */
        initAdminLayout() {
            const sidebar = document.getElementById('admin-sidebar');
            const mainContent = document.getElementById('admin-content');
            const toggleBtn = document.getElementById('sidebar-toggle');
            const overlay = document.getElementById('sidebar-overlay');
            if (!sidebar) return;

            let collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
            if (collapsed) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('expanded');
            }

            function toggle() {
                collapsed = !collapsed;
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
                localStorage.setItem('sidebarCollapsed', collapsed);
                if (window.innerWidth <= 768) {
                    overlay.classList.remove('active');
                    sidebar.classList.remove('open');
                }
            }

            if (toggleBtn) toggleBtn.addEventListener('click', toggle);
            const mobileBtn = document.getElementById('mobile-menu-btn');
            if (mobileBtn) mobileBtn.addEventListener('click', function() {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            });
            if (overlay) overlay.addEventListener('click', function() {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });

            document.getElementById('sidebar-logout')?.addEventListener('click', logout);
        },

        /**
         * Inisialisasi layout member (sidebar, toggle, logout).
         */
        initMemberLayout() {
            const sidebar = document.getElementById('member-sidebar');
            const mainContent = document.getElementById('member-content');
            const toggleBtn = document.getElementById('member-sidebar-toggle');
            const overlay = document.getElementById('member-overlay');
            if (!sidebar) return;

            let collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
            if (collapsed) {
                sidebar.classList.add('collapsed');
                mainContent.classList.add('expanded');
            }

            function toggle() {
                collapsed = !collapsed;
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
                localStorage.setItem('sidebarCollapsed', collapsed);
                if (window.innerWidth <= 768) {
                    overlay.classList.remove('active');
                    sidebar.classList.remove('open');
                }
            }

            if (toggleBtn) toggleBtn.addEventListener('click', toggle);
            const mobileBtn = document.getElementById('member-mobile-menu-btn');
            if (mobileBtn) mobileBtn.addEventListener('click', function() {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            });
            if (overlay) overlay.addEventListener('click', function() {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });

            document.getElementById('member-logout')?.addEventListener('click', logout);
        },

        /**
         * Inisialisasi layout publik (navbar, mobile menu, auth links).
         */
        initPublicLayout() {
            updateAuthLinks();
            const menuBtn = document.getElementById('menu-btn');
            const mobileMenu = document.getElementById('mobile-menu');
            if (menuBtn && mobileMenu) {
                menuBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    mobileMenu.classList.toggle('hidden');
                    const icon = menuBtn.querySelector('i');
                    icon.classList.toggle('fa-bars');
                    icon.classList.toggle('fa-times');
                });
                document.addEventListener('click', function(e) {
                    if (!mobileMenu.classList.contains('hidden') && !mobileMenu.contains(e.target) && !menuBtn.contains(e.target)) {
                        mobileMenu.classList.add('hidden');
                        const icon = menuBtn.querySelector('i');
                        icon.classList.remove('fa-times');
                        icon.classList.add('fa-bars');
                    }
                });
            }
        }
    };

    // ============================================================
    //  AUTH LINKS UPDATE
    // ============================================================
    function updateAuthLinks() {
        const user = JSON.parse(localStorage.getItem('user'));
        const publicLinks = document.getElementById('public-auth-links');
        const publicLinksMobile = document.getElementById('public-auth-links-mobile');

        if (publicLinks) {
            if (user) {
                const role = user.role.charAt(0).toUpperCase() + user.role.slice(1);
                const dashUrl = user.role === 'admin' ? '/dashboard_admin' : '/dashboard_member';
                publicLinks.innerHTML = `<a href="${dashUrl}" class="btn-primary text-xs sm:text-sm px-3 py-1.5 flex items-center gap-1.5"><i class="fas fa-user-circle"></i>${role}</a>`;
                document.getElementById('navbar-logout')?.addEventListener('click', logout);
            } else {
                publicLinks.innerHTML = `<a href="/auth" class="btn-primary text-xs sm:text-sm px-3 py-1.5">Masuk</a>`;
            }
        }

        if (publicLinksMobile) {
            if (user) {
                const role = user.role.charAt(0).toUpperCase() + user.role.slice(1);
                const dashUrl = user.role === 'admin' ? '/dashboard_admin' : '/dashboard_member';
                publicLinksMobile.innerHTML = `<a href="${dashUrl}" class="block btn-primary text-sm text-center py-2">Dashboard (${role})</a>`;
            } else {
                publicLinksMobile.innerHTML = `<a href="/auth" class="block btn-primary text-sm text-center py-2">Masuk</a>`;
            }
        }
    }

    // ============================================================
    //  INITIALIZATION (HASH ROUTING + MODAL KONFIRMASI)
    // ============================================================
    document.addEventListener('DOMContentLoaded', function() {
        // Intercept klik pada link internal agar tidak reload halaman
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.href.startsWith(window.location.origin) && !link.target) {
                e.preventDefault();
                let url = link.getAttribute('href');
                if (url === '' || url === '#') return;
                if (url.endsWith('.html')) url = '/' + url.slice(0, -5);
                if (url === '') url = '/';
                router.load(url);
            }
        });

        // Tangani perubahan hash
        window.addEventListener('hashchange', (e) => {
            const url = window.location.hash.replace('#', '') || '/';
            router.load(url, false);
        });

        // Muat halaman awal
        const initialPath = window.location.hash.replace('#', '') || '/';
        router.load(initialPath, false);

        // Inisialisasi dark mode
        initDarkMode();

        // Dukungan query parameter `?tab=register` untuk halaman auth
        if (new URLSearchParams(window.location.search).get('tab') === 'register') {
            sessionStorage.setItem('authTab', 'register');
        }

        // Tambahkan modal konfirmasi ke DOM jika belum ada
        ensureConfirmModal();
    });

    /**
     * Tambahkan modal konfirmasi global ke DOM.
     */
    function ensureConfirmModal() {
        if (document.getElementById('confirm-modal')) return;
        const modalHTML = `
            <div id="confirm-modal" class="fixed inset-0 z-[9999] hidden items-center justify-center bg-black/50 backdrop-blur-sm">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
                    <p id="confirm-text" class="text-lg font-medium text-gray-800 dark:text-gray-200"></p>
                    <div class="flex justify-end gap-2 mt-4">
                        <button id="confirm-cancel" class="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200">Batal</button>
                        <button id="confirm-ok" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Ya, Lanjutkan</button>
                    </div>
                </div>
            </div>
        `;
        const div = document.createElement('div');
        div.innerHTML = modalHTML;
        document.body.appendChild(div.firstElementChild);
    }

    // ============================================================
    //  EXPOSE GLOBAL UTILITIES
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
    window.startLoading = startLoading;
    window.stopLoading = stopLoading;
    window.uploadFileToDrive = uploadFileToDrive;
    window.logActivity = logActivity;
    window.debounceEvent = debounceEvent;
    window.autoHideSkeleton = autoHideSkeleton;
    window.__intervals = window.__intervals || [];

})();