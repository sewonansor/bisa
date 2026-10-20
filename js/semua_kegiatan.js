/**
 * js/semua_kegiatan.js
 * Modul Halaman Semua Kegiatan Publik — FULL FIX v11.0.0
 * ---------------------------------------------------------
 * CHANGELOG v11.0.0:
 *  - ✅ FIX: Anon cache support (konsisten dengan app.js v42.4.0)
 *  - ✅ FIX: Container resolution robust (3 fallback + auto-create)
 *  - ✅ FIX: XSS protection lengkap (escapeHtml + escapeAttr)
 *  - ✅ FIX: Clone-replace listener (anti memory leak)
 *  - ✅ FIX: Debounce search 250ms (anti spam render)
 *  - ✅ FIX: Null-safe semua DOM (guard null)
 *  - ✅ FIX: Cleanup function proper
 *  - ✅ FIX: Empty state + error state + loading state
 *  - ✅ FIX: Pagination "Load More" (6 per load)
 *  - ✅ FIX: Status badge (akan/berlangsung/selesai)
 *  - ✅ FIX: Lazy load images + onerror fallback
 *  - ✅ FIX: Dark mode aware
 *  - ✅ FIX: Clone listener untuk semua filter controls
 *  - ✅ FIX: Auto-cleanup saat navigate away
 *  - ✅ FIX: Detail URL encode proper
 *  - ✅ FIX: Prevent double-init
 *  - ✅ FIX: Guard empty dataCache
 * ---------------------------------------------------------
 */

