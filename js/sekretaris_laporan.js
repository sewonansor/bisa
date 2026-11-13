/**
 * js/sekretaris_laporan.js
 * Laporan Ranting — v1.2.0 FULL FIX (Sekretaris Ranting Edition)
 * ---------------------------------------------------------
 * CHANGELOG v1.2.0:
 *   ✅ FIX: 3-state UI (loading → content / error)
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Response format handling (root/data/data.data)
 *   ✅ FIX: Offline-aware (banner + fallback cache)
 *   ✅ FIX: Auto-load library (html2canvas, jspdf, docx)
 *   ✅ FIX: Anti double-export (isExporting flag)
 *   ✅ FIX: Cleanup function proper
 *   ✅ FIX: XSS protection (esc + escAttr)
 *   ✅ FIX: TTD auto-fetch dari struktur_organisasi
 *   ✅ FIX: Periode filter re-render tanpa reload API
 *   ✅ NEW: Refresh button loading state
 *   ✅ NEW: Error state dengan tombol Retry
 *   ✅ NEW: Subtitle + periode label dinamis
 *   ✅ NEW: 8 halaman A4 (Cover, Ringkasan, Logbook, Surat,
 *          Keuangan, Absensi, Anggota, Penutup + TTD)
 *   ✅ NEW: Export PNG multi-file per halaman
 *   ✅ NEW: Export DOCX multi-section
 *   ✅ NEW: Empty state per halaman
 *   ✅ PRESERVED: Semua fitur v1.0.0
 * ---------------------------------------------------------
 * Route: /sekretaris_laporan
 * Endpoint:
 *   - getSekretarisStats (ranting stats + kalurahan)
 *   - getLogbook (scoped)
 *   - getSurat (scoped)
 *   - getKeuangan (scoped)
 *   - getAbsensi (ranting filter)
 *   - getUsers (for anggota ranting)
 *   - getStruktur (for TTD)
 * Libs: html2canvas, jspdf, docx
 * Compatible: views/sekretaris_laporan.html v1.0.0+
 */

