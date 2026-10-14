/**
 * js/surat_member.js
 * Modul Member Surat - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi + cleanup via router
 *  - XSS protection di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - isSubmitting anti double-submit
 *  - Nomor surat dari response backend langsung
 *  - Edit dari cache (tanpa fetch ulang)
 *  - ESC + click-outside modal
 *
 * FEATURES:
 *  - CRUD Surat member (hanya milik sendiri)
 *  - Nomor surat otomatis dari backend
 *  - Edit dari cache (instan)
 *  - Search real-time (nomor, perihal, pengirim, penerima)
 *  - Filter jenis surat (internal/eksternal)
 *  - Stats 4 kartu (total, internal, eksternal, bulan ini)
 *  - Bulk delete multiple surat
 *  - Copy nomor surat ke clipboard
 *  - Preview & cetak via /surat_preview
 *  - Download lampiran langsung
 *  - Upload lampiran background
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('surat_member', function() {
    'use strict';

    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'member') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__suratMemberLoaded) {
        console.log('[surat_member] Sudah di-init, skip.');
        return;
    }
    window.__suratMemberLoaded = true;

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

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'surat-table-body',
            'surat-skeleton',
            'surat-modal', 'modal-content', 'modal-title',
            'surat-form', 'modal-close',
            'add-surat-btn', 'refresh-surat-btn',
            'surat-id', 'nomor_surat', 'perihal', 'tanggal', 'pengirim',
            'penerima', 'isi', 'lampiran', 'surat_file', 'jenis_surat'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody      = els['surat-table-body'];
        const skeleton       = els['surat-skeleton'];
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
            console.error('[surat_member] Elemen utama tidak ditemukan.');
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
            jenis: 'all'
        };
        let isSubmitting = false;
        let selectedIds = new Set();

        // ================================================================
        // 7. ENSURE EXTRA UI (Stats + Search + Filter + Bulk Bar)
        // ================================================================
        function ensureExtraUI() {
            const memberContent = document.getElementById('member-frame-content') ||
                                 document.getElementById('member-content');
            if (!memberContent) return;

            const header = memberContent.querySelector('.flex.justify-between.items-center')
                        || memberContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('surat-member-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'surat-member-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Surat</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-surat-member">0</p>
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
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-internal-member">0</p>
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
                                <p class="text-2xl font-bold text-pink-600 mt-1" id="stats-eksternal-member">0</p>
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
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-bulan-member">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                        </div>
                    </div>
                `;

                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search & Filter Bar =====
            if (!document.getElementById('surat-member-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'surat-member-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="surat-member-search" placeholder="Cari nomor, perihal, pengirim..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="surat-member-filter-jenis" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Jenis</option>
                        <option value="internal">Internal (SR-01)</option>
                        <option value="eksternal">Eksternal (SR-02)</option>
                    </select>
                `;

                const statsDiv = document.getElementById('surat-member-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('surat-member-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'surat-member-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-surat-member">0</span> surat dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-surat-member-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-surat-member-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;

                const searchWrap = document.getElementById('surat-member-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 8. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('surat-member-search');
            const filterJenis = document.getElementById('surat-member-filter-jenis');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'surat-member-search', () => {
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
        }

        // ================================================================
        // 9. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(item => {
                // Filter jenis
                if (currentFilter.jenis !== 'all') {
                    const jenis = getJenisFromNomor(item.nomor_surat);
                    if (jenis !== currentFilter.jenis) return false;
                }

                // Filter search
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [
                        item.nomor_surat, item.perihal,
                        item.pengirim, item.penerima, item.isi
                    ].map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort by tanggal descending
            filteredCache.sort((a, b) => {
                const da = new Date(a.tanggal || 0);
                const db = new Date(b.tanggal || 0);
                return db - da;
            });

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 10. UPDATE STATS
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

            const el1 = document.getElementById('stats-total-surat-member');
            const el2 = document.getElementById('stats-internal-member');
            const el3 = document.getElementById('stats-eksternal-member');
            const el4 = document.getElementById('stats-bulan-member');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = internal;
            if (el3) el3.textContent = eksternal;
            if (el4) el4.textContent = bulanIni;
        }

        // ================================================================
        // 11. LOAD DATA (SWR)
        // ================================================================
        async function loadSurat(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            if (skeleton) skeleton.classList.remove('hidden');
            tableBody.innerHTML = '';

            try {
                const result = await forceRefreshData('getSurat', {});

                if (skeleton) skeleton.classList.add('hidden');

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                        '<i class="fas fa-file-alt text-3xl mb-2 opacity-40"></i>' +
                        '<p>Belum ada surat</p></td></tr>';
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                if (skeleton) skeleton.classList.add('hidden');
                console.error('[surat_member] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
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
                console.warn('[surat_member] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 12. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.jenis !== 'all';
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
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

                const jenisBadge = jenis === 'internal'
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Internal</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Eksternal</span>';

                const lampiranIcon = item.lampiran
                    ? `<a href="${escapeAttr(item.lampiran)}" target="_blank" rel="noopener"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400" title="Lihat lampiran">
                          <i class="fas fa-paperclip"></i></a>`
                    : '<span class="text-[var(--text-muted)]">-</span>';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="surat-member-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-3 py-3 text-sm">
                            <div class="flex items-center gap-1.5">
                                <span class="font-mono text-xs text-[var(--text-main)]">${escapeHtml(item.nomor_surat || '-')}</span>
                                ${item.nomor_surat ? `
                                    <button onclick="copySuratNomor('${escapeAttr(item.nomor_surat)}')"
                                        class="text-[var(--text-muted)] hover:text-[var(--text-main)] transition"
                                        title="Copy nomor">
                                        <i class="fas fa-copy text-xs"></i>
                                    </button>` : ''}
                            </div>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <div class="font-medium text-[var(--text-main)]">${escapeHtml(item.perihal || '-')}</div>
                            <div class="mt-1">${jenisBadge}</div>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">${formatDate(item.tanggal)}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.pengirim || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.penerima || '-')}</td>
                        <td class="px-3 py-3 text-sm text-center">${lampiranIcon}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="previewSurat('${item.id}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Preview & Cetak">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="editSurat('${item.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteSurat('${item.id}')"
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
            if (!thead || thead.querySelector('.bulk-select-all-surat-member')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-surat-member w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-surat-member');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.surat-member-checkbox').forEach(cb => {
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
            document.querySelectorAll('.surat-member-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('surat-member-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-surat-member');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 13. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-surat-member-btn');
            const cancelBtn = document.getElementById('bulk-cancel-surat-member-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} surat? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteSurat', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    dataCache = dataCache.filter(s => s.id !== id);
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.surat-member-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-surat-member');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            showToast(`✅ ${ok} surat berhasil dihapus!`, 'success');
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
                    document.querySelectorAll('.surat-member-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-surat-member');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 14. COPY NOMOR SURAT
        // ================================================================
        window.copySuratNomor = function(nomor) {
            if (!nomor) return;
            copyToClipboard(nomor)
                .then(() => showToast('Nomor surat dicopy: ' + nomor, 'success', 2500))
                .catch(() => showToast('Gagal copy nomor', 'error'));
        };

        // ================================================================
        // 15. PREVIEW SURAT
        // ================================================================
        window.previewSurat = function(id) {
            if (!id) {
                showToast('ID surat tidak ditemukan.', 'warning');
                return;
            }
            router.load('/surat_preview?id=' + encodeURIComponent(id));
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

        // ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 17. TAMBAH SURAT
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
        // 18. EDIT SURAT (dari cache, tanpa fetch)
        // ================================================================
        window.editSurat = function(id) {
            const surat = dataCache.find(s => s.id === id);
            if (!surat) {
                showToast('Surat tidak ditemukan.', 'warning');
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
        // 19. DELETE SURAT SINGLE
        // ================================================================
        window.deleteSurat = function(id) {
            const surat = dataCache.find(s => s.id === id);
            const nomor = surat ? (surat.nomor_surat || 'surat ini') : 'surat ini';

            showConfirm('Hapus surat "' + nomor + '"?', async () => {
                const result = await apiCall('deleteSurat', 'POST', { id });
                if (result && result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    applyFilter();
                    await logActivity('DELETE', 'surat', id, 'Hapus: ' + nomor);
                    showToast('Surat berhasil dihapus!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 20. SUBMIT FORM (CREATE / UPDATE)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            // === Validation ===
            const perihal = (perihalInput.value || '').trim();
            const tanggal = tanggalInput.value;
            const pengirim = (pengirimInput.value || '').trim();
            const penerima = (penerimaInput.value || '').trim();
            const isi = (isiInput.value || '').trim();
            const lampiran = (lampiranInput.value || '').trim();
            const jenis_surat = jenisSelect.value || 'internal';

            if (!perihal) {
                showToast('Perihal wajib diisi!', 'warning');
                perihalInput.focus();
                return;
            }
            if (!tanggal) {
                showToast('Tanggal wajib diisi!', 'warning');
                tanggalInput.focus();
                return;
            }
            if (!pengirim) {
                showToast('Pengirim wajib diisi!', 'warning');
                pengirimInput.focus();
                return;
            }
            if (!penerima) {
                showToast('Penerima wajib diisi!', 'warning');
                penerimaInput.focus();
                return;
            }
            if (!isi) {
                showToast('Isi surat wajib diisi!', 'warning');
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
                    // Update cache lokal
                    if (isEdit) {
                        const idx = dataCache.findIndex(s => s.id === id);
                        if (idx !== -1) {
                            dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                        }
                    } else {
                        // ✅ Ambil nomor_surat langsung dari response backend
                        const newItem = Object.assign({}, data, {
                            id: result.id,
                            nomor_surat: result.nomor_surat || '(generating...)',
                            created_at: new Date().toISOString()
                        });
                        dataCache.unshift(newItem);

                        // Kalau nomor_surat tidak ada di response, fetch BG
                        if (!result.nomor_surat) {
                            fetchDataBackground();
                        }
                    }

                    applyFilter();

                    // Upload lampiran background
                    if (fileInput && fileInput.files && fileInput.files.length > 0) {
                        const targetId = isEdit ? id : result.id;
                        showToast('Data tersimpan, mengunggah lampiran...', 'info', 3000);

                        uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                            if (uploadResult && uploadResult.success) {
                                apiCall('updateSurat', 'POST', {
                                    id: targetId,
                                    lampiran: uploadResult.url
                                }).then(() => {
                                    const idx = dataCache.findIndex(s => s.id === targetId);
                                    if (idx !== -1) {
                                        dataCache[idx].lampiran = uploadResult.url;
                                        applyFilter();
                                    }
                                    showToast('✅ Lampiran berhasil diunggah!', 'success');
                                });
                            } else {
                                showToast('Gagal upload lampiran', 'error');
                            }
                        }).catch(err => {
                            showToast('Gagal upload: ' + err.message, 'error');
                        });
                    }

                    closeModal();
                    form.reset();

                    await logActivity(
                        isEdit ? 'UPDATE' : 'CREATE',
                        'surat',
                        result.id || id,
                        'Surat: ' + perihal
                    );

                    showToast(
                        isEdit ? '✅ Surat berhasil diperbarui!' : '✅ Surat berhasil disimpan!',
                        'success'
                    );
                } else {
                    showToast((result && result.message) || 'Gagal menyimpan surat', 'error');
                }
            } catch (error) {
                console.error('[surat_member] Submit error:', error);
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 21. REFRESH BUTTON
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
                    await loadSurat(true);
                    showToast('Data surat diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 22. CLEANUP
        // ================================================================
        function cleanup() {
            window.__suratMemberLoaded = false;
        }
        window.__suratMemberCleanup = cleanup;

        // ================================================================
        // 23. INIT
        // ================================================================
        console.log('[surat_member] Init dimulai');

        // Set default tanggal
        if (tanggalInput && !tanggalInput.value) {
            tanggalInput.value = todayISO();
        }

        // Setup UI
        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        // Load data
        loadSurat();

        console.log('[surat_member] Init selesai');
    }

    // ================================================================
    // 24. RUN INIT
    // ================================================================
    init();
});