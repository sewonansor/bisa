/**
 * js/sekretaris_logbook.js
 * Modul Sekretaris Logbook Ranting — v1.1.0 FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v1.1.0:
 *   ✅ NEW: Standalone module (tidak reuse logbook_member)
 *   ✅ NEW: 3-state UI (skeleton → content / error / empty)
 *   ✅ NEW: Null-safe semua DOM elements
 *   ✅ NEW: Search real-time + filter status (draft/final)
 *   ✅ NEW: Stats 4 kartu auto-update
 *   ✅ NEW: Modal create/edit dengan clone-replace listener
 *   ✅ NEW: Detail modal (view lengkap + copy)
 *   ✅ NEW: Delete single dengan konfirmasi
 *   ✅ NEW: Upload file pendukung background
 *   ✅ NEW: Offline-aware
 *   ✅ NEW: Auto-refresh saat sync:complete, online
 *   ✅ NEW: Cleanup function
 *   ✅ NEW: XSS protection (esc + escAttr)
 *   ✅ FIX: Response format handling (root/data/data.data)
 *   ✅ FIX: isSubmitting anti double-submit
 *   ✅ FIX: ESC + click-outside modal close
 * ---------------------------------------------------------
 * Route: /sekretaris_logbook
 * Endpoint:
 *   - getLogbook (list, auto-scoped backend)
 *   - createLogbook (auto-assign kalurahan backend)
 *   - updateLogbook (guard backend)
 *   - deleteLogbook (guard backend)
 *   - uploadFile (background)
 * Compatible: views/sekretaris_logbook.html v1.1.0
 */

