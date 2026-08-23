/**
 * js/tokoh_admin.js
 * Modul Admin Tokoh & Penggerak - Final (Cepat: Cache Lokal, Update Lokal, Upload Background)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±270
 */

App.register('tokoh_admin', function() {
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
    if (window.__tokohAdminLoaded) return;
    window.__tokohAdminLoaded = true;

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
            'tokoh-modal', 'modal-title',
            'tokoh-form', 'modal-close',
            'add-btn', 'refresh-btn',
            'tokoh-id', 'nama', 'no_hp', 'lat', 'lng', 'alamat',
            'riwayat_hidup', 'pengalaman_organisasi', 'detail_lain',
            'foto_url', 'foto_file'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'table-body': tableBody,
            'tokoh-modal': modal,
            'modal-title': modalTitle,
            'tokoh-form': form,
            'modal-close': closeBtn,
            'add-btn': addBtn,
            'refresh-btn': refreshBtn,
            'tokoh-id': idInput,
            'nama': namaInput,
            'no_hp': noHpInput,
            'lat': latInput,
            'lng': lngInput,
            'alamat': alamatInput,
            'riwayat_hidup': riwayatInput,
            'pengalaman_organisasi': pengalamanInput,
            'detail_lain': detailInput,
            'foto_url': fotoUrlInput,
            'foto_file': fotoFileInput
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('tokoh_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. LOAD DATA TOKOH (Stale-While-Revalidate)
        // ================================================================
        async function loadData(force = false) {
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getTokoh', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderTable(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-muted">Belum ada data tokoh.</td></tr>';
                } else {
                    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getTokoh', {});
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
                const foto = item.foto_url
                    ? `<img src="${item.foto_url}" class="w-12 h-12 rounded-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/80x80?text=?'">`
                    : '<div class="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center"><i class="fas fa-user text-gray-500"></i></div>';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4">${foto}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.nama || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.alamat || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.no_hp || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editTokoh('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteTokoh('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
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
            const content = modal.querySelector('div');
            if (content) {
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');
            }
        }

        function closeModal() {
            const content = modal.querySelector('div');
            if (content) {
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
            form.reset();
            idInput.value = '';
            fotoUrlInput.value = '';
            fotoFileInput.value = '';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 9. TAMBAH TOKOH
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Tokoh';
            form.reset();
            idInput.value = '';
            fotoUrlInput.value = '';
            fotoFileInput.value = '';
            openModal();
        });

        // ================================================================
        // 10. EDIT TOKOH (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editTokoh = function(id) {
            const item = dataCache.find(t => t.id === id);
            if (!item) {
                showToast('Data tidak ditemukan di cache', 'warning');
                if (dataCache.length === 0) {
                    loadData(true).then(() => {
                        const retry = dataCache.find(t => t.id === id);
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(item);
        };

        function fillEditForm(item) {
            isEdit = true;
            modalTitle.textContent = 'Edit Tokoh';
            idInput.value = item.id;
            namaInput.value = item.nama || '';
            noHpInput.value = item.no_hp || '';
            latInput.value = item.lat || '';
            lngInput.value = item.lng || '';
            alamatInput.value = item.alamat || '';
            riwayatInput.value = item.riwayat_hidup || '';
            pengalamanInput.value = item.pengalaman_organisasi || '';
            detailInput.value = item.detail_lain || '';
            fotoUrlInput.value = item.foto_url || '';
            fotoFileInput.value = '';
            openModal();
        }

        // ================================================================
        // 11. DELETE TOKOH (Update Cache Lokal)
        // ================================================================
        window.deleteTokoh = function(id) {
            showConfirm('Hapus tokoh ini?', async () => {
                const result = await apiCall('deleteTokoh', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    showToast('Tokoh berhasil dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 12. SUBMIT FORM (CREATE / UPDATE) - Update Cache Lokal
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                // Simpan data tanpa foto URL dulu (biar cepat)
                const data = {
                    nama: namaInput.value,
                    no_hp: noHpInput.value,
                    lat: latInput.value,
                    lng: lngInput.value,
                    alamat: alamatInput.value,
                    riwayat_hidup: riwayatInput.value,
                    pengalaman_organisasi: pengalamanInput.value,
                    detail_lain: detailInput.value,
                    foto_url: fotoUrlInput.value || '',
                    created_by: user.id
                };

                const id = idInput.value;
                const action = isEdit ? 'updateTokoh' : 'createTokoh';
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

                    // Upload foto di background jika ada file
                    if (fotoFileInput.files.length > 0) {
                        showToast('Data tersimpan, mengunggah foto...', 'info');
                        uploadFileToDrive(fotoFileInput.files[0]).then(uploadResult => {
                            if (uploadResult.success) {
                                apiCall('updateTokoh', 'POST', { id: result.id, foto_url: uploadResult.url });
                                const idx = dataCache.findIndex(item => item.id === result.id);
                                if (idx !== -1) dataCache[idx].foto_url = uploadResult.url;
                                renderTable(dataCache);
                            } else {
                                showToast('Gagal upload foto', 'error');
                            }
                        });
                    }

                    renderTable(dataCache);
                    closeModal();
                    form.reset();
                    showToast('Tokoh berhasil disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        // ================================================================
        // 13. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadData(true);
                showToast('Data diperbarui!', 'success');
            });
        }

        // ================================================================
        // 14. INISIALISASI PERTAMA KALI
        // ================================================================
        loadData();
    }

    // ================================================================
    // 15. JALANKAN INIT
    // ================================================================
    init();
});