/**
 * js/dashboard_member.js
 * Dashboard Member - Final (Cepat: Cache Lokal, Stale-While-Revalidate)
 * Versi: 9.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±118
 */

App.register('dashboard_member', function() {
    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'member') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD INISIALISASI
    // ================================================================
    if (window.__dashboardMemberLoaded) return;
    window.__dashboardMemberLoaded = true;

    // ================================================================
    // 3. STATE (Cache Lokal)
    // ================================================================
    let suratCache = [];
    let logbookCache = [];

    // ================================================================
    // 4. DOM ELEMENTS
    // ================================================================
    const skeleton = document.getElementById('member-skeleton');
    const content = document.getElementById('member-dashboard-content');
    const totalSurat = document.getElementById('total-surat-saya');
    const totalLogbook = document.getElementById('total-lpj-saya'); // ID dari HTML
    const userRole = document.getElementById('user-role-here');
    const recentSurat = document.getElementById('recent-surat-saya');
    const recentLogbook = document.getElementById('recent-lpj-saya'); // ID dari HTML
    const refreshBtn = document.getElementById('refresh-member-btn');

    if (!skeleton || !content) {
        console.error('dashboard_member: elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 5. RENDER DASHBOARD (dari cache)
    // ================================================================
    function renderDashboard() {
        // Statistik
        if (totalSurat) totalSurat.textContent = suratCache.length;
        if (totalLogbook) totalLogbook.textContent = logbookCache.length;
        if (userRole) userRole.textContent = (user.role || 'member').toUpperCase();

        // Surat Terbaru (3 terakhir)
        if (recentSurat) {
            if (suratCache.length > 0) {
                recentSurat.innerHTML = suratCache.slice(-3).reverse().map(s => `
                    <p class="text-[var(--text-main)] border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0">
                        <i class="fas fa-file-alt text-[var(--text-main)] mr-2"></i>
                        ${s.perihal || '-'} 
                        <span class="text-xs text-[var(--text-muted)] ml-2">${formatDate(s.tanggal)}</span>
                    </p>
                `).join('');
            } else {
                recentSurat.innerHTML = '<p class="text-[var(--text-muted)]">Belum ada data</p>';
            }
        }

        // Logbook Terbaru (3 terakhir)
        if (recentLogbook) {
            if (logbookCache.length > 0) {
                recentLogbook.innerHTML = logbookCache.slice(-3).reverse().map(l => `
                    <p class="text-[var(--text-main)] border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0">
                        <i class="fas fa-file-pdf text-[var(--text-main)] mr-2"></i>
                        ${l.kegiatan || '-'} 
                        <span class="text-xs text-[var(--text-muted)] ml-2">${formatDate(l.tanggal_mulai)}</span>
                    </p>
                `).join('');
            } else {
                recentLogbook.innerHTML = '<p class="text-[var(--text-muted)]">Belum ada data</p>';
            }
        }
    }

    // ================================================================
    // 6. LOAD DATA (Stale-While-Revalidate)
    // ================================================================
    async function loadDashboard(force = false) {
        // Jika cache sudah ada dan tidak force, tampilkan dulu
        if (!force && (suratCache.length > 0 || logbookCache.length > 0)) {
            renderDashboard();
            fetchBackground();
            return;
        }

        // Tampilkan skeleton
        skeleton.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const [suratRes, logbookRes] = await Promise.all([
                forceRefreshData('getSurat', {}),
                forceRefreshData('getLogbook', {})
            ]);

            suratCache = suratRes.success ? suratRes.data : [];
            logbookCache = logbookRes.success ? logbookRes.data : [];

            // Sembunyikan skeleton, tampilkan konten
            skeleton.classList.add('hidden');
            content.classList.remove('hidden');
            renderDashboard();
        } catch (error) {
            console.error('Dashboard error:', error);
            skeleton.classList.add('hidden');
            content.classList.remove('hidden');
        }
    }

    async function fetchBackground() {
        try {
            const [suratRes, logbookRes] = await Promise.all([
                forceRefreshData('getSurat', {}),
                forceRefreshData('getLogbook', {})
            ]);
            if (suratRes.success) suratCache = suratRes.data;
            if (logbookRes.success) logbookCache = logbookRes.data;
            renderDashboard();
        } catch (e) {
            console.warn('Background refresh dashboard gagal:', e);
        }
    }

    // ================================================================
    // 7. EVENT LISTENER TOMBOL REFRESH
    // ================================================================
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            loadDashboard(true);
            showToast('Dashboard berhasil diperbarui!', 'success');
        });
    }

    // ================================================================
    // 8. INISIALISASI PERTAMA KALI
    // ================================================================
    loadDashboard();
});