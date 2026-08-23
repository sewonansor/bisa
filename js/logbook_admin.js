/**
 * js/logbook_admin.js
 * Modul Admin Logbook - Final (Cepat: Cache Lokal, Update Lokal, Preview, Export PDF/DOCX)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±317
 */

App.register('logbook_admin', function() {
    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD INISIALISASI
    // ================================================================
    if (window.__logbookAdminLoaded) return;
    window.__logbookAdminLoaded = true;

    // ================================================================
    // 3. HELPER: TUNGGU ELEMEN DOM SIAP
    // ================================================================
    function waitForElements(ids, maxRetries = 30, interval = 100) {
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
    // 4. INISIALISASI UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'logbook-form', 'kegiatan', 'tempat', 'tanggal_mulai', 'tanggal_selesai',
            'peserta', 'anggaran', 'deskripsi', 'file_url', 'logbook_file',
            'logbook-list', 'refresh-logbook-btn',
            'preview-btn', 'export-pdf-btn', 'export-docx-btn',
            'logbook-preview', 'logbook-preview-content'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'logbook-form': form,
            'kegiatan': kegiatanInput,
            'tempat': tempatInput,
            'tanggal_mulai': tanggalMulaiInput,
            'tanggal_selesai': tanggalSelesaiInput,
            'peserta': pesertaInput,
            'anggaran': anggaranInput,
            'deskripsi': deskripsiInput,
            'file_url': fileUrlInput,
            'logbook_file': fileInput,
            'logbook-list': listContainer,
            'refresh-logbook-btn': refreshBtn,
            'preview-btn': previewBtn,
            'export-pdf-btn': exportPdfBtn,
            'export-docx-btn': exportDocxBtn,
            'logbook-preview': previewDiv,
            'logbook-preview-content': previewContent
        } = els;

        if (!form || !listContainer) {
            console.error('logbook_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let dataCache = [];
        let isEdit = false; // unused? We'll add edit capability later if needed.
        // Untuk versi ini, kita hanya menambah logbook baru (tanpa edit), tapi bisa ditambahkan.

        // ================================================================
        // 6. LOAD DATA LOGBOOK (Stale-While-Revalidate)
        // ================================================================
        async function loadLogbook(force = false) {
            if (dataCache.length > 0 && !force) {
                renderList(dataCache);
                fetchDataBackground();
                return;
            }

            listContainer.innerHTML = '<p class="text-center text-muted py-4">Memuat data...</p>';
            try {
                const result = await forceRefreshData('getLogbook', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderList(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    listContainer.innerHTML = '<p class="text-center text-muted py-4">Belum ada Logbook</p>';
                } else {
                    listContainer.innerHTML = `<p class="text-center text-red-500 py-4">${result.message || 'Gagal memuat data'}</p>`;
                }
            } catch (error) {
                listContainer.innerHTML = `<p class="text-center text-red-500 py-4">Error: ${error.message}</p>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getLogbook', {});
                if (result.success && result.data) {
                    dataCache = result.data;
                    renderList(dataCache);
                }
            } catch (e) {
                console.warn('Background refresh gagal:', e);
            }
        }

        // ================================================================
        // 7. RENDER DAFTAR LOGBOOK
        // ================================================================
        function renderList(data) {
            let html = '';
            data.forEach(item => {
                html += `
                    <div class="border border-[var(--card-border)] p-4 rounded-lg mb-2 flex justify-between items-center bg-[var(--bg-stats)]">
                        <div>
                            <h3 class="font-bold text-[var(--text-main)]">${item.kegiatan || '-'}</h3>
                            <p class="text-sm text-[var(--text-muted)]">${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)} | ${item.tempat || '-'}</p>
                            <p class="text-sm text-[var(--text-muted)]">Peserta: ${item.peserta || 0} orang | Anggaran: ${formatRupiah(item.anggaran || 0)}</p>
                        </div>
                        <div class="flex gap-2">
                            <!-- Tambahkan tombol edit jika ingin, namun untuk versi ini hanya delete -->
                            <button onclick="deleteLogbook('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = html;
        }

        // ================================================================
        // 8. PREVIEW & EXPORT FUNCTIONS
        // ================================================================
        function getPreviewHtml() {
            const kegiatan = kegiatanInput.value || '-';
            const tempat = tempatInput.value || '-';
            const tglMulai = tanggalMulaiInput.value || '-';
            const tglSelesai = tanggalSelesaiInput.value || '-';
            const peserta = pesertaInput.value || '0';
            const anggaran = anggaranInput.value || '0';
            const deskripsi = deskripsiInput.value || '-';
            const fileUrl = fileUrlInput.value || '-';

            return `
                <div class="logbook-doc">
                    <h3 class="text-xl font-bold text-center mb-4">LOGBOOK KEGIATAN</h3>
                    <p class="text-center mb-6">PAC GP Ansor Kapanewon Sewon</p>
                    <table class="w-full mb-4">
                        <tr><td class="font-bold w-1/3">Nama Kegiatan</td><td>: ${kegiatan}</td></tr>
                        <tr><td class="font-bold">Tempat</td><td>: ${tempat}</td></tr>
                        <tr><td class="font-bold">Tanggal Mulai</td><td>: ${formatDate(tglMulai)}</td></tr>
                        <tr><td class="font-bold">Tanggal Selesai</td><td>: ${formatDate(tglSelesai)}</td></tr>
                        <tr><td class="font-bold">Peserta</td><td>: ${peserta} orang</td></tr>
                        <tr><td class="font-bold">Anggaran</td><td>: ${formatRupiah(parseInt(anggaran) || 0)}</td></tr>
                    </table>
                    <div class="mb-4"><p class="font-bold">Deskripsi Kegiatan:</p><p class="whitespace-pre-wrap">${deskripsi}</p></div>
                    <div><p class="font-bold">File Pendukung:</p><p>${fileUrl}</p></div>
                    <div class="mt-8 text-right">
                        <p>Yogyakarta, ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                        <p class="mt-4">Mengetahui,</p>
                        <p class="mt-8">Ketua PAC GP Ansor Sewon</p>
                    </div>
                </div>
            `;
        }

        // ================================================================
        // 9. EVENT LISTENERS: Preview, Export PDF, Export DOCX
        // ================================================================
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                previewContent.innerHTML = getPreviewHtml();
                previewDiv.classList.remove('hidden');
            });
        }

        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', async () => {
                const content = getPreviewHtml();
                previewContent.innerHTML = content;
                previewDiv.classList.remove('hidden');
                await new Promise(resolve => setTimeout(resolve, 500)); // beri waktu render
                const element = previewContent;
                try {
                    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                    const imgData = canvas.toDataURL('image/png');
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const imgWidth = 190;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                    pdf.save('Logbook_Kegiatan.pdf');
                } catch (error) {
                    showToast('Gagal export PDF: ' + error.message, 'error');
                }
            });
        }

        if (exportDocxBtn) {
            exportDocxBtn.addEventListener('click', async () => {
                const kegiatan = kegiatanInput.value || '-';
                const tempat = tempatInput.value || '-';
                const tglMulai = tanggalMulaiInput.value || '-';
                const tglSelesai = tanggalSelesaiInput.value || '-';
                const peserta = pesertaInput.value || '0';
                const anggaran = anggaranInput.value || '0';
                const deskripsi = deskripsiInput.value || '-';
                const fileUrl = fileUrlInput.value || '-';

                const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } = docx;

                const doc = new Document({
                    sections: [{
                        children: [
                            new Paragraph({ children: [new TextRun({ text: "LOGBOOK KEGIATAN", size: 24, bold: true, align: 'center' })] }),
                            new Paragraph({ children: [new TextRun({ text: "PAC GP Ansor Kapanewon Sewon", size: 18, align: 'center' })] }),
                            new Paragraph({ spacing: { after: 200 } }),
                            new Table({
                                rows: [
                                    new TableRow({ children: [new TableCell({ children: [new Paragraph("Nama Kegiatan")] }), new TableCell({ children: [new Paragraph(`: ${kegiatan}`)] })] }),
                                    new TableRow({ children: [new TableCell({ children: [new Paragraph("Tempat")] }), new TableCell({ children: [new Paragraph(`: ${tempat}`)] })] }),
                                    new TableRow({ children: [new TableCell({ children: [new Paragraph("Tanggal Mulai")] }), new TableCell({ children: [new Paragraph(`: ${formatDate(tglMulai)}`)] })] }),
                                    new TableRow({ children: [new TableCell({ children: [new Paragraph("Tanggal Selesai")] }), new TableCell({ children: [new Paragraph(`: ${formatDate(tglSelesai)}`)] })] }),
                                    new TableRow({ children: [new TableCell({ children: [new Paragraph("Peserta")] }), new TableCell({ children: [new Paragraph(`: ${peserta} orang`)] })] }),
                                    new TableRow({ children: [new TableCell({ children: [new Paragraph("Anggaran")] }), new TableCell({ children: [new Paragraph(`: ${formatRupiah(parseInt(anggaran) || 0)}`)] })] })
                                ]
                            }),
                            new Paragraph({ spacing: { before: 200 } }),
                            new Paragraph({ children: [new TextRun({ text: "Deskripsi Kegiatan:", bold: true })] }),
                            new Paragraph({ children: [new TextRun({ text: deskripsi })] }),
                            new Paragraph({ spacing: { before: 200 } }),
                            new Paragraph({ children: [new TextRun({ text: "File Pendukung:", bold: true })] }),
                            new Paragraph({ children: [new TextRun({ text: fileUrl })] }),
                            new Paragraph({ spacing: { before: 400 } }),
                            new Paragraph({ children: [new TextRun({ text: `Yogyakarta, ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, align: 'right' })] }),
                            new Paragraph({ children: [new TextRun({ text: "Mengetahui,", align: 'right' })] }),
                            new Paragraph({ spacing: { before: 200 } }),
                            new Paragraph({ children: [new TextRun({ text: "Ketua PAC GP Ansor Sewon", align: 'right' })] })
                        ]
                    }]
                });

                const blob = await Packer.toBlob(doc);
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'Logbook_Kegiatan.docx';
                link.click();
                URL.revokeObjectURL(link.href);
            });
        }

        // ================================================================
        // 10. DELETE LOGBOOK (Update Cache Lokal + Confirm Cepat)
        // ================================================================
        window.deleteLogbook = function(id) {
            showConfirm('Hapus Logbook ini?', async () => {
                const result = await apiCall('deleteLogbook', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderList(dataCache);
                    showToast('Logbook dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 11. SUBMIT FORM (CREATE) - Update Cache Lokal + Upload Background
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                // Simpan data tanpa file URL dulu
                const data = {
                    kegiatan: kegiatanInput.value,
                    tempat: tempatInput.value,
                    tanggal_mulai: tanggalMulaiInput.value,
                    tanggal_selesai: tanggalSelesaiInput.value,
                    peserta: parseInt(pesertaInput.value) || 0,
                    anggaran: parseInt(anggaranInput.value) || 0,
                    deskripsi: deskripsiInput.value,
                    file_url: fileUrlInput.value || '',
                    created_by: user.id
                };

                const result = await apiCall('createLogbook', 'POST', data);
                if (result.success) {
                    // Update cache lokal dengan data yang baru (tanpa fetch ulang)
                    const newItem = { ...data, id: result.id, created_at: new Date().toISOString() };
                    dataCache.unshift(newItem);
                    renderList(dataCache);

                    // Upload file pendukung di background jika ada
                    if (fileInput.files.length > 0) {
                        showToast('Data tersimpan, mengunggah file...', 'info');
                        uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                            if (uploadResult.success) {
                                apiCall('updateLogbook', 'POST', { id: result.id, file_url: uploadResult.url });
                                const idx = dataCache.findIndex(item => item.id === result.id);
                                if (idx !== -1) dataCache[idx].file_url = uploadResult.url;
                                renderList(dataCache);
                            } else {
                                showToast('Gagal upload file', 'error');
                            }
                        });
                    }

                    // Reset form
                    form.reset();
                    previewDiv.classList.add('hidden');
                    fileInput.value = '';
                    showToast('Logbook berhasil disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan Logbook', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        // ================================================================
        // 12. REFRESH BUTTON (Paksa Fetch)
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadLogbook(true);
                showToast('Data Logbook diperbarui!', 'success');
            });
        }

        // ================================================================
        // 13. INISIALISASI PERTAMA KALI
        // ================================================================
        loadLogbook();
    }

    // ================================================================
    // 14. JALANKAN INIT
    // ================================================================
    init();
});