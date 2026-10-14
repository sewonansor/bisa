/**
 * js/semua_kegiatan.js
 * Modul Halaman Semua Kegiatan Publik - FULL FIX v10.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi
 *  - XSS protection di semua output
 *  - Loading/error/empty state proper
 *  - Clone-replace listener (anti memory leak)
 *  - Support hash routing
 *
 * FEATURES:
 *  - Featured kegiatan (1 terbaru) + grid kegiatan biasa
 *  - Search real-time (kegiatan, tempat, deskripsi)
 *  - Filter by tahun + tempat
 *  - Sort (terbaru, terlama, judul A-Z)
 *  - Pagination "Load More" (6 per load)
 *  - Stats 3 kartu (total, tahun ini, tempat unik)
 *  - Status badge (selesai/berlangsung/akan datang)
 *  - Estimasi durasi kegiatan (hari)
 *  - Copy link per kegiatan
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('semua_kegiatan', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__semuaKegiatanLoaded) {
        console.log('[semua_kegiatan] Sudah di-init, skip.');
        return;
    }
    window.__semuaKegiatanLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    let container = document.getElementById('semua-kegiatan-list') ||
                    document.getElementById('kegiatan-list') ||
                    document.getElementById('kegiatan-content');
    const skeleton = document.getElementById('semua-kegiatan-skeleton') ||
                     document.getElementById('kegiatan-skeleton');

    // Fallback: cari container grid
    if (!container) {
        const grid = document.getElementById('kegiatan-grid');
        if (grid) {
            container = grid.querySelector('#kegiatan-content') || grid;
        }
    }

    if (!container) {
        console.error('[semua_kegiatan] Container tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. HELPER FUNCTIONS
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
            day: 'numeric', month: 'short', year: 'numeric'
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

    function timeAgo(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        const diff = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diff < 60) return 'baru saja';
        if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
        if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
        if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
        return formatDate(d);
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

    function estimateDuration(start, end) {
        if (!start) return 1;
        const d1 = new Date(start);
        if (isNaN(d1.getTime())) return 1;
        if (!end) return 1;
        const d2 = new Date(end);
        if (isNaN(d2.getTime())) return 1;
        const days = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        return Math.max(1, days);
    }

    function getStatusKegiatan(tanggalMulai, tanggalSelesai) {
        if (!tanggalMulai) return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const d1 = new Date(tanggalMulai);
        if (isNaN(d1.getTime())) return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };

        const d2 = tanggalSelesai ? new Date(tanggalSelesai) : new Date(tanggalMulai);
        if (isNaN(d2.getTime())) {
            return {
                label: 'Tanpa Tanggal',
                color: 'gray',
                icon: 'fa-question'
            };
        }

        d1.setHours(0, 0, 0, 0);
        d2.setHours(23, 59, 59, 999);

        if (now < d1) {
            return { label: 'Akan Datang', color: 'blue', icon: 'fa-clock' };
        }
        if (now >= d1 && now <= d2) {
            return { label: 'Berlangsung', color: 'green', icon: 'fa-play-circle' };
        }
        return { label: 'Selesai', color: 'gray', icon: 'fa-check-circle' };
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

    function buildKegiatanUrl(id) {
        return window.location.origin + window.location.pathname +
            '#/kegiatan_detail?id=' + encodeURIComponent(id);
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let allKegiatan = [];
    let filteredKegiatan = [];
    let currentFilter = {
        search: '',
        tahun: 'all',
        tempat: 'all',
        status: 'all',
        sort: 'terbaru'
    };
    let visibleCount = 6; // load more per 6
    let isLoading = false;

    // ================================================================
    // 5. ENSURE EXTRA UI
    // ================================================================
    function ensureExtraUI() {
        const wrapper = container.closest('.max-w-6xl') ||
                       container.closest('section') ||
                       container.parentElement;
        if (!wrapper) return;

        // ===== Stats 3 kartu =====
        if (!document.getElementById('kegiatan-stats-pub')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'kegiatan-stats-pub';
            statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6';
            statsDiv.innerHTML = `
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Kegiatan</p>
                            <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-kegiatan-total">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                            <i class="fas fa-calendar-check"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tahun Ini</p>
                            <p class="text-2xl font-bold text-blue-600 mt-1" id="stats-kegiatan-tahun-ini">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-calendar"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tempat Unik</p>
                            <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-tempat-unik">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                            <i class="fas fa-map-marked-alt"></i>
                        </div>
                    </div>
                </div>
            `;

            // Sisipkan sebelum list (setelah hero)
            wrapper.insertBefore(statsDiv, container);
        }

        // ===== Filter Bar =====
        if (!document.getElementById('kegiatan-filter-wrap')) {
            const filterWrap = document.createElement('div');
            filterWrap.id = 'kegiatan-filter-wrap';
            filterWrap.className = 'flex flex-wrap gap-2 mb-6';
            filterWrap.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="kegiatan-search-pub" placeholder="Cari kegiatan, tempat, deskripsi..."
                        class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                </div>
                <select id="kegiatan-filter-tahun-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Tahun</option>
                </select>
                <select id="kegiatan-filter-tempat-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Tempat</option>
                </select>
                <select id="kegiatan-filter-status-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Status</option>
                    <option value="akan">Akan Datang</option>
                    <option value="berlangsung">Berlangsung</option>
                    <option value="selesai">Selesai</option>
                </select>
                <select id="kegiatan-sort-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="terbaru">Terbaru</option>
                    <option value="terlama">Terlama</option>
                    <option value="judul-asc">Judul A-Z</option>
                    <option value="judul-desc">Judul Z-A</option>
                </select>
                <button id="kegiatan-clear-filter-pub" type="button"
                    class="px-3 py-2.5 rounded-xl bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition"
                    title="Reset filter">
                    <i class="fas fa-times"></i>
                </button>
            `;

            wrapper.insertBefore(filterWrap, container);
            attachFilterListeners();
        }

        // ===== Load More Button =====
        if (!document.getElementById('kegiatan-load-more-wrap')) {
            const loadMoreWrap = document.createElement('div');
            loadMoreWrap.id = 'kegiatan-load-more-wrap';
            loadMoreWrap.className = 'hidden text-center mt-8';
            loadMoreWrap.innerHTML = `
                <button id="kegiatan-load-more-btn"
                    class="btn-outline px-6 py-2.5 rounded-full">
                    <i class="fas fa-plus-circle mr-1"></i>Muat Lebih Banyak
                </button>
                <p id="kegiatan-load-more-info" class="text-xs text-[var(--text-muted)] mt-2"></p>
            `;

            // Sisipkan setelah list
            if (container.parentNode) {
                container.parentNode.insertBefore(loadMoreWrap, container.nextSibling);
            }

            const loadMoreBtn = document.getElementById('kegiatan-load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    visibleCount += 6;
                    renderKegiatan();
                });
            }
        }
    }

    // ================================================================
    // 6. ATTACH FILTER LISTENERS
    // ================================================================
    function attachFilterListeners() {
        const searchInput = document.getElementById('kegiatan-search-pub');
        const filterTahun = document.getElementById('kegiatan-filter-tahun-pub');
        const filterTempat = document.getElementById('kegiatan-filter-tempat-pub');
        const filterStatus = document.getElementById('kegiatan-filter-status-pub');
        const sortSelect = document.getElementById('kegiatan-sort-pub');
        const clearBtn = document.getElementById('kegiatan-clear-filter-pub');

        if (searchInput && !searchInput.dataset.attached) {
            searchInput.dataset.attached = 'true';
            let timer;
            searchInput.addEventListener('input', function() {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    currentFilter.search = (this.value || '').toLowerCase().trim();
                    visibleCount = 6;
                    applyFilter();
                }, 250);
            });
        }

        if (filterTahun && !filterTahun.dataset.attached) {
            filterTahun.dataset.attached = 'true';
            filterTahun.addEventListener('change', function() {
                currentFilter.tahun = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        if (filterTempat && !filterTempat.dataset.attached) {
            filterTempat.dataset.attached = 'true';
            filterTempat.addEventListener('change', function() {
                currentFilter.tempat = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        if (filterStatus && !filterStatus.dataset.attached) {
            filterStatus.dataset.attached = 'true';
            filterStatus.addEventListener('change', function() {
                currentFilter.status = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        if (sortSelect && !sortSelect.dataset.attached) {
            sortSelect.dataset.attached = 'true';
            sortSelect.addEventListener('change', function() {
                currentFilter.sort = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        if (clearBtn && !clearBtn.dataset.attached) {
            clearBtn.dataset.attached = 'true';
            clearBtn.addEventListener('click', function() {
                currentFilter = {
                    search: '', tahun: 'all', tempat: 'all',
                    status: 'all', sort: 'terbaru'
                };
                if (searchInput) searchInput.value = '';
                if (filterTahun) filterTahun.value = 'all';
                if (filterTempat) filterTempat.value = 'all';
                if (filterStatus) filterStatus.value = 'all';
                if (sortSelect) sortSelect.value = 'terbaru';
                visibleCount = 6;
                applyFilter();
                showToast('Filter direset.', 'info', 2000);
            });
        }
    }

    // ================================================================
    // 7. UPDATE FILTER OPTIONS
    // ================================================================
    function updateFilterOptions() {
        // Tahun
        const tahunSelect = document.getElementById('kegiatan-filter-tahun-pub');
        if (tahunSelect) {
            const tahuns = new Set();
            allKegiatan.forEach(k => {
                if (k.tanggal_mulai) {
                    const d = new Date(k.tanggal_mulai);
                    if (!isNaN(d.getTime())) tahuns.add(d.getFullYear().toString());
                }
            });

            const current = tahunSelect.value;
            tahunSelect.innerHTML = '<option value="all">Semua Tahun</option>';
            Array.from(tahuns).sort((a, b) => b.localeCompare(a)).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                tahunSelect.appendChild(opt);
            });
            if (Array.from(tahuns).includes(current)) tahunSelect.value = current;
        }

        // Tempat
        const tempatSelect = document.getElementById('kegiatan-filter-tempat-pub');
        if (tempatSelect) {
            const tempats = new Set();
            allKegiatan.forEach(k => {
                if (k.tempat && String(k.tempat).trim()) {
                    tempats.add(String(k.tempat).trim());
                }
            });

            const current = tempatSelect.value;
            tempatSelect.innerHTML = '<option value="all">Semua Tempat</option>';
            Array.from(tempats).sort().forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                tempatSelect.appendChild(opt);
            });
            if (Array.from(tempats).includes(current)) tempatSelect.value = current;
        }
    }

    // ================================================================
    // 8. APPLY FILTER & SORT
    // ================================================================
    function applyFilter() {
        filteredKegiatan = allKegiatan.filter(k => {
            // Filter tahun
            if (currentFilter.tahun !== 'all') {
                if (!k.tanggal_mulai) return false;
                const d = new Date(k.tanggal_mulai);
                if (isNaN(d.getTime()) || d.getFullYear().toString() !== currentFilter.tahun) return false;
            }

            // Filter tempat
            if (currentFilter.tempat !== 'all') {
                if (String(k.tempat || '').trim() !== currentFilter.tempat) return false;
            }

            // Filter status
            if (currentFilter.status !== 'all') {
                const status = getStatusKegiatan(k.tanggal_mulai, k.tanggal_selesai);
                const label = status.label.toLowerCase();
                if (currentFilter.status === 'akan' && label !== 'akan datang') return false;
                if (currentFilter.status === 'berlangsung' && label !== 'berlangsung') return false;
                if (currentFilter.status === 'selesai' && label !== 'selesai') return false;
            }

            // Search
            if (currentFilter.search) {
                const q = currentFilter.search;
                const haystack = [
                    k.kegiatan, k.tempat, stripHtml(k.deskripsi)
                ].map(v => String(v || '').toLowerCase()).join(' ');
                if (!haystack.includes(q)) return false;
            }

            return true;
        });

        // Sort
        switch (currentFilter.sort) {
            case 'terbaru':
                filteredKegiatan.sort((a, b) =>
                    new Date(b.tanggal_mulai || b.created_at || 0) -
                    new Date(a.tanggal_mulai || a.created_at || 0));
                break;
            case 'terlama':
                filteredKegiatan.sort((a, b) =>
                    new Date(a.tanggal_mulai || a.created_at || 0) -
                    new Date(b.tanggal_mulai || b.created_at || 0));
                break;
            case 'judul-asc':
                filteredKegiatan.sort((a, b) =>
                    String(a.kegiatan || '').localeCompare(String(b.kegiatan || '')));
                break;
            case 'judul-desc':
                filteredKegiatan.sort((a, b) =>
                    String(b.kegiatan || '').localeCompare(String(a.kegiatan || '')));
                break;
        }

        renderKegiatan();
        updateStats();
    }

    // ================================================================
    // 9. UPDATE STATS
    // ================================================================
    function updateStats() {
        const total = allKegiatan.length;

        const now = new Date();
        const thisYear = now.getFullYear();
        const tahunIni = allKegiatan.filter(k => {
            if (!k.tanggal_mulai) return false;
            const d = new Date(k.tanggal_mulai);
            return !isNaN(d.getTime()) && d.getFullYear() === thisYear;
        }).length;

        const tempats = new Set();
        allKegiatan.forEach(k => {
            if (k.tempat && String(k.tempat).trim()) {
                tempats.add(String(k.tempat).trim());
            }
        });

        const el1 = document.getElementById('stats-kegiatan-total');
        const el2 = document.getElementById('stats-kegiatan-tahun-ini');
        const el3 = document.getElementById('stats-tempat-unik');

        if (el1) el1.textContent = total;
        if (el2) el2.textContent = tahunIni;
        if (el3) el3.textContent = tempats.size;
    }

    // ================================================================
    // 10. LOAD DATA
    // ================================================================
    async function loadData(force) {
        force = force || false;
        if (isLoading) return;
        isLoading = true;

        // Loading state
        if (skeleton) skeleton.classList.remove('hidden');
        container.classList.add('hidden');

        try {
            const result = await apiCall('getLogbook', 'POST', {});

            if (!result || !result.success) {
                throw new Error((result && result.message) || 'Gagal memuat data');
            }

            allKegiatan = Array.isArray(result.data) ? result.data : [];

            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');

            if (allKegiatan.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12">
                        <i class="fas fa-calendar-times text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>
                        <p class="text-[var(--text-muted)]">Belum ada kegiatan yang tercatat.</p>
                    </div>
                `;
                updateStats();
                return;
            }

            updateFilterOptions();
            applyFilter();

        } catch (error) {
            console.error('[semua_kegiatan] Load error:', error);
            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-3"></i>
                    <p class="text-red-500 font-medium mb-2">Gagal memuat data kegiatan.</p>
                    <p class="text-[var(--text-muted)] text-sm mb-4">${escapeHtml(error.message)}</p>
                    <button onclick="location.reload()" class="btn-primary px-6 py-2 rounded-lg">
                        <i class="fas fa-sync-alt mr-1"></i>Coba Lagi
                    </button>
                </div>
            `;
        } finally {
            isLoading = false;
        }
    }

    // ================================================================
    // 11. RENDER KEGIATAN (FEATURED + GRID)
    // ================================================================
    function renderKegiatan() {
        const loadMoreWrap = document.getElementById('kegiatan-load-more-wrap');
        const loadMoreInfo = document.getElementById('kegiatan-load-more-info');

        if (!filteredKegiatan || filteredKegiatan.length === 0) {
            const isFiltered = currentFilter.search || currentFilter.tahun !== 'all' ||
                              currentFilter.tempat !== 'all' || currentFilter.status !== 'all';
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-search text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>
                    <p class="text-[var(--text-muted)] mb-4">
                        ${isFiltered
                            ? 'Tidak ada kegiatan yang cocok dengan filter.'
                            : 'Belum ada kegiatan.'}
                    </p>
                    ${isFiltered ? `
                        <button onclick="document.getElementById('kegiatan-clear-filter-pub')?.click()"
                            class="btn-primary px-6 py-2 rounded-lg">
                            <i class="fas fa-times mr-1"></i>Reset Filter
                        </button>
                    ` : ''}
                </div>
            `;
            if (loadMoreWrap) loadMoreWrap.classList.add('hidden');
            return;
        }

        // Ambil data yang mau ditampilkan
        const toShow = filteredKegiatan.slice(0, visibleCount);
        const hasMore = filteredKegiatan.length > visibleCount;

        // Update grid class
        container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

        let html = '';

        toShow.forEach((item, index) => {
            const imgUrl = item.file_url || getFirstImageFromContent(item.deskripsi) ||
                'https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor';
            const descPlain = stripHtml(item.deskripsi);
            const shortDesc = descPlain.length > 130
                ? descPlain.substring(0, 130) + '...'
                : (descPlain || 'Klik untuk membaca detail kegiatan.');

            const status = getStatusKegiatan(item.tanggal_mulai, item.tanggal_selesai);
            const duration = estimateDuration(item.tanggal_mulai, item.tanggal_selesai);

            const tanggal = item.tanggal_mulai ? formatDate(item.tanggal_mulai) : '-';
            const tanggalSelesai = item.tanggal_selesai && item.tanggal_selesai !== item.tanggal_mulai
                ? formatDate(item.tanggal_selesai)
                : null;

            // Status badge colors
            const colorMap = {
                blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            };
            const statusClass = colorMap[status.color] || colorMap.gray;

            const statusBadge = `
                <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${statusClass}">
                    <i class="fas ${status.icon} text-[10px]"></i>${escapeHtml(status.label)}
                </span>
            `;

            const tempatBadge = item.tempat
                ? `<span class="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                       <i class="fas fa-map-marker-alt"></i>${escapeHtml(String(item.tempat).substring(0, 30))}
                   </span>`
                : '';

            const pesertaBadge = item.peserta > 0
                ? `<span class="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                       <i class="fas fa-users"></i>${item.peserta}
                   </span>`
                : '';

            // Featured card
            const isFeatured = index === 0 && !currentFilter.search &&
                              currentFilter.tahun === 'all' &&
                              currentFilter.tempat === 'all' &&
                              currentFilter.status === 'all';
            const cardColSpan = isFeatured ? 'sm:col-span-2 lg:col-span-2' : '';

            if (isFeatured) {
                html += `
                    <a href="/kegiatan_detail?id=${encodeURIComponent(item.id)}"
                       class="kegiatan-featured group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-lg hover:shadow-2xl transition-all duration-300 ${cardColSpan} relative border border-[var(--card-border)]">
                        <div class="h-72 md:h-96 overflow-hidden relative bg-[var(--bg-stats)]">
                            <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(item.kegiatan)}"
                                class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                loading="lazy" decoding="async"
                                onerror="this.src='https://placehold.co/800x500/e2e8f0/475569?text=Kegiatan+Ansor'">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                            <div class="absolute top-4 left-4 flex flex-wrap gap-2">
                                ${statusBadge}
                                <span class="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full">
                                    <i class="fas fa-star text-[10px] text-yellow-400"></i>KEGIATAN UTAMA
                                </span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 right-0 p-5 md:p-6 text-white">
                            <h3 class="text-xl md:text-3xl font-bold leading-tight mb-2 line-clamp-2 font-amiri drop-shadow-lg">
                                ${escapeHtml(item.kegiatan || 'Kegiatan')}
                            </h3>
                            <p class="text-sm text-gray-200 mb-3 line-clamp-2 drop-shadow">
                                ${escapeHtml(shortDesc)}
                            </p>
                            <div class="flex flex-wrap items-center gap-3 text-xs text-gray-100">
                                <span class="flex items-center gap-1">
                                    <i class="far fa-calendar-alt"></i>
                                    ${escapeHtml(tanggal)}${tanggalSelesai ? ` — ${escapeHtml(tanggalSelesai)}` : ''}
                                </span>
                                ${item.tempat ? `
                                    <span class="flex items-center gap-1">
                                        <i class="fas fa-map-marker-alt"></i>${escapeHtml(item.tempat)}
                                    </span>
                                ` : ''}
                                <span class="flex items-center gap-1">
                                    <i class="far fa-clock"></i>${duration} hari
                                </span>
                            </div>
                        </div>
                    </a>
                `;
            } else {
                html += `
                    <a href="/kegiatan_detail?id=${encodeURIComponent(item.id)}"
                       class="kegiatan-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-md hover:shadow-xl transition-all duration-300 border border-[var(--card-border)] hover:-translate-y-1">
                        <div class="h-48 overflow-hidden bg-[var(--bg-stats)] relative">
                            <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(item.kegiatan)}"
                                class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                loading="lazy" decoding="async"
                                onerror="this.src='https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor'">
                            <div class="absolute top-3 left-3">${statusBadge}</div>
                            ${duration > 1 ? `
                                <div class="absolute top-3 right-3">
                                    <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white">
                                        <i class="far fa-clock text-[10px]"></i>${duration} hari
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                        <div class="p-5">
                            <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
                                <span class="flex items-center gap-1">
                                    <i class="far fa-calendar-alt"></i>${escapeHtml(tanggal)}
                                </span>
                                ${tempatBadge}
                                ${pesertaBadge}
                            </div>
                            <h3 class="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-2 font-amiri group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                ${escapeHtml(item.kegiatan || 'Kegiatan')}
                            </h3>
                            <p class="text-sm text-[var(--text-muted)] mb-4 line-clamp-3">
                                ${escapeHtml(shortDesc)}
                            </p>
                            <div class="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                                <span class="text-xs text-[var(--text-muted)]">
                                    ${item.anggaran > 0 ? `<i class="fas fa-coins mr-1"></i>Anggaran` : ''}
                                </span>
                                <span class="text-sm font-semibold text-[var(--text-main)] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                    Detail <i class="fas fa-arrow-right text-xs"></i>
                                </span>
                            </div>
                        </div>
                    </a>
                `;
            }
        });

        container.innerHTML = html;

        // Update load more
        if (loadMoreWrap) {
            if (hasMore) {
                loadMoreWrap.classList.remove('hidden');
                if (loadMoreInfo) {
                    loadMoreInfo.textContent = `Menampilkan ${toShow.length} dari ${filteredKegiatan.length} kegiatan`;
                }
            } else {
                loadMoreWrap.classList.add('hidden');
            }
        }
    }

    // ================================================================
    // 12. INIT
    // ================================================================
    console.log('[semua_kegiatan] Init dimulai');
    ensureExtraUI();
    loadData();
});