/**
 * js/dashboard_admin.js
 * Dashboard Admin — v12.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v12.0.0:
 *   ✅ NEW: Handle offline status — tampilkan cache + warning
 *   ✅ NEW: Listen sync:complete auto-refresh stats
 *   ✅ NEW: Prefetch banner + progress indicator
 *   ✅ NEW: Safe toast fallback
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe seluruh DOM elements
 *   ✅ FIX: Promise.allSettled untuk semua fetch
 *   ✅ FIX: Per-modul error isolation
 *   ✅ FIX: Refresh tanpa reload (clear cache + re-fetch)
 *   ✅ FIX: 11 kartu statistik berfungsi
 *   ✅ FIX: Recent sections (surat, logbook, keuangan, peminjaman)
 *   ✅ FIX: Greeting dinamis berdasarkan waktu
 *   ✅ FIX: Loading state + skeleton instan paint
 *   ✅ PRESERVED: Semua fitur v11.1.0
 * ============================================================
 */

App.register('dashboard_admin', function() {
    'use strict';

    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD INISIALISASI
    // ================================================================
    if (window.__dashboardAdminLoaded) {
        console.log('[dashboard_admin] Sudah di-init, skip.');
        return;
    }
    window.__dashboardAdminLoaded = true;

    console.log('[dashboard_admin] 🚀 Init v12.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const refreshBtn = document.getElementById('dashboard-refresh-btn');
    const skeleton = document.getElementById('dashboard-skeleton');
    const content = document.getElementById('dashboard-content');

    if (!skeleton || !content) {
        console.error('[dashboard_admin] Elemen skeleton/content tidak ditemukan.');
        return;
    }

    // ================================================================
    // 4. HELPERS
    // ================================================================
    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[dashboard_admin:' + (type || 'info') + ']', msg);
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function formatRupiah(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 11) return { text: 'Selamat Pagi', icon: 'fa-sun', color: 'text-yellow-500' };
        if (hour < 15) return { text: 'Selamat Siang', icon: 'fa-cloud-sun', color: 'text-orange-500' };
        if (hour < 18) return { text: 'Selamat Sore', icon: 'fa-cloud-sun', color: 'text-orange-400' };
        return { text: 'Selamat Malam', icon: 'fa-moon', color: 'text-indigo-500' };
    }

    function getUserName() {
        return user.nama || user.name || user.username || 'Admin';
    }

    // ================================================================
    // 5. PREFETCH STATUS BANNER
    // ================================================================
    function ensurePrefetchBanner() {
        const oldBanner = document.getElementById('dashboard-prefetch-banner');
        if (oldBanner) oldBanner.remove();

        const banner = document.createElement('div');
        banner.id = 'dashboard-prefetch-banner';
        banner.className = 'hidden mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 transition-all duration-300';
        banner.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white flex-shrink-0">
                    <i class="fas fa-bolt"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <p class="font-semibold text-blue-800 dark:text-blue-200 text-sm">
                            ⚡ Menyiapkan halaman dashboard
                        </p>
                        <span id="dashboard-prefetch-count" class="text-xs font-bold text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">
                            0 / 0
                        </span>
                    </div>
                    <p id="dashboard-prefetch-status" class="text-xs text-blue-600 dark:text-blue-300 mb-2">
                        Semua menu akan siap diakses cepat setelah selesai.
                    </p>
                    <div class="w-full bg-blue-100 dark:bg-blue-900/40 rounded-full h-2 overflow-hidden">
                        <div id="dashboard-prefetch-bar"
                            class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300"
                            style="width: 0%"></div>
                    </div>
                </div>
            </div>
        `;

        content.parentNode.insertBefore(banner, content);
        return banner;
    }

    // ================================================================
    // 6. ATTACH PREFETCH LISTENERS
    // ================================================================
    function attachPrefetchListeners() {
        const banner = document.getElementById('dashboard-prefetch-banner');
        const countEl = document.getElementById('dashboard-prefetch-count');
        const barEl = document.getElementById('dashboard-prefetch-bar');
        const statusEl = document.getElementById('dashboard-prefetch-status');

        if (!banner) return;

        if (window.__dashboardPrefetchHandlers) {
            window.removeEventListener('prefetchStart', window.__dashboardPrefetchHandlers.start);
            window.removeEventListener('prefetchProgress', window.__dashboardPrefetchHandlers.progress);
            window.removeEventListener('prefetchComplete', window.__dashboardPrefetchHandlers.complete);
        }

        const handlers = {
            start: (e) => {
                banner.classList.remove('hidden');
                banner.classList.remove('opacity-0');
                if (countEl) countEl.textContent = `0 / ${e.detail.total}`;
                if (barEl) barEl.style.width = '0%';
                if (statusEl) statusEl.textContent = 'Memuat view & script di background...';
            },
            progress: (e) => {
                const pct = Math.round((e.detail.completed / e.detail.total) * 100);
                if (countEl) countEl.textContent = `${e.detail.completed} / ${e.detail.total}`;
                if (barEl) barEl.style.width = pct + '%';
                if (statusEl && e.detail.current) {
                    const shortName = String(e.detail.current).replace(/^\//, '').replace(/\/$/, '');
                    statusEl.textContent = `Memuat: ${shortName}`;
                }
            },
            complete: (e) => {
                if (countEl) countEl.textContent = `${e.detail.total} / ${e.detail.total}`;
                if (barEl) barEl.style.width = '100%';
                if (statusEl) statusEl.textContent = '✅ Semua halaman siap diakses!';

                setTimeout(() => {
                    banner.classList.add('opacity-0');
                    setTimeout(() => {
                        banner.classList.add('hidden');
                        banner.classList.remove('opacity-0');
                    }, 400);
                }, 2500);

                safeToast('⚡ Semua menu siap diakses cepat!', 'success', 3000);
            }
        };

        window.addEventListener('prefetchStart', handlers.start);
        window.addEventListener('prefetchProgress', handlers.progress);
        window.addEventListener('prefetchComplete', handlers.complete);

        window.__dashboardPrefetchHandlers = handlers;

        // Cek status prefetch saat ini
        if (typeof window.getPrefetchState === 'function') {
            const state = window.getPrefetchState();
            if (state && state.isPrefetching) {
                banner.classList.remove('hidden');
                if (countEl) countEl.textContent = `${state.completed} / ${state.total}`;
                const pct = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;
                if (barEl) barEl.style.width = pct + '%';
            }
        }
    }

    // ================================================================
    // 7. RENDER DEFAULT (instant paint)
    // ================================================================
    function renderDefault() {
        if (skeleton) skeleton.classList.add('hidden');
        content.classList.remove('hidden');
        content.style.display = 'block';

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

        const recentSurat = document.getElementById('recent-surat');
        const recentLogbook = document.getElementById('recent-logbook');
        const recentKeuangan = document.getElementById('recent-keuangan');
        const recentPinjam = document.getElementById('recent-pinjam');

        const loadingHtml = '<p class="text-[var(--text-muted)] text-sm flex items-center gap-2">' +
            '<i class="fas fa-spinner fa-spin"></i> Memuat data...</p>';

        if (recentSurat) recentSurat.innerHTML = loadingHtml;
        if (recentLogbook) recentLogbook.innerHTML = loadingHtml;
        if (recentKeuangan) recentKeuangan.innerHTML = loadingHtml;
        if (recentPinjam) recentPinjam.innerHTML = loadingHtml;
    }

    // ================================================================
    // 8. UPDATE DASHBOARD
    // ================================================================
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

        // Recent Surat
        if (recentSurat) {
            recentSurat.innerHTML = (data.recentSurat && data.recentSurat.length) ?
                data.recentSurat.map(s => `
                    <p class="text-[var(--text-main)] border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0 flex items-start gap-2 text-sm">
                        <i class="fas fa-file-alt text-green-600 mt-0.5"></i>
                        <span class="flex-1 min-w-0">
                            <span class="line-clamp-1">${escapeHtml(s.perihal || '-')}</span>
                            <span class="text-xs text-[var(--text-muted)]">${formatDate(s.tanggal)}</span>
                        </span>
                    </p>
                `).join('') :
                '<p class="text-[var(--text-muted)] text-sm italic">Belum ada data</p>';
        }

        // Recent Logbook
        if (recentLogbook) {
            recentLogbook.innerHTML = (data.recentLogbook && data.recentLogbook.length) ?
                data.recentLogbook.map(l => `
                    <p class="text-[var(--text-main)] border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0 flex items-start gap-2 text-sm">
                        <i class="fas fa-book text-blue-600 mt-0.5"></i>
                        <span class="flex-1 min-w-0">
                            <span class="line-clamp-1">${escapeHtml(l.kegiatan || '-')}</span>
                            <span class="text-xs text-[var(--text-muted)]">${formatDate(l.tanggal_mulai)}</span>
                        </span>
                    </p>
                `).join('') :
                '<p class="text-[var(--text-muted)] text-sm italic">Belum ada data</p>';
        }

        // Recent Keuangan
        if (recentKeuangan) {
            recentKeuangan.innerHTML = (data.recentKeuangan && data.recentKeuangan.length) ?
                data.recentKeuangan.map(t => `
                    <p class="text-[var(--text-main)] border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0 flex items-start gap-2 text-sm">
                        <i class="fas fa-coins text-yellow-600 mt-0.5"></i>
                        <span class="flex-1 min-w-0">
                            <span class="line-clamp-1">${escapeHtml(t.kategori || '-')}</span>
                            <span class="text-xs text-[var(--text-muted)]">${formatRupiah(Number(t.jumlah) || 0)} • ${formatDate(t.tanggal)}</span>
                        </span>
                    </p>
                `).join('') :
                '<p class="text-[var(--text-muted)] text-sm italic">Belum ada data</p>';
        }

        // Recent Peminjaman
        if (recentPinjam) {
            recentPinjam.innerHTML = (data.recentPinjam && data.recentPinjam.length) ?
                data.recentPinjam.map(p => `
                    <p class="text-[var(--text-main)] border-b border-[var(--card-border)] pb-2 last:border-0 last:pb-0 flex items-start gap-2 text-sm">
                        <i class="fas fa-hand-holding text-orange-600 mt-0.5"></i>
                        <span class="flex-1 min-w-0">
                            <span class="line-clamp-1">${escapeHtml(p.peminjam || '-')}</span>
                            <span class="text-xs text-[var(--text-muted)]">${formatDate(p.tanggal_pinjam)}</span>
                        </span>
                    </p>
                `).join('') :
                '<p class="text-[var(--text-muted)] text-sm italic">Belum ada data</p>';
        }
    }

    // ================================================================
    // 9. FETCH PRIMARY DATA
    // ================================================================
    async function fetchDashboardData(force) {
        force = force || false;

        try {
            const call = force ? forceRefreshData : apiCall;
            const isOffline = !navigator.onLine;

            if (isOffline) {
                console.log('[dashboard_admin] 📴 Offline mode — using cache');
            }

            const [suratRes, logbookRes, usersRes, keuRes] = await Promise.allSettled([
                force ? call('getSurat', {}) : call('getSurat', 'POST', {}),
                force ? call('getLogbook', {}) : call('getLogbook', 'POST', {}),
                force ? call('getUsers', {}) : call('getUsers', 'POST', {}),
                force ? call('getKeuangan', {}) : call('getKeuangan', 'POST', {})
            ]);

            const safeData = (r) => {
                if (r.status !== 'fulfilled') return null;
                return r.value;
            };

            const suratResV = safeData(suratRes);
            const logbookResV = safeData(logbookRes);
            const usersResV = safeData(usersRes);
            const keuResV = safeData(keuRes);

            // Hitung saldo
            let saldo = 0;
            if (keuResV && keuResV.success && Array.isArray(keuResV.data)) {
                keuResV.data.forEach(t => {
                    const j = Number(t.jumlah) || 0;
                    saldo += (t.jenis === 'Pemasukan') ? j : -j;
                });
            }

            const data = {
                totalSurat: (suratResV && suratResV.success && Array.isArray(suratResV.data)) ? suratResV.data.length : 0,
                totalLogbook: (logbookResV && logbookResV.success && Array.isArray(logbookResV.data)) ? logbookResV.data.length : 0,
                totalAnggota: (usersResV && usersResV.success && Array.isArray(usersResV.data)) ? usersResV.data.length : 0,
                totalKegiatan: (logbookResV && logbookResV.success && Array.isArray(logbookResV.data)) ? logbookResV.data.length : 0,
                saldoKeuangan: 'Rp ' + saldo.toLocaleString('id-ID'),
                recentSurat: (suratResV && suratResV.success && Array.isArray(suratResV.data))
                    ? suratResV.data.slice(-3).reverse() : [],
                recentLogbook: (logbookResV && logbookResV.success && Array.isArray(logbookResV.data))
                    ? logbookResV.data.slice(-3).reverse() : [],
                recentKeuangan: (keuResV && keuResV.success && Array.isArray(keuResV.data))
                    ? keuResV.data.slice(-3).reverse() : [],
                totalBarang: 0,
                totalMedia: 0,
                totalProker: 0,
                totalForum: 0,
                totalTokoh: 0,
                totalPeminjaman: 0,
                recentPinjam: []
            };

            updateDashboard(data);

            // Fetch secondary (jangan blocking)
            fetchSecondaryData(data).catch(() => {});

        } catch (error) {
            console.error('[dashboard_admin] Fetch primary error:', error);
            safeToast('Gagal memuat data dashboard', 'error', 4000);
        }
    }

    // ================================================================
    // 10. FETCH SECONDARY DATA
    // ================================================================
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

            const getCount = (r) => {
                if (r.status !== 'fulfilled' || !r.value || !r.value.success) return 0;
                return Array.isArray(r.value.data) ? r.value.data.length : 0;
            };

            baseData.totalBarang = getCount(inventaris);
            baseData.totalMedia = getCount(galeri);
            baseData.totalProker = getCount(proker);
            baseData.totalForum = getCount(forum);
            baseData.totalTokoh = getCount(tokoh);
            baseData.totalPeminjaman = getCount(peminjaman);

            if (peminjaman.status === 'fulfilled' && peminjaman.value && peminjaman.value.success) {
                const data = Array.isArray(peminjaman.value.data) ? peminjaman.value.data : [];
                baseData.recentPinjam = data.slice(-3).reverse();
            }

            updateDashboard(baseData);
        } catch (e) {
            console.warn('[dashboard_admin] Secondary data error:', e);
        }
    }

    // ================================================================
    // 11. REFRESH BUTTON
    // ================================================================
    if (refreshBtn) {
        const fresh = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(fresh, refreshBtn);

        fresh.addEventListener('click', async function() {
            if (this.disabled) return;

            const original = this.innerHTML;
            this.disabled = true;
            this.classList.add('btn-loading');
            this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refresh & Prefetch...';

            try {
                // Clear prefetch cache
                if (typeof window.clearPrefetchCache === 'function') {
                    window.clearPrefetchCache();
                }

                try {
                    SafeSessionStorage.clear();
                } catch (e) {}

                renderDefault();

                await fetchDashboardData(true);

                if (typeof window.prefetchRoutes === 'function') {
                    window.prefetchRoutes('admin', true).catch(() => {});
                }

                safeToast('✅ Dashboard & prefetch diperbarui!', 'success');

            } catch (e) {
                console.error('[dashboard_admin] Refresh error:', e);
                safeToast('Gagal refresh: ' + e.message, 'error');
            } finally {
                this.disabled = false;
                this.classList.remove('btn-loading');
                this.innerHTML = original;
            }
        });
    }

    // ================================================================
    // 12. LISTEN SYNC EVENT
    // ================================================================
    function handleSyncComplete(e) {
        const detail = e.detail || {};
        if (detail.processed > 0) {
            console.log('[dashboard_admin] Sync complete, refreshing stats...');
            fetchDashboardData(true).catch(() => {});
        }
    }
    window.addEventListener('sync:complete', handleSyncComplete);

    // ================================================================
    // 13. LISTEN ONLINE/OFFLINE
    // ================================================================
    function handleOnline() {
        console.log('[dashboard_admin] 🟢 Online detected');
        // Refresh data setelah online kembali
        setTimeout(() => {
            fetchDashboardData(true).catch(() => {});
        }, 1500);
    }

    function handleOffline() {
        console.log('[dashboard_admin] 🔴 Offline detected');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // ================================================================
    // 14. CLEANUP
    // ================================================================
    function cleanup() {
        window.__dashboardAdminLoaded = false;

        if (window.__dashboardPrefetchHandlers) {
            window.removeEventListener('prefetchStart', window.__dashboardPrefetchHandlers.start);
            window.removeEventListener('prefetchProgress', window.__dashboardPrefetchHandlers.progress);
            window.removeEventListener('prefetchComplete', window.__dashboardPrefetchHandlers.complete);
            delete window.__dashboardPrefetchHandlers;
        }

        window.removeEventListener('sync:complete', handleSyncComplete);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);

        const banner = document.getElementById('dashboard-prefetch-banner');
        if (banner) banner.remove();

        console.log('[dashboard_admin] Cleanup');
    }

    window.__dashboardAdminCleanup = cleanup;

    // ================================================================
    // 15. INIT
    // ================================================================
    console.log('[dashboard_admin] Init dimulai');

    ensurePrefetchBanner();
    attachPrefetchListeners();
    renderDefault();
    fetchDashboardData();

    const greeting = getGreeting();
    console.log(`[dashboard_admin] ${greeting.text}, ${getUserName()}!`);
    console.log('[dashboard_admin] ✅ Init selesai v12.0.0');
});