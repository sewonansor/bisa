/**
 * js/dashboard_admin.js
 * Dashboard Admin - Final Fix (No ReferenceError, Render Instan, Anti Stuck)
 * Versi: 9.2.0
 */

App.register('dashboard_admin', function() {

    // 1. CEK AUTH
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // 2. GUARD INISIALISASI
    if (window.__dashboardAdminLoaded) return;
    window.__dashboardAdminLoaded = true;

    // 3. DEKLARASI VARIABEL DI AWAL (PENTING!)
    const refreshBtn = document.getElementById('dashboard-refresh-btn');
    const skeleton = document.getElementById('dashboard-skeleton');
    const content = document.getElementById('dashboard-content');

    // Jika elemen utama tidak ditemukan, hentikan
    if (!skeleton || !content) {
        console.error('Dashboard admin: elemen skeleton/content tidak ditemukan.');
        return;
    }

    // 4. HELPER SET TEXT
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // 5. RENDER DEFAULT (langsung tampil, tidak menunggu API)
    function renderDefault() {
        skeleton.classList.add('hidden');
        content.classList.remove('hidden');
        content.style.display = 'block';

        // Isi dengan nilai default 0
        setText('total-surat', 0);
        setText('total-logbook', 0);
        setText('total-anggota', 0);
        setText('total-kegiatan', 0);
        setText('saldo-keuangan', 'Rp 0');
        setText('total-barang', 0);
        setText('total-media', 0);
        setText('total-proker', 0);
        setText('total-topik-forum', 0);
        setText('total-tokoh', 0);
        setText('total-peminjaman', 0);

        // Recent lists - tampilkan "Memuat data..."
        const recentSurat = document.getElementById('recent-surat');
        const recentLogbook = document.getElementById('recent-logbook');
        const recentKeuangan = document.getElementById('recent-keuangan');
        const recentPinjam = document.getElementById('recent-pinjam');
        if (recentSurat) recentSurat.innerHTML = '<p class="text-gray-500">Memuat data...</p>';
        if (recentLogbook) recentLogbook.innerHTML = '<p class="text-gray-500">Memuat data...</p>';
        if (recentKeuangan) recentKeuangan.innerHTML = '<p class="text-gray-500">Memuat data...</p>';
        if (recentPinjam) recentPinjam.innerHTML = '<p class="text-gray-500">Memuat data...</p>';
    }

    // 6. UPDATE DASHBOARD DARI DATA API
    function updateDashboard(data) {
        setText('total-surat', data.totalSurat ?? 0);
        setText('total-logbook', data.totalLogbook ?? 0);
        setText('total-anggota', data.totalAnggota ?? 0);
        setText('total-kegiatan', data.totalKegiatan ?? 0);
        setText('saldo-keuangan', data.saldoKeuangan ?? 'Rp 0');
        setText('total-barang', data.totalBarang ?? 0);
        setText('total-media', data.totalMedia ?? 0);
        setText('total-proker', data.totalProker ?? 0);
        setText('total-topik-forum', data.totalForum ?? 0);
        setText('total-tokoh', data.totalTokoh ?? 0);
        setText('total-peminjaman', data.totalPeminjaman ?? 0);

        const recentSurat = document.getElementById('recent-surat');
        const recentLogbook = document.getElementById('recent-logbook');
        const recentKeuangan = document.getElementById('recent-keuangan');
        const recentPinjam = document.getElementById('recent-pinjam');

        if (recentSurat) {
            recentSurat.innerHTML = (data.recentSurat && data.recentSurat.length) ?
                data.recentSurat.map(s => `<p class="text-gray-700 border-b border-gray-100 pb-2 last:border-0 last:pb-0"><i class="fas fa-file-alt text-green-600 mr-2"></i>${s.perihal || '-'} <span class="text-xs text-gray-400 ml-2">${formatDate(s.tanggal)}</span></p>`).join('') :
                '<p class="text-gray-500">Belum ada data</p>';
        }

        if (recentLogbook) {
            recentLogbook.innerHTML = (data.recentLogbook && data.recentLogbook.length) ?
                data.recentLogbook.map(l => `<p class="text-gray-700 border-b border-gray-100 pb-2 last:border-0 last:pb-0"><i class="fas fa-file-pdf text-blue-600 mr-2"></i>${l.kegiatan || '-'} <span class="text-xs text-gray-400 ml-2">${formatDate(l.tanggal_mulai)}</span></p>`).join('') :
                '<p class="text-gray-500">Belum ada data</p>';
        }

        if (recentKeuangan) {
            recentKeuangan.innerHTML = (data.recentKeuangan && data.recentKeuangan.length) ?
                data.recentKeuangan.map(t => `<p class="text-gray-700 border-b border-gray-100 pb-2 last:border-0 last:pb-0"><i class="fas fa-coins text-yellow-600 mr-2"></i>${t.kategori || '-'} - ${formatRupiah(Number(t.jumlah) || 0)} <span class="text-xs text-gray-400 ml-2">${formatDate(t.tanggal)}</span></p>`).join('') :
                '<p class="text-gray-500">Belum ada data</p>';
        }

        if (recentPinjam) {
            recentPinjam.innerHTML = (data.recentPinjam && data.recentPinjam.length) ?
                data.recentPinjam.map(p => `<p class="text-gray-700 border-b border-gray-100 pb-2 last:border-0 last:pb-0"><i class="fas fa-hand-holding text-orange-600 mr-2"></i>${p.peminjam || '-'} <span class="text-xs text-gray-400 ml-2">${formatDate(p.tanggal_pinjam)}</span></p>`).join('') :
                '<p class="text-gray-500">Belum ada data</p>';
        }
    }

    // 7. FETCH DATA UTAMA
    async function fetchDashboardData(force = false) {
        try {
            const [suratRes, logbookRes, usersRes, keuRes] = await Promise.all([
                apiCall('getSurat', 'POST', {}),
                apiCall('getLogbook', 'POST', {}),
                apiCall('getUsers', 'POST', {}),
                apiCall('getKeuangan', 'POST', {})
            ]);

            let saldo = 0;
            if (keuRes.success && keuRes.data) {
                keuRes.data.forEach(t => {
                    const j = Number(t.jumlah) || 0;
                    saldo += (t.jenis === 'Pemasukan') ? j : -j;
                });
            }

            const data = {
                totalSurat: suratRes.success ? suratRes.data.length : 0,
                totalLogbook: logbookRes.success ? logbookRes.data.length : 0,
                totalAnggota: usersRes.success ? usersRes.data.length : 0,
                totalKegiatan: logbookRes.success ? logbookRes.data.length : 0,
                saldoKeuangan: 'Rp ' + saldo.toLocaleString('id-ID'),
                recentSurat: suratRes.success ? suratRes.data.slice(-3).reverse() : [],
                recentLogbook: logbookRes.success ? logbookRes.data.slice(-3).reverse() : [],
                recentKeuangan: keuRes.success ? keuRes.data.slice(-3).reverse() : [],
                totalBarang: 0,
                totalMedia: 0,
                totalProker: 0,
                totalForum: 0,
                totalTokoh: 0,
                totalPeminjaman: 0,
                recentPinjam: []
            };

            // Update dashboard
            updateDashboard(data);

            // Load secondary data
            fetchSecondaryData(data);

        } catch (error) {
            console.error('Fetch dashboard error:', error);
            // Skeleton sudah hilang oleh renderDefault, jadi aman
        }
    }

    // 8. FETCH DATA SEKUNDER
    async function fetchSecondaryData(baseData) {
        try {
            const [inventaris, galeri, proker, forum, tokoh, peminjaman] = await Promise.allSettled([
                apiCall('getInventaris', 'POST', {}),
                apiCall('getGaleri', 'POST', {}),
                apiCall('getProgramKerja', 'POST', {}),
                apiCall('getForumTopics', 'POST', {}),
                apiCall('getTokoh', 'POST', {}),
                apiCall('getPeminjaman', 'POST', {})
            ]);

            const getCount = (r) => r.status === 'fulfilled' && r.value.success ? r.value.data.length : 0;

            baseData.totalBarang = getCount(inventaris);
            baseData.totalMedia = getCount(galeri);
            baseData.totalProker = getCount(proker);
            baseData.totalForum = getCount(forum);
            baseData.totalTokoh = getCount(tokoh);
            baseData.totalPeminjaman = getCount(peminjaman);

            const pinjamData = (peminjaman.status === 'fulfilled' && peminjaman.value.success) ? peminjaman.value.data : [];
            baseData.recentPinjam = pinjamData.slice(-3).reverse();

            updateDashboard(baseData);

        } catch (e) {
            console.warn('Secondary data error:', e);
        }
    }

    // 9. TOMBOL REFRESH
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            this.classList.add('btn-loading');
            this.innerHTML = '<i class="fas fa-sync-alt"></i> Memperbarui...';
            renderDefault();
            fetchDashboardData(true).finally(() => {
                this.classList.remove('btn-loading');
                this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
                showToast('Dashboard berhasil diperbarui!', 'success');
            });
        });
    }

    // 10. INISIALISASI
    renderDefault();
    fetchDashboardData();
});