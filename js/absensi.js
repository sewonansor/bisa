/**
 * js/absensi.js
 * Modul Absensi Digital Publik - FULL FIX v14.0.0
 * ---------------------------------------------------------
 * FITUR TERBARU:
 *  - ✅ Dropdown Filter Ranting Global (Panggungharjo, Bangunharjo, dll)
 *  - ✅ Badge Ranting pada daftar kehadiran
 *  - ✅ Sinkronisasi UI Dark Mode & Responsif
 *  - ✅ Anti double-init (aman untuk SPA Router)
 *  - ✅ Fallback SafeStorage (aman jika localStorage diblokir)
 *  - ✅ Signature pad DPR-aware (tajam di layar HP)
 *  - ✅ Draft form auto-save (Nama & Alamat)
 *  - ✅ Auto-refresh QR Status
 */

App.register('absensi', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI (PENTING UNTUK SPA)
    // ================================================================
    if (window.__absensiInit) {
        console.log('[absensi] Sudah di-init, skip.');
        return;
    }
    window.__absensiInit = true;

    // ================================================================
    // 2. HELPER & SAFE STORAGE
    // ================================================================
    const SafeLocal = window.SafeStorage || {
        getItem: (k) => { try { return localStorage.getItem(k); } catch(e) { return null; } },
        setItem: (k, v) => { try { localStorage.setItem(k, v); } catch(e) {} },
        removeItem: (k) => { try { localStorage.removeItem(k); } catch(e) {} }
    };

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function safeToast(msg, type = 'info', dur = 3000) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type, dur);
        } else {
            console.log(`[Toast:${type}]`, msg);
        }
    }

    // ================================================================
    // 3. DOM ELEMENTS (Gunakan getter agar selalu fresh)
    // ================================================================
    const el = {
        get form()            { return document.getElementById('absensi-form'); },
        get resetBtn()        { return document.getElementById('reset-form'); },
        get canvas()          { return document.getElementById('signature-canvas'); },
        get clearSignatureBtn() { return document.getElementById('clear-signature'); },
        get namaInput()       { return document.getElementById('absensi_nama'); },
        get alamatInput()     { return document.getElementById('absensi_alamat'); },
        get passwordField()   { return document.getElementById('password-field'); },
        get passwordInput()   { return document.getElementById('absensi_password'); },
        get absensiList()     { return document.getElementById('absensi-list'); },
        get qrContainer()     { return document.getElementById('qrcode'); },
        get qrStatusOverlay() { return document.getElementById('qr-status-overlay'); },
        get qrStatusText()    { return document.getElementById('qr-status-text'); },
        get submitBtn()       { return el.form ? el.form.querySelector('button[type="submit"]') : null; },
        get filterRanting()   { return document.getElementById('filter-ranting-global'); } // ✅ Dropdown Filter
    };

    // Validasi elemen utama (jika tidak ada, hentikan inisialisasi)
    if (!el.form || !el.canvas || !el.namaInput || !el.alamatInput) {
        console.error('[absensi] Elemen utama tidak ditemukan. Hentikan inisialisasi.');
        window.__absensiInit = false;
        return;
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let qrStatus      = 'inactive';
    let serverToken   = '';
    let isTokenValid  = false;
    let isSubmitting  = false;
    let refreshTimer  = null;
    let lastFormOpenedAt = 0;
    let allAbsensiData = []; // Menyimpan data mentah sebelum difilter

    const DRAFT_KEY = 'absensi_draft_v1';

    // ================================================================
    // 5. DRAFT PERSIST (Simpan Nama & Alamat)
    // ================================================================
    function saveDraft() {
        SafeLocal.setItem(DRAFT_KEY, JSON.stringify({
            nama: (el.namaInput.value || '').trim(),
            alamat: (el.alamatInput.value || '').trim()
        }));
    }

    function loadDraft() {
        try {
            const raw = SafeLocal.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (draft.nama && !el.namaInput.value) el.namaInput.value = draft.nama;
            if (draft.alamat && !el.alamatInput.value) el.alamatInput.value = draft.alamat;
        } catch (e) {}
    }

    function clearDraft() {
        SafeLocal.removeItem(DRAFT_KEY);
    }

    // Bind auto-save draft
    if (el.namaInput && !el.namaInput.dataset.draftAttached) {
        el.namaInput.dataset.draftAttached = 'true';
        el.namaInput.addEventListener('input', debounce(saveDraft, 500));
    }
    if (el.alamatInput && !el.alamatInput.dataset.draftAttached) {
        el.alamatInput.dataset.draftAttached = 'true';
        el.alamatInput.addEventListener('input', debounce(saveDraft, 500));
    }

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ================================================================
    // 6. QR STATUS LOGIC
    // ================================================================
    async function checkQRStatus(silent = false) {
        try {
            const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
            const urlToken = urlParams.get('token') || '';

            const res = await forceRefreshData('getQrConfig', {});
            
            // Handle struktur response (data vs root)
            const data = (res && res.data) ? res.data : res;
            qrStatus = (data && data.status) ? data.status : 'inactive';
            serverToken = (data && data.token) ? data.token : '';

            if (!silent) {
                console.log('[absensi] QR status:', qrStatus, '| URL token:', urlToken ? urlToken.slice(0, 8) + '...' : '(kosong)');
            }

            // Cek jika token berubah saat form sedang dibuka (QR expired)
            if (lastFormOpenedAt && serverToken && lastFormOpenedAt !== serverToken) {
                isTokenValid = false;
                safeToast('⚠️ QR telah di-regenerate oleh admin. Silakan scan ulang.', 'warning', 5000);
                if (el.passwordField) el.passwordField.classList.remove('hidden');
            }

            updateQRUI(qrStatus);

            if (qrStatus === 'active') {
                if (urlToken && urlToken === serverToken) {
                    isTokenValid = true;
                    if (el.passwordField) el.passwordField.classList.add('hidden');
                    if (el.passwordInput) el.passwordInput.value = '';
                    lastFormOpenedAt = serverToken;
                } else {
                    isTokenValid = false;
                    if (el.passwordField) el.passwordField.classList.remove('hidden');
                }
                if (el.form) el.form.classList.remove('hidden');
                if (el.qrStatusText) {
                    el.qrStatusText.textContent = 'QR Aktif — Silakan isi form absensi';
                    el.qrStatusText.style.color = '#059669';
                }
            } else {
                if (el.form) el.form.classList.add('hidden');
                lastFormOpenedAt = 0;
                if (el.qrStatusText) {
                    el.qrStatusText.textContent = 'QR sedang ditutup oleh Admin.';
                    el.qrStatusText.style.color = '#dc2626';
                }
            }
        } catch (error) {
            if (!silent) console.error('[absensi] Error cek QR:', error);
            qrStatus = 'active'; // Fallback ke password
            isTokenValid = false;
            if (el.passwordField) el.passwordField.classList.remove('hidden');
            if (el.form) el.form.classList.remove('hidden');
            if (el.qrStatusText) {
                el.qrStatusText.textContent = 'Gagal memuat status — masukkan password';
                el.qrStatusText.style.color = '#d97706';
            }
        }
    }

    function updateQRUI(status) {
        if (!el.qrContainer || !el.qrStatusOverlay) return;
        if (status === 'active') {
            el.qrStatusOverlay.classList.add('hidden');
            generateQR();
        } else {
            el.qrStatusOverlay.classList.remove('hidden');
            el.qrContainer.innerHTML = '';
        }
    }

    function generateQR() {
        if (!el.qrContainer) return;
        el.qrContainer.innerHTML = '';

        if (typeof QRCode === 'undefined') {
            el.qrContainer.innerHTML = '<p class="text-red-500 text-xs p-3 text-center">QR library gagal dimuat.</p>';
            return;
        }
        if (!serverToken) {
            el.qrContainer.innerHTML = '<p class="text-yellow-600 text-xs p-3 text-center">Token belum tersedia.</p>';
            return;
        }

        const qrDiv = document.createElement('div');
        qrDiv.style.cssText = 'display:block;width:100%;height:100%;padding:10px;';
        el.qrContainer.appendChild(qrDiv);

        try {
            // Buat URL absolut untuk QR
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
            el.qrContainer.innerHTML = '<p class="text-red-500 text-xs p-3 text-center">Error generate QR</p>';
        }
    }

    // ================================================================
    // 7. SIGNATURE PAD (Canvas DPR-Aware)
    // ================================================================
    function initSignature() {
        const canvas = el.canvas;
        const ctx = canvas.getContext('2d');
        let drawing = false;
        let lastX = 0, lastY = 0;
        let hasDraw = false;

        function setupCanvas() {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            // Simpan gambar lama jika ada
            let oldContent = null;
            if (canvas.width > 0 && hasDraw) {
                try { oldContent = canvas.toDataURL(); } catch (e) {}
            }

            canvas.width  = Math.max(Math.round(rect.width  * dpr), 1);
            canvas.height = Math.max(Math.round(rect.height * dpr), 1);

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
            ctx.lineWidth   = 2.5;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';
            ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#0f2922';

            // Kembalikan gambar lama
            if (oldContent) {
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
                img.src = oldContent;
            }
        }

        setupCanvas();
        window.addEventListener('resize', debounce(setupCanvas, 200));

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;
            const clientY = (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;
            return { x: clientX - rect.left, y: clientY - rect.top };
        }

        function start(e) {
            if (e.cancelable) e.preventDefault();
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
            if (e.cancelable) e.preventDefault();
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

        // Event Listeners (Mouse & Touch)
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('mouseleave', stop);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stop);

        // Clear Button
        if (el.clearSignatureBtn) {
            const freshBtn = el.clearSignatureBtn.cloneNode(true);
            el.clearSignatureBtn.parentNode.replaceChild(freshBtn, el.clearSignatureBtn);
            freshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                hasDraw = false;
                safeToast('Tanda tangan dihapus', 'info', 1500);
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
                } catch (e) { return hasDraw; }
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
    // 8. LOAD DAFTAR ABSENSI & FILTER RANTING
    // ================================================================
    async function loadAbsensi() {
        if (!el.absensiList) return;
        
        el.absensiList.innerHTML = '<p style="text-align:center; padding: 20px 0;"><i class="fas fa-spinner fa-spin mr-2"></i>Memuat data...</p>';

        try {
            const res = await apiCall('getAbsensi', 'POST', {});
            
            if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                allAbsensiData = res.data; // Simpan ke state global
                renderAbsensiList();
            } else if (res && res.success) {
                el.absensiList.innerHTML = '<p style="text-align:center; padding: 20px 0; color: var(--abs-muted);"><i class="fas fa-users text-2xl opacity-40 mb-2 block"></i>Belum ada kehadiran.</p>';
            } else {
                el.absensiList.innerHTML = `<p style="text-align:center; padding: 20px 0; color: #dc2626;">${escapeHtml((res && res.message) || 'Gagal memuat data')}</p>`;
            }
        } catch (error) {
            console.error('[absensi] Load list error:', error);
            el.absensiList.innerHTML = `<p style="text-align:center; padding: 20px 0; color: #dc2626;">Error: ${escapeHtml(error.message)}</p>`;
        }
    }

    function renderAbsensiList() {
        if (!el.absensiList) return;

        let filteredData = allAbsensiData;

        // ✅ LOGIKA FILTER RANTING
        const selectedRanting = el.filterRanting ? el.filterRanting.value.toLowerCase() : '';
        if (selectedRanting) {
            filteredData = filteredData.filter(item => {
                const rKal = (item.kalurahan || '').toLowerCase();
                const rAlamat = (item.alamat || '').toLowerCase();
                // Cek di kolom kalurahan ATAU fallback ke alamat
                return rKal === selectedRanting || rAlamat.includes(selectedRanting);
            });
        }

        if (filteredData.length === 0) {
            el.absensiList.innerHTML = '<p style="text-align:center; padding: 20px 0; color: var(--abs-muted);"><i class="fas fa-search text-2xl opacity-40 mb-2 block"></i>Tidak ada data untuk ranting ini.</p>';
            return;
        }

        // Urutkan (terbaru di atas) dan ambil 15 data terakhir
        const sorted = filteredData.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const data = sorted.slice(0, 15);

        el.absensiList.innerHTML = data.map(item => {
            const waktu = new Date(item.created_at);
            const waktuStr = isNaN(waktu.getTime()) ? '-' :
                waktu.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' +
                waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

            // Badge Ranting (jika ada)
            const badgeRanting = item.kalurahan 
                ? `<span style="margin-left:8px; padding:2px 8px; background:#ecfdf5; color:#059669; border-radius:4px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${escapeHtml(item.kalurahan)}</span>` 
                : '';

            return `
                <div class="record">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:0.9rem; color:var(--abs-text); display:flex; align-items:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${escapeHtml(item.nama || 'Anonim')}
                            ${badgeRanting}
                        </div>
                        <div style="font-size:0.75rem; color:var(--abs-muted); margin-top:4px;">
                            <i class="far fa-clock" style="margin-right:4px;"></i>${escapeHtml(waktuStr)}
                            ${item.alamat ? ` · <i class="fas fa-map-marker-alt" style="margin-left:4px; margin-right:4px;"></i>${escapeHtml(item.alamat)}` : ''}
                        </div>
                    </div>
                    <div class="badge">
                        <i class="fas fa-check-circle" style="margin-right:4px;"></i>Hadir
                    </div>
                </div>
            `;
        }).join('');
    }

    // ================================================================
    // 9. FORM SUBMIT LOGIC
    // ================================================================
    function setupForm(signature) {
        // Reset Button
        if (el.resetBtn) {
            const freshReset = el.resetBtn.cloneNode(true);
            el.resetBtn.parentNode.replaceChild(freshReset, el.resetBtn);
            freshReset.addEventListener('click', () => {
                el.form.reset();
                signature.clear();
                if (!isTokenValid && el.passwordInput) el.passwordInput.value = '';
                clearDraft();
                safeToast('Form direset', 'info', 1500);
            });
        }

        // Submit
        el.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmitting) return;

            const nama = (el.namaInput.value || '').trim();
            const alamat = (el.alamatInput.value || '').trim();

            // Validasi
            if (!nama || nama.length < 3) {
                safeToast('Nama minimal 3 karakter!', 'warning');
                el.namaInput.focus();
                return;
            }
            if (!alamat) {
                safeToast('Alamat wajib diisi!', 'warning');
                el.alamatInput.focus();
                return;
            }
            if (qrStatus !== 'active') {
                safeToast('QR sedang ditutup oleh Admin!', 'error');
                return;
            }

            let password = '';
            if (!isTokenValid) {
                password = (el.passwordInput.value || '').trim();
                if (!password) {
                    safeToast('Masukkan password absensi!', 'warning');
                    el.passwordInput.focus();
                    return;
                }
            }
            if (!signature.hasContent()) {
                safeToast('Silakan buat tanda tangan terlebih dahulu!', 'warning');
                return;
            }

            const ttd = signature.toDataURL();
            if (!ttd || ttd.length < 100) {
                safeToast('Tanda tangan tidak valid.', 'warning');
                return;
            }

            isSubmitting = true;
            const btn = el.submitBtn;
            const origBtnHtml = btn ? btn.innerHTML : '';

            try {
                // A. Verifikasi Password (jika bukan via token QR)
                if (!isTokenValid) {
                    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verifikasi...'; }
                    
                    const vres = await apiCall('verifyAbsensiPassword', 'POST', { password });
                    if (!vres || !vres.success) {
                        safeToast('Password salah!', 'error');
                        isSubmitting = false;
                        if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
                        if (el.passwordInput) { el.passwordInput.value = ''; el.passwordInput.focus(); }
                        return;
                    }
                }

                // B. Submit Absensi
                if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...'; }

                const payload = { nama, alamat, ttd };
                if (isTokenValid) payload.token = serverToken;
                else payload.password = password;

                const result = await apiCall('createAbsensi', 'POST', payload);

                if (result && result.success) {
                    safeToast('✅ Absensi berhasil dicatat!', 'success', 4000);
                    el.form.reset();
                    signature.clear();
                    if (el.passwordInput) el.passwordInput.value = '';
                    clearDraft();

                    // Reload list & scroll ke bawah
                    await loadAbsensi();
                    setTimeout(() => {
                        if (el.absensiList) el.absensiList.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 400);
                } else {
                    const msg = (result && result.message) || 'Gagal menyimpan absensi';
                    safeToast(`❌ ${msg}`, 'error', 5000);
                    if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('token')) {
                        if (!isTokenValid && el.passwordInput) el.passwordInput.focus();
                    }
                }
            } catch (error) {
                console.error('[absensi] Submit error:', error);
                safeToast(`Error: ${error.message}`, 'error', 5000);
            } finally {
                isSubmitting = false;
                if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            }
        });
    }

    // ================================================================
    // 10. AUTO-REFRESH & CLEANUP
    // ================================================================
    function startQrAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
            if (!document.hidden) checkQRStatus(true);
        }, 30000);
    }

    function cleanup() {
        window.__absensiInit = false;
        if (refreshTimer) clearInterval(refreshTimer);
        console.log('[absensi] Cleanup berhasil');
    }
    window.__absensiCleanup = cleanup;

    // ================================================================
    // 11. INIT
    // ================================================================
    async function init() {
        console.log('[absensi] Init dimulai v14.0.0');

        loadDraft();
        const signature = initSignature();
        setupForm(signature);

        // ✅ BIND DROPDOWN FILTER RANTING
        if (el.filterRanting) {
            el.filterRanting.addEventListener('change', () => {
                renderAbsensiList(); // Cukup render ulang, tidak perlu fetch API
            });
        }

        await checkQRStatus(false);
        await loadAbsensi();
        startQrAutoRefresh();

        console.log('[absensi] Init selesai');
    }

    // Jalankan
    init();
});