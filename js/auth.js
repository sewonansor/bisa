/**
 * js/auth.js
 * Modul Autentikasi (Login, Register, Lupa Password, Lupa Username)
 * Versi: 13.0.0 — FULL FIX (FINAL, Prefetch Integrated)
 * ---------------------------------------------------------
 * FITUR v13.0.0:
 *  - ✅ Trigger prefetchRoutes setelah login sukses (dashboard siap)
 *  - ✅ Show progress prefetch di login success state
 *  - ✅ SafeStorage/SafeSessionStorage (Tracking Prevention)
 *  - ✅ Redirect ke dashboard setelah prefetch starting
 *  - ✅ Semua fitur auth dari v11 tetap utuh
 *  - ✅ Better UX dengan double confirmation
 *  - ✅ Anti double-submit
 *
 * FITUR LAMA:
 *  - Tab Login/Register dengan persist state
 *  - Login dengan username/email
 *  - Register dengan 11 field + validasi lengkap
 *  - Password show/hide toggle
 *  - Lupa Password (3-step: identifier → question → new password)
 *  - Lupa Username (3-step: phone → question → username)
 *  - Welcome toast + redirect by role
 *  - Form validation real-time
 *  - Auto-focus field pertama
 *  - Modal lupa akun dengan scale animation
 *  - Dark mode aware
 *  - Mobile responsive
 *  - XSS protection (escapeHtml)
 *  - Clone-replace listener (anti memory leak)
 */

