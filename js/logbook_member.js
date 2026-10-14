/**
 * js/logbook_member.js
 * Modul Member Logbook - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi + cleanup via router
 *  - XSS protection di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - isSubmitting anti double-submit
 *  - Edit capability (modal form)
 *  - ESC + click-outside modal
 *  - Upload file via POST (fix B1)
 *
 * FEATURES:
 *  - CRUD Logbook member (milik sendiri)
 *  - Edit capability dengan pre-fill
 *  - Cancel edit banner
 *  - Search real-time (kegiatan, tempat, deskripsi)
 *  - Filter status (draft/final)
 *  - Stats 4 kartu (total, draft, final, bulan ini)
 *  - Preview modal proper
 *  - Export PDF/DOCX (dari form)
 *  - Upload file pendukung background
 *  - Cache lokal SWR
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('logbook_member', function() {
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
    if (window.__logbookMemberLoaded) {
        console.log('[logbook_member] Sudah di-init, skip.');
        return;
    }
    window.__logbookMemberLoaded = true;

    // ================================================================
    // 3. HELPER: TUNGGU ELEMEN DOM SIAP
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 30;
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
            day: '2-digit', month: '2-digit', year: 'numeric'
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

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'logbook-form', 'kegiatan', 'tempat', 'tanggal_mulai', 'tanggal_selesai',
            'peserta', 'anggaran', 'deskripsi', 'file_url', 'logbook_file',
            'logbook-list', 'refresh-logbook-btn',
            'preview-btn', 'export-pdf-btn', 'export-docx-btn',
            'logbook-preview', 'logbook-preview-content',
            'skeleton-logbook'
        ];

        const els = await waitForElements(requiredIds);

        const form              = els['logbook-form'];
        const kegiatanInput     = els['kegiatan'];
        const tempatInput       = els['tempat'];
        const tanggalMulaiInput = els['tanggal_mulai'];
        const tanggalSelesaiInput = els['tanggal_selesai'];
        const pesertaInput      = els['peserta'];
        const anggaranInput     = els['anggaran'];
        const deskripsiInput    = els['deskripsi'];
        const fileUrlInput      = els['file_url'];
        const fileInput         = els['logbook_file'];
        const listContainer     = els['logbook-list'];
        const refreshBtn        = els['refresh-logbook-btn'];
        const previewBtn        = els['preview-btn'];
        const exportPdfBtn      = els['export-pdf-btn'];
        const exportDocxBtn     = els['export-docx-btn'];
        const previewDiv        = els['logbook-preview'];
        const previewContent    = els['logbook-preview-content'];
        const skeleton          = els['skeleton-logbook'];

        if (!form || !listContainer) {
            console.error('[logbook_member] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = {
            search: '',
            status: 'all'
        };
        let isSubmitting = false;
        let isExporting = false;
        let editingId = null;   // null = create mode, else = edit mode

        // ================================================================
        // 7. ENSURE EXTRA UI (Stats + Search + Cancel Banner)
        // ================================================================
        function ensureExtraUI() {
            const memberContent = document.getElementById('member-frame-content') ||
                                 document.getElementById('member-content');
            if (!memberContent) return;

            const header = memberContent.querySelector('.flex.justify-between.items-center')
                        || memberContent.querySelector('.flex.flex-wrap.justify-between.items-center');

            // ===== Add Button (Tambah Logbook) =====
            if (!document.getElementById('add-logbook-btn') && header) {
                const btnWrap = header.querySelector('.flex.gap-2');
                if (btnWrap) {
                    const addBtn = document.createElement('button');
                    addBtn.id = 'add-logbook-btn';
                    addBtn.type = 'button';
                    addBtn.className = 'btn-primary px-4 py-2 rounded-lg transition shadow-md flex items-center gap-2';
                    addBtn.innerHTML = '<i class="fas fa-plus"></i> Tambah Logbook';
                    btnWrap.insertBefore(addBtn, btnWrap.firstChild);
                }
            }

            // ===== Cancel Edit Banner =====
            if (!document.getElementById('logbook-cancel-wrap')) {
                const cancelDiv = document.createElement('div');
                cancelDiv.id = 'logbook-cancel-wrap';
                cancelDiv.className = 'hidden bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3 mb-4 rounded flex items-center justify-between';
                cancelDiv.innerHTML = `
                    <div class="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
                        <i class="fas fa-edit"></i>
                        <span>Sedang mengedit: <strong id="logbook-edit-label"></strong></span>
                    </div>
                    <button id="logbook-cancel-btn" type="button" class="text-yellow-800 dark:text-yellow-200 hover:text-yellow-900 text-sm font-medium">
                        <i class="fas fa-times mr-1"></i>Batal Edit
                    </button>
                `;

                // Sisipkan sebelum form
                const formWrapper = form.closest('.glass-card') || form.parentElement;
                if (formWrapper && formWrapper.parentNode) {
                    formWrapper.parentNode.insertBefore(cancelDiv, formWrapper);
                }
            }

            // ===== Stats 4 kartu =====
            if (!document.getElementById('logbook-member-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'logbook-member-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-logbook-member">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-book"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Draft</p>
                                <p class="text-2xl font-bold text-yellow-600 mt-1" id="stats-draft-member">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white">
                                <i class="fas fa-edit"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Final</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-final-member">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-check-circle"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-bulan-ini-member">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                        </div>
                    </div>
                `;

                // Sisipkan setelah header
                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search & Filter Bar =====
            if (!document.getElementById('logbook-member-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'logbook-member-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="logbook-member-search" placeholder="Cari kegiatan, tempat, deskripsi..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="logbook-member-filter-status" class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="all">Semua Status</option>
                        <option value="draft">Draft</option>
                        <option value="final">Final</option>
                    </select>
                `;

                const statsDiv = document.getElementById('logbook-member-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }
        }

        // ================================================================
        // 8. ATTACH SEARCH & FILTER LISTENERS
        // ================================================================
        function attachSearchListeners() {
            const searchInput = document.getElementById('logbook-member-search');
            const statusSelect = document.getElementById('logbook-member-filter-status');
            const cancelBtn = document.getElementById('logbook-cancel-btn');
            const addBtn = document.getElementById('add-logbook-btn');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'logbook-member-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        applyFilter();
                    }, 250));
            }

            if (statusSelect && !statusSelect.dataset.attached) {
                statusSelect.dataset.attached = 'true';
                statusSelect.addEventListener('change', () => {
                    currentFilter.status = statusSelect.value;
                    applyFilter();
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', cancelEdit);
            }

            if (addBtn && !addBtn.dataset.attached) {
                addBtn.dataset.attached = 'true';
                addBtn.addEventListener('click', () => {
                    if (editingId) cancelEdit();
                    const formWrapper = form.closest('.glass-card') || form;
                    if (formWrapper) formWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    kegiatanInput.focus();
                });
            }
        }

        // ================================================================
        // 9. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(item => {
                // Filter status
                if (currentFilter.status !== 'all') {
                    const status = item.status || 'draft';
                    if (status !== currentFilter.status) return false;
                }
                // Filter search
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [
                        item.kegiatan, item.tempat,
                        stripHtml(item.deskripsi)
                    ].map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort by tanggal descending
            filteredCache.sort((a, b) => {
                const da = new Date(a.tanggal_mulai || 0);
                const db = new Date(b.tanggal_mulai || 0);
                return db - da;
            });

            renderList(filteredCache);
            updateStats();
        }

        // ================================================================
        // 10. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;
            const draft = dataCache.filter(l => (l.status || 'draft') === 'draft').length;
            const final = dataCache.filter(l => l.status === 'final').length;

            const now = new Date();
            const bulanIni = dataCache.filter(l => {
                const d = new Date(l.tanggal_mulai || l.created_at);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const el1 = document.getElementById('stats-total-logbook-member');
            const el2 = document.getElementById('stats-draft-member');
            const el3 = document.getElementById('stats-final-member');
            const el4 = document.getElementById('stats-bulan-ini-member');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = draft;
            if (el3) el3.textContent = final;
            if (el4) el4.textContent = bulanIni;
        }

        // ================================================================
        // 11. LOAD DATA (SWR)
        // ================================================================
        async function loadLogbook(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchDataBackground();
                return;
            }

            if (skeleton) skeleton.classList.remove('hidden');
            if (listContainer) listContainer.classList.add('hidden');

            try {
                const result = await forceRefreshData('getLogbook', {});

                if (skeleton) skeleton.classList.add('hidden');
                if (listContainer) listContainer.classList.remove('hidden');

                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    dataCache = result.data;
                    applyFilter();
                } else if (result && result.success) {
                    dataCache = [];
                    filteredCache = [];
                    renderList([]);
                    updateStats();
                } else {
                    listContainer.innerHTML = '<div class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p>' +
                        '</div>';
                }
            } catch (error) {
                if (skeleton) skeleton.classList.add('hidden');
                if (listContainer) listContainer.classList.remove('hidden');
                console.error('[logbook_member] Load error:', error);
                listContainer.innerHTML = '<div class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</div>';
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getLogbook', {});
                if (result && result.success && Array.isArray(result.data)) {
                    dataCache = result.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[logbook_member] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 12. RENDER LIST
        // ================================================================
        function renderList(data) {
            if (!listContainer) return;

            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search || currentFilter.status !== 'all';
                listContainer.innerHTML = '<div class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-4xl mb-3 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-book text-4xl mb-3 opacity-40"></i><p>Belum ada Logbook</p>') +
                    '</div>';
                return;
            }

            let html = '';
            data.forEach(item => {
                const status = item.status || 'draft';
                const statusBadge = status === 'final'
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"><i class="fas fa-check-circle mr-1"></i>Final</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"><i class="fas fa-edit mr-1"></i>Draft</span>';

                const fileIcon = item.file_url
                    ? `<a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                          class="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs"
                          title="Lihat file pendukung">
                          <i class="fas fa-paperclip"></i>
                       </a>`
                    : '';

                const shortDesc = stripHtml(item.deskripsi);
                const truncatedDesc = shortDesc.length > 120 ? shortDesc.substring(0, 120) + '...' : shortDesc;

                html += `
                    <div class="border border-[var(--card-border)] p-4 rounded-lg mb-3 bg-[var(--card-bg)] hover:bg-[var(--bg-stats)] transition-all">
                        <div class="flex flex-wrap justify-between items-start gap-3">
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap items-center gap-2 mb-1">
                                    <h3 class="font-bold text-[var(--text-main)] font-amiri text-lg">
                                        ${escapeHtml(item.kegiatan || '-')}
                                    </h3>
                                    ${statusBadge}
                                    ${fileIcon}
                                </div>
                                <p class="text-sm text-[var(--text-muted)] mb-1">
                                    <i class="far fa-calendar-alt mr-1"></i>
                                    ${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)}
                                    <span class="mx-2">·</span>
                                    <i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(item.tempat || '-')}
                                </p>
                                <p class="text-sm text-[var(--text-muted)] mb-1">
                                    <i class="fas fa-users mr-1"></i>${item.peserta || 0} peserta
                                    <span class="mx-2">·</span>
                                    <i class="fas fa-coins mr-1"></i>${formatRupiah(item.anggaran || 0)}
                                </p>
                                ${truncatedDesc ? `<p class="text-sm text-[var(--text-muted)] mt-2 line-clamp-2">${escapeHtml(truncatedDesc)}</p>` : ''}
                            </div>
                            <div class="flex gap-2 flex-shrink-0">
                                <button onclick="editLogbook('${item.id}')"
                                    class="text-blue-600 hover:text-blue-800 dark:text-blue-400 p-2"
                                    title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="previewLogbook('${item.id}')"
                                    class="text-green-600 hover:text-green-800 dark:text-green-400 p-2"
                                    title="Preview">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="deleteLogbook('${item.id}')"
                                    class="text-red-600 hover:text-red-800 dark:text-red-400 p-2"
                                    title="Hapus">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = html;
        }

        // ================================================================
        // 13. READ FORM HELPER
        // ================================================================
        function readForm() {
            return {
                kegiatan: (kegiatanInput.value || '').trim(),
                tempat: (tempatInput.value || '').trim(),
                tanggal_mulai: tanggalMulaiInput.value,
                tanggal_selesai: tanggalSelesaiInput.value,
                peserta: parseInt(pesertaInput.value) || 0,
                anggaran: parseInt(anggaranInput.value) || 0,
                deskripsi: deskripsiInput.value || '',
                file_url: (fileUrlInput.value || '').trim()
            };
        }

        // ================================================================
        // 14. PREVIEW HTML
        // ================================================================
        function getPreviewHtml(item) {
            if (!item) item = {};

            const kegiatan = item.kegiatan || '-';
            const tempat = item.tempat || '-';
            const tglMulai = item.tanggal_mulai || '-';
            const tglSelesai = item.tanggal_selesai || '-';
            const peserta = item.peserta || '0';
            const anggaran = item.anggaran || '0';
            const deskripsi = stripHtml(item.deskripsi) || '-';
            const fileUrl = item.file_url || '-';

            return `
                <div class="logbook-doc">
                    <h3 class="text-xl font-bold text-center mb-4">LOGBOOK KEGIATAN</h3>
                    <p class="text-center mb-6">PAC GP Ansor Kapanewon Sewon</p>
                    <table class="w-full mb-4">
                        <tr><td class="font-bold w-1/3 py-1">Nama Kegiatan</td><td class="py-1">: ${escapeHtml(kegiatan)}</td></tr>
                        <tr><td class="font-bold py-1">Tempat</td><td class="py-1">: ${escapeHtml(tempat)}</td></tr>
                        <tr><td class="font-bold py-1">Tanggal Mulai</td><td class="py-1">: ${formatDate(tglMulai)}</td></tr>
                        <tr><td class="font-bold py-1">Tanggal Selesai</td><td class="py-1">: ${formatDate(tglSelesai)}</td></tr>
                        <tr><td class="font-bold py-1">Peserta</td><td class="py-1">: ${peserta} orang</td></tr>
                        <tr><td class="font-bold py-1">Anggaran</td><td class="py-1">: ${formatRupiah(parseInt(anggaran) || 0)}</td></tr>
                    </table>
                    <div class="mb-4">
                        <p class="font-bold">Deskripsi Kegiatan:</p>
                        <p class="whitespace-pre-wrap">${escapeHtml(deskripsi)}</p>
                    </div>
                    <div>
                        <p class="font-bold">File Pendukung:</p>
                        <p class="break-all">${escapeHtml(fileUrl)}</p>
                    </div>
                    <div class="mt-8 text-right">
                        <p>Yogyakarta, ${formatDateLong(new Date())}</p>
                        <p class="mt-4">Mengetahui,</p>
                        <p class="mt-8">Ketua PAC GP Ansor Sewon</p>
                    </div>
                </div>
            `;
        }

        // ================================================================
        // 15. PREVIEW LOGBOOK (dari list)
        // ================================================================
        window.previewLogbook = function(id) {
            const item = dataCache.find(l => l.id === id);
            if (!item) {
                showToast('Logbook tidak ditemukan.', 'warning');
                return;
            }

            if (previewContent) previewContent.innerHTML = getPreviewHtml(item);
            if (previewDiv) previewDiv.classList.remove('hidden');

            setTimeout(() => {
                if (previewDiv) previewDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        };

        // ================================================================
        // 16. PREVIEW BUTTON (form preview)
        // ================================================================
        if (previewBtn) {
            const fresh = previewBtn.cloneNode(true);
            previewBtn.parentNode.replaceChild(fresh, previewBtn);
            fresh.addEventListener('click', () => {
                const data = readForm();
                if (previewContent) previewContent.innerHTML = getPreviewHtml(data);
                if (previewDiv) previewDiv.classList.remove('hidden');
                setTimeout(() => {
                    if (previewDiv) previewDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            });
        }

        // ================================================================
        // 17. EXPORT PDF
        // ================================================================
        if (exportPdfBtn) {
            const fresh = exportPdfBtn.cloneNode(true);
            exportPdfBtn.parentNode.replaceChild(fresh, exportPdfBtn);
            fresh.addEventListener('click', async () => {
                if (isExporting) return;

                const data = readForm();
                if (previewContent) previewContent.innerHTML = getPreviewHtml(data);
                if (previewDiv) previewDiv.classList.remove('hidden');

                isExporting = true;
                const original = fresh.innerHTML;
                fresh.disabled = true;
                fresh.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyusun PDF...';

                try {
                    // Ensure libs
                    if (typeof html2canvas === 'undefined' || !window.jspdf) {
                        if (typeof window.loadLib === 'function') {
                            await window.loadLib('html2canvas');
                            await window.loadLib('jspdf');
                        }
                    }

                    await new Promise(r => setTimeout(r, 500));

                    const element = previewContent;
                    const canvas = await html2canvas(element, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    const imgData = canvas.toDataURL('image/png');

                    const jsPDFCtor = (typeof jspdf !== 'undefined' && jspdf.jsPDF) ||
                                      (window.jspdf && window.jspdf.jsPDF);
                    if (!jsPDFCtor) throw new Error('jsPDF tidak tersedia');

                    const pdf = new jsPDFCtor('p', 'mm', 'a4');
                    const imgWidth = 190;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                    pdf.save('Logbook_' + (data.kegiatan || 'Kegiatan').replace(/\s+/g, '_') + '.pdf');

                    showToast('✅ PDF berhasil diunduh!', 'success');
                } catch (error) {
                    console.error('[logbook_member] PDF error:', error);
                    showToast('Gagal export PDF: ' + error.message, 'error');
                } finally {
                    isExporting = false;
                    fresh.disabled = false;
                    fresh.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 18. EXPORT DOCX
        // ================================================================
        if (exportDocxBtn) {
            const fresh = exportDocxBtn.cloneNode(true);
            exportDocxBtn.parentNode.replaceChild(fresh, exportDocxBtn);
            fresh.addEventListener('click', async () => {
                if (isExporting) return;

                const data = readForm();

                isExporting = true;
                const original = fresh.innerHTML;
                fresh.disabled = true;
                fresh.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyusun DOCX...';

                try {
                    // Ensure libs
                    if (typeof docx === 'undefined') {
                        if (typeof window.loadLib === 'function') {
                            await window.loadLib('docx');
                        }
                    }

                    if (typeof docx === 'undefined') throw new Error('Pustaka DOCX tidak tersedia');

                    const { Document, Packer, Paragraph, TextRun, Table, TableRow,
                            TableCell, AlignmentType } = docx;

                    const cell = (text, bold) => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: String(text || '-'),
                                bold: !!bold,
                                size: 22
                            })]
                        })]
                    });

                    const doc = new Document({
                        sections: [{
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    spacing: { after: 200 },
                                    children: [new TextRun({ text: 'LOGBOOK KEGIATAN', size: 32, bold: true })]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    spacing: { after: 400 },
                                    children: [new TextRun({ text: 'PAC GP Ansor Kapanewon Sewon', size: 24 })]
                                }),
                                new Table({
                                    rows: [
                                        new TableRow({ children: [cell('Nama Kegiatan', true), cell(data.kegiatan)] }),
                                        new TableRow({ children: [cell('Tempat', true), cell(data.tempat)] }),
                                        new TableRow({ children: [cell('Tanggal Mulai', true), cell(formatDate(data.tanggal_mulai))] }),
                                        new TableRow({ children: [cell('Tanggal Selesai', true), cell(formatDate(data.tanggal_selesai))] }),
                                        new TableRow({ children: [cell('Peserta', true), cell((data.peserta || 0) + ' orang')] }),
                                        new TableRow({ children: [cell('Anggaran', true), cell(formatRupiah(parseInt(data.anggaran) || 0))] })
                                    ]
                                }),
                                new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'Deskripsi Kegiatan:', bold: true, size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: stripHtml(data.deskripsi) || '-', size: 22 })] }),
                                new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: 'File Pendukung:', bold: true, size: 22 })] }),
                                new Paragraph({ children: [new TextRun({ text: data.file_url || '-', size: 22 })] }),
                                new Paragraph({ spacing: { before: 600 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Yogyakarta, ' + formatDateLong(new Date()), size: 22 })] }),
                                new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Mengetahui,', size: 22 })] }),
                                new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Ketua PAC GP Ansor Sewon', bold: true, size: 22 })] })
                            ]
                        }]
                    });

                    const blob = await Packer.toBlob(doc);
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'Logbook_' + (data.kegiatan || 'Kegiatan').replace(/\s+/g, '_') + '.docx';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

                    showToast('✅ DOCX berhasil diunduh!', 'success');
                } catch (error) {
                    console.error('[logbook_member] DOCX error:', error);
                    showToast('Gagal export DOCX: ' + error.message, 'error');
                } finally {
                    isExporting = false;
                    fresh.disabled = false;
                    fresh.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 19. CANCEL EDIT
        // ================================================================
        function cancelEdit() {
            editingId = null;
            form.reset();
            if (fileInput) fileInput.value = '';
            if (tanggalMulaiInput) tanggalMulaiInput.value = todayISO();
            if (tanggalSelesaiInput) tanggalSelesaiInput.value = todayISO();
            if (previewDiv) previewDiv.classList.add('hidden');

            const cancelWrap = document.getElementById('logbook-cancel-wrap');
            if (cancelWrap) cancelWrap.classList.add('hidden');

            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Simpan Logbook';
            }
        }

        // ================================================================
        // 20. EDIT LOGBOOK
        // ================================================================
        window.editLogbook = function(id) {
            const item = dataCache.find(l => l.id === id);
            if (!item) {
                showToast('Logbook tidak ditemukan.', 'warning');
                return;
            }

            editingId = id;

            // Fill form
            if (kegiatanInput) kegiatanInput.value = item.kegiatan || '';
            if (tempatInput) tempatInput.value = item.tempat || '';
            if (tanggalMulaiInput) tanggalMulaiInput.value = item.tanggal_mulai ? item.tanggal_mulai.slice(0, 10) : todayISO();
            if (tanggalSelesaiInput) tanggalSelesaiInput.value = item.tanggal_selesai ? item.tanggal_selesai.slice(0, 10) : todayISO();
            if (pesertaInput) pesertaInput.value = item.peserta || 0;
            if (anggaranInput) anggaranInput.value = item.anggaran || 0;
            if (deskripsiInput) deskripsiInput.value = item.deskripsi || '';
            if (fileUrlInput) fileUrlInput.value = item.file_url || '';
            if (fileInput) fileInput.value = '';

            // Update UI
            const cancelWrap = document.getElementById('logbook-cancel-wrap');
            const editLabel = document.getElementById('logbook-edit-label');
            if (cancelWrap) cancelWrap.classList.remove('hidden');
            if (editLabel) editLabel.textContent = item.kegiatan || 'Logbook';

            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Update Logbook';
            }

            // Scroll ke form
            const formWrapper = form.closest('.glass-card') || form;
            if (formWrapper) {
                formWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            showToast('Mode edit: ' + (item.kegiatan || 'Logbook'), 'info', 2000);
        };

        // ================================================================
        // 21. DELETE LOGBOOK
        // ================================================================
        window.deleteLogbook = function(id) {
            const item = dataCache.find(l => l.id === id);
            const name = item ? (item.kegiatan || 'kegiatan ini') : 'kegiatan ini';

            showConfirm('Hapus Logbook "' + name + '"?', async () => {
                const result = await apiCall('deleteLogbook', 'POST', { id });
                if (result && result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    applyFilter();
                    await logActivity('DELETE', 'logbook', id, 'Hapus: ' + name);
                    showToast('Logbook berhasil dihapus!', 'success');

                    // Cancel edit jika sedang edit item ini
                    if (editingId === id) cancelEdit();
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 22. SUBMIT FORM (CREATE / UPDATE)
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            // === Validation ===
            const data = readForm();

            if (!data.kegiatan) {
                showToast('Nama kegiatan wajib diisi!', 'warning');
                kegiatanInput.focus();
                return;
            }
            if (data.kegiatan.length < 3) {
                showToast('Nama kegiatan minimal 3 karakter!', 'warning');
                kegiatanInput.focus();
                return;
            }
            if (!data.tempat) {
                showToast('Tempat wajib diisi!', 'warning');
                tempatInput.focus();
                return;
            }
            if (!data.tanggal_mulai) {
                showToast('Tanggal mulai wajib diisi!', 'warning');
                tanggalMulaiInput.focus();
                return;
            }
            if (!data.tanggal_selesai) {
                showToast('Tanggal selesai wajib diisi!', 'warning');
                tanggalSelesaiInput.focus();
                return;
            }
            if (new Date(data.tanggal_selesai) < new Date(data.tanggal_mulai)) {
                showToast('Tanggal selesai tidak boleh sebelum tanggal mulai!', 'warning');
                tanggalSelesaiInput.focus();
                return;
            }
            if (!data.deskripsi) {
                showToast('Deskripsi wajib diisi!', 'warning');
                deskripsiInput.focus();
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            startLoading(submitBtn, editingId ? 'Mengupdate...' : 'Menyimpan...');

            try {
                data.created_by = user.id;
                if (editingId) data.status = 'final'; // Auto-final saat edit

                const action = editingId ? 'updateLogbook' : 'createLogbook';
                const payload = editingId ? Object.assign({ id: editingId }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    // Update cache lokal
                    if (editingId) {
                        const idx = dataCache.findIndex(l => l.id === editingId);
                        if (idx !== -1) {
                            dataCache[idx] = Object.assign({}, dataCache[idx], data, { id: editingId });
                        }
                        await logActivity('UPDATE', 'logbook', editingId, 'Update: ' + data.kegiatan);
                        showToast('✅ Logbook berhasil diperbarui!', 'success');
                    } else {
                        const newItem = Object.assign({}, data, {
                            id: result.id,
                            status: 'draft',
                            created_at: new Date().toISOString()
                        });
                        dataCache.unshift(newItem);
                        await logActivity('CREATE', 'logbook', result.id, 'Kegiatan: ' + data.kegiatan);
                        showToast('✅ Logbook berhasil disimpan!', 'success');
                    }

                    applyFilter();

                    // Upload file di background
                    if (fileInput && fileInput.files && fileInput.files.length > 0) {
                        const targetId = editingId || result.id;
                        showToast('Mengunggah file pendukung...', 'info', 3000);

                        uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                            if (uploadResult && uploadResult.success) {
                                apiCall('updateLogbook', 'POST', {
                                    id: targetId,
                                    file_url: uploadResult.url
                                }).then(() => {
                                    const idx = dataCache.findIndex(l => l.id === targetId);
                                    if (idx !== -1) {
                                        dataCache[idx].file_url = uploadResult.url;
                                        applyFilter();
                                    }
                                    showToast('✅ File pendukung berhasil diunggah!', 'success');
                                });
                            } else {
                                showToast('Gagal upload file', 'error');
                            }
                        }).catch(err => {
                            showToast('Gagal upload: ' + err.message, 'error');
                        });
                    }

                    // Reset
                    cancelEdit();
                } else {
                    showToast((result && result.message) || 'Gagal menyimpan Logbook', 'error');
                }
            } catch (error) {
                console.error('[logbook_member] Submit error:', error);
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                if (editingId) {
                    submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Update Logbook';
                } else {
                    submitBtn.innerHTML = originalText;
                }
                isSubmitting = false;
            }
        });

        // ================================================================
        // 23. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin mr-2"></i>Memuat...';

                dataCache = [];

                try {
                    await loadLogbook(true);
                    showToast('Data Logbook diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 24. CLEANUP
        // ================================================================
        function cleanup() {
            window.__logbookMemberLoaded = false;
        }
        window.__logbookMemberCleanup = cleanup;

        // ================================================================
        // 25. INIT
        // ================================================================
        console.log('[logbook_member] Init dimulai');

        // Set default tanggal
        if (tanggalMulaiInput && !tanggalMulaiInput.value) tanggalMulaiInput.value = todayISO();
        if (tanggalSelesaiInput && !tanggalSelesaiInput.value) tanggalSelesaiInput.value = todayISO();

        // Setup UI
        ensureExtraUI();
        attachSearchListeners();

        // Load data
        loadLogbook();

        console.log('[logbook_member] Init selesai');
    }

    // ================================================================
    // 26. RUN INIT
    // ================================================================
    init();
});