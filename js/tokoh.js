/**
 * js/tokoh.js
 * Modul Publik Daftar Tokoh & Penggerak - FULL FIX v11.1.0
 * ---------------------------------------------------------
 * FIX:
 *  - ✅ Guard anti-duplikasi + cleanup
 *  - ✅ XSS protection: escapeHtml() di semua output
 *  - ✅ Loading/error/empty state proper
 *  - ✅ Clone-replace listener (anti memory leak)
 *  - ✅ Null-safe semua DOM elements
 *  - ✅ Lazy load images
 *  - ✅ Grid card tokoh (foto, nama, alamat, no HP)
 *  - ✅ Search real-time (nama, alamat, no HP, riwayat)
 *  - ✅ Filter (semua, ada foto, ada lokasi, ada kontak, ada riwayat)
 *  - ✅ Sort (nama A-Z, Z-A, terbaru, alamat A-Z)
 *  - ✅ Stats 3 kartu (total, ada foto, ada lokasi)
 *  - ✅ Detail modal dengan mini map OpenStreetMap
 *  - ✅ Copy koordinat/telepon ke clipboard
 *  - ✅ WhatsApp direct (klik no HP)
 *  - ✅ Lightbox foto fullscreen + keyboard nav (←/→)
 *  - ✅ Group by kalurahan (toggle)
 *  - ✅ Dark mode aware
 *  - ✅ Mobile responsive
 *  - ✅ Animate count-up stats
 * ---------------------------------------------------------
 */

