/**
 * js/dashboard_member.js
 * Dashboard Member - FULL FIX v10.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - B5: Guard anti-duplikasi + reset via router
 *  - B8: Clone-replace listener (anti memory leak)
 *  - XSS: escapeHtml() di semua output
 *  - Loading state + error recovery
 *
 * FEATURES:
 *  - Stats 4 kartu (Surat, Logbook, Bulan Ini, Status Akun)
 *  - Greeting dinamis berdasarkan waktu
 *  - Profile card dengan avatar + role
 *  - Recent Surat (5 terbaru)
 *  - Recent Logbook (5 terbaru)
 *  - Quick actions (link ke surat/logbook)
 *  - Search filter untuk recent lists
 *  - Refresh dengan loading state
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('dashboard_member', function() {
    'use strict';

    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'member') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__dashboardMemberLoaded) {
        console.log('[dashboard_member] Sudah di-init, skip.');
        return;
    }
    window.__dashboardMemberLoaded = true;

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const skeleton    = document.getElementById('member-skeleton');
    const content     = document.getElementById('member-dashboard-content');
    const refreshBtn  = document.getElementById('refresh-member-btn');

    if (!content) {
        console.error('[dashboard_member] Elemen #member-dashboard-content tidak ditemukan.');
        return;
    }

    // ================================================================
    // 4. HELPER FUNCTIONS
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function formatDateTime(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
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
        if (diff < 2592000) return Math.floor(diff / 86400) + ' hari lalu';
        return formatDate(d);
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function getUserName() {
        return user.nama || user.name || user.username || 'Anggota';
    }

    function getInitials(name) {
        if (!name || name === '-') return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 11) return { text: 'Selamat Pagi', icon: 'fa-sun', color: 'text-yellow-500' };
        if (hour < 15) return { text: 'Selamat Siang', icon: 'fa-cloud-sun', color: 'text-orange-500' };
        if (hour < 18) return { text: 'Selamat Sore', icon: 'fa-cloud-sun', color: 'text-orange-400' };
        return { text: 'Selamat Malam', icon: 'fa-moon', color: 'text-indigo-500' };
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let suratCache = [];
    let logbookCache = [];
    let filteredSurat = [];
    let filteredLogbook = [];
    let currentSearch = '';
    let isLoading = false;

    // ================================================================
    // 6. RENDER DEFAULT (instant paint)
    // ================================================================
    function renderDefault() {
        if (skeleton) skeleton.classList.add('hidden');
        content.classList.remove('hidden');
        content.style.display = 'block';

        if (!content.innerHTML.trim()) {
            content.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-spinner fa-spin text-3xl text-[var(--text-main)]"></i>
                    <p class="text-[var(--text-muted)] mt-3">Memuat dashboard...</p>
                </div>
            `;
        }
    }

    // ================================================================
    // 7. RENDER DASHBOARD
    // ================================================================
    function renderDashboard() {
        const greeting = getGreeting();
        const userName = getUserName();
        const totalSurat = suratCache.length;
        const totalLogbook = logbookCache.length;

        // Statistik bulan ini
        const now = new Date();
        const suratBulanIni = suratCache.filter(s => {
            const d = new Date(s.tanggal || s.created_at);
            return !isNaN(d.getTime()) &&
                   d.getMonth() === now.getMonth() &&
                   d.getFullYear() === now.getFullYear();
        }).length;

        const logbookBulanIni = logbookCache.filter(l => {
            const d = new Date(l.tanggal_mulai || l.created_at);
            return !isNaN(d.getTime()) &&
                   d.getMonth() === now.getMonth() &&
                   d.getFullYear() === now.getFullYear();
        }).length;

        // Current time
        const timeStr = now.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        // Build HTML
        content.innerHTML = `
            <!-- HEADER GREETING -->
            <div class="mb-6 flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 class="text-2xl sm:text-3xl font-bold text-[var(--text-main)] font-amiri">
                        <i class="fas ${greeting.icon} ${greeting.color} mr-2"></i>
                        ${escapeHtml(greeting.text)}, ${escapeHtml(userName.split(' ')[0])}!
                    </h1>
                    <p class="text-sm text-[var(--text-muted)] mt-1">
                        <i class="far fa-calendar-alt mr-1"></i>${escapeHtml(timeStr)}
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-stats)] border border-[var(--card-border)]">
                        <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white text-xs font-bold">
                            ${escapeHtml(getInitials(userName))}
                        </span>
                        <div class="text-xs">
                            <p class="font-medium text-[var(--text-main)]">${escapeHtml(userName)}</p>
                            <p class="text-[var(--text-muted)]">${escapeHtml(user.role || 'Member')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- QUICK ACTIONS -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <a href="/surat_member" class="quick-action group">
                    <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:-translate-y-0.5">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white flex-shrink-0 group-hover:scale-110 transition-transform">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-sm text-[var(--text-main)]">Buat Surat</p>
                            <p class="text-xs text-[var(--text-muted)] truncate">Kelola surat saya</p>
                        </div>
                    </div>
                </a>
                <a href="/logbook_member" class="quick-action group">
                    <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-green-400 dark:hover:border-green-500 transition-all hover:-translate-y-0.5">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white flex-shrink-0 group-hover:scale-110 transition-transform">
                            <i class="fas fa-book"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-sm text-[var(--text-main)]">Logbook</p>
                            <p class="text-xs text-[var(--text-muted)] truncate">Catat kegiatan</p>
                        </div>
                    </div>
                </a>
                <a href="/" class="quick-action group">
                    <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-purple-400 dark:hover:border-purple-500 transition-all hover:-translate-y-0.5">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white flex-shrink-0 group-hover:scale-110 transition-transform">
                            <i class="fas fa-home"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-sm text-[var(--text-main)]">Beranda</p>
                            <p class="text-xs text-[var(--text-muted)] truncate">Portal publik</p>
                        </div>
                    </div>
                </a>
                <button type="button" id="member-logout-btn" class="quick-action group text-left w-full">
                    <div class="flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-red-400 dark:hover:border-red-500 transition-all hover:-translate-y-0.5">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white flex-shrink-0 group-hover:scale-110 transition-transform">
                            <i class="fas fa-sign-out-alt"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-sm text-[var(--text-main)]">Logout</p>
                            <p class="text-xs text-[var(--text-muted)] truncate">Keluar dari akun</p>
                        </div>
                    </div>
                </button>
            </div>

            <!-- STATS 4 KARTU -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="premium-card p-4 rounded-xl border border-[var(--card-border)]">
                    <div class="flex items-center justify-between mb-2">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        ${suratBulanIni > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">+${suratBulanIni} bulan ini</span>` : ''}
                    </div>
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Surat Saya</p>
                    <p class="text-3xl font-bold text-[var(--text-main)] mt-1">${totalSurat}</p>
                </div>

                <div class="premium-card p-4 rounded-xl border border-[var(--card-border)]">
                    <div class="flex items-center justify-between mb-2">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                            <i class="fas fa-book"></i>
                        </div>
                        ${logbookBulanIni > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">+${logbookBulanIni} bulan ini</span>` : ''}
                    </div>
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Logbook Saya</p>
                    <p class="text-3xl font-bold text-[var(--text-main)] mt-1">${totalLogbook}</p>
                </div>

                <div class="premium-card p-4 rounded-xl border border-[var(--card-border)]">
                    <div class="flex items-center justify-between mb-2">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                            <i class="fas fa-calendar-check"></i>
                        </div>
                    </div>
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Bulan Ini</p>
                    <p class="text-3xl font-bold text-[var(--text-main)] mt-1">${suratBulanIni + logbookBulanIni}</p>
                </div>

                <div class="premium-card p-4 rounded-xl border border-[var(--card-border)]">
                    <div class="flex items-center justify-between mb-2">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
                            <i class="fas fa-user-check"></i>
                        </div>
                        <span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-semibold">
                            ${escapeHtml((user.status || 'approved').toUpperCase())}
                        </span>
                    </div>
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Status Akun</p>
                    <p class="text-lg font-bold text-[var(--text-main)] mt-1">${escapeHtml(user.role === 'admin' ? 'Admin' : 'Member')}</p>
                </div>
            </div>

            <!-- RECENT SECTIONS -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Recent Surat -->
                <div class="bg-[var(--card-bg)] backdrop-blur-sm rounded-2xl shadow-lg border border-[var(--card-border)] p-5">
                    <div class="flex justify-between items-center mb-4 pb-3 border-b border-[var(--card-border)]">
                        <h2 class="text-lg font-bold text-[var(--text-main)] font-amiri flex items-center gap-2">
                            <i class="fas fa-file-alt text-blue-600"></i>
                            Surat Terbaru
                        </h2>
                        <a href="/surat_member" class="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                            Lihat semua →
                        </a>
                    </div>
                    <div id="recent-surat-member" class="space-y-2">
                        ${renderRecentSuratHtml()}
                    </div>
                </div>

                <!-- Recent Logbook -->
                <div class="bg-[var(--card-bg)] backdrop-blur-sm rounded-2xl shadow-lg border border-[var(--card-border)] p-5">
                    <div class="flex justify-between items-center mb-4 pb-3 border-b border-[var(--card-border)]">
                        <h2 class="text-lg font-bold text-[var(--text-main)] font-amiri flex items-center gap-2">
                            <i class="fas fa-book text-green-600"></i>
                            Logbook Terbaru
                        </h2>
                        <a href="/logbook_member" class="text-xs text-green-600 dark:text-green-400 hover:underline">
                            Lihat semua →
                        </a>
                    </div>
                    <div id="recent-logbook-member" class="space-y-2">
                        ${renderRecentLogbookHtml()}
                    </div>
                </div>
            </div>
        `;

        // Attach logout button
        const logoutBtn = document.getElementById('member-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                showConfirm('Logout dari akun ini?', () => {
                    window.logout();
                });
            });
        }

        // Animate numbers (opsional)
        animateNumbers();

        // Update stats dari ID lama (jika ada di view lama)
        updateLegacyIds();
    }

    function renderRecentSuratHtml() {
        if (!filteredSurat || filteredSurat.length === 0) {
            if (currentSearch) {
                return '<p class="text-center text-[var(--text-muted)] py-6 text-sm"><i class="fas fa-search mr-1"></i>Tidak ada surat yang cocok dengan pencarian.</p>';
            }
            return `
                <div class="text-center py-8">
                    <i class="fas fa-file-alt text-3xl text-[var(--text-muted)] mb-2 opacity-40"></i>
                    <p class="text-[var(--text-muted)] text-sm">Belum ada surat</p>
                    <a href="/surat_member" class="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
                        <i class="fas fa-plus mr-1"></i>Buat surat baru
                    </a>
                </div>
            `;
        }

        const items = filteredSurat.slice(0, 5);
        return items.map(s => {
            const perihal = s.perihal || '-';
            const nomor = s.nomor_surat || '-';
            const tanggal = s.tanggal ? formatDate(s.tanggal) : '-';
            const waktu = s.created_at ? timeAgo(s.created_at) : tanggal;

            return `
                <a href="/surat_preview?id=${encodeURIComponent(s.id)}"
                   class="block p-3 rounded-lg hover:bg-[var(--bg-stats)] transition-colors group border border-transparent hover:border-[var(--card-border)]">
                    <div class="flex items-start gap-3">
                        <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <i class="fas fa-file-alt text-blue-600 dark:text-blue-400 text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-medium text-sm text-[var(--text-main)] line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                ${escapeHtml(perihal)}
                            </p>
                            <p class="text-xs text-[var(--text-muted)] mt-0.5 font-mono line-clamp-1">
                                ${escapeHtml(nomor)}
                            </p>
                            <div class="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-1">
                                <span><i class="far fa-clock mr-1"></i>${escapeHtml(waktu)}</span>
                            </div>
                        </div>
                        <i class="fas fa-chevron-right text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity mt-2"></i>
                    </div>
                </a>
            `;
        }).join('');
    }

    function renderRecentLogbookHtml() {
        if (!filteredLogbook || filteredLogbook.length === 0) {
            if (currentSearch) {
                return '<p class="text-center text-[var(--text-muted)] py-6 text-sm"><i class="fas fa-search mr-1"></i>Tidak ada logbook yang cocok dengan pencarian.</p>';
            }
            return `
                <div class="text-center py-8">
                    <i class="fas fa-book text-3xl text-[var(--text-muted)] mb-2 opacity-40"></i>
                    <p class="text-[var(--text-muted)] text-sm">Belum ada logbook</p>
                    <a href="/logbook_member" class="text-xs text-green-600 dark:text-green-400 hover:underline mt-2 inline-block">
                        <i class="fas fa-plus mr-1"></i>Catat kegiatan baru
                    </a>
                </div>
            `;
        }

        const items = filteredLogbook.slice(0, 5);
        return items.map(l => {
            const kegiatan = l.kegiatan || '-';
            const tempat = l.tempat || '-';
            const tanggal = l.tanggal_mulai ? formatDate(l.tanggal_mulai) : '-';
            const waktu = l.created_at ? timeAgo(l.created_at) : tanggal;
            const status = l.status || 'draft';

            const statusBadge = status === 'final'
                ? '<span class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Final</span>'
                : '<span class="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Draft</span>';

            return `
                <div class="block p-3 rounded-lg hover:bg-[var(--bg-stats)] transition-colors border border-transparent hover:border-[var(--card-border)]">
                    <div class="flex items-start gap-3">
                        <div class="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <i class="fas fa-book text-green-600 dark:text-green-400 text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-start justify-between gap-2">
                                <p class="font-medium text-sm text-[var(--text-main)] line-clamp-1 flex-1">
                                    ${escapeHtml(kegiatan)}
                                </p>
                                ${statusBadge}
                            </div>
                            <p class="text-xs text-[var(--text-muted)] mt-0.5">
                                <i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(tempat)}
                            </p>
                            <div class="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-1">
                                <span><i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateLegacyIds() {
        // Update stats dari view lama
        const totalSurat = document.getElementById('total-surat-saya');
        const totalLpj = document.getElementById('total-lpj-saya');
        const userRole = document.getElementById('user-role-here');

        if (totalSurat) totalSurat.textContent = suratCache.length;
        if (totalLpj) totalLpj.textContent = logbookCache.length;
        if (userRole) userRole.textContent = (user.role || 'member').toUpperCase();
    }

    // ================================================================
    // 8. ANIMATE NUMBERS
    // ================================================================
    function animateNumbers() {
        const els = content.querySelectorAll('.text-3xl.font-bold');
        els.forEach(el => {
            const target = parseInt(el.textContent, 10);
            if (isNaN(target) || target === 0) return;

            const duration = 600;
            const startTime = performance.now();

            function step(now) {
                const progress = Math.min((now - startTime) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(target * eased);
                el.textContent = current;
                if (progress < 1) requestAnimationFrame(step);
            }
            el.textContent = '0';
            requestAnimationFrame(step);
        });
    }

    // ================================================================
    // 9. APPLY SEARCH FILTER
    // ================================================================
    function applySearch() {
        if (!currentSearch) {
            filteredSurat = suratCache;
            filteredLogbook = logbookCache;
        } else {
            const q = currentSearch.toLowerCase();
            filteredSurat = suratCache.filter(s =>
                [s.perihal, s.nomor_surat, s.pengirim, s.penerima]
                    .map(v => String(v || '').toLowerCase()).join(' ').includes(q)
            );
            filteredLogbook = logbookCache.filter(l =>
                [l.kegiatan, l.tempat, stripHtml(l.deskripsi)]
                    .map(v => String(v || '').toLowerCase()).join(' ').includes(q)
            );
        }

        const suratEl = document.getElementById('recent-surat-member');
        const logbookEl = document.getElementById('recent-logbook-member');
        if (suratEl) suratEl.innerHTML = renderRecentSuratHtml();
        if (logbookEl) logbookEl.innerHTML = renderRecentLogbookHtml();
    }

    // ================================================================
    // 10. LOAD DATA (SWR)
    // ================================================================
    async function loadDashboard(force) {
        force = force || false;
        if (isLoading) return;
        isLoading = true;

        // Jika ada cache, tampilkan dulu
        if (!force && (suratCache.length > 0 || logbookCache.length > 0)) {
            renderDashboard();
            fetchBackground();
            isLoading = false;
            return;
        }

        // Loading state
        if (skeleton) skeleton.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const [suratRes, logbookRes] = await Promise.allSettled([
                forceRefreshData('getSurat', {}),
                forceRefreshData('getLogbook', {})
            ]);

            suratCache = (suratRes.status === 'fulfilled' && suratRes.value &&
                         suratRes.value.success && Array.isArray(suratRes.value.data))
                ? suratRes.value.data : [];

            logbookCache = (logbookRes.status === 'fulfilled' && logbookRes.value &&
                           logbookRes.value.success && Array.isArray(logbookRes.value.data))
                ? logbookRes.value.data : [];

            // Sort descending
            suratCache.sort((a, b) =>
                new Date(b.created_at || b.tanggal || 0) -
                new Date(a.created_at || a.tanggal || 0)
            );
            logbookCache.sort((a, b) =>
                new Date(b.created_at || b.tanggal_mulai || 0) -
                new Date(a.created_at || a.tanggal_mulai || 0)
            );

            filteredSurat = suratCache;
            filteredLogbook = logbookCache;

            renderDashboard();
        } catch (error) {
            console.error('[dashboard_member] Load error:', error);
            content.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-3"></i>
                    <p class="text-red-500 font-medium mb-4">Gagal memuat dashboard.</p>
                    <button onclick="location.reload()" class="btn-primary px-6 py-2 rounded-lg">
                        <i class="fas fa-sync-alt mr-1"></i>Coba Lagi
                    </button>
                </div>
            `;
        } finally {
            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');
            isLoading = false;
        }
    }

    async function fetchBackground() {
        try {
            const [suratRes, logbookRes] = await Promise.allSettled([
                forceRefreshData('getSurat', {}),
                forceRefreshData('getLogbook', {})
            ]);

            if (suratRes.status === 'fulfilled' && suratRes.value &&
                suratRes.value.success && Array.isArray(suratRes.value.data)) {
                suratCache = suratRes.value.data.sort((a, b) =>
                    new Date(b.created_at || b.tanggal || 0) -
                    new Date(a.created_at || a.tanggal || 0)
                );
            }
            if (logbookRes.status === 'fulfilled' && logbookRes.value &&
                logbookRes.value.success && Array.isArray(logbookRes.value.data)) {
                logbookCache = logbookRes.value.data.sort((a, b) =>
                    new Date(b.created_at || b.tanggal_mulai || 0) -
                    new Date(a.created_at || a.tanggal_mulai || 0)
                );
            }

            filteredSurat = suratCache;
            filteredLogbook = logbookCache;
            renderDashboard();
        } catch (e) {
            console.warn('[dashboard_member] BG refresh gagal:', e);
        }
    }

    // ================================================================
    // 11. REFRESH BUTTON
    // ================================================================
    if (refreshBtn) {
        const fresh = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
        fresh.addEventListener('click', async function() {
            const original = this.innerHTML;
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';

            suratCache = [];
            logbookCache = [];

            try {
                await loadDashboard(true);
                showToast('Dashboard berhasil diperbarui!', 'success');
            } finally {
                this.disabled = false;
                this.innerHTML = original;
            }
        });
    }

    // ================================================================
    // 12. INIT
    // ================================================================
    console.log('[dashboard_member] Init dimulai untuk:', getUserName());

    renderDefault();
    loadDashboard();
});