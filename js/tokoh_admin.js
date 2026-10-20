/**
 * js/tokoh_admin.js
 * Modul Admin Tokoh & Penggerak — v13.0.0 OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v13.0.0:
 *   ✅ NEW: Handle response _offline dari apiCall
 *   ✅ NEW: Badge pending sync di tabel
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Safe toast fallback
 *   ✅ NEW: Upload foto skip saat offline (warning)
 *   ✅ NEW: FormPhoto controller untuk upload foto
 *   ✅ NEW: Detail modal dengan mini map OpenStreetMap
 *   ✅ NEW: Copy koordinat & no HP
 *   ✅ NEW: Stats 4 kartu (total, ada foto, ada lokasi, bulan ini)
 *   ✅ NEW: Search real-time (nama, alamat, no hp)
 *   ✅ NEW: Filter (foto, lokasi, riwayat)
 *   ✅ NEW: Bulk delete
 *   ✅ NEW: Export CSV
 *   ✅ NEW: Grid/List view toggle
 *   ✅ NEW: Refresh tanpa reload halaman
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit
 *   ✅ FIX: XSS protection (escapeHtml/escapeAttr)
 *   ✅ FIX: Lat/Lng validated (range + both-or-none)
 *   ✅ FIX: File size validation (max 5MB)
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 * ---------------------------------------------------------
 */

