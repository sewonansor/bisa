/**
 * js/keuangan_admin.js
 * Modul Admin Keuangan — v10.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v10.0.0:
 *   ✅ NEW: Handle response _offline dari apiCall
 *   ✅ NEW: Optimistic UI saat offline
 *   ✅ NEW: Badge "Pending Sync" di tabel
 *   ✅ NEW: Auto-refresh saat sync complete
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe semua DOM element
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Upload nota skip saat offline
 *   ✅ FIX: Bulk delete handle offline
 *   ✅ FIX: Kategori manual toggle
 *   ✅ FIX: Safe toast fallback
 *   ✅ PRESERVED: Semua fitur v9.0.0
 * ============================================================
 */

App.register('keuangan_admin', function() {
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
    if (window.__keuanganAdminLoaded) {
        console.log('[keuangan_admin] Sudah di-init, skip.');
        return;
    }
    window.__keuanganAdminLoaded = true;

    console.log('[keuangan_admin] 🚀 Init v10.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. HELPER: WAIT FOR DOM
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 30;
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
    // 4. HELPERS
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

    function formatRupiah(n) {
        const num = Number(n) || 0;
        return 'Rp ' + num.toLocaleString('id-ID');
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[keuangan_admin:' + (type || 'info') + ']', msg);
        }
    }

    /**
     * ✅ NEW: Deteksi pending sync per id
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

    // ================================================================
    // 5. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        console.log('[keuangan_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getKeuangan_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadData(true).then(() => {
            console.log('[keuangan_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 6. INIT
    // ================================================================
    async function init() {
        const requiredIds = [
            'table-body', 'modal', 'modal-content', 'modal-title',
            'form', 'modal-close',
            'add-btn', 'refresh-keuangan-btn',
            'edit-id', 'tanggal', 'jenis', 'kategori', 'kategori_manual',
            'jumlah', 'keterangan', 'nota_file', 'nota_url',
            'total-pemasukan', 'total-pengeluaran', 'saldo-akhir',
            'filter-date', 'export-btn'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody = els['table-body'];
        const modal = els['modal'];
        const modalContent = els['modal-content'];
        const modalTitle = els['modal-title'];
        const form = els['form'];
        const closeBtn = els['modal-close'];
        const addBtn = els['add-btn'];
        const refreshBtn = els['refresh-keuangan-btn'];
        const editIdInput = els['edit-id'];
        const tanggalInput = els['tanggal'];
        const jenisSelect = els['jenis'];
        const kategoriSelect = els['kategori'];
        const kategoriManualInput = els['kategori_manual'];
        const jumlahInput = els['jumlah'];
        const keteranganInput = els['keterangan'];
        const notaFileInput = els['nota_file'];
        const notaUrlInput = els['nota_url'];
        const totalPemasukanEl = els['total-pemasukan'];
        const totalPengeluaranEl = els['total-pengeluaran'];
        const saldoAkhirEl = els['saldo-akhir'];
        const filterDate = els['filter-date'];
        const exportBtn = els['export-btn'];

        if (!tableBody || !modal || !form) {
            console.error('[keuangan_admin] ❌ Elemen utama tidak ditemukan.');
            return;
        }

        console.log('[keuangan_admin] ✅ Semua elemen ditemukan');

        // ================================================================
        // 7. STATE
        // ================================================================
        let isEdit = false;
        let isSubmitting = false;
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = {
            search: '',
            jenis: 'all',
            dateFrom: '',
            dateTo: ''
        };
        let selectedIds = new Set();

        // ================================================================
        // 8. TOGGLE KATEGORI MANUAL
        // ================================================================
        function toggleKategoriManual() {
            if (!kategoriSelect || !kategoriManualInput) return;
            if (kategoriSelect.value === 'Lainnya') {
                kategoriManualInput.classList.remove('hidden');
                kategoriManualInput.focus();
            } else {
                kategoriManualInput.classList.add('hidden');
                kategoriManualInput.value = '';
            }
        }

        if (kategoriSelect && !kategoriSelect.dataset.attached) {
            kategoriSelect.dataset.attached = 'true';
            kategoriSelect.addEventListener('change', toggleKategoriManual);
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
            if (!document.getElementById('keuangan-admin-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'keuangan-admin-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Pemasukan</p>
                                <p class="text-lg font-bold text-green-600 mt-1" id="stats-pemasukan-keu">Rp 0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-arrow-down"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Pengeluaran</p>
                                <p class="text-lg font-bold text-red-600 mt-1" id="stats-pengeluaran-keu">Rp 0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white">
                                <i class="fas fa-arrow-up"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Saldo</p>
                                <p class="text-lg font-bold text-blue-600 mt-1" id="stats-saldo-keu">Rp 0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-wallet"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Transaksi</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-tx-keu">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-receipt"></i>
                            </div>
                        </div>
                    </div>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search & Filter =====
            if (!document.getElementById('keuangan-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'keuangan-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="keuangan-search" placeholder="Cari kategori, keterangan..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="keuangan-filter-jenis" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Jenis</option>
                        <option value="Pemasukan">Pemasukan</option>
                        <option value="Pengeluaran">Pengeluaran</option>
                    </select>
                    <input type="date" id="keuangan-date-from" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm" title="Dari tanggal">
                    <input type="date" id="keuangan-date-to" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm" title="Sampai tanggal">
                    <button id="keuangan-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                const statsDiv = document.getElementById('keuangan-admin-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('keuangan-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'keuangan-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-keuangan">0</span> transaksi dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-keuangan-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-keuangan-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('keuangan-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 10. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('keuangan-search');
            const jenisFilter = document.getElementById('keuangan-filter-jenis');
            const dateFrom = document.getElementById('keuangan-date-from');
            const dateTo = document.getElementById('keuangan-date-to');
            const clearBtn = document.getElementById('keuangan-clear-filter');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'keuangan-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (jenisFilter && !jenisFilter.dataset.attached) {
                jenisFilter.dataset.attached = 'true';
                jenisFilter.addEventListener('change', () => {
                    currentFilter.jenis = jenisFilter.value;
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

            if (clearBtn && !clearBtn.dataset.attached) {
                clearBtn.dataset.attached = 'true';
                clearBtn.addEventListener('click', () => {
                    currentFilter = { search: '', jenis: 'all', dateFrom: '', dateTo: '' };
                    if (searchInput) searchInput.value = '';
                    if (jenisFilter) jenisFilter.value = 'all';
                    if (dateFrom) dateFrom.value = '';
                    if (dateTo) dateTo.value = '';
                    applyFilter();
                    safeToast('Filter direset.', 'info', 2000);
                });
            }
        }

        // ================================================================
        // 11. APPLY FILTER & SORT
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(t => {
                if (currentFilter.jenis !== 'all' && t.jenis !== currentFilter.jenis) return false;

                if (currentFilter.dateFrom || currentFilter.dateTo) {
                    const d = new Date(t.tanggal);
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
                    const haystack = [t.kategori, t.keterangan, t.jenis, String(t.jumlah || '')]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }

                return true;
            });

            filteredCache.sort((a, b) =>
                new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 12. UPDATE STATS
        // ================================================================
        function updateStats() {
            let totalMasuk = 0, totalKeluar = 0;
            filteredCache.forEach(t => {
                const j = Number(t.jumlah) || 0;
                if (t.jenis === 'Pemasukan') totalMasuk += j;
                else totalKeluar += j;
            });

            const saldo = totalMasuk - totalKeluar;

            const el1 = document.getElementById('stats-pemasukan-keu');
            const el2 = document.getElementById('stats-pengeluaran-keu');
            const el3 = document.getElementById('stats-saldo-keu');
            const el4 = document.getElementById('stats-tx-keu');

            if (el1) el1.textContent = formatRupiah(totalMasuk);
            if (el2) el2.textContent = formatRupiah(totalKeluar);
            if (el3) el3.textContent = formatRupiah(saldo);
            if (el4) el4.textContent = filteredCache.length;

            if (totalPemasukanEl) totalPemasukanEl.textContent = formatRupiah(totalMasuk);
            if (totalPengeluaranEl) totalPengeluaranEl.textContent = formatRupiah(totalKeluar);
            if (saldoAkhirEl) saldoAkhirEl.textContent = formatRupiah(saldo);
        }

        // ================================================================
        // 13. LOAD DATA (SWR)
        // ================================================================
        async function loadData(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';

            try {
                const result = await forceRefreshData('getKeuangan', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    renderTable([]);
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[keuangan_admin] loadData error:', error);
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getKeuangan', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[keuangan_admin] fetchDataBackground error:', e);
            }
        }

        // ================================================================
        // 14. RENDER TABLE — WITH PENDING SYNC BADGE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search ||
                                   currentFilter.jenis !== 'all' ||
                                   currentFilter.dateFrom ||
                                   currentFilter.dateTo;
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-receipt text-3xl mb-2 opacity-40"></i><p>Belum ada transaksi</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((item, idx) => {
                const jml = Number(item.jumlah) || 0;
                const isPemasukan = item.jenis === 'Pemasukan';
                const isSelected = selectedIds.has(item.id);
                const pending = isPendingSync(item.id);

                const notaHtml = item.nota_url
                    ? `<a href="${escapeAttr(item.nota_url)}" target="_blank" rel="noopener"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          title="Lihat nota">
                          <i class="fas fa-image"></i>
                       </a>`
                    : '<span class="text-[var(--text-muted)] text-xs">-</span>';

                const jenisBadge = isPemasukan
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><i class="fas fa-arrow-down mr-1"></i>Masuk</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"><i class="fas fa-arrow-up mr-1"></i>Keluar</span>';

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳ SYNC</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="keuangan-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">${escapeHtml(formatDate(item.tanggal))}</td>
                        <td class="px-3 py-3 text-sm">${jenisBadge}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.kategori || '-')}</td>
                        <td class="px-3 py-3 text-sm font-bold whitespace-nowrap ${isPemasukan ? 'text-green-600' : 'text-red-600'}">
                            ${formatRupiah(jml)}
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] max-w-[200px] truncate" title="${escapeAttr(item.keterangan || '')}">
                            ${escapeHtml(item.keterangan || '-')}
                        </td>
                        <td class="px-3 py-3 text-center">${notaHtml}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
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

        function updateThead() {
            const thead = tableBody.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-keuangan')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-keuangan w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-keuangan');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.keuangan-checkbox').forEach(cb => {
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
            document.querySelectorAll('.keuangan-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('keuangan-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-keuangan');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 15. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-keuangan-btn');
            const cancelBtn = document.getElementById('bulk-cancel-keuangan-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} transaksi? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteKeuangan', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(t => String(t.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.keuangan-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-keuangan');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} transaksi berhasil dihapus!` +
                                (offline > 0 ? ' (' + offline + ' pending sync)' : ''),
                                'success');
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
                    document.querySelectorAll('.keuangan-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-keuangan');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 16. MODAL FUNCTIONS
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
            setTimeout(() => {
                if (tanggalInput) tanggalInput.focus();
            }, 150);
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
            if (editIdInput) editIdInput.value = '';
            if (notaFileInput) notaFileInput.value = '';
            if (notaUrlInput) notaUrlInput.value = '';
            if (kategoriManualInput) {
                kategoriManualInput.classList.add('hidden');
                kategoriManualInput.value = '';
            }
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

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 17. TAMBAH TRANSAKSI
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Transaksi';
                form.reset();
                if (editIdInput) editIdInput.value = '';
                if (notaFileInput) notaFileInput.value = '';
                if (notaUrlInput) notaUrlInput.value = '';
                if (kategoriManualInput) {
                    kategoriManualInput.classList.add('hidden');
                    kategoriManualInput.value = '';
                }
                if (tanggalInput) tanggalInput.value = todayISO();
                openModal();
            });
        }

        // ================================================================
        // 18. EDIT TRANSAKSI
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(t => String(t.id) === String(id));
            if (!item) {
                safeToast('Data tidak ditemukan.', 'warning');
                return;
            }

            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Transaksi';
            if (editIdInput) editIdInput.value = item.id || '';
            if (tanggalInput) {
                const tgl = item.tanggal ? new Date(item.tanggal) : null;
                tanggalInput.value = (tgl && !isNaN(tgl.getTime()))
                    ? tgl.toISOString().slice(0, 10)
                    : todayISO();
            }
            if (jenisSelect) jenisSelect.value = item.jenis || 'Pemasukan';

            const defaultCategories = ['Iuran Anggota', 'Donasi', 'Konsumsi', 'Transportasi', 'Perlengkapan'];
            if (kategoriSelect) {
                if (defaultCategories.includes(item.kategori)) {
                    kategoriSelect.value = item.kategori;
                    if (kategoriManualInput) {
                        kategoriManualInput.classList.add('hidden');
                        kategoriManualInput.value = '';
                    }
                } else {
                    kategoriSelect.value = 'Lainnya';
                    if (kategoriManualInput) {
                        kategoriManualInput.value = item.kategori || '';
                        kategoriManualInput.classList.remove('hidden');
                    }
                }
            }

            if (jumlahInput) jumlahInput.value = item.jumlah || 0;
            if (keteranganInput) keteranganInput.value = item.keterangan || '';
            if (notaUrlInput) notaUrlInput.value = item.nota_url || '';
            if (notaFileInput) notaFileInput.value = '';

            openModal();
        };

        // ================================================================
        // 19. DELETE TRANSAKSI (SINGLE)
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(t => String(t.id) === String(id));
            const label = item ? (item.kategori || 'transaksi ini') : 'transaksi ini';

            showConfirm('Hapus transaksi "' + label + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteKeuangan', 'POST', { id });

                    if (result && result.success) {
                        dataCache = dataCache.filter(t => String(t.id) !== String(id));
                        applyFilter();
                        await logActivity('DELETE', 'keuangan', id, 'Hapus: ' + label);

                        if (result._offline) {
                            safeToast('📴 Transaksi dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Transaksi berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[keuangan_admin] deleteItem error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 20. SUBMIT FORM — HANDLE OFFLINE
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const tanggal = tanggalInput ? tanggalInput.value : '';
            const jenis = jenisSelect ? jenisSelect.value : 'Pemasukan';
            let kategori = kategoriSelect ? kategoriSelect.value : 'Lainnya';

            if (kategori === 'Lainnya') {
                kategori = kategoriManualInput ? (kategoriManualInput.value || '').trim() : 'Lainnya';
                if (!kategori) kategori = 'Lainnya';
            }

            const jumlah = jumlahInput ? Number(jumlahInput.value) || 0 : 0;
            const keterangan = keteranganInput ? (keteranganInput.value || '').trim() : '';
            const nota_url_existing = notaUrlInput ? notaUrlInput.value : '';

            if (!tanggal) {
                safeToast('Tanggal wajib diisi!', 'warning');
                if (tanggalInput) tanggalInput.focus();
                return;
            }
            if (jumlah <= 0) {
                safeToast('Jumlah harus lebih dari 0!', 'warning');
                if (jumlahInput) jumlahInput.focus();
                return;
            }
            if (!kategori) {
                safeToast('Kategori wajib diisi!', 'warning');
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                const data = {
                    tanggal: tanggal,
                    jenis: jenis,
                    kategori: kategori,
                    jumlah: jumlah,
                    keterangan: keterangan,
                    nota_url: nota_url_existing || '',
                    created_by: user.id
                };

                const id = editIdInput ? editIdInput.value : '';
                const action = id ? 'updateKeuangan' : 'createKeuangan';
                const payload = id ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    // Optimistic update cache lokal
                    const tempId = id || ('tmp_' + Date.now());
                    if (id) {
                        const idx = dataCache.findIndex(t => String(t.id) === String(id));
                        if (idx !== -1) {
                            dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                        }
                    } else {
                        dataCache.unshift(Object.assign({}, data, {
                            id: tempId,
                            created_at: new Date().toISOString()
                        }));
                    }

                    applyFilter();

                    // Upload nota di background (HANYA jika online)
                    if (notaFileInput && notaFileInput.files && notaFileInput.files.length > 0) {
                        if (result._offline) {
                            safeToast('📴 Upload nota memerlukan koneksi internet. Nota tidak diunggah.', 'warning', 4000);
                        } else {
                            const targetId = id || result.id;
                            safeToast('Data tersimpan, mengunggah nota...', 'info', 3000);

                            uploadFileToDrive(notaFileInput.files[0])
                                .then(uploadResult => {
                                    if (uploadResult && uploadResult.success) {
                                        apiCall('updateKeuangan', 'POST', {
                                            id: targetId,
                                            nota_url: uploadResult.url
                                        }).then(() => {
                                            const idx = dataCache.findIndex(t => String(t.id) === String(targetId));
                                            if (idx !== -1) {
                                                dataCache[idx].nota_url = uploadResult.url;
                                                applyFilter();
                                            }
                                            safeToast('✅ Nota berhasil diunggah!', 'success');
                                        });
                                    } else {
                                        safeToast('Gagal upload nota', 'error');
                                    }
                                })
                                .catch(err => {
                                    safeToast('Gagal upload: ' + err.message, 'error');
                                });
                        }
                    }

                    closeModal();
                    form.reset();

                    await logActivity(
                        id ? 'UPDATE' : 'CREATE',
                        'keuangan',
                        result.id || id,
                        'Transaksi: ' + kategori
                    );

                    if (result._offline) {
                        safeToast('📴 Transaksi tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(
                            id ? '✅ Transaksi berhasil diperbarui!' : '✅ Transaksi berhasil disimpan!',
                            'success'
                        );
                    }
                } else {
                    safeToast((result && result.message) || 'Gagal menyimpan transaksi', 'error');
                }
            } catch (error) {
                console.error('[keuangan_admin] Submit error:', error);
                safeToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 21. FILTER TANGGAL LEGACY
        // ================================================================
        if (filterDate && !filterDate.dataset.attached) {
            filterDate.dataset.attached = 'true';
            filterDate.addEventListener('change', () => {
                if (filterDate.value) {
                    currentFilter.dateFrom = filterDate.value;
                    currentFilter.dateTo = filterDate.value;
                    const df = document.getElementById('keuangan-date-from');
                    const dt = document.getElementById('keuangan-date-to');
                    if (df) df.value = filterDate.value;
                    if (dt) dt.value = filterDate.value;
                } else {
                    currentFilter.dateFrom = '';
                    currentFilter.dateTo = '';
                }
                applyFilter();
            });
        }

        // ================================================================
        // 22. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan', 'Nota'];
            const rows = filteredCache.map((item, idx) => [
                idx + 1,
                formatDate(item.tanggal),
                item.jenis || '',
                item.kategori || '',
                Number(item.jumlah) || 0,
                item.keterangan || '',
                item.nota_url ? 'Ada' : '-'
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `keuangan_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        if (exportBtn) {
            const fresh = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(fresh, exportBtn);
            fresh.addEventListener('click', exportCSV);
        }

        // ================================================================
        // 23. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span class="hidden sm:inline">Memuat...</span>';

                try {
                    await refreshDataOnly();
                    safeToast('✅ Data keuangan diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 24. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[keuangan_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 25. CLEANUP
        // ================================================================
        function cleanup() {
            window.__keuanganAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            console.log('[keuangan_admin] Cleanup');
        }
        window.__keuanganAdminCleanup = cleanup;

        // ================================================================
        // 26. INIT SEQUENCE
        // ================================================================
        console.log('[keuangan_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        if (tanggalInput && !tanggalInput.value) {
            tanggalInput.value = todayISO();
        }

        await loadData();

        console.log('[keuangan_admin] ✅ Init selesai v10.0.0');
    }

    // ================================================================
    // 27. RUN INIT
    // ================================================================
    init();
});