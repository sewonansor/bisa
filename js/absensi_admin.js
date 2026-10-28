/**
 * js/absensi_admin.js
 * Modul Admin Absensi — v14.0.0 FULL FIX
 * ============================================================
 * CHANGELOG v14.0.0:
 *   ✅ NEW: Edit absensi (modal, validasi nama & alamat)
 *   ✅ NEW: Export PDF (jsPDF + html2canvas multi-page)
 *   ✅ NEW: Export Image (PNG, html2canvas)
 *   ✅ NEW: Export dropdown (CSV / PDF / Gambar)
 *   ✅ FIX: Colspan tabel konsisten = 7 (checkbox + 6 kolom)
 *   ✅ FIX: Checkbox column pre-rendered di thead (defensive)
 *   ✅ FIX: Logo path auto-detect (hash route safe)
 *   ✅ FIX: QR download dengan logo + 3 fallback
 *   ✅ FIX: html2canvas scale adaptive (large dataset safe)
 *   ✅ FIX: Dropdown auto-close on outside click & ESC
 *   ✅ FIX: Edit modal idempotent (reuse if exists)
 *   ✅ FIX: Safe edit offline (queue via SyncManager)
 *   ✅ PRESERVED: Semua fitur v13.0.0 (offline-first, bulk delete,
 *      pagination, search, filter tanggal, TTD lightbox, dll)
 * ============================================================
 */

