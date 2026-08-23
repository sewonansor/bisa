/**
 * js/absensi_admin.js
 * Modul Admin Absensi - Final (Cepat: Cache Lokal, Update Lokal, QR Sinkron, Tanpa Fetch Berulang)
 * Versi: 9.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±377
 */

App.register('absensi_admin', function() {
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
    if (window.__absensiAdminLoaded) return;
    window.__absensiAdminLoaded = true;

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
            'absensi-table-body',
            'qr-toggle-btn', 'qr-regenerate-btn', 'qr-status-text-admin', 'qr-token-text-admin',
            'qr-code-display', 'download-qr-btn', 'password-input-admin', 'save-password-btn',
            'password-msg', 'filter-date', 'refresh-btn', 'export-btn'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'absensi-table-body': tableBody,
            'qr-toggle-btn': qrToggleBtn,
            'qr-regenerate-btn': qrRegenerateBtn,
            'qr-status-text-admin': qrStatusText,
            'qr-token-text-admin': qrTokenText,
            'qr-code-display': qrCodeDisplay,
            'download-qr-btn': downloadQrBtn,
            'password-input-admin': passwordInput,
            'save-password-btn': savePasswordBtn,
            'password-msg': passwordMsg,
            'filter-date': filterDate,
            'refresh-btn': refreshBtn,
            'export-btn': exportBtn
        } = els;

        if (!tableBody || !qrToggleBtn || !qrRegenerateBtn || !savePasswordBtn || !qrCodeDisplay || !downloadQrBtn) {
            console.error('absensi_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let currentQrStatus = 'inactive';
        let currentQrToken = '';
        let dataCache = []; // untuk daftar absensi

        // ================================================================
        // 6. HELPER EKSTRAK DATA QR
        // ================================================================
        function extractQrData(res) {
            if (!res || !res.success) return { status: 'inactive', token: '' };
            if (res.data) {
                return {
                    status: res.data.status || 'inactive',
                    token: res.data.token || ''
                };
            }
            return {
                status: res.status || 'inactive',
                token: res.token || ''
            };
        }

        // ================================================================
        // 7. LOAD STATUS QR (FORCE REFRESH)
        // ================================================================
        async function loadQrStatus() {
            try {
                const res = await forceRefreshData('getQrConfig', {});
                const { status, token } = extractQrData(res);
                currentQrStatus = status;
                currentQrToken = token;
                updateQrUI(currentQrStatus, currentQrToken);
            } catch (error) {
                console.error('Gagal memuat status QR:', error);
                currentQrStatus = 'inactive';
                currentQrToken = '';
                updateQrUI('inactive', '');
            }
        }

        // ================================================================
        // 8. UPDATE UI STATUS QR + PREVIEW
        // ================================================================
        function updateQrUI(status, token) {
            currentQrStatus = status;
            currentQrToken = token || '';

            qrStatusText.textContent = status === 'active' ? 'Status: Aktif' : 'Status: Nonaktif';
            qrTokenText.textContent = token ? `Token: ${token}` : 'Token: -';

            if (status === 'active') {
                qrToggleBtn.textContent = 'Tutup QR';
                qrToggleBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                qrToggleBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                qrRegenerateBtn.disabled = false;
                qrRegenerateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                downloadQrBtn.disabled = false;
                generateQrPreview();
            } else {
                qrToggleBtn.textContent = 'Aktifkan QR';
                qrToggleBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                qrToggleBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                qrRegenerateBtn.disabled = true;
                qrRegenerateBtn.classList.add('opacity-50', 'cursor-not-allowed');
                downloadQrBtn.disabled = true;
                qrCodeDisplay.innerHTML = '<i class="fas fa-lock text-2xl text-gray-400"></i>';
            }
        }

        // ================================================================
        // 9. GENERATE QR PREVIEW (DENGAN LOGO)
        // ================================================================
        function generateQrPreview() {
            if (!qrCodeDisplay) return;
            qrCodeDisplay.innerHTML = '';

            if (typeof QRCode === 'undefined') {
                qrCodeDisplay.innerHTML = `<p class="text-red-500 text-xs">QR library tidak tersedia</p><p class="text-xs mt-2">Token: ${currentQrToken}</p>`;
                return;
            }

            const qrUrl = window.location.origin + '/#/absensi?token=' + currentQrToken;
            const qrDiv = document.createElement('div');
            qrDiv.style.width = '180px';
            qrDiv.style.height = '180px';
            qrCodeDisplay.appendChild(qrDiv);

            try {
                new QRCode(qrDiv, {
                    text: qrUrl,
                    width: 180,
                    height: 180,
                    colorDark: '#0f2922',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (error) {
                qrCodeDisplay.innerHTML = `<p class="text-red-500 text-xs">Error saat generate QR</p><p class="text-xs mt-2">Token: ${currentQrToken}</p>`;
            }
        }

        // ================================================================
        // 10. DOWNLOAD QR
        // ================================================================
        downloadQrBtn.addEventListener('click', function() {
            const canvas = qrCodeDisplay.querySelector('canvas');
            if (!canvas) {
                showToast('QR belum tersedia', 'warning');
                return;
            }
            const link = document.createElement('a');
            link.download = 'QR_Absensi_Ansor.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('QR berhasil diunduh!', 'success');
        });

        // ================================================================
        // 11. TOGGLE QR (AKTIF / NONAKTIF)
        // ================================================================
        qrToggleBtn.addEventListener('click', async () => {
            const newStatus = currentQrStatus === 'active' ? 'inactive' : 'active';
            try {
                const res = await forceRefreshData('updateQrStatus', { status: newStatus });
                const { status, token } = extractQrData(res);
                currentQrStatus = status;
                currentQrToken = token;
                updateQrUI(currentQrStatus, currentQrToken);
                showToast('Status QR berhasil diperbarui!', 'success');
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        });

        // ================================================================
        // 12. REGENERATE QR (BUAT TOKEN BARU)
        // ================================================================
        qrRegenerateBtn.addEventListener('click', async () => {
            showConfirm('Buat QR baru? QR lama akan langsung tidak berlaku.', async () => {
                try {
                    const res = await forceRefreshData('updateQrStatus', { status: 'active' });
                    const { status, token } = extractQrData(res);
                    currentQrStatus = status;
                    currentQrToken = token;
                    updateQrUI(currentQrStatus, currentQrToken);
                    showToast('QR baru berhasil dibuat! QR lama sudah tidak berlaku.', 'success');
                } catch (error) {
                    showToast('Error: ' + error.message, 'error');
                }
            });
        });

        // ================================================================
        // 13. SIMPAN PASSWORD AKSES LANGSUNG
        // ================================================================
        savePasswordBtn.addEventListener('click', async () => {
            const newPassword = passwordInput.value.trim();
            if (!newPassword) {
                passwordMsg.textContent = 'Password tidak boleh kosong!';
                passwordMsg.className = 'text-red-500';
                return;
            }
            try {
                const res = await apiCall('setAbsensiPassword', 'POST', { password: newPassword });
                if (res.success) {
                    passwordMsg.textContent = 'Password berhasil disimpan!';
                    passwordMsg.className = 'text-green-600';
                    passwordInput.value = '';
                    showToast('Password absensi diperbarui!', 'success');
                } else {
                    passwordMsg.textContent = res.message || 'Gagal menyimpan password.';
                    passwordMsg.className = 'text-red-500';
                }
            } catch (error) {
                passwordMsg.textContent = 'Error: ' + error.message;
                passwordMsg.className = 'text-red-500';
            }
        });

        // ================================================================
        // 14. LOAD DATA ABSENSI (Stale-While-Revalidate)
        // ================================================================
        async function loadAbsensi(force = false) {
            if (dataCache.length > 0 && !force) {
                renderTable(dataCache);
                fetchAbsensiBackground();
                return;
            }

            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></td></tr>';
            try {
                const res = await forceRefreshData('getAbsensi', {});
                if (res.success && res.data.length > 0) {
                    dataCache = res.data;
                    renderTable(dataCache);
                } else if (res.success) {
                    dataCache = [];
                    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-muted">Belum ada data absensi.</td></tr>';
                } else {
                    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">${res.message || 'Gagal memuat data'}</td></tr>`;
                }
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
            }
        }

        async function fetchAbsensiBackground() {
            try {
                const res = await forceRefreshData('getAbsensi', {});
                if (res.success && res.data) {
                    dataCache = res.data;
                    renderTable(dataCache);
                }
            } catch (e) {
                console.warn('Background refresh absensi gagal:', e);
            }
        }

        // ================================================================
        // 15. RENDER TABEL
        // ================================================================
        function renderTable(data) {
            let html = '';
            data.forEach((item, idx) => {
                const date = new Date(item.created_at);
                const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                html += `
                    <tr class="hover:bg-[var(--bg-stats)]">
                        <td class="px-4 py-3">${idx + 1}</td>
                        <td class="px-4 py-3 font-medium">${item.nama || '-'}</td>
                        <td class="px-4 py-3">${item.alamat || '-'}</td>
                        <td class="px-4 py-3">${dateStr}</td>
                        <td class="px-4 py-3">
                            ${item.ttd ? `<img src="${item.ttd}" alt="TTD" class="ttd-img" style="width:80px;height:40px;object-fit:contain;">` : '-'}
                        </td>
                        <td class="px-4 py-3">
                            <button onclick="deleteAbsensi('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        // ================================================================
        // 16. DELETE ABSENSI (Update Cache Lokal)
        // ================================================================
        window.deleteAbsensi = function(id) {
            showConfirm('Hapus data absensi ini?', async () => {
                const res = await apiCall('deleteAbsensi', 'POST', { id });
                if (res.success) {
                    dataCache = dataCache.filter(item => item.id !== id);
                    renderTable(dataCache);
                    showToast('Data absensi dihapus!', 'success');
                } else {
                    showToast(res.message || 'Gagal menghapus.', 'error');
                }
            });
        };

        // ================================================================
        // 17. FILTER TANGGAL
        // ================================================================
        if (filterDate) {
            filterDate.addEventListener('change', () => {
                const value = filterDate.value;
                if (!value) {
                    renderTable(dataCache);
                    return;
                }
                const filtered = dataCache.filter(item => {
                    if (!item.created_at) return false;
                    const d = new Date(item.created_at);
                    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
                });
                renderTable(filtered);
            });
        }

        // ================================================================
        // 18. EXPORT CSV
        // ================================================================
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                if (dataCache.length === 0) {
                    showToast('Tidak ada data untuk diekspor.', 'warning');
                    return;
                }
                const headers = ['No', 'Nama', 'Alamat', 'Waktu', 'TTD'];
                const rows = dataCache.map((item, idx) => {
                    const date = new Date(item.created_at);
                    const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID');
                    return [idx + 1, item.nama || '', item.alamat || '', dateStr, item.ttd ? 'Ada' : '-'];
                });
                const csvContent = [headers, ...rows]
                    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                    .join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `absensi_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('CSV berhasil diunduh!', 'success');
            });
        }

        // ================================================================
        // 19. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadQrStatus();
                loadAbsensi(true);
                showToast('Data diperbarui!', 'success');
            });
        }

        // ================================================================
        // 20. INISIALISASI
        // ================================================================
        loadQrStatus();
        loadAbsensi();
    }

    // ================================================================
    // 21. JALANKAN INIT
    // ================================================================
    init();
});