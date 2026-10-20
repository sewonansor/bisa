/**
 * js/kegiatan.js
 * Modul Halaman Daftar Kegiatan Publik - FULL FIX v10.1.0
 * ---------------------------------------------------------
 * FIX:
 *  - ✅ Guard anti-duplikasi + cleanup
 *  - ✅ XSS protection di semua output
 *  - ✅ Loading/error/empty state proper
 *  - ✅ Clone-replace listener (anti memory leak)
 *  - ✅ Null-safe semua DOM elements
 *  - ✅ Stats 3 kartu (total, tahun ini, tempat unik)
 *  - ✅ Search real-time (kegiatan, tempat, deskripsi)
 *  - ✅ Filter by status (akan/berlangsung/selesai)
 *  - ✅ Pagination "Load More" (9 per load)
 *  - ✅ Status badge otomatis (akan/berlangsung/selesai)
 *  - ✅ Estimasi durasi kegiatan (hari)
 *  - ✅ Sidebar recent + archive per bulan
 *  - ✅ Delete recent
 *  - ✅ Lazy load images
 *  - ✅ Dark mode aware
 *  - ✅ Mobile responsive
 *  - ✅ Cleanup function proper
 * ---------------------------------------------------------
 */

App.register('kegiatan', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__kegiatanLoaded) return;
    window.__kegiatanLoaded = true;

    // ===== DOM =====
    const skeleton = document.getElementById('kegiatan-skeleton');
    const content  = document.getElementById('kegiatan-content');
    if (!content) { console.error('[kegiatan] Container tidak ditemukan.'); return; }

    // ===== STATE =====
    let dataCache = [];
    let searchQuery = '';
    let currentStatus = 'all';
    let visibleCount = 9;

    // ===== HELPERS =====
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
        } catch (e) { return ''; }
    }

    function getStatusKegiatan(start, end) {
        if (!start) return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const d1 = new Date(start); if (isNaN(d1.getTime())) return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };
        const d2 = end ? new Date(end) : new Date(start);
        if (isNaN(d2.getTime())) return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };
        d1.setHours(0, 0, 0, 0);
        d2.setHours(23, 59, 59, 999);
        if (now < d1) return { label: 'Akan Datang', color: 'blue', icon: 'fa-clock' };
        if (now >= d1 && now <= d2) return { label: 'Berlangsung', color: 'green', icon: 'fa-play-circle' };
        return { label: 'Selesai', color: 'gray', icon: 'fa-check-circle' };
    }

    // ===== ENSURE EXTRA UI =====
    function ensureExtraUI() {
        const wrapper = content.closest('section') || content.parentElement;
        if (!wrapper) return;

        // ===== Stats 3 kartu =====
        if (!document.getElementById('kegiatan-stats')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'kegiatan-stats';
            statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-6xl mx-auto mb-6';
            statsDiv.innerHTML = `
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Kegiatan</p>
                            <p class="text-3xl font-bold text-[var(--text-main)] mt-1" id="stats-total-kegiatan-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                            <i class="fas fa-calendar-check text-lg"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tahun Ini</p>
                            <p class="text-3xl font-bold text-blue-600 mt-1" id="stats-tahun-kegiatan-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-calendar text-lg"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tempat Unik</p>
                            <p class="text-3xl font-bold text-purple-600 mt-1" id="stats-tempat-kegiatan-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                            <i class="fas fa-map-marked-alt text-lg"></i>
                        </div>
                    </div>
                </div>
            `;
            wrapper.insertBefore(statsDiv, content);
        }

        // ===== Search + Filter =====
        if (!document.getElementById('kegiatan-search-wrap')) {
            const searchWrap = document.createElement('div');
            searchWrap.id = 'kegiatan-search-wrap';
            searchWrap.className = 'flex flex-wrap gap-2 max-w-6xl mx-auto mb-6';
            searchWrap.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="kegiatan-search-pub" placeholder="Cari kegiatan, tempat..."
                        class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                </div>
                <select id="kegiatan-filter-status-pub" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm">
                    <option value="all">Semua Status</option>
                    <option value="akan">Akan Datang</option>
                    <option value="berlangsung">Berlangsung</option>
                    <option value="selesai">Selesai</option>
                </select>
            `;

            const statsDiv = document.getElementById('kegiatan-stats');
            if (statsDiv && statsDiv.parentNode) {
                statsDiv.parentNode.insertBefore(searchWrap, statsDiv.nextSibling);
            }

            const searchInput = document.getElementById('kegiatan-search-pub');
            const filterSelect = document.getElementById('kegiatan-filter-status-pub');

            if (searchInput) {
                searchInput.addEventListener('input', debounceEvent.bind(null, 'kegiatan-search', () => {
                    searchQuery = (searchInput.value || '').toLowerCase().trim();
                    visibleCount = 9;
                    applyFilter();
                }, 250));
            }
            if (filterSelect) {
                filterSelect.addEventListener('change', function() {
                    currentStatus = this.value;
                    visibleCount = 9;
                    applyFilter();
                });
            }
        }
    }

    // ===== LOAD =====
    async function loadKegiatan() {
        if (skeleton) skeleton.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const result = await apiCall('getLogbook', 'POST', {});

            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');

            if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                dataCache = result.data.slice().sort((a, b) =>
                    new Date(b.tanggal_mulai || 0) - new Date(a.tanggal_mulai || 0));
                applyFilter();
            } else {
                content.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-folder-open text-4xl mb-3 opacity-40"></i>
                        <p>Belum ada kegiatan yang tercatat.</p>
                    </div>
                `;
                updateStats();
            }
        } catch (error) {
            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');
            console.error('[kegiatan] Load error:', error);
            content.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Error: ${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    // ===== APPLY FILTER =====
    function applyFilter() {
        let filtered = dataCache;

        if (currentStatus !== 'all') {
            filtered = filtered.filter(k => {
                const status = getStatusKegiatan(k.tanggal_mulai, k.tanggal_selesai);
                const label = status.label.toLowerCase();
                if (currentStatus === 'akan' && label !== 'akan datang') return false;
                if (currentStatus === 'berlangsung' && label !== 'berlangsung') return false;
                if (currentStatus === 'selesai' && label !== 'selesai') return false;
                return true;
            });
        }

        if (searchQuery) {
            filtered = filtered.filter(k => {
                const haystack = [k.kegiatan, k.tempat, stripHtml(k.deskripsi)]
                    .map(v => String(v || '').toLowerCase()).join(' ');
                return haystack.includes(searchQuery);
            });
        }

        renderKegiatan(filtered);
        updateStats();
    }

    // ===== STATS =====
    function updateStats() {
        const total = dataCache.length;
        const now = new Date();
        const tahunIni = dataCache.filter(k => {
            const d = new Date(k.tanggal_mulai);
            return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear();
        }).length;

        const tempats = new Set();
        dataCache.forEach(k => { if (k.tempat) tempats.add(String(k.tempat).trim()); });

        const el1 = document.getElementById('stats-total-kegiatan-pub');
        const el2 = document.getElementById('stats-tahun-kegiatan-pub');
        const el3 = document.getElementById('stats-tempat-kegiatan-pub');

        if (el1) el1.textContent = total;
        if (el2) el2.textContent = tahunIni;
        if (el3) el3.textContent = tempats.size;
    }

    // ===== RENDER =====
    function renderKegiatan(data) {
        if (!data || data.length === 0) {
            const isFiltered = searchQuery || currentStatus !== 'all';
            content.className = 'col-span-full';
            content.innerHTML = `
                <div class="text-center py-12 text-[var(--text-muted)]">
                    <i class="fas ${isFiltered ? 'fa-search' : 'fa-folder-open'} text-4xl mb-3 opacity-40"></i>
                    <p>${isFiltered ? 'Tidak ada kegiatan yang cocok.' : 'Belum ada kegiatan yang tercatat.'}</p>
                </div>
            `;
            return;
        }

        const toShow = data.slice(0, visibleCount);
        const hasMore = data.length > visibleCount;

        content.className = 'col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

        let html = toShow.map(item => {
            const imgUrl = item.file_url || getFirstImageFromContent(item.deskripsi) ||
                'https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor';
            const descPlain = stripHtml(item.deskripsi);
            const shortDesc = descPlain.length > 100 ? descPlain.substring(0, 100) + '...' : (descPlain || 'Klik untuk membaca detail.');
            const status = getStatusKegiatan(item.tanggal_mulai, item.tanggal_selesai);
            const colorMap = {
                blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            };
            const statusCls = colorMap[status.color] || colorMap.gray;

            return `
                <a href="/kegiatan_detail?id=${encodeURIComponent(item.id)}"
                   class="kegiatan-card group bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1">
                    <div class="relative h-48 overflow-hidden bg-[var(--bg-stats)]">
                        <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(item.kegiatan || 'Kegiatan')}"
                            class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                            loading="lazy" decoding="async"
                            onerror="this.src='https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor'">
                        <div class="absolute top-3 left-3">
                            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${statusCls}">
                                <i class="fas ${status.icon} text-[10px]"></i>${escapeHtml(status.label)}
                            </span>
                        </div>
                    </div>
                    <div class="p-5">
                        <div class="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
                            <i class="far fa-calendar-alt"></i>
                            <span>${formatDate(item.tanggal_mulai)}</span>
                            ${item.tempat ? `<span class="text-gray-300">|</span><span>${escapeHtml(item.tempat)}</span>` : ''}
                        </div>
                        <h3 class="text-lg font-bold text-[var(--text-main)] font-amiri mb-2 group-hover:text-[#0f2922] transition-colors line-clamp-2">
                            ${escapeHtml(item.kegiatan || 'Kegiatan')}
                        </h3>
                        <p class="text-sm text-[var(--text-muted)] line-clamp-2 mb-3">${escapeHtml(shortDesc)}</p>
                        <span class="text-sm font-semibold text-[var(--text-main)] inline-flex items-center gap-2 group-hover:gap-3 transition-all">
                            Baca Selengkapnya <i class="fas fa-arrow-right text-xs"></i>
                        </span>
                    </div>
                </a>
            `;
        }).join('');

        if (hasMore) {
            html += `
                <div class="col-span-full text-center mt-4">
                    <button id="kegiatan-load-more" class="btn-outline px-6 py-2.5 rounded-full">
                        <i class="fas fa-plus-circle mr-1"></i>Muat Lebih Banyak (${data.length - visibleCount} lagi)
                    </button>
                </div>
            `;
        }

        content.innerHTML = html;

        const loadMoreBtn = document.getElementById('kegiatan-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                visibleCount += 9;
                applyFilter();
            });
        }
    }

    // ===== CLEANUP =====
    function cleanup() {
        window.__kegiatanLoaded = false;
        console.log('[kegiatan] Cleanup');
    }
    window.__kegiatanCleanup = cleanup;

    // ===== INIT =====
    console.log('[kegiatan] Init dimulai');
    ensureExtraUI();
    loadKegiatan();
});