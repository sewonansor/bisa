/**
 * full js/auth.js
 * Modul Autentikasi (Login, Register, Lupa Akun)
 * Terbaru lengkap semua menu berfungsi tanpa error siap pakai SPA
 */

App.register('auth', function() {

    // ===== DOM ELEMENTS =====
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginContainer = document.getElementById('login-form-container');
    const registerContainer = document.getElementById('register-form-container');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const formTitle = document.getElementById('form-title');
    const loginMsg = document.getElementById('login-message');
    const regMsg = document.getElementById('register-message');

    // ===== FUNGSI SWITCH TAB =====
    function switchTab(activeTab, inactiveTab, activeContainer, inactiveContainer, title) {
        // Update Tombol Tab
        activeTab.classList.add('border-green-700', 'text-green-700', 'dark:border-green-400', 'dark:text-green-400');
        activeTab.classList.remove('text-gray-500', 'dark:text-gray-400');
        inactiveTab.classList.remove('border-green-700', 'text-green-700', 'dark:border-green-400', 'dark:text-green-400');
        inactiveTab.classList.add('text-gray-500', 'dark:text-gray-400');

        // Update Container menggunakan Tailwind hidden class
        inactiveContainer.classList.add('hidden');
        activeContainer.classList.remove('hidden');

        // Update Title & Reset Message
        formTitle.textContent = title;
        loginMsg.textContent = '';
        regMsg.textContent = '';
    }

    // ===== EVENT LISTENER TAB =====
    if (loginTab && registerTab) {
        loginTab.addEventListener('click', () => {
            switchTab(loginTab, registerTab, loginContainer, registerContainer, 'Login');
        });
        registerTab.addEventListener('click', () => {
            switchTab(registerTab, loginTab, registerContainer, loginContainer, 'Register');
        });
    }

    // ===== CEK PARAMETER URL =====
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'register' || sessionStorage.getItem('authTab') === 'register') {
        registerTab.click();
        sessionStorage.removeItem('authTab');
    }

    // ===== TOGGLE PASSWORD VISIBILITY =====
    window.togglePassword = function(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            btn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    };

    // ===== LOGIN =====
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        loginMsg.textContent = 'Memproses...';
        loginMsg.className = 'mt-2 text-center text-sm text-blue-600';

        try {
            const result = await apiCall('login', 'POST', { username, password });
            if (result.success) {
                localStorage.setItem('user', JSON.stringify(result.user));
                loginMsg.textContent = 'Login berhasil! Mengarahkan...';
                loginMsg.className = 'mt-2 text-center text-sm text-green-600';
                const role = result.user.role;
                router.load(role === 'admin' ? '/dashboard_admin' : '/dashboard_member');
            } else {
                loginMsg.textContent = result.message || 'Login gagal';
                loginMsg.className = 'mt-2 text-center text-sm text-red-600';
            }
        } catch (error) {
            loginMsg.textContent = 'Terjadi kesalahan: ' + error.message;
            loginMsg.className = 'mt-2 text-center text-sm text-red-600';
        }
    });

    // ===== REGISTER =====
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const commitment = document.getElementById('reg-commitment');
        if (!commitment.checked) {
            regMsg.textContent = 'Anda harus menyatakan berkhidmat untuk organisasi.';
            regMsg.className = 'mt-2 text-center text-sm text-red-600';
            return;
        }

        const nama = document.getElementById('reg-nama').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const passwordConfirm = document.getElementById('reg-password-confirm').value;
        const no_hp = document.getElementById('reg-no_hp').value;
        const kalurahan = document.getElementById('reg-kalurahan').value;
        const pertanyaan = document.getElementById('reg-pertanyaan').value;
        const jawaban = document.getElementById('reg-jawaban').value;
        const nama_pengurus = document.getElementById('reg-nama_pengurus').value;
        const jabatan = document.getElementById('reg-jabatan').value;

        if (password.length < 6) {
            regMsg.textContent = 'Password minimal 6 karakter!';
            regMsg.className = 'mt-2 text-center text-sm text-red-600';
            return;
        }
        if (password !== passwordConfirm) {
            regMsg.textContent = 'Password dan konfirmasi tidak cocok!';
            regMsg.className = 'mt-2 text-center text-sm text-red-600';
            return;
        }

        regMsg.textContent = 'Memproses...';
        regMsg.className = 'mt-2 text-center text-sm text-blue-600';

        try {
            const result = await apiCall('register', 'POST', {
                username, password, nama, no_hp, kalurahan, pertanyaan, jawaban,
                nama_pengurus, jabatan
            });
            if (result.success) {
                regMsg.textContent = result.message || 'Registrasi berhasil! Silakan tunggu persetujuan admin.';
                regMsg.className = 'mt-2 text-center text-sm text-green-600';
                registerForm.reset();
                commitment.checked = false;
                setTimeout(() => loginTab.click(), 2000);
            } else {
                regMsg.textContent = result.message || 'Registrasi gagal';
                regMsg.className = 'mt-2 text-center text-sm text-red-600';
            }
        } catch (error) {
            regMsg.textContent = 'Terjadi kesalahan: ' + error.message;
            regMsg.className = 'mt-2 text-center text-sm text-red-600';
        }
    });

    // ===== LUPA AKUN (PASSWORD & USERNAME) =====
    const forgotLink = document.getElementById('forgot-account-link');
    const forgotModal = document.getElementById('forgot-account-modal');
    const forgotContent = document.getElementById('forgot-modal-content');
    const closeForgot = document.getElementById('close-forgot-modal');
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

    let forgotMode = 'password'; // 'password' atau 'username'
    let forgotIdentifier = ''; // username atau no_hp

    // Buka modal dengan mode default (password)
    function openForgotModal(mode = 'password') {
        forgotModal.classList.remove('hidden');
        forgotModal.classList.add('flex');
        setTimeout(() => {
            forgotContent.classList.remove('scale-95', 'opacity-0');
            forgotContent.classList.add('scale-100', 'opacity-100');
        }, 10);

        // Set mode radio
        document.querySelector(`input[name="forgotMode"][value="${mode}"]`).checked = true;
        forgotMode = mode;
        updateModeUI();

        step1.classList.remove('hidden');
        step2.classList.add('hidden');
        step3.classList.add('hidden');
        forgotUsername.value = '';
        forgotPhone.value = '';
        forgotAnswer.value = '';
        msg1.textContent = '';
        msg2.textContent = '';
        forgotResultContent.innerHTML = '';
    }

    function closeForgotModal() {
        forgotContent.classList.remove('scale-100', 'opacity-100');
        forgotContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            forgotModal.classList.add('hidden');
            forgotModal.classList.remove('flex');
        }, 300);
    }

    // Update UI berdasarkan mode
    function updateModeUI() {
        if (forgotMode === 'password') {
            document.getElementById('forgot-password-input').classList.remove('hidden');
            document.getElementById('forgot-username-input').classList.add('hidden');
            step1Desc.textContent = 'Masukkan username Anda. Kami akan menampilkan pertanyaan keamanan.';
        } else {
            document.getElementById('forgot-password-input').classList.add('hidden');
            document.getElementById('forgot-username-input').classList.remove('hidden');
            step1Desc.textContent = 'Masukkan No. HP Anda. Kami akan menampilkan pertanyaan keamanan.';
        }
    }

    // Radio change listener
    modeRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            forgotMode = this.value;
            updateModeUI();
            // Reset pesan
            msg1.textContent = '';
        });
    });

    // Open modal from link
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            openForgotModal('password'); // default password
        });
    }

    if (closeForgot) {
        closeForgot.addEventListener('click', closeForgotModal);
    }
    if (forgotModal) {
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) closeForgotModal();
        });
    }

    // Step 1: Lanjut
    if (forgotNext) {
        forgotNext.addEventListener('click', async () => {
            let identifier = '';
            if (forgotMode === 'password') {
                identifier = forgotUsername.value.trim();
                if (!identifier) {
                    msg1.textContent = 'Masukkan username!';
                    msg1.className = 'mt-2 text-center text-sm text-red-600';
                    return;
                }
            } else {
                identifier = forgotPhone.value.trim();
                if (!identifier) {
                    msg1.textContent = 'Masukkan No. HP!';
                    msg1.className = 'mt-2 text-center text-sm text-red-600';
                    return;
                }
            }

            msg1.textContent = 'Memeriksa...';
            msg1.className = 'mt-2 text-center text-sm text-blue-600';
            forgotIdentifier = identifier;

            try {
                let result;
                if (forgotMode === 'password') {
                    result = await apiCall('getUserQuestion', 'POST', { username: identifier });
                } else {
                    result = await apiCall('getUsernameByPhone', 'POST', { phone: identifier });
                }

                if (result.success) {
                    forgotQuestionText.textContent = result.question;
                    step1.classList.add('hidden');
                    step2.classList.remove('hidden');
                    msg2.textContent = '';
                } else {
                    msg1.textContent = result.message || 'Data tidak ditemukan.';
                    msg1.className = 'mt-2 text-center text-sm text-red-600';
                }
            } catch (error) {
                msg1.textContent = 'Error: ' + error.message;
                msg1.className = 'mt-2 text-center text-sm text-red-600';
            }
        });
    }

    // Step 2: Verifikasi jawaban
    if (forgotVerify) {
        forgotVerify.addEventListener('click', async () => {
            const answer = forgotAnswer.value.trim();
            if (!answer) {
                msg2.textContent = 'Masukkan jawaban!';
                msg2.className = 'mt-2 text-center text-sm text-red-600';
                return;
            }
            msg2.textContent = 'Memverifikasi...';
            msg2.className = 'mt-2 text-center text-sm text-blue-600';

            try {
                let result;
                if (forgotMode === 'password') {
                    result = await apiCall('verifyAnswer', 'POST', { username: forgotIdentifier, answer });
                } else {
                    result = await apiCall('verifyUsernameAnswer', 'POST', { phone: forgotIdentifier, answer });
                }

                if (result.success) {
                    step2.classList.add('hidden');
                    step3.classList.remove('hidden');

                    if (forgotMode === 'password') {
                        forgotResultContent.innerHTML = `
                            <p class="text-green-600 text-center mb-4">Jawaban benar! Silakan masukkan password baru.</p>
                            <div class="mb-4">
                                <label class="block text-gray-700 mb-2 text-sm font-medium">Password Baru</label>
                                <input type="password" id="forgot-new-password" class="auth-input" placeholder="Minimal 6 karakter" required>
                            </div>
                            <button id="forgot-reset" class="w-full btn-auth py-2 rounded-lg font-medium">Reset Password</button>
                            <div id="forgot-step3-msg" class="mt-2 text-center text-sm"></div>
                        `;
                        // Event listener for reset password
                        document.getElementById('forgot-reset').addEventListener('click', async function() {
                            const newPassword = document.getElementById('forgot-new-password').value.trim();
                            const msg3 = document.getElementById('forgot-step3-msg');
                            if (!newPassword || newPassword.length < 6) {
                                msg3.textContent = 'Password minimal 6 karakter!';
                                msg3.className = 'mt-2 text-center text-sm text-red-600';
                                return;
                            }
                            msg3.textContent = 'Mereset...';
                            msg3.className = 'mt-2 text-center text-sm text-blue-600';
                            try {
                                const res = await apiCall('resetPassword', 'POST', { username: forgotIdentifier, newPassword });
                                if (res.success) {
                                    msg3.textContent = 'Password berhasil direset! Silakan login.';
                                    msg3.className = 'mt-2 text-center text-sm text-green-600';
                                    setTimeout(() => {
                                        closeForgotModal();
                                        loginTab.click();
                                    }, 1500);
                                } else {
                                    msg3.textContent = res.message || 'Gagal reset password.';
                                    msg3.className = 'mt-2 text-center text-sm text-red-600';
                                }
                            } catch (error) {
                                msg3.textContent = 'Error: ' + error.message;
                                msg3.className = 'mt-2 text-center text-sm text-red-600';
                            }
                        });
                    } else {
                        // Mode username: tampilkan username
                        forgotResultContent.innerHTML = `
                            <div class="text-center">
                                <p class="text-green-600 mb-2">Verifikasi berhasil!</p>
                                <p class="text-gray-700">Username Anda adalah:</p>
                                <p class="text-2xl font-bold text-[#0f2922] mt-2">${result.username}</p>
                                <p class="text-sm text-gray-500 mt-4">Silakan gunakan username tersebut untuk login.</p>
                            </div>
                        `;
                    }
                } else {
                    msg2.textContent = result.message || 'Jawaban salah.';
                    msg2.className = 'mt-2 text-center text-sm text-red-600';
                }
            } catch (error) {
                msg2.textContent = 'Error: ' + error.message;
                msg2.className = 'mt-2 text-center text-sm text-red-600';
            }
        });
    }

    // Done button (menutup modal)
    if (forgotDone) {
        forgotDone.addEventListener('click', closeForgotModal);
    }

});