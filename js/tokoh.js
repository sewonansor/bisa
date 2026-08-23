/**
 * js/tokoh.js - Modul Publik Daftar Tokoh & Penggerak
 * Versi: 1.0.0 - Final Fix (Stable, No Error)
 */

App.register('tokoh', function() {
    console.log('Modul tokoh dijalankan');

    // ============================================================
    // 1. AMBIL ELEMEN UTAMA
    // ============================================================
    const container = document.getElementById('tokoh-list');
    if (!container) {
        console.error('tokoh: elemen #tokoh-list tidak ditemukan.');
        return;
    }

    // ============================================================
    // 2. FUNGSI LOAD DATA TOKOH
    // ============================================================
    async function loadTokoh() {
        // Tampilkan loading awal (jika belum ada skeleton, kita isi dengan pesan)
        container.innerHTML = '<p class="text-center text-[var(--text-muted)] py-12">Memuat data tokoh...</p>';

        try {
            const result = await apiCall('getTokoh', 'POST', {});
            if (result.success && result.data.length > 0) {
                renderTokoh(result.data);
            } else if (result.success && result.data.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12">
                        <i class="fas fa-user-tie text-4xl text-gray-300 mb-3"></i>
                        <p class="text-[var(--text-muted)]">Belum ada data tokoh.</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12 text-red-500">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <p>Gagal memuat data tokoh.</p>
                        <p class="text-sm">${result.message || 'Coba lagi nanti.'}</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error load tokoh:', error);
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Terjadi kesalahan saat memuat data.</p>
                    <p class="text-sm">${error.message}</p>
                </div>
            `;
        }
    }

    // ============================================================
    // 3. FUNGSI RENDER DAFTAR TOKOH
    // ============================================================
    function renderTokoh(data) {
        let html = '';
        data.forEach(item => {
            // Tentukan apakah ada foto
            const foto = item.foto_url 
                ? `<img src="${item.foto_url}" alt="${item.nama}" onerror="this.onerror=null;this.src='https://placehold.co/400x300/e2e8f0/475569?text=Tokoh';" />`
                : `<div style="height:220px;background:#e5e7eb;display:flex;align-items:center;justify-content:center"><i class="fas fa-user-tie fa-5x text-gray-400"></i></div>`;

            // Tentukan embed OpenStreetMap jika ada koordinat
            let mapHtml = '';
            if (item.lat && item.lng) {
                mapHtml = `
                    <div style="margin-top:1rem;border-radius:8px;overflow:hidden;height:160px;border:1px solid #e5e7eb">
                        <iframe width="100%" height="160" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"
                            src="https://www.openstreetmap.org/export/embed.html?bbox=${item.lng}%2C${item.lat}%2C${item.lng}%2C${item.lat}&layer=mapnik&marker=${item.lat}%2C${item.lng}">
                        </iframe>
                    </div>
                `;
            }

            // Susun kartu
            html += `
                <div class="tokoh-card">
                    ${foto}
                    <div class="body">
                        <h3>${item.nama || 'Tanpa Nama'}</h3>
                        <p><i class="fas fa-map-marker-alt mr-1"></i> ${item.alamat || 'Alamat tidak tersedia'}</p>
                        ${mapHtml}
                        ${item.no_hp ? `<p><i class="fas fa-phone mr-1"></i> ${item.no_hp}</p>` : ''}
                        ${item.riwayat_hidup ? `<div class="riwayat"><strong>Riwayat Hidup:</strong><p>${item.riwayat_hidup}</p></div>` : ''}
                        ${item.pengalaman_organisasi ? `<div class="riwayat"><strong>Pengalaman Organisasi:</strong><p>${item.pengalaman_organisasi}</p></div>` : ''}
                        ${item.detail_lain ? `<div class="riwayat"><strong>Detail Lain:</strong><p>${item.detail_lain}</p></div>` : ''}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // ============================================================
    // 4. INISIALISASI
    // ============================================================
    loadTokoh();
});