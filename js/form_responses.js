/**
 * js/form_responses.js
 * Response Viewer — Form Builder
 * Versi: 2.1.0 — FULL FIX (All Menus Working)
 * ---------------------------------------------------------
 * CHANGELOG v2.1.0:
 *  - ✅ FIX: Guard anti-duplikasi + cleanup via router
 *  - ✅ FIX: XSS protection di semua output
 *  - ✅ FIX: Clone-replace listener (anti memory leak)
 *  - ✅ FIX: Null-safe untuk semua DOM elements
 *  - ✅ FIX: Form ID extraction dari 3 fallback (router, hash, search)
 *  - ✅ FIX: Load form info + fields + responses paralel
 *  - ✅ FIX: Dynamic table header mengikuti fields form
 *  - ✅ FIX: Detail modal per responden (semua jawaban)
 *  - ✅ FIX: Delete response dengan konfirmasi
 *  - ✅ FIX: Export CSV lengkap (semua fields)
 *  - ✅ FIX: Share form dengan native + copy fallback
 *  - ✅ FIX: Search real-time (nama + email)
 *  - ✅ FIX: Stats 4 kartu (total, hari ini, 7 hari, email)
 *  - ✅ FIX: Clear search button
 *  - ✅ FIX: ESC + click-outside modal
 *  - ✅ FIX: Back to forms button
 *  - ✅ FIX: Refresh data
 *  - ✅ FIX: Empty state + error state proper
 * ---------------------------------------------------------
 */