App.register('auth', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__authLoaded) {
        console.log('[auth] Sudah di-init, skip.');
        return;
    }
    window.__authLoaded = true;

    // ================================================================
    // 2. CEK JIKA SUDAH LOGIN → REDIRECT
    // ================================================================
    const existingUser = checkAuth();
    if (existingUser) {
        console.log('[auth] User sudah login, redirect...');
        const dashUrl = existingUser.role === 'admin' ? '/dashboard_admin' : '/dashboard_member';
        router.load(dashUrl);
        return;
    }

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const loginTab          = document.getElementById('login-tab');
    const registerTab       = document.getElementById('register-tab');
    const loginContainer    = document.getElementById('login-form-container');
    const registerContainer = document.getElementById('register-form-container');
    const loginForm         = document.getElementById('login-form');
    const registerForm      = document.getElementById('register-form');
    const formTitle         = document.getElementById('form-title');
    const loginMsg          = document.getElementById('login-message');
    const regMsg            = document.getElementById('register-message');

    // Lupa Akun Modal
    const forgotLink       = document.getElementById('forgot-account-link');
    const forgotModal      = document.getElementById('forgot-account-modal');
    const forgotContent    = document.getElementById('forgot-modal-content');
    const closeForgotBtn   = document.getElementById('close-forgot-modal');
    const modeRadios       = document.querySelectorAll('input[name="forgotMode"]');
    const step1            = document.getElementById('forgot-step-1');
    const step2            = document.getElementById('forgot-step-2');
    const step3            = document.getElementById('forgot-step-3');
    const forgotUsername   = document.getElementById('forgot-username');
    const forgotPhone      = document.getElementById('forgot-phone');
    const forgotNext       = document.getElementById('forgot-next');
    const forgotQuestionText = document.getElementById('forgot-question-text');
    const forgotAnswer     = document.getElementById('forgot-answer');
    const forgotVerify     = document.getElementById('forgot-verify');
    const forgotDone       = document.getElementById('forgot-done');
    const forgotResultContent = document.getElementById('forgot-result-content');
    const msg1             = document.getElementById('forgot-step1-msg');
    const msg2             = document.getElementById('forgot-step2-msg');
    const step1Desc        = document.getElementById('forgot-step1-desc');

    if (!loginForm || !registerForm) {
        console.error('[auth] Elemen form utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let forgotMode = 'password';       // 'password' atau 'username'
    let forgotIdentifier = '';
    let isSubmitting = false;

    // ================================================================
    // 5. HELPER FUNCTIONS
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
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

    function getInputValue(id) {
        const el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
    }

    function focusFirstInput(container) {
        if (!container) return;
        setTimeout(() => {
            const firstInput = container.querySelector('input:not([type="hidden"]):not([disabled])');
            if (firstInput) firstInput.focus();
        }, 150);
    }

    // ================================================================
    // 6. PASSWORD SHOW/HIDE TOGGLE
    // ================================================================
    window.togglePassword = function(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input || !btn) return;

        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            btn.setAttribute('aria-label', 'Sembunyikan password');
        } else {
            input.type = 'password';
            btn.innerHTML = '<i class="fas fa-eye"></i>';
            btn.setAttribute('aria-label', 'Tampilkan password');
        }
    };

    // ================================================================
    // 7. TAB SWITCHING
    // ================================================================
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

        focusFirstInput(isLogin ? loginContainer : registerContainer);
    }

    // Attach tab listeners (clone-replace)
    [loginTab, registerTab].forEach((tab, idx) => {
        if (!tab) return;
        const clone = tab.cloneNode(true);
        tab.parentNode.replaceChild(clone, tab);
        clone.addEventListener('click', function() {
            switchTab(idx === 0 ? 'login' : 'register');
            try {
                if (idx === 1) SafeSessionStorage.setItem('authTab', 'register');
                else SafeSessionStorage.removeItem('authTab');
            } catch (e) {}
        });
    });

    // ================================================================
    // 8. CEK URL/HASH UNTUK INITIAL TAB
    // ================================================================
    (function initInitialTab() {
        let initialTab = 'login';

        // Prioritas 1: hash query (?tab=register)
        if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
            if (window.__currentQuery.get('tab') === 'register') initialTab = 'register';
        }

        // Prioritas 2: hash manual
        if (initialTab === 'login') {
            const hash = window.location.hash || '';
            const qIdx = hash.indexOf('?');
            if (qIdx !== -1) {
                try {
                    const params = new URLSearchParams(hash.substring(qIdx));
                    if (params.get('tab') === 'register') initialTab = 'register';
                } catch (e) {}
            }
        }

        // Prioritas 3: sessionStorage
        if (initialTab === 'login') {
            try {
                if (SafeSessionStorage.getItem('authTab') === 'register') {
                    initialTab = 'register';
                    SafeSessionStorage.removeItem('authTab');
                }
            } catch (e) {}
        }

        // Prioritas 4: search params
        if (initialTab === 'login') {
            try {
                if (new URLSearchParams(window.location.search).get('tab') === 'register') {
                    initialTab = 'register';
                }
            } catch (e) {}
        }

        switchTab(initialTab);
    })();

    // ================================================================
    // 9. LOGIN SUBMIT — dengan Prefetch Trigger
    // ================================================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isSubmitting) return;

        const username = getInputValue('login-username');
        const password = document.getElementById('login-password') ?
                        document.getElementById('login-password').value : '';

        // Validation
        if (!username) {
            setMsg(loginMsg, 'Email/Username wajib diisi!', 'error');
            const el = document.getElementById('login-username');
            if (el) el.focus();
            return;
        }
        if (!password) {
            setMsg(loginMsg, 'Password wajib diisi!', 'error');
            const el = document.getElementById('login-password');
            if (el) el.focus();
            return;
        }

        isSubmitting = true;
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        startLoading(submitBtn, 'Login...');
        setMsg(loginMsg, 'Memproses login...', 'info');

        try {
            const result = await apiCall('login', 'POST', { username, password });

            if (result && result.success && result.user) {
                // ============================================
                // LOGIN SUKSES
                // ============================================

                // 1) Simpan user
                try {
                    SafeStorage.setItem('user', JSON.stringify(result.user));
                } catch (err) {
                    console.warn('[auth] Failed to save user:', err);
                }

                // 2) Update UI
                const userName = result.user.nama || result.user.username || 'User';
                setMsg(loginMsg, '✅ Login berhasil! Menyiapkan dashboard...', 'success');
                showToast('Selamat datang, ' + userName + '!', 'success', 2500);

                // 3) Trigger PREFETCH dashboard (background)
                //    Berjalan paralel dengan redirect — user tidak menunggu
                if (typeof window.prefetchRoutes === 'function') {
                    setTimeout(() => {
                        window.prefetchRoutes(result.user.role).catch((err) => {
                            console.warn('[auth] Prefetch error:', err);
                        });
                    }, 200);
                }

                // 4) Update button text ke "Menyiapkan dashboard..."
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyiapkan dashboard...';
                }

                // 5) Redirect ke dashboard
                const dashUrl = result.user.role === 'admin'
                    ? '/dashboard_admin'
                    : '/dashboard_member';

                setTimeout(() => {
                    router.load(dashUrl);
                }, 900);

            } else {
                setMsg(loginMsg, (result && result.message) || 'Login gagal', 'error');

                // Clear password field
                const passEl = document.getElementById('login-password');
                if (passEl) { passEl.value = ''; passEl.focus(); }

                stopLoading(submitBtn);
                isSubmitting = false;
            }
        } catch (error) {
            console.error('[auth] Login error:', error);
            setMsg(loginMsg, 'Terjadi kesalahan: ' + error.message, 'error');
            stopLoading(submitBtn);
            isSubmitting = false;
        }
    });

    // ================================================================
    // 10. REGISTER SUBMIT
    // ================================================================
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isSubmitting) return;

        // Get all fields
        const nama = getInputValue('reg-nama');
        const username = getInputValue('reg-username');
        const password = document.getElementById('reg-password') ?
                        document.getElementById('reg-password').value : '';
        const passwordConfirm = document.getElementById('reg-password-confirm') ?
                               document.getElementById('reg-password-confirm').value : '';
        const no_hp = getInputValue('reg-no_hp');
        const kalurahan = getInputValue('reg-kalurahan');
        const pertanyaan = getInputValue('reg-pertanyaan');
        const jawaban = getInputValue('reg-jawaban');
        const nama_pengurus = getInputValue('reg-nama_pengurus');
        const jabatan = getInputValue('reg-jabatan');
        const commitment = document.getElementById('reg-commitment');

        // ===== Validation =====
        if (!nama) {
            setMsg(regMsg, 'Nama lengkap wajib diisi!', 'error');
            const el = document.getElementById('reg-nama');
            if (el) el.focus();
            return;
        }
        if (nama.length < 3) {
            setMsg(regMsg, 'Nama minimal 3 karakter!', 'error');
            return;
        }
        if (!username) {
            setMsg(regMsg, 'Username/Email wajib diisi!', 'error');
            const el = document.getElementById('reg-username');
            if (el) el.focus();
            return;
        }
        if (!password) {
            setMsg(regMsg, 'Password wajib diisi!', 'error');
            const el = document.getElementById('reg-password');
            if (el) el.focus();
            return;
        }
        if (password.length < 6) {
            setMsg(regMsg, 'Password minimal 6 karakter!', 'error');
            const el = document.getElementById('reg-password');
            if (el) el.focus();
            return;
        }
        if (password !== passwordConfirm) {
            setMsg(regMsg, 'Password dan konfirmasi tidak cocok!', 'error');
            const el = document.getElementById('reg-password-confirm');
            if (el) el.focus();
            return;
        }
        if (!no_hp) {
            setMsg(regMsg, 'No. HP wajib diisi!', 'error');
            const el = document.getElementById('reg-no_hp');
            if (el) el.focus();
            return;
        }
        if (!kalurahan) {
            setMsg(regMsg, 'Kalurahan wajib dipilih!', 'error');
            const el = document.getElementById('reg-kalurahan');
            if (el) el.focus();
            return;
        }
        if (!pertanyaan) {
            setMsg(regMsg, 'Pertanyaan keamanan wajib dipilih!', 'error');
            const el = document.getElementById('reg-pertanyaan');
            if (el) el.focus();
            return;
        }
        if (!jawaban) {
            setMsg(regMsg, 'Jawaban keamanan wajib diisi!', 'error');
            const el = document.getElementById('reg-jawaban');
            if (el) el.focus();
            return;
        }
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

                // Reset form
                registerForm.reset();
                if (commitment) commitment.checked = false;

                // Switch to login after 2.5s
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

    // ================================================================
    // 11. LUPA AKUN - MODAL
    // ================================================================
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

    // Attach open modal
    if (forgotLink && forgotModal) {
        const fresh = forgotLink.cloneNode(true);
        forgotLink.parentNode.replaceChild(fresh, forgotLink);
        fresh.addEventListener('click', (e) => {
            e.preventDefault();
            openForgotModal('password');
            document.body.style.overflow = 'hidden';
        });
    }

    // Attach close modal
    if (closeForgotBtn) {
        const fresh = closeForgotBtn.cloneNode(true);
        closeForgotBtn.parentNode.replaceChild(fresh, closeForgotBtn);
        fresh.addEventListener('click', closeForgotModal);
    }
    if (forgotModal) {
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) closeForgotModal();
        });
    }
    if (forgotDone) {
        const fresh = forgotDone.cloneNode(true);
        forgotDone.parentNode.replaceChild(fresh, forgotDone);
        fresh.addEventListener('click', closeForgotModal);
    }

    // ESC close
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && forgotModal && !forgotModal.classList.contains('hidden')) {
            closeForgotModal();
        }
    });

    // Radio change
    modeRadios.forEach(radio => {
        const clone = radio.cloneNode(true);
        radio.parentNode.replaceChild(clone, radio);
        clone.addEventListener('change', function() {
            forgotMode = this.value;
            updateModeUI();
            if (msg1) msg1.textContent = '';
            if (forgotUsername) forgotUsername.value = '';
            if (forgotPhone) forgotPhone.value = '';
        });
    });

    // ================================================================
    // 12. LUPA AKUN - STEP 1: CEK USER
    // ================================================================
    if (forgotNext) {
        const fresh = forgotNext.cloneNode(true);
        forgotNext.parentNode.replaceChild(fresh, forgotNext);

        fresh.addEventListener('click', async function() {
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
                    if (forgotQuestionText) forgotQuestionText.textContent = result.question || '-';
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

    // ================================================================
    // 13. LUPA AKUN - STEP 2: VERIFIKASI JAWABAN
    // ================================================================
    if (forgotVerify) {
        const fresh = forgotVerify.cloneNode(true);
        forgotVerify.parentNode.replaceChild(fresh, forgotVerify);

        fresh.addEventListener('click', async function() {
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
                        // Tampilkan form password baru
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

                        // Attach reset password handler
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
                                    const originalText = this.innerHTML;
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
                                        this.innerHTML = originalText;
                                    }
                                });
                            }
                        }, 100);
                    } else {
                        // Mode username: tampilkan username
                        if (forgotResultContent) {
                            forgotResultContent.innerHTML = `
                                <div class="text-center">
                                    <i class="fas fa-check-circle text-green-500 text-4xl mb-2"></i>
                                    <p class="text-green-600 font-medium mb-4">Verifikasi berhasil!</p>
                                    <p class="text-[var(--text-muted)] text-sm mb-2">Username Anda adalah:</p>
                                    <div class="bg-[var(--bg-stats)] border border-[var(--card-border)] rounded-lg p-4 mb-4">
                                        <p class="text-xl font-bold text-[var(--text-main)] font-mono break-all">${escapeHtml(result.username || '-')}</p>
                                    </div>
                                    <button type="button" onclick="copyForgotUsername('${escapeHtml(result.username || '')}')"
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

    // ================================================================
    // 14. COPY USERNAME (dari modal lupa akun)
    // ================================================================
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

    // ================================================================
    // 15. INIT
    // ================================================================
    console.log('[auth] Init selesai — v13.0.0 (Prefetch Integrated)');

    // Auto-focus first input pada tab aktif
    setTimeout(() => {
        if (loginContainer && !loginContainer.classList.contains('hidden')) {
            focusFirstInput(loginContainer);
        } else if (registerContainer && !registerContainer.classList.contains('hidden')) {
            focusFirstInput(registerContainer);
        }
    }, 300);

    // ================================================================
    // 16. CLEANUP (opsional, untuk navigate keluar)
    // ================================================================
    function cleanup() {
        window.__authLoaded = false;
    }
    window.__authCleanup = cleanup;

});