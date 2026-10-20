/**
 * js/berita_admin.js
 * Modul Admin Berita — v5.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v5.0.0:
 *   ✅ NEW: Handle response _offline dari apiCall
 *   ✅ NEW: Badge pending sync di tabel
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Safe toast fallback
 *   ✅ NEW: Upload foto skip saat offline
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe seluruh DOM elements
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Preview modal proper (sanitized HTML)
 *   ✅ FIX: Bulk delete handling offline
 *   ✅ FIX: Tag filter options dynamic
 *   ✅ FIX: Sort options (terbaru, terlama, judul)
 *   ✅ FIX: Search real-time + debounce
 *   ✅ FIX: Stats 3 kartu auto-update
 *   ✅ PRESERVED: Semua fitur v4.0.0
 * ============================================================
 */

App.register('berita_admin', function() {
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
    if (window.__beritaAdminLoaded) {
        console.log('[berita_admin] Sudah di-init, skip.');
        return;
    }
    window.__beritaAdminLoaded = true;

    console.log('[berita_admin] 🚀 Init v5.0.0 (Offline-First Full Fix)');

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

    function formatDateLong(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function getFirstImageFromContent(html) {
        if (!html) return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const img = doc.querySelector('img');
            return img ? (img.getAttribute('src') || '') : '';
        } catch (e) {
            return '';
        }
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function sanitizeHtml(html) {
        if (!html) return '';
        return String(html)
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
            .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
            .replace(/javascript:/gi, '');
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[berita_admin:' + (type || 'info') + ']', msg);
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
        console.log('[berita_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getBerita_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadBerita(true).then(() => {
            console.log('[berita_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 6. INIT
    // ================================================================
    async function init() {
        const requiredIds = [
            'berita-table', 'refresh-btn', 'add-btn',
            'berita-modal', 'modal-title', 'berita-form', 'close-btn', 'save-btn',
            'berita-id', 'judul', 'tag', 'isi', 'tanggal',
            'gambar_url',
            'berita_foto', 'berita-foto-preview', 'berita-foto-preview-wrap', 'berita-foto-remove'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody = els['berita-table'];
        const refreshBtn = els['refresh-btn'];
        const addBtn = els['add-btn'];
        const modal = els['berita-modal'];
        const modalTitle = els['modal-title'];
        const form = els['berita-form'];
        const closeBtn = els['close-btn'];
        const saveBtn = els['save-btn'];
        const idInput = els['berita-id'];
        const judulInput = els['judul'];
        const tagInput = els['tag'];
        const isiInput = els['isi'];
        const gambarInput = els['gambar_url'];
        const tanggalInput = els['tanggal'];
        const fotoFileInput = els['berita_foto'];

        if (!tableBody || !modal || !form) {
            console.error('[berita_admin] ❌ Elemen utama tidak ditemukan.');
            return;
        }

        console.log('[berita_admin] ✅ Semua elemen ditemukan');

        // ================================================================
        // 7. STATE
        // ================================================================
        let isEdit = false;
        let isSubmitting = false;
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = {
            search: '',
            tag: 'all',
            sort: 'terbaru'
        };
        let selectedIds = new Set();

        // ================================================================
        // 8. FORMPHOTO CONTROLLER
        // ================================================================
        let beritaPhotoCtrl = null;

        if (typeof window.FormPhoto !== 'undefined' && fotoFileInput) {
            beritaPhotoCtrl = window.FormPhoto.attach(
                'berita_foto',
                'berita-foto-preview',
                'berita-foto-remove',
                {
                    onPreview: function() {
                        const wrap = document.getElementById('berita-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'block';
                    },
                    onClear: function() {
                        const wrap = document.getElementById('berita-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'none';
                        if (gambarInput) gambarInput.value = '';
                    }
                }
            );
            console.log('[berita_admin] ✅ FormPhoto controller attached');
        } else {
            console.warn('[berita_admin] ⚠️ FormPhoto tidak tersedia');
        }

        function resetBeritaPhoto() {
            if (beritaPhotoCtrl) {
                try { beritaPhotoCtrl.reset(); } catch (e) {}
            }
            const wrap = document.getElementById('berita-foto-preview-wrap');
            if (wrap) wrap.style.display = 'none';
            if (gambarInput) gambarInput.value = '';
        }

        // ================================================================
        // 9. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 3 kartu =====
            if (!document.getElementById('berita-admin-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'berita-admin-stats';
                statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Berita</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-berita">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-newspaper"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-bulan-berita">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tag Unik</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-tag-berita">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-tags"></i>
                            </div>
                        </div>
                    </div>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search + Filter =====
            if (!document.getElementById('berita-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'berita-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="berita-search" placeholder="Cari judul, isi, tag..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    </div>
                    <select id="berita-filter-tag" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Tag</option>
                    </select>
                    <select id="berita-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="terbaru">Terbaru</option>
                        <option value="terlama">Terlama</option>
                        <option value="judul-asc">Judul A-Z</option>
                        <option value="judul-desc">Judul Z-A</option>
                    </select>
                `;
                const statsDiv = document.getElementById('berita-admin-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('berita-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'berita-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-berita">0</span> berita dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-berita-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-berita-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('berita-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 10. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('berita-search');
            const tagFilter = document.getElementById('berita-filter-tag');
            const sortSelect = document.getElementById('berita-sort');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'berita-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (tagFilter && !tagFilter.dataset.attached) {
                tagFilter.dataset.attached = 'true';
                tagFilter.addEventListener('change', () => {
                    currentFilter.tag = tagFilter.value;
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
        }

        // ================================================================
        // 11. UPDATE TAG FILTER OPTIONS
        // ================================================================
        function updateTagOptions() {
            const select = document.getElementById('berita-filter-tag');
            if (!select) return;

            const tags = new Set();
            dataCache.forEach(b => {
                if (b.tag) tags.add(String(b.tag).trim());
            });

            const currentValue = select.value;
            select.innerHTML = '<option value="all">Semua Tag</option>';
            Array.from(tags).sort().forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = '#' + t;
                select.appendChild(opt);
            });

            if (Array.from(tags).includes(currentValue)) {
                select.value = currentValue;
            }
        }

        // ================================================================
        // 12. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(b => {
                if (currentFilter.tag !== 'all') {
                    if (String(b.tag || '').trim() !== currentFilter.tag) return false;
                }
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [b.judul, stripHtml(b.isi), b.tag]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            switch (currentFilter.sort) {
                case 'terbaru':
                    filteredCache.sort((a, b) =>
                        new Date(b.tanggal || b.created_at || 0) -
                        new Date(a.tanggal || a.created_at || 0));
                    break;
                case 'terlama':
                    filteredCache.sort((a, b) =>
                        new Date(a.tanggal || a.created_at || 0) -
                        new Date(b.tanggal || b.created_at || 0));
                    break;
                case 'judul-asc':
                    filteredCache.sort((a, b) =>
                        String(a.judul || '').localeCompare(String(b.judul || '')));
                    break;
                case 'judul-desc':
                    filteredCache.sort((a, b) =>
                        String(b.judul || '').localeCompare(String(a.judul || '')));
                    break;
            }

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 13. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const now = new Date();
            const bulanIni = dataCache.filter(b => {
                const d = new Date(b.tanggal || b.created_at);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const tags = new Set();
            dataCache.forEach(b => {
                if (b.tag) tags.add(String(b.tag).trim());
            });

            const el1 = document.getElementById('stats-total-berita');
            const el2 = document.getElementById('stats-bulan-berita');
            const el3 = document.getElementById('stats-tag-berita');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = bulanIni;
            if (el3) el3.textContent = tags.size;
        }

        // ================================================================
        // 14. LOAD DATA (SWR)
        // ================================================================
        async function loadBerita(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-[var(--text-muted)]">' +
                '<i class="fas fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>';

            try {
                const result = await forceRefreshData('getBerita', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    updateTagOptions();
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    renderTable([]);
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[berita_admin] loadBerita error:', error);
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getBerita', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    updateTagOptions();
                    applyFilter();
                }
            } catch (e) {
                console.warn('[berita_admin] fetchDataBackground error:', e);
            }
        }

        // ================================================================
        // 15. RENDER TABLE — WITH PENDING SYNC BADGE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.tag !== 'all';
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-newspaper text-3xl mb-2 opacity-40"></i><p>Belum ada berita</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((item, index) => {
                let thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) || '';

                const gambarHtml = thumbnail
                    ? `<img src="${escapeAttr(thumbnail)}" 
                            alt="${escapeAttr(item.judul)}"
                            class="table-thumb"
                            loading="lazy"
                            onclick="previewBerita('${escapeAttr(item.id)}')"
                            onerror="this.outerHTML='<div class=\\'table-thumb-placeholder\\'><i class=\\'fas fa-image\\'></i></div>'">`
                    : '<div class="table-thumb-placeholder"><i class="fas fa-image"></i></div>';

                const isSelected = selectedIds.has(item.id);
                const pending = isPendingSync(item.id);

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳ SYNC</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="berita-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${index + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="previewBerita('${escapeAttr(item.id)}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400 text-left">
                                ${escapeHtml(item.judul || '-')}
                            </button>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">
                            ${escapeHtml(formatDate(item.tanggal))}
                        </td>
                        <td class="px-3 py-3 text-sm">
                            ${item.tag ? `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">#${escapeHtml(item.tag)}</span>` : '-'}
                        </td>
                        <td class="px-3 py-3 text-center">${gambarHtml}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="previewBerita('${escapeAttr(item.id)}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Preview">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editBerita('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteBerita('${escapeAttr(item.id)}')"
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
            if (!thead || thead.querySelector('.bulk-select-all-berita')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-berita w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-berita');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.berita-checkbox').forEach(cb => {
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
            document.querySelectorAll('.berita-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('berita-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-berita');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 16. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-berita-btn');
            const cancelBtn = document.getElementById('bulk-cancel-berita-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} berita? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteBerita', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(b => String(b.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.berita-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-berita');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} berita berhasil dihapus!` +
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
                    document.querySelectorAll('.berita-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-berita');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 17. PREVIEW BERITA (MODAL)
        // ================================================================
        window.previewBerita = function(id) {
            const item = dataCache.find(b => String(b.id) === String(id));
            if (!item) {
                safeToast('Berita tidak ditemukan.', 'warning');
                return;
            }

            let previewModal = document.getElementById('berita-preview-modal');
            if (!previewModal) {
                previewModal = document.createElement('div');
                previewModal.id = 'berita-preview-modal';
                previewModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                previewModal.innerHTML = `
                    <div id="berita-preview-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)] z-10">
                            <h3 id="berita-preview-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4 line-clamp-2"></h3>
                            <button id="berita-preview-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="berita-preview-body" class="p-5"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="berita-preview-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="berita-preview-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(previewModal);

                const closeFn = () => {
                    previewModal.classList.add('hidden');
                    previewModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('berita-preview-close').addEventListener('click', closeFn);
                document.getElementById('berita-preview-ok').addEventListener('click', closeFn);
                previewModal.addEventListener('click', (e) => {
                    if (e.target === previewModal) closeFn();
                });
            }

            const content = document.getElementById('berita-preview-content');
            const titleEl = document.getElementById('berita-preview-title');
            const body = document.getElementById('berita-preview-body');

            titleEl.textContent = item.judul || '-';

            const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) || '';
            const tanggal = formatDateLong(item.tanggal || item.created_at);

            body.innerHTML = `
                ${thumbnail ? `<div class="mb-4 rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--bg-stats)]">
                    <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(item.judul)}" class="w-full max-h-72 object-cover">
                </div>` : ''}

                <div class="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)] mb-4 pb-4 border-b border-[var(--card-border)]">
                    <span><i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}</span>
                    ${item.tag ? `<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-semibold">#${escapeHtml(item.tag)}</span>` : ''}
                </div>

                <div class="berita-preview-content prose max-w-none">
                    ${sanitizeHtml(item.isi) || '<p class="italic text-[var(--text-muted)]">Tidak ada isi berita.</p>'}
                </div>
            `;

            const editBtn = document.getElementById('berita-preview-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    previewModal.classList.add('hidden');
                    previewModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.editBerita(item.id);
                });
            }

            previewModal.classList.remove('hidden');
            previewModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (content) {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        };

        // ================================================================
        // 18. MODAL OPEN/CLOSE
        // ================================================================
        function openModal() {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(() => {
                const content = modal.querySelector('div');
                if (content) {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            const content = modal.querySelector('div');
            if (content) {
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 250);
            document.body.style.overflow = '';
            form.reset();
            if (idInput) idInput.value = '';
            resetBeritaPhoto();
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
            if (e.key !== 'Escape') return;
            const previewModal = document.getElementById('berita-preview-modal');
            if (previewModal && !previewModal.classList.contains('hidden')) {
                previewModal.classList.add('hidden');
                previewModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 19. TAMBAH BERITA
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Berita';
                form.reset();
                if (idInput) idInput.value = '';
                if (tanggalInput) tanggalInput.value = todayISO();
                resetBeritaPhoto();
                openModal();
            });
        }

        // ================================================================
        // 20. EDIT BERITA
        // ================================================================
        window.editBerita = function(id) {
            const item = dataCache.find(b => String(b.id) === String(id));
            if (!item) {
                safeToast('Berita tidak ditemukan.', 'warning');
                return;
            }

            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Berita';
            if (idInput) idInput.value = item.id || '';
            if (judulInput) judulInput.value = item.judul || '';
            if (tagInput) tagInput.value = item.tag || '';
            if (isiInput) isiInput.value = item.isi || '';

            if (tanggalInput) {
                const tgl = item.tanggal ? new Date(item.tanggal) : null;
                tanggalInput.value = (tgl && !isNaN(tgl.getTime()))
                    ? tgl.toISOString().slice(0, 10)
                    : todayISO();
            }

            resetBeritaPhoto();
            const existingUrl = item.gambar_url || '';
            if (gambarInput) gambarInput.value = existingUrl;

            if (existingUrl && beritaPhotoCtrl) {
                try {
                    beritaPhotoCtrl.setExisting(existingUrl);
                    const wrap = document.getElementById('berita-foto-preview-wrap');
                    if (wrap) wrap.style.display = 'block';
                } catch (e) {
                    console.warn('[berita_admin] setExisting error:', e);
                }
            }

            openModal();
        };

        // ================================================================
        // 21. DELETE BERITA (SINGLE)
        // ================================================================
        window.deleteBerita = function(id) {
            const item = dataCache.find(b => String(b.id) === String(id));
            const nama = item ? (item.judul || 'berita ini') : 'berita ini';

            showConfirm('Hapus berita "' + nama + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteBerita', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(b => String(b.id) !== String(id));
                        updateTagOptions();
                        applyFilter();

                        await logActivity('DELETE', 'berita', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Berita dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Berita berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[berita_admin] deleteBerita error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 22. SUBMIT FORM — HANDLE OFFLINE
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const judul = judulInput ? (judulInput.value || '').trim() : '';
            const tag = tagInput ? (tagInput.value || '').trim() : '';
            const isi = isiInput ? (isiInput.value || '').trim() : '';
            const tanggal = tanggalInput ? tanggalInput.value : '';

            if (!judul) {
                safeToast('Judul wajib diisi!', 'warning');
                if (judulInput) judulInput.focus();
                return;
            }
            if (judul.length < 3) {
                safeToast('Judul minimal 3 karakter!', 'warning');
                if (judulInput) judulInput.focus();
                return;
            }
            if (!isi) {
                safeToast('Isi berita wajib diisi!', 'warning');
                if (isiInput) isiInput.focus();
                return;
            }
            if (!tanggal) {
                safeToast('Tanggal wajib diisi!', 'warning');
                if (tanggalInput) tanggalInput.focus();
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                const existingUrl = gambarInput ? gambarInput.value : '';
                let gambar_url = existingUrl;

                if (beritaPhotoCtrl && beritaPhotoCtrl.hasFile()) {
                    if (!navigator.onLine) {
                        safeToast('📴 Upload foto memerlukan koneksi internet. Menyimpan tanpa foto.', 'warning', 4000);
                    } else {
                        if (submitBtn) {
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengunggah foto...';
                        }

                        try {
                            gambar_url = await window.FormPhoto.uploadIfAny(beritaPhotoCtrl, existingUrl);
                        } catch (uploadErr) {
                            console.error('[berita_admin] Upload foto error:', uploadErr);
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

                if (!gambar_url) {
                    gambar_url = getFirstImageFromContent(isi);
                }

                const data = {
                    judul: judul,
                    tag: tag,
                    isi: isi,
                    gambar_url: gambar_url,
                    tanggal: tanggal,
                    created_by: user.id
                };

                const id = idInput ? idInput.value : '';
                const action = id ? 'updateBerita' : 'createBerita';
                const payload = id ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    if (id) {
                        const idx = dataCache.findIndex(b => String(b.id) === String(id));
                        if (idx !== -1) {
                            dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                        }
                    } else {
                        const tempId = result.id || ('tmp_' + Date.now());
                        dataCache.unshift(Object.assign({}, data, {
                            id: tempId,
                            created_at: new Date().toISOString()
                        }));
                    }

                    updateTagOptions();
                    applyFilter();
                    closeModal();
                    form.reset();

                    await logActivity(
                        id ? 'UPDATE' : 'CREATE',
                        'berita',
                        result.id || id,
                        'Berita: ' + judul
                    );

                    if (result._offline) {
                        safeToast('📴 Berita tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(
                            id ? '✅ Berita berhasil diperbarui!' : '✅ Berita berhasil disimpan!',
                            'success'
                        );
                    }
                } else {
                    safeToast((result && result.message) || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                console.error('[berita_admin] Submit error:', error);
                safeToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 23. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span class="hidden sm:inline">Memuat...</span>';

                try {
                    await refreshDataOnly();
                    safeToast('✅ Data berita diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = orig;
                }
            });
        }

        // ================================================================
        // 24. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[berita_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 25. CLEANUP
        // ================================================================
        function cleanup() {
            window.__beritaAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const previewModal = document.getElementById('berita-preview-modal');
            if (previewModal) previewModal.remove();
            document.body.style.overflow = '';
            console.log('[berita_admin] Cleanup');
        }
        window.__beritaAdminCleanup = cleanup;

        // ================================================================
        // 26. INIT SEQUENCE
        // ================================================================
        console.log('[berita_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        if (tanggalInput && !tanggalInput.value) {
            tanggalInput.value = todayISO();
        }

        await loadBerita();

        console.log('[berita_admin] ✅ Init selesai v5.0.0');
    }

    // ================================================================
    // 27. RUN INIT
    // ================================================================
    init();
});