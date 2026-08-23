/**
 * js/inventaris_admin.js
 * Modul Admin Inventaris & Peminjaman - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±523
 */

App.register('inventaris_admin', function() {
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
    if (window.__inventarisAdminLoaded) return;
    window.__inventarisAdminLoaded = true;

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
            'barang-table-body', 'pinjam-table-body',
            'barang-modal', 'barang-modal-content', 'barang-modal-title', 'barang-form',
            'barang-modal-close', 'add-barang-btn', 'refresh-inventaris-btn',
            'barang-id', 'barang_nama', 'barang_jumlah', 'barang_kondisi', 'barang_lokasi',
            'pinjam-modal', 'pinjam-modal-content', 'pinjam-form', 'pinjam-modal-close',
            'add-pinjam-btn', 'pinjam_barang_id', 'pinjam_peminjam', 'pinjam_tanggal', 'pinjam_tanggal_kembali',
            'tab-barang', 'tab-peminjaman', 'total-barang', 'total-baik', 'total-dipinjam', 'total-rusak'
        ];

        const els = await waitForElements(requiredIds);

        // Destructure elements
        const {
            'barang-table-body': barangTable,
            'pinjam-table-body': pinjamTable,
            'barang-modal': barangModal,
            'barang-modal-content': barangModalContent,
            'barang-modal-title': barangModalTitle,
            'barang-form': barangForm,
            'barang-modal-close': barangCloseBtn,
            'add-barang-btn': addBarangBtn,
            'refresh-inventaris-btn': refreshBtn,
            'barang-id': barangId,
            'barang_nama': barangNama,
            'barang_jumlah': barangJumlah,
            'barang_kondisi': barangKondisi,
            'barang_lokasi': barangLokasi,
            'pinjam-modal': pinjamModal,
            'pinjam-modal-content': pinjamModalContent,
            'pinjam-form': pinjamForm,
            'pinjam-modal-close': pinjamCloseBtn,
            'add-pinjam-btn': addPinjamBtn,
            'pinjam_barang_id': pinjamBarangId,
            'pinjam_peminjam': pinjamPeminjam,
            'pinjam_tanggal': pinjamTanggal,
            'pinjam_tanggal_kembali': pinjamTanggalKembali,
            'tab-barang': tabBarang,
            'tab-peminjaman': tabPeminjaman,
            'total-barang': totalBarangEl,
            'total-baik': totalBaikEl,
            'total-dipinjam': totalDipinjamEl,
            'total-rusak': totalRusakEl
        } = els;

        if (!barangTable || !pinjamTable || !barangModal || !pinjamModal) {
            console.error('inventaris_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEditBarang = false;
        let barangCache = [];
        let pinjamCache = [];

        // ================================================================
        // 6. TAB LOGIC
        // ================================================================
        function activateTab(tabName) {
            if (tabName === 'barang') {
                tabBarang.classList.remove('hidden');
                tabPeminjaman.classList.add('hidden');
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active', 'border-[var(--text-main)]');
                    btn.classList.add('text-[var(--text-muted)]');
                });
                const barangBtn = document.querySelector('.tab-btn[data-tab="barang"]');
                if (barangBtn) {
                    barangBtn.classList.add('active', 'border-[var(--text-main)]');
                    barangBtn.classList.remove('text-[var(--text-muted)]');
                }
            } else {
                tabBarang.classList.add('hidden');
                tabPeminjaman.classList.remove('hidden');
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active', 'border-[var(--text-main)]');
                    btn.classList.add('text-[var(--text-muted)]');
                });
                const pinjamBtn = document.querySelector('.tab-btn[data-tab="peminjaman"]');
                if (pinjamBtn) {
                    pinjamBtn.classList.add('active', 'border-[var(--text-main)]');
                    pinjamBtn.classList.remove('text-[var(--text-muted)]');
                }
                loadPeminjaman();
            }
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                activateTab(this.dataset.tab);
            });
        });

        // ================================================================
        // 7. LOAD DATA BARANG (Stale-While-Revalidate)
        // ================================================================
        async function loadBarang(force = false) {
            if (barangCache.length > 0 && !force) {
                renderBarangTable(barangCache);
                fetchBarangBackground();
                return;
            }

            barangTable.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const result = await forceRefreshData('getInventaris', {});
                if (result.success && result.data.length > 0) {
                    barangCache = result.data;
                    renderBarangTable(barangCache);
                } else if (result.success) {
                    barangCache = [];
                    barangTable.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-muted">Belum ada barang</td></tr>';
                    updateStats(0, 0, 0);
                } else {
                    barangTable.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                barangTable.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchBarangBackground() {
            try {
                const result = await forceRefreshData('getInventaris', {});
                if (result.success && result.data) {
                    barangCache = result.data;
                    renderBarangTable(barangCache);
                }
            } catch (e) {
                console.warn('Background refresh barang gagal:', e);
            }
        }

        // ================================================================
        // 8. RENDER TABEL BARANG
        // ================================================================
        function renderBarangTable(data) {
            let html = '';
            let totalBarang = 0, totalBaik = 0, totalRusak = 0;
            data.forEach((item, idx) => {
                totalBarang += Number(item.jumlah) || 0;
                if (item.kondisi === 'Baik') totalBaik += Number(item.jumlah) || 0;
                if (item.kondisi === 'Rusak Berat') totalRusak += Number(item.jumlah) || 0;

                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.nama_barang || '-'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.jumlah}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${item.kondisi === 'Baik' ? 'bg-green-100 text-green-700' : item.kondisi === 'Rusak Ringan' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${item.kondisi}</span>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.lokasi || '-'}</td>
                        <td class="px-6 py-4 text-sm">
                            <button onclick="editBarang('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2" title="Edit"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteBarang('${item.id}')" class="text-red-600 hover:text-red-800" title="Hapus"><i class="fas fa-trash"></i></button>
                            <button onclick="generateBarcode('${item.id}')" class="text-green-600 hover:text-green-800 ml-2" title="Barcode"><i class="fas fa-barcode"></i></button>
                        </td>
                    </tr>
                `;
            });
            barangTable.innerHTML = html;
            updateStats(totalBarang, totalBaik, totalRusak);
        }

        function updateStats(total, baik, rusak) {
            totalBarangEl.textContent = total;
            totalBaikEl.textContent = baik;
            totalRusakEl.textContent = rusak;
        }

        // ================================================================
        // 9. LOAD DATA PEMINJAMAN (Stale-While-Revalidate)
        // ================================================================
        async function loadPeminjaman(force = false) {
            if (pinjamCache.length > 0 && !force) {
                renderPinjamTable(pinjamCache, barangCache);
                fetchPinjamBackground();
                return;
            }

            pinjamTable.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const [pinjamRes, barangRes] = await Promise.all([
                    forceRefreshData('getPeminjaman', {}),
                    forceRefreshData('getInventaris', {})
                ]);

                if (pinjamRes.success && pinjamRes.data.length > 0) {
                    pinjamCache = pinjamRes.data;
                    barangCache = barangRes.success ? barangRes.data : barangCache;
                    renderPinjamTable(pinjamCache, barangCache);
                } else if (pinjamRes.success) {
                    pinjamCache = [];
                    pinjamTable.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-muted">Belum ada peminjaman</td></tr>';
                    totalDipinjamEl.textContent = '0';
                } else {
                    pinjamTable.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">${pinjamRes.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                pinjamTable.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchPinjamBackground() {
            try {
                const [pinjamRes, barangRes] = await Promise.all([
                    forceRefreshData('getPeminjaman', {}),
                    forceRefreshData('getInventaris', {})
                ]);
                if (pinjamRes.success) {
                    pinjamCache = pinjamRes.data || [];
                    barangCache = barangRes.success ? barangRes.data : barangCache;
                    renderPinjamTable(pinjamCache, barangCache);
                }
            } catch (e) {
                console.warn('Background refresh peminjaman gagal:', e);
            }
        }

        // ================================================================
        // 10. RENDER TABEL PEMINJAMAN
        // ================================================================
        function renderPinjamTable(data, barangData) {
            let html = '';
            let totalDipinjam = 0;
            data.forEach((item, idx) => {
                const barang = barangData.find(b => b.id === item.barang_id);
                if (item.status === 'dipinjam') totalDipinjam++;
                const tanggalPinjam = item.tanggal_pinjam ? new Date(item.tanggal_pinjam).toLocaleDateString('id-ID') : '-';
                const tanggalKembali = item.tanggal_kembali ? new Date(item.tanggal_kembali).toLocaleDateString('id-ID') : '-';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${barang ? barang.nama_barang : '(Barang dihapus)'}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.peminjam}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${tanggalPinjam}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${tanggalKembali}</td>
                        <td class="px-6 py-4 text-sm">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'dipinjam' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}">${item.status === 'dipinjam' ? 'Dipinjam' : 'Kembali'}</span>
                        </td>
                        <td class="px-6 py-4 text-sm">
                            ${item.status === 'dipinjam' ? `<button onclick="kembalikanBarang('${item.id}')" class="text-green-600 hover:text-green-800" title="Kembalikan"><i class="fas fa-undo"></i></button>` : '-'}
                            <button onclick="deletePeminjaman('${item.id}')" class="text-red-600 hover:text-red-800 ml-2" title="Hapus"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            pinjamTable.innerHTML = html;
            totalDipinjamEl.textContent = totalDipinjam;
        }

        // ================================================================
        // 11. CRUD BARANG (Modal Cepat)
        // ================================================================
        function openBarangModal() {
            barangModal.classList.remove('hidden');
            barangModal.classList.add('flex');
            barangModalContent.classList.remove('scale-95', 'opacity-0');
            barangModalContent.classList.add('scale-100', 'opacity-100');
        }

        function closeBarangModal() {
            barangModalContent.classList.remove('scale-100', 'opacity-100');
            barangModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                barangModal.classList.add('hidden');
                barangModal.classList.remove('flex');
            }, 150);
            barangForm.reset();
            barangId.value = '';
            isEditBarang = false;
        }

        addBarangBtn.addEventListener('click', () => {
            isEditBarang = false;
            barangModalTitle.textContent = 'Tambah Barang';
            barangForm.reset();
            barangId.value = '';
            openBarangModal();
        });

        // Edit Barang dari cache
        window.editBarang = function(id) {
            const item = barangCache.find(d => d.id === id);
            if (!item) {
                showToast('Barang tidak ditemukan di cache', 'warning');
                if (barangCache.length === 0) {
                    loadBarang(true).then(() => {
                        const retry = barangCache.find(d => d.id === id);
                        if (retry) fillEditBarang(retry);
                    });
                }
                return;
            }
            fillEditBarang(item);
        };

        function fillEditBarang(item) {
            isEditBarang = true;
            barangModalTitle.textContent = 'Edit Barang';
            barangId.value = item.id;
            barangNama.value = item.nama_barang;
            barangJumlah.value = item.jumlah;
            barangKondisi.value = item.kondisi || 'Baik';
            barangLokasi.value = item.lokasi || '';
            openBarangModal();
        }

        // Delete Barang (Update Cache Lokal)
        window.deleteBarang = function(id) {
            showConfirm('Hapus barang ini?', async () => {
                const result = await apiCall('deleteInventaris', 'POST', { id });
                if (result.success) {
                    barangCache = barangCache.filter(item => item.id !== id);
                    renderBarangTable(barangCache);
                    await loadPeminjaman(true); // Refresh peminjaman juga
                    populatePinjamDropdown();
                    showToast('Barang dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal hapus', 'error');
                }
            });
        };

        // Submit Barang (Create/Update)
        barangForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = barangForm.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            const data = {
                nama_barang: barangNama.value,
                jumlah: Number(barangJumlah.value) || 0,
                kondisi: barangKondisi.value,
                lokasi: barangLokasi.value
            };
            const id = barangId.value;
            const action = isEditBarang ? 'updateInventaris' : 'createInventaris';
            const payload = isEditBarang ? { id, ...data } : data;

            try {
                const result = await apiCall(action, 'POST', payload);
                if (result.success) {
                    if (isEditBarang) {
                        const index = barangCache.findIndex(item => item.id === id);
                        if (index !== -1) barangCache[index] = { ...barangCache[index], ...data, id: id };
                    } else {
                        const newItem = { ...data, id: result.id, created_at: new Date().toISOString() };
                        barangCache.unshift(newItem);
                    }
                    renderBarangTable(barangCache);
                    closeBarangModal();
                    await loadPeminjaman();
                    populatePinjamDropdown();
                    showToast('Barang disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal simpan', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        barangCloseBtn.addEventListener('click', closeBarangModal);
        barangModal.addEventListener('click', (e) => { if (e.target === barangModal) closeBarangModal(); });

        // ================================================================
        // 12. CRUD PEMINJAMAN (Modal Cepat)
        // ================================================================
        function openPinjamModal() {
            pinjamModal.classList.remove('hidden');
            pinjamModal.classList.add('flex');
            pinjamModalContent.classList.remove('scale-95', 'opacity-0');
            pinjamModalContent.classList.add('scale-100', 'opacity-100');
            populatePinjamDropdown();
        }

        function closePinjamModal() {
            pinjamModalContent.classList.remove('scale-100', 'opacity-100');
            pinjamModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                pinjamModal.classList.add('hidden');
                pinjamModal.classList.remove('flex');
            }, 150);
            pinjamForm.reset();
        }

        addPinjamBtn.addEventListener('click', () => {
            openPinjamModal();
        });

        async function populatePinjamDropdown() {
            try {
                if (barangCache.length === 0) {
                    const result = await forceRefreshData('getInventaris', {});
                    if (result.success) barangCache = result.data || [];
                }
                let options = '<option value="">-- Pilih Barang --</option>';
                barangCache.forEach(item => {
                    options += `<option value="${item.id}">${item.nama_barang} (Stok: ${item.jumlah})</option>`;
                });
                pinjamBarangId.innerHTML = options;
            } catch (error) {
                console.error('Gagal memuat dropdown barang:', error);
            }
        }

        pinjamForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = pinjamForm.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            const data = {
                barang_id: pinjamBarangId.value,
                peminjam: pinjamPeminjam.value,
                tanggal_pinjam: pinjamTanggal.value,
                tanggal_kembali: pinjamTanggalKembali.value || ''
            };

            if (!data.barang_id) {
                showToast('Pilih barang terlebih dahulu!', 'warning');
                stopLoading(submitBtn);
                return;
            }

            try {
                const result = await apiCall('createPeminjaman', 'POST', data);
                if (result.success) {
                    const newItem = { ...data, id: result.id, status: 'dipinjam', created_at: new Date().toISOString() };
                    pinjamCache.unshift(newItem);
                    renderPinjamTable(pinjamCache, barangCache);
                    closePinjamModal();
                    showToast('Peminjaman dicatat!', 'success');
                } else {
                    showToast(result.message || 'Gagal mencatat', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        pinjamCloseBtn.addEventListener('click', closePinjamModal);
        pinjamModal.addEventListener('click', (e) => { if (e.target === pinjamModal) closePinjamModal(); });

        // Kembalikan Barang
        window.kembalikanBarang = function(id) {
            showConfirm('Tandai barang ini sudah kembali?', async () => {
                const result = await apiCall('kembalikanBarang', 'POST', { id });
                if (result.success) {
                    const idx = pinjamCache.findIndex(item => item.id === id);
                    if (idx !== -1) pinjamCache[idx].status = 'kembali';
                    renderPinjamTable(pinjamCache, barangCache);
                    showToast('Barang dikembalikan!', 'success');
                } else {
                    showToast(result.message || 'Gagal mengembalikan', 'error');
                }
            });
        };

        // Delete Peminjaman
        window.deletePeminjaman = function(id) {
            showConfirm('Hapus data peminjaman ini?', async () => {
                const result = await apiCall('deletePeminjaman', 'POST', { id });
                if (result.success) {
                    pinjamCache = pinjamCache.filter(item => item.id !== id);
                    renderPinjamTable(pinjamCache, barangCache);
                    showToast('Data peminjaman dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 13. BARCODE GENERATION
        // ================================================================
        window.generateBarcode = function(id) {
            const canvas = document.createElement('canvas');
            if (typeof JsBarcode === 'undefined') {
                showToast('Library JsBarcode belum dimuat!', 'error');
                return;
            }
            try {
                JsBarcode(canvas, id, {
                    format: "CODE128",
                    width: 2,
                    height: 60,
                    displayValue: true,
                    fontSize: 16,
                    margin: 10
                });
                const dataUrl = canvas.toDataURL('image/png');
                const w = window.open('', '_blank');
                if (w) {
                    w.document.write(`<img src="${dataUrl}" alt="Barcode" /><br><p>Kode: ${id}</p>`);
                }
            } catch (e) {
                showToast('Gagal generate barcode: ' + e.message, 'error');
            }
        };

        // ================================================================
        // 14. REFRESH BUTTON
        // ================================================================
        refreshBtn.addEventListener('click', async () => {
            await Promise.all([loadBarang(true), loadPeminjaman(true)]);
            populatePinjamDropdown();
            showToast('Data diperbarui!', 'success');
        });

        // ================================================================
        // 15. INISIALISASI
        // ================================================================
        loadBarang();
        loadPeminjaman();
        populatePinjamDropdown();
        activateTab('barang');
    }

    // ================================================================
    // 16. JALANKAN INIT
    // ================================================================
    init();
});