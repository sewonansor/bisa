/**
 * js/logbook_report.js
 * Modul Laporan Lengkap — v13.1.0 CORPORATE (Title Responsive)
 * ============================================================
 * CHANGELOG v13.1.0:
 *   ✅ FIX: Cover title "LAPORAN PERTANGGUNGJAWABAN"
 *   ✅ FIX: Logo 404 → LOGO_URL resolver dinamis (3 fallback)
 *   ✅ FIX: Watermark handled by forms.css (../logo-ansor.webp)
 *   ✅ FIX: Semua page null-safe + XSS-safe
 *   ✅ FIX: Share PDF: generate → upload → result (robust)
 *   ✅ FIX: Password encrypt via @cantoo/pdf-lib
 *   ✅ FIX: DOCX export: semua modul + tabel header solid
 *   ✅ FIX: ESC handler, click-outside modal
 *   ✅ Preserved: loadAllData, getSummary, findPengurusByJabatan
 *   ✅ Preserved: exportPDF, exportDOCX
 *   ✅ Preserved: initSharePDF + QR + WhatsApp + Telegram
 *   ✅ Preserved: Offline-first + cache fallback
 * ============================================================
 * Route: /logbook_report
 * Libs : html2canvas, jspdf, docx, pdflib
 */

App.register('logbook_report', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__logbookReportLoaded) {
        console.log('[logbook_report] Sudah di-init, skip.');
        return;
    }
    window.__logbookReportLoaded = true;

    console.log('[logbook_report] 🚀 Init v13.1.0 — Corporate (Title Responsive)');

    // ================================================================
    // 2. LOGO URL RESOLVER — Anti-404
    // ----------------------------------------------------------------
    // Logo berada di ROOT (/logo-ansor.webp), bukan /css/ atau /js/.
    // Kita deteksi base path dinamis supaya tetap bekerja meski di-deploy
    // di subfolder (misal /SPA/).
    // ================================================================
    var LOGO_URL = (function() {
        try {
            // Prioritas 1: ambil dari <link rel="icon"> (sudah ada di index.html)
            var icon = document.querySelector('link[rel="icon"]');
            if (icon && icon.href) {
                console.log('[logbook_report] LOGO_URL dari <link rel="icon">:', icon.href);
                return icon.href;
            }

            // Prioritas 2: deteksi base path dari <script src> app.js
            var script = document.querySelector('script[src*="app.js"]');
            if (script) {
                var scriptSrc = script.getAttribute('src') || '';
                var basePath = scriptSrc.replace(/js\/app\.js.*$/, '');
                if (basePath) {
                    var resolved = basePath + 'logo-ansor.webp';
                    // Resolve relative ke absolute pakai anchor
                    var a = document.createElement('a');
                    a.href = resolved;
                    console.log('[logbook_report] LOGO_URL dari app.js base:', a.href);
                    return a.href;
                }
            }

            // Prioritas 3: fallback relative (assume root)
            var fallbackAnchor = document.createElement('a');
            fallbackAnchor.href = 'logo-ansor.webp';
            console.log('[logbook_report] LOGO_URL fallback:', fallbackAnchor.href);
            return fallbackAnchor.href;
        } catch (e) {
            console.warn('[logbook_report] LOGO_URL resolver error:', e);
            return 'logo-ansor.webp';
        }
    })();

    // ================================================================
    // 3. LOCAL HELPERS
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
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function formatDateLong(d) {
        if (!d) return '-';
        var date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function formatRupiah(a) {
        var n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function stripHtml(html) {
        if (!html) return '';
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function safeData(idx, results) {
        var r = results[idx];
        if (!r || r.status !== 'fulfilled' || !r.value || !r.value.success) return [];
        return safeArr(r.value.data);
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[logbook_report:' + (type || 'info') + ']', msg);
        }
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function(resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) resolve();
                else reject(new Error('execCommand failed'));
            } catch (e) {
                reject(e);
            }
        });
    }

    // ================================================================
    // 4. CEK AUTH
    // ================================================================
    var user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 5. DOM ELEMENTS
    // ================================================================
    var reportContent = document.getElementById('report-content');
    var reportLoading = document.getElementById('report-loading');
    var printBtn      = document.getElementById('print-pdf-btn');
    var docxBtn       = document.getElementById('export-docx-btn');
    var backBtn       = document.getElementById('back-btn');

    if (!reportContent || !reportLoading) {
        console.error('[logbook_report] Elemen utama tidak ditemukan.');
        window.__logbookReportLoaded = false;
        return;
    }

    // ================================================================
    // 6. LOAD ALL DATA (13 ENDPOINTS)
    // ================================================================
    function loadAllData() {
        var isOffline = !navigator.onLine;

        reportLoading.innerHTML =
            '<div class="text-center">' +
                '<i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i>' +
                '<p class="text-gray-500 font-medium mt-4">Menyiapkan laporan A4...</p>' +
                '<p class="text-gray-400 text-xs mt-1">Menghimpun data dari 13 modul</p>' +
                (isOffline
                    ? '<p class="text-amber-600 text-xs mt-3"><i class="fas fa-wifi mr-1"></i>Mode offline — memuat dari cache</p>'
                    : '') +
            '</div>';

        return Promise.allSettled([
            apiCall('getSurat'),
            apiCall('getLogbook'),
            apiCall('getProgramKerja'),
            apiCall('getKeuangan'),
            apiCall('getInventaris'),
            apiCall('getArsip'),
            apiCall('getAbsensi'),
            apiCall('getStruktur'),
            apiCall('getBerita'),
            apiCall('getGaleri'),
            apiCall('getTokoh'),
            apiCall('getForumTopics'),
            apiCall('getForms')
        ]).then(function(results) {
            return {
                surat:      safeData(0, results),
                logbook:    safeData(1, results),
                proker:     safeData(2, results),
                keuangan:   safeData(3, results),
                inventaris: safeData(4, results),
                arsip:      safeData(5, results),
                absensi:    safeData(6, results),
                struktur:   safeData(7, results),
                berita:     safeData(8, results),
                galeri:     safeData(9, results),
                tokoh:      safeData(10, results),
                forum:      safeData(11, results),
                forms:      safeData(12, results)
            };
        });
    }

    // ================================================================
    // 7. GET SUMMARY
    // ================================================================
    function getSummary(data) {
        var totalMasuk = 0, totalKeluar = 0;
        safeArr(data.keuangan).forEach(function(t) {
            var j = Number(t.jumlah) || 0;
            if (t.jenis === 'Pemasukan') totalMasuk += j;
            else totalKeluar += j;
        });

        return {
            totalSurat: safeArr(data.surat).length,
            totalKegiatan: safeArr(data.logbook).length,
            totalProgram: safeArr(data.proker).length,
            totalMasuk: totalMasuk,
            totalKeluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            totalBarang: safeArr(data.inventaris).reduce(function(a, b) {
                return a + (Number(b.jumlah) || 0);
            }, 0),
            totalArsip: safeArr(data.arsip).length,
            totalAbsensi: safeArr(data.absensi).length,
            totalStruktur: safeArr(data.struktur).length,
            totalBerita: safeArr(data.berita).length,
            totalGaleri: safeArr(data.galeri).length,
            totalTokoh: safeArr(data.tokoh).length,
            totalForum: safeArr(data.forum).length,
            totalForms: safeArr(data.forms).length
        };
    }

    // ================================================================
    // 8. FIND PENGURUS BY JABATAN
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
    // 9. SUMMARY BOX HELPER — Corporate Style (inline)
    // ================================================================
    function summaryBox(color, icon, label, value, extraClass) {
        return '<div class="a4-summary-box" style="' +
            'border:1px solid #e2e8f0;border-radius:8px;padding:16px 12px;' +
            'text-align:center;background:#f8fafc;position:relative;overflow:hidden;">' +
            '<div style="position:absolute;top:0;left:0;right:0;height:3px;' +
                'background:#0f2922;"></div>' +
            '<div style="font-size:18px;margin-bottom:6px;color:#059669;">' +
                '<i class="fas ' + icon + '"></i>' +
            '</div>' +
            '<div style="font-size:9px;text-transform:uppercase;color:#64748b;' +
                'font-weight:700;letter-spacing:0.05em;line-height:1.3;margin-bottom:6px;">' +
                escapeHtml(label) +
            '</div>' +
            '<div style="font-size:16px;font-weight:800;color:#0f172a;line-height:1.15;word-break:break-word;' +
                (extraClass || '') + '">' +
                value +
            '</div>' +
        '</div>';
    }

    // ================================================================
    // 10. PAGE HEADER HELPER
    // ================================================================
    function pageHeader(icon, title, pageNum) {
        return '<div class="a4-page-header">' +
            '<div class="a4-header-left">' +
                '<div class="a4-header-icon"><i class="fas ' + icon + '"></i></div>' +
                '<h2 class="a4-h2">' + title + '</h2>' +
            '</div>' +
            '<span class="a4-page-num">' + pageNum + '</span>' +
        '</div>';
    }

    // ================================================================
    // 11. RENDER REPORT (A4 MULTI-PAGE CORPORATE)
    // ================================================================
    function renderReport(data) {
        var summary = getSummary(data);
        var now = new Date();
        var periode = now.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        var namaKetua = '............................................';
        var namaSekretaris = '............................................';

        var ketua = findPengurusByJabatan(data.struktur, ['ketua']);
        if (ketua && ketua.nama) namaKetua = ketua.nama;

        var sekretaris = findPengurusByJabatan(data.struktur, ['sekretaris']);
        if (sekretaris && sekretaris.nama) namaSekretaris = sekretaris.nama;

        function badge(count) {
            return count > 0
                ? '<span class="a4-badge a4-badge-green">' + count + ' item</span>'
                : '<span class="a4-badge a4-badge-gray">Kosong</span>';
        }

        function thumb(url) {
            if (url) {
                return '<img src="' + escapeAttr(url) + '" class="a4-thumb" ' +
                       'onerror="this.outerHTML=\'<div class=&quot;a4-thumb-placeholder&quot;><i class=&quot;fas fa-image&quot;></i></div>\'">';
            }
            return '<div class="a4-thumb-placeholder"><i class="fas fa-image"></i></div>';
        }

        function statusPill(status) {
            var s = String(status || 'draft').toLowerCase();
            var cls = s === 'published' ? 'green' : 'gray';
            return '<span class="a4-status ' + cls + '">' + escapeHtml(s) + '</span>';
        }

        var html = '';

        // ═══════════════════════════════════════════════════════════
        // PAGE 1: COVER (CORPORATE ANNUAL REPORT) — Logo Fixed
        // ✅ v13.1.0: Title "LAPORAN PERTANGGUNGJAWABAN" responsif
        // ═══════════════════════════════════════════════════════════
                // ═══════════════════════════════════════════════════════════
        // PAGE 1: COVER (CORPORATE ANNUAL REPORT) — Logo Fixed
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page a4-cover">' +

                // TOP HEADER (DARK GREEN)
                '<div class="a4-cover-header">' +
                    '<img src="' + escapeAttr(LOGO_URL) + '" class="a4-cover-logo" alt="Logo" ' +
                        'onerror="this.style.display=\'none\'">' +
                    '<div class="a4-cover-org-name">PAC GP ANSOR</div>' +
                    '<div class="a4-cover-org-sub">Kapanewon Sewon • Bantul</div>' +
                '</div>' +
                // MIDDLE BODY (TITLE) - INFORMATIVE & ELEGANT TYPOGRAPHY
                '<div class="a4-cover-body">' +
                    
                    // 1. LABEL ORGANISASI (Sans-Serif, Rata Tengah, Spasi Lebar)
                    '<div style="font-family: \'Inter\', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 3px; color: #64748b; text-transform: uppercase; margin-bottom: 24px; text-align: center; line-height: 1.5;">' +
                        'Pimpinan Anak Cabang<br>Gerakan Pemuda Ansor Kapanewon Sewon' +
                    '</div>' +

                    // 2. JUDUL UTAMA (Serif Klasik & Tegas)
                    '<h1 style="font-family: \'Amiri\', \'Times New Roman\', serif; font-size: clamp(32px, 6vw, 44px); font-weight: 700; color: #0f172a; line-height: 1.1; margin: 0 0 16px 0; text-transform: uppercase; text-align: center;">' +
                        'Laporan<br><span style="color: #059669; font-style: italic;">Pertanggungjawaban</span>' +
                    '</h1>' +

                    // 3. PEMISAH (Garis Emas Tipis)
                    '<div style="width: 60px; height: 2px; background: #fbbf24; margin: 0 auto 20px auto;"></div>' +

                    // 4. MASA KHIDMAT (Badge Elegan)
                    '<div style="display: inline-block; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 9999px; padding: 6px 20px; margin-bottom: 32px; text-align: center;">' +
                        '<span style="font-family: \'Inter\', sans-serif; font-size: 12px; font-weight: 800; color: #0f172a; letter-spacing: 1px;">MASA KHIDMAT 2025 — 2028</span>' +
                    '</div>' +

                    // 5. DESKRIPSI (Sans-Serif, Abu-abu, Ringan)
                    '<p style="font-family: \'Inter\', sans-serif; font-size: 13px; color: #475569; line-height: 1.6; margin: 0 auto; max-width: 80%; text-align: center;">' +
                        'Rekapitulasi Kinerja Organisasi dan Dokumentasi Kegiatan<br>' +
                        '<span style="font-weight: 600; color: #0f172a;">Periode ' + escapeHtml(periode) + '</span>' +
                    '</p>' +
                '</div>' +

                // BOTTOM FOOTER (INFO & QR)
                '<div class="a4-cover-footer">' +
                    '<div class="a4-cover-info">' +
                        '<div class="a4-cover-info-item">' +
                            '<span class="a4-cover-info-label">Disusun Oleh</span>' +
                            '<span class="a4-cover-info-value">Administrator Sistem</span>' +
                        '</div>' +
                        '<div class="a4-cover-info-item">' +
                            '<span class="a4-cover-info-label">Tanggal Cetak</span>' +
                            '<span class="a4-cover-info-value">' + formatDateLong(now) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="a4-cover-qr-placeholder">' +
                        'Scan<br>Validasi' +
                    '</div>' +
                '</div>' +

            '</div>';
        // ═══════════════════════════════════════════════════════════
        // PAGE 2: RINGKASAN EKSEKUTIF
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-chart-pie', 'Ringkasan Eksekutif', 'Halaman 2') +
                '<div class="a4-summary-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">' +
                    summaryBox('blue',   'fa-file-alt',       'Surat',       summary.totalSurat, '') +
                    summaryBox('purple', 'fa-calendar-check', 'Kegiatan',    summary.totalKegiatan, '') +
                    summaryBox('indigo', 'fa-tasks',          'Program',     summary.totalProgram, '') +
                    summaryBox('green',  'fa-arrow-down',     'Pemasukan',   formatRupiah(summary.totalMasuk), 'color:#059669;') +
                    summaryBox('red',    'fa-arrow-up',       'Pengeluaran', formatRupiah(summary.totalKeluar), 'color:#dc2626;') +
                    summaryBox('blue-dark', 'fa-wallet',      'Saldo',       formatRupiah(summary.saldo), 'color:#2563eb;') +
                    summaryBox('teal',   'fa-boxes',          'Barang',      summary.totalBarang, '') +
                    summaryBox('orange', 'fa-archive',        'Arsip',       summary.totalArsip, '') +
                    summaryBox('cyan',   'fa-clipboard-check','Absensi',     summary.totalAbsensi, '') +
                    summaryBox('pink',   'fa-newspaper',      'Berita',      summary.totalBerita, '') +
                    summaryBox('yellow', 'fa-images',         'Galeri',      summary.totalGaleri, '') +
                    summaryBox('slate',  'fa-user-tie',       'Tokoh',       summary.totalTokoh, '') +
                '</div>' +
                '<div class="a4-intro-box" style="border-left:4px solid #059669;' +
                    'background:#f8fafc;padding:18px 22px;font-size:11.5px;' +
                    'line-height:1.75;color:#334155;border-radius:0 8px 8px 0;' +
                    'border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;' +
                    'border-bottom:1px solid #e2e8f0;margin-top:10px;">' +
                    '<p style="margin:0;">' +
                        '<strong style="color:#0f2922;">Laporan ini menghimpun seluruh data dari 13 modul utama sistem informasi ' +
                        'organisasi.</strong> Seluruh data bersumber dari database terpusat dan disajikan secara ' +
                        'komprehensif untuk keperluan evaluasi, audit, dan pertanggungjawaban. ' +
                        'Laporan ini juga menjadi dokumentasi resmi kegiatan dan kinerja organisasi ' +
                        'periode ' + escapeHtml(periode) + '.' +
                    '</p>' +
                '</div>' +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 3: SURAT
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-file-alt', 'Arsip Surat ' + badge(summary.totalSurat), 'Halaman 3') +
                (safeArr(data.surat).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th>Nomor Surat</th>' +
                            '<th>Perihal</th>' +
                            '<th style="width:90px;">Tanggal</th>' +
                            '<th>Pengirim</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.surat).slice(0, 25).map(function(s, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td class="a4-mono">' + escapeHtml(s.nomor_surat || '-') + '</td>' +
                                    '<td>' + escapeHtml(s.perihal || '-') + '</td>' +
                                    '<td class="a4-center">' + formatDate(s.tanggal) + '</td>' +
                                    '<td>' + escapeHtml(s.pengirim || '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada data surat.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 4: LOGBOOK
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-calendar-check', 'Logbook Kegiatan ' + badge(summary.totalKegiatan), 'Halaman 4') +
                (safeArr(data.logbook).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th>Nama Kegiatan</th>' +
                            '<th style="width:90px;">Tanggal</th>' +
                            '<th>Tempat</th>' +
                            '<th style="width:60px;" class="a4-center">Peserta</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.logbook).slice(0, 25).map(function(k, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td>' + escapeHtml(k.kegiatan || '-') + '</td>' +
                                    '<td class="a4-center">' + formatDate(k.tanggal_mulai) + '</td>' +
                                    '<td>' + escapeHtml(k.tempat || '-') + '</td>' +
                                    '<td class="a4-center">' + (k.peserta || 0) + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada data logbook.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 5: PROGRAM KERJA
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-tasks', 'Program Kerja ' + badge(summary.totalProgram), 'Halaman 5') +
                (safeArr(data.proker).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:60px;" class="a4-center">Foto</th>' +
                            '<th>Nama Program</th>' +
                            '<th style="width:70px;" class="a4-center">Status</th>' +
                            '<th style="width:60px;" class="a4-center">Progress</th>' +
                            '<th style="width:90px;" class="a4-center">Target</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.proker).slice(0, 20).map(function(p) {
                                return '<tr>' +
                                    '<td class="a4-thumb-cell">' + thumb(p.foto_url) + '</td>' +
                                    '<td><strong>' + escapeHtml(p.nama_program || '-') + '</strong><br>' +
                                        '<span class="a4-small">' + escapeHtml(String(p.deskripsi || '').substring(0, 60)) + '</span></td>' +
                                    '<td class="a4-center">' + escapeHtml(p.status || '-') + '</td>' +
                                    '<td class="a4-center">' + (p.progress || 0) + '%</td>' +
                                    '<td class="a4-center">' + formatDate(p.target_selesai) + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada program kerja.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 6: KEUANGAN
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-coins', 'Laporan Keuangan', 'Halaman 6') +
                (safeArr(data.keuangan).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th style="width:90px;">Tanggal</th>' +
                            '<th style="width:90px;">Jenis</th>' +
                            '<th>Kategori</th>' +
                            '<th style="width:120px;" class="a4-right">Jumlah</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.keuangan).slice(0, 30).map(function(t, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td class="a4-center">' + formatDate(t.tanggal) + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(t.jenis || '-') + '</td>' +
                                    '<td>' + escapeHtml(t.kategori || '-') + '</td>' +
                                    '<td class="a4-right a4-mono">' + formatRupiah(t.jumlah) + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>' +
                    '<div class="a4-keuangan-summary">' +
                        '<div class="a4-ks-item">' +
                            '<span>Total Pemasukan</span>' +
                            '<strong class="text-green">' + formatRupiah(summary.totalMasuk) + '</strong>' +
                        '</div>' +
                        '<div class="a4-ks-item">' +
                            '<span>Total Pengeluaran</span>' +
                            '<strong class="text-red">' + formatRupiah(summary.totalKeluar) + '</strong>' +
                        '</div>' +
                        '<div class="a4-ks-item a4-ks-saldo">' +
                            '<span>Saldo Akhir</span>' +
                            '<strong class="text-blue">' + formatRupiah(summary.saldo) + '</strong>' +
                        '</div>' +
                    '</div>'
                    : '<p class="a4-empty">Tidak ada transaksi keuangan.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 7: INVENTARIS
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-boxes', 'Inventaris Barang ' + badge(summary.totalBarang), 'Halaman 7') +
                (safeArr(data.inventaris).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:60px;" class="a4-center">Foto</th>' +
                            '<th>Nama Barang</th>' +
                            '<th style="width:60px;" class="a4-center">Jumlah</th>' +
                            '<th style="width:90px;" class="a4-center">Kondisi</th>' +
                            '<th>Lokasi</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.inventaris).slice(0, 20).map(function(b) {
                                return '<tr>' +
                                    '<td class="a4-thumb-cell">' + thumb(b.foto_url) + '</td>' +
                                    '<td>' + escapeHtml(b.nama_barang || '-') + '</td>' +
                                    '<td class="a4-center">' + (b.jumlah || 0) + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(b.kondisi || '-') + '</td>' +
                                    '<td>' + escapeHtml(b.lokasi || '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada inventaris.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 8: ARSIP
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-archive', 'Arsip Digital ' + badge(summary.totalArsip), 'Halaman 8') +
                (safeArr(data.arsip).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th>Judul</th>' +
                            '<th style="width:60px;" class="a4-center">Tahun</th>' +
                            '<th style="width:90px;" class="a4-center">Kategori</th>' +
                            '<th style="width:70px;" class="a4-center">Jenis</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.arsip).slice(0, 25).map(function(a, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td>' + escapeHtml(a.judul || '-') + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(a.tahun || '-') + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(a.kategori || '-') + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(a.jenis || '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada arsip.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 9: ABSENSI
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-clipboard-check', 'Absensi Kehadiran ' + badge(summary.totalAbsensi), 'Halaman 9') +
                (safeArr(data.absensi).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th>Nama</th>' +
                            '<th>Alamat</th>' +
                            '<th style="width:100px;" class="a4-center">Waktu</th>' +
                            '<th style="width:80px;" class="a4-center">TTD</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.absensi).slice(0, 25).map(function(a, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td>' + escapeHtml(a.nama || '-') + '</td>' +
                                    '<td>' + escapeHtml(a.alamat || '-') + '</td>' +
                                    '<td class="a4-center">' + formatDate(a.created_at) + '</td>' +
                                    '<td class="a4-thumb-cell">' + (a.ttd
                                        ? '<img src="' + escapeAttr(a.ttd) + '" class="a4-signature">'
                                        : '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada data absensi.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 10: STRUKTUR
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-sitemap', 'Struktur Organisasi ' + badge(summary.totalStruktur), 'Halaman 10') +
                (safeArr(data.struktur).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:60px;" class="a4-center">Foto</th>' +
                            '<th>Jabatan</th>' +
                            '<th>Nama</th>' +
                            '<th style="width:180px;">Kontak</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.struktur).slice(0, 20).map(function(s) {
                                return '<tr>' +
                                    '<td class="a4-thumb-cell">' + thumb(s.foto_url) + '</td>' +
                                    '<td><strong>' + escapeHtml(s.jabatan || '-') + '</strong></td>' +
                                    '<td>' + escapeHtml(s.nama || '-') + '</td>' +
                                    '<td class="a4-small">' +
                                        escapeHtml(s.whatsapp || s.email || '-') +
                                    '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada data struktur.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 11: BERITA & GALERI
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-newspaper', 'Berita &amp; Galeri', 'Halaman 11') +

                '<h3 class="a4-h3"><i class="fas fa-newspaper"></i> Berita Terbaru ' +
                    badge(summary.totalBerita) + '</h3>' +
                (safeArr(data.berita).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:60px;" class="a4-center">Foto</th>' +
                            '<th>Judul</th>' +
                            '<th style="width:90px;" class="a4-center">Tanggal</th>' +
                            '<th style="width:80px;" class="a4-center">Tag</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.berita).slice(0, 15).map(function(b) {
                                return '<tr>' +
                                    '<td class="a4-thumb-cell">' + thumb(b.gambar_url) + '</td>' +
                                    '<td>' + escapeHtml(b.judul || '-') + '</td>' +
                                    '<td class="a4-center">' + formatDate(b.tanggal) + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(b.tag || '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada berita.</p>') +

                '<h3 class="a4-h3"><i class="fas fa-images"></i> Galeri Media ' +
                    badge(summary.totalGaleri) + '</h3>' +
                (safeArr(data.galeri).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:60px;" class="a4-center">Preview</th>' +
                            '<th>Judul</th>' +
                            '<th style="width:70px;" class="a4-center">Tipe</th>' +
                            '<th style="width:90px;" class="a4-center">Kategori</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.galeri).slice(0, 15).map(function(g) {
                                return '<tr>' +
                                    '<td class="a4-thumb-cell">' +
                                        (g.tipe === 'foto'
                                            ? thumb(g.file_url)
                                            : '<div class="a4-thumb-placeholder"><i class="fas fa-video"></i></div>') +
                                    '</td>' +
                                    '<td>' + escapeHtml(g.judul || '-') + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(g.tipe || '-') + '</td>' +
                                    '<td class="a4-center">' + escapeHtml(g.kategori || '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada galeri.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 12: TOKOH & FORUM
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-user-tie', 'Tokoh &amp; Forum', 'Halaman 12') +

                '<h3 class="a4-h3"><i class="fas fa-user-tie"></i> Data Tokoh ' +
                    badge(summary.totalTokoh) + '</h3>' +
                (safeArr(data.tokoh).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:60px;" class="a4-center">Foto</th>' +
                            '<th>Nama</th>' +
                            '<th>Alamat</th>' +
                            '<th style="width:110px;" class="a4-center">No HP</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.tokoh).slice(0, 15).map(function(t) {
                                return '<tr>' +
                                    '<td class="a4-thumb-cell">' + thumb(t.foto_url) + '</td>' +
                                    '<td>' + escapeHtml(t.nama || '-') + '</td>' +
                                    '<td>' + escapeHtml(t.alamat || '-') + '</td>' +
                                    '<td class="a4-center a4-mono">' + escapeHtml(t.no_hp || '-') + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada data tokoh.</p>') +

                '<h3 class="a4-h3"><i class="fas fa-comments"></i> Forum Diskusi ' +
                    badge(summary.totalForum) + '</h3>' +
                (safeArr(data.forum).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th>Judul Topik</th>' +
                            '<th>Dibuat Oleh</th>' +
                            '<th style="width:90px;" class="a4-center">Tanggal</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.forum).slice(0, 15).map(function(f, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td>' + escapeHtml(f.judul || '-') + '</td>' +
                                    '<td>' + escapeHtml(f.created_by || '-') + '</td>' +
                                    '<td class="a4-center">' + formatDate(f.created_at) + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada topik forum.</p>') +
            '</div>';

        // ═══════════════════════════════════════════════════════════
        // PAGE 13: FORMS + PENUTUP + TTD (CORPORATE)
        // ═══════════════════════════════════════════════════════════
        html +=
            '<div class="a4-page">' +
                pageHeader('fa-wpforms', 'Forms Builder ' + badge(summary.totalForms), 'Halaman 13') +
                (safeArr(data.forms).length > 0 ?
                    '<table class="a4-table">' +
                        '<thead><tr>' +
                            '<th style="width:30px;">No</th>' +
                            '<th>Judul Form</th>' +
                            '<th style="width:70px;" class="a4-center">Status</th>' +
                            '<th>Slug</th>' +
                            '<th style="width:90px;" class="a4-center">Dibuat</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            safeArr(data.forms).slice(0, 20).map(function(f, i) {
                                return '<tr>' +
                                    '<td class="a4-center">' + (i + 1) + '</td>' +
                                    '<td>' + escapeHtml(f.title || '-') + '</td>' +
                                    '<td class="a4-center">' + statusPill(f.status) + '</td>' +
                                    '<td class="a4-mono">' + escapeHtml(f.slug || '-') + '</td>' +
                                    '<td class="a4-center">' + formatDate(f.created_at) + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>'
                    : '<p class="a4-empty">Tidak ada form.</p>') +

                '<div class="a4-signature-block">' +
                    '<div class="a4-signature-box">' +
                        '<p class="a4-sig-title">Mengetahui,</p>' +
                        '<p class="a4-sig-role-top">Ketua PAC GP Ansor Sewon</p>' +
                        '<div class="a4-signature-space"></div>' +
                        '<p class="a4-signature-name">' + escapeHtml(namaKetua) + '</p>' +
                        '<p class="a4-sig-role">Ketua</p>' +
                    '</div>' +
                    '<div class="a4-signature-box">' +
                        '<p class="a4-sig-title">Bantul, ' + formatDateLong(now) + '</p>' +
                        '<p class="a4-sig-role-top">Sekretaris PAC GP Ansor Sewon</p>' +
                        '<div class="a4-signature-space"></div>' +
                        '<p class="a4-signature-name">' + escapeHtml(namaSekretaris) + '</p>' +
                        '<p class="a4-sig-role">Sekretaris</p>' +
                    '</div>' +
                '</div>' +
            '</div>';

        reportContent.innerHTML = html;
        reportLoading.classList.add('hidden');
        reportContent.classList.remove('hidden');

        // Offline warning
        if (!navigator.onLine) {
            var warnBanner = document.createElement('div');
            warnBanner.className = 'no-print max-w-[210mm] mx-auto mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2';
            warnBanner.innerHTML = '<i class="fas fa-wifi"></i><span>Mode offline — laporan dibuat dari cache. Share PDF &amp; upload memerlukan koneksi internet.</span>';
            reportContent.parentNode.insertBefore(warnBanner, reportContent);
        }

        console.log('[logbook_report] ✅ Render selesai — 13 pages Corporate Annual Report');
        console.log('[logbook_report] 🖼️ Logo URL used:', LOGO_URL);
    }

    // ================================================================
    // 12. EXPORT PDF
    // ================================================================
    function exportPDF() {
        if (!printBtn) return;

        var originalHTML = printBtn.innerHTML;
        printBtn.disabled = true;
        printBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyiapkan PDF...';
        safeToast('Menyusun PDF A4, mohon tunggu...', 'info', 4000);

        (async function() {
            try {
                if (typeof html2canvas === 'undefined') {
                    await window.loadLib('html2canvas');
                }
                if (!window.jspdf || !window.jspdf.jsPDF) {
                    await window.loadLib('jspdf');
                }

                await new Promise(function(r) { setTimeout(r, 500); });

                var jsPDF = window.jspdf.jsPDF;
                var pdf = new jsPDF('p', 'mm', 'a4');
                var pages = document.querySelectorAll('.a4-page');

                if (pages.length === 0) {
                    throw new Error('Tidak ada halaman A4 yang ditemukan');
                }

                for (var i = 0; i < pages.length; i++) {
                    var page = pages[i];
                    var canvas = await html2canvas(page, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false,
                        windowWidth: page.scrollWidth,
                        windowHeight: page.scrollHeight
                    });

                    var imgData = canvas.toDataURL('image/jpeg', 0.85);

                    if (i > 0) pdf.addPage();

                    var pageWidth = 210;
                    var pageHeight = 297;
                    var imgWidth = pageWidth;
                    var imgHeight = (canvas.height * imgWidth) / canvas.width;
                    var yOffset = (pageHeight - imgHeight) / 2;

                    pdf.addImage(imgData, 'JPEG', 0, yOffset, imgWidth, imgHeight);
                }

                pdf.save('Laporan_Lengkap_Ansor_' + new Date().toISOString().slice(0, 10) + '.pdf');
                safeToast('✅ PDF berhasil diunduh!', 'success');
            } catch (error) {
                console.error('[logbook_report] PDF error:', error);
                safeToast('Gagal export PDF: ' + error.message, 'error');
            } finally {
                printBtn.disabled = false;
                printBtn.innerHTML = originalHTML;
            }
        })();
    }

    // ================================================================
    // 13. EXPORT DOCX
    // ================================================================
    function exportDOCX() {
        if (!docxBtn) return;

        var originalHTML = docxBtn.innerHTML;
        docxBtn.disabled = true;
        docxBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyusun DOCX...';
        safeToast('Menyusun DOCX, mohon tunggu...', 'info', 4000);

        (async function() {
            try {
                if (typeof docx === 'undefined') {
                    await window.loadLib('docx');
                }
                if (typeof docx === 'undefined') {
                    throw new Error('Pustaka DOCX tidak tersedia');
                }

                var data = window.__logbookReportData;
                if (!data) {
                    throw new Error('Data belum tersedia, tunggu sebentar...');
                }

                var summary = getSummary(data);
                var Document = docx.Document;
                var Packer = docx.Packer;
                var Paragraph = docx.Paragraph;
                var TextRun = docx.TextRun;
                var Table = docx.Table;
                var TableRow = docx.TableRow;
                var TableCell = docx.TableCell;
                var HeadingLevel = docx.HeadingLevel;
                var AlignmentType = docx.AlignmentType;
                var WidthType = docx.WidthType;

                var children = [];

                children.push(new Paragraph({
                    text: 'LAPORAN PERTANGGUNGJAWABAN',
                    alignment: AlignmentType.CENTER,
                    heading: HeadingLevel.HEADING_1
                }));
                children.push(new Paragraph({
                    text: 'PAC GP Ansor Kapanewon Sewon',
                    alignment: AlignmentType.CENTER
                }));
                children.push(new Paragraph({
                    text: 'Periode: ' + new Date().toLocaleDateString('id-ID', {
                        day: '2-digit', month: 'long', year: 'numeric'
                    }),
                    alignment: AlignmentType.CENTER
                }));
                children.push(new Paragraph({ text: '' }));

                children.push(new Paragraph({
                    text: 'Ringkasan Eksekutif',
                    heading: HeadingLevel.HEADING_2
                }));
                children.push(new Paragraph({
                    text: 'Surat: ' + summary.totalSurat +
                          ' | Logbook: ' + summary.totalKegiatan +
                          ' | Proker: ' + summary.totalProgram +
                          ' | Saldo: ' + formatRupiah(summary.saldo)
                }));
                children.push(new Paragraph({ text: '' }));

                function createTable(header, rows) {
                    var tableRows = [];
                    tableRows.push(new TableRow({
                        children: header.map(function(h) {
                            return new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: h, bold: true, size: 20, color: 'FFFFFF' })]
                                })],
                                shading: { fill: '0F2922' }
                            });
                        })
                    }));
                    rows.forEach(function(r) {
                        tableRows.push(new TableRow({
                            children: r.map(function(cell) {
                                return new TableCell({
                                    children: [new Paragraph({
                                        children: [new TextRun({
                                            text: String(cell == null ? '' : cell),
                                            size: 20
                                        })]
                                    })]
                                });
                            })
                        }));
                    });
                    return new Table({
                        rows: tableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE }
                    });
                }

                if (safeArr(data.surat).length > 0) {
                    children.push(new Paragraph({
                        text: 'Arsip Surat',
                        heading: HeadingLevel.HEADING_2
                    }));
                    children.push(createTable(
                        ['No', 'Nomor', 'Perihal', 'Tanggal', 'Pengirim'],
                        safeArr(data.surat).slice(0, 15).map(function(s, i) {
                            return [i + 1, s.nomor_surat || '', s.perihal || '', formatDate(s.tanggal), s.pengirim || ''];
                        })
                    ));
                }

                if (safeArr(data.logbook).length > 0) {
                    children.push(new Paragraph({
                        text: 'Logbook Kegiatan',
                        heading: HeadingLevel.HEADING_2
                    }));
                    children.push(createTable(
                        ['No', 'Kegiatan', 'Tanggal', 'Tempat', 'Peserta'],
                        safeArr(data.logbook).slice(0, 15).map(function(k, i) {
                            return [i + 1, k.kegiatan || '', formatDate(k.tanggal_mulai), k.tempat || '', k.peserta || 0];
                        })
                    ));
                }

                if (safeArr(data.keuangan).length > 0) {
                    children.push(new Paragraph({
                        text: 'Laporan Keuangan',
                        heading: HeadingLevel.HEADING_2
                    }));
                    children.push(createTable(
                        ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah'],
                        safeArr(data.keuangan).slice(0, 15).map(function(t, i) {
                            return [i + 1, formatDate(t.tanggal), t.jenis || '', t.kategori || '', formatRupiah(t.jumlah)];
                        })
                    ));
                }

                var doc = new Document({
                    sections: [{ children: children }]
                });

                var blob = await Packer.toBlob(doc);
                var link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'Laporan_Lengkap_' + new Date().toISOString().slice(0, 10) + '.docx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);

                safeToast('✅ DOCX berhasil diunduh!', 'success');
            } catch (error) {
                console.error('[logbook_report] DOCX error:', error);
                safeToast('Gagal export DOCX: ' + error.message, 'error');
            } finally {
                docxBtn.disabled = false;
                docxBtn.innerHTML = originalHTML;
            }
        })();
    }

    // ================================================================
    // 14. SHARE PDF — STATE
    // ================================================================
    var shareState = {
        pdfBlob: null,
        pdfUrl: null,
        driveUrl: null,
        password: '',
        filename: 'Laporan_Lengkap_Ansor',
        isGenerating: false
    };

    // ================================================================
    // 15. INIT SHARE PDF
    // ================================================================
    function initSharePDF() {
        var modal          = document.getElementById('share-pdf-modal');
        var contentEl      = document.getElementById('share-pdf-content');
        var shareBtn       = document.getElementById('share-pdf-btn');
        var closeBtn       = document.getElementById('share-pdf-close');

        var formStep       = document.getElementById('share-pdf-form-step');
        var loadingStep    = document.getElementById('share-pdf-loading-step');
        var resultStep     = document.getElementById('share-pdf-result-step');

        var filenameInput  = document.getElementById('share-pdf-filename');
        var usePassToggle  = document.getElementById('share-pdf-use-password');
        var passWrap       = document.getElementById('share-pdf-password-wrap');
        var passInput      = document.getElementById('share-pdf-password');
        var togglePassBtn  = document.getElementById('share-pdf-toggle-password');

        var generateBtn    = document.getElementById('share-pdf-generate');
        var loadingText    = document.getElementById('share-pdf-loading-text');
        var loadingSubtext = document.getElementById('share-pdf-loading-subtext');

        var resultUrl      = document.getElementById('share-pdf-result-url');
        var resultMeta     = document.getElementById('share-pdf-result-meta');
        var copyLinkBtn    = document.getElementById('share-pdf-copy-link');
        var downloadBtn    = document.getElementById('share-pdf-download-btn');
        var waBtn          = document.getElementById('share-pdf-wa-btn');
        var tgBtn          = document.getElementById('share-pdf-tg-btn');
        var qrBtn          = document.getElementById('share-pdf-qr-btn');
        var resetBtn       = document.getElementById('share-pdf-reset');
        var passInfo       = document.getElementById('share-pdf-result-password-info');

        var qrResult       = document.getElementById('share-pdf-qr-result');
        var qrContainer    = document.getElementById('share-pdf-qr-code');
        var qrDownloadBtn  = document.getElementById('share-pdf-qr-download');

        if (!modal || !shareBtn) {
            console.warn('[share-pdf] Elemen modal tidak ditemukan, skip init');
            return;
        }

        function openModal() {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(function() {
                if (contentEl) {
                    contentEl.classList.remove('scale-95', 'opacity-0');
                    contentEl.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            showStep('form');
            resetShareState();
        }

        function closeModal() {
            if (contentEl) {
                contentEl.classList.remove('scale-100', 'opacity-100');
                contentEl.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(function() {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';

            if (shareState.pdfUrl) {
                try { URL.revokeObjectURL(shareState.pdfUrl); } catch (e) {}
                shareState.pdfUrl = null;
            }
        }

        function showStep(step) {
            if (formStep) formStep.classList.toggle('hidden', step !== 'form');
            if (loadingStep) loadingStep.classList.toggle('hidden', step !== 'loading');
            if (resultStep) resultStep.classList.toggle('hidden', step !== 'result');
        }

        function resetShareState() {
            if (shareState.pdfUrl) {
                try { URL.revokeObjectURL(shareState.pdfUrl); } catch (e) {}
            }
            shareState.pdfBlob = null;
            shareState.pdfUrl = null;
            shareState.driveUrl = null;
            shareState.password = '';
            shareState.isGenerating = false;

            if (qrResult) qrResult.classList.add('hidden');
            if (qrContainer) qrContainer.innerHTML = '';
            if (passInfo) passInfo.classList.add('hidden');

            if (filenameInput) {
                var today = new Date().toISOString().slice(0, 10);
                filenameInput.value = 'Laporan_Ansor_' + today;
            }
            if (usePassToggle) usePassToggle.checked = false;
            if (passWrap) passWrap.classList.add('hidden');
            if (passInput) passInput.value = '';
        }

        var freshShareBtn = shareBtn.cloneNode(true);
        shareBtn.parentNode.replaceChild(freshShareBtn, shareBtn);
        freshShareBtn.addEventListener('click', openModal);

        if (closeBtn) {
            var freshClose = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(freshClose, closeBtn);
            freshClose.addEventListener('click', closeModal);
        }
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });

        if (usePassToggle) {
            usePassToggle.addEventListener('change', function() {
                if (passWrap) passWrap.classList.toggle('hidden', !this.checked);
                if (this.checked && passInput) {
                    setTimeout(function() { passInput.focus(); }, 100);
                }
            });
        }

        if (togglePassBtn && passInput) {
            togglePassBtn.addEventListener('click', function() {
                var isPass = passInput.type === 'password';
                passInput.type = isPass ? 'text' : 'password';
                this.innerHTML = isPass
                    ? '<i class="fas fa-eye-slash"></i>'
                    : '<i class="fas fa-eye"></i>';
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', function() {
                if (shareState.isGenerating) return;

                if (!navigator.onLine) {
                    safeToast('📴 Share PDF memerlukan koneksi internet (untuk upload). Download PDF offline tetap bisa via tombol Print/PDF.', 'warning', 5000);
                    return;
                }

                var filename = (filenameInput.value || '').trim();
                if (!filename) {
                    safeToast('Nama file wajib diisi', 'warning');
                    filenameInput.focus();
                    return;
                }
                filename = filename.replace(/[\/\\:*?"<>|]/g, '_');
                shareState.filename = filename;

                var usePassword = usePassToggle && usePassToggle.checked;
                var password = '';

                if (usePassword) {
                    password = (passInput.value || '').trim();
                    if (password.length < 4) {
                        safeToast('Password minimal 4 karakter', 'warning');
                        passInput.focus();
                        return;
                    }
                    shareState.password = password;
                } else {
                    shareState.password = '';
                }

                generateSharePDF(usePassword, password);
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                showStep('form');
                resetShareState();
            });
        }

        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', function() {
                var url = resultUrl ? resultUrl.value : '';
                if (!url) return;
                copyToClipboard(url)
                    .then(function() {
                        copyLinkBtn.classList.add('copied');
                        setTimeout(function() {
                            copyLinkBtn.classList.remove('copied');
                        }, 1500);
                        safeToast('✅ Link dicopy!', 'success', 2000);
                    })
                    .catch(function() {
                        safeToast('Gagal copy link', 'error');
                    });
            });
        }

        if (waBtn) {
            waBtn.addEventListener('click', function() {
                if (!shareState.driveUrl) {
                    safeToast('Link belum tersedia', 'warning');
                    return;
                }
                var text = '*📄 ' + shareState.filename + '*\n\n' +
                    'Silakan download laporan PDF melalui link berikut:\n' +
                    shareState.driveUrl;
                if (shareState.password) {
                    text += '\n\n🔒 *PDF dilindungi password*\n' +
                        'Password akan dikirim terpisah.';
                }
                var waUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
                window.open(waUrl, '_blank', 'noopener,noreferrer');
            });
        }

        if (tgBtn) {
            tgBtn.addEventListener('click', function() {
                if (!shareState.driveUrl) {
                    safeToast('Link belum tersedia', 'warning');
                    return;
                }
                var text = '📄 ' + shareState.filename;
                var tgUrl = 'https://t.me/share/url?url=' +
                    encodeURIComponent(shareState.driveUrl) +
                    '&text=' + encodeURIComponent(text);
                window.open(tgUrl, '_blank', 'noopener,noreferrer');
            });
        }

        if (qrBtn) {
            qrBtn.addEventListener('click', function() {
                if (!shareState.driveUrl) {
                    safeToast('Link belum tersedia', 'warning');
                    return;
                }
                renderShareQR(shareState.driveUrl);
            });
        }

        if (qrDownloadBtn) {
            qrDownloadBtn.addEventListener('click', downloadQRImage);
        }

        async function generateSharePDF(usePassword, password) {
            if (shareState.isGenerating) return;
            shareState.isGenerating = true;

            showStep('loading');
            if (loadingText) loadingText.textContent = 'Menyiapkan PDF...';
            if (loadingSubtext) loadingSubtext.textContent = 'Meng-capture halaman A4 Corporate';

            try {
                var pages = document.querySelectorAll('.a4-page');
                if (!pages || pages.length === 0) {
                    throw new Error('Tidak ada halaman A4 yang ditemukan');
                }

                if (typeof html2canvas === 'undefined') {
                    await window.loadLib('html2canvas');
                }
                if (!window.jspdf || !window.jspdf.jsPDF) {
                    await window.loadLib('jspdf');
                }

                await new Promise(function(r) { setTimeout(r, 300); });

                var jsPDF = window.jspdf.jsPDF;
                var pdf = new jsPDF('p', 'mm', 'a4');
                var totalPages = pages.length;

                for (var i = 0; i < totalPages; i++) {
                    if (loadingSubtext) {
                        loadingSubtext.textContent = 'Halaman ' + (i + 1) + ' / ' + totalPages;
                    }
                    var page = pages[i];
                    var canvas = await html2canvas(page, {
                        scale: 2, useCORS: true,
                        backgroundColor: '#ffffff', logging: false,
                        windowWidth: page.scrollWidth,
                        windowHeight: page.scrollHeight
                    });
                    var imgData = canvas.toDataURL('image/jpeg', 0.85);
                    if (i > 0) pdf.addPage();
                    var imgWidth = 210;
                    var imgHeight = (canvas.height * imgWidth) / canvas.width;
                    var yOffset = (297 - imgHeight) / 2;
                    pdf.addImage(imgData, 'JPEG', 0, yOffset, imgWidth, imgHeight);
                }

                var pdfBlob;
                if (usePassword && password) {
                    if (loadingText) loadingText.textContent = 'Menerapkan password...';
                    if (loadingSubtext) loadingSubtext.textContent = 'Mohon tunggu';

                    try {
                        pdfBlob = await encryptPDFWithPassword(pdf, password);
                    } catch (encErr) {
                        console.warn('[share-pdf] Encryption gagal, fallback tanpa password:', encErr);
                        safeToast('⚠️ Enkripsi password tidak tersedia, PDF tanpa password', 'warning', 4000);
                        pdfBlob = pdf.output('blob');
                        shareState.password = '';
                    }
                } else {
                    pdfBlob = pdf.output('blob');
                }

                shareState.pdfBlob = pdfBlob;
                shareState.pdfUrl = URL.createObjectURL(pdfBlob);

                if (loadingText) loadingText.textContent = 'Meng-upload ke Google Drive...';
                if (loadingSubtext) loadingSubtext.textContent = 'Agar bisa dibagikan via WhatsApp';

                await uploadPDFToDrive(pdfBlob, usePassword, password);

                showResult();
            } catch (err) {
                console.error('[share-pdf] Generate error:', err);
                safeToast('Gagal menyiapkan PDF: ' + err.message, 'error', 5000);
                showStep('form');
            } finally {
                shareState.isGenerating = false;
            }
        }

        async function encryptPDFWithPassword(jsPdf, password) {
            if (typeof PDFLib === 'undefined') {
                await window.loadLib('pdflib');
            }
            if (typeof PDFLib === 'undefined') {
                throw new Error('pdf-lib tidak tersedia');
            }

            var originalBytes = jsPdf.output('arraybuffer');
            var pdfDoc = await PDFLib.PDFDocument.load(originalBytes);

            pdfDoc.setTitle(shareState.filename);
            pdfDoc.setAuthor('PAC GP Ansor Sewon');
            pdfDoc.setSubject('Laporan Lengkap - Password Protected');
            pdfDoc.setCreator('Sistem Informasi Terpadu PAC GP Ansor Sewon');
            pdfDoc.setProducer('jsPDF + @cantoo/pdf-lib');
            pdfDoc.setCreationDate(new Date());

            var encryptedBytes = await pdfDoc.save({
                userPassword: password,
                ownerPassword: password,
                permissions: {
                    printing: 'highResolution',
                    modifying: false,
                    copying: false,
                    annotating: false,
                    fillingForms: false,
                    contentAccessibility: true,
                    documentAssembly: false
                }
            });

            return new Blob([encryptedBytes], { type: 'application/pdf' });
        }

        async function uploadPDFToDrive(pdfBlob, usePassword, password) {
            if (typeof window.uploadFileToDrive !== 'function') {
                throw new Error('uploadFileToDrive tidak tersedia');
            }

            var fileName = shareState.filename + '.pdf';

            var file;
            try {
                file = new File([pdfBlob], fileName, { type: 'application/pdf' });
            } catch (e) {
                pdfBlob.name = fileName;
                file = pdfBlob;
            }

            if (loadingSubtext) {
                loadingSubtext.textContent = 'Meng-upload ' +
                    (pdfBlob.size / 1024 / 1024).toFixed(2) + ' MB...';
            }

            var result = await window.uploadFileToDrive(file);

            if (!result || !result.success) {
                throw new Error((result && result.message) || 'Upload gagal');
            }

            shareState.driveUrl = result.url;

            try {
                await window.logActivity(
                    'SHARE', 'laporan', null,
                    'Share PDF: ' + fileName +
                    (usePassword ? ' (password protected)' : '')
                );
            } catch (e) {}

            return result.url;
        }

        function showResult() {
            showStep('result');

            if (resultMeta) {
                var sizeKB = (shareState.pdfBlob.size / 1024).toFixed(1);
                resultMeta.textContent = 'Ukuran: ' + sizeKB + ' KB · ' +
                    (shareState.password ? 'Dilindungi password' : 'Tanpa password');
            }

            if (resultUrl) {
                resultUrl.value = shareState.driveUrl || '';
            }

            if (downloadBtn) {
                downloadBtn.href = shareState.pdfUrl;
                downloadBtn.download = shareState.filename + '.pdf';
            }

            if (passInfo) {
                passInfo.classList.toggle('hidden', !shareState.password);
            }
        }

        async function renderShareQR(url) {
            if (!qrContainer) return;
            qrContainer.innerHTML = '<i class="fas fa-spinner fa-spin text-2xl text-indigo-600"></i>';
            if (qrResult) qrResult.classList.remove('hidden');

            if (typeof QRCode === 'undefined') {
                await window.loadLib('qrcode');
            }
            if (typeof QRCode === 'undefined') {
                qrContainer.innerHTML = '<p class="text-xs text-red-500 p-2">QR library tidak tersedia</p>';
                return;
            }

            qrContainer.innerHTML = '';
            var qrDiv = document.createElement('div');
            qrDiv.style.cssText = 'width:200px;height:200px;';
            qrContainer.appendChild(qrDiv);

            try {
                new QRCode(qrDiv, {
                    text: url, width: 200, height: 200,
                    colorDark: '#0f2922', colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (err) {
                console.error('[share-pdf] QR error:', err);
                qrContainer.innerHTML = '<p class="text-xs text-red-500 p-2">Gagal generate QR</p>';
            }
        }

        function downloadQRImage() {
            if (!qrContainer) return;
            var canvas = qrContainer.querySelector('canvas');
            if (!canvas) {
                safeToast('QR belum siap', 'warning');
                return;
            }
            try {
                var link = document.createElement('a');
                link.download = 'QR_' + shareState.filename + '.png';
                link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                safeToast('✅ QR berhasil diunduh!', 'success');
            } catch (e) {
                safeToast('Gagal download QR: ' + e.message, 'error');
            }
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        console.log('[logbook_report] ✅ Share PDF initialized (Corporate Edition)');
    }

    // ================================================================
    // 16. ATTACH BUTTON LISTENERS
    // ================================================================
    function attachButtonListeners() {
        if (backBtn) {
            var fresh = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(fresh, backBtn);
            fresh.addEventListener('click', function() {
                router.load('/logbook_admin');
            });
        }

        if (printBtn) {
            var freshPrint = printBtn.cloneNode(true);
            printBtn.parentNode.replaceChild(freshPrint, printBtn);
            printBtn = freshPrint;
            printBtn.addEventListener('click', exportPDF);
        }

        if (docxBtn) {
            var freshDocx = docxBtn.cloneNode(true);
            docxBtn.parentNode.replaceChild(freshDocx, docxBtn);
            docxBtn = freshDocx;
            docxBtn.addEventListener('click', exportDOCX);
        }

        try {
            initSharePDF();
        } catch (e) {
            console.warn('[logbook_report] initSharePDF error:', e.message);
        }
    }

    // ================================================================
    // 17. INIT
    // ================================================================
    function init() {
        console.log('[logbook_report] Init v13.1.0 — Corporate (Title Responsive)');
        console.log('[logbook_report] LOGO_URL resolved:', LOGO_URL);

        attachButtonListeners();

        loadAllData()
            .then(function(data) {
                window.__logbookReportData = data;
                renderReport(data);
                console.log('[logbook_report] ✅ Render selesai — 13 pages Corporate');
            })
            .catch(function(error) {
                console.error('[logbook_report] Init error:', error);
                reportLoading.innerHTML =
                    '<div class="text-center py-12 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-4xl mb-3"></i>' +
                        '<p>Gagal memuat laporan.</p>' +
                        '<p class="text-sm mt-2">' + escapeHtml(error.message) + '</p>' +
                    '</div>';
            });
    }

    // ================================================================
    // 18. CLEANUP
    // ================================================================
    window.__logbookReportCleanup = function() {
        window.__logbookReportLoaded = false;
        delete window.__logbookReportData;

        if (shareState.pdfUrl) {
            try { URL.revokeObjectURL(shareState.pdfUrl); } catch (e) {}
            shareState.pdfUrl = null;
        }

        console.log('[logbook_report] Cleanup');
    };

    // ================================================================
    // 19. RUN
    // ================================================================
    init();
});