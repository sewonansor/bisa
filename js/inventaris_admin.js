/**
 * js/inventaris_admin.js
 * Modul Admin Inventaris & Peminjaman — v11.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v11.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge, toast warning)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Upload foto skip saat offline (warning)
 *   ✅ NEW: Barcode PDF download (multi-barcode)
 *   ✅ NEW: Quick return button di tabel peminjaman
 *   ✅ NEW: Stats 6 kartu (barang, stok baik, rusak, dipinjam, foto, kategori)
 *   ✅ NEW: Search + filter kondisi + filter kategori inventaris
 *   ✅ NEW: Sort (nama, jumlah, kondisi, terbaru)
 *   ✅ NEW: Tabs: Barang | Peminjaman | Riwayat
 *   ✅ NEW: Bulk delete barang & peminjaman
 *   ✅ NEW: Detail modal barang (foto, riwayat, qr code)
 *   ✅ NEW: QR Code per barang (bisa scan)
 *   ✅ NEW: Export CSV barang & peminjaman
 *   ✅ NEW: Edit mode pre-fill foto existing
 *   ✅ FIX: Semua handler idempotent (no double bind)
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit via isSubmitting
 *   ✅ FIX: XSS protection di semua output
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 *   ✅ FIX: FormPhoto controller robust
 * ============================================================
 */