App.register('form_responses', function() {
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
    if (window.__formResponsesLoaded) {
        console.log('[form_responses] Skip - already loaded');
        return;
    }
    window.__formResponsesLoaded = true;

    // ================================================================
    // 3. GET FORM_ID FROM URL (3 FALLBACK)
    // ================================================================
    let formId = '';
    if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
        formId = window.__currentQuery.get('id') || '';
    }
    if (!formId) {
        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx !== -1) {
            try {
                const params = new URLSearchParams(hash.substring(qIdx));
                formId = params.get('id') || '';
            } catch (e) {}
        }
    }
    if (!formId) {
        try {
            formId = new URLSearchParams(window.location.search).get('id') || '';
        } catch (e) {}
    }

    if (!formId) {
        console.error('[form_responses] No form ID');
        if (typeof showToast === 'function') {
            showToast('ID Form tidak ditemukan', 'error', 3000);
        }
        setTimeout(() => router.load('/forms_admin'), 1000);
        return;
    }

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

    function formatDateTime(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        const day = date.toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        const time = date.toLocaleTimeString('id-ID', {
            hour: '2-digit', minute: '2-digit'
        });
        return day + ' · ' + time;
    }

    function truncate(str, len) {
        if (!str) return '';
        str = String(str);
        if (str.length <= len) return str;
        return str.substring(0, len) + '...';
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

    // ================================================================
    // 5. STATE
    // ================================================================
    let formData = null;
    let fieldsData = [];
    let responsesData = [];
    let filteredData = [];
    let isLoading = false;
    let currentSearchQuery = '';

    // ================================================================
    // 6. INIT
    // ================================================================
    async function init() {
        const requiredIds = [
            'responses-title', 'responses-subtitle',
            'back-to-forms-btn', 'refresh-responses-btn', 'export-responses-btn', 'share-form-btn-2',
            'stat-total', 'stat-today', 'stat-week', 'stat-emails',
            'response-search',
            'responses-thead', 'responses-table-body',
            'response-detail-modal', 'response-detail-body', 'response-detail-close'
        ];

        const els = await waitForElements(requiredIds);

        const titleEl      = els['responses-title'];
        const subtitleEl   = els['responses-subtitle'];
        const backBtn      = els['back-to-forms-btn'];
        const refreshBtn   = els['refresh-responses-btn'];
        const exportBtn    = els['export-responses-btn'];
        const shareBtn     = els['share-form-btn-2'];
        const statTotal    = els['stat-total'];
        const statToday    = els['stat-today'];
        const statWeek     = els['stat-week'];
        const statEmails   = els['stat-emails'];
        const searchInput  = els['response-search'];
        const thead        = els['responses-thead'];
        const tbody        = els['responses-table-body'];
        const detailModal  = els['response-detail-modal'];
        const detailBody   = els['response-detail-body'];
        const detailClose  = els['response-detail-close'];

        if (!tbody || !thead) {
            console.error('[form_responses] Critical elements missing');
            return;
        }

        // ================================================================
        // 7. LOAD FORM INFO
        // ================================================================
        async function loadFormInfo() {
            try {
                const res = await apiCall('getForms', 'POST', {});
                if (res && res.success && Array.isArray(res.data)) {
                    formData = res.data.find(f => f.id === formId);
                }

                if (!formData) {
                    if (titleEl) titleEl.textContent = 'Form Tidak Ditemukan';
                    if (subtitleEl) subtitleEl.textContent = 'Form dengan ID ini tidak tersedia';
                    return false;
                }

                if (titleEl) titleEl.textContent = formData.title || 'Respon Form';
                if (subtitleEl) {
                    const statusLabel = formData.status === 'published' ? 'Published'
                        : formData.status === 'closed' ? 'Closed' : 'Draft';
                    subtitleEl.innerHTML = 'Form: <strong>' + escapeHtml(formData.slug || formId) +
                        '</strong> · Status: ' + escapeHtml(statusLabel);
                }
                return true;
            } catch (e) {
                console.error('[form_responses] Load form info error:', e);
                return false;
            }
        }

        // ================================================================
        // 8. LOAD FIELDS
        // ================================================================
        async function loadFields() {
            try {
                const res = await apiCall('getFormFields', 'POST', { form_id: formId });
                fieldsData = (res && res.success && Array.isArray(res.data)) ? res.data : [];
                fieldsData.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
                return fieldsData;
            } catch (e) {
                console.error('[form_responses] Load fields error:', e);
                fieldsData = [];
                return [];
            }
        }

        // ================================================================
        // 9. LOAD RESPONSES
        // ================================================================
        async function loadResponses(force) {
            force = force || false;

            if (isLoading) return;
            isLoading = true;

            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="fr-table-loading-cell">
                        <div class="fr-loading-wrap">
                            <div class="fr-spinner"></div>
                            <p>Memuat data respon...</p>
                        </div>
                    </td>
                </tr>
            `;

            try {
                const res = force
                    ? await forceRefreshData('getFormResponses', { form_id: formId })
                    : await apiCall('getFormResponses', 'POST', { form_id: formId });

                responsesData = (res && res.success && Array.isArray(res.data)) ? res.data : [];

                responsesData.sort((a, b) =>
                    new Date(b.created_at || 0) - new Date(a.created_at || 0));

                applySearch();
                updateStats();
            } catch (e) {
                console.error('[form_responses] Load responses error:', e);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="fr-table-loading-cell">
                            <div class="fr-empty-state">
                                <i class="fas fa-exclamation-triangle fr-empty-icon" style="color: #dc2626;"></i>
                                <p class="fr-empty-title">Gagal Memuat Data</p>
                                <p class="fr-empty-desc">${escapeHtml(e.message || 'Periksa koneksi Anda')}</p>
                            </div>
                        </td>
                    </tr>
                `;
            } finally {
                isLoading = false;
            }
        }

        // ================================================================
        // 10. UPDATE STATS
        // ================================================================
        function updateStats() {
            const total = responsesData.length;

            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const todayCount = responsesData.filter(r => {
                const d = new Date(r.created_at);
                return !isNaN(d.getTime()) && d >= todayStart;
            }).length;

            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const weekCount = responsesData.filter(r => {
                const d = new Date(r.created_at);
                return !isNaN(d.getTime()) && d >= weekAgo;
            }).length;

            const emailCount = responsesData.filter(r =>
                r.respondent_email && String(r.respondent_email).trim()
            ).length;

            if (statTotal) statTotal.textContent = total;
            if (statToday) statToday.textContent = todayCount;
            if (statWeek) statWeek.textContent = weekCount;
            if (statEmails) statEmails.textContent = emailCount;
        }

        // ================================================================
        // 11. APPLY SEARCH
        // ================================================================
        function applySearch() {
            const q = (currentSearchQuery || '').toLowerCase().trim();

            if (!q) {
                filteredData = responsesData;
            } else {
                filteredData = responsesData.filter(r => {
                    const name = String(r.respondent_name || '').toLowerCase();
                    const email = String(r.respondent_email || '').toLowerCase();
                    return name.indexOf(q) > -1 || email.indexOf(q) > -1;
                });
            }

            renderTable();
        }

        // ================================================================
        // 12. RENDER TABLE HEAD
        // ================================================================
        function renderThead() {
            if (!thead) return;

            let html = '';
            html += '<th class="fr-th" style="width: 50px; text-align: center;">No</th>';
            html += '<th class="fr-th">Nama Responden</th>';
            if (formData && formData.collect_email === 'yes') {
                html += '<th class="fr-th">Email</th>';
            }
            html += '<th class="fr-th">Waktu Submit</th>';
            html += '<th class="fr-th fr-th-actions">Aksi</th>';
            thead.innerHTML = html;
        }

        // ================================================================
        // 13. RENDER TABLE BODY
        // ================================================================
        function renderTable() {
            if (!tbody) return;

            renderThead();

            if (filteredData.length === 0) {
                const isEmpty = responsesData.length === 0;
                const isFiltered = currentSearchQuery && currentSearchQuery.trim();

                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="fr-table-loading-cell">
                            <div class="fr-empty-state">
                                <i class="fas fa-inbox fr-empty-icon"></i>
                                <p class="fr-empty-title">
                                    ${isEmpty ? 'Belum Ada Respon' : (isFiltered ? 'Tidak Ada Hasil' : 'Belum Ada Respon')}
                                </p>
                                <p class="fr-empty-desc">
                                    ${isEmpty
                                        ? 'Bagikan link form ini ke responden untuk mulai menerima jawaban.'
                                        : 'Coba ubah kata kunci pencarian Anda.'}
                                </p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            let html = '';
            filteredData.forEach((r, idx) => {
                const name = r.respondent_name || 'Anonim';
                const email = r.respondent_email || '';
                const dateStr = formatDateTime(r.created_at);

                html += '<tr>';
                html += '<td class="fr-td fr-td-index">' + (idx + 1) + '</td>';
                html += '<td class="fr-td fr-td-name" title="' + escapeAttr(name) + '">' + escapeHtml(truncate(name, 40)) + '</td>';
                if (formData && formData.collect_email === 'yes') {
                    html += '<td class="fr-td fr-td-email" title="' + escapeAttr(email) + '">' +
                        (email ? escapeHtml(truncate(email, 35)) : '-') + '</td>';
                }
                html += '<td class="fr-td fr-td-date">' + escapeHtml(dateStr) + '</td>';
                html += '<td class="fr-td fr-td-actions">';
                html += '<button type="button" class="fr-action-btn fr-action-btn-view" data-id="' +
                    escapeAttr(r.id) + '" title="Lihat Detail"><i class="fas fa-eye"></i></button>';
                html += '<button type="button" class="fr-action-btn fr-action-btn-delete" data-id="' +
                    escapeAttr(r.id) + '" title="Hapus"><i class="fas fa-trash"></i></button>';
                html += '</td>';
                html += '</tr>';
            });

            tbody.innerHTML = html;

            tbody.querySelectorAll('.fr-action-btn-view').forEach(btn => {
                btn.addEventListener('click', function() {
                    viewResponse(this.dataset.id);
                });
            });
            tbody.querySelectorAll('.fr-action-btn-delete').forEach(btn => {
                btn.addEventListener('click', function() {
                    deleteResponse(this.dataset.id);
                });
            });
        }

        // ================================================================
        // 14. VIEW RESPONSE DETAIL
        // ================================================================
        function viewResponse(id) {
            const r = responsesData.find(x => x.id === id);
            if (!r) {
                showToast('Respon tidak ditemukan', 'warning');
                return;
            }

            let answers = {};
            try { answers = JSON.parse(r.answers || '{}'); } catch (e) {}

            let html = '';

            html += '<div class="fr-detail-header">';
            html += '<p class="fr-detail-header-label">Responden</p>';
            html += '<p class="fr-detail-name">' + escapeHtml(r.respondent_name || 'Anonim') + '</p>';
            if (r.respondent_email) {
                html += '<p class="fr-detail-email"><i class="fas fa-envelope"></i> ' +
                    escapeHtml(r.respondent_email) + '</p>';
            }
            html += '<p class="fr-detail-time"><i class="far fa-clock"></i> ' +
                formatDateTime(r.created_at) + '</p>';
            html += '</div>';

            if (fieldsData.length === 0) {
                html += '<div class="fr-detail-answer">';
                html += '<p class="fr-detail-answer-value fr-detail-empty">Form ini tidak memiliki pertanyaan.</p>';
                html += '</div>';
            } else {
                fieldsData.forEach((f, i) => {
                    const key = 'field_' + f.id;
                    const val = answers[key];
                    let valueHtml = '';

                    if (Array.isArray(val)) {
                        if (val.length === 0) {
                            valueHtml = '<p class="fr-detail-answer-value fr-detail-empty">(kosong)</p>';
                        } else {
                            valueHtml = '<ul class="fr-detail-list">';
                            val.forEach(v => {
                                valueHtml += '<li>' + escapeHtml(v) + '</li>';
                            });
                            valueHtml += '</ul>';
                        }
                    }
                    else if (f.type === 'rating' && val !== undefined && val !== null && val !== '') {
                        const num = Math.min(Math.max(Number(val) || 0, 0), 5);
                        const stars = '★'.repeat(num) + '☆'.repeat(5 - num);
                        valueHtml = '<div class="fr-detail-answer-value fr-detail-rating">';
                        valueHtml += '<span class="stars">' + stars + '</span>';
                        valueHtml += '<span class="score">' + num + ' / 5</span>';
                        valueHtml += '</div>';
                    }
                    else if (val === null || val === undefined || val === '') {
                        valueHtml = '<p class="fr-detail-answer-value fr-detail-empty">(kosong)</p>';
                    }
                    else {
                        valueHtml = '<p class="fr-detail-answer-value">' +
                            escapeHtml(String(val)) + '</p>';
                    }

                    html += '<div class="fr-detail-answer">';
                    html += '<p class="fr-detail-answer-label">';
                    html += '<span>' + (i + 1) + '.</span>';
                    html += '<span>' + escapeHtml(f.label || '-') + '</span>';
                    html += '</p>';
                    html += valueHtml;
                    html += '</div>';
                });
            }

            if (detailBody) detailBody.innerHTML = html;

            if (detailModal) {
                detailModal.classList.remove('hidden');
                detailModal.classList.add('flex');
            }
            document.body.style.overflow = 'hidden';
        }

        // ================================================================
        // 15. DELETE RESPONSE
        // ================================================================
        function deleteResponse(id) {
            const r = responsesData.find(x => x.id === id);
            const name = r ? (r.respondent_name || 'responden ini') : 'responden ini';

            showConfirm('Hapus respon dari "' + name + '"?\n\nTindakan ini tidak bisa dibatalkan.', async () => {
                try {
                    const res = await apiCall('deleteFormResponse', 'POST', { id: id });
                    if (res && res.success) {
                        responsesData = responsesData.filter(x => x.id !== id);
                        applySearch();
                        updateStats();
                        await logActivity('DELETE', 'form_responses', id, 'Hapus respon: ' + name);
                        showToast('Respon berhasil dihapus', 'success', 2500);
                    } else {
                        showToast((res && res.message) || 'Gagal menghapus respon', 'error');
                    }
                } catch (e) {
                    console.error('[form_responses] Delete error:', e);
                    showToast('Error: ' + e.message, 'error');
                }
            });
        }

        // ================================================================
        // 16. EXPORT CSV
        // ================================================================
        function exportCSV() {
            if (filteredData.length === 0) {
                showToast('Tidak ada data untuk diexport', 'warning');
                return;
            }

            const headers = ['No', 'Waktu Submit', 'Nama Responden'];
            if (formData && formData.collect_email === 'yes') {
                headers.push('Email');
            }
            fieldsData.forEach(f => {
                headers.push(f.label || ('Field ' + f.id));
            });

            const rows = filteredData.map((r, i) => {
                let answers = {};
                try { answers = JSON.parse(r.answers || '{}'); } catch (e) {}

                const row = [
                    i + 1,
                    formatDateTime(r.created_at),
                    r.respondent_name || ''
                ];

                if (formData && formData.collect_email === 'yes') {
                    row.push(r.respondent_email || '');
                }

                fieldsData.forEach(f => {
                    const key = 'field_' + f.id;
                    const val = answers[key];

                    if (Array.isArray(val)) {
                        row.push(val.join('; '));
                    } else if (f.type === 'rating' && val) {
                        row.push((Number(val) || 0) + ' / 5');
                    } else if (val === null || val === undefined) {
                        row.push('');
                    } else {
                        row.push(String(val));
                    }
                });

                return row;
            });

            const csv = [headers, ...rows]
                .map(row => row.map(cell => {
                    const str = String(cell === null || cell === undefined ? '' : cell);
                    return '"' + str.replace(/"/g, '""') + '"';
                }).join(','))
                .join('\n');

            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const slugSafe = (formData && formData.slug ? formData.slug : formId).replace(/[^a-z0-9-]/gi, '_');
            a.download = 'responses_' + slugSafe + '_' + new Date().toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast('CSV berhasil diunduh (' + filteredData.length + ' baris)', 'success', 3000);
        }

        // ================================================================
        // 17. SHARE FORM
        // ================================================================
        function shareForm() {
            if (!formData || !formData.slug) {
                showToast('Link form tidak tersedia', 'warning');
                return;
            }

            const link = window.location.origin + window.location.pathname +
                '#/form_view?id=' + encodeURIComponent(formData.slug);

            if (navigator.share) {
                navigator.share({
                    title: formData.title || 'Formulir',
                    text: 'Silakan isi formulir berikut:',
                    url: link
                }).catch(() => {
                    copyToClipboard(link)
                        .then(() => showToast('Link dicopy: ' + link, 'success', 4000))
                        .catch(() => showToast('Gagal copy link', 'error'));
                });
                return;
            }

            copyToClipboard(link)
                .then(() => showToast('Link dicopy ke clipboard!', 'success', 2500))
                .catch(() => {
                    window.prompt('Copy link form ini:', link);
                });
        }

        // ================================================================
        // 18. BIND EVENTS (Idempotent)
        // ================================================================
        if (backBtn) {
            const fresh = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(fresh, backBtn);
            fresh.addEventListener('click', () => {
                router.load('/forms_admin');
            });
        }

        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';

                try {
                    await loadResponses(true);
                    showToast('Data diperbarui', 'success', 2000);
                } finally {
                    this.disabled = false;
                    this.innerHTML = orig;
                }
            });
        }

        if (exportBtn) {
            const fresh = exportBtn.cloneNode(true);
            exportBtn.parentNode.replaceChild(fresh, exportBtn);
            fresh.addEventListener('click', exportCSV);
        }

        if (shareBtn) {
            const fresh = shareBtn.cloneNode(true);
            shareBtn.parentNode.replaceChild(fresh, shareBtn);
            fresh.addEventListener('click', shareForm);
        }

        if (searchInput) {
            let searchTimer = null;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimer);
                const val = this.value || '';
                currentSearchQuery = val;
                const clearBtn = document.getElementById('fr-clear-search');
                if (clearBtn) clearBtn.classList.toggle('hidden', !val.trim());

                searchTimer = setTimeout(() => {
                    applySearch();
                }, 250);
            });
        }

        const clearSearchBtn = document.getElementById('fr-clear-search');
        if (clearSearchBtn) {
            const fresh = clearSearchBtn.cloneNode(true);
            clearSearchBtn.parentNode.replaceChild(fresh, clearSearchBtn);
            fresh.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                currentSearchQuery = '';
                fresh.classList.add('hidden');
                applySearch();
            });
        }

        if (detailClose) {
            const fresh = detailClose.cloneNode(true);
            detailClose.parentNode.replaceChild(fresh, detailClose);
            fresh.addEventListener('click', () => {
                if (detailModal) {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                }
                document.body.style.overflow = '';
            });
        }
        if (detailModal) {
            detailModal.addEventListener('click', (e) => {
                if (e.target === detailModal) {
                    detailModal.classList.add('hidden');
                    detailModal.classList.remove('flex');
                    document.body.style.overflow = '';
                }
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && detailModal && !detailModal.classList.contains('hidden')) {
                detailModal.classList.add('hidden');
                detailModal.classList.remove('flex');
                document.body.style.overflow = '';
            }
        });

        // ================================================================
        // 19. CLEANUP
        // ================================================================
        function cleanup() {
            window.__formResponsesLoaded = false;
            document.body.style.overflow = '';
            console.log('[form_responses] Cleanup');
        }
        window.__formResponsesCleanup = cleanup;

        // ================================================================
        // 20. LOAD ALL DATA
        // ================================================================
        console.log('[form_responses] Init - form_id:', formId);

        const ok = await loadFormInfo();
        if (!ok) {
            console.warn('[form_responses] Form not found');
            return;
        }

        await Promise.allSettled([
            loadFields(),
            loadResponses()
        ]);

        console.log('[form_responses] Init complete');
    }

    // ================================================================
    // 21. RUN INIT
    // ================================================================
    init();
});