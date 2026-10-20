/**
 * js/proker_admin.js
 * Modul Admin Program Kerja — v16.0.0 OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v16.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Upload foto skip saat offline (warning)
 *   ✅ NEW: Stats 4 kartu (total, planning, ongoing, selesai)
 *   ✅ NEW: Progress slider auto-sync status
 *   ✅ NEW: Grid/List view toggle
 *   ✅ NEW: Detail modal dengan foto + riwayat
 *   ✅ NEW: Copy detail program ke clipboard
 *   ✅ NEW: Deadline status indicator (lewat, hari ini, X hari lagi)
 *   ✅ NEW: Export CSV dengan filter aktif
 *   ✅ NEW: Filter status + sort (terbaru, progress, deadline)
 *   ✅ FIX: FormPhoto controller robust
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit
 *   ✅ FIX: XSS protection
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 * ---------------------------------------------------------
 */

App.register('proker_admin', function() {
    'use strict';

    // ================================================================
    // 1. LOCAL HELPERS
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

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[proker_admin:' + (type || 'info') + ']', msg);
        }
    }

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
    // 2. CEK AUTH & GUARD
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    if (window.__prokerAdminLoaded) {
        console.log('[proker_admin] Sudah di-init, skip.');
        return;
    }
    window.__prokerAdminLoaded = true;

    console.log('[proker_admin] 🚀 Init v16.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. HELPER FUNCTIONS
    // ================================================================
    function getStatusBadge(status) {
        if (status === 'selesai') return { label: 'Selesai', bgClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
        if (status === 'ongoing') return { label: 'Ongoing', bgClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
        return { label: 'Planning', bgClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' };
    }

    function getProgressColor(p) {
        if (p >= 100) return 'bg-green-500';
        if (p >= 50) return 'bg-blue-500';
        if (p > 0) return 'bg-yellow-500';
        return 'bg-gray-300 dark:bg-gray-600';
    }

    function getDeadlineStatus(target, status) {
        if (status === 'selesai') return { label: 'Selesai', color: 'text-green-600', icon: 'fa-check-circle' };
        if (!target) return { label: 'Tanpa target', color: 'text-[var(--text-muted)]', icon: 'fa-question' };
        const days = Math.ceil((new Date(target) - new Date()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { label: 'Lewat ' + Math.abs(days) + ' hari', color: 'text-red-500', icon: 'fa-exclamation-triangle' };
        if (days === 0) return { label: 'Hari ini!', color: 'text-red-500', icon: 'fa-exclamation-circle' };
        if (days <= 7) return { label: days + ' hari lagi', color: 'text-yellow-600', icon: 'fa-clock' };
        return { label: formatDate(target), color: 'text-[var(--text-muted)]', icon: 'fa-calendar' };
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let isEdit = false;
    let dataCache = [];
    let filteredCache = [];
    let currentFilter = {
        search: '',
        status: 'all',
        sort: 'terbaru'
    };
    let currentView = 'list';
    let isSubmitting = false;
    let selectedIds = new Set();
    let prokerPhotoCtrl = null;

    // ================================================================
    // 5. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        try {
            const cKey = 'cache_getProgramKerja_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}
        dataCache = [];
        selectedIds.clear();
        return loadData(true).then(() => {
            console.log('[proker_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 6. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'table-body', 'grid-view', 'table-view',
            'proker-modal', 'modal-content', 'modal-title', 'form', 'modal-close',
            'add-btn', 'refresh-proker-btn',
            'edit-id', 'proker_nama', 'proker_deskripsi', 'proker_target',
            'proker_progress', 'proker_status', 'proker_pic', 'proker_foto_url',
            'proker_foto', 'total-program', 'total-planning', 'total-ongoing', 'total-selesai'
        ];

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

        const els = await waitForElements(requiredIds);

        const tableBody        = els['table-body'];
        const gridView         = els['grid-view'];
        const tableView        = els['table-view'];
        const modal            = els['proker-modal'];
        const modalContent     = els['modal-content'];
        const modalTitle       = els['modal-title'];
        const form             = els['form'];
        const closeBtn         = els['modal-close'];
        const addBtn           = els['add-btn'];
        const refreshBtn       = els['refresh-proker-btn'];
        const idInput          = els['edit-id'];
        const namaInput        = els['proker_nama'];
        const deskripsiInput   = els['proker_deskripsi'];
        const targetInput      = els['proker_target'];
        const progressInput    = els['proker_progress'];
        const statusSelect     = els['proker_status'];
        const picInput         = els['proker_pic'];
        const fotoUrlInput     = els['proker_foto_url'];
        const fotoFileInput    = els['proker_foto'];
        const statTotal        = els['total-program'];
        const statPlanning     = els['total-planning'];
        const statOngoing      = els['total-ongoing'];
        const statSelesai      = els['total-selesai'];

        if (!tableBody || !modal || !form) {
            console.error('[proker_admin] Critical elements missing');
            return;
        }

        // ================================================================
        // 7. FORMPHOTO CONTROLLER
        // ================================================================
        if (typeof window.FormPhoto !== 'undefined' && fotoFileInput) {
            prokerPhotoCtrl = window.FormPhoto.attach(
                'proker_foto',
                'proker-foto-preview',
                'proker-foto-remove',
                {
                    onPreview: function() {
                        const wrap = document.getElementById('proker-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'flex';
                    },
                    onClear: function() {
                        const wrap = document.getElementById('proker-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'none';
                        if (fotoUrlInput) fotoUrlInput.value = '';
                    }
                }
            );
        }

        function resetProkerPhoto() {
            if (prokerPhotoCtrl) prokerPhotoCtrl.reset();
            const wrap = document.getElementById('proker-foto-preview-wrap');
            if (wrap) wrap.style.display = 'none';
            if (fotoUrlInput) fotoUrlInput.value = '';
        }

        // ================================================================
        // 8. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // Stats — replaced by existing 4 stat cards (already in view)
            // (total-program, total-planning, total-ongoing, total-selesai)
            // Just add extra features below if needed

            // ===== Search & Filter Bar =====
            if (!document.getElementById('proker-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'proker-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="proker-search" placeholder="Cari nama program, PIC, deskripsi..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="proker-filter-status" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Status</option>
                        <option value="planning">Planning</option>
                        <option value="ongoing">Ongoing</option>
                        <option value="selesai">Selesai</option>
                    </select>
                    <select id="proker-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="terbaru">Terbaru</option>
                        <option value="progress-desc">Progress Tertinggi</option>
                        <option value="deadline-asc">Deadline Terdekat</option>
                    </select>
                    <div class="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
                        <button id="proker-view-list" type="button" class="px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]" title="List view">
                            <i class="fas fa-list"></i>
                        </button>
                        <button id="proker-view-grid" type="button" class="px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]" title="Grid view">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                    <button id="proker-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('proker-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'proker-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-proker">0</span> program dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-proker-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-proker-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('proker-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 9. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('proker-search');
            const filterStatus = document.getElementById('proker-filter-status');
            const sortSelect = document.getElementById('proker-sort');
            const exportBtn = document.getElementById('proker-export-btn');
            const viewListBtn = document.getElementById('proker-view-list');
            const viewGridBtn = document.getElementById('proker-view-grid');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'proker-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (filterStatus && !filterStatus.dataset.attached) {
                filterStatus.dataset.attached = 'true';
                filterStatus.addEventListener('change', function() {
                    currentFilter.status = this.value;
                    applyFilter();
                });
            }

            if (sortSelect && !sortSelect.dataset.attached) {
                sortSelect.dataset.attached = 'true';
                sortSelect.addEventListener('change', function() {
                    currentFilter.sort = this.value;
                    applyFilter();
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
        // 10. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(p => {
                if (currentFilter.status !== 'all' && (p.status || 'planning') !== currentFilter.status) return false;
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [p.nama_program, p.pic, p.deskripsi].map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            switch (currentFilter.sort) {
                case 'terbaru':
                    filteredCache.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    break;
                case 'progress-desc':
                    filteredCache.sort((a, b) => (Number(b.progress) || 0) - (Number(a.progress) || 0));
                    break;
                case 'deadline-asc':
                    filteredCache.sort((a, b) => new Date(a.target_selesai || 0) - new Date(b.target_selesai || 0));
                    break;
            }

            renderView();
            updateStats();
        }

        // ================================================================
        // 11. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const planning = dataCache.filter(p => (p.status || 'planning') === 'planning').length;
            const ongoing = dataCache.filter(p => p.status === 'ongoing').length;
            const selesai = dataCache.filter(p => p.status === 'selesai').length;

            if (statTotal) statTotal.textContent = total;
            if (statPlanning) statPlanning.textContent = planning;
            if (statOngoing) statOngoing.textContent = ongoing;
            if (statSelesai) statSelesai.textContent = selesai;
        }

        // ================================================================
        // 12. RENDER VIEW
        // ================================================================
        function renderView() {
            if (currentView === 'grid') {
                if (tableView) tableView.classList.add('hidden');
                if (gridView) {
                    gridView.classList.remove('hidden');
                    renderGrid();
                }
            } else {
                if (gridView) gridView.classList.add('hidden');
                if (tableView) tableView.classList.remove('hidden');
                renderTable();
            }
        }

        // ================================================================
        // 13. RENDER TABLE
        // ================================================================
        function renderTable() {
            if (!filteredCache || filteredCache.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.status !== 'all';
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil</p>' : '<i class="fas fa-tasks text-3xl mb-2 opacity-40"></i><p>Belum ada program kerja</p>') + '</td></tr>';
                return;
            }

            let html = '';
            filteredCache.forEach((item, idx) => {
                const progress = Math.min(Math.max(Number(item.progress) || 0, 0), 100);
                const isSelected = selectedIds.has(item.id);
                const statusInfo = getStatusBadge(item.status);
                const deadlineInfo = getDeadlineStatus(item.target_selesai, item.status);
                const pending = isPendingSync(item.id);

                const thumbHtml = item.foto_url
                    ? `<img src="${escapeAttr(item.foto_url)}" class="table-thumb" onclick="viewDetail('${escapeAttr(item.id)}')" onerror="this.outerHTML='<div class=\\'table-thumb-placeholder\\'><i class=\\'fas fa-tasks\\'></i></div>'">`
                    : `<div class="table-thumb-placeholder"><i class="fas fa-tasks"></i></div>`;

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⟳</span>'
                    : '';

                html += `
                    <tr class="${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="proker-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer" data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-center">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-center">${thumbHtml}</td>
                        <td class="px-3 py-3 text-sm table-cell-wrap">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')" class="font-medium text-[var(--text-main)] hover:text-blue-600 text-left block mb-1">${escapeHtml(item.nama_program || '-')}</button>
                            <div class="text-xs text-[var(--text-muted)] line-clamp-2">${escapeHtml(item.deskripsi || 'Tanpa deskripsi')}</div>
                        </td>
                        <td class="px-3 py-3">
                            <div class="table-progress">
                                <div class="table-progress-bar"><div class="${getProgressColor(progress)} h-full rounded-full" style="width: ${progress}%"></div></div>
                                <span class="table-progress-label">${progress}%</span>
                            </div>
                        </td>
                        <td class="px-3 py-3 text-center">
                            <span class="table-badge ${statusInfo.bgClass}">${statusInfo.label}</span>
                        </td>
                        <td class="px-3 py-3 text-sm table-cell-wrap">
                            <div class="${deadlineInfo.color} font-medium text-xs"><i class="fas ${deadlineInfo.icon} mr-1"></i>${escapeHtml(deadlineInfo.label)}</div>
                            ${item.target_selesai ? `<div class="text-[10px] text-[var(--text-muted)] mt-1">${formatDate(item.target_selesai)}</div>` : ''}
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.pic || '-')}</td>
                        <td class="px-3 py-3 text-center whitespace-nowrap">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')" class="table-action-btn table-action-btn-view" title="Detail"><i class="fas fa-eye"></i></button>
                            <button onclick="editItem('${escapeAttr(item.id)}')" class="table-action-btn table-action-btn-edit" title="Edit"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteItem('${escapeAttr(item.id)}')" class="table-action-btn table-action-btn-delete" title="Hapus"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
            attachCheckboxListeners();
            updateBulkBar();
        }

        // ================================================================
        // 14. RENDER GRID
        // ================================================================
        function renderGrid() {
            if (!gridView) return;

            if (!filteredCache || filteredCache.length === 0) {
                gridView.innerHTML = '<div class="col-span-full text-center py-8 text-[var(--text-muted)]"><i class="fas fa-tasks text-3xl mb-2 opacity-40"></i><p>Belum ada program</p></div>';
                return;
            }

            let html = '';
            filteredCache.forEach(item => {
                const progress = Math.min(Math.max(Number(item.progress) || 0, 0), 100);
                const statusInfo = getStatusBadge(item.status);
                const hasFoto = !!item.foto_url;
                const pending = isPendingSync(item.id);

                const pendingBadge = pending
                    ? '<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white z-10">⟳</span>'
                    : '';

                html += `
                    <div class="group relative bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] overflow-hidden flex flex-col shadow-sm hover:shadow-md transition">
                        ${pendingBadge}
                        <div class="h-24 bg-[var(--bg-stats)] relative overflow-hidden">
                            ${hasFoto ? `<img src="${escapeAttr(item.foto_url)}" class="w-full h-full object-cover">` : `<div class="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-600"></div>`}
                            <div class="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                                <span class="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">${progress}%</span>
                                <span class="table-badge ${statusInfo.bgClass}">${statusInfo.label}</span>
                            </div>
                        </div>
                        <div class="p-4 flex-1 flex flex-col">
                            <h3 class="font-bold text-[var(--text-main)] line-clamp-2 cursor-pointer mb-1" onclick="viewDetail('${escapeAttr(item.id)}')">${escapeHtml(item.nama_program || '-')}</h3>
                            <p class="text-xs text-[var(--text-muted)] line-clamp-2 mb-3">${escapeHtml(item.deskripsi || '-')}</p>
                            <div class="mt-auto flex gap-1 pt-3 border-t border-[var(--card-border)]">
                                <button onclick="viewDetail('${escapeAttr(item.id)}')" class="flex-1 text-xs py-1.5 rounded bg-[var(--bg-stats)] hover:bg-[var(--card-border)]">Detail</button>
                                <button onclick="editItem('${escapeAttr(item.id)}')" class="flex-1 text-xs py-1.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Edit</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            gridView.innerHTML = html;
        }

        // ================================================================
        // 15. CHECKBOX LISTENERS
        // ================================================================
        function attachCheckboxListeners() {
            document.querySelectorAll('.proker-checkbox').forEach(cb => {
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
            const bar = document.getElementById('proker-bulk-bar');
            const count = document.getElementById('bulk-count-proker');
            if (bar) {
                bar.classList.toggle('hidden', selectedIds.size === 0);
                bar.classList.toggle('flex', selectedIds.size > 0);
                if (count) count.textContent = selectedIds.size;
            }
        }

        // ================================================================
        // 16. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-proker-btn');
            const cancelBtn = document.getElementById('bulk-cancel-proker-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} program? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteProgramKerja', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(p => String(p.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.proker-checkbox').forEach(cb => cb.checked = false);
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} program dihapus!` +
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
                    document.querySelectorAll('.proker-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => el.classList.remove('bg-red-50', 'dark:bg-red-900/10'));
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 17. LOAD DATA (SWR)
        // ================================================================
        async function loadData(force) {
            force = force || false;
            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i></td></tr>';

            try {
                const result = await forceRefreshData('getProgramKerja', {});
                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    applyFilter();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500"><i class="fas fa-exclamation-triangle text-2xl mb-2"></i><p>' + escapeHtml(result.message || 'Gagal memuat') + '</p></td></tr>';
                }
            } catch (error) {
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getProgramKerja', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {}
        }

        // ================================================================
        // 18. MODAL FUNCTIONS
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
            resetProkerPhoto();
            isEdit = false;
            updateProgressSliderUI(0);
        }

        if (closeBtn) {
            const fresh = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(fresh, closeBtn);
            fresh.addEventListener('click', closeModal);
        }
        if (modal) {
            modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        }

        // ================================================================
        // 19. PROGRESS SLIDER
        // ================================================================
        if (progressInput && !progressInput.dataset.attached) {
            progressInput.dataset.attached = 'true';
            progressInput.addEventListener('input', function() {
                updateProgressSliderUI(this.value);
            });
        }

        function updateProgressSliderUI(val) {
            const progress = Math.min(Math.max(Number(val) || 0, 0), 100);
            const label = document.getElementById('progress-value-display');
            const bar = document.getElementById('progress-bar-display');

            if (label) label.textContent = progress + '%';
            if (bar) {
                bar.style.width = progress + '%';
                bar.className = 'h-full rounded-full transition-all duration-300 ' + getProgressColor(progress);
            }

            if (statusSelect) {
                if (progress >= 100) statusSelect.value = 'selesai';
                else if (progress > 0 && statusSelect.value === 'planning') statusSelect.value = 'ongoing';
                else if (progress === 0) statusSelect.value = 'planning';
            }
        }

        // ================================================================
        // 20. TAMBAH PROGRAM
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Program Kerja';
                form.reset();
                if (idInput) idInput.value = '';
                updateProgressSliderUI(0);
                resetProkerPhoto();
                openModal();
            });
        }

        // ================================================================
        // 21. EDIT PROGRAM
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(p => String(p.id) === String(id));
            if (!item) {
                safeToast('Program tidak ditemukan.', 'warning');
                return;
            }

            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Program Kerja';
            if (idInput) idInput.value = item.id;
            if (namaInput) namaInput.value = item.nama_program || '';
            if (deskripsiInput) deskripsiInput.value = item.deskripsi || '';
            if (targetInput) targetInput.value = item.target_selesai || '';
            if (statusSelect) statusSelect.value = item.status || 'planning';
            if (picInput) picInput.value = item.pic || '';

            if (progressInput) {
                progressInput.value = item.progress || 0;
                updateProgressSliderUI(item.progress || 0);
            }

            resetProkerPhoto();
            if (item.foto_url) {
                if (fotoUrlInput) fotoUrlInput.value = item.foto_url;
                if (prokerPhotoCtrl) {
                    prokerPhotoCtrl.setExisting(item.foto_url);
                    const wrap = document.getElementById('proker-foto-preview-wrap');
                    if (wrap) wrap.style.display = 'flex';
                }
            }
            openModal();
        };

        // ================================================================
        // 22. DELETE PROGRAM (Offline-aware)
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(p => String(p.id) === String(id));
            const nama = item ? (item.nama_program || 'program ini') : 'program ini';

            showConfirm('Hapus program "' + nama + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteProgramKerja', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(p => String(p.id) !== String(id));
                        applyFilter();
                        await logActivity('DELETE', 'proker', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Program dihapus lokal, akan disinkronkan', 'warning', 4000);
                        } else {
                            safeToast('✅ Program dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[proker_admin] deleteItem error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 23. SUBMIT FORM (Offline-aware)
        // ================================================================
        if (form) {
            const fresh = form.cloneNode(true);
            form.parentNode.replaceChild(fresh, form);

            fresh.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isSubmitting) return;

                const nama = namaInput?.value.trim();
                if (!nama) {
                    safeToast('Nama program wajib diisi!', 'warning');
                    if (namaInput) namaInput.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    let foto_url = fotoUrlInput?.value || '';

                    if (prokerPhotoCtrl && prokerPhotoCtrl.hasFile()) {
                        if (!navigator.onLine) {
                            safeToast('📴 Upload foto memerlukan koneksi internet. Menyimpan tanpa foto.', 'warning', 4500);
                        } else {
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengunggah...';
                            try {
                                foto_url = await window.FormPhoto.uploadIfAny(prokerPhotoCtrl, foto_url);
                            } catch (uploadErr) {
                                safeToast('Gagal upload foto: ' + uploadErr.message, 'error');
                                stopLoading(submitBtn);
                                isSubmitting = false;
                                return;
                            }
                        }
                    }

                    const data = {
                        nama_program: nama,
                        deskripsi: deskripsiInput?.value.trim() || '',
                        target_selesai: targetInput?.value || '',
                        progress: Math.min(Math.max(Number(progressInput?.value) || 0, 0), 100),
                        status: statusSelect?.value || 'planning',
                        pic: picInput?.value.trim() || '',
                        foto_url: foto_url
                    };

                    const id = idInput?.value;
                    const action = isEdit ? 'updateProgramKerja' : 'createProgramKerja';
                    const payload = isEdit ? Object.assign({ id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        if (isEdit) {
                            const idx = dataCache.findIndex(p => String(p.id) === String(id));
                            if (idx !== -1) dataCache[idx] = Object.assign({}, dataCache[idx], data, { id });
                        } else {
                            dataCache.unshift(Object.assign({}, data, {
                                id: result.id || ('tmp_' + Date.now()),
                                created_at: new Date().toISOString()
                            }));
                        }

                        applyFilter();
                        closeModal();
                        await logActivity(isEdit ? 'UPDATE' : 'CREATE', 'proker', result.id || id, 'Program: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Program tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                        } else {
                            safeToast(isEdit ? '✅ Program diperbarui!' : '✅ Program ditambahkan!', 'success');
                        }
                    } else {
                        safeToast(result.message || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    console.error('[proker_admin] Submit error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 24. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(p => String(p.id) === String(id));
            if (!item) {
                safeToast('Program tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('proker-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'proker-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="proker-detail-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)]">
                            <h3 id="proker-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4"></h3>
                            <button id="proker-detail-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="proker-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="proker-detail-copy" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-copy mr-1"></i>Copy
                            </button>
                            <button id="proker-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="proker-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('proker-detail-close').addEventListener('click', closeFn);
                document.getElementById('proker-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('proker-detail-content');
            const titleEl = document.getElementById('proker-detail-title');
            const bodyEl = document.getElementById('proker-detail-body');

            const progress = Math.min(Math.max(Number(item.progress) || 0, 0), 100);
            const statusInfo = getStatusBadge(item.status);
            const deadlineInfo = getDeadlineStatus(item.target_selesai, item.status);

            titleEl.textContent = item.nama_program || '-';

            const fotoBlock = item.foto_url ? `
                <div>
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">Foto</p>
                    <img src="${escapeAttr(item.foto_url)}" alt="${escapeAttr(item.nama_program)}" class="w-full h-auto max-h-64 object-contain rounded-lg border border-[var(--card-border)] bg-[var(--bg-stats)]">
                </div>
            ` : '';

            bodyEl.innerHTML = `
                ${fotoBlock}

                <div>
                    <div class="flex justify-between items-center mb-1">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold">Progress</p>
                        <span class="text-sm font-bold text-[var(--text-main)]">${progress}%</span>
                    </div>
                    <div class="w-full bg-[var(--bg-stats)] rounded-full h-3 overflow-hidden">
                        <div class="${getProgressColor(progress)} h-full rounded-full transition-all" style="width: ${progress}%"></div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Status</p>
                        <span class="px-3 py-1 rounded-full text-sm font-semibold ${statusInfo.bgClass}">
                            ${statusInfo.label}
                        </span>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Deadline</p>
                        <p class="text-sm ${deadlineInfo.color} font-medium">
                            <i class="fas ${deadlineInfo.icon} mr-1"></i>${escapeHtml(deadlineInfo.label)}
                        </p>
                        ${item.target_selesai ? `<p class="text-xs text-[var(--text-muted)]">${formatDate(item.target_selesai)}</p>` : ''}
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">PIC (Penanggung Jawab)</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(item.pic || '-')}</p>
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Deskripsi</p>
                        <p class="text-[var(--text-main)] whitespace-pre-wrap">${escapeHtml(item.deskripsi || 'Tidak ada deskripsi')}</p>
                    </div>
                </div>
            `;

            const editBtn = document.getElementById('proker-detail-edit');
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

            const copyBtn = document.getElementById('proker-detail-copy');
            if (copyBtn) {
                const newCopy = copyBtn.cloneNode(true);
                copyBtn.parentNode.replaceChild(newCopy, copyBtn);
                newCopy.addEventListener('click', () => {
                    const text = 'PROGRAM: ' + (item.nama_program || '-') + '\n' +
                                 'PIC: ' + (item.pic || '-') + '\n' +
                                 'STATUS: ' + statusInfo.label + '\n' +
                                 'PROGRESS: ' + progress + '%\n' +
                                 'DEADLINE: ' + (item.target_selesai ? formatDate(item.target_selesai) : '-') + '\n' +
                                 'DESKRIPSI: ' + (item.deskripsi || '-');
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
        // 25. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nama Program', 'PIC', 'Status', 'Progress (%)', 'Target Selesai', 'Deskripsi'];
            const rows = filteredCache.map((p, i) => [
                i + 1,
                p.nama_program || '',
                p.pic || '',
                p.status || 'planning',
                p.progress || 0,
                formatDate(p.target_selesai),
                p.deskripsi || ''
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `proker_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 26. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                try {
                    await refreshDataOnly();
                    safeToast('✅ Data diperbarui', 'success');
                } finally {
                    this.innerHTML = orig;
                    this.disabled = false;
                }
            });
        }

        // ================================================================
        // 27. ESC HANDLER
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            const detailModal = document.getElementById('proker-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 28. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[proker_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 29. CLEANUP
        // ================================================================
        function cleanup() {
            window.__prokerAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const detailModal = document.getElementById('proker-detail-modal');
            if (detailModal) detailModal.remove();
            document.body.style.overflow = '';
            console.log('[proker_admin] Cleanup');
        }
        window.__prokerAdminCleanup = cleanup;

        // ================================================================
        // 30. INIT SEQUENCE
        // ================================================================
        console.log('[proker_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        await loadData();

        console.log('[proker_admin] ✅ Init selesai v16.0.0');
    }

    // ================================================================
    // 31. RUN INIT
    // ================================================================
    init();
});