App.register('sekretaris_laporan', function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // 1. GUARD ANTI-DUPLIKASI
    // ═══════════════════════════════════════════════════════════
    if (window.__sekLaporanLoaded) {
        console.log('[sek_laporan] Sudah di-init, skip.');
        return;
    }
    window.__sekLaporanLoaded = true;

    // ═══════════════════════════════════════════════════════════
    // 2. AUTH GUARD
    // ═══════════════════════════════════════════════════════════
    const user = (typeof checkAuth === 'function') ? checkAuth() : null;
    if (!user || user.role !== 'sekretaris') {
        console.warn('[sek_laporan] Bukan sekretaris — redirect');
        if (typeof router !== 'undefined' && router.load) {
            router.load('/auth');
        } else {
            window.location.hash = '/auth';
        }
        window.__sekLaporanLoaded = false;
        return;
    }

    console.log('[sek_laporan] 🚀 Init v1.2.0 untuk', user.nama || user.username, '·', user.kalurahan || '-');

    // ═══════════════════════════════════════════════════════════
    // 3. DOM ELEMENTS — NULL-SAFE
    // ═══════════════════════════════════════════════════════════
    const els = {
        loading:        document.getElementById('report-loading'),
        reportArea:     document.getElementById('report-area'),
        reportContent:  document.getElementById('report-content'),
        offlineBanner:  document.getElementById('report-offline-banner'),
        periodInput:    document.getElementById('period-filter'),
        subtitle:       document.getElementById('sek-laporan-subtitle'),
        periodLabel:    document.getElementById('sek-laporan-period-label'),
        backBtn:        document.getElementById('back-btn'),
        refreshBtn:     document.getElementById('refresh-btn'),
        printBtn:       document.getElementById('print-pdf-btn'),
        pngBtn:         document.getElementById('export-image-btn'),
        docxBtn:        document.getElementById('export-docx-btn')
    };

    if (!els.reportContent || !els.loading) {
        console.error('[sek_laporan] ❌ Elemen utama tidak ditemukan');
        window.__sekLaporanLoaded = false;
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // 4. STATE
    // ═══════════════════════════════════════════════════════════
    let reportData = null;
    let isExporting = false;
    let isLoading = false;

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
        return x.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function fmtDateLong(d) {
        if (!d) return '-';
        const x = new Date(d);
        if (isNaN(x.getTime())) return '-';
        return x.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function fmtRp(n) {
        const num = Number(n) || 0;
        return 'Rp ' + num.toLocaleString('id-ID');
    }

    function stripHtml(h) {
        if (!h) return '';
        const d = document.createElement('div');
        d.innerHTML = h;
        return (d.textContent || d.innerText || '').trim();
    }

    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info', dur || 3000); return; } catch (e) {}
        }
        console.log('[sek_laporan:' + (type || 'info') + ']', msg);
    }

    function extractData(res) {
        if (!res) return null;
        if (res.success && Array.isArray(res.data)) return res.data;
        if (res.success && res.data && Array.isArray(res.data.data)) return res.data.data;
        if (res.success && res.data && typeof res.data === 'object') return res.data;
        if (Array.isArray(res)) return res;
        return null;
    }

    function extractObject(res) {
        if (!res) return null;
        if (res.success && res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
            if (res.data.data && typeof res.data.data === 'object' && !Array.isArray(res.data.data)) {
                return res.data.data;
            }
            return res.data;
        }
        if (res.success) return res;
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

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try { await window.loadLib(name); return true; }
            catch (e) { console.warn('[sek_laporan] Lib fail:', name, e); return false; }
        }
        return false;
    }

    function setLoadingState(state, message) {
        if (state === 'loading') {
            if (els.loading) {
                els.loading.classList.remove('hidden');
                if (message) {
                    els.loading.innerHTML =
                        '<div class="text-center">' +
                            '<i class="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>' +
                            '<p class="text-gray-500 font-medium">' + esc(message) + '</p>' +
                        '</div>';
                }
            }
            if (els.reportContent) els.reportContent.classList.add('hidden');
        } else if (state === 'content') {
            if (els.loading) els.loading.classList.add('hidden');
            if (els.reportContent) els.reportContent.classList.remove('hidden');
        } else if (state === 'error') {
            if (els.loading) {
                els.loading.classList.remove('hidden');
                els.loading.innerHTML =
                    '<div class="text-center py-12">' +
                        '<i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>' +
                        '<p class="text-red-500 font-medium text-lg mb-2">Gagal Memuat Laporan</p>' +
                        '<p class="text-gray-500 text-sm mb-6 max-w-md mx-auto">' +
                            esc(message || 'Terjadi kesalahan saat memuat data.') +
                        '</p>' +
                        '<button type="button" id="report-error-retry" ' +
                            'class="px-5 py-2 bg-[#0f2922] text-white rounded-lg text-sm font-medium hover:bg-[#1a4038] transition inline-flex items-center gap-2">' +
                            '<i class="fas fa-redo"></i>Coba Lagi' +
                        '</button>' +
                    '</div>';
            }
            if (els.reportContent) els.reportContent.classList.add('hidden');

            setTimeout(function() {
                const retryBtn = document.getElementById('report-error-retry');
                if (retryBtn) {
                    retryBtn.addEventListener('click', function() { init(); });
                }
            }, 50);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. LOAD ALL DATA (parallel)
    // ═══════════════════════════════════════════════════════════
    async function loadAllData() {
        if (isLoading) return null;
        isLoading = true;

        setLoadingState('loading', 'Menyiapkan laporan A4...');

        try {
            const results = await Promise.allSettled([
                apiCall('getSekretarisStats', 'POST', {}),
                apiCall('getLogbook', 'POST', {}),
                apiCall('getSurat', 'POST', {}),
                apiCall('getKeuangan', 'POST', {}),
                apiCall('getAbsensi', 'POST', { scope: 'ranting' }),
                apiCall('getUsers', 'POST', {}),
                apiCall('getStruktur', 'POST', {})
            ]);

            const data = {
                stats:    extractObject(results[0].status === 'fulfilled' ? results[0].value : null),
                logbook:  safeArr(extractData(results[1].status === 'fulfilled' ? results[1].value : null)),
                surat:    safeArr(extractData(results[2].status === 'fulfilled' ? results[2].value : null)),
                keuangan: safeArr(extractData(results[3].status === 'fulfilled' ? results[3].value : null)),
                absensi:  safeArr(extractData(results[4].status === 'fulfilled' ? results[4].value : null)),
                users:    safeArr(extractData(results[5].status === 'fulfilled' ? results[5].value : null)),
                struktur: safeArr(extractData(results[6].status === 'fulfilled' ? results[6].value : null))
            };

            return data;

        } catch (err) {
            console.error('[sek_laporan] loadAllData error:', err);
            throw err;
        } finally {
            isLoading = false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 7. FILTER BY PERIOD
    // ═══════════════════════════════════════════════════════════
    function filterByPeriod(rows, period, dateFields) {
        if (!period) return rows;
        const parts = String(period).split('-').map(Number);
        const yyyy = parts[0];
        const mm = parts[1];
        if (!yyyy || !mm) return rows;

        const fields = Array.isArray(dateFields) ? dateFields : [dateFields || 'tanggal'];

        return rows.filter(function(r) {
            for (let i = 0; i < fields.length; i++) {
                const raw = r[fields[i]];
                if (!raw) continue;
                const d = new Date(raw);
                if (!isNaN(d.getTime())) {
                    return d.getFullYear() === yyyy && (d.getMonth() + 1) === mm;
                }
            }
            return false;
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 8. FIND PENGURUS BY JABATAN (fuzzy match)
    // ═══════════════════════════════════════════════════════════
    function findPengurus(list, keywords) {
        if (!Array.isArray(list) || list.length === 0) return null;
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const jab = String(item.jabatan || '').toLowerCase().trim();
            for (let k = 0; k < keywords.length; k++) {
                const kw = keywords[k].toLowerCase();
                if (kw === 'ketua') {
                    if (jab === 'ketua' ||
                        (jab.indexOf('ketua') !== -1 && jab.indexOf('wakil') === -1 && jab.indexOf('penasehat') === -1)) {
                        return item;
                    }
                } else if (kw === 'sekretaris') {
                    if (jab === 'sekretaris' ||
                        (jab.indexOf('sekretaris') !== -1 && jab.indexOf('wakil') === -1)) {
                        return item;
                    }
                } else {
                    if (jab.indexOf(kw) !== -1) return item;
                }
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // 9. PERIOD LABEL
    // ═══════════════════════════════════════════════════════════
    function getPeriodLabel(period) {
        if (!period) return 'Semua Periode';
        const parts = String(period).split('-').map(Number);
        const yyyy = parts[0];
        const mm = parts[1];
        const bulan = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                       'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return (bulan[mm] || '') + ' ' + yyyy;
    }

    // ═══════════════════════════════════════════════════════════
    // 10. RENDER REPORT
    // ═══════════════════════════════════════════════════════════
    function renderReport(data, period) {
        const stats = data.stats || {};
        const kal = stats.kalurahan || user.kalurahan || '-';

        // Filter by period
        const logbook   = filterByPeriod(data.logbook, period, ['tanggal_mulai', 'created_at']);
        const surat     = filterByPeriod(data.surat, period, ['tanggal', 'created_at']);
        const keuangan  = filterByPeriod(data.keuangan, period, ['tanggal', 'created_at']);
        const absensi   = filterByPeriod(data.absensi, period, ['created_at']);

        // Anggota ranting (filter kalurahan)
        const kalLower = String(kal).toLowerCase().trim();
        const anggota = data.users.filter(function(u) {
            const uKal = String(u.kalurahan || '').toLowerCase().trim();
            return uKal === kalLower;
        });

        // Totals keuangan
        let masuk = 0, keluar = 0;
        keuangan.forEach(function(t) {
            const j = Number(t.jumlah) || 0;
            if (t.jenis === 'Pemasukan') masuk += j;
            else keluar += j;
        });

        // Update subtitle & period label
        if (els.subtitle) {
            els.subtitle.innerHTML = '<i class="fas fa-map-marker-alt mr-1"></i>Ranting ' + esc(kal);
        }
        if (els.periodLabel) {
            const span = els.periodLabel.querySelector('span');
            if (span) span.textContent = 'Periode: ' + getPeriodLabel(period);
        }

        // TTD
        const ketua = findPengurus(data.struktur, ['ketua']);
        const sekretaris = findPengurus(data.struktur, ['sekretaris']);
        const namaKetua = (ketua && ketua.nama) ? String(ketua.nama).trim() : '........................';
        const namaSekretaris = (sekretaris && sekretaris.nama) ? String(sekretaris.nama).trim() : '........................';
        const namaUser = (user.nama || user.username || 'Sekretaris').trim();

        const now = new Date();

        // ═══════════════════════════════════════════════════════
        // BUILD HTML
        // ═══════════════════════════════════════════════════════
        let html = '';

        // ────────── COVER ──────────
        html +=
            '<div class="a4-page a4-cover">' +
                '<div class="a4-cover-header">' +
                    '<img src="logo-ansor.webp" class="a4-cover-logo" alt="Logo" onerror="this.style.display=\'none\'">' +
                    '<div class="a4-cover-org-name">PAC GP ANSOR</div>' +
                    '<div class="a4-cover-org-sub">Ranting ' + esc(kal) + ' • Kapanewon Sewon</div>' +
                '</div>' +
                '<div class="a4-cover-body">' +
                    '<div style="font-family:\'Inter\',sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;color:#64748b;text-transform:uppercase;margin-bottom:24px;text-align:center;line-height:1.5;">' +
                        'Laporan Pertanggungjawaban<br>Ranting ' + esc(kal) +
                    '</div>' +
                    '<h1 style="font-family:\'Amiri\',serif;font-size:clamp(32px,6vw,44px);font-weight:700;color:#0f172a;line-height:1.1;margin:0 0 16px;text-transform:uppercase;text-align:center;">' +
                        'Laporan<br><span style="color:#059669;font-style:italic;">Ranting</span>' +
                    '</h1>' +
                    '<div style="width:60px;height:2px;background:#fbbf24;margin:0 auto 20px;"></div>' +
                    '<div style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9999px;padding:6px 20px;margin-bottom:32px;text-align:center;">' +
                        '<span style="font-family:\'Inter\',sans-serif;font-size:12px;font-weight:800;color:#0f172a;letter-spacing:1px;">' +
                            esc(getPeriodLabel(period).toUpperCase()) +
                        '</span>' +
                    '</div>' +
                    '<p style="font-family:\'Inter\',sans-serif;font-size:13px;color:#475569;line-height:1.6;margin:0 auto;max-width:80%;text-align:center;">' +
                        'Rekapitulasi Kinerja Ranting ' + esc(kal) + '<br>' +
                        '<span style="font-weight:600;color:#0f172a;">Tanggal Cetak: ' + esc(fmtDateLong(now)) + '</span>' +
                    '</p>' +
                '</div>' +
                '<div class="a4-cover-footer">' +
                    '<div class="a4-cover-info">' +
                        '<div class="a4-cover-info-item">' +
                            '<span class="a4-cover-info-label">Disusun Oleh</span>' +
                            '<span class="a4-cover-info-value">Sekretaris Ranting ' + esc(kal) + '</span>' +
                        '</div>' +
                        '<div class="a4-cover-info-item">' +
                            '<span class="a4-cover-info-label">Tanggal Cetak</span>' +
                            '<span class="a4-cover-info-value">' + esc(fmtDateLong(now)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="a4-cover-qr-placeholder">Scan<br>Validasi</div>' +
                '</div>' +
            '</div>';

        // ────────── RINGKASAN ──────────
        function sumBox(icon, label, value) {
            return (
                '<div class="a4-summary-box" style="border:1px solid #e2e8f0;border-radius:8px;padding:16px 12px;text-align:center;background:#f8fafc;position:relative;overflow:hidden;">' +
                    '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:#0f2922;"></div>' +
                    '<div style="font-size:18px;margin-bottom:6px;color:#059669;"><i class="fas ' + icon + '"></i></div>' +
                    '<div style="font-size:9px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.05em;line-height:1.3;margin-bottom:6px;">' + esc(label) + '</div>' +
                    '<div style="font-size:16px;font-weight:800;color:#0f172a;line-height:1.15;word-break:break-word;">' + value + '</div>' +
                '</div>'
            );
        }

        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-chart-pie"></i></div>' +
                        '<h2 class="a4-h2">Ringkasan Ranting</h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 2</span>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">' +
                    sumBox('fa-file-alt', 'Surat', surat.length) +
                    sumBox('fa-calendar-check', 'Logbook', logbook.length) +
                    sumBox('fa-users', 'Anggota', anggota.length) +
                    sumBox('fa-clipboard-check', 'Absensi', absensi.length) +
                    sumBox('fa-arrow-down', 'Pemasukan', fmtRp(masuk)) +
                    sumBox('fa-arrow-up', 'Pengeluaran', fmtRp(keluar)) +
                    sumBox('fa-wallet', 'Saldo', fmtRp(masuk - keluar)) +
                    sumBox('fa-tasks', 'Bulan Ini', stats.logbookBulanIni || 0) +
                '</div>' +
                '<div style="border-left:4px solid #059669;background:#f8fafc;padding:18px 22px;font-size:11.5px;line-height:1.75;color:#334155;border-radius:0 8px 8px 0;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-top:10px;">' +
                    '<p style="margin:0;"><strong style="color:#0f2922;">Laporan Ranting ' + esc(kal) + '</strong> — data bersumber dari database terpusat, difilter otomatis oleh sistem sesuai kalurahan sekretaris. Laporan ini mencakup modul surat, logbook, keuangan, absensi, dan keanggotaan ranting.</p>' +
                '</div>' +
            '</div>';

        // ────────── LOGBOOK ──────────
        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-calendar-check"></i></div>' +
                        '<h2 class="a4-h2">Logbook Kegiatan <span class="a4-badge a4-badge-green">' + logbook.length + ' item</span></h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 3</span>' +
                '</div>' +
                (logbook.length === 0
                    ? '<p class="a4-empty">Tidak ada logbook pada periode ini.</p>'
                    : '<table class="a4-table"><thead><tr>' +
                        '<th style="width:30px;">No</th>' +
                        '<th>Nama Kegiatan</th>' +
                        '<th style="width:90px;">Tanggal</th>' +
                        '<th>Tempat</th>' +
                        '<th style="width:60px;" class="a4-center">Peserta</th>' +
                      '</tr></thead><tbody>' +
                      logbook.slice(0, 25).map(function(k, i) {
                          return '<tr>' +
                              '<td class="a4-center">' + (i + 1) + '</td>' +
                              '<td>' + esc(k.kegiatan || '-') + '</td>' +
                              '<td class="a4-center">' + fmtDate(k.tanggal_mulai) + '</td>' +
                              '<td>' + esc(k.tempat || '-') + '</td>' +
                              '<td class="a4-center">' + (k.peserta || 0) + '</td>' +
                          '</tr>';
                      }).join('') +
                      '</tbody></table>') +
            '</div>';

        // ────────── SURAT ──────────
        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-file-alt"></i></div>' +
                        '<h2 class="a4-h2">Arsip Surat <span class="a4-badge a4-badge-green">' + surat.length + ' item</span></h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 4</span>' +
                '</div>' +
                (surat.length === 0
                    ? '<p class="a4-empty">Tidak ada surat pada periode ini.</p>'
                    : '<table class="a4-table"><thead><tr>' +
                        '<th style="width:30px;">No</th>' +
                        '<th>Nomor Surat</th>' +
                        '<th>Perihal</th>' +
                        '<th style="width:90px;">Tanggal</th>' +
                        '<th>Pengirim</th>' +
                      '</tr></thead><tbody>' +
                      surat.slice(0, 25).map(function(s, i) {
                          return '<tr>' +
                              '<td class="a4-center">' + (i + 1) + '</td>' +
                              '<td class="a4-mono">' + esc(s.nomor_surat || '-') + '</td>' +
                              '<td>' + esc(s.perihal || '-') + '</td>' +
                              '<td class="a4-center">' + fmtDate(s.tanggal) + '</td>' +
                              '<td>' + esc(s.pengirim || '-') + '</td>' +
                          '</tr>';
                      }).join('') +
                      '</tbody></table>') +
            '</div>';

        // ────────── KEUANGAN ──────────
        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-coins"></i></div>' +
                        '<h2 class="a4-h2">Keuangan Ranting</h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 5</span>' +
                '</div>' +
                (keuangan.length === 0
                    ? '<p class="a4-empty">Tidak ada transaksi keuangan pada periode ini.</p>'
                    : '<table class="a4-table"><thead><tr>' +
                        '<th style="width:30px;">No</th>' +
                        '<th style="width:90px;">Tanggal</th>' +
                        '<th style="width:90px;">Jenis</th>' +
                        '<th>Kategori</th>' +
                        '<th style="width:120px;" class="a4-right">Jumlah</th>' +
                      '</tr></thead><tbody>' +
                      keuangan.slice(0, 30).map(function(t, i) {
                          return '<tr>' +
                              '<td class="a4-center">' + (i + 1) + '</td>' +
                              '<td class="a4-center">' + fmtDate(t.tanggal) + '</td>' +
                              '<td class="a4-center">' + esc(t.jenis || '-') + '</td>' +
                              '<td>' + esc(t.kategori || '-') + '</td>' +
                              '<td class="a4-right a4-mono">' + fmtRp(t.jumlah) + '</td>' +
                          '</tr>';
                      }).join('') +
                      '</tbody></table>' +
                      '<div class="a4-keuangan-summary">' +
                          '<div class="a4-ks-item"><span>Pemasukan</span><strong class="text-green">' + fmtRp(masuk) + '</strong></div>' +
                          '<div class="a4-ks-item"><span>Pengeluaran</span><strong class="text-red">' + fmtRp(keluar) + '</strong></div>' +
                          '<div class="a4-ks-item a4-ks-saldo"><span>Saldo</span><strong class="text-blue">' + fmtRp(masuk - keluar) + '</strong></div>' +
                      '</div>') +
            '</div>';

        // ────────── ABSENSI ──────────
        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-clipboard-check"></i></div>' +
                        '<h2 class="a4-h2">Absensi Ranting <span class="a4-badge a4-badge-green">' + absensi.length + ' item</span></h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 6</span>' +
                '</div>' +
                (absensi.length === 0
                    ? '<p class="a4-empty">Tidak ada data absensi pada periode ini.</p>'
                    : '<table class="a4-table"><thead><tr>' +
                        '<th style="width:30px;">No</th>' +
                        '<th>Nama</th>' +
                        '<th>Alamat</th>' +
                        '<th style="width:100px;" class="a4-center">Waktu</th>' +
                      '</tr></thead><tbody>' +
                      absensi.slice(0, 30).map(function(a, i) {
                          return '<tr>' +
                              '<td class="a4-center">' + (i + 1) + '</td>' +
                              '<td>' + esc(a.nama || '-') + '</td>' +
                              '<td>' + esc(a.alamat || '-') + '</td>' +
                              '<td class="a4-center">' + fmtDate(a.created_at) + '</td>' +
                          '</tr>';
                      }).join('') +
                      '</tbody></table>') +
            '</div>';

        // ────────── ANGGOTA ──────────
        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-users"></i></div>' +
                        '<h2 class="a4-h2">Anggota Ranting <span class="a4-badge a4-badge-green">' + anggota.length + ' orang</span></h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 7</span>' +
                '</div>' +
                (anggota.length === 0
                    ? '<p class="a4-empty">Belum ada anggota terdaftar di ranting ini.</p>'
                    : '<table class="a4-table"><thead><tr>' +
                        '<th style="width:30px;">No</th>' +
                        '<th>Nama</th>' +
                        '<th>Username</th>' +
                        '<th>Role</th>' +
                        '<th>Alamat</th>' +
                      '</tr></thead><tbody>' +
                      anggota.slice(0, 40).map(function(u, i) {
                          return '<tr>' +
                              '<td class="a4-center">' + (i + 1) + '</td>' +
                              '<td>' + esc(u.nama || u.name || '-') + '</td>' +
                              '<td class="a4-mono">' + esc(u.username || '-') + '</td>' +
                              '<td class="a4-center">' + esc(String(u.role || 'member').toUpperCase()) + '</td>' +
                              '<td>' + esc(u.alamat || u.kalurahan || '-') + '</td>' +
                          '</tr>';
                      }).join('') +
                      '</tbody></table>') +
            '</div>';

        // ────────── PENUTUP + TTD ──────────
        html +=
            '<div class="a4-page">' +
                '<div class="a4-page-header">' +
                    '<div class="a4-header-left">' +
                        '<div class="a4-header-icon"><i class="fas fa-signature"></i></div>' +
                        '<h2 class="a4-h2">Pengesahan</h2>' +
                    '</div>' +
                    '<span class="a4-page-num">Halaman 8</span>' +
                '</div>' +
                '<div style="margin-top:40px;font-size:11px;line-height:1.7;color:#334155;">' +
                    '<p>Laporan ini disusun sebagai bentuk pertanggungjawaban Sekretaris Ranting <strong>' + esc(kal) + '</strong> ' +
                    'kepada Pimpinan Anak Cabang GP Ansor Kapanewon Sewon.</p>' +
                    '<p style="margin-top:12px;">Demikian laporan ini dibuat dengan sebenar-benarnya untuk dipergunakan sebagaimana mestinya.</p>' +
                '</div>' +
                '<div class="a4-signature-block">' +
                    '<div class="a4-signature-box">' +
                        '<p class="a4-sig-title">Mengetahui,</p>' +
                        '<p class="a4-sig-role-top">Ketua PAC GP Ansor Sewon</p>' +
                        '<div class="a4-signature-space"></div>' +
                        '<p class="a4-signature-name">' + esc(namaKetua) + '</p>' +
                        '<p class="a4-sig-role">Ketua</p>' +
                    '</div>' +
                    '<div class="a4-signature-box">' +
                        '<p class="a4-sig-title">Sewon, ' + fmtDateLong(now) + '</p>' +
                        '<p class="a4-sig-role-top">Sekretaris Ranting ' + esc(kal) + '</p>' +
                        '<div class="a4-signature-space"></div>' +
                        '<p class="a4-signature-name">' + esc(namaUser) + '</p>' +
                        '<p class="a4-sig-role">Sekretaris Ranting</p>' +
                    '</div>' +
                '</div>' +
            '</div>';

        // ═══════════════════════════════════════════════════════
        // INJECT
        // ═══════════════════════════════════════════════════════
        els.reportContent.innerHTML = html;
        setLoadingState('content');

        console.log('[sek_laporan] ✅ Report rendered — 8 pages');
    }

    // ═══════════════════════════════════════════════════════════
    // 11. EXPORT PNG — multi-file per halaman
    // ═══════════════════════════════════════════════════════════
    async function exportPNG() {
        if (isExporting) return;
        if (!els.reportContent || els.reportContent.classList.contains('hidden')) {
            safeToast('Laporan belum siap', 'warning', 3000);
            return;
        }

        isExporting = true;
        const origHtml = els.pngBtn ? els.pngBtn.innerHTML : '';
        if (els.pngBtn) {
            els.pngBtn.disabled = true;
            els.pngBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyiapkan...';
        }

        try {
            if (typeof html2canvas === 'undefined') {
                await ensureLib('html2canvas');
            }
            if (typeof html2canvas === 'undefined') {
                throw new Error('Pustaka html2canvas tidak tersedia');
            }

            const pages = els.reportContent.querySelectorAll('.a4-page');
            if (pages.length === 0) throw new Error('Tidak ada halaman');

            const kal = (reportData && reportData.stats && reportData.stats.kalurahan) || user.kalurahan || 'Ranting';
            const cleanKal = String(kal).replace(/\s+/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10);

            for (let i = 0; i < pages.length; i++) {
                safeToast('Menyusun halaman ' + (i + 1) + '/' + pages.length + '...', 'info', 1500);

                const canvas = await html2canvas(pages[i], {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false
                });

                const dataUrl = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = 'Laporan_Ranting_' + cleanKal + '_Hal' + (i + 1) + '_' + dateStr + '.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                await new Promise(function(r) { setTimeout(r, 300); });
            }

            safeToast('✅ ' + pages.length + ' gambar berhasil diunduh', 'success', 3500);

        } catch (err) {
            console.error('[sek_laporan] PNG export error:', err);
            safeToast('Gagal export PNG: ' + err.message, 'error', 4000);
        } finally {
            isExporting = false;
            if (els.pngBtn) {
                els.pngBtn.disabled = false;
                els.pngBtn.innerHTML = origHtml;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 12. EXPORT DOCX
    // ═══════════════════════════════════════════════════════════
    async function exportDOCX() {
        if (isExporting) return;
        if (!reportData) {
            safeToast('Data belum tersedia, tunggu sebentar...', 'warning', 3000);
            return;
        }

        isExporting = true;
        const origHtml = els.docxBtn ? els.docxBtn.innerHTML : '';
        if (els.docxBtn) {
            els.docxBtn.disabled = true;
            els.docxBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyusun...';
        }

        try {
            if (typeof docx === 'undefined') {
                await ensureLib('docx');
            }
            if (typeof docx === 'undefined') {
                throw new Error('Pustaka DOCX tidak tersedia');
            }

            const period = els.periodInput ? els.periodInput.value : '';
            const stats = reportData.stats || {};
            const kal = stats.kalurahan || user.kalurahan || '-';

            // Filter
            const logbook   = filterByPeriod(reportData.logbook, period, ['tanggal_mulai', 'created_at']);
            const surat     = filterByPeriod(reportData.surat, period, ['tanggal', 'created_at']);
            const keuangan  = filterByPeriod(reportData.keuangan, period, ['tanggal', 'created_at']);

            const {
                Document, Packer, Paragraph, TextRun, Table, TableRow,
                TableCell, AlignmentType, HeadingLevel, WidthType
            } = docx;

            const children = [];

            // Header
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                heading: HeadingLevel.HEADING_1,
                children: [new TextRun({
                    text: 'LAPORAN RANTING ' + String(kal).toUpperCase(),
                    bold: true,
                    size: 32
                })]
            }));
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                    text: 'PAC GP Ansor Kapanewon Sewon',
                    size: 24
                })]
            }));
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                children: [new TextRun({
                    text: 'Periode: ' + getPeriodLabel(period),
                    size: 22
                })]
            }));

            // Helper table
            function createTable(headers, rows) {
                const trs = [];
                trs.push(new TableRow({
                    children: headers.map(function(h) {
                        return new TableCell({
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: h, bold: true, color: 'FFFFFF', size: 20
                                })]
                            })],
                            shading: { fill: '0F2922' }
                        });
                    })
                }));
                rows.forEach(function(r) {
                    trs.push(new TableRow({
                        children: r.map(function(cell) {
                            return new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({
                                        text: String(cell == null ? '-' : cell),
                                        size: 20
                                    })]
                                })]
                            });
                        })
                    }));
                });
                return new Table({
                    rows: trs,
                    width: { size: 100, type: WidthType.PERCENTAGE }
                });
            }

            // Logbook section
            if (logbook.length > 0) {
                children.push(new Paragraph({
                    text: 'Logbook Kegiatan',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 }
                }));
                children.push(createTable(
                    ['No', 'Kegiatan', 'Tanggal', 'Tempat', 'Peserta'],
                    logbook.slice(0, 20).map(function(l, i) {
                        return [i + 1, l.kegiatan || '-', fmtDate(l.tanggal_mulai), l.tempat || '-', l.peserta || 0];
                    })
                ));
            }

            // Surat section
            if (surat.length > 0) {
                children.push(new Paragraph({
                    text: 'Arsip Surat',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 }
                }));
                children.push(createTable(
                    ['No', 'Nomor', 'Perihal', 'Tanggal', 'Pengirim'],
                    surat.slice(0, 20).map(function(s, i) {
                        return [i + 1, s.nomor_surat || '-', s.perihal || '-', fmtDate(s.tanggal), s.pengirim || '-'];
                    })
                ));
            }

            // Keuangan section
            if (keuangan.length > 0) {
                children.push(new Paragraph({
                    text: 'Keuangan Ranting',
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 }
                }));
                children.push(createTable(
                    ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah'],
                    keuangan.slice(0, 20).map(function(t, i) {
                        return [i + 1, fmtDate(t.tanggal), t.jenis || '-', t.kategori || '-', fmtRp(t.jumlah)];
                    })
                ));
            }

            // TTD
            children.push(new Paragraph({
                spacing: { before: 800 },
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({
                    text: 'Sewon, ' + fmtDateLong(new Date()),
                    size: 22
                })]
            }));
            children.push(new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({
                    text: 'Sekretaris Ranting ' + kal,
                    bold: true,
                    size: 22
                })]
            }));
            children.push(new Paragraph({
                spacing: { before: 800 },
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({
                    text: (user.nama || user.username || '........................'),
                    size: 22
                })]
            }));

            const doc = new Document({ sections: [{ children: children }] });
            const blob = await Packer.toBlob(doc);
            const kalSlug = String(kal).replace(/\s+/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10);

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'Laporan_Ranting_' + kalSlug + '_' + dateStr + '.docx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);

            safeToast('✅ DOCX berhasil diunduh', 'success', 3000);

        } catch (err) {
            console.error('[sek_laporan] DOCX error:', err);
            safeToast('Gagal export DOCX: ' + err.message, 'error', 4000);
        } finally {
            isExporting = false;
            if (els.docxBtn) {
                els.docxBtn.disabled = false;
                els.docxBtn.innerHTML = origHtml;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 13. PRINT HANDLER
    // ═══════════════════════════════════════════════════════════
    function handlePrint() {
        if (!els.reportContent || els.reportContent.classList.contains('hidden')) {
            safeToast('Laporan belum siap', 'warning', 3000);
            return;
        }

        const origTitle = document.title;
        try {
            const kal = (reportData && reportData.stats && reportData.stats.kalurahan) || user.kalurahan || 'Ranting';
            document.title = 'Laporan_Ranting_' + String(kal).replace(/\s+/g, '_');
            window.print();
        } catch (err) {
            console.error('[sek_laporan] Print error:', err);
            safeToast('Gagal membuka print dialog', 'error', 3000);
        } finally {
            setTimeout(function() {
                try { document.title = origTitle; } catch (e) {}
            }, 1000);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 14. ATTACH BUTTON LISTENERS
    // ═══════════════════════════════════════════════════════════
    function attachButtons() {
        // Back
        if (els.backBtn) {
            const fresh = els.backBtn.cloneNode(true);
            els.backBtn.parentNode.replaceChild(fresh, els.backBtn);
            els.backBtn = fresh;
            fresh.addEventListener('click', function(e) {
                e.preventDefault();
                router.load('/sekretaris_dashboard');
            });
        }

        // Refresh
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

                // Clear cache
                try {
                    if (typeof SafeSessionStorage !== 'undefined' && user.id) {
                        ['getSekretarisStats','getLogbook','getSurat','getKeuangan','getAbsensi','getUsers','getStruktur'].forEach(function(a) {
                            SafeSessionStorage.removeItem('cache_' + a + '_' + user.id + '_' + JSON.stringify({}));
                            SafeSessionStorage.removeItem('cache_' + a + '_' + user.id + '_' + JSON.stringify({ scope: 'ranting' }));
                        });
                    }
                } catch (e) {}

                init().finally(function() {
                    if (els.refreshBtn) {
                        els.refreshBtn.disabled = false;
                        els.refreshBtn.innerHTML = orig;
                    }
                });
            });
        }

        // Print
        if (els.printBtn) {
            const fresh = els.printBtn.cloneNode(true);
            els.printBtn.parentNode.replaceChild(fresh, els.printBtn);
            els.printBtn = fresh;
            fresh.addEventListener('click', function(e) {
                e.preventDefault();
                handlePrint();
            });
        }

        // Export PNG
        if (els.pngBtn) {
            const fresh = els.pngBtn.cloneNode(true);
            els.pngBtn.parentNode.replaceChild(fresh, els.pngBtn);
            els.pngBtn = fresh;
            fresh.addEventListener('click', function(e) {
                e.preventDefault();
                exportPNG();
            });
        }

        // Export DOCX
        if (els.docxBtn) {
            const fresh = els.docxBtn.cloneNode(true);
            els.docxBtn.parentNode.replaceChild(fresh, els.docxBtn);
            els.docxBtn = fresh;
            fresh.addEventListener('click', function(e) {
                e.preventDefault();
                exportDOCX();
            });
        }

        // Period filter — re-render saja tanpa reload API
        if (els.periodInput) {
            const fresh = els.periodInput.cloneNode(true);
            els.periodInput.parentNode.replaceChild(fresh, els.periodInput);
            els.periodInput = fresh;
            fresh.addEventListener('change', function() {
                if (reportData) {
                    try {
                        renderReport(reportData, fresh.value || '');
                        safeToast('Periode diperbarui', 'info', 2000);
                    } catch (e) {
                        console.error('[sek_laporan] re-render error:', e);
                    }
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 15. CLEANUP
    // ═══════════════════════════════════════════════════════════
    function cleanup() {
        window.__sekLaporanLoaded = false;
        isExporting = false;
        isLoading = false;
        reportData = null;
        console.log('[sek_laporan] Cleanup');
    }
    window.__sekretarisLaporanCleanup = cleanup;

    // ═══════════════════════════════════════════════════════════
    // 16. INIT
    // ═══════════════════════════════════════════════════════════
    async function init() {
        console.log('[sek_laporan] Init dimulai...');

        attachButtons();
        toggleOfflineBanner();

        try {
            const data = await loadAllData();
            if (!data) {
                throw new Error('Data kosong dari server');
            }

            reportData = data;
            const period = els.periodInput ? els.periodInput.value : '';
            renderReport(reportData, period);

            console.log('[sek_laporan] ✅ Init selesai v1.2.0');

        } catch (err) {
            console.error('[sek_laporan] Init error:', err);
            setLoadingState('error', err.message || 'Gagal memuat data laporan.');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 17. ONLINE/OFFLINE LISTENERS
    // ═══════════════════════════════════════════════════════════
    function handleOnline() {
        console.log('[sek_laporan] 🟢 Online');
        toggleOfflineBanner();
    }
    function handleOffline() {
        console.log('[sek_laporan] 🔴 Offline');
        toggleOfflineBanner();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Extend cleanup
    const origCleanup = window.__sekretarisLaporanCleanup;
    window.__sekretarisLaporanCleanup = function() {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        if (typeof origCleanup === 'function') origCleanup();
    };

    // ═══════════════════════════════════════════════════════════
    // 18. RUN INIT
    // ═══════════════════════════════════════════════════════════
    init();
});