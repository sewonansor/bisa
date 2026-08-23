/**
 * js/surat_admin.js
 * Modul Admin Surat - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±260
 */

App.register('surat_admin', function() {
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
    if (window.__suratAdminLoaded) return;
    window.__suratAdminLoaded = true;

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
            'surat-table-body',
            'surat-modal', 'modal-content', 'modal-title',
            'surat-form', 'modal-close',
            'add-surat-btn', 'refresh-surat-btn',
            'surat-id', 'nomor_surat', 'perihal', 'tanggal', 'pengirim',
            'penerima', 'isi', 'lampiran', 'surat_file', 'jenis_surat'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'surat-table-body': tableBody,
            'surat-modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'surat-form': form,
            'modal-close': closeBtn,
            'add-surat-btn': addBtn,
            'refresh-surat-btn': refreshBtn,
            'surat-id': idInput,
            'nomor_surat': nomorInput,
            'perihal': perihalInput,
            'tanggal': tanggalInput,
            'pengirim': pengirimInput,
            'penerima': penerimaInput,
            'isi': isiInput,
            'lampiran': lampiranInput,
            'surat_file': fileInput,
            'jenis_surat': jenisSelect
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('surat_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. LOAD DATA SURAT (Stale-While-Revalidate)
        // ================================================================
        async function loadSurat(force = false) {
            // Jika sudah ada data, tampilkan dulu lalu refresh background
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getSurat', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderTable(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-muted">Belum ada surat</td></tr>';
                } else {
                    tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getSurat', {});
                if (result.success && result.data) {
                    dataCache = result.data;
                    renderTable(dataCache);
                }
            } catch (e) {
                console.warn('Background refresh gagal:', e);
            }
        }

        // ================================================================
        // 7. RENDER TABEL
        // ================================================================
        function renderTable(data) {
            let html = '';
            data.forEach((item, idx) => {
                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.nomor_surat || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.perihal || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatDate(item.tanggal)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.pengirim || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.penerima || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.created_by || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="previewSurat('${item.id}')" class="text-green-600 hover:text-green-800 mr-2" title="Preview"><i class="fas fa-eye"></i></button>
                            <button onclick="editSurat('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteSurat('${item.id}')" class="text-red-600 hover:text-red-800" title="Hapus"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        // ================================================================
        // 8. MODAL FUNCTIONS (Cepat)
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
            }, 150);
            form.reset();
            idInput.value = '';
            nomorInput.value = 'Otomatis dibuat sistem';
            nomorInput.disabled = true;
            fileInput.value = '';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 9. TAMBAH SURAT
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Surat';
            form.reset();
            idInput.value = '';
            nomorInput.value = 'Otomatis dibuat sistem';
            nomorInput.disabled = true;
            fileInput.value = '';
            openModal();
        });

        // ================================================================
        // 10. PREVIEW SURAT
        // ================================================================
        window.previewSurat = function(id) {
            router.load('/surat_preview?id=' + id);
        };

        // ================================================================
        // 11. EDIT SURAT (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editSurat = function(id) {
            const surat = dataCache.find(s => s.id === id);
            if (!surat) {
                showToast('Surat tidak ditemukan di cache', 'warning');
                if (dataCache.length === 0) {
                    loadSurat(true).then(() => {
                        const retry = dataCache.find(s => s.id === id);
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(surat);
        };

        function fillEditForm(surat) {
            isEdit = true;
            modalTitle.textContent = 'Edit Surat';
            idInput.value = surat.id;
            nomorInput.value = surat.nomor_surat || '';
            nomorInput.disabled = true;
            perihalInput.value = surat.perihal || '';
            tanggalInput.value = surat.tanggal || '';
            pengirimInput.value = surat.pengirim || '';
            penerimaInput.value = surat.penerima || '';
            isiInput.value = surat.isi || '';
            lampiranInput.value = surat.lampiran || '';
            fileInput.value = '';

            // Set jenis surat berdasarkan nomor
            if (surat.nomor_surat && surat.nomor_surat.includes('SR-02')) {
                jenisSelect.value = 'eksternal';
            } else {
                jenisSelect.value = 'internal';
            }
            openModal();
        }

        // ================================================================
        // 12. DELETE SURAT (Update Cache Lokal)
        // ================================================================
        window.deleteSurat = function(id) {
            showConfirm('Hapus surat ini?', async () => {
                const result = await apiCall('deleteSurat', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    showToast('Surat dihapus!', 'success');
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
                // Simpan data tanpa lampiran URL dulu
                const data = {
                    perihal: perihalInput.value,
                    tanggal: tanggalInput.value,
                    pengirim: pengirimInput.value,
                    penerima: penerimaInput.value,
                    isi: isiInput.value,
                    lampiran: lampiranInput.value || '',
                    jenis_surat: jenisSelect.value,
                    created_by: user.id
                };

                const id = idInput.value;
                const action = isEdit ? 'updateSurat' : 'createSurat';
                const payload = isEdit ? { id, ...data } : data;

                const result = await apiCall(action, 'POST', payload);
                if (result.success) {
                    // Update cache lokal
                    if (isEdit) {
                        const index = dataCache.findIndex(item => item.id === id);
                        if (index !== -1) dataCache[index] = { ...dataCache[index], ...data, id: id };
                    } else {
                        // Untuk create, backend akan generate nomor surat baru, tapi kita belum tahu nomor tersebut dari response
                        // Kita perlu refresh atau ambil dari response jika tersedia
                        // Karena backend mengembalikan id saja, kita lakukan fetch ulang di background untuk mendapatkan nomor surat
                        // Namun, kita juga bisa menambahkan item sementara tanpa nomor, lalu update setelah fetch background
                        const tempItem = { ...data, id: result.id, nomor_surat: 'Menunggu nomor...' };
                        dataCache.unshift(tempItem);
                        // Fetch ulang di background untuk mendapatkan nomor asli
                        fetchDataBackground();
                    }

                    renderTable(dataCache);

                    // Upload lampiran di background jika ada file
                    if (fileInput.files.length > 0) {
                        showToast('Data tersimpan, mengunggah lampiran...', 'info');
                        uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                            if (uploadResult.success) {
                                apiCall('updateSurat', 'POST', { id: result.id, lampiran: uploadResult.url });
                                const idx = dataCache.findIndex(item => item.id === result.id);
                                if (idx !== -1) dataCache[idx].lampiran = uploadResult.url;
                                renderTable(dataCache);
                            } else {
                                showToast('Gagal upload lampiran', 'error');
                            }
                        });
                    }

                    closeModal();
                    form.reset();
                    showToast('Surat berhasil disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan surat', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        // ================================================================
        // 14. REFRESH BUTTON (Paksa Fetch)
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadSurat(true);
                showToast('Data diperbarui!', 'success');
            });
        }

        // ================================================================
        // 15. INISIALISASI PERTAMA KALI
        // ================================================================
        loadSurat();
    }

    // ================================================================
    // 16. JALANKAN INIT
    // ================================================================
    init();
});