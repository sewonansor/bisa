/**
 * full js/logbook_report.js
 * Modul Laporan Lengkap Logbook - Multi-Halaman, Premium, Siap Cetak
 * Versi: 2.2.0 - Final Fix (Stable, Auto-Hide Loading, Optimasi, No Error)
 */

App.register('logbook_report', function() {

    // ================================================================
    // 1. CEK AUTH (router sudah cek, tapi tetap amankan)
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // Guard untuk mencegah inisialisasi ganda
    if (window.__logbookReportLoaded) return;
    window.__logbookReportLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS (pastikan ada di views/logbook_report.html)
    // ================================================================
    const reportContent = document.getElementById('report-content');
    const reportLoading = document.getElementById('report-loading');
    const printBtn = document.getElementById('print-pdf-btn');
    const docxBtn = document.getElementById('export-docx-btn');
    const backBtn = document.getElementById('back-btn');

    // Jika elemen utama tidak ditemukan, hentikan modul
    if (!reportContent || !reportLoading || !printBtn || !docxBtn || !backBtn) {
        console.error('logbook_report: elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. FORMAT HELPERS (fallback jika belum ada di global)
    // ================================================================
    function formatDate(d) {
        if (typeof window.formatDate === 'function') return window.formatDate(d);
        if (!d) return '-';
        const date = new Date(d);
        return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    function formatRupiah(a) {
        if (typeof window.formatRupiah === 'function') return window.formatRupiah(a);
        if (!a && a !== 0) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(a);
    }

    // ================================================================
    // 4. LOAD SEMUA DATA (semua modul, termasuk Logbook)
    // ================================================================
    async function loadAllData() {
        const [
            suratRes, logbookRes, prokerRes, keuRes, invRes,
            arsipRes, absensiRes, strukturRes
        ] = await Promise.all([
            apiCall('getSurat', 'POST', {}),
            apiCall('getLogbook', 'POST', {}),
            apiCall('getProgramKerja', 'POST', {}),
            apiCall('getKeuangan', 'POST', {}),
            apiCall('getInventaris', 'POST', {}),
            apiCall('getArsip', 'POST', {}),
            apiCall('getAbsensi', 'POST', {}),
            apiCall('getStruktur', 'POST', {})
        ]);

        return {
            surat: suratRes.success ? suratRes.data : [],
            logbook: logbookRes.success ? logbookRes.data : [],
            proker: prokerRes.success ? prokerRes.data : [],
            keuangan: keuRes.success ? keuRes.data : [],
            inventaris: invRes.success ? invRes.data : [],
            arsip: arsipRes.success ? arsipRes.data : [],
            absensi: absensiRes.success ? absensiRes.data : [],
            struktur: strukturRes.success ? strukturRes.data : []
        };
    }

    // ================================================================
    // 5. HITUNG RINGKASAN
    // ================================================================
    function getSummary(data) {
        let totalMasuk = 0, totalKeluar = 0;
        data.keuangan.forEach(t => {
            const j = Number(t.jumlah) || 0;
            if (t.jenis === 'Pemasukan') totalMasuk += j;
            else totalKeluar += j;
        });

        const prokerSelesai = data.proker.filter(p => p.status === 'selesai').length;
        const prokerTotal = data.proker.length;

        return {
            totalSurat: data.surat.length,
            totalKegiatan: data.logbook.length, // <-- logbook
            totalProgram: prokerTotal,
            prokerSelesai: prokerSelesai,
            totalMasuk: totalMasuk,
            totalKeluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            totalBarang: data.inventaris.reduce((a, b) => a + (Number(b.jumlah) || 0), 0),
            totalArsip: data.arsip.length,
            totalAbsensi: data.absensi.length
        };
    }

    // ================================================================
    // 6. RENDER LAPORAN (Multi-Halaman)
    // ================================================================
    function renderReport(data) {
        const summary = getSummary(data);
        const now = new Date();
        const periode = now.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        let html = `
            <!-- COVER -->
            <div class="report-cover">
                <img src="logo-ansor.webp" alt="Logo Ansor" />
                <h1>LAPORAN<br/>LOGBOOK KEGIATAN</h1>
                <p class="subtitle">PAC GP Ansor Kapanewon Sewon</p>
                <p>Periode: ${periode}</p>
                <p>Disusun oleh: Administrator</p>
            </div>

            <!-- PENGANTAR -->
            <div class="report-intro">
                <p>Laporan ini disusun sebagai bentuk pertanggungjawaban atas seluruh kegiatan, program, dan pengelolaan keuangan yang telah dilaksanakan oleh PAC GP Ansor Kapanewon Sewon pada periode ${periode}. Seluruh data yang tercantum bersumber dari sistem informasi organisasi yang dikelola secara transparan dan akuntabel.</p>
            </div>

            <!-- RINGKASAN EKSEKUTIF -->
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
                        <div class="label">Kegiatan (Logbook)</div>
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

            <!-- SECTION: SURAT -->
            <div class="report-section">
                <h2><i class="fas fa-file-alt"></i> Arsip Surat</h2>
                ${data.surat.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Nomor</th><th>Perihal</th><th>Tanggal</th><th>Pengirim</th><th>Penerima</th></tr></thead>
                    <tbody>
                        ${data.surat.slice(0, 20).map((s, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${s.nomor_surat || '-'}</td>
                                <td>${s.perihal || '-'}</td>
                                <td>${formatDate(s.tanggal)}</td>
                                <td>${s.pengirim || '-'}</td>
                                <td>${s.penerima || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada data surat.</p>'}
            </div>

            <!-- SECTION: LOGBOOK / KEGIATAN -->
            <div class="report-section">
                <h2><i class="fas fa-calendar-check"></i> Daftar Logbook Kegiatan</h2>
                ${data.logbook.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Nama Kegiatan</th><th>Tanggal</th><th>Tempat</th><th>Peserta</th><th>Anggaran</th></tr></thead>
                    <tbody>
                        ${data.logbook.slice(0, 20).map((k, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${k.kegiatan || '-'}</td>
                                <td>${formatDate(k.tanggal_mulai)} - ${formatDate(k.tanggal_selesai)}</td>
                                <td>${k.tempat || '-'}</td>
                                <td>${k.peserta || 0}</td>
                                <td>${formatRupiah(k.anggaran || 0)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada logbook kegiatan.</p>'}
            </div>

            <!-- SECTION: PROGRAM KERJA -->
            <div class="report-section">
                <h2><i class="fas fa-tasks"></i> Program Kerja</h2>
                ${data.proker.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Nama Program</th><th>Status</th><th>Progress</th><th>PIC</th></tr></thead>
                    <tbody>
                        ${data.proker.slice(0, 20).map((p, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${p.nama_program || '-'}</td>
                                <td>${p.status || '-'}</td>
                                <td>${p.progress || 0}%</td>
                                <td>${p.pic || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada program kerja.</p>'}
            </div>

            <!-- SECTION: KEUANGAN -->
            <div class="report-section">
                <h2><i class="fas fa-coins"></i> Laporan Keuangan</h2>
                ${data.keuangan.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Jumlah</th><th>Keterangan</th></tr></thead>
                    <tbody>
                        ${data.keuangan.slice(0, 30).map((t, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${formatDate(t.tanggal)}</td>
                                <td>${t.jenis}</td>
                                <td>${t.kategori || '-'}</td>
                                <td>${formatRupiah(t.jumlah)}</td>
                                <td>${t.keterangan || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 1rem; font-weight: 600;">
                    <p>Total Pemasukan: <span class="text-green">${formatRupiah(summary.totalMasuk)}</span></p>
                    <p>Total Pengeluaran: <span class="text-red">${formatRupiah(summary.totalKeluar)}</span></p>
                    <p>Saldo Akhir: <span class="text-blue">${formatRupiah(summary.saldo)}</span></p>
                </div>` : '<p>Tidak ada transaksi keuangan.</p>'}
            </div>

            <!-- SECTION: INVENTARIS -->
            <div class="report-section">
                <h2><i class="fas fa-boxes"></i> Inventaris Barang</h2>
                ${data.inventaris.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Nama Barang</th><th>Jumlah</th><th>Kondisi</th><th>Lokasi</th></tr></thead>
                    <tbody>
                        ${data.inventaris.slice(0, 20).map((b, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${b.nama_barang}</td>
                                <td>${b.jumlah}</td>
                                <td>${b.kondisi}</td>
                                <td>${b.lokasi || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada inventaris.</p>'}
            </div>

            <!-- SECTION: ARSIP -->
            <div class="report-section">
                <h2><i class="fas fa-archive"></i> Arsip Digital</h2>
                ${data.arsip.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Judul</th><th>Tahun</th><th>Kategori</th><th>Jenis</th></tr></thead>
                    <tbody>
                        ${data.arsip.slice(0, 20).map((a, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${a.judul || '-'}</td>
                                <td>${a.tahun || '-'}</td>
                                <td>${a.kategori || '-'}</td>
                                <td>${a.jenis || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada arsip.</p>'}
            </div>

            <!-- SECTION: ABSENSI -->
            <div class="report-section">
                <h2><i class="fas fa-clipboard-check"></i> Absensi Kehadiran</h2>
                ${data.absensi.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Nama</th><th>Alamat</th><th>Waktu</th></tr></thead>
                    <tbody>
                        ${data.absensi.slice(0, 20).map((a, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${a.nama || '-'}</td>
                                <td>${a.alamat || '-'}</td>
                                <td>${formatDate(a.created_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada data absensi.</p>'}
            </div>

            <!-- SECTION: STRUKTUR -->
            <div class="report-section">
                <h2><i class="fas fa-sitemap"></i> Struktur Organisasi</h2>
                ${data.struktur.length > 0 ? `
                <table class="report-table">
                    <thead><tr><th>No</th><th>Jabatan</th><th>Nama</th></tr></thead>
                    <tbody>
                        ${data.struktur.slice(0, 15).map((s, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${s.jabatan || '-'}</td>
                                <td>${s.nama || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>` : '<p>Tidak ada data struktur.</p>'}
            </div>

            <!-- TANDA TANGAN -->
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
    // 7. EXPORT PDF (html2canvas + jsPDF)
    // ================================================================
    async function exportPDF() {
        const area = document.getElementById('report-area');
        if (!area) return;
        try {
            showToast('Menyusun PDF...', 'info');
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
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= 290; // tinggi halaman A4 dikurangi margin (mm)

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
                heightLeft -= 290;
            }

            pdf.save(`Laporan_Logbook_${new Date().toISOString().slice(0,10)}.pdf`);
            showToast('PDF berhasil diunduh!', 'success');
        } catch (error) {
            console.error('Export PDF error:', error);
            showToast('Gagal export PDF: ' + error.message, 'error');
        }
    }

    // ================================================================
    // 8. EXPORT DOCX (docx library)
    // ================================================================
    async function exportDOCX() {
        try {
            showToast('Menyusun DOCX...', 'info');
            const data = window.__logbookReportData;
            if (!data) {
                showToast('Data belum tersedia, muat ulang halaman.', 'warning');
                return;
            }
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

            // Helper tabel
            function createTable(header, rows) {
                const tableRows = [];
                tableRows.push(new TableRow({
                    children: header.map(h => new TableCell({
                        children: [new Paragraph({ text: h, bold: true })]
                    }))
                }));
                rows.forEach(r => {
                    tableRows.push(new TableRow({
                        children: r.map(cell => new TableCell({
                            children: [new Paragraph({ text: String(cell ?? '') })]
                        }))
                    }));
                });
                return new Table({ rows: tableRows });
            }

            // Surat
            if (data.surat.length) {
                children.push(new Paragraph({ text: "Arsip Surat", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nomor', 'Perihal', 'Tanggal', 'Pengirim', 'Penerima'],
                    data.surat.slice(0, 20).map((s, i) => [i+1, s.nomor_surat || '-', s.perihal || '-', formatDate(s.tanggal), s.pengirim || '-', s.penerima || '-'])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Logbook Kegiatan
            if (data.logbook.length) {
                children.push(new Paragraph({ text: "Daftar Logbook Kegiatan", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama Kegiatan', 'Tanggal', 'Tempat', 'Peserta', 'Anggaran'],
                    data.logbook.slice(0, 20).map((k, i) => [i+1, k.kegiatan || '-', `${formatDate(k.tanggal_mulai)} - ${formatDate(k.tanggal_selesai)}`, k.tempat || '-', k.peserta || 0, formatRupiah(k.anggaran || 0)])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Program Kerja
            if (data.proker.length) {
                children.push(new Paragraph({ text: "Program Kerja", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama Program', 'Status', 'Progress', 'PIC'],
                    data.proker.slice(0, 20).map((p, i) => [i+1, p.nama_program || '-', p.status || '-', `${p.progress || 0}%`, p.pic || '-'])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Keuangan
            if (data.keuangan.length) {
                children.push(new Paragraph({ text: "Laporan Keuangan", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan'],
                    data.keuangan.slice(0, 30).map((t, i) => [i+1, formatDate(t.tanggal), t.jenis, t.kategori || '-', formatRupiah(t.jumlah), t.keterangan || '-'])
                ));
                children.push(new Paragraph({ text: `Total Pemasukan: ${formatRupiah(summary.totalMasuk)}` }));
                children.push(new Paragraph({ text: `Total Pengeluaran: ${formatRupiah(summary.totalKeluar)}` }));
                children.push(new Paragraph({ text: `Saldo Akhir: ${formatRupiah(summary.saldo)}` }));
                children.push(new Paragraph({ text: "" }));
            }

            // Inventaris
            if (data.inventaris.length) {
                children.push(new Paragraph({ text: "Inventaris Barang", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama Barang', 'Jumlah', 'Kondisi', 'Lokasi'],
                    data.inventaris.slice(0, 20).map((b, i) => [i+1, b.nama_barang, b.jumlah, b.kondisi, b.lokasi || '-'])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Arsip
            if (data.arsip.length) {
                children.push(new Paragraph({ text: "Arsip Digital", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Judul', 'Tahun', 'Kategori', 'Jenis'],
                    data.arsip.slice(0, 20).map((a, i) => [i+1, a.judul || '-', a.tahun || '-', a.kategori || '-', a.jenis || '-'])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Absensi
            if (data.absensi.length) {
                children.push(new Paragraph({ text: "Absensi Kehadiran", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Nama', 'Alamat', 'Waktu'],
                    data.absensi.slice(0, 20).map((a, i) => [i+1, a.nama || '-', a.alamat || '-', formatDate(a.created_at)])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            // Struktur
            if (data.struktur.length) {
                children.push(new Paragraph({ text: "Struktur Organisasi", heading: HeadingLevel.HEADING_2 }));
                children.push(createTable(
                    ['No', 'Jabatan', 'Nama'],
                    data.struktur.slice(0, 15).map((s, i) => [i+1, s.jabatan || '-', s.nama || '-'])
                ));
                children.push(new Paragraph({ text: "" }));
            }

            const doc = new Document({ sections: [{ children }] });
            const blob = await Packer.toBlob(doc);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Laporan_Logbook_${new Date().toISOString().slice(0,10)}.docx`;
            link.click();
            URL.revokeObjectURL(link.href);
            showToast('DOCX berhasil diunduh!', 'success');
        } catch (error) {
            console.error('Export DOCX error:', error);
            showToast('Gagal export DOCX: ' + error.message, 'error');
        }
    }

    // ================================================================
    // 9. EVENT LISTENERS
    // ================================================================
    backBtn.addEventListener('click', () => router.load('/logbook_admin'));
    printBtn.addEventListener('click', exportPDF);
    docxBtn.addEventListener('click', exportDOCX);

    // ================================================================
    // 10. INISIALISASI
    // ================================================================
    async function init() {
        reportLoading.classList.remove('hidden');
        reportContent.classList.add('hidden');

        try {
            const data = await loadAllData();
            window.__logbookReportData = data; // Simpan untuk export DOCX
            renderReport(data);
        } catch (error) {
            console.error('Error inisialisasi laporan:', error);
            reportLoading.innerHTML = `<div class="text-red-500 text-center py-8">Error: ${error.message}</div>`;
        }
    }

    init();
});