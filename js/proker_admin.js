/**
 * js/proker_admin.js
 * Modul Admin Program Kerja - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±230
 */

App.register('proker_admin', function() {
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
    if (window.__prokerAdminLoaded) return;
    window.__prokerAdminLoaded = true;

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
            'proker-modal', 'modal-content', 'modal-title',
            'form', 'modal-close',
            'add-btn', 'refresh-proker-btn',
            'edit-id', 'proker_nama', 'proker_deskripsi', 'proker_target',
            'proker_progress', 'proker_status', 'proker_pic',
            'total-program', 'total-planning', 'total-ongoing', 'total-selesai'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'table-body': tableBody,
            'proker-modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'form': form,
            'modal-close': closeBtn,
            'add-btn': addBtn,
            'refresh-proker-btn': refreshBtn,
            'edit-id': idInput,
            'proker_nama': namaInput,
            'proker_deskripsi': deskripsiInput,
            'proker_target': targetInput,
            'proker_progress': progressInput,
            'proker_status': statusSelect,
            'proker_pic': picInput,
            'total-program': totalProgramEl,
            'total-planning': totalPlanningEl,
            'total-ongoing': totalOngoingEl,
            'total-selesai': totalSelesaiEl
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('proker_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. LOAD DATA PROGRAM KERJA (Stale-While-Revalidate)
        // ================================================================
        async function loadData(force = false) {
            // Jika sudah ada data, tampilkan dulu lalu refresh background
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                fetchDataBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getProgramKerja', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderTable(dataCache);
                    updateStats(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-muted">Belum ada program kerja</td></tr>';
                    updateStats([]);
                } else {
                    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getProgramKerja', {});
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
                const progress = Math.min(Math.max(Number(item.progress) || 0, 0), 100);
                const barColor = progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-yellow-500';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.nama_program || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)] truncate max-w-xs">${item.deskripsi || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatDate(item.target_selesai)}</td>
                        <td class="px-6 py-4 text-sm">
                            <div class="flex items-center gap-2">
                                <div class="progress-bar flex-1">
                                    <div class="progress-fill ${barColor}" style="width: ${progress}%"></div>
                                </div>
                                <span class="text-xs font-medium">${progress}%</span>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'planning' ? 'bg-yellow-100 text-yellow-700' : item.status === 'ongoing' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">
                                ${item.status === 'planning' ? 'Planning' : item.status === 'ongoing' ? 'Ongoing' : 'Selesai'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.pic || '-'}</td>
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
            let totalProgram = data.length;
            let totalPlanning = 0, totalOngoing = 0, totalSelesai = 0;
            data.forEach(item => {
                if (item.status === 'planning') totalPlanning++;
                else if (item.status === 'ongoing') totalOngoing++;
                else if (item.status === 'selesai') totalSelesai++;
            });
            totalProgramEl.textContent = totalProgram;
            totalPlanningEl.textContent = totalPlanning;
            totalOngoingEl.textContent = totalOngoing;
            totalSelesaiEl.textContent = totalSelesai;
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
            progressInput.value = '0';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 9. TAMBAH PROGRAM
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Program Kerja';
            form.reset();
            idInput.value = '';
            progressInput.value = '0';
            openModal();
        });

        // ================================================================
        // 10. EDIT PROGRAM (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editItem = function(id) {
            const item = dataCache.find(d => d.id === id);
            if (!item) {
                showToast('Program tidak ditemukan di cache', 'warning');
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
            modalTitle.textContent = 'Edit Program Kerja';
            idInput.value = item.id;
            namaInput.value = item.nama_program || '';
            deskripsiInput.value = item.deskripsi || '';
            targetInput.value = item.target_selesai || '';
            progressInput.value = item.progress || 0;
            statusSelect.value = item.status || 'planning';
            picInput.value = item.pic || '';
            openModal();
        }

        // ================================================================
        // 11. DELETE PROGRAM (Update Cache Lokal)
        // ================================================================
        window.deleteItem = function(id) {
            showConfirm('Hapus program kerja ini?', async () => {
                const result = await apiCall('deleteProgramKerja', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    updateStats(dataCache);
                    showToast('Program dihapus!', 'success');
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
                nama_program: namaInput.value,
                deskripsi: deskripsiInput.value,
                target_selesai: targetInput.value,
                progress: Number(progressInput.value) || 0,
                status: statusSelect.value,
                pic: picInput.value
            };

            const id = idInput.value;
            const action = isEdit ? 'updateProgramKerja' : 'createProgramKerja';
            const payload = isEdit ? { id, ...data } : data;

            try {
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
                    closeModal();
                    form.reset();
                    showToast('Program disimpan!', 'success');
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