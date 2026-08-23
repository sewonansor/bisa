/**
 * js/anggota_admin.js
 * Modul Admin Anggota & Verifikasi - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±345
 */

App.register('anggota_admin', function() {
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
    if (window.__anggotaAdminLoaded) return;
    window.__anggotaAdminLoaded = true;

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
            'anggota-table-body', 'pending-table-body',
            'anggota-skeleton', 'pending-skeleton',
            'anggota-modal', 'modal-content', 'modal-title',
            'anggota-form', 'modal-close', 'add-anggota-btn', 'refresh-anggota-btn',
            'anggota-id', 'anggota_nama', 'anggota_username', 'anggota_password',
            'anggota_role', 'anggota_alamat', 'anggota_angkatan', 'anggota_riwayat_jabatan',
            'tab-daftar', 'tab-verifikasi', 'tab-btn'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'anggota-table-body': tableBody,
            'pending-table-body': pendingTableBody,
            'anggota-skeleton': anggotaSkeleton,
            'pending-skeleton': pendingSkeleton,
            'anggota-modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'anggota-form': form,
            'modal-close': closeBtn,
            'add-anggota-btn': addBtn,
            'refresh-anggota-btn': refreshBtn,
            'anggota-id': idInput,
            'anggota_nama': namaInput,
            'anggota_username': usernameInput,
            'anggota_password': passwordInput,
            'anggota_role': roleSelect,
            'anggota_alamat': alamatInput,
            'anggota_angkatan': angkatanInput,
            'anggota_riwayat_jabatan': riwayatJabatanInput
        } = els;

        if (!tableBody || !modal || !form) {
            console.error('anggota_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let membersCache = [];   // daftar semua user
        let pendingCache = [];   // daftar pending

        // ================================================================
        // 6. TAB LOGIC
        // ================================================================
        const tabBtns = document.querySelectorAll('.tab-btn');
        if (tabBtns.length > 0) {
            tabBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    tabBtns.forEach(b => {
                        b.classList.remove('active', 'border-[#0f2922]');
                        b.classList.add('text-gray-500');
                    });
                    this.classList.add('active', 'border-[#0f2922]');
                    this.classList.remove('text-gray-500');

                    const target = this.dataset.tab;
                    document.getElementById('tab-daftar').classList.toggle('hidden', target !== 'daftar');
                    document.getElementById('tab-verifikasi').classList.toggle('hidden', target !== 'verifikasi');
                });
            });
        }

        // ================================================================
        // 7. LOAD DATA (Stale-While-Revalidate)
        // ================================================================
        async function loadAnggota(force = false) {
            if (membersCache.length > 0 && !force) {
                renderAnggota(membersCache);
                fetchAnggotaBackground();
                return;
            }

            if (anggotaSkeleton) anggotaSkeleton.classList.remove('hidden');
            tableBody.innerHTML = '';

            try {
                const result = await forceRefreshData('getUsers', {});
                if (anggotaSkeleton) anggotaSkeleton.classList.add('hidden');

                if (result.success && result.data.length > 0) {
                    membersCache = result.data;
                    renderAnggota(membersCache);
                } else if (result.success) {
                    membersCache = [];
                    tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">Belum ada anggota terdaftar</td></tr>`;
                } else {
                    tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                if (anggotaSkeleton) anggotaSkeleton.classList.add('hidden');
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchAnggotaBackground() {
            try {
                const result = await forceRefreshData('getUsers', {});
                if (result.success && result.data) {
                    membersCache = result.data;
                    renderAnggota(membersCache);
                }
            } catch (e) {
                console.warn('Background refresh anggota gagal:', e);
            }
        }

        async function loadPending(force = false) {
            if (pendingCache.length > 0 && !force) {
                renderPending(pendingCache);
                fetchPendingBackground();
                return;
            }

            if (pendingSkeleton) pendingSkeleton.classList.remove('hidden');
            pendingTableBody.innerHTML = '';

            try {
                const result = await forceRefreshData('getPendingUsers', {});
                if (pendingSkeleton) pendingSkeleton.classList.add('hidden');

                if (result.success && result.data.length > 0) {
                    pendingCache = result.data;
                    renderPending(pendingCache);
                } else if (result.success) {
                    pendingCache = [];
                    pendingTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">Tidak ada pendaftar baru yang menunggu.</td></tr>`;
                } else {
                    pendingTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                if (pendingSkeleton) pendingSkeleton.classList.add('hidden');
                pendingTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchPendingBackground() {
            try {
                const result = await forceRefreshData('getPendingUsers', {});
                if (result.success && result.data) {
                    pendingCache = result.data;
                    renderPending(pendingCache);
                }
            } catch (e) {
                console.warn('Background refresh pending gagal:', e);
            }
        }

        // ================================================================
        // 8. RENDER FUNCTIONS
        // ================================================================
        function renderAnggota(data) {
            let html = '';
            data.forEach((u, index) => {
                let statusBadge = '';
                if (u.status === 'approved' || !u.status) {
                    statusBadge = `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Aktif</span>`;
                } else if (u.status === 'pending') {
                    statusBadge = `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Pending</span>`;
                } else if (u.status === 'rejected') {
                    statusBadge = `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Ditolak</span>`;
                }

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${index + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${u.nama || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.username || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">
                                ${u.role === 'admin' ? 'Admin' : 'Member'}
                            </span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.alamat || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.angkatan || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.riwayat_jabatan || '-'}</td>
                        <td class="px-6 py-4 text-sm">${statusBadge}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editAnggota('${u.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteAnggota('${u.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        function renderPending(data) {
            let html = '';
            data.forEach((u, idx) => {
                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${u.nama || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.username || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.no_hp || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${u.kalurahan || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatDate(u.created_at)}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="approveUser('${u.id}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs mr-2">Setujui</button>
                            <button onclick="rejectUser('${u.id}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-xs">Tolak</button>
                        </td>
                    </tr>
                `;
            });
            pendingTableBody.innerHTML = html;
        }

        // ================================================================
        // 9. APPROVE / REJECT (Update Cache Lokal)
        // ================================================================
        window.approveUser = function(id) {
            showConfirm('Setujui pendaftar ini?', async () => {
                const result = await apiCall('approveUser', 'POST', { id });
                if (result.success) {
                    // Update cache lokal
                    pendingCache = pendingCache.filter(u => u.id !== id);
                    const user = membersCache.find(u => u.id === id);
                    if (user) user.status = 'approved';
                    else {
                        // Tambahkan ke membersCache jika belum ada
                        membersCache.push({ id, status: 'approved' });
                    }
                    renderPending(pendingCache);
                    renderAnggota(membersCache);
                    await logActivity('APPROVE', 'anggota', id, 'Menyetujui pendaftaran');
                    showToast('Anggota berhasil disetujui!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyetujui.', 'error');
                }
            });
        };

        window.rejectUser = function(id) {
            showConfirm('Tolak pendaftar ini?', async () => {
                const result = await apiCall('rejectUser', 'POST', { id });
                if (result.success) {
                    pendingCache = pendingCache.filter(u => u.id !== id);
                    const user = membersCache.find(u => u.id === id);
                    if (user) user.status = 'rejected';
                    renderPending(pendingCache);
                    renderAnggota(membersCache);
                    await logActivity('REJECT', 'anggota', id, 'Menolak pendaftaran');
                    showToast('Pendaftar ditolak.', 'info');
                } else {
                    showToast(result.message || 'Gagal menolak.', 'error');
                }
            });
        };

        // ================================================================
        // 10. MODAL FUNCTIONS (Cepat)
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
            passwordInput.value = '';
            passwordInput.placeholder = 'Password (minimal 6 karakter)';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 11. TAMBAH ANGGOTA
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Anggota';
            form.reset();
            idInput.value = '';
            passwordInput.placeholder = 'Password (minimal 6 karakter)';
            passwordInput.value = '';
            openModal();
        });

        // ================================================================
        // 12. EDIT ANGGOTA (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editAnggota = function(id) {
            const anggota = membersCache.find(u => u.id === id);
            if (!anggota) {
                showToast('Anggota tidak ditemukan di cache', 'warning');
                if (membersCache.length === 0) {
                    loadAnggota(true).then(() => {
                        const retry = membersCache.find(u => u.id === id);
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(anggota);
        };

        function fillEditForm(anggota) {
            isEdit = true;
            modalTitle.textContent = 'Edit Anggota';
            idInput.value = anggota.id;
            namaInput.value = anggota.nama || '';
            usernameInput.value = anggota.username || '';
            passwordInput.value = '';
            passwordInput.placeholder = 'Kosongkan jika tidak mengubah password';
            roleSelect.value = anggota.role || 'member';
            alamatInput.value = anggota.alamat || '';
            angkatanInput.value = anggota.angkatan || '';
            riwayatJabatanInput.value = anggota.riwayat_jabatan || '';
            openModal();
        }

        // ================================================================
        // 13. DELETE ANGGOTA (Update Cache Lokal)
        // ================================================================
        window.deleteAnggota = function(id) {
            showConfirm('Apakah Anda yakin ingin menghapus anggota ini?', async () => {
                const result = await apiCall('deleteUser', 'POST', { id });
                if (result.success) {
                    membersCache = membersCache.filter(u => u.id !== id);
                    renderAnggota(membersCache);
                    await logActivity('DELETE', 'anggota', id, 'Menghapus anggota');
                    showToast('Anggota berhasil dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus anggota', 'error');
                }
            });
        };

        // ================================================================
        // 14. SUBMIT FORM (CREATE / UPDATE) - Update Cache Lokal
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            const id = idInput.value;
            const nama = namaInput.value;
            const username = usernameInput.value;
            const password = passwordInput.value;
            const role = roleSelect.value;
            const alamat = alamatInput.value;
            const angkatan = angkatanInput.value;
            const riwayat_jabatan = riwayatJabatanInput.value;

            const data = { nama, username, role, alamat, angkatan, riwayat_jabatan };
            if (password) data.password = password;

            try {
                let result;
                if (isEdit) {
                    result = await apiCall('updateUser', 'POST', { id, ...data });
                } else {
                    result = await apiCall('createUser', 'POST', data);
                }

                if (result.success) {
                    // Update cache lokal
                    if (isEdit) {
                        const index = membersCache.findIndex(u => u.id === id);
                        if (index !== -1) membersCache[index] = { ...membersCache[index], ...data, id: id };
                    } else {
                        // Data baru ditambahkan, backend mengembalikan id
                        const newUser = { ...data, id: result.id, role: role, status: 'approved' };
                        membersCache.unshift(newUser);
                    }

                    renderAnggota(membersCache);
                    closeModal();
                    form.reset();

                    // Audit log
                    const actionType = isEdit ? 'UPDATE' : 'CREATE';
                    const targetId = result.id || id;
                    await logActivity(actionType, 'anggota', targetId, `Username: ${username}`);

                    showToast('Anggota berhasil disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan anggota', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        // ================================================================
        // 15. REFRESH BUTTON (Paksa Fetch)
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await Promise.all([loadAnggota(true), loadPending(true)]);
                showToast('Data anggota diperbarui!', 'success');
            });
        }

        // ================================================================
        // 16. INISIALISASI PERTAMA KALI
        // ================================================================
        loadAnggota();
        loadPending();
    }

    // ================================================================
    // 17. JALANKAN INIT
    // ================================================================
    init();
});