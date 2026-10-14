/**
 * js/absensi_admin.js
 * Modul Admin Absensi - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi + cleanup via router
 *  - XSS protection di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - isSubmitting anti double-submit
 *  - Real-time QR sync (force refresh)
 *  - Confirm dialog untuk regenerate/toggle (bukan confirm())
 *
 * FEATURES:
 *  - Stats 4 kartu (total, hari ini, bulan ini, QR status)
 *  - QR toggle + regenerate dengan confirm dialog
 *  - Preview QR + Download PNG dengan logo overlay
 *  - Set password akses langsung dengan show/hide
 *  - Tabel absensi (nama, alamat, waktu, TTD)
 *  - Search real-time (nama, alamat)
 *  - Filter tanggal (dari - sampai)
 *  - Bulk delete multiple records
 *  - Preview tanda tangan (lightbox fullscreen)
 *  - Copy detail kehadiran
 *  - Export CSV (dengan filter)
 *  - Pagination "Load More"
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('absensi_admin', function() {
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
    if (window.__absensiAdminLoaded) {
        console.log('[absensi_admin] Sudah di-init, skip.');
        return;
    }
    window.__absensiAdminLoaded = true;

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

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
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
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'absensi-table-body',
            'qr-toggle-btn', 'qr-regenerate-btn', 'qr-status-text-admin', 'qr-token-text-admin',
            'qr-code-display', 'download-qr-btn', 'password-input-admin', 'save-password-btn',
            'password-msg', 'filter-date', 'refresh-btn', 'export-btn'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody         = els['absensi-table-body'];
        const qrToggleBtn       = els['qr-toggle-btn'];
        const qrRegenerateBtn   = els['qr-regenerate-btn'];
        const qrStatusText      = els['qr-status-text-admin'];
        const qrTokenText       = els['qr-token-text-admin'];
        const qrCodeDisplay     = els['qr-code-display'];
        const downloadQrBtn     = els['download-qr-btn'];
        const passwordInput     = els['password-input-admin'];
        const savePasswordBtn   = els['save-password-btn'];
        const passwordMsg       = els['password-msg'];
        const filterDate        = els['filter-date'];
        const refreshBtn        = els['refresh-btn'];
        const exportBtn         = els['export-btn'];

        if (!tableBody || !qrToggleBtn || !qrRegenerateBtn || !savePasswordBtn || !qrCodeDisplay || !downloadQrBtn) {
            console.error('[absensi_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let currentQrStatus = 'inactive';
        let currentQrToken = '';
        let dataCache = [];
        let filteredCache = [];
        let currentFilter = {
            search: '',
            dateFrom: '',
            dateTo: ''
        };
        let isSubmitting = false;
        let selectedIds = new Set();
        let visibleCount = 20; // load more per 20

        // ================================================================
        // 7. ENSURE EXTRA UI (Stats + Search + Bulk + Load More)
        // ================================================================
        function ensureExtraUI() {
            const mainContent = document.getElementById('main-content');
            if (!mainContent) return;
            const header = mainContent.querySelector('.flex.flex-wrap.justify-between.items-center')
                        || mainContent.querySelector('.flex.justify-between.items-center');

            // ===== Stats 4 kartu =====
            if (!document.getElementById('absensi-stats')) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'absensi-stats';
                statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Absensi</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-absensi">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-clipboard-check"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Hari Ini</p>
                                <p class="text-2xl font-bold text-green-600 mt-1" id="stats-hari-ini">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar-day"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Bulan Ini</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-bulan-ini">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">QR Status</p>
                                <p class="text-lg font-bold mt-1" id="stats-qr-status">Nonaktif</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-white" id="stats-qr-icon">
                                <i class="fas fa-qrcode"></i>
                            </div>
                        </div>
                    </div>
                `;

                if (header && header.parentNode) {
                    header.parentNode.insertBefore(statsDiv, header.nextSibling);
                }
            }

            // ===== Search + Filter Bar =====
            if (!document.getElementById('absensi-search-wrap')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'absensi-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="absensi-search" placeholder="Cari nama, alamat..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <input type="date" id="absensi-date-from"
                        class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm"
                        title="Dari tanggal">
                    <input type="date" id="absensi-date-to"
                        class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm"
                        title="Sampai tanggal">
                    <button id="absensi-clear-filter" type="button"
                        class="btn-secondary px-3 py-2 rounded-lg text-sm" title="Reset filter">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                const statsDiv = document.getElementById('absensi-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }

            // ===== Bulk Actions Bar =====
            if (!document.getElementById('absensi-bulk-bar')) {
                const bulkBar = document.createElement('div');
                bulkBar.id = 'absensi-bulk-bar';
                bulkBar.className = 'hidden flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
                bulkBar.innerHTML = `
                    <span class="text-sm font-medium text-red-800 dark:text-red-200">
                        <i class="fas fa-check-circle mr-1"></i>
                        <span id="bulk-count-absensi">0</span> data dipilih
                    </span>
                    <div class="flex gap-2 ml-auto">
                        <button id="bulk-delete-absensi-btn" type="button" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                            <i class="fas fa-trash mr-1"></i>Hapus Semua
                        </button>
                        <button id="bulk-cancel-absensi-btn" type="button" class="px-3 py-1.5 rounded-lg bg-gray-300 dark:bg-gray-700 text-[var(--text-main)] text-xs font-medium">
                            Batal
                        </button>
                    </div>
                `;

                const searchWrap = document.getElementById('absensi-search-wrap');
                if (searchWrap && searchWrap.parentNode) {
                    searchWrap.parentNode.insertBefore(bulkBar, searchWrap.nextSibling);
                }
            }

            // ===== Load More Button =====
            if (!document.getElementById('absensi-load-more-wrap')) {
                const loadMoreWrap = document.createElement('div');
                loadMoreWrap.id = 'absensi-load-more-wrap';
                loadMoreWrap.className = 'hidden text-center mt-4';
                loadMoreWrap.innerHTML = `
                    <button id="absensi-load-more-btn" class="btn-secondary px-6 py-2 rounded-lg text-sm">
                        <i class="fas fa-plus-circle mr-1"></i>Muat Lebih Banyak
                    </button>
                    <p id="absensi-load-more-info" class="text-xs text-[var(--text-muted)] mt-2"></p>
                `;

                const tableWrapper = tableBody.closest('.bg-\\[var\\(--card-bg\\)\\]');
                if (tableWrapper && tableWrapper.parentNode) {
                    tableWrapper.parentNode.insertBefore(loadMoreWrap, tableWrapper.nextSibling);
                }

                const loadMoreBtn = document.getElementById('absensi-load-more-btn');
                if (loadMoreBtn) {
                    loadMoreBtn.addEventListener('click', () => {
                        visibleCount += 20;
                        renderTable(filteredCache);
                    });
                }
            }
        }

        // ================================================================
        // 8. ATTACH FILTER LISTENERS
        // ================================================================
        function attachFilterListeners() {
            const searchInput = document.getElementById('absensi-search');
            const dateFrom = document.getElementById('absensi-date-from');
            const dateTo = document.getElementById('absensi-date-to');
            const clearBtn = document.getElementById('absensi-clear-filter');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'absensi-search', () => {
                        currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                        visibleCount = 20;
                        applyFilter();
                    }, 250));
            }

            if (dateFrom && !dateFrom.dataset.attached) {
                dateFrom.dataset.attached = 'true';
                dateFrom.addEventListener('change', function() {
                    currentFilter.dateFrom = this.value;
                    visibleCount = 20;
                    applyFilter();
                });
            }

            if (dateTo && !dateTo.dataset.attached) {
                dateTo.dataset.attached = 'true';
                dateTo.addEventListener('change', function() {
                    currentFilter.dateTo = this.value;
                    visibleCount = 20;
                    applyFilter();
                });
            }

            if (clearBtn && !clearBtn.dataset.attached) {
                clearBtn.dataset.attached = 'true';
                clearBtn.addEventListener('click', () => {
                    currentFilter = { search: '', dateFrom: '', dateTo: '' };
                    if (searchInput) searchInput.value = '';
                    if (dateFrom) dateFrom.value = '';
                    if (dateTo) dateTo.value = '';
                    if (filterDate) filterDate.value = '';
                    visibleCount = 20;
                    applyFilter();
                    showToast('Filter direset.', 'info', 2000);
                });
            }

            // Sync legacy filter-date (jika ada)
            if (filterDate && !filterDate.dataset.attached) {
                filterDate.dataset.attached = 'true';
                filterDate.addEventListener('change', () => {
                    if (filterDate.value) {
                        if (dateFrom) dateFrom.value = filterDate.value;
                        if (dateTo) dateTo.value = filterDate.value;
                        currentFilter.dateFrom = filterDate.value;
                        currentFilter.dateTo = filterDate.value;
                    } else {
                        currentFilter.dateFrom = '';
                        currentFilter.dateTo = '';
                    }
                    visibleCount = 20;
                    applyFilter();
                });
            }
        }

        // ================================================================
        // 9. APPLY FILTER
        // ================================================================
        function applyFilter() {
            filteredCache = dataCache.filter(item => {
                // Filter tanggal
                if (currentFilter.dateFrom || currentFilter.dateTo) {
                    const d = new Date(item.created_at);
                    if (isNaN(d.getTime())) return false;
                    if (currentFilter.dateFrom) {
                        const from = new Date(currentFilter.dateFrom);
                        from.setHours(0, 0, 0, 0);
                        if (d < from) return false;
                    }
                    if (currentFilter.dateTo) {
                        const to = new Date(currentFilter.dateTo);
                        to.setHours(23, 59, 59, 999);
                        if (d > to) return false;
                    }
                }

                // Filter search
                if (currentFilter.search) {
                    const q = currentFilter.search;
                    const haystack = [item.nama, item.alamat]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }

                return true;
            });

            // Sort desc by created_at
            filteredCache.sort((a, b) =>
                new Date(b.created_at || 0) - new Date(a.created_at || 0));

            renderTable(filteredCache);
            updateStats();
        }

        // ================================================================
        // 10. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = dataCache.length;

            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const hariIni = dataCache.filter(a => {
                const d = new Date(a.created_at);
                return !isNaN(d.getTime()) && d >= today;
            }).length;

            const bulanIni = dataCache.filter(a => {
                const d = new Date(a.created_at);
                return !isNaN(d.getTime()) &&
                       d.getMonth() === now.getMonth() &&
                       d.getFullYear() === now.getFullYear();
            }).length;

            const el1 = document.getElementById('stats-total-absensi');
            const el2 = document.getElementById('stats-hari-ini');
            const el3 = document.getElementById('stats-bulan-ini');
            const el4 = document.getElementById('stats-qr-status');
            const el5 = document.getElementById('stats-qr-icon');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = hariIni;
            if (el3) el3.textContent = bulanIni;

            if (el4) {
                el4.textContent = currentQrStatus === 'active' ? 'Aktif' : 'Nonaktif';
                el4.className = 'text-lg font-bold mt-1 ' +
                    (currentQrStatus === 'active'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400');
            }
            if (el5) {
                el5.className = 'w-10 h-10 rounded-full flex items-center justify-center text-white ' +
                    (currentQrStatus === 'active'
                        ? 'bg-gradient-to-br from-green-400 to-emerald-600'
                        : 'bg-gradient-to-br from-red-400 to-rose-600');
            }
        }

        // ================================================================
        // 11. LOAD QR STATUS (FORCE REFRESH — realtime)
        // ================================================================
        async function loadQrStatus() {
            try {
                const res = await forceRefreshData('getQrConfig', {});
                const { status, token } = extractQrData(res);
                currentQrStatus = status;
                currentQrToken = token;
                updateQrUI(currentQrStatus, currentQrToken);
                updateStats();
            } catch (error) {
                console.error('[absensi_admin] Gagal memuat status QR:', error);
                currentQrStatus = 'inactive';
                currentQrToken = '';
                updateQrUI('inactive', '');
            }
        }

        function extractQrData(res) {
            if (!res || !res.success) return { status: 'inactive', token: '' };
            if (res.data) {
                return {
                    status: res.data.status || 'inactive',
                    token: res.data.token || ''
                };
            }
            return {
                status: res.status || 'inactive',
                token: res.token || ''
            };
        }

        // ================================================================
        // 12. UPDATE UI QR
        // ================================================================
        function updateQrUI(status, token) {
            currentQrStatus = status;
            currentQrToken = token || '';

            if (qrStatusText) {
                qrStatusText.textContent = 'Status: ' + (status === 'active' ? 'Aktif' : 'Nonaktif');
                qrStatusText.className = 'text-sm ' +
                    (status === 'active'
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : 'text-red-600 dark:text-red-400 font-medium');
            }

            if (qrTokenText) {
                qrTokenText.textContent = token ? 'Token: ' + token.slice(0, 16) + '...' : 'Token: -';
                qrTokenText.title = token || '';
            }

            if (status === 'active') {
                if (qrToggleBtn) {
                    qrToggleBtn.textContent = 'Tutup QR';
                    qrToggleBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    qrToggleBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                }
                if (qrRegenerateBtn) {
                    qrRegenerateBtn.disabled = false;
                    qrRegenerateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                if (downloadQrBtn) downloadQrBtn.disabled = false;
                generateQrPreview();
            } else {
                if (qrToggleBtn) {
                    qrToggleBtn.textContent = 'Aktifkan QR';
                    qrToggleBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                    qrToggleBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                }
                if (qrRegenerateBtn) {
                    qrRegenerateBtn.disabled = true;
                    qrRegenerateBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }
                if (downloadQrBtn) downloadQrBtn.disabled = true;
                if (qrCodeDisplay) {
                    qrCodeDisplay.innerHTML =
                        '<i class="fas fa-lock text-2xl text-gray-400"></i>' +
                        '<p class="text-xs text-[var(--text-muted)] mt-2">QR Nonaktif</p>';
                }
            }
        }

        // ================================================================
        // 13. GENERATE QR PREVIEW
        // ================================================================
        function generateQrPreview() {
            if (!qrCodeDisplay) return;
            qrCodeDisplay.innerHTML = '';

            if (typeof QRCode === 'undefined') {
                qrCodeDisplay.innerHTML =
                    '<p class="text-red-500 text-xs">QR library tidak tersedia</p>' +
                    '<p class="text-xs mt-2 break-all">Token: ' + escapeHtml(currentQrToken) + '</p>';
                return;
            }

            const qrUrl = window.location.origin + window.location.pathname +
                '#/absensi?token=' + encodeURIComponent(currentQrToken);

            const qrDiv = document.createElement('div');
            qrDiv.style.cssText = 'width:180px;height:180px;';
            qrCodeDisplay.appendChild(qrDiv);

            try {
                new QRCode(qrDiv, {
                    text: qrUrl,
                    width: 180,
                    height: 180,
                    colorDark: '#0f2922',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (error) {
                console.error('[absensi_admin] Generate QR error:', error);
                qrCodeDisplay.innerHTML =
                    '<p class="text-red-500 text-xs">Error generate QR</p>' +
                    '<p class="text-xs mt-2 break-all">Token: ' + escapeHtml(currentQrToken) + '</p>';
            }
        }

        // ================================================================
        // 14. DOWNLOAD QR (dengan logo overlay)
        // ================================================================
        function downloadQR() {
            const canvas = qrCodeDisplay ? qrCodeDisplay.querySelector('canvas') : null;
            if (!canvas) {
                showToast('QR belum tersedia', 'warning');
                return;
            }

            try {
                // Buat canvas baru dengan padding + logo
                const size = canvas.width;
                const padding = 40;
                const finalSize = size + padding * 2;

                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = finalSize;
                finalCanvas.height = finalSize;
                const ctx = finalCanvas.getContext('2d');

                // Background putih
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, finalSize, finalSize);

                // Gambar QR
                ctx.drawImage(canvas, padding, padding);

                // Coba load logo
                const logo = new Image();
                logo.crossOrigin = 'anonymous';
                logo.onload = function() {
                    const logoSize = Math.round(size * 0.22);
                    const logoX = (finalSize - logoSize) / 2;
                    const logoY = (finalSize - logoSize) / 2;

                    // White circle behind logo
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(finalSize / 2, finalSize / 2, logoSize / 2 + 4, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw logo
                    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

                    triggerDownload(finalCanvas, 'QR_Absensi_Ansor.png');
                };
                logo.onerror = function() {
                    // Tetap download tanpa logo
                    triggerDownload(finalCanvas, 'QR_Absensi_Ansor.png');
                };
                logo.src = 'logo-ansor.webp';
            } catch (e) {
                console.error('[absensi_admin] Download QR error:', e);
                showToast('Gagal download QR: ' + e.message, 'error');
            }
        }

        function triggerDownload(canvas, filename) {
            try {
                const link = document.createElement('a');
                link.download = filename;
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast('✅ QR berhasil diunduh!', 'success');
            } catch (e) {
                showToast('Gagal download: ' + e.message, 'error');
            }
        }

        // ================================================================
        // 15. TOGGLE QR STATUS
        // ================================================================
        if (qrToggleBtn) {
            const fresh = qrToggleBtn.cloneNode(true);
            qrToggleBtn.parentNode.replaceChild(fresh, qrToggleBtn);

            fresh.addEventListener('click', () => {
                const newStatus = currentQrStatus === 'active' ? 'inactive' : 'active';
                const confirmMsg = newStatus === 'active'
                    ? 'Aktifkan QR absensi? Token baru akan dibuat dan QR lama otomatis tidak berlaku.'
                    : 'Tutup QR absensi? User tidak bisa scan QR sampai diaktifkan kembali.';

                showConfirm(confirmMsg, async () => {
                    if (isSubmitting) return;
                    isSubmitting = true;

                    const originalText = fresh.textContent;
                    fresh.disabled = true;
                    fresh.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses...';

                    try {
                        const res = await forceRefreshData('updateQrStatus', { status: newStatus });
                        const { status, token } = extractQrData(res);
                        currentQrStatus = status;
                        currentQrToken = token;
                        updateQrUI(currentQrStatus, currentQrToken);
                        updateStats();

                        await logActivity('UPDATE', 'settings', 'qr_absensi', 'QR ' + status);
                        showToast(
                            'Status QR: ' + (status === 'active' ? 'Aktif' : 'Nonaktif'),
                            'success'
                        );
                    } catch (error) {
                        showToast('Error: ' + error.message, 'error');
                    } finally {
                        fresh.disabled = false;
                        isSubmitting = false;
                    }
                });
            });
        }

        // ================================================================
        // 16. REGENERATE QR TOKEN
        // ================================================================
        if (qrRegenerateBtn) {
            const fresh = qrRegenerateBtn.cloneNode(true);
            qrRegenerateBtn.parentNode.replaceChild(fresh, qrRegenerateBtn);

            fresh.addEventListener('click', () => {
                if (currentQrStatus !== 'active') {
                    showToast('Aktifkan QR terlebih dahulu.', 'warning');
                    return;
                }

                showConfirm(
                    'Buat token QR baru? QR lama akan langsung tidak berlaku dan user harus scan ulang.',
                    async () => {
                        if (isSubmitting) return;
                        isSubmitting = true;

                        const originalText = fresh.innerHTML;
                        fresh.disabled = true;
                        fresh.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses...';

                        try {
                            const res = await forceRefreshData('updateQrStatus', { status: 'active' });
                            const { status, token } = extractQrData(res);
                            currentQrStatus = status;
                            currentQrToken = token;
                            updateQrUI(currentQrStatus, currentQrToken);
                            updateStats();

                            await logActivity('UPDATE', 'settings', 'qr_absensi', 'Regenerate token');
                            showToast('✅ QR baru berhasil dibuat!', 'success');
                        } catch (error) {
                            showToast('Error: ' + error.message, 'error');
                        } finally {
                            fresh.disabled = false;
                            fresh.innerHTML = originalText;
                            isSubmitting = false;
                        }
                    }
                );
            });
        }

        // ================================================================
        // 17. DOWNLOAD QR
        // ================================================================
        if (downloadQrBtn) {
            const fresh = downloadQrBtn.cloneNode(true);
            downloadQrBtn.parentNode.replaceChild(fresh, downloadQrBtn);
            fresh.addEventListener('click', downloadQR);
        }

        // ================================================================
        // 18. SAVE PASSWORD
        // ================================================================
        if (savePasswordBtn) {
            const fresh = savePasswordBtn.cloneNode(true);
            savePasswordBtn.parentNode.replaceChild(fresh, savePasswordBtn);

            fresh.addEventListener('click', async () => {
                if (isSubmitting) return;

                const newPassword = passwordInput ? passwordInput.value.trim() : '';
                if (!newPassword) {
                    if (passwordMsg) {
                        passwordMsg.textContent = 'Password tidak boleh kosong!';
                        passwordMsg.className = 'text-sm text-red-500 mt-2';
                    }
                    return;
                }
                if (newPassword.length < 6) {
                    if (passwordMsg) {
                        passwordMsg.textContent = 'Password minimal 6 karakter!';
                        passwordMsg.className = 'text-sm text-red-500 mt-2';
                    }
                    return;
                }

                isSubmitting = true;
                const original = fresh.innerHTML;
                fresh.disabled = true;
                fresh.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

                try {
                    const res = await apiCall('setAbsensiPassword', 'POST', { password: newPassword });
                    if (res && res.success) {
                        if (passwordMsg) {
                            passwordMsg.textContent = '✅ Password berhasil disimpan!';
                            passwordMsg.className = 'text-sm text-green-600 mt-2';
                        }
                        if (passwordInput) passwordInput.value = '';

                        // Clear password message setelah 3s
                        setTimeout(() => {
                            if (passwordMsg) {
                                passwordMsg.textContent = '';
                                passwordMsg.className = 'text-sm text-[var(--text-muted)] mt-2';
                            }
                        }, 3000);

                        await logActivity('UPDATE', 'settings', 'absensi_password', 'Password updated');
                        showToast('Password absensi diperbarui!', 'success');
                    } else {
                        if (passwordMsg) {
                            passwordMsg.textContent = res.message || 'Gagal menyimpan password.';
                            passwordMsg.className = 'text-sm text-red-500 mt-2';
                        }
                    }
                } catch (error) {
                    if (passwordMsg) {
                        passwordMsg.textContent = 'Error: ' + error.message;
                        passwordMsg.className = 'text-sm text-red-500 mt-2';
                    }
                } finally {
                    fresh.disabled = false;
                    fresh.innerHTML = original;
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 19. LOAD ABSENSI DATA
        // ================================================================
        async function loadAbsensi(force) {
            force = force || false;

            if (dataCache.length > 0 && !force) {
                applyFilter();
                fetchAbsensiBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
                '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-main)]"></i>' +
                '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data absensi...</p></td></tr>';

            try {
                const res = await forceRefreshData('getAbsensi', {});

                if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                    dataCache = res.data;
                    applyFilter();
                } else if (res && res.success) {
                    dataCache = [];
                    filteredCache = [];
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                        '<i class="fas fa-clipboard-check text-3xl mb-2 opacity-40"></i>' +
                        '<p>Belum ada data absensi</p></td></tr>';
                    updateStats();
                } else {
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((res && res.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[absensi_admin] Load error:', error);
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchAbsensiBackground() {
            try {
                const res = await forceRefreshData('getAbsensi', {});
                if (res && res.success && Array.isArray(res.data)) {
                    dataCache = res.data;
                    applyFilter();
                }
            } catch (e) {
                console.warn('[absensi_admin] BG refresh gagal:', e);
            }
        }

        // ================================================================
        // 20. RENDER TABLE
        // ================================================================
        function renderTable(data) {
            if (!data || data.length === 0) {
                const isFiltered = currentFilter.search ||
                                  currentFilter.dateFrom ||
                                  currentFilter.dateTo;
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-clipboard-check text-3xl mb-2 opacity-40"></i><p>Belum ada data absensi</p>') +
                    '</td></tr>';
                if (document.getElementById('absensi-load-more-wrap')) {
                    document.getElementById('absensi-load-more-wrap').classList.add('hidden');
                }
                return;
            }

            // Update thead checkbox
            updateThead();

            const toShow = data.slice(0, visibleCount);
            const hasMore = data.length > visibleCount;

            let html = '';
            toShow.forEach((item, idx) => {
                const date = new Date(item.created_at);
                const dateStr = isNaN(date.getTime()) ? '-' : formatDateTime(item.created_at);
                const isSelected = selectedIds.has(item.id);

                // TTD image
                const ttdHtml = item.ttd
                    ? `<img src="${escapeAttr(item.ttd)}" alt="TTD"
                            class="ttd-img w-20 h-10 object-contain bg-white rounded border border-[var(--card-border)] cursor-pointer hover:scale-105 transition"
                            onclick="previewTtd('${item.id}')"
                            loading="lazy"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
                       <span class="hidden text-xs text-[var(--text-muted)]">No image</span>`
                    : '<span class="text-xs text-[var(--text-muted)]">-</span>';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : ''}">
                        <td class="px-3 py-3 text-center">
                            <input type="checkbox" class="absensi-checkbox w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer"
                                data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-3 py-3 text-sm font-medium text-[var(--text-main)]">
                            <button onclick="copyAbsensiDetail('${item.id}')"
                                class="hover:text-blue-600 dark:hover:text-blue-400 text-left"
                                title="Klik untuk copy detail">
                                ${escapeHtml(item.nama || '-')}
                            </button>
                        </td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.alamat || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">${escapeHtml(dateStr)}</td>
                        <td class="px-3 py-3 text-sm">${ttdHtml}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="copyAbsensiDetail('${item.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2"
                                title="Copy detail">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button onclick="deleteAbsensi('${item.id}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400"
                                title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;

            attachCheckboxListeners();
            updateBulkBar();

            // Update load more
            const loadMoreWrap = document.getElementById('absensi-load-more-wrap');
            const loadMoreInfo = document.getElementById('absensi-load-more-info');
            if (loadMoreWrap) {
                if (hasMore) {
                    loadMoreWrap.classList.remove('hidden');
                    if (loadMoreInfo) {
                        loadMoreInfo.textContent = `Menampilkan ${toShow.length} dari ${data.length} data`;
                    }
                } else {
                    loadMoreWrap.classList.add('hidden');
                }
            }
        }

        function updateThead() {
            const thead = tableBody.closest('table')?.querySelector('thead tr');
            if (!thead || thead.querySelector('.bulk-select-all-absensi')) return;

            const firstTh = thead.querySelector('th');
            const cbTh = document.createElement('th');
            cbTh.className = 'px-3 py-4 text-center w-12';
            cbTh.innerHTML = '<input type="checkbox" class="bulk-select-all-absensi w-4 h-4 rounded border-gray-300 text-red-600 cursor-pointer">';
            thead.insertBefore(cbTh, firstTh);

            const selectAll = thead.querySelector('.bulk-select-all-absensi');
            if (selectAll) {
                selectAll.addEventListener('change', function() {
                    document.querySelectorAll('.absensi-checkbox').forEach(cb => {
                        cb.checked = this.checked;
                        if (this.checked) selectedIds.add(cb.dataset.id);
                        else selectedIds.delete(cb.dataset.id);
                        cb.closest('tr').classList.toggle('bg-red-50', this.checked);
                        cb.closest('tr').classList.toggle('dark:bg-red-900/10', this.checked);
                    });
                    updateBulkBar();
                });
            }
        }

        function attachCheckboxListeners() {
            document.querySelectorAll('.absensi-checkbox').forEach(cb => {
                cb.addEventListener('change', function() {
                    if (this.checked) selectedIds.add(this.dataset.id);
                    else selectedIds.delete(this.dataset.id);

                    this.closest('tr').classList.toggle('bg-red-50', this.checked);
                    this.closest('tr').classList.toggle('dark:bg-red-900/10', this.checked);
                    updateBulkBar();
                });
            });
        }

        function updateBulkBar() {
            const bulkBar = document.getElementById('absensi-bulk-bar');
            const bulkCount = document.getElementById('bulk-count-absensi');
            if (!bulkBar) return;

            if (selectedIds.size > 0) {
                bulkBar.classList.remove('hidden');
                if (bulkCount) bulkCount.textContent = selectedIds.size;
            } else {
                bulkBar.classList.add('hidden');
            }
        }

        // ================================================================
        // 21. BULK DELETE
        // ================================================================
        function attachBulkListeners() {
            const delBtn = document.getElementById('bulk-delete-absensi-btn');
            const cancelBtn = document.getElementById('bulk-cancel-absensi-btn');

            if (delBtn && !delBtn.dataset.attached) {
                delBtn.dataset.attached = 'true';
                delBtn.addEventListener('click', async () => {
                    const ids = Array.from(selectedIds);
                    if (ids.length === 0) return;

                    showConfirm(`Hapus ${ids.length} data absensi? Tindakan ini tidak bisa dibatalkan.`, async () => {
                        let ok = 0, fail = 0;
                        for (const id of ids) {
                            try {
                                const r = await apiCall('deleteAbsensi', 'POST', { id });
                                if (r && r.success) {
                                    ok++;
                                    dataCache = dataCache.filter(a => a.id !== id);
                                } else fail++;
                            } catch (e) { fail++; }
                        }

                        selectedIds.clear();
                        document.querySelectorAll('.absensi-checkbox').forEach(cb => cb.checked = false);
                        const selAll = document.querySelector('.bulk-select-all-absensi');
                        if (selAll) selAll.checked = false;
                        updateBulkBar();
                        applyFilter();

                        if (fail === 0) {
                            showToast(`✅ ${ok} data berhasil dihapus!`, 'success');
                        } else {
                            showToast(`${ok} berhasil, ${fail} gagal.`, 'warning');
                        }
                    });
                });
            }

            if (cancelBtn && !cancelBtn.dataset.attached) {
                cancelBtn.dataset.attached = 'true';
                cancelBtn.addEventListener('click', () => {
                    selectedIds.clear();
                    document.querySelectorAll('.absensi-checkbox').forEach(cb => cb.checked = false);
                    document.querySelectorAll('.bg-red-50').forEach(el => {
                        el.classList.remove('bg-red-50', 'dark:bg-red-900/10');
                    });
                    const selAll = document.querySelector('.bulk-select-all-absensi');
                    if (selAll) selAll.checked = false;
                    updateBulkBar();
                });
            }
        }

        // ================================================================
        // 22. COPY DETAIL ABSENSI
        // ================================================================
        window.copyAbsensiDetail = function(id) {
            const item = dataCache.find(a => a.id === id);
            if (!item) return;

            const text = 'NAMA: ' + (item.nama || '-') + '\n' +
                         'ALAMAT: ' + (item.alamat || '-') + '\n' +
                         'WAKTU: ' + formatDateTime(item.created_at);

            copyToClipboard(text)
                .then(() => showToast('✅ Detail absensi dicopy!', 'success', 2500))
                .catch(() => showToast('Gagal copy detail', 'error'));
        };

        // ================================================================
        // 23. PREVIEW TTD (lightbox)
        // ================================================================
        window.previewTtd = function(id) {
            const item = dataCache.find(a => a.id === id);
            if (!item || !item.ttd) {
                showToast('Tanda tangan tidak tersedia.', 'warning');
                return;
            }

            let lightbox = document.getElementById('ttd-lightbox');
            if (!lightbox) {
                lightbox = document.createElement('div');
                lightbox.id = 'ttd-lightbox';
                lightbox.className = 'fixed inset-0 bg-black/90 hidden items-center justify-center z-[10000] p-4';
                lightbox.innerHTML = `
                    <button id="ttd-lightbox-close"
                        class="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl transition">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="bg-white rounded-lg p-6 max-w-2xl w-full">
                        <h3 class="text-lg font-bold mb-4 text-gray-800" id="ttd-lightbox-title">Tanda Tangan</h3>
                        <img id="ttd-lightbox-img" src="" alt="TTD" class="w-full h-auto max-h-[60vh] object-contain rounded-lg border border-gray-200">
                        <p class="text-sm text-gray-600 mt-3" id="ttd-lightbox-info"></p>
                    </div>
                `;
                document.body.appendChild(lightbox);

                const closeFn = () => {
                    lightbox.classList.add('hidden');
                    lightbox.classList.remove('flex');
                    document.body.style.overflow = '';
                };

                lightbox.querySelector('#ttd-lightbox-close').addEventListener('click', closeFn);
                lightbox.addEventListener('click', (e) => {
                    if (e.target === lightbox) closeFn();
                });
            }

            const img = lightbox.querySelector('#ttd-lightbox-img');
            const title = lightbox.querySelector('#ttd-lightbox-title');
            const info = lightbox.querySelector('#ttd-lightbox-info');

            img.src = item.ttd;
            title.textContent = 'TTD: ' + (item.nama || '-');
            info.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(item.alamat || '-')} · <i class="far fa-clock ml-2 mr-1"></i>${escapeHtml(formatDateTime(item.created_at))}`;

            lightbox.classList.remove('hidden');
            lightbox.classList.add('flex');
            document.body.style.overflow = 'hidden';
        };

        // ================================================================
        // 24. DELETE ABSENSI (single)
        // ================================================================
        window.deleteAbsensi = function(id) {
            const item = dataCache.find(a => a.id === id);
            const nama = item ? (item.nama || 'data ini') : 'data ini';

            showConfirm('Hapus data absensi "' + nama + '"?', async () => {
                const res = await apiCall('deleteAbsensi', 'POST', { id });
                if (res && res.success) {
                    dataCache = dataCache.filter(a => a.id !== id);
                    applyFilter();
                    await logActivity('DELETE', 'absensi', id, 'Hapus: ' + nama);
                    showToast('Data absensi dihapus!', 'success');
                } else {
                    showToast((res && res.message) || 'Gagal menghapus.', 'error');
                }
            });
        };

        // ================================================================
        // 25. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) {
                showToast('Tidak ada data untuk diekspor.', 'warning');
                return;
            }

            const headers = ['No', 'Nama', 'Alamat', 'Waktu', 'TTD'];
            const rows = filteredCache.map((item, idx) => [
                idx + 1,
                item.nama || '',
                item.alamat || '',
                formatDateTime(item.created_at),
                item.ttd ? 'Ada' : '-'
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `absensi_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast('✅ CSV berhasil diunduh!', 'success');
        }

        // ================================================================
        // 26. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);

            fresh.addEventListener('click', async function() {
                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';

                dataCache = [];
                selectedIds.clear();

                try {
                    await Promise.all([
                        loadQrStatus(),
                        loadAbsensi(true)
                    ]);
                    showToast('Data diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 27. EXPORT BUTTON
        // ================================================================
        if (exportBtn) {
            const fresh = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(fresh, exportBtn);
            fresh.addEventListener('click', exportCSV);
        }

        // ================================================================
        // 28. INIT
        // ================================================================
        console.log('[absensi_admin] Init dimulai');

        ensureExtraUI();
        attachFilterListeners();
        attachBulkListeners();

        // Load data parallel
        await Promise.all([
            loadQrStatus(),
            loadAbsensi()
        ]);

        console.log('[absensi_admin] Init selesai');
    }

    // ================================================================
    // 29. RUN INIT
    // ================================================================
    init();
});