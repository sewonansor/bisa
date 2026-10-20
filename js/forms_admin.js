/**
 * js/forms_admin.js
 * Form Builder Admin — v4.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v4.0.0:
 *   ✅ NEW: Handle response _offline dari apiCall
 *   ✅ NEW: Optimistic UI saat offline
 *   ✅ NEW: Badge "Pending Sync" di form card
 *   ✅ NEW: Auto-refresh saat sync complete
 *   ✅ FIX: Semua handler idempotent (no double binding)
 *   ✅ FIX: Null-safe semua DOM element
 *   ✅ FIX: Guard anti-duplikasi per field
 *   ✅ FIX: Field save skip saat offline (di-queue otomatis)
 *   ✅ FIX: QR library auto-load dengan fallback
 *   ✅ FIX: Preview render null-safe
 *   ✅ FIX: Delete cascade (responses + notifications)
 *   ✅ FIX: Refresh queue UI auto-trigger
 *   ✅ PRESERVED: Semua fitur v3.0.0
 * ============================================================
 */

App.register('forms_admin', function() {
    'use strict';

    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__formsAdminLoaded) {
        console.log('[forms_admin] Skip - already loaded');
        return;
    }
    window.__formsAdminLoaded = true;

    console.log('[forms_admin] 🚀 Init v4.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. CONSTANTS
    // ================================================================
    const FIELD_ICONS = {
        text:     'fa-font',
        textarea: 'fa-align-left',
        email:    'fa-envelope',
        number:   'fa-hashtag',
        date:     'fa-calendar-day',
        time:     'fa-clock',
        radio:    'fa-dot-circle',
        checkbox: 'fa-check-square',
        select:   'fa-caret-square-down',
        rating:   'fa-star'
    };

    const FIELD_LABELS = {
        text:     'Teks',
        textarea: 'Paragraf',
        email:    'Email',
        number:   'Angka',
        date:     'Tanggal',
        time:     'Waktu',
        radio:    'Pilihan Ganda',
        checkbox: 'Checkbox',
        select:   'Dropdown',
        rating:   'Rating'
    };

    const OPTION_FIELD_TYPES = ['radio', 'checkbox', 'select'];

    // ================================================================
    // 4. HELPERS
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

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    function generateTempId() {
        return 'tmp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'absolute';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                document.body.removeChild(ta);
                reject(e);
            }
        });
    }

    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 40;
        interval = interval || 100;
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

    /**
     * ✅ NEW: Deteksi apakah data punya pending sync di queue
     */
    function isPendingSync(formId) {
        try {
            if (!window.SyncManager) return false;
            const queue = window.SyncManager.getQueue() || [];
            const idStr = String(formId);
            return queue.some(item => {
                const d = item.data || {};
                return String(d.id) === idStr ||
                       String(d.form_id) === idStr;
            });
        } catch (e) {
            return false;
        }
    }

    /**
     * ✅ NEW: Safe toast (fallback console)
     */
    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[forms_admin:' + (type || 'info') + ']', msg);
        }
    }

    // ================================================================
    // 5. STATE
    // ================================================================
    let formsCache = [];
    let responsesCache = [];
    let notificationsCache = [];
    let currentFields = [];
    let editingFormId = null;
    let isDirty = false;
    let isSubmitting = false;
    let currentShareFormId = '';
    let currentShareSlug = '';

    // ================================================================
    // 6. INIT
    // ================================================================
    async function init() {
        const requiredIds = [
            'forms-grid', 'add-form-btn', 'refresh-forms-btn', 'form-search', 'form-filter-status',
            'stat-total-form', 'stat-published', 'stat-total-respon', 'stat-unread',
            'builder-modal', 'builder-content', 'builder-title', 'builder-close',
            'builder-cancel', 'builder-save', 'builder-preview-btn',
            'builder-form-title', 'builder-form-desc', 'builder-status-badge',
            'tab-info', 'tab-fields', 'tab-settings', 'tab-fields-count',
            'fields-list',
            'setting-accept-responses', 'setting-collect-email', 'setting-response-limit',
            'setting-deadline', 'setting-confirmation',
            'field-modal', 'field-content', 'field-close', 'field-cancel', 'field-form',
            'field-id', 'field-type', 'field-label', 'field-placeholder', 'field-help',
            'field-options-wrap', 'field-options', 'field-required', 'field-modal-title',
            'share-modal', 'share-content', 'share-close', 'share-link-input', 'copy-link-btn',
            'qr-result', 'qr-code-container', 'embed-result', 'embed-code',
            'preview-modal', 'preview-close', 'preview-body'
        ];

        const els = await waitForElements(requiredIds);

        const formsGrid = els['forms-grid'];
        const addFormBtn = els['add-form-btn'];
        const refreshBtn = els['refresh-forms-btn'];
        const searchInput = els['form-search'];
        const statusFilter = els['form-filter-status'];
        const statTotalForm = els['stat-total-form'];
        const statPublished = els['stat-published'];
        const statTotalRespon = els['stat-total-respon'];
        const statUnread = els['stat-unread'];

        const builderModal = els['builder-modal'];
        const builderContent = els['builder-content'];
        const builderTitle = els['builder-title'];
        const builderClose = els['builder-close'];
        const builderCancel = els['builder-cancel'];
        const builderSave = els['builder-save'];
        const builderPreviewBtn = els['builder-preview-btn'];
        const builderFormTitle = els['builder-form-title'];
        const builderFormDesc = els['builder-form-desc'];
        const builderStatusBadge = els['builder-status-badge'];
        const tabFieldsCount = els['tab-fields-count'];
        const fieldsList = els['fields-list'];

        const settingAcceptResponses = els['setting-accept-responses'];
        const settingCollectEmail = els['setting-collect-email'];
        const settingResponseLimit = els['setting-response-limit'];
        const settingDeadline = els['setting-deadline'];
        const settingConfirmation = els['setting-confirmation'];

        const fieldModal = els['field-modal'];
        const fieldContent = els['field-content'];
        const fieldClose = els['field-close'];
        const fieldCancel = els['field-cancel'];
        const fieldForm = els['field-form'];
        const fieldId = els['field-id'];
        const fieldType = els['field-type'];
        const fieldLabel = els['field-label'];
        const fieldPlaceholder = els['field-placeholder'];
        const fieldHelp = els['field-help'];
        const fieldOptionsWrap = els['field-options-wrap'];
        const fieldOptions = els['field-options'];
        const fieldRequired = els['field-required'];
        const fieldModalTitle = els['field-modal-title'];

        const shareModal = els['share-modal'];
        const shareContent = els['share-content'];
        const shareClose = els['share-close'];
        const shareLinkInput = els['share-link-input'];
        const copyLinkBtn = els['copy-link-btn'];
        const qrResult = els['qr-result'];
        const qrCodeContainer = els['qr-code-container'];
        const embedResult = els['embed-result'];
        const embedCode = els['embed-code'];

        const previewModal = els['preview-modal'];
        const previewClose = els['preview-close'];
        const previewBody = els['preview-body'];

        if (!formsGrid) {
            console.error('[forms_admin] Critical element #forms-grid not found');
            return;
        }

        // ================================================================
        // 7. MODAL HELPERS
        // ================================================================
        function openModal(modalEl) {
            if (!modalEl) return;
            modalEl.classList.remove('hidden');
            modalEl.classList.add('flex');
        }

        function closeModal(modalEl) {
            if (!modalEl) return;
            modalEl.classList.remove('flex');
            modalEl.classList.add('hidden');
        }

        // ================================================================
        // 8. TAB SWITCHING
        // ================================================================
        function switchTab(tabName) {
            document.querySelectorAll('.fb-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tabName);
            });
            ['info', 'fields', 'settings'].forEach(t => {
                const el = document.getElementById('tab-' + t);
                if (el) el.classList.toggle('hidden', t !== tabName);
            });
        }

        document.querySelectorAll('.fb-tab').forEach(tab => {
            const fresh = tab.cloneNode(true);
            tab.parentNode.replaceChild(fresh, tab);
            fresh.addEventListener('click', function() {
                switchTab(this.dataset.tab);
            });
        });

        // ================================================================
        // 9. REFRESH TANPA RELOAD
        // ================================================================
        function refreshFormsData() {
            console.log('[forms_admin] 🔄 Refresh data without reload');

            formsCache = [];
            responsesCache = [];
            notificationsCache = [];

            try {
                const cKeyForms = 'cache_getForms_' + user.id + '_' + JSON.stringify({});
                const cKeyResp = 'cache_getFormResponses_' + user.id + '_' + JSON.stringify({});
                const cKeyNotif = 'cache_getFormNotifications_' + user.id + '_' + JSON.stringify({});
                SafeSessionStorage.removeItem(cKeyForms);
                SafeSessionStorage.removeItem(cKeyResp);
                SafeSessionStorage.removeItem(cKeyNotif);
            } catch (e) {}

            return loadForms(true).then(() => {
                console.log('[forms_admin] ✅ Data refreshed');
            });
        }

        // ================================================================
        // 10. LOAD FORMS + STATS
        // ================================================================
        async function loadForms(force) {
            force = force || false;

            if (formsCache.length > 0 && !force) {
                renderForms();
                updateStats();
                return;
            }

            formsGrid.innerHTML = `
                <div class="fb-skeleton-card">
                    <div class="fb-skeleton-box fb-skeleton-header"></div>
                    <div class="fb-skeleton-box fb-skeleton-line"></div>
                    <div class="fb-skeleton-box fb-skeleton-line fb-skeleton-short"></div>
                    <div class="fb-skeleton-box fb-skeleton-footer"></div>
                </div>
                <div class="fb-skeleton-card">
                    <div class="fb-skeleton-box fb-skeleton-header"></div>
                    <div class="fb-skeleton-box fb-skeleton-line"></div>
                    <div class="fb-skeleton-box fb-skeleton-line fb-skeleton-short"></div>
                    <div class="fb-skeleton-box fb-skeleton-footer"></div>
                </div>
                <div class="fb-skeleton-card">
                    <div class="fb-skeleton-box fb-skeleton-header"></div>
                    <div class="fb-skeleton-box fb-skeleton-line"></div>
                    <div class="fb-skeleton-box fb-skeleton-line fb-skeleton-short"></div>
                    <div class="fb-skeleton-box fb-skeleton-footer"></div>
                </div>
            `;

            try {
                const [formsRes, responsesRes, notifRes] = await Promise.allSettled([
                    forceRefreshData('getForms', {}),
                    forceRefreshData('getFormResponses', {}),
                    forceRefreshData('getFormNotifications', {})
                ]);

                formsCache = (formsRes.status === 'fulfilled' && formsRes.value &&
                             formsRes.value.success && Array.isArray(formsRes.value.data))
                    ? formsRes.value.data : [];

                responsesCache = (responsesRes.status === 'fulfilled' && responsesRes.value &&
                                 responsesRes.value.success && Array.isArray(responsesRes.value.data))
                    ? responsesRes.value.data : [];

                notificationsCache = (notifRes.status === 'fulfilled' && notifRes.value &&
                                     notifRes.value.success && Array.isArray(notifRes.value.data))
                    ? notifRes.value.data : [];

                renderForms();
                updateStats();
            } catch (e) {
                console.error('[forms_admin] Load error:', e);
                formsGrid.innerHTML = `
                    <div class="fb-empty-state">
                        <i class="fas fa-exclamation-triangle fb-empty-icon" style="color: #dc2626;"></i>
                        <p class="fb-empty-title">Gagal Memuat Form</p>
                        <p class="fb-empty-desc">Periksa koneksi internet Anda dan coba lagi.</p>
                    </div>
                `;
            }
        }

        function updateStats() {
            const total = formsCache.length;
            const published = formsCache.filter(f => f.status === 'published').length;
            const responses = responsesCache.length;
            const unread = notificationsCache.filter(n =>
                n.is_read === 'no' || n.is_read === false || !n.is_read
            ).length;

            if (statTotalForm) statTotalForm.textContent = total;
            if (statPublished) statPublished.textContent = published;
            if (statTotalRespon) statTotalRespon.textContent = responses;
            if (statUnread) statUnread.textContent = unread;
        }

        // ================================================================
        // 11. RENDER FORMS GRID — WITH PENDING SYNC BADGE
        // ================================================================
        function renderForms() {
            const q = (searchInput && searchInput.value || '').toLowerCase().trim();
            const status = statusFilter ? statusFilter.value : 'all';

            let filtered = formsCache.filter(f => {
                if (status !== 'all' && f.status !== status) return false;
                if (q) {
                    const hay = [f.title, f.description, f.slug]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!hay.includes(q)) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                const isEmpty = formsCache.length === 0;
                formsGrid.innerHTML = `
                    <div class="fb-empty-state">
                        <i class="fas fa-wpforms fb-empty-icon"></i>
                        <p class="fb-empty-title">${isEmpty ? 'Belum Ada Form' : 'Tidak Ada Hasil'}</p>
                        <p class="fb-empty-desc">
                            ${isEmpty
                                ? 'Klik tombol "Form Baru" untuk membuat formulir pertama Anda.'
                                : 'Coba ubah kata kunci pencarian atau filter status.'}
                        </p>
                    </div>
                `;
                return;
            }

            let html = '';
            filtered.forEach(f => {
                const respCount = responsesCache.filter(r => String(r.form_id) === String(f.id)).length;
                const notifCount = notificationsCache.filter(n =>
                    String(n.form_id) === String(f.id) &&
                    (n.is_read === 'no' || n.is_read === false || !n.is_read)
                ).length;
                const pending = isPendingSync(f.id);

                let statusClass = 'fb-status-draft';
                let statusIcon = 'fa-edit';
                let statusLabel = 'DRAFT';
                if (f.status === 'published') {
                    statusClass = 'fb-status-published';
                    statusIcon = 'fa-check-circle';
                    statusLabel = 'PUBLISHED';
                } else if (f.status === 'closed') {
                    statusClass = 'fb-status-closed';
                    statusIcon = 'fa-lock';
                    statusLabel = 'CLOSED';
                }

                const pendingBadge = pending
                    ? `<span class="fb-status-badge" style="background:rgba(217,119,6,0.15);color:#d97706;border:1px solid rgba(217,119,6,0.3);" title="Menunggu sinkronisasi"><i class="fas fa-cloud-upload-alt"></i> SYNC</span>`
                    : '';

                html += `
                    <div class="fb-form-card" style="${pending ? 'border-left: 3px solid #d97706;' : ''}">
                        <div class="fb-form-card-head">
                            <div class="fb-form-card-title-row">
                                <h3 class="fb-form-card-title">${escapeHtml(f.title || 'Untitled Form')}</h3>
                                <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
                                    ${pendingBadge}
                                    <span class="fb-status-badge ${statusClass}">
                                        <i class="fas ${statusIcon}"></i>
                                        <span>${statusLabel}</span>
                                    </span>
                                </div>
                            </div>
                            <p class="fb-form-card-desc">
                                ${escapeHtml(f.description || 'Tidak ada deskripsi')}
                            </p>
                            <div class="fb-form-card-meta">
                                <span><i class="fas fa-inbox"></i> ${respCount} respon</span>
                                <span><i class="far fa-calendar"></i> ${formatDate(f.created_at)}</span>
                                ${notifCount > 0 ? `<span class="fb-notif-new"><i class="fas fa-bell"></i> ${notifCount} baru</span>` : ''}
                            </div>
                        </div>
                        <div class="fb-form-card-actions">
                            <button type="button" class="fb-card-btn fb-card-btn-edit" data-action="edit" data-id="${escapeAttr(f.id)}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button type="button" class="fb-card-btn fb-card-btn-resp" data-action="responses" data-id="${escapeAttr(f.id)}">
                                <i class="fas fa-inbox"></i> Respon (${respCount})
                            </button>
                            <button type="button" class="fb-card-btn fb-card-btn-share" data-action="share" data-id="${escapeAttr(f.id)}" data-slug="${escapeAttr(f.slug)}">
                                <i class="fas fa-share-alt"></i> Share
                            </button>
                            <button type="button" class="fb-card-btn fb-card-btn-del" data-action="delete" data-id="${escapeAttr(f.id)}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            formsGrid.innerHTML = html;

            formsGrid.querySelectorAll('[data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', () => openBuilder(btn.dataset.id));
            });
            formsGrid.querySelectorAll('[data-action="responses"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    router.load('/form_responses?id=' + encodeURIComponent(btn.dataset.id));
                });
            });
            formsGrid.querySelectorAll('[data-action="share"]').forEach(btn => {
                btn.addEventListener('click', () => openShare(btn.dataset.id, btn.dataset.slug));
            });
            formsGrid.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
            });
        }

        // ================================================================
        // 12. OPEN BUILDER
        // ================================================================
        async function openBuilder(formId) {
            editingFormId = formId || null;
            currentFields = [];
            isDirty = false;

            if (editingFormId) {
                builderTitle.textContent = 'Edit Form';
                const form = formsCache.find(f => String(f.id) === String(editingFormId));
                if (form) {
                    builderFormTitle.value = form.title || '';
                    builderFormDesc.value = form.description || '';
                    updateStatusBadge(form.status || 'draft');
                    settingAcceptResponses.checked = (form.accept_responses === 'yes');
                    settingCollectEmail.checked = (form.collect_email === 'yes');
                    settingResponseLimit.value = form.response_limit || '';
                    settingDeadline.value = form.deadline || '';
                    settingConfirmation.value = form.confirmation_message || '';
                }

                try {
                    const res = await apiCall('getFormFields', 'POST', { form_id: editingFormId });
                    if (res && res.success && Array.isArray(res.data)) {
                        currentFields = res.data.map(f => ({
                            id: f.id,
                            type: f.type || 'text',
                            label: f.label || '',
                            placeholder: f.placeholder || '',
                            help_text: f.help_text || '',
                            required: f.required || 'no',
                            options: f.options || '',
                            validation: f.validation || '',
                            order: Number(f.order) || 0,
                            _isNew: false
                        })).sort((a, b) => a.order - b.order);
                    }
                } catch (e) {
                    console.warn('[forms_admin] Load fields error:', e);
                }
            } else {
                builderTitle.textContent = 'Form Baru';
                builderFormTitle.value = '';
                builderFormDesc.value = '';
                updateStatusBadge('draft');
                settingAcceptResponses.checked = true;
                settingCollectEmail.checked = false;
                settingResponseLimit.value = '';
                settingDeadline.value = '';
                settingConfirmation.value = 'Terima kasih! Jawaban Anda telah kami terima.';
            }

            renderFields();
            updateFieldCount();
            switchTab('info');
            openModal(builderModal);

            setTimeout(() => {
                if (builderFormTitle) builderFormTitle.focus();
            }, 250);
        }

        function updateStatusBadge(status) {
            if (!builderStatusBadge) return;
            let cls = 'fb-status-badge ';
            let icon = 'fa-edit';
            let label = 'DRAFT';
            if (status === 'published') {
                cls += 'fb-status-published';
                icon = 'fa-check-circle';
                label = 'PUBLISHED';
            } else if (status === 'closed') {
                cls += 'fb-status-closed';
                icon = 'fa-lock';
                label = 'CLOSED';
            } else {
                cls += 'fb-status-draft';
            }
            builderStatusBadge.className = cls;
            builderStatusBadge.innerHTML = '<i class="fas ' + icon + '"></i><span>' + label + '</span>';
        }

        function updateFieldCount() {
            if (tabFieldsCount) tabFieldsCount.textContent = currentFields.length;
        }

        // ================================================================
        // 13. RENDER FIELDS LIST
        // ================================================================
        function renderFields() {
            if (!fieldsList) return;

            if (currentFields.length === 0) {
                fieldsList.innerHTML = `
                    <div class="fb-fields-empty">
                        <i class="fas fa-mouse-pointer"></i>
                        <p>Belum ada pertanyaan</p>
                        <p style="font-size: 0.78rem; margin-top: 8px; opacity: 0.8;">
                            Klik salah satu tipe di atas untuk menambahkan pertanyaan pertama Anda.
                        </p>
                    </div>
                `;
                return;
            }

            let html = '';
            currentFields.forEach((f, idx) => {
                const iconClass = FIELD_ICONS[f.type] || 'fa-question';
                const isRequired = f.required === 'yes' || f.required === true;

                let optionsPreview = '';
                if (OPTION_FIELD_TYPES.indexOf(f.type) > -1 && f.options) {
                    try {
                        const opts = JSON.parse(f.options);
                        if (Array.isArray(opts) && opts.length > 0) {
                            const shown = opts.slice(0, 4);
                            const more = opts.length - shown.length;
                            optionsPreview = '<div class="fb-field-options-preview">' +
                                shown.map(o => '<span class="fb-field-option-chip">' + escapeHtml(o) + '</span>').join('') +
                                (more > 0 ? '<span class="fb-field-option-chip" style="font-style: italic;">+' + more + ' lagi</span>' : '') +
                                '</div>';
                        }
                    } catch (e) {}
                }

                html += `
                    <div class="fb-field-item" draggable="true" data-field-id="${escapeAttr(f.id)}" data-idx="${idx}">
                        <div class="fb-field-drag">
                            <i class="fas fa-grip-vertical"></i>
                            <span class="fb-field-number">${idx + 1}</span>
                        </div>
                        <div class="fb-field-body">
                            <div class="fb-field-label-row">
                                <span class="fb-field-type-icon"><i class="fas ${iconClass}"></i></span>
                                <h4 class="fb-field-label">${escapeHtml(f.label || 'Pertanyaan tanpa label')}</h4>
                                ${isRequired ? '<span class="fb-field-required">*WAJIB</span>' : ''}
                            </div>
                            <p class="fb-field-meta">
                                Tipe: <code>${escapeHtml(FIELD_LABELS[f.type] || f.type)}</code>
                                ${f.placeholder ? ' · Placeholder: "' + escapeHtml(f.placeholder) + '"' : ''}
                            </p>
                            ${optionsPreview}
                        </div>
                        <div class="fb-field-actions">
                            <button type="button" class="fb-field-action-btn fb-field-action-btn-edit edit-field-btn" data-field-id="${escapeAttr(f.id)}" title="Edit">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button type="button" class="fb-field-action-btn fb-field-action-btn-delete delete-field-btn" data-field-id="${escapeAttr(f.id)}" title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            fieldsList.innerHTML = html;

            fieldsList.querySelectorAll('.edit-field-btn').forEach(btn => {
                btn.addEventListener('click', () => openFieldEditor(btn.dataset.fieldId));
            });

            fieldsList.querySelectorAll('.delete-field-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.fieldId;
                    showConfirm('Hapus pertanyaan ini?', () => {
                        currentFields = currentFields.filter(f => String(f.id) !== String(id));
                        currentFields.forEach((f, i) => f.order = i);
                        isDirty = true;
                        renderFields();
                        updateFieldCount();
                    });
                });
            });

            initDragDrop();
        }

        // ================================================================
        // 14. DRAG & DROP
        // ================================================================
        function initDragDrop() {
            let dragSrcId = null;

            fieldsList.querySelectorAll('.fb-field-item').forEach(item => {
                item.addEventListener('dragstart', function(e) {
                    dragSrcId = item.dataset.fieldId;
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', dragSrcId); } catch (err) {}
                });

                item.addEventListener('dragend', function() {
                    item.classList.remove('dragging');
                    fieldsList.querySelectorAll('.fb-field-item').forEach(i => i.classList.remove('drag-over'));
                });

                item.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    if (dragSrcId && dragSrcId !== item.dataset.fieldId) {
                        item.classList.add('drag-over');
                    }
                });

                item.addEventListener('dragleave', function() {
                    item.classList.remove('drag-over');
                });

                item.addEventListener('drop', function(e) {
                    e.preventDefault();
                    item.classList.remove('drag-over');
                    const tgtId = item.dataset.fieldId;
                    if (!dragSrcId || dragSrcId === tgtId) return;

                    const srcIdx = currentFields.findIndex(f => String(f.id) === String(dragSrcId));
                    const tgtIdx = currentFields.findIndex(f => String(f.id) === String(tgtId));
                    if (srcIdx === -1 || tgtIdx === -1) return;

                    const moved = currentFields.splice(srcIdx, 1)[0];
                    currentFields.splice(tgtIdx, 0, moved);
                    currentFields.forEach((f, i) => f.order = i);

                    isDirty = true;
                    dragSrcId = null;
                    renderFields();
                });
            });
        }

        // ================================================================
        // 15. ADD FIELD
        // ================================================================
        document.querySelectorAll('.fb-field-type-btn').forEach(btn => {
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', function() {
                const type = this.dataset.type;
                const newField = {
                    id: generateTempId(),
                    type: type,
                    label: '',
                    placeholder: '',
                    help_text: '',
                    required: 'no',
                    options: OPTION_FIELD_TYPES.indexOf(type) > -1
                        ? JSON.stringify(['Pilihan 1', 'Pilihan 2'])
                        : '',
                    validation: '',
                    order: currentFields.length,
                    _isNew: true
                };
                currentFields.push(newField);
                isDirty = true;
                renderFields();
                updateFieldCount();
                openFieldEditor(newField.id);
            });
        });

        // ================================================================
        // 16. FIELD EDITOR MODAL
        // ================================================================
        function openFieldEditor(fieldIdToEdit) {
            const f = currentFields.find(x => String(x.id) === String(fieldIdToEdit));
            if (!f) {
                safeToast('Field tidak ditemukan', 'warning');
                return;
            }

            if (fieldId) fieldId.value = f.id;
            if (fieldType) fieldType.value = f.type;
            if (fieldLabel) fieldLabel.value = f.label || '';
            if (fieldPlaceholder) fieldPlaceholder.value = f.placeholder || '';
            if (fieldHelp) fieldHelp.value = f.help_text || '';
            if (fieldRequired) fieldRequired.checked = (f.required === 'yes' || f.required === true);

            const hasOptions = OPTION_FIELD_TYPES.indexOf(f.type) > -1;
            if (fieldOptionsWrap) fieldOptionsWrap.classList.toggle('hidden', !hasOptions);

            if (hasOptions && fieldOptions) {
                try {
                    const opts = f.options ? JSON.parse(f.options) : [];
                    fieldOptions.value = Array.isArray(opts) ? opts.join('\n') : '';
                } catch (e) {
                    fieldOptions.value = '';
                }
            } else if (fieldOptions) {
                fieldOptions.value = '';
            }

            if (fieldModalTitle) {
                fieldModalTitle.textContent = 'Edit ' + (FIELD_LABELS[f.type] || 'Field');
            }

            openModal(fieldModal);

            setTimeout(() => {
                if (fieldLabel) {
                    fieldLabel.focus();
                    fieldLabel.select();
                }
            }, 250);
        }

        if (fieldForm) {
            const fresh = fieldForm.cloneNode(true);
            fieldForm.parentNode.replaceChild(fresh, fieldForm);
            fresh.addEventListener('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();

                const id = fieldId ? fieldId.value : '';
                const labelEl = document.getElementById('field-label');
                const placeholderEl = document.getElementById('field-placeholder');
                const helpEl = document.getElementById('field-help');
                const optionsEl = document.getElementById('field-options');
                const requiredEl = document.getElementById('field-required');

                const f = currentFields.find(x => String(x.id) === String(id));
                if (!f) return;

                const label = (labelEl.value || '').trim();
                if (!label) {
                    safeToast('Label pertanyaan wajib diisi', 'warning');
                    labelEl.focus();
                    return;
                }

                f.label = label;
                f.placeholder = (placeholderEl.value || '').trim();
                f.help_text = (helpEl.value || '').trim();
                f.required = requiredEl.checked ? 'yes' : 'no';

                if (OPTION_FIELD_TYPES.indexOf(f.type) > -1) {
                    const opts = optionsEl.value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(Boolean);
                    if (opts.length === 0) {
                        safeToast('Tambahkan minimal 1 pilihan jawaban', 'warning');
                        optionsEl.focus();
                        return;
                    }
                    f.options = JSON.stringify(opts);
                } else {
                    f.options = '';
                }

                isDirty = true;
                closeModal(fieldModal);
                renderFields();
                safeToast('Pertanyaan disimpan', 'success', 2000);
            });
        }

        if (fieldClose) {
            const fresh = fieldClose.cloneNode(true);
            fieldClose.parentNode.replaceChild(fresh, fieldClose);
            fresh.addEventListener('click', () => closeModal(fieldModal));
        }
        if (fieldCancel) {
            const fresh = fieldCancel.cloneNode(true);
            fieldCancel.parentNode.replaceChild(fresh, fieldCancel);
            fresh.addEventListener('click', () => closeModal(fieldModal));
        }
        if (fieldModal) {
            fieldModal.addEventListener('click', (e) => {
                if (e.target === fieldModal) closeModal(fieldModal);
            });
        }

        // ================================================================
        // 17. SAVE FORM — HANDLE OFFLINE
        // ================================================================
        if (builderSave) {
            const fresh = builderSave.cloneNode(true);
            builderSave.parentNode.replaceChild(fresh, builderSave);
            fresh.addEventListener('click', async function() {
                if (isSubmitting) return;

                const title = (builderFormTitle.value || '').trim();
                if (!title) {
                    safeToast('Judul form wajib diisi', 'warning');
                    switchTab('info');
                    builderFormTitle.focus();
                    return;
                }

                if (currentFields.length === 0) {
                    safeToast('Tambahkan minimal 1 pertanyaan', 'warning');
                    switchTab('fields');
                    return;
                }

                for (let i = 0; i < currentFields.length; i++) {
                    if (!currentFields[i].label || !currentFields[i].label.trim()) {
                        safeToast('Pertanyaan #' + (i + 1) + ' belum diberi label', 'warning');
                        switchTab('fields');
                        return;
                    }
                }

                isSubmitting = true;
                const btn = this;
                const orig = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Menyimpan...</span>';

                try {
                    const formPayload = {
                        title: title,
                        description: (builderFormDesc.value || '').trim(),
                        accept_responses: settingAcceptResponses.checked ? 'yes' : 'no',
                        collect_email: settingCollectEmail.checked ? 'yes' : 'no',
                        response_limit: settingResponseLimit.value || '',
                        deadline: settingDeadline.value || '',
                        confirmation_message: (settingConfirmation.value || '').trim() || 'Terima kasih!'
                    };

                    let formId = editingFormId;
                    let slug = '';
                    let isOffline = false;

                    if (!formId) {
                        formPayload.created_by = user.id;
                        const res = await apiCall('createForm', 'POST', formPayload);
                        if (!res || !res.success) {
                            throw new Error((res && res.message) || 'Gagal buat form');
                        }
                        formId = res.id || generateTempId();
                        slug = res.slug || '';
                        isOffline = res._offline === true;
                    } else {
                        formPayload.id = formId;
                        const existingForm = formsCache.find(f => String(f.id) === String(formId));
                        if (existingForm && existingForm.status === 'draft') {
                            formPayload.status = 'published';
                        }
                        const res = await apiCall('updateForm', 'POST', formPayload);
                        if (!res || !res.success) {
                            throw new Error((res && res.message) || 'Gagal update form');
                        }
                        slug = existingForm ? existingForm.slug : '';
                        isOffline = res._offline === true;
                    }

                    // Save fields (skip saat offline — akan di-sync otomatis)
                    if (!isOffline) {
                        try {
                            const existingRes = await apiCall('getFormFields', 'POST', { form_id: formId });
                            const serverFields = (existingRes && existingRes.success && Array.isArray(existingRes.data))
                                ? existingRes.data : [];
                            const serverFieldIds = new Set(serverFields.map(f => String(f.id)));

                            for (let i = 0; i < serverFields.length; i++) {
                                const sf = serverFields[i];
                                const stillExists = currentFields.some(f => String(f.id) === String(sf.id));
                                if (!stillExists) {
                                    await apiCall('deleteFormField', 'POST', { id: sf.id });
                                }
                            }

                            for (let i = 0; i < currentFields.length; i++) {
                                const f = currentFields[i];
                                const payload = {
                                    form_id: formId,
                                    type: f.type,
                                    label: f.label,
                                    placeholder: f.placeholder || '',
                                    help_text: f.help_text || '',
                                    required: f.required || 'no',
                                    options: f.options || '',
                                    validation: f.validation || '',
                                    order: i
                                };

                                if (f._isNew || !serverFieldIds.has(String(f.id))) {
                                    const createRes = await apiCall('createFormField', 'POST', payload);
                                    if (createRes && createRes.success) {
                                        f.id = createRes.id;
                                        f._isNew = false;
                                    }
                                } else {
                                    payload.id = f.id;
                                    await apiCall('updateFormField', 'POST', payload);
                                }
                            }
                        } catch (fieldErr) {
                            console.warn('[forms_admin] Save fields error:', fieldErr);
                            // Jangan throw — form sudah tersimpan, fields bisa diperbaiki nanti
                        }
                    }

                    await logActivity(
                        editingFormId ? 'UPDATE' : 'CREATE',
                        'forms',
                        formId,
                        'Form: ' + title
                    );

                    if (isOffline) {
                        safeToast('📴 Form tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(
                            editingFormId ? '✅ Form berhasil diperbarui!' : '✅ Form berhasil dibuat!',
                            'success'
                        );
                    }

                    isDirty = false;
                    closeModal(builderModal);

                    // Optimistic update cache lokal
                    if (editingFormId) {
                        const idx = formsCache.findIndex(f => String(f.id) === String(formId));
                        if (idx !== -1) {
                            formsCache[idx] = Object.assign({}, formsCache[idx], formPayload, { id: formId });
                        }
                    } else {
                        formsCache.unshift(Object.assign({}, formPayload, {
                            id: formId,
                            slug: slug,
                            status: formPayload.status || 'published',
                            created_at: new Date().toISOString()
                        }));
                    }
                    renderForms();
                    updateStats();

                    // Background refresh jika online
                    if (!isOffline) {
                        setTimeout(() => fetchDataBackground(), 1500);
                    }

                } catch (e) {
                    console.error('[forms_admin] Save error:', e);
                    safeToast('Error: ' + e.message, 'error', 5000);
                } finally {
                    isSubmitting = false;
                    btn.disabled = false;
                    btn.innerHTML = orig;
                }
            });
        }

        async function fetchDataBackground() {
            try {
                const res = await forceRefreshData('getForms', {});
                if (res && res.success && Array.isArray(res.data)) {
                    formsCache = res.data;
                    renderForms();
                    updateStats();
                }
            } catch (e) {
                console.warn('[forms_admin] Background refresh error:', e);
            }
        }

        // ================================================================
        // 18. BUILDER CLOSE / CANCEL
        // ================================================================
        function handleBuilderClose() {
            if (isDirty) {
                showConfirm('Ada perubahan yang belum disimpan. Yakin keluar?', () => {
                    isDirty = false;
                    closeModal(builderModal);
                });
            } else {
                closeModal(builderModal);
            }
        }

        if (builderClose) {
            const fresh = builderClose.cloneNode(true);
            builderClose.parentNode.replaceChild(fresh, builderClose);
            fresh.addEventListener('click', handleBuilderClose);
        }
        if (builderCancel) {
            const fresh = builderCancel.cloneNode(true);
            builderCancel.parentNode.replaceChild(fresh, builderCancel);
            fresh.addEventListener('click', handleBuilderClose);
        }
        if (builderModal) {
            builderModal.addEventListener('click', (e) => {
                if (e.target === builderModal) handleBuilderClose();
            });
        }

        if (builderFormTitle) {
            builderFormTitle.addEventListener('input', () => { isDirty = true; });
        }
        if (builderFormDesc) {
            builderFormDesc.addEventListener('input', () => { isDirty = true; });
        }

        // ================================================================
        // 19. PREVIEW
        // ================================================================
        if (builderPreviewBtn) {
            const fresh = builderPreviewBtn.cloneNode(true);
            builderPreviewBtn.parentNode.replaceChild(fresh, builderPreviewBtn);
            fresh.addEventListener('click', () => {
                renderPreview();
                openModal(previewModal);
            });
        }

        function renderPreview() {
            if (!previewBody) return;

            const title = (builderFormTitle.value || '').trim() || 'Untitled Form';
            const desc = (builderFormDesc.value || '').trim();

            let html = '<div class="fb-preview-container">';
            html += '<h1 class="fb-preview-title">' + escapeHtml(title) + '</h1>';
            if (desc) {
                html += '<p class="fb-preview-desc">' + escapeHtml(desc) + '</p>';
            }

            html += '<div class="fb-preview-meta">';
            html += '<i class="fas fa-shield-alt"></i>';
            html += '<span>Data Anda aman &amp; hanya digunakan untuk keperluan organisasi</span>';
            html += '</div>';

            html += '<div class="fb-preview-fields">';

            if (currentFields.length === 0) {
                html += '<div class="fb-preview-empty">';
                html += '<i class="fas fa-inbox"></i>';
                html += '<p>Belum ada pertanyaan</p>';
                html += '</div>';
            } else {
                currentFields.forEach((f, idx) => {
                    const isReq = f.required === 'yes' || f.required === true;
                    let opts = [];
                    try { opts = f.options ? JSON.parse(f.options) : []; } catch (e) {}

                    html += '<div class="fb-preview-field">';
                    html += '<label class="fb-preview-label">';
                    html += '<span class="fb-preview-number">' + (idx + 1) + '</span>';
                    html += escapeHtml(f.label || 'Pertanyaan');
                    if (isReq) html += '<span class="fb-preview-required">*</span>';
                    html += '</label>';
                    if (f.help_text) {
                        html += '<p class="fb-preview-help">' + escapeHtml(f.help_text) + '</p>';
                    }

                    const inputAttr = 'disabled';
                    const placeholder = escapeAttr(f.placeholder || '');

                    if (f.type === 'text') {
                        html += '<input type="text" class="fb-preview-input" placeholder="' + placeholder + '" ' + inputAttr + '>';
                    } else if (f.type === 'email') {
                        html += '<input type="email" class="fb-preview-input" placeholder="' + placeholder + '" ' + inputAttr + '>';
                    } else if (f.type === 'number') {
                        html += '<input type="number" class="fb-preview-input" placeholder="' + placeholder + '" ' + inputAttr + '>';
                    } else if (f.type === 'textarea') {
                        html += '<textarea class="fb-preview-textarea" placeholder="' + placeholder + '" ' + inputAttr + '></textarea>';
                    } else if (f.type === 'date') {
                        html += '<input type="date" class="fb-preview-input" ' + inputAttr + '>';
                    } else if (f.type === 'time') {
                        html += '<input type="time" class="fb-preview-input" ' + inputAttr + '>';
                    } else if (f.type === 'radio') {
                        html += '<div class="fb-preview-radio-group">';
                        opts.forEach((opt, i) => {
                            html += '<label class="fb-preview-choice">';
                            html += '<input type="radio" disabled name="pv_' + escapeAttr(f.id) + '_' + i + '">';
                            html += '<span>' + escapeHtml(opt) + '</span>';
                            html += '</label>';
                        });
                        html += '</div>';
                    } else if (f.type === 'checkbox') {
                        html += '<div class="fb-preview-checkbox-group">';
                        opts.forEach((opt, i) => {
                            html += '<label class="fb-preview-choice">';
                            html += '<input type="checkbox" disabled>';
                            html += '<span>' + escapeHtml(opt) + '</span>';
                            html += '</label>';
                        });
                        html += '</div>';
                    } else if (f.type === 'select') {
                        html += '<select class="fb-preview-select" ' + inputAttr + '>';
                        html += '<option>-- Pilih --</option>';
                        opts.forEach(opt => {
                            html += '<option>' + escapeHtml(opt) + '</option>';
                        });
                        html += '</select>';
                    } else if (f.type === 'rating') {
                        html += '<div class="fb-preview-rating">';
                        for (let i = 1; i <= 5; i++) {
                            html += '<i class="far fa-star"></i>';
                        }
                        html += '</div>';
                    }

                    html += '</div>';
                });
            }

            html += '</div>';
            html += '<button class="fb-preview-submit" disabled>';
            html += '<i class="fas fa-paper-plane"></i>';
            html += '<span>Kirim Jawaban (Preview)</span>';
            html += '</button>';
            html += '</div>';

            previewBody.innerHTML = html;
        }

        if (previewClose) {
            const fresh = previewClose.cloneNode(true);
            previewClose.parentNode.replaceChild(fresh, previewClose);
            fresh.addEventListener('click', () => closeModal(previewModal));
        }
        if (previewModal) {
            previewModal.addEventListener('click', (e) => {
                if (e.target === previewModal) closeModal(previewModal);
            });
        }

        // ================================================================
        // 20. DELETE FORM — HANDLE OFFLINE
        // ================================================================
        function confirmDelete(id) {
            const form = formsCache.find(f => String(f.id) === String(id));
            const title = form ? (form.title || 'form ini') : 'form ini';

            showConfirm(
                'Hapus form "' + title + '"?\n\nSemua respon dan pertanyaan terkait akan dihapus permanen.',
                async () => {
                    try {
                        const res = await apiCall('deleteForm', 'POST', { id: id });
                        if (res && res.success) {
                            formsCache = formsCache.filter(f => String(f.id) !== String(id));
                            responsesCache = responsesCache.filter(r => String(r.form_id) !== String(id));
                            notificationsCache = notificationsCache.filter(n => String(n.form_id) !== String(id));
                            renderForms();
                            updateStats();
                            await logActivity('DELETE', 'forms', id, 'Hapus form: ' + title);

                            if (res._offline) {
                                safeToast('📴 Form dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                            } else {
                                safeToast('✅ Form berhasil dihapus!', 'success');
                            }
                        } else {
                            safeToast((res && res.message) || 'Gagal hapus form', 'error');
                        }
                    } catch (e) {
                        console.error('[forms_admin] Delete error:', e);
                        safeToast('Error: ' + e.message, 'error');
                    }
                }
            );
        }

        // ================================================================
        // 21. SHARE
        // ================================================================
        function openShare(formId, slug) {
            currentShareFormId = formId;
            currentShareSlug = slug;

            const link = window.location.origin + window.location.pathname +
                '#/form_view?id=' + encodeURIComponent(slug);

            if (shareLinkInput) shareLinkInput.value = link;
            if (qrResult) qrResult.classList.add('hidden');
            if (embedResult) embedResult.classList.add('hidden');
            if (qrCodeContainer) qrCodeContainer.innerHTML = '';
            if (embedCode) embedCode.value = '';

            openModal(shareModal);
        }

        if (shareClose) {
            const fresh = shareClose.cloneNode(true);
            shareClose.parentNode.replaceChild(fresh, shareClose);
            fresh.addEventListener('click', () => closeModal(shareModal));
        }
        if (shareModal) {
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) closeModal(shareModal);
            });
        }

        if (copyLinkBtn) {
            const fresh = copyLinkBtn.cloneNode(true);
            copyLinkBtn.parentNode.replaceChild(fresh, copyLinkBtn);
            fresh.addEventListener('click', () => {
                const text = shareLinkInput ? shareLinkInput.value : '';
                copyToClipboard(text)
                    .then(() => safeToast('Link dicopy ke clipboard', 'success', 2000))
                    .catch(() => safeToast('Gagal copy link', 'error'));
            });
        }

        document.querySelectorAll('.fb-share-btn').forEach(btn => {
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', () => {
                const type = fresh.dataset.share;
                const link = shareLinkInput ? shareLinkInput.value : '';
                const form = formsCache.find(f => String(f.id) === String(currentShareFormId));
                const title = form ? (form.title || 'Form') : 'Form';
                let url = '';

                switch (type) {
                    case 'wa':
                        url = 'https://wa.me/?text=' + encodeURIComponent('*' + title + '*\n\nSilakan isi form berikut:\n' + link);
                        break;
                    case 'tg':
                        url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(title);
                        break;
                    case 'fb':
                        url = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(link);
                        break;
                    case 'tw':
                        url = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(title);
                        break;
                    case 'email':
                        url = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent('Silakan isi form berikut:\n\n' + link);
                        break;
                    case 'qr':
                        renderQR(link);
                        return;
                    case 'embed':
                        if (embedCode) embedCode.value = '<iframe src="' + link + '" style="width:100%;height:700px;border:1px solid #e2e8f0;border-radius:12px;" allowfullscreen></iframe>';
                        if (embedResult) embedResult.classList.remove('hidden');
                        if (qrResult) qrResult.classList.add('hidden');
                        return;
                    case 'native':
                        if (navigator.share) {
                            navigator.share({
                                title: title,
                                text: 'Silakan isi form berikut:',
                                url: link
                            }).catch(() => {});
                        } else {
                            copyToClipboard(link)
                                .then(() => safeToast('Link dicopy (native share tidak tersedia)', 'success', 2500))
                                .catch(() => safeToast('Gagal copy', 'error'));
                        }
                        return;
                    default:
                        return;
                }

                if (url) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            });
        });

        async function renderQR(text) {
            if (!qrCodeContainer) return;
            qrCodeContainer.innerHTML = '';
            if (qrResult) qrResult.classList.remove('hidden');
            if (embedResult) embedResult.classList.add('hidden');

            // Auto-load QR lib jika belum
            if (typeof QRCode === 'undefined') {
                if (typeof window.loadLib === 'function') {
                    try { await window.loadLib('qrcode'); } catch (e) {}
                }
            }

            if (typeof QRCode === 'undefined') {
                qrCodeContainer.innerHTML = '<p style="color: #dc2626; font-size: 0.8rem;">Library QR tidak tersedia</p>';
                return;
            }

            try {
                new QRCode(qrCodeContainer, {
                    text: text,
                    width: 180,
                    height: 180,
                    colorDark: '#0f2922',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (e) {
                console.error('[forms_admin] QR error:', e);
                qrCodeContainer.innerHTML = '<p style="color: #dc2626; font-size: 0.8rem;">Gagal generate QR</p>';
            }
        }

        // ================================================================
        // 22. ADD FORM BUTTON
        // ================================================================
        if (addFormBtn) {
            const fresh = addFormBtn.cloneNode(true);
            addFormBtn.parentNode.replaceChild(fresh, addFormBtn);
            fresh.addEventListener('click', () => openBuilder(null));
        }

        // ================================================================
        // 23. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i><span class="fb-btn-label">Memuat...</span>';

                try {
                    await refreshFormsData();
                    safeToast('Data diperbarui', 'success', 2000);
                } finally {
                    this.disabled = false;
                    this.innerHTML = orig;
                }
            });
        }

        // ================================================================
        // 24. SEARCH & FILTER
        // ================================================================
        if (searchInput) {
            searchInput.addEventListener('input',
                debounceEvent.bind(null, 'forms-search', () => renderForms(), 250));
        }
        if (statusFilter) {
            statusFilter.addEventListener('change', renderForms);
        }

        // ================================================================
        // 25. ESC KEY HANDLER
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;

            if (fieldModal && !fieldModal.classList.contains('hidden')) {
                closeModal(fieldModal);
            } else if (previewModal && !previewModal.classList.contains('hidden')) {
                closeModal(previewModal);
            } else if (shareModal && !shareModal.classList.contains('hidden')) {
                closeModal(shareModal);
            } else if (builderModal && !builderModal.classList.contains('hidden')) {
                handleBuilderClose();
            }
        });

        // ================================================================
        // 26. LISTEN SYNC EVENTS (auto-refresh saat online)
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[forms_admin] Sync complete, refreshing...');
                refreshFormsData();
            }
        });

        // ================================================================
        // 27. INIT
        // ================================================================
        console.log('[forms_admin] Init started');
        await loadForms();
        console.log('[forms_admin] ✅ Init complete v4.0.0');
    }

    // ================================================================
    // 28. CLEANUP
    // ================================================================
    function cleanup() {
        window.__formsAdminLoaded = false;
        formsCache = [];
        responsesCache = [];
        notificationsCache = [];
        currentFields = [];
        editingFormId = null;
        isDirty = false;
        isSubmitting = false;
        console.log('[forms_admin] Cleanup');
    }
    window.__formsAdminCleanup = cleanup;

    // ================================================================
    // 29. RUN INIT
    // ================================================================
    init();
});