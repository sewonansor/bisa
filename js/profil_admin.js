/**
 * js/profil_admin.js
 * Modul Admin Profil Publik - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±987
 */

App.register('profil_admin', function() {
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
    if (window.__profilAdminLoaded) return;
    window.__profilAdminLoaded = true;

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
            // Profil list container
            'profil-list',
            // Modal profil
            'profil-modal', 'modal-content', 'modal-title', 'profil-form', 'modal-close',
            // Upload foto
            'upload-foto-form', 'foto-key', 'foto-file', 'foto-preview-container', 'foto-preview',
            // Struktur pengurus
            'struktur-table-body', 'struktur-skeleton', 'add-struktur-btn',
            'struktur-modal', 'struktur-modal-content', 'struktur-modal-title',
            'struktur-form', 'struktur-modal-close',
            'struktur-id', 'struktur_jabatan', 'struktur_nama', 'struktur_foto', 'struktur_urutan',
            // Diagram
            'diagram-container', 'add-node-btn', 'add-connection-btn', 'save-diagram-btn', 'clear-diagram-btn',
            'node-edit-modal', 'node-edit-content', 'node-edit-form', 'node-edit-id', 'node-edit-text', 'node-edit-close',
            // Posisi foto
            'new-posisi-input', 'add-posisi-btn', 'posisi-list-container',
            // Tab buttons
            'tab-btn', 'tab-sejarah', 'tab-struktur', 'tab-diagram',
            // Sejarah & Visi Misi
            'sejarah_content', 'visi_misi_content', 'save-profil-btn',
            // Refresh
            'refresh-profil-btn'
        ];

        const els = await waitForElements(requiredIds);

        // Destructure elements dengan aman (beberapa mungkin tidak ada, gunakan fallback)
        const {
            'profil-list': profilList,
            'profil-modal': profilModal,
            'modal-content': profilModalContent,
            'modal-title': profilModalTitle,
            'profil-form': profilForm,
            'modal-close': profilCloseBtn,
            'upload-foto-form': fotoForm,
            'foto-key': fotoKeySelect,
            'foto-file': fotoFileInput,
            'foto-preview-container': fotoPreviewContainer,
            'foto-preview': fotoPreview,
            'struktur-table-body': strukturTable,
            'struktur-skeleton': strukturSkeleton,
            'add-struktur-btn': addStrukturBtn,
            'struktur-modal': strukturModal,
            'struktur-modal-content': strukturModalContent,
            'struktur-modal-title': strukturModalTitle,
            'struktur-form': strukturForm,
            'struktur-modal-close': strukturCloseBtn,
            'struktur-id': strukturId,
            'struktur_jabatan': strukturJabatan,
            'struktur_nama': strukturNama,
            'struktur_foto': strukturFoto,
            'struktur_urutan': strukturUrutan,
            'diagram-container': diagramContainer,
            'add-node-btn': addNodeBtn,
            'add-connection-btn': addConnectionBtn,
            'save-diagram-btn': saveDiagramBtn,
            'clear-diagram-btn': clearDiagramBtn,
            'node-edit-modal': nodeEditModal,
            'node-edit-content': nodeEditContent,
            'node-edit-form': nodeEditForm,
            'node-edit-id': nodeEditId,
            'node-edit-text': nodeEditText,
            'node-edit-close': nodeEditClose,
            'new-posisi-input': newPosisiInput,
            'add-posisi-btn': addPosisiBtn,
            'posisi-list-container': posisiListContainer,
            'tab-btn': tabBtns, // NodeList, perhatikan
            'tab-sejarah': tabSejarah,
            'tab-struktur': tabStruktur,
            'tab-diagram': tabDiagram,
            'sejarah_content': sejarahContent,
            'visi_misi_content': visiMisiContent,
            'save-profil-btn': saveProfilBtn,
            'refresh-profil-btn': refreshBtn
        } = els;

        // Tab buttons mungkin tidak terdeteksi dengan ID, gunakan class
        const allTabBtns = document.querySelectorAll('.tab-btn');

        // ================================================================
        // 5. STATE
        // ================================================================
        let profilCache = [];      // untuk daftar profil (key, content)
        let strukturCache = [];    // untuk daftar pengurus
        let fotoPositions = [];    // posisi foto
        let isEditProfil = false;
        let isEditStruktur = false;

        // Diagram state
        let instance = null;
        let nodeCounter = 0;
        let connectionMode = false;
        let sourceNodeId = null;

        // ================================================================
        // 6. LOAD PROFIL (Stale-While-Revalidate)
        // ================================================================
        async function loadProfil(force = false) {
            if (profilCache.length > 0 && !force) {
                renderProfil(profilCache);
                fetchProfilBackground();
                return;
            }
            // Tampilkan loading
            if (profilList) profilList.innerHTML = '<p class="text-gray-500">Memuat data...</p>';
            try {
                const result = await forceRefreshData('getProfil', {});
                if (result.success) {
                    profilCache = result.data || [];
                    renderProfil(profilCache);
                } else {
                    if (profilList) profilList.innerHTML = `<p class="text-red-500">${result.message || 'Gagal memuat data'}</p>`;
                }
            } catch (error) {
                if (profilList) profilList.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
            }
        }

        async function fetchProfilBackground() {
            try {
                const result = await forceRefreshData('getProfil', {});
                if (result.success) {
                    profilCache = result.data || [];
                    renderProfil(profilCache);
                }
            } catch (e) {
                console.warn('Background refresh profil gagal:', e);
            }
        }

        function renderProfil(data) {
            if (!profilList) return;
            if (!data || data.length === 0) {
                profilList.innerHTML = `
                    <p class="text-gray-500">Belum ada data profil. Tambahkan dari tombol di bawah.</p>
                    <button onclick="tambahProfil()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg mt-4">Tambah Profil</button>
                `;
                return;
            }
            let html = '';
            data.forEach(item => {
                html += `
                    <div class="bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-white/30 flex justify-between items-center mb-3">
                        <div>
                            <h3 class="font-bold text-gray-800 font-amiri">${item.key}</h3>
                            <p class="text-sm text-gray-600 truncate max-w-md">${item.content ? item.content.substring(0, 100) : '-'}</p>
                            <p class="text-xs text-gray-400">Diperbarui: ${formatDate(item.updated_at)}</p>
                        </div>
                        <div>
                            <button onclick="editProfil('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteProfil('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
            });
            html += `
                <div class="text-center mt-4">
                    <button onclick="tambahProfil()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg">Tambah Profil Baru</button>
                </div>
            `;
            profilList.innerHTML = html;
        }

        // ================================================================
        // 7. CRUD PROFIL (Modal Cepat)
        // ================================================================
        window.tambahProfil = function() {
            isEditProfil = false;
            if (profilModalTitle) profilModalTitle.textContent = 'Tambah Profil';
            if (profilForm) profilForm.reset();
            const idField = document.getElementById('profil-id');
            if (idField) idField.value = '';
            openProfilModal();
        };

        window.editProfil = function(id) {
            const item = profilCache.find(p => p.id === id);
            if (!item) {
                showToast('Profil tidak ditemukan di cache', 'warning');
                if (profilCache.length === 0) {
                    loadProfil(true).then(() => {
                        const retry = profilCache.find(p => p.id === id);
                        if (retry) fillEditProfil(retry);
                    });
                }
                return;
            }
            fillEditProfil(item);
        };

        function fillEditProfil(item) {
            isEditProfil = true;
            if (profilModalTitle) profilModalTitle.textContent = 'Edit Profil';
            const idField = document.getElementById('profil-id');
            if (idField) idField.value = item.id;
            const keyField = document.getElementById('profil-key');
            if (keyField) keyField.value = item.key;
            const contentField = document.getElementById('profil-content');
            if (contentField) contentField.value = item.content;
            openProfilModal();
        }

        window.deleteProfil = function(id) {
            showConfirm('Apakah Anda yakin ingin menghapus profil ini?', async () => {
                const result = await apiCall('deleteProfil', 'POST', { id });
                if (result.success) {
                    profilCache = profilCache.filter(p => p.id !== id);
                    renderProfil(profilCache);
                    await logActivity('DELETE', 'profil', id, 'Menghapus key profil');
                    showToast('Profil berhasil dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // Modal functions
        function openProfilModal() {
            if (!profilModal) return;
            profilModal.classList.remove('hidden');
            profilModal.classList.add('flex');
            if (profilModalContent) {
                profilModalContent.classList.remove('scale-95', 'opacity-0');
                profilModalContent.classList.add('scale-100', 'opacity-100');
            }
        }

        function closeProfilModal() {
            if (!profilModal || !profilModalContent) return;
            profilModalContent.classList.remove('scale-100', 'opacity-100');
            profilModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                profilModal.classList.add('hidden');
                profilModal.classList.remove('flex');
            }, 150);
        }

        if (profilCloseBtn) profilCloseBtn.addEventListener('click', closeProfilModal);
        if (profilModal) {
            profilModal.addEventListener('click', (e) => {
                if (e.target === profilModal) closeProfilModal();
            });
        }

        // Submit profil form
        if (profilForm) {
            profilForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = profilForm.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                const idField = document.getElementById('profil-id');
                const id = idField ? idField.value : '';
                const keyField = document.getElementById('profil-key');
                const contentField = document.getElementById('profil-content');
                const key = keyField ? keyField.value : '';
                const content = contentField ? contentField.value : '';
                const data = { key, content };

                try {
                    let result;
                    if (isEditProfil) {
                        result = await apiCall('updateProfil', 'POST', { id, ...data });
                    } else {
                        result = await apiCall('createProfil', 'POST', data);
                    }
                    if (result.success) {
                        // Update cache lokal
                        if (isEditProfil) {
                            const index = profilCache.findIndex(p => p.id === id);
                            if (index !== -1) profilCache[index] = { ...profilCache[index], ...data, id: id };
                        } else {
                            profilCache.push({ ...data, id: result.id, updated_at: new Date().toISOString() });
                        }
                        renderProfil(profilCache);
                        closeProfilModal();
                        if (profilForm) profilForm.reset();
                        await logActivity(isEditProfil ? 'UPDATE' : 'CREATE', 'profil', result.id || id, `Key: ${data.key}`);
                        showToast('Profil berhasil disimpan!', 'success');
                    } else {
                        showToast(result.message || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                }
            });
        }

        // ================================================================
        // 8. LOAD PROFIL TEKS (Sejarah & Visi Misi)
        // ================================================================
        async function loadProfilText() {
            try {
                const result = await forceRefreshData('getProfil', {});
                if (result.success && result.data) {
                    const map = {};
                    result.data.forEach(i => { map[i.key] = i.content; });
                    if (sejarahContent) sejarahContent.value = map['sejarah'] || '';
                    if (visiMisiContent) visiMisiContent.value = map['visi_misi'] || '';
                }
            } catch (e) {
                console.error('Error load profil text:', e);
            }
        }

        // Save sejarah & visi misi
        if (saveProfilBtn) {
            saveProfilBtn.addEventListener('click', async function() {
                const sejarah = sejarahContent ? sejarahContent.value.trim() : '';
                const visi_misi = visiMisiContent ? visiMisiContent.value.trim() : '';
                await apiCall('updateProfil', 'POST', { key: 'sejarah', content: sejarah });
                await apiCall('updateProfil', 'POST', { key: 'visi_misi', content: visi_misi });
                await logActivity('UPDATE', 'profil_teks', null, 'Memperbarui Sejarah & Visi Misi');
                showToast('Sejarah & Visi Misi berhasil disimpan!', 'success');
            });
        }

        // ================================================================
        // 9. LOAD STRUKTUR PENGURUS (Stale-While-Revalidate)
        // ================================================================
        async function loadStruktur(force = false) {
            if (strukturCache.length > 0 && !force) {
                renderStruktur(strukturCache);
                fetchStrukturBackground();
                return;
            }

            if (strukturSkeleton) strukturSkeleton.classList.remove('hidden');
            if (strukturTable) strukturTable.innerHTML = '';

            try {
                const result = await forceRefreshData('getStruktur', {});
                if (strukturSkeleton) strukturSkeleton.classList.add('hidden');
                if (result.success && result.data.length > 0) {
                    strukturCache = result.data;
                    renderStruktur(strukturCache);
                } else if (result.success) {
                    strukturCache = [];
                    strukturTable.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-[var(--text-muted)]">Belum ada data pengurus.</td></tr>`;
                } else {
                    strukturTable.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                if (strukturSkeleton) strukturSkeleton.classList.add('hidden');
                strukturTable.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchStrukturBackground() {
            try {
                const result = await forceRefreshData('getStruktur', {});
                if (result.success) {
                    strukturCache = result.data || [];
                    renderStruktur(strukturCache);
                }
            } catch (e) {
                console.warn('Background refresh struktur gagal:', e);
            }
        }

        function renderStruktur(data) {
            if (!strukturTable) return;
            let html = '';
            data.forEach((item, idx) => {
                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4"><img src="${item.foto_url || 'https://i.pravatar.cc/100?img=' + idx}" class="w-10 h-10 rounded-full object-cover"></td>
                        <td class="px-6 py-4 text-sm font-bold text-[var(--text-main)]">${item.jabatan}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.nama || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editStruktur('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteStruktur('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            strukturTable.innerHTML = html;
        }

        // CRUD Struktur
        window.editStruktur = function(id) {
            const item = strukturCache.find(d => d.id === id);
            if (!item) {
                showToast('Pengurus tidak ditemukan di cache', 'warning');
                if (strukturCache.length === 0) {
                    loadStruktur(true).then(() => {
                        const retry = strukturCache.find(d => d.id === id);
                        if (retry) fillEditStruktur(retry);
                    });
                }
                return;
            }
            fillEditStruktur(item);
        };

        function fillEditStruktur(item) {
            isEditStruktur = true;
            if (strukturModalTitle) strukturModalTitle.textContent = 'Edit Pengurus';
            if (strukturId) strukturId.value = item.id;
            if (strukturJabatan) strukturJabatan.value = item.jabatan;
            if (strukturNama) strukturNama.value = item.nama;
            if (strukturFoto) strukturFoto.value = item.foto_url || '';
            if (strukturUrutan) strukturUrutan.value = item.urutan || 0;
            openStrukturModal();
        }

        window.deleteStruktur = function(id) {
            showConfirm('Hapus pengurus ini?', async () => {
                const result = await apiCall('deleteStruktur', 'POST', { id });
                if (result.success) {
                    strukturCache = strukturCache.filter(s => s.id !== id);
                    renderStruktur(strukturCache);
                    await logActivity('DELETE', 'struktur_organisasi', id, 'Menghapus pengurus');
                    showToast('Pengurus berhasil dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // Modal struktur
        function openStrukturModal() {
            if (!strukturModal) return;
            strukturModal.classList.remove('hidden');
            strukturModal.classList.add('flex');
            if (strukturModalContent) {
                strukturModalContent.classList.remove('scale-95', 'opacity-0');
                strukturModalContent.classList.add('scale-100', 'opacity-100');
            }
        }

        function closeStrukturModal() {
            if (!strukturModal || !strukturModalContent) return;
            strukturModalContent.classList.remove('scale-100', 'opacity-100');
            strukturModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                strukturModal.classList.add('hidden');
                strukturModal.classList.remove('flex');
            }, 150);
        }

        if (strukturCloseBtn) strukturCloseBtn.addEventListener('click', closeStrukturModal);
        if (strukturModal) {
            strukturModal.addEventListener('click', (e) => {
                if (e.target === strukturModal) closeStrukturModal();
            });
        }

        if (addStrukturBtn) {
            addStrukturBtn.addEventListener('click', () => {
                isEditStruktur = false;
                if (strukturModalTitle) strukturModalTitle.textContent = 'Tambah Pengurus';
                if (strukturForm) strukturForm.reset();
                if (strukturId) strukturId.value = '';
                openStrukturModal();
            });
        }

        if (strukturForm) {
            strukturForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = strukturForm.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                const data = {
                    jabatan: strukturJabatan ? strukturJabatan.value : '',
                    nama: strukturNama ? strukturNama.value : '',
                    foto_url: strukturFoto ? strukturFoto.value : '',
                    urutan: strukturUrutan ? parseInt(strukturUrutan.value) || 0 : 0
                };
                const id = strukturId ? strukturId.value : '';
                const action = isEditStruktur ? 'updateStruktur' : 'createStruktur';
                const payload = isEditStruktur ? { id, ...data } : data;

                try {
                    const result = await apiCall(action, 'POST', payload);
                    if (result.success) {
                        if (isEditStruktur) {
                            const index = strukturCache.findIndex(s => s.id === id);
                            if (index !== -1) strukturCache[index] = { ...strukturCache[index], ...data, id: id };
                        } else {
                            strukturCache.push({ ...data, id: result.id });
                        }
                        renderStruktur(strukturCache);
                        closeStrukturModal();
                        await logActivity(isEditStruktur ? 'UPDATE' : 'CREATE', 'struktur_organisasi', result.id || id, `Jabatan: ${data.jabatan}`);
                        showToast('Data pengurus berhasil disimpan!', 'success');
                    } else {
                        showToast(result.message || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                }
            });
        }

        // ================================================================
        // 10. FOTO POSISI (CUSTOM CRUD)
        // ================================================================
        async function loadFotoPositions() {
            const res = await apiCall('getPhotoPositions', 'POST', {});
            if (res.success && Array.isArray(res.data)) {
                fotoPositions = res.data;
                updatePosisiUI();
                updateFotoKeySelect();
            } else {
                if (posisiListContainer) posisiListContainer.innerHTML = `<span class="text-red-500 text-sm">Gagal memuat posisi.</span>`;
            }
        }

        function updatePosisiUI() {
            if (!posisiListContainer) return;
            if (fotoPositions.length === 0) {
                posisiListContainer.innerHTML = `<span class="text-[var(--text-muted)] text-sm">Belum ada posisi. Tambahkan posisi baru di atas.</span>`;
                return;
            }
            posisiListContainer.innerHTML = fotoPositions.map((pos, idx) => `
                <div class="flex items-center gap-2 bg-[var(--bg-stats)] px-3 py-2 rounded-lg border border-[var(--card-border)] shadow-sm transition hover:shadow-md">
                    <span class="text-sm font-medium text-[var(--text-main)]">${pos}</span>
                    <button onclick="editPosisi('${pos}', ${idx})" class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 transition"><i class="fas fa-pen"></i></button>
                    <button onclick="deletePosisi(${idx})" class="text-red-600 hover:text-red-800 text-xs px-2 py-1 transition"><i class="fas fa-times"></i></button>
                </div>
            `).join('');
        }

        function updateFotoKeySelect() {
            if (!fotoKeySelect) return;
            fotoKeySelect.innerHTML = '';
            fotoPositions.forEach(pos => {
                const opt = document.createElement('option');
                opt.value = `foto_${pos.toLowerCase().replace(/\s+/g, '_')}`;
                opt.textContent = pos;
                fotoKeySelect.appendChild(opt);
            });
        }

        // Handler Edit & Delete (global scope)
        window.editPosisi = function(oldName, idx) {
            if (!newPosisiInput || !addPosisiBtn) return;
            newPosisiInput.value = oldName;
            newPosisiInput.focus();
            addPosisiBtn.innerHTML = `<i class="fas fa-save"></i> Update Posisi`;
            addPosisiBtn.onclick = async function() {
                const newName = newPosisiInput.value.trim();
                if (newName && newName !== oldName) {
                    if (fotoPositions.includes(newName) && newName !== oldName) {
                        showToast('Nama posisi sudah ada!', 'warning');
                        return;
                    }
                    fotoPositions[idx] = newName;
                    await savePosisi();
                } else if (!newName) {
                    showToast('Nama tidak boleh kosong!', 'warning');
                } else {
                    showToast('Nama tidak ada perubahan.', 'info');
                    resetPosisiButton();
                }
            };
        };

        window.deletePosisi = async function(idx) {
            showConfirm(`Hapus posisi "${fotoPositions[idx]}"?`, async () => {
                fotoPositions.splice(idx, 1);
                await savePosisi();
            });
        };

        function resetPosisiButton() {
            if (!addPosisiBtn) return;
            addPosisiBtn.innerHTML = `<i class="fas fa-plus"></i> Tambah Posisi`;
            addPosisiBtn.onclick = addPosisiHandler;
            if (newPosisiInput) newPosisiInput.value = '';
        }

        const addPosisiHandler = async function() {
            if (!newPosisiInput) return;
            const val = newPosisiInput.value.trim();
            if (!val) return showToast('Nama posisi tidak boleh kosong!', 'warning');
            if (fotoPositions.includes(val)) return showToast('Posisi sudah ada!', 'warning');
            fotoPositions.push(val);
            await savePosisi();
            newPosisiInput.value = '';
        };

        if (addPosisiBtn) {
            addPosisiBtn.onclick = addPosisiHandler;
        }

        async function savePosisi() {
            const res = await apiCall('updatePhotoPositions', 'POST', { positions: fotoPositions });
            if (res.success) {
                showToast('Posisi foto berhasil diperbarui!', 'success');
                updatePosisiUI();
                updateFotoKeySelect();
                resetPosisiButton();
            } else {
                showToast('Gagal memperbarui posisi.', 'error');
            }
        }

        // ================================================================
        // 11. UPLOAD FOTO PENGURUS
        // ================================================================
        if (fotoForm) {
            fotoForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const key = fotoKeySelect ? fotoKeySelect.value : '';
                const file = fotoFileInput ? fotoFileInput.files[0] : null;
                if (!file) {
                    showToast('Pilih file foto terlebih dahulu.', 'warning');
                    return;
                }
                const uploadResult = await uploadFileToDrive(file);
                if (!uploadResult.success) {
                    showToast('Gagal upload file: ' + (uploadResult.message || ''), 'error');
                    return;
                }
                const url = uploadResult.url;
                const result = await apiCall('updateProfil', 'POST', { key, content: url });
                if (result.success) {
                    await logActivity('UPLOAD', 'profil_foto', null, `Foto untuk posisi: ${key}`);
                    showToast('Foto berhasil disimpan!', 'success');
                    loadProfil();
                    if (fotoForm) fotoForm.reset();
                    if (fotoPreviewContainer) fotoPreviewContainer.classList.add('hidden');
                } else {
                    showToast('Gagal menyimpan foto: ' + (result.message || ''), 'error');
                }
            });
        }

        // Preview foto
        if (fotoFileInput) {
            fotoFileInput.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        if (fotoPreview) fotoPreview.src = e.target.result;
                        if (fotoPreviewContainer) fotoPreviewContainer.classList.remove('hidden');
                    };
                    reader.readAsDataURL(file);
                } else {
                    if (fotoPreviewContainer) fotoPreviewContainer.classList.add('hidden');
                }
            });
        }

        // ================================================================
        // 12. DIAGRAM STRUKTUR (jsPlumb)
        // ================================================================
        const hasJsPlumb = typeof jsPlumb !== 'undefined';
        const hasInteract = typeof interact !== 'undefined';

        function initJsPlumb() {
            if (instance) {
                instance.reset();
            }
            if (!hasJsPlumb) {
                console.debug('jsPlumb tidak ditemukan. Diagram tidak akan berfungsi.');
                return;
            }
            instance = jsPlumb.getInstance({
                Connector: ["Straight", { gap: 5 }],
                PaintStyle: { strokeWidth: 2, stroke: "#0f2922" },
                HoverPaintStyle: { strokeWidth: 3, stroke: "#fbbf24" },
                Endpoint: ["Rectangle", { width: 12, height: 12 }],
                EndpointStyle: { fill: "#0f2922" },
                Anchors: ["Right", "Left", "Top", "Bottom"],
                Container: diagramContainer
            });
            instance.setContainer(diagramContainer);
        }

        function createNode(x, y, label = "Kotak Baru", id = null) {
            if (!diagramContainer) return;
            if (!id) {
                nodeCounter++;
                id = `node-${nodeCounter}`;
            }
            const node = document.createElement('div');
            node.id = id;
            node.className = 'node-box';
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            node.style.width = '140px';
            node.style.height = '60px';

            const textSpan = document.createElement('span');
            textSpan.className = 'node-text';
            textSpan.textContent = label;
            textSpan.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                openEditNode(id);
            });

            const actions = document.createElement('div');
            actions.className = 'node-actions';
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.innerHTML = '<i class="fas fa-pen"></i>';
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                openEditNode(id);
            });
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteNode(id);
            });
            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.dataset.nodeId = id;
            node.appendChild(resizeHandle);

            node.appendChild(textSpan);
            node.appendChild(actions);

            diagramContainer.appendChild(node);

            if (instance) {
                instance.addEndpoint(id, { anchor: "Right", uuid: id + "-right" });
                instance.addEndpoint(id, { anchor: "Left", uuid: id + "-left" });
                instance.addEndpoint(id, { anchor: "Top", uuid: id + "-top" });
                instance.addEndpoint(id, { anchor: "Bottom", uuid: id + "-bottom" });

                if (hasInteract) {
                    interact(node).draggable({
                        listeners: {
                            move: function(event) {
                                const target = event.target;
                                const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                                const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                                target.style.transform = `translate(${x}px, ${y}px)`;
                                target.setAttribute('data-x', x);
                                target.setAttribute('data-y', y);
                                if (instance) instance.repaint(target);
                            }
                        },
                        modifiers: [
                            interact.modifiers.restrictRect({
                                restriction: diagramContainer.getBoundingClientRect(),
                                endOnly: true
                            })
                        ],
                        inertia: true
                    });

                    interact(resizeHandle).draggable({
                        listeners: {
                            move: function(event) {
                                const target = event.target.closest('.node-box');
                                const dx = event.dx;
                                const dy = event.dy;
                                const newWidth = Math.max(120, target.offsetWidth + dx);
                                const newHeight = Math.max(50, target.offsetHeight + dy);
                                target.style.width = newWidth + 'px';
                                target.style.height = newHeight + 'px';
                                if (instance) instance.repaint(target);
                            }
                        },
                        modifiers: [
                            interact.modifiers.restrictRect({
                                restriction: diagramContainer.getBoundingClientRect(),
                                endOnly: true
                            })
                        ],
                        inertia: true
                    });
                }
            }

            const rect = node.getBoundingClientRect();
            const containerRect = diagramContainer.getBoundingClientRect();
            node.dataset.x = rect.left - containerRect.left;
            node.dataset.y = rect.top - containerRect.top;

            return node;
        }

        function deleteNode(id) {
            showConfirm('Hapus kotak ini?', () => {
                const node = document.getElementById(id);
                if (node) {
                    if (instance) instance.deleteConnectionsForElement(id);
                    node.remove();
                }
            });
        }

        function openEditNode(id) {
            const node = document.getElementById(id);
            if (!node) return;
            const textSpan = node.querySelector('.node-text');
            if (nodeEditId) nodeEditId.value = id;
            if (nodeEditText) nodeEditText.value = textSpan.textContent;
            if (nodeEditModal) {
                nodeEditModal.classList.remove('hidden');
                nodeEditModal.classList.add('flex');
                if (nodeEditContent) {
                    nodeEditContent.classList.remove('scale-95', 'opacity-0');
                    nodeEditContent.classList.add('scale-100', 'opacity-100');
                }
            }
        }

        function closeNodeEdit() {
            if (!nodeEditModal || !nodeEditContent) return;
            nodeEditContent.classList.remove('scale-100', 'opacity-100');
            nodeEditContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                nodeEditModal.classList.add('hidden');
                nodeEditModal.classList.remove('flex');
            }, 150);
        }

        if (nodeEditClose) nodeEditClose.addEventListener('click', closeNodeEdit);
        if (nodeEditModal) {
            nodeEditModal.addEventListener('click', (e) => {
                if (e.target === nodeEditModal) closeNodeEdit();
            });
        }

        if (nodeEditForm) {
            nodeEditForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const id = nodeEditId ? nodeEditId.value : '';
                const text = nodeEditText ? nodeEditText.value.trim() : '';
                if (id && text) {
                    const node = document.getElementById(id);
                    if (node) {
                        const textSpan = node.querySelector('.node-text');
                        textSpan.textContent = text;
                    }
                }
                closeNodeEdit();
            });
        }

        if (addNodeBtn) {
            addNodeBtn.addEventListener('click', function() {
                if (!diagramContainer) return;
                const x = 50 + Math.random() * 100;
                const y = 50 + Math.random() * 100;
                createNode(x, y);
            });
        }

        if (addConnectionBtn) {
            addConnectionBtn.addEventListener('click', function() {
                connectionMode = !connectionMode;
                this.classList.toggle('bg-purple-800');
                this.textContent = connectionMode ? 'Batal Sambung' : 'Sambung';
                if (diagramContainer) diagramContainer.style.cursor = connectionMode ? 'crosshair' : 'default';
                if (!connectionMode) {
                    sourceNodeId = null;
                }
            });
        }

        if (diagramContainer) {
            diagramContainer.addEventListener('click', function(e) {
                if (!connectionMode || !instance) return;
                const node = e.target.closest('.node-box');
                if (!node) return;
                const id = node.id;

                if (!sourceNodeId) {
                    sourceNodeId = id;
                    node.style.outline = '2px solid #fbbf24';
                } else {
                    const sourceId = sourceNodeId;
                    const prevNode = document.getElementById(sourceId);
                    if (prevNode) prevNode.style.outline = 'none';
                    if (sourceId !== id) {
                        instance.connect({ uuids: [sourceId + "-bottom", id + "-top"] });
                    }
                    sourceNodeId = null;
                    connectionMode = false;
                    if (addConnectionBtn) {
                        addConnectionBtn.classList.remove('bg-purple-800');
                        addConnectionBtn.textContent = 'Sambung';
                    }
                    if (diagramContainer) diagramContainer.style.cursor = 'default';
                }
            });
        }

        if (saveDiagramBtn) {
            saveDiagramBtn.addEventListener('click', async function() {
                if (!instance) {
                    showToast('Diagram belum diinisialisasi.', 'warning');
                    return;
                }
                const nodes = diagramContainer.querySelectorAll('.node-box');
                const diagramData = [];
                nodes.forEach(node => {
                    const rect = node.getBoundingClientRect();
                    const containerRect = diagramContainer.getBoundingClientRect();
                    const x = rect.left - containerRect.left;
                    const y = rect.top - containerRect.top;
                    const width = node.offsetWidth;
                    const height = node.offsetHeight;
                    const label = node.querySelector('.node-text').textContent;
                    diagramData.push({ id: node.id, x: x, y: y, width: width, height: height, label: label });
                });

                const connections = instance.getConnections();
                const connectionData = connections.map(conn => {
                    return { source: conn.sourceId, target: conn.targetId };
                });

                const payload = { nodes: diagramData, connections: connectionData };
                const result = await apiCall('updateProfil', 'POST', {
                    key: 'struktur_diagram',
                    content: JSON.stringify(payload)
                });

                if (result.success) {
                    await logActivity('UPDATE', 'profil_diagram', null, 'Menyimpan diagram struktur');
                    showToast('Diagram berhasil disimpan!', 'success');
                } else {
                    showToast('Gagal menyimpan diagram: ' + (result.message || ''), 'error');
                }
            });
        }

        if (clearDiagramBtn) {
            clearDiagramBtn.addEventListener('click', function() {
                showConfirm('Hapus semua kotak dan koneksi?', () => {
                    const nodes = diagramContainer.querySelectorAll('.node-box');
                    nodes.forEach(node => {
                        if (instance) instance.deleteConnectionsForElement(node.id);
                        node.remove();
                    });
                    nodeCounter = 0;
                });
            });
        }

        async function loadDiagram() {
            try {
                const result = await apiCall('getProfil', 'POST', {});
                if (result.success) {
                    const item = result.data.find(p => p.key === 'struktur_diagram');
                    if (item && item.content) {
                        const data = JSON.parse(item.content);
                        data.nodes.forEach(nodeData => {
                            createNode(nodeData.x, nodeData.y, nodeData.label, nodeData.id);
                            const node = document.getElementById(nodeData.id);
                            if (node) {
                                node.style.width = nodeData.width + 'px';
                                node.style.height = nodeData.height + 'px';
                            }
                        });
                        if (instance) {
                            data.connections.forEach(conn => {
                                instance.connect({ uuids: [conn.source + "-bottom", conn.target + "-top"] });
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Gagal load diagram:', error);
            }
        }

        // ================================================================
        // 13. TAB LOGIC
        // ================================================================
        if (allTabBtns.length > 0) {
            allTabBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    allTabBtns.forEach(b => {
                        b.classList.remove('active', 'border-[#0f2922]');
                        b.classList.add('text-[var(--text-muted)]');
                    });
                    this.classList.add('active', 'border-[#0f2922]');
                    this.classList.remove('text-[var(--text-muted)]');

                    const target = this.dataset.tab;
                    if (tabSejarah) tabSejarah.classList.toggle('hidden', target !== 'sejarah');
                    if (tabStruktur) tabStruktur.classList.toggle('hidden', target !== 'struktur');
                    if (tabDiagram) tabDiagram.classList.toggle('hidden', target !== 'diagram');
                });
            });
        }

        // ================================================================
        // 14. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                loadProfil();
                loadProfilText();
                loadStruktur();
                loadFotoPositions();
                loadDiagram();
                showToast('Data profil diperbarui!', 'success');
            });
        }

        // ================================================================
        // 15. INISIALISASI PERTAMA KALI
        // ================================================================
        loadProfil();
        loadProfilText();
        loadStruktur();
        loadFotoPositions();

        if (hasJsPlumb && hasInteract && diagramContainer) {
            initJsPlumb();
            loadDiagram();
        } else {
            console.debug('Diagram struktur dilewati karena library jsPlumb/interact belum dimuat.');
        }
    }

    // ================================================================
    // 16. JALANKAN INIT
    // ================================================================
    init();
});