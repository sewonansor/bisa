/**
 * js/semua_kegiatan.js
 * Modul Halaman Semua Kegiatan Publik - Final (Cepat: Cache Lokal, Filter, Stale-While-Revalidate)
 * Versi: 2.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±178
 */

App.register('semua_kegiatan', function() {
    // ================================================================
    // 1. GUARD INISIALISASI (mencegah eksekusi ganda)
    // ================================================================
    if (window.__semuaKegiatanLoaded) return;
    window.__semuaKegiatanLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const skeleton = document.getElementById('semua-kegiatan-skeleton') || document.getElementById('kegiatan-skeleton');
    const container = document.getElementById('semua-kegiatan-list') || document.getElementById('kegiatan-list');
    const content = document.getElementById('semua-kegiatan-content') || document.getElementById('kegiatan-content');

    if (!container) {
        console.error('semua_kegiatan: container tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. STATE (Cache Lokal & Filter)
    // ================================================================
    let allData = [];           // Semua data kegiatan
    let dataCache = null;       // Cache lengkap + userMap jika perlu
    let lastFetch = 0;          // Timestamp fetch terakhir
    const CACHE_TTL = 60000;    // 60 detik
    let currentFilter = { year: 'all', category: 'all' };

    // ================================================================
    // 4. HELPER FORMAT
    // ================================================================
    function formatDate(d) {
        if (typeof window.formatDate === 'function') return window.formatDate(d);
        if (!d) return '-';
        const date = new Date(d);
        return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // ================================================================
    // 5. RENDER KEGIATAN (GRID)
    // ================================================================
    function renderKegiatan(data) {
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                    <i class="fas fa-folder-open text-4xl mb-3 text-gray-300"></i>
                    <p>Tidak ada kegiatan yang cocok dengan filter.</p>
                </div>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            let descPlain = item.deskripsi ? item.deskripsi.replace(/<[^>]*>?/gm, '') : '';
            let shortDesc = descPlain.length > 100 ? descPlain.substring(0, 100) + '...' : (descPlain || 'Klik untuk membaca detail.');
            const imgUrl = item.file_url || 'https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor';

            html += `
                <a href="/kegiatan_detail?id=${item.id}" class="kegiatan-card group block">
                    <div class="img-wrapper">
                        <img src="${imgUrl}" alt="${item.kegiatan || 'Kegiatan'}" loading="lazy" />
                    </div>
                    <div class="p-5">
                        <div class="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-2">
                            <i class="far fa-calendar-alt"></i>
                            <span>${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)}</span>
                            ${item.tempat ? `<span class="text-gray-300">|</span><span>${item.tempat}</span>` : ''}
                        </div>
                        <h3 class="text-lg font-bold text-[var(--text-main)] font-amiri mb-2 group-hover:text-[#0f2922] transition-colors">
                            ${item.kegiatan || 'Kegiatan'}
                        </h3>
                        <p class="text-sm text-[var(--text-muted)] line-clamp-2 mb-3">${shortDesc}</p>
                        <span class="text-sm font-semibold text-[var(--text-main)] inline-flex items-center gap-2 group-hover:gap-3 transition-all">
                            Baca Selengkapnya <i class="fas fa-arrow-right text-xs"></i>
                        </span>
                    </div>
                </a>
            `;
        });
        container.innerHTML = html;
    }

    // ================================================================
    // 6. TERAPKAN FILTER
    // ================================================================
    function applyFilter() {
        let filtered = allData;

        // Filter tahun
        if (currentFilter.year !== 'all') {
            filtered = filtered.filter(item => {
                const year = item.tanggal_mulai ? new Date(item.tanggal_mulai).getFullYear() : null;
                return year === parseInt(currentFilter.year);
            });
        }

        // Filter kategori (jika ada field kategori di logbook, misalnya item.kategori)
        if (currentFilter.category !== 'all') {
            filtered = filtered.filter(item => item.kategori === currentFilter.category);
        }

        renderKegiatan(filtered);
    }

    // ================================================================
    // 7. INIT FILTER BUTTONS
    // ================================================================
    function initFilter() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        if (filterBtns.length === 0) return;

        filterBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                filterBtns.forEach(b => {
                    b.classList.remove('active', 'bg-green-600', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });
                this.classList.remove('bg-gray-200', 'text-gray-700');
                this.classList.add('active', 'bg-green-600', 'text-white');

                const filterType = this.dataset.filterType || 'year';
                const filterValue = this.dataset.filterValue || 'all';

                if (filterType === 'year') {
                    currentFilter.year = filterValue;
                } else if (filterType === 'category') {
                    currentFilter.category = filterValue;
                }

                applyFilter();
            });
        });
    }

    // ================================================================
    // 8. LOAD DATA (Stale-While-Revalidate)
    // ================================================================
    async function loadData(force = false) {
        // Jika cache masih fresh dan tidak force, tampilkan langsung
        if (!force && dataCache && (Date.now() - lastFetch < CACHE_TTL)) {
            allData = dataCache;
            applyFilter();
            return;
        }

        // Jika ada cache lama tapi sudah expired, tampilkan dulu lalu refresh background
        if (!force && dataCache) {
            allData = dataCache;
            applyFilter();
            fetchDataBackground();
            return;
        }

        // Tampilkan skeleton
        if (skeleton) skeleton.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        if (container) container.innerHTML = '';

        try {
            const result = await forceRefreshData('getLogbook', {});
            if (result.success && result.data.length > 0) {
                allData = result.data;
                dataCache = allData;
                lastFetch = Date.now();

                if (skeleton) skeleton.classList.add('hidden');
                if (content) content.classList.remove('hidden');
                applyFilter();
            } else if (result.success) {
                allData = [];
                dataCache = [];
                lastFetch = Date.now();

                if (skeleton) skeleton.classList.add('hidden');
                if (content) content.classList.remove('hidden');
                container.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-folder-open text-4xl mb-3 text-gray-300"></i>
                        <p>Belum ada kegiatan yang tercatat.</p>
                    </div>
                `;
            } else {
                throw new Error(result.message || 'Gagal memuat data');
            }
        } catch (error) {
            if (skeleton) skeleton.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Error: ${error.message}</p>
                </div>
            `;
        }
    }

    // ================================================================
    // 9. FETCH BACKGROUND (Refresh tanpa mengganggu UI)
    // ================================================================
    async function fetchDataBackground() {
        try {
            const result = await forceRefreshData('getLogbook', {});
            if (result.success && result.data) {
                allData = result.data;
                dataCache = allData;
                lastFetch = Date.now();
                applyFilter();
            }
        } catch (e) {
            console.warn('Background refresh kegiatan gagal:', e);
        }
    }

    // ================================================================
    // 10. INISIALISASI
    // ================================================================
    loadData();
    initFilter();
});