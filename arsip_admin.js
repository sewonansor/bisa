/**
 * js/arsip_admin.js
 * Modul Admin Arsip Digital - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±236
 */

App.register('arsip_admin', function() {
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
    if (window.__arsipAdminLoaded) return;
    window.__arsipAdminLoaded = true;

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
            'arsip-table-body',
            'arsip-modal', 'modal-content', 'modal-title',
            'arsip-form', 'modal-close',
            'add-arsip-btn', 'refresh-arsip-btn',
            'arsip-id', 'arsip_judul', 'arsip_tahun', 'arsip_kategori',
            'arsip_jenis', 'arsip_file_url', 'arsip_deskripsi'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'arsip-table-body': tableBody,
            'arsip-modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'arsip-form': form,
            'modal-close': closeBtn,
            'add-arsip-btn': addBtn,
            'refresh-arsip-btn': refreshBtn,
            'arsip-id': idInput,
            'arsip_judul': judulInput,
            'arsip_tahun': tahunInput,
            'arsip_kategori': kategoriSelect,
            'arsip_jenis': jenisSelect,
            'arsip_file_url': fileUrlInput,
            'arsip_deskripsi': deskripsiInput
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('arsip_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. LOAD DATA ARSIP (Stale-While-Revalidate)
        // ================================================================
        async function loadArsip(force = false) {
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getArsip', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderTable(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-muted">Belum ada arsip</td></tr>';
                } else {
                    tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getArsip', {});
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
                let iconClass = 'fa-file', label = 'File';
                if (item.jenis === 'pdf') { iconClass = 'fa-file-pdf'; label = 'PDF'; }
                else if (item.jenis === 'docx') { iconClass = 'fa-file-word'; label = 'DOCX'; }
                else if (item.jenis === 'xlsx') { iconClass = 'fa-file-excel'; label = 'XLSX'; }
                else if (item.jenis === 'img') { iconClass = 'fa-image'; label = 'Gambar'; }
                else if (item.jenis === 'video') { iconClass = 'fa-video'; label = 'Video'; }

                let badgeColor = 'bg-gray-100 text-gray-700';
                if (item.kategori === 'dokumen') badgeColor = 'bg-blue-100 text-blue-700';
                else if (item.kategori === 'laporan') badgeColor = 'bg-green-100 text-green-700';
                else if (item.kategori === 'foto') badgeColor = 'bg-purple-100 text-purple-700';
                else if (item.kategori === 'video') badgeColor = 'bg-red-100 text-red-700';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.judul || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.tahun || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${badgeColor}">${item.kategori || '-'}</span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${label}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)] truncate max-w-xs">${item.deskripsi || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editArsip('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteArsip('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
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
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 9. TAMBAH ARSIP
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Arsip';
            form.reset();
            idInput.value = '';
            openModal();
        });

        // ================================================================
        // 10. EDIT ARSIP (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editArsip = function(id) {
            const item = dataCache.find(d => d.id === id);
            if (!item) {
                showToast('Arsip tidak ditemukan di cache', 'warning');
                if (dataCache.length === 0) {
                    loadArsip(true).then(() => {
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
            modalTitle.textContent = 'Edit Arsip';
            idInput.value = item.id;
            judulInput.value = item.judul || '';
            tahunInput.value = item.tahun || '';
            kategoriSelect.value = item.kategori || 'dokumen';
            jenisSelect.value = item.jenis || 'pdf';
            fileUrlInput.value = item.file_url || '';
            deskripsiInput.value = item.deskripsi || '';
            openModal();
        }

        // ================================================================
        // 11. DELETE ARSIP (Update Cache Lokal)
        // ================================================================
        window.deleteArsip = function(id) {
            showConfirm('Hapus arsip ini?', async () => {
                const result = await apiCall('deleteArsip', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    showToast('Arsip dihapus!', 'success');
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

            const data = {
                judul: judulInput.value,
                tahun: tahunInput.value,
                kategori: kategoriSelect.value,
                jenis: jenisSelect.value,
                file_url: fileUrlInput.value,
                deskripsi: deskripsiInput.value
            };

            const id = idInput.value;
            const action = isEdit ? 'updateArsip' : 'createArsip';
            const payload = isEdit ? { id, ...data } : data;

            try {
                const result = await apiCall(action, 'POST', payload);
                if (result.success) {
                    if (isEdit) {
                        const index = dataCache.findIndex(item => item.id === id);
                        if (index !== -1) dataCache[index] = { ...dataCache[index], ...data, id: id };
                    } else {
                        const newItem = { ...data, id: result.id, created_at: new Date().toISOString() };
                        dataCache.unshift(newItem);
                    }
                    renderTable(dataCache);
                    closeModal();
                    form.reset();
                    showToast('Arsip disimpan!', 'success');
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
                await loadArsip(true);
                showToast('Data diperbarui!', 'success');
            });
        }

        // ================================================================
        // 14. INISIALISASI PERTAMA KALI
        // ================================================================
        loadArsip();
    }

    // ================================================================
    // 15. JALANKAN INIT
    // ================================================================
    init();
});