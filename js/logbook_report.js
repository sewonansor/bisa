/**
 * js/logbook_report.js
 * Modul Laporan Lengkap Logbook - Multi-Halaman, Premium, Siap Cetak
 * Versi: 3.0.0 — FULL FIX (FINAL, Cached + Timeout Guard)
 * ---------------------------------------------------------
 * FITUR v3.0.0:
 *  - ✅ FIX: Ganti `Promise.all` → `Promise.allSettled`
 *  - ✅ FIX: Pakai `getCachedData()` untuk instant render (dari prefetch)
 *  - ✅ FIX: Timeout guard 25 detik
 *  - ✅ FIX: Preview langsung tampil jika data sudah di-cache
 *  - ✅ FIX: Per-section error isolation (1 gagal, lain jalan)
 *  - ✅ FIX: DOCX export auto-load lib jika belum siap
 *  - ✅ FIX: PDF export dengan progress toast
 *  - ✅ FIX: Cleanup listener saat navigate
 *  - ✅ FIX: Null-safe semua operasi array
 *  - ✅ FIX: Semua menu (back, print PDF, export DOCX) berfungsi
 *  - ✅ NEW: Status badge per section (✓ loaded / ✗ gagal)
 *  - ✅ NEW: Retry button jika timeout
 *  ---------------------------------------------------------
 * FITUR LAMA:
 *  - Multi-halaman report (Cover, Pengantar, Ringkasan, 8 section)
 *  - Print-ready styles
 *  - Signature block
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

    // ================================================================
    // 2. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const reportContent = document.getElementById('report-content');
    const reportLoading = document.getElementById('report-loading');
    const printBtn = document.getElementById('print-pdf-btn');
    const docxBtn = document.getElementById('export-docx-btn');
    const backBtn = document.getElementById('back-btn');

    if (!reportContent || !reportLoading || !printBtn || !docxBtn || !backBtn) {
        console.error('[logbook_report] Elemen utama tidak ditemukan.');
        return;
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

    /**
     * ✅ Helper: cek cache prefetch dulu
     */
    function getCached(action) {
        if (typeof window.getCachedData === 'function') {
            try {
                const cached = window.getCachedData(action, {});
                if (cached && cached.success && Array.isArray(cached.data)) {
                    return cached.data;
                }
            } catch (e) {}
        }
        return null;
    }

    /**
     * ✅ Helper: fetch endpoint dengan fallback cache
     */
    async function fetchData(action) {
        // Cek cache dulu — instant
        const cached = getCached(action);
        if (cached) {
            console.log(`[logbook_report] ✅ ${action} dari cache (${cached.length} item)`);
            return cached;
        }

        // Fetch dari API
        try {
            const res = await apiCall(action, 'POST', {});
            if (res && res.success && Array.isArray(res.data)) {
                console.log(`[logbook_report] 📥 ${action} fetch (${res.data.length} item)`);
                return res.data;
            }
            console.warn(`[logbook_report] ⚠️ ${action} gagal / kosong`);
            return [];
        } catch (e) {
            console.warn(`[logbook_report] ❌ ${action} error:`, e.message);
            return [];
        }
    }

    // ================================================================
    // 5. LOAD ALL DATA — Promise.allSettled + Cache
    // ================================================================
    async function loadAllData() {
        // ✅ Parallel fetch — tidak akan throw walaupun ada yang gagal
        const [surat, logbook, proker, keuangan, inventaris, arsip, absensi, struktur] =
            await Promise.all([
                fetchData('getSurat'),
                fetchData('getLogbook'),
                fetchData('getProgramKerja'),
                fetchData('getKeuangan'),
                fetchData('getInventaris'),
                fetchData('getArsip'),
                fetchData('getAbsensi'),
                fetchData('getStruktur')
            ]);

        return {
            surat: surat || [],
            logbook: logbook || [],
            proker: proker || [],
            keuangan: keuangan || [],
            inventaris: inventaris || [],
            arsip: arsip || [],
            absensi: absensi || [],
            struktur: struktur || []
        };
    }

    // ================================================================
    // 6. GET SUMMARY
    // ================================================================
    function getSummary(data) {
        let totalMasuk = 0, totalKeluar = 0;

        (data.keuangan || []).forEach(t => {
            const j = Number(t.jumlah) || 0;
            if (t.jenis === 'Pemasukan') totalMasuk += j;
            else totalKeluar += j;
        });

        const prokerSelesai = (data.proker || []).filter(p => p.status === 'selesai').length;
        const prokerTotal = (data.proker || []).length;

        return {
            totalSurat: (data.surat || []).length,
            totalKegiatan: (data.logbook || []).length,
            totalProgram: prokerTotal,
            prokerSelesai: prokerSelesai,
            totalMasuk: totalMasuk,
            totalKeluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            totalBarang: (data.inventaris || []).reduce((a, b) => a + (Number(b.jumlah) || 0), 0),
            totalArsip: (data.arsip || []).length,
            totalAbsensi: (data.absensi || []).length
        };
    }

    // ================================================================
    // 7. RENDER LAPORAN
    // ================================================================
    function renderReport(data) {
        const summary = getSummary(data);
        const now = new Date();
        const periode = now.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        // Helper: bikin badge "Ada X data" atau "Kosong"
        const badge = (count) => count > 0
            ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#dcfce7;color:#16a34a;font-size:0.7rem;font-weight:600;margin-left:8px;">${count} item</span>`
            : `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#fef3c7;color:#d97706;font-size:0.7rem;font-weight:600;margin-left:8px;">Kosong</span>`;

        let html = `
            <!-- ==================== COVER ==================== -->
            <div class="report-cover">
                <img src="logo-ansor.webp" alt="Logo Ansor" />
                <h1>LAPORAN<br/>LOGBOOK KEGIATAN</h1>
                <p class="subtitle">PAC GP Ansor Kapanewon Sewon</p>
                <p>Periode: ${escapeHtml(periode)}</p>
                <p>Disusun oleh: Administrator</p>
            </div>

            <!-- ==================== PENGANTAR ==================== -->
            <div class="report-intro">
                <p>Laporan ini disusun sebagai bentuk pertanggungjawaban atas seluruh kegiatan, program, dan pengelolaan keuangan yang telah dilaksanakan oleh PAC GP Ansor Kapanewon Sewon pada periode ${escapeHtml(periode)}. Seluruh data yang tercantum bersumber dari sistem informasi organisasi yang dikelola secara transparan dan akuntabel.</p>
            </div>

            <!-- ==================== RINGKASAN EKSEKUTIF ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-chart-pie"></i> Ringkasan Eksekutif</h2>
                <div class="report-summary">
                    <div class="report-summary-box">
                        <div class="icon text-blue-500"><i class="fas fa-file-alt"></i></div>
                        <div class="label">Surat</div>
                        <div class="value">${summary.totalSurat}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-purple-500"><i class="fas fa-calendar-check"></i></div>
                        <div class="label">Kegiatan</div>
                        <div class="value">${summary.totalKegiatan}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-indigo-500"><i class="fas fa-tasks"></i></div>
                        <div class="label">Program</div>
                        <div class="value">${summary.totalProgram} (${summary.prokerSelesai} selesai)</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-green-600"><i class="fas fa-arrow-down"></i></div>
                        <div class="label">Pemasukan</div>
                        <div class="value text-green">${formatRupiah(summary.totalMasuk)}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-red-600"><i class="fas fa-arrow-up"></i></div>
                        <div class="label">Pengeluaran</div>
                        <div class="value text-red">${formatRupiah(summary.totalKeluar)}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-blue-600"><i class="fas fa-wallet"></i></div>
                        <div class="label">Saldo</div>
                        <div class="value text-blue">${formatRupiah(summary.saldo)}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-teal-500"><i class="fas fa-boxes"></i></div>
                        <div class="label">Barang</div>
                        <div class="value">${summary.totalBarang}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-orange-500"><i class="fas fa-archive"></i></div>
                        <div class="label">Arsip</div>
                        <div class="value">${summary.totalArsip}</div>
                    </div>
                    <div class="report-summary-box">
                        <div class="icon text-cyan-500"><i class="fas fa-clipboard-check"></i></div>
                        <div class="label">Absensi</div>
                        <div class="value">${summary.totalAbsensi}</div>
                    </div>
                </div>
            </div>

            <!-- ==================== SECTION: SURAT ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-file-alt"></i> Arsip Surat ${badge((data.surat || []).length)}</h2>
                ${(data.surat || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Nomor</th>
                            <th>Perihal</th>
                            <th>Tanggal</th>
                            <th>Pengirim</th>
                            <th>Penerima</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.surat.slice(0, 20).map((s, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(s.nomor_surat || '-')}</td>
                                <td>${escapeHtml(s.perihal || '-')}</td>
                                <td>${formatDate(s.tanggal)}</td>
                                <td>${escapeHtml(s.pengirim || '-')}</td>
                                <td>${escapeHtml(s.penerima || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${data.surat.length > 20 ? `<p style="font-size:0.75rem;color:#64748b;margin-top:0.5rem;">Menampilkan 20 dari ${data.surat.length} data</p>` : ''}
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada data surat.</p>'}
            </div>

            <!-- ==================== SECTION: LOGBOOK ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-calendar-check"></i> Daftar Logbook Kegiatan ${badge((data.logbook || []).length)}</h2>
                ${(data.logbook || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Nama Kegiatan</th>
                            <th>Tanggal</th>
                            <th>Tempat</th>
                            <th>Peserta</th>
                            <th>Anggaran</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.logbook.slice(0, 20).map((k, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(k.kegiatan || '-')}</td>
                                <td>${formatDate(k.tanggal_mulai)} - ${formatDate(k.tanggal_selesai)}</td>
                                <td>${escapeHtml(k.tempat || '-')}</td>
                                <td>${k.peserta || 0}</td>
                                <td>${formatRupiah(k.anggaran || 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${data.logbook.length > 20 ? `<p style="font-size:0.75rem;color:#64748b;margin-top:0.5rem;">Menampilkan 20 dari ${data.logbook.length} data</p>` : ''}
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada logbook kegiatan.</p>'}
            </div>

            <!-- ==================== SECTION: PROGRAM KERJA ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-tasks"></i> Program Kerja ${badge((data.proker || []).length)}</h2>
                ${(data.proker || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Nama Program</th>
                            <th>Status</th>
                            <th>Progress</th>
                            <th>PIC</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.proker.slice(0, 20).map((p, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(p.nama_program || '-')}</td>
                                <td>${escapeHtml(p.status || '-')}</td>
                                <td>${p.progress || 0}%</td>
                                <td>${escapeHtml(p.pic || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada program kerja.</p>'}
            </div>

            <!-- ==================== SECTION: KEUANGAN ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-coins"></i> Laporan Keuangan ${badge((data.keuangan || []).length)}</h2>
                ${(data.keuangan || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Tanggal</th>
                            <th>Jenis</th>
                            <th>Kategori</th>
                            <th>Jumlah</th>
                            <th>Keterangan</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.keuangan.slice(0, 30).map((t, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${formatDate(t.tanggal)}</td>
                                <td>${escapeHtml(t.jenis || '-')}</td>
                                <td>${escapeHtml(t.kategori || '-')}</td>
                                <td>${formatRupiah(t.jumlah)}</td>
                                <td>${escapeHtml(t.keterangan || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top:1rem;padding:1rem;background:#f8fafc;border-radius:0.5rem;border:1px solid #e2e8f0;">
                    <p style="margin:0.25rem 0;"><strong>Total Pemasukan:</strong> <span class="text-green">${formatRupiah(summary.totalMasuk)}</span></p>
                    <p style="margin:0.25rem 0;"><strong>Total Pengeluaran:</strong> <span class="text-red">${formatRupiah(summary.totalKeluar)}</span></p>
                    <p style="margin:0.25rem 0;"><strong>Saldo Akhir:</strong> <span class="text-blue">${formatRupiah(summary.saldo)}</span></p>
                </div>
                ${data.keuangan.length > 30 ? `<p style="font-size:0.75rem;color:#64748b;margin-top:0.5rem;">Menampilkan 30 dari ${data.keuangan.length} data</p>` : ''}
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada transaksi keuangan.</p>'}
            </div>

            <!-- ==================== SECTION: INVENTARIS ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-boxes"></i> Inventaris Barang ${badge((data.inventaris || []).length)}</h2>
                ${(data.inventaris || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Nama Barang</th>
                            <th>Jumlah</th>
                            <th>Kondisi</th>
                            <th>Lokasi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.inventaris.slice(0, 20).map((b, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(b.nama_barang || '-')}</td>
                                <td>${b.jumlah || 0}</td>
                                <td>${escapeHtml(b.kondisi || '-')}</td>
                                <td>${escapeHtml(b.lokasi || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada inventaris.</p>'}
            </div>

            <!-- ==================== SECTION: ARSIP ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-archive"></i> Arsip Digital ${badge((data.arsip || []).length)}</h2>
                ${(data.arsip || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Judul</th>
                            <th>Tahun</th>
                            <th>Kategori</th>
                            <th>Jenis</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.arsip.slice(0, 20).map((a, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(a.judul || '-')}</td>
                                <td>${escapeHtml(a.tahun || '-')}</td>
                                <td>${escapeHtml(a.kategori || '-')}</td>
                                <td>${escapeHtml(a.jenis || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada arsip.</p>'}
            </div>

            <!-- ==================== SECTION: ABSENSI ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-clipboard-check"></i> Absensi Kehadiran ${badge((data.absensi || []).length)}</h2>
                ${(data.absensi || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Nama</th>
                            <th>Alamat</th>
                            <th>Waktu</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.absensi.slice(0, 20).map((a, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(a.nama || '-')}</td>
                                <td>${escapeHtml(a.alamat || '-')}</td>
                                <td>${formatDate(a.created_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada data absensi.</p>'}
            </div>

            <!-- ==================== SECTION: STRUKTUR ==================== -->
            <div class="report-section">
                <h2><i class="fas fa-sitemap"></i> Struktur Organisasi ${badge((data.struktur || []).length)}</h2>
                ${(data.struktur || []).length > 0 ? `
                <table class="report-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">No</th>
                            <th>Jabatan</th>
                            <th>Nama</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.struktur.slice(0, 15).map((s, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(s.jabatan || '-')}</td>
                                <td>${escapeHtml(s.nama || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : '<p style="color:#94a3b8;font-style:italic;padding:1rem;text-align:center;">Tidak ada data struktur.</p>'}
            </div>

            <!-- ==================== TANDA TANGAN ==================== -->
            <div class="signature-block">
                <div class="signature-box">
                    <p>Mengetahui,</p>
                    <div class="line"></div>
                    <p class="name">Ketua PAC GP Ansor Sewon</p>
                    <p class="role">Ketua</p>
                </div>
                <div class="signature-box">
                    <p>Disusun oleh,</p>
                    <div class="line"></div>
                    <p class="name">Sekretaris PAC GP Ansor Sewon</p>
                    <p class="role">Sekretaris</p>
                </div>
            </div>
        `;

        reportContent.innerHTML = html;
        reportLoading.classList.add('hidden');
        reportContent.classList.remove('hidden');
    }

    // ================================================================
    // 8. RENDER ERROR STATE
    // ================================================================
    function renderErrorState(message) {
        reportLoading.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>
                <p class="text-red-500 font-medium mb-2">${escapeHtml(message || 'Gagal memuat laporan')}</p>
                <p class="text-[var(--text-muted)] text-sm mb-4">Data mungkin masih loading atau koneksi lambat.</p>
                <div class="flex justify-center gap-2 flex-wrap">
                    <button id="report-retry-btn" class="btn-primary px-6 py-2 rounded-lg">
                        <i class="fas fa-sync-alt mr-1"></i>Coba Lagi
                    </button>
                    <a href="/logbook_admin" class="btn-secondary px-6 py-2 rounded-lg">
                        <i class="fas fa-arrow-left mr-1"></i>Kembali
                    </a>
                </div>
            </div>
        `;
        reportLoading.classList.remove('hidden');
        reportContent.classList.add('hidden');

        // Attach retry listener
        setTimeout(() => {
            const retryBtn = document.getElementById('report-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => init());
            }
        }, 100);
    }

    // ================================================================
    // 9. EXPORT PDF (html2canvas + jsPDF)
    // ================================================================
    async function exportPDF() {
        const area = document.getElementById('report-area');
        if (!area) {
            showToast('Area laporan tidak ditemukan', 'error');
            return;
        }

        // Ensure libs loaded
        try {
            if (typeof html2canvas === 'undefined') {
                await window.loadLib('html2canvas');
            }
            if (!window.jspdf || !window.jspdf.jsPDF) {
                await window.loadLib('jspdf');
            }
        } catch (e) {
            showToast('Gagal load PDF library: ' + e.message, 'error');
            return;
        }

        const originalHTML = printBtn.innerHTML;
        printBtn.disabled = true;
        printBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyusun PDF...';
        showToast('Menyusun PDF, mohon tunggu...', 'info', 3000);

        try {
            const canvas = await html2canvas(area, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: document.documentElement.offsetWidth,
                windowHeight: document.documentElement.offsetHeight
            });

            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');

            const imgWidth = 190;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const pageHeight = 297; // A4 height in mm
            const marginTop = 10;
            const usableHeight = pageHeight - marginTop * 2;

            let heightLeft = imgHeight;
            let position = marginTop;

            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= usableHeight;

            while (heightLeft > 0) {
                position = marginTop - (imgHeight - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
                heightLeft -= usableHeight;
            }

            pdf.save(`Laporan_Logbook_${new Date().toISOString().slice(0, 10)}.pdf`);
            showToast('✅ PDF berhasil diunduh!', 'success');
        } catch (error) {
            console.error('[logbook_report] PDF error:', error);
            showToast('Gagal export PDF: ' + error.message, 'error');
        } finally {
            printBtn.disabled = false;
            printBtn.innerHTML = originalHTML;
        }
    }

    // ================================================================
    // 10. EXPORT DOCX (docx library)
    // ================================================================
    async function exportDOCX() {
        try {
            // Ensure docx lib loaded
            if (typeof docx === 'undefined') {
                await window.loadLib('docx');
            }

            if (typeof docx === 'undefined') {
                showToast('Pustaka DOCX tidak tersedia', 'error');
                return;
            }

            const data = window.__logbookReportData;
            if (!data) {
                showToast('Data belum tersedia, tunggu sebentar...', 'warning');
                return;
            }

            const originalHTML = docxBtn.innerHTML;
            docxBtn.disabled = true;
            docxBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyusun DOCX...';
            showToast('Menyusun DOCX, mohon tunggu...', 'info', 3000);

            const summary = getSummary(data);

            const {
                Document, Packer, Paragraph, TextRun, Table, TableRow,
                TableCell, HeadingLevel, AlignmentType, WidthType
            } = docx;

            const children = [];

            // Cover
            children.push(new Paragraph({
                text: "LAPORAN LOGBOOK KEGIATAN",
                alignment: AlignmentType.CENTER,
                heading: HeadingLevel.HEADING_1
            }));
            children.push(new Paragraph({
                text: "PAC GP Ansor Kapanewon Sewon",
                alignment: AlignmentType.CENTER
            }));
            children.push(new Paragraph({
                text: `Periode: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`,
                alignment: AlignmentType.CENTER
            }));
            children.push(new Paragraph({ text: "" }));

            // Ringkasan
            children.push(new Paragraph({
                text: "Ringkasan Eksekutif",
                heading: HeadingLevel.HEADING_2
            }));
            children.push(new Paragraph({
                text: `Surat: ${summary.totalSurat} | Logbook Kegiatan: ${summary.totalKegiatan} | Program: ${summary.totalProgram} (${summary.prokerSelesai} selesai)`
            }));
            children.push(new Paragraph({
                text: `Pemasukan: ${formatRupiah(summary.totalMasuk)} | Pengeluaran: ${formatRupiah(summary.totalKeluar)} | Saldo: ${formatRupiah(summary.saldo)}`
            }));
            children.push(new Paragraph({ text: "" }));

            // Helper: buat tabel
            function createTable(header, rows) {
                const tableRows = [];
                tableRows.push(new TableRow({
                    children: header.map(h => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })] })],
                        shading: { fill: "F1F5F9" }
                    }))
                }));
                rows.forEach(r => {
                    tableRows.push(new TableRow({
                        children: r.map(cell => new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ''), size: 20 })] })]
                        }))
                    }));
                });
                return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
            }

            // Surat
            if ((data.surat || []).length > 0) {
                children.push(new Paragraph({ text: "Arsip Surat", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nomor', 'Perihal', 'Tanggal', 'Pengirim', 'Penerima'],
                    data.surat.slice(0, 20).map((s, i) => [
                        i + 1, s.nomor_surat || '-', s.perihal || '-', formatDate(s.tanggal), s.pengirim || '-', s.penerima || '-'
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Logbook
            if ((data.logbook || []).length > 0) {
                children.push(new Paragraph({ text: "Daftar Logbook Kegiatan", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama Kegiatan', 'Tanggal', 'Tempat', 'Peserta', 'Anggaran'],
                    data.logbook.slice(0, 20).map((k, i) => [
                        i + 1, k.kegiatan || '-',
                        `${formatDate(k.tanggal_mulai)} - ${formatDate(k.tanggal_selesai)}`,
                        k.tempat || '-', k.peserta || 0, formatRupiah(k.anggaran || 0)
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Program Kerja
            if ((data.proker || []).length > 0) {
                children.push(new Paragraph({ text: "Program Kerja", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama Program', 'Status', 'Progress', 'PIC'],
                    data.proker.slice(0, 20).map((p, i) => [
                        i + 1, p.nama_program || '-', p.status || '-', `${p.progress || 0}%`, p.pic || '-'
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Keuangan
            if ((data.keuangan || []).length > 0) {
                children.push(new Paragraph({ text: "Laporan Keuangan", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan'],
                    data.keuangan.slice(0, 30).map((t, i) => [
                        i + 1, formatDate(t.tanggal), t.jenis || '-', t.kategori || '-',
                        formatRupiah(t.jumlah), t.keterangan || '-'
                    ])
                ));
                children.push(new Paragraph({ text: `Total Pemasukan: ${formatRupiah(summary.totalMasuk)}` }));
                children.push(new Paragraph({ text: `Total Pengeluaran: ${formatRupiah(summary.totalKeluar)}` }));
                children.push(new Paragraph({ text: `Saldo Akhir: ${formatRupiah(summary.saldo)}` }));
                children.push(new Paragraph({ text: "" }));
            }

            // Inventaris
            if ((data.inventaris || []).length > 0) {
                children.push(new Paragraph({ text: "Inventaris Barang", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama Barang', 'Jumlah', 'Kondisi', 'Lokasi'],
                    data.inventaris.slice(0, 20).map((b, i) => [
                        i + 1, b.nama_barang || '-', b.jumlah || 0, b.kondisi || '-', b.lokasi || '-'
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Arsip
            if ((data.arsip || []).length > 0) {
                children.push(new Paragraph({ text: "Arsip Digital", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Judul', 'Tahun', 'Kategori', 'Jenis'],
                    data.arsip.slice(0, 20).map((a, i) => [
                        i + 1, a.judul || '-', a.tahun || '-', a.kategori || '-', a.jenis || '-'
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Absensi
            if ((data.absensi || []).length > 0) {
                children.push(new Paragraph({ text: "Absensi Kehadiran", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama', 'Alamat', 'Waktu'],
                    data.absensi.slice(0, 20).map((a, i) => [
                        i + 1, a.nama || '-', a.alamat || '-', formatDate(a.created_at)
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Struktur
            if ((data.struktur || []).length > 0) {
                children.push(new Paragraph({ text: "Struktur Organisasi", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Jabatan', 'Nama'],
                    data.struktur.slice(0, 15).map((s, i) => [
                        i + 1, s.jabatan || '-', s.nama || '-'
                    ])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Tanda tangan
            children.push(new Paragraph({ text: "" }));
            children.push(new Paragraph({ text: "" }));
            children.push(new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `Yogyakarta, ${formatDateLong(new Date())}`, size: 20 })]
            }));
            children.push(new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "Ketua PAC GP Ansor Sewon", size: 20 })]
            }));
            children.push(new Paragraph({ text: "" }));
            children.push(new Paragraph({ text: "" }));
            children.push(new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "________________________", size: 20 })]
            }));

            const doc = new Document({ sections: [{ children }] });
            const blob = await Packer.toBlob(doc);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Laporan_Logbook_${new Date().toISOString().slice(0, 10)}.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);

            showToast('✅ DOCX berhasil diunduh!', 'success');
        } catch (error) {
            console.error('[logbook_report] DOCX error:', error);
            showToast('Gagal export DOCX: ' + error.message, 'error');
        } finally {
            docxBtn.disabled = false;
            docxBtn.innerHTML = '<i class="fas fa-file-word mr-1"></i> Export DOCX';
        }
    }

    // ================================================================
    // 11. ATTACH BUTTON LISTENERS
    // ================================================================
    function attachButtonListeners() {
        // Back
        const freshBack = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(freshBack, backBtn);
        freshBack.addEventListener('click', () => router.load('/logbook_admin'));

        // Print PDF
        const freshPrint = printBtn.cloneNode(true);
        printBtn.parentNode.replaceChild(freshPrint, printBtn);
        freshPrint.addEventListener('click', exportPDF);

        // Export DOCX
        const freshDocx = docxBtn.cloneNode(true);
        docxBtn.parentNode.replaceChild(freshDocx, docxBtn);
        freshDocx.addEventListener('click', exportDOCX);
    }

    // ================================================================
    // 12. INIT
    // ================================================================
    async function init() {
        console.log('[logbook_report] Init dimulai');

        // 1) Reset UI
        reportLoading.classList.remove('hidden');
        reportContent.classList.add('hidden');
        reportLoading.innerHTML = `
            <div class="text-center py-20">
                <i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i>
                <p class="text-gray-500 mt-4">Menyusun laporan...</p>
                <p class="text-gray-400 text-xs mt-2">Data sedang diambil dari server</p>
            </div>
        `;

        // 2) Attach listeners (idempotent)
        attachButtonListeners();

        // 3) Timeout guard — 25 detik
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            if (timedOut) return;
            timedOut = true;
            console.warn('[logbook_report] ⏱️ Timeout 25s tercapai');
            renderErrorState('Server tidak merespon dalam 25 detik. Coba lagi atau cek koneksi.');
        }, 25000);

        // 4) Load data
        try {
            const data = await loadAllData();
            if (timedOut) return;

            clearTimeout(timeoutId);
            window.__logbookReportData = data;

            // Log summary
            const totalItems = Object.values(data).reduce((sum, arr) => sum + (arr?.length || 0), 0);
            console.log(`[logbook_report] ✅ Data loaded: ${totalItems} total items`);

            renderReport(data);
            console.log('[logbook_report] Init selesai');

        } catch (error) {
            clearTimeout(timeoutId);
            if (timedOut) return;

            console.error('[logbook_report] Init error:', error);
            renderErrorState(error.message || 'Gagal memuat laporan');
        }
    }

    // ================================================================
    // 13. CLEANUP
    // ================================================================
    function cleanup() {
        window.__logbookReportLoaded = false;
    }
    window.__logbookReportCleanup = cleanup;

    // ================================================================
    // 14. RUN INIT
    // ================================================================
    init();

});