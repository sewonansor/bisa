/**
 * full js/berita_detail.js
 * Modul Halaman Detail Berita (Publik) - Dengan Sidebar Berita Terkait
 * Versi: 2.0.0 - Final (Sidebar, No Error, Anti Stuck)
 */

App.register('berita_detail', function() {

    // ================================================================
    // 1. GUARD INISIALISASI (mencegah eksekusi ganda)
    // ================================================================
    if (window.__beritaDetailLoaded) return;
    window.__beritaDetailLoaded = true;

    // ================================================================
    // 2. AMBIL ID DARI URL
    // ================================================================
    const urlParams = new URLSearchParams(window.location.search);
    const beritaId = urlParams.get('id');

    // Jika tidak ada ID, tampilkan error
    if (!beritaId) {
        const loadingEl = document.getElementById('berita-loading');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <i class="fas fa-exclamation-triangle text-4xl text-red-500"></i>
                <p class="mt-4 text-red-500">ID Berita tidak ditemukan di URL.</p>
            `;
        }
        return;
    }

    // ================================================================
    // 3. DOM ELEMENTS (sesuai views/berita_detail.html)
    // ================================================================
    const loadingEl = document.getElementById('berita-loading');
    const contentEl = document.getElementById('berita-content');
    const judulEl = document.getElementById('berita-judul');
    const penulisEl = document.getElementById('berita-penulis');
    const tanggalEl = document.getElementById('berita-tanggal');
    const tagEl = document.getElementById('berita-tag');
    const gambarEl = document.getElementById('berita-gambar');
    const gambarPlaceholderEl = document.getElementById('berita-gambar-placeholder');
    const isiEl = document.getElementById('berita-isi');
    const sidebarListEl = document.getElementById('sidebar-berita-terkait');

    // Jika elemen utama tidak ditemukan, hentikan modul
    if (!loadingEl || !contentEl || !judulEl || !isiEl) {
        console.error('berita_detail: elemen utama tidak ditemukan.');
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
    // 5. LOAD DATA BERITA & SIDEBAR
    // ================================================================
    async function loadBerita() {
        try {
            // Ambil semua berita dan data user sekaligus
            const [beritaRes, usersRes] = await Promise.all([
                apiCall('getBerita', 'POST', {}),
                apiCall('getUsers', 'POST', {})
            ]);

            if (!beritaRes.success) throw new Error(beritaRes.message || 'Gagal memuat berita');

            // Cari berita berdasarkan ID
            const item = beritaRes.data.find(b => b.id === beritaId);
            if (!item) throw new Error('Berita tidak ditemukan.');

            // Buat map user id -> nama untuk penulis
            const userMap = {};
            if (usersRes.success) {
                usersRes.data.forEach(u => userMap[u.id] = u.nama || u.username || 'Admin');
            }

            // Render detail berita
            renderDetail(item, userMap);

            // Render sidebar berita terkait (berita lain, kecuali yang sedang dibuka)
            const beritaLain = beritaRes.data.filter(b => b.id !== beritaId).slice(0, 5);
            renderSidebar(beritaLain, userMap);

        } catch (error) {
            loadingEl.innerHTML = `
                <i class="fas fa-exclamation-triangle text-4xl text-red-500"></i>
                <p class="mt-4 text-red-500">${error.message}</p>
            `;
            contentEl.classList.add('hidden');
            if (sidebarListEl) sidebarListEl.innerHTML = '';
        }
    }

    // ================================================================
    // 6. RENDER DETAIL BERITA
    // ================================================================
    function renderDetail(item, userMap) {
        // Sembunyikan loading, tampilkan konten
        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        // Penulis
        const penulis = userMap[item.created_by] || 'Admin';

        // Tanggal
        const tanggal = item.tanggal ? formatDate(item.tanggal) : '-';

        // Gambar utama: fallback ke gambar pertama dari isi
        let gambarUrl = item.gambar_url;
        if (!gambarUrl) {
            gambarUrl = getFirstImageFromContent(item.isi);
        }

        // Isi judul, penulis, tanggal, tag
        judulEl.textContent = item.judul || 'Tanpa Judul';
        if (penulisEl) penulisEl.innerHTML = `<i class="fas fa-user-circle mr-1"></i>${penulis}`;
        if (tanggalEl) tanggalEl.innerHTML = `<i class="far fa-calendar-alt mr-1"></i>${tanggal}`;
        if (tagEl) tagEl.textContent = item.tag ? '#' + item.tag : '';

        // Gambar
        if (gambarUrl) {
            gambarEl.src = gambarUrl;
            gambarEl.style.display = 'block';
            if (gambarPlaceholderEl) gambarPlaceholderEl.style.display = 'none';
        } else {
            gambarEl.style.display = 'none';
            if (gambarPlaceholderEl) gambarPlaceholderEl.style.display = 'flex';
        }

        // Isi berita
        isiEl.innerHTML = item.isi || '<p class="italic text-[var(--text-muted)]">Tidak ada isi berita.</p>';

        // Update judul dokumen
        document.title = (item.judul || 'Berita') + ' - PAC GP Ansor Sewon';
    }

    // ================================================================
    // 7. RENDER SIDEBAR BERITA TERKAIT
    // ================================================================
    function renderSidebar(beritaList, userMap) {
        if (!sidebarListEl) return;

        if (beritaList.length === 0) {
            sidebarListEl.innerHTML = '<p class="text-[var(--text-muted)] text-sm">Belum ada berita lain.</p>';
            return;
        }

        sidebarListEl.innerHTML = beritaList.map(item => {
            const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) || 'https://placehold.co/100x100/e2e8f0/475569?text=Berita';
            const penulis = userMap[item.created_by] || 'Admin';
            const tanggal = item.tanggal ? formatDate(item.tanggal) : '-';

            return `
                <a href="/berita_detail?id=${item.id}" class="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--bg-stats)] transition-colors">
                    <img src="${thumbnail}" alt="${item.judul}" class="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                    <div class="min-w-0">
                        <h4 class="text-sm font-semibold text-[var(--text-main)] line-clamp-2">${item.judul}</h4>
                        <p class="text-xs text-[var(--text-muted)] mt-1"><i class="far fa-calendar-alt mr-1"></i>${tanggal}</p>
                        <p class="text-xs text-[var(--text-muted)] mt-0.5"><i class="fas fa-user-circle mr-1"></i>${penulis}</p>
                    </div>
                </a>
            `;
        }).join('');
    }

    // ================================================================
    // 8. INISIALISASI
    // ================================================================
    loadBerita();
});