App.register('absensi_admin', function () {
    'use strict';

    // ================================================================
    // 1. AUTH CHECK
    // ================================================================
    const user = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!user || user.role !== 'admin') {
        if (typeof router !== 'undefined' && router.load) router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__absensiAdminLoaded) {
        console.log('[absensi_admin] Already initialized, skip.');
        return;
    }
    window.__absensiAdminLoaded = true;

    console.log('[absensi_admin] 🚀 Init v14.0.0 (Edit + PDF/Image Export)');

    // ================================================================
    // 3. HELPER: WAIT FOR DOM
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 30;
        interval = interval || 100;
        return new Promise(function (resolve) {
            var attempts = 0;
            var elements = {};
            function check() {
                attempts++;
                var allFound = true;
                ids.forEach(function (id) {
                    if (!elements[id]) {
                        var el = document.getElementById(id);
                        if (el) elements[id] = el;
                        else allFound = false;
                    }
                });
                if (allFound || attempts >= maxRetries) resolve(elements);
                else setTimeout(check, interval);
            }
            check();
        });
    }

    // ================================================================
    // 4. HELPERS
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatDate(d) {
        if (!d) return '-';
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function formatDateTime(d) {
        if (!d) return '-';
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        }) + ' · ' + date.toLocaleTimeString('id-ID', {
            hour: '2-digit', minute: '2-digit'
        });
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                document.body.removeChild(ta);
                reject(e);
            }
        });
    }

    function extractQrData(res) {
        if (!res || !res.success) return { status: 'inactive', token: '' };
        if (res.data) {
            return {
                status: res.data.status || 'inactive',
                token: res.data.token || ''
            };
        }
        return {
            status: res.status || 'inactive',
            token: res.token || ''
        };
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[absensi_admin:' + (type || 'info') + ']', msg);
        }
    }

    function isPendingSync(id) {
        try {
            if (!window.SyncManager || typeof window.SyncManager.getQueue !== 'function') return false;
            var queue = window.SyncManager.getQueue() || [];
            var idStr = String(id);
            return queue.some(function (item) {
                var d = item.data || {};
                return String(d.id) === idStr;
            });
        } catch (e) {
            return false;
        }
    }

    /**
     * ✅ Auto-detect base path (hash routing safe)
     */
    function getBasePath() {
        try {
            var path = window.location.pathname;
            if (!path.endsWith('/')) {
                var idx = path.lastIndexOf('/');
                path = idx >= 0 ? path.substring(0, idx + 1) : '/';
            }
            return path;
        } catch (e) {
            return '/';
        }
    }

    function getLogoUrl() {
        return getBasePath() + 'logo-ansor.webp';
    }

    /**
     * Debounce helper — fallback if app.js doesn't provide
     */
    var debounceTimers = {};
    function debounced(key, fn, delay) {
        delay = delay || 250;
        if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
        debounceTimers[key] = setTimeout(function () {
            delete debounceTimers[key];
            try { fn(); } catch (e) { console.error(e); }
        }, delay);
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'absensi-table-body',
            'qr-toggle-btn', 'qr-regenerate-btn',
            'qr-status-text-admin', 'qr-token-text-admin',
            'qr-code-display', 'download-qr-btn',
            'password-input-admin', 'save-password-btn',
            'password-msg', 'filter-date', 'refresh-btn',
            'export-btn', 'export-csv-btn', 'export-pdf-btn', 'export-img-btn',
            'export-dropdown', 'export-dropdown-wrap'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody         = els['absensi-table-body'];
        const qrToggleBtn       = els['qr-toggle-btn'];
        const qrRegenerateBtn   = els['qr-regenerate-btn'];
        const qrStatusText      = els['qr-status-text-admin'];
        const qrTokenText       = els['qr-token-text-admin'];
        const qrCodeDisplay     = els['qr-code-display'];
        const downloadQrBtn     = els['download-qr-btn'];
        const passwordInput     = els['password-input-admin'];
        const savePasswordBtn   = els['save-password-btn'];
        const passwordMsg       = els['password-msg'];
        const filterDate        = els['filter-date'];
        const refreshBtn        = els['refresh-btn'];
        const exportBtn         = els['export-btn'];
        const exportCsvBtn      = els['export-csv-btn'];
        const exportPdfBtn      = els['export-pdf-btn'];
        const exportImgBtn      = els['export-img-btn'];
        const exportDropdown    = els['export-dropdown'];
        const exportDropdownWp  = els['export-dropdown-wrap'];

        if (!tableBody || !qrToggleBtn || !qrRegenerateBtn || !savePasswordBtn || !qrCodeDisplay) {
            console.error('[absensi_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let currentQrStatus = 'inactive';
        let currentQrToken = '';
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = { search: '', dateFrom: '', dateTo: '' };
        let isSubmitting = false;
        let selectedIds = new Set();
        let visibleCount = 20;

        // ================================================================
        // 7. REFRESH TANPA RELOAD
        // ================================================================
        function refreshDataOnly() {
            console.log('[absensi_admin] 🔄 Refresh data without reload');

            try {
                if (typeof SafeSessionStorage !== 'undefined' && SafeSessionStorage.removeItem) {
                    var cKeyQr = 'cache_getQrConfig_' + user.id + '_' + JSON.stringify({});
                    var cKeyAbsensi = 'cache_getAbsensi_' + user.id + '_' + JSON.stringify({});
                    SafeSessionStorage.removeItem(cKeyQr);
                    SafeSessionStorage.removeItem(cKeyAbsensi);
                }
            } catch (e) { /* ignore */ }

            dataCache = [];
            selectedIds.clear();

            return Promise.allSettled([
                loadQrStatus(),
                loadAbsensi(true)
            ]).then(function () {
                console.log('[absensi_admin] ✅ Data refreshed');
            });
        }

        // ================================================================
        // 8. ENSURE EXTRA UI (stats, search, bulk bar, load more)
        // ================================================================
        function ensureExtraUI() {
            var mainContent = document.getElementById('main-content');
            if (!mainContent) return;

            var header = mainContent.querySelector('.flex.flex-wrap.justify-between.items-center')
                      || mainContent.querySelector('.flex.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('absensi-stats')) {
                var statsDiv = document.createElement('div');
                statsDiv.id = 'absensi-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML =
                    '<div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                        '<div class="flex items-center justify-between">' +
                            '<div>' +
                                '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Absensi</p>' +
                                '<p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-absensi">0</p>' +
                            '</div>' +
                            '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">' +
                                '<i class="fas fa-clipboard-check"></i>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                        '<div class="flex items-center justify-between">' +
                            '<div>' +
                                '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Hari Ini</p>' +
                                '<p class="text-2xl font-bold text-green-600 mt-1" id="stats-hari-ini">0</p>' +
                            '</div>' +
                            '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">' +
                                '<i class="fas fa-calendar-day"></i>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                        '<div class="flex items-center justify-between">' +
                            '<div>' +
                                '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>' +
                                '<p class="text-2xl font-bold text-purple-600 mt-1" id="stats-bulan-ini">0</p>' +
                            '</div>' +
                            '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">' +
                                '<i class="fas fa-calendar-alt"></i>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                        '<div class="flex items-center justify-between">' +
                            '<div>' +
                                '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">QR Status</p>' +
                                '<p class="text-lg font-bold mt-1" id="stats-qr-status">Nonaktif</p>' +
                            '</div>' +
                            '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white" id="stats-qr-icon">' +
                                '<i class="fas fa-qrcode"></i>' +
                            '</div>' +
                        '</div>' +
                    '</div>';

                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search + Filter Bar =====
            if (!document.getElementById('absensi-search-wrap')) {
                var wrapper = document.createElement('div');
                wrapper.id = 'absensi-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML =
                    '<div class="flex-1 min-w-[200px] relative">' +
                        '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>' +
                        '<input type="text" id="absensi-search" placeholder="Cari nama, alamat..." ' +
                            'class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">' +
                    '</div>' +
                    '<input type="date" id="absensi-date-from" ' +
                        'class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm" ' +
                        'title="Dari tanggal">' +
                    '<input type="date" id="absensi-date-to" ' +
                        'class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm" ' +
                        'title="Sampai tanggal">' +
                    '<button id="absensi-clear-filter" type="button" ' +
                        'class="btn-secondary px-3 py-2 rounded-lg text-sm" title="Reset filter">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>';

                var statsDiv = document.getElementById('absensi-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('absensi-bulk-bar')) {
                var bulkBar = document.createElement('div');
                bulkBar.id = 'absensi-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML =
                    '<span class="text-sm font-medium text-red-800 dark:text-red-200">' +
                        '<i class="fas fa-check-circle mr-1"></i>' +
                        '<span id="bulk-count-absensi">0</span> data dipilih' +
                    '</span>' +
                    '<div class="flex gap-2 ml-auto">' +
                        '<button id="bulk-delete-absensi-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">' +
                            '<i class="fas fa-trash mr-1"></i>Hapus Semua' +
                        '</button>' +
                        '<button id="bulk-cancel-absensi-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">' +
                            'Batal' +
                        '</button>' +
                    '</div>';

                var searchWrap = document.getElementById('absensi-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }

            // ===== Load More Button =====
            if (!document.getElementById('absensi-load-more-wrap')) {
                var loadMoreWrap = document.createElement('div');
                loadMoreWrap.id = 'absensi-load-more-wrap';
                loadMoreWrap.className = 'hidden text-center mt-4';
                loadMoreWrap.innerHTML =
                    '<button id="absensi-load-more-btn" class="btn-secondary px-6 py-2 rounded-lg text-sm">' +
                        '<i class="fas fa-plus-circle mr-1"></i>Muat Lebih Banyak' +
                    '</button>' +
                    '<p id="absensi-load-more-info" class="text-xs text-[var(--text-muted)] mt-2"></p>';

                var tableWrapper = tableBody.closest('.table-wrapper')
                                || tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]')
                                || tableBody.closest('table');
                if (tableWrapper && tableWrapper.parentNode) {
                    var realWrapper = tableWrapper.tagName === 'TABLE'
                        ? tableWrapper.parentNode
                        : tableWrapper;
                    if (realWrapper && realWrapper.parentNode) {
                        realWrapper.parentNode.insertBefore(loadMoreWrap, realWrapper.nextSibling);
                    }
                }

                var loadMoreBtn = document.getElementById('absensi-load-more-btn');
                if (loadMoreBtn) {
                    loadMoreBtn.addEventListener('click', function () {
                        visibleCount += 20;
                        renderTable(filteredCache);
                    });
                }
            }
        }

        // ================================================================
        // 9. FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            var searchInput = document.getElementById('absensi-search');
            var dateFrom = document.getElementById('absensi-date-from');
            var dateTo = document.getElementById('absensi-date-to');
            var clearBtn = document.getElementById('absensi-clear-filter');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input', function () {
                    debounced('absensi-search', function () {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        visibleCount = 20;
                        applyFilter();
                    }, 250);
                });
            }

            if (dateFrom && !dateFrom.dataset.attached) {
                dateFrom.dataset.attached = 'true';
                dateFrom.addEventListener('change', function () {
                    currentFilter.dateFrom = this.value;
                    visibleCount = 20;
                    applyFilter();
                });
            }

            if (dateTo && !dateTo.dataset.attached) {
                dateTo.dataset.attached = 'true';
                dateTo.addEventListener('change', function () {
                    currentFilter.dateTo = this.value;
                    visibleCount = 20;
                    applyFilter();
                });
            }

            if (clearBtn && !clearBtn.dataset.attached) {
                clearBtn.dataset.attached = 'true';
                clearBtn.addEventListener('click', function () {
                    currentFilter = { search: '', dateFrom: '', dateTo: '' };
                    if (searchInput) searchInput.value = '';
                    if (dateFrom) dateFrom.value = '';
                    if (dateTo) dateTo.value = '';
                    if (filterDate) filterDate.value = '';
                    visibleCount = 20;
                    applyFilter();
                    safeToast('Filter direset.', 'info', 2000);
                });
            }

            // Sync legacy filter-date (header)
            if (filterDate && !filterDate.dataset.attached) {
                filterDate.dataset.attached = 'true';
                filterDate.addEventListener('change', function () {
                    if (filterDate.value) {
                        if (dateFrom) dateFrom.value = filterDate.value;
                        if (dateTo) dateTo.value = filterDate.value;
                        currentFilter.dateFrom = filterDate.value;
                        currentFilter.dateTo = filterDate.value;
                    } else {
                        currentFilter.dateFrom = '';
                        currentFilter.dateTo = '';
                        if (dateFrom) dateFrom.value = '';
                        if (dateTo) dateTo.value = '';
                    }
                    visibleCount = 20;
                    applyFilter();
                });
            }
        }

        // ================================================================
        // 10. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(function (item) {
                if (currentFilter.dateFrom || currentFilter.dateTo) {
                    var d = new Date(item.created_at);
                    if (isNaN(d.getTime())) return false;
                    if (currentFilter.dateFrom) {
                        var from = new Date(currentFilter.dateFrom);
                        from.setHours(0, 0, 0, 0);
                        if (d < from) return false;
                    }
                    if (currentFilter.dateTo) {
                        var to = new Date(currentFilter.dateTo);
                        to.setHours(23, 59, 59, 999);
                        if (d > to) return false;
                    }
                }

                if (currentFilter.search) {
                    var q = currentFilter.search;
                    var haystack = [item.nama, item.alamat]
                        .map(function (v) { return String(v || '').toLowerCase(); }).join(' ');
                    if (haystack.indexOf(q) === -1) return false;
                }
                return true;
            });

            filteredCache.sort(function (a, b) {
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 11. UPDATE STATS
        // ================================================================
        function updateStats() {
            var total = dataCache.length;
            var now = new Date();
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            var hariIni = dataCache.filter(function (a) {
                var d = new Date(a.created_at);
                return !isNaN(d.getTime()) && d >= today;
            }).length;

            var bulanIni = dataCache.filter(function (a) {
                var d = new Date(a.created_at);
                return !isNaN(d.getTime()) &&
                    d.getMonth() === now.getMonth() &&
                    d.getFullYear() === now.getFullYear();
            }).length;

            var el1 = document.getElementById('stats-total-absensi');
            var el2 = document.getElementById('stats-hari-ini');
            var el3 = document.getElementById('stats-bulan-ini');
            var el4 = document.getElementById('stats-qr-status');
            var el5 = document.getElementById('stats-qr-icon');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = hariIni;
            if (el3) el3.textContent = bulanIni;

            if (el4) {
                el4.textContent = currentQrStatus === 'active' ? 'Aktif' : 'Nonaktif';
                el4.className = 'text-lg font-bold mt-1 ' +
                    (currentQrStatus === 'active'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400');
            }
            if (el5) {
                el5.className = 'w-10 h-10 rounded-full flex items-center justify-center text-white ' +
                    (currentQrStatus === 'active'
                        ? 'bg-gradient-to-br from-green-400 to-emerald-600'
                        : 'bg-gradient-to-br from-red-400 to-rose-600');
            }
        }

        // ================================================================
        // 12. LOAD QR STATUS
        // ================================================================
        async function loadQrStatus() {
            try {
                var res = await forceRefreshData('getQrConfig', {});
                var info = extractQrData(res);
                currentQrStatus = info.status;
                currentQrToken = info.token;
                updateQrUI(currentQrStatus, currentQrToken);
                updateStats();
            } catch (error) {
                console.error('[absensi_admin] Failed load QR status:', error);
                currentQrStatus = 'inactive';
                currentQrToken = '';
                updateQrUI('inactive', '');
            }
        }

        // ================================================================
        // 13. UPDATE UI QR
        // ================================================================
        function updateQrUI(status, token) {
            currentQrStatus = status;
            currentQrToken = token || '';

            if (qrStatusText) {
                qrStatusText.textContent = 'Status: ' + (status === 'active' ? 'Aktif' : 'Nonaktif');
                qrStatusText.className = 'text-sm ' +
                    (status === 'active'
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : 'text-red-600 dark:text-red-400 font-medium');
            }

            if (qrTokenText) {
                qrTokenText.textContent = token
                    ? 'Token: ' + token.slice(0, 16) + '...'
                    : 'Token: -';
                qrTokenText.title = token || '';
            }

            if (status === 'active') {
                if (qrToggleBtn) {
                    qrToggleBtn.textContent = 'Tutup QR';
                    qrToggleBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    qrToggleBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                }
                if (qrRegenerateBtn) {
                    qrRegenerateBtn.disabled = false;
                    qrRegenerateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                if (downloadQrBtn) downloadQrBtn.disabled = false;
                generateQrPreview();
            } else {
                if (qrToggleBtn) {
                    qrToggleBtn.textContent = 'Aktifkan QR';
                    qrToggleBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                    qrToggleBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                }
                if (qrRegenerateBtn) {
                    qrRegenerateBtn.disabled = true;
                    qrRegenerateBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }
                if (downloadQrBtn) downloadQrBtn.disabled = true;
                if (qrCodeDisplay) {
                    qrCodeDisplay.innerHTML =
                        '<i class="fas fa-lock text-2xl text-gray-400"></i>' +
                        '<p class="text-xs text-[var(--text-muted)] mt-2">QR Nonaktif</p>';
                }
            }
        }

        // ================================================================
        // 14. GENERATE QR PREVIEW
        // ================================================================
        function generateQrPreview() {
            if (!qrCodeDisplay) return;
            qrCodeDisplay.innerHTML = '';

            if (typeof QRCode === 'undefined') {
                qrCodeDisplay.innerHTML =
                    '<p class="text-red-500 text-xs text-center">QR library tidak tersedia</p>' +
                    '<p class="text-xs mt-2 break-all text-center">Token: ' + escapeHtml(currentQrToken) + '</p>';
                return;
            }

            if (!currentQrToken) {
                qrCodeDisplay.innerHTML =
                    '<p class="text-yellow-600 text-xs">Token belum tersedia</p>';
                return;
            }

            // Build URL
            var qrUrl = window.location.origin + getBasePath() +
                '#/absensi?token=' + encodeURIComponent(currentQrToken);

            var qrDiv = document.createElement('div');
            qrDiv.style.cssText = 'width:180px;height:180px;';
            qrCodeDisplay.appendChild(qrDiv);

            try {
                new QRCode(qrDiv, {
                    text: qrUrl,
                    width: 180,
                    height: 180,
                    colorDark: '#0f2922',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (error) {
                console.error('[absensi_admin] QR generate error:', error);
                qrCodeDisplay.innerHTML =
                    '<p class="text-red-500 text-xs text-center">Error generate QR</p>' +
                    '<p class="text-xs mt-2 break-all text-center">Token: ' + escapeHtml(currentQrToken) + '</p>';
            }
        }

        // ================================================================
        // 15. DOWNLOAD QR (dengan logo)
        // ================================================================
        function downloadQR() {
            var canvas = qrCodeDisplay ? qrCodeDisplay.querySelector('canvas') : null;
            if (!canvas) {
                safeToast('QR belum tersedia', 'warning');
                return;
            }

            try {
                var size = canvas.width;
                var padding = 40;
                var finalSize = size + padding * 2;

                var finalCanvas = document.createElement('canvas');
                finalCanvas.width = finalSize;
                finalCanvas.height = finalSize;
                var ctx = finalCanvas.getContext('2d');

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalSize, finalSize);
                ctx.drawImage(canvas, padding, padding);

                var triggerDownload = function () {
                    try {
                        var link = document.createElement('a');
                        link.download = 'QR_Absensi_Ansor.png';
                        link.href = finalCanvas.toDataURL('image/png');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        safeToast('✅ QR berhasil diunduh!', 'success');
                    } catch (e) {
                        safeToast('Gagal download: ' + e.message, 'error');
                    }
                };

                var logo = new Image();
                logo.onload = function () {
                    try {
                        var logoSize = Math.round(size * 0.22);
                        var logoX = (finalSize - logoSize) / 2;
                        var logoY = (finalSize - logoSize) / 2;

                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(finalSize / 2, finalSize / 2, logoSize / 2 + 4, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
                        triggerDownload();
                    } catch (e) {
                        triggerDownload();
                    }
                };
                logo.onerror = function () {
                    triggerDownload();
                };
                logo.src = getLogoUrl();

                // Timeout fallback (logo stuck)
                setTimeout(function () {
                    if (!logo.complete) {
                        try { triggerDownload(); } catch (e) {}
                    }
                }, 3000);
            } catch (e) {
                console.error('[absensi_admin] Download QR error:', e);
                safeToast('Gagal download QR: ' + e.message, 'error');
            }
        }

        // ================================================================
        // 16. LOAD ABSENSI DATA
        // ================================================================
        async function loadAbsensi(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchAbsensiBackground();
                return;
            }

            tableBody.innerHTML =
                '<tr><td colspan="7" class="text-center py-8">' +
                    '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-main)]"></i>' +
                    '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data absensi...</p>' +
                '</td></tr>';

            try {
                var res = await forceRefreshData('getAbsensi', {});

                if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                    dataCache = res.data;
                    applyFilter();
                } else if (res && res.success) {
                    dataCache = [];
                    filteredCache = [];
                    renderTable([]);
                    updateStats();
                } else {
                    tableBody.innerHTML =
                        '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                            '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                            '<p>' + escapeHtml((res && res.message) || 'Gagal memuat data') + '</p>' +
                        '</td></tr>';
                }
            } catch (error) {
                console.error('[absensi_admin] Load error:', error);
                tableBody.innerHTML =
                    '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        'Error: ' + escapeHtml(error.message) +
                    '</td></tr>';
            }
        }

        async function fetchAbsensiBackground() {
            try {
                var res = await forceRefreshData('getAbsensi', {});
                if (res && res.success && Array.isArray(res.data)) {
                    dataCache = res.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[absensi_admin] BG refresh failed:', e);
            }
        }

        // ================================================================
        // 17. ENSURE BULK SELECT-ALL (defensive idempotent)
        // ================================================================
        function ensureBulkSelectAll() {
            var thead = tableBody.closest('table');
            if (!thead) return;
            thead = thead.querySelector('thead tr');
            if (!thead) return;

            var selectAll = thead.querySelector('.bulk-select-all-absensi');

            // Insert if missing (backward compat with old HTML)
            if (!selectAll) {
                var cbTh = document.createElement('th');
                cbTh.className = 'px-3 py-4 text-center w-12';
                cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-absensi w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer" aria-label="Pilih semua">';
                thead.insertBefore(cbTh, thead.firstElementChild);
                selectAll = thead.querySelector('.bulk-select-all-absensi');
            }

            if (selectAll && !selectAll.dataset.attached) {
                selectAll.dataset.attached = 'true';
                selectAll.addEventListener('change', function () {
                    var checked = this.checked;
                    document.querySelectorAll('.absensi-checkbox').forEach(function (cb) {
                        cb.checked = checked;
                        if (checked) selectedIds.add(cb.dataset.id);
                        else selectedIds.delete(cb.dataset.id);
                        var row = cb.closest('tr');
                        if (row) {
                            row.classList.toggle('bg-red-50', checked);
                            row.classList.toggle('dark:bg-red-900/10', checked);
                        }
                    });
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 18. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            ensureBulkSelectAll();

            if (!data || data.length === 0) {
                var isFiltered = currentFilter.search ||
                                 currentFilter.dateFrom ||
                                 currentFilter.dateTo;
                tableBody.innerHTML =
                    '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                        (isFiltered
                            ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                            : '<i class="fas fa-clipboard-check text-3xl mb-2 opacity-40"></i><p>Belum ada data absensi</p>') +
                    '</td></tr>';
                var lmw = document.getElementById('absensi-load-more-wrap');
                if (lmw) lmw.classList.add('hidden');
                return;
            }

            var toShow = data.slice(0, visibleCount);
            var hasMore = data.length > visibleCount;

            var html = '';
            toShow.forEach(function (item, idx) {
                var dateStr = formatDateTime(item.created_at);
                var isSelected = selectedIds.has(item.id);
                var pending = isPendingSync(item.id);

                var ttdHtml = item.ttd
                    ? '<img src="' + escapeAttr(item.ttd) + '" alt="TTD" ' +
                        'class="ttd-img" ' +
                        'onclick="previewTtd(\'' + escapeAttr(item.id) + '\')" ' +
                        'loading="lazy" ' +
                        'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\';" />' +
                      '<span style="display:none" class="text-xs text-[var(--text-muted)]">No image</span>'
                    : '<span class="text-xs text-[var(--text-muted)]">-</span>';

                var pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳ SYNC</span>'
                    : '';

                html +=
                    '<tr class="hover:bg-[var(--bg-stats)] transition-colors' +
                        (isSelected ? ' bg-red-50 dark:bg-red-900/10' : '') +
                        (pending ? ' border-l-2 border-amber-500' : '') + '">' +
                        '<td class="px-3 py-3 text-center">' +
                            '<input type="checkbox" class="absensi-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer" ' +
                                'data-id="' + escapeAttr(item.id) + '" ' +
                                (isSelected ? 'checked' : '') + '>' +
                        '</td>' +
                        '<td class="px-3 py-3 text-sm text-[var(--text-muted)]">' + (idx + 1) + pendingBadge + '</td>' +
                        '<td class="px-3 py-3 text-sm font-medium text-[var(--text-main)]">' +
                            '<button onclick="copyAbsensiDetail(\'' + escapeAttr(item.id) + '\')" ' +
                                'class="hover:text-blue-600 dark:hover:text-blue-400 text-left" ' +
                                'title="Klik untuk copy detail">' +
                                escapeHtml(item.nama || '-') +
                            '</button>' +
                        '</td>' +
                        '<td class="px-3 py-3 text-sm text-[var(--text-muted)]">' + escapeHtml(item.alamat || '-') + '</td>' +
                        '<td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">' + escapeHtml(dateStr) + '</td>' +
                        '<td class="px-3 py-3 text-sm">' + ttdHtml + '</td>' +
                        '<td class="px-3 py-3 text-sm whitespace-nowrap">' +
                            '<button onclick="editAbsensi(\'' + escapeAttr(item.id) + '\')" ' +
                                'class="text-amber-600 hover:text-amber-800 dark:text-amber-400 mr-2" ' +
                                'title="Edit nama & alamat">' +
                                '<i class="fas fa-edit"></i>' +
                            '</button>' +
                            '<button onclick="copyAbsensiDetail(\'' + escapeAttr(item.id) + '\')" ' +
                                'class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2" ' +
                                'title="Copy detail">' +
                                '<i class="fas fa-copy"></i>' +
                            '</button>' +
                            '<button onclick="deleteAbsensi(\'' + escapeAttr(item.id) + '\')" ' +
                                'class="text-red-600 hover:text-red-800 dark:text-red-400" ' +
                                'title="Hapus">' +
                                '<i class="fas fa-trash"></i>' +
                            '</button>' +
                        '</td>' +
                    '</tr>';
            });
            tableBody.innerHTML = html;

            attachCheckboxListeners();
            updateBulkBar();

            var loadMoreWrap = document.getElementById('absensi-load-more-wrap');
            var loadMoreInfo = document.getElementById('absensi-load-more-info');
            if (loadMoreWrap) {
                if (hasMore) {
                    loadMoreWrap.classList.remove('hidden');
                    if (loadMoreInfo) {
                        loadMoreInfo.textContent = 'Menampilkan ' + toShow.length + ' dari ' + data.length + ' data';
                    }
                } else {
                    loadMoreWrap.classList.add('hidden');
                }
            }
        }

        function attachCheckboxListeners() {
            document.querySelectorAll('.absensi-checkbox').forEach(function (cb) {
                if (cb.dataset.attached) return;
                cb.dataset.attached = 'true';
                cb.addEventListener('change', function () {
                    if (this.checked) selectedIds.add(this.dataset.id);
                    else selectedIds.delete(this.dataset.id);

                    var row = this.closest('tr');
                    if (row) {
                        row.classList.toggle('bg-red-50', this.checked);
                        row.classList.toggle('dark:bg-red-900/10', this.checked);
                    }
                    updateBulkBar();
                });
            });
        }

        function updateBulkBar() {
            var bulkBar = document.getElementById('absensi-bulk-bar');
            var bulkCount = document.getElementById('bulk-count-absensi');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 19. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            var delBtn = document.getElementById('bulk-delete-absensi-btn');
            var cancelBtn = document.getElementById('bulk-cancel-absensi-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', function () {
                    var ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm('Hapus ' + ids.length + ' data absensi? Tindakan ini tidak bisa dibatalkan.', async function () {
                        var ok = 0, fail = 0, offline = 0;
                        for (var i = 0; i < ids.length; i++) {
                            var id = ids[i];
                            try {
                                var r = await apiCall('deleteAbsensi', 'POST', { id: id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(function (a) {
                                        return String(a.id) !== String(id);
                                    });
                                } else {
                                    fail++;
                                }
                            } catch (e) {
                                fail++;
                            }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.absensi-checkbox').forEach(function (cb) { cb.checked = false; });
                        var selAll = document.querySelector('.bulk-select-all-absensi');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast('✅ ' + ok + ' data berhasil dihapus!' +
                                (offline > 0 ? ' (' + offline + ' pending sync)' : ''),
                                'success');
                        } else {
                            safeToast(ok + ' berhasil, ' + fail + ' gagal.', 'warning');
                        }
                    });
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', function () {
                    selectedIds.clear();
                    document.querySelectorAll('.absensi-checkbox').forEach(function (cb) { cb.checked = false; });
                    document.querySelectorAll('.bg-red-50').forEach(function (el) {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    var selAll = document.querySelector('.bulk-select-all-absensi');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 20. COPY DETAIL ABSENSI (global)
        // ================================================================
        window.copyAbsensiDetail = function (id) {
            var item = dataCache.find(function (a) { return String(a.id) === String(id); });
            if (!item) return;

            var text = 'NAMA: ' + (item.nama || '-') + '\n' +
                       'ALAMAT: ' + (item.alamat || '-') + '\n' +
                       'WAKTU: ' + formatDateTime(item.created_at);

            copyToClipboard(text)
                .then(function () { safeToast('✅ Detail absensi dicopy!', 'success', 2500); })
                .catch(function () { safeToast('Gagal copy detail', 'error'); });
        };

        // ================================================================
        // 21. PREVIEW TTD (LIGHTBOX, global)
        // ================================================================
        window.previewTtd = function (id) {
            var item = dataCache.find(function (a) { return String(a.id) === String(id); });
            if (!item || !item.ttd) {
                safeToast('Tanda tangan tidak tersedia.', 'warning');
                return;
            }

            var lightbox = document.getElementById('ttd-lightbox');
            if (!lightbox) {
                lightbox = document.createElement('div');
                lightbox.id = 'ttd-lightbox';
                lightbox.className = 'fixed inset-0 bg-black/90 hidden items-center justify-center z-[10000] p-4';
                lightbox.innerHTML =
                    '<button id="ttd-lightbox-close" ' +
                        'class="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl transition" ' +
                        'aria-label="Tutup">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>' +
                    '<div class="bg-white rounded-lg p-6 max-w-2xl w-full">' +
                        '<h3 class="text-lg font-bold mb-4 text-gray-800" id="ttd-lightbox-title">Tanda Tangan</h3>' +
                        '<img id="ttd-lightbox-img" src="" alt="TTD" class="w-full h-auto max-h-[60vh] object-contain rounded-lg border border-gray-200">' +
                        '<p class="text-sm text-gray-600 mt-3" id="ttd-lightbox-info"></p>' +
                    '</div>';
                document.body.appendChild(lightbox);

                var closeFn = function () {
                    lightbox.classList.add('hidden');
                    lightbox.classList.remove('flex');
                    document.body.style.overflow = '';
                };

                lightbox.querySelector('#ttd-lightbox-close').addEventListener('click', closeFn);
                lightbox.addEventListener('click', function (e) {
                    if (e.target === lightbox) closeFn();
                });
            }

            var img = lightbox.querySelector('#ttd-lightbox-img');
            var title = lightbox.querySelector('#ttd-lightbox-title');
            var info = lightbox.querySelector('#ttd-lightbox-info');

            img.src = item.ttd;
            title.textContent = 'TTD: ' + (item.nama || '-');
            info.innerHTML =
                '<i class="fas fa-map-marker-alt mr-1"></i>' + escapeHtml(item.alamat || '-') +
                ' · <i class="far fa-clock ml-2 mr-1"></i>' + escapeHtml(formatDateTime(item.created_at));

            lightbox.classList.remove('hidden');
            lightbox.classList.add('flex');
            document.body.style.overflow = 'hidden';
        };

        // ================================================================
        // 22. EDIT ABSENSI (MODAL, global)
        // ================================================================
        window.editAbsensi = function (id) {
            var item = dataCache.find(function (a) { return String(a.id) === String(id); });
            if (!item) {
                safeToast('Data tidak ditemukan.', 'warning');
                return;
            }

            var modal = document.getElementById('edit-absensi-modal');
            if (!modal) modal = createEditModal();

            var nameInput = modal.querySelector('#edit-absensi-nama');
            var alamatInput = modal.querySelector('#edit-absensi-alamat');
            var ttdPreview = modal.querySelector('#edit-absensi-ttd');
            var msgEl = modal.querySelector('#edit-absensi-msg');

            nameInput.value = item.nama || '';
            alamatInput.value = item.alamat || '';
            msgEl.textContent = '';
            msgEl.className = 'text-sm text-[var(--text-muted)] mt-3';

            if (item.ttd) {
                ttdPreview.innerHTML =
                    '<img src="' + escapeAttr(item.ttd) + '" alt="TTD" ' +
                    'class="max-h-24 object-contain mx-auto rounded border border-[var(--card-border)] bg-white p-1">';
            } else {
                ttdPreview.innerHTML =
                    '<p class="text-xs text-[var(--text-muted)]">Tanda tangan tidak tersedia</p>';
            }

            modal.dataset.editId = String(id);
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.style.overflow = 'hidden';

            setTimeout(function () {
                nameInput.focus();
                nameInput.select();
            }, 80);
        };

        function createEditModal() {
            var modal = document.createElement('div');
            modal.id = 'edit-absensi-modal';
            modal.className = 'fixed inset-0 bg-black/70 hidden items-center justify-center z-[9999] p-4';
            modal.innerHTML =
                '<div class="bg-[var(--card-bg)] rounded-2xl shadow-2xl w-full max-w-lg p-6 relative">' +
                    '<button type="button" id="edit-absensi-close" ' +
                        'class="absolute top-4 right-4 w-9 h-9 rounded-full bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] flex items-center justify-center transition" ' +
                        'aria-label="Tutup">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>' +
                    '<h3 class="text-lg font-bold text-[var(--text-main)] mb-1">' +
                        '<i class="fas fa-edit mr-2 text-amber-600"></i>Edit Absensi' +
                    '</h3>' +
                    '<p class="text-xs text-[var(--text-muted)] mb-4">' +
                        'Ubah nama dan alamat. Tanda tangan tidak dapat diubah.' +
                    '</p>' +
                    '<div class="mb-3">' +
                        '<label class="block text-sm font-medium text-[var(--text-main)] mb-1">' +
                            'Nama <span class="text-red-500">*</span>' +
                        '</label>' +
                        '<input type="text" id="edit-absensi-nama" maxlength="100" ' +
                            'class="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">' +
                    '</div>' +
                    '<div class="mb-3">' +
                        '<label class="block text-sm font-medium text-[var(--text-main)] mb-1">' +
                            'Alamat <span class="text-red-500">*</span>' +
                        '</label>' +
                        '<textarea id="edit-absensi-alamat" rows="2" maxlength="300" ' +
                            'class="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] resize-none"></textarea>' +
                    '</div>' +
                    '<div class="mb-4">' +
                        '<label class="block text-sm font-medium text-[var(--text-main)] mb-1">Tanda Tangan</label>' +
                        '<div id="edit-absensi-ttd" ' +
                            'class="w-full min-h-[96px] flex items-center justify-center bg-[var(--bg-stats)] rounded-lg p-2"></div>' +
                    '</div>' +
                    '<div class="flex gap-2 justify-end">' +
                        '<button type="button" id="edit-absensi-cancel" ' +
                            'class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-[var(--text-main)] text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600">' +
                            'Batal' +
                        '</button>' +
                        '<button type="button" id="edit-absensi-save" ' +
                            'class="btn-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">' +
                            '<i class="fas fa-save"></i><span>Simpan</span>' +
                        '</button>' +
                    '</div>' +
                    '<p id="edit-absensi-msg" class="text-sm text-[var(--text-muted)] mt-3"></p>' +
                '</div>';

            document.body.appendChild(modal);

            var closeFn = function () {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                modal.dataset.editId = '';
                document.body.style.overflow = '';
            };

            modal.querySelector('#edit-absensi-close').addEventListener('click', closeFn);
            modal.querySelector('#edit-absensi-cancel').addEventListener('click', closeFn);
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeFn();
            });
            modal.querySelector('#edit-absensi-save').addEventListener('click', function () {
                saveEditAbsensi(modal, closeFn);
            });
            modal.querySelector('#edit-absensi-nama').addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEditAbsensi(modal, closeFn);
                }
            });

            return modal;
        }

        async function saveEditAbsensi(modal, closeFn) {
            var id = modal.dataset.editId;
            if (!id) return;

            var nameInput = modal.querySelector('#edit-absensi-nama');
            var alamatInput = modal.querySelector('#edit-absensi-alamat');
            var msgEl = modal.querySelector('#edit-absensi-msg');
            var saveBtn = modal.querySelector('#edit-absensi-save');

            var nama = (nameInput.value || '').trim();
            var alamat = (alamatInput.value || '').trim();

            if (nama.length < 3) {
                msgEl.textContent = 'Nama minimal 3 karakter.';
                msgEl.className = 'text-sm text-red-500 mt-3';
                nameInput.focus();
                return;
            }
            if (!alamat) {
                msgEl.textContent = 'Alamat wajib diisi.';
                msgEl.className = 'text-sm text-red-500 mt-3';
                alamatInput.focus();
                return;
            }

            saveBtn.disabled = true;
            var original = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Menyimpan...</span>';
            msgEl.textContent = '';
            msgEl.className = 'text-sm text-[var(--text-muted)] mt-3';

            try {
                var res = await apiCall('updateAbsensi', 'POST', {
                    id: id, nama: nama, alamat: alamat
                });

                if (res && res.success) {
                    var idx = dataCache.findIndex(function (a) { return String(a.id) === String(id); });
                    if (idx !== -1) {
                        dataCache[idx].nama = nama;
                        dataCache[idx].alamat = alamat;
                    }
                    applyFilter();

                    try {
                        if (typeof logActivity === 'function') {
                            await logActivity('UPDATE', 'absensi', id, 'Edit: ' + nama);
                        }
                    } catch (e) { /* silent */ }

                    closeFn();

                    if (res._offline) {
                        safeToast('📴 Perubahan disimpan lokal, akan disinkronkan saat online', 'warning', 4000);
                    } else {
                        safeToast('✅ Data absensi diperbarui!', 'success');
                    }
                } else {
                    msgEl.textContent = (res && res.message) || 'Gagal menyimpan.';
                    msgEl.className = 'text-sm text-red-500 mt-3';
                }
            } catch (e) {
                console.error('[absensi_admin] saveEditAbsensi error:', e);
                msgEl.textContent = 'Error: ' + e.message;
                msgEl.className = 'text-sm text-red-500 mt-3';
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = original;
            }
        }

        // ================================================================
        // 23. DELETE ABSENSI (SINGLE, global)
        // ================================================================
        window.deleteAbsensi = function (id) {
            var item = dataCache.find(function (a) { return String(a.id) === String(id); });
            var nama = item ? (item.nama || 'data ini') : 'data ini';

            showConfirm('Hapus data absensi "' + nama + '"?', async function () {
                try {
                    var res = await apiCall('deleteAbsensi', 'POST', { id: id });
                    if (res && res.success) {
                        dataCache = dataCache.filter(function (a) {
                            return String(a.id) !== String(id);
                        });
                        selectedIds.delete(String(id));
                        applyFilter();

                        try {
                            if (typeof logActivity === 'function') {
                                await logActivity('DELETE', 'absensi', id, 'Hapus: ' + nama);
                            }
                        } catch (e) { /* silent */ }

                        if (res._offline) {
                            safeToast('📴 Data dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Data absensi dihapus!', 'success');
                        }
                    } else {
                        safeToast((res && res.message) || 'Gagal menghapus.', 'error');
                    }
                } catch (e) {
                    console.error('[absensi_admin] deleteAbsensi error:', e);
                    safeToast('Error: ' + e.message, 'error');
                }
            });
        };

        // ================================================================
        // 24. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            var headers = ['No', 'Nama', 'Alamat', 'Waktu', 'TTD'];
            var rows = filteredCache.map(function (item, idx) {
                return [
                    idx + 1,
                    item.nama || '',
                    item.alamat || '',
                    formatDateTime(item.created_at),
                    item.ttd ? 'Ada' : '-'
                ];
            });

            var csvContent = [headers].concat(rows)
                .map(function (row) {
                    return row.map(function (cell) {
                        return '"' + String(cell || '').replace(/"/g, '""') + '"';
                    }).join(',');
                })
                .join('\n');

            var blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'absensi_' + todayISO() + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 25. EXPORT PDF
        // ================================================================
        function exportPDF() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }
            if (typeof html2canvas === 'undefined') {
                safeToast('Library html2canvas tidak tersedia.', 'error');
                return;
            }
            if (!window.jspdf || !window.jspdf.jsPDF) {
                safeToast('Library PDF (jsPDF) tidak tersedia.', 'error');
                return;
            }

            safeToast('⏳ Menyiapkan PDF...', 'info', 2000);

            buildExportCanvas()
                .then(function (canvas) {
                    try {
                        var jsPDF = window.jspdf.jsPDF;
                        var imgData = canvas.toDataURL('image/jpeg', 0.92);

                        var pdf = new jsPDF('p', 'mm', 'a4');
                        var pdfW = pdf.internal.pageSize.getWidth();
                        var pdfH = pdf.internal.pageSize.getHeight();
                        var margin = 8;
                        var usableW = pdfW - margin * 2;
                        var imgH = (canvas.height * usableW) / canvas.width;

                        var pageInnerH = pdfH - margin * 2;
                        var heightLeft = imgH;
                        var position = margin;

                        pdf.addImage(imgData, 'JPEG', margin, position, usableW, imgH, undefined, 'FAST');
                        heightLeft -= pageInnerH;

                        while (heightLeft > 0) {
                            position -= pageInnerH;
                            pdf.addPage();
                            pdf.addImage(imgData, 'JPEG', margin, position, usableW, imgH, undefined, 'FAST');
                            heightLeft -= pageInnerH;
                        }

                        pdf.save('absensi_' + todayISO() + '.pdf');
                        safeToast('✅ PDF berhasil diunduh!', 'success');
                    } catch (e) {
                        safeToast('Gagal unduh PDF: ' + e.message, 'error');
                    }
                })
                .catch(function (err) {
                    console.error('[absensi_admin] exportPDF error:', err);
                    safeToast('Gagal export PDF: ' + err.message, 'error');
                });
        }

        // ================================================================
        // 26. EXPORT IMAGE (PNG)
        // ================================================================
        function exportImage() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }
            if (typeof html2canvas === 'undefined') {
                safeToast('Library html2canvas tidak tersedia.', 'error');
                return;
            }

            safeToast('⏳ Menyiapkan gambar...', 'info', 2000);

            buildExportCanvas()
                .then(function (canvas) {
                    try {
                        var link = document.createElement('a');
                        link.download = 'absensi_' + todayISO() + '.png';
                        link.href = canvas.toDataURL('image/png');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        safeToast('✅ Gambar berhasil diunduh!', 'success');
                    } catch (e) {
                        safeToast('Gagal unduh gambar: ' + e.message, 'error');
                    }
                })
                .catch(function (err) {
                    console.error('[absensi_admin] exportImage error:', err);
                    safeToast('Gagal export gambar: ' + err.message, 'error');
                });
        }

        // ================================================================
        // 27. BUILD EXPORT CANVAS (shared)
        // ================================================================
        function buildExportCanvas() {
            return new Promise(function (resolve, reject) {
                var wrap = document.createElement('div');
                wrap.style.cssText =
                    'position:fixed;left:-99999px;top:0;padding:28px;' +
                    'background:#ffffff;width:1000px;' +
                    "font-family:'Inter',system-ui,sans-serif;color:#0f2922;";

                var total = filteredCache.length;

                if (total > 500) {
                    safeToast('Data besar (' + total + ' baris), proses mungkin lambat...', 'info', 3000);
                }

                var filterDesc = [];
                if (currentFilter.search) filterDesc.push('Kata kunci: "' + currentFilter.search + '"');
                if (currentFilter.dateFrom) filterDesc.push('Dari: ' + formatDate(currentFilter.dateFrom));
                if (currentFilter.dateTo) filterDesc.push('Sampai: ' + formatDate(currentFilter.dateTo));

                var html = '';
                html += '<div style="text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #0f2922;">';
                html += '<h2 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#0f2922;">Laporan Absensi</h2>';
                html += '<p style="margin:0;font-size:12px;color:#475569;font-weight:600;">PAC GP Ansor Kapanewon Sewon</p>';
                html += '<p style="margin:6px 0 0;font-size:10px;color:#64748b;">Diekspor: ' +
                        escapeHtml(formatDateTime(new Date())) + '</p>';
                if (filterDesc.length > 0) {
                    html += '<p style="margin:4px 0 0;font-size:10px;color:#64748b;font-style:italic;">Filter: ' +
                            escapeHtml(filterDesc.join(' · ')) + '</p>';
                }
                html += '</div>';

                html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
                html += '<thead><tr style="background:#0f2922;color:#ffffff;">';
                html += '<th style="padding:8px 6px;border:1px solid #1e4038;text-align:center;width:32px;">No</th>';
                html += '<th style="padding:8px 8px;border:1px solid #1e4038;text-align:left;">Nama</th>';
                html += '<th style="padding:8px 8px;border:1px solid #1e4038;text-align:left;">Alamat</th>';
                html += '<th style="padding:8px 8px;border:1px solid #1e4038;text-align:left;width:130px;">Waktu</th>';
                html += '<th style="padding:8px 6px;border:1px solid #1e4038;text-align:center;width:90px;">TTD</th>';
                html += '</tr></thead><tbody>';

                filteredCache.forEach(function (item, idx) {
                    var bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                    var ttdCell = item.ttd
                        ? '<img src="' + escapeAttr(item.ttd) + '" ' +
                            'style="width:80px;height:36px;object-fit:contain;display:block;margin:0 auto;" ' +
                            'crossorigin="anonymous" ' +
                            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';" />' +
                          '<span style="display:none;color:#94a3b8;">(gagal)</span>'
                        : '<span style="color:#94a3b8;">-</span>';

                    html += '<tr style="background:' + bg + ';">';
                    html += '<td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">' + (idx + 1) + '</td>';
                    html += '<td style="padding:6px 8px;border:1px solid #cbd5e1;">' + escapeHtml(item.nama || '-') + '</td>';
                    html += '<td style="padding:6px 8px;border:1px solid #cbd5e1;">' + escapeHtml(item.alamat || '-') + '</td>';
                    html += '<td style="padding:6px 8px;border:1px solid #cbd5e1;white-space:nowrap;">' +
                            escapeHtml(formatDateTime(item.created_at)) + '</td>';
                    html += '<td style="padding:4px;border:1px solid #cbd5e1;text-align:center;">' + ttdCell + '</td>';
                    html += '</tr>';
                });

                html += '</tbody></table>';
                html += '<p style="text-align:center;font-size:10px;color:#94a3b8;margin-top:16px;padding-top:10px;' +
                        'border-top:1px solid #e2e8f0;">' +
                        'Total: <strong>' + total + '</strong> data · Dicetak dari Sistem Absensi Digital</p>';

                wrap.innerHTML = html;
                document.body.appendChild(wrap);

                // Wait for images (TTD)
                var imgs = Array.prototype.slice.call(wrap.querySelectorAll('img'));
                var waits = imgs.map(function (img) {
                    return new Promise(function (res) {
                        if (img.complete) return res();
                        img.onload = res;
                        img.onerror = res;
                        setTimeout(res, 2500);
                    });
                });

                Promise.all(waits).then(function () {
                    setTimeout(function () {
                        // Adaptive scale (memory safe)
                        var scale = 2;
                        var estPixels = wrap.offsetWidth * wrap.offsetHeight * scale * scale;
                        if (estPixels > 25000000) scale = 1;
                        else if (estPixels > 16000000) scale = 1.5;

                        html2canvas(wrap, {
                            backgroundColor: '#ffffff',
                            scale: scale,
                            useCORS: true,
                            allowTaint: false,
                            logging: false,
                            imageTimeout: 8000
                        }).then(function (canvas) {
                            try { document.body.removeChild(wrap); } catch (e) {}
                            resolve(canvas);
                        }).catch(function (err) {
                            try { document.body.removeChild(wrap); } catch (e) {}
                            reject(err);
                        });
                    }, 120);
                });
            });
        }

        // ================================================================
        // 28. QR TOGGLE
        // ================================================================
        if (qrToggleBtn) {
            var freshToggle = qrToggleBtn.cloneNode(true);
            qrToggleBtn.parentNode.replaceChild(freshToggle, qrToggleBtn);

            freshToggle.addEventListener('click', function () {
                if (!navigator.onLine) {
                    safeToast('📴 Toggle QR memerlukan koneksi internet (server-side token).', 'warning', 4000);
                    return;
                }

                var newStatus = currentQrStatus === 'active' ? 'inactive' : 'active';
                var confirmMsg = newStatus === 'active'
                    ? 'Aktifkan QR absensi? Token baru akan dibuat dan QR lama otomatis tidak berlaku.'
                    : 'Tutup QR absensi? User tidak bisa scan QR sampai diaktifkan kembali.';

                showConfirm(confirmMsg, async function () {
                    if (isSubmitting) return;
                    isSubmitting = true;

                    freshToggle.disabled = true;
                    freshToggle.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses...';

                    try {
                        var res = await forceRefreshData('updateQrStatus', { status: newStatus });
                        var info = extractQrData(res);
                        currentQrStatus = info.status;
                        currentQrToken = info.token;
                        updateQrUI(currentQrStatus, currentQrToken);
                        updateStats();

                        try {
                            if (typeof logActivity === 'function') {
                                await logActivity('UPDATE', 'settings', 'qr_absensi', 'QR ' + info.status);
                            }
                        } catch (e) { /* silent */ }

                        safeToast('Status QR: ' + (info.status === 'active' ? 'Aktif' : 'Nonaktif'), 'success');
                    } catch (error) {
                        safeToast('Error: ' + error.message, 'error');
                    } finally {
                        freshToggle.disabled = false;
                        // Restore label via updateQrUI (which sets textContent)
                        updateQrUI(currentQrStatus, currentQrToken);
                        isSubmitting = false;
                    }
                });
            });
        }

        // ================================================================
        // 29. REGENERATE QR
        // ================================================================
        if (qrRegenerateBtn) {
            var freshRegen = qrRegenerateBtn.cloneNode(true);
            qrRegenerateBtn.parentNode.replaceChild(freshRegen, qrRegenerateBtn);

            freshRegen.addEventListener('click', function () {
                if (!navigator.onLine) {
                    safeToast('📴 Regenerate QR memerlukan koneksi internet.', 'warning', 4000);
                    return;
                }
                if (currentQrStatus !== 'active') {
                    safeToast('Aktifkan QR terlebih dahulu.', 'warning');
                    return;
                }

                showConfirm('Buat token QR baru? QR lama akan langsung tidak berlaku dan user harus scan ulang.', async function () {
                    if (isSubmitting) return;
                    isSubmitting = true;

                    freshRegen.disabled = true;
                    var original = freshRegen.innerHTML;
                    freshRegen.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses...';

                    try {
                        var res = await forceRefreshData('updateQrStatus', { status: 'active' });
                        var info = extractQrData(res);
                        currentQrStatus = info.status;
                        currentQrToken = info.token;
                        updateQrUI(currentQrStatus, currentQrToken);
                        updateStats();

                        try {
                            if (typeof logActivity === 'function') {
                                await logActivity('UPDATE', 'settings', 'qr_absensi', 'Regenerate token');
                            }
                        } catch (e) { /* silent */ }

                        safeToast('✅ QR baru berhasil dibuat!', 'success');
                    } catch (error) {
                        safeToast('Error: ' + error.message, 'error');
                    } finally {
                        freshRegen.disabled = false;
                        freshRegen.innerHTML = original;
                        isSubmitting = false;
                    }
                });
            });
        }

        // ================================================================
        // 30. DOWNLOAD QR
        // ================================================================
        if (downloadQrBtn) {
            var freshDl = downloadQrBtn.cloneNode(true);
            downloadQrBtn.parentNode.replaceChild(freshDl, downloadQrBtn);
            freshDl.addEventListener('click', downloadQR);
        }

        // ================================================================
        // 31. SAVE PASSWORD
        // ================================================================
        if (savePasswordBtn) {
            var freshSavePwd = savePasswordBtn.cloneNode(true);
            savePasswordBtn.parentNode.replaceChild(freshSavePwd, savePasswordBtn);

            freshSavePwd.addEventListener('click', async function () {
                if (isSubmitting) return;

                var newPassword = passwordInput ? passwordInput.value.trim() : '';
                if (!newPassword) {
                    if (passwordMsg) {
                        passwordMsg.textContent = 'Password tidak boleh kosong!';
                        passwordMsg.className = 'text-sm text-red-500 mt-2';
                    }
                    return;
                }
                if (newPassword.length < 6) {
                    if (passwordMsg) {
                        passwordMsg.textContent = 'Password minimal 6 karakter!';
                        passwordMsg.className = 'text-sm text-red-500 mt-2';
                    }
                    return;
                }

                isSubmitting = true;
                var original = freshSavePwd.innerHTML;
                freshSavePwd.disabled = true;
                freshSavePwd.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

                try {
                    var res = await apiCall('setAbsensiPassword', 'POST', { password: newPassword });
                    if (res && res.success) {
                        if (passwordMsg) {
                            if (res._offline) {
                                passwordMsg.textContent = '📴 Password tersimpan lokal, akan disinkronkan saat online.';
                                passwordMsg.className = 'text-sm text-amber-600 mt-2';
                            } else {
                                passwordMsg.textContent = '✅ Password berhasil disimpan!';
                                passwordMsg.className = 'text-sm text-green-600 mt-2';
                            }
                        }
                        if (passwordInput) passwordInput.value = '';

                        setTimeout(function () {
                            if (passwordMsg) {
                                passwordMsg.textContent = '';
                                passwordMsg.className = 'text-sm text-[var(--text-muted)] mt-2';
                            }
                        }, 4000);

                        try {
                            if (typeof logActivity === 'function') {
                                await logActivity('UPDATE', 'settings', 'absensi_password', 'Password updated');
                            }
                        } catch (e) { /* silent */ }

                        safeToast(
                            res._offline ? 'Password tersimpan lokal' : 'Password absensi diperbarui!',
                            res._offline ? 'warning' : 'success'
                        );
                    } else {
                        if (passwordMsg) {
                            passwordMsg.textContent = (res && res.message) || 'Gagal menyimpan password.';
                            passwordMsg.className = 'text-sm text-red-500 mt-2';
                        }
                    }
                } catch (error) {
                    if (passwordMsg) {
                        passwordMsg.textContent = 'Error: ' + error.message;
                        passwordMsg.className = 'text-sm text-red-500 mt-2';
                    }
                } finally {
                    freshSavePwd.disabled = false;
                    freshSavePwd.innerHTML = original;
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 32. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            var freshRefresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(freshRefresh, refreshBtn);

            freshRefresh.addEventListener('click', async function () {
                var original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span class="hidden sm:inline">Memuat...</span>';

                try {
                    await refreshDataOnly();
                    safeToast('✅ Data absensi diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 33. EXPORT DROPDOWN + BUTTONS
        // ================================================================
        if (exportBtn && exportDropdown && exportDropdownWp) {
            var freshExport = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(freshExport, exportBtn);

            var closeDropdown = function () {
                exportDropdown.classList.add('hidden');
                exportDropdownWp.classList.remove('open');
                freshExport.setAttribute('aria-expanded', 'false');
            };

            var openDropdown = function () {
                exportDropdown.classList.remove('hidden');
                exportDropdownWp.classList.add('open');
                freshExport.setAttribute('aria-expanded', 'true');
            };

            freshExport.addEventListener('click', function (e) {
                e.stopPropagation();
                var isOpen = !exportDropdown.classList.contains('hidden');
                if (isOpen) closeDropdown();
                else openDropdown();
            });

            // Outside click
            if (!document.__absensiExportOutsideClick) {
                document.__absensiExportOutsideClick = true;
                document.addEventListener('click', function (e) {
                    var dd = document.getElementById('export-dropdown');
                    var wrap = document.getElementById('export-dropdown-wrap');
                    var btn = document.getElementById('export-btn');
                    if (!dd || !wrap) return;
                    if (wrap.contains(e.target) || (btn && btn.contains(e.target))) return;
                    dd.classList.add('hidden');
                    wrap.classList.remove('open');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                });
            }

            if (exportCsvBtn) {
                var freshCsv = exportCsvBtn.cloneNode(true);
                exportCsvBtn.parentNode.replaceChild(freshCsv, exportCsvBtn);
                freshCsv.addEventListener('click', function (e) {
                    e.stopPropagation();
                    closeDropdown();
                    exportCSV();
                });
            }

            if (exportPdfBtn) {
                var freshPdf = exportPdfBtn.cloneNode(true);
                exportPdfBtn.parentNode.replaceChild(freshPdf, exportPdfBtn);
                freshPdf.addEventListener('click', function (e) {
                    e.stopPropagation();
                    closeDropdown();
                    exportPDF();
                });
            }

            if (exportImgBtn) {
                var freshImg = exportImgBtn.cloneNode(true);
                exportImgBtn.parentNode.replaceChild(freshImg, exportImgBtn);
                freshImg.addEventListener('click', function (e) {
                    e.stopPropagation();
                    closeDropdown();
                    exportImage();
                });
            }
        }

        // ================================================================
        // 34. ESC HANDLER
        // ================================================================
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;

            // Edit modal
            var editModal = document.getElementById('edit-absensi-modal');
            if (editModal && !editModal.classList.contains('hidden')) {
                editModal.classList.add('hidden');
                editModal.classList.remove('flex');
                editModal.dataset.editId = '';
                document.body.style.overflow = '';
                return;
            }

            // TTD lightbox
            var lightbox = document.getElementById('ttd-lightbox');
            if (lightbox && !lightbox.classList.contains('hidden')) {
                lightbox.classList.add('hidden');
                lightbox.classList.remove('flex');
                document.body.style.overflow = '';
                return;
            }

            // Export dropdown
            var dd = document.getElementById('export-dropdown');
            var wrap = document.getElementById('export-dropdown-wrap');
            if (dd && !dd.classList.contains('hidden')) {
                dd.classList.add('hidden');
                if (wrap) wrap.classList.remove('open');
            }
        });

        // ================================================================
        // 35. SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function (e) {
            var detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[absensi_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 36. CLEANUP
        // ================================================================
        function cleanup() {
            window.__absensiAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();

            var editModal = document.getElementById('edit-absensi-modal');
            if (editModal) editModal.classList.add('hidden');

            var lightbox = document.getElementById('ttd-lightbox');
            if (lightbox) lightbox.classList.add('hidden');

            var dd = document.getElementById('export-dropdown');
            var wrap = document.getElementById('export-dropdown-wrap');
            if (dd) dd.classList.add('hidden');
            if (wrap) wrap.classList.remove('open');

            document.body.style.overflow = '';
            console.log('[absensi_admin] Cleanup');
        }
        window.__absensiAdminCleanup = cleanup;

        // ================================================================
        // 37. INIT SEQUENCE
        // ================================================================
        console.log('[absensi_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();
        ensureBulkSelectAll();

        if (filterDate && !filterDate.value) {
            filterDate.value = '';
        }

        await Promise.allSettled([
            loadQrStatus(),
            loadAbsensi()
        ]);

        console.log('[absensi_admin] ✅ Init complete v14.0.0');
    }

    // ================================================================
    // 38. RUN INIT
    // ================================================================
    init();
});