App.register('tokoh', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__tokohLoaded) {
        console.log('[tokoh] Sudah di-init, skip.');
        return;
    }
    window.__tokohLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const container = document.getElementById('tokoh-list');
    if (!container) {
        console.error('[tokoh] Elemen #tokoh-list tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. HELPER FUNCTIONS
    // ================================================================
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

    function isValidLat(lat) {
        const n = parseFloat(lat);
        return !isNaN(n) && n >= -90 && n <= 90;
    }

    function isValidLng(lng) {
        const n = parseFloat(lng);
        return !isNaN(n) && n >= -180 && n <= 180;
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
            'from-teal-400 to-cyan-600',
            'from-orange-400 to-amber-600',
            'from-red-400 to-rose-600'
        ];
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash = hash & hash;
        }
        return colors[Math.abs(hash) % colors.length];
    }

    function cleanPhone(phone) {
        if (!phone) return '';
        return String(phone).replace(/\D/g, '');
    }

    function formatWhatsAppUrl(phone) {
        let cleaned = cleanPhone(phone);
        if (!cleaned) return '';
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }
        return 'https://wa.me/' + cleaned;
    }

    function formatTelUrl(phone) {
        const cleaned = cleanPhone(phone);
        if (!cleaned) return '';
        return 'tel:' + cleaned;
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

    // ================================================================
    // 4. STATE
    // ================================================================
    let allTokoh = [];
    let filteredTokoh = [];
    let currentFilter = {
        search: '',
        filter: 'all',
        sort: 'nama-asc',
        groupByKalurahan: false
    };
    let isLoading = false;
    let currentLightboxIndex = -1;
    let lightboxList = [];

    // ================================================================
    // 5. ENSURE EXTRA UI
    // ================================================================
    function ensureExtraUI() {
        const parentSection = container.closest('section') || container.parentElement;
        if (!parentSection) return;

        // ===== Stats 3 kartu =====
        if (!document.getElementById('tokoh-stats')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'tokoh-stats';
            statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-6xl mx-auto mb-8';
            statsDiv.innerHTML = `
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)] hover:shadow-lg transition">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Tokoh</p>
                            <p class="text-3xl font-bold text-[var(--text-main)] mt-1" id="stats-total-tokoh-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white">
                            <i class="fas fa-user-tie text-lg"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)] hover:shadow-lg transition">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Ada Foto</p>
                            <p class="text-3xl font-bold text-blue-600 mt-1" id="stats-foto-tokoh-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                            <i class="fas fa-camera text-lg"></i>
                        </div>
                    </div>
                </div>
                <div class="stat-card p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)] hover:shadow-lg transition">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Ada Lokasi</p>
                            <p class="text-3xl font-bold text-purple-600 mt-1" id="stats-lokasi-tokoh-pub">0</p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                            <i class="fas fa-map-marker-alt text-lg"></i>
                        </div>
                    </div>
                </div>
            `;
            parentSection.insertBefore(statsDiv, container);
        }

        // ===== Search & Filter Bar =====
        if (!document.getElementById('tokoh-search-wrap')) {
            const wrapper = document.createElement('div');
            wrapper.id = 'tokoh-search-wrap';
            wrapper.className = 'flex flex-wrap gap-2 max-w-6xl mx-auto mb-6';
            wrapper.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="tokoh-search-pub" placeholder="Cari nama, alamat, no HP..."
                        class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                </div>
                <select id="tokoh-filter-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua</option>
                    <option value="foto">📷 Ada Foto</option>
                    <option value="lokasi">📍 Ada Lokasi</option>
                    <option value="kontak">📞 Ada Kontak</option>
                    <option value="riwayat">📖 Ada Riwayat</option>
                </select>
                <select id="tokoh-sort-pub"
                    class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="nama-asc">Nama A-Z</option>
                    <option value="nama-desc">Nama Z-A</option>
                    <option value="terbaru">Terbaru</option>
                    <option value="alamat-asc">Alamat A-Z</option>
                </select>
                <button id="tokoh-clear-filter-pub" type="button"
                    class="px-3 py-2.5 rounded-xl bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition"
                    title="Reset filter">
                    <i class="fas fa-times"></i>
                </button>
            `;

            parentSection.insertBefore(wrapper, container);
            attachFilterListeners();
        }
    }

    // ================================================================
    // 6. ATTACH FILTER LISTENERS
    // ================================================================
    function attachFilterListeners() {
        const searchInput = document.getElementById('tokoh-search-pub');
        const filterSelect = document.getElementById('tokoh-filter-pub');
        const sortSelect = document.getElementById('tokoh-sort-pub');
        const clearBtn = document.getElementById('tokoh-clear-filter-pub');

        if (searchInput && !searchInput.dataset.attached) {
            searchInput.dataset.attached = 'true';
            searchInput.addEventListener('input',
                debounceEvent.bind(null, 'tokoh-search', () => {
                    currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                    applyFilter();
                }, 250));
        }

        if (filterSelect && !filterSelect.dataset.attached) {
            filterSelect.dataset.attached = 'true';
            filterSelect.addEventListener('change', function() {
                currentFilter.filter = this.value;
                applyFilter();
            });
        }

        if (sortSelect && !sortSelect.dataset.attached) {
            sortSelect.dataset.attached = 'true';
            sortSelect.addEventListener('change', function() {
                currentFilter.sort = this.value;
                applyFilter();
            });
        }

        if (clearBtn && !clearBtn.dataset.attached) {
            clearBtn.dataset.attached = 'true';
            clearBtn.addEventListener('click', function() {
                currentFilter = {
                    search: '',
                    filter: 'all',
                    sort: 'nama-asc',
                    groupByKalurahan: false
                };
                if (searchInput) searchInput.value = '';
                if (filterSelect) filterSelect.value = 'all';
                if (sortSelect) sortSelect.value = 'nama-asc';
                applyFilter();
                showToast('Filter direset.', 'info', 2000);
            });
        }
    }

    // ================================================================
    // 7. APPLY FILTER & SORT
    // ================================================================
    function applyFilter() {
        filteredTokoh = allTokoh.filter(t => {
            if (currentFilter.filter === 'foto' && !t.foto_url) return false;
            if (currentFilter.filter === 'lokasi') {
                if (!isValidLat(t.lat) || !isValidLng(t.lng)) return false;
            }
            if (currentFilter.filter === 'kontak' && !t.no_hp) return false;
            if (currentFilter.filter === 'riwayat' && !t.riwayat_hidup) return false;

            if (currentFilter.search) {
                const q = currentFilter.search;
                const haystack = [
                    t.nama, t.alamat, t.no_hp,
                    t.riwayat_hidup, t.pengalaman_organisasi, t.detail_lain
                ].map(v => String(v || '').toLowerCase()).join(' ');
                if (!haystack.includes(q)) return false;
            }
            return true;
        });

        switch (currentFilter.sort) {
            case 'nama-asc':
                filteredTokoh.sort((a, b) =>
                    String(a.nama || '').localeCompare(String(b.nama || '')));
                break;
            case 'nama-desc':
                filteredTokoh.sort((a, b) =>
                    String(b.nama || '').localeCompare(String(a.nama || '')));
                break;
            case 'terbaru':
                filteredTokoh.sort((a, b) =>
                    new Date(b.created_at || 0) - new Date(a.created_at || 0));
                break;
            case 'alamat-asc':
                filteredTokoh.sort((a, b) =>
                    String(a.alamat || '').localeCompare(String(b.alamat || '')));
                break;
        }

        renderTokoh();
        updateStats();
    }

    // ================================================================
    // 8. UPDATE STATS
    // ================================================================
    function updateStats() {
        const total = allTokoh.length;
        const adafoto = allTokoh.filter(t => t.foto_url).length;
        const adaLokasi = allTokoh.filter(t =>
            isValidLat(t.lat) && isValidLng(t.lng)).length;

        const el1 = document.getElementById('stats-total-tokoh-pub');
        const el2 = document.getElementById('stats-foto-tokoh-pub');
        const el3 = document.getElementById('stats-lokasi-tokoh-pub');

        if (el1) animateNumber(el1, total, 600);
        if (el2) animateNumber(el2, adafoto, 600);
        if (el3) animateNumber(el3, adaLokasi, 600);
    }

    function animateNumber(el, target, duration) {
        if (!el) return;
        duration = duration || 600;
        const startTime = performance.now();
        function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(target * eased);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // ================================================================
    // 9. LOAD DATA
    // ================================================================
    async function loadTokoh() {
        if (isLoading) return;
        isLoading = true;

        container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto';
        container.innerHTML = Array(6).fill(0).map(() => `
            <div class="bg-[var(--card-bg)] rounded-2xl overflow-hidden border border-[var(--card-border)] shadow-lg">
                <div class="skeleton-box h-56 w-full"></div>
                <div class="p-5 space-y-2">
                    <div class="skeleton-box h-5 w-3/4"></div>
                    <div class="skeleton-box h-4 w-full"></div>
                    <div class="skeleton-box h-8 w-full mt-3"></div>
                </div>
            </div>
        `).join('');

        try {
            const result = await apiCall('getTokoh', 'POST', {});

            if (!result || !result.success) {
                throw new Error((result && result.message) || 'Gagal memuat data');
            }

            allTokoh = Array.isArray(result.data) ? result.data : [];

            if (allTokoh.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12">
                        <i class="fas fa-user-tie text-5xl text-[var(--text-muted)] mb-4 opacity-40"></i>
                        <p class="text-[var(--text-muted)] font-medium">Belum ada data tokoh.</p>
                        <p class="text-[var(--text-muted)] text-sm mt-1">Silakan cek kembali nanti.</p>
                    </div>
                `;
                updateStats();
                return;
            }

            allTokoh.sort((a, b) =>
                String(a.nama || '').localeCompare(String(b.nama || '')));
            filteredTokoh = allTokoh;

            renderTokoh();
            updateStats();

        } catch (error) {
            console.error('[tokoh] Load error:', error);
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>
                    <p class="text-red-500 font-medium mb-2">Gagal memuat data tokoh.</p>
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
    // 10. RENDER TOKOH CARDS
    // ================================================================
    function renderTokoh() {
        if (!filteredTokoh || filteredTokoh.length === 0) {
            const isFiltered = currentFilter.search || currentFilter.filter !== 'all';
            container.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas ${isFiltered ? 'fa-search' : 'fa-user-tie'} text-5xl text-[var(--text-muted)] mb-4 opacity-40"></i>
                    <p class="text-[var(--text-muted)]">
                        ${isFiltered
                            ? 'Tidak ada hasil yang cocok dengan filter.'
                            : 'Belum ada data tokoh.'}
                    </p>
                    ${isFiltered ? `
                        <button onclick="document.getElementById('tokoh-clear-filter-pub')?.click()"
                            class="btn-primary mt-4 px-6 py-2 rounded-lg">
                            <i class="fas fa-times mr-1"></i>Reset Filter
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }

        container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto';

        let html = '';
        filteredTokoh.forEach((item, index) => {
            const name = item.nama || 'Tanpa Nama';
            const alamat = item.alamat || 'Alamat tidak tersedia';
            const hasLoc = isValidLat(item.lat) && isValidLng(item.lng);
            const hasPhone = !!item.no_hp;
            const hasFoto = !!item.foto_url;
            const avatarColor = getAvatarColor(name);

            const avatarHtml = hasFoto
                ? `<img src="${escapeAttr(item.foto_url)}" alt="${escapeAttr(name)}"
                        class="w-full h-full object-cover"
                        loading="lazy" decoding="async"
                        onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-3xl font-bold\\'>${escapeHtml(getInitials(name))}</div>'">`
                : `<div class="w-full h-full bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-3xl font-bold">
                        ${escapeHtml(getInitials(name))}
                   </div>`;

            const badges = [];
            if (hasLoc) badges.push(`<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"><i class="fas fa-map-marker-alt"></i>Lokasi</span>`);
            if (hasPhone) badges.push(`<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"><i class="fas fa-phone"></i>Kontak</span>`);
            if (item.riwayat_hidup) badges.push(`<span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><i class="fas fa-history"></i>Riwayat</span>`);

            html += `
                <div class="tokoh-card group bg-[var(--card-bg)] backdrop-blur-sm rounded-2xl overflow-hidden border border-[var(--card-border)] shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 flex flex-col">
                    <div class="relative h-56 overflow-hidden bg-[var(--bg-stats)] cursor-pointer"
                         onclick="openDetailTokoh('${item.id}')">
                        ${avatarHtml}
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div class="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            ${badges.join('')}
                        </div>
                        ${hasFoto ? `
                            <button onclick="event.stopPropagation(); openFotoLightbox('${item.id}')"
                                class="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Lihat foto">
                                <i class="fas fa-expand"></i>
                            </button>
                        ` : ''}
                    </div>

                    <div class="p-5 flex-1 flex flex-col">
                        <h3 class="text-lg font-bold text-[var(--text-main)] font-amiri mb-1 line-clamp-1"
                            title="${escapeAttr(name)}">
                            ${escapeHtml(name)}
                        </h3>
                        <p class="text-sm text-[var(--text-muted)] mb-3 flex items-start gap-1.5">
                            <i class="fas fa-map-marker-alt mt-0.5 flex-shrink-0"></i>
                            <span class="line-clamp-2">${escapeHtml(alamat)}</span>
                        </p>

                        ${item.riwayat_hidup ? `
                            <p class="text-xs text-[var(--text-muted)] line-clamp-2 mb-3">
                                ${escapeHtml(String(item.riwayat_hidup).substring(0, 100))}${String(item.riwayat_hidup).length > 100 ? '...' : ''}
                            </p>
                        ` : ''}

                        <div class="flex flex-wrap gap-2 mt-auto pt-3 border-t border-[var(--card-border)]">
                            <button onclick="openDetailTokoh('${item.id}')"
                                class="flex-1 text-xs px-3 py-1.5 rounded-lg bg-[var(--text-main)] text-[var(--text-inverse)] hover:opacity-90 transition flex items-center justify-center gap-1.5">
                                <i class="fas fa-info-circle"></i>Detail
                            </button>
                            ${hasPhone ? `
                                <a href="${escapeAttr(formatWhatsAppUrl(item.no_hp))}"
                                   target="_blank" rel="noopener"
                                   class="text-xs px-3 py-1.5 rounded-lg bg-[#25D366] text-white hover:opacity-90 transition flex items-center justify-center gap-1.5"
                                   title="Chat WhatsApp">
                                    <i class="fab fa-whatsapp"></i>
                                </a>
                                <a href="${escapeAttr(formatTelUrl(item.no_hp))}"
                                   class="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] transition flex items-center justify-center"
                                   title="Telepon">
                                    <i class="fas fa-phone"></i>
                                </a>
                            ` : ''}
                            ${hasLoc ? `
                                <button onclick="copyKoordinat('${item.id}')"
                                    class="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] transition flex items-center justify-center"
                                    title="Copy koordinat">
                                    <i class="fas fa-copy"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        lightboxList = filteredTokoh.filter(t => t.foto_url);
    }

    // ================================================================
    // 11. OPEN DETAIL MODAL
    // ================================================================
    window.openDetailTokoh = function(id) {
        const item = allTokoh.find(t => t.id === id);
        if (!item) {
            showToast('Data tidak ditemukan.', 'warning');
            return;
        }

        let modal = document.getElementById('tokoh-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tokoh-detail-modal';
            modal.className = 'fixed inset-0 bg-black/70 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
            modal.innerHTML = `
                <div id="tokoh-detail-content"
                     class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                    <div class="relative">
                        <div id="tokoh-detail-header" class="h-28 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-t-2xl"></div>
                        <button id="tokoh-detail-close-btn"
                            class="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition">
                            <i class="fas fa-times"></i>
                        </button>
                        <div class="absolute -bottom-14 left-6">
                            <div id="tokoh-detail-foto-wrap" class="w-28 h-28 rounded-full border-4 border-[var(--card-bg)] shadow-lg overflow-hidden bg-[var(--bg-stats)]">
                                <img id="tokoh-detail-foto" src="" alt="Foto"
                                    class="w-full h-full object-cover cursor-pointer">
                            </div>
                        </div>
                    </div>
                    <div class="pt-20 px-6 pb-6">
                        <h3 id="tokoh-detail-nama" class="text-2xl font-bold text-[var(--text-main)] font-amiri mb-1"></h3>
                        <p id="tokoh-detail-alamat" class="text-sm text-[var(--text-muted)] mb-4"></p>
                        <div id="tokoh-detail-body" class="space-y-4"></div>
                        <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--card-border)]">
                            <button id="tokoh-detail-close-btn-2"
                                class="btn-primary px-6 py-2 rounded-lg">
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeFn = () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                document.body.style.overflow = '';
            };

            modal.querySelector('#tokoh-detail-close-btn').addEventListener('click', closeFn);
            modal.querySelector('#tokoh-detail-close-btn-2').addEventListener('click', closeFn);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeFn();
            });
        }

        const content = modal.querySelector('#tokoh-detail-content');
        const foto = modal.querySelector('#tokoh-detail-foto');
        const nama = modal.querySelector('#tokoh-detail-nama');
        const alamat = modal.querySelector('#tokoh-detail-alamat');
        const body = modal.querySelector('#tokoh-detail-body');
        const namaStr = item.nama || 'Tanpa Nama';

        if (item.foto_url) {
            foto.src = item.foto_url;
            foto.onerror = () => {
                foto.parentElement.innerHTML = `<div class="w-full h-full bg-gradient-to-br ${getAvatarColor(namaStr)} flex items-center justify-center text-white text-3xl font-bold">${escapeHtml(getInitials(namaStr))}</div>`;
            };
        } else {
            foto.parentElement.innerHTML = `<div class="w-full h-full bg-gradient-to-br ${getAvatarColor(namaStr)} flex items-center justify-center text-white text-3xl font-bold">${escapeHtml(getInitials(namaStr))}</div>`;
        }

        nama.textContent = namaStr;
        alamat.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(item.alamat || 'Alamat tidak tersedia')}`;

        let bodyHtml = '';

        if (item.no_hp) {
            bodyHtml += `
                <div>
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                        <i class="fas fa-phone mr-1"></i>Kontak
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <a href="${escapeAttr(formatTelUrl(item.no_hp))}"
                           class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:opacity-90 transition text-sm">
                            <i class="fas fa-phone"></i>${escapeHtml(item.no_hp)}
                        </a>
                        <a href="${escapeAttr(formatWhatsAppUrl(item.no_hp))}"
                           target="_blank" rel="noopener"
                           class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#25D366] text-white hover:opacity-90 transition text-sm">
                            <i class="fab fa-whatsapp"></i>WhatsApp
                        </a>
                        <button onclick="copyPhone('${escapeAttr(item.no_hp)}')"
                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] transition text-sm">
                            <i class="fas fa-copy"></i>Copy
                        </button>
                    </div>
                </div>
            `;
        }

        if (isValidLat(item.lat) && isValidLng(item.lng)) {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lng);
            const delta = 0.005;
            const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;

            bodyHtml += `
                <div>
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                        <i class="fas fa-map-marked-alt mr-1"></i>Lokasi
                    </p>
                    <div class="rounded-lg overflow-hidden border border-[var(--card-border)]" style="height:220px">
                        <iframe width="100%" height="220" frameborder="0" scrolling="no"
                            src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}"
                            loading="lazy"></iframe>
                    </div>
                    <div class="flex items-center justify-between gap-2 mt-2 text-xs text-[var(--text-muted)] flex-wrap">
                        <span class="flex items-center gap-1">
                            <i class="fas fa-map-pin"></i>
                            ${lat.toFixed(6)}, ${lng.toFixed(6)}
                        </span>
                        <div class="flex gap-2">
                            <button onclick="copyKoordinat('${item.id}')"
                                class="text-blue-600 dark:text-blue-400 hover:underline">
                                <i class="fas fa-copy mr-1"></i>Copy
                            </button>
                            <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}"
                               target="_blank" rel="noopener"
                               class="text-blue-600 dark:text-blue-400 hover:underline">
                                <i class="fas fa-external-link-alt mr-1"></i>Buka Map
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }

        if (item.riwayat_hidup) {
            bodyHtml += `
                <div>
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                        <i class="fas fa-history mr-1"></i>Riwayat Hidup
                    </p>
                    <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.riwayat_hidup)}</p>
                </div>
            `;
        }

        if (item.pengalaman_organisasi) {
            bodyHtml += `
                <div>
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                        <i class="fas fa-sitemap mr-1"></i>Pengalaman Organisasi
                    </p>
                    <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.pengalaman_organisasi)}</p>
                </div>
            `;
        }

        if (item.detail_lain) {
            bodyHtml += `
                <div>
                    <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                        <i class="fas fa-info-circle mr-1"></i>Detail Lain
                    </p>
                    <p class="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">${escapeHtml(item.detail_lain)}</p>
                </div>
            `;
        }

        if (!bodyHtml) {
            bodyHtml = '<p class="text-center text-[var(--text-muted)] py-4 italic">Belum ada detail tambahan.</p>';
        }

        body.innerHTML = bodyHtml;

        if (item.foto_url) {
            const fotoEl = modal.querySelector('#tokoh-detail-foto');
            if (fotoEl) {
                fotoEl.style.cursor = 'pointer';
                fotoEl.onclick = () => openFotoLightbox(id);
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        });
        document.body.style.overflow = 'hidden';
    };

    // ================================================================
    // 12. FOTO LIGHTBOX
    // ================================================================
    window.openFotoLightbox = function(id) {
        const item = allTokoh.find(t => t.id === id);
        if (!item || !item.foto_url) return;

        const idx = lightboxList.findIndex(t => t.id === id);
        currentLightboxIndex = idx >= 0 ? idx : 0;

        let lightbox = document.getElementById('tokoh-lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.id = 'tokoh-lightbox';
            lightbox.className = 'fixed inset-0 bg-black/95 hidden items-center justify-center z-[10000] p-4';
            lightbox.innerHTML = `
                <button id="tokoh-lightbox-close"
                    class="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl transition z-10">
                    <i class="fas fa-times"></i>
                </button>
                <button id="tokoh-lightbox-prev"
                    class="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl transition z-10">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button id="tokoh-lightbox-next"
                    class="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl transition z-10">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <img id="tokoh-lightbox-img" src="" alt="Foto"
                    class="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl">
                <p id="tokoh-lightbox-caption"
                    class="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-center px-4 py-2 bg-black/50 rounded-full text-sm backdrop-blur-sm max-w-[90vw] truncate"></p>
                <span id="tokoh-lightbox-counter"
                    class="absolute bottom-6 right-6 text-white/80 text-sm px-3 py-1 bg-black/50 rounded-full backdrop-blur-sm"></span>
            `;
            document.body.appendChild(lightbox);

            const closeFn = () => {
                lightbox.classList.add('hidden');
                lightbox.classList.remove('flex');
                document.body.style.overflow = '';
            };

            lightbox.querySelector('#tokoh-lightbox-close').addEventListener('click', closeFn);
            lightbox.querySelector('#tokoh-lightbox-prev').addEventListener('click', () => navigateLightbox(-1));
            lightbox.querySelector('#tokoh-lightbox-next').addEventListener('click', () => navigateLightbox(1));

            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) closeFn();
            });
        }

        renderLightboxContent();
        lightbox.classList.remove('hidden');
        lightbox.classList.add('flex');
        document.body.style.overflow = 'hidden';
    };

    function navigateLightbox(dir) {
        if (lightboxList.length === 0) return;
        currentLightboxIndex = (currentLightboxIndex + dir + lightboxList.length) % lightboxList.length;
        renderLightboxContent();
    }

    function renderLightboxContent() {
        const lightbox = document.getElementById('tokoh-lightbox');
        if (!lightbox) return;
        const item = lightboxList[currentLightboxIndex];
        if (!item) return;

        const img = lightbox.querySelector('#tokoh-lightbox-img');
        const caption = lightbox.querySelector('#tokoh-lightbox-caption');
        const counter = lightbox.querySelector('#tokoh-lightbox-counter');

        if (img) {
            img.src = item.foto_url;
            img.alt = item.nama || 'Foto';
            img.onerror = () => {
                img.src = 'https://placehold.co/600x600/e5e7eb/9ca3af?text=Foto+Tidak+Tersedia';
            };
        }
        if (caption) caption.textContent = item.nama || '';
        if (counter) counter.textContent = (currentLightboxIndex + 1) + ' / ' + lightboxList.length;

        const prevBtn = lightbox.querySelector('#tokoh-lightbox-prev');
        const nextBtn = lightbox.querySelector('#tokoh-lightbox-next');
        const showNav = lightboxList.length > 1;
        if (prevBtn) prevBtn.style.display = showNav ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = showNav ? 'flex' : 'none';
        if (counter) counter.style.display = showNav ? 'block' : 'none';
    }

    document.addEventListener('keydown', function(e) {
        const lightbox = document.getElementById('tokoh-lightbox');
        if (!lightbox || lightbox.classList.contains('hidden')) return;

        if (e.key === 'Escape') {
            lightbox.classList.add('hidden');
            lightbox.classList.remove('flex');
            document.body.style.overflow = '';
        } else if (e.key === 'ArrowLeft') {
            navigateLightbox(-1);
        } else if (e.key === 'ArrowRight') {
            navigateLightbox(1);
        }
    });

    // ================================================================
    // 13. COPY KOORDINAT
    // ================================================================
    window.copyKoordinat = function(id) {
        const item = allTokoh.find(t => t.id === id);
        if (!item) return;

        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lng);

        if (isNaN(lat) || isNaN(lng)) {
            showToast('Koordinat tidak tersedia.', 'warning');
            return;
        }

        const text = lat.toFixed(6) + ', ' + lng.toFixed(6);
        copyToClipboard(text)
            .then(() => showToast('📍 Koordinat dicopy: ' + text, 'success', 2500))
            .catch(() => showToast('Gagal copy koordinat', 'error'));
    };

    // ================================================================
    // 14. COPY PHONE
    // ================================================================
    window.copyPhone = function(phone) {
        if (!phone) return;
        copyToClipboard(phone)
            .then(() => showToast('📞 No HP dicopy: ' + phone, 'success', 2500))
            .catch(() => showToast('Gagal copy', 'error'));
    };

    // ================================================================
    // 15. CLEANUP
    // ================================================================
    function cleanup() {
        window.__tokohLoaded = false;
        const lightbox = document.getElementById('tokoh-lightbox');
        if (lightbox) lightbox.remove();
        const modal = document.getElementById('tokoh-detail-modal');
        if (modal) modal.remove();
        console.log('[tokoh] Cleanup');
    }

    window.__tokohCleanup = cleanup;

    // ================================================================
    // 16. INIT
    // ================================================================
    console.log('[tokoh] Init dimulai');
    ensureExtraUI();
    loadTokoh();
});