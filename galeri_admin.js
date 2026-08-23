/**
 * js/galeri_admin.js
 * Modul Admin Galeri Media & Dokumentasi - Final (Cepat: Cache Lokal, Update Lokal, Upload Background)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±260
 */

App.register('galeri_admin', function() {
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
    if (window.__galeriAdminLoaded) return;
    window.__galeriAdminLoaded = true;

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
            'galeri-modal', 'modal-content', 'modal-title',
            'form', 'modal-close',
            'add-btn', 'refresh-galeri-btn',
            'edit-id', 'galeri_judul', 'galeri_deskripsi', 'galeri_file',
            'galeri_url', 'galeri_tipe', 'galeri_kategori',
            'total-media', 'total-foto', 'total-video'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'table-body': tableBody,
            'galeri-modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'form': form,
            'modal-close': closeBtn,
            'add-btn': addBtn,
            'refresh-galeri-btn': refreshBtn,
            'edit-id': editId,
            'galeri_judul': judulInput,
            'galeri_deskripsi': deskripsiInput,
            'galeri_file': fileInput,
            'galeri_url': urlInput,
            'galeri_tipe': tipeSelect,
            'galeri_kategori': kategoriSelect,
            'total-media': totalMediaEl,
            'total-foto': totalFotoEl,
            'total-video': totalVideoEl
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('galeri_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. LOAD DATA GALERI (Stale-While-Revalidate)
        // ================================================================
        async function loadData(force = false) {
            // Jika sudah ada data, tampilkan dulu lalu refresh background
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                updateStats(dataCache);
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getGaleri', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderTable(dataCache);
                    updateStats(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-muted">Belum ada media</td></tr>';
                    updateStats([]);
                } else {
                    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getGaleri', {});
                if (result.success && result.data) {
                    dataCache = result.data;
                    renderTable(dataCache);
                    updateStats(dataCache);
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
                const url = item.file_url || '';
                const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
                let previewHtml = '-';
                if (isYoutube) {
                    let vid = '';
                    if (url.includes('v=')) vid = url.split('v=')[1].split('&')[0];
                    else if (url.includes('youtu.be/')) vid = url.split('youtu.be/')[1].split('?')[0];
                    previewHtml = `<a href="${url}" target="_blank"><img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="${item.judul}" class="thumb-img" /></a>`;
                } else if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                    previewHtml = `<a href="${url}" target="_blank"><img src="${url}" alt="${item.judul}" class="thumb-img" /></a>`;
                } else if (url) {
                    previewHtml = `<a href="${url}" target="_blank" class="text-blue-600 hover:text-blue-800 text-2xl"><i class="fas fa-video"></i></a>`;
                }

                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm">${previewHtml}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.judul}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)] truncate max-w-xs">${item.deskripsi || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${item.tipe === 'foto' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}">${item.tipe === 'foto' ? 'Foto' : 'Video'}</span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.kategori || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editItem('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteItem('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        function updateStats(data) {
            let totalMedia = 0, totalFoto = 0, totalVideo = 0;
            data.forEach(item => {
                totalMedia++;
                if (item.tipe === 'foto') totalFoto++;
                else if (item.tipe === 'video') totalVideo++;
            });
            totalMediaEl.textContent = totalMedia;
            totalFotoEl.textContent = totalFoto;
            totalVideoEl.textContent = totalVideo;
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
            editId.value = '';
            fileInput.value = '';
            urlInput.value = '';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 9. TAMBAH MEDIA
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Media';
            form.reset();
            editId.value = '';
            fileInput.value = '';
            urlInput.value = '';
            openModal();
        });

        // ================================================================
        // 10. EDIT MEDIA (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(d => d.id === id);
            if (!item) {
                showToast('Media tidak ditemukan di cache', 'warning');
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
            modalTitle.textContent = 'Edit Media';
            editId.value = item.id;
            judulInput.value = item.judul;
            deskripsiInput.value = item.deskripsi || '';
            tipeSelect.value = item.tipe || 'foto';
            kategoriSelect.value = item.kategori || 'Kegiatan';
            urlInput.value = item.file_url || '';
            fileInput.value = '';
            openModal();
        }

        // ================================================================
        // 11. DELETE MEDIA (Update Cache Lokal)
        // ================================================================
        window.deleteItem = function(id) {
            showConfirm('Hapus media ini?', async () => {
                const result = await apiCall('deleteGaleri', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    updateStats(dataCache);
                    showToast('Media dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 12. SUBMIT FORM (CREATE / UPDATE) - Update Cache + Upload Background
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                // Simpan data tanpa file URL dulu (biar cepat)
                const data = {
                    judul: judulInput.value,
                    deskripsi: deskripsiInput.value,
                    file_url: urlInput.value || '',
                    tipe: tipeSelect.value,
                    kategori: kategoriSelect.value
                };

                const id = editId.value;
                const action = isEdit ? 'updateGaleri' : 'createGaleri';
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

                    renderTable(dataCache);
                    updateStats(dataCache);

                    // Upload file di background jika ada file yang dipilih
                    if (fileInput.files.length > 0) {
                        showToast('Data tersimpan, mengunggah file...', 'info');
                        uploadFileToDrive(fileInput.files[0]).then(uploadResult => {
                            if (uploadResult.success) {
                                apiCall('updateGaleri', 'POST', { id: result.id, file_url: uploadResult.url });
                                const idx = dataCache.findIndex(item => item.id === result.id);
                                if (idx !== -1) dataCache[idx].file_url = uploadResult.url;
                                renderTable(dataCache);
                            } else {
                                showToast('Gagal upload file', 'error');
                            }
                        });
                    }

                    closeModal();
                    form.reset();
                    showToast('Media berhasil disimpan!', 'success');
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
        // 13. REFRESH BUTTON (Paksa Fetch)
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