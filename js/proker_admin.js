/**
 * js/proker_admin.js
 * Modul Admin Program Kerja - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi + cleanup via router
 *  - XSS protection di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - isSubmitting anti double-submit
 *  - Progress slider interaktif
 *  - Deadline overdue detection
 *  - Confirm dialog proper
 *
 * FEATURES:
 *  - Stats 4 kartu (Total, Planning, Ongoing, Selesai)
 *  - Search real-time (nama program, PIC, deskripsi)
 *  - Filter status (planning/ongoing/selesai)
 *  - Sort (terbaru, progress, deadline)
 *  - Grid view & List view toggle
 *  - CRUD lengkap dengan progress slider
 *  - Bulk delete multiple programs
 *  - Detail modal dengan progress visual + timeline
 *  - Auto-update status berdasarkan progress
 *  - Deadline warning (overdue/today/soon)
 *  - Export CSV
 *  - Timeline target dalam bahasa Indonesia
 *  - XSS protection
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('proker_admin', function() {
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
    if (window.__prokerAdminLoaded) {
        console.log('[proker_admin] Sudah di-init, skip.');
        return;
    }
    window.__prokerAdminLoaded = true;

    // ================================================================
    // 3. HELPER: TUNGGU ELEMEN DOM SIAP
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

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function daysUntil(target) {
        if (!target) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const t = new Date(target);
        if (isNaN(t.getTime())) return null;
        t.setHours(0, 0, 0, 0);
        return Math.ceil((t - now) / (1000 * 60 * 60 * 24));
    }

    function getDeadlineStatus(target, status) {
        if (status === 'selesai') return { label: 'Selesai', color: 'green', icon: 'fa-check-circle' };
        if (!target) return { label: 'Tanpa Target', color: 'gray', icon: 'fa-question' };

        const days = daysUntil(target);
        if (days === null) return { label: 'Tanpa Target', color: 'gray', icon: 'fa-question' };

        if (days < 0) return { label: 'Overdue ' + Math.abs(days) + ' hari', color: 'red', icon: 'fa-exclamation-triangle' };
        if (days === 0) return { label: 'Deadline Hari Ini', color: 'red', icon: 'fa-exclamation-circle' };
        if (days <= 7) return { label: days + ' hari lagi', color: 'yellow', icon: 'fa-clock' };
        if (days <= 30) return { label: days + ' hari lagi', color: 'blue', icon: 'fa-calendar' };
        return { label: formatDate(target), color: 'gray', icon: 'fa-calendar' };
    }

    function getProgressColor(progress) {
        const p = Number(progress) || 0;
        if (p >= 100) return 'bg-green-500';
        if (p >= 75) return 'bg-blue-500';
        if (p >= 50) return 'bg-indigo-500';
        if (p >= 25) return 'bg-yellow-500';
        return 'bg-red-500';
    }

    function getProgressGradient(progress) {
        const p = Number(progress) || 0;
        if (p >= 100) return 'from-green-400 to-emerald-600';
        if (p >= 75) return 'from-blue-400 to-indigo-600';
        if (p >= 50) return 'from-indigo-400 to-violet-600';
        if (p >= 25) return 'from-yellow-400 to-amber-600';
        return 'from-red-400 to-rose-600';
    }

    function getStatusBadge(status) {
        const map = {
            planning: {
                label: 'Planning',
                cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                icon: 'fa-hourglass-start'
            },
            ongoing: {
                label: 'Ongoing',
                cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                icon: 'fa-spinner'
            },
            selesai: {
                label: 'Selesai',
                cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                icon: 'fa-check-circle'
            }
        };
        return map[status] || map.planning;
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

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'table-body',
            'proker-modal', 'modal-content', 'modal-title',
            'form', 'modal-close',
            'add-btn', 'refresh-proker-btn',
            'edit-id', 'proker_nama', 'proker_deskripsi', 'proker_target',
            'proker_progress', 'proker_status', 'proker_pic',
            'total-program', 'total-planning', 'total-ongoing', 'total-selesai'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody        = els['table-body'];
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

        if (!tableBody || !modal || !form) {
            console.error('[proker_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = {
            search: '',
            status: 'all',
            sort: 'terbaru'
        };
        let currentView = 'list'; // 'list' | 'grid'
        let isSubmitting = false;
        let selectedIds = new Set();

        // ================================================================
        // 7. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.flex-wrap.justify-between.items-center')
                        || mainContent.querySelector('.flex.justify-between.items-center');

            // ===== Stats: re-work existing stats dengan visual lebih baik =====
            // (View sudah ada stats, kita hanya enhance)

            // ===== Search & Filter Bar =====
            if (!document.getElementById('proker-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'proker-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="proker-search" placeholder="Cari program, PIC..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    </div>
                    <select id="proker-filter-status"
                        class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                        <option value="all">Semua Status</option>
                        <option value="planning">📋 Planning</option>
                        <option value="ongoing">⚙️ Ongoing</option>
                        <option value="selesai">✅ Selesai</option>
                    </select>
                    <select id="proker-sort"
                        class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                        <option value="terbaru">Terbaru</option>
                        <option value="terlama">Terlama</option>
                        <option value="progress-desc">Progress ↓</option>
                        <option value="progress-asc">Progress ↑</option>
                        <option value="deadline-asc">Deadline Terdekat</option>
                    </select>
                    <div class="flex rounded-lg overflow-hidden border border-[var(--card-border)]">
                        <button id="proker-view-list" type="button" class="px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]" title="List view">
                            <i class="fas fa-list"></i>
                        </button>
                        <button id="proker-view-grid" type="button" class="px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]" title="Grid view">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                    <button id="proker-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm" title="Export CSV">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                    <button id="proker-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                // Sisipkan setelah stats (sebelum tabel)
                const statsGrid = mainContent.querySelector('.grid.grid-cols-1.sm\\:grid-cols-4') ||
                                 mainContent.querySelector('.grid.grid-cols-1.sm\\:grid-cols-4.gap-4');
                const tableWrapper = tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]');

                if (statsGrid && statsGrid.parentNode) {
                    statsGrid.parentNode.insertBefore(wrapper, statsGrid.nextSibling);
                } else if (tableWrapper && tableWrapper.parentNode) {
                    tableWrapper.parentNode.insertBefore(wrapper, tableWrapper);
                }

                attachFilterListeners();
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

            // ===== Grid Container (hidden default) =====
            if (!document.getElementById('proker-grid-view')) {
                const gridContainer = document.createElement('div');
                gridContainer.id = 'proker-grid-view';
                gridContainer.className = 'hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

                const tableWrapper = tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]');
                if (tableWrapper && tableWrapper.parentNode) {
                    tableWrapper.parentNode.insertBefore(gridContainer, tableWrapper);
                }
            }
        }

        // ================================================================
        // 8. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('proker-search');
            const statusFilter = document.getElementById('proker-filter-status');
            const sortSelect = document.getElementById('proker-sort');
            const clearBtn = document.getElementById('proker-clear-filter');
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

            if (statusFilter && !statusFilter.dataset.attached) {
                statusFilter.dataset.attached = 'true';
                statusFilter.addEventListener('change', function() {
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

            if (clearBtn && !clearBtn.dataset.attached) {
                clearBtn.dataset.attached = 'true';
                clearBtn.addEventListener('click', () => {
                    currentFilter = { search: '', status: 'all', sort: 'terbaru' };
                    if (searchInput) searchInput.value = '';
                    if (statusFilter) statusFilter.value = 'all';
                    if (sortSelect) sortSelect.value = 'terbaru';
                    applyFilter();
                    showToast('Filter direset.', 'info', 2000);
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
                    localStorage.setItem('prokerView', 'list');
                    updateViewToggleUI();
                    applyFilter();
                });
            }

            if (viewGridBtn && !viewGridBtn.dataset.attached) {
                viewGridBtn.dataset.attached = 'true';
                viewGridBtn.addEventListener('click', () => {
                    currentView = 'grid';
                    localStorage.setItem('prokerView', 'grid');
                    updateViewToggleUI();
                    applyFilter();
                });
            }
        }

        function updateViewToggleUI() {
            const viewListBtn = document.getElementById('proker-view-list');
            const viewGridBtn = document.getElementById('proker-view-grid');
            if (!viewListBtn || !viewGridBtn) return;

            if (currentView === 'list') {
                viewListBtn.className = 'px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]';
                viewGridBtn.className = 'px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]';
            } else {
                viewListBtn.className = 'px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]';
                viewGridBtn.className = 'px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]';
            }
        }

        // ================================================================
        // 9. APPLY FILTER & SORT
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(p => {
                // Filter status
                if (currentFilter.status !== 'all') {
                    if ((p.status || 'planning') !== currentFilter.status) return false;
                }

                // Filter search
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [p.nama_program, p.pic, p.deskripsi]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort
            switch (currentFilter.sort) {
                case 'terbaru':
                    filteredCache.sort((a, b) =>
                        new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    break;
                case 'terlama':
                    filteredCache.sort((a, b) =>
                        new Date(a.created_at || 0) - new Date(b.created_at || 0));
                    break;
                case 'progress-desc':
                    filteredCache.sort((a, b) =>
                        (Number(b.progress) || 0) - (Number(a.progress) || 0));
                    break;
                case 'progress-asc':
                    filteredCache.sort((a, b) =>
                        (Number(a.progress) || 0) - (Number(b.progress) || 0));
                    break;
                case 'deadline-asc':
                    filteredCache.sort((a, b) => {
                        if (!a.target_selesai && !b.target_selesai) return 0;
                        if (!a.target_selesai) return 1;
                        if (!b.target_selesai) return -1;
                        return new Date(a.target_selesai) - new Date(b.target_selesai);
                    });
                    break;
            }

            if (currentView === 'grid') {
                renderGrid(filteredCache);
            } else {
                renderTable(filteredCache);
            }
            updateStats();
        }

        // ================================================================
        // 10. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const planning = dataCache.filter(p => (p.status || 'planning') === 'planning').length;
            const ongoing = dataCache.filter(p => p.status === 'ongoing').length;
            const selesai = dataCache.filter(p => p.status === 'selesai').length;

            const el1 = document.getElementById('total-program');
            const el2 = document.getElementById('total-planning');
            const el3 = document.getElementById('total-ongoing');
            const el4 = document.getElementById('total-selesai');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = planning;
            if (el3) el3.textContent = ongoing;
            if (el4) el4.textContent = selesai;
        }

        // ================================================================
        // 11. LOAD DATA (SWR)
        // ================================================================
        async function loadData(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-main)]"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data program...</p></td></tr>';

            try {
                const result = await forceRefreshData('getProgramKerja', {});

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
                console.error('[proker_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getProgramKerja', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[proker_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 12. RENDER TABLE (LIST VIEW)
        // ================================================================
        function renderTable(data) {
            // Show table, hide grid
            const tableWrapper = tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]');
            const gridContainer = document.getElementById('proker-grid-view');
            if (tableWrapper) tableWrapper.classList.remove('hidden');
            if (gridContainer) gridContainer.classList.add('hidden');

            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.status !== 'all';
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-tasks text-3xl mb-2 opacity-40"></i><p>Belum ada program kerja</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((item, idx) => {
                const progress = Math.min(Math.max(Number(item.progress) || 0, 0), 100);
                const barColor = getProgressColor(progress);
                const statusInfo = getStatusBadge(item.status || 'planning');
                const deadlineInfo = getDeadlineStatus(item.target_selesai, item.status);
                const isSelected = selectedIds.has(item.id);

                const deadlineColorMap = {
                    red: 'text-red-600 dark:text-red-400',
                    yellow: 'text-yellow-600 dark:text-yellow-400',
                    blue: 'text-blue-600 dark:text-blue-400',
                    green: 'text-green-600 dark:text-green-400',
                    gray: 'text-[var(--text-muted)]'
                };
                const deadlineCls = deadlineColorMap[deadlineInfo.color] || deadlineColorMap.gray;

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="proker-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${item.id}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400 text-left">
                                ${escapeHtml(item.nama_program || '-')}
                            </button>
                            <div class="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">
                                ${escapeHtml(item.deskripsi || '')}
                            </div>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 min-w-[80px]">
                                    <div class="w-full bg-[var(--bg-stats)] rounded-full h-2 overflow-hidden">
                                        <div class="${barColor} h-full rounded-full transition-all duration-500"
                                            style="width: ${progress}%"></div>
                                    </div>
                                </div>
                                <span class="text-xs font-bold text-[var(--text-main)] whitespace-nowrap">${progress}%</span>
                            </div>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${statusInfo.cls}">
                                <i class="fas ${statusInfo.icon} text-[10px]"></i>${statusInfo.label}
                            </span>
                        </td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <div class="${deadlineCls} font-medium text-xs">
                                <i class="fas ${deadlineInfo.icon} mr-1"></i>${escapeHtml(deadlineInfo.label)}
                            </div>
                            ${item.target_selesai ? `<div class="text-xs text-[var(--text-muted)] mt-0.5">${formatDate(item.target_selesai)}</div>` : ''}
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.pic || '-')}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="viewDetail('${item.id}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Detail">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editItem('${item.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteItem('${item.id}')"
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
        // 13. RENDER GRID VIEW
        // ================================================================
        function renderGrid(data) {
            const tableWrapper = tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]');
            const gridContainer = document.getElementById('proker-grid-view');
            if (tableWrapper) tableWrapper.classList.add('hidden');
            if (!gridContainer) return;
            gridContainer.classList.remove('hidden');

            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.status !== 'all';
                gridContainer.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas ${isFiltered ? 'fa-search' : 'fa-tasks'} text-4xl mb-3 opacity-40"></i>
                        <p>${isFiltered ? 'Tidak ada hasil yang cocok' : 'Belum ada program kerja'}</p>
                    </div>
                `;
                return;
            }

            let html = '';
            data.forEach(item => {
                const progress = Math.min(Math.max(Number(item.progress) || 0, 0), 100);
                const statusInfo = getStatusBadge(item.status || 'planning');
                const deadlineInfo = getDeadlineStatus(item.target_selesai, item.status);
                const gradClass = getProgressGradient(progress);

                const deadlineColorMap = {
                    red: 'text-red-600 dark:text-red-400',
                    yellow: 'text-yellow-600 dark:text-yellow-400',
                    blue: 'text-blue-600 dark:text-blue-400',
                    green: 'text-green-600 dark:text-green-400',
                    gray: 'text-[var(--text-muted)]'
                };
                const deadlineCls = deadlineColorMap[deadlineInfo.color] || deadlineColorMap.gray;

                html += `
                    <div class="group bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                        <div class="relative h-20 bg-gradient-to-br ${gradClass} flex items-end justify-between p-4">
                            <div class="text-white">
                                <p class="text-xs opacity-90 uppercase tracking-wide">Progress</p>
                                <p class="text-3xl font-bold">${progress}%</p>
                            </div>
                            <div class="text-white/90">
                                <i class="fas fa-tasks text-4xl opacity-40"></i>
                            </div>
                        </div>
                        <div class="p-5">
                            <div class="flex items-start justify-between gap-2 mb-2">
                                <h3 class="text-base font-bold text-[var(--text-main)] font-amiri line-clamp-2 flex-1 cursor-pointer"
                                    onclick="viewDetail('${item.id}')">
                                    ${escapeHtml(item.nama_program || '-')}
                                </h3>
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusInfo.cls} flex-shrink-0">
                                    ${statusInfo.label}
                                </span>
                            </div>
                            <p class="text-xs text-[var(--text-muted)] mb-3 line-clamp-2">
                                ${escapeHtml(item.deskripsi || 'Tidak ada deskripsi.')}
                            </p>

                            <div class="space-y-1.5 mb-4">
                                <div class="flex items-center gap-2 text-xs ${deadlineCls}">
                                    <i class="fas ${deadlineInfo.icon}"></i>
                                    <span class="font-medium">${escapeHtml(deadlineInfo.label)}</span>
                                </div>
                                ${item.pic ? `
                                    <div class="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                        <i class="fas fa-user"></i>
                                        <span>${escapeHtml(item.pic)}</span>
                                    </div>
                                ` : ''}
                            </div>

                            <div class="flex gap-1 pt-3 border-t border-[var(--card-border)]">
                                <button onclick="viewDetail('${item.id}')"
                                    class="flex-1 text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] transition"
                                    title="Detail">
                                    <i class="fas fa-eye"></i> Detail
                                </button>
                                <button onclick="editItem('${item.id}')"
                                    class="flex-1 text-xs px-2 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:opacity-90 transition"
                                    title="Edit">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button onclick="deleteItem('${item.id}')"
                                    class="text-xs px-2 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:opacity-90 transition"
                                    title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            gridContainer.innerHTML = html;
        }

        function updateThead() {
            const thead = tableBody.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-proker')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-proker w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-proker');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.proker-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('proker-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-proker');
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
            const delBtn = document.getElementById('bulk-delete-proker-btn');
            const cancelBtn = document.getElementById('bulk-cancel-proker-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} program kerja? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteProgramKerja', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    dataCache = dataCache.filter(p => p.id !== id);
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.proker-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-proker');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            showToast(`✅ ${ok} program berhasil dihapus!`, 'success');
                        } else {
                            showToast(`${ok} berhasil, ${fail} gagal.`, 'warning');
                        }
                    });
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', () => {
                    selectedIds.clear();
                    document.querySelectorAll('.proker-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-proker');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 15. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(p => p.id === id);
            if (!item) {
                showToast('Program tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('proker-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'proker-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="proker-detail-content"
                         class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)]">
                            <h3 id="proker-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4 line-clamp-2"></h3>
                            <button id="proker-detail-close"
                                class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="proker-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
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
            const gradClass = getProgressGradient(progress);
            const statusInfo = getStatusBadge(item.status || 'planning');
            const deadlineInfo = getDeadlineStatus(item.target_selesai, item.status);

            titleEl.textContent = item.nama_program || '-';

            // Timeline calculation
            const created = item.created_at ? new Date(item.created_at) : null;
            const target = item.target_selesai ? new Date(item.target_selesai) : null;
            let timeProgress = 0;
            if (created && target && target > created) {
                const total = target - created;
                const elapsed = Math.min(Date.now() - created, total);
                timeProgress = Math.round((elapsed / total) * 100);
            }

            bodyEl.innerHTML = `
                <!-- Progress Bar Big -->
                <div class="rounded-xl p-4 bg-gradient-to-br ${gradClass} text-white">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-xs uppercase tracking-wider opacity-90">Progress Program</p>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-white/20 font-bold">
                            ${progress}%
                        </span>
                    </div>
                    <p class="text-4xl font-bold mb-3">${progress}%</p>
                    <div class="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                        <div class="bg-white h-full rounded-full transition-all duration-700" style="width: ${progress}%"></div>
                    </div>
                </div>

                <!-- Status + Deadline -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 rounded-lg bg-[var(--bg-stats)]">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Status</p>
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${statusInfo.cls}">
                            <i class="fas ${statusInfo.icon} text-[10px]"></i>${statusInfo.label}
                        </span>
                    </div>
                    <div class="p-3 rounded-lg bg-[var(--bg-stats)]">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Deadline</p>
                        <p class="text-xs font-medium text-[var(--text-main)]">
                            ${escapeHtml(deadlineInfo.label)}
                        </p>
                        ${item.target_selesai ? `<p class="text-xs text-[var(--text-muted)] mt-0.5">${formatDateLong(item.target_selesai)}</p>` : ''}
                    </div>
                </div>

                <!-- PIC -->
                ${item.pic ? `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">
                            <i class="fas fa-user mr-1"></i>Penanggung Jawab
                        </p>
                        <p class="text-sm text-[var(--text-main)]">${escapeHtml(item.pic)}</p>
                    </div>
                ` : ''}

                <!-- Deskripsi -->
                ${item.deskripsi ? `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                            <i class="fas fa-align-left mr-1"></i>Deskripsi
                        </p>
                        <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.deskripsi)}</p>
                    </div>
                ` : ''}

                <!-- Timeline Visualization -->
                ${created && target ? `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                            <i class="fas fa-clock mr-1"></i>Timeline
                        </p>
                        <div class="space-y-2 text-xs">
                            <div class="flex justify-between text-[var(--text-muted)]">
                                <span>Mulai: ${formatDate(item.created_at)}</span>
                                <span>Target: ${formatDate(item.target_selesai)}</span>
                            </div>
                            <div class="w-full bg-[var(--bg-stats)] rounded-full h-2 overflow-hidden relative">
                                <div class="bg-blue-500 h-full rounded-full transition-all duration-700"
                                    style="width: ${Math.min(timeProgress, 100)}%"></div>
                            </div>
                            <p class="text-center text-[var(--text-muted)]">
                                ${timeProgress >= 100 ? '⏰ Waktu habis' : '⏱️ ' + timeProgress + '% waktu terpakai'}
                            </p>
                        </div>
                    </div>
                ` : ''}
            `;

            // Attach edit btn
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
        // 16. MODAL FORM
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
            if (progressInput) progressInput.value = 0;
            isEdit = false;
            updateProgressSliderUI(0);
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

        // ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            const detailModal = document.getElementById('proker-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (!modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 17. PROGRESS SLIDER UI (Auto-update status)
        // ================================================================
        function updateProgressSliderUI(value) {
            const progress = Math.min(Math.max(Number(value) || 0, 0), 100);

            // Update number display (jika ada)
            let progressDisplay = document.getElementById('proker-progress-display');
            if (!progressDisplay && progressInput && progressInput.parentElement) {
                progressDisplay = document.createElement('div');
                progressDisplay.id = 'proker-progress-display';
                progressDisplay.className = 'mt-2';
                progressDisplay.innerHTML = `
                    <div class="flex items-center justify-between text-xs mb-1">
                        <span class="text-[var(--text-muted)]">Progress</span>
                        <span class="font-bold text-[var(--text-main)]" id="progress-value-display">0%</span>
                    </div>
                    <div class="w-full bg-[var(--bg-stats)] rounded-full h-2 overflow-hidden">
                        <div id="progress-bar-display" class="h-full rounded-full transition-all duration-300 bg-red-500" style="width: 0%"></div>
                    </div>
                `;
                progressInput.parentElement.appendChild(progressDisplay);
            }

            const progressValueEl = document.getElementById('progress-value-display');
            const progressBarEl = document.getElementById('progress-bar-display');

            if (progressValueEl) progressValueEl.textContent = progress + '%';
            if (progressBarEl) {
                progressBarEl.style.width = progress + '%';
                progressBarEl.className = 'h-full rounded-full transition-all duration-300 ' + getProgressColor(progress);
            }

            // Auto-update status
            if (statusSelect) {
                if (progress >= 100 && statusSelect.value !== 'selesai') {
                    statusSelect.value = 'selesai';
                } else if (progress > 0 && progress < 100 && statusSelect.value === 'planning') {
                    statusSelect.value = 'ongoing';
                } else if (progress === 0 && statusSelect.value !== 'planning') {
                    statusSelect.value = 'planning';
                }
            }
        }

        if (progressInput && !progressInput.dataset.sliderAttached) {
            progressInput.dataset.sliderAttached = 'true';
            progressInput.addEventListener('input', function() {
                updateProgressSliderUI(this.value);
            });
        }

        // ================================================================
        // 18. TAMBAH PROGRAM
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Program Kerja';
                form.reset();
                if (idInput) idInput.value = '';
                if (progressInput) progressInput.value = 0;
                if (statusSelect) statusSelect.value = 'planning';
                updateProgressSliderUI(0);
                openModal();
            });
        }

        // ================================================================
        // 19. EDIT PROGRAM
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(p => p.id === id);
            if (!item) {
                showToast('Program tidak ditemukan.', 'warning');
                return;
            }

            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Program Kerja';
            if (idInput) idInput.value = item.id;
            if (namaInput) namaInput.value = item.nama_program || '';
            if (deskripsiInput) deskripsiInput.value = item.deskripsi || '';
            if (targetInput) targetInput.value = item.target_selesai || '';
            if (progressInput) progressInput.value = item.progress || 0;
            if (statusSelect) statusSelect.value = item.status || 'planning';
            if (picInput) picInput.value = item.pic || '';

            updateProgressSliderUI(item.progress || 0);
            openModal();
        };

        // ================================================================
        // 20. DELETE SINGLE
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(p => p.id === id);
            const nama = item ? (item.nama_program || 'program ini') : 'program ini';

            showConfirm('Hapus program "' + nama + '"?', async () => {
                const result = await apiCall('deleteProgramKerja', 'POST', { id });
                if (result && result.success) {
                    dataCache = dataCache.filter(p => p.id !== id);
                    applyFilter();
                    await logActivity('DELETE', 'program_kerja', id, 'Hapus: ' + nama);
                    showToast('Program berhasil dihapus!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 21. SUBMIT FORM (CREATE / UPDATE)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const nama_program = (namaInput.value || '').trim();
            const deskripsi = (deskripsiInput.value || '').trim();
            const target_selesai = targetInput.value;
            const progress = Math.min(Math.max(Number(progressInput.value) || 0, 0), 100);
            const status = statusSelect.value || 'planning';
            const pic = (picInput.value || '').trim();

            if (!nama_program) {
                showToast('Nama program wajib diisi!', 'warning');
                namaInput.focus();
                return;
            }
            if (nama_program.length < 3) {
                showToast('Nama program minimal 3 karakter!', 'warning');
                namaInput.focus();
                return;
            }

            // Auto-adjust status
            let finalStatus = status;
            if (progress >= 100) finalStatus = 'selesai';
            else if (progress > 0 && status === 'planning') finalStatus = 'ongoing';

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                const data = {
                    nama_program: nama_program,
                    deskripsi: deskripsi,
                    target_selesai: target_selesai,
                    progress: progress,
                    status: finalStatus,
                    pic: pic
                };

                const id = idInput.value;
                const action = id ? 'updateProgramKerja' : 'createProgramKerja';
                const payload = id ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    // Update cache lokal
                    if (id) {
                        const idx = dataCache.findIndex(p => p.id === id);
                        if (idx !== -1) dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                    } else {
                        const newItem = Object.assign({}, data, {
                            id: result.id,
                            created_at: new Date().toISOString()
                        });
                        dataCache.unshift(newItem);
                    }

                    applyFilter();
                    closeModal();
                    form.reset();

                    await logActivity(id ? 'UPDATE' : 'CREATE', 'program_kerja', result.id || id, 'Program: ' + nama_program);
                    showToast(id ? '✅ Program berhasil diperbarui!' : '✅ Program berhasil disimpan!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                console.error('[proker_admin] Submit error:', error);
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 22. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                showToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nama Program', 'Deskripsi', 'Progress', 'Status', 'Target Selesai', 'PIC'];
            const rows = filteredCache.map((p, i) => [
                i + 1,
                p.nama_program || '',
                p.deskripsi || '',
                (p.progress || 0) + '%',
                p.status || 'planning',
                p.target_selesai ? formatDate(p.target_selesai) : '-',
                p.pic || ''
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `program_kerja_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast('✅ CSV berhasil diunduh!', 'success');
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

                dataCache = [];
                selectedIds.clear();

                try {
                    await loadData(true);
                    showToast('Data program kerja diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 24. CLEANUP
        // ================================================================
        function cleanup() {
            window.__prokerAdminLoaded = false;
        }
        window.__prokerAdminCleanup = cleanup;

        // ================================================================
        // 25. INIT
        // ================================================================
        console.log('[proker_admin] Init dimulai');

        // Load view preference
        currentView = localStorage.getItem('prokerView') || 'list';

        // Setup UI
        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();
        updateViewToggleUI();
        updateProgressSliderUI(0);

        // Load data
        loadData();

        console.log('[proker_admin] Init selesai');
    }

    // ================================================================
    // 26. RUN INIT
    // ================================================================
    init();
});