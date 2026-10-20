/**
 * js/arsip_admin.js
 * Modul Admin Arsip Digital — v12.0.0 OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v12.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge, toast warning)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Upload file skip saat offline (warning)
 *   ✅ NEW: Grid view + List view toggle
 *   ✅ NEW: Bulk delete dengan konfirmasi
 *   ✅ NEW: Filter tahun + kategori + jenis
 *   ✅ NEW: Sort (tahun desc, judul, terbaru)
 *   ✅ NEW: Detail modal dengan preview (image/PDF/video)
 *   ✅ NEW: Copy URL file ke clipboard
 *   ✅ NEW: Stats 5 kartu (total, dokumen, laporan, foto, video)
 *   ✅ NEW: Export CSV dengan filter aktif
 *   ✅ NEW: Auto-detect jenis file dari ekstensi
 *   ✅ FIX: Semua handler idempotent (no double bind)
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit via isSubmitting
 *   ✅ FIX: XSS protection di semua output
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 * ---------------------------------------------------------
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

    console.log('[arsip_admin] 🚀 Init v12.0.0 (Offline-First Full Fix)');

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

    function getJenisInfo(jenis) {
        const map = {
            'pdf':   { icon: 'fa-file-pdf', color: 'text-red-600 dark:text-red-400', label: 'PDF' },
            'docx':  { icon: 'fa-file-word', color: 'text-blue-600 dark:text-blue-400', label: 'DOCX' },
            'doc':   { icon: 'fa-file-word', color: 'text-blue-600 dark:text-blue-400', label: 'DOC' },
            'xlsx':  { icon: 'fa-file-excel', color: 'text-green-600 dark:text-green-400', label: 'XLSX' },
            'xls':   { icon: 'fa-file-excel', color: 'text-green-600 dark:text-green-400', label: 'XLS' },
            'ppt':   { icon: 'fa-file-powerpoint', color: 'text-orange-600 dark:text-orange-400', label: 'PPT' },
            'pptx':  { icon: 'fa-file-powerpoint', color: 'text-orange-600 dark:text-orange-400', label: 'PPTX' },
            'img':   { icon: 'fa-image', color: 'text-purple-600 dark:text-purple-400', label: 'Gambar' },
            'video': { icon: 'fa-video', color: 'text-pink-600 dark:text-pink-400', label: 'Video' },
            'audio': { icon: 'fa-music', color: 'text-teal-600 dark:text-teal-400', label: 'Audio' },
            'zip':   { icon: 'fa-file-archive', color: 'text-yellow-600 dark:text-yellow-400', label: 'Arsip' },
            'other': { icon: 'fa-file', color: 'text-gray-600 dark:text-gray-400', label: 'Lainnya' }
        };
        return map[jenis] || map['other'];
    }

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

    function isImageUrl(url) {
        if (!url) return false;
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) ||
               url.includes('drive.google.com/uc') && /\.(jpg|jpeg|png|gif|webp)/i.test(url) ||
               url.includes('lh3.googleusercontent.com');
    }

    function isPdfUrl(url) {
        if (!url) return false;
        return /\.pdf(\?.*)?$/i.test(url);
    }

    function isYoutubeUrl(url) {
        if (!url) return false;
        return url.includes('youtube.com') || url.includes('youtu.be');
    }

    function getYoutubeId(url) {
        if (!url) return '';
        const s = String(url);
        let vid = '';
        if (s.includes('v=')) vid = s.split('v=')[1].split('&')[0];
        else if (s.includes('youtu.be/')) vid = s.split('youtu.be/')[1].split('?')[0];
        else if (s.includes('youtube.com/embed/')) vid = s.split('youtube.com/embed/')[1].split('?')[0];
        return vid;
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
            console.log('[arsip_admin:' + (type || 'info') + ']', msg);
        }
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let dataCache = [];
    let filteredCache = [];
    let currentFilter = {
        search: '',
        tahun: 'all',
        kategori: 'all',
        jenis: 'all',
        sort: 'tahun-desc'
    };
    let currentView = 'list';
    let isEdit = false;
    let isSubmitting = false;
    let selectedIds = new Set();

    // ================================================================
    // 6. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        console.log('[arsip_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getArsip_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadData(true).then(() => {
            console.log('[arsip_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 7. INIT UTAMA
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

        const tableBody = els['arsip-table-body'];
        const modal = els['arsip-modal'];
        const modalContent = els['modal-content'];
        const modalTitle = els['modal-title'];
        const form = els['arsip-form'];
        const closeBtn = els['modal-close'];
        const addBtn = els['add-arsip-btn'];
        const refreshBtn = els['refresh-arsip-btn'];
        const idInput = els['arsip-id'];
        const judulInput = els['arsip_judul'];
        const tahunInput = els['arsip_tahun'];
        const kategoriSelect = els['arsip_kategori'];
        const jenisSelect = els['arsip_jenis'];
        const fileUrlInput = els['arsip_file_url'];
        const deskripsiInput = els['arsip_deskripsi'];

        if (!tableBody || !modal || !form) {
            console.error('[arsip_admin] ❌ Elemen utama tidak ditemukan.');
            return;
        }

        console.log('[arsip_admin] ✅ Semua elemen ditemukan');

        // ================================================================
        // 8. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 5 kartu =====
            if (!document.getElementById('arsip-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'arsip-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6';
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
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Laporan</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-laporan-arsip">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-file-invoice"></i>
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

            // ===== Search & Filter Bar =====
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
                    <select id="arsip-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="tahun-desc">Tahun Terbaru</option>
                        <option value="tahun-asc">Tahun Terlama</option>
                        <option value="judul-asc">Judul A-Z</option>
                        <option value="judul-desc">Judul Z-A</option>
                    </select>
                    <div class="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
                        <button id="arsip-view-list" type="button" class="px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]" title="List view">
                            <i class="fas fa-list"></i>
                        </button>
                        <button id="arsip-view-grid" type="button" class="px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]" title="Grid view">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                    <button id="arsip-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                    <button id="arsip-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
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

            // ===== Grid View =====
            if (!document.getElementById('arsip-grid-view')) {
                const gridView = document.createElement('div');
                gridView.id = 'arsip-grid-view';
                gridView.className = 'hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6';

                const tableWrapper = tableBody.closest('.table-wrapper') ||
                                     tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]') ||
                                     tableBody.closest('table');
                if (tableWrapper && tableWrapper.parentNode) {
                    const realWrapper = tableWrapper.tagName === 'TABLE'
                        ? tableWrapper.parentNode
                        : tableWrapper;
                    if (realWrapper && realWrapper.parentNode) {
                        realWrapper.parentNode.insertBefore(gridView, realWrapper.nextSibling);
                    }
                }
            }
        }

        // ================================================================
        // 9. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('arsip-search');
            const filterTahun = document.getElementById('arsip-filter-tahun');
            const filterKategori = document.getElementById('arsip-filter-kategori');
            const filterJenis = document.getElementById('arsip-filter-jenis');
            const sortSelect = document.getElementById('arsip-sort');
            const exportBtn = document.getElementById('arsip-export-btn');
            const clearBtn = document.getElementById('arsip-clear-filter');
            const viewListBtn = document.getElementById('arsip-view-list');
            const viewGridBtn = document.getElementById('arsip-view-grid');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'arsip-search', () => {
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
                        search: '', tahun: 'all', kategori: 'all',
                        jenis: 'all', sort: 'tahun-desc'
                    };
                    if (searchInput) searchInput.value = '';
                    if (filterTahun) filterTahun.value = 'all';
                    if (filterKategori) filterKategori.value = 'all';
                    if (filterJenis) filterJenis.value = 'all';
                    if (sortSelect) sortSelect.value = 'tahun-desc';
                    applyFilter();
                    safeToast('Filter direset.', 'info', 2000);
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
        // 10. UPDATE TAHUN OPTIONS
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
        // 11. APPLY FILTER
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

            switch (currentFilter.sort) {
                case 'tahun-desc':
                    filteredCache.sort((a, b) => {
                        const ta = String(b.tahun || '');
                        const tb = String(a.tahun || '');
                        if (ta !== tb) return ta.localeCompare(tb);
                        return String(a.judul || '').localeCompare(String(b.judul || ''));
                    });
                    break;
                case 'tahun-asc':
                    filteredCache.sort((a, b) => {
                        const ta = String(a.tahun || '');
                        const tb = String(b.tahun || '');
                        if (ta !== tb) return ta.localeCompare(tb);
                        return String(a.judul || '').localeCompare(String(b.judul || ''));
                    });
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

            renderView();
            updateStats();
        }

        // ================================================================
        // 12. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const dokumen = dataCache.filter(a => a.kategori === 'dokumen').length;
            const laporan = dataCache.filter(a => a.kategori === 'laporan').length;
            const foto = dataCache.filter(a => a.kategori === 'foto' || a.jenis === 'img').length;
            const video = dataCache.filter(a => a.kategori === 'video' || a.jenis === 'video').length;

            const el1 = document.getElementById('stats-total-arsip');
            const el2 = document.getElementById('stats-dokumen');
            const el3 = document.getElementById('stats-laporan-arsip');
            const el4 = document.getElementById('stats-foto-arsip');
            const el5 = document.getElementById('stats-video-arsip');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = dokumen;
            if (el3) el3.textContent = laporan;
            if (el4) el4.textContent = foto;
            if (el5) el5.textContent = video;
        }

        // ================================================================
        // 13. RENDER VIEW (List / Grid)
        // ================================================================
        function renderView() {
            const tableView = tableBody.closest('.table-wrapper') ||
                             tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]') ||
                             tableBody.closest('table');
            const realTableView = tableView && tableView.tagName === 'TABLE'
                ? tableView.parentNode
                : tableView;
            const gridView = document.getElementById('arsip-grid-view');

            if (currentView === 'grid') {
                if (realTableView) realTableView.classList.add('hidden');
                if (gridView) {
                    gridView.classList.remove('hidden');
                    renderGrid();
                }
            } else {
                if (realTableView) realTableView.classList.remove('hidden');
                if (gridView) gridView.classList.add('hidden');
                renderTable();
            }
        }

        // ================================================================
        // 14. RENDER TABLE
        // ================================================================
        function renderTable() {
            if (!filteredCache || filteredCache.length === 0) {
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
            filteredCache.forEach((item, idx) => {
                const isSelected = selectedIds.has(item.id);
                const jenisInfo = getJenisInfo(item.jenis);
                const kategoriBadge = getKategoriColor(item.kategori);
                const hasFile = !!item.file_url;
                const pending = isPendingSync(item.id);

                const fileBtn = hasFile
                    ? `<button onclick="viewDetail('${escapeAttr(item.id)}')"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          title="Preview">
                          <i class="fas fa-eye"></i>
                       </button>`
                    : '<span class="text-[var(--text-muted)] text-xs">-</span>';

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="arsip-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3 text-center">
                            <i class="fas ${jenisInfo.icon} text-2xl ${jenisInfo.color}" title="${jenisInfo.label}"></i>
                        </td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
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
                                <button onclick="copyFileUrl('${escapeAttr(item.id)}')"
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
                            <button onclick="editItem('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 ml-2"
                                title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteItem('${escapeAttr(item.id)}')"
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

        // ================================================================
        // 15. RENDER GRID
        // ================================================================
        function renderGrid() {
            const gridView = document.getElementById('arsip-grid-view');
            if (!gridView) return;

            if (!filteredCache || filteredCache.length === 0) {
                gridView.className = 'grid grid-cols-1 gap-4 mb-6';
                gridView.innerHTML = '<div class="text-center py-8 text-[var(--text-muted)]">' +
                    '<i class="fas fa-archive text-3xl mb-2 opacity-40"></i>' +
                    '<p>Belum ada arsip</p></div>';
                return;
            }

            gridView.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6';

            let html = '';
            filteredCache.forEach((item) => {
                const jenisInfo = getJenisInfo(item.jenis);
                const kategoriBadge = getKategoriColor(item.kategori);
                const pending = isPendingSync(item.id);
                const hasFile = !!item.file_url;

                const pendingBadge = pending
                    ? '<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white z-10">⟳ SYNC</span>'
                    : '';

                html += `
                    <div class="relative bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden shadow-sm hover:shadow-lg transition-all">
                        ${pendingBadge}
                        <div class="p-4">
                            <div class="flex items-start gap-3 mb-3">
                                <div class="w-12 h-12 rounded-lg bg-[var(--bg-stats)] flex items-center justify-center flex-shrink-0">
                                    <i class="fas ${jenisInfo.icon} text-2xl ${jenisInfo.color}"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h3 class="font-bold text-[var(--text-main)] line-clamp-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                        onclick="viewDetail('${escapeAttr(item.id)}')">
                                        ${escapeHtml(item.judul || '-')}
                                    </h3>
                                    <p class="text-xs text-[var(--text-muted)] mt-1">${escapeHtml(item.tahun || '-')} • ${escapeHtml(jenisInfo.label)}</p>
                                </div>
                            </div>
                            <p class="text-sm text-[var(--text-muted)] line-clamp-2 mb-3">${escapeHtml(item.deskripsi || '')}</p>
                            <div class="flex flex-wrap gap-1 mb-3">
                                <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${kategoriBadge}">
                                    ${escapeHtml(item.kategori || '-')}
                                </span>
                            </div>
                            <div class="flex gap-2 pt-3 border-t border-[var(--card-border)]">
                                <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                    class="flex-1 text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] transition">
                                    <i class="fas fa-eye mr-1"></i>Lihat
                                </button>
                                ${hasFile ? `
                                    <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                                        class="text-xs px-2 py-1.5 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 transition"
                                        title="Download">
                                        <i class="fas fa-download"></i>
                                    </a>
                                ` : ''}
                                <button onclick="editItem('${escapeAttr(item.id)}')"
                                    class="text-xs px-2 py-1.5 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 transition"
                                    title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="deleteItem('${escapeAttr(item.id)}')"
                                    class="text-xs px-2 py-1.5 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 transition"
                                    title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            gridView.innerHTML = html;
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
        // 16. BULK DELETE (Offline-aware)
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
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteArsip', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(a => String(a.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.arsip-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-arsip');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        updateTahunOptions();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} arsip berhasil dihapus!` +
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
        // 17. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(a => String(a.id) === String(id));
            if (!item) {
                safeToast('Data tidak ditemukan.', 'warning');
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

            let previewHtml = '';
            if (item.file_url) {
                if (isYoutubeUrl(item.file_url)) {
                    const vid = getYoutubeId(item.file_url);
                    previewHtml = vid
                        ? `<div class="rounded-lg overflow-hidden border border-[var(--card-border)] aspect-video">
                            <iframe src="https://www.youtube.com/embed/${escapeAttr(vid)}"
                                class="w-full h-full" frameborder="0" allowfullscreen></iframe>
                           </div>`
                        : `<div class="text-center py-8 bg-[var(--bg-stats)] rounded-lg">
                            <i class="fas fa-video text-5xl text-[var(--text-muted)] mb-3"></i>
                            <p class="text-sm text-[var(--text-muted)] mb-3">Video YouTube</p>
                            <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                                class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg">
                                <i class="fas fa-external-link-alt"></i> Buka Video
                            </a>
                           </div>`;
                } else if (isImageUrl(item.file_url)) {
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
                        <p class="text-[var(--text-main)]">${escapeHtml(formatDate(item.created_at))}</p>
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
                                <button onclick="copyFileUrl('${escapeAttr(item.id)}')"
                                    class="text-purple-600 hover:text-purple-800 flex-shrink-0"
                                    title="Copy URL">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

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
        // 18. COPY FILE URL
        // ================================================================
        window.copyFileUrl = function(id) {
            const item = dataCache.find(a => String(a.id) === String(id));
            if (!item || !item.file_url) {
                safeToast('URL tidak tersedia.', 'warning');
                return;
            }
            copyToClipboard(item.file_url)
                .then(() => safeToast('URL dicopy!', 'success', 2000))
                .catch(() => safeToast('Gagal copy URL', 'error'));
        };

        // ================================================================
        // 19. MODAL FORM
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
            const detailModal = document.getElementById('arsip-detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 20. UPLOAD PREVIEW
        // ================================================================
        function ensureUploadPreview() {
            if (document.getElementById('arsip-upload-preview')) return;

            const fileUrlParent = fileUrlInput ? fileUrlInput.parentElement : null;
            if (!fileUrlParent) return;

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
                    const prev = document.getElementById('arsip-upload-preview');
                    if (prev) prev.classList.add('hidden');
                });
            }

            if (fileInput && !fileInput.dataset.previewAttached) {
                fileInput.dataset.previewAttached = 'true';
                fileInput.addEventListener('change', () => {
                    if (!fileInput.files || fileInput.files.length === 0) {
                        const prev = document.getElementById('arsip-upload-preview');
                        if (prev) prev.classList.add('hidden');
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
                    const prev = document.getElementById('arsip-upload-preview');

                    if (iconEl) iconEl.className = 'fas ' + info.icon + ' text-2xl ' + info.color;
                    if (nameEl) nameEl.textContent = file.name;
                    if (sizeEl) sizeEl.textContent = displaySize;
                    if (prev) prev.classList.remove('hidden');

                    if (jenisSelect && (!jenisSelect.value || jenisSelect.value === 'other')) {
                        jenisSelect.value = jenis;
                    }
                });
            }

            if (fileUrlInput && !fileUrlInput.dataset.jenisAttached) {
                fileUrlInput.dataset.jenisAttached = 'true';
                fileUrlInput.addEventListener('input',
                    debounceEvent.bind(null, 'arsip-jenis', () => {
                        const url = fileUrlInput.value.trim();
                        if (!url) return;
                        const jenis = detectJenis(url);
                        if (jenis && jenisSelect && (!jenisSelect.value || jenisSelect.value === 'other')) {
                            jenisSelect.value = jenis;
                        }
                    }, 500));
            }
        }

        // ================================================================
        // 21. TAMBAH
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
                const fileInput = document.getElementById('arsip_file');
                if (fileInput) fileInput.value = '';
                const prev = document.getElementById('arsip-upload-preview');
                if (prev) prev.classList.add('hidden');
                openModal();
            });
        }

        // ================================================================
        // 22. EDIT
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(a => String(a.id) === String(id));
            if (!item) {
                safeToast('Data tidak ditemukan.', 'warning');
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
            const fileInput = document.getElementById('arsip_file');
            if (fileInput) fileInput.value = '';
            const prev = document.getElementById('arsip-upload-preview');
            if (prev) prev.classList.add('hidden');
            openModal();
        };

        // ================================================================
        // 23. DELETE SINGLE (Offline-aware)
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(a => String(a.id) === String(id));
            const judul = item ? (item.judul || 'arsip ini') : 'arsip ini';

            showConfirm('Hapus "' + judul + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteArsip', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(a => String(a.id) !== String(id));
                        updateTahunOptions();
                        applyFilter();
                        await logActivity('DELETE', 'arsip', id, 'Hapus: ' + judul);

                        if (result._offline) {
                            safeToast('📴 Arsip dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Arsip berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[arsip_admin] deleteItem error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 24. SUBMIT FORM (Offline-aware)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const judul = judulInput ? (judulInput.value || '').trim() : '';
            const tahun = tahunInput ? (tahunInput.value || '').trim() : '';
            const kategori = kategoriSelect ? kategoriSelect.value : 'dokumen';
            const jenis = jenisSelect ? jenisSelect.value : 'pdf';
            const file_url = fileUrlInput ? (fileUrlInput.value || '').trim() : '';
            const deskripsi = deskripsiInput ? (deskripsiInput.value || '').trim() : '';

            const fileInput = document.getElementById('arsip_file');
            const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

            if (!judul) {
                safeToast('Judul wajib diisi!', 'warning');
                if (judulInput) judulInput.focus();
                return;
            }
            if (!tahun) {
                safeToast('Tahun wajib diisi!', 'warning');
                if (tahunInput) tahunInput.focus();
                return;
            }
            if (!file_url && !hasFile) {
                safeToast('Pilih file atau masukkan URL file!', 'warning');
                if (fileUrlInput) fileUrlInput.focus();
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

                const id = idInput ? idInput.value : '';
                const action = id ? 'updateArsip' : 'createArsip';
                const payload = id ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    // Update cache lokal
                    if (id) {
                        const idx = dataCache.findIndex(a => String(a.id) === String(id));
                        if (idx !== -1) dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                    } else {
                        const newItem = Object.assign({}, data, {
                            id: result.id || ('tmp_' + Date.now()),
                            created_at: new Date().toISOString()
                        });
                        dataCache.unshift(newItem);
                    }

                    updateTahunOptions();
                    applyFilter();

                    // Upload file di background (jika ada)
                    if (hasFile) {
                        if (!navigator.onLine) {
                            safeToast('📴 Upload file memerlukan koneksi internet.', 'warning', 4500);
                        } else {
                            const targetId = id || result.id;
                            safeToast('Data tersimpan, mengunggah file...', 'info', 3000);

                            uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                                if (uploadResult && uploadResult.success) {
                                    const uploadedUrl = uploadResult.url;
                                    const autoJenis = detectJenis(fileInput.files[0].name);

                                    apiCall('updateArsip', 'POST', {
                                        id: targetId,
                                        file_url: uploadedUrl,
                                        jenis: autoJenis
                                    }).then(() => {
                                        const idx = dataCache.findIndex(a => String(a.id) === String(targetId));
                                        if (idx !== -1) {
                                            dataCache[idx].file_url = uploadedUrl;
                                            dataCache[idx].jenis = autoJenis;
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
                    form.reset();

                    await logActivity(id ? 'UPDATE' : 'CREATE', 'arsip', result.id || id, 'Arsip: ' + judul);

                    if (result._offline) {
                        safeToast('📴 Arsip tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(id ? '✅ Arsip berhasil diperbarui!' : '✅ Arsip berhasil disimpan!', 'success');
                    }
                } else {
                    safeToast((result && result.message) || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                console.error('[arsip_admin] Submit error:', error);
                safeToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 25. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
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

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 26. LOAD DATA (SWR)
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
                    applyFilter();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[arsip_admin] loadData error:', error);
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
                console.warn('[arsip_admin] fetchDataBackground error:', e);
            }
        }

        // ================================================================
        // 27. REFRESH BUTTON
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
                    safeToast('✅ Data arsip diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 28. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[arsip_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 29. CLEANUP
        // ================================================================
        function cleanup() {
            window.__arsipAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const detailModal = document.getElementById('arsip-detail-modal');
            if (detailModal) detailModal.remove();
            document.body.style.overflow = '';
            console.log('[arsip_admin] Cleanup');
        }
        window.__arsipAdminCleanup = cleanup;

        // ================================================================
        // 30. INIT SEQUENCE
        // ================================================================
        console.log('[arsip_admin] Loading initial data...');

        ensureExtraUI();
        ensureUploadPreview();
        attachFilterListeners();
        attachBulkListeners();

        await loadData();

        console.log('[arsip_admin] ✅ Init selesai v12.0.0');
    }

    init();
});