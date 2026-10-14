/**
 * js/form_view.js
 * Form Publik — Isi Form
 * Versi: 2.0.0 — Full Featured (All Menus Working)
 * ---------------------------------------------------------
 * FITUR:
 *  - Load form by slug
 *  - Validasi: status, accept_responses, deadline, response_limit
 *  - Render dinamis 10 tipe field (text, textarea, email, number, date, time, radio, checkbox, select, rating)
 *  - Auto-ask nama responden (wajib)
 *  - Auto-ask email (jika collect_email = yes)
 *  - Rating bintang interaktif
 *  - Validasi required real-time
 *  - Submit dengan error handling
 *  - Success state + custom message
 *  - Error state + retry
 *  - Fill again button
 *  - Guard anti-duplikasi
 *  - XSS protection
 *  - Mobile responsive
 *  - Dark mode aware
 */

App.register('form_view', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__formViewLoaded) {
        console.log('[form_view] Skip - already loaded');
        return;
    }
    window.__formViewLoaded = true;

    // ================================================================
    // 2. GET SLUG FROM URL (3 FALLBACK)
    // ================================================================
    let slug = '';
    // Prioritas 1: dari router SPA
    if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
        slug = window.__currentQuery.get('id') || '';
    }
    // Prioritas 2: dari hash
    if (!slug) {
        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx !== -1) {
            try {
                const params = new URLSearchParams(hash.substring(qIdx));
                slug = params.get('id') || '';
            } catch (e) {}
        }
    }
    // Prioritas 3: dari search params
    if (!slug) {
        try {
            slug = new URLSearchParams(window.location.search).get('id') || '';
        } catch (e) {}
    }

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const loadingEl = document.getElementById('form-loading');
    const contentEl = document.getElementById('form-content');
    const successEl = document.getElementById('form-success');
    const errorEl = document.getElementById('form-error');
    const headerEl = document.getElementById('form-header');
    const publicForm = document.getElementById('public-form');
    const successMsg = document.getElementById('success-msg');
    const errorMsg = document.getElementById('error-msg');
    const submitBtn = document.getElementById('fv-submit-btn');

    if (!loadingEl || !contentEl || !successEl || !errorEl || !publicForm) {
        console.error('[form_view] Critical elements missing');
        return;
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let formData = null;
    let fieldsData = [];
    let ratingValues = {};
    let isSubmitting = false;
    let isLoading = false;

    // ================================================================
    // 5. HELPERS
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function showState(stateName) {
        ['loading', 'content', 'success', 'error'].forEach(name => {
            const el = document.getElementById('form-' + name);
            if (el) {
                if (name === stateName) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        });
        // Scroll ke atas
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    }

    function setError(msg) {
        if (errorMsg) errorMsg.textContent = msg || 'Form tidak tersedia.';
        showState('error');
    }

    // ================================================================
    // 6. LOAD FORM
    // ================================================================
    async function loadForm() {
        if (isLoading) return;
        isLoading = true;

        // Reset state
        formData = null;
        fieldsData = [];
        ratingValues = {};
        isSubmitting = false;

        showState('loading');

        // Guard slug
        if (!slug) {
            isLoading = false;
            setError('Link form tidak valid. Silakan cek kembali link yang Anda terima.');
            return;
        }

        try {
            // === STEP 1: Get form by slug ===
            console.log('[form_view] Loading form with slug:', slug);
            const formRes = await apiCall('getFormBySlug', 'POST', { slug: slug });

            if (!formRes || !formRes.success || !formRes.data) {
                isLoading = false;
                setError((formRes && formRes.message) || 'Form tidak ditemukan. Pastikan link sudah benar.');
                return;
            }

            formData = formRes.data;
            console.log('[form_view] Form loaded:', formData.title);

            // === STEP 2: Validate status ===
            if (formData.status !== 'published') {
                isLoading = false;
                if (formData.status === 'draft') {
                    setError('Form ini belum dipublikasikan oleh admin. Silakan coba lagi nanti.');
                } else if (formData.status === 'closed') {
                    setError('Form ini sudah ditutup oleh admin.');
                } else {
                    setError('Form tidak dapat diakses saat ini.');
                }
                return;
            }

            // === STEP 3: Validate accept_responses ===
            if (formData.accept_responses !== 'yes') {
                isLoading = false;
                setError('Form ini sedang tidak menerima respon. Silakan coba lagi nanti.');
                return;
            }

            // === STEP 4: Validate deadline ===
            if (formData.deadline) {
                const dl = new Date(formData.deadline);
                if (!isNaN(dl.getTime())) {
                    const now = new Date();
                    if (dl < now) {
                        isLoading = false;
                        const dlStr = dl.toLocaleDateString('id-ID', {
                            day: 'numeric', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        });
                        setError('Form ini sudah melewati deadline pada ' + dlStr + '.');
                        return;
                    }
                }
            }

            // === STEP 5: Validate response_limit ===
            if (formData.response_limit) {
                const limit = Number(formData.response_limit);
                if (limit > 0) {
                    try {
                        const respRes = await apiCall('getFormResponses', 'POST', { form_id: formData.id });
                        const count = (respRes && respRes.success && Array.isArray(respRes.data))
                            ? respRes.data.length : 0;

                        if (count >= limit) {
                            isLoading = false;
                            setError('Form ini sudah mencapai batas maksimal respon (' + limit + ').');
                            return;
                        }
                    } catch (e) {
                        console.warn('[form_view] Count responses error:', e);
                    }
                }
            }

            // === STEP 6: Get fields ===
            const fieldsRes = await apiCall('getFormFields', 'POST', { form_id: formData.id });
            fieldsData = (fieldsRes && fieldsRes.success && Array.isArray(fieldsRes.data))
                ? fieldsRes.data : [];

            // Sort by order
            fieldsData.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

            console.log('[form_view] Fields loaded:', fieldsData.length);

            // === STEP 7: Render ===
            renderForm();
            isLoading = false;

        } catch (error) {
            console.error('[form_view] Load error:', error);
            isLoading = false;
            setError('Gagal memuat form: ' + (error.message || 'Unknown error'));
        }
    }

    // ================================================================
    // 7. RENDER FORM
    // ================================================================
    function renderForm() {
        renderHeader();
        renderFields();
        renderSubmitButton();
        showState('content');
    }

    // === HEADER ===
    function renderHeader() {
        if (!headerEl || !formData) return;

        let html = '';

        // Title
        html += '<h1 class="fv-header-title">' + escapeHtml(formData.title || 'Formulir') + '</h1>';

        // Description
        if (formData.description && formData.description.trim()) {
            html += '<p class="fv-header-desc">' + escapeHtml(formData.description) + '</p>';
        }

        // Meta info
        html += '<div class="fv-header-meta">';
        html += '<i class="fas fa-shield-alt"></i>';
        html += '<span>Jawaban Anda aman &amp; hanya digunakan untuk keperluan organisasi</span>';
        html += '</div>';

        headerEl.innerHTML = html;
    }

    // === FIELDS ===
    function renderFields() {
        if (!publicForm) return;

        let html = '';

        // === FIELD 0: Nama Responden (WAJIB) ===
        html += renderFieldWrapper({
            number: 1,
            label: 'Nama Lengkap Anda',
            required: true,
            help: '',
            content: '<input type="text" name="__respondent_name" required placeholder="Masukkan nama lengkap Anda" class="fv-input" autocomplete="name" maxlength="120">'
        });

        let fieldNumber = 2;

        // === FIELD 1: Email (jika collect_email) ===
        if (formData.collect_email === 'yes') {
            html += renderFieldWrapper({
                number: fieldNumber,
                label: 'Alamat Email',
                required: true,
                help: 'Email akan digunakan untuk keperluan konfirmasi',
                content: '<input type="email" name="__respondent_email" required placeholder="nama@email.com" class="fv-input" autocomplete="email" maxlength="120">'
            });
            fieldNumber++;
        }

        // === FIELDS CUSTOM ===
        if (fieldsData.length === 0) {
            html += '<div class="fv-field" style="text-align: center; padding: 32px 20px; color: var(--fv-text-muted);">';
            html += '<i class="fas fa-inbox" style="font-size: 2.5rem; opacity: 0.4; display: block; margin-bottom: 12px;"></i>';
            html += '<p style="margin: 0; font-size: 0.9rem;">Form ini belum memiliki pertanyaan.</p>';
            html += '</div>';
        } else {
            fieldsData.forEach(f => {
                const fieldHtml = renderField(f, fieldNumber);
                html += fieldHtml;
                fieldNumber++;
            });
        }

        publicForm.innerHTML = html;

        // Attach rating handlers
        attachRatingHandlers();

        // Attach real-time validation
        attachFieldValidation();
    }

    // === WRAPPER ===
    function renderFieldWrapper(opts) {
        const number = opts.number;
        const label = opts.label;
        const required = opts.required;
        const help = opts.help || '';
        const content = opts.content;
        const fieldId = opts.fieldId || '';
        const fieldName = opts.fieldName || '';

        let html = '<div class="fv-field" ' + (fieldId ? 'data-field-id="' + escapeAttr(fieldId) + '"' : '') + '>';
        html += '<label class="fv-field-label">';
        html += '<span class="fv-field-number">' + number + '</span>';
        html += '<span class="fv-field-label-text">' + escapeHtml(label);
        if (required) html += '<span class="fv-required-mark">*</span>';
        html += '</span>';
        html += '</label>';
        if (help) {
            html += '<p class="fv-field-help">' + escapeHtml(help) + '</p>';
        }
        html += content;
        // Error message placeholder
        html += '<div class="fv-field-error-msg" data-error-for="' + escapeAttr(fieldName) + '"><i class="fas fa-exclamation-circle"></i><span></span></div>';
        html += '</div>';

        return html;
    }

    // === RENDER SINGLE FIELD ===
    function renderField(f, num) {
        const required = (f.required === 'yes' || f.required === true);
        const fieldName = 'field_' + f.id;
        const label = f.label || 'Pertanyaan';
        const help = f.help_text || '';
        const placeholder = f.placeholder || '';

        let content = '';

        // Parse options
        let options = [];
        try {
            options = f.options ? JSON.parse(f.options) : [];
            if (!Array.isArray(options)) options = [];
        } catch (e) { options = []; }

        // Render by type
        switch (f.type) {
            case 'text':
                content = '<input type="text" name="' + escapeAttr(fieldName) + '" placeholder="' + escapeAttr(placeholder) + '" ' + (required ? 'required' : '') + ' class="fv-input" maxlength="200">';
                break;

            case 'email':
                content = '<input type="email" name="' + escapeAttr(fieldName) + '" placeholder="' + escapeAttr(placeholder || 'nama@email.com') + '" ' + (required ? 'required' : '') + ' class="fv-input" autocomplete="email" maxlength="120">';
                break;

            case 'number':
                content = '<input type="number" name="' + escapeAttr(fieldName) + '" placeholder="' + escapeAttr(placeholder) + '" ' + (required ? 'required' : '') + ' class="fv-input" inputmode="numeric">';
                break;

            case 'textarea':
                content = '<textarea name="' + escapeAttr(fieldName) + '" rows="4" placeholder="' + escapeAttr(placeholder) + '" ' + (required ? 'required' : '') + ' class="fv-textarea" maxlength="2000"></textarea>';
                break;

            case 'date':
                content = '<input type="date" name="' + escapeAttr(fieldName) + '" ' + (required ? 'required' : '') + ' class="fv-input">';
                break;

            case 'time':
                content = '<input type="time" name="' + escapeAttr(fieldName) + '" ' + (required ? 'required' : '') + ' class="fv-input">';
                break;

            case 'radio':
                content = '<div class="fv-choice-group">';
                if (options.length === 0) {
                    content += '<p style="color: var(--fv-text-muted); font-size: 0.85rem; margin: 0;">Belum ada pilihan jawaban.</p>';
                } else {
                    options.forEach((opt, i) => {
                        const optId = fieldName + '_' + i;
                        content += '<label class="fv-choice" for="' + escapeAttr(optId) + '">';
                        content += '<input type="radio" name="' + escapeAttr(fieldName) + '" value="' + escapeAttr(opt) + '" id="' + escapeAttr(optId) + '" ' + (required ? 'required' : '') + '>';
                        content += '<span class="fv-choice-label">' + escapeHtml(opt) + '</span>';
                        content += '</label>';
                    });
                }
                content += '</div>';
                break;

            case 'checkbox':
                content = '<div class="fv-choice-group">';
                if (options.length === 0) {
                    content += '<p style="color: var(--fv-text-muted); font-size: 0.85rem; margin: 0;">Belum ada pilihan jawaban.</p>';
                } else {
                    options.forEach((opt, i) => {
                        const optId = fieldName + '_' + i;
                        content += '<label class="fv-choice" for="' + escapeAttr(optId) + '">';
                        content += '<input type="checkbox" name="' + escapeAttr(fieldName) + '" value="' + escapeAttr(opt) + '" id="' + escapeAttr(optId) + '">';
                        content += '<span class="fv-choice-label">' + escapeHtml(opt) + '</span>';
                        content += '</label>';
                    });
                }
                content += '</div>';
                break;

            case 'select':
                content = '<select name="' + escapeAttr(fieldName) + '" ' + (required ? 'required' : '') + ' class="fv-select">';
                content += '<option value="">-- Pilih Salah Satu --</option>';
                options.forEach(opt => {
                    content += '<option value="' + escapeAttr(opt) + '">' + escapeHtml(opt) + '</option>';
                });
                content += '</select>';
                break;

            case 'rating':
                content = '<div class="fv-rating-wrap" data-rating-name="' + escapeAttr(fieldName) + '">';
                content += '<div class="fv-rating-stars">';
                for (let i = 1; i <= 5; i++) {
                    content += '<i class="far fa-star fv-rating-star" data-rating="' + i + '" data-target="' + escapeAttr(fieldName) + '" role="button" tabindex="0" aria-label="Beri rating ' + i + ' dari 5"></i>';
                }
                content += '</div>';
                content += '<span class="fv-rating-label" data-rating-label-for="' + escapeAttr(fieldName) + '">0 / 5</span>';
                content += '<input type="hidden" name="' + escapeAttr(fieldName) + '" value="0" ' + (required ? 'required' : '') + '>';
                content += '</div>';
                break;

            default:
                content = '<input type="text" name="' + escapeAttr(fieldName) + '" placeholder="' + escapeAttr(placeholder) + '" class="fv-input">';
        }

        return renderFieldWrapper({
            number: num,
            label: label,
            required: required,
            help: help,
            content: content,
            fieldId: f.id,
            fieldName: fieldName
        });
    }

    // === SUBMIT BUTTON ===
    function renderSubmitButton() {
        if (!submitBtn) return;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="fv-submit-text"><i class="fas fa-paper-plane"></i><span>Kirim Jawaban</span></span><i class="fas fa-arrow-right fv-submit-arrow"></i>';
    }

    // ================================================================
    // 8. RATING HANDLERS
    // ================================================================
    function attachRatingHandlers() {
        const stars = publicForm.querySelectorAll('.fv-rating-star');
        stars.forEach(star => {
            star.addEventListener('click', function() {
                const val = parseInt(this.dataset.rating, 10);
                const target = this.dataset.target;
                updateRating(target, val);
            });

            star.addEventListener('mouseenter', function() {
                const val = parseInt(this.dataset.rating, 10);
                const target = this.dataset.target;
                const wrap = this.closest('.fv-rating-wrap');
                if (!wrap) return;

                // Hover preview
                wrap.querySelectorAll('.fv-rating-star').forEach((s, i) => {
                    if (i < val) {
                        s.classList.add('fas');
                        s.classList.remove('far');
                    } else {
                        s.classList.remove('fas');
                        s.classList.add('far');
                    }
                });
            });

            star.addEventListener('mouseleave', function() {
                const target = this.dataset.target;
                const currentVal = ratingValues[target] || 0;
                updateRating(target, currentVal, true);
            });

            // Keyboard support
            star.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const val = parseInt(this.dataset.rating, 10);
                    updateRating(this.dataset.target, val);
                }
            });
        });
    }

    function updateRating(target, val, silent) {
        const wrap = publicForm.querySelector('[data-rating-name="' + target + '"]');
        if (!wrap) return;

        ratingValues[target] = val;

        // Update stars
        wrap.querySelectorAll('.fv-rating-star').forEach((s, i) => {
            if (i < val) {
                s.classList.add('fas');
                s.classList.remove('far');
                s.classList.add('active');
            } else {
                s.classList.remove('fas');
                s.classList.add('far');
                s.classList.remove('active');
            }
        });

        // Update label
        const label = wrap.querySelector('[data-rating-label-for="' + target + '"]');
        if (label) {
            label.textContent = val + ' / 5';
            label.classList.toggle('fv-rating-active', val > 0);
        }

        // Update hidden input
        const hiddenInput = wrap.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = val;

        // Clear error state
        if (!silent) {
            clearFieldError(target);
        }
    }

    // ================================================================
    // 9. FIELD VALIDATION
    // ================================================================
    function attachFieldValidation() {
        // Clear error on input
        publicForm.querySelectorAll('input, textarea, select').forEach(el => {
            const evt = (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(evt, function() {
                clearFieldError(this.name);
            });
        });
    }

    function clearFieldError(fieldName) {
        if (!fieldName) return;
        const errEl = publicForm.querySelector('[data-error-for="' + fieldName + '"]');
        if (errEl) {
            errEl.classList.remove('show');
            errEl.querySelector('span').textContent = '';
        }
        const field = publicForm.querySelector('.fv-field[data-field-id]');
        // Find wrapper
        const fieldEl = findFieldWrapper(fieldName);
        if (fieldEl) fieldEl.classList.remove('fv-field-error');
    }

    function findFieldWrapper(fieldName) {
        const input = publicForm.querySelector('[name="' + fieldName + '"]');
        if (!input) return null;
        return input.closest('.fv-field');
    }

    function showFieldError(fieldName, message) {
        const errEl = publicForm.querySelector('[data-error-for="' + fieldName + '"]');
        if (errEl) {
            errEl.querySelector('span').textContent = message;
            errEl.classList.add('show');
        }
        const fieldEl = findFieldWrapper(fieldName);
        if (fieldEl) fieldEl.classList.add('fv-field-error');
    }

    function validateForm() {
        // Reset all errors
        publicForm.querySelectorAll('.fv-field-error-msg').forEach(el => el.classList.remove('show'));
        publicForm.querySelectorAll('.fv-field').forEach(el => el.classList.remove('fv-field-error'));

        // === Nama Responden ===
        const namaInput = publicForm.querySelector('[name="__respondent_name"]');
        if (namaInput) {
            const nama = (namaInput.value || '').trim();
            if (!nama) {
                showFieldError('__respondent_name', 'Nama wajib diisi');
                return { ok: false, field: namaInput };
            }
            if (nama.length < 3) {
                showFieldError('__respondent_name', 'Nama minimal 3 karakter');
                return { ok: false, field: namaInput };
            }
        }

        // === Email Responden ===
        if (formData.collect_email === 'yes') {
            const emailInput = publicForm.querySelector('[name="__respondent_email"]');
            if (emailInput) {
                const email = (emailInput.value || '').trim();
                if (!email) {
                    showFieldError('__respondent_email', 'Email wajib diisi');
                    return { ok: false, field: emailInput };
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    showFieldError('__respondent_email', 'Format email tidak valid');
                    return { ok: false, field: emailInput };
                }
            }
        }

        // === Custom Fields ===
        for (let i = 0; i < fieldsData.length; i++) {
            const f = fieldsData[i];
            const required = (f.required === 'yes' || f.required === true);
            const fieldName = 'field_' + f.id;

            if (f.type === 'rating') {
                if (required) {
                    const val = ratingValues[fieldName] || 0;
                    if (val < 1) {
                        showFieldError(fieldName, 'Mohon beri rating untuk pertanyaan ini');
                        return { ok: false, field: findFieldWrapper(fieldName) };
                    }
                }
                continue;
            }

            if (f.type === 'checkbox') {
                if (required) {
                    const checked = publicForm.querySelectorAll('[name="' + fieldName + '"]:checked');
                    if (checked.length === 0) {
                        showFieldError(fieldName, 'Pilih minimal satu opsi');
                        return { ok: false, field: findFieldWrapper(fieldName) };
                    }
                }
                continue;
            }

            // text, textarea, email, number, date, time, radio, select
            const input = publicForm.querySelector('[name="' + fieldName + '"]');
            if (!input) continue;

            const val = (input.value || '').trim();

            if (required && !val) {
                showFieldError(fieldName, 'Pertanyaan ini wajib diisi');
                return { ok: false, field: input };
            }

            if (val && f.type === 'email') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(val)) {
                    showFieldError(fieldName, 'Format email tidak valid');
                    return { ok: false, field: input };
                }
            }

            if (val && f.type === 'number') {
                if (isNaN(Number(val))) {
                    showFieldError(fieldName, 'Harus berupa angka');
                    return { ok: false, field: input };
                }
            }
        }

        return { ok: true };
    }

    // ================================================================
    // 10. SUBMIT HANDLER
    // ================================================================
    async function handleSubmit(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (isSubmitting) return;

        // === Validate ===
        const validation = validateForm();
        if (!validation.ok) {
            showToast('Mohon lengkapi semua pertanyaan yang wajib diisi.', 'warning', 3500);
            if (validation.field) {
                try {
                    validation.field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    if (validation.field.focus) {
                        setTimeout(() => {
                            try { validation.field.focus(); } catch (err) {}
                        }, 400);
                    }
                } catch (err) {}
            }
            return;
        }

        // === Lock ===
        isSubmitting = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="fv-submit-text"><i class="fas fa-spinner fa-spin"></i><span>Mengirim...</span></span><i class="fas fa-arrow-right fv-submit-arrow" style="opacity: 0.5;"></i>';
        }

        try {
            // === Collect answers ===
            const fd = new FormData(publicForm);
            const answers = {};

            fieldsData.forEach(f => {
                const key = 'field_' + f.id;
                if (f.type === 'checkbox') {
                    answers[key] = fd.getAll(key);
                } else if (f.type === 'rating') {
                    answers[key] = Number(ratingValues[key]) || 0;
                } else {
                    answers[key] = fd.get(key) || '';
                }
            });

            const respondent_name = (fd.get('__respondent_name') || '').trim();
            const respondent_email = (fd.get('__respondent_email') || '').trim();

            // === Build payload ===
            const payload = {
                form_id: formData.id,
                respondent_name: respondent_name,
                respondent_email: respondent_email,
                answers: JSON.stringify(answers),
                user_agent: (navigator.userAgent || '').substring(0, 250)
            };

            console.log('[form_view] Submitting response...');

            // === Submit ===
            const res = await apiCall('createFormResponse', 'POST', payload);

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal mengirim jawaban');
            }

            console.log('[form_view] Response submitted:', res.id);

            // === Success ===
            showSuccess();

        } catch (err) {
            console.error('[form_view] Submit error:', err);
            showToast('Gagal mengirim: ' + (err.message || 'Unknown error'), 'error', 5000);

            // Unlock
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span class="fv-submit-text"><i class="fas fa-paper-plane"></i><span>Kirim Jawaban</span></span><i class="fas fa-arrow-right fv-submit-arrow"></i>';
            }
        }
    }

    // ================================================================
    // 11. SHOW SUCCESS
    // ================================================================
    function showSuccess() {
        const customMsg = (formData && formData.confirmation_message)
            ? formData.confirmation_message
            : 'Terima kasih! Jawaban Anda telah kami terima.';

        if (successMsg) {
            successMsg.textContent = customMsg;
        }

        showState('success');

        // Reset form
        try {
            publicForm.reset();
            ratingValues = {};
        } catch (e) {}

        isSubmitting = false;
    }

    // ================================================================
    // 12. EXTRA BUTTONS
    // ================================================================
    const fillAgainBtn = document.getElementById('fv-fill-again-btn');
    if (fillAgainBtn) {
        fillAgainBtn.addEventListener('click', () => {
            // Reset state & reload
            isSubmitting = false;
            isLoading = false;
            loadForm();
        });
    }

    const errorRetryBtn = document.getElementById('fv-error-retry-btn');
    if (errorRetryBtn) {
        errorRetryBtn.addEventListener('click', () => {
            isSubmitting = false;
            isLoading = false;
            loadForm();
        });
    }

    // ================================================================
    // 13. FORM SUBMIT BINDING
    // ================================================================
    publicForm.addEventListener('submit', handleSubmit);

    // Also handle submit button click (jika form="public-form" attribute)
    if (submitBtn) {
        submitBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleSubmit(e);
        });
    }

    // ================================================================
    // 14. VISIBILITY CHANGE
    // ================================================================
    document.addEventListener('visibilitychange', function() {
        // Kalau tab kembali aktif & form sedang loading, cek ulang
        if (!document.hidden && isLoading) {
            // Skip - biarkan loading selesai
        }
    });

    // ================================================================
    // 15. CLEANUP
    // ================================================================
    function cleanup() {
        window.__formViewLoaded = false;
        console.log('[form_view] Cleanup');
    }
    window.__formViewCleanup = cleanup;

    // ================================================================
    // 16. INIT
    // ================================================================
    console.log('[form_view] Init - slug:', slug || '(empty)');
    loadForm();

});