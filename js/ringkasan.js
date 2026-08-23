/**
 * js/ringkasan.js
 * Modul Ringkasan Data - Preview Semua Modul Sebelum Kompilasi Laporan
 * Versi: 1.2.0 - Final Fix (Logbook, Auto-Hide Loading, Cache)
 */

App.register('ringkasan', function() {

    // ================================================================
    // 1. CEK AUTH (router sudah cek, tapi tetap amankan)
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // Guard untuk mencegah inisialisasi ganda
    if (window.__ringkasanLoaded) return;
    window.__ringkasanLoaded = true;

    // Cache global untuk mencegah fetch ulang jika kembali ke halaman ini
    if (!window.__ringkasanData) window.__ringkasanData = null;
    if (!window.__ringkasanTimestamp) window.__ringkasanTimestamp = 0;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const container = document.getElementById('ringkasan-data');
    const refreshBtn = document.getElementById('refresh-btn');

    // Jika elemen utama tidak ditemukan, hentikan modul
    if (!container || !refreshBtn) {
        console.error('ringkasan: elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. HELPER FORMAT
    // ================================================================
    function formatDate(d) {
        if (typeof window.formatDate === 'function') return window.formatDate(d);
        if (!d) return '-';
        const date = new Date(d);
        return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatRupiah(a) {
        if (typeof window.formatRupiah === 'function') return window.formatRupiah(a);
        if (!a && a !== 0) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a);
    }

    // ================================================================
    // 4. FUNGSI UTAMA UNTUK MEMUAT SEMUA DATA
    // ================================================================
    async function loadAll(force = false) {
        // Gunakan cache jika masih fresh (< 60 detik) dan bukan paksa refresh
        if (!force && window.__ringkasanData && (Date.now() - window.__ringkasanTimestamp < 60000)) {
            renderData(window.__ringkasanData);
            return;
        }

        // Tampilkan loading
        container.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin text-4xl text-[var(--text-main)]"></i>
                <p class="text-[var(--text-muted)] mt-4">Memuat ringkasan...</p>
            </div>
        `;

        // Timeout pengaman: jika data belum selesai dalam 3 detik, tampilkan pesan kosong
        let dataLoaded = false;
        const timeout = setTimeout(() => {
            if (!dataLoaded) {
                container.innerHTML = '<p class="text-center text-[var(--text-muted)] py-8">Gagal memuat data. Klik Refresh untuk mencoba lagi.</p>';
            }
        }, 3000);

        // Jalankan semua permintaan secara paralel, toleran terhadap error
        const results = await Promise.allSettled([
            apiCall('getSurat', 'POST', {}),
            apiCall('getLogbook', 'POST', {}),   // <-- Ganti dari getLpj
            apiCall('getKeuangan', 'POST', {}),
            apiCall('getInventaris', 'POST', {}),
            apiCall('getGaleri', 'POST', {}),
            apiCall('getProgramKerja', 'POST', {}),
            apiCall('getForumTopics', 'POST', {}),
            apiCall('getUsers', 'POST', {}),
            apiCall('getTokoh', 'POST', {}),
            apiCall('getAbsensi', 'POST', {}),
            apiCall('getStruktur', 'POST', {})
        ]);

        // Ambil data yang berhasil
        const getData = (r) => r.status === 'fulfilled' ? r.value : { success: false, data: [] };
        const getDataArray = (r) => {
            const d = getData(r);
            return d.success ? d.data : [];
        };

        const surat = getDataArray(results[0]);
        const logbook = getDataArray(results[1]);   // <-- Ganti dari lpj
        const keu = getDataArray(results[2]);
        const inventaris = getDataArray(results[3]);
        const galeri = getDataArray(results[4]);
        const proker = getDataArray(results[5]);
        const forum = getDataArray(results[6]);
        const users = getDataArray(results[7]);
        const tokoh = getDataArray(results[8]);
        const absensi = getDataArray(results[9]);
        const struktur = getDataArray(results[10]);

        const data = {
            surat, logbook, keu, inventaris, galeri, proker, forum, users, tokoh, absensi, struktur
        };

        // Simpan cache
        window.__ringkasanData = data;
        window.__ringkasanTimestamp = Date.now();

        clearTimeout(timeout);
        dataLoaded = true;

        // Render
        renderData(data);
    }

    // ================================================================
    // 5. RENDER DATA RINGKASAN
    // ================================================================
    function renderData(data) {
        const surat = data.surat;
        const logbook = data.logbook;
        const keu = data.keu;
        const inventaris = data.inventaris;
        const galeri = data.galeri;
        const proker = data.proker;
        const forum = data.forum;
        const users = data.users;
        const tokoh = data.tokoh;
        const absensi = data.absensi;
        const struktur = data.struktur;

        // ============================================================
        // 6. FUNGSI PEMBUAT KARTU PREVIEW
        // ============================================================
        function card(title, icon, headers, rows, emptyMsg, linkToModule) {
            const count = rows.length;
            const linkText = count > 20 ? `<a href="${linkToModule}" class="show-all-link">Lihat semua (${count})</a>` : '';
            const table = count > 0 ? `
                <div class="table-wrapper">
                    <table>
                        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                        <tbody>
                            ${rows.slice(0, 20).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ${linkText}
            ` : `<p class="empty-msg">${emptyMsg}</p>`;

            return `
                <div class="preview-card">
                    <h3>
                        <i class="fas ${icon}"></i>
                        ${title}
                        <span class="count-badge">${count}</span>
                    </h3>
                    ${table}
                </div>
            `;
        }

        // ============================================================
        // 7. SUSUN KONTEN RINGKASAN
        // ============================================================
        container.innerHTML = `
            ${card('Surat', 'fa-file-alt',
                ['No', 'Nomor', 'Perihal', 'Tanggal', 'Pengirim', 'Penerima'],
                surat.map((s, i) => [i+1, s.nomor_surat || '-', s.perihal || '-', formatDate(s.tanggal), s.pengirim || '-', s.penerima || '-']),
                'Belum ada surat',
                '/surat_admin')}

            ${card('Logbook / Kegiatan', 'fa-calendar-check',
                ['No', 'Kegiatan', 'Tanggal', 'Tempat', 'Peserta', 'Anggaran'],
                logbook.map((k, i) => [i+1, k.kegiatan || '-', `${formatDate(k.tanggal_mulai)} - ${formatDate(k.tanggal_selesai)}`, k.tempat || '-', k.peserta || 0, formatRupiah(k.anggaran || 0)]),
                'Belum ada logbook kegiatan',
                '/logbook_admin')}

            ${card('Keuangan', 'fa-coins',
                ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan'],
                keu.map((t, i) => [i+1, formatDate(t.tanggal), t.jenis, t.kategori || '-', formatRupiah(t.jumlah), t.keterangan || '-']),
                'Belum ada transaksi',
                '/keuangan_admin')}

            ${card('Inventaris', 'fa-boxes',
                ['No', 'Barang', 'Jumlah', 'Kondisi', 'Lokasi'],
                inventaris.map((b, i) => [i+1, b.nama_barang, b.jumlah, b.kondisi, b.lokasi || '-']),
                'Belum ada inventaris',
                '/inventaris_admin')}

            ${card('Galeri', 'fa-images',
                ['No', 'Judul', 'Tipe', 'Kategori'],
                galeri.map((g, i) => [i+1, g.judul || '-', g.tipe || '-', g.kategori || '-']),
                'Belum ada media',
                '/galeri_admin')}

            ${card('Program Kerja', 'fa-tasks',
                ['No', 'Program', 'Status', 'Progress', 'PIC'],
                proker.map((p, i) => [i+1, p.nama_program || '-', p.status || '-', `${p.progress || 0}%`, p.pic || '-']),
                'Belum ada program',
                '/proker_admin')}

            ${card('Forum Topik', 'fa-comments',
                ['No', 'Judul', 'Dibuat oleh', 'Tanggal'],
                forum.map((f, i) => [i+1, f.judul || '-', f.created_by || '-', formatDate(f.created_at)]),
                'Belum ada topik forum',
                '/forum_admin')}

            ${card('Anggota', 'fa-users',
                ['No', 'Nama', 'Email', 'Role', 'Status'],
                users.map((u, i) => [i+1, u.nama || '-', u.email || '-', u.role || '-', u.status || '-']),
                'Belum ada anggota',
                '/anggota_admin')}

            ${card('Tokoh', 'fa-user-tie',
                ['No', 'Nama', 'Alamat', 'No HP'],
                tokoh.map((t, i) => [i+1, t.nama || '-', t.alamat || '-', t.no_hp || '-']),
                'Belum ada tokoh',
                '/tokoh_admin')}

            ${card('Absensi', 'fa-clipboard-check',
                ['No', 'Nama', 'Alamat', 'Waktu'],
                absensi.map((a, i) => [i+1, a.nama || '-', a.alamat || '-', formatDate(a.created_at)]),
                'Belum ada absensi',
                '/absensi_admin')}

            ${card('Struktur Organisasi', 'fa-sitemap',
                ['No', 'Jabatan', 'Nama'],
                struktur.map((s, i) => [i+1, s.jabatan || '-', s.nama || '-']),
                'Belum ada struktur',
                '/profil_admin')}
        `;
    }

    // ================================================================
    // 8. EVENT LISTENER REFRESH
    // ================================================================
    refreshBtn.addEventListener('click', function() {
        loadAll(true); // force refresh
        showToast('Ringkasan diperbarui!', 'success');
    });

    // ================================================================
    // 9. INISIALISASI PERTAMA KALI
    // ================================================================
    loadAll();
});