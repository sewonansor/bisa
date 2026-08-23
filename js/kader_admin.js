/**
 * js/kader_admin.js
 * Modul Admin Database Kader & Masa Bakti - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±345
 */

App.register('kader_admin', function() {
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
    if (window.__kaderAdminLoaded) return;
    window.__kaderAdminLoaded = true;

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
            'kader-modal', 'modal-content',
            'kader-form', 'modal-close',
            'refresh-kader-btn',
            'edit-id', 'kader_nama', 'kader_username', 'kader_role',
            'kader_alamat', 'kader_angkatan', 'kader_riwayat_jabatan',
            'total-anggota', 'total-admin', 'total-member', 'angkatan-terbanyak'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'table-body': tableBody,
            'kader-modal': modal,
            'modal-content': modalContent,
            'kader-form': form,
            'modal-close': closeBtn,
            'refresh-kader-btn': refreshBtn,
            'edit-id': idInput,
            'kader_nama': namaInput,
            'kader_username': usernameInput,
            'kader_role': roleSelect,
            'kader_alamat': alamatInput,
            'kader_angkatan': angkatanInput,
            'kader_riwayat_jabatan': riwayatJabatanInput,
            'total-anggota': totalAnggotaEl,
            'total-admin': totalAdminEl,
            'total-member': totalMemberEl,
            'angkatan-terbanyak': angkatanTerbanyakEl
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('kader_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let dataCache = [];

        // ================================================================
        // 6. LOAD DATA KADER (Stale-While-Revalidate)
        // ================================================================
        async function loadKader(force = false) {
            if (dataCache.length > 0 && !force) {
                renderKader(dataCache);
                fetchDataBackground();
                return;
            }

            // Tampilkan skeleton / loading
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';

            try {
                const result = await forceRefreshData('getUsers', {});
                if (result.success && result.data.length > 0) {
                    dataCache = result.data;
                    renderKader(dataCache);
                } else if (result.success) {
                    dataCache = [];
                    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-[var(--text-muted)]">Belum ada data kader</td></tr>`;
                    totalAnggotaEl.textContent = '0';
                    totalAdminEl.textContent = '0';
                    totalMemberEl.textContent = '0';
                    angkatanTerbanyakEl.textContent = '-';
                } else {
                    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchDataBackground() {
            try {
                const result = await forceRefreshData('getUsers', {});
                if (result.success && result.data) {
                    dataCache = result.data;
                    renderKader(dataCache);
                }
            } catch (e) {
                console.warn('Background refresh kader gagal:', e);
            }
        }

        // ================================================================
        // 7. RENDER TABLE KADER & STATISTIK
        // ================================================================
        function renderKader(data) {
            let html = '';
            let totalAnggota = data.length;
            let totalAdmin = 0, totalMember = 0;
            const angkatanMap = {};

            data.forEach((u, idx) => {
                if (u.role === 'admin') totalAdmin++;
                else totalMember++;

                const angkatan = u.angkatan || '-';
                angkatanMap[angkatan] = (angkatanMap[angkatan] || 0) + 1;

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${u.nama || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.username}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">
                                ${u.role === 'admin' ? 'Admin' : 'Member'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.alamat || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${angkatan}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.riwayat_jabatan || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editKader('${u.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteKader('${u.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });

            tableBody.innerHTML = html;

            // Statistik
            totalAnggotaEl.textContent = totalAnggota;
            totalAdminEl.textContent = totalAdmin;
            totalMemberEl.textContent = totalMember;

            // Angkatan terbanyak
            let maxAngkatan = '-';
            let maxCount = 0;
            for (const [key, count] of Object.entries(angkatanMap)) {
                if (key !== '-' && count > maxCount) {
                    maxCount = count;
                    maxAngkatan = key;
                }
            }
            angkatanTerbanyakEl.textContent = maxAngkatan || '-';
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
        // 9. EDIT KADER (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editKader = function(id) {
            const kader = dataCache.find(u => u.id === id);
            if (!kader) {
                showToast('Kader tidak ditemukan di cache', 'warning');
                if (dataCache.length === 0) {
                    loadKader(true).then(() => {
                        const retry = dataCache.find(u => u.id === id);
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(kader);
        };

        function fillEditForm(kader) {
            isEdit = true;
            idInput.value = kader.id;
            namaInput.value = kader.nama || '';
            usernameInput.value = kader.username || '';
            roleSelect.value = kader.role || 'member';
            alamatInput.value = kader.alamat || '';
            angkatanInput.value = kader.angkatan || '';
            riwayatJabatanInput.value = kader.riwayat_jabatan || '';
            openModal();
        }

        // ================================================================
        // 10. DELETE KADER (Update Cache Lokal)
        // ================================================================
        window.deleteKader = function(id) {
            showConfirm('Apakah Anda yakin ingin menghapus kader ini?', async () => {
                const result = await apiCall('deleteUser', 'POST', { id });
                if (result.success) {
                    dataCache = dataCache.filter(u => u.id !== id);
                    renderKader(dataCache);
                    await logActivity('DELETE', 'kader', id, 'Menghapus kader');
                    showToast('Kader berhasil dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 11. SUBMIT FORM (UPDATE KADER) - Update Cache Lokal
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            const id = idInput.value;
            const data = {
                nama: namaInput.value,
                username: usernameInput.value,
                role: roleSelect.value,
                alamat: alamatInput.value,
                angkatan: angkatanInput.value,
                riwayat_jabatan: riwayatJabatanInput.value
            };

            try {
                const result = await apiCall('updateUser', 'POST', { id, ...data });
                if (result.success) {
                    // Update cache lokal
                    const index = dataCache.findIndex(u => u.id === id);
                    if (index !== -1) dataCache[index] = { ...dataCache[index], ...data, id: id };

                    renderKader(dataCache);
                    closeModal();
                    await logActivity('UPDATE', 'kader', id, `Update kader: ${data.username}`);
                    showToast('Kader berhasil diperbarui!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan data kader', 'error');
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
                await loadKader(true);
                showToast('Data kader diperbarui!', 'success');
            });
        }

        // ================================================================
        // 13. INISIALISASI PERTAMA KALI
        // ================================================================
        loadKader();
    }

    // ================================================================
    // 14. JALANKAN INIT
    // ================================================================
    init();
});