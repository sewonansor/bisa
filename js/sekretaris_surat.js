/**
 * js/sekretaris_surat.js
 * Modul Sekretaris Surat Ranting — v1.1.0 FULL FIX
 * ---------------------------------------------------------
 * CHANGELOG v1.1.0:
 *   ✅ NEW: Standalone module (tidak reuse surat_member)
 *   ✅ NEW: 3-state UI (skeleton → content / error / empty)
 *   ✅ NEW: Null-safe semua DOM elements
 *   ✅ NEW: Search real-time + filter jenis
 *   ✅ NEW: Stats 4 kartu auto-update
 *   ✅ NEW: Modal create/edit dengan clone-replace listener
 *   ✅ NEW: Auto nomor surat dari backend
 *   ✅ NEW: Copy nomor surat ke clipboard
 *   ✅ NEW: Preview & Cetak via /surat_preview
 *   ✅ NEW: Delete single dengan konfirmasi
 *   ✅ NEW: Upload lampiran background
 *   ✅ NEW: Offline-aware
 *   ✅ NEW: Auto-refresh saat sync:complete, online
 *   ✅ NEW: Cleanup function
 *   ✅ NEW: XSS protection (esc + escAttr)
 *   ✅ FIX: Response format handling (root/data/data.data)
 *   ✅ FIX: isSubmitting anti double-submit
 *   ✅ FIX: ESC + click-outside modal close
 * ---------------------------------------------------------
 * Route: /sekretaris_surat
 * Endpoint:
 *   - getSurat (list, auto-scoped backend)
 *   - createSurat (auto-assign kalurahan backend)
 *   - updateSurat (guard backend)
 *   - deleteSurat (guard backend)
 *   - uploadFile (background)
 * Compatible: views/sekretaris_surat.html v1.1.0
 */