App.register('sekretaris_logbook', function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // 1. GUARD ANTI-DUPLIKASI
    // ═══════════════════════════════════════════════════════════
    if (window.__sekLogbookLoaded) {
        console.log('[sek_logbook] Sudah di-init, skip.');
        return;
    }
    window.__sekLogbookLoaded = true;

    // ═══════════════════════════════════════════════════════════
    // 2. AUTH GUARD
    // ═══════════════════════════════════════════════════════════
    const user = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!user || user.role !== 'sekretaris') {
        console.warn('[sek_logbook] Bukan sekretaris — redirect');
        if (typeof router !== 'undefined' && router.load) {
            router.load('/auth');
        } else {
            window.location.hash = '/auth';
        }
        window.__sekLogbookLoaded = false;
        return;
    }

    console.log('[sek_logbook] 🚀 Init v1.1.0 untuk', user.nama || user.username, '·', user.kalurahan || '-');

    // ═══════════════════════════════════════════════════════════
    // 3. DOM ELEMENTS — NULL-SAFE
    // ═══════════════════════════════════════════════════════════
    const els = {
        subtitle:       document.getElementById('sek-logbook-subtitle'),
        offlineBanner:  document.getElementById('sek-logbook-offline-banner'),
        tableBody:      document.getElementById('logbook-table-body'),
        skeleton:       document.getElementById('logbook-skeleton'),
        modal:          document.getElementById('logbook-modal'),
        modalContent:   document.getElementById('logbook-modal-content'),
        modalTitle:     document.getElementById('logbook-modal-title'),
        modalClose:     document.getElementById('logbook-modal-close'),
        modalCancel:    document.getElementById('logbook-modal-cancel'),
        form:           document.getElementById('logbook-form'),
        addBtn:         document.getElementById('add-logbook-btn'),
        refreshBtn:     document.getElementById('refresh-logbook-btn'),
        idInput:        document.getElementById('logbook-id'),
        kegiatanInput:  document.getElementById('logbook_kegiatan'),
        tempatInput:    document.getElementById('logbook_tempat'),
        tanggalMulai:   document.getElementById('logbook_tanggal_mulai'),
        tanggalSelesai: document.getElementById('logbook_tanggal_selesai'),
        pesertaInput:   document.getElementById('logbook_peserta'),
        anggaranInput:  document.getElementById('logbook_anggaran'),
        deskripsiInput: document.getElementById('logbook_deskripsi'),
        fileUrlInput:   document.getElementById('logbook_file_url'),
        fileInput:      document.getElementById('logbook_file'),
        statusSelect:   document.getElementById('logbook_status'),
        searchInput:    document.getElementById('logbook-search'),
        filterStatus:   document.getElementById('logbook-filter-status'),
        statTotal:      document.getElementById('stats-total-logbook'),
        statDraft:      document.getElementById('stats-draft-logbook'),
        statFinal:      document.getElementById('stats-final-logbook'),
        statBulan:      document.getElementById('stats-bulan-logbook'),
        detailModal:    document.getElementById('logbook-detail-modal'),
        detailContent:  document.getElementById('logbook-detail-content'),
        detailTitle:    document.getElementById('logbook-detail-title'),
        detailBody:     document.getElementById('logbook-detail-body'),
        detailClose:    document.getElementById('logbook-detail-close'),
        detailCopy:     document.getElementById('logbook-detail-copy'),
        detailEdit:     document.getElementById('logbook-detail-edit'),
        detailOk:       document.getElementById('logbook-detail-ok')
    };

    // ═══════════════════════════════════════════════════════════
    // 4. STATE
    // ═══════════════════════════════════════════════════════════
    let dataCache = [];
    let filteredCache = [];
    let isEdit = false;
    let isSubmitting = false;
    let isLoading = false;
    let currentFilter = { search: '', status: 'all' };
    let currentDetailId = null;

    // ═══════════════════════════════════════════════════════════
    // 5. HELPERS
    // ═══════════════════════════════════════════════════════════

    function esc(s) {
        if (s === null || s === undefined) return '';
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function escAttr(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function fmtDate(d) {
        if (!d) return '-';
        const x = new Date(d);
        if (isNaN(x.getTime())) return '-';
        return x.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    function fmtDateLong(d) {
        if (!d) return '-';
        const x = new Date(d);
        if (isNaN(x.getTime())) return '-';
        return x.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function fmtRp(n) {
        const num = Number(n) || 0;
        return 'Rp ' + num.toLocaleString('id-ID');
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

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            try {
                window.showToast(msg, type || 'info', dur || 3000);
                return;
            } catch (e) {}
        }
        console.log('[sek_logbook:' + (type || 'info') + ']', msg);
    }

    function showConfirm(msg, cb) {
        if (typeof window.showConfirm === 'function') {
            window.showConfirm(msg, cb);
        } else if (confirm(msg)) {
            cb();
        }
    }

    function extractData(res) {
        if (!res) return null;
        if (res.success && Array.isArray(res.data)) return res.data;
        if (res.success && res.data && Array.isArray(res.data.data)) return res.data.data;
        if (Array.isArray(res)) return res;
        return null;
    }

    function toggleOfflineBanner() {
        if (!els.offlineBanner) return;
        if (navigator.onLine) {
            els.offlineBanner.classList.add('hidden');
        } else {
            els.offlineBanner.classList.remove('hidden');
        }
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function(resolve, reject) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) { reject(e); }
        });
    }

    function updateSubtitle() {
        if (els.subtitle) {
            els.subtitle.textContent = 'Ranting ' + (user.kalurahan || '-');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. APPLY FILTER
    // ═══════════════════════════════════════════════════════════
    function applyFilter() {
        filteredCache = dataCache.filter(function(item) {
            // Filter status
            if (currentFilter.status !== 'all') {
                const status = item.status || 'draft';
                if (status !== currentFilter.status) return false;
            }
            // Filter search
            if (currentFilter.search) {
                const q = currentFilter.search;
                const haystack = [
                    item.kegiatan, item.tempat, stripHtml(item.deskripsi)
                ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');

                if (haystack.indexOf(q) === -1) return false;
            }
            return true;
        });

        // Sort by tanggal_mulai desc
        filteredCache.sort(function(a, b) {
            const da = new Date(a.tanggal_mulai || a.created_at || 0).getTime() || 0;
            const db = new Date(b.tanggal_mulai || b.created_at || 0).getTime() || 0;
            return db - da;
        });

        renderTable(filteredCache);
        updateStats();
    }

    // ═══════════════════════════════════════════════════════════
    // 7. UPDATE STATS
    // ═══════════════════════════════════════════════════════════
    function updateStats() {
        const total = dataCache.length;
        const draft = dataCache.filter(function(l) {
            return (l.status || 'draft') === 'draft';
        }).length;
        const final = dataCache.filter(function(l) {
            return l.status === 'final';
        }).length;

        const now = new Date();
        const bulanIni = dataCache.filter(function(l) {
            const d = new Date(l.tanggal_mulai || l.created_at);
            if (isNaN(d.getTime())) return false;
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length;

        if (els.statTotal) els.statTotal.textContent = total;
        if (els.statDraft) els.statDraft.textContent = draft;
        if (els.statFinal) els.statFinal.textContent = final;
        if (els.statBulan) els.statBulan.textContent = bulanIni;
    }

    // ═══════════════════════════════════════════════════════════
    // 8. RENDER TABLE
    // ═══════════════════════════════════════════════════════════
    function renderTable(data) {
        if (!els.tableBody) return;

        if (!data || data.length === 0) {
            const isFiltered = currentFilter.search || currentFilter.status !== 'all';
            els.tableBody.innerHTML =
                '<tr><td colspan="9" class="text-center py-12 text-[var(--text-muted)]">' +
                    '<i class="fas fa-' + (isFiltered ? 'search' : 'book') + ' text-3xl mb-2 opacity-40"></i>' +
                    '<p>' + (isFiltered ? 'Tidak ada hasil yang cocok' : 'Belum ada logbook di ranting ini') + '</p>' +
                    (isFiltered ? '<button type="button" id="logbook-clear-filter-inline" class="mt-3 text-xs text-blue-600 hover:underline">Reset filter</button>' : '') +
                '</td></tr>';

            const clearBtn = document.getElementById('logbook-clear-filter-inline');
            if (clearBtn) {
                clearBtn.addEventListener('click', function() {
                    currentFilter = { search: '', status: 'all' };
                    if (els.searchInput) els.searchInput.value = '';
                    if (els.filterStatus) els.filterStatus.value = 'all';
                    applyFilter();
                });
            }
            return;
        }

        let html = '';
        data.forEach(function(item, idx) {
            const status = item.status || 'draft';
            const id = item.id || '';
            const kegiatan = item.kegiatan || '-';
            const tempat = item.tempat || '-';
            const tanggalMulai = fmtDate(item.tanggal_mulai);
            const tanggalSelesai = fmtDate(item.tanggal_selesai);
            const peserta = item.peserta || 0;
            const anggaran = fmtRp(item.anggaran);

            const statusBadge = status === 'final'
                ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Final</span>'
                : '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Draft</span>';

            const fileIcon = item.file_url
                ? '<a href="' + escAttr(item.file_url) + '" target="_blank" rel="noopener noreferrer" ' +
                    'class="text-blue-600 hover:text-blue-800 dark:text-blue-400" title="Lihat file">' +
                    '<i class="fas fa-paperclip"></i></a>'
                : '<span class="text-[var(--text-muted)]">-</span>';

            const tanggalDisplay = tanggalMulai === tanggalSelesai
                ? tanggalMulai
                : tanggalMulai + ' — ' + tanggalSelesai;

            html +=
                '<tr class="transition-colors">' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)] text-center">' + (idx + 1) + '</td>' +
                    '<td class="px-3 py-3 text-sm">' +
                        '<button type="button" data-action="detail" data-id="' + escAttr(id) + '" ' +
                            'class="font-medium text-[var(--text-main)] hover:text-blue-600 text-left line-clamp-1">' +
                            esc(kegiatan) + '</button>' +
                    '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">' + esc(tanggalDisplay) + '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)]">' + esc(tempat) + '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)] text-center">' + peserta + '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)] text-right whitespace-nowrap">' + esc(anggaran) + '</td>' +
                    '<td class="px-3 py-3 text-sm text-center">' + statusBadge + '</td>' +
                    '<td class="px-3 py-3 text-sm text-center">' + fileIcon + '</td>' +
                    '<td class="px-3 py-3 text-sm whitespace-nowrap text-center">' +
                        '<button type="button" data-action="detail" data-id="' + escAttr(id) + '" ' +
                            'class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2" title="Detail">' +
                            '<i class="fas fa-eye"></i></button>' +
                        '<button type="button" data-action="edit" data-id="' + escAttr(id) + '" ' +
                            'class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2" title="Edit">' +
                            '<i class="fas fa-edit"></i></button>' +
                        '<button type="button" data-action="delete" data-id="' + escAttr(id) + '" ' +
                            'class="text-red-600 hover:text-red-800 dark:text-red-400" title="Hapus">' +
                            '<i class="fas fa-trash"></i></button>' +
                    '</td>' +
                '</tr>';
        });

        els.tableBody.innerHTML = html;
        attachTableEvents();
    }

    function attachTableEvents() {
        if (!els.tableBody) return;
        if (els.tableBody.__delegateBound) return;
        els.tableBody.__delegateBound = true;

        els.tableBody.addEventListener('click', function(e) {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');

            if (action === 'detail' && id) {
                openDetailModal(id);
                return;
            }
            if (action === 'edit' && id) {
                const item = dataCache.find(function(l) { return String(l.id) === String(id); });
                if (item) openEditModal(item);
                else safeToast('Logbook tidak ditemukan di cache', 'warning');
                return;
            }
            if (action === 'delete' && id) {
                handleDelete(id);
                return;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 9. LOAD DATA
    // ═══════════════════════════════════════════════════════════
    async function loadLogbook(force) {
        if (isLoading) return;
        isLoading = true;

        if (els.skeleton) els.skeleton.classList.remove('hidden');
        if (els.tableBody && !dataCache.length) {
            els.tableBody.innerHTML =
                '<tr><td colspan="9" class="text-center py-12">' +
                    '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i>' +
                    '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data logbook...</p>' +
                '</td></tr>';
        }

        try {
            let res;
            if (force && typeof window.forceRefreshData === 'function') {
                res = await window.forceRefreshData('getLogbook', { __fresh: true });
            } else if (typeof window.apiCall === 'function') {
                res = await window.apiCall('getLogbook', 'POST', {});
            } else {
                throw new Error('API tidak tersedia');
            }

            const list = extractData(res);

            if (list === null) {
                throw new Error((res && res.message) || 'Response tidak valid');
            }

            dataCache = Array.isArray(list) ? list : [];
            applyFilter();

            if (force) {
                safeToast('✅ Data logbook diperbarui', 'success', 2500);
            }

        } catch (err) {
            console.error('[sek_logbook] Load error:', err);
            if (els.tableBody) {
                els.tableBody.innerHTML =
                    '<tr><td colspan="9" class="text-center py-12 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-3xl mb-2"></i>' +
                        '<p class="font-medium">Gagal memuat data</p>' +
                        '<p class="text-xs mt-1">' + esc(err.message) + '</p>' +
                        '<button type="button" id="logbook-error-retry" class="mt-3 text-xs text-blue-600 hover:underline">' +
                            '<i class="fas fa-redo mr-1"></i>Coba Lagi</button>' +
                    '</td></tr>';

                const retryBtn = document.getElementById('logbook-error-retry');
                if (retryBtn) {
                    retryBtn.addEventListener('click', function() { loadLogbook(true); });
                }
            }
        } finally {
            isLoading = false;
            if (els.skeleton) els.skeleton.classList.add('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 10. MODAL OPEN/CLOSE
    // ═══════════════════════════════════════════════════════════
    function openModal() {
        if (!els.modal) return;
        els.modal.classList.remove('hidden');
        els.modal.classList.add('flex');
        requestAnimationFrame(function() {
            if (els.modalContent) {
                els.modalContent.classList.remove('scale-95', 'opacity-0');
                els.modalContent.classList.add('scale-100', 'opacity-100');
            }
        });
        document.body.style.overflow = 'hidden';
        setTimeout(function() {
            if (els.kegiatanInput) els.kegiatanInput.focus();
        }, 200);
    }

    function closeModal() {
        if (!els.modal) return;
        if (els.modalContent) {
            els.modalContent.classList.remove('scale-100', 'opacity-100');
            els.modalContent.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(function() {
            els.modal.classList.add('hidden');
            els.modal.classList.remove('flex');
        }, 150);
        document.body.style.overflow = '';

        if (els.form) els.form.reset();
        if (els.idInput) els.idInput.value = '';
        if (els.fileInput) els.fileInput.value = '';
        if (els.tanggalMulai) els.tanggalMulai.value = todayISO();
        if (els.tanggalSelesai) els.tanggalSelesai.value = todayISO();
        isEdit = false;
    }

    function openCreateModal() {
        isEdit = false;
        if (els.modalTitle) els.modalTitle.textContent = 'Tambah Logbook';
        if (els.form) els.form.reset();
        if (els.idInput) els.idInput.value = '';
        if (els.tanggalMulai) els.tanggalMulai.value = todayISO();
        if (els.tanggalSelesai) els.tanggalSelesai.value = todayISO();
        if (els.statusSelect) els.statusSelect.value = 'draft';
        if (els.pesertaInput) els.pesertaInput.value = 0;
        if (els.anggaranInput) els.anggaranInput.value = 0;
        if (els.fileInput) els.fileInput.value = '';
        openModal();
    }

    function openEditModal(item) {
        isEdit = true;
        if (els.modalTitle) els.modalTitle.textContent = 'Edit Logbook';
        if (els.idInput) els.idInput.value = item.id || '';
        if (els.kegiatanInput) els.kegiatanInput.value = item.kegiatan || '';
        if (els.tempatInput) els.tempatInput.value = item.tempat || '';
        if (els.tanggalMulai) {
            const d = item.tanggal_mulai ? new Date(item.tanggal_mulai) : null;
            els.tanggalMulai.value = (d && !isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : todayISO();
        }
        if (els.tanggalSelesai) {
            const d = item.tanggal_selesai ? new Date(item.tanggal_selesai) : null;
            els.tanggalSelesai.value = (d && !isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : todayISO();
        }
        if (els.pesertaInput) els.pesertaInput.value = item.peserta || 0;
        if (els.anggaranInput) els.anggaranInput.value = item.anggaran || 0;
        if (els.deskripsiInput) els.deskripsiInput.value = item.deskripsi || '';
        if (els.fileUrlInput) els.fileUrlInput.value = item.file_url || '';
        if (els.fileInput) els.fileInput.value = '';
        if (els.statusSelect) els.statusSelect.value = item.status || 'draft';
        openModal();
    }

    // ═══════════════════════════════════════════════════════════
    // 11. DETAIL MODAL
    // ═══════════════════════════════════════════════════════════
    function openDetailModal(id) {
        const item = dataCache.find(function(l) { return String(l.id) === String(id); });
        if (!item) {
            safeToast('Logbook tidak ditemukan', 'warning');
            return;
        }
        currentDetailId = String(id);

        if (els.detailTitle) els.detailTitle.textContent = item.kegiatan || 'Detail Logbook';

        const status = item.status || 'draft';
        const statusBadge = status === 'final'
            ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Final</span>'
            : '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Draft</span>';

        if (els.detailBody) {
            els.detailBody.innerHTML =
                '<div class="flex items-center gap-2 mb-3">' + statusBadge + '</div>' +
                '<div class="grid grid-cols-2 gap-4">' +
                    '<div>' +
                        '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Mulai</p>' +
                        '<p class="text-sm text-[var(--text-main)]">' + esc(fmtDateLong(item.tanggal_mulai)) + '</p>' +
                    '</div>' +
                    '<div>' +
                        '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tanggal Selesai</p>' +
                        '<p class="text-sm text-[var(--text-main)]">' + esc(fmtDateLong(item.tanggal_selesai)) + '</p>' +
                    '</div>' +
                    '<div>' +
                        '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Tempat</p>' +
                        '<p class="text-sm text-[var(--text-main)]">' + esc(item.tempat || '-') + '</p>' +
                    '</div>' +
                    '<div>' +
                        '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Peserta</p>' +
                        '<p class="text-sm text-[var(--text-main)]">' + (item.peserta || 0) + ' orang</p>' +
                    '</div>' +
                    '<div>' +
                        '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Anggaran</p>' +
                        '<p class="text-sm text-[var(--text-main)]">' + esc(fmtRp(item.anggaran)) + '</p>' +
                    '</div>' +
                    '<div>' +
                        '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">Dibuat</p>' +
                        '<p class="text-sm text-[var(--text-main)]">' + esc(fmtDate(item.created_at)) + '</p>' +
                    '</div>' +
                    (item.file_url ?
                        '<div class="col-span-2">' +
                            '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-1">File Pendukung</p>' +
                            '<a href="' + escAttr(item.file_url) + '" target="_blank" rel="noopener noreferrer" ' +
                                'class="text-blue-600 hover:underline text-sm break-all">' +
                                '<i class="fas fa-paperclip mr-1"></i>' + esc(item.file_url) +
                            '</a>' +
                        '</div>' : '') +
                '</div>' +
                '<div class="border-t border-[var(--card-border)] pt-4">' +
                    '<p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">Deskripsi Kegiatan</p>' +
                    '<div class="bg-[var(--bg-stats)] rounded-lg p-4 max-h-96 overflow-y-auto">' +
                        (item.deskripsi ?
                            '<div class="logbook-detail-desc text-sm text-[var(--text-main)]">' +
                                esc(stripHtml(item.deskripsi)) +
                            '</div>' :
                            '<p class="text-sm text-[var(--text-muted)] italic">Tidak ada deskripsi.</p>') +
                    '</div>' +
                '</div>';
        }

        if (els.detailModal) {
            els.detailModal.classList.remove('hidden');
            els.detailModal.classList.add('flex');
            requestAnimationFrame(function() {
                if (els.detailContent) {
                    els.detailContent.classList.remove('scale-95', 'opacity-0');
                    els.detailContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        }
    }

    function closeDetailModal() {
        if (!els.detailModal) return;
        if (els.detailContent) {
            els.detailContent.classList.remove('scale-100', 'opacity-100');
            els.detailContent.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(function() {
            els.detailModal.classList.add('hidden');
            els.detailModal.classList.remove('flex');
        }, 150);
        document.body.style.overflow = '';
        currentDetailId = null;
    }

    // ═══════════════════════════════════════════════════════════
    // 12. DELETE HANDLER
    // ═══════════════════════════════════════════════════════════
    function handleDelete(id) {
        const item = dataCache.find(function(l) { return String(l.id) === String(id); });
        const nama = item ? (item.kegiatan || 'logbook ini') : 'logbook ini';

        showConfirm('Hapus logbook "' + nama + '"?', async function() {
            try {
                const res = await apiCall('deleteLogbook', 'POST', { id: id });
                if (res && res.success) {
                    dataCache = dataCache.filter(function(l) { return String(l.id) !== String(id); });
                    applyFilter();
                    if (typeof logActivity === 'function') {
                        try { await logActivity('DELETE', 'logbook', id, 'Hapus: ' + nama); } catch (e) {}
                    }
                    safeToast('✅ Logbook berhasil dihapus', 'success');
                } else {
                    safeToast((res && res.message) || 'Gagal menghapus', 'error');
                }
            } catch (e) {
                console.error('[sek_logbook] Delete error:', e);
                safeToast('Error: ' + e.message, 'error');
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 13. SUBMIT FORM (CREATE / UPDATE)
    // ═══════════════════════════════════════════════════════════
    async function handleSubmit(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (isSubmitting) return;

        const id = els.idInput ? els.idInput.value : '';
        const kegiatan = els.kegiatanInput ? (els.kegiatanInput.value || '').trim() : '';
        const tempat = els.tempatInput ? (els.tempatInput.value || '').trim() : '';
        const tanggal_mulai = els.tanggalMulai ? els.tanggalMulai.value : '';
        const tanggal_selesai = els.tanggalSelesai ? els.tanggalSelesai.value : '';
        const peserta = els.pesertaInput ? (parseInt(els.pesertaInput.value) || 0) : 0;
        const anggaran = els.anggaranInput ? (parseInt(els.anggaranInput.value) || 0) : 0;
        const deskripsi = els.deskripsiInput ? (els.deskripsiInput.value || '').trim() : '';
        const file_url = els.fileUrlInput ? (els.fileUrlInput.value || '').trim() : '';
        const status = els.statusSelect ? els.statusSelect.value : 'draft';

        // Validasi
        if (!kegiatan) {
            safeToast('Nama kegiatan wajib diisi!', 'warning');
            if (els.kegiatanInput) els.kegiatanInput.focus();
            return;
        }
        if (kegiatan.length < 3) {
            safeToast('Nama kegiatan minimal 3 karakter!', 'warning');
            if (els.kegiatanInput) els.kegiatanInput.focus();
            return;
        }
        if (!tempat) {
            safeToast('Tempat wajib diisi!', 'warning');
            if (els.tempatInput) els.tempatInput.focus();
            return;
        }
        if (!tanggal_mulai) {
            safeToast('Tanggal mulai wajib diisi!', 'warning');
            if (els.tanggalMulai) els.tanggalMulai.focus();
            return;
        }
        if (!tanggal_selesai) {
            safeToast('Tanggal selesai wajib diisi!', 'warning');
            if (els.tanggalSelesai) els.tanggalSelesai.focus();
            return;
        }
        if (new Date(tanggal_selesai) < new Date(tanggal_mulai)) {
            safeToast('Tanggal selesai tidak boleh sebelum tanggal mulai!', 'warning');
            if (els.tanggalSelesai) els.tanggalSelesai.focus();
            return;
        }
        if (!deskripsi) {
            safeToast('Deskripsi wajib diisi!', 'warning');
            if (els.deskripsiInput) els.deskripsiInput.focus();
            return;
        }

        isSubmitting = true;
        const submitBtn = els.form ? els.form.querySelector('button[type="submit"]') : null;
        const origHtml = submitBtn ? submitBtn.innerHTML : '';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
        }

        try {
            const payload = {
                kegiatan: kegiatan,
                tempat: tempat,
                tanggal_mulai: tanggal_mulai,
                tanggal_selesai: tanggal_selesai,
                peserta: peserta,
                anggaran: anggaran,
                deskripsi: deskripsi,
                file_url: file_url,
                status: status
            };

            let res;
            if (isEdit) {
                payload.id = id;
                res = await apiCall('updateLogbook', 'POST', payload);
            } else {
                res = await apiCall('createLogbook', 'POST', payload);
            }

            if (res && res.success) {
                if (isEdit) {
                    const idx = dataCache.findIndex(function(l) { return String(l.id) === String(id); });
                    if (idx !== -1) {
                        dataCache[idx] = Object.assign({}, dataCache[idx], payload, { id: id });
                    }
                } else {
                    dataCache.unshift({
                        id: res.id || ('tmp_' + Date.now()),
                        kegiatan: kegiatan,
                        tempat: tempat,
                        tanggal_mulai: tanggal_mulai,
                        tanggal_selesai: tanggal_selesai,
                        peserta: peserta,
                        anggaran: anggaran,
                        deskripsi: deskripsi,
                        file_url: file_url,
                        status: status,
                        created_at: new Date().toISOString()
                    });
                }

                applyFilter();

                // Background upload file
                if (els.fileInput && els.fileInput.files && els.fileInput.files.length > 0) {
                    if (!navigator.onLine) {
                        safeToast('📴 Upload file butuh koneksi internet', 'warning', 4500);
                    } else {
                        const targetId = isEdit ? id : res.id;
                        safeToast('Data tersimpan, mengunggah file...', 'info', 3000);
                        uploadFileBackground(targetId, els.fileInput.files[0]);
                    }
                }

                if (typeof logActivity === 'function') {
                    try {
                        await logActivity(
                            isEdit ? 'UPDATE' : 'CREATE',
                            'logbook',
                            res.id || id,
                            'Kegiatan: ' + kegiatan
                        );
                    } catch (e) {}
                }

                safeToast(
                    isEdit ? '✅ Logbook berhasil diperbarui!' : '✅ Logbook berhasil disimpan!',
                    'success'
                );

                closeModal();

            } else {
                safeToast((res && res.message) || 'Gagal menyimpan logbook', 'error');
            }

        } catch (err) {
            console.error('[sek_logbook] Submit error:', err);
            safeToast('Error: ' + err.message, 'error');
        } finally {
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origHtml;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 14. BACKGROUND UPLOAD FILE
    // ═══════════════════════════════════════════════════════════
    function uploadFileBackground(targetId, file) {
        if (!file || !targetId) return;

        if (typeof uploadFileToDrive !== 'function') {
            console.warn('[sek_logbook] uploadFileToDrive tidak tersedia');
            return;
        }

        uploadFileToDrive(file)
            .then(function(uploadResult) {
                if (uploadResult && uploadResult.success && uploadResult.url) {
                    return apiCall('updateLogbook', 'POST', {
                        id: targetId,
                        file_url: uploadResult.url
                    }).then(function() {
                        const idx = dataCache.findIndex(function(l) { return String(l.id) === String(targetId); });
                        if (idx !== -1) {
                            dataCache[idx].file_url = uploadResult.url;
                            applyFilter();
                        }
                        safeToast('✅ File berhasil diunggah', 'success');
                    });
                } else {
                    safeToast('Gagal upload file: ' + ((uploadResult && uploadResult.message) || 'Unknown'), 'error', 4000);
                }
            })
            .catch(function(err) {
                console.error('[sek_logbook] Upload error:', err);
                safeToast('Gagal upload: ' + err.message, 'error', 4000);
            });
    }

    // ═══════════════════════════════════════════════════════════
    // 15. ATTACH EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════

    if (els.addBtn) {
        const fresh = els.addBtn.cloneNode(true);
        els.addBtn.parentNode.replaceChild(fresh, els.addBtn);
        els.addBtn = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            openCreateModal();
        });
    }

    if (els.refreshBtn) {
        const fresh = els.refreshBtn.cloneNode(true);
        els.refreshBtn.parentNode.replaceChild(fresh, els.refreshBtn);
        els.refreshBtn = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            if (this.disabled) return;
            const orig = this.innerHTML;
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span class="hidden sm:inline">Memuat...</span>';
            loadLogbook(true).finally(function() {
                fresh.disabled = false;
                fresh.innerHTML = orig;
            });
        });
    }

    if (els.modalClose) {
        const fresh = els.modalClose.cloneNode(true);
        els.modalClose.parentNode.replaceChild(fresh, els.modalClose);
        els.modalClose = fresh;
        fresh.addEventListener('click', function(e) { e.preventDefault(); closeModal(); });
    }
    if (els.modalCancel) {
        const fresh = els.modalCancel.cloneNode(true);
        els.modalCancel.parentNode.replaceChild(fresh, els.modalCancel);
        els.modalCancel = fresh;
        fresh.addEventListener('click', function(e) { e.preventDefault(); closeModal(); });
    }
    if (els.modal) {
        els.modal.addEventListener('click', function(e) {
            if (e.target === els.modal) closeModal();
        });
    }

    // Detail modal controls
    if (els.detailClose) {
        const fresh = els.detailClose.cloneNode(true);
        els.detailClose.parentNode.replaceChild(fresh, els.detailClose);
        els.detailClose = fresh;
        fresh.addEventListener('click', function(e) { e.preventDefault(); closeDetailModal(); });
    }
    if (els.detailOk) {
        const fresh = els.detailOk.cloneNode(true);
        els.detailOk.parentNode.replaceChild(fresh, els.detailOk);
        els.detailOk = fresh;
        fresh.addEventListener('click', function(e) { e.preventDefault(); closeDetailModal(); });
    }
    if (els.detailModal) {
        els.detailModal.addEventListener('click', function(e) {
            if (e.target === els.detailModal) closeDetailModal();
        });
    }
    if (els.detailCopy) {
        const fresh = els.detailCopy.cloneNode(true);
        els.detailCopy.parentNode.replaceChild(fresh, els.detailCopy);
        els.detailCopy = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            if (!currentDetailId) return;
            const item = dataCache.find(function(l) { return String(l.id) === String(currentDetailId); });
            if (!item) return;
            const text =
                'KEGIATAN: ' + (item.kegiatan || '-') + '\n' +
                'TEMPAT: ' + (item.tempat || '-') + '\n' +
                'TANGGAL: ' + fmtDate(item.tanggal_mulai) + ' - ' + fmtDate(item.tanggal_selesai) + '\n' +
                'PESERTA: ' + (item.peserta || 0) + ' orang\n' +
                'ANGGARAN: ' + fmtRp(item.anggaran) + '\n' +
                'STATUS: ' + (item.status || 'draft') + '\n' +
                'DESKRIPSI: ' + stripHtml(item.deskripsi || '-');
            copyToClipboard(text)
                .then(function() { safeToast('✅ Detail dicopy', 'success', 2500); })
                .catch(function() { safeToast('Gagal copy', 'error'); });
        });
    }
    if (els.detailEdit) {
        const fresh = els.detailEdit.cloneNode(true);
        els.detailEdit.parentNode.replaceChild(fresh, els.detailEdit);
        els.detailEdit = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            if (!currentDetailId) return;
            const item = dataCache.find(function(l) { return String(l.id) === String(currentDetailId); });
            if (!item) return;
            closeDetailModal();
            setTimeout(function() { openEditModal(item); }, 200);
        });
    }

    // ESC key — close both modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (els.detailModal && !els.detailModal.classList.contains('hidden')) {
                closeDetailModal();
                return;
            }
            if (els.modal && !els.modal.classList.contains('hidden')) {
                closeModal();
                return;
            }
        }
    });

    // Form submit
    if (els.form) {
        const fresh = els.form.cloneNode(true);
        els.form.parentNode.replaceChild(fresh, els.form);
        els.form = fresh;

        // Re-bind after clone
        els.idInput       = document.getElementById('logbook-id');
        els.kegiatanInput = document.getElementById('logbook_kegiatan');
        els.tempatInput   = document.getElementById('logbook_tempat');
        els.tanggalMulai  = document.getElementById('logbook_tanggal_mulai');
        els.tanggalSelesai= document.getElementById('logbook_tanggal_selesai');
        els.pesertaInput  = document.getElementById('logbook_peserta');
        els.anggaranInput = document.getElementById('logbook_anggaran');
        els.deskripsiInput= document.getElementById('logbook_deskripsi');
        els.fileUrlInput  = document.getElementById('logbook_file_url');
        els.fileInput     = document.getElementById('logbook_file');
        els.statusSelect  = document.getElementById('logbook_status');

        fresh.addEventListener('submit', handleSubmit);
    }

    // Search (debounced)
    if (els.searchInput) {
        let searchTimer = null;
        els.searchInput.addEventListener('input', function() {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(function() {
                currentFilter.search = (els.searchInput.value || '').toLowerCase().trim();
                applyFilter();
            }, 250);
        });
    }

    // Filter status
    if (els.filterStatus) {
        els.filterStatus.addEventListener('change', function() {
            currentFilter.status = els.filterStatus.value;
            applyFilter();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 16. ONLINE/OFFLINE + SYNC HANDLERS
    // ═══════════════════════════════════════════════════════════

    function handleOnline() {
        console.log('[sek_logbook] 🟢 Online');
        toggleOfflineBanner();
        setTimeout(function() { loadLogbook(true); }, 1500);
    }

    function handleOffline() {
        console.log('[sek_logbook] 🔴 Offline');
        toggleOfflineBanner();
    }

    function handleSyncComplete(e) {
        const detail = e && e.detail ? e.detail : {};
        if (detail.processed > 0) {
            console.log('[sek_logbook] Sync complete → refresh');
            setTimeout(function() { loadLogbook(true); }, 800);
        }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync:complete', handleSyncComplete);

    // ═══════════════════════════════════════════════════════════
    // 17. CLEANUP
    // ═══════════════════════════════════════════════════════════
    function cleanup() {
        window.__sekLogbookLoaded = false;
        isSubmitting = false;
        isLoading = false;
        dataCache = [];
        filteredCache = [];
        currentDetailId = null;

        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('sync:complete', handleSyncComplete);

        if (els.modal) {
            els.modal.classList.add('hidden');
            els.modal.classList.remove('flex');
        }
        if (els.detailModal) {
            els.detailModal.classList.add('hidden');
            els.detailModal.classList.remove('flex');
        }
        document.body.style.overflow = '';

        console.log('[sek_logbook] Cleanup');
    }
    window.__sekretarisLogbookCleanup = cleanup;

    // ═══════════════════════════════════════════════════════════
    // 18. INIT
    // ═══════════════════════════════════════════════════════════
    updateSubtitle();
    toggleOfflineBanner();

    if (els.tanggalMulai && !els.tanggalMulai.value) els.tanggalMulai.value = todayISO();
    if (els.tanggalSelesai && !els.tanggalSelesai.value) els.tanggalSelesai.value = todayISO();

    console.log('[sek_logbook] Loading initial data...');
    loadLogbook(false);

    console.log('[sek_logbook] ✅ Init selesai v1.1.0');
});