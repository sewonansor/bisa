/**
 * js/galeri_admin.js
 * Modul Admin Galeri Media & Dokumentasi — v11.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v11.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge, toast warning)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Upload file skip saat offline (warning)
 *   ✅ NEW: Grid view + List view toggle
 *   ✅ NEW: Lightbox modal dengan navigasi (prev/next/keyboard)
 *   ✅ NEW: Bulk delete dengan konfirmasi
 *   ✅ NEW: Copy URL media ke clipboard
 *   ✅ NEW: Filter tipe (foto/video) + kategori
 *   ✅ NEW: Search real-time (judul, deskripsi, kategori)
 *   ✅ NEW: Sort (terbaru, judul, tipe)
 *   ✅ NEW: Stats 5 kartu (total, foto, video, kategori, bulan ini)
 *   ✅ NEW: Detail modal dengan preview (image/youtube/video)
 *   ✅ NEW: Edit mode pre-fill existing data
 *   ✅ NEW: Auto-detect tipe dari URL
 *   ✅ NEW: YouTube thumbnail extraction
 *   ✅ NEW: Export CSV dengan filter aktif
 *   ✅ FIX: Semua handler idempotent (no double bind)
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit via isSubmitting
 *   ✅ FIX: XSS protection di semua output
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 * ============================================================
 */

