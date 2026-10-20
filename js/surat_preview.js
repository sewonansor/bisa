/**
 * js/surat_preview.js
 * Modul Preview & Cetak Surat — v4.0.0 FULL FIX
 * ============================================================
 * CHANGELOG v4.0.0:
 *   ✅ NEW: Handle offline mode
 *   ✅ NEW: Safe toast fallback
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe seluruh DOM elements
 *   ✅ FIX: Load getSurat + getStruktur paralel
 *   ✅ FIX: Tanda tangan 2 kolom (Ketua + Sekretaris)
 *   ✅ FIX: findPengurusByJabatan fuzzy match
 *   ✅ FIX: renderSignature null-safe
 *   ✅ FIX: Auto-append "PAC GP Ansor Kapanewon Sewon"
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Hash routing 3 fallback
 *   ✅ FIX: Error state inline
 *   ✅ FIX: Export PNG high quality (2x scale)
 *   ✅ FIX: html2canvas auto-load
 *   ✅ FIX: Filename otomatis dari nomor surat
 *   ✅ FIX: Double-click prevention
 *   ✅ FIX: Print handling dengan title restore
 *   ✅ FIX: Fallback kalau getStruktur gagal
 *   ✅ FIX: ESC handler tidak konflik
 *   ✅ PRESERVED: Semua fitur v3.3.0
 * ============================================================
 */