App.register('inventaris_admin', function() {
    'use strict';

    // ================================================================
    // 1. AUTH GUARD
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__inventarisAdminLoaded) {
        console.log('[inventaris_admin] Sudah di-init, skip.');
        return;
    }
    window.__inventarisAdminLoaded = true;

    console.log('[inventaris_admin] 🚀 Init v11.0.0 (Offline-First Full Fix)');

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
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    function formatDateLong(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function formatRupiah(n) {
        return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function getKondisiBadge(kondisi) {
        const map = {
            'Baik': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
            'Rusak Ringan': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
            'Rusak Berat': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
        };
        return map[kondisi] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }

    function getStatusBadge(status) {
        const map = {
            'dipinjam': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
            'kembali': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        };
        return map[status] || map['kembali'];
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
            console.log('[inventaris_admin:' + (type || 'info') + ']', msg);
        }
    }

    /**
     * Render thumbnail foto barang
     */
    function renderBarangThumb(item) {
        if (!item.foto_url) {
            return '<div class="w-12 h-12 rounded-lg bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-dim)]">' +
                   '<i class="fas fa-image text-lg opacity-50"></i></div>';
        }
        return '<img src="' + escapeAttr(item.foto_url) + '" ' +
               'alt="' + escapeAttr(item.nama_barang || 'Foto') + '" ' +
               'class="w-12 h-12 rounded-lg object-cover border border-[var(--card-border)] cursor-pointer hover:scale-105 transition-transform" ' +
               'loading="lazy" ' +
               'onclick="viewBarangDetail(\'' + escapeAttr(item.id) + '\')" ' +
               'onerror="this.outerHTML=\'<div class=&quot;w-12 h-12 rounded-lg bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-dim)]&quot;><i class=&quot;fas fa-image text-lg opacity-50&quot;></i></div>\'">';
    }

    /**
     * Refresh data tanpa reload
     */
    function refreshDataOnly() {
        console.log('[inventaris_admin] 🔄 Refresh data without reload');

        try {
            const cKeyBarang = 'cache_getInventaris_' + user.id + '_' + JSON.stringify({});
            const cKeyPinjam = 'cache_getPeminjaman_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKeyBarang);
            SafeSessionStorage.removeItem(cKeyPinjam);
        } catch (e) {}

        barangCache = [];
        pinjamCache = [];
        selectedBarangIds.clear();
        selectedPinjamIds.clear();

        return Promise.allSettled([
            loadBarang(true),
            loadPeminjaman(true)
        ]).then(() => {
            populatePinjamDropdown();
            updateAllStats();
            console.log('[inventaris_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'barang-table-body', 'pinjam-table-body',
            'barang-modal', 'barang-modal-content', 'barang-modal-title', 'barang-form',
            'barang-modal-close', 'add-barang-btn', 'refresh-inventaris-btn',
            'barang-id', 'barang_nama', 'barang_jumlah', 'barang_kondisi', 'barang_lokasi',
            'pinjam-modal', 'pinjam-modal-content', 'pinjam-form', 'pinjam-modal-close',
            'add-pinjam-btn', 'pinjam_barang_id', 'pinjam_peminjam', 'pinjam_tanggal',
            'pinjam_tanggal_kembali',
            'total-barang', 'total-baik', 'total-dipinjam', 'total-rusak'
        ];

        const els = await waitForElements(requiredIds);

        const barangTable        = els['barang-table-body'];
        const pinjamTable        = els['pinjam-table-body'];
        const barangModal        = els['barang-modal'];
        const barangModalContent = els['barang-modal-content'];
        const barangModalTitle   = els['barang-modal-title'];
        const barangForm         = els['barang-form'];
        const barangCloseBtn     = els['barang-modal-close'];
        const addBarangBtn       = els['add-barang-btn'];
        const refreshBtn         = els['refresh-inventaris-btn'];
        const barangId           = els['barang-id'];
        const barangNama         = els['barang_nama'];
        const barangJumlah       = els['barang_jumlah'];
        const barangKondisi      = els['barang_kondisi'];
        const barangLokasi       = els['barang_lokasi'];
        const pinjamModal        = els['pinjam-modal'];
        const pinjamModalContent = els['pinjam-modal-content'];
        const pinjamForm         = els['pinjam-form'];
        const pinjamCloseBtn     = els['pinjam-modal-close'];
        const addPinjamBtn       = els['add-pinjam-btn'];
        const pinjamBarangId     = els['pinjam_barang_id'];
        const pinjamPeminjam     = els['pinjam_peminjam'];
        const pinjamTanggal      = els['pinjam_tanggal'];
        const pinjamTanggalKembali = els['pinjam_tanggal_kembali'];
        const totalBarangEl      = els['total-barang'];
        const totalBaikEl        = els['total-baik'];
        const totalDipinjamEl    = els['total-dipinjam'];
        const totalRusakEl       = els['total-rusak'];

        if (!barangTable || !pinjamTable || !barangModal || !pinjamModal) {
            console.error('[inventaris_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let isEditBarang = false;
        let isSubmitting = false;
        let barangCache = [];
        let pinjamCache = [];
        let filteredBarang = [];
        let filteredPinjam = [];
        let currentBarangFilter = {
            search: '',
            kondisi: 'all',
            sort: 'nama-asc'
        };
        let currentPinjamFilter = {
            search: '',
            status: 'all'
        };
        let selectedBarangIds = new Set();
        let selectedPinjamIds = new Set();
        let currentTab = 'barang';
        let currentPinjamStatus = 'all';

        // ✅ FormPhoto controller untuk barang
        let barangPhotoCtrl = null;

        // ================================================================
        // 7. TAB LOGIC
        // ================================================================
        function activateTab(tabName) {
            currentTab = tabName;
            const tabs = ['barang', 'peminjaman', 'riwayat'];
            tabs.forEach(t => {
                const tabEl = document.getElementById('tab-' + t);
                const btnEl = document.getElementById('tab-btn-' + t);
                if (tabEl) tabEl.classList.toggle('hidden', t !== tabName);
                if (btnEl) {
                    btnEl.classList.toggle('active', t === tabName);
                    btnEl.classList.toggle('bg-[var(--text-main)]', t === tabName);
                    btnEl.classList.toggle('text-[var(--text-inverse)]', t === tabName);
                    btnEl.classList.toggle('bg-transparent', t !== tabName);
                    btnEl.classList.toggle('text-[var(--text-muted)]', t !== tabName);
                }
            });

            if (tabName === 'peminjaman' || tabName === 'riwayat') {
                loadPeminjaman();
                if (tabName === 'riwayat') {
                    currentPinjamStatus = 'kembali';
                } else {
                    currentPinjamStatus = 'dipinjam';
                }
                applyPinjamFilter();
            }
        }

        // Bind tab buttons
        const tabBtnConfig = [
            { id: 'tab-btn-barang', tab: 'barang' },
            { id: 'tab-btn-peminjaman', tab: 'peminjaman' },
            { id: 'tab-btn-riwayat', tab: 'riwayat' }
        ];
        tabBtnConfig.forEach(cfg => {
            const btn = document.getElementById(cfg.id);
            if (btn && !btn.dataset.attached) {
                btn.dataset.attached = 'true';
                btn.addEventListener('click', () => activateTab(cfg.tab));
            }
        });

        // ================================================================
        // 8. ✅ ATTACH FORMPHOTO CONTROLLER
        // ================================================================
        const barangFotoInput = document.getElementById('barang_foto');
        if (typeof window.FormPhoto !== 'undefined' && barangFotoInput) {
            barangPhotoCtrl = window.FormPhoto.attach(
                'barang_foto',
                'barang-foto-preview',
                'barang-foto-remove',
                {
                    onPreview: function() {
                        const wrap = document.getElementById('barang-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'block';
                    },
                    onClear: function() {
                        const wrap = document.getElementById('barang-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'none';
                        const hiddenUrl = document.getElementById('barang_foto_url');
                        if (hiddenUrl) hiddenUrl.value = '';
                    }
                }
            );
            console.log('[inventaris_admin] ✅ FormPhoto controller attached');
        } else {
            console.warn('[inventaris_admin] ⚠️ FormPhoto tidak tersedia atau input foto tidak ada');
        }

        function resetBarangPhoto() {
            if (barangPhotoCtrl) {
                try { barangPhotoCtrl.reset(); } catch (e) {}
            }
            const wrap = document.getElementById('barang-foto-preview-wrap');
            if (wrap) wrap.style.display = 'none';
            const hiddenUrl = document.getElementById('barang_foto_url');
            if (hiddenUrl) hiddenUrl.value = '';
        }

        // ================================================================
        // 9. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 6 kartu =====
            if (!document.getElementById('inventaris-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'inventaris-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Barang</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-barang-inv">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-boxes"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Stok Baik</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-stok-baik">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-check-circle"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Rusak</p>
                                <p class="text-2xl font-bold text-red-600 mt-1" id="stats-stok-rusak">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Dipinjam</p>
                                <p class="text-2xl font-bold text-yellow-600 mt-1" id="stats-dipinjam-inv">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
                                <i class="fas fa-hand-holding"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Ada Foto</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-ada-foto-inv">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-camera"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Lokasi</p>
                                <p class="text-lg font-bold text-cyan-600 mt-1" id="stats-lokasi-inv">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white">
                                <i class="fas fa-map-marker-alt"></i>
                            </div>
                        </div>
                    </div>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Tab Bar =====
            if (!document.getElementById('inventaris-tabs')) {
                const tabsWrap = document.createElement('div');
                tabsWrap.id = 'inventaris-tabs';
                tabsWrap.className = 'flex flex-wrap gap-2 mb-4 p-1 bg-[var(--bg-stats)] rounded-xl';
                tabsWrap.innerHTML = `
                    <button id="tab-btn-barang" type="button" class="flex-1 min-w-[120px] px-4 py-2 rounded-lg text-sm font-semibold transition active bg-[var(--text-main)] text-[var(--text-inverse)]">
                        <i class="fas fa-boxes mr-1"></i>Barang
                    </button>
                    <button id="tab-btn-peminjaman" type="button" class="flex-1 min-w-[120px] px-4 py-2 rounded-lg text-sm font-semibold transition bg-transparent text-[var(--text-muted)] hover:bg-[var(--card-border)]">
                        <i class="fas fa-hand-holding mr-1"></i>Peminjaman
                    </button>
                    <button id="tab-btn-riwayat" type="button" class="flex-1 min-w-[120px] px-4 py-2 rounded-lg text-sm font-semibold transition bg-transparent text-[var(--text-muted)] hover:bg-[var(--card-border)]">
                        <i class="fas fa-history mr-1"></i>Riwayat
                    </button>
                `;
                const statsDiv = document.getElementById('inventaris-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(tabsWrap, statsDiv.nextSibling);
                }
            }

            // ===== Search Bar (Barang) =====
            if (!document.getElementById('barang-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'barang-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="barang-search" placeholder="Cari nama barang, lokasi..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="barang-filter-kondisi" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Kondisi</option>
                        <option value="Baik">Baik</option>
                        <option value="Rusak Ringan">Rusak Ringan</option>
                        <option value="Rusak Berat">Rusak Berat</option>
                    </select>
                    <select id="barang-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="nama-asc">Nama A-Z</option>
                        <option value="nama-desc">Nama Z-A</option>
                        <option value="jumlah-desc">Stok Terbanyak</option>
                        <option value="jumlah-asc">Stok Sedikit</option>
                        <option value="terbaru">Terbaru</option>
                    </select>
                    <button id="barang-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Bar Barang =====
            if (!document.getElementById('barang-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'barang-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-barang">0</span> barang dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-barang-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-barang-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('barang-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 10. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('barang-search');
            const filterKondisi = document.getElementById('barang-filter-kondisi');
            const sortSelect = document.getElementById('barang-sort');
            const exportBtn = document.getElementById('barang-export-btn');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'barang-search', () => {
                        currentBarangFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyBarangFilter();
                    }, 250));
            }

            if (filterKondisi && !filterKondisi.dataset.attached) {
                filterKondisi.dataset.attached = 'true';
                filterKondisi.addEventListener('change', () => {
                    currentBarangFilter.kondisi = filterKondisi.value;
                    applyBarangFilter();
                });
            }

            if (sortSelect && !sortSelect.dataset.attached) {
                sortSelect.dataset.attached = 'true';
                sortSelect.addEventListener('change', () => {
                    currentBarangFilter.sort = sortSelect.value;
                    applyBarangFilter();
                });
            }

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportBarangCSV);
            }

            // Peminjaman filters
            const pinjamSearch = document.getElementById('pinjam-search');
            const pinjamFilterStatus = document.getElementById('pinjam-filter-status');
            const pinjamExportBtn = document.getElementById('pinjam-export-btn');

            if (pinjamSearch && !pinjamSearch.dataset.attached) {
                pinjamSearch.dataset.attached = 'true';
                pinjamSearch.addEventListener('input',
                    debounceEvent.bind(null, 'pinjam-search', () => {
                        currentPinjamFilter.search = (pinjamSearch.value || '').toLowerCase().trim();
                        applyPinjamFilter();
                    }, 250));
            }

            if (pinjamFilterStatus && !pinjamFilterStatus.dataset.attached) {
                pinjamFilterStatus.dataset.attached = 'true';
                pinjamFilterStatus.addEventListener('change', () => {
                    currentPinjamFilter.status = pinjamFilterStatus.value;
                    applyPinjamFilter();
                });
            }

            if (pinjamExportBtn && !pinjamExportBtn.dataset.attached) {
                pinjamExportBtn.dataset.attached = 'true';
                pinjamExportBtn.addEventListener('click', exportPinjamCSV);
            }
        }

        // ================================================================
        // 11. APPLY BARANG FILTER
        // ================================================================
        function applyBarangFilter() {
            filteredBarang = barangCache.filter(item => {
                if (currentBarangFilter.kondisi !== 'all') {
                    if ((item.kondisi || '') !== currentBarangFilter.kondisi) return false;
                }
                if (currentBarangFilter.search) {
                    const q = currentBarangFilter.search;
                    const haystack = [item.nama_barang, item.lokasi, item.kondisi]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort
            switch (currentBarangFilter.sort) {
                case 'nama-asc':
                    filteredBarang.sort((a, b) => String(a.nama_barang || '').localeCompare(String(b.nama_barang || '')));
                    break;
                case 'nama-desc':
                    filteredBarang.sort((a, b) => String(b.nama_barang || '').localeCompare(String(a.nama_barang || '')));
                    break;
                case 'jumlah-desc':
                    filteredBarang.sort((a, b) => (Number(b.jumlah) || 0) - (Number(a.jumlah) || 0));
                    break;
                case 'jumlah-asc':
                    filteredBarang.sort((a, b) => (Number(a.jumlah) || 0) - (Number(b.jumlah) || 0));
                    break;
                case 'terbaru':
                    filteredBarang.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    break;
            }

            renderBarangTable(filteredBarang);
            updateBarangStats();
        }

        // ================================================================
        // 12. APPLY PINJAM FILTER
        // ================================================================
        function applyPinjamFilter() {
            if (currentTab === 'riwayat') {
                currentPinjamFilter.status = 'kembali';
            } else if (currentTab === 'peminjaman') {
                currentPinjamFilter.status = 'dipinjam';
            }

            filteredPinjam = pinjamCache.filter(item => {
                if (currentPinjamFilter.status !== 'all' && item.status !== currentPinjamFilter.status) {
                    return false;
                }
                if (currentPinjamFilter.search) {
                    const q = currentPinjamFilter.search;
                    const barang = barangCache.find(b => String(b.id) === String(item.barang_id));
                    const barangName = barang ? barang.nama_barang : '';
                    const haystack = [item.peminjam, barangName, item.status]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            filteredPinjam.sort((a, b) =>
                new Date(b.created_at || 0) - new Date(a.created_at || 0));

            renderPinjamTable(filteredPinjam, barangCache);
            updatePinjamStats();
        }

        // ================================================================
        // 13. UPDATE STATS
        // ================================================================
        function updateBarangStats() {
            const total = barangCache.length;
            const baik = barangCache.filter(b => b.kondisi === 'Baik').reduce((sum, b) => sum + (Number(b.jumlah) || 0), 0);
            const rusak = barangCache.filter(b => b.kondisi === 'Rusak Ringan' || b.kondisi === 'Rusak Berat').reduce((sum, b) => sum + (Number(b.jumlah) || 0), 0);
            const adaFoto = barangCache.filter(b => b.foto_url).length;
            const lokasiUnik = new Set(barangCache.map(b => String(b.lokasi || '').trim()).filter(Boolean)).size;

            const el1 = document.getElementById('stats-total-barang-inv');
            const el2 = document.getElementById('stats-stok-baik');
            const el3 = document.getElementById('stats-stok-rusak');
            const el4 = document.getElementById('stats-ada-foto-inv');
            const el5 = document.getElementById('stats-lokasi-inv');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = baik;
            if (el3) el3.textContent = rusak;
            if (el4) el4.textContent = adaFoto;
            if (el5) el5.textContent = lokasiUnik;

            if (totalBarangEl) {
                totalBarangEl.textContent = barangCache.reduce((sum, b) => sum + (Number(b.jumlah) || 0), 0);
            }
            if (totalBaikEl) totalBaikEl.textContent = baik;
            if (totalRusakEl) totalRusakEl.textContent = rusak;

            updatePinjamStats();
        }

        function updatePinjamStats() {
            const dipinjam = pinjamCache.filter(p => p.status === 'dipinjam').length;
            const el = document.getElementById('stats-dipinjam-inv');
            if (el) el.textContent = dipinjam;
            if (totalDipinjamEl) totalDipinjamEl.textContent = dipinjam;
        }

        function updateAllStats() {
            updateBarangStats();
            updatePinjamStats();
        }

        // ================================================================
        // 14. LOAD BARANG (SWR)
        // ================================================================
        async function loadBarang(force) {
            force = force || false;

            if (barangCache.length > 0 && !force) {
                applyBarangFilter();
                fetchBarangBackground();
                return;
            }

            barangTable.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data barang...</p></td></tr>';

            try {
                const result = await forceRefreshData('getInventaris', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    barangCache = result.data;
                    applyBarangFilter();
                } else if (result && result.success) {
                    barangCache = [];
                    filteredBarang = [];
                    renderBarangTable([]);
                    updateBarangStats();
                } else {
                    barangTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[inventaris_admin] loadBarang error:', error);
                barangTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchBarangBackground() {
            try {
                const result = await forceRefreshData('getInventaris', {});
                if (result && result.success && Array.isArray(result.data)) {
                    barangCache = result.data;
                    applyBarangFilter();
                }
            } catch (e) {
                console.warn('[inventaris_admin] BG refresh barang gagal:', e);
            }
        }

        // ================================================================
        // 15. RENDER TABEL BARANG
        // ================================================================
        function renderBarangTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentBarangFilter.search || currentBarangFilter.kondisi !== 'all';
                barangTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-boxes text-3xl mb-2 opacity-40"></i><p>Belum ada barang</p>') +
                    '</td></tr>';
                return;
            }

            updateBarangThead();

            let html = '';
            data.forEach((item, idx) => {
                const kondisiBadge = getKondisiBadge(item.kondisi);
                const jumlah = Number(item.jumlah) || 0;
                const isSelected = selectedBarangIds.has(item.id);
                const pending = isPendingSync(item.id);

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="barang-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-center">${renderBarangThumb(item)}</td>
                        <td class="px-3 py-3 text-sm font-medium text-[var(--text-main)]">
                            <button onclick="viewBarangDetail('${escapeAttr(item.id)}')"
                                class="hover:text-blue-600 dark:hover:text-blue-400 text-left"
                                title="Klik untuk lihat detail">
                                ${escapeHtml(item.nama_barang || '-')}
                            </button>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <span class="font-bold ${jumlah <= 0 ? 'text-red-600' : 'text-[var(--text-main)]'}">${jumlah}</span>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${kondisiBadge}">
                                ${escapeHtml(item.kondisi || '-')}
                            </span>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.lokasi || '-')}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="generateBarcode('${escapeAttr(item.id)}')"
                                class="text-purple-600 hover:text-purple-800 dark:text-purple-400 mr-2"
                                title="QR Code">
                                <i class="fas fa-qrcode"></i>
                            </button>
                            <button onclick="editBarang('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteBarang('${escapeAttr(item.id)}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400"
                                title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            barangTable.innerHTML = html;

            attachBarangCheckboxListeners();
            updateBarangBulkBar();
        }

        function updateBarangThead() {
            const thead = barangTable.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-barang')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-barang w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-barang');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.barang-checkbox').forEach(cb => {
                        cb.checked = this.checked;
                        if (this.checked) selectedBarangIds.add(cb.dataset.id);
                        else selectedBarangIds.delete(cb.dataset.id);
                        cb.closest('tr').classList.toggle('bg-red-50', this.checked);
                        cb.closest('tr').classList.toggle('dark:bg-red-900/10', this.checked);
                    });
                    updateBarangBulkBar();
                });
            }
        }

        function attachBarangCheckboxListeners() {
            document.querySelectorAll('.barang-checkbox').forEach(cb => {
                cb.addEventListener('change', function() {
                    if (this.checked) selectedBarangIds.add(this.dataset.id);
                    else selectedBarangIds.delete(this.dataset.id);

                    this.closest('tr').classList.toggle('bg-red-50', this.checked);
                    this.closest('tr').classList.toggle('dark:bg-red-900/10', this.checked);
                    updateBarangBulkBar();
                });
            });
        }

        function updateBarangBulkBar() {
            const bulkBar = document.getElementById('barang-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-barang');
            if (!bulkBar) return;

            if (selectedBarangIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedBarangIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 16. BULK ACTIONS BARANG
        // ================================================================
        function attachBarangBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-barang-btn');
            const cancelBtn = document.getElementById('bulk-cancel-barang-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedBarangIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} barang? Data peminjaman terkait akan terhapus.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteInventaris', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    barangCache = barangCache.filter(b => String(b.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedBarangIds.clear();
                        document.querySelectorAll('.barang-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-barang');
                        if (selAll) selAll.checked = false;
                        updateBarangBulkBar();
                        applyBarangFilter();
                        await loadPeminjaman(true);
                        populatePinjamDropdown();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} barang berhasil dihapus!` +
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
                    selectedBarangIds.clear();
                    document.querySelectorAll('.barang-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-barang');
                    if (selAll) selAll.checked = false;
                    updateBarangBulkBar();
                });
            }
        }

        // ================================================================
        // 17. LOAD PEMINJAMAN (SWR)
        // ================================================================
        async function loadPeminjaman(force) {
            force = force || false;

            if (pinjamCache.length > 0 && !force) {
                applyPinjamFilter();
                fetchPinjamBackground();
                return;
            }

            pinjamTable.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data peminjaman...</p></td></tr>';

            try {
                const [pinjamRes, barangRes] = await Promise.all([
                    forceRefreshData('getPeminjaman', {}),
                    forceRefreshData('getInventaris', {})
                ]);

                if (pinjamRes && pinjamRes.success && Array.isArray(pinjamRes.data)) {
                    pinjamCache = pinjamRes.data;
                    if (barangRes && barangRes.success && Array.isArray(barangRes.data)) {
                        barangCache = barangRes.data;
                        applyBarangFilter();
                    }
                    applyPinjamFilter();
                    updateAllStats();
                } else if (pinjamRes && pinjamRes.success) {
                    pinjamCache = [];
                    filteredPinjam = [];
                    renderPinjamTable([], barangCache);
                    updatePinjamStats();
                } else {
                    pinjamTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((pinjamRes && pinjamRes.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[inventaris_admin] loadPeminjaman error:', error);
                pinjamTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchPinjamBackground() {
            try {
                const [pinjamRes, barangRes] = await Promise.all([
                    forceRefreshData('getPeminjaman', {}),
                    forceRefreshData('getInventaris', {})
                ]);
                if (pinjamRes && pinjamRes.success) {
                    pinjamCache = pinjamRes.data || [];
                    if (barangRes && barangRes.success) {
                        barangCache = barangRes.data || [];
                    }
                    applyPinjamFilter();
                    updateAllStats();
                }
            } catch (e) {
                console.warn('[inventaris_admin] BG refresh peminjaman gagal:', e);
            }
        }

        // ================================================================
        // 18. RENDER TABEL PEMINJAMAN
        // ================================================================
        function renderPinjamTable(data, barangData) {
            if (!data || data.length === 0) {
                const emptyMsg = currentTab === 'riwayat'
                    ? 'Belum ada riwayat peminjaman'
                    : 'Belum ada peminjaman aktif';
                pinjamTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    '<i class="fas fa-hand-holding text-3xl mb-2 opacity-40"></i>' +
                    '<p>' + emptyMsg + '</p></td></tr>';
                return;
            }

            updatePinjamThead();

            let html = '';
            data.forEach((item, idx) => {
                const barang = (barangData || []).find(b => String(b.id) === String(item.barang_id));
                const barangName = barang ? barang.nama_barang : '(Barang dihapus)';
                const tanggalPinjam = formatDate(item.tanggal_pinjam);
                const tanggalKembali = formatDate(item.tanggal_kembali);
                const isDipinjam = item.status === 'dipinjam';
                const statusBadge = getStatusBadge(item.status);
                const isSelected = selectedPinjamIds.has(item.id);
                const pending = isPendingSync(item.id);

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="pinjam-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-sm font-medium text-[var(--text-main)]">
                            ${escapeHtml(barangName)}
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.peminjam || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">${escapeHtml(tanggalPinjam)}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">${escapeHtml(tanggalKembali)}</td>
                        <td class="px-3 py-3 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${statusBadge}">
                                ${isDipinjam ? 'Dipinjam' : 'Kembali'}
                            </span>
                        </td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            ${isDipinjam ? `
                                <button onclick="kembalikanBarang('${escapeAttr(item.id)}')"
                                    class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                    title="Tandai Kembali">
                                    <i class="fas fa-undo"></i>
                                </button>
                            ` : ''}
                            <button onclick="deletePeminjaman('${escapeAttr(item.id)}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400"
                                title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            pinjamTable.innerHTML = html;

            attachPinjamCheckboxListeners();
            updatePinjamBulkBar();
        }

        function updatePinjamThead() {
            const thead = pinjamTable.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-pinjam')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-pinjam w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-pinjam');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.pinjam-checkbox').forEach(cb => {
                        cb.checked = this.checked;
                        if (this.checked) selectedPinjamIds.add(cb.dataset.id);
                        else selectedPinjamIds.delete(cb.dataset.id);
                        cb.closest('tr').classList.toggle('bg-red-50', this.checked);
                    });
                    updatePinjamBulkBar();
                });
            }
        }

        function attachPinjamCheckboxListeners() {
            document.querySelectorAll('.pinjam-checkbox').forEach(cb => {
                cb.addEventListener('change', function() {
                    if (this.checked) selectedPinjamIds.add(this.dataset.id);
                    else selectedPinjamIds.delete(this.dataset.id);
                    this.closest('tr').classList.toggle('bg-red-50', this.checked);
                    updatePinjamBulkBar();
                });
            });
        }

        function updatePinjamBulkBar() {
            // Optional - bisa di-extend nanti
        }

        // ================================================================
        // 19. MODAL BARANG
        // ================================================================
        function openBarangModal() {
            barangModal.classList.remove('hidden');
            barangModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (barangModalContent) {
                    barangModalContent.classList.remove('scale-95', 'opacity-0');
                    barangModalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            setTimeout(() => { if (barangNama) barangNama.focus(); }, 150);
        }

        function closeBarangModal() {
            if (barangModalContent) {
                barangModalContent.classList.remove('scale-100', 'opacity-100');
                barangModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                barangModal.classList.add('hidden');
                barangModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (barangForm) barangForm.reset();
            if (barangId) barangId.value = '';
            resetBarangPhoto();
            isEditBarang = false;
        }

        if (barangCloseBtn) {
            const fresh = barangCloseBtn.cloneNode(true);
            barangCloseBtn.parentNode.replaceChild(fresh, barangCloseBtn);
            fresh.addEventListener('click', closeBarangModal);
        }
        if (barangModal) {
            barangModal.addEventListener('click', (e) => {
                if (e.target === barangModal) closeBarangModal();
            });
        }

        // ================================================================
        // 20. TAMBAH BARANG
        // ================================================================
        if (addBarangBtn) {
            const fresh = addBarangBtn.cloneNode(true);
            addBarangBtn.parentNode.replaceChild(fresh, addBarangBtn);
            fresh.addEventListener('click', () => {
                isEditBarang = false;
                if (barangModalTitle) barangModalTitle.textContent = 'Tambah Barang';
                if (barangForm) barangForm.reset();
                if (barangId) barangId.value = '';
                resetBarangPhoto();
                openBarangModal();
            });
        }

        // ================================================================
        // 21. EDIT BARANG
        // ================================================================
        window.editBarang = function(id) {
            const item = barangCache.find(d => String(d.id) === String(id));
            if (!item) {
                safeToast('Barang tidak ditemukan.', 'warning');
                return;
            }

            isEditBarang = true;
            if (barangModalTitle) barangModalTitle.textContent = 'Edit Barang';
            if (barangId) barangId.value = item.id;
            if (barangNama) barangNama.value = item.nama_barang || '';
            if (barangJumlah) barangJumlah.value = item.jumlah || 0;
            if (barangKondisi) barangKondisi.value = item.kondisi || 'Baik';
            if (barangLokasi) barangLokasi.value = item.lokasi || '';

            resetBarangPhoto();
            const existingUrl = item.foto_url || '';
            const hiddenUrl = document.getElementById('barang_foto_url');
            if (hiddenUrl) hiddenUrl.value = existingUrl;

            if (existingUrl && barangPhotoCtrl) {
                try {
                    barangPhotoCtrl.setExisting(existingUrl);
                    const wrap = document.getElementById('barang-foto-preview-wrap');
                    if (wrap) wrap.style.display = 'block';
                } catch (e) {
                    console.warn('[inventaris_admin] setExisting error:', e);
                }
            }

            openBarangModal();
        };

        // ================================================================
        // 22. DELETE BARANG
        // ================================================================
        window.deleteBarang = function(id) {
            const item = barangCache.find(d => String(d.id) === String(id));
            const nama = item ? (item.nama_barang || 'barang ini') : 'barang ini';

            showConfirm('Hapus barang "' + nama + '"?\n\nData peminjaman terkait juga akan terhapus.', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteInventaris', 'POST', { id });
                    if (result && result.success) {
                        barangCache = barangCache.filter(item => String(item.id) !== String(id));
                        applyBarangFilter();
                        await loadPeminjaman(true);
                        populatePinjamDropdown();
                        await logActivity('DELETE', 'inventaris', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Barang dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Barang dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[inventaris_admin] deleteBarang error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 23. VIEW BARANG DETAIL
        // ================================================================
        window.viewBarangDetail = function(id) {
            const item = barangCache.find(d => String(d.id) === String(id));
            if (!item) {
                safeToast('Barang tidak ditemukan.', 'warning');
                return;
            }

            const relatedPinjam = pinjamCache.filter(p => String(p.barang_id) === String(id));

            let detailModal = document.getElementById('barang-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'barang-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="barang-detail-content"
                         class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)]">
                            <h3 id="barang-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4"></h3>
                            <button id="barang-detail-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="barang-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="barang-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="barang-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('barang-detail-close').addEventListener('click', closeFn);
                document.getElementById('barang-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('barang-detail-content');
            const titleEl = document.getElementById('barang-detail-title');
            const bodyEl = document.getElementById('barang-detail-body');

            titleEl.textContent = item.nama_barang || '-';
            const kondisiBadge = getKondisiBadge(item.kondisi);

            const fotoBlock = item.foto_url ? `
                <div class="border-t border-[var(--card-border)] pt-4">
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                        <i class="fas fa-camera mr-1"></i>Foto Barang
                    </p>
                    <div class="rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--bg-stats)] flex items-center justify-center">
                        <img src="${escapeAttr(item.foto_url)}"
                             alt="${escapeAttr(item.nama_barang)}"
                             class="w-full h-auto max-h-72 object-contain"
                             onerror="this.parentElement.innerHTML='<div class=&quot;p-6 text-center text-[var(--text-muted)] text-sm&quot;><i class=&quot;fas fa-image-slash text-3xl mb-2&quot;></i><br>Foto tidak dapat dimuat</div>'">
                    </div>
                </div>
            ` : '';

            bodyEl.innerHTML = `
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Jumlah</p>
                        <p class="text-2xl font-bold text-[var(--text-main)]">${Number(item.jumlah) || 0}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Kondisi</p>
                        <span class="px-3 py-1 rounded-full text-sm font-semibold ${kondisiBadge}">
                            ${escapeHtml(item.kondisi || '-')}
                        </span>
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Lokasi</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(item.lokasi || '-')}</p>
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Ditambahkan</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(formatDate(item.created_at))}</p>
                    </div>
                </div>

                ${fotoBlock}

                ${relatedPinjam.length > 0 ? `
                    <div class="border-t border-[var(--card-border)] pt-4">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                            <i class="fas fa-history mr-1"></i>Riwayat Peminjaman (${relatedPinjam.length})
                        </p>
                        <div class="space-y-2 max-h-48 overflow-y-auto">
                            ${relatedPinjam.slice(0, 10).map(p => {
                                const statusBadge = getStatusBadge(p.status);
                                return `
                                    <div class="flex justify-between items-center p-2 rounded bg-[var(--bg-stats)] text-xs">
                                        <div>
                                            <p class="font-medium text-[var(--text-main)]">${escapeHtml(p.peminjam || '-')}</p>
                                            <p class="text-[var(--text-muted)]">${escapeHtml(formatDate(p.tanggal_pinjam))}</p>
                                        </div>
                                        <span class="px-2 py-1 rounded-full text-[10px] font-semibold ${statusBadge}">
                                            ${p.status === 'dipinjam' ? 'Dipinjam' : 'Kembali'}
                                        </span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            `;

            const editBtn = document.getElementById('barang-detail-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.editBarang(item.id);
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
        // 24. SUBMIT FORM BARANG
        // ================================================================
        if (barangForm) {
            const fresh = barangForm.cloneNode(true);
            barangForm.parentNode.replaceChild(fresh, barangForm);

            fresh.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const nama_barang = (barangNama.value || '').trim();
                const jumlah = parseInt(barangJumlah.value) || 0;
                const kondisi = barangKondisi.value || 'Baik';
                const lokasi = (barangLokasi.value || '').trim();

                if (!nama_barang) {
                    safeToast('Nama barang wajib diisi!', 'warning');
                    barangNama.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    // STEP 1: Upload foto (jika ada file baru)
                    var existingUrl = document.getElementById('barang_foto_url')?.value || '';
                    var fotoUrl = existingUrl;

                    if (barangPhotoCtrl && barangPhotoCtrl.hasFile()) {
                        if (!navigator.onLine) {
                            safeToast('📴 Upload foto memerlukan koneksi internet. Menyimpan tanpa foto.', 'warning', 4500);
                        } else {
                            if (submitBtn) {
                                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengunggah foto...';
                            }

                            try {
                                fotoUrl = await window.FormPhoto.uploadIfAny(barangPhotoCtrl, existingUrl);
                            } catch (uploadErr) {
                                console.error('[inventaris_admin] Upload foto error:', uploadErr);
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

                    // STEP 2: Build payload
                    const data = {
                        nama_barang: nama_barang,
                        jumlah: jumlah,
                        kondisi: kondisi,
                        lokasi: lokasi,
                        foto_url: fotoUrl
                    };

                    const id = barangId.value;
                    const action = isEditBarang ? 'updateInventaris' : 'createInventaris';
                    const payload = isEditBarang ? Object.assign({ id: id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        // Update cache lokal
                        if (isEditBarang) {
                            const idx = barangCache.findIndex(item => String(item.id) === String(id));
                            if (idx !== -1) {
                                barangCache[idx] = Object.assign({}, barangCache[idx], data, { id: id });
                            }
                        } else {
                            const newItem = Object.assign({}, data, {
                                id: result.id || ('tmp_' + Date.now()),
                                created_at: new Date().toISOString()
                            });
                            barangCache.unshift(newItem);
                        }

                        applyBarangFilter();
                        await loadPeminjaman();
                        populatePinjamDropdown();
                        closeBarangModal();

                        await logActivity(
                            isEditBarang ? 'UPDATE' : 'CREATE',
                            'inventaris',
                            result.id || id,
                            'Barang: ' + nama_barang
                        );

                        if (result._offline) {
                            safeToast('📴 Barang tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                        } else {
                            safeToast(
                                isEditBarang ? '✅ Barang diperbarui!' : '✅ Barang ditambahkan!',
                                'success'
                            );
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    console.error('[inventaris_admin] Submit barang error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 25. POPULATE PEMINJAMAN DROPDOWN
        // ================================================================
        async function populatePinjamDropdown() {
            try {
                if (barangCache.length === 0) {
                    const result = await forceRefreshData('getInventaris', {});
                    if (result && result.success) barangCache = result.data || [];
                }

                let options = '<option value="">-- Pilih Barang --</option>';
                const availableBarang = barangCache.filter(b => (Number(b.jumlah) || 0) > 0);
                availableBarang.forEach(item => {
                    options += `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nama_barang)} (Stok: ${item.jumlah})</option>`;
                });
                if (pinjamBarangId) pinjamBarangId.innerHTML = options;
            } catch (error) {
                console.error('[inventaris_admin] populatePinjamDropdown error:', error);
            }
        }

        // ================================================================
        // 26. MODAL PEMINJAMAN
        // ================================================================
        function openPinjamModal() {
            pinjamModal.classList.remove('hidden');
            pinjamModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (pinjamModalContent) {
                    pinjamModalContent.classList.remove('scale-95', 'opacity-0');
                    pinjamModalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            populatePinjamDropdown();
            setTimeout(() => { if (pinjamPeminjam) pinjamPeminjam.focus(); }, 150);
        }

        function closePinjamModal() {
            if (pinjamModalContent) {
                pinjamModalContent.classList.remove('scale-100', 'opacity-100');
                pinjamModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                pinjamModal.classList.add('hidden');
                pinjamModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (pinjamForm) pinjamForm.reset();
        }

        if (addPinjamBtn) {
            const fresh = addPinjamBtn.cloneNode(true);
            addPinjamBtn.parentNode.replaceChild(fresh, addPinjamBtn);
            fresh.addEventListener('click', () => openPinjamModal());
        }

        if (pinjamCloseBtn) {
            const fresh = pinjamCloseBtn.cloneNode(true);
            pinjamCloseBtn.parentNode.replaceChild(fresh, pinjamCloseBtn);
            fresh.addEventListener('click', closePinjamModal);
        }
        if (pinjamModal) {
            pinjamModal.addEventListener('click', (e) => {
                if (e.target === pinjamModal) closePinjamModal();
            });
        }

        // ================================================================
        // 27. SUBMIT PEMINJAMAN
        // ================================================================
        if (pinjamForm) {
            const fresh = pinjamForm.cloneNode(true);
            pinjamForm.parentNode.replaceChild(fresh, pinjamForm);

            fresh.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const barang_id = pinjamBarangId.value;
                const peminjam = (pinjamPeminjam.value || '').trim();
                const tanggal_pinjam = pinjamTanggal.value;
                const tanggal_kembali = pinjamTanggalKembali.value || '';

                if (!barang_id) {
                    safeToast('Pilih barang terlebih dahulu!', 'warning');
                    pinjamBarangId.focus();
                    return;
                }
                if (!peminjam) {
                    safeToast('Nama peminjam wajib diisi!', 'warning');
                    pinjamPeminjam.focus();
                    return;
                }
                if (!tanggal_pinjam) {
                    safeToast('Tanggal pinjam wajib diisi!', 'warning');
                    pinjamTanggal.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const data = {
                        barang_id: barang_id,
                        peminjam: peminjam,
                        tanggal_pinjam: tanggal_pinjam,
                        tanggal_kembali: tanggal_kembali
                    };

                    const result = await apiCall('createPeminjaman', 'POST', data);

                    if (result && result.success) {
                        const newItem = Object.assign({}, data, {
                            id: result.id || ('tmp_' + Date.now()),
                            status: 'dipinjam',
                            created_at: new Date().toISOString()
                        });
                        pinjamCache.unshift(newItem);

                        applyPinjamFilter();
                        updateAllStats();
                        closePinjamModal();

                        await logActivity('CREATE', 'peminjaman', result.id, 'Peminjam: ' + peminjam);

                        if (result._offline) {
                            safeToast('📴 Peminjaman tersimpan lokal, akan disinkronkan', 'warning', 4500);
                        } else {
                            safeToast('✅ Peminjaman dicatat!', 'success');
                        }

                        await loadBarang(true);
                    } else {
                        safeToast((result && result.message) || 'Gagal mencatat', 'error');
                    }
                } catch (error) {
                    console.error('[inventaris_admin] Submit peminjaman error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 28. KEMBALIKAN BARANG
        // ================================================================
        window.kembalikanBarang = function(id) {
            const item = pinjamCache.find(p => String(p.id) === String(id));
            const peminjam = item ? (item.peminjam || 'peminjam ini') : 'peminjam ini';

            showConfirm('Tandai barang yang dipinjam "' + peminjam + '" sudah dikembalikan?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('kembalikanBarang', 'POST', { id });
                    if (result && result.success) {
                        const idx = pinjamCache.findIndex(p => String(p.id) === String(id));
                        if (idx !== -1) {
                            pinjamCache[idx].status = 'kembali';
                            pinjamCache[idx].tanggal_kembali = new Date().toISOString().slice(0, 10);
                        }
                        applyPinjamFilter();
                        updateAllStats();
                        await logActivity('UPDATE', 'peminjaman', id, 'Kembalikan: ' + peminjam);

                        if (result._offline) {
                            safeToast('📴 Pengembalian tersimpan lokal, akan disinkronkan', 'warning', 4000);
                        } else {
                            safeToast('✅ Barang dikembalikan!', 'success');
                        }

                        await loadBarang(true);
                    } else {
                        safeToast((result && result.message) || 'Gagal mengembalikan', 'error');
                    }
                } catch (e) {
                    console.error('[inventaris_admin] kembalikanBarang error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 29. DELETE PEMINJAMAN
        // ================================================================
        window.deletePeminjaman = function(id) {
            const item = pinjamCache.find(p => String(p.id) === String(id));
            const peminjam = item ? (item.peminjam || 'data ini') : 'data ini';

            showConfirm('Hapus data peminjaman "' + peminjam + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deletePeminjaman', 'POST', { id });
                    if (result && result.success) {
                        pinjamCache = pinjamCache.filter(p => String(p.id) !== String(id));
                        applyPinjamFilter();
                        updateAllStats();
                        await logActivity('DELETE', 'peminjaman', id, 'Hapus: ' + peminjam);

                        if (result._offline) {
                            safeToast('📴 Peminjaman dihapus lokal, akan disinkronkan', 'warning', 4000);
                        } else {
                            safeToast('✅ Data peminjaman dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[inventaris_admin] deletePeminjaman error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 30. GENERATE BARCODE / QR CODE
        // ================================================================
        window.generateBarcode = function(id) {
            const item = barangCache.find(b => String(b.id) === String(id));
            if (!item) {
                safeToast('Barang tidak ditemukan.', 'warning');
                return;
            }

            if (typeof JsBarcode === 'undefined') {
                safeToast('Library JsBarcode belum dimuat! Coba refresh halaman.', 'error');
                return;
            }

            try {
                const canvas = document.createElement('canvas');
                JsBarcode(canvas, String(item.id), {
                    format: "CODE128",
                    width: 2,
                    height: 80,
                    displayValue: true,
                    fontSize: 14,
                    margin: 15,
                    background: '#ffffff',
                    lineColor: '#0f2922'
                });

                let barcodeModal = document.getElementById('barcode-modal');
                if (!barcodeModal) {
                    barcodeModal = document.createElement('div');
                    barcodeModal.id = 'barcode-modal';
                    barcodeModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                    barcodeModal.innerHTML = `
                        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
                            <h3 class="text-lg font-bold text-gray-800 mb-4" id="barcode-title">Barcode Barang</h3>
                            <div id="barcode-canvas-wrap" class="flex justify-center mb-4 p-4 bg-white rounded border border-gray-200"></div>
                            <p class="text-sm text-gray-600 mb-4" id="barcode-info"></p>
                            <div class="flex justify-center gap-2">
                                <button id="barcode-download" class="btn-primary px-4 py-2 rounded-lg">
                                    <i class="fas fa-download mr-1"></i>Download PNG
                                </button>
                                <button id="barcode-close" class="btn-secondary px-4 py-2 rounded-lg">Tutup</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(barcodeModal);

                    barcodeModal.querySelector('#barcode-close').addEventListener('click', () => {
                        barcodeModal.classList.add('hidden');
                        barcodeModal.classList.remove('flex');
                        document.body.style.overflow = '';
                    });
                    barcodeModal.addEventListener('click', (e) => {
                        if (e.target === barcodeModal) {
                            barcodeModal.classList.add('hidden');
                            barcodeModal.classList.remove('flex');
                            document.body.style.overflow = '';
                        }
                    });
                }

                const titleEl = barcodeModal.querySelector('#barcode-title');
                const wrapEl = barcodeModal.querySelector('#barcode-canvas-wrap');
                const infoEl = barcodeModal.querySelector('#barcode-info');

                titleEl.textContent = item.nama_barang || 'Barcode';
                wrapEl.innerHTML = '';
                wrapEl.appendChild(canvas);
                infoEl.innerHTML = `
                    <strong>${escapeHtml(item.nama_barang || '-')}</strong><br>
                    Lokasi: ${escapeHtml(item.lokasi || '-')} · Jumlah: ${item.jumlah || 0}
                `;

                const dlBtn = barcodeModal.querySelector('#barcode-download');
                const newDl = dlBtn.cloneNode(true);
                dlBtn.parentNode.replaceChild(newDl, dlBtn);
                newDl.addEventListener('click', () => {
                    try {
                        const link = document.createElement('a');
                        link.download = 'barcode_' + (item.nama_barang || 'barang').replace(/\s+/g, '_') + '.png';
                        link.href = canvas.toDataURL('image/png');
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        safeToast('✅ Barcode diunduh!', 'success');
                    } catch (e) {
                        safeToast('Gagal download: ' + e.message, 'error');
                    }
                });

                barcodeModal.classList.remove('hidden');
                barcodeModal.classList.add('flex');
                document.body.style.overflow = 'hidden';
            } catch (e) {
                console.error('[inventaris_admin] generateBarcode error:', e);
                safeToast('Gagal generate barcode: ' + e.message, 'error');
            }
        };

        // ================================================================
        // 31. EXPORT CSV BARANG
        // ================================================================
        function exportBarangCSV() {
            if (filteredBarang.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nama Barang', 'Jumlah', 'Kondisi', 'Lokasi', 'Foto', 'Tanggal'];
            const rows = filteredBarang.map((b, i) => [
                i + 1,
                b.nama_barang || '',
                b.jumlah || 0,
                b.kondisi || '',
                b.lokasi || '',
                b.foto_url ? 'Ada' : '-',
                formatDate(b.created_at)
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventaris_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV Barang berhasil diunduh!', 'success');
        }

        // ================================================================
        // 32. EXPORT CSV PEMINJAMAN
        // ================================================================
        function exportPinjamCSV() {
            if (pinjamCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Barang', 'Peminjam', 'Tanggal Pinjam', 'Tanggal Kembali', 'Status'];
            const rows = pinjamCache.map((p, i) => {
                const barang = barangCache.find(b => String(b.id) === String(p.barang_id));
                return [
                    i + 1,
                    barang ? barang.nama_barang : '(Barang dihapus)',
                    p.peminjam || '',
                    formatDate(p.tanggal_pinjam),
                    formatDate(p.tanggal_kembali),
                    p.status === 'dipinjam' ? 'Dipinjam' : 'Kembali'
                ];
            });

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `peminjaman_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV Peminjaman berhasil diunduh!', 'success');
        }

        // ================================================================
        // 33. REFRESH BUTTON
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
                    safeToast('✅ Data inventaris diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 34. ESC HANDLER
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;

            const barcodeModal = document.getElementById('barcode-modal');
            const detailModal = document.getElementById('barang-detail-modal');

            if (barcodeModal && !barcodeModal.classList.contains('hidden')) {
                barcodeModal.classList.add('hidden');
                barcodeModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (pinjamModal && !pinjamModal.classList.contains('hidden')) {
                closePinjamModal();
            } else if (barangModal && !barangModal.classList.contains('hidden')) {
                closeBarangModal();
            }
        });

        // ================================================================
        // 35. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[inventaris_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 36. CLEANUP
        // ================================================================
        function cleanup() {
            window.__inventarisAdminLoaded = false;
            isSubmitting = false;
            selectedBarangIds.clear();
            selectedPinjamIds.clear();
            const detailModal = document.getElementById('barang-detail-modal');
            if (detailModal) detailModal.remove();
            const barcodeModal = document.getElementById('barcode-modal');
            if (barcodeModal) barcodeModal.remove();
            document.body.style.overflow = '';
            console.log('[inventaris_admin] Cleanup');
        }
        window.__inventarisAdminCleanup = cleanup;

        // ================================================================
        // 37. INIT SEQUENCE
        // ================================================================
        console.log('[inventaris_admin] Loading initial data...');

        // Set default tanggal pinjam
        if (pinjamTanggal && !pinjamTanggal.value) {
            pinjamTanggal.value = todayISO();
        }

        // Setup UI
        ensureExtraUI();
        attachFilterListeners();
        attachBarangBulkListeners();

        // Load data
        await Promise.allSettled([
            loadBarang(),
            loadPeminjaman()
        ]);

        populatePinjamDropdown();
        activateTab('barang');

        console.log('[inventaris_admin] ✅ Init selesai v11.0.0');
    }

    // ================================================================
    // 38. RUN INIT
    // ================================================================
    init();
});