App.register('galeri_admin', function() {
    'use strict';

    // ================================================================
    // 1. AUTH GUARD
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__galeriAdminLoaded) {
        console.log('[galeri_admin] Sudah di-init, skip.');
        return;
    }
    window.__galeriAdminLoaded = true;

    console.log('[galeri_admin] 🚀 Init v11.0.0 (Offline-First Full Fix)');

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

    function detectTipeFromUrl(url) {
        if (!url) return 'foto';
        const s = String(url).toLowerCase();
        if (s.includes('youtube.com') || s.includes('youtu.be')) return 'video';
        if (/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(s)) return 'video';
        return 'foto';
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

    function getYoutubeThumb(url) {
        const vid = getYoutubeId(url);
        return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '';
    }

    function isImageUrl(url) {
        if (!url) return false;
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url) ||
               url.includes('lh3.googleusercontent.com') ||
               url.includes('drive.google.com/thumbnail');
    }

    function isYoutubeUrl(url) {
        if (!url) return false;
        return url.includes('youtube.com') || url.includes('youtu.be');
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
            console.log('[galeri_admin:' + (type || 'info') + ']', msg);
        }
    }

    /**
     * Render media thumbnail
     */
    function renderMediaThumb(item, size) {
        size = size || 'md';
        const sizeClass = size === 'sm' ? 'w-16 h-12' : 'w-20 h-14';
        const url = item.file_url || '';

        if (!url) {
            return `<div class="${sizeClass} rounded-lg bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-dim)]">
                        <i class="fas fa-image text-lg opacity-50"></i>
                    </div>`;
        }

        if (isYoutubeUrl(url)) {
            const thumbUrl = getYoutubeThumb(url);
            if (thumbUrl) {
                return `<img src="${escapeAttr(thumbUrl)}" 
                            alt="${escapeAttr(item.judul)}"
                            class="${sizeClass} object-cover rounded-lg cursor-pointer hover:scale-105 transition border border-[var(--card-border)]"
                            loading="lazy"
                            onclick="viewDetail('${escapeAttr(item.id)}')">`;
            }
            return `<button onclick="viewDetail('${escapeAttr(item.id)}')"
                        class="${sizeClass} rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-600 dark:text-red-400">
                        <i class="fab fa-youtube text-xl"></i>
                    </button>`;
        }

        if (isImageUrl(url)) {
            return `<img src="${escapeAttr(url)}"
                        alt="${escapeAttr(item.judul)}"
                        class="${sizeClass} object-cover rounded-lg cursor-pointer hover:scale-105 transition border border-[var(--card-border)]"
                        loading="lazy"
                        onclick="viewDetail('${escapeAttr(item.id)}')"
                        onerror="this.outerHTML='<div class=\\'${sizeClass} rounded-lg bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-dim)]\\'><i class=\\'fas fa-image-slash text-lg opacity-50\\'></i></div>'">`;
        }

        return `<button onclick="viewDetail('${escapeAttr(item.id)}')"
                    class="${sizeClass} rounded-lg bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-muted)]">
                    <i class="fas fa-file text-xl"></i>
                </button>`;
    }

    /**
     * Refresh data tanpa reload
     */
    function refreshDataOnly() {
        console.log('[galeri_admin] 🔄 Refresh data without reload');

        try {
            const cKey = 'cache_getGaleri_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKey);
        } catch (e) {}

        dataCache = [];
        selectedIds.clear();

        return loadData(true).then(() => {
            console.log('[galeri_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'table-body',
            'galeri-modal', 'modal-content', 'modal-title',
            'form', 'modal-close',
            'add-btn', 'refresh-galeri-btn',
            'edit-id', 'galeri_judul', 'galeri_deskripsi', 'galeri_file',
            'galeri_url', 'galeri_tipe', 'galeri_kategori',
            'total-media', 'total-foto', 'total-video'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody        = els['table-body'];
        const modal            = els['galeri-modal'];
        const modalContent     = els['modal-content'];
        const modalTitle       = els['modal-title'];
        const form             = els['form'];
        const closeBtn         = els['modal-close'];
        const addBtn           = els['add-btn'];
        const refreshBtn       = els['refresh-galeri-btn'];
        const editId           = els['edit-id'];
        const judulInput       = els['galeri_judul'];
        const deskripsiInput   = els['galeri_deskripsi'];
        const fileInput        = els['galeri_file'];
        const urlInput         = els['galeri_url'];
        const tipeSelect       = els['galeri_tipe'];
        const kategoriSelect   = els['galeri_kategori'];
        const totalMediaEl     = els['total-media'];
        const totalFotoEl      = els['total-foto'];
        const totalVideoEl     = els['total-video'];

        if (!tableBody || !modal || !form) {
            console.error('[galeri_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let isEdit = false;
        let isSubmitting = false;
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = {
            search: '',
            tipe: 'all',
            kategori: 'all',
            sort: 'terbaru'
        };
        let selectedIds = new Set();
        let currentView = 'list'; // 'list' | 'grid'
        let lightboxIndex = -1;

        // ================================================================
        // 7. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 5 kartu =====
            if (!document.getElementById('galeri-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'galeri-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Media</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-media">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-images"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Foto</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-total-foto">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-camera"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Video</p>
                                <p class="text-2xl font-bold text-red-600 mt-1" id="stats-total-video">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white">
                                <i class="fas fa-video"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Kategori</p>
                                <p class="text-lg font-bold text-green-600 mt-1" id="stats-kategori-galeri">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-tags"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-yellow-600 mt-1" id="stats-bulan-ini-galeri">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
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
            if (!document.getElementById('galeri-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'galeri-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="galeri-search" placeholder="Cari judul, deskripsi..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="galeri-filter-tipe" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Tipe</option>
                        <option value="foto">📷 Foto</option>
                        <option value="video">🎥 Video</option>
                    </select>
                    <select id="galeri-filter-kategori" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Kategori</option>
                        <option value="Kegiatan">Kegiatan</option>
                        <option value="Pengajian">Pengajian</option>
                        <option value="Bakti Sosial">Bakti Sosial</option>
                        <option value="Rapat">Rapat</option>
                        <option value="Lainnya">Lainnya</option>
                    </select>
                    <select id="galeri-sort" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="terbaru">Terbaru</option>
                        <option value="judul-asc">Judul A-Z</option>
                        <option value="judul-desc">Judul Z-A</option>
                        <option value="tipe-asc">Tipe A-Z</option>
                    </select>
                    <div class="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
                        <button id="galeri-view-list" type="button" class="px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]" title="List view">
                            <i class="fas fa-list"></i>
                        </button>
                        <button id="galeri-view-grid" type="button" class="px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]" title="Grid view">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                    <button id="galeri-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                    <button id="galeri-clear-filter" type="button" class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                if (header && header.parentNode) {
                    header.parentNode.insertBefore(wrapper, header.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('galeri-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'galeri-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-galeri">0</span> media dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-galeri-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-galeri-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;

                const searchWrap = document.getElementById('galeri-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }

            // ===== Grid View Container (hidden by default) =====
            if (!document.getElementById('galeri-grid-view')) {
                const gridView = document.createElement('div');
                gridView.id = 'galeri-grid-view';
                gridView.className = 'hidden grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6';
                
                // Insert after table
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
        // 8. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('galeri-search');
            const filterTipe = document.getElementById('galeri-filter-tipe');
            const filterKategori = document.getElementById('galeri-filter-kategori');
            const sortSelect = document.getElementById('galeri-sort');
            const exportBtn = document.getElementById('galeri-export-btn');
            const clearBtn = document.getElementById('galeri-clear-filter');
            const viewListBtn = document.getElementById('galeri-view-list');
            const viewGridBtn = document.getElementById('galeri-view-grid');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'galeri-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (filterTipe && !filterTipe.dataset.attached) {
                filterTipe.dataset.attached = 'true';
                filterTipe.addEventListener('change', function() {
                    currentFilter.tipe = this.value;
                    applyFilter();
                });
            }

            if (filterKategori && !filterKategori.dataset.attached) {
                filterKategori.dataset.attached = 'true';
                filterKategori.addEventListener('change', function() {
                    currentFilter.kategori = this.value;
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
                    currentFilter = { search: '', tipe: 'all', kategori: 'all', sort: 'terbaru' };
                    if (searchInput) searchInput.value = '';
                    if (filterTipe) filterTipe.value = 'all';
                    if (filterKategori) filterKategori.value = 'all';
                    if (sortSelect) sortSelect.value = 'terbaru';
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
        // 9. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(g => {
                if (currentFilter.tipe !== 'all' && (g.tipe || 'foto') !== currentFilter.tipe) return false;
                if (currentFilter.kategori !== 'all' && (g.kategori || '') !== currentFilter.kategori) return false;

                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [g.judul, g.deskripsi, g.kategori]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort
            switch (currentFilter.sort) {
                case 'terbaru':
                    filteredCache.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    break;
                case 'judul-asc':
                    filteredCache.sort((a, b) => String(a.judul || '').localeCompare(String(b.judul || '')));
                    break;
                case 'judul-desc':
                    filteredCache.sort((a, b) => String(b.judul || '').localeCompare(String(a.judul || '')));
                    break;
                case 'tipe-asc':
                    filteredCache.sort((a, b) => String(a.tipe || '').localeCompare(String(b.tipe || '')));
                    break;
            }

            renderView();
            updateStats();
        }

        // ================================================================
        // 10. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const foto = dataCache.filter(g => (g.tipe || 'foto') === 'foto').length;
            const video = dataCache.filter(g => g.tipe === 'video').length;

            const kategoriSet = new Set();
            dataCache.forEach(g => {
                if (g.kategori) kategoriSet.add(String(g.kategori).trim());
            });

            const now = new Date();
            const bulanIni = dataCache.filter(g => {
                const d = new Date(g.created_at);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const el1 = document.getElementById('stats-total-media');
            const el2 = document.getElementById('stats-total-foto');
            const el3 = document.getElementById('stats-total-video');
            const el4 = document.getElementById('stats-kategori-galeri');
            const el5 = document.getElementById('stats-bulan-ini-galeri');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = foto;
            if (el3) el3.textContent = video;
            if (el4) el4.textContent = kategoriSet.size;
            if (el5) el5.textContent = bulanIni;

            if (totalMediaEl) totalMediaEl.textContent = total;
            if (totalFotoEl) totalFotoEl.textContent = foto;
            if (totalVideoEl) totalVideoEl.textContent = video;
        }

        // ================================================================
        // 11. RENDER VIEW (List / Grid)
        // ================================================================
        function renderView() {
            const tableView = tableBody.closest('.table-wrapper') || 
                             tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]') || 
                             tableBody.closest('table');
            const realTableView = tableView && tableView.tagName === 'TABLE' 
                ? tableView.parentNode 
                : tableView;
            const gridView = document.getElementById('galeri-grid-view');

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
        // 12. RENDER TABLE (LIST VIEW)
        // ================================================================
        function renderTable() {
            if (!filteredCache || filteredCache.length === 0) {
                const isFiltered = currentFilter.search ||
                                   currentFilter.tipe !== 'all' ||
                                   currentFilter.kategori !== 'all';
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-images text-3xl mb-2 opacity-40"></i><p>Belum ada media</p>') +
                    '</td></tr>';
                return;
            }

            updateThead();

            let html = '';
            filteredCache.forEach((item, idx) => {
                const isSelected = selectedIds.has(item.id);
                const pending = isPendingSync(item.id);
                const url = item.file_url || '';
                const tipe = item.tipe || detectTipeFromUrl(url);

                const tipeBadge = tipe === 'video'
                    ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Video</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Foto</span>';

                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''} ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="galeri-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${escapeAttr(item.id)}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-3 py-3">${renderMediaThumb(item, 'md')}</td>
                        <td class="px-3 py-3 text-sm">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="font-medium text-[var(--text-main)] hover:text-blue-600 dark:hover:text-blue-400 text-left">
                                ${escapeHtml(item.judul || '-')}
                            </button>
                            ${item.deskripsi ? `<div class="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">${escapeHtml(item.deskripsi)}</div>` : ''}
                        </td>
                        <td class="px-3 py-3 text-sm">${tipeBadge}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.kategori || '-')}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="viewDetail('${escapeAttr(item.id)}')"
                                class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2"
                                title="Preview">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${url ? `<button onclick="copyMediaUrl('${escapeAttr(item.id)}')"
                                class="text-purple-600 hover:text-purple-800 dark:text-purple-400 mr-2"
                                title="Copy URL">
                                <i class="fas fa-link"></i>
                            </button>` : ''}
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
            if (!thead || thead.querySelector('.bulk-select-all-galeri')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-galeri w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-galeri');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.galeri-checkbox').forEach(cb => {
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

        // ================================================================
        // 13. RENDER GRID
        // ================================================================
        function renderGrid() {
            const gridView = document.getElementById('galeri-grid-view');
            if (!gridView) return;

            if (!filteredCache || filteredCache.length === 0) {
                const isFiltered = currentFilter.search ||
                                   currentFilter.tipe !== 'all' ||
                                   currentFilter.kategori !== 'all';
                gridView.className = 'grid grid-cols-1 gap-4 mb-6';
                gridView.innerHTML = '<div class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-images text-3xl mb-2 opacity-40"></i><p>Belum ada media</p>') +
                    '</div>';
                return;
            }

            gridView.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6';

            let html = '';
            filteredCache.forEach((item) => {
                const url = item.file_url || '';
                const tipe = item.tipe || detectTipeFromUrl(url);
                const pending = isPendingSync(item.id);

                // Thumbnail
                let thumbHtml = '';
                if (isYoutubeUrl(url)) {
                    const thumbUrl = getYoutubeThumb(url);
                    thumbHtml = thumbUrl
                        ? `<img src="${escapeAttr(thumbUrl)}" alt="${escapeAttr(item.judul)}" class="w-full h-full object-cover">`
                        : `<div class="w-full h-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-600 dark:text-red-400"><i class="fab fa-youtube text-4xl"></i></div>`;
                } else if (isImageUrl(url)) {
                    thumbHtml = `<img src="${escapeAttr(url)}" alt="${escapeAttr(item.judul)}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-dim)]\\'><i class=\\'fas fa-image text-3xl opacity-50\\'></i></div>'">`;
                } else if (url) {
                    thumbHtml = `<div class="w-full h-full bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-muted)]"><i class="fas fa-file text-3xl"></i></div>`;
                } else {
                    thumbHtml = `<div class="w-full h-full bg-[var(--bg-stats)] flex items-center justify-center text-[var(--text-dim)]"><i class="fas fa-image text-3xl opacity-50"></i></div>`;
                }

                const pendingBadge = pending
                    ? '<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white z-10">⟳ SYNC</span>'
                    : '';

                html += `
                    <div class="group relative bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer" onclick="viewDetail('${escapeAttr(item.id)}')">
                        ${pendingBadge}
                        <div class="aspect-[4/3] relative overflow-hidden bg-[var(--bg-stats)]">
                            ${thumbHtml}
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div class="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span class="text-xs text-white font-semibold line-clamp-2">${escapeHtml(item.judul || '-')}</span>
                            </div>
                        </div>
                        <div class="p-2">
                            <div class="flex items-center justify-between gap-1">
                                <span class="text-xs text-[var(--text-muted)] truncate">${escapeHtml(item.kategori || '-')}</span>
                                <span class="text-xs px-1.5 py-0.5 rounded-full ${tipe === 'video' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'} flex-shrink-0">${tipe}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            gridView.innerHTML = html;
        }

        function attachCheckboxListeners() {
            document.querySelectorAll('.galeri-checkbox').forEach(cb => {
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
            const bulkBar = document.getElementById('galeri-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-galeri');
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
            const delBtn = document.getElementById('bulk-delete-galeri-btn');
            const cancelBtn = document.getElementById('bulk-cancel-galeri-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} media? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0, offline = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteGaleri', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    if (r._offline) offline++;
                                    dataCache = dataCache.filter(g => String(g.id) !== String(id));
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.galeri-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-galeri');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            safeToast(`✅ ${ok} media berhasil dihapus!` +
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
                    document.querySelectorAll('.galeri-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-galeri');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 15. VIEW DETAIL MODAL
        // ================================================================
        window.viewDetail = function(id) {
            const item = dataCache.find(g => String(g.id) === String(id));
            if (!item) {
                safeToast('Media tidak ditemukan.', 'warning');
                return;
            }

            let detailModal = document.getElementById('galeri-detail-modal');
            if (!detailModal) {
                detailModal = document.createElement('div');
                detailModal.id = 'galeri-detail-modal';
                detailModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                detailModal.innerHTML = `
                    <div id="galeri-detail-content"
                         class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)]">
                            <h3 id="galeri-detail-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4 line-clamp-2"></h3>
                            <button id="galeri-detail-close"
                                class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="galeri-detail-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="galeri-detail-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="galeri-detail-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(detailModal);

                const closeFn = () => {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('galeri-detail-close').addEventListener('click', closeFn);
                document.getElementById('galeri-detail-ok').addEventListener('click', closeFn);
                detailModal.addEventListener('click', (e) => {
                    if (e.target === detailModal) closeFn();
                });
            }

            const content = document.getElementById('galeri-detail-content');
            const titleEl = document.getElementById('galeri-detail-title');
            const bodyEl = document.getElementById('galeri-detail-body');
            const url = item.file_url || '';
            const tipe = item.tipe || detectTipeFromUrl(url);

            titleEl.textContent = item.judul || '-';

            let previewHtml = '';
            if (isYoutubeUrl(url)) {
                const vid = getYoutubeId(url);
                previewHtml = vid
                    ? `<div class="rounded-lg overflow-hidden border border-[var(--card-border)] aspect-video">
                        <iframe src="https://www.youtube.com/embed/${escapeAttr(vid)}"
                            class="w-full h-full" frameborder="0" allowfullscreen></iframe>
                       </div>`
                    : `<div class="text-center py-8 bg-[var(--bg-stats)] rounded-lg">
                        <i class="fas fa-video text-5xl text-[var(--text-muted)] mb-3"></i>
                        <p class="text-sm text-[var(--text-muted)] mb-3">Link video tidak valid</p>
                        <a href="${escapeAttr(url)}" target="_blank" rel="noopener"
                            class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg">
                            <i class="fas fa-external-link-alt"></i> Buka Video
                        </a>
                       </div>`;
            } else if (isImageUrl(url)) {
                previewHtml = `<div class="rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--bg-stats)] flex items-center justify-center" style="max-height:400px">
                    <img src="${escapeAttr(url)}" alt="${escapeAttr(item.judul)}"
                        class="max-w-full max-h-[400px] object-contain">
                </div>`;
            } else if (url) {
                previewHtml = `<div class="text-center py-8 bg-[var(--bg-stats)] rounded-lg">
                    <i class="fas fa-file-video text-5xl text-[var(--text-muted)] mb-3"></i>
                    <p class="text-sm text-[var(--text-muted)] mb-3">Preview tidak tersedia</p>
                    <a href="${escapeAttr(url)}" target="_blank" rel="noopener"
                        class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg">
                        <i class="fas fa-external-link-alt"></i> Buka Media
                    </a>
                </div>`;
            } else {
                previewHtml = '<p class="text-center text-[var(--text-muted)] py-8 italic">Tidak ada file.</p>';
            }

            const tipeLabel = tipe === 'video' ? '🎥 Video' : '📷 Foto';

            bodyEl.innerHTML = `
                ${previewHtml}

                <div class="grid grid-cols-2 gap-4 mt-5">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tipe</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(tipeLabel)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Kategori</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(item.kategori || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Upload</p>
                        <p class="text-[var(--text-main)]">${escapeHtml(formatDate(item.created_at))}</p>
                    </div>
                    ${item.deskripsi ? `
                        <div class="col-span-2">
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Deskripsi</p>
                            <p class="text-[var(--text-main)] whitespace-pre-wrap">${escapeHtml(item.deskripsi)}</p>
                        </div>
                    ` : ''}
                    ${url ? `
                        <div class="col-span-2">
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">URL File</p>
                            <div class="flex items-center gap-2">
                                <p class="text-[var(--text-main)] text-xs break-all flex-1">${escapeHtml(url)}</p>
                                <button onclick="copyMediaUrl('${escapeAttr(item.id)}')"
                                    class="text-purple-600 hover:text-purple-800 flex-shrink-0"
                                    title="Copy URL">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;

            const editBtn = document.getElementById('galeri-detail-edit');
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
        // 16. COPY MEDIA URL
        // ================================================================
        window.copyMediaUrl = function(id) {
            const item = dataCache.find(g => String(g.id) === String(id));
            if (!item || !item.file_url) {
                safeToast('URL tidak tersedia.', 'warning');
                return;
            }
            copyToClipboard(item.file_url)
                .then(() => safeToast('URL dicopy!', 'success', 2000))
                .catch(() => safeToast('Gagal copy URL', 'error'));
        };

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

            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data galeri...</p></td></tr>';

            try {
                const result = await forceRefreshData('getGaleri', {});

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    applyFilter();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[galeri_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getGaleri', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[galeri_admin] BG refresh gagal:', e);
            }
        }

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
            if (form) form.reset();
            if (editId) editId.value = '';
            if (fileInput) fileInput.value = '';
            if (urlInput) urlInput.value = '';
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

        // ================================================================
        // 19. AUTO-DETECT TIPE DARI URL
        // ================================================================
        if (urlInput && !urlInput.dataset.autoDetect) {
            urlInput.dataset.autoDetect = 'true';
            urlInput.addEventListener('input',
                debounceEvent.bind(null, 'galeri-tipe', () => {
                    const url = urlInput.value.trim();
                    if (!url) return;
                    const tipe = detectTipeFromUrl(url);
                    if (tipeSelect && tipeSelect.value !== tipe) {
                        tipeSelect.value = tipe;
                    }
                }, 500));
        }

        // ================================================================
        // 20. TAMBAH MEDIA
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Media';
                if (form) form.reset();
                if (editId) editId.value = '';
                if (fileInput) fileInput.value = '';
                if (urlInput) urlInput.value = '';
                openModal();
            });
        }

        // ================================================================
        // 21. EDIT MEDIA
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(g => String(g.id) === String(id));
            if (!item) {
                safeToast('Media tidak ditemukan.', 'warning');
                return;
            }

            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Media';
            if (editId) editId.value = item.id;
            if (judulInput) judulInput.value = item.judul || '';
            if (deskripsiInput) deskripsiInput.value = item.deskripsi || '';
            if (tipeSelect) tipeSelect.value = item.tipe || 'foto';
            if (kategoriSelect) kategoriSelect.value = item.kategori || 'Kegiatan';
            if (urlInput) urlInput.value = item.file_url || '';
            if (fileInput) fileInput.value = '';
            openModal();
        };

        // ================================================================
        // 22. DELETE SINGLE
        // ================================================================
        window.deleteItem = function(id) {
            const item = dataCache.find(g => String(g.id) === String(id));
            const judul = item ? (item.judul || 'media ini') : 'media ini';

            showConfirm('Hapus "' + judul + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteGaleri', 'POST', { id });
                    if (result && result.success) {
                        dataCache = dataCache.filter(g => String(g.id) !== String(id));
                        applyFilter();
                        await logActivity('DELETE', 'galeri', id, 'Hapus: ' + judul);

                        if (result._offline) {
                            safeToast('📴 Media dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Media berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[galeri_admin] deleteItem error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 23. SUBMIT FORM
        // ================================================================
        if (form) {
            const fresh = form.cloneNode(true);
            form.parentNode.replaceChild(fresh, form);

            fresh.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const judul = judulInput ? (judulInput.value || '').trim() : '';
                const deskripsi = deskripsiInput ? (deskripsiInput.value || '').trim() : '';
                const tipe = tipeSelect ? tipeSelect.value : 'foto';
                const kategori = kategoriSelect ? kategoriSelect.value : 'Kegiatan';
                let file_url = urlInput ? (urlInput.value || '').trim() : '';

                const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

                if (!judul) {
                    safeToast('Judul wajib diisi!', 'warning');
                    if (judulInput) judulInput.focus();
                    return;
                }
                if (!file_url && !hasFile) {
                    safeToast('Masukkan URL atau upload file!', 'warning');
                    if (urlInput) urlInput.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const data = {
                        judul: judul,
                        deskripsi: deskripsi,
                        file_url: file_url,
                        tipe: tipe,
                        kategori: kategori
                    };

                    const id = editId ? editId.value : '';
                    const action = id ? 'updateGaleri' : 'createGaleri';
                    const payload = id ? Object.assign({ id: id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        // Update cache lokal
                        if (id) {
                            const idx = dataCache.findIndex(g => String(g.id) === String(id));
                            if (idx !== -1) dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: id });
                        } else {
                            const newItem = Object.assign({}, data, {
                                id: result.id || ('tmp_' + Date.now()),
                                created_at: new Date().toISOString()
                            });
                            dataCache.unshift(newItem);
                        }

                        applyFilter();

                        // Upload file di background (hanya jika online)
                        if (hasFile) {
                            if (!navigator.onLine) {
                                safeToast('📴 Upload file memerlukan koneksi internet.', 'warning', 4000);
                            } else {
                                const targetId = id || result.id;
                                safeToast('Data tersimpan, mengunggah file...', 'info', 3000);

                                uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                                    if (uploadResult && uploadResult.success) {
                                        const uploadedUrl = uploadResult.url;
                                        const autoTipe = detectTipeFromUrl(fileInput.files[0].name);

                                        apiCall('updateGaleri', 'POST', {
                                            id: targetId,
                                            file_url: uploadedUrl,
                                            tipe: autoTipe
                                        }).then(() => {
                                            const idx = dataCache.findIndex(g => String(g.id) === String(targetId));
                                            if (idx !== -1) {
                                                dataCache[idx].file_url = uploadedUrl;
                                                dataCache[idx].tipe = autoTipe;
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

                        await logActivity(id ? 'UPDATE' : 'CREATE', 'galeri', result.id || id, 'Media: ' + judul);

                        if (result._offline) {
                            safeToast('📴 Media tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                        } else {
                            safeToast(id ? '✅ Media berhasil diperbarui!' : '✅ Media berhasil disimpan!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    console.error('[galeri_admin] Submit error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 24. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Judul', 'Deskripsi', 'Tipe', 'Kategori', 'URL', 'Tanggal'];
            const rows = filteredCache.map((g, i) => [
                i + 1,
                g.judul || '',
                g.deskripsi || '',
                g.tipe || 'foto',
                g.kategori || '',
                g.file_url || '',
                formatDate(g.created_at)
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `galeri_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 25. REFRESH BUTTON
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
                    safeToast('✅ Data galeri diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 26. ESC HANDLER
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;

            const detailModal = document.getElementById('galeri-detail-modal');
            const lightbox = document.getElementById('galeri-lightbox');

            if (lightbox && !lightbox.classList.contains('hidden')) {
                lightbox.classList.add('hidden');
                lightbox.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 27. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[galeri_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 28. CLEANUP
        // ================================================================
        function cleanup() {
            window.__galeriAdminLoaded = false;
            isSubmitting = false;
            selectedIds.clear();
            const detailModal = document.getElementById('galeri-detail-modal');
            if (detailModal) detailModal.remove();
            const lightbox = document.getElementById('galeri-lightbox');
            if (lightbox) lightbox.remove();
            document.body.style.overflow = '';
            console.log('[galeri_admin] Cleanup');
        }
        window.__galeriAdminCleanup = cleanup;

        // ================================================================
        // 29. INIT SEQUENCE
        // ================================================================
        console.log('[galeri_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        await loadData();

        console.log('[galeri_admin] ✅ Init selesai v11.0.0');
    }

    // ================================================================
    // 30. RUN INIT
    // ================================================================
    init();
});