App.register('surat_preview', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__suratPreviewLoaded) {
        console.log('[surat_preview] Sudah di-init, skip.');
        return;
    }
    window.__suratPreviewLoaded = true;

    // ================================================================
    // 2. CEK AUTH
    // ================================================================
    var user = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!user) {
        console.warn('[surat_preview] Tidak ada user — redirect ke /auth');
        if (typeof router !== 'undefined' && typeof router.load === 'function') {
            router.load('/auth');
        } else {
            window.location.hash = '/auth';
        }
        window.__suratPreviewLoaded = false;
        return;
    }

    // ================================================================
    // 3. AMBIL ID DARI URL — 3 FALLBACK
    // ================================================================
    function getSuratId() {
        if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
            var id1 = window.__currentQuery.get('id');
            if (id1) return String(id1).trim();
        }

        var hash = window.location.hash || '';
        var qIdx = hash.indexOf('?');
        if (qIdx !== -1) {
            try {
                var params = new URLSearchParams(hash.substring(qIdx));
                var id2 = params.get('id');
                if (id2) return String(id2).trim();
            } catch (e) {
                console.warn('[surat_preview] Hash parse error:', e);
            }
        }

        try {
            var id3 = new URLSearchParams(window.location.search).get('id');
            if (id3) return String(id3).trim();
        } catch (e) {
            console.warn('[surat_preview] Search parse error:', e);
        }

        return '';
    }

    var suratId = getSuratId();

    // ================================================================
    // 4. DOM ELEMENTS
    // ================================================================
    var loading   = document.getElementById('preview-loading');
    var kopSurat  = document.getElementById('kop-surat');
    var isiSurat  = document.getElementById('isi-surat');
    var backBtn   = document.getElementById('back-btn');
    var printBtn  = document.getElementById('print-btn');
    var exportImgBtn = document.getElementById('export-image-btn');

    var tanggalEl  = document.getElementById('surat-tanggal');
    var nomorEl    = document.getElementById('surat-nomor');
    var lampiranEl = document.getElementById('surat-lampiran');
    var perihalEl  = document.getElementById('surat-perihal');
    var penerimaEl = document.getElementById('surat-penerima');
    var isiEl      = document.getElementById('surat-isi');
    var pengirimEl = document.getElementById('surat-pengirim');

    var ketuaNamaEl         = document.getElementById('surat-ketua-nama');
    var ketuaJabatanEl      = document.getElementById('surat-ketua-jabatan');
    var sekretarisNamaEl    = document.getElementById('surat-sekretaris-nama');
    var sekretarisJabatanEl = document.getElementById('surat-sekretaris-jabatan');

    if (!loading && !kopSurat && !isiSurat) {
        console.error('[surat_preview] Semua elemen utama tidak ditemukan — abort.');
        window.__suratPreviewLoaded = false;
        return;
    }

    // ================================================================
    // 5. HELPERS
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

    function formatTanggalIndo(d) {
        if (!d) return '-';
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    function safeToast(msg, type, dur) {
        if (typeof showToast === 'function') {
            showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[surat_preview:' + (type || 'info') + ']', msg);
        }
    }

    function navigateTo(url) {
        if (typeof router !== 'undefined' && typeof router.load === 'function') {
            router.load(url);
        } else {
            window.location.hash = url;
        }
    }

    // ================================================================
    // 6. STATE — Show/Hide Management
    // ================================================================
    function showLoading() {
        if (loading) {
            loading.classList.remove('hidden');
            loading.innerHTML =
                '<div class="text-center py-16">' +
                    '<i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i>' +
                    '<p class="text-gray-500 mt-4">Memuat surat...</p>' +
                    '<p class="text-gray-400 text-xs mt-2">ID: ' + escapeHtml(suratId) + '</p>' +
                    (!navigator.onLine
                        ? '<p class="text-amber-600 text-xs mt-2"><i class="fas fa-wifi mr-1"></i>Mode offline — memuat dari cache</p>'
                        : '') +
                '</div>';
        }
        if (kopSurat) kopSurat.classList.add('hidden');
        if (isiSurat) isiSurat.classList.add('hidden');
    }

    function showContent() {
        if (loading) loading.classList.add('hidden');
        if (kopSurat) kopSurat.classList.remove('hidden');
        if (isiSurat) isiSurat.classList.remove('hidden');
    }

    function showErrorState(message, subMessage) {
        if (loading) {
            loading.classList.remove('hidden');
            loading.innerHTML =
                '<div class="text-center py-16">' +
                    '<i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>' +
                    '<p class="text-red-500 font-medium text-lg mb-2">' +
                        escapeHtml(message || 'Terjadi kesalahan') +
                    '</p>' +
                    (subMessage
                        ? '<p class="text-[var(--text-muted)] text-sm mb-6 max-w-md mx-auto">' +
                            escapeHtml(subMessage) +
                          '</p>'
                        : '') +
                    '<div class="flex flex-wrap justify-center gap-2 mt-6">' +
                        '<button id="surat-preview-retry-btn" type="button"' +
                            ' class="btn-primary px-6 py-2 rounded-lg inline-flex items-center gap-2">' +
                            '<i class="fas fa-sync-alt"></i>' +
                            '<span>Coba Lagi</span>' +
                        '</button>' +
                        '<button id="surat-preview-back-error-btn" type="button"' +
                            ' class="btn-secondary px-6 py-2 rounded-lg inline-flex items-center gap-2">' +
                            '<i class="fas fa-arrow-left"></i>' +
                            '<span>Kembali ke Daftar Surat</span>' +
                        '</button>' +
                    '</div>' +
                '</div>';
        }
        if (kopSurat) kopSurat.classList.add('hidden');
        if (isiSurat) isiSurat.classList.add('hidden');

        setTimeout(function() {
            var retryBtn = document.getElementById('surat-preview-retry-btn');
            var backErrBtn = document.getElementById('surat-preview-back-error-btn');

            if (retryBtn) {
                var freshRetry = retryBtn.cloneNode(true);
                retryBtn.parentNode.replaceChild(freshRetry, retryBtn);
                freshRetry.addEventListener('click', function() {
                    console.log('[surat_preview] Retry load...');
                    loadSurat();
                });
            }

            if (backErrBtn) {
                var freshBack = backErrBtn.cloneNode(true);
                backErrBtn.parentNode.replaceChild(freshBack, backErrBtn);
                freshBack.addEventListener('click', function() {
                    var dashUrl = (user.role === 'admin') ? '/surat_admin' : '/surat_member';
                    navigateTo(dashUrl);
                });
            }
        }, 50);
    }

    // ================================================================
    // 7. VALIDASI ID
    // ================================================================
    if (!suratId) {
        console.warn('[surat_preview] ID kosong — menampilkan error state');

        try {
            document.title = 'Surat Tidak Ditemukan - PAC GP Ansor Sewon';
        } catch (e) {}

        showErrorState(
            'ID Surat tidak ditemukan',
            'Link mungkin tidak lengkap. Kembali ke daftar surat untuk memilih surat yang ingin dilihat.'
        );

        setupBackButton();
        setupPrintButton();
        setupExportImageButton();
        return;
    }

    // ================================================================
    // 8. SETUP BUTTONS
    // ================================================================
    function setupBackButton() {
        if (!backBtn) return;
        if (backBtn.dataset.attached === 'true') return;

        var fresh = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(fresh, backBtn);
        backBtn = fresh;
        backBtn.dataset.attached = 'true';

        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            var dashUrl = (user.role === 'admin') ? '/surat_admin' : '/surat_member';
            navigateTo(dashUrl);
        });
    }

    function setupPrintButton() {
        if (!printBtn) return;
        if (printBtn.dataset.attached === 'true') return;

        var fresh = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(fresh, printBtn);
        printBtn = fresh;
        printBtn.dataset.attached = 'true';

        printBtn.addEventListener('click', function(e) {
            e.preventDefault();
            try {
                var originalTitle = document.title;
                document.title = 'Surat_' + (nomorEl && nomorEl.textContent
                    ? nomorEl.textContent.replace(/[\/\\:*?"<>|]/g, '_')
                    : 'Preview');
                window.print();
                setTimeout(function() {
                    try { document.title = originalTitle; } catch (e) {}
                }, 1000);
            } catch (err) {
                console.error('[surat_preview] Print error:', err);
                safeToast('Gagal membuka print dialog', 'error', 3000);
            }
        });
    }

    function setupExportImageButton() {
        if (!exportImgBtn) return;
        if (exportImgBtn.dataset.attached === 'true') return;

        var fresh = exportImgBtn.cloneNode(true);
        exportImgBtn.parentNode.replaceChild(fresh, exportImgBtn);
        exportImgBtn = fresh;
        exportImgBtn.dataset.attached = 'true';

        exportImgBtn.addEventListener('click', function(e) {
            e.preventDefault();
            exportAsImage(fresh);
        });
    }

    // ================================================================
    // 9. FIND PENGURUS BY JABATAN (fuzzy match)
    // ================================================================
    function findPengurusByJabatan(list, keywords) {
        if (!Array.isArray(list) || list.length === 0) return null;

        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            var jabatan = String(item.jabatan || '').toLowerCase().trim();

            for (var k = 0; k < keywords.length; k++) {
                var kw = keywords[k].toLowerCase();

                if (kw === 'ketua') {
                    if (jabatan === 'ketua' ||
                        (jabatan.indexOf('ketua') !== -1 &&
                         jabatan.indexOf('wakil') === -1 &&
                         jabatan.indexOf('penasehat') === -1)) {
                        return item;
                    }
                } else if (kw === 'sekretaris') {
                    if (jabatan === 'sekretaris' ||
                        (jabatan.indexOf('sekretaris') !== -1 &&
                         jabatan.indexOf('wakil') === -1)) {
                        return item;
                    }
                } else {
                    if (jabatan.indexOf(kw) !== -1) return item;
                }
            }
        }
        return null;
    }

    // ================================================================
    // 10. AUTO-APPEND NAMA ORGANISASI
    // ================================================================
    function buildFullJabatan(jabatan, defaultJabatan) {
        var j = String(jabatan || '').trim();

        if (!j) {
            j = defaultJabatan || 'Pengurus';
        }

        var lower = j.toLowerCase();
        if (lower.indexOf('pac') !== -1 || lower.indexOf('kapanewon') !== -1) {
            return j;
        }

        return j + ' PAC GP Ansor Kapanewon Sewon';
    }

    // ================================================================
    // 11. LOAD DATA SURAT + STRUKTUR (Paralel)
    // ================================================================
    function loadSurat() {
        showLoading();

        if (typeof apiCall !== 'function') {
            showErrorState('API tidak tersedia', 'Sistem sedang tidak dapat diakses.');
            return;
        }

        Promise.all([
            apiCall('getSurat', 'POST', {}),
            apiCall('getStruktur', 'POST', {}).catch(function(err) {
                console.warn('[surat_preview] getStruktur gagal, pakai fallback:',
                             err && err.message);
                return { success: false, data: [] };
            })
        ])
            .then(function(results) {
                var suratRes = results[0];
                var strukturRes = results[1];

                if (!suratRes || !suratRes.success) {
                    throw new Error((suratRes && suratRes.message) || 'Gagal memuat data surat');
                }

                var data = Array.isArray(suratRes.data) ? suratRes.data : [];
                var surat = data.find(function(s) {
                    return String(s.id) === String(suratId);
                });

                if (!surat) {
                    showErrorState(
                        'Surat tidak ditemukan',
                        'Surat dengan ID "' + suratId + '" tidak ada di database. Mungkin sudah dihapus.'
                    );
                    return;
                }

                var strukturList = (strukturRes && strukturRes.success && Array.isArray(strukturRes.data))
                    ? strukturRes.data : [];

                var ketua = findPengurusByJabatan(strukturList, ['ketua']);
                var sekretaris = findPengurusByJabatan(strukturList, ['sekretaris']);

                console.log('[surat_preview] ✅ Surat found:', surat.nomor_surat || suratId);
                console.log('[surat_preview] 👤 Ketua:', ketua ? (ketua.nama + ' (' + ketua.jabatan + ')') : '(tidak ditemukan)');
                console.log('[surat_preview] 👤 Sekretaris:', sekretaris ? (sekretaris.nama + ' (' + sekretaris.jabatan + ')') : '(tidak ditemukan)');

                renderSurat(surat, ketua, sekretaris);
            })
            .catch(function(error) {
                console.error('[surat_preview] Load error:', error);
                showErrorState(
                    'Gagal memuat surat',
                    error.message || 'Periksa koneksi internet Anda dan coba lagi.'
                );
            });
    }

    // ================================================================
    // 12. RENDER SURAT
    // ================================================================
    function renderSurat(surat, ketua, sekretaris) {
        showContent();

        if (tanggalEl) {
            var tanggalText = surat.tanggal
                ? 'Bantul, ' + formatTanggalIndo(surat.tanggal)
                : 'Bantul, ' + formatTanggalIndo(new Date());
            tanggalEl.textContent = tanggalText;
        }

        if (nomorEl) nomorEl.textContent = surat.nomor_surat || '-';
        if (lampiranEl) lampiranEl.textContent = surat.lampiran || '-';
        if (perihalEl) perihalEl.textContent = surat.perihal || '-';
        if (penerimaEl) penerimaEl.textContent = surat.penerima || '-';

        if (isiEl) {
            var isiContent = String(surat.isi || '-');
            isiContent = isiContent
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
                .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
                .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
                .replace(/javascript:/gi, '');

            if (/<[a-z][\s\S]*>/i.test(isiContent)) {
                isiEl.innerHTML = isiContent;
            } else {
                isiEl.textContent = isiContent;
            }
        }

        renderSignature(ketua, sekretaris);

        try {
            var titleText = surat.perihal
                ? surat.perihal.substring(0, 60)
                : 'Surat';
            document.title = titleText + ' - PAC GP Ansor Sewon';
        } catch (e) {}
    }

    // ================================================================
    // 13. RENDER TANDA TANGAN (Ketua + Sekretaris)
    // ================================================================
    function renderSignature(ketua, sekretaris) {
        if (ketuaNamaEl) {
            ketuaNamaEl.textContent = (ketua && ketua.nama)
                ? String(ketua.nama).trim()
                : '(Nama Ketua)';
        }

        if (ketuaJabatanEl) {
            ketuaJabatanEl.textContent = buildFullJabatan(
                ketua && ketua.jabatan,
                'Ketua'
            );
        }

        if (sekretarisNamaEl) {
            sekretarisNamaEl.textContent = (sekretaris && sekretaris.nama)
                ? String(sekretaris.nama).trim()
                : '(Nama Sekretaris)';
        }

        if (sekretarisJabatanEl) {
            sekretarisJabatanEl.textContent = buildFullJabatan(
                sekretaris && sekretaris.jabatan,
                'Sekretaris'
            );
        }

        if (pengirimEl) {
            pengirimEl.textContent = '';
            pengirimEl.style.display = 'none';
        }
    }

    // ================================================================
    // 14. EXPORT AS IMAGE (PNG)
    // ================================================================
    async function exportAsImage(btnEl) {
        if (!isiSurat || isiSurat.classList.contains('hidden')) {
            safeToast('Surat belum selesai dimuat', 'warning', 3000);
            return;
        }

        if (btnEl && btnEl.disabled) return;

        var originalHTML = btnEl ? btnEl.innerHTML : '';
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Menyiapkan...</span>';
        }

        try {
            if (typeof html2canvas === 'undefined') {
                console.log('[surat_preview] Loading html2canvas...');
                safeToast('Memuat library...', 'info', 2000);

                if (typeof loadLib === 'function') {
                    await loadLib('html2canvas');
                } else {
                    await loadScriptManual(
                        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
                    );
                }
            }

            if (typeof html2canvas === 'undefined') {
                throw new Error('Library html2canvas tidak tersedia');
            }

            var targetEl = document.getElementById('surat-preview-container');
            if (!targetEl) {
                throw new Error('Container surat tidak ditemukan');
            }

            var oldBg = targetEl.style.background;
            var oldBoxShadow = targetEl.style.boxShadow;
            var oldBorderRadius = targetEl.style.borderRadius;
            var oldPadding = targetEl.style.padding;

            targetEl.style.background = '#ffffff';
            targetEl.style.boxShadow = 'none';
            targetEl.style.borderRadius = '0';
            targetEl.style.padding = '40px';

            safeToast('Menyusun gambar...', 'info', 2000);

            var canvas = await html2canvas(targetEl, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                allowTaint: false,
                windowWidth: targetEl.scrollWidth,
                windowHeight: targetEl.scrollHeight
            });

            targetEl.style.background = oldBg;
            targetEl.style.boxShadow = oldBoxShadow;
            targetEl.style.borderRadius = oldBorderRadius;
            targetEl.style.padding = oldPadding;

            var nomorSurat = (nomorEl && nomorEl.textContent)
                ? String(nomorEl.textContent).trim()
                : 'surat';

            var cleanNomor = nomorSurat
                .replace(/[\/\\:*?"<>|]/g, '_')
                .replace(/\s+/g, '_')
                .substring(0, 60);

            var timestamp = new Date().toISOString().slice(0, 10);
            var filename = 'Surat_' + cleanNomor + '_' + timestamp + '.png';

            if (canvas.toBlob) {
                canvas.toBlob(function(blob) {
                    if (!blob) {
                        downloadViaDataURL(canvas, filename);
                        return;
                    }

                    var url = URL.createObjectURL(blob);
                    var link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

                    safeToast('✅ Gambar berhasil di-download: ' + filename, 'success', 3500);
                }, 'image/png', 0.95);
            } else {
                downloadViaDataURL(canvas, filename);
            }

        } catch (err) {
            console.error('[surat_preview] Export image error:', err);
            safeToast('Gagal export gambar: ' + (err.message || 'Unknown error'), 'error', 5000);
        } finally {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = originalHTML;
            }
        }
    }

    function downloadViaDataURL(canvas, filename) {
        try {
            var dataUrl = canvas.toDataURL('image/png', 0.95);
            var link = document.createElement('a');
            link.href = dataUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            safeToast('✅ Gambar berhasil di-download: ' + filename, 'success', 3500);
        } catch (err) {
            throw new Error('Gagal generate data URL: ' + err.message);
        }
    }

    function loadScriptManual(src) {
        return new Promise(function(resolve, reject) {
            if (document.querySelector('script[src="' + src + '"]')) {
                setTimeout(resolve, 500);
                return;
            }

            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function() { resolve(); };
            s.onerror = function() { reject(new Error('Gagal load: ' + src)); };
            document.head.appendChild(s);
        });
    }

    // ================================================================
    // 15. CLEANUP
    // ================================================================
    function cleanup() {
        window.__suratPreviewLoaded = false;
        try {
            document.title = 'PAC GP Ansor Kapanewon Sewon';
        } catch (e) {}
        console.log('[surat_preview] Cleanup');
    }
    window.__suratPreviewCleanup = cleanup;

    // ================================================================
    // 16. INIT
    // ================================================================
    console.log('[surat_preview] Init v4.0.0 — ID: "' + suratId + '" | Role:', user.role);

    setupBackButton();
    setupPrintButton();
    setupExportImageButton();
    loadSurat();
});