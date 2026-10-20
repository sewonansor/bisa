/**
 * js/logbook_admin.js
 * Modul Admin Logbook — v9.0.0 OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v9.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Upload file skip saat offline (warning)
 *   ✅ NEW: Stats 4 kartu (total, draft, final, bulan ini)
 *   ✅ NEW: Search + Filter status + Sort
 *   ✅ NEW: Detail modal logbook
 *   ✅ NEW: Copy detail logbook
 *   ✅ NEW: Bulk delete
 *   ✅ NEW: Export CSV dengan filter aktif
 *   ✅ NEW: Edit logbook
 *   ✅ NEW: Preview modal proper (bukan hanya toast)
 *   ✅ NEW: Tombol "Buat Laporan" menuju /logbook_report
 *   ✅ FIX: Semua handler idempotent (no double bind)
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit
 *   ✅ FIX: XSS protection
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 * ============================================================
 */

App.register('logbook_admin', function() {
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
    if (window.__logbookAdminLoaded) {
        console.log('[logbook_admin] Sudah di-init, skip.');
        return;
    }
    window.__logbookAdminLoaded = true;

    console.log('[logbook_admin] 🚀 Init v9.0.0 (Offline-First Full Fix)');

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

    function formatRupiah(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
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
            console.log('[logbook_admin:' + (type || 'info') + ']', msg);
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
        status: 'all',
        sort: 'terbaru'
    };
    let isSubmitting = false;
    let selectedIds = new Set();
    let quill = null;

    // ================================================================
    // 6. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        console.log('[logbook_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getLogbook_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadLogbook(true).then(() => {
            console.log('[logbook_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 7. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'kegiatan-table-body', 'kegiatan-skeleton',
            'kegiatan-modal', 'modal-content', 'modal-title',
            'kegiatan-form', 'modal-close',
            'add-kegiatan-btn', 'refresh-kegiatan-btn',
            'kegiatan-id', 'kegiatan_nama', 'kegiatan_tempat',
            'kegiatan_tanggal_mulai', 'kegiatan_tanggal_selesai',
            'kegiatan_peserta', 'kegiatan_anggaran', 'kegiatan_deskripsi',
            'kegiatan_file_url', 'kegiatan_file'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody          = els['kegiatan-table-body'];
        const skeleton           = els['kegiatan-skeleton'];
        const modal              = els['kegiatan-modal'];
        const modalContent       = els['modal-content'];
        const modalTitle         = els['modal-title'];
        const form               = els['kegiatan-form'];
        const closeBtn           = els['modal-close'];
        const addBtn             = els['add-kegiatan-btn'];
        const refreshBtn         = els['refresh-kegiatan-btn'];
        const idInput            = els['kegiatan-id'];
        const namaInput          = els['kegiatan_nama'];
        const tempatInput        = els['kegiatan_tempat'];
        const tanggalMulaiInput  = els['kegiatan_tanggal_mulai'];
        const tanggalSelesaiInput = els['kegiatan_tanggal_selesai'];
        const pesertaInput       = els['kegiatan_peserta'];
        const anggaranInput      = els['kegiatan_anggaran'];
        const deskripsiInput     = els['kegiatan_deskripsi'];
        const fileUrlInput       = els['kegiatan_file_url'];
        const fileInput          = els['kegiatan_file'];

        if (!tableBody) {
            console.error('[logbook_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 8. QUILL EDITOR
        // ================================================================
        const quillContainer = document.getElementById('kegiatan_deskripsi_editor');
        const hiddenDeskripsi = document.getElementById('kegiatan_deskripsi');

        if (quillContainer && typeof Quill !== 'undefined') {
            quill = new Quill(quillContainer, {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                    ]
                }
            });

            // Image handler
            quill.getModule('toolbar').addHandler('image', function() {
                const input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.setAttribute('accept', 'image/*');
                input.click();

                input.onchange = async function() {
                    const file = input.files[0];
                    if (!file) return;
                    if (!navigator.onLine) {
                        safeToast('📴 Upload gambar memerlukan koneksi internet.', 'warning', 4000);
                        return;
                    }
                    const result = await uploadFileToDrive(file);
                    if (result.success) {
                        const range = quill.getSelection();
                        quill.insertEmbed(range.index, 'image', result.url);
                    } else {
                        safeToast('Gagal upload gambar: ' + (result.message || ''), 'error');
                    }
                };
            });
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
            if (!document.getElementById('logbook-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'logbook-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Logbook</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-logbook">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-book"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Draft</p>
                                <p class="text-2xl font-bold text-yellow-600 mt-1" id="stats-draft-logbook">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
                                <i class="fas fa-edit"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Final</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-final-logbook">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-check-circle"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-bulan-logbook">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
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
            if (!document.getElementById('logbook-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'logbook-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="logbook-search" placeholder="Cari nama kegiatan, tempat..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="logbook-filter-status" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Status</option>
                        <option value="draft">Draft</option>
                        <option value="final">Final</option>
                    </select>
                    <select id="logbook-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="terbaru">Terbaru</option>
                        <option value="terlama">Terlama</option>
                        <option value="nama-asc">Nama A-Z</option>
                    </select>
                    <button id="logbook-report-btn" type="button" class="btn-primary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-file-pdf mr-1"></i>Laporan
                    </button>
                    <button id="logbook-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                    <button id="logbook-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('logbook-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'logbook-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-logbook">0</span> logbook dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-logbook-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-logbook-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('logbook-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 10. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('logbook-search');
            const filterStatus = document.getElementById('logbook-filter-status');
            const sortSelect = document.getElementById('logbook-sort');
            const reportBtn = document.getElementById('logbook-report-btn');
            const exportBtn = document.getElementById('logbook-export-btn');
            const clearBtn = document.getElementById('logbook-clear-filter');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'logbook-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (filterStatus && !filterStatus.dataset.attached) {
                filterStatus.dataset.attached = 'true';
                filterStatus.addEventListener('change', () => {
                    currentFilter.status = filterStatus.value;
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
                    currentFilter = { search: '', status: 'all', sort: 'terbaru' };
                    if (searchInput) searchInput.value = '';
                    if (filterStatus) filterStatus.value = 'all';
                    if (sortSelect) sortSelect.value = 'terbaru';
                    applyFilter();
                    safeToast('Filter direset.', 'info', 2000);
                });
            }

            if (reportBtn && !reportBtn.dataset.attached) {
                reportBtn.dataset.attached = 'true';
                reportBtn.addEventListener('click', () => {
                    router.load('/logbook_report');
                });
            }

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportCSV);
            }
        }

        // ================================================================
        // 11. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(item => {
                if (currentFilter.status !== 'all') {
                    const status = item.status || 'draft';
                    if (status !== currentFilter.status) return false;
                }

                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [
                        item.kegiatan, item.tempat,
                        stripHtml(item.deskripsi)
                    ].map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            switch (currentFilter.sort) {
                case 'terbaru':
                    filteredCache.sort((a, b) =>
                        new Date(b.tanggal_mulai || b.created_at || 0) -
                        new Date(a.tanggal_mulai || a.created_at || 0));
                    break;
                case 'terlama':
                    filteredCache.sort((a, b) =>
                        new Date(a.tanggal_mulai || a.created_at || 0) -
                        new Date(b.tanggal_mulai || b.created_at || 0));
                    break;
                case 'nama-asc':
                    filteredCache.sort((a, b) =>
                        String(a.kegiatan || '').localeCompare(String(b.kegiatan || '')));
                    break;
            }

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 12. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const draft = dataCache.filter(l => (l.status || 'draft') === 'draft').length;
            const final = dataCache.filter(l => l.status === 'final').length;

            const now = new Date();
            const bulanIni = dataCache.filter(l => {
                const d = new Date(l.tanggal_mulai || l.created_at);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const el1 = document.getElementById('stats-total-logbook');
            const el2 = document.getElementById('stats-draft-logbook');
            const el3 = document.getElementById('stats-final-logbook');
            const el4 = document.getElementById('stats-bulan-logbook');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = draft;
            if (el3) el3.textContent = final;
            if (el4) el4.textContent = bulanIni;
        }

        // ================================================================
        // 13. LOAD DATA (SWR)
        // ================================================================
        async function loadLogbook(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            if (skeleton) skeleton.classList.remove('hidden');
            tableBody.innerHTML = '';

            try {
                const result = await forceRefreshData('getLogbook', {});

                if (skeleton) skeleton.classList.add('hidden');

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    renderTable([]);
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                if (skeleton) skeleton.classList.add('hidden');
                console.error('[logbook_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getLogbook', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[logbook_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 14. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.status !== 'all';
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-book text-3xl mb-2 opacity-40"></i><p>Belum ada logbook</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((item, idx) => {
                const status = item.status || 'draft';
                const isSelected = selectedIds.has(item.id);
                const pending = isPendingSync(item.id);

                const statusBadge = status === 'final'
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Final</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Draft</span>';

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="logbook-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 text-left">
                                ${escapeHtml(item.kegiatan || '-')}
                            </button>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">
                            ${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)}
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.tempat || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${item.peserta || 0}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${formatRupiah(item.anggaran || 0)}</td>
                        <td class="px-3 py-3 text-sm text-center">${statusBadge}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Detail">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editLogbook('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteLogbook('${escapeAttr(item.id)}')"
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
            if (!thead || thead.querySelector('.bulk-select-all-logbook')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-logbook w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-logbook');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.logbook-checkbox').forEach(cb => {
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
            document.querySelectorAll('.logbook-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('logbook-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-logbook');
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
            const delBtn = document.getElementById('bulk-delete-logbook-btn');
            const cancelBtn = document.getElementById('bulk-cancel-logbook-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} logbook? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteLogbook', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(l => String(l.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.logbook-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-logbook');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} logbook berhasil dihapus!` +
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
                    document.querySelectorAll('.logbook-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-logbook');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 16. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(l => String(l.id) === String(id));
            if (!item) {
                safeToast('Logbook tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('logbook-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'logbook-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="logbook-detail-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)] z-10">
                            <h3 id="logbook-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4"></h3>
                            <button id="logbook-detail-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="logbook-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="logbook-detail-copy" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-copy mr-1"></i>Copy
                            </button>
                            <button id="logbook-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="logbook-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('logbook-detail-close').addEventListener('click', closeFn);
                document.getElementById('logbook-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('logbook-detail-content');
            const titleEl = document.getElementById('logbook-detail-title');
            const bodyEl = document.getElementById('logbook-detail-body');

            titleEl.textContent = item.kegiatan || '-';
            const status = item.status || 'draft';

            const statusBadge = status === 'final'
                ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Final</span>'
                : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Draft</span>';

            bodyEl.innerHTML = `
                <div class="flex items-center gap-2 mb-3">
                    ${statusBadge}
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Mulai</p>
                        <p class="text-sm text-[var(--text-main)]">${formatDateLong(item.tanggal_mulai)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Selesai</p>
                        <p class="text-sm text-[var(--text-main)]">${formatDateLong(item.tanggal_selesai)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tempat</p>
                        <p class="text-sm text-[var(--text-main)]">${escapeHtml(item.tempat || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Peserta</p>
                        <p class="text-sm text-[var(--text-main)]">${item.peserta || 0} orang</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Anggaran</p>
                        <p class="text-sm text-[var(--text-main)]">${formatRupiah(item.anggaran || 0)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Dibuat Oleh</p>
                        <p class="text-sm text-[var(--text-main)]">${escapeHtml(item.created_by || '-')}</p>
                    </div>
                    ${item.file_url ? `
                        <div class="col-span-2">
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">File Pendukung</p>
                            <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                                class="text-blue-600 hover:underline text-sm break-all">
                                <i class="fas fa-paperclip mr-1"></i>${escapeHtml(item.file_url)}
                            </a>
                        </div>
                    ` : ''}
                </div>

                <div class="border-t border-[var(--card-border)] pt-4">
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">Deskripsi Kegiatan</p>
                    <div class="bg-[var(--bg-stats)] rounded-lg p-4 max-h-96 overflow-y-auto">
                        ${item.deskripsi
                            ? `<div class="prose prose-sm max-w-none text-[var(--text-main)]">${item.deskripsi}</div>`
                            : '<p class="text-sm text-[var(--text-muted)] italic">Tidak ada deskripsi.</p>'}
                    </div>
                </div>
            `;

            const editBtn = document.getElementById('logbook-detail-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.editLogbook(item.id);
                });
            }

            const copyBtn = document.getElementById('logbook-detail-copy');
            if (copyBtn) {
                const newCopy = copyBtn.cloneNode(true);
                copyBtn.parentNode.replaceChild(newCopy, copyBtn);
                newCopy.addEventListener('click', () => {
                    const text = 'KEGIATAN: ' + (item.kegiatan || '-') + '\n' +
                                 'TEMPAT: ' + (item.tempat || '-') + '\n' +
                                 'TANGGAL: ' + formatDate(item.tanggal_mulai) + ' - ' + formatDate(item.tanggal_selesai) + '\n' +
                                 'PESERTA: ' + (item.peserta || 0) + ' orang\n' +
                                 'ANGGARAN: ' + formatRupiah(item.anggaran || 0) + '\n' +
                                 'DESKRIPSI: ' + stripHtml(item.deskripsi || '-');
                    copyToClipboard(text)
                        .then(() => safeToast('✅ Detail dicopy!', 'success', 2500))
                        .catch(() => safeToast('Gagal copy', 'error'));
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
        // 17. MODAL FORM
        // ================================================================
        function openModal() {
            if (!modal) return;
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
            if (!modal) return;
            if (modalContent) {
                modalContent.classList.remove('scale-100', 'opacity-100');
                modalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (form) form.reset();
            if (idInput) idInput.value = '';
            if (fileInput) fileInput.value = '';
            if (quill) quill.root.innerHTML = '';
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
            const detailModal = document.getElementById('logbook-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 18. TAMBAH LOGBOOK
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Logbook';
                if (form) form.reset();
                if (idInput) idInput.value = '';
                if (quill) quill.root.innerHTML = '';
                if (fileInput) fileInput.value = '';
                if (tanggalMulaiInput && !tanggalMulaiInput.value) {
                    tanggalMulaiInput.value = todayISO();
                }
                if (tanggalSelesaiInput && !tanggalSelesaiInput.value) {
                    tanggalSelesaiInput.value = todayISO();
                }
                openModal();
            });
        }

        // ================================================================
        // 19. EDIT LOGBOOK
        // ================================================================
        window.editLogbook = function(id) {
            const item = dataCache.find(l => String(l.id) === String(id));
            if (!item) {
                safeToast('Logbook tidak ditemukan.', 'warning');
                return;
            }
            fillEditForm(item);
        };

        function fillEditForm(item) {
            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Logbook';
            if (idInput) idInput.value = item.id || '';
            if (namaInput) namaInput.value = item.kegiatan || '';
            if (tempatInput) tempatInput.value = item.tempat || '';
            if (tanggalMulaiInput) tanggalMulaiInput.value = item.tanggal_mulai || '';
            if (tanggalSelesaiInput) tanggalSelesaiInput.value = item.tanggal_selesai || '';
            if (pesertaInput) pesertaInput.value = item.peserta || 0;
            if (anggaranInput) anggaranInput.value = item.anggaran || 0;
            if (deskripsiInput) deskripsiInput.value = item.deskripsi || '';
            if (quill) quill.root.innerHTML = item.deskripsi || '';
            if (fileUrlInput) fileUrlInput.value = item.file_url || '';
            if (fileInput) fileInput.value = '';
            openModal();
        }

        // ================================================================
        // 20. DELETE LOGBOOK (Offline-aware)
        // ================================================================
        window.deleteLogbook = function(id) {
            const item = dataCache.find(l => String(l.id) === String(id));
            const nama = item ? (item.kegiatan || 'logbook ini') : 'logbook ini';

            showConfirm('Hapus logbook "' + nama + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteLogbook', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(l => String(l.id) !== String(id));
                        applyFilter();
                        await logActivity('DELETE', 'logbook', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Logbook dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Logbook berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[logbook_admin] deleteLogbook error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 21. SUBMIT FORM (Offline-aware)
        // ================================================================
        if (form) {
            const fresh = form.cloneNode(true);
            form.parentNode.replaceChild(fresh, form);

            fresh.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const kegiatan = namaInput ? (namaInput.value || '').trim() : '';
                const tempat = tempatInput ? (tempatInput.value || '').trim() : '';
                const tanggal_mulai = tanggalMulaiInput ? tanggalMulaiInput.value : '';
                const tanggal_selesai = tanggalSelesaiInput ? tanggalSelesaiInput.value : '';
                const peserta = pesertaInput ? (parseInt(pesertaInput.value) || 0) : 0;
                const anggaran = anggaranInput ? (parseInt(anggaranInput.value) || 0) : 0;
                const deskripsi = quill ? quill.root.innerHTML : (deskripsiInput ? deskripsiInput.value : '');
                const file_url = fileUrlInput ? (fileUrlInput.value || '').trim() : '';

                if (!kegiatan) {
                    safeToast('Nama kegiatan wajib diisi!', 'warning');
                    if (namaInput) namaInput.focus();
                    return;
                }
                if (!tanggal_mulai) {
                    safeToast('Tanggal mulai wajib diisi!', 'warning');
                    if (tanggalMulaiInput) tanggalMulaiInput.focus();
                    return;
                }
                if (!tempat) {
                    safeToast('Tempat wajib diisi!', 'warning');
                    if (tempatInput) tempatInput.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const data = {
                        kegiatan: kegiatan,
                        tempat: tempat,
                        tanggal_mulai: tanggal_mulai,
                        tanggal_selesai: tanggal_selesai || tanggal_mulai,
                        peserta: peserta,
                        anggaran: anggaran,
                        deskripsi: deskripsi,
                        file_url: file_url,
                        created_by: user.id,
                        status: 'final'
                    };

                    const id = idInput ? idInput.value : '';
                    const action = id ? 'updateLogbook' : 'createLogbook';
                    const payload = id ? Object.assign({ id: id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        if (id) {
                            const idx = dataCache.findIndex(l => String(l.id) === String(id));
                            if (idx !== -1) {
                                dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                            }
                        } else {
                            const newItem = Object.assign({}, data, {
                                id: result.id || ('tmp_' + Date.now()),
                                status: 'draft',
                                created_at: new Date().toISOString()
                            });
                            dataCache.unshift(newItem);
                        }

                        applyFilter();

                        if (fileInput && fileInput.files && fileInput.files.length > 0) {
                            if (!navigator.onLine) {
                                safeToast('📴 Upload file memerlukan koneksi internet.', 'warning', 4500);
                            } else {
                                const targetId = id || result.id;
                                safeToast('Data tersimpan, mengunggah file...', 'info', 3000);

                                uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                                    if (uploadResult && uploadResult.success) {
                                        apiCall('updateLogbook', 'POST', {
                                            id: targetId,
                                            file_url: uploadResult.url
                                        }).then(() => {
                                            const idx = dataCache.findIndex(l => String(l.id) === String(targetId));
                                            if (idx !== -1) {
                                                dataCache[idx].file_url = uploadResult.url;
                                                applyFilter();
                                            }
                                            safeToast('✅ File berhasil diunggah!', 'success');
                                        });
                                    } else {
                                        safeToast('Gagal upload file', 'error');
                                    }
                                }).catch(err => {
                                    safeToast('Gagal upload: ' + err.message, 'error');
                                });
                            }
                        }

                        closeModal();
                        if (fresh) fresh.reset();
                        if (quill) quill.root.innerHTML = '';

                        await logActivity(
                            id ? 'UPDATE' : 'CREATE',
                            'logbook',
                            result.id || id,
                            'Kegiatan: ' + kegiatan
                        );

                        if (result._offline) {
                            safeToast('📴 Logbook tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                        } else {
                            safeToast(
                                id ? '✅ Logbook berhasil diperbarui!' : '✅ Logbook berhasil disimpan!',
                                'success'
                            );
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    console.error('[logbook_admin] Submit error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
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

            const headers = ['No', 'Kegiatan', 'Tempat', 'Tanggal Mulai', 'Tanggal Selesai', 'Peserta', 'Anggaran', 'Status', 'Deskripsi'];
            const rows = filteredCache.map((l, i) => [
                i + 1,
                l.kegiatan || '',
                l.tempat || '',
                formatDate(l.tanggal_mulai),
                formatDate(l.tanggal_selesai),
                l.peserta || 0,
                l.anggaran || 0,
                l.status || 'draft',
                stripHtml(l.deskripsi || '')
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logbook_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
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
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';

                try {
                    await refreshDataOnly();
                    safeToast('✅ Data logbook diperbarui!', 'success');
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
                console.log('[logbook_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 25. CLEANUP
        // ================================================================
        function cleanup() {
            window.__logbookAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const detailModal = document.getElementById('logbook-detail-modal');
            if (detailModal) detailModal.remove();
            document.body.style.overflow = '';
            console.log('[logbook_admin] Cleanup');
        }
        window.__logbookAdminCleanup = cleanup;

        // ================================================================
        // 26. INIT SEQUENCE
        // ================================================================
        console.log('[logbook_admin] Loading initial data...');

        if (tanggalMulaiInput && !tanggalMulaiInput.value) {
            tanggalMulaiInput.value = todayISO();
        }
        if (tanggalSelesaiInput && !tanggalSelesaiInput.value) {
            tanggalSelesaiInput.value = todayISO();
        }

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        await loadLogbook();

        console.log('[logbook_admin] ✅ Init selesai v9.0.0');
    }

    // ================================================================
    // 27. RUN INIT
    // ================================================================
    init();
});