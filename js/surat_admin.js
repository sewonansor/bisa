/**
 * js/surat_admin.js
 * Modul Admin Surat — v9.0.0 OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v9.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Stats 4 kartu (total, internal, eksternal, bulan ini)
 *   ✅ NEW: Search + Filter jenis + Filter tanggal
 *   ✅ NEW: Detail modal surat (preview lengkap)
 *   ✅ NEW: Copy nomor surat & isi surat
 *   ✅ NEW: Bulk delete dengan konfirmasi
 *   ✅ NEW: Export CSV dengan filter aktif
 *   ✅ NEW: Sort (terbaru, terlama, nomor)
 *   ✅ NEW: Upload lampiran skip saat offline (warning)
 *   ✅ FIX: Semua handler idempotent (no double bind)
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit via isSubmitting
 *   ✅ FIX: XSS protection di semua output
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 *   ✅ PRESERVED: Semua fitur v8.0.0
 * ---------------------------------------------------------
 */

App.register('surat_admin', function() {
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
    if (window.__suratAdminLoaded) {
        console.log('[surat_admin] Sudah di-init, skip.');
        return;
    }
    window.__suratAdminLoaded = true;

    console.log('[surat_admin] 🚀 Init v9.0.0 (Offline-First Full Fix)');

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

    function formatDateLong(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function getJenisFromNomor(nomor) {
        if (!nomor) return 'internal';
        return String(nomor).includes('SR-02') ? 'eksternal' : 'internal';
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
            console.log('[surat_admin:' + (type || 'info') + ']', msg);
        }
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let isEdit = false;
    let dataCache = [];
    let filteredCache = [];
    let currentFilter = {
        search: '',
        jenis: 'all',
        dateFrom: '',
        dateTo: '',
        sort: 'terbaru'
    };
    let isSubmitting = false;
    let selectedIds = new Set();

    // ================================================================
    // 6. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        console.log('[surat_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getSurat_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadSurat(true).then(() => {
            console.log('[surat_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 7. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'surat-table-body',
            'surat-modal', 'modal-content', 'modal-title',
            'surat-form', 'modal-close',
            'add-surat-btn', 'refresh-surat-btn',
            'surat-id', 'nomor_surat', 'perihal', 'tanggal', 'pengirim',
            'penerima', 'isi', 'lampiran', 'surat_file', 'jenis_surat'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody      = els['surat-table-body'];
        const modal          = els['surat-modal'];
        const modalContent   = els['modal-content'];
        const modalTitle     = els['modal-title'];
        const form           = els['surat-form'];
        const closeBtn       = els['modal-close'];
        const addBtn         = els['add-surat-btn'];
        const refreshBtn     = els['refresh-surat-btn'];
        const idInput        = els['surat-id'];
        const nomorInput     = els['nomor_surat'];
        const perihalInput   = els['perihal'];
        const tanggalInput   = els['tanggal'];
        const pengirimInput  = els['pengirim'];
        const penerimaInput  = els['penerima'];
        const isiInput       = els['isi'];
        const lampiranInput  = els['lampiran'];
        const fileInput      = els['surat_file'];
        const jenisSelect    = els['jenis_surat'];

        if (!tableBody || !modal || !form) {
            console.error('[surat_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 8. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('surat-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'surat-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Surat</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-surat">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-file-alt"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Internal</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-internal-surat">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-share-alt"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Eksternal</p>
                                <p class="text-2xl font-bold text-pink-600 mt-1" id="stats-eksternal-surat">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center text-white">
                                <i class="fas fa-envelope"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-bulan-surat">0</p>
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
            if (!document.getElementById('surat-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'surat-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="surat-search" placeholder="Cari nomor, perihal, pengirim..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="surat-filter-jenis" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Jenis</option>
                        <option value="internal">Internal (SR-01)</option>
                        <option value="eksternal">Eksternal (SR-02)</option>
                    </select>
                    <input type="date" id="surat-date-from" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm" title="Dari tanggal">
                    <input type="date" id="surat-date-to" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm" title="Sampai tanggal">
                    <select id="surat-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="terbaru">Terbaru</option>
                        <option value="terlama">Terlama</option>
                        <option value="nomor-asc">Nomor A-Z</option>
                    </select>
                    <button id="surat-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                    <button id="surat-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('surat-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'surat-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-surat">0</span> surat dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-surat-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-surat-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('surat-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 9. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('surat-search');
            const filterJenis = document.getElementById('surat-filter-jenis');
            const dateFrom = document.getElementById('surat-date-from');
            const dateTo = document.getElementById('surat-date-to');
            const sortSelect = document.getElementById('surat-sort');
            const exportBtn = document.getElementById('surat-export-btn');
            const clearBtn = document.getElementById('surat-clear-filter');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'surat-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (filterJenis && !filterJenis.dataset.attached) {
                filterJenis.dataset.attached = 'true';
                filterJenis.addEventListener('change', () => {
                    currentFilter.jenis = filterJenis.value;
                    applyFilter();
                });
            }

            if (dateFrom && !dateFrom.dataset.attached) {
                dateFrom.dataset.attached = 'true';
                dateFrom.addEventListener('change', () => {
                    currentFilter.dateFrom = dateFrom.value;
                    applyFilter();
                });
            }

            if (dateTo && !dateTo.dataset.attached) {
                dateTo.dataset.attached = 'true';
                dateTo.addEventListener('change', () => {
                    currentFilter.dateTo = dateTo.value;
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
                    currentFilter = {
                        search: '', jenis: 'all',
                        dateFrom: '', dateTo: '', sort: 'terbaru'
                    };
                    if (searchInput) searchInput.value = '';
                    if (filterJenis) filterJenis.value = 'all';
                    if (dateFrom) dateFrom.value = '';
                    if (dateTo) dateTo.value = '';
                    if (sortSelect) sortSelect.value = 'terbaru';
                    applyFilter();
                    safeToast('Filter direset.', 'info', 2000);
                });
            }

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportCSV);
            }
        }

        // ================================================================
        // 10. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(item => {
                if (currentFilter.jenis !== 'all') {
                    const jenis = getJenisFromNomor(item.nomor_surat);
                    if (jenis !== currentFilter.jenis) return false;
                }

                if (currentFilter.dateFrom || currentFilter.dateTo) {
                    const d = new Date(item.tanggal);
                    if (isNaN(d.getTime())) return false;
                    if (currentFilter.dateFrom) {
                        const from = new Date(currentFilter.dateFrom);
                        from.setHours(0, 0, 0, 0);
                        if (d < from) return false;
                    }
                    if (currentFilter.dateTo) {
                        const to = new Date(currentFilter.dateTo);
                        to.setHours(23, 59, 59, 999);
                        if (d > to) return false;
                    }
                }

                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [item.nomor_surat, item.perihal, item.pengirim, item.penerima, item.isi]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            switch (currentFilter.sort) {
                case 'terbaru':
                    filteredCache.sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));
                    break;
                case 'terlama':
                    filteredCache.sort((a, b) => new Date(a.tanggal || 0) - new Date(b.tanggal || 0));
                    break;
                case 'nomor-asc':
                    filteredCache.sort((a, b) =>
                        String(a.nomor_surat || '').localeCompare(String(b.nomor_surat || '')));
                    break;
            }

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 11. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const internal = dataCache.filter(s => getJenisFromNomor(s.nomor_surat) === 'internal').length;
            const eksternal = total - internal;

            const now = new Date();
            const bulanIni = dataCache.filter(s => {
                const d = new Date(s.tanggal);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const el1 = document.getElementById('stats-total-surat');
            const el2 = document.getElementById('stats-internal-surat');
            const el3 = document.getElementById('stats-eksternal-surat');
            const el4 = document.getElementById('stats-bulan-surat');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = internal;
            if (el3) el3.textContent = eksternal;
            if (el4) el4.textContent = bulanIni;
        }

        // ================================================================
        // 12. LOAD DATA (SWR)
        // ================================================================
        async function loadSurat(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data surat...</p></td></tr>';

            try {
                const result = await forceRefreshData('getSurat', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    renderTable([]);
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[surat_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getSurat', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[surat_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 13. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.jenis !== 'all' ||
                                   currentFilter.dateFrom || currentFilter.dateTo;
                tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-file-alt text-3xl mb-2 opacity-40"></i><p>Belum ada surat</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((item, idx) => {
                const jenis = getJenisFromNomor(item.nomor_surat);
                const isSelected = selectedIds.has(item.id);
                const pending = isPendingSync(item.id);

                const jenisBadge = jenis === 'internal'
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Internal</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Eksternal</span>';

                const lampiranIcon = item.lampiran
                    ? `<a href="${escapeAttr(item.lampiran)}" target="_blank" rel="noopener"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400" title="Lihat lampiran">
                          <i class="fas fa-paperclip"></i></a>`
                    : '<span class="text-[var(--text-muted)]">-</span>';

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="surat-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-sm">
                            <div class="flex items-center gap-1.5">
                                <button onclick="viewDetail('${escapeAttr(item.id)}')" class="font-mono text-xs text-[var(--text-main)] hover:text-blue-600">
                                    ${escapeHtml(item.nomor_surat || '-')}
                                </button>
                                ${item.nomor_surat ? `
                                    <button onclick="copyNomor('${escapeAttr(item.nomor_surat)}')"
                                        class="text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                        title="Copy nomor">
                                        <i class="fas fa-copy text-xs"></i>
                                    </button>` : ''}
                            </div>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 text-left block">
                                ${escapeHtml(item.perihal || '-')}
                            </button>
                            <div class="mt-1">${jenisBadge}</div>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">${formatDate(item.tanggal)}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.pengirim || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.penerima || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.created_by || '-')}</td>
                        <td class="px-3 py-3 text-sm text-center">${lampiranIcon}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="previewSurat('${escapeAttr(item.id)}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Preview & Cetak">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editSurat('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteSurat('${escapeAttr(item.id)}')"
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

        function updateThead() {
            const thead = tableBody.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-surat')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-surat w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-surat');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.surat-checkbox').forEach(cb => {
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
            document.querySelectorAll('.surat-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('surat-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-surat');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 14. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-surat-btn');
            const cancelBtn = document.getElementById('bulk-cancel-surat-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} surat? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteSurat', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(s => String(s.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.surat-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-surat');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} surat berhasil dihapus!` +
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
                    document.querySelectorAll('.surat-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-surat');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 15. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(s => String(s.id) === String(id));
            if (!item) {
                safeToast('Surat tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('surat-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'surat-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="surat-detail-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)] z-10">
                            <h3 id="surat-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4 line-clamp-2"></h3>
                            <button id="surat-detail-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="surat-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="surat-detail-preview" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-print mr-1"></i>Preview
                            </button>
                            <button id="surat-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="surat-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('surat-detail-close').addEventListener('click', closeFn);
                document.getElementById('surat-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('surat-detail-content');
            const titleEl = document.getElementById('surat-detail-title');
            const bodyEl = document.getElementById('surat-detail-body');
            const jenis = getJenisFromNomor(item.nomor_surat);

            titleEl.textContent = item.perihal || '-';

            const jenisBadge = jenis === 'internal'
                ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Internal</span>'
                : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Eksternal</span>';

            bodyEl.innerHTML = `
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Nomor Surat</p>
                        <div class="flex items-center gap-1">
                            <p class="font-mono text-sm text-[var(--text-main)]">${escapeHtml(item.nomor_surat || '-')}</p>
                            ${item.nomor_surat ? `
                                <button onclick="copyNomor('${escapeAttr(item.nomor_surat)}')"
                                    class="text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                    title="Copy">
                                    <i class="fas fa-copy text-xs"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Jenis</p>
                        ${jenisBadge}
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal</p>
                        <p class="text-sm text-[var(--text-main)]">${formatDateLong(item.tanggal)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Dibuat Oleh</p>
                        <p class="text-sm text-[var(--text-main)]">${escapeHtml(item.created_by || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Pengirim</p>
                        <p class="text-sm text-[var(--text-main)]">${escapeHtml(item.pengirim || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Penerima</p>
                        <p class="text-sm text-[var(--text-main)]">${escapeHtml(item.penerima || '-')}</p>
                    </div>
                    ${item.lampiran ? `
                        <div class="col-span-2">
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Lampiran</p>
                            <a href="${escapeAttr(item.lampiran)}" target="_blank" rel="noopener"
                                class="text-blue-600 hover:underline text-sm break-all">
                                <i class="fas fa-paperclip mr-1"></i>${escapeHtml(item.lampiran)}
                            </a>
                        </div>
                    ` : ''}
                </div>

                <div class="border-t border-[var(--card-border)] pt-4">
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">Isi Surat</p>
                    <div class="bg-[var(--bg-stats)] rounded-lg p-4 max-h-96 overflow-y-auto">
                        <div class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">
                            ${escapeHtml(item.isi || 'Tidak ada isi surat.')}
                        </div>
                    </div>
                </div>
            `;

            const editBtn = document.getElementById('surat-detail-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.editSurat(item.id);
                });
            }

            const previewBtn = document.getElementById('surat-detail-preview');
            if (previewBtn) {
                const newPrev = previewBtn.cloneNode(true);
                previewBtn.parentNode.replaceChild(newPrev, previewBtn);
                newPrev.addEventListener('click', () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.previewSurat(item.id);
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
        // 16. COPY NOMOR
        // ================================================================
        window.copyNomor = function(nomor) {
            if (!nomor) return;
            copyToClipboard(nomor)
                .then(() => safeToast('Nomor dicopy: ' + nomor, 'success', 2500))
                .catch(() => safeToast('Gagal copy', 'error'));
        };

        // ================================================================
        // 17. PREVIEW SURAT
        // ================================================================
        window.previewSurat = function(id) {
            if (!id) {
                safeToast('ID surat tidak ditemukan.', 'warning');
                return;
            }
            router.load('/surat_preview?id=' + encodeURIComponent(id));
        };

        // ================================================================
        // 18. MODAL FORM
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
            setTimeout(() => { if (perihalInput) perihalInput.focus(); }, 150);
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
            if (nomorInput) {
                nomorInput.value = 'Otomatis dibuat sistem';
                nomorInput.disabled = true;
            }
            if (fileInput) fileInput.value = '';
            isEdit = false;
        }

        if (closeBtn) {
            const fresh = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(fresh, closeBtn);
            fresh.addEventListener('click', closeModal);
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        // ESC handler
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            const detailModal = document.getElementById('surat-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 19. TAMBAH SURAT
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Surat';
                form.reset();
                if (idInput) idInput.value = '';
                if (nomorInput) {
                    nomorInput.value = 'Otomatis dibuat sistem';
                    nomorInput.disabled = true;
                }
                if (fileInput) fileInput.value = '';
                if (tanggalInput && !tanggalInput.value) {
                    tanggalInput.value = todayISO();
                }
                openModal();
            });
        }

        // ================================================================
        // 20. EDIT SURAT
        // ================================================================
        window.editSurat = function(id) {
            const surat = dataCache.find(s => String(s.id) === String(id));
            if (!surat) {
                safeToast('Surat tidak ditemukan.', 'warning');
                return;
            }
            fillEditForm(surat);
        };

        function fillEditForm(surat) {
            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Surat';
            if (idInput) idInput.value = surat.id || '';
            if (nomorInput) {
                nomorInput.value = surat.nomor_surat || '';
                nomorInput.disabled = true;
            }
            if (perihalInput) perihalInput.value = surat.perihal || '';

            if (tanggalInput) {
                const tgl = surat.tanggal ? new Date(surat.tanggal) : null;
                tanggalInput.value = (tgl && !isNaN(tgl.getTime()))
                    ? tgl.toISOString().slice(0, 10)
                    : '';
            }

            if (pengirimInput) pengirimInput.value = surat.pengirim || '';
            if (penerimaInput) penerimaInput.value = surat.penerima || '';
            if (isiInput) isiInput.value = surat.isi || '';
            if (lampiranInput) lampiranInput.value = surat.lampiran || '';
            if (fileInput) fileInput.value = '';
            if (jenisSelect) jenisSelect.value = getJenisFromNomor(surat.nomor_surat);

            openModal();
        }

        // ================================================================
        // 21. DELETE SURAT (Offline-aware)
        // ================================================================
        window.deleteSurat = function(id) {
            const surat = dataCache.find(s => String(s.id) === String(id));
            const nomor = surat ? (surat.nomor_surat || 'surat ini') : 'surat ini';

            showConfirm('Hapus surat "' + nomor + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteSurat', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(item => String(item.id) !== String(id));
                        applyFilter();
                        await logActivity('DELETE', 'surat', id, 'Hapus: ' + nomor);

                        if (result._offline) {
                            safeToast('📴 Surat dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Surat berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[surat_admin] deleteSurat error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 22. SUBMIT FORM (Offline-aware)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const perihal = (perihalInput.value || '').trim();
            const tanggal = tanggalInput.value;
            const pengirim = (pengirimInput.value || '').trim();
            const penerima = (penerimaInput.value || '').trim();
            const isi = (isiInput.value || '').trim();
            const lampiran = (lampiranInput.value || '').trim();
            const jenis_surat = jenisSelect.value || 'internal';

            if (!perihal) {
                safeToast('Perihal wajib diisi!', 'warning');
                perihalInput.focus();
                return;
            }
            if (!tanggal) {
                safeToast('Tanggal wajib diisi!', 'warning');
                tanggalInput.focus();
                return;
            }
            if (!pengirim) {
                safeToast('Pengirim wajib diisi!', 'warning');
                pengirimInput.focus();
                return;
            }
            if (!penerima) {
                safeToast('Penerima wajib diisi!', 'warning');
                penerimaInput.focus();
                return;
            }
            if (!isi) {
                safeToast('Isi surat wajib diisi!', 'warning');
                isiInput.focus();
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                const data = {
                    perihal: perihal,
                    tanggal: tanggal,
                    pengirim: pengirim,
                    penerima: penerima,
                    isi: isi,
                    lampiran: lampiran,
                    jenis_surat: jenis_surat,
                    created_by: user.id
                };

                const id = idInput.value;
                const action = isEdit ? 'updateSurat' : 'createSurat';
                const payload = isEdit ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    if (isEdit) {
                        const idx = dataCache.findIndex(s => String(s.id) === String(id));
                        if (idx !== -1) {
                            dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                        }
                    } else {
                        const newItem = Object.assign({}, data, {
                            id: result.id || ('tmp_' + Date.now()),
                            nomor_surat: result.nomor_surat || '(generating...)',
                            created_at: new Date().toISOString()
                        });
                        dataCache.unshift(newItem);

                        if (!result.nomor_surat && !result._offline) {
                            fetchDataBackground();
                        }
                    }

                    applyFilter();

                    if (fileInput && fileInput.files && fileInput.files.length > 0) {
                        if (!navigator.onLine) {
                            safeToast('📴 Upload lampiran memerlukan koneksi internet.', 'warning', 4500);
                        } else {
                            const targetId = isEdit ? id : result.id;
                            safeToast('Data tersimpan, mengunggah lampiran...', 'info', 3000);

                            uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                                if (uploadResult && uploadResult.success) {
                                    apiCall('updateSurat', 'POST', {
                                        id: targetId,
                                        lampiran: uploadResult.url
                                    }).then(() => {
                                        const idx = dataCache.findIndex(s => String(s.id) === String(targetId));
                                        if (idx !== -1) {
                                            dataCache[idx].lampiran = uploadResult.url;
                                            applyFilter();
                                        }
                                        safeToast('✅ Lampiran berhasil diunggah!', 'success');
                                    });
                                } else {
                                    safeToast('Gagal upload lampiran', 'error');
                                }
                            }).catch(err => {
                                safeToast('Gagal upload: ' + err.message, 'error');
                            });
                        }
                    }

                    closeModal();
                    form.reset();

                    await logActivity(
                        isEdit ? 'UPDATE' : 'CREATE',
                        'surat',
                        result.id || id,
                        'Surat: ' + perihal
                    );

                    if (result._offline) {
                        safeToast('📴 Surat tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(
                            isEdit ? '✅ Surat berhasil diperbarui!' : '✅ Surat berhasil disimpan!',
                            'success'
                        );
                    }
                } else {
                    safeToast((result && result.message) || 'Gagal menyimpan surat', 'error');
                }
            } catch (error) {
                console.error('[surat_admin] Submit error:', error);
                safeToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 23. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nomor Surat', 'Perihal', 'Jenis', 'Tanggal', 'Pengirim', 'Penerima', 'Lampiran'];
            const rows = filteredCache.map((s, i) => [
                i + 1,
                s.nomor_surat || '',
                s.perihal || '',
                getJenisFromNomor(s.nomor_surat),
                formatDate(s.tanggal),
                s.pengirim || '',
                s.penerima || '',
                s.lampiran ? 'Ada' : '-'
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `surat_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 24. REFRESH BUTTON
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
                    safeToast('✅ Data surat diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 25. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[surat_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 26. CLEANUP
        // ================================================================
        function cleanup() {
            window.__suratAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const detailModal = document.getElementById('surat-detail-modal');
            if (detailModal) detailModal.remove();
            document.body.style.overflow = '';
            console.log('[surat_admin] Cleanup');
        }
        window.__suratAdminCleanup = cleanup;

        // ================================================================
        // 27. INIT SEQUENCE
        // ================================================================
        console.log('[surat_admin] Loading initial data...');

        if (tanggalInput && !tanggalInput.value) {
            tanggalInput.value = todayISO();
        }

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        await loadSurat();

        console.log('[surat_admin] ✅ Init selesai v9.0.0');
    }

    // ================================================================
    // 28. RUN INIT
    // ================================================================
    init();
});