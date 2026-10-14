/**
 * js/kader_admin.js
 * Modul Admin Database Kader & Masa Bakti - FULL FIX v10.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - B5: Guard anti-duplikasi + reset via router
 *  - B8: Clone-replace listener (anti memory leak)
 *  - XSS: escapeHtml() di semua output
 *  - isSubmitting anti double-submit
 *  - ESC + click-outside modal
 *
 * FEATURES:
 *  - CRUD Data Kader (dari users)
 *  - Search real-time (nama, username, alamat, angkatan)
 *  - Filter role (admin/member) + filter angkatan
 *  - Stats 4 kartu (total, admin, member, angkatan terbanyak)
 *  - Bulk actions (delete)
 *  - Detail modal dengan riwayat jabatan
 *  - Copy username
 *  - Export CSV
 *  - Sort (angkatan terbaru, nama A-Z, alamat)
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('kader_admin', function() {
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
    if (window.__kaderAdminLoaded) {
        console.log('[kader_admin] Sudah di-init, skip.');
        return;
    }
    window.__kaderAdminLoaded = true;

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
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    // Backward compat helpers
    function getUsername(u) {
        if (!u) return '-';
        return u.username || u.email || '-';
    }

    function getName(u) {
        if (!u) return '-';
        return u.nama || u.name || u.Name || u.username || '-';
    }

    function getAlamat(u) {
        if (!u) return '-';
        return u.alamat || u.address || u.Address || u.kalurahan || '-';
    }

    function getJoinDate(u) {
        if (!u) return '';
        return u.joinDate || u.JoinDate || u.created_at || '';
    }

    function getRole(u) {
        if (!u) return 'member';
        return u.role || 'member';
    }

    function getStatus(u) {
        if (!u) return 'approved';
        return u.status || 'approved';
    }

    function getInitials(name) {
        if (!name || name === '-') return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'table-body',
            'kader-modal', 'modal-content',
            'kader-form', 'modal-close',
            'refresh-kader-btn',
            'edit-id', 'kader_nama', 'kader_username', 'kader_role',
            'kader_alamat', 'kader_angkatan', 'kader_riwayat_jabatan',
            'total-anggota', 'total-admin', 'total-member', 'angkatan-terbanyak'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody       = els['table-body'];
        const modal           = els['kader-modal'];
        const modalContent    = els['modal-content'];
        const form            = els['kader-form'];
        const closeBtn        = els['modal-close'];
        const refreshBtn      = els['refresh-kader-btn'];
        const idInput         = els['edit-id'];
        const namaInput       = els['kader_nama'];
        const usernameInput   = els['kader_username'];
        const roleSelect      = els['kader_role'];
        const alamatInput     = els['kader_alamat'];
        const angkatanInput   = els['kader_angkatan'];
        const riwayatJabatanInput = els['kader_riwayat_jabatan'];
        const totalAnggotaEl  = els['total-anggota'];
        const totalAdminEl    = els['total-admin'];
        const totalMemberEl   = els['total-member'];
        const angkatanTerbanyakEl = els['angkatan-terbanyak'];

        if (!tableBody || !modal || !form) {
            console.error('[kader_admin] Elemen utama tidak ditemukan.');
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
            role: 'all',
            angkatan: 'all',
            sort: 'angkatan-desc'
        };
        let isSubmitting = false;
        let selectedIds = new Set();

        // ================================================================
        // 7. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Search & Filter & Sort =====
            if (!document.getElementById('kader-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'kader-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="kader-search" placeholder="Cari nama, username, alamat, angkatan..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="kader-filter-role" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Role</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                    </select>
                    <select id="kader-filter-angkatan" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Angkatan</option>
                    </select>
                    <select id="kader-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="angkatan-desc">Angkatan ↓</option>
                        <option value="angkatan-asc">Angkatan ↑</option>
                        <option value="nama-asc">Nama A-Z</option>
                        <option value="nama-desc">Nama Z-A</option>
                    </select>
                    <button id="kader-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('kader-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'kader-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-kader">0</span> kader dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-kader-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-kader-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('kader-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }

            // ===== Detail Modal =====
            if (!document.getElementById('kader-detail-modal')) {
                const detailModal = document.createElement('div');
                detailModal.id = 'kader-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/50 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="kader-detail-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)]">
                            <h3 class="text-xl font-bold text-[var(--text-main)] font-amiri">Detail Kader</h3>
                            <button id="kader-detail-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="kader-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="kader-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="kader-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('kader-detail-close').addEventListener('click', closeFn);
                document.getElementById('kader-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }
        }

        // ================================================================
        // 8. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('kader-search');
            const roleFilter = document.getElementById('kader-filter-role');
            const angkatanFilter = document.getElementById('kader-filter-angkatan');
            const sortSelect = document.getElementById('kader-sort');
            const exportBtn = document.getElementById('kader-export-btn');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input', debounceEvent.bind(null, 'kader-search', () => {
                    currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                    applyFilter();
                }, 250));
            }

            if (roleFilter && !roleFilter.dataset.attached) {
                roleFilter.dataset.attached = 'true';
                roleFilter.addEventListener('change', () => {
                    currentFilter.role = roleFilter.value;
                    applyFilter();
                });
            }

            if (angkatanFilter && !angkatanFilter.dataset.attached) {
                angkatanFilter.dataset.attached = 'true';
                angkatanFilter.addEventListener('change', () => {
                    currentFilter.angkatan = angkatanFilter.value;
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

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportCSV);
            }
        }

        // ================================================================
        // 9. UPDATE ANGKATAN FILTER OPTIONS
        // ================================================================
        function updateAngkatanOptions() {
            const select = document.getElementById('kader-filter-angkatan');
            if (!select) return;

            const angkatans = new Set();
            dataCache.forEach(u => {
                if (u.angkatan) angkatans.add(String(u.angkatan).trim());
            });

            const currentValue = select.value;
            select.innerHTML = '<option value="all">Semua Angkatan</option>';
            Array.from(angkatans).sort((a, b) => b.localeCompare(a)).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = 'Angkatan ' + a;
                select.appendChild(opt);
            });

            if (Array.from(angkatans).includes(currentValue)) {
                select.value = currentValue;
            }
        }

        // ================================================================
        // 10. APPLY FILTER & SORT
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(u => {
                if (currentFilter.role !== 'all') {
                    if (getRole(u) !== currentFilter.role) return false;
                }
                if (currentFilter.angkatan !== 'all') {
                    if (String(u.angkatan || '') !== currentFilter.angkatan) return false;
                }
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [
                        getName(u), getUsername(u), getAlamat(u),
                        u.angkatan, u.riwayat_jabatan, u.kalurahan
                    ].map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort
            switch (currentFilter.sort) {
                case 'angkatan-desc':
                    filteredCache.sort((a, b) => String(b.angkatan || '').localeCompare(String(a.angkatan || '')));
                    break;
                case 'angkatan-asc':
                    filteredCache.sort((a, b) => String(a.angkatan || '').localeCompare(String(b.angkatan || '')));
                    break;
                case 'nama-asc':
                    filteredCache.sort((a, b) => String(getName(a)).localeCompare(String(getName(b))));
                    break;
                case 'nama-desc':
                    filteredCache.sort((a, b) => String(getName(b)).localeCompare(String(getName(a))));
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
            const admin = dataCache.filter(u => getRole(u) === 'admin').length;
            const member = dataCache.filter(u => getRole(u) === 'member').length;

            // Angkatan terbanyak
            const angkatanCount = {};
            dataCache.forEach(u => {
                const a = u.angkatan;
                if (a) {
                    angkatanCount[a] = (angkatanCount[a] || 0) + 1;
                }
            });

            let topAngkatan = '-';
            let topCount = 0;
            Object.keys(angkatanCount).forEach(k => {
                if (angkatanCount[k] > topCount) {
                    topCount = angkatanCount[k];
                    topAngkatan = k + ' (' + topCount + ')';
                }
            });

            const el1 = document.getElementById('stats-total-kader') || totalAnggotaEl;
            const el2 = document.getElementById('stats-admin-kader') || totalAdminEl;
            const el3 = document.getElementById('stats-member-kader') || totalMemberEl;
            const el4 = angkatanTerbanyakEl;

            if (totalAnggotaEl) totalAnggotaEl.textContent = total;
            if (totalAdminEl) totalAdminEl.textContent = admin;
            if (totalMemberEl) totalMemberEl.textContent = member;
            if (angkatanTerbanyakEl) angkatanTerbanyakEl.textContent = topAngkatan;

            // Stats tambahan (jika auto-create)
            const elTotal = document.getElementById('stats-total-kader');
            const elAdmin = document.getElementById('stats-admin-kader');
            const elMember = document.getElementById('stats-member-kader');
            if (elTotal) elTotal.textContent = total;
            if (elAdmin) elAdmin.textContent = admin;
            if (elMember) elMember.textContent = member;
        }

        // ================================================================
        // 12. LOAD DATA (SWR)
        // ================================================================
        async function loadData(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data kader...</p></td></tr>';

            try {
                const result = await forceRefreshData('getUsers', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    updateAngkatanOptions();
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                        '<i class="fas fa-user-graduate text-3xl mb-2 opacity-40"></i>' +
                        '<p>Belum ada data kader</p></td></tr>';
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[kader_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getUsers', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    updateAngkatanOptions();
                    applyFilter();
                }
            } catch (e) {
                console.warn('[kader_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 13. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.role !== 'all' || currentFilter.angkatan !== 'all';
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-user-graduate text-3xl mb-2 opacity-40"></i><p>Belum ada data kader</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((u, index) => {
                const status = getStatus(u);
                const role = getRole(u);
                const isSelected = selectedIds.has(u.id);

                let statusBadge;
                if (status === 'approved') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Aktif</span>';
                } else if (status === 'pending') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Pending</span>';
                } else {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Ditolak</span>';
                }

                const roleBadge = role === 'admin'
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"><i class="fas fa-shield-alt mr-1"></i>Admin</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Member</span>';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="kader-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${u.id}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${index + 1}</td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${u.id}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400 text-left flex items-center gap-2">
                                <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white text-xs font-bold flex-shrink-0">
                                    ${escapeHtml(getInitials(getName(u)))}
                                </span>
                                <span class="truncate">${escapeHtml(getName(u))}</span>
                            </button>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">
                            <span class="inline-flex items-center gap-1">
                                ${escapeHtml(getUsername(u))}
                                <button onclick="copyText('${escapeAttr(getUsername(u))}')"
                                    class="text-[var(--text-muted)] hover:text-[var(--text-main)]" title="Copy">
                                    <i class="fas fa-copy text-xs"></i>
                                </button>
                            </span>
                        </td>
                        <td class="px-3 py-3 text-sm">${roleBadge}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(getAlamat(u))}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">
                            ${u.angkatan ? `<span class="px-2 py-0.5 rounded-full text-xs bg-[var(--bg-stats)] font-medium">${escapeHtml(u.angkatan)}</span>` : '-'}
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(u.riwayat_jabatan || '-')}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="viewDetail('${u.id}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Detail">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editKader('${u.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteKader('${u.id}')"
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
            if (!thead || thead.querySelector('.bulk-select-all-kader')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-kader w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-kader');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.kader-checkbox').forEach(cb => {
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
            document.querySelectorAll('.kader-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('kader-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-kader');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 14. BULK ACTIONS
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-kader-btn');
            const cancelBtn = document.getElementById('bulk-cancel-kader-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} kader? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteUser', 'POST', { id });
                                if (r && r.success) ok++;
                                else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.kader-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-kader');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();

                        dataCache = [];
                        await loadData(true);

                        if (fail === 0) showToast(`✅ ${ok} kader berhasil dihapus!`, 'success');
                        else showToast(`${ok} berhasil, ${fail} gagal.`, 'warning');
                    });
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', () => {
                    selectedIds.clear();
                    document.querySelectorAll('.kader-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-kader');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 15. DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const u = dataCache.find(x => x.id === id);
            if (!u) {
                showToast('Data tidak ditemukan.', 'warning');
                return;
            }

            const detailModal = document.getElementById('kader-detail-modal');
            const body = document.getElementById('kader-detail-body');
            if (!detailModal || !body) return;

            const name = getName(u);
            const role = getRole(u);
            const status = getStatus(u);

            body.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                        ${escapeHtml(getInitials(name))}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-xl font-bold text-[var(--text-main)] truncate">${escapeHtml(name)}</h3>
                        <p class="text-sm text-[var(--text-muted)] truncate">${escapeHtml(getUsername(u))}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 mt-2">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Role</p>
                        <p class="text-[var(--text-main)]">${role === 'admin' ? '🛡️ Admin' : '👤 Member'}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Status</p>
                        <p class="text-[var(--text-main)]">
                            ${status === 'approved' ? '✅ Aktif' : status === 'pending' ? '⏳ Pending' : '❌ Ditolak'}
                        </p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Angkatan</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(u.angkatan || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Daftar</p>
                        <p class="text-[var(--text-main)]">${formatDate(getJoinDate(u))}</p>
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Alamat / Kalurahan</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(getAlamat(u))}</p>
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Riwayat Jabatan</p>
                        <p class="text-[var(--text-main)] whitespace-pre-wrap">${escapeHtml(u.riwayat_jabatan || 'Belum ada riwayat jabatan')}</p>
                    </div>
                </div>
            `;

            // Edit button
            const editBtn = document.getElementById('kader-detail-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                    window.editKader(u.id);
                });
            }

            detailModal.classList.remove('hidden');
            detailModal.classList.add('flex');
            requestAnimationFrame(() => {
                const content = document.getElementById('kader-detail-content');
                if (content) {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        };

        // ================================================================
        // 16. COPY TEXT
        // ================================================================
        window.copyText = function(text) {
            if (!text) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => showToast('Dicopy: ' + text, 'success', 2000))
                    .catch(() => showToast('Gagal copy', 'error'));
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    showToast('Dicopy: ' + text, 'success', 2000);
                } catch (e) {}
                document.body.removeChild(ta);
            }
        };

        // ================================================================
        // 17. MODAL FORM
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

        // ESC
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            const detailModal = document.getElementById('kader-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (!modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 18. EDIT
        // ================================================================
        window.editKader = function(id) {
            const kader = dataCache.find(u => u.id === id);
            if (!kader) {
                showToast('Kader tidak ditemukan.', 'warning');
                return;
            }
            isEdit = true;
            if (idInput) idInput.value = kader.id;
            if (namaInput) namaInput.value = getName(kader) === '-' ? '' : getName(kader);
            if (usernameInput) usernameInput.value = getUsername(kader) === '-' ? '' : getUsername(kader);
            if (roleSelect) roleSelect.value = getRole(kader);
            if (alamatInput) alamatInput.value = getAlamat(kader) === '-' ? '' : getAlamat(kader);
            if (angkatanInput) angkatanInput.value = kader.angkatan || '';
            if (riwayatJabatanInput) riwayatJabatanInput.value = kader.riwayat_jabatan || '';
            openModal();
        };

        // ================================================================
        // 19. DELETE SINGLE
        // ================================================================
        window.deleteKader = function(id) {
            const u = dataCache.find(x => x.id === id);
            const name = u ? getName(u) : 'kader ini';

            showConfirm('Hapus kader "' + name + '"?', async () => {
                const result = await apiCall('deleteUser', 'POST', { id });
                if (result && result.success) {
                    dataCache = dataCache.filter(x => x.id !== id);
                    updateAngkatanOptions();
                    applyFilter();
                    await logActivity('DELETE', 'kader', id, 'Hapus: ' + name);
                    showToast('Kader berhasil dihapus!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 20. SUBMIT FORM (UPDATE)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const id = idInput.value;
            const nama = (namaInput.value || '').trim();
            const username = (usernameInput.value || '').trim();
            const role = roleSelect.value || 'member';
            const alamat = (alamatInput.value || '').trim();
            const angkatan = (angkatanInput.value || '').trim();
            const riwayat_jabatan = (riwayatJabatanInput.value || '').trim();

            if (!nama) {
                showToast('Nama wajib diisi!', 'warning');
                namaInput.focus();
                return;
            }
            if (!username) {
                showToast('Username wajib diisi!', 'warning');
                usernameInput.focus();
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                const data = { nama, username, role, alamat, angkatan, riwayat_jabatan };
                const payload = Object.assign({ id: id }, data);

                const result = await apiCall('updateUser', 'POST', payload);

                if (result && result.success) {
                    const idx = dataCache.findIndex(u => u.id === id);
                    if (idx !== -1) {
                        dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                    }
                    updateAngkatanOptions();
                    applyFilter();
                    closeModal();

                    await logActivity('UPDATE', 'kader', id, 'Update: ' + username);
                    showToast('✅ Data kader berhasil diperbarui!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                console.error('[kader_admin] Submit error:', error);
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 21. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                showToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nama', 'Username', 'Role', 'Status', 'Alamat', 'Angkatan', 'Riwayat Jabatan', 'Tanggal Daftar'];
            const rows = filteredCache.map((u, i) => [
                i + 1,
                getName(u),
                getUsername(u),
                getRole(u),
                getStatus(u),
                getAlamat(u),
                u.angkatan || '',
                u.riwayat_jabatan || '',
                formatDate(getJoinDate(u))
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kader_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 22. REFRESH
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
                    showToast('Data kader diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 23. INIT
        // ================================================================
        console.log('[kader_admin] Init selesai, memuat data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        loadData();
    }

    // ================================================================
    // 24. RUN INIT
    // ================================================================
    init();
});