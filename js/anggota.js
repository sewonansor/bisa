/**
 * js/anggota.js
 * Modul Halaman Daftar Anggota Publik - FULL FIX v11.1.0
 * ---------------------------------------------------------
 * CHANGELOG v11.1.0:
 *  - ✅ FIX: Filter kalurahan (Panggungharjo, Bangunharjo, Pendowoharjo, Timbulharjo)
 *  - ✅ FIX: Anggota baru hasil approve otomatis masuk sesuai kalurahan
 *  - ✅ FIX: Group by kalurahan toggle
 *  - ✅ FIX: XSS protection + clone-replace
 *  - ✅ FIX: Dark mode aware
 *  - ✅ FIX: Null-safe semua DOM elements
 *  - ✅ FIX: Stats 3 kartu (total, admin, member)
 *  - ✅ FIX: Search real-time (nama, alamat, kalurahan)
 *  - ✅ FIX: Filter role (admin/member)
 *  - ✅ FIX: Sort by name ascending
 *  - ✅ FIX: Only approved/active members shown
 *  - ✅ FIX: Empty state + error state
 *  - ✅ FIX: Avatar dengan initials fallback
 * ---------------------------------------------------------
 */

App.register('anggota', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__anggotaLoaded) return;
    window.__anggotaLoaded = true;

    console.log('[anggota] 🚀 Init v11.1.0');

    // ===== DOM =====
    const skeleton = document.getElementById('anggota-skeleton');
    const content  = document.getElementById('anggota-content');
    if (!content) { console.error('[anggota] Container tidak ditemukan.'); return; }

    // ===== STATE =====
    let dataCache = [];
    let searchQuery = '';
    let currentFilter = 'all';
    let currentKalurahan = 'all';
    let groupByKalurahan = false;

    const KALURAHAN_LIST = [
        'Panggungharjo',
        'Bangunharjo',
        'Pendowoharjo',
        'Timbulharjo'
    ];

    // ===== HELPERS =====
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getInitials(name) {
        if (!name || name === '-') return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function getAvatarColor(str) {
        const colors = [
            'from-blue-400 to-blue-600',
            'from-green-400 to-emerald-600',
            'from-purple-400 to-fuchsia-600',
            'from-pink-400 to-rose-600',
            'from-indigo-400 to-violet-600',
            'from-teal-400 to-cyan-600'
        ];
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash = hash & hash;
        }
        return colors[Math.abs(hash) % colors.length];
    }

    function getKalurahan(u) {
        return String(u.kalurahan || u.alamat || u.address || '').trim();
    }

    // ===== ENSURE EXTRA UI =====
    function ensureExtraUI() {
        const wrapper = content.closest('section') || content.parentElement;
        if (!wrapper) return;

        // Stats 3 kartu
        if (!document.getElementById('anggota-stats')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'anggota-stats';
            statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-6xl mx-auto mb-6';
            statsDiv.innerHTML = `
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Anggota</p>
                            <p class="text-3xl font-bold text-[var(--text-main)] mt-1" id="stats-total-anggota-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-users text-lg"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Admin</p>
                            <p class="text-3xl font-bold text-red-600 mt-1" id="stats-admin-anggota-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white">
                            <i class="fas fa-shield-alt text-lg"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Member</p>
                            <p class="text-3xl font-bold text-blue-600 mt-1" id="stats-member-anggota-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center text-white">
                            <i class="fas fa-user text-lg"></i>
                        </div>
                    </div>
                </div>
            `;
            wrapper.insertBefore(statsDiv, content);
        }

        // Search + Filter (dengan kalurahan)
        if (!document.getElementById('anggota-search-wrap')) {
            const searchWrap = document.createElement('div');
            searchWrap.id = 'anggota-search-wrap';
            searchWrap.className = 'flex flex-wrap gap-2 max-w-6xl mx-auto mb-6';
            searchWrap.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="anggota-search-pub" placeholder="Cari nama, alamat, kalurahan..."
                        class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                </div>
                <select id="anggota-filter-kalurahan" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm">
                    <option value="all">Semua Kalurahan</option>
                    ${KALURAHAN_LIST.map(k => `<option value="${k}">${k}</option>`).join('')}
                </select>
                <select id="anggota-filter-pub" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm">
                    <option value="all">Semua Role</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                </select>
                <button id="anggota-group-btn" type="button"
                    class="px-3 py-2.5 rounded-xl bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition"
                    title="Group by Kalurahan">
                    <i class="fas fa-layer-group mr-1"></i>Group
                </button>
            `;

            const statsDiv = document.getElementById('anggota-stats');
            if (statsDiv && statsDiv.parentNode) {
                statsDiv.parentNode.insertBefore(searchWrap, statsDiv.nextSibling);
            }

            const searchInput = document.getElementById('anggota-search-pub');
            const filterKalurahan = document.getElementById('anggota-filter-kalurahan');
            const filterSelect = document.getElementById('anggota-filter-pub');
            const groupBtn = document.getElementById('anggota-group-btn');

            if (searchInput) {
                searchInput.addEventListener('input', debounceEvent.bind(null, 'anggota-search', () => {
                    searchQuery = (searchInput.value || '').toLowerCase().trim();
                    applyFilter();
                }, 250));
            }

            if (filterKalurahan) {
                filterKalurahan.addEventListener('change', function() {
                    currentKalurahan = this.value;
                    applyFilter();
                });
            }

            if (filterSelect) {
                filterSelect.addEventListener('change', function() {
                    currentFilter = this.value;
                    applyFilter();
                });
            }

            if (groupBtn) {
                groupBtn.addEventListener('click', function() {
                    groupByKalurahan = !groupByKalurahan;
                    this.classList.toggle('bg-[var(--text-main)]', groupByKalurahan);
                    this.classList.toggle('text-[var(--text-inverse)]', groupByKalurahan);
                    applyFilter();
                });
            }
        }
    }

    // ===== LOAD DATA =====
    async function loadAnggota() {
        if (skeleton) skeleton.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const result = await apiCall('getUsers', 'POST', { _t: Date.now() });

            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');

            if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                dataCache = result.data.filter(u => {
                    const status = String(u.status || '').toLowerCase().trim();
                    return status === 'approved' || status === 'active' || status === '';
                });
                dataCache.sort((a, b) =>
                    String(a.nama || a.name || '').localeCompare(String(b.nama || b.name || '')));
                applyFilter();
            } else {
                content.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-users text-4xl mb-3 opacity-40"></i>
                        <p>Belum ada anggota terdaftar.</p>
                    </div>
                `;
            }
        } catch (error) {
            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');
            console.error('[anggota] Load error:', error);
            content.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Error: ${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    // ===== APPLY FILTER =====
    function applyFilter() {
        let filtered = dataCache;

        if (currentFilter !== 'all') {
            filtered = filtered.filter(u => (u.role || 'member') === currentFilter);
        }

        if (currentKalurahan !== 'all') {
            filtered = filtered.filter(u => {
                const k = getKalurahan(u).toLowerCase();
                return k === currentKalurahan.toLowerCase();
            });
        }

        if (searchQuery) {
            filtered = filtered.filter(u => {
                const haystack = [
                    u.nama, u.name, u.username, u.email,
                    u.alamat, u.address, u.angkatan, u.riwayat_jabatan, u.kalurahan
                ].map(v => String(v || '').toLowerCase()).join(' ');
                return haystack.includes(searchQuery);
            });
        }

        if (groupByKalurahan) {
            renderGroupedByKalurahan(filtered);
        } else {
            renderAnggota(filtered);
        }
        updateStats();
    }

    // ===== STATS =====
    function updateStats() {
        const total = dataCache.length;
        const admin = dataCache.filter(u => (u.role || 'member') === 'admin').length;
        const member = total - admin;

        const el1 = document.getElementById('stats-total-anggota-pub');
        const el2 = document.getElementById('stats-admin-anggota-pub');
        const el3 = document.getElementById('stats-member-anggota-pub');

        if (el1) el1.textContent = total;
        if (el2) el2.textContent = admin;
        if (el3) el3.textContent = member;
    }

    // ===== RENDER GROUPED BY KALURAHAN =====
    function renderGroupedByKalurahan(data) {
        if (!data || data.length === 0) {
            content.className = 'col-span-full';
            content.innerHTML = `
                <div class="text-center py-12 text-[var(--text-muted)]">
                    <i class="fas fa-search text-4xl mb-3 opacity-40"></i>
                    <p>Tidak ada anggota yang cocok dengan filter.</p>
                </div>
            `;
            return;
        }

        const groups = {};
        KALURAHAN_LIST.forEach(k => { groups[k] = []; });
        groups['Lainnya'] = [];

        data.forEach(u => {
            const k = getKalurahan(u);
            const match = KALURAHAN_LIST.find(kk => kk.toLowerCase() === k.toLowerCase());
            if (match) groups[match].push(u);
            else groups['Lainnya'].push(u);
        });

        let html = '';
        Object.keys(groups).forEach(kal => {
            const items = groups[kal];
            if (items.length === 0) return;

            html += `
                <div class="col-span-full mb-6">
                    <h3 class="text-lg font-bold text-[var(--text-main)] font-amiri mb-3 flex items-center gap-2">
                        <i class="fas fa-map-marker-alt text-amber-500"></i>
                        ${escapeHtml(kal)}
                        <span class="text-xs font-normal px-2 py-0.5 rounded-full bg-[var(--bg-stats)] text-[var(--text-muted)]">
                            ${items.length} anggota
                        </span>
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${items.map(u => renderAnggotaCard(u)).join('')}
                    </div>
                </div>
            `;
        });

        content.className = 'col-span-full';
        content.innerHTML = html;
    }

    // ===== RENDER ANGGOTA (NORMAL) =====
    function renderAnggota(data) {
        if (!data || data.length === 0) {
            const isFiltered = searchQuery || currentFilter !== 'all' || currentKalurahan !== 'all';
            content.className = 'col-span-full';
            content.innerHTML = `
                <div class="text-center py-12 text-[var(--text-muted)]">
                    <i class="fas ${isFiltered ? 'fa-search' : 'fa-users'} text-4xl mb-3 opacity-40"></i>
                    <p>${isFiltered ? 'Tidak ada anggota yang cocok dengan filter.' : 'Belum ada anggota terdaftar.'}</p>
                </div>
            `;
            return;
        }

        content.className = 'col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';
        content.innerHTML = data.map(u => renderAnggotaCard(u)).join('');
    }

    // ===== RENDER SINGLE CARD =====
    function renderAnggotaCard(u) {
        const name = u.nama || u.name || u.username || 'Anonim';
        const role = u.role || 'member';
        const foto = u.foto_url || '';
        const alamat = u.alamat || u.address || '';
        const kalurahan = u.kalurahan || '';
        const angkatan = u.angkatan || '';
        const riwayat = u.riwayat_jabatan || '';
        const color = getAvatarColor(name);

        const avatarHtml = foto
            ? `<img src="${escapeAttr(foto)}" alt="${escapeAttr(name)}" class="w-full h-full object-cover" loading="lazy" decoding="async"
                    onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold\\'>${escapeHtml(getInitials(name))}</div>'">`
            : `<div class="w-full h-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-lg">${escapeHtml(getInitials(name))}</div>`;

        const roleBadge = role === 'admin'
            ? '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"><i class="fas fa-shield-alt mr-1"></i>Admin</span>'
            : '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Member</span>';

        const kalurahanBadge = kalurahan
            ? `<span class="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]"><i class="fas fa-map-marker-alt"></i>${escapeHtml(kalurahan)}</span>`
            : '';

        return `
            <div class="anggota-card bg-[var(--card-bg)] backdrop-blur-sm p-5 rounded-2xl shadow-lg border border-[var(--card-border)] transition hover:shadow-xl hover:translate-y-[-4px]">
                <div class="flex items-center space-x-4">
                    <div class="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 border-2 border-[var(--text-main)]">
                        ${avatarHtml}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-[var(--text-main)] text-lg truncate">${escapeHtml(name)}</h3>
                        <div class="mt-1">${roleBadge}</div>
                        <div class="text-xs text-[var(--text-muted)] mt-1 flex flex-wrap gap-2">
                            ${kalurahanBadge}
                            ${alamat && !kalurahan ? `<span><i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(alamat)}</span>` : ''}
                            ${angkatan ? `<span>• Angkatan ${escapeHtml(angkatan)}</span>` : ''}
                        </div>
                        ${riwayat ? `<div class="text-xs text-[var(--text-muted)] mt-0.5 truncate"><i class="fas fa-history mr-1"></i>${escapeHtml(riwayat)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // ===== CLEANUP =====
    function cleanup() {
        window.__anggotaLoaded = false;
        console.log('[anggota] Cleanup');
    }
    window.__anggotaCleanup = cleanup;

    // ===== INIT =====
    console.log('[anggota] Init v11.1.0');
    ensureExtraUI();
    loadAnggota();
});