App.register('sekretaris_surat', function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // 1. GUARD ANTI-DUPLIKASI
    // ═══════════════════════════════════════════════════════════
    if (window.__sekSuratLoaded) {
        console.log('[sek_surat] Sudah di-init, skip.');
        return;
    }
    window.__sekSuratLoaded = true;

    // ═══════════════════════════════════════════════════════════
    // 2. AUTH GUARD
    // ═══════════════════════════════════════════════════════════
    const user = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!user || user.role !== 'sekretaris') {
        console.warn('[sek_surat] Bukan sekretaris — redirect');
        if (typeof router !== 'undefined' && router.load) {
            router.load('/auth');
        } else {
            window.location.hash = '/auth';
        }
        window.__sekSuratLoaded = false;
        return;
    }

    console.log('[sek_surat] 🚀 Init v1.1.0 untuk', user.nama || user.username, '·', user.kalurahan || '-');

    // ═══════════════════════════════════════════════════════════
    // 3. DOM ELEMENTS — NULL-SAFE
    // ═══════════════════════════════════════════════════════════
    const els = {
        subtitle:        document.getElementById('sek-surat-subtitle'),
        offlineBanner:   document.getElementById('sek-surat-offline-banner'),
        tableBody:       document.getElementById('surat-table-body'),
        skeleton:        document.getElementById('surat-skeleton'),
        modal:           document.getElementById('surat-modal'),
        modalContent:    document.getElementById('modal-content'),
        modalTitle:      document.getElementById('modal-title'),
        modalClose:      document.getElementById('modal-close'),
        modalCancel:     document.getElementById('modal-cancel'),
        form:            document.getElementById('surat-form'),
        addBtn:          document.getElementById('add-surat-btn'),
        refreshBtn:      document.getElementById('refresh-surat-btn'),
        idInput:         document.getElementById('surat-id'),
        nomorInput:      document.getElementById('nomor_surat'),
        perihalInput:    document.getElementById('perihal'),
        tanggalInput:    document.getElementById('tanggal'),
        pengirimInput:   document.getElementById('pengirim'),
        penerimaInput:   document.getElementById('penerima'),
        isiInput:        document.getElementById('isi'),
        lampiranInput:   document.getElementById('lampiran'),
        fileInput:       document.getElementById('surat_file'),
        jenisSelect:     document.getElementById('jenis_surat'),
        searchInput:     document.getElementById('surat-search'),
        filterJenis:     document.getElementById('surat-filter-jenis'),
        statTotal:       document.getElementById('stats-total-surat'),
        statInternal:    document.getElementById('stats-internal-surat'),
        statEksternal:   document.getElementById('stats-eksternal-surat'),
        statBulan:       document.getElementById('stats-bulan-surat')
    };

    // ═══════════════════════════════════════════════════════════
    // 4. STATE
    // ═══════════════════════════════════════════════════════════
    let dataCache = [];
    let filteredCache = [];
    let isEdit = false;
    let isSubmitting = false;
    let isLoading = false;
    let currentFilter = { search: '', jenis: 'all' };

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
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
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
        console.log('[sek_surat:' + (type || 'info') + ']', msg);
    }

    function showConfirm(msg, cb) {
        if (typeof window.showConfirm === 'function') {
            window.showConfirm(msg, cb);
        } else if (confirm(msg)) {
            cb();
        }
    }

    function getJenisFromNomor(nomor) {
        if (!nomor) return 'internal';
        return String(nomor).includes('SR-02') ? 'eksternal' : 'internal';
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

    // ═══════════════════════════════════════════════════════════
    // 6. SUBTITLE + SIDEBAR LABEL UPDATE
    // ═══════════════════════════════════════════════════════════
    function updateSubtitle() {
        if (els.subtitle) {
            els.subtitle.textContent = 'Ranting ' + (user.kalurahan || '-');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 7. APPLY FILTER
    // ═══════════════════════════════════════════════════════════
    function applyFilter() {
        filteredCache = dataCache.filter(function(item) {
            // Filter jenis
            if (currentFilter.jenis !== 'all') {
                const jenis = getJenisFromNomor(item.nomor_surat);
                if (jenis !== currentFilter.jenis) return false;
            }
            // Filter search
            if (currentFilter.search) {
                const q = currentFilter.search;
                const haystack = [
                    item.nomor_surat, item.perihal,
                    item.pengirim, item.penerima, item.isi
                ].map(function(v) { return String(v || '').toLowerCase(); }).join(' ');

                if (haystack.indexOf(q) === -1) return false;
            }
            return true;
        });

        // Sort by tanggal desc
        filteredCache.sort(function(a, b) {
            const da = new Date(a.tanggal || 0).getTime() || 0;
            const db = new Date(b.tanggal || 0).getTime() || 0;
            return db - da;
        });

        renderTable(filteredCache);
        updateStats();
    }

    // ═══════════════════════════════════════════════════════════
    // 8. UPDATE STATS
    // ═══════════════════════════════════════════════════════════
    function updateStats() {
        const total = dataCache.length;
        const internal = dataCache.filter(function(s) {
            return getJenisFromNomor(s.nomor_surat) === 'internal';
        }).length;
        const eksternal = total - internal;

        const now = new Date();
        const bulanIni = dataCache.filter(function(s) {
            const d = new Date(s.tanggal);
            if (isNaN(d.getTime())) return false;
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length;

        if (els.statTotal)     els.statTotal.textContent = total;
        if (els.statInternal)  els.statInternal.textContent = internal;
        if (els.statEksternal) els.statEksternal.textContent = eksternal;
        if (els.statBulan)     els.statBulan.textContent = bulanIni;
    }

    // ═══════════════════════════════════════════════════════════
    // 9. RENDER TABLE
    // ═══════════════════════════════════════════════════════════
    function renderTable(data) {
        if (!els.tableBody) return;

        if (!data || data.length === 0) {
            const isFiltered = currentFilter.search || currentFilter.jenis !== 'all';
            els.tableBody.innerHTML =
                '<tr><td colspan="8" class="text-center py-12 text-[var(--text-muted)]">' +
                    '<i class="fas fa-' + (isFiltered ? 'search' : 'file-alt') + ' text-3xl mb-2 opacity-40"></i>' +
                    '<p>' + (isFiltered ? 'Tidak ada hasil yang cocok' : 'Belum ada surat di ranting ini') + '</p>' +
                    (isFiltered ? '<button type="button" id="surat-clear-filter-inline" class="mt-3 text-xs text-blue-600 hover:underline">Reset filter</button>' : '') +
                '</td></tr>';

            const clearBtn = document.getElementById('surat-clear-filter-inline');
            if (clearBtn) {
                clearBtn.addEventListener('click', function() {
                    currentFilter = { search: '', jenis: 'all' };
                    if (els.searchInput) els.searchInput.value = '';
                    if (els.filterJenis) els.filterJenis.value = 'all';
                    applyFilter();
                });
            }
            return;
        }

        let html = '';
        data.forEach(function(item, idx) {
            const jenis = getJenisFromNomor(item.nomor_surat);
            const id = item.id || '';
            const nomor = item.nomor_surat || '-';
            const perihal = item.perihal || '-';
            const tanggal = fmtDate(item.tanggal);
            const pengirim = item.pengirim || '-';
            const penerima = item.penerima || '-';

            const jenisBadge = jenis === 'internal'
                ? '<span class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Internal</span>'
                : '<span class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Eksternal</span>';

            const lampiranIcon = item.lampiran
                ? '<a href="' + escAttr(item.lampiran) + '" target="_blank" rel="noopener noreferrer" ' +
                    'class="text-blue-600 hover:text-blue-800 dark:text-blue-400" title="Lihat lampiran">' +
                    '<i class="fas fa-paperclip"></i></a>'
                : '<span class="text-[var(--text-muted)]">-</span>';

            html +=
                '<tr class="transition-colors">' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)] text-center">' + (idx + 1) + '</td>' +
                    '<td class="px-3 py-3 text-sm">' +
                        '<div class="flex items-center gap-1.5">' +
                            '<span class="font-mono text-xs text-[var(--text-main)]">' + esc(nomor) + '</span>' +
                            (nomor !== '-' ?
                                '<button type="button" data-action="copy-nomor" data-nomor="' + escAttr(nomor) + '" ' +
                                'class="text-[var(--text-muted)] hover:text-[var(--text-main)] transition" ' +
                                'title="Copy nomor">' +
                                '<i class="fas fa-copy text-xs"></i></button>' : '') +
                        '</div>' +
                    '</td>' +
                    '<td class="px-3 py-3 text-sm">' +
                        '<div class="font-medium text-[var(--text-main)] line-clamp-1">' + esc(perihal) + '</div>' +
                        jenisBadge +
                    '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">' + esc(tanggal) + '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)]">' + esc(pengirim) + '</td>' +
                    '<td class="px-3 py-3 text-sm text-[var(--text-muted)]">' + esc(penerima) + '</td>' +
                    '<td class="px-3 py-3 text-sm text-center">' + lampiranIcon + '</td>' +
                    '<td class="px-3 py-3 text-sm whitespace-nowrap text-center">' +
                        '<button type="button" data-action="preview" data-id="' + escAttr(id) + '" ' +
                            'class="text-green-600 hover:text-green-800 dark:text-green-400 mr-2" title="Preview & Cetak">' +
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

        // Attach event delegation (single listener on tbody)
        attachTableEvents();
    }

    function attachTableEvents() {
        if (!els.tableBody) return;

        // Avoid double-bind by tracking flag
        if (els.tableBody.__delegateBound) return;
        els.tableBody.__delegateBound = true;

        els.tableBody.addEventListener('click', function(e) {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            const nomor = btn.getAttribute('data-nomor');

            if (action === 'copy-nomor' && nomor) {
                copyToClipboard(nomor)
                    .then(function() { safeToast('Nomor dicopy: ' + nomor, 'success', 2500); })
                    .catch(function() { safeToast('Gagal copy nomor', 'error'); });
                return;
            }

            if (action === 'preview' && id) {
                router.load('/surat_preview?id=' + encodeURIComponent(id));
                return;
            }

            if (action === 'edit' && id) {
                const item = dataCache.find(function(s) { return String(s.id) === String(id); });
                if (item) openEditModal(item);
                else safeToast('Surat tidak ditemukan di cache', 'warning');
                return;
            }

            if (action === 'delete' && id) {
                handleDelete(id);
                return;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 10. LOAD DATA
    // ═══════════════════════════════════════════════════════════
    async function loadSurat(force) {
        if (isLoading) return;
        isLoading = true;

        if (els.skeleton) els.skeleton.classList.remove('hidden');
        if (els.tableBody && !dataCache.length) {
            els.tableBody.innerHTML =
                '<tr><td colspan="8" class="text-center py-12">' +
                    '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i>' +
                    '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data surat...</p>' +
                '</td></tr>';
        }

        try {
            let res;
            if (force && typeof window.forceRefreshData === 'function') {
                res = await window.forceRefreshData('getSurat', { __fresh: true });
            } else if (typeof window.apiCall === 'function') {
                res = await window.apiCall('getSurat', 'POST', {});
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
                safeToast('✅ Data surat diperbarui', 'success', 2500);
            }

        } catch (err) {
            console.error('[sek_surat] Load error:', err);
            if (els.tableBody) {
                els.tableBody.innerHTML =
                    '<tr><td colspan="8" class="text-center py-12 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-3xl mb-2"></i>' +
                        '<p class="font-medium">Gagal memuat data</p>' +
                        '<p class="text-xs mt-1">' + esc(err.message) + '</p>' +
                        '<button type="button" id="surat-error-retry" class="mt-3 text-xs text-blue-600 hover:underline">' +
                            '<i class="fas fa-redo mr-1"></i>Coba Lagi</button>' +
                    '</td></tr>';

                const retryBtn = document.getElementById('surat-error-retry');
                if (retryBtn) {
                    retryBtn.addEventListener('click', function() { loadSurat(true); });
                }
            }
        } finally {
            isLoading = false;
            if (els.skeleton) els.skeleton.classList.add('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 11. MODAL OPEN/CLOSE
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
            if (els.perihalInput) els.perihalInput.focus();
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

        // Reset form
        if (els.form) els.form.reset();
        if (els.idInput) els.idInput.value = '';
        if (els.nomorInput) {
            els.nomorInput.value = 'Otomatis dibuat sistem';
            els.nomorInput.disabled = true;
        }
        if (els.fileInput) els.fileInput.value = '';
        isEdit = false;
    }

    // ═══════════════════════════════════════════════════════════
    // 12. OPEN CREATE MODAL
    // ═══════════════════════════════════════════════════════════
    function openCreateModal() {
        isEdit = false;
        if (els.modalTitle) els.modalTitle.textContent = 'Tambah Surat';
        if (els.form) els.form.reset();
        if (els.idInput) els.idInput.value = '';
        if (els.nomorInput) {
            els.nomorInput.value = 'Otomatis dibuat sistem';
            els.nomorInput.disabled = true;
        }
        if (els.tanggalInput && !els.tanggalInput.value) {
            els.tanggalInput.value = todayISO();
        }
        if (els.fileInput) els.fileInput.value = '';
        openModal();
    }

    // ═══════════════════════════════════════════════════════════
    // 13. OPEN EDIT MODAL
    // ═══════════════════════════════════════════════════════════
    function openEditModal(item) {
        isEdit = true;
        if (els.modalTitle) els.modalTitle.textContent = 'Edit Surat';
        if (els.idInput) els.idInput.value = item.id || '';
        if (els.nomorInput) {
            els.nomorInput.value = item.nomor_surat || '';
            els.nomorInput.disabled = true;
        }
        if (els.perihalInput) els.perihalInput.value = item.perihal || '';

        if (els.tanggalInput) {
            const d = item.tanggal ? new Date(item.tanggal) : null;
            els.tanggalInput.value = (d && !isNaN(d.getTime())) ? d.toISOString().slice(0, 10) : '';
        }

        if (els.pengirimInput) els.pengirimInput.value = item.pengirim || '';
        if (els.penerimaInput) els.penerimaInput.value = item.penerima || '';
        if (els.isiInput) els.isiInput.value = item.isi || '';
        if (els.lampiranInput) els.lampiranInput.value = item.lampiran || '';
        if (els.fileInput) els.fileInput.value = '';
        if (els.jenisSelect) els.jenisSelect.value = getJenisFromNomor(item.nomor_surat);

        openModal();
    }

    // ═══════════════════════════════════════════════════════════
    // 14. DELETE HANDLER
    // ═══════════════════════════════════════════════════════════
    function handleDelete(id) {
        const item = dataCache.find(function(s) { return String(s.id) === String(id); });
        const nomor = item ? (item.nomor_surat || 'surat ini') : 'surat ini';

        showConfirm('Hapus surat "' + nomor + '"?', async function() {
            try {
                const res = await apiCall('deleteSurat', 'POST', { id: id });
                if (res && res.success) {
                    dataCache = dataCache.filter(function(s) { return String(s.id) !== String(id); });
                    applyFilter();
                    if (typeof logActivity === 'function') {
                        try { await logActivity('DELETE', 'surat', id, 'Hapus: ' + nomor); } catch (e) {}
                    }
                    safeToast('✅ Surat berhasil dihapus', 'success');
                } else {
                    safeToast((res && res.message) || 'Gagal menghapus', 'error');
                }
            } catch (e) {
                console.error('[sek_surat] Delete error:', e);
                safeToast('Error: ' + e.message, 'error');
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 15. SUBMIT FORM (CREATE / UPDATE)
    // ═══════════════════════════════════════════════════════════
    async function handleSubmit(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (isSubmitting) return;

        // Ambil nilai
        const id = els.idInput ? els.idInput.value : '';
        const perihal = els.perihalInput ? (els.perihalInput.value || '').trim() : '';
        const tanggal = els.tanggalInput ? els.tanggalInput.value : '';
        const pengirim = els.pengirimInput ? (els.pengirimInput.value || '').trim() : '';
        const penerima = els.penerimaInput ? (els.penerimaInput.value || '').trim() : '';
        const isi = els.isiInput ? (els.isiInput.value || '').trim() : '';
        const lampiran = els.lampiranInput ? (els.lampiranInput.value || '').trim() : '';
        const jenis_surat = els.jenisSelect ? els.jenisSelect.value : 'internal';

        // Validasi
        if (!perihal) {
            safeToast('Perihal wajib diisi!', 'warning');
            if (els.perihalInput) els.perihalInput.focus();
            return;
        }
        if (!tanggal) {
            safeToast('Tanggal wajib diisi!', 'warning');
            if (els.tanggalInput) els.tanggalInput.focus();
            return;
        }
        if (!pengirim) {
            safeToast('Pengirim wajib diisi!', 'warning');
            if (els.pengirimInput) els.pengirimInput.focus();
            return;
        }
        if (!penerima) {
            safeToast('Penerima wajib diisi!', 'warning');
            if (els.penerimaInput) els.penerimaInput.focus();
            return;
        }
        if (!isi) {
            safeToast('Isi surat wajib diisi!', 'warning');
            if (els.isiInput) els.isiInput.focus();
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
                perihal: perihal,
                tanggal: tanggal,
                pengirim: pengirim,
                penerima: penerima,
                isi: isi,
                lampiran: lampiran,
                jenis_surat: jenis_surat
            };

            let res;
            if (isEdit) {
                payload.id = id;
                res = await apiCall('updateSurat', 'POST', payload);
            } else {
                res = await apiCall('createSurat', 'POST', payload);
            }

            if (res && res.success) {
                // Update cache lokal (optimistic)
                if (isEdit) {
                    const idx = dataCache.findIndex(function(s) { return String(s.id) === String(id); });
                    if (idx !== -1) {
                        dataCache[idx] = Object.assign({}, dataCache[idx], payload, { id: id });
                    }
                } else {
                    dataCache.unshift({
                        id: res.id || ('tmp_' + Date.now()),
                        nomor_surat: res.nomor_surat || '(generating...)',
                        perihal: perihal,
                        tanggal: tanggal,
                        pengirim: pengirim,
                        penerima: penerima,
                        isi: isi,
                        lampiran: lampiran,
                        created_at: new Date().toISOString()
                    });
                }

                applyFilter();

                // Background upload lampiran
                if (els.fileInput && els.fileInput.files && els.fileInput.files.length > 0) {
                    if (!navigator.onLine) {
                        safeToast('📴 Upload lampiran butuh koneksi internet', 'warning', 4500);
                    } else {
                        const targetId = isEdit ? id : res.id;
                        safeToast('Data tersimpan, mengunggah lampiran...', 'info', 3000);
                        uploadLampiranBackground(targetId, els.fileInput.files[0]);
                    }
                }

                // Log activity
                if (typeof logActivity === 'function') {
                    try {
                        await logActivity(
                            isEdit ? 'UPDATE' : 'CREATE',
                            'surat',
                            res.id || id,
                            'Surat: ' + perihal
                        );
                    } catch (e) {}
                }

                safeToast(
                    isEdit ? '✅ Surat berhasil diperbarui!' : '✅ Surat berhasil disimpan!',
                    'success'
                );

                closeModal();

            } else {
                safeToast((res && res.message) || 'Gagal menyimpan surat', 'error');
            }

        } catch (err) {
            console.error('[sek_surat] Submit error:', err);
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
    // 16. BACKGROUND UPLOAD LAMPIRAN
    // ═══════════════════════════════════════════════════════════
    function uploadLampiranBackground(targetId, file) {
        if (!file || !targetId) return;

        if (typeof uploadFileToDrive !== 'function') {
            console.warn('[sek_surat] uploadFileToDrive tidak tersedia');
            return;
        }

        uploadFileToDrive(file)
            .then(function(uploadResult) {
                if (uploadResult && uploadResult.success && uploadResult.url) {
                    return apiCall('updateSurat', 'POST', {
                        id: targetId,
                        lampiran: uploadResult.url
                    }).then(function() {
                        // Update cache
                        const idx = dataCache.findIndex(function(s) { return String(s.id) === String(targetId); });
                        if (idx !== -1) {
                            dataCache[idx].lampiran = uploadResult.url;
                            applyFilter();
                        }
                        safeToast('✅ Lampiran berhasil diunggah', 'success');
                    });
                } else {
                    safeToast('Gagal upload lampiran: ' + ((uploadResult && uploadResult.message) || 'Unknown'), 'error', 4000);
                }
            })
            .catch(function(err) {
                console.error('[sek_surat] Upload error:', err);
                safeToast('Gagal upload: ' + err.message, 'error', 4000);
            });
    }

    // ═══════════════════════════════════════════════════════════
    // 17. ATTACH EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════

    // Add button
    if (els.addBtn) {
        const fresh = els.addBtn.cloneNode(true);
        els.addBtn.parentNode.replaceChild(fresh, els.addBtn);
        els.addBtn = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            openCreateModal();
        });
    }

    // Refresh button
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
            loadSurat(true).finally(function() {
                fresh.disabled = false;
                fresh.innerHTML = orig;
            });
        });
    }

    // Modal close
    if (els.modalClose) {
        const fresh = els.modalClose.cloneNode(true);
        els.modalClose.parentNode.replaceChild(fresh, els.modalClose);
        els.modalClose = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal();
        });
    }

    if (els.modalCancel) {
        const fresh = els.modalCancel.cloneNode(true);
        els.modalCancel.parentNode.replaceChild(fresh, els.modalCancel);
        els.modalCancel = fresh;
        fresh.addEventListener('click', function(e) {
            e.preventDefault();
            closeModal();
        });
    }

    // Modal backdrop click
    if (els.modal) {
        els.modal.addEventListener('click', function(e) {
            if (e.target === els.modal) closeModal();
        });
    }

    // ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && els.modal && !els.modal.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Form submit
    if (els.form) {
        const fresh = els.form.cloneNode(true);
        els.form.parentNode.replaceChild(fresh, els.form);
        els.form = fresh;

        // Re-bind DOM refs (karena form di-clone)
        els.idInput      = document.getElementById('surat-id');
        els.perihalInput = document.getElementById('perihal');
        els.tanggalInput = document.getElementById('tanggal');
        els.pengirimInput= document.getElementById('pengirim');
        els.penerimaInput= document.getElementById('penerima');
        els.isiInput     = document.getElementById('isi');
        els.lampiranInput= document.getElementById('lampiran');
        els.fileInput    = document.getElementById('surat_file');
        els.jenisSelect  = document.getElementById('jenis_surat');

        fresh.addEventListener('submit', handleSubmit);
    }

    // Search input (debounced)
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

    // Filter jenis
    if (els.filterJenis) {
        els.filterJenis.addEventListener('change', function() {
            currentFilter.jenis = els.filterJenis.value;
            applyFilter();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 18. ONLINE/OFFLINE + SYNC HANDLERS
    // ═══════════════════════════════════════════════════════════

    function handleOnline() {
        console.log('[sek_surat] 🟢 Online');
        toggleOfflineBanner();
        setTimeout(function() { loadSurat(true); }, 1500);
    }

    function handleOffline() {
        console.log('[sek_surat] 🔴 Offline');
        toggleOfflineBanner();
    }

    function handleSyncComplete(e) {
        const detail = e && e.detail ? e.detail : {};
        if (detail.processed > 0) {
            console.log('[sek_surat] Sync complete → refresh');
            setTimeout(function() { loadSurat(true); }, 800);
        }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync:complete', handleSyncComplete);

    // ═══════════════════════════════════════════════════════════
    // 19. CLEANUP
    // ═══════════════════════════════════════════════════════════
    function cleanup() {
        window.__sekSuratLoaded = false;
        isSubmitting = false;
        isLoading = false;
        dataCache = [];
        filteredCache = [];

        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('sync:complete', handleSyncComplete);

        if (els.modal) {
            els.modal.classList.add('hidden');
            els.modal.classList.remove('flex');
        }
        document.body.style.overflow = '';

        console.log('[sek_surat] Cleanup');
    }
    window.__sekretarisSuratCleanup = cleanup;

    // ═══════════════════════════════════════════════════════════
    // 20. INIT
    // ═══════════════════════════════════════════════════════════
    updateSubtitle();
    toggleOfflineBanner();

    if (els.tanggalInput && !els.tanggalInput.value) {
        els.tanggalInput.value = todayISO();
    }

    console.log('[sek_surat] Loading initial data...');
    loadSurat(false);

    console.log('[sek_surat] ✅ Init selesai v1.1.0');
});