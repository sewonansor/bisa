/**
 * js/keuangan_admin.js
 * Modul Admin Keuangan - Final (Cepat: Cache Lokal, Update Lokal, Upload Background)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±350
 */

App.register('keuangan_admin', function() {
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
    if (window.__keuanganAdminLoaded) return;
    window.__keuanganAdminLoaded = true;

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
            'table-body',
            'modal', 'modal-content', 'modal-title',
            'form', 'modal-close',
            'add-btn', 'refresh-keuangan-btn',
            'edit-id', 'tanggal', 'jenis', 'kategori', 'kategori_manual',
            'jumlah', 'keterangan', 'nota_file', 'nota_url',
            'total-pemasukan', 'total-pengeluaran', 'saldo-akhir',
            'filter-date', 'export-btn'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'table-body': tableBody,
            'modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'form': form,
            'modal-close': closeBtn,
            'add-btn': addBtn,
            'refresh-keuangan-btn': refreshBtn,
            'edit-id': editIdInput,
            'tanggal': tanggalInput,
            'jenis': jenisSelect,
            'kategori': kategoriSelect,
            'kategori_manual': kategoriManualInput,
            'jumlah': jumlahInput,
            'keterangan': keteranganInput,
            'nota_file': notaFileInput,
            'nota_url': notaUrlInput,
            'total-pemasukan': totalPemasukanEl,
            'total-pengeluaran': totalPengeluaranEl,
            'saldo-akhir': saldoAkhirEl,
            'filter-date': filterDate,
            'export-btn': exportBtn
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('keuangan_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. FUNGSI TOGGLE KATEGORI MANUAL
        // ================================================================
        function toggleKategoriManual() {
            if (kategoriSelect.value === 'Lainnya') {
                kategoriManualInput.classList.remove('hidden');
                kategoriManualInput.focus();
            } else {
                kategoriManualInput.classList.add('hidden');
                kategoriManualInput.value = '';
            }
        }
        kategoriSelect.addEventListener('change', toggleKategoriManual);

        // ================================================================
        // 7. LOAD DATA KEUANGAN (Stale-While-Revalidate)
        // ================================================================
        async function loadData(force = false) {
            // Jika sudah ada data cache, langsung tampilkan, lalu refresh background
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                fetchDataBackground();
                return;
            }

            // Tampilkan spinner, ambil data
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getKeuangan', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderTable(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-[var(--text-muted)]">Belum ada transaksi</td></tr>`;
                    totalPemasukanEl.textContent = 'Rp 0';
                    totalPengeluaranEl.textContent = 'Rp 0';
                    saldoAkhirEl.textContent = 'Rp 0';
                } else {
                    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        // Refresh data di background tanpa mengganggu UI
        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getKeuangan', {});
                if (result.success && result.data) {
                    dataCache = result.data;
                    renderTable(dataCache);
                }
            } catch (e) {
                console.warn('Background refresh gagal:', e);
            }
        }

        // ================================================================
        // 8. RENDER TABEL
        // ================================================================
        function renderTable(data) {
            let html = '';
            let totalMasuk = 0, totalKeluar = 0;

            data.forEach((item, idx) => {
                const jml = Number(item.jumlah) || 0;
                if (item.jenis === 'Pemasukan') totalMasuk += jml;
                else totalKeluar += jml;

                const notaHtml = item.nota_url
                    ? `<a href="${item.nota_url}" target="_blank" class="text-blue-600 hover:text-blue-800"><i class="fas fa-image"></i></a>`
                    : '-';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatDate(item.tanggal)}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${item.jenis === 'Pemasukan' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${item.jenis}</span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.kategori || '-'}</td>
                        <td class="px-6 py-4 text-sm font-bold ${item.jenis === 'Pemasukan' ? 'text-green-600' : 'text-red-600'}">${formatRupiah(jml)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)] truncate max-w-xs">${item.keterangan || '-'}</td>
                        <td class="px-6 py-4 text-sm">${notaHtml}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editItem('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteItem('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });

            tableBody.innerHTML = html;
            totalPemasukanEl.textContent = formatRupiah(totalMasuk);
            totalPengeluaranEl.textContent = formatRupiah(totalKeluar);
            saldoAkhirEl.textContent = formatRupiah(totalMasuk - totalKeluar);
        }

        // ================================================================
        // 9. MODAL FUNCTIONS (Cepat, Tanpa setTimeout)
        // ================================================================
        function openModal() {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }

        function closeModal() {
            modalContent.classList.remove('scale-100', 'opacity-100');
            modalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150); // tetap ada transisi tapi cepat
            form.reset();
            editIdInput.value = '';
            notaFileInput.value = '';
            notaUrlInput.value = '';
            kategoriManualInput.classList.add('hidden');
            kategoriManualInput.value = '';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 10. TAMBAH TRANSAKSI
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Transaksi';
            form.reset();
            editIdInput.value = '';
            notaFileInput.value = '';
            notaUrlInput.value = '';
            kategoriManualInput.classList.add('hidden');
            kategoriManualInput.value = '';
            openModal();
        });

        // ================================================================
        // 11. EDIT TRANSAKSI (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(d => d.id === id);
            if (!item) {
                showToast('Data tidak ditemukan di cache', 'warning');
                // Fallback: coba fetch ulang jika cache kosong
                if (dataCache.length === 0) {
                    loadData(true).then(() => {
                        const retry = dataCache.find(d => d.id === id);
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(item);
        };

        function fillEditForm(item) {
            isEdit = true;
            modalTitle.textContent = 'Edit Transaksi';
            editIdInput.value = item.id;
            tanggalInput.value = item.tanggal || '';
            jenisSelect.value = item.jenis || 'Pemasukan';

            const defaultCategories = ['Iuran Anggota', 'Donasi', 'Konsumsi', 'Transportasi', 'Perlengkapan'];
            if (defaultCategories.includes(item.kategori)) {
                kategoriSelect.value = item.kategori;
                kategoriManualInput.classList.add('hidden');
                kategoriManualInput.value = '';
            } else {
                kategoriSelect.value = 'Lainnya';
                kategoriManualInput.value = item.kategori || '';
                kategoriManualInput.classList.remove('hidden');
            }

            jumlahInput.value = item.jumlah || 0;
            keteranganInput.value = item.keterangan || '';
            notaUrlInput.value = item.nota_url || '';
            notaFileInput.value = '';
            openModal();
        }

        // ================================================================
        // 12. DELETE TRANSAKSI (Update Cache Lokal)
        // ================================================================
        window.deleteItem = function(id) {
            showConfirm('Hapus transaksi ini?', async () => {
                const result = await apiCall('deleteKeuangan', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    showToast('Transaksi dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 13. SUBMIT FORM (CREATE / UPDATE) - Update Cache Lokal
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                let kategori = kategoriSelect.value;
                if (kategori === 'Lainnya') {
                    kategori = kategoriManualInput.value.trim() || 'Lainnya';
                }

                // Simpan data tanpa nota URL terlebih dahulu
                const data = {
                    tanggal: tanggalInput.value,
                    jenis: jenisSelect.value,
                    kategori: kategori,
                    jumlah: jumlahInput.value,
                    keterangan: keteranganInput.value,
                    nota_url: notaUrlInput.value || '',
                    created_by: user.id
                };

                const id = editIdInput.value;
                const action = isEdit ? 'updateKeuangan' : 'createKeuangan';
                const payload = isEdit ? { id, ...data } : data;

                const result = await apiCall(action, 'POST', payload);
                if (result.success) {
                    // Update cache lokal
                    if (isEdit) {
                        const index = dataCache.findIndex(item => item.id === id);
                        if (index !== -1) dataCache[index] = { ...dataCache[index], ...data, id: id };
                    } else {
                        const newItem = { ...data, id: result.id, created_at: new Date().toISOString() };
                        dataCache.unshift(newItem);
                    }

                    // Upload nota di background jika ada file
                    if (notaFileInput.files.length > 0) {
                        showToast('Data tersimpan, mengunggah nota...', 'info');
                        uploadFileToDrive(notaFileInput.files[0]).then(uploadResult => {
                            if (uploadResult.success) {
                                const updateNota = async () => {
                                    await apiCall('updateKeuangan', 'POST', { id: result.id, nota_url: uploadResult.url });
                                    // Perbarui cache lokal juga
                                    const idx = dataCache.findIndex(item => item.id === result.id);
                                    if (idx !== -1) dataCache[idx].nota_url = uploadResult.url;
                                    renderTable(dataCache);
                                };
                                updateNota();
                            } else {
                                showToast('Gagal upload nota', 'error');
                            }
                        });
                    }

                    // Render ulang tabel dari cache
                    renderTable(dataCache);
                    closeModal();
                    form.reset();
                    showToast('Transaksi berhasil disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan transaksi', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        // ================================================================
        // 14. FILTER TANGGAL
        // ================================================================
        if (filterDate) {
            filterDate.addEventListener('change', () => {
                const value = filterDate.value;
                if (!value) {
                    renderTable(dataCache);
                    return;
                }
                const filtered = dataCache.filter(item => {
                    if (!item.tanggal) return false;
                    const d = new Date(item.tanggal);
                    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
                });
                renderTable(filtered);
            });
        }

        // ================================================================
        // 15. EXPORT CSV
        // ================================================================
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (dataCache.length === 0) {
                    showToast('Tidak ada data untuk diekspor.', 'warning');
                    return;
                }
                const headers = ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan', 'Nota'];
                const rows = dataCache.map((item, idx) => {
                    const date = item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID') : '-';
                    return [idx + 1, date, item.jenis || '', item.kategori || '', item.jumlah || 0, item.keterangan || '', item.nota_url ? 'Ada' : '-'];
                });
                const csvContent = [headers, ...rows]
                    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                    .join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `keuangan_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('CSV berhasil diunduh!', 'success');
            });
        }

        // ================================================================
        // 16. REFRESH BUTTON (Paksa Fetch)
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadData(true);
                showToast('Data diperbarui!', 'success');
            });
        }

        // ================================================================
        // 17. INISIALISASI PERTAMA KALI
        // ================================================================
        loadData();
    }

    // ================================================================
    // 18. JALANKAN INIT
    // ================================================================
    init();
});