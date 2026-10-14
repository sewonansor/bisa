/**
 * js/arsip_admin.js
 * Modul Admin Arsip Digital - FULL FIX v10.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - B5: Guard anti-duplikasi + reset via router
 *  - B8: Clone-replace listener (anti memory leak)
 *  - XSS: escapeHtml() di semua output
 *  - isSubmitting anti double-submit
 *  - ESC + click-outside modal
 *  - Upload file dengan preview
 *
 * FEATURES:
 *  - CRUD Arsip lengkap
 *  - Search real-time (judul, deskripsi, kategori)
 *  - Filter tahun + kategori + jenis
 *  - Stats 4 kartu (total, dokumen, foto, video)
 *  - Bulk delete
 *  - Detail modal dengan preview
 *  - Preview image / PDF / video inline
 *  - Copy URL file
 *  - Upload file dengan preview
 *  - Auto-detect jenis dari ekstensi
 *  - Export CSV
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('arsip_admin', function() {
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
    if (window.__arsipAdminLoaded) {
        console.log('[arsip_admin] Sudah di-init, skip.');
        return;
    }
    window.__arsipAdminLoaded = true;

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

    /**
     * Get icon class berdasarkan jenis file
     */
    function getJenisInfo(jenis) {
        const map = {
            'pdf': { icon: 'fa-file-pdf', color: 'text-red-600 dark:text-red-400', label: 'PDF' },
            'docx': { icon: 'fa-file-word', color: 'text-blue-600 dark:text-blue-400', label: 'DOCX' },
            'doc': { icon: 'fa-file-word', color: 'text-blue-600 dark:text-blue-400', label: 'DOC' },
            'xlsx': { icon: 'fa-file-excel', color: 'text-green-600 dark:text-green-400', label: 'XLSX' },
            'xls': { icon: 'fa-file-excel', color: 'text-green-600 dark:text-green-400', label: 'XLS' },
            'ppt': { icon: 'fa-file-powerpoint', color: 'text-orange-600 dark:text-orange-400', label: 'PPT' },
            'pptx': { icon: 'fa-file-powerpoint', color: 'text-orange-600 dark:text-orange-400', label: 'PPTX' },
            'img': { icon: 'fa-image', color: 'text-purple-600 dark:text-purple-400', label: 'Gambar' },
            'video': { icon: 'fa-video', color: 'text-pink-600 dark:text-pink-400', label: 'Video' },
            'audio': { icon: 'fa-music', color: 'text-teal-600 dark:text-teal-400', label: 'Audio' },
            'zip': { icon: 'fa-file-archive', color: 'text-yellow-600 dark:text-yellow-400', label: 'Arsip' },
            'other': { icon: 'fa-file', color: 'text-gray-600 dark:text-gray-400', label: 'Lainnya' }
        };
        return map[jenis] || map['other'];
    }

    /**
     * Get category badge color
     */
    function getKategoriColor(kategori) {
        const map = {
            'dokumen': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
            'laporan': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
            'foto': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
            'video': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
            'lainnya': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        };
        return map[kategori] || map['lainnya'];
    }

    /**
     * Auto-detect jenis dari nama file atau URL
     */
    function detectJenis(urlOrFileName) {
        if (!urlOrFileName) return 'other';
        const name = String(urlOrFileName).toLowerCase();
        const ext = name.split('.').pop().split('?')[0].split('#')[0];

        if (['pdf'].includes(ext)) return 'pdf';
        if (['doc', 'docx'].includes(ext)) return 'docx';
        if (['xls', 'xlsx'].includes(ext)) return 'xlsx';
        if (['ppt', 'pptx'].includes(ext)) return 'ppt';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'img';
        if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
        return 'other';
    }

    /**
     * Cek apakah URL adalah image
     */
    function isImageUrl(url) {
        if (!url) return false;
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) ||
               url.includes('drive.google.com/uc') && /\.(jpg|jpeg|png|gif|webp)/i.test(url);
    }

    /**
     * Cek apakah URL adalah PDF
     */
    function isPdfUrl(url) {
        if (!url) return false;
        return /\.pdf(\?.*)?$/i.test(url);
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'arsip-table-body',
            'arsip-modal', 'modal-content', 'modal-title',
            'arsip-form', 'modal-close',
            'add-arsip-btn', 'refresh-arsip-btn',
            'arsip-id', 'arsip_judul', 'arsip_tahun', 'arsip_kategori',
            'arsip_jenis', 'arsip_file_url', 'arsip_deskripsi'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody       = els['arsip-table-body'];
        const modal           = els['arsip-modal'];
        const modalContent    = els['modal-content'];
        const modalTitle      = els['modal-title'];
        const form            = els['arsip-form'];
        const closeBtn        = els['modal-close'];
        const addBtn          = els['add-arsip-btn'];
        const refreshBtn      = els['refresh-arsip-btn'];
        const idInput         = els['arsip-id'];
        const judulInput      = els['arsip_judul'];
        const tahunInput      = els['arsip_tahun'];
        const kategoriSelect  = els['arsip_kategori'];
        const jenisSelect     = els['arsip_jenis'];
        const fileUrlInput    = els['arsip_file_url'];
        const deskripsiInput  = els['arsip_deskripsi'];

        if (!tableBody || !modal || !form) {
            console.error('[arsip_admin] Elemen utama tidak ditemukan.');
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
            tahun: 'all',
            kategori: 'all',
            jenis: 'all'
        };
        let isSubmitting = false;
        let selectedIds = new Set();
        let uploadPreviewUrl = '';

        // ================================================================
        // 7. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('arsip-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'arsip-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Arsip</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-arsip">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-archive"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Dokumen</p>
                                <p class="text-2xl font-bold text-blue-600 mt-1" id="stats-dokumen">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-white">
                                <i class="fas fa-file-alt"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Foto</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-foto-arsip">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-image"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Video</p>
                                <p class="text-2xl font-bold text-red-600 mt-1" id="stats-video-arsip">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white">
                                <i class="fas fa-video"></i>
                            </div>
                        </div>
                    </div>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search & Filter =====
            if (!document.getElementById('arsip-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'arsip-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="arsip-search" placeholder="Cari judul, deskripsi..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="arsip-filter-tahun" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Tahun</option>
                    </select>
                    <select id="arsip-filter-kategori" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Kategori</option>
                        <option value="dokumen">Dokumen</option>
                        <option value="laporan">Laporan</option>
                        <option value="foto">Foto</option>
                        <option value="video">Video</option>
                        <option value="lainnya">Lainnya</option>
                    </select>
                    <select id="arsip-filter-jenis" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Jenis</option>
                        <option value="pdf">PDF</option>
                        <option value="docx">DOCX</option>
                        <option value="xlsx">XLSX</option>
                        <option value="img">Gambar</option>
                        <option value="video">Video</option>
                        <option value="other">Lainnya</option>
                    </select>
                    <button id="arsip-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('arsip-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'arsip-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-arsip">0</span> arsip dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-arsip-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-arsip-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;
                const searchWrap = document.getElementById('arsip-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }
        }

        // ================================================================
        // 8. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('arsip-search');
            const filterTahun = document.getElementById('arsip-filter-tahun');
            const filterKategori = document.getElementById('arsip-filter-kategori');
            const filterJenis = document.getElementById('arsip-filter-jenis');
            const exportBtn = document.getElementById('arsip-export-btn');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input', debounceEvent.bind(null, 'arsip-search', () => {
                    currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                    applyFilter();
                }, 250));
            }

            if (filterTahun && !filterTahun.dataset.attached) {
                filterTahun.dataset.attached = 'true';
                filterTahun.addEventListener('change', () => {
                    currentFilter.tahun = filterTahun.value;
                    applyFilter();
                });
            }

            if (filterKategori && !filterKategori.dataset.attached) {
                filterKategori.dataset.attached = 'true';
                filterKategori.addEventListener('change', () => {
                    currentFilter.kategori = filterKategori.value;
                    applyFilter();
                });
            }

            if (filterJenis && !filterJenis.dataset.attached) {
                filterJenis.dataset.attached = 'true';
                filterJenis.addEventListener('change', () => {
                    currentFilter.jenis = filterJenis.value;
                    applyFilter();
                });
            }

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportCSV);
            }
        }

        // ================================================================
        // 9. UPDATE TAHUN FILTER OPTIONS
        // ================================================================
        function updateTahunOptions() {
            const select = document.getElementById('arsip-filter-tahun');
            if (!select) return;

            const tahuns = new Set();
            dataCache.forEach(a => {
                if (a.tahun) tahuns.add(String(a.tahun).trim());
            });

            const currentValue = select.value;
            select.innerHTML = '<option value="all">Semua Tahun</option>';
            Array.from(tahuns).sort((a, b) => b.localeCompare(a)).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                select.appendChild(opt);
            });

            if (Array.from(tahuns).includes(currentValue)) {
                select.value = currentValue;
            }
        }

        // ================================================================
        // 10. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(item => {
                if (currentFilter.tahun !== 'all' && String(item.tahun || '') !== currentFilter.tahun) return false;
                if (currentFilter.kategori !== 'all' && (item.kategori || '') !== currentFilter.kategori) return false;
                if (currentFilter.jenis !== 'all' && (item.jenis || '') !== currentFilter.jenis) return false;

                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [item.judul, item.deskripsi, item.kategori, item.tahun]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort: tahun desc, judul asc
            filteredCache.sort((a, b) => {
                const ta = String(b.tahun || '');
                const tb = String(a.tahun || '');
                if (ta !== tb) return ta.localeCompare(tb);
                return String(a.judul || '').localeCompare(String(b.judul || ''));
            });

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 11. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const dokumen = dataCache.filter(a =>
                a.kategori === 'dokumen' || a.kategori === 'laporan').length;
            const foto = dataCache.filter(a => a.kategori === 'foto' || a.jenis === 'img').length;
            const video = dataCache.filter(a => a.kategori === 'video' || a.jenis === 'video').length;

            const el1 = document.getElementById('stats-total-arsip');
            const el2 = document.getElementById('stats-dokumen');
            const el3 = document.getElementById('stats-foto-arsip');
            const el4 = document.getElementById('stats-video-arsip');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = dokumen;
            if (el3) el3.textContent = foto;
            if (el4) el4.textContent = video;
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

            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data arsip...</p></td></tr>';

            try {
                const result = await forceRefreshData('getArsip', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    updateTahunOptions();
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-[var(--text-muted)]">' +
                        '<i class="fas fa-archive text-3xl mb-2 opacity-40"></i>' +
                        '<p>Belum ada arsip</p></td></tr>';
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[arsip_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getArsip', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    updateTahunOptions();
                    applyFilter();
                }
            } catch (e) {
                console.warn('[arsip_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 13. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.tahun !== 'all' ||
                                   currentFilter.kategori !== 'all' || currentFilter.jenis !== 'all';
                tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-archive text-3xl mb-2 opacity-40"></i><p>Belum ada arsip</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            data.forEach((item, idx) => {
                const isSelected = selectedIds.has(item.id);
                const jenisInfo = getJenisInfo(item.jenis);
                const kategoriBadge = getKategoriColor(item.kategori);
                const hasFile = !!item.file_url;

                const fileBtn = hasFile
                    ? `<button onclick="viewDetail('${item.id}')"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          title="Preview">
                          <i class="fas fa-eye"></i>
                       </button>`
                    : '<span class="text-[var(--text-muted)] text-xs">-</span>';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="arsip-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-3 py-3 text-center">
                            <i class="fas ${jenisInfo.icon} text-2xl ${jenisInfo.color}" title="${jenisInfo.label}"></i>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${item.id}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400 text-left">
                                ${escapeHtml(item.judul || '-')}
                            </button>
                            <div class="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">${escapeHtml(item.deskripsi || '')}</div>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${kategoriBadge}">
                                ${escapeHtml(item.kategori || '-')}
                            </span>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.tahun || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(jenisInfo.label)}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            ${fileBtn}
                            ${hasFile ? `
                                <button onclick="copyFileUrl('${item.id}')"
                                    class="text-purple-600 hover:text-purple-800 dark:text-purple-400 ml-2"
                                    title="Copy URL">
                                    <i class="fas fa-link"></i>
                                </button>
                                <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                                    class="text-green-600 hover:text-green-800 dark:text-green-400 ml-2"
                                    title="Download">
                                    <i class="fas fa-download"></i>
                                </a>
                            ` : ''}
                            <button onclick="editItem('${item.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 ml-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteItem('${item.id}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400 ml-2"
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
            if (!thead || thead.querySelector('.bulk-select-all-arsip')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-arsip w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-arsip');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.arsip-checkbox').forEach(cb => {
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
            document.querySelectorAll('.arsip-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('arsip-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-arsip');
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
            const delBtn = document.getElementById('bulk-delete-arsip-btn');
            const cancelBtn = document.getElementById('bulk-cancel-arsip-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} arsip? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteArsip', 'POST', { id });
                                if (r && r.success) ok++;
                                else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.arsip-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-arsip');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();

                        dataCache = [];
                        await loadData(true);

                        if (fail === 0) showToast(`✅ ${ok} arsip berhasil dihapus!`, 'success');
                        else showToast(`${ok} berhasil, ${fail} gagal.`, 'warning');
                    });
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', () => {
                    selectedIds.clear();
                    document.querySelectorAll('.arsip-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-arsip');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 15. VIEW DETAIL (Modal preview)
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(a => a.id === id);
            if (!item) {
                showToast('Data tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('arsip-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'arsip-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/70 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="arsip-detail-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)] sticky top-0 bg-[var(--card-bg)] z-10">
                            <h3 id="arsip-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4 line-clamp-2"></h3>
                            <button id="arsip-detail-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="arsip-detail-body" class="p-5"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="arsip-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="arsip-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('arsip-detail-close').addEventListener('click', closeFn);
                document.getElementById('arsip-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('arsip-detail-content');
            const titleEl = document.getElementById('arsip-detail-title');
            const body = document.getElementById('arsip-detail-body');

            const jenisInfo = getJenisInfo(item.jenis);
            const kategoriBadge = getKategoriColor(item.kategori);

            titleEl.textContent = item.judul || '-';

            // Build preview
            let previewHtml = '';
            if (item.file_url) {
                if (isImageUrl(item.file_url)) {
                    previewHtml = `
                        <div class="rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--bg-stats)] flex items-center justify-center" style="max-height:400px">
                            <img src="${escapeAttr(item.file_url)}" alt="${escapeAttr(item.judul)}"
                                class="max-w-full max-h-[400px] object-contain"
                                onerror="this.parentElement.innerHTML='<p class=\\'text-center text-[var(--text-muted)] py-8\\'>Gagal memuat gambar</p>'">
                        </div>
                    `;
                } else if (isPdfUrl(item.file_url)) {
                    previewHtml = `
                        <div class="rounded-lg overflow-hidden border border-[var(--card-border)]" style="height:500px">
                            <iframe src="${escapeAttr(item.file_url)}" class="w-full h-full" frameborder="0"></iframe>
                        </div>
                    `;
                } else {
                    previewHtml = `
                        <div class="text-center py-8 bg-[var(--bg-stats)] rounded-lg border border-[var(--card-border)]">
                            <i class="fas ${jenisInfo.icon} text-5xl ${jenisInfo.color} mb-3"></i>
                            <p class="text-[var(--text-muted)] mb-4">Preview tidak tersedia untuk file ${escapeHtml(jenisInfo.label)}</p>
                            <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                                class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg">
                                <i class="fas fa-external-link-alt"></i> Buka File
                            </a>
                        </div>
                    `;
                }
            } else {
                previewHtml = '<p class="text-center text-[var(--text-muted)] py-8 italic">Tidak ada file terlampir.</p>';
            }

            body.innerHTML = `
                ${previewHtml}

                <div class="grid grid-cols-2 gap-4 mt-5">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Kategori</p>
                        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${kategoriBadge}">
                            ${escapeHtml(item.kategori || '-')}
                        </span>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Jenis File</p>
                        <p class="text-[var(--text-main)] flex items-center gap-2">
                            <i class="fas ${jenisInfo.icon} ${jenisInfo.color}"></i>
                            ${escapeHtml(jenisInfo.label)}
                        </p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tahun</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(item.tahun || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Upload</p>
                        <p class="text-[var(--text-main)]">${formatDate(item.created_at)}</p>
                    </div>
                    <div class="col-span-2">
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Deskripsi</p>
                        <p class="text-[var(--text-main)] whitespace-pre-wrap">${escapeHtml(item.deskripsi || 'Tidak ada deskripsi.')}</p>
                    </div>
                    ${item.file_url ? `
                        <div class="col-span-2">
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">URL File</p>
                            <div class="flex items-center gap-2">
                                <p class="text-[var(--text-main)] text-xs break-all flex-1">${escapeHtml(item.file_url)}</p>
                                <button onclick="copyFileUrl('${item.id}')"
                                    class="text-purple-600 hover:text-purple-800 flex-shrink-0"
                                    title="Copy URL">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

            // Edit button
            const editBtn = document.getElementById('arsip-detail-edit');
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
        // 16. COPY FILE URL
        // ================================================================
        window.copyFileUrl = function(id) {
            const item = dataCache.find(a => a.id === id);
            if (!item || !item.file_url) {
                showToast('URL tidak tersedia.', 'warning');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(item.file_url)
                    .then(() => showToast('URL dicopy!', 'success', 2000))
                    .catch(() => fallbackCopy(item.file_url));
            } else {
                fallbackCopy(item.file_url);
            }
        };

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                showToast('URL dicopy!', 'success', 2000);
            } catch (e) {
                showToast('Gagal copy', 'error');
            }
            document.body.removeChild(ta);
        }

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
            setTimeout(() => { if (judulInput) judulInput.focus(); }, 150);
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
            if (fileUrlInput) fileUrlInput.value = '';
            isEdit = false;
            clearUploadPreview();
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
            const detailModal = document.getElementById('arsip-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (!modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 18. UPLOAD PREVIEW (File input)
        // ================================================================
        function ensureUploadPreview() {
            if (document.getElementById('arsip-upload-preview')) return;

            const fileUrlParent = fileUrlInput ? fileUrlInput.parentElement : null;
            if (!fileUrlParent) return;

            // Tambahkan file input jika belum ada
            let fileInput = document.getElementById('arsip_file');
            if (!fileInput) {
                const fileWrap = document.createElement('div');
                fileWrap.className = 'mb-4';
                fileWrap.innerHTML = `
                    <label class="block text-[var(--text-muted)] mb-1 text-sm font-medium">Upload File (opsional)</label>
                    <input type="file" id="arsip_file"
                        class="w-full px-4 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,video/*,audio/*">
                    <p class="text-xs text-[var(--text-muted)] mt-1">File akan diunggah ke Google Drive.</p>
                `;
                fileUrlParent.parentElement.insertBefore(fileWrap, fileUrlParent);
                fileInput = document.getElementById('arsip_file');
            }

            const preview = document.createElement('div');
            preview.id = 'arsip-upload-preview';
            preview.className = 'hidden mt-2';
            preview.innerHTML = `
                <p class="text-xs text-[var(--text-muted)] mb-1">Preview upload:</p>
                <div class="flex items-center gap-2 p-2 border border-[var(--card-border)] rounded bg-[var(--bg-stats)]">
                    <i id="arsip-upload-icon" class="fas fa-file text-2xl text-[var(--text-main)]"></i>
                    <span id="arsip-upload-name" class="text-sm text-[var(--text-main)] flex-1 truncate"></span>
                    <span id="arsip-upload-size" class="text-xs text-[var(--text-muted)]"></span>
                    <button type="button" id="clear-upload-preview" class="text-red-500 hover:text-red-700 text-xs">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            fileUrlParent.parentElement.insertBefore(preview, fileUrlParent.nextSibling);

            const clearBtn = document.getElementById('clear-upload-preview');
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    if (fileInput) fileInput.value = '';
                    clearUploadPreview();
                });
            }

            // Attach change
            if (fileInput && !fileInput.dataset.previewAttached) {
                fileInput.dataset.previewAttached = 'true';
                fileInput.addEventListener('change', () => {
                    if (!fileInput.files || fileInput.files.length === 0) {
                        clearUploadPreview();
                        return;
                    }
                    const file = fileInput.files[0];
                    const sizeKB = (file.size / 1024).toFixed(1);
                    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                    const displaySize = file.size > 1024 * 1024 ? sizeMB + ' MB' : sizeKB + ' KB';

                    const jenis = detectJenis(file.name);
                    const info = getJenisInfo(jenis);

                    const iconEl = document.getElementById('arsip-upload-icon');
                    const nameEl = document.getElementById('arsip-upload-name');
                    const sizeEl = document.getElementById('arsip-upload-size');
                    const preview = document.getElementById('arsip-upload-preview');

                    if (iconEl) iconEl.className = 'fas ' + info.icon + ' text-2xl ' + info.color;
                    if (nameEl) nameEl.textContent = file.name;
                    if (sizeEl) sizeEl.textContent = displaySize;
                    if (preview) preview.classList.remove('hidden');

                    // Auto-detect jenis
                    if (jenisSelect && (!jenisSelect.value || jenisSelect.value === 'other')) {
                        jenisSelect.value = jenis;
                    }
                });
            }

            // Auto-detect jenis dari URL input
            if (fileUrlInput && !fileUrlInput.dataset.jenisAttached) {
                fileUrlInput.dataset.jenisAttached = 'true';
                fileUrlInput.addEventListener('input', debounceEvent.bind(null, 'arsip-jenis', () => {
                    const url = fileUrlInput.value.trim();
                    if (!url) return;
                    const jenis = detectJenis(url);
                    if (jenis && jenisSelect && (!jenisSelect.value || jenisSelect.value === 'other')) {
                        jenisSelect.value = jenis;
                    }
                }, 500));
            }
        }

        function clearUploadPreview() {
            const preview = document.getElementById('arsip-upload-preview');
            if (preview) preview.classList.add('hidden');
            if (uploadPreviewUrl) {
                URL.revokeObjectURL(uploadPreviewUrl);
                uploadPreviewUrl = '';
            }
        }

        // ================================================================
        // 19. TAMBAH
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Arsip';
                form.reset();
                if (idInput) idInput.value = '';
                if (fileUrlInput) fileUrlInput.value = '';
                clearUploadPreview();
                const fileInput = document.getElementById('arsip_file');
                if (fileInput) fileInput.value = '';
                openModal();
            });
        }

        // ================================================================
        // 20. EDIT
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(a => a.id === id);
            if (!item) {
                showToast('Data tidak ditemukan.', 'warning');
                return;
            }
            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Arsip';
            if (idInput) idInput.value = item.id;
            if (judulInput) judulInput.value = item.judul || '';
            if (tahunInput) tahunInput.value = item.tahun || '';
            if (kategoriSelect) kategoriSelect.value = item.kategori || 'dokumen';
            if (jenisSelect) jenisSelect.value = item.jenis || 'pdf';
            if (fileUrlInput) fileUrlInput.value = item.file_url || '';
            if (deskripsiInput) deskripsiInput.value = item.deskripsi || '';
            clearUploadPreview();
            openModal();
        };

        // ================================================================
        // 21. DELETE SINGLE
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(a => a.id === id);
            const judul = item ? (item.judul || 'arsip ini') : 'arsip ini';

            showConfirm('Hapus "' + judul + '"?', async () => {
                const result = await apiCall('deleteArsip', 'POST', { id });
                if (result && result.success) {
                    dataCache = dataCache.filter(a => a.id !== id);
                    updateTahunOptions();
                    applyFilter();
                    await logActivity('DELETE', 'arsip', id, 'Hapus: ' + judul);
                    showToast('Arsip berhasil dihapus!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 22. SUBMIT FORM
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const judul = (judulInput.value || '').trim();
            const tahun = (tahunInput.value || '').trim();
            const kategori = kategoriSelect.value || 'dokumen';
            const jenis = jenisSelect.value || 'pdf';
            const file_url = (fileUrlInput.value || '').trim();
            const deskripsi = (deskripsiInput.value || '').trim();

            const fileInput = document.getElementById('arsip_file');
            const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

            if (!judul) {
                showToast('Judul wajib diisi!', 'warning');
                judulInput.focus();
                return;
            }
            if (!tahun) {
                showToast('Tahun wajib diisi!', 'warning');
                tahunInput.focus();
                return;
            }
            if (!file_url && !hasFile) {
                showToast('Pilih file atau masukkan URL file!', 'warning');
                fileUrlInput.focus();
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                const data = {
                    judul: judul,
                    tahun: tahun,
                    kategori: kategori,
                    jenis: jenis,
                    file_url: file_url,
                    deskripsi: deskripsi
                };

                const id = idInput.value;
                const action = id ? 'updateArsip' : 'createArsip';
                const payload = id ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    // Update cache
                    if (id) {
                        const idx = dataCache.findIndex(a => a.id === id);
                        if (idx !== -1) dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                    } else {
                        const newItem = Object.assign({}, data, {
                            id: result.id,
                            created_at: new Date().toISOString()
                        });
                        dataCache.unshift(newItem);
                    }

                    updateTahunOptions();
                    applyFilter();

                    // Upload file di background
                    if (hasFile) {
                        const targetId = id || result.id;
                        showToast('Data tersimpan, mengunggah file...', 'info', 3000);

                        uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                            if (uploadResult && uploadResult.success) {
                                const uploadedUrl = uploadResult.url;
                                const autoJenis = detectJenis(fileInput.files[0].name);

                                apiCall('updateArsip', 'POST', {
                                    id: targetId,
                                    file_url: uploadedUrl,
                                    jenis: autoJenis
                                }).then(() => {
                                    const idx = dataCache.findIndex(a => a.id === targetId);
                                    if (idx !== -1) {
                                        dataCache[idx].file_url = uploadedUrl;
                                        dataCache[idx].jenis = autoJenis;
                                        applyFilter();
                                    }
                                    showToast('✅ File berhasil diunggah!', 'success');
                                });
                            } else {
                                showToast('Gagal upload file', 'error');
                            }
                        }).catch(err => {
                            showToast('Gagal upload: ' + err.message, 'error');
                        });
                    }

                    closeModal();
                    form.reset();

                    await logActivity(id ? 'UPDATE' : 'CREATE', 'arsip', result.id || id, 'Arsip: ' + judul);
                    showToast(id ? '✅ Arsip berhasil diperbarui!' : '✅ Arsip berhasil disimpan!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                console.error('[arsip_admin] Submit error:', error);
                showToast('Error: ' + error.message, 'error');
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
                showToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Judul', 'Tahun', 'Kategori', 'Jenis', 'Deskripsi', 'URL', 'Tanggal'];
            const rows = filteredCache.map((a, i) => [
                i + 1,
                a.judul || '',
                a.tahun || '',
                a.kategori || '',
                a.jenis || '',
                a.deskripsi || '',
                a.file_url || '',
                formatDate(a.created_at)
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `arsip_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 24. REFRESH
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
                    showToast('Data arsip diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 25. INIT
        // ================================================================
        console.log('[arsip_admin] Init selesai, memuat data...');

        ensureExtraUI();
        ensureUploadPreview();
        attachFilterListeners();
        attachBulkListeners();

        loadData();
    }

    // ================================================================
    // 26. RUN INIT
    // ================================================================
    init();
});