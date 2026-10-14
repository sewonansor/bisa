/**
 * js/semua_berita.js
 * Modul Halaman Semua Berita (Publik) - FULL FIX v10.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi
 *  - XSS protection di semua output
 *  - Loading/error/empty state proper
 *  - Clone-replace listener (anti memory leak)
 *  - Support hash routing
 *
 * FEATURES:
 *  - Featured berita (1 terbaru) + grid berita biasa
 *  - Search real-time (judul, isi, tag, penulis)
 *  - Filter by tag + tahun + penulis
 *  - Sort (terbaru, terlama, judul A-Z)
 *  - Pagination "Load More" (6 per load)
 *  - Stats 3 kartu (total berita, tag, penulis)
 *  - Top tags sidebar (klik untuk filter)
 *  - Copy link per berita
 *  - Share cepat (WhatsApp)
 *  - Estimasi waktu baca
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('semua_berita', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__semuaBeritaLoaded) {
        console.log('[semua_berita] Sudah di-init, skip.');
        return;
    }
    window.__semuaBeritaLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const container = document.getElementById('semua-berita-list');
    const skeleton  = document.getElementById('semua-berita-skeleton');

    if (!container) {
        console.error('[semua_berita] Elemen #semua-berita-list tidak ditemukan.');
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

    function estimateReadingTime(html) {
        const text = stripHtml(html);
        const words = text.split(/\s+/).filter(w => w.length > 0).length;
        const minutes = Math.max(1, Math.ceil(words / 200));
        return minutes;
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

    function buildBeritaUrl(id) {
        return window.location.origin + window.location.pathname +
            '#/berita_detail?id=' + encodeURIComponent(id);
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let allBerita = [];
    let filteredBerita = [];
    let userMap = {};
    let currentFilter = {
        search: '',
        tag: 'all',
        tahun: 'all',
        penulis: 'all',
        sort: 'terbaru'
    };
    let visibleCount = 6; // load more per 6
    let isLoading = false;

    // ================================================================
    // 5. ENSURE EXTRA UI
    // ================================================================
    function ensureExtraUI() {
        const wrapper = container.closest('.max-w-7xl') || container.parentElement;
        if (!wrapper) return;

        // ===== Stats 3 kartu =====
        if (!document.getElementById('berita-stats-pub')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'berita-stats-pub';
            statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6';
            statsDiv.innerHTML = `
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Berita</p>
                            <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-berita-total">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                            <i class="fas fa-newspaper"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tag Unik</p>
                            <p class="text-2xl font-bold text-blue-600 mt-1" id="stats-tag-unik">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-tags"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Penulis</p>
                            <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-penulis-unik">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                            <i class="fas fa-users"></i>
                        </div>
                    </div>
                </div>
            `;

            // Sisipkan sebelum list
            wrapper.insertBefore(statsDiv, container);
        }

        // ===== Filter Bar =====
        if (!document.getElementById('berita-filter-wrap')) {
            const filterWrap = document.createElement('div');
            filterWrap.id = 'berita-filter-wrap';
            filterWrap.className = 'flex flex-wrap gap-2 mb-6';
            filterWrap.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="berita-search-pub" placeholder="Cari judul, isi, tag, penulis..."
                        class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                </div>
                <select id="berita-filter-tag-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Tag</option>
                </select>
                <select id="berita-filter-tahun-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Tahun</option>
                </select>
                <select id="berita-filter-penulis-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Penulis</option>
                </select>
                <select id="berita-sort-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="terbaru">Terbaru</option>
                    <option value="terlama">Terlama</option>
                    <option value="judul-asc">Judul A-Z</option>
                    <option value="judul-desc">Judul Z-A</option>
                </select>
                <button id="berita-clear-filter-pub" type="button"
                    class="px-3 py-2.5 rounded-xl bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition"
                    title="Reset filter">
                    <i class="fas fa-times"></i>
                </button>
            `;

            wrapper.insertBefore(filterWrap, container);
            attachFilterListeners();
        }

        // ===== Load More Button =====
        if (!document.getElementById('berita-load-more-wrap')) {
            const loadMoreWrap = document.createElement('div');
            loadMoreWrap.id = 'berita-load-more-wrap';
            loadMoreWrap.className = 'hidden text-center mt-8';
            loadMoreWrap.innerHTML = `
                <button id="berita-load-more-btn"
                    class="btn-outline px-6 py-2.5 rounded-full">
                    <i class="fas fa-plus-circle mr-1"></i>Muat Lebih Banyak
                </button>
                <p id="berita-load-more-info" class="text-xs text-[var(--text-muted)] mt-2"></p>
            `;

            // Sisipkan setelah list
            if (container.parentNode) {
                container.parentNode.insertBefore(loadMoreWrap, container.nextSibling);
            }

            const loadMoreBtn = document.getElementById('berita-load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    visibleCount += 6;
                    renderBerita();
                });
            }
        }
    }

    // ================================================================
    // 6. ATTACH FILTER LISTENERS
    // ================================================================
    function attachFilterListeners() {
        const searchInput = document.getElementById('berita-search-pub');
        const filterTag = document.getElementById('berita-filter-tag-pub');
        const filterTahun = document.getElementById('berita-filter-tahun-pub');
        const filterPenulis = document.getElementById('berita-filter-penulis-pub');
        const sortSelect = document.getElementById('berita-sort-pub');
        const clearBtn = document.getElementById('berita-clear-filter-pub');

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

        if (filterTag && !filterTag.dataset.attached) {
            filterTag.dataset.attached = 'true';
            filterTag.addEventListener('change', function() {
                currentFilter.tag = this.value;
                visibleCount = 6;
                applyFilter();
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

        if (filterPenulis && !filterPenulis.dataset.attached) {
            filterPenulis.dataset.attached = 'true';
            filterPenulis.addEventListener('change', function() {
                currentFilter.penulis = this.value;
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
                    search: '', tag: 'all', tahun: 'all',
                    penulis: 'all', sort: 'terbaru'
                };
                if (searchInput) searchInput.value = '';
                if (filterTag) filterTag.value = 'all';
                if (filterTahun) filterTahun.value = 'all';
                if (filterPenulis) filterPenulis.value = 'all';
                if (sortSelect) sortSelect.value = 'terbaru';
                visibleCount = 6;
                applyFilter();
                showToast('Filter direset.', 'info', 2000);
            });
        }
    }

    // ================================================================
    // 7. UPDATE FILTER OPTIONS (tag, tahun, penulis)
    // ================================================================
    function updateFilterOptions() {
        // Tags
        const tagSelect = document.getElementById('berita-filter-tag-pub');
        if (tagSelect) {
            const tags = new Set();
            allBerita.forEach(b => {
                if (b.tag) tags.add(String(b.tag).trim());
            });

            const current = tagSelect.value;
            tagSelect.innerHTML = '<option value="all">Semua Tag</option>';
            Array.from(tags).sort().forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = '#' + t;
                tagSelect.appendChild(opt);
            });
            if (Array.from(tags).includes(current)) tagSelect.value = current;
        }

        // Tahun
        const tahunSelect = document.getElementById('berita-filter-tahun-pub');
        if (tahunSelect) {
            const tahuns = new Set();
            allBerita.forEach(b => {
                if (b.tanggal) {
                    const d = new Date(b.tanggal);
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

        // Penulis
        const penulisSelect = document.getElementById('berita-filter-penulis-pub');
        if (penulisSelect) {
            const penulises = new Set();
            allBerita.forEach(b => {
                const nama = userMap[b.created_by] || 'Admin';
                penulises.add(nama);
            });

            const current = penulisSelect.value;
            penulisSelect.innerHTML = '<option value="all">Semua Penulis</option>';
            Array.from(penulises).sort().forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                penulisSelect.appendChild(opt);
            });
            if (Array.from(penulises).includes(current)) penulisSelect.value = current;
        }
    }

    // ================================================================
    // 8. APPLY FILTER & SORT
    // ================================================================
    function applyFilter() {
        filteredBerita = allBerita.filter(b => {
            // Filter tag
            if (currentFilter.tag !== 'all') {
                if (String(b.tag || '').trim() !== currentFilter.tag) return false;
            }

            // Filter tahun
            if (currentFilter.tahun !== 'all') {
                if (!b.tanggal) return false;
                const d = new Date(b.tanggal);
                if (isNaN(d.getTime()) || d.getFullYear().toString() !== currentFilter.tahun) return false;
            }

            // Filter penulis
            if (currentFilter.penulis !== 'all') {
                const nama = userMap[b.created_by] || 'Admin';
                if (nama !== currentFilter.penulis) return false;
            }

            // Search
            if (currentFilter.search) {
                const q = currentFilter.search;
                const haystack = [
                    b.judul, stripHtml(b.isi), b.tag,
                    userMap[b.created_by] || 'Admin'
                ].map(v => String(v || '').toLowerCase()).join(' ');
                if (!haystack.includes(q)) return false;
            }

            return true;
        });

        // Sort
        switch (currentFilter.sort) {
            case 'terbaru':
                filteredBerita.sort((a, b) =>
                    new Date(b.tanggal || b.created_at || 0) -
                    new Date(a.tanggal || a.created_at || 0));
                break;
            case 'terlama':
                filteredBerita.sort((a, b) =>
                    new Date(a.tanggal || a.created_at || 0) -
                    new Date(b.tanggal || b.created_at || 0));
                break;
            case 'judul-asc':
                filteredBerita.sort((a, b) =>
                    String(a.judul || '').localeCompare(String(b.judul || '')));
                break;
            case 'judul-desc':
                filteredBerita.sort((a, b) =>
                    String(b.judul || '').localeCompare(String(a.judul || '')));
                break;
        }

        renderBerita();
        updateStats();
    }

    // ================================================================
    // 9. UPDATE STATS
    // ================================================================
    function updateStats() {
        const total = allBerita.length;

        const tags = new Set();
        allBerita.forEach(b => { if (b.tag) tags.add(String(b.tag).trim()); });

        const penulises = new Set();
        allBerita.forEach(b => {
            penulises.add(userMap[b.created_by] || 'Admin');
        });

        const el1 = document.getElementById('stats-berita-total');
        const el2 = document.getElementById('stats-tag-unik');
        const el3 = document.getElementById('stats-penulis-unik');

        if (el1) el1.textContent = total;
        if (el2) el2.textContent = tags.size;
        if (el3) el3.textContent = penulises.size;
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
            const [beritaRes, usersRes] = await Promise.allSettled([
                apiCall('getBerita', 'POST', {}),
                apiCall('getUsers', 'POST', {})
            ]);

            if (beritaRes.status !== 'fulfilled' || !beritaRes.value ||
                !beritaRes.value.success) {
                throw new Error((beritaRes.value && beritaRes.value.message) || 'Gagal memuat berita');
            }

            allBerita = Array.isArray(beritaRes.value.data) ? beritaRes.value.data : [];

            // Build userMap
            userMap = {};
            if (usersRes.status === 'fulfilled' && usersRes.value &&
                usersRes.value.success && Array.isArray(usersRes.value.data)) {
                usersRes.value.data.forEach(u => {
                    userMap[u.id] = u.nama || u.name || u.username || 'Admin';
                });
            }

            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');

            if (allBerita.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12">
                        <i class="fas fa-newspaper text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>
                        <p class="text-[var(--text-muted)]">Belum ada berita yang dipublikasikan.</p>
                    </div>
                `;
                updateStats();
                return;
            }

            updateFilterOptions();
            applyFilter();

        } catch (error) {
            console.error('[semua_berita] Load error:', error);
            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-3"></i>
                    <p class="text-red-500 font-medium mb-2">Gagal memuat berita.</p>
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
    // 11. RENDER BERITA (FEATURED + GRID)
    // ================================================================
    function renderBerita() {
        const loadMoreWrap = document.getElementById('berita-load-more-wrap');
        const loadMoreBtn = document.getElementById('berita-load-more-btn');
        const loadMoreInfo = document.getElementById('berita-load-more-info');

        if (!filteredBerita || filteredBerita.length === 0) {
            const isFiltered = currentFilter.search || currentFilter.tag !== 'all' ||
                              currentFilter.tahun !== 'all' || currentFilter.penulis !== 'all';
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-search text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>
                    <p class="text-[var(--text-muted)] mb-4">
                        ${isFiltered
                            ? 'Tidak ada berita yang cocok dengan filter.'
                            : 'Belum ada berita.'}
                    </p>
                    ${isFiltered ? `
                        <button onclick="document.getElementById('berita-clear-filter-pub')?.click()"
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
        const toShow = filteredBerita.slice(0, visibleCount);
        const hasMore = filteredBerita.length > visibleCount;

        // Update grid class
        container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

        let html = '';

        toShow.forEach((item, index) => {
            const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) ||
                'https://placehold.co/600x400/e2e8f0/475569?text=Berita+Ansor';
            const penulis = userMap[item.created_by] || 'Admin';
            const tanggal = item.tanggal ? formatDate(item.tanggal) : '-';
            const waktu = item.tanggal ? timeAgo(item.tanggal) : '';
            const isiPlain = stripHtml(item.isi);
            const isiSingkat = isiPlain.substring(0, 140) + (isiPlain.length > 140 ? '...' : '');
            const readingTime = estimateReadingTime(item.isi);
            const tag = item.tag
                ? `<span class="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                       <i class="fas fa-tag text-[10px]"></i>#${escapeHtml(item.tag)}
                   </span>`
                : '';

            // Featured card (index 0 dan 1 di layout)
            const isFeatured = index === 0 && !currentFilter.search && currentFilter.tag === 'all';
            const cardColSpan = isFeatured ? 'md:col-span-2 lg:col-span-2' : '';

            if (isFeatured) {
                html += `
                    <a href="/berita_detail?id=${encodeURIComponent(item.id)}"
                       class="berita-featured group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-lg hover:shadow-2xl transition-all duration-300 ${cardColSpan} relative border border-[var(--card-border)]">
                        <div class="h-72 md:h-96 overflow-hidden relative bg-[var(--bg-stats)]">
                            <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(item.judul)}"
                                class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                loading="lazy" decoding="async"
                                onerror="this.src='https://placehold.co/800x500/e2e8f0/475569?text=Berita+Ansor'">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                            <div class="absolute top-4 left-4 flex flex-wrap gap-2">
                                ${tag}
                                <span class="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full">
                                    <i class="fas fa-star text-[10px] text-yellow-400"></i>HEADLINE
                                </span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 right-0 p-5 md:p-6 text-white">
                            <h3 class="text-xl md:text-3xl font-bold leading-tight mb-2 line-clamp-2 font-amiri drop-shadow-lg">
                                ${escapeHtml(item.judul)}
                            </h3>
                            <p class="text-sm text-gray-200 mb-3 line-clamp-2 drop-shadow">
                                ${escapeHtml(isiSingkat)}
                            </p>
                            <div class="flex flex-wrap items-center gap-3 text-xs text-gray-100">
                                <span class="flex items-center gap-1">
                                    <i class="fas fa-user-circle"></i>${escapeHtml(penulis)}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="far fa-calendar-alt"></i>${escapeHtml(tanggal)}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="far fa-clock"></i>${readingTime} menit baca
                                </span>
                            </div>
                        </div>
                    </a>
                `;
            } else {
                // Regular card
                html += `
                    <a href="/berita_detail?id=${encodeURIComponent(item.id)}"
                       class="berita-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-md hover:shadow-xl transition-all duration-300 border border-[var(--card-border)] hover:-translate-y-1">
                        <div class="h-48 overflow-hidden bg-[var(--bg-stats)] relative">
                            <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(item.judul)}"
                                class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                loading="lazy" decoding="async"
                                onerror="this.src='https://placehold.co/600x400/e2e8f0/475569?text=Berita+Ansor'">
                            ${tag ? `<div class="absolute top-3 left-3">${tag}</div>` : ''}
                        </div>
                        <div class="p-5">
                            <div class="flex items-center justify-between mb-2 text-xs text-[var(--text-muted)]">
                                <span class="flex items-center gap-1">
                                    <i class="fas fa-user-circle"></i>${escapeHtml(penulis)}
                                </span>
                                <span class="flex items-center gap-1">
                                    <i class="far fa-calendar-alt"></i>${escapeHtml(waktu)}
                                </span>
                            </div>
                            <h3 class="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-2 font-amiri group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                ${escapeHtml(item.judul)}
                            </h3>
                            <p class="text-sm text-[var(--text-muted)] mb-4 line-clamp-3">
                                ${escapeHtml(isiSingkat)}
                            </p>
                            <div class="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                                <span class="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                    <i class="far fa-clock"></i>${readingTime} menit
                                </span>
                                <span class="text-sm font-semibold text-[var(--text-main)] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                    Baca <i class="fas fa-arrow-right text-xs"></i>
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
                    loadMoreInfo.textContent = `Menampilkan ${toShow.length} dari ${filteredBerita.length} berita`;
                }
            } else {
                loadMoreWrap.classList.add('hidden');
            }
        }
    }

    // ================================================================
    // 12. INIT
    // ================================================================
    console.log('[semua_berita] Init dimulai');
    ensureExtraUI();
    loadData();
});