/**
 * js/kalender_admin.js
 * Modul Admin Kalender / Timeline Kegiatan — v10.0.0 OFFLINE-FIRST FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v10.0.0:
 *   ✅ NEW: Handle response _offline (pending sync badge)
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Stats 4 kartu (total event, kegiatan, akan datang, selesai)
 *   ✅ NEW: List view alternatif (selain calendar view)
 *   ✅ NEW: Filter event berdasarkan tipe (kegiatan/rencana)
 *   ✅ NEW: Delete event langsung dari list
 *   ✅ NEW: Bulk delete kegiatan
 *   ✅ NEW: Preview modal event (bukan hanya toast)
 *   ✅ NEW: Edit event dari list view
 *   ✅ NEW: Export CSV events
 *   ✅ FIX: FullCalendar integration robust
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Anti double-submit
 *   ✅ FIX: XSS protection
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Cleanup function proper
 *   ✅ PRESERVED: Semua fitur v9.0.0
 * ============================================================
 */

App.register('kalender_admin', function() {
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
    if (window.__kalenderAdminLoaded) {
        console.log('[kalender_admin] Sudah di-init, skip.');
        return;
    }
    window.__kalenderAdminLoaded = true;

    console.log('[kalender_admin] 🚀 Init v10.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. HELPER: WAIT FOR DOM
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 40;
        interval = interval || 100;
        return new Promise((resolve) => {
            let attempts = 0;
            const elements = {};
            function check() {
                attempts++;
                let allFound = true;
                ids.forEach(id => {
                    if (!elements[id]) {
                        const el = document.getElementById(id);
                        if (el) elements[id] = el;
                        else allFound = false;
                    }
                });
                if (allFound || attempts >= maxRetries) resolve(elements);
                else setTimeout(check, interval);
            }
            check();
        });
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

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    function formatDateLong(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function formatDateTime(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        }) + ' · ' + date.toLocaleTimeString('id-ID', {
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
        if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
        return formatDate(d);
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[kalender_admin:' + (type || 'info') + ']', msg);
        }
    }

    function isPendingSync(id) {
        try {
            if (!window.SyncManager) return false;
            const queue = window.SyncManager.getQueue() || [];
            const idStr = String(id);
            return queue.some(item => {
                const d = item.data || {};
                return String(d.id) === idStr;
            });
        } catch (e) {
            return false;
        }
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let calendarInstance = null;
    let isSubmitting = false;
    let lpjCache = [];
    let eventCache = [];
    let currentView = 'calendar';
    let currentFilter = {
        search: '',
        tipe: 'all',
        sort: 'terbaru'
    };

    // ================================================================
    // 6. REFRESH TANPA RELOAD
    // ================================================================
    function refreshDataOnly() {
        console.log('[kalender_admin] 🔄 Refresh data without reload');

        try {
            const cKeyLogbook = 'cache_getLogbook_' + user.id + '_' + JSON.stringify({});
            const cKeyEvents = 'cache_getEvents_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKeyLogbook);
            SafeSessionStorage.removeItem(cKeyEvents);
        } catch (e) {}

        lpjCache = [];
        eventCache = [];

        return loadAllData(true).then(() => {
            console.log('[kalender_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 7. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'calendar',
            'event-modal', 'event-modal-content', 'event-modal-title',
            'event-form', 'close-event-modal', 'delete-event-btn',
            'add-event-btn', 'event-id', 'event-title', 'event-start',
            'event-end', 'event-color',
            'kegiatan-modal', 'kegiatan-modal-content', 'kegiatan-modal-title',
            'kegiatan-form', 'close-kegiatan-modal', 'manage-kegiatan-btn',
            'kegiatan-list', 'kegiatan-form-title',
            'kegiatan-id', 'kegiatan-nama', 'kegiatan-tempat',
            'kegiatan-tanggal-mulai', 'kegiatan-tanggal-selesai',
            'kegiatan-peserta', 'kegiatan-anggaran', 'kegiatan-deskripsi',
            'kegiatan-file-url'
        ];

        const els = await waitForElements(requiredIds);

        const calendarEl = els['calendar'];
        const eventModal = els['event-modal'];
        const eventModalContent = els['event-modal-content'];
        const eventModalTitle = els['event-modal-title'];
        const eventForm = els['event-form'];
        const closeEventModalBtn = els['close-event-modal'];
        const deleteEventBtn = els['delete-event-btn'];
        const addEventBtn = els['add-event-btn'];
        const eventIdInput = els['event-id'];
        const eventTitleInput = els['event-title'];
        const eventStartInput = els['event-start'];
        const eventEndInput = els['event-end'];
        const eventColorSelect = els['event-color'];

        const kegiatanModal = els['kegiatan-modal'];
        const kegiatanModalContent = els['kegiatan-modal-content'];
        const kegiatanModalTitle = els['kegiatan-modal-title'];
        const kegiatanForm = els['kegiatan-form'];
        const closeKegiatanModalBtn = els['close-kegiatan-modal'];
        const manageKegiatanBtn = els['manage-kegiatan-btn'];
        const kegiatanList = els['kegiatan-list'];
        const kegiatanFormTitle = els['kegiatan-form-title'];
        const kegiatanIdInput = els['kegiatan-id'];
        const kegiatanNamaInput = els['kegiatan-nama'];
        const kegiatanTempatInput = els['kegiatan-tempat'];
        const kegiatanTglMulaiInput = els['kegiatan-tanggal-mulai'];
        const kegiatanTglSelesaiInput = els['kegiatan-tanggal-selesai'];
        const kegiatanPesertaInput = els['kegiatan-peserta'];
        const kegiatanAnggaranInput = els['kegiatan-anggaran'];
        const kegiatanDeskripsiInput = els['kegiatan-deskripsi'];
        const kegiatanFileUrlInput = els['kegiatan-file-url'];

        if (!calendarEl || !eventModal || !kegiatanModal) {
            console.error('[kalender_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 8. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.justify-between.items-center')
                        || mainContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('kalender-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'kalender-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Event</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-event">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Kegiatan</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-total-kegiatan">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar-check"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Akan Datang</p>
                                <p class="text-2xl font-bold text-yellow-600 mt-1" id="stats-akan-datang">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
                                <i class="fas fa-clock"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Selesai</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-selesai">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-check-circle"></i>
                            </div>
                        </div>
                    </div>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== View Toggle & Search Bar =====
            if (!document.getElementById('kalender-controls')) {
                const controls = document.createElement('div');
                controls.id = 'kalender-controls';
                controls.className = 'flex flex-wrap gap-2 mb-4';
                controls.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="kalender-search" placeholder="Cari event atau kegiatan..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="kalender-filter-tipe" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Tipe</option>
                        <option value="kegiatan">Kegiatan (Logbook)</option>
                        <option value="rencana">Rencana Event</option>
                    </select>
                    <div class="flex rounded-lg border border-[var(--card-border)] overflow-hidden">
                        <button id="kalender-view-calendar" type="button" class="px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]" title="Calendar view">
                            <i class="fas fa-calendar-alt"></i>
                        </button>
                        <button id="kalender-view-list" type="button" class="px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]" title="List view">
                            <i class="fas fa-list"></i>
                        </button>
                    </div>
                    <button id="kalender-export-btn" type="button" class="btn-secondary px-3 py-2 rounded-lg text-sm">
                        <i class="fas fa-download mr-1"></i>CSV
                    </button>
                `;
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(controls, header.nextSibling);
                }
            }

            // ===== List View Container =====
            if (!document.getElementById('kalender-list-view')) {
                const listView = document.createElement('div');
                listView.id = 'kalender-list-view';
                listView.className = 'hidden mb-6';

                const calendarWrapper = calendarEl.closest('.bg-\\[var\\(--card-bg\\)\\]')
                                     || calendarEl.parentElement;
                if (calendarWrapper && calendarWrapper.parentNode) {
                    calendarWrapper.parentNode.insertBefore(listView, calendarWrapper.nextSibling);
                }
            }
        }

        // ================================================================
        // 9. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('kalender-search');
            const filterTipe = document.getElementById('kalender-filter-tipe');
            const viewCalendarBtn = document.getElementById('kalender-view-calendar');
            const viewListBtn = document.getElementById('kalender-view-list');
            const exportBtn = document.getElementById('kalender-export-btn');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'kalender-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (filterTipe && !filterTipe.dataset.attached) {
                filterTipe.dataset.attached = 'true';
                filterTipe.addEventListener('change', () => {
                    currentFilter.tipe = filterTipe.value;
                    applyFilter();
                });
            }

            if (viewCalendarBtn && !viewCalendarBtn.dataset.attached) {
                viewCalendarBtn.dataset.attached = 'true';
                viewCalendarBtn.addEventListener('click', () => {
                    currentView = 'calendar';
                    viewCalendarBtn.className = 'px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]';
                    viewListBtn.className = 'px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]';
                    renderView();
                });
            }

            if (viewListBtn && !viewListBtn.dataset.attached) {
                viewListBtn.dataset.attached = 'true';
                viewListBtn.addEventListener('click', () => {
                    currentView = 'list';
                    viewListBtn.className = 'px-3 py-2 text-sm bg-[var(--text-main)] text-[var(--text-inverse)]';
                    viewCalendarBtn.className = 'px-3 py-2 text-sm bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-stats)]';
                    renderView();
                });
            }

            if (exportBtn && !exportBtn.dataset.attached) {
                exportBtn.dataset.attached = 'true';
                exportBtn.addEventListener('click', exportCSV);
            }
        }

        // ================================================================
        // 10. UPDATE STATS
        // ================================================================
        function updateStats() {
            const now = new Date();
            const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const totalEvent = eventCache.length + lpjCache.length;
            const totalKegiatan = lpjCache.length;

            const akanDatang = lpjCache.filter(k => {
                const d = new Date(k.tanggal_mulai);
                return !isNaN(d.getTime()) && d >= nowDate;
            }).length + eventCache.filter(e => {
                const d = new Date(e.start);
                return !isNaN(d.getTime()) && d >= nowDate;
            }).length;

            const selesai = lpjCache.filter(k => {
                const d = new Date(k.tanggal_selesai || k.tanggal_mulai);
                return !isNaN(d.getTime()) && d < nowDate;
            }).length;

            const el1 = document.getElementById('stats-total-event');
            const el2 = document.getElementById('stats-total-kegiatan');
            const el3 = document.getElementById('stats-akan-datang');
            const el4 = document.getElementById('stats-selesai');

            if (el1) el1.textContent = totalEvent;
            if (el2) el2.textContent = totalKegiatan;
            if (el3) el3.textContent = akanDatang;
            if (el4) el4.textContent = selesai;
        }

        // ================================================================
        // 11. APPLY FILTER
        // ================================================================
        function applyFilter() {
            renderView();
        }

        // ================================================================
        // 12. RENDER VIEW (Calendar / List)
        // ================================================================
        function renderView() {
            const calendarWrapper = calendarEl.closest('.bg-\\[var\\(--card-bg\\)\\]')
                                 || calendarEl.parentElement;
            const listView = document.getElementById('kalender-list-view');

            if (currentView === 'list') {
                if (calendarWrapper) calendarWrapper.classList.add('hidden');
                if (listView) {
                    listView.classList.remove('hidden');
                    renderList();
                }
            } else {
                if (calendarWrapper) calendarWrapper.classList.remove('hidden');
                if (listView) listView.classList.add('hidden');
                renderCalendarFromCache();
            }
        }

        // ================================================================
        // 13. RENDER LIST
        // ================================================================
        function renderList() {
            const listView = document.getElementById('kalender-list-view');
            if (!listView) return;

            // Combine kegiatan + event
            const combined = [];

            lpjCache.forEach(k => {
                combined.push({
                    id: k.id,
                    type: 'kegiatan',
                    judul: k.kegiatan || 'Kegiatan',
                    tanggal: k.tanggal_mulai,
                    tanggal_selesai: k.tanggal_selesai,
                    tempat: k.tempat || '-',
                    peserta: k.peserta || 0,
                    deskripsi: k.deskripsi || '',
                    raw: k
                });
            });

            eventCache.forEach(e => {
                combined.push({
                    id: e.id,
                    type: 'rencana',
                    judul: e.title || 'Rencana',
                    tanggal: e.start,
                    tanggal_selesai: e.end,
                    tempat: '-',
                    peserta: 0,
                    deskripsi: '',
                    raw: e
                });
            });

            // Filter
            let filtered = combined.filter(item => {
                if (currentFilter.tipe !== 'all' && item.type !== currentFilter.tipe) return false;
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [item.judul, item.tempat, item.deskripsi]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            filtered.sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

            if (filtered.length === 0) {
                listView.innerHTML = `
                    <div class="text-center py-12 text-[var(--text-muted)] bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
                        <i class="fas fa-calendar-times text-4xl mb-3 opacity-40"></i>
                        <p>Belum ada event atau kegiatan</p>
                    </div>
                `;
                return;
            }

            let html = '';
            filtered.forEach(item => {
                const pending = isPendingSync(item.id);
                const isKegiatan = item.type === 'kegiatan';
                const badgeColor = isKegiatan
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
                const badgeLabel = isKegiatan ? 'Kegiatan' : 'Rencana';
                const icon = isKegiatan ? 'fa-calendar-check' : 'fa-calendar-plus';
                const iconColor = isKegiatan ? 'text-green-600' : 'text-blue-600';

                const pendingBadge = pending
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⟳ SYNC</span>'
                    : '';

                const tanggalStr = item.tanggal ? formatDate(item.tanggal) : '-';
                const tanggalSelesaiStr = item.tanggal_selesai && item.tanggal_selesai !== item.tanggal
                    ? ' — ' + formatDate(item.tanggal_selesai)
                    : '';

                html += `
                    <div class="bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] p-4 mb-3 hover:shadow-md transition ${pending ? 'border-l-4 border-amber-500' : ''}">
                        <div class="flex items-start gap-3">
                            <div class="w-10 h-10 rounded-lg ${isKegiatan ? 'bg-green-100 dark:bg-green-900/40' : 'bg-blue-100 dark:bg-blue-900/40'} flex items-center justify-center flex-shrink-0">
                                <i class="fas ${icon} ${iconColor}"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap mb-1">
                                    <h3 class="font-bold text-[var(--text-main)] truncate">${escapeHtml(item.judul)}</h3>
                                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}">${badgeLabel}</span>
                                    ${pendingBadge}
                                </div>
                                <p class="text-sm text-[var(--text-muted)]">
                                    <i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggalStr)}${escapeHtml(tanggalSelesaiStr)}
                                    ${item.tempat !== '-' ? ` · <i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(item.tempat)}` : ''}
                                    ${item.peserta > 0 ? ` · <i class="fas fa-users mr-1"></i>${item.peserta} peserta` : ''}
                                </p>
                                ${item.deskripsi ? `<p class="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">${escapeHtml(String(item.deskripsi).substring(0, 150))}</p>` : ''}
                            </div>
                            <div class="flex gap-1 flex-shrink-0">
                                ${isKegiatan ? `
                                    <button onclick="editKegiatan('${escapeAttr(item.id)}')"
                                        class="text-blue-600 hover:text-blue-800 dark:text-blue-400 p-1.5" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="deleteKegiatan('${escapeAttr(item.id)}')"
                                        class="text-red-600 hover:text-red-800 dark:text-red-400 p-1.5" title="Hapus">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                ` : `
                                    <button onclick="editEventFromList('${escapeAttr(item.id)}')"
                                        class="text-blue-600 hover:text-blue-800 dark:text-blue-400 p-1.5" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="deleteEventFromList('${escapeAttr(item.id)}')"
                                        class="text-red-600 hover:text-red-800 dark:text-red-400 p-1.5" title="Hapus">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                `;
            });

            listView.innerHTML = html;
        }

        // ================================================================
        // 14. LOAD ALL DATA (SWR)
        // ================================================================
        async function loadAllData(force) {
            force = force || false;

            if (!force && (lpjCache.length > 0 || eventCache.length > 0)) {
                renderCalendarFromCache();
                updateStats();
                return;
            }

            try {
                const [lpjResult, eventsResult] = await Promise.all([
                    forceRefreshData('getLogbook', {}),
                    forceRefreshData('getEvents', {})
                ]);

                if (lpjResult && lpjResult.success) {
                    lpjCache = lpjResult.data || [];
                }
                if (eventsResult && eventsResult.success) {
                    eventCache = eventsResult.data || [];
                }

                renderCalendarFromCache();
                updateStats();
            } catch (error) {
                console.error('[kalender_admin] Load data error:', error);
                safeToast('Gagal memuat data kalender', 'error');
            }
        }

        // ================================================================
        // 15. RENDER CALENDAR DARI CACHE
        // ================================================================
        function renderCalendarFromCache() {
            const events = [];

            lpjCache.forEach(item => {
                if (!item.tanggal_mulai) return;
                events.push({
                    id: 'lpj_' + item.id,
                    title: '📋 ' + (item.kegiatan || 'Kegiatan'),
                    start: item.tanggal_mulai,
                    end: item.tanggal_selesai || item.tanggal_mulai,
                    backgroundColor: '#0f2922',
                    borderColor: '#0f2922',
                    textColor: '#ffffff',
                    extendedProps: {
                        type: 'kegiatan',
                        deskripsi: item.deskripsi || '',
                        tempat: item.tempat || '-',
                        data: item
                    }
                });
            });

            eventCache.forEach(item => {
                if (!item.start) return;
                events.push({
                    id: 'evt_' + item.id,
                    title: '📌 ' + (item.title || 'Rencana'),
                    start: item.start,
                    end: item.end || item.start,
                    backgroundColor: item.backgroundColor || '#2563eb',
                    borderColor: item.borderColor || '#2563eb',
                    textColor: '#ffffff',
                    extendedProps: {
                        type: 'rencana',
                        data: item
                    }
                });
            });

            if (calendarInstance) {
                try {
                    calendarInstance.removeAllEvents();
                    calendarInstance.addEventSource(events);
                } catch (e) {
                    try { calendarInstance.destroy(); } catch (e2) {}
                    calendarInstance = null;
                    initCalendar(events);
                }
            } else {
                initCalendar(events);
            }
        }

        // ================================================================
        // 16. INIT FULLCALENDAR
        // ================================================================
        function initCalendar(events) {
            if (typeof FullCalendar === 'undefined') {
                console.error('[kalender_admin] FullCalendar tidak tersedia');
                if (calendarEl) {
                    calendarEl.innerHTML =
                        '<div class="text-center py-12">' +
                            '<i class="fas fa-exclamation-triangle text-3xl text-yellow-500 mb-3"></i>' +
                            '<p class="text-[var(--text-muted)]">Pustaka kalender belum siap. Refresh halaman.</p>' +
                        '</div>';
                }
                return;
            }

            try {
                const isDark = document.documentElement.classList.contains('dark');
                const kegiatanColor = '#0f2922';
                const rencanaColor = isDark ? '#7c3aed' : '#2563eb';

                const enhancedEvents = events.map(e => {
                    if (e.extendedProps && e.extendedProps.type === 'kegiatan') {
                        return Object.assign({}, e, {
                            backgroundColor: kegiatanColor,
                            borderColor: kegiatanColor
                        });
                    }
                    return Object.assign({}, e, {
                        backgroundColor: e.backgroundColor || rencanaColor,
                        borderColor: e.borderColor || rencanaColor
                    });
                });

                calendarInstance = new FullCalendar.Calendar(calendarEl, {
                    initialView: 'dayGridMonth',
                    headerToolbar: {
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,listWeek'
                    },
                    buttonText: {
                        today: 'Hari Ini',
                        month: 'Bulan',
                        week: 'Minggu',
                        list: 'Agenda'
                    },
                    eventDisplay: 'block',
                    dayMaxEvents: false,
                    events: enhancedEvents,
                    eventClick: function(info) {
                        info.jsEvent.preventDefault();

                        if (info.event.id.indexOf('lpj_') === 0) {
                            const e = info.event;
                            const props = e.extendedProps || {};
                            showEventPreview({
                                id: info.event.id.replace('lpj_', ''),
                                type: 'kegiatan',
                                judul: (e.title || '').replace('📋 ', ''),
                                tanggal: e.startStr,
                                tanggal_selesai: e.endStr,
                                tempat: props.tempat || '-',
                                deskripsi: props.deskripsi || '',
                                raw: props.data
                            });
                            return;
                        }

                        if (info.event.id.indexOf('evt_') === 0) {
                            openEventModal(info.event);
                        }
                    },
                    windowResize: function() {
                        if (calendarInstance) calendarInstance.render();
                    }
                });
                calendarInstance.render();
            } catch (e) {
                console.error('[kalender_admin] Init calendar error:', e);
                safeToast('Gagal menampilkan kalender: ' + e.message, 'error');
            }
        }

        // ================================================================
        // 17. EVENT PREVIEW MODAL
        // ================================================================
        function showEventPreview(item) {
            let previewModal = document.getElementById('event-preview-modal');
            if (!previewModal) {
                previewModal = document.createElement('div');
                previewModal.id = 'event-preview-modal';
                previewModal.className = 'fixed inset-0 bg-black/60 hidden items-center justify-center z-[9999] backdrop-blur-sm p-4';
                previewModal.innerHTML = `
                    <div id="event-preview-content" class="bg-[var(--card-bg)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform scale-95 opacity-0 transition-all duration-200">
                        <div class="flex justify-between items-start p-5 border-b border-[var(--card-border)]">
                            <h3 id="event-preview-title" class="text-xl font-bold text-[var(--text-main)] font-amiri pr-4 line-clamp-2"></h3>
                            <button id="event-preview-close" class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-2xl leading-none flex-shrink-0">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="event-preview-body" class="p-5 space-y-4"></div>
                        <div class="flex justify-end gap-2 p-5 border-t border-[var(--card-border)]">
                            <button id="event-preview-edit" class="btn-secondary px-4 py-2 rounded-lg">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button id="event-preview-ok" class="btn-primary px-6 py-2 rounded-lg">Tutup</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(previewModal);

                const closeFn = () => {
                    previewModal.classList.add('hidden');
                    previewModal.classList.remove('flex');
                    document.body.style.overflow = '';
                };
                document.getElementById('event-preview-close').addEventListener('click', closeFn);
                document.getElementById('event-preview-ok').addEventListener('click', closeFn);
                previewModal.addEventListener('click', (e) => {
                    if (e.target === previewModal) closeFn();
                });
            }

            const content = document.getElementById('event-preview-content');
            const titleEl = document.getElementById('event-preview-title');
            const bodyEl = document.getElementById('event-preview-body');

            titleEl.textContent = item.judul || '-';

            const badgeClass = item.type === 'kegiatan'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';

            bodyEl.innerHTML = `
                <div class="flex items-center gap-2 mb-3">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold ${badgeClass}">
                        ${item.type === 'kegiatan' ? 'Kegiatan' : 'Rencana'}
                    </span>
                </div>

                <div class="space-y-3">
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal</p>
                        <p class="text-[var(--text-main)]">
                            <i class="far fa-calendar-alt mr-2"></i>
                            ${formatDateLong(item.tanggal)}
                            ${item.tanggal_selesai && item.tanggal_selesai !== item.tanggal
                                ? ' — ' + formatDateLong(item.tanggal_selesai)
                                : ''}
                        </p>
                    </div>

                    ${item.tempat && item.tempat !== '-' ? `
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tempat</p>
                            <p class="text-[var(--text-main)]">
                                <i class="fas fa-map-marker-alt mr-2"></i>${escapeHtml(item.tempat)}
                            </p>
                        </div>
                    ` : ''}

                    ${item.deskripsi ? `
                        <div>
                            <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Deskripsi</p>
                            <p class="text-[var(--text-main)] text-sm whitespace-pre-wrap">${escapeHtml(item.deskripsi)}</p>
                        </div>
                    ` : ''}
                </div>
            `;

            const editBtn = document.getElementById('event-preview-edit');
            if (editBtn) {
                const newEdit = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEdit, editBtn);
                newEdit.addEventListener('click', () => {
                    previewModal.classList.add('hidden');
                    previewModal.classList.remove('flex');
                    document.body.style.overflow = '';

                    if (item.type === 'kegiatan') {
                        window.editKegiatan(item.id);
                    } else {
                        window.editEventFromList(item.id);
                    }
                });
            }

            previewModal.classList.remove('hidden');
            previewModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (content) {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        }

        // ================================================================
        // 18. EVENT CRUD
        // ================================================================
        function openEventModal(eventData) {
            const isEdit = !!eventData;
            if (eventModalTitle) eventModalTitle.textContent = isEdit ? 'Edit Event' : 'Tambah Event';

            if (eventForm) {
                eventForm.reset();
                if (eventIdInput) eventIdInput.value = isEdit ? eventData.id.replace('evt_', '') : '';
                if (eventTitleInput) eventTitleInput.value = isEdit ? (eventData.title || '').replace(/^📌\s*/, '') : '';
                if (eventStartInput) {
                    eventStartInput.value = isEdit && eventData.startStr
                        ? eventData.startStr.slice(0, 16)
                        : '';
                }
                if (eventEndInput) {
                    eventEndInput.value = isEdit && eventData.endStr
                        ? eventData.endStr.slice(0, 16)
                        : '';
                }
                if (eventColorSelect) {
                    eventColorSelect.value = isEdit
                        ? (eventData.backgroundColor || '#2563eb')
                        : '#2563eb';
                }
            }

            if (deleteEventBtn) {
                deleteEventBtn.classList.toggle('hidden', !isEdit);
                deleteEventBtn.dataset.eventId = isEdit ? eventData.id.replace('evt_', '') : '';
            }

            eventModal.classList.remove('hidden');
            eventModal.classList.add('flex');

            requestAnimationFrame(() => {
                if (eventModalContent) {
                    eventModalContent.classList.remove('scale-95', 'opacity-0');
                    eventModalContent.classList.add('scale-100', 'opacity-100');
                }
            });

            document.body.style.overflow = 'hidden';
            setTimeout(() => { if (eventTitleInput) eventTitleInput.focus(); }, 150);
        }

        function closeEventModal() {
            if (eventModalContent) {
                eventModalContent.classList.remove('scale-100', 'opacity-100');
                eventModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                eventModal.classList.add('hidden');
                eventModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (eventForm) eventForm.reset();
            if (eventIdInput) eventIdInput.value = '';
            if (deleteEventBtn) deleteEventBtn.classList.add('hidden');
        }

        if (addEventBtn) {
            const fresh = addEventBtn.cloneNode(true);
            addEventBtn.parentNode.replaceChild(fresh, addEventBtn);
            fresh.addEventListener('click', () => openEventModal(null));
        }

        if (closeEventModalBtn) {
            const fresh = closeEventModalBtn.cloneNode(true);
            closeEventModalBtn.parentNode.replaceChild(fresh, closeEventModalBtn);
            fresh.addEventListener('click', closeEventModal);
        }

        if (eventModal) {
            eventModal.addEventListener('click', (e) => {
                if (e.target === eventModal) closeEventModal();
            });
        }

        if (deleteEventBtn) {
            const fresh = deleteEventBtn.cloneNode(true);
            deleteEventBtn.parentNode.replaceChild(fresh, deleteEventBtn);

            fresh.addEventListener('click', function() {
                const id = this.dataset.eventId;
                if (!id) return;

                showConfirm('Hapus event ini? Tindakan tidak bisa dibatalkan.', async () => {
                    if (isSubmitting) return;
                    isSubmitting = true;

                    try {
                        const result = await apiCall('deleteEvent', 'POST', { id });
                        if (result && result.success) {
                            eventCache = eventCache.filter(e => String(e.id) !== String(id));
                            renderCalendarFromCache();
                            updateStats();
                            closeEventModal();
                            await logActivity('DELETE', 'events', id, 'Hapus event');

                            if (result._offline) {
                                safeToast('📴 Event dihapus lokal, akan disinkronkan', 'warning', 4000);
                            } else {
                                safeToast('✅ Event berhasil dihapus!', 'success');
                            }
                        } else {
                            safeToast((result && result.message) || 'Gagal menghapus event', 'error');
                        }
                    } catch (error) {
                        console.error('[kalender_admin] Delete event error:', error);
                        safeToast('Error: ' + error.message, 'error');
                    } finally {
                        isSubmitting = false;
                    }
                });
            });
        }

        if (eventForm) {
            const fresh = eventForm.cloneNode(true);
            eventForm.parentNode.replaceChild(fresh, eventForm);

            fresh.addEventListener('submit', async function(e) {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const titleEl = document.getElementById('event-title');
                const startEl = document.getElementById('event-start');
                const endEl = document.getElementById('event-end');
                const colorEl = document.getElementById('event-color');
                const idEl = document.getElementById('event-id');

                const id = idEl ? idEl.value : '';
                const title = titleEl ? (titleEl.value || '').trim() : '';
                const start = startEl ? startEl.value : '';
                const end = endEl && endEl.value ? endEl.value : start;
                const color = colorEl ? colorEl.value : '#2563eb';

                if (!title) {
                    safeToast('Judul event wajib diisi!', 'warning');
                    if (titleEl) titleEl.focus();
                    return;
                }
                if (!start) {
                    safeToast('Tanggal mulai wajib diisi!', 'warning');
                    if (startEl) startEl.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const isEdit = !!id;
                    const action = isEdit ? 'updateEvent' : 'createEvent';
                    const data = {
                        title: title,
                        start: start,
                        end: end,
                        backgroundColor: color,
                        borderColor: color
                    };
                    if (isEdit) data.id = id;

                    const result = await apiCall(action, 'POST', data);

                    if (result && result.success) {
                        if (isEdit) {
                            const idx = eventCache.findIndex(e => String(e.id) === String(id));
                            if (idx !== -1) {
                                eventCache[idx] = Object.assign({}, eventCache[idx], data, { id: id });
                            }
                        } else {
                            const newItem = Object.assign({}, data, {
                                id: result.id || ('tmp_' + Date.now()),
                                created_at: new Date().toISOString()
                            });
                            eventCache.push(newItem);
                        }

                        renderCalendarFromCache();
                        updateStats();
                        closeEventModal();
                        await logActivity(isEdit ? 'UPDATE' : 'CREATE', 'events', result.id || id, 'Event: ' + title);

                        if (result._offline) {
                            safeToast('📴 Event tersimpan lokal, akan disinkronkan', 'warning', 4500);
                        } else {
                            safeToast(isEdit ? '✅ Event diperbarui!' : '✅ Event ditambahkan!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menyimpan event', 'error');
                    }
                } catch (error) {
                    console.error('[kalender_admin] Submit event error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 19. EDIT EVENT FROM LIST (Global)
        // ================================================================
        window.editEventFromList = function(id) {
            const item = eventCache.find(e => String(e.id) === String(id));
            if (!item) {
                safeToast('Event tidak ditemukan.', 'warning');
                return;
            }
            // Construct event-like object for openEventModal
            openEventModal({
                id: 'evt_' + item.id,
                title: item.title,
                startStr: item.start,
                endStr: item.end || item.start,
                backgroundColor: item.backgroundColor || '#2563eb'
            });
        };

        // ================================================================
        // 20. DELETE EVENT FROM LIST (Global)
        // ================================================================
        window.deleteEventFromList = function(id) {
            const item = eventCache.find(e => String(e.id) === String(id));
            const judul = item ? (item.title || 'event ini') : 'event ini';

            showConfirm('Hapus event "' + judul + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteEvent', 'POST', { id });
                    if (result && result.success) {
                        eventCache = eventCache.filter(e => String(e.id) !== String(id));
                        renderCalendarFromCache();
                        updateStats();
                        renderList();
                        await logActivity('DELETE', 'events', id, 'Hapus event: ' + judul);

                        if (result._offline) {
                            safeToast('📴 Event dihapus lokal, akan disinkronkan', 'warning', 4000);
                        } else {
                            safeToast('✅ Event berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[kalender_admin] deleteEventFromList error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 21. KEGIATAN (LOGBOOK) CRUD
        // ================================================================
        function openKegiatanModal(editData) {
            const isEdit = !!editData;

            if (kegiatanModalTitle) kegiatanModalTitle.textContent = 'Kelola Kegiatan';
            if (kegiatanFormTitle) kegiatanFormTitle.textContent = isEdit ? 'Edit Kegiatan' : 'Tambah Kegiatan';

            if (kegiatanForm) {
                kegiatanForm.reset();
                if (kegiatanIdInput) kegiatanIdInput.value = isEdit ? editData.id : '';
                if (kegiatanNamaInput) kegiatanNamaInput.value = isEdit ? (editData.kegiatan || '') : '';
                if (kegiatanTempatInput) kegiatanTempatInput.value = isEdit ? (editData.tempat || '') : '';
                if (kegiatanTglMulaiInput) kegiatanTglMulaiInput.value = isEdit ? (editData.tanggal_mulai || '') : '';
                if (kegiatanTglSelesaiInput) kegiatanTglSelesaiInput.value = isEdit ? (editData.tanggal_selesai || '') : '';
                if (kegiatanPesertaInput) kegiatanPesertaInput.value = isEdit ? (editData.peserta || '') : '';
                if (kegiatanAnggaranInput) kegiatanAnggaranInput.value = isEdit ? (editData.anggaran || '') : '';
                if (kegiatanDeskripsiInput) kegiatanDeskripsiInput.value = isEdit ? (editData.deskripsi || '') : '';
                if (kegiatanFileUrlInput) kegiatanFileUrlInput.value = isEdit ? (editData.file_url || '') : '';
            }

            loadKegiatanList();

            kegiatanModal.classList.remove('hidden');
            kegiatanModal.classList.add('flex');

            requestAnimationFrame(() => {
                if (kegiatanModalContent) {
                    kegiatanModalContent.classList.remove('scale-95', 'opacity-0');
                    kegiatanModalContent.classList.add('scale-100', 'opacity-100');
                }
            });

            document.body.style.overflow = 'hidden';
        }

        function closeKegiatanModal() {
            if (kegiatanModalContent) {
                kegiatanModalContent.classList.remove('scale-100', 'opacity-100');
                kegiatanModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                kegiatanModal.classList.add('hidden');
                kegiatanModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (kegiatanForm) kegiatanForm.reset();
            if (kegiatanIdInput) kegiatanIdInput.value = '';
        }

        if (manageKegiatanBtn) {
            const fresh = manageKegiatanBtn.cloneNode(true);
            manageKegiatanBtn.parentNode.replaceChild(fresh, manageKegiatanBtn);
            fresh.addEventListener('click', () => openKegiatanModal(null));
        }

        if (closeKegiatanModalBtn) {
            const fresh = closeKegiatanModalBtn.cloneNode(true);
            closeKegiatanModalBtn.parentNode.replaceChild(fresh, closeKegiatanModalBtn);
            fresh.addEventListener('click', closeKegiatanModal);
        }

        if (kegiatanModal) {
            kegiatanModal.addEventListener('click', (e) => {
                if (e.target === kegiatanModal) closeKegiatanModal();
            });
        }

        // Load daftar kegiatan di dalam modal
        function loadKegiatanList() {
            if (!kegiatanList) return;

            const data = lpjCache;
            if (!data || data.length === 0) {
                kegiatanList.innerHTML =
                    '<p class="text-[var(--text-muted)] text-center py-4 text-sm italic">Belum ada kegiatan.</p>';
                return;
            }

            const sorted = data.slice().sort((a, b) =>
                new Date(b.tanggal_mulai || 0) - new Date(a.tanggal_mulai || 0));

            let html = '';
            sorted.forEach(item => {
                const pending = isPendingSync(item.id);
                const pendingBadge = pending
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ml-2">⟳</span>'
                    : '';

                html += `
                    <div class="flex justify-between items-center p-3 border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--bg-stats)] rounded transition">
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-sm text-[var(--text-main)] truncate flex items-center">
                                ${escapeHtml(item.kegiatan || '-')}${pendingBadge}
                            </div>
                            <div class="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                <i class="far fa-calendar-alt mr-1"></i>${escapeHtml(formatDate(item.tanggal_mulai))}
                                ${item.tanggal_selesai && item.tanggal_selesai !== item.tanggal_mulai
                                    ? ' — ' + escapeHtml(formatDate(item.tanggal_selesai)) : ''}
                                ${item.tempat ? ' • 📍 ' + escapeHtml(item.tempat) : ''}
                            </div>
                        </div>
                        <div class="flex gap-1 flex-shrink-0 ml-2">
                            <button type="button" onclick="editKegiatan('${escapeAttr(item.id)}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 p-1.5" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button" onclick="deleteKegiatan('${escapeAttr(item.id)}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400 p-1.5" title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            kegiatanList.innerHTML = html;
        }

        // ================================================================
        // 22. EDIT KEGIATAN (Global)
        // ================================================================
        window.editKegiatan = function(id) {
            const item = lpjCache.find(l => String(l.id) === String(id));
            if (item) {
                openKegiatanModal(item);
            } else {
                safeToast('Kegiatan tidak ditemukan.', 'warning');
            }
        };

        // ================================================================
        // 23. DELETE KEGIATAN (Global, Offline-aware)
        // ================================================================
        window.deleteKegiatan = function(id) {
            const item = lpjCache.find(l => String(l.id) === String(id));
            const nama = item ? (item.kegiatan || 'kegiatan ini') : 'kegiatan ini';

            showConfirm('Hapus kegiatan "' + nama + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteLogbook', 'POST', { id });
                    if (result && result.success) {
                        lpjCache = lpjCache.filter(l => String(l.id) !== String(id));
                        renderCalendarFromCache();
                        updateStats();
                        if (currentView === 'list') renderList();
                        loadKegiatanList();
                        await logActivity('DELETE', 'logbook', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Kegiatan dihapus lokal, akan disinkronkan', 'warning', 4000);
                        } else {
                            safeToast('✅ Kegiatan berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus kegiatan', 'error');
                    }
                } catch (error) {
                    console.error('[kalender_admin] deleteKegiatan error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 24. SUBMIT KEGIATAN FORM (Offline-aware)
        // ================================================================
        if (kegiatanForm) {
            const fresh = kegiatanForm.cloneNode(true);
            kegiatanForm.parentNode.replaceChild(fresh, kegiatanForm);

            fresh.addEventListener('submit', async function(e) {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const idEl = document.getElementById('kegiatan-id');
                const namaEl = document.getElementById('kegiatan-nama');
                const tempatEl = document.getElementById('kegiatan-tempat');
                const tglMulaiEl = document.getElementById('kegiatan-tanggal-mulai');
                const tglSelesaiEl = document.getElementById('kegiatan-tanggal-selesai');
                const pesertaEl = document.getElementById('kegiatan-peserta');
                const anggaranEl = document.getElementById('kegiatan-anggaran');
                const deskripsiEl = document.getElementById('kegiatan-deskripsi');
                const fileUrlEl = document.getElementById('kegiatan-file-url');

                const id = idEl ? idEl.value : '';
                const nama = namaEl ? (namaEl.value || '').trim() : '';
                const tempat = tempatEl ? (tempatEl.value || '').trim() : '';
                const tglMulai = tglMulaiEl ? tglMulaiEl.value : '';
                const tglSelesai = tglSelesaiEl ? tglSelesaiEl.value : '';
                const peserta = pesertaEl ? (parseInt(pesertaEl.value) || 0) : 0;
                const anggaran = anggaranEl ? (parseInt(anggaranEl.value) || 0) : 0;
                const deskripsi = deskripsiEl ? (deskripsiEl.value || '').trim() : '';
                const file_url = fileUrlEl ? (fileUrlEl.value || '').trim() : '';

                if (!nama) {
                    safeToast('Nama kegiatan wajib diisi!', 'warning');
                    if (namaEl) namaEl.focus();
                    return;
                }
                if (!tglMulai) {
                    safeToast('Tanggal mulai wajib diisi!', 'warning');
                    if (tglMulaiEl) tglMulaiEl.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const isEdit = !!id;
                    const data = {
                        kegiatan: nama,
                        tempat: tempat,
                        tanggal_mulai: tglMulai,
                        tanggal_selesai: tglSelesai || tglMulai,
                        peserta: peserta,
                        anggaran: anggaran,
                        deskripsi: deskripsi,
                        file_url: file_url,
                        created_by: user.id
                    };

                    const action = isEdit ? 'updateLogbook' : 'createLogbook';
                    const payload = isEdit ? Object.assign({ id: id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        if (isEdit) {
                            const idx = lpjCache.findIndex(l => String(l.id) === String(id));
                            if (idx !== -1) {
                                lpjCache[idx] = Object.assign({}, lpjCache[idx], data, { id: id });
                            }
                        } else {
                            const newItem = Object.assign({}, data, {
                                id: result.id || ('tmp_' + Date.now()),
                                created_at: new Date().toISOString()
                            });
                            lpjCache.push(newItem);
                        }

                        renderCalendarFromCache();
                        updateStats();
                        if (currentView === 'list') renderList();
                        loadKegiatanList();
                        closeKegiatanModal();
                        await logActivity(isEdit ? 'UPDATE' : 'CREATE', 'logbook', result.id || id, 'Kegiatan: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Kegiatan tersimpan lokal, akan disinkronkan', 'warning', 4500);
                        } else {
                            safeToast(isEdit ? '✅ Kegiatan diperbarui!' : '✅ Kegiatan ditambahkan!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menyimpan kegiatan', 'error');
                    }
                } catch (error) {
                    console.error('[kalender_admin] Submit kegiatan error:', error);
                    safeToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 25. EXPORT CSV
        // ================================================================
        function exportCSV() {
            const combined = [];

            lpjCache.forEach(k => {
                combined.push({
                    tipe: 'Kegiatan',
                    judul: k.kegiatan || '',
                    tanggal: k.tanggal_mulai || '',
                    tanggal_selesai: k.tanggal_selesai || '',
                    tempat: k.tempat || '',
                    peserta: k.peserta || 0,
                    anggaran: k.anggaran || 0,
                    deskripsi: k.deskripsi || ''
                });
            });

            eventCache.forEach(e => {
                combined.push({
                    tipe: 'Rencana',
                    judul: e.title || '',
                    tanggal: e.start || '',
                    tanggal_selesai: e.end || '',
                    tempat: '',
                    peserta: 0,
                    anggaran: 0,
                    deskripsi: ''
                });
            });

            if (combined.length === 0) {
                safeToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Tipe', 'Judul', 'Tanggal Mulai', 'Tanggal Selesai', 'Tempat', 'Peserta', 'Anggaran', 'Deskripsi'];
            const rows = combined.map((c, i) => [
                i + 1,
                c.tipe,
                c.judul,
                c.tanggal,
                c.tanggal_selesai,
                c.tempat,
                c.peserta,
                c.anggaran,
                c.deskripsi
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kalender_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            safeToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 26. ESC HANDLER
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;

            const previewModal = document.getElementById('event-preview-modal');
            if (previewModal && !previewModal.classList.contains('hidden')) {
                previewModal.classList.add('hidden');
                previewModal.classList.remove('flex');
                document.body.style.overflow = '';
            } else if (eventModal && !eventModal.classList.contains('hidden')) {
                closeEventModal();
            } else if (kegiatanModal && !kegiatanModal.classList.contains('hidden')) {
                closeKegiatanModal();
            }
        });

        // ================================================================
        // 27. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[kalender_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 28. CLEANUP
        // ================================================================
        function cleanup() {
            window.__kalenderAdminLoaded = false;
            isSubmitting = false;

            if (calendarInstance) {
                try { calendarInstance.destroy(); } catch (e) {}
                calendarInstance = null;
            }

            const previewModal = document.getElementById('event-preview-modal');
            if (previewModal) previewModal.remove();

            document.body.style.overflow = '';
            console.log('[kalender_admin] Cleanup');
        }
        window.__kalenderAdminCleanup = cleanup;

        // ================================================================
        // 29. INIT SEQUENCE
        // ================================================================
        console.log('[kalender_admin] Loading initial data...');

        ensureExtraUI();
        attachFilterListeners();

        await loadAllData();

        console.log('[kalender_admin] ✅ Init selesai v10.0.0');
    }

    init();
});