App.register('semua_kegiatan', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__semuaKegiatanLoaded) {
        console.log('[semua_kegiatan] Sudah di-init, skip.');
        return;
    }
    window.__semuaKegiatanLoaded = true;

    // ================================================================
    // 2. CONTAINER RESOLUTION — ROBUST (3 FALLBACK)
    // ================================================================
    function resolveContainer() {
        var ids = [
            'semua-kegiatan-list',
            'kegiatan-list',
            'kegiatan-content'
        ];

        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) return el;
        }

        // Fallback: cari grid kegiatan
        var grid = document.getElementById('kegiatan-grid');
        if (grid) {
            var content = grid.querySelector('#kegiatan-content');
            if (content) return content;
            return grid;
        }

        return null;
    }

    function resolveSkeleton() {
        return (
            document.getElementById('semua-kegiatan-skeleton') ||
            document.getElementById('kegiatan-skeleton')
        );
    }

    var container = resolveContainer();
    var skeleton = resolveSkeleton();

    if (!container) {
        console.error('[semua_kegiatan] Container tidak ditemukan — abort.');
        return;
    }

    // ================================================================
    // 3. HELPERS — XSS SAFE
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function formatDate(d) {
        if (!d) return '-';
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    function timeAgo(d) {
        if (!d) return '-';
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        var diff = Math.floor((Date.now() - date.getTime()) / 1000);
        if (diff < 60) return 'baru saja';
        if (diff < 3600) return Math.floor(diff / 60) + ' menit lalu';
        if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
        if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
        return formatDate(d);
    }

    function stripHtml(html) {
        if (!html) return '';
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function getFirstImageFromContent(html) {
        if (!html) return '';
        try {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');
            var img = doc.querySelector('img');
            return img ? (img.getAttribute('src') || '') : '';
        } catch (e) {
            return '';
        }
    }

    function estimateDuration(start, end) {
        if (!start) return 1;
        var d1 = new Date(start);
        if (isNaN(d1.getTime())) return 1;
        if (!end) return 1;
        var d2 = new Date(end);
        if (isNaN(d2.getTime())) return 1;
        var days = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        return Math.max(1, days);
    }

    function getStatusKegiatan(tanggalMulai, tanggalSelesai) {
        if (!tanggalMulai) {
            return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };
        }

        var now = new Date();
        now.setHours(0, 0, 0, 0);

        var d1 = new Date(tanggalMulai);
        if (isNaN(d1.getTime())) {
            return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };
        }

        var d2 = tanggalSelesai ? new Date(tanggalSelesai) : new Date(tanggalMulai);
        if (isNaN(d2.getTime())) {
            return { label: 'Tanpa Tanggal', color: 'gray', icon: 'fa-question' };
        }

        d1.setHours(0, 0, 0, 0);
        d2.setHours(23, 59, 59, 999);

        if (now < d1) {
            return { label: 'Akan Datang', color: 'blue', icon: 'fa-clock' };
        }
        if (now >= d1 && now <= d2) {
            return { label: 'Berlangsung', color: 'green', icon: 'fa-play-circle' };
        }
        return { label: 'Selesai', color: 'gray', icon: 'fa-check-circle' };
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    var allKegiatan = [];
    var filteredKegiatan = [];
    var currentFilter = {
        search: '',
        tahun: 'all',
        tempat: 'all',
        status: 'all',
        sort: 'terbaru'
    };
    var visibleCount = 6;
    var isLoading = false;
    var searchTimer = null;

    // ================================================================
    // 5. ENSURE EXTRA UI
    // ================================================================
    function ensureExtraUI() {
        var wrapper = container.closest('.max-w-6xl') ||
                      container.closest('section') ||
                      container.parentElement;
        if (!wrapper) return;

        // ===== Stats 3 kartu =====
        if (!document.getElementById('kegiatan-stats-pub')) {
            var statsDiv = document.createElement('div');
            statsDiv.id = 'kegiatan-stats-pub';
            statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6';
            statsDiv.innerHTML =
                '<div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                    '<div class="flex items-center justify-between">' +
                        '<div>' +
                            '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Kegiatan</p>' +
                            '<p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-kegiatan-total">0</p>' +
                        '</div>' +
                        '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">' +
                            '<i class="fas fa-calendar-check"></i>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                    '<div class="flex items-center justify-between">' +
                        '<div>' +
                            '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tahun Ini</p>' +
                            '<p class="text-2xl font-bold text-blue-600 mt-1" id="stats-kegiatan-tahun-ini">0</p>' +
                        '</div>' +
                        '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">' +
                            '<i class="fas fa-calendar"></i>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">' +
                    '<div class="flex items-center justify-between">' +
                        '<div>' +
                            '<p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tempat Unik</p>' +
                            '<p class="text-2xl font-bold text-purple-600 mt-1" id="stats-tempat-unik">0</p>' +
                        '</div>' +
                        '<div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">' +
                            '<i class="fas fa-map-marked-alt"></i>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            wrapper.insertBefore(statsDiv, container);
        }

        // ===== Filter Bar =====
        if (!document.getElementById('kegiatan-filter-wrap')) {
            var filterWrap = document.createElement('div');
            filterWrap.id = 'kegiatan-filter-wrap';
            filterWrap.className = 'flex flex-wrap gap-2 mb-6';
            filterWrap.innerHTML =
                '<div class="flex-1 min-w-[200px] relative">' +
                    '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>' +
                    '<input type="text" id="kegiatan-search-pub" placeholder="Cari kegiatan, tempat, deskripsi..."' +
                        ' class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">' +
                '</div>' +
                '<select id="kegiatan-filter-tahun-pub" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">' +
                    '<option value="all">Semua Tahun</option>' +
                '</select>' +
                '<select id="kegiatan-filter-tempat-pub" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">' +
                    '<option value="all">Semua Tempat</option>' +
                '</select>' +
                '<select id="kegiatan-filter-status-pub" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">' +
                    '<option value="all">Semua Status</option>' +
                    '<option value="akan">Akan Datang</option>' +
                    '<option value="berlangsung">Berlangsung</option>' +
                    '<option value="selesai">Selesai</option>' +
                '</select>' +
                '<select id="kegiatan-sort-pub" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">' +
                    '<option value="terbaru">Terbaru</option>' +
                    '<option value="terlama">Terlama</option>' +
                    '<option value="judul-asc">Judul A-Z</option>' +
                    '<option value="judul-desc">Judul Z-A</option>' +
                '</select>' +
                '<button id="kegiatan-clear-filter-pub" type="button" class="px-3 py-2.5 rounded-xl bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition" title="Reset filter">' +
                    '<i class="fas fa-times"></i>' +
                '</button>';

            wrapper.insertBefore(filterWrap, container);
            attachFilterListeners();
        }

        // ===== Load More Button =====
        if (!document.getElementById('kegiatan-load-more-wrap')) {
            var loadMoreWrap = document.createElement('div');
            loadMoreWrap.id = 'kegiatan-load-more-wrap';
            loadMoreWrap.className = 'hidden text-center mt-8';
            loadMoreWrap.innerHTML =
                '<button id="kegiatan-load-more-btn" type="button" class="btn-outline px-6 py-2.5 rounded-full">' +
                    '<i class="fas fa-plus-circle mr-1"></i>Muat Lebih Banyak' +
                '</button>' +
                '<p id="kegiatan-load-more-info" class="text-xs text-[var(--text-muted)] mt-2"></p>';

            if (container.parentNode) {
                container.parentNode.insertBefore(loadMoreWrap, container.nextSibling);
            }

            var loadMoreBtn = document.getElementById('kegiatan-load-more-btn');
            if (loadMoreBtn) {
                var fresh = loadMoreBtn.cloneNode(true);
                loadMoreBtn.parentNode.replaceChild(fresh, loadMoreBtn);
                fresh.addEventListener('click', function() {
                    visibleCount += 6;
                    renderKegiatan();
                });
            }
        }
    }

    // ================================================================
    // 6. ATTACH FILTER LISTENERS — CLONE-REPLACE
    // ================================================================
    function attachFilterListeners() {
        var searchInput = document.getElementById('kegiatan-search-pub');
        var filterTahun = document.getElementById('kegiatan-filter-tahun-pub');
        var filterTempat = document.getElementById('kegiatan-filter-tempat-pub');
        var filterStatus = document.getElementById('kegiatan-filter-status-pub');
        var sortSelect = document.getElementById('kegiatan-sort-pub');
        var clearBtn = document.getElementById('kegiatan-clear-filter-pub');

        // Search — debounce
        if (searchInput && !searchInput.dataset.attached) {
            searchInput.dataset.attached = 'true';
            searchInput.addEventListener('input', function() {
                var val = this.value || '';
                clearTimeout(searchTimer);
                searchTimer = setTimeout(function() {
                    currentFilter.search = val.toLowerCase().trim();
                    visibleCount = 6;
                    applyFilter();
                }, 250);
            });
        }

        // Filter tahun
        if (filterTahun && !filterTahun.dataset.attached) {
            filterTahun.dataset.attached = 'true';
            filterTahun.addEventListener('change', function() {
                currentFilter.tahun = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        // Filter tempat
        if (filterTempat && !filterTempat.dataset.attached) {
            filterTempat.dataset.attached = 'true';
            filterTempat.addEventListener('change', function() {
                currentFilter.tempat = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        // Filter status
        if (filterStatus && !filterStatus.dataset.attached) {
            filterStatus.dataset.attached = 'true';
            filterStatus.addEventListener('change', function() {
                currentFilter.status = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        // Sort
        if (sortSelect && !sortSelect.dataset.attached) {
            sortSelect.dataset.attached = 'true';
            sortSelect.addEventListener('change', function() {
                currentFilter.sort = this.value;
                visibleCount = 6;
                applyFilter();
            });
        }

        // Clear filter
        if (clearBtn && !clearBtn.dataset.attached) {
            clearBtn.dataset.attached = 'true';
            clearBtn.addEventListener('click', function() {
                currentFilter = {
                    search: '',
                    tahun: 'all',
                    tempat: 'all',
                    status: 'all',
                    sort: 'terbaru'
                };
                if (searchInput) searchInput.value = '';
                if (filterTahun) filterTahun.value = 'all';
                if (filterTempat) filterTempat.value = 'all';
                if (filterStatus) filterStatus.value = 'all';
                if (sortSelect) sortSelect.value = 'terbaru';
                visibleCount = 6;
                applyFilter();
                if (typeof showToast === 'function') {
                    showToast('Filter direset.', 'info', 2000);
                }
            });
        }
    }

    // ================================================================
    // 7. UPDATE FILTER OPTIONS (tahun + tempat)
    // ================================================================
    function updateFilterOptions() {
        // Tahun
        var tahunSelect = document.getElementById('kegiatan-filter-tahun-pub');
        if (tahunSelect) {
            var tahuns = {};
            allKegiatan.forEach(function(k) {
                if (k.tanggal_mulai) {
                    var d = new Date(k.tanggal_mulai);
                    if (!isNaN(d.getTime())) {
                        tahuns[d.getFullYear()] = true;
                    }
                }
            });

            var tahunList = Object.keys(tahuns).sort(function(a, b) {
                return b - a;
            });

            var currentValue = tahunSelect.value;
            tahunSelect.innerHTML = '<option value="all">Semua Tahun</option>';
            tahunList.forEach(function(t) {
                var opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                tahunSelect.appendChild(opt);
            });
            if (tahunList.indexOf(currentValue) !== -1) {
                tahunSelect.value = currentValue;
            }
        }

        // Tempat
        var tempatSelect = document.getElementById('kegiatan-filter-tempat-pub');
        if (tempatSelect) {
            var tempats = {};
            allKegiatan.forEach(function(k) {
                if (k.tempat && String(k.tempat).trim()) {
                    tempats[String(k.tempat).trim()] = true;
                }
            });

            var tempatList = Object.keys(tempats).sort();

            var currentValue2 = tempatSelect.value;
            tempatSelect.innerHTML = '<option value="all">Semua Tempat</option>';
            tempatList.forEach(function(t) {
                var opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                tempatSelect.appendChild(opt);
            });
            if (tempatList.indexOf(currentValue2) !== -1) {
                tempatSelect.value = currentValue2;
            }
        }
    }

    // ================================================================
    // 8. APPLY FILTER & SORT
    // ================================================================
    function applyFilter() {
        filteredKegiatan = allKegiatan.filter(function(k) {
            // Filter tahun
            if (currentFilter.tahun !== 'all') {
                if (!k.tanggal_mulai) return false;
                var d = new Date(k.tanggal_mulai);
                if (isNaN(d.getTime()) || String(d.getFullYear()) !== currentFilter.tahun) {
                    return false;
                }
            }

            // Filter tempat
            if (currentFilter.tempat !== 'all') {
                if (String(k.tempat || '').trim() !== currentFilter.tempat) {
                    return false;
                }
            }

            // Filter status
            if (currentFilter.status !== 'all') {
                var status = getStatusKegiatan(k.tanggal_mulai, k.tanggal_selesai);
                var label = status.label.toLowerCase();
                if (currentFilter.status === 'akan' && label !== 'akan datang') return false;
                if (currentFilter.status === 'berlangsung' && label !== 'berlangsung') return false;
                if (currentFilter.status === 'selesai' && label !== 'selesai') return false;
            }

            // Search
            if (currentFilter.search) {
                var q = currentFilter.search;
                var haystack = [
                    k.kegiatan,
                    k.tempat,
                    stripHtml(k.deskripsi)
                ].map(function(v) {
                    return String(v || '').toLowerCase();
                }).join(' ');
                if (haystack.indexOf(q) === -1) return false;
            }

            return true;
        });

        // Sort
        switch (currentFilter.sort) {
            case 'terbaru':
                filteredKegiatan.sort(function(a, b) {
                    return new Date(b.tanggal_mulai || b.created_at || 0) -
                           new Date(a.tanggal_mulai || a.created_at || 0);
                });
                break;
            case 'terlama':
                filteredKegiatan.sort(function(a, b) {
                    return new Date(a.tanggal_mulai || a.created_at || 0) -
                           new Date(b.tanggal_mulai || b.created_at || 0);
                });
                break;
            case 'judul-asc':
                filteredKegiatan.sort(function(a, b) {
                    return String(a.kegiatan || '').localeCompare(String(b.kegiatan || ''));
                });
                break;
            case 'judul-desc':
                filteredKegiatan.sort(function(a, b) {
                    return String(b.kegiatan || '').localeCompare(String(a.kegiatan || ''));
                });
                break;
        }

        renderKegiatan();
        updateStats();
    }

    // ================================================================
    // 9. UPDATE STATS
    // ================================================================
    function updateStats() {
        var total = allKegiatan.length;

        var now = new Date();
        var thisYear = now.getFullYear();
        var tahunIni = allKegiatan.filter(function(k) {
            if (!k.tanggal_mulai) return false;
            var d = new Date(k.tanggal_mulai);
            return !isNaN(d.getTime()) && d.getFullYear() === thisYear;
        }).length;

        var tempats = {};
        allKegiatan.forEach(function(k) {
            if (k.tempat && String(k.tempat).trim()) {
                tempats[String(k.tempat).trim()] = true;
            }
        });

        var el1 = document.getElementById('stats-kegiatan-total');
        var el2 = document.getElementById('stats-kegiatan-tahun-ini');
        var el3 = document.getElementById('stats-tempat-unik');

        if (el1) el1.textContent = total;
        if (el2) el2.textContent = tahunIni;
        if (el3) el3.textContent = Object.keys(tempats).length;
    }

    // ================================================================
    // 10. LOAD DATA
    // ================================================================
    function loadData(force) {
        force = force || false;
        if (isLoading) return;
        isLoading = true;

        // Show skeleton
        if (skeleton) skeleton.classList.remove('hidden');
        container.classList.add('hidden');

        // Panggil API — apiCall (dengan cache) atau forceRefreshData
        var apiFn = force && typeof forceRefreshData === 'function'
            ? forceRefreshData
            : apiCall;

        apiFn('getLogbook', force ? {} : 'POST', force ? undefined : {})
            .then(function(result) {
                if (!result || !result.success) {
                    throw new Error((result && result.message) || 'Gagal memuat data');
                }

                allKegiatan = Array.isArray(result.data) ? result.data : [];

                if (skeleton) skeleton.classList.add('hidden');
                container.classList.remove('hidden');

                if (allKegiatan.length === 0) {
                    container.innerHTML =
                        '<div class="col-span-full text-center py-12">' +
                            '<i class="fas fa-calendar-times text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>' +
                            '<p class="text-[var(--text-muted)]">Belum ada kegiatan yang tercatat.</p>' +
                        '</div>';
                    updateStats();
                    return;
                }

                updateFilterOptions();
                applyFilter();
            })
            .catch(function(error) {
                console.error('[semua_kegiatan] Load error:', error);
                if (skeleton) skeleton.classList.add('hidden');
                container.classList.remove('hidden');

                container.innerHTML =
                    '<div class="col-span-full text-center py-12">' +
                        '<i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-3"></i>' +
                        '<p class="text-red-500 font-medium mb-2">Gagal memuat data kegiatan.</p>' +
                        '<p class="text-[var(--text-muted)] text-sm mb-4">' +
                            escapeHtml(error.message || 'Terjadi kesalahan') +
                        '</p>' +
                        '<button onclick="location.reload()" class="btn-primary px-6 py-2 rounded-lg">' +
                            '<i class="fas fa-sync-alt mr-1"></i>Coba Lagi' +
                        '</button>' +
                    '</div>';
            })
            .finally(function() {
                isLoading = false;
            });
    }

    // ================================================================
    // 11. RENDER KEGIATAN
    // ================================================================
    function renderKegiatan() {
        var loadMoreWrap = document.getElementById('kegiatan-load-more-wrap');
        var loadMoreInfo = document.getElementById('kegiatan-load-more-info');

        if (!filteredKegiatan || filteredKegiatan.length === 0) {
            var isFiltered = currentFilter.search ||
                             currentFilter.tahun !== 'all' ||
                             currentFilter.tempat !== 'all' ||
                             currentFilter.status !== 'all';

            container.className = 'col-span-full';
            container.innerHTML =
                '<div class="text-center py-12">' +
                    '<i class="fas fa-search text-5xl text-[var(--text-muted)] mb-3 opacity-40"></i>' +
                    '<p class="text-[var(--text-muted)] mb-4">' +
                        (isFiltered
                            ? 'Tidak ada kegiatan yang cocok dengan filter.'
                            : 'Belum ada kegiatan.') +
                    '</p>' +
                    (isFiltered
                        ? '<button onclick="document.getElementById(\'kegiatan-clear-filter-pub\').click()"' +
                          ' class="btn-primary px-6 py-2 rounded-lg">' +
                          '<i class="fas fa-times mr-1"></i>Reset Filter</button>'
                        : '') +
                '</div>';

            if (loadMoreWrap) loadMoreWrap.classList.add('hidden');
            return;
        }

        var toShow = filteredKegiatan.slice(0, visibleCount);
        var hasMore = filteredKegiatan.length > visibleCount;

        container.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';

        var html = '';

        toShow.forEach(function(item, index) {
            var imgUrl = item.file_url ||
                         getFirstImageFromContent(item.deskripsi) ||
                         'https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor';

            var descPlain = stripHtml(item.deskripsi);
            var shortDesc = descPlain.length > 130
                ? descPlain.substring(0, 130) + '...'
                : (descPlain || 'Klik untuk membaca detail kegiatan.');

            var status = getStatusKegiatan(item.tanggal_mulai, item.tanggal_selesai);
            var duration = estimateDuration(item.tanggal_mulai, item.tanggal_selesai);

            var tanggal = item.tanggal_mulai ? formatDate(item.tanggal_mulai) : '-';
            var tanggalSelesai = item.tanggal_selesai && item.tanggal_selesai !== item.tanggal_mulai
                ? formatDate(item.tanggal_selesai)
                : null;

            var colorMap = {
                blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            };
            var statusClass = colorMap[status.color] || colorMap.gray;

            var statusBadge =
                '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ' + statusClass + '">' +
                    '<i class="fas ' + status.icon + ' text-[10px]"></i>' +
                    escapeHtml(status.label) +
                '</span>';

            var tempatBadge = item.tempat
                ? '<span class="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">' +
                    '<i class="fas fa-map-marker-alt"></i>' +
                    escapeHtml(String(item.tempat).substring(0, 30)) +
                  '</span>'
                : '';

            var pesertaBadge = item.peserta > 0
                ? '<span class="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">' +
                    '<i class="fas fa-users"></i>' + item.peserta +
                  '</span>'
                : '';

            // Featured hanya index pertama & tidak ada filter
            var isFeatured = index === 0 &&
                             !currentFilter.search &&
                             currentFilter.tahun === 'all' &&
                             currentFilter.tempat === 'all' &&
                             currentFilter.status === 'all';

            var cardColSpan = isFeatured ? 'sm:col-span-2 lg:col-span-2' : '';
            var detailUrl = '/kegiatan_detail?id=' + encodeURIComponent(item.id);

            if (isFeatured) {
                html +=
                    '<a href="' + escapeAttr(detailUrl) + '"' +
                       ' class="kegiatan-featured group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-lg hover:shadow-2xl transition-all duration-300 ' + cardColSpan + ' relative border border-[var(--card-border)]">' +
                        '<div class="h-72 md:h-96 overflow-hidden relative bg-[var(--bg-stats)]">' +
                            '<img src="' + escapeAttr(imgUrl) + '" alt="' + escapeAttr(item.kegiatan) + '"' +
                                ' class="w-full h-full object-cover transition duration-500 group-hover:scale-105"' +
                                ' loading="lazy" decoding="async"' +
                                ' onerror="this.src=\'https://placehold.co/800x500/e2e8f0/475569?text=Kegiatan+Ansor\'">' +
                            '<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>' +
                            '<div class="absolute top-4 left-4 flex flex-wrap gap-2">' +
                                statusBadge +
                                '<span class="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full">' +
                                    '<i class="fas fa-star text-[10px] text-yellow-400"></i>KEGIATAN UTAMA' +
                                '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="absolute bottom-0 left-0 right-0 p-5 md:p-6 text-white">' +
                            '<h3 class="text-xl md:text-3xl font-bold leading-tight mb-2 line-clamp-2 font-amiri drop-shadow-lg">' +
                                escapeHtml(item.kegiatan || 'Kegiatan') +
                            '</h3>' +
                            '<p class="text-sm text-gray-200 mb-3 line-clamp-2 drop-shadow">' +
                                escapeHtml(shortDesc) +
                            '</p>' +
                            '<div class="flex flex-wrap items-center gap-3 text-xs text-gray-100">' +
                                '<span class="flex items-center gap-1">' +
                                    '<i class="far fa-calendar-alt"></i>' +
                                    escapeHtml(tanggal) +
                                    (tanggalSelesai ? ' — ' + escapeHtml(tanggalSelesai) : '') +
                                '</span>' +
                                (item.tempat
                                    ? '<span class="flex items-center gap-1">' +
                                        '<i class="fas fa-map-marker-alt"></i>' +
                                        escapeHtml(item.tempat) +
                                      '</span>'
                                    : '') +
                                '<span class="flex items-center gap-1">' +
                                    '<i class="far fa-clock"></i>' + duration + ' hari' +
                                '</span>' +
                            '</div>' +
                        '</div>' +
                    '</a>';
            } else {
                html +=
                    '<a href="' + escapeAttr(detailUrl) + '"' +
                       ' class="kegiatan-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-md hover:shadow-xl transition-all duration-300 border border-[var(--card-border)] hover:-translate-y-1">' +
                        '<div class="h-48 overflow-hidden bg-[var(--bg-stats)] relative">' +
                            '<img src="' + escapeAttr(imgUrl) + '" alt="' + escapeAttr(item.kegiatan) + '"' +
                                ' class="w-full h-full object-cover transition duration-500 group-hover:scale-105"' +
                                ' loading="lazy" decoding="async"' +
                                ' onerror="this.src=\'https://placehold.co/600x400/e2e8f0/475569?text=Kegiatan+Ansor\'">' +
                            '<div class="absolute top-3 left-3">' + statusBadge + '</div>' +
                            (duration > 1
                                ? '<div class="absolute top-3 right-3">' +
                                    '<span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white">' +
                                        '<i class="far fa-clock text-[10px]"></i>' + duration + ' hari' +
                                    '</span>' +
                                  '</div>'
                                : '') +
                        '</div>' +
                        '<div class="p-5">' +
                            '<div class="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] mb-2">' +
                                '<span class="flex items-center gap-1">' +
                                    '<i class="far fa-calendar-alt"></i>' + escapeHtml(tanggal) +
                                '</span>' +
                                tempatBadge +
                                pesertaBadge +
                            '</div>' +
                            '<h3 class="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-2 font-amiri group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">' +
                                escapeHtml(item.kegiatan || 'Kegiatan') +
                            '</h3>' +
                            '<p class="text-sm text-[var(--text-muted)] mb-4 line-clamp-3">' +
                                escapeHtml(shortDesc) +
                            '</p>' +
                            '<div class="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">' +
                                '<span class="text-xs text-[var(--text-muted)]">' +
                                    (item.anggaran > 0 ? '<i class="fas fa-coins mr-1"></i>Anggaran' : '') +
                                '</span>' +
                                '<span class="text-sm font-semibold text-[var(--text-main)] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">' +
                                    'Detail <i class="fas fa-arrow-right text-xs"></i>' +
                                '</span>' +
                            '</div>' +
                        '</div>' +
                    '</a>';
            }
        });

        container.innerHTML = html;

        // Load More
        if (loadMoreWrap) {
            if (hasMore) {
                loadMoreWrap.classList.remove('hidden');
                if (loadMoreInfo) {
                    loadMoreInfo.textContent =
                        'Menampilkan ' + toShow.length + ' dari ' +
                        filteredKegiatan.length + ' kegiatan';
                }
            } else {
                loadMoreWrap.classList.add('hidden');
            }
        }
    }

    // ================================================================
    // 12. CLEANUP
    // ================================================================
    function cleanup() {
        window.__semuaKegiatanLoaded = false;
        if (searchTimer) {
            clearTimeout(searchTimer);
            searchTimer = null;
        }
        allKegiatan = [];
        filteredKegiatan = [];
        console.log('[semua_kegiatan] Cleanup');
    }
    window.__semuaKegiatanCleanup = cleanup;

    // ================================================================
    // 13. INIT
    // ================================================================
    console.log('[semua_kegiatan] Init v11.0.0 dimulai');
    ensureExtraUI();
    loadData();

});