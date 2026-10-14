/**
 * js/absensi.js
 * Modul Absensi Digital Publik - FULL FIX v13.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Token QR dari hash routing (3 fallback: __currentQuery → hash → search)
 *  - Signature pad robust (mouse + touch + DPR scale + resize preserve)
 *  - Server-side validation v15 (2-step verify) + v16 (single request)
 *  - Anti double-submit via isSubmitting flag
 *  - XSS protection: escapeHtml() di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - Guard anti-duplikasi
 *
 * FEATURES:
 *  - QR code dinamis dengan logo overlay
 *  - Token QR dari URL (via scan) → auto-deteksi tanpa password
 *  - Password fallback untuk akses langsung
 *  - Signature pad: mouse, touch, DPR aware, resize preserve
 *  - Countdown refresh otomatis setiap 30s (QR realtime)
 *  - Draft form (nama, alamat) persist via localStorage
 *  - QR expired detection (jika token berubah setelah form dibuka)
 *  - Recent attendance list (10 terbaru)
 *  - Copy detail kehadiran
 *  - Responsive, dark mode aware
 *  - Auto-scroll ke list setelah submit sukses
 *  - Loading state + error recovery
 */

App.register('absensi', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__absensiInit) {
        console.log('[absensi] Sudah di-init, skip.');
        return;
    }
    window.__absensiInit = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const form              = document.getElementById('absensi-form');
    const resetBtn          = document.getElementById('reset-form');
    const canvas            = document.getElementById('signature-canvas');
    const clearSignatureBtn = document.getElementById('clear-signature');
    const namaInput         = document.getElementById('absensi_nama');
    const alamatInput       = document.getElementById('absensi_alamat');
    const passwordField     = document.getElementById('password-field');
    const passwordInput     = document.getElementById('absensi_password');
    const absensiList       = document.getElementById('absensi-list');
    const qrContainer       = document.getElementById('qrcode');
    const qrStatusOverlay   = document.getElementById('qr-status-overlay');
    const qrStatusText      = document.getElementById('qr-status-text');
    const submitBtn         = form ? form.querySelector('button[type="submit"]') : null;

    if (!form || !canvas || !namaInput || !alamatInput || !passwordField || !passwordInput) {
        console.error('[absensi] Elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. STATE
    // ================================================================
    let qrStatus      = 'inactive';
    let serverToken   = '';
    let urlToken      = '';
    let isTokenValid  = false;
    let isSubmitting  = false;
    let refreshTimer  = null;
    let lastFormOpenedAt = 0;   // timestamp saat form dibuka via token valid

    const DRAFT_KEY = 'absensi_draft_v1';

    // ================================================================
    // 4. HELPER — XSS PROTECTION
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    // ================================================================
    // 5. HELPER — EXTRACT TOKEN FROM URL (3 FALLBACK)
    // ================================================================
    function extractUrlToken() {
        // Prioritas 1: dari router SPA
        if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
            const t = window.__currentQuery.get('token');
            if (t) return t;
        }
        // Prioritas 2: parse manual dari hash (#/absensi?token=xxx)
        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx !== -1) {
            try {
                const params = new URLSearchParams(hash.substring(qIdx));
                const t = params.get('token');
                if (t) return t;
            } catch (e) {}
        }
        // Prioritas 3: search params biasa (?token=xxx)
        return new URLSearchParams(window.location.search).get('token') || '';
    }

    // ================================================================
    // 6. HELPER — EXTRACT QR DATA FROM API RESPONSE
    // ================================================================
    function extractQrData(res) {
        if (!res || !res.success) return { status: 'inactive', token: '' };
        if (res.data) {
            return {
                status: res.data.status || 'inactive',
                token:  res.data.token  || ''
            };
        }
        return {
            status: res.status || 'inactive',
            token:  res.token  || ''
        };
    }

    // ================================================================
    // 7. DRAFT PERSIST (nama + alamat)
    // ================================================================
    function saveDraft() {
        try {
            const draft = {
                nama: (namaInput.value || '').trim(),
                alamat: (alamatInput.value || '').trim()
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (e) {}
    }

    function loadDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (draft.nama && !namaInput.value) namaInput.value = draft.nama;
            if (draft.alamat && !alamatInput.value) alamatInput.value = draft.alamat;
        } catch (e) {}
    }

    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    }

    // Attach auto-save draft
    if (namaInput && !namaInput.dataset.draftAttached) {
        namaInput.dataset.draftAttached = 'true';
        namaInput.addEventListener('input',
            debounceEvent.bind(null, 'absensi-draft', saveDraft, 500));
    }
    if (alamatInput && !alamatInput.dataset.draftAttached) {
        alamatInput.dataset.draftAttached = 'true';
        alamatInput.addEventListener('input',
            debounceEvent.bind(null, 'absensi-draft', saveDraft, 500));
    }

    // ================================================================
    // 8. CHECK QR STATUS (FORCE REFRESH — REAL-TIME)
    // ================================================================
    async function checkQRStatus(silent) {
        silent = silent || false;

        try {
            urlToken = extractUrlToken();

            const res = await forceRefreshData('getQrConfig', {});
            const { status, token } = extractQrData(res);

            const prevToken = serverToken;
            qrStatus    = status;
            serverToken = token;

            if (!silent) {
                console.log('[absensi] QR status:', status, '| URL token:',
                    urlToken ? urlToken.slice(0, 8) + '...' : '(kosong)');
            }

            // Deteksi QR expired setelah form dibuka
            if (lastFormOpenedAt && prevToken && prevToken !== serverToken) {
                console.warn('[absensi] Token QR berubah! QR sebelumnya expired.');
                showToast('⚠️ QR telah di-regenerate oleh admin. Silakan scan ulang.', 'warning', 5000);
                isTokenValid = false;
                if (qrStatus === 'active') {
                    passwordField.classList.remove('hidden');
                }
            }

            updateQRUI(qrStatus);

            if (qrStatus === 'active') {
                if (urlToken && urlToken === serverToken) {
                    isTokenValid = true;
                    passwordField.classList.add('hidden');
                    passwordInput.value = '';
                    lastFormOpenedAt = Date.now();
                } else {
                    isTokenValid = false;
                    passwordField.classList.remove('hidden');
                }
                form.classList.remove('hidden');
                if (qrStatusText) {
                    qrStatusText.textContent = 'QR Aktif — Silakan isi form absensi';
                    qrStatusText.style.color = '#059669';
                }
            } else {
                form.classList.add('hidden');
                lastFormOpenedAt = 0;
                if (qrStatusText) {
                    qrStatusText.textContent = 'QR sedang ditutup oleh Admin.';
                    qrStatusText.style.color = '#dc2626';
                }
            }
        } catch (error) {
            if (!silent) console.error('[absensi] Error cek QR:', error);
            // Fallback darurat: aktif + wajib password
            qrStatus     = 'active';
            isTokenValid = false;
            passwordField.classList.remove('hidden');
            form.classList.remove('hidden');
            if (qrStatusText) {
                qrStatusText.textContent = 'Gagal memuat status — masukkan password';
                qrStatusText.style.color = '#d97706';
            }
        }
    }

    // ================================================================
    // 9. UPDATE UI QR CODE
    // ================================================================
    function updateQRUI(status) {
        if (!qrContainer || !qrStatusOverlay) return;
        if (status === 'active') {
            qrStatusOverlay.classList.add('hidden');
            generateQR();
        } else {
            qrStatusOverlay.classList.remove('hidden');
            qrContainer.innerHTML = '';
        }
    }

    // ================================================================
    // 10. GENERATE QR CODE
    // ================================================================
    function generateQR() {
        if (!qrContainer) return;
        qrContainer.innerHTML = '';

        if (typeof QRCode === 'undefined') {
            qrContainer.innerHTML =
                '<p class="text-red-500 text-xs p-3 text-center">QR library tidak tersedia</p>';
            return;
        }
        if (!serverToken) {
            qrContainer.innerHTML =
                '<p class="text-yellow-600 text-xs p-3 text-center">Token belum tersedia</p>';
            return;
        }

        const qrDiv = document.createElement('div');
        qrDiv.style.cssText = 'display:block;width:160px;height:160px;';
        qrContainer.appendChild(qrDiv);

        try {
            const baseUrl = window.location.origin + window.location.pathname;
            const qrUrl = baseUrl + '#/absensi?token=' + encodeURIComponent(serverToken);

            new QRCode(qrDiv, {
                text: qrUrl,
                width: 160,
                height: 160,
                colorDark: '#0f2922',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (err) {
            console.error('[absensi] QR generation error:', err);
            qrContainer.innerHTML =
                '<p class="text-red-500 text-xs p-3 text-center">Error generate QR</p>';
        }
    }

    // ================================================================
    // 11. SIGNATURE PAD — ROBUST
    // ================================================================
    function initSignature() {
        const ctx = canvas.getContext('2d');
        let drawing = false;
        let lastX = 0, lastY = 0;
        let hasDraw = false;

        function setupCanvas() {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            // Simpan konten lama sebelum resize
            let oldContent = null;
            if (canvas.width > 0 && hasDraw) {
                try { oldContent = canvas.toDataURL(); } catch (e) {}
            }

            // Set resolusi fisik canvas
            canvas.width  = Math.max(Math.round(rect.width  * dpr), 1);
            canvas.height = Math.max(Math.round(rect.height * dpr), 1);

            // Reset transform & scale sesuai DPR
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
            ctx.lineWidth   = 2.5;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.strokeStyle = '#0f2922';
            ctx.fillStyle   = '#0f2922';

            // Restore konten lama
            if (oldContent) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, rect.width, rect.height);
                };
                img.src = oldContent;
            }
        }

        setupCanvas();

        // Resize debounce
        let resizeTimer;
        const onResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(setupCanvas, 200);
        };
        window.addEventListener('resize', onResize);

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        function start(e) {
            e.preventDefault();
            drawing = true;
            const pos = getPos(e);
            lastX = pos.x;
            lastY = pos.y;
            ctx.beginPath();
            ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
            ctx.fill();
            hasDraw = true;
        }

        function draw(e) {
            if (!drawing) return;
            e.preventDefault();
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
        canvas.addEventListener('touchmove',  draw,  { passive: false });
        canvas.addEventListener('touchend',   stop);
        canvas.addEventListener('touchcancel', stop);

        if (clearSignatureBtn) {
            clearSignatureBtn.addEventListener('click', (e) => {
                e.preventDefault();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                hasDraw = false;
                showToast('Tanda tangan dihapus', 'info', 1500);
            });
        }

        return {
            hasContent: function() {
                if (!hasDraw) return false;
                try {
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    for (let i = 3; i < imgData.length; i += 4) {
                        if (imgData[i] !== 0) return true;
                    }
                    return false;
                } catch (e) {
                    return hasDraw;
                }
            },
            clear: function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                hasDraw = false;
            },
            toDataURL: function() {
                return canvas.toDataURL('image/png');
            }
        };
    }

    // ================================================================
    // 12. LOAD DAFTAR ABSENSI (Limit 10)
    // ================================================================
    async function loadAbsensi() {
        if (!absensiList) return;
        absensiList.innerHTML = '<p class="text-center py-4 text-[var(--text-muted)]">' +
            '<i class="fas fa-spinner fa-spin mr-2"></i>Memuat data...</p>';

        try {
            const res = await apiCall('getAbsensi', 'POST', {});

            if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                const sorted = res.data.slice().sort((a, b) =>
                    new Date(b.created_at) - new Date(a.created_at));
                const data = sorted.slice(0, 10);

                absensiList.innerHTML = data.map(item => {
                    const waktu = new Date(item.created_at);
                    const waktuStr = isNaN(waktu.getTime()) ? '-' :
                        waktu.toLocaleDateString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric'
                        }) + ' · ' +
                        waktu.toLocaleTimeString('id-ID', {
                            hour: '2-digit', minute: '2-digit'
                        });

                    return `
                        <div class="record flex justify-between items-center p-3 border-b border-[var(--card-border)] last:border-0">
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-sm text-[var(--text-main)] truncate">
                                    ${escapeHtml(item.nama || 'Anonim')}
                                </div>
                                <div class="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                    <i class="far fa-clock mr-1"></i>${escapeHtml(waktuStr)}
                                    ${item.alamat ? ` · <i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(item.alamat)}` : ''}
                                </div>
                            </div>
                            <div class="badge bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ml-2">
                                <i class="fas fa-check-circle mr-1"></i>Hadir
                            </div>
                        </div>
                    `;
                }).join('');
            } else if (res && res.success) {
                absensiList.innerHTML = '<p class="text-center py-6 text-[var(--text-muted)] text-sm">' +
                    '<i class="fas fa-users text-2xl opacity-40 mb-2"></i><br>Belum ada kehadiran.</p>';
            } else {
                absensiList.innerHTML =
                    '<p class="text-center py-4 text-red-500 text-sm">' +
                    escapeHtml((res && res.message) || 'Gagal memuat data') + '</p>';
            }
        } catch (error) {
            console.error('[absensi] Load list error:', error);
            absensiList.innerHTML =
                '<p class="text-center py-4 text-red-500 text-sm">' +
                'Error: ' + escapeHtml(error.message) + '</p>';
        }
    }

    // ================================================================
    // 13. SETUP FORM
    // ================================================================
    function setupForm(signature) {
        // === Reset Button ===
        if (resetBtn) {
            const fresh = resetBtn.cloneNode(true);
            resetBtn.parentNode.replaceChild(fresh, resetBtn);
            fresh.addEventListener('click', () => {
                form.reset();
                signature.clear();
                if (!isTokenValid) passwordInput.value = '';
                clearDraft();
                showToast('Form direset', 'info', 1500);
            });
        }

        // === Submit ===
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            // ---------- 1. Validate nama & alamat ----------
            const nama   = (namaInput.value || '').trim();
            const alamat = (alamatInput.value || '').trim();

            if (!nama) {
                showToast('Harap isi nama lengkap!', 'warning');
                namaInput.focus();
                return;
            }
            if (nama.length < 3) {
                showToast('Nama minimal 3 karakter!', 'warning');
                namaInput.focus();
                return;
            }
            if (!alamat) {
                showToast('Harap isi alamat!', 'warning');
                alamatInput.focus();
                return;
            }

            // ---------- 2. Validate QR status ----------
            if (qrStatus !== 'active') {
                showToast('QR sedang ditutup oleh Admin!', 'error');
                return;
            }

            // ---------- 3. Validate password ----------
            let password = '';
            if (!isTokenValid) {
                password = (passwordInput.value || '').trim();
                if (!password) {
                    showToast('Masukkan password absensi!', 'warning');
                    passwordInput.focus();
                    return;
                }
            }

            // ---------- 4. Validate signature ----------
            if (!signature.hasContent()) {
                showToast('Silakan buat tanda tangan terlebih dahulu!', 'warning');
                return;
            }

            const ttd = signature.toDataURL();
            if (!ttd || ttd.length < 100) {
                showToast('Tanda tangan tidak valid.', 'warning');
                return;
            }

            // ---------- 5. Lock ----------
            isSubmitting = true;

            try {
                // === STEP A: Verify password (jika tidak via token) ===
                if (!isTokenValid) {
                    startLoading(submitBtn, 'Verifikasi...');

                    let passOk = false;
                    try {
                        const vres = await apiCall('verifyAbsensiPassword', 'POST', { password });
                        passOk = vres && vres.success;
                    } catch (verr) {
                        console.warn('[absensi] Verify password error:', verr);
                        passOk = false;
                    }

                    if (!passOk) {
                        stopLoading(submitBtn);
                        isSubmitting = false;
                        showToast('Password salah!', 'error');
                        passwordInput.value = '';
                        passwordInput.focus();
                        return;
                    }
                }

                // === STEP B: Submit absensi ===
                startLoading(submitBtn, 'Menyimpan...');

                const payload = { nama, alamat, ttd };
                if (isTokenValid) {
                    payload.token = serverToken;
                } else {
                    payload.password = password;
                }

                const result = await apiCall('createAbsensi', 'POST', payload);

                if (result && result.success) {
                    showToast('✅ Absensi berhasil dicatat!', 'success', 4000);

                    // Reset form
                    form.reset();
                    signature.clear();
                    passwordInput.value = '';
                    clearDraft();

                    // Reload list
                    loadAbsensi();

                    // Scroll ke list
                    if (absensiList) {
                        setTimeout(() => {
                            try {
                                absensiList.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center'
                                });
                            } catch (e) {}
                        }, 400);
                    }
                } else {
                    const msg = (result && result.message) || 'Gagal menyimpan absensi';
                    showToast('❌ ' + msg, 'error', 5000);

                    const lowerMsg = msg.toLowerCase();
                    if (lowerMsg.includes('password') ||
                        lowerMsg.includes('akses') ||
                        lowerMsg.includes('token')) {
                        if (!isTokenValid) passwordInput.focus();
                    }
                }
            } catch (error) {
                console.error('[absensi] Submit error:', error);
                showToast('Error: ' + (error.message || 'Tidak diketahui'), 'error', 5000);
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });
    }

    // ================================================================
    // 14. START AUTO-REFRESH QR STATUS (setiap 30 detik)
    // ================================================================
    function startQrAutoRefresh() {
        stopQrAutoRefresh();
        refreshTimer = setInterval(() => {
            // Hanya refresh jika tab aktif (browser tab focused)
            if (document.hidden) return;
            checkQRStatus(true); // silent mode
        }, 30000);
    }

    function stopQrAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    // Attach visibility change — pause refresh saat tab tidak aktif
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopQrAutoRefresh();
        } else {
            // Cek ulang saat tab kembali aktif
            checkQRStatus(true);
            startQrAutoRefresh();
        }
    });

    // ================================================================
    // 15. CLEANUP (dipanggil saat SPA navigate keluar)
    // ================================================================
    function cleanup() {
        window.__absensiInit = false;
        stopQrAutoRefresh();
    }

    window.__absensiCleanup = cleanup;

    // ================================================================
    // 16. INIT
    // ================================================================
    async function init() {
        console.log('[absensi] Init dimulai');

        // Load draft
        loadDraft();

        // Init signature pad
        const signature = initSignature();

        // Setup form
        setupForm(signature);

        // Cek status QR (force refresh — realtime)
        await checkQRStatus(false);

        // Load daftar absensi
        loadAbsensi();

        // Start auto refresh
        startQrAutoRefresh();

        console.log('[absensi] Init selesai');
    }

    init();
});