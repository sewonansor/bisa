/**
 * js/auth.js
 * Modul Autentikasi - FULL FIX v16.0.0
 * ---------------------------------------------------------
 * CHANGELOG v16.0.0:
 *   ✅ FIX: Boot flag reset setelah login (untuk boot loader once-per-session)
 *   ✅ FIX: Watchdog 3 detik — force redirect kalau stuck
 *   ✅ FIX: Handle semua response format (root/data/data.user)
 *   ✅ FIX: Login redirect SIMPLE & PASTI JALAN
 *   ✅ FIX: Register berfungsi penuh dengan validasi
 *   ✅ FIX: Lupa Password berfungsi (reset password)
 *   ✅ FIX: Lupa Username berfungsi (by phone)
 *   ✅ FIX: Anti double-submit + XSS protection
 *   ✅ FIX: Null-safe semua DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Cleanup function proper
 *   ✅ FIX: Better logging untuk debug
 *   ✅ FIX: Tab switch persist via sessionStorage
 * ---------------------------------------------------------
 */

App.register('auth', function() {
    'use strict';

    // ============================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ============================================================
    if (window.__authLoaded) {
        console.log('[auth] Sudah di-init, skip.');
        return;
    }
    window.__authLoaded = true;
    console.log('[auth] 🚀 Init v16.0.0');

    // ============================================================
    // 2. CEK USER SUDAH LOGIN
    // ============================================================
    const existingUser = checkAuth();
    if (existingUser) {
        const dashUrl = existingUser.role === 'admin' ? '/dashboard_admin' : '/dashboard_member';
        console.log('[auth] User sudah login, redirect ke', dashUrl);
        setTimeout(() => { window.location.hash = dashUrl; }, 100);
        return;
    }

    // ============================================================
    // 3. DOM ELEMENTS — NULL-SAFE
    // ============================================================
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginContainer = document.getElementById('login-form-container');
    const registerContainer = document.getElementById('register-form-container');
    const formTitle = document.getElementById('form-title');
    const loginMsg = document.getElementById('login-message');
    const regMsg = document.getElementById('register-message');

    // Forgot modal
    const forgotLink = document.getElementById('forgot-account-link');
    const forgotModal = document.getElementById('forgot-account-modal');
    const forgotContent = document.getElementById('forgot-modal-content');
    const closeForgotBtn = document.getElementById('close-forgot-modal');
    const modeRadios = document.querySelectorAll('input[name="forgotMode"]');
    const step1 = document.getElementById('forgot-step-1');
    const step2 = document.getElementById('forgot-step-2');
    const step3 = document.getElementById('forgot-step-3');
    const forgotUsername = document.getElementById('forgot-username');
    const forgotPhone = document.getElementById('forgot-phone');
    const forgotNext = document.getElementById('forgot-next');
    const forgotQuestionText = document.getElementById('forgot-question-text');
    const forgotAnswer = document.getElementById('forgot-answer');
    const forgotVerify = document.getElementById('forgot-verify');
    const forgotDone = document.getElementById('forgot-done');
    const forgotResultContent = document.getElementById('forgot-result-content');
    const msg1 = document.getElementById('forgot-step1-msg');
    const msg2 = document.getElementById('forgot-step2-msg');
    const step1Desc = document.getElementById('forgot-step1-desc');

    if (!loginForm || !registerForm) {
        console.error('[auth] ❌ Form utama tidak ditemukan');
        return;
    }

    // ============================================================
    // 4. STATE
    // ============================================================
    let forgotMode = 'password';
    let forgotIdentifier = '';
    let isSubmitting = false;
    let loginLock = false;

    // ============================================================
    // 5. HELPERS
    // ============================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function setMsg(el, text, type) {
        if (!el) return;
        el.textContent = text;
        el.className = 'mt-2 text-center text-sm ' +
            (type === 'success' ? 'text-green-600' :
             type === 'error' ? 'text-red-600' :
             type === 'info' ? 'text-blue-600' : '');
    }

    function clearMsg(el) {
        if (!el) return;
        el.textContent = '';
        el.className = 'mt-2 text-center text-sm';
    }

    function val(id) {
        const el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
    }

    function focusFirst(container) {
        if (!container) return;
        setTimeout(() => {
            const i = container.querySelector('input:not([type="hidden"]):not([disabled])');
            if (i) i.focus();
        }, 150);
    }

    /**
     * ✅ Extract user dari berbagai format response
     */
    function extractUser(result) {
        if (!result || !result.success) return null;

        // Format 1: user di root
        if (result.user && result.user.id) {
            console.log('[auth] 📦 User dari: root');
            return result.user;
        }

        // Format 2: user di data.user
        if (result.data && result.data.user && result.data.user.id) {
            console.log('[auth] 📦 User dari: data.user');
            return result.data.user;
        }

        // Format 3: data langsung user
        if (result.data && result.data.id && result.data.role) {
            console.log('[auth] 📦 User dari: data (langsung)');
            return result.data;
        }

        console.warn('[auth] ⚠️ Tidak bisa ekstrak user:', result);
        return null;
    }

    function extractQuestion(result) {
        if (!result || !result.success) return '';
        if (result.question) return result.question;
        if (result.data && result.data.question) return result.data.question;
        return 'Tidak ada pertanyaan keamanan';
    }

    function extractUsername(result) {
        if (!result || !result.success) return '';
        if (result.username) return result.username;
        if (result.data && result.data.username) return result.data.username;
        return '';
    }

    /**
     * ✅ Reset boot flag setelah login sukses
     * Integrasi dengan boot loader "once per session"
     */
    function resetBootFlagForLogin() {
        try {
            sessionStorage.removeItem('__boot_done');
            localStorage.removeItem('__boot_done');
            console.log('[auth] ✅ Boot flag reset — boot loader will show');
        } catch (e) {}
    }

    // ============================================================
    // 6. PASSWORD TOGGLE (global)
    // ============================================================
    window.togglePassword = function(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input || !btn) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.innerHTML = input.type === 'password'
            ? '<i class="fas fa-eye"></i>'
            : '<i class="fas fa-eye-slash"></i>';
    };

    // ============================================================
    // 7. TAB SWITCHING
    // ============================================================
    function switchTab(target) {
        const isLogin = target === 'login';

        [loginTab, registerTab].forEach((tab, idx) => {
            if (!tab) return;
            const active = (idx === 0 && isLogin) || (idx === 1 && !isLogin);
            tab.classList.toggle('border-green-700', active);
            tab.classList.toggle('text-green-700', active);
            tab.classList.toggle('dark:border-green-400', active);
            tab.classList.toggle('dark:text-green-400', active);
            tab.classList.toggle('text-gray-500', !active);
            tab.classList.toggle('dark:text-gray-400', !active);
        });

        if (loginContainer) loginContainer.classList.toggle('hidden', !isLogin);
        if (registerContainer) registerContainer.classList.toggle('hidden', isLogin);
        if (formTitle) formTitle.textContent = isLogin ? 'Login' : 'Register';

        clearMsg(loginMsg);
        clearMsg(regMsg);

        focusFirst(isLogin ? loginContainer : registerContainer);
    }

    [loginTab, registerTab].forEach((tab, idx) => {
        if (!tab) return;
        const c = tab.cloneNode(true);
        tab.parentNode.replaceChild(c, tab);
        c.addEventListener('click', function() {
            switchTab(idx === 0 ? 'login' : 'register');
            try {
                if (idx === 1) SafeSessionStorage.setItem('authTab', 'register');
                else SafeSessionStorage.removeItem('authTab');
            } catch (e) {}
        });
    });

    // ============================================================
    // 8. INITIAL TAB
    // ============================================================
    (function() {
        let t = 'login';

        if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
            if (window.__currentQuery.get('tab') === 'register') t = 'register';
        }

        if (t === 'login') {
            const hash = window.location.hash || '';
            const qIdx = hash.indexOf('?');
            if (qIdx !== -1) {
                try {
                    const p = new URLSearchParams(hash.substring(qIdx));
                    if (p.get('tab') === 'register') t = 'register';
                } catch (e) {}
            }
        }

        if (t === 'login') {
            try {
                if (SafeSessionStorage.getItem('authTab') === 'register') {
                    t = 'register';
                    SafeSessionStorage.removeItem('authTab');
                }
            } catch (e) {}
        }

        if (t === 'login') {
            try {
                if (new URLSearchParams(window.location.search).get('tab') === 'register') {
                    t = 'register';
                }
            } catch (e) {}
        }

        switchTab(t);
    })();

    // ============================================================
    // 9. LOGIN SUBMIT
    // ============================================================
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (loginLock) return;

        const username = val('login-username');
        const passwordEl = document.getElementById('login-password');
        const password = passwordEl ? passwordEl.value : '';

        if (!username) {
            setMsg(loginMsg, 'Email/Username wajib diisi!', 'error');
            const el = document.getElementById('login-username');
            if (el) el.focus();
            return;
        }
        if (!password) {
            setMsg(loginMsg, 'Password wajib diisi!', 'error');
            if (passwordEl) passwordEl.focus();
            return;
        }

        loginLock = true;
        isSubmitting = true;

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        startLoading(submitBtn, 'Login...');
        setMsg(loginMsg, 'Memproses login...', 'info');

        console.log('[auth] 🔐 Login attempt:', username);

        try {
            const result = await apiCall('login', 'POST', { username, password });
            console.log('[auth] 📥 Response:', result);

            const user = extractUser(result);

            if (result && result.success && user) {
                // ═══ LOGIN SUKSES ═══
                console.log('[auth] ✅ Login sukses, role:', user.role);

                try {
                    SafeStorage.setItem('user', JSON.stringify(user));
                    console.log('[auth] ✅ User tersimpan');
                } catch (err) {
                    console.error('[auth] Gagal save user:', err);
                }

                // ✅ Reset boot flag
                resetBootFlagForLogin();

                const userName = user.nama || user.username || 'User';
                setMsg(loginMsg, '✅ Login berhasil! Mengalihkan...', 'success');
                showToast('Selamat datang, ' + userName + '!', 'success', 2500);

                if (typeof window.updateAuthLinks === 'function') {
                    try { window.updateAuthLinks(); } catch (e) {}
                }

                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengalihkan...';
                }

                const dashUrl = user.role === 'admin'
                    ? '/dashboard_admin'
                    : '/dashboard_member';

                console.log('[auth] 🔄 Redirect ke:', dashUrl);

                setTimeout(function() {
                    try {
                        window.location.hash = dashUrl;
                    } catch (e1) {
                        console.warn('[auth] Hash error:', e1);
                    }

                    // Watchdog 3 detik
                    setTimeout(function() {
                        const currentHash = (window.location.hash || '')
                            .replace('#', '').split('?')[0];
                        if (currentHash === '/auth' || currentHash === '' || currentHash === '/') {
                            console.warn('[auth] ⚠️ Watchdog: force redirect');
                            const base = window.location.origin + window.location.pathname;
                            window.location.href = base + '#' + dashUrl;
                        }
                    }, 3000);

                }, 400);

            } else {
                // LOGIN GAGAL
                console.log('[auth] ❌ Gagal:', result && result.message);
                const errMsg = (result && result.message) || 'Login gagal';
                setMsg(loginMsg, errMsg, 'error');

                if (passwordEl) {
                    passwordEl.value = '';
                    passwordEl.focus();
                }

                stopLoading(submitBtn);
                loginLock = false;
                isSubmitting = false;
            }

        } catch (error) {
            console.error('[auth] ❌ Login error:', error);
            setMsg(loginMsg, 'Terjadi kesalahan: ' + error.message, 'error');
            stopLoading(submitBtn);
            loginLock = false;
            isSubmitting = false;
        }
    });

    // ============================================================
    // 10. REGISTER SUBMIT
    // ============================================================
    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (isSubmitting) return;

        const nama = val('reg-nama');
        const username = val('reg-username');
        const passwordEl = document.getElementById('reg-password');
        const passwordConfirmEl = document.getElementById('reg-password-confirm');
        const password = passwordEl ? passwordEl.value : '';
        const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';
        const no_hp = val('reg-no_hp');
        const kalurahan = val('reg-kalurahan');
        const pertanyaan = val('reg-pertanyaan');
        const jawaban = val('reg-jawaban');
        const nama_pengurus = val('reg-nama_pengurus');
        const jabatan = val('reg-jabatan');
        const commitment = document.getElementById('reg-commitment');

        if (!nama) { setMsg(regMsg, 'Nama lengkap wajib diisi!', 'error'); return; }
        if (nama.length < 3) { setMsg(regMsg, 'Nama minimal 3 karakter!', 'error'); return; }
        if (!username) { setMsg(regMsg, 'Username/Email wajib diisi!', 'error'); return; }
        if (!password) { setMsg(regMsg, 'Password wajib diisi!', 'error'); return; }
        if (password.length < 6) { setMsg(regMsg, 'Password minimal 6 karakter!', 'error'); return; }
        if (password !== passwordConfirm) { setMsg(regMsg, 'Password tidak cocok!', 'error'); return; }
        if (!no_hp) { setMsg(regMsg, 'No. HP wajib diisi!', 'error'); return; }
        if (!kalurahan) { setMsg(regMsg, 'Kalurahan wajib dipilih!', 'error'); return; }
        if (!pertanyaan) { setMsg(regMsg, 'Pertanyaan keamanan wajib dipilih!', 'error'); return; }
        if (!jawaban) { setMsg(regMsg, 'Jawaban keamanan wajib diisi!', 'error'); return; }
        if (commitment && !commitment.checked) {
            setMsg(regMsg, 'Anda harus menyatakan berkhidmat untuk organisasi.', 'error');
            return;
        }

        isSubmitting = true;
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        startLoading(submitBtn, 'Mendaftar...');
        setMsg(regMsg, 'Memproses pendaftaran...', 'info');

        try {
            const result = await apiCall('register', 'POST', {
                username, password, nama, no_hp, kalurahan,
                pertanyaan, jawaban, nama_pengurus, jabatan
            });

            if (result && result.success) {
                setMsg(regMsg, result.message || '✅ Registrasi berhasil! Menunggu persetujuan admin.', 'success');
                showToast('Registrasi berhasil! Tunggu persetujuan admin.', 'success', 4000);

                registerForm.reset();
                if (commitment) commitment.checked = false;

                setTimeout(() => {
                    switchTab('login');
                    try { SafeSessionStorage.removeItem('authTab'); } catch (e) {}
                }, 2500);
            } else {
                setMsg(regMsg, (result && result.message) || 'Registrasi gagal', 'error');
            }
        } catch (error) {
            console.error('[auth] Register error:', error);
            setMsg(regMsg, 'Terjadi kesalahan: ' + error.message, 'error');
        } finally {
            stopLoading(submitBtn);
            isSubmitting = false;
        }
    });

    // ============================================================
    // 11. LUPA AKUN - MODAL
    // ============================================================
    function openForgotModal(mode) {
        if (!forgotModal) return;
        mode = mode || 'password';

        forgotModal.classList.remove('hidden');
        forgotModal.classList.add('flex');

        setTimeout(() => {
            if (forgotContent) {
                forgotContent.classList.remove('scale-95', 'opacity-0');
                forgotContent.classList.add('scale-100', 'opacity-100');
            }
        }, 10);

        const radio = document.querySelector('input[name="forgotMode"][value="' + mode + '"]');
        if (radio) radio.checked = true;
        forgotMode = mode;
        updateModeUI();

        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
        if (step3) step3.classList.add('hidden');

        if (forgotUsername) forgotUsername.value = '';
        if (forgotPhone) forgotPhone.value = '';
        if (forgotAnswer) forgotAnswer.value = '';
        if (msg1) msg1.textContent = '';
        if (msg2) msg2.textContent = '';
        if (forgotResultContent) forgotResultContent.innerHTML = '';

        setTimeout(() => {
            if (forgotMode === 'password' && forgotUsername) forgotUsername.focus();
            else if (forgotPhone) forgotPhone.focus();
        }, 200);
    }

    function closeForgotModal() {
        if (!forgotModal) return;
        if (forgotContent) {
            forgotContent.classList.remove('scale-100', 'opacity-100');
            forgotContent.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            forgotModal.classList.add('hidden');
            forgotModal.classList.remove('flex');
        }, 300);
        document.body.style.overflow = '';
    }

    function updateModeUI() {
        if (!step1Desc) return;
        const passInput = document.getElementById('forgot-password-input');
        const userInput = document.getElementById('forgot-username-input');

        if (forgotMode === 'password') {
            if (passInput) passInput.classList.remove('hidden');
            if (userInput) userInput.classList.add('hidden');
            step1Desc.textContent = 'Masukkan username/email Anda. Kami akan menampilkan pertanyaan keamanan.';
        } else {
            if (passInput) passInput.classList.add('hidden');
            if (userInput) userInput.classList.remove('hidden');
            step1Desc.textContent = 'Masukkan No. HP Anda. Kami akan menampilkan pertanyaan keamanan.';
        }
    }

    if (forgotLink && forgotModal) {
        const f = forgotLink.cloneNode(true);
        forgotLink.parentNode.replaceChild(f, forgotLink);
        f.addEventListener('click', function(e) {
            e.preventDefault();
            openForgotModal('password');
            document.body.style.overflow = 'hidden';
        });
    }

    if (closeForgotBtn) {
        const f = closeForgotBtn.cloneNode(true);
        closeForgotBtn.parentNode.replaceChild(f, closeForgotBtn);
        f.addEventListener('click', closeForgotModal);
    }

    if (forgotModal) {
        forgotModal.addEventListener('click', function(e) {
            if (e.target === forgotModal) closeForgotModal();
        });
    }

    if (forgotDone) {
        const f = forgotDone.cloneNode(true);
        forgotDone.parentNode.replaceChild(f, forgotDone);
        f.addEventListener('click', closeForgotModal);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && forgotModal && !forgotModal.classList.contains('hidden')) {
            closeForgotModal();
        }
    });

    modeRadios.forEach(function(r) {
        const c = r.cloneNode(true);
        r.parentNode.replaceChild(c, r);
        c.addEventListener('change', function() {
            forgotMode = this.value;
            updateModeUI();
            if (msg1) msg1.textContent = '';
            if (forgotUsername) forgotUsername.value = '';
            if (forgotPhone) forgotPhone.value = '';
        });
    });

    // ============================================================
    // 12. LUPA AKUN - STEP 1
    // ============================================================
    if (forgotNext) {
        const f = forgotNext.cloneNode(true);
        forgotNext.parentNode.replaceChild(f, forgotNext);

        f.addEventListener('click', async function() {
            if (isSubmitting) return;

            let identifier = '';
            if (forgotMode === 'password') {
                identifier = (forgotUsername.value || '').trim();
                if (!identifier) {
                    if (msg1) {
                        msg1.textContent = 'Masukkan username/email!';
                        msg1.className = 'mt-2 text-center text-sm text-red-600';
                    }
                    forgotUsername.focus();
                    return;
                }
            } else {
                identifier = (forgotPhone.value || '').trim();
                if (!identifier) {
                    if (msg1) {
                        msg1.textContent = 'Masukkan No. HP!';
                        msg1.className = 'mt-2 text-center text-sm text-red-600';
                    }
                    forgotPhone.focus();
                    return;
                }
            }

            forgotIdentifier = identifier;
            isSubmitting = true;
            this.disabled = true;

            if (msg1) {
                msg1.textContent = 'Memeriksa...';
                msg1.className = 'mt-2 text-center text-sm text-blue-600';
            }

            try {
                let result;
                if (forgotMode === 'password') {
                    result = await apiCall('getUserQuestion', 'POST', { username: identifier });
                } else {
                    result = await apiCall('getUsernameByPhone', 'POST', { phone: identifier });
                }

                if (result && result.success) {
                    const q = extractQuestion(result);
                    if (forgotQuestionText) forgotQuestionText.textContent = q || '-';
                    if (step1) step1.classList.add('hidden');
                    if (step2) step2.classList.remove('hidden');
                    if (msg2) msg2.textContent = '';

                    setTimeout(() => {
                        if (forgotAnswer) forgotAnswer.focus();
                    }, 200);
                } else {
                    if (msg1) {
                        msg1.textContent = (result && result.message) || 'Data tidak ditemukan.';
                        msg1.className = 'mt-2 text-center text-sm text-red-600';
                    }
                }
            } catch (error) {
                console.error('[auth] Forgot step 1 error:', error);
                if (msg1) {
                    msg1.textContent = 'Error: ' + error.message;
                    msg1.className = 'mt-2 text-center text-sm text-red-600';
                }
            } finally {
                this.disabled = false;
                isSubmitting = false;
            }
        });
    }

    // ============================================================
    // 13. LUPA AKUN - STEP 2
    // ============================================================
    if (forgotVerify) {
        const f = forgotVerify.cloneNode(true);
        forgotVerify.parentNode.replaceChild(f, forgotVerify);

        f.addEventListener('click', async function() {
            if (isSubmitting) return;

            const answer = (forgotAnswer.value || '').trim();
            if (!answer) {
                if (msg2) {
                    msg2.textContent = 'Masukkan jawaban!';
                    msg2.className = 'mt-2 text-center text-sm text-red-600';
                }
                forgotAnswer.focus();
                return;
            }

            isSubmitting = true;
            this.disabled = true;

            if (msg2) {
                msg2.textContent = 'Memverifikasi...';
                msg2.className = 'mt-2 text-center text-sm text-blue-600';
            }

            try {
                let result;
                if (forgotMode === 'password') {
                    result = await apiCall('verifyAnswer', 'POST', {
                        username: forgotIdentifier,
                        answer: answer
                    });
                } else {
                    result = await apiCall('verifyUsernameAnswer', 'POST', {
                        phone: forgotIdentifier,
                        answer: answer
                    });
                }

                if (result && result.success) {
                    if (step2) step2.classList.add('hidden');
                    if (step3) step3.classList.remove('hidden');

                    if (forgotMode === 'password') {
                        // RESET PASSWORD MODE
                        if (forgotResultContent) {
                            forgotResultContent.innerHTML = `
                                <div class="text-center mb-4">
                                    <i class="fas fa-check-circle text-green-500 text-4xl mb-2"></i>
                                    <p class="text-green-600 font-medium">Jawaban benar!</p>
                                    <p class="text-[var(--text-muted)] text-sm mt-1">Silakan masukkan password baru Anda.</p>
                                </div>
                                <div class="mb-4">
                                    <label class="block text-[var(--text-muted)] mb-2 text-sm font-medium">Password Baru</label>
                                    <div class="relative">
                                        <input type="password" id="forgot-new-password"
                                            class="w-full px-4 py-2 pr-10 border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fbbf24]/40 focus:border-[#fbbf24] bg-[var(--bg-body)] text-[var(--text-main)]"
                                            placeholder="Minimal 6 karakter"
                                            autocomplete="new-password">
                                        <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                                            onclick="togglePassword('forgot-new-password', this)">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </div>
                                </div>
                                <button id="forgot-reset" type="button" class="w-full btn-auth py-2 rounded-lg font-medium">
                                    <i class="fas fa-key mr-1"></i>Reset Password
                                </button>
                                <div id="forgot-step3-msg" class="mt-2 text-center text-sm"></div>
                            `;
                        }

                        setTimeout(() => {
                            const resetBtn = document.getElementById('forgot-reset');
                            const newPassInput = document.getElementById('forgot-new-password');
                            const msg3 = document.getElementById('forgot-step3-msg');

                            if (resetBtn && newPassInput) {
                                newPassInput.focus();

                                newPassInput.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        resetBtn.click();
                                    }
                                });

                                resetBtn.addEventListener('click', async function() {
                                    const newPassword = (newPassInput.value || '').trim();
                                    if (!newPassword || newPassword.length < 6) {
                                        if (msg3) {
                                            msg3.textContent = 'Password minimal 6 karakter!';
                                            msg3.className = 'mt-2 text-center text-sm text-red-600';
                                        }
                                        return;
                                    }

                                    this.disabled = true;
                                    const orig = this.innerHTML;
                                    this.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Mereset...';
                                    if (msg3) {
                                        msg3.textContent = 'Mereset password...';
                                        msg3.className = 'mt-2 text-center text-sm text-blue-600';
                                    }

                                    try {
                                        const res = await apiCall('resetPassword', 'POST', {
                                            username: forgotIdentifier,
                                            newPassword: newPassword
                                        });

                                        if (res && res.success) {
                                            if (msg3) {
                                                msg3.textContent = '✅ Password berhasil direset! Silakan login.';
                                                msg3.className = 'mt-2 text-center text-sm text-green-600';
                                            }
                                            showToast('Password berhasil direset!', 'success');

                                            setTimeout(() => {
                                                closeForgotModal();
                                                switchTab('login');
                                                const loginUserEl = document.getElementById('login-username');
                                                if (loginUserEl) loginUserEl.value = forgotIdentifier;
                                                const loginPassEl = document.getElementById('login-password');
                                                if (loginPassEl) loginPassEl.focus();
                                            }, 1500);
                                        } else {
                                            if (msg3) {
                                                msg3.textContent = (res && res.message) || 'Gagal reset password.';
                                                msg3.className = 'mt-2 text-center text-sm text-red-600';
                                            }
                                        }
                                    } catch (error) {
                                        console.error('[auth] Reset password error:', error);
                                        if (msg3) {
                                            msg3.textContent = 'Error: ' + error.message;
                                            msg3.className = 'mt-2 text-center text-sm text-red-600';
                                        }
                                    } finally {
                                        this.disabled = false;
                                        this.innerHTML = orig;
                                    }
                                });
                            }
                        }, 100);

                    } else {
                        // USERNAME MODE
                        const usernameStr = extractUsername(result);

                        if (forgotResultContent) {
                            forgotResultContent.innerHTML = `
                                <div class="text-center">
                                    <i class="fas fa-check-circle text-green-500 text-4xl mb-2"></i>
                                    <p class="text-green-600 font-medium mb-4">Verifikasi berhasil!</p>
                                    <p class="text-[var(--text-muted)] text-sm mb-2">Username Anda adalah:</p>
                                    <div class="bg-[var(--bg-stats)] border border-[var(--card-border)] rounded-lg p-4 mb-4">
                                        <p class="text-xl font-bold text-[var(--text-main)] font-mono break-all">${escapeHtml(usernameStr || '-')}</p>
                                    </div>
                                    <button type="button" onclick="copyForgotUsername('${escapeHtml(usernameStr || '')}')"
                                        class="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                                        <i class="fas fa-copy mr-1"></i>Copy Username
                                    </button>
                                    <p class="text-xs text-[var(--text-muted)] mt-4">
                                        Gunakan username di atas untuk login.
                                    </p>
                                </div>
                            `;
                        }
                    }
                } else {
                    if (msg2) {
                        msg2.textContent = (result && result.message) || 'Jawaban salah.';
                        msg2.className = 'mt-2 text-center text-sm text-red-600';
                    }
                }
            } catch (error) {
                console.error('[auth] Forgot step 2 error:', error);
                if (msg2) {
                    msg2.textContent = 'Error: ' + error.message;
                    msg2.className = 'mt-2 text-center text-sm text-red-600';
                }
            } finally {
                this.disabled = false;
                isSubmitting = false;
            }
        });
    }

    // ============================================================
    // 14. COPY USERNAME
    // ============================================================
    window.copyForgotUsername = function(username) {
        if (!username) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(username)
                .then(() => showToast('Username dicopy: ' + username, 'success', 2500))
                .catch(() => fallbackCopy(username));
        } else {
            fallbackCopy(username);
        }
    };

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('Username dicopy!', 'success', 2500);
        } catch (e) {
            showToast('Gagal copy', 'error');
        }
        document.body.removeChild(ta);
    }

    // ============================================================
    // 15. AUTO-FOCUS
    // ============================================================
    setTimeout(() => {
        if (loginContainer && !loginContainer.classList.contains('hidden')) {
            focusFirst(loginContainer);
        } else if (registerContainer && !registerContainer.classList.contains('hidden')) {
            focusFirst(registerContainer);
        }
    }, 300);

    // ============================================================
    // 16. CLEANUP
    // ============================================================
    function cleanup() {
        window.__authLoaded = false;
        loginLock = false;
        isSubmitting = false;
        console.log('[auth] Cleanup');
    }
    window.__authCleanup = cleanup;

    console.log('[auth] ✅ Init selesai v16.0.0');
});