/**
 * js/ringkasan.js
 * Modul Ringkasan Data - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - getLpj → getLogbook (endpoint deprecated)
 *  - Link /lpj_admin → /logbook_admin
 *  - Link /lpj_report → /logbook_report
 *  - Guard anti-duplikasi
 *  - XSS protection di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - Per-section error handling (Promise.allSettled)
 *  - Copy + Export CSV per modul
 *
 * FEATURES:
 *  - Preview 11 modul dalam kartu ringkasan
 *  - Stats per modul (count badge)
 *  - Filter pencarian global antar modul
 *  - Copy data per modul
 *  - Export CSV per modul
 *  - Link "Buka Modul" per kartu
 *  - Summary overview (total data per kategori)
 *  - Loading/error/empty state proper
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('ringkasan', function() {
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
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__ringkasanLoaded) {
        console.log('[ringkasan] Sudah di-init, skip.');
        return;
    }
    window.__ringkasanLoaded = true;

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const container = document.getElementById('ringkasan-data');
    const refreshBtn = document.getElementById('refresh-btn');

    if (!container) {
        console.error('[ringkasan] Elemen #ringkasan-data tidak ditemukan.');
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

    function formatRupiah(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                document.body.removeChild(ta);
                reject(e);
            }
        });
    }

    function downloadCSV(headers, rows, filename) {
        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let dataCache = null;
    let isLoading = false;
    let searchQuery = '';

    // ================================================================
    // 6. ENSURE EXTRA UI (Filter Search + Summary Stats)
    // ================================================================
    function ensureExtraUI() {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;
        const header = mainContent.querySelector('.flex.flex-wrap.justify-between.items-center')
                    || mainContent.querySelector('.flex.justify-between.items-center');

        // ===== Summary Stats Overview =====
        if (!document.getElementById('ringkasan-overview')) {
            const overview = document.createElement('div');
            overview.id = 'ringkasan-overview';
            overview.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
            overview.innerHTML = `
                <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Modul</p>
                            <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="overview-total-modul">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-th-large"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Data</p>
                            <p class="text-2xl font-bold text-green-600 mt-1" id="overview-total-data">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                            <i class="fas fa-database"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Modul Aktif</p>
                            <p class="text-2xl font-bold text-purple-600 mt-1" id="overview-modul-aktif">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                            <i class="fas fa-check-circle"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Modul Kosong</p>
                            <p class="text-2xl font-bold text-yellow-600 mt-1" id="overview-modul-kosong">0</p>
                        </div>
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                    </div>
                </div>
            `;

            // Sisipkan setelah header
            if (header && header.parentNode) {
                header.parentNode.insertBefore(overview, header.nextSibling);
            }
        }

        // ===== Search Bar =====
        if (!document.getElementById('ringkasan-search-wrap')) {
            const wrapper = document.createElement('div');
            wrapper.id = 'ringkasan-search-wrap';
            wrapper.className = 'mb-6';
            wrapper.innerHTML = `
                <div class="relative">
                    <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"></i>
                    <input type="text" id="ringkasan-search"
                        placeholder="Cari di semua modul (nama surat, kegiatan, transaksi...)..."
                        class="w-full pl-11 pr-4 py-3 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition shadow-sm">
                </div>
            `;

            const overviewEl = document.getElementById('ringkasan-overview');
            if (overviewEl && overviewEl.parentNode) {
                overviewEl.parentNode.insertBefore(wrapper, overviewEl.nextSibling);
            }

            const searchInput = document.getElementById('ringkasan-search');
            if (searchInput) {
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'ringkasan-search', () => {
                        searchQuery = (searchInput.value || '').toLowerCase().trim();
                        if (dataCache) renderData(dataCache);
                    }, 250));
            }
        }
    }

    // ================================================================
    // 7. LOAD ALL DATA (Promise.allSettled)
    // ================================================================
    async function loadAll(force) {
        force = force || false;

        if (isLoading) return;
        isLoading = true;

        // Loading state
        container.innerHTML = `
            <div class="loading-spinner text-center py-12">
                <i class="fas fa-spinner fa-spin text-4xl text-[var(--text-main)]"></i>
                <p class="text-[var(--text-muted)] mt-4">Memuat ringkasan...</p>
            </div>
        `;

        try {
            // ===== KEY FIX: getLogbook, bukan getLpj =====
            const results = await Promise.allSettled([
                apiCall('getSurat', 'POST', {}),          // 0
                apiCall('getLogbook', 'POST', {}),        // 1 ← FIX: was getLpj
                apiCall('getKeuangan', 'POST', {}),       // 2
                apiCall('getInventaris', 'POST', {}),     // 3
                apiCall('getGaleri', 'POST', {}),         // 4
                apiCall('getProgramKerja', 'POST', {}),   // 5
                apiCall('getForumTopics', 'POST', {}),    // 6
                apiCall('getUsers', 'POST', {}),          // 7
                apiCall('getTokoh', 'POST', {}),          // 8
                apiCall('getAbsensi', 'POST', {}),        // 9
                apiCall('getStruktur', 'POST', {})        // 10
            ]);

            const getData = (r) => {
                if (r.status !== 'fulfilled') return [];
                return (r.value && r.value.success && Array.isArray(r.value.data))
                    ? r.value.data : [];
            };

            const data = {
                surat: getData(results[0]),
                logbook: getData(results[1]),
                keuangan: getData(results[2]),
                inventaris: getData(results[3]),
                galeri: getData(results[4]),
                proker: getData(results[5]),
                forum: getData(results[6]),
                users: getData(results[7]),
                tokoh: getData(results[8]),
                absensi: getData(results[9]),
                struktur: getData(results[10])
            };

            dataCache = data;

            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failCount = results.length - successCount;

            if (failCount > 0) {
                console.warn('[ringkasan] ' + failCount + ' modul gagal dimuat');
            }

            renderData(data);
            updateOverview(data);

        } catch (error) {
            console.error('[ringkasan] Load error:', error);
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-3"></i>
                    <p class="text-red-500 font-medium mb-4">Gagal memuat ringkasan.</p>
                    <p class="text-[var(--text-muted)] text-sm mb-4">${escapeHtml(error.message)}</p>
                    <button onclick="location.reload()" class="btn-primary px-6 py-2 rounded-lg">
                        <i class="fas fa-sync-alt mr-1"></i>Coba Lagi
                    </button>
                </div>
            `;
        } finally {
            isLoading = false;
        }
    }

    // ================================================================
    // 8. UPDATE OVERVIEW STATS
    // ================================================================
    function updateOverview(data) {
        const modules = Object.keys(data);
        const totalModul = modules.length;
        const totalData = modules.reduce((sum, key) => sum + (data[key] || []).length, 0);
        const modulAktif = modules.filter(key => (data[key] || []).length > 0).length;
        const modulKosong = totalModul - modulAktif;

        const el1 = document.getElementById('overview-total-modul');
        const el2 = document.getElementById('overview-total-data');
        const el3 = document.getElementById('overview-modul-aktif');
        const el4 = document.getElementById('overview-modul-kosong');

        if (el1) el1.textContent = totalModul;
        if (el2) el2.textContent = totalData.toLocaleString('id-ID');
        if (el3) el3.textContent = modulAktif;
        if (el4) el4.textContent = modulKosong;
    }

    // ================================================================
    // 9. RENDER DATA
    // ================================================================
    function renderData(data) {
        if (!container) return;

        const modules = [
            {
                key: 'surat',
                title: 'Surat',
                icon: 'fa-file-alt',
                color: 'green',
                headers: ['No', 'Nomor', 'Perihal', 'Tanggal', 'Pengirim', 'Penerima'],
                rows: (data.surat || []).map((s, i) => [
                    i + 1,
                    escapeHtml(s.nomor_surat || '-'),
                    escapeHtml(s.perihal || '-'),
                    formatDate(s.tanggal),
                    escapeHtml(s.pengirim || '-'),
                    escapeHtml(s.penerima || '-')
                ]),
                emptyMsg: 'Belum ada surat',
                linkTo: '/surat_admin'
            },
            {
                key: 'logbook',
                title: 'Logbook / Kegiatan',
                icon: 'fa-calendar-check',
                color: 'blue',
                headers: ['No', 'Kegiatan', 'Tanggal', 'Tempat', 'Peserta', 'Anggaran'],
                rows: (data.logbook || []).map((k, i) => [
                    i + 1,
                    escapeHtml(k.kegiatan || '-'),
                    formatDate(k.tanggal_mulai) + ' - ' + formatDate(k.tanggal_selesai),
                    escapeHtml(k.tempat || '-'),
                    k.peserta || 0,
                    formatRupiah(k.anggaran || 0)
                ]),
                emptyMsg: 'Belum ada logbook kegiatan',
                linkTo: '/logbook_admin'  // ← FIX: was /lpj_admin
            },
            {
                key: 'keuangan',
                title: 'Keuangan',
                icon: 'fa-coins',
                color: 'yellow',
                headers: ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan'],
                rows: (data.keuangan || []).map((t, i) => [
                    i + 1,
                    formatDate(t.tanggal),
                    escapeHtml(t.jenis || '-'),
                    escapeHtml(t.kategori || '-'),
                    formatRupiah(t.jumlah || 0),
                    escapeHtml(t.keterangan || '-')
                ]),
                emptyMsg: 'Belum ada transaksi keuangan',
                linkTo: '/keuangan_admin'
            },
            {
                key: 'inventaris',
                title: 'Inventaris',
                icon: 'fa-boxes',
                color: 'teal',
                headers: ['No', 'Barang', 'Jumlah', 'Kondisi', 'Lokasi'],
                rows: (data.inventaris || []).map((b, i) => [
                    i + 1,
                    escapeHtml(b.nama_barang || '-'),
                    b.jumlah || 0,
                    escapeHtml(b.kondisi || '-'),
                    escapeHtml(b.lokasi || '-')
                ]),
                emptyMsg: 'Belum ada inventaris',
                linkTo: '/inventaris_admin'
            },
            {
                key: 'galeri',
                title: 'Galeri',
                icon: 'fa-images',
                color: 'purple',
                headers: ['No', 'Judul', 'Tipe', 'Kategori', 'Tanggal'],
                rows: (data.galeri || []).map((g, i) => [
                    i + 1,
                    escapeHtml(g.judul || '-'),
                    escapeHtml(g.tipe || '-'),
                    escapeHtml(g.kategori || '-'),
                    formatDate(g.created_at)
                ]),
                emptyMsg: 'Belum ada media galeri',
                linkTo: '/galeri_admin'
            },
            {
                key: 'proker',
                title: 'Program Kerja',
                icon: 'fa-tasks',
                color: 'indigo',
                headers: ['No', 'Program', 'Status', 'Progress', 'PIC'],
                rows: (data.proker || []).map((p, i) => [
                    i + 1,
                    escapeHtml(p.nama_program || '-'),
                    escapeHtml(p.status || '-'),
                    (p.progress || 0) + '%',
                    escapeHtml(p.pic || '-')
                ]),
                emptyMsg: 'Belum ada program kerja',
                linkTo: '/proker_admin'
            },
            {
                key: 'forum',
                title: 'Forum Diskusi',
                icon: 'fa-comments',
                color: 'cyan',
                headers: ['No', 'Judul', 'Dibuat Oleh', 'Tanggal'],
                rows: (data.forum || []).map((f, i) => [
                    i + 1,
                    escapeHtml(f.judul || '-'),
                    escapeHtml(f.created_by || '-'),
                    formatDate(f.created_at)
                ]),
                emptyMsg: 'Belum ada topik forum',
                linkTo: '/forum_admin'
            },
            {
                key: 'users',
                title: 'Anggota',
                icon: 'fa-users',
                color: 'orange',
                headers: ['No', 'Nama', 'Username', 'Role', 'Status'],
                rows: (data.users || []).map((u, i) => [
                    i + 1,
                    escapeHtml(u.nama || u.name || '-'),
                    escapeHtml(u.username || u.email || '-'),
                    escapeHtml(u.role || '-'),
                    escapeHtml(u.status || 'approved')
                ]),
                emptyMsg: 'Belum ada anggota',
                linkTo: '/anggota_admin'
            },
            {
                key: 'tokoh',
                title: 'Tokoh',
                icon: 'fa-user-tie',
                color: 'pink',
                headers: ['No', 'Nama', 'Alamat', 'No HP'],
                rows: (data.tokoh || []).map((t, i) => [
                    i + 1,
                    escapeHtml(t.nama || '-'),
                    escapeHtml(t.alamat || '-'),
                    escapeHtml(t.no_hp || '-')
                ]),
                emptyMsg: 'Belum ada data tokoh',
                linkTo: '/tokoh_admin'
            },
            {
                key: 'absensi',
                title: 'Absensi',
                icon: 'fa-clipboard-check',
                color: 'red',
                headers: ['No', 'Nama', 'Alamat', 'Waktu'],
                rows: (data.absensi || []).map((a, i) => [
                    i + 1,
                    escapeHtml(a.nama || '-'),
                    escapeHtml(a.alamat || '-'),
                    formatDate(a.created_at)
                ]),
                emptyMsg: 'Belum ada data absensi',
                linkTo: '/absensi_admin'
            },
            {
                key: 'struktur',
                title: 'Struktur Organisasi',
                icon: 'fa-sitemap',
                color: 'slate',
                headers: ['No', 'Jabatan', 'Nama', 'Urutan'],
                rows: (data.struktur || []).map((s, i) => [
                    i + 1,
                    escapeHtml(s.jabatan || '-'),
                    escapeHtml(s.nama || '-'),
                    s.urutan || 0
                ]),
                emptyMsg: 'Belum ada data struktur',
                linkTo: '/profil_admin'
            }
        ];

        // Apply search filter
        let filteredModules = modules;
        if (searchQuery) {
            filteredModules = modules.map(m => {
                const filteredRows = m.rows.filter(row =>
                    row.some(cell => String(cell || '').toLowerCase().includes(searchQuery))
                );
                return Object.assign({}, m, {
                    rows: filteredRows,
                    _originalCount: m.rows.length
                });
            });
        }

        // Build HTML
        let html = '';
        let hasAnyResult = false;

        filteredModules.forEach(mod => {
            const count = mod.rows.length;
            const originalCount = mod._originalCount !== undefined ? mod._originalCount : count;

            // Skip jika search aktif & tidak ada hasil
            if (searchQuery && count === 0) return;

            hasAnyResult = true;

            html += renderCard(mod, count, originalCount);
        });

        if (!hasAnyResult && searchQuery) {
            html = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-search text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>
                    <p class="text-[var(--text-muted)]">Tidak ada data yang cocok dengan pencarian "<strong>${escapeHtml(searchQuery)}</strong>".</p>
                    <button onclick="document.getElementById('ringkasan-search').value=''; document.getElementById('ringkasan-search').dispatchEvent(new Event('input'));"
                        class="btn-primary mt-4 px-6 py-2 rounded-lg">
                        <i class="fas fa-times mr-1"></i>Reset Pencarian
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // ================================================================
    // 10. RENDER CARD PER MODUL
    // ================================================================
    function renderCard(mod, count, originalCount) {
        const isFiltered = searchQuery && count !== originalCount;
        const countLabel = isFiltered
            ? `${count} dari ${originalCount}`
            : count;

        const colorMap = {
            green: 'from-green-400 to-emerald-600',
            blue: 'from-blue-400 to-indigo-600',
            yellow: 'from-yellow-400 to-amber-600',
            teal: 'from-teal-400 to-cyan-600',
            purple: 'from-purple-400 to-fuchsia-600',
            indigo: 'from-indigo-400 to-violet-600',
            cyan: 'from-cyan-400 to-sky-600',
            orange: 'from-orange-400 to-red-600',
            pink: 'from-pink-400 to-rose-600',
            red: 'from-red-400 to-rose-600',
            slate: 'from-slate-400 to-gray-600'
        };
        const gradClass = colorMap[mod.color] || colorMap.slate;

        let tableHtml = '';
        if (count > 0) {
            const displayRows = mod.rows.slice(0, 20);
            const hasMore = mod.rows.length > 20;

            tableHtml = `
                <div class="overflow-x-auto rounded-lg border border-[var(--card-border)]">
                    <table class="w-full text-sm">
                        <thead class="bg-[var(--bg-stats)]">
                            <tr>
                                ${mod.headers.map(h => `
                                    <th class="px-3 py-2 text-left text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">
                                        ${escapeHtml(h)}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--card-border)]">
                            ${displayRows.map(row => `
                                <tr class="hover:bg-[var(--bg-stats)] transition">
                                    ${row.map(cell => `
                                        <td class="px-3 py-2 text-[var(--text-main)] whitespace-nowrap max-w-[200px] truncate">
                                            ${cell}
                                        </td>
                                    `).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${hasMore ? `
                    <p class="text-xs text-[var(--text-muted)] mt-2 text-center">
                        Menampilkan 20 dari ${mod.rows.length} data
                    </p>
                ` : ''}
            `;
        } else {
            tableHtml = `
                <div class="text-center py-6 text-[var(--text-muted)]">
                    <i class="fas ${mod.icon} text-3xl mb-2 opacity-30"></i>
                    <p class="text-sm">${escapeHtml(mod.emptyMsg)}</p>
                </div>
            `;
        }

        return `
            <div class="preview-card bg-[var(--card-bg)] backdrop-blur-sm rounded-2xl border border-[var(--card-border)] shadow-md hover:shadow-lg transition-all p-5">
                <!-- Header Card -->
                <div class="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-[var(--card-border)]">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br ${gradClass} flex items-center justify-center text-white flex-shrink-0">
                            <i class="fas ${mod.icon}"></i>
                        </div>
                        <div class="min-w-0">
                            <h3 class="text-base font-bold text-[var(--text-main)] font-amiri truncate">
                                ${escapeHtml(mod.title)}
                            </h3>
                            <span class="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] mt-0.5">
                                <i class="fas fa-database"></i>
                                <span class="font-semibold">${countLabel}</span> data
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                        <button type="button" onclick="exportRingkasanModul('${mod.key}')"
                            class="w-8 h-8 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center transition"
                            title="Export CSV">
                            <i class="fas fa-download text-xs"></i>
                        </button>
                        <button type="button" onclick="copyRingkasanModul('${mod.key}')"
                            class="w-8 h-8 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center transition"
                            title="Copy data">
                            <i class="fas fa-copy text-xs"></i>
                        </button>
                        <a href="${mod.linkTo}"
                            class="w-8 h-8 rounded-lg bg-[var(--text-main)] text-[var(--text-inverse)] flex items-center justify-center transition hover:opacity-90"
                            title="Buka Modul">
                            <i class="fas fa-external-link-alt text-xs"></i>
                        </a>
                    </div>
                </div>

                <!-- Body Card -->
                ${tableHtml}

                <!-- Footer Link -->
                ${count > 0 ? `
                    <div class="mt-3 pt-3 border-t border-[var(--card-border)] text-right">
                        <a href="${mod.linkTo}"
                            class="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-main)] hover:gap-2 transition-all">
                            Buka modul lengkap <i class="fas fa-arrow-right text-[10px]"></i>
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ================================================================
    // 11. EXPORT MODUL (global)
    // ================================================================
    window.exportRingkasanModul = function(key) {
        if (!dataCache || !dataCache[key]) {
            showToast('Data tidak tersedia.', 'warning');
            return;
        }

        const data = dataCache[key];
        if (data.length === 0) {
            showToast('Tidak ada data untuk diekspor.', 'warning');
            return;
        }

        // Build headers from first object keys
        const firstItem = data[0];
        const headers = Object.keys(firstItem).filter(k => !k.startsWith('_'));

        // Build rows
        const rows = data.map(item => headers.map(h => {
            const val = item[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        }));

        downloadCSV(headers, rows, 'ringkasan_' + key);
        showToast('✅ CSV ' + key + ' berhasil diunduh!', 'success');
    };

    // ================================================================
    // 12. COPY MODUL (global)
    // ================================================================
    window.copyRingkasanModul = function(key) {
        if (!dataCache || !dataCache[key]) {
            showToast('Data tidak tersedia.', 'warning');
            return;
        }

        const data = dataCache[key];
        if (data.length === 0) {
            showToast('Tidak ada data untuk dicopy.', 'warning');
            return;
        }

        // Build text representation
        const firstItem = data[0];
        const headers = Object.keys(firstItem).filter(k => !k.startsWith('_'));
        const headerLine = headers.join('\t');

        const dataLines = data.map(item =>
            headers.map(h => {
                const val = item[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val);
                return String(val);
            }).join('\t')
        );

        const text = 'MODUL: ' + key.toUpperCase() + '\n' +
                     'Total: ' + data.length + ' data\n' +
                     '━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
                     headerLine + '\n' +
                     '─'.repeat(40) + '\n' +
                     dataLines.join('\n');

        copyToClipboard(text)
            .then(() => showToast('✅ ' + data.length + ' data ' + key + ' dicopy!', 'success'))
            .catch(() => showToast('Gagal copy data', 'error'));
    };

    // ================================================================
    // 13. REFRESH BUTTON
    // ================================================================
    if (refreshBtn) {
        const fresh = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
        fresh.addEventListener('click', async function() {
            const original = this.innerHTML;
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';

            dataCache = null;
            searchQuery = '';
            const searchInput = document.getElementById('ringkasan-search');
            if (searchInput) searchInput.value = '';

            try {
                await loadAll(true);
                showToast('Ringkasan diperbarui!', 'success');
            } finally {
                this.disabled = false;
                this.innerHTML = original;
            }
        });
    }

    // ================================================================
    // 14. CLEANUP
    // ================================================================
    function cleanup() {
        window.__ringkasanLoaded = false;
    }
    window.__ringkasanCleanup = cleanup;

    // ================================================================
    // 15. INIT
    // ================================================================
    console.log('[ringkasan] Init dimulai');

    ensureExtraUI();
    loadAll();
});