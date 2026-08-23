/**
 * js/semua_berita.js
 * Modul Halaman Semua Berita (Publik) - Final (Cepat: Cache Lokal, Stale-While-Revalidate)
 * Versi: 2.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±156
 */

App.register('semua_berita', function() {
    // ================================================================
    // 1. GUARD INISIALISASI (mencegah eksekusi ganda)
    // ================================================================
    if (window.__semuaBeritaLoaded) return;
    window.__semuaBeritaLoaded = true;

    // ================================================================
    // 2. STATE (Cache Lokal)
    // ================================================================
    let dataCache = null;           // Berisi array berita
    let lastFetch = 0;              // Timestamp fetch terakhir
    const CACHE_TTL = 60000;        // 60 detik cache aktif

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const skeleton = document.getElementById('semua-berita-skeleton');
    const container = document.getElementById('semua-berita-list');

    if (!container) {
        console.error('semua_berita: elemen #semua-berita-list tidak ditemukan.');
        return;
    }

    // ================================================================
    // 4. HELPER AMBIL GAMBAR PERTAMA DARI ISI
    // ================================================================
    function getFirstImageFromContent(html) {
        if (!html) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        return img ? img.src : '';
    }

    // ================================================================
    // 5. RENDER BERITA (Featured + Grid)
    // ================================================================
    function renderBerita(data, userMap) {
        let html = '';

        data.forEach((item, index) => {
            const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) || 'https://placehold.co/600x400/e2e8f0/475569?text=Berita+Ansor';
            const penulis = userMap[item.created_by] || 'Admin';
            const tanggal = item.tanggal ? formatDate(item.tanggal) : '';
            const isiSingkat = item.isi ? item.isi.replace(/<[^>]*>/g, '').substring(0, 150) + '...' : '';
            const tag = item.tag ? `<span class="tag">#${item.tag}</span>` : '';

            // Berita pertama sebagai featured (menempati 2 kolom di grid)
            if (index === 0) {
                html += `
                    <a href="/berita_detail?id=${item.id}" class="featured-card group block">
                        <div class="img-wrapper">
                            <img src="${thumbnail}" alt="${item.judul}" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">
                        </div>
                        <div class="overlay">
                            <div class="flex items-center gap-2 mb-2">${tag}</div>
                            <h3 class="text-2xl md:text-3xl font-bold leading-tight mb-2 line-clamp-2">${item.judul}</h3>
                            <p class="text-sm text-gray-200 mb-3 line-clamp-2">${isiSingkat}</p>
                            <div class="flex items-center gap-3 text-xs">
                                <span><i class="fas fa-user-circle mr-1"></i>${penulis}</span>
                                <span><i class="far fa-calendar-alt mr-1"></i>${tanggal}</span>
                            </div>
                        </div>
                    </a>
                `;
            } else {
                // Berita lainnya sebagai kartu biasa
                html += `
                    <a href="/berita_detail?id=${item.id}" class="berita-card group block">
                        <div class="img-wrapper">
                            <img src="${thumbnail}" alt="${item.judul}" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">
                        </div>
                        <div class="p-5">
                            <div class="flex items-center justify-between mb-3">
                                <span class="text-xs font-semibold uppercase tracking-wide text-green-700 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">${tag || 'Berita'}</span>
                                <span class="text-xs text-[var(--text-muted)]"><i class="far fa-calendar-alt mr-1"></i>${tanggal}</span>
                            </div>
                            <h3 class="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-2">${item.judul}</h3>
                            <p class="text-sm text-[var(--text-muted)] mb-4 line-clamp-2">${isiSingkat}</p>
                            <div class="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                                <span class="text-xs text-[var(--text-muted)]"><i class="fas fa-user-circle mr-1"></i>${penulis}</span>
                                <span class="text-sm font-semibold text-[var(--text-main)] group-hover:translate-x-1 transition-transform">Baca →</span>
                            </div>
                        </div>
                    </a>
                `;
            }
        });

        container.innerHTML = html;
    }

    // ================================================================
    // 6. LOAD DATA BERITA (Stale-While-Revalidate)
    // ================================================================
    async function loadBerita(force = false) {
        // Jika cache masih fresh dan tidak force, tampilkan langsung
        if (!force && dataCache && (Date.now() - lastFetch < CACHE_TTL)) {
            renderBerita(dataCache, dataCache.userMap || {});
            return;
        }

        // Jika ada cache lama tapi sudah expired, tampilkan dulu lalu refresh background
        if (!force && dataCache) {
            renderBerita(dataCache, dataCache.userMap || {});
            fetchDataBackground();
            return;
        }

        // Tampilkan skeleton
        if (skeleton) skeleton.classList.remove('hidden');
        container.classList.add('hidden');

        try {
            const [beritaRes, usersRes] = await Promise.all([
                apiCall('getBerita', 'POST', {}),
                apiCall('getUsers', 'POST', {})
            ]);

            if (!beritaRes.success) throw new Error(beritaRes.message || 'Gagal memuat berita');

            const userMap = {};
            if (usersRes.success) {
                usersRes.data.forEach(u => userMap[u.id] = u.nama || u.username || 'Admin');
            }

            const data = beritaRes.data || [];

            // Simpan ke cache
            dataCache = data;
            dataCache.userMap = userMap;
            lastFetch = Date.now();

            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');

            if (data.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-newspaper text-4xl mb-3 text-gray-300"></i>
                        <p>Belum ada berita yang dipublikasikan.</p>
                    </div>
                `;
                return;
            }

            renderBerita(data, userMap);
        } catch (error) {
            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Error: ${error.message}</p>
                </div>
            `;
        }
    }

    async function fetchDataBackground() {
        try {
            const [beritaRes, usersRes] = await Promise.all([
                forceRefreshData('getBerita', {}),
                forceRefreshData('getUsers', {})
            ]);

            if (beritaRes.success) {
                const userMap = {};
                if (usersRes.success) {
                    usersRes.data.forEach(u => userMap[u.id] = u.nama || u.username || 'Admin');
                }

                dataCache = beritaRes.data || [];
                dataCache.userMap = userMap;
                lastFetch = Date.now();

                if (dataCache.length === 0) {
                    container.innerHTML = `
                        <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                            <i class="fas fa-newspaper text-4xl mb-3 text-gray-300"></i>
                            <p>Belum ada berita yang dipublikasikan.</p>
                        </div>
                    `;
                } else {
                    renderBerita(dataCache, userMap);
                }
            }
        } catch (e) {
            console.warn('Background refresh berita gagal:', e);
        }
    }

    // ================================================================
    // 7. INISIALISASI
    // ================================================================
    loadBerita();
});