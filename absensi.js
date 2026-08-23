/**
 * js/absensi.js
 * Modul Absensi Digital - Final Robust (Sinkron QR, Validasi Token & Password)
 * Versi: 11.0.0 - Stable, No Error
 */

App.register('absensi', function() {
    console.log('Modul absensi dijalankan');

    // ================================================================
    // 1. GUARD INISIALISASI (Cegah Eksekusi Ganda)
    // ================================================================
    if (window.__absensiInit) return;
    window.__absensiInit = true;

    // ================================================================
    // 2. CEK ELEMEN UTAMA
    // ================================================================
    const form = document.getElementById('absensi-form');
    const resetBtn = document.getElementById('reset-form');
    const canvas = document.getElementById('signature-canvas');
    const clearSignatureBtn = document.getElementById('clear-signature');
    const namaInput = document.getElementById('absensi_nama');
    const alamatInput = document.getElementById('absensi_alamat');
    const passwordField = document.getElementById('password-field');
    const passwordInput = document.getElementById('absensi_password');
    const absensiList = document.getElementById('absensi-list');
    const qrContainer = document.getElementById('qrcode');
    const qrStatusOverlay = document.getElementById('qr-status-overlay');
    const qrStatusText = document.getElementById('qr-status-text');

    // Jika form atau elemen penting tidak ditemukan, hentikan modul
    if (!form || !canvas || !namaInput || !alamatInput || !passwordField || !passwordInput) {
        console.error('absensi: elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. STATE
    // ================================================================
    let qrStatus = 'inactive';
    let serverToken = '';
    let isTokenValid = false;

    // ================================================================
    // 4. HELPER EKSTRAK DATA QR (Mendukung berbagai format respons)
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
    // 5. CEK STATUS QR & TOKEN (SELALU AMBIL DATA TERBARU DARI SERVER)
    // ================================================================
    async function checkQRStatus() {
        try {
            // Ambil token dari URL (jika ada)
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('token');

            // Gunakan forceRefreshData agar selalu dapat data terbaru (tanpa cache)
            const res = await forceRefreshData('getQrConfig', {});
            console.log('Hasil getQrConfig (absensi):', res);

            const { status, token } = extractQrData(res);
            qrStatus = status;
            serverToken = token;

            // Update UI QR
            updateQRUI(qrStatus);

            // Logika tampil password & form
            if (qrStatus === 'active') {
                // Jika ada token di URL dan cocok dengan server token → akses via QR, password TIDAK PERLU
                if (urlToken && urlToken === serverToken) {
                    isTokenValid = true;
                    passwordField.classList.add('hidden'); // Sembunyikan password
                } else {
                    // Akses langsung / token tidak cocok → TAMPILKAN PASSWORD
                    isTokenValid = false;
                    passwordField.classList.remove('hidden'); // Tampilkan password
                }
                form.classList.remove('hidden');
                qrStatusText.textContent = 'QR Aktif - Silakan absen';
            } else {
                // QR Nonaktif → Sembunyikan form
                form.classList.add('hidden');
                qrStatusText.textContent = 'QR sedang ditutup oleh Admin.';
            }
        } catch (error) {
            console.error('Error cek QR:', error);
            // Fallback: jika API gagal, tampilkan form dan password (mode darurat)
            qrStatus = 'active';
            isTokenValid = false;
            passwordField.classList.remove('hidden');
            form.classList.remove('hidden');
            qrStatusText.textContent = 'Gagal memuat status - Masukkan password';
        }
    }

    // ================================================================
    // 6. FUNGSI UPDATE UI QR
    // ================================================================
    function updateQRUI(status) {
        if (status === 'active') {
            qrStatusOverlay.classList.add('hidden');
            generateQR();
        } else {
            qrStatusOverlay.classList.remove('hidden');
            qrContainer.innerHTML = ''; // Kosongkan QR agar tidak bisa discan
        }
    }

    // ================================================================
    // 7. GENERATE QR CODE
    // ================================================================
    function generateQR() {
        if (!qrContainer) return;
        qrContainer.innerHTML = '';
        const qrDiv = document.createElement('div');
        qrDiv.style.display = 'block';
        qrDiv.style.width = '160px';
        qrDiv.style.height = '160px';
        qrContainer.appendChild(qrDiv);

        if (typeof QRCode === 'undefined') {
            qrContainer.innerHTML = '<p class="text-red-500 text-xs">QR Code gagal dimuat.</p>';
            return;
        }

        try {
            // QR berisi URL halaman absensi + token dari server
            const qrUrl = window.location.origin + '/#/absensi?token=' + serverToken;
            new QRCode(qrDiv, {
                text: qrUrl,
                width: 160,
                height: 160,
                colorDark: '#0f2922',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (error) {
            qrContainer.innerHTML = '<p class="text-red-500 text-xs">Error saat generate QR.</p>';
        }
    }

    // ================================================================
    // 8. VALIDASI PASSWORD
    // ================================================================
    async function verifyPassword(password) {
        try {
            const res = await apiCall('verifyAbsensiPassword', 'POST', { password });
            return res.success;
        } catch (e) {
            console.error('Error verify password:', e);
            return false;
        }
    }

    // ================================================================
    // 9. SIGNATURE PAD
    // ================================================================
    function initSignature() {
        const ctx = canvas.getContext('2d');
        let drawing = false, lastX = 0, lastY = 0;

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
                e.preventDefault();
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
        }

        function start(e) {
            drawing = true;
            const pos = getPos(e);
            lastX = pos.x;
            lastY = pos.y;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        function draw(e) {
            if (!drawing) return;
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            lastX = pos.x;
            lastY = pos.y;
        }
        function stop() {
            drawing = false;
            ctx.beginPath();
        }

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('mouseleave', stop);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stop);
        canvas.addEventListener('touchcancel', stop);

        clearSignatureBtn.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }

    // ================================================================
    // 10. LOAD DAFTAR ABSENSI
    // ================================================================
    async function loadAbsensi() {
        if (!absensiList) return;
        absensiList.innerHTML = '<p class="text-center text-muted py-4">Memuat data...</p>';
        try {
            const res = await apiCall('getAbsensi', 'POST', {});
            if (res.success && res.data.length > 0) {
                const data = res.data.slice(0, 10);
                absensiList.innerHTML = data.map(item => {
                    const waktu = new Date(item.created_at);
                    const waktuStr = isNaN(waktu.getTime()) ? '-' :
                        waktu.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' }) + ' ' +
                        waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    return `<div class="record-card">
                        <div>
                            <div class="name font-medium">${item.nama || 'Anonim'}</div>
                            <div class="time text-xs text-muted">${waktuStr} · ${item.alamat || '-'}</div>
                        </div>
                        <div class="badge bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs">Hadir</div>
                    </div>`;
                }).join('');
            } else {
                absensiList.innerHTML = '<p class="text-center text-muted py-4">Belum ada kehadiran.</p>';
            }
        } catch (error) {
            absensiList.innerHTML = '<p class="text-center text-red-500 py-4">Error: ' + error.message + '</p>';
        }
    }

    // ================================================================
    // 11. SETUP FORM SUBMIT
    // ================================================================
    function setupForm() {
        // Reset
        resetBtn.addEventListener('click', () => {
            form.reset();
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        // Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Ambil nilai
            const nama = namaInput.value.trim();
            const alamat = alamatInput.value.trim();

            // Validasi input
            if (!nama || !alamat) {
                showToast('Harap isi nama dan alamat!', 'warning');
                return;
            }

            // Validasi status QR
            if (qrStatus !== 'active') {
                showToast('QR sedang ditutup oleh Admin!', 'error');
                return;
            }

            // Validasi password jika akses langsung (token tidak valid)
            if (!isTokenValid) {
                const password = passwordInput.value.trim();
                if (!password) {
                    showToast('Masukkan password absensi!', 'warning');
                    return;
                }
                const valid = await verifyPassword(password);
                if (!valid) {
                    showToast('Password salah!', 'error');
                    passwordInput.value = '';
                    return;
                }
            }

            // Validasi tanda tangan (pastikan ada coretan)
            const ctx = canvas.getContext('2d');
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let hasDraw = false;
            for (let i = 3; i < imgData.length; i += 4) {
                if (imgData[i] !== 0) {
                    hasDraw = true;
                    break;
                }
            }
            if (!hasDraw) {
                showToast('Silakan buat tanda tangan terlebih dahulu!', 'warning');
                return;
            }

            const ttd = canvas.toDataURL('image/png');

            // Kirim data absensi
            try {
                const result = await apiCall('createAbsensi', 'POST', { nama, alamat, ttd });
                if (result.success) {
                    showToast('✅ Absensi berhasil dicatat!', 'success');
                    form.reset();
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    // Reset password agar orang berikutnya harus input lagi
                    passwordInput.value = '';
                    loadAbsensi();
                } else {
                    showToast('❌ Gagal: ' + (result.message || ''), 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            }
        });
    }

    // ================================================================
    // 12. INISIALISASI
    // ================================================================
    function init() {
        initSignature();
        setupForm();
        checkQRStatus(); // Cek status & token (force refresh)
        loadAbsensi();
    }

    init();
});