App.register('tokoh_admin', function() {
    'use strict';

    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__tokohAdminLoaded) {
        console.log('[tokoh_admin] Sudah di-init, skip.');
        return;
    }
    window.__tokohAdminLoaded = true;

    console.log('[tokoh_admin] 🚀 Init v13.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. HELPER: WAIT FOR DOM
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 40;
        interval = interval || 100;
        return new Promise((resolve) => {
            let attempts = 0;
            const elements = {};
            function check() {
                attempts++;
                let allFound = true;
                ids.forEach(id => {
                    if (!elements[id]) {
                        const el = document.getElementById(id);
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
    // 4. HELPER FUNCTIONS
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function isValidLat(lat) {
        const n = parseFloat(lat);
        return !isNaN(n) && n >= -90 && n <= 90;
    }

    function isValidLng(lng) {
        const n = parseFloat(lng);
        return !isNaN(n) && n >= -180 && n <= 180;
    }

    function getInitials(name) {
        if (!name || name === '-') return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function getAvatarColor(str) {
        const colors = [
            'from-teal-400 to-emerald-600',
            'from-blue-400 to-indigo-600',
            'from-purple-400 to-fuchsia-600',
            'from-pink-400 to-rose-600',
            'from-amber-400 to-orange-600',
            'from-cyan-400 to-blue-600'
        ];
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash = hash & hash;
        }
        return colors[Math.abs(hash) % colors.length];
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
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

    /**
     * ✅ Deteksi pending sync
     */
    function isPendingSync(id) {
        try {
            if (!window.SyncManager) return false;
            const queue = window.SyncManager.getQueue() || [];
            const idStr = String(id);
            return queue.some(item => {
                const d = item.data || {};
                return String(d.id) === idStr;
            });
        } catch (e) {
            return false;
        }
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[tokoh_admin:' + (type || 'info') + ']', msg);
        }
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let dataCache = [];
    let filteredCache = [];
    let currentFilter = {
        search: '',
        filter: 'all',
        sort: 'nama-asc'
    };
    let currentView = 'list';
    let isEdit = false;
    let isSubmitting = false;
    let selectedIds = new Set();
    let tokohPhotoCtrl = null;

    // ================================================================
    // 6. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        console.log('[tokoh_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getTokoh_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadData(true).then(() => {
            console.log('[tokoh_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 7. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'table-body',
            'tokoh-modal', 'tokoh-modal-content', 'modal-title', 'tokoh-form', 'modal-close',
            'add-btn', 'refresh-btn',
            'tokoh-id', 'nama', 'no_hp', 'lat', 'lng', 'alamat',
            'riwayat_hidup', 'pengalaman_organisasi', 'detail_lain',
            'foto_url', 'foto_file', 'foto-preview-wrap', 'foto-preview-img'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody        = els['table-body'];
        const modal            = els['tokoh-modal'];
        const modalContent     = els['tokoh-modal-content'];
        const modalTitle       = els['modal-title'];
        const form             = els['tokoh-form'];
        const closeBtn         = els['modal-close'];
        const addBtn           = els['add-btn'];
        const refreshBtn       = els['refresh-btn'];
        const idInput          = els['tokoh-id'];
        const namaInput        = els['nama'];
        const noHpInput        = els['no_hp'];
        const latInput         = els['lat'];
        const lngInput         = els['lng'];
        const alamatInput      = els['alamat'];
        const riwayatInput     = els['riwayat_hidup'];
        const pengalamanInput  = els['pengalaman_organisasi'];
        const detailInput      = els['detail_lain'];
        const fotoUrlInput     = els['foto_url'];
        const fotoFileInput    = els['foto_file'];
        const fotoPreviewWrap  = els['foto-preview-wrap'];
        const fotoPreviewImg   = els['foto-preview-img'];

        if (!tableBody || !modal || !modalContent || !form) {
            console.error('[tokoh_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 8. FORMPHOTO CONTROLLER
        // ================================================================
        if (typeof window.FormPhoto !== 'undefined' && fotoFileInput) {
            tokohPhotoCtrl = window.FormPhoto.attach(
                'foto_file',
                'foto-preview-img',
                null,
                {
                    onPreview: function() {
                        if (fotoPreviewWrap) fotoPreviewWrap.style.display = 'block';
                    },
                    onClear: function() {
                        if (fotoPreviewWrap) fotoPreviewWrap.style.display = 'none';
                        if (fotoUrlInput) fotoUrlInput.value = '';
                    }
                }
            );
            console.log('[tokoh_admin] ✅ FormPhoto controller attached');
        }

        function resetTokohPhoto() {
            if (tokohPhotoCtrl) {
                try { tokohPhotoCtrl.reset(); } catch (e) {}
            }
            if (fotoPreviewWrap) fotoPreviewWrap.style.display = 'none';
            if (fotoUrlInput) fotoUrlInput.value = '';
        }

        // ================================================================
        // 9. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('tokoh-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'tokoh-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Tokoh</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-tokoh">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-user-tie"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Ada Foto</p>
                                <p class="text-2xl font-bold text-blue-600 mt-1" id="stats-ada-foto">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-camera"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Ada Lokasi</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-ada-lokasi">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-map-marker-alt"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-bulan-ini">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar"></i>
                            </div>
                        </div>
                    </div>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search & Filter Bar =====
            if (!document.getElementById('tokoh-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'tokoh-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="tokoh-search" placeholder="Cari nama, alamat, no hp..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="tokoh-filter" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua</option>
                        <option value="foto">Ada Foto</option>
                        <option value="lokasi">Ada Lokasi</option>
                        <option value="riwayat">Ada Riwayat</option>
                    </select>
                    <select id="tokoh-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="nama-asc">Nama A-Z</option>
                        <option value="nama-desc">Nama Z-A</option>
                        <option value="terbaru">Terbaru</option>
                    </select>
                    <div class="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
                        <button id="tokoh-view-list" type="button" class="px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]" title="List view">
                            <i class="fas fa-list"></i>
                        </button>
                        <button id="tokoh-view-grid" type="button" class="px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]" title="Grid view">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                    <button id="tokoh-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                    <button id="tokoh-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('tokoh-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'tokoh-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-tokoh">0</span> tokoh dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-tokoh-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-tokoh-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('tokoh-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }

            // ===== Grid View =====
            if (!document.getElementById('tokoh-grid-view')) {
                const gridView = document.createElement('div');
                gridView.id = 'tokoh-grid-view';
                gridView.className = 'hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6';

                const tableWrapper = tableBody.closest('.table-wrapper') ||
                                     tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]') ||
                                     tableBody.closest('table');
                if (tableWrapper && tableWrapper.parentNode) {
                    const realWrapper = tableWrapper.tagName === 'TABLE'
                        ? tableWrapper.parentNode
                        : tableWrapper;
                    if (realWrapper && realWrapper.parentNode) {
                        realWrapper.parentNode.insertBefore(gridView, realWrapper.nextSibling);
                    }
                }
            }
        }

        // ================================================================
        // 10. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('tokoh-search');
            const filterSelect = document.getElementById('tokoh-filter');
            const sortSelect = document.getElementById('tokoh-sort');
            const exportBtn = document.getElementById('tokoh-export-btn');
            const clearBtn = document.getElementById('tokoh-clear-filter');
            const viewListBtn = document.getElementById('tokoh-view-list');
            const viewGridBtn = document.getElementById('tokoh-view-grid');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'tokoh-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (filterSelect && !filterSelect.dataset.attached) {
                filterSelect.dataset.attached = 'true';
                filterSelect.addEventListener('change', () => {
                    currentFilter.filter = filterSelect.value;
                    applyFilter();
                });
            }

            if (sortSelect && !sortSelect.dataset.attached) {
                sortSelect.dataset.attached = 'true';
                sortSelect.addEventListener('change', () => {
                    currentFilter.sort = sortSelect.value;
                    applyFilter();
                });
            }

            if (clearBtn && !clearBtn.dataset.attached) {
                clearBtn.dataset.attached = 'true';
                clearBtn.addEventListener('click', () => {
                    currentFilter = { search: '', filter: 'all', sort: 'nama-asc' };
                    if (searchInput) searchInput.value = '';
                    if (filterSelect) filterSelect.value = 'all';
                    if (sortSelect) sortSelect.value = 'nama-asc';
                    applyFilter();
                    safeToast('Filter direset.', 'info', 2000);
                });
            }

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportCSV);
            }

            if (viewListBtn && !viewListBtn.dataset.attached) {
                viewListBtn.dataset.attached = 'true';
                viewListBtn.addEventListener('click', () => {
                    currentView = 'list';
                    viewListBtn.className = 'px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]';
                    viewGridBtn.className = 'px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]';
                    renderView();
                });
            }

            if (viewGridBtn && !viewGridBtn.dataset.attached) {
                viewGridBtn.dataset.attached = 'true';
                viewGridBtn.addEventListener('click', () => {
                    currentView = 'grid';
                    viewGridBtn.className = 'px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]';
                    viewListBtn.className = 'px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]';
                    renderView();
                });
            }
        }

        // ================================================================
        // 11. APPLY FILTER & SORT
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(t => {
                if (currentFilter.filter === 'foto' && !t.foto_url) return false;
                if (currentFilter.filter === 'lokasi') {
                    if (!isValidLat(t.lat) || !isValidLng(t.lng)) return false;
                }
                if (currentFilter.filter === 'riwayat' && !t.riwayat_hidup) return false;

                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [t.nama, t.alamat, t.no_hp, t.pengalaman_organisasi, t.detail_lain]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            switch (currentFilter.sort) {
                case 'nama-asc':
                    filteredCache.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
                    break;
                case 'nama-desc':
                    filteredCache.sort((a, b) => String(b.nama || '').localeCompare(String(a.nama || '')));
                    break;
                case 'terbaru':
                    filteredCache.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    break;
            }

            renderView();
            updateStats();
        }

        // ================================================================
        // 12. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const adaFoto = dataCache.filter(t => t.foto_url).length;
            const adaLokasi = dataCache.filter(t => isValidLat(t.lat) && isValidLng(t.lng)).length;

            const now = new Date();
            const bulanIni = dataCache.filter(t => {
                const d = new Date(t.created_at);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const el1 = document.getElementById('stats-total-tokoh');
            const el2 = document.getElementById('stats-ada-foto');
            const el3 = document.getElementById('stats-ada-lokasi');
            const el4 = document.getElementById('stats-bulan-ini');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = adaFoto;
            if (el3) el3.textContent = adaLokasi;
            if (el4) el4.textContent = bulanIni;
        }

        // ================================================================
        // 13. RENDER VIEW (List / Grid)
        // ================================================================
        function renderView() {
            const tableView = tableBody.closest('.table-wrapper') ||
                             tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]') ||
                             tableBody.closest('table');
            const realTableView = tableView && tableView.tagName === 'TABLE'
                ? tableView.parentNode
                : tableView;
            const gridView = document.getElementById('tokoh-grid-view');

            if (currentView === 'grid') {
                if (realTableView) realTableView.classList.add('hidden');
                if (gridView) {
                    gridView.classList.remove('hidden');
                    renderGrid();
                }
            } else {
                if (realTableView) realTableView.classList.remove('hidden');
                if (gridView) gridView.classList.add('hidden');
                renderTable();
            }
        }

        // ================================================================
        // 14. LOAD DATA (SWR)
        // ================================================================
        async function loadData(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data tokoh...</p></td></tr>';

            try {
                const result = await forceRefreshData('getTokoh', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    applyFilter();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[tokoh_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getTokoh', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[tokoh_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 15. RENDER TABLE
        // ================================================================
        function renderTable() {
            if (!filteredCache || filteredCache.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.filter !== 'all';
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-user-tie text-3xl mb-2 opacity-40"></i><p>Belum ada data tokoh</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            filteredCache.forEach((item, idx) => {
                const isSelected = selectedIds.has(item.id);
                const hasLoc = isValidLat(item.lat) && isValidLng(item.lng);
                const name = item.nama || '-';
                const pending = isPendingSync(item.id);
                const avatarColor = getAvatarColor(name);

                const foto = item.foto_url
                    ? `<img src="${escapeAttr(item.foto_url)}" alt="${escapeAttr(name)}"
                            class="w-10 h-10 rounded-full object-cover border border-[var(--card-border)] cursor-pointer"
                            onclick="viewDetail('${escapeAttr(item.id)}')"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                            loading="lazy" decoding="async">
                       <div class="hidden w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor} items-center justify-center text-white font-bold">
                            ${escapeHtml(getInitials(name))}
                       </div>`
                    : `<div class="w-10 h-10 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white font-bold text-sm">
                            ${escapeHtml(getInitials(name))}
                       </div>`;

                const locBadge = hasLoc
                    ? `<button onclick="copyCoord('${escapeAttr(item.id)}')"
                          class="text-purple-600 hover:text-purple-800 dark:text-purple-400 mr-2"
                          title="Copy koordinat">
                          <i class="fas fa-map-marker-alt"></i>
                       </button>`
                    : '';

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="tokoh-checkbox w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3">${foto}</td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400 text-left">
                                ${escapeHtml(name)}
                            </button>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.alamat || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">
                            ${item.no_hp ? `<a href="tel:${escapeAttr(item.no_hp)}" class="hover:underline">${escapeHtml(item.no_hp)}</a>` : '-'}
                        </td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            ${locBadge}
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Lihat Detail">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editItem('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteItem('${escapeAttr(item.id)}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400"
                                title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;

            attachCheckboxListeners();
            updateBulkBar();
        }

        // ================================================================
        // 16. RENDER GRID
        // ================================================================
        function renderGrid() {
            const gridView = document.getElementById('tokoh-grid-view');
            if (!gridView) return;

            if (!filteredCache || filteredCache.length === 0) {
                gridView.className = 'grid grid-cols-1 gap-4 mb-6';
                gridView.innerHTML = '<div class="text-center py-8 text-[var(--text-muted)]">' +
                    '<i class="fas fa-user-tie text-3xl mb-2 opacity-40"></i>' +
                    '<p>Belum ada data tokoh</p></div>';
                return;
            }

            gridView.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6';

            let html = '';
            filteredCache.forEach((item) => {
                const name = item.nama || '-';
                const alamat = item.alamat || '-';
                const avatarColor = getAvatarColor(name);
                const pending = isPendingSync(item.id);
                const hasLoc = isValidLat(item.lat) && isValidLng(item.lng);
                const hasPhone = !!item.no_hp;

                const foto = item.foto_url
                    ? `<img src="${escapeAttr(item.foto_url)}" alt="${escapeAttr(name)}"
                            class="w-full h-full object-cover"
                            loading="lazy"
                            onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-3xl font-bold\\'>${escapeHtml(getInitials(name))}</div>'">`
                    : `<div class="w-full h-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-3xl font-bold">
                            ${escapeHtml(getInitials(name))}
                       </div>`;

                const pendingBadge = pending
                    ? '<span class="absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-bold bg-amber-500 text-white z-10">⟳ SYNC</span>'
                    : '';

                html += `
                    <div class="relative bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden shadow-sm hover:shadow-lg transition-all">
                        ${pendingBadge}
                        <div class="aspect-square relative overflow-hidden bg-[var(--bg-stats)] cursor-pointer" onclick="viewDetail('${escapeAttr(item.id)}')">
                            ${foto}
                        </div>
                        <div class="p-4">
                            <h3 class="font-bold text-[var(--text-main)] line-clamp-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                onclick="viewDetail('${escapeAttr(item.id)}')">
                                ${escapeHtml(name)}
                            </h3>
                            <p class="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">
                                <i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(alamat)}
                            </p>
                            <div class="flex gap-2 mt-3 pt-3 border-t border-[var(--card-border)]">
                                <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                    class="flex-1 text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] transition">
                                    <i class="fas fa-eye mr-1"></i>Detail
                                </button>
                                <button onclick="editItem('${escapeAttr(item.id)}')"
                                    class="flex-1 text-xs px-2 py-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 transition">
                                    <i class="fas fa-edit mr-1"></i>Edit
                                </button>
                                ${hasPhone ? `
                                    <a href="tel:${escapeAttr(item.no_hp)}"
                                        class="text-xs px-2 py-1.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 transition"
                                        title="Telepon">
                                        <i class="fas fa-phone"></i>
                                    </a>
                                ` : ''}
                                ${hasLoc ? `
                                    <button onclick="copyCoord('${escapeAttr(item.id)}')"
                                        class="text-xs px-2 py-1.5 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-200 transition"
                                        title="Copy koordinat">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
            gridView.innerHTML = html;
        }

        // ================================================================
        // 17. TH ADAPTERS
        // ================================================================
        function updateThead() {
            const thead = tableBody.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-tokoh')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-tokoh w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-tokoh');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.tokoh-checkbox').forEach(cb => {
                        cb.checked = this.checked;
                        if (this.checked) selectedIds.add(cb.dataset.id);
                        else selectedIds.delete(cb.dataset.id);
                        cb.closest('tr').classList.toggle('bg-red-50', this.checked);
                        cb.closest('tr').classList.toggle('dark:bg-red-900/10', this.checked);
                    });
                    updateBulkBar();
                });
            }
        }

        function attachCheckboxListeners() {
            document.querySelectorAll('.tokoh-checkbox').forEach(cb => {
                cb.addEventListener('change', function() {
                    if (this.checked) selectedIds.add(this.dataset.id);
                    else selectedIds.delete(this.dataset.id);

                    this.closest('tr').classList.toggle('bg-red-50', this.checked);
                    this.closest('tr').classList.toggle('dark:bg-red-900/10', this.checked);
                    updateBulkBar();
                });
            });
        }

        function updateBulkBar() {
            const bulkBar = document.getElementById('tokoh-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-tokoh');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 18. BULK DELETE (Offline-aware)
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-tokoh-btn');
            const cancelBtn = document.getElementById('bulk-cancel-tokoh-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} tokoh? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteTokoh', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(t => String(t.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.tokoh-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-tokoh');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} tokoh berhasil dihapus!` +
                                (offline > 0 ? ` (${offline} pending sync)` : ''), 'success');
                        } else {
                            safeToast(`${ok} berhasil, ${fail} gagal.`, 'warning');
                        }
                    });
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', () => {
                    selectedIds.clear();
                    document.querySelectorAll('.tokoh-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-tokoh');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 19. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(t => String(t.id) === String(id));
            if (!item) {
                safeToast('Data tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('tokoh-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'tokoh-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/50 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="tokoh-detail-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="relative">
                            <div id="tokoh-detail-header" class="h-32 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-t-2xl"></div>
                            <button id="tokoh-detail-close" class="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center">
                                <i class="fas fa-times"></i>
                            </button>
                            <div class="absolute -bottom-12 left-6">
                                <img id="tokoh-detail-foto" src="" alt="Foto" class="w-24 h-24 rounded-full object-cover border-4 border-[var(--card-bg)] shadow-lg bg-[var(--bg-stats)]">
                            </div>
                        </div>
                        <div class="pt-16 px-6 pb-6">
                            <h3 id="tokoh-detail-nama" class="text-2xl font-bold text-[var(--text-main)] font-amiri mb-1"></h3>
                            <p id="tokoh-detail-alamat" class="text-sm text-[var(--text-muted)] mb-4"></p>
                            <div id="tokoh-detail-body" class="space-y-4"></div>
                            <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--card-border)]">
                                <button id="tokoh-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                    <i class="fas fa-edit mr-1"></i>Edit
                                </button>
                                <button id="tokoh-detail-ok" class="btn-primary px-6 py-2 rounded-lg">
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };

                document.getElementById('tokoh-detail-close').addEventListener('click', closeFn);
                document.getElementById('tokoh-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('tokoh-detail-content');
            const foto = document.getElementById('tokoh-detail-foto');
            const nama = document.getElementById('tokoh-detail-nama');
            const alamat = document.getElementById('tokoh-detail-alamat');
            const body = document.getElementById('tokoh-detail-body');
            const nameStr = item.nama || 'Tanpa Nama';

            if (item.foto_url) {
                foto.src = item.foto_url;
                foto.style.display = 'block';
                foto.onerror = () => {
                    foto.src = 'https://placehold.co/200x200/e5e7eb/9ca3af?text=' +
                        encodeURIComponent(getInitials(nameStr));
                };
            } else {
                foto.src = 'https://placehold.co/200x200/e5e7eb/9ca3af?text=' +
                    encodeURIComponent(getInitials(nameStr));
            }

            nama.textContent = nameStr;
            alamat.innerHTML = '<i class="fas fa-map-marker-alt mr-1"></i>' +
                escapeHtml(item.alamat || 'Alamat tidak tersedia');

            let bodyHtml = '';

            if (item.no_hp) {
                bodyHtml += `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">No. HP</p>
                        <a href="tel:${escapeAttr(item.no_hp)}" class="text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400">
                            <i class="fas fa-phone mr-2"></i>${escapeHtml(item.no_hp)}
                        </a>
                    </div>
                `;
            }

            if (isValidLat(item.lat) && isValidLng(item.lng)) {
                const lat = parseFloat(item.lat);
                const lng = parseFloat(item.lng);
                bodyHtml += `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">Lokasi</p>
                        <div class="rounded-lg overflow-hidden border border-[var(--card-border)]" style="height:200px">
                            <iframe width="100%" height="200" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"
                                src="https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005}%2C${lat - 0.005}%2C${lng + 0.005}%2C${lat + 0.005}&layer=mapnik&marker=${lat}%2C${lng}">
                            </iframe>
                        </div>
                        <div class="flex items-center gap-2 mt-2 text-xs text-[var(--text-muted)]">
                            <i class="fas fa-map-pin"></i>
                            <span>${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
                            <button onclick="copyCoord('${escapeAttr(item.id)}')" class="text-blue-600 hover:underline">
                                <i class="fas fa-copy"></i> Copy
                            </button>
                        </div>
                    </div>
                `;
            }

            if (item.riwayat_hidup) {
                bodyHtml += `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Riwayat Hidup</p>
                        <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.riwayat_hidup)}</p>
                    </div>
                `;
            }

            if (item.pengalaman_organisasi) {
                bodyHtml += `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Pengalaman Organisasi</p>
                        <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.pengalaman_organisasi)}</p>
                    </div>
                `;
            }

            if (item.detail_lain) {
                bodyHtml += `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Detail Lain</p>
                        <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.detail_lain)}</p>
                    </div>
                `;
            }

            if (!bodyHtml) {
                bodyHtml = '<p class="text-center text-[var(--text-muted)] py-4 italic">Belum ada detail tambahan.</p>';
            }

            body.innerHTML = bodyHtml;

            const editBtn = document.getElementById('tokoh-detail-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.editItem(item.id);
                });
            }

            detailModal.classList.remove('hidden');
            detailModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (content) {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        };

        // ================================================================
        // 20. COPY COORDINATES
        // ================================================================
        window.copyCoord = function(id) {
            const item = dataCache.find(t => String(t.id) === String(id));
            if (!item) return;

            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);

            if (isNaN(lat) || isNaN(lng)) {
                safeToast('Koordinat tidak tersedia.', 'warning');
                return;
            }

            const text = lat.toFixed(6) + ', ' + lng.toFixed(6);
            copyToClipboard(text)
                .then(() => safeToast('📍 Koordinat dicopy: ' + text, 'success', 2500))
                .catch(() => safeToast('Gagal copy', 'error'));
        };

        // ================================================================
        // 21. MODAL FORM
        // ================================================================
        function openModal() {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(() => {
                if (modalContent) {
                    modalContent.classList.remove('scale-95', 'opacity-0');
                    modalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            setTimeout(() => { if (namaInput) namaInput.focus(); }, 150);
        }

        function closeModal() {
            if (modalContent) {
                modalContent.classList.remove('scale-100', 'opacity-100');
                modalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            form.reset();
            if (idInput) idInput.value = '';
            if (fotoUrlInput) fotoUrlInput.value = '';
            resetTokohPhoto();
            isEdit = false;
        }

        if (closeBtn) {
            const fresh = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(fresh, closeBtn);
            fresh.addEventListener('click', closeModal);
        }
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            const detailModal = document.getElementById('tokoh-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (!modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 22. FOTO PREVIEW
        // ================================================================
        function showFotoPreview(src) {
            if (fotoPreviewImg) fotoPreviewImg.src = src;
            if (fotoPreviewWrap) fotoPreviewWrap.style.display = 'block';
        }

        function hideFotoPreview() {
            if (fotoPreviewImg) fotoPreviewImg.src = '';
            if (fotoPreviewWrap) fotoPreviewWrap.style.display = 'none';
        }

        // ================================================================
        // 23. TAMBAH
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Tokoh';
                form.reset();
                if (idInput) idInput.value = '';
                if (fotoUrlInput) fotoUrlInput.value = '';
                resetTokohPhoto();
                openModal();
            });
        }

        // ================================================================
        // 24. EDIT
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(t => String(t.id) === String(id));
            if (!item) {
                safeToast('Data tidak ditemukan.', 'warning');
                return;
            }
            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Tokoh';
            if (idInput) idInput.value = item.id;
            if (namaInput) namaInput.value = item.nama || '';
            if (noHpInput) noHpInput.value = item.no_hp || '';
            if (latInput) latInput.value = item.lat || '';
            if (lngInput) lngInput.value = item.lng || '';
            if (alamatInput) alamatInput.value = item.alamat || '';
            if (riwayatInput) riwayatInput.value = item.riwayat_hidup || '';
            if (pengalamanInput) pengalamanInput.value = item.pengalaman_organisasi || '';
            if (detailInput) detailInput.value = item.detail_lain || '';
            if (fotoUrlInput) fotoUrlInput.value = item.foto_url || '';

            resetTokohPhoto();
            if (item.foto_url) showFotoPreview(item.foto_url);
            else hideFotoPreview();

            openModal();
        };

        // ================================================================
        // 25. DELETE SINGLE (Offline-aware)
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(t => String(t.id) === String(id));
            const nama = item ? (item.nama || 'tokoh ini') : 'tokoh ini';

            showConfirm('Hapus "' + nama + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteTokoh', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(t => String(t.id) !== String(id));
                        applyFilter();
                        await logActivity('DELETE', 'tokoh', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Tokoh dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Tokoh berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[tokoh_admin] deleteItem error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 26. SUBMIT FORM (Offline-aware)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const nama = (namaInput.value || '').trim();
            const no_hp = (noHpInput.value || '').trim();
            const lat = (latInput.value || '').trim();
            const lng = (lngInput.value || '').trim();
            const alamat = (alamatInput.value || '').trim();
            const riwayat_hidup = (riwayatInput.value || '').trim();
            const pengalaman_organisasi = (pengalamanInput.value || '').trim();
            const detail_lain = (detailInput.value || '').trim();
            const foto_url = (fotoUrlInput.value || '').trim();

            if (!nama) {
                safeToast('Nama wajib diisi!', 'warning');
                namaInput.focus();
                return;
            }

            if (lat && !isValidLat(lat)) {
                safeToast('Latitude tidak valid (harus -90 sampai 90)!', 'warning');
                latInput.focus();
                return;
            }

            if (lng && !isValidLng(lng)) {
                safeToast('Longitude tidak valid (harus -180 sampai 180)!', 'warning');
                lngInput.focus();
                return;
            }

            if ((lat && !lng) || (!lat && lng)) {
                safeToast('Latitude dan Longitude harus diisi keduanya atau dikosongkan!', 'warning');
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                // Upload foto terlebih dahulu (jika ada)
                let finalFotoUrl = foto_url;
                if (tokohPhotoCtrl && tokohPhotoCtrl.hasFile()) {
                    if (!navigator.onLine) {
                        safeToast('📴 Upload foto memerlukan koneksi internet. Menyimpan tanpa foto.', 'warning', 4500);
                    } else {
                        if (submitBtn) {
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengunggah foto...';
                        }
                        try {
                            finalFotoUrl = await window.FormPhoto.uploadIfAny(tokohPhotoCtrl, foto_url);
                        } catch (uploadErr) {
                            console.error('[tokoh_admin] Upload foto error:', uploadErr);
                            safeToast('Gagal upload foto: ' + uploadErr.message, 'error', 4000);
                            stopLoading(submitBtn);
                            isSubmitting = false;
                            return;
                        }
                        if (submitBtn) {
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
                        }
                    }
                }

                const data = {
                    nama: nama,
                    no_hp: no_hp,
                    lat: lat,
                    lng: lng,
                    alamat: alamat,
                    riwayat_hidup: riwayat_hidup,
                    pengalaman_organisasi: pengalaman_organisasi,
                    detail_lain: detail_lain,
                    foto_url: finalFotoUrl,
                    created_by: user.id
                };

                const id = idInput.value;
                const action = id ? 'updateTokoh' : 'createTokoh';
                const payload = id ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    if (id) {
                        const idx = dataCache.findIndex(t => String(t.id) === String(id));
                        if (idx !== -1) dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                    } else {
                        const newItem = Object.assign({}, data, {
                            id: result.id || ('tmp_' + Date.now()),
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });
                        dataCache.push(newItem);
                    }

                    applyFilter();
                    closeModal();
                    form.reset();

                    await logActivity(
                        id ? 'UPDATE' : 'CREATE',
                        'tokoh',
                        result.id || id,
                        'Tokoh: ' + nama
                    );

                    if (result._offline) {
                        safeToast('📴 Tokoh tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(
                            id ? '✅ Tokoh berhasil diperbarui!' : '✅ Tokoh berhasil disimpan!',
                            'success'
                        );
                    }
                } else {
                    safeToast((result && result.message) || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                console.error('[tokoh_admin] Submit error:', error);
                safeToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 27. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nama', 'No HP', 'Alamat', 'Latitude', 'Longitude', 'Riwayat Hidup', 'Pengalaman Organisasi', 'Detail Lain'];
            const rows = filteredCache.map((t, i) => [
                i + 1,
                t.nama || '',
                t.no_hp || '',
                t.alamat || '',
                t.lat || '',
                t.lng || '',
                t.riwayat_hidup || '',
                t.pengalaman_organisasi || '',
                t.detail_lain || ''
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tokoh_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 28. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';

                try {
                    await refreshDataOnly();
                    safeToast('✅ Data tokoh diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 29. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[tokoh_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 30. CLEANUP
        // ================================================================
        function cleanup() {
            window.__tokohAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const detailModal = document.getElementById('tokoh-detail-modal');
            if (detailModal) detailModal.remove();
            document.body.style.overflow = '';
            console.log('[tokoh_admin] Cleanup');
        }
        window.__tokohAdminCleanup = cleanup;

        // ================================================================
        // 31. INIT
        // ================================================================
        console.log('[tokoh_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        await loadData();

        console.log('[tokoh_admin] ✅ Init selesai v13.0.0');
    }

    // ================================================================
    // 32. RUN INIT
    // ================================================================
    init();
});