/**
 * js/forum_admin.js
 * Modul Admin Forum Diskusi - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±240
 */

App.register('forum_admin', function() {
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
    if (window.__forumAdminLoaded) return;
    window.__forumAdminLoaded = true;

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
            'forum-container',
            'total-topik', 'total-komentar', 'topik-terakhir',
            'topic-modal', 'modal-content', 'modal-title',
            'topic-form', 'modal-close', 'add-btn', 'refresh-forum-btn',
            'edit-id', 'topic_judul', 'topic_isi'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'forum-container': container,
            'total-topik': totalTopikEl,
            'total-komentar': totalKomentarEl,
            'topik-terakhir': topikTerakhirEl,
            'topic-modal': modal,
            'modal-content': modalContent,
            'modal-title': modalTitle,
            'topic-form': form,
            'modal-close': closeBtn,
            'add-btn': addBtn,
            'refresh-forum-btn': refreshBtn,
            'edit-id': idInput,
            'topic_judul': judulInput,
            'topic_isi': isiInput
        } = els;

        if (!container || !modal || !form) {
            console.error('forum_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let isEdit = false;
        let topicsCache = [];
        let commentsCache = [];

        // ================================================================
        // 6. LOAD DATA FORUM (Stale-While-Revalidate)
        // ================================================================
        async function loadForum(force = false) {
            // Jika sudah ada data, tampilkan dulu lalu refresh background
            if (topicsCache.length > 0 && !force) {
                renderForum();
                fetchDataBackground();
                return;
            }

            // Tampilkan loading
            container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';

            try {
                const [topicsRes, commentsRes] = await Promise.all([
                    forceRefreshData('getForumTopics', {}),
                    forceRefreshData('getForumComments', {})
                ]);

                if (topicsRes.success && commentsRes.success) {
                    topicsCache = topicsRes.data || [];
                    commentsCache = commentsRes.data || [];
                    renderForum();
                } else {
                    container.innerHTML = `<div class="text-center py-8 text-red-500">Gagal memuat data forum</div>`;
                }
            } catch (error) {
                container.innerHTML = `<div class="text-center py-8 text-red-500">Error: ${error.message}</div>`;
            }
        }

        // Refresh data di background tanpa mengganggu UI
        async function fetchDataBackground() {
            try {
                const [topicsRes, commentsRes] = await Promise.all([
                    forceRefreshData('getForumTopics', {}),
                    forceRefreshData('getForumComments', {})
                ]);

                if (topicsRes.success && commentsRes.success) {
                    topicsCache = topicsRes.data || [];
                    commentsCache = commentsRes.data || [];
                    renderForum();
                }
            } catch (e) {
                console.warn('Background refresh gagal:', e);
            }
        }

        // ================================================================
        // 7. RENDER FORUM
        // ================================================================
        function renderForum() {
            // Update statistik
            totalTopikEl.textContent = topicsCache.length;
            totalKomentarEl.textContent = commentsCache.length;
            if (topicsCache.length > 0) {
                const sorted = [...topicsCache].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                topikTerakhirEl.textContent = sorted[0]?.judul || '-';
            } else {
                topikTerakhirEl.textContent = '-';
            }

            if (topicsCache.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-muted">Belum ada topik forum.</div>';
                return;
            }

            let html = '';
            topicsCache.forEach(topic => {
                const topicComments = commentsCache.filter(c => c.topik_id === topic.id);
                html += `
                    <div class="topic-card bg-[var(--card-bg)] backdrop-blur-sm rounded-2xl shadow-lg border border-[var(--card-border)] p-5 mb-4">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <h3 class="text-xl font-bold text-[var(--text-main)] font-amiri">${topic.judul}</h3>
                                <p class="text-sm text-[var(--text-muted)]">
                                    Diposting oleh: <span class="font-medium">${topic.created_by || 'Anonim'}</span>
                                    • ${formatDate(topic.created_at)}
                                </p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="editTopic('${topic.id}')" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteTopic('${topic.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <p class="text-[var(--text-main)] mb-3">${topic.isi}</p>
                        <div class="border-t border-[var(--card-border)] pt-3">
                            <p class="text-sm font-semibold text-[var(--text-muted)] mb-2">Komentar (${topicComments.length})</p>
                            ${topicComments.length > 0 ? topicComments.map(c => `
                                <div class="comment-item flex justify-between items-start py-1">
                                    <div>
                                        <p class="text-sm text-[var(--text-main)]">${c.isi_komentar}</p>
                                        <p class="text-xs text-[var(--text-muted)]">${c.created_by || 'Anonim'} • ${formatDate(c.created_at)}</p>
                                    </div>
                                    <button onclick="deleteComment('${c.id}')" class="text-red-500 hover:text-red-700 text-xs"><i class="fas fa-times"></i></button>
                                </div>
                            `).join('') : '<p class="text-sm text-[var(--text-muted)]">Belum ada komentar.</p>'}
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        }

        // ================================================================
        // 8. MODAL FUNCTIONS (Cepat)
        // ================================================================
        function openModal() {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }

        function closeModal() {
            modalContent.classList.remove('scale-100', 'opacity-100');
            modalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
            form.reset();
            idInput.value = '';
            isEdit = false;
        }

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        // ================================================================
        // 9. TAMBAH TOPIK
        // ================================================================
        addBtn.addEventListener('click', () => {
            isEdit = false;
            modalTitle.textContent = 'Tambah Topik';
            form.reset();
            idInput.value = '';
            openModal();
        });

        // ================================================================
        // 10. EDIT TOPIK (Dari Cache, Tanpa Fetch)
        // ================================================================
        window.editTopic = function(id) {
            const topic = topicsCache.find(t => t.id === id);
            if (!topic) {
                showToast('Topik tidak ditemukan di cache', 'warning');
                // Fallback: coba load ulang jika cache kosong
                if (topicsCache.length === 0) {
                    loadForum(true).then(() => {
                        const retry = topicsCache.find(t => t.id === id);
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(topic);
        };

        function fillEditForm(topic) {
            isEdit = true;
            modalTitle.textContent = 'Edit Topik';
            idInput.value = topic.id;
            judulInput.value = topic.judul;
            isiInput.value = topic.isi;
            openModal();
        }

        // ================================================================
        // 11. DELETE TOPIK (Update Cache Lokal)
        // ================================================================
        window.deleteTopic = function(id) {
            showConfirm('Hapus topik ini? Semua komentar juga akan dihapus.', async () => {
                const result = await apiCall('deleteForumTopic', 'POST', { id });
                if (result.success) {
                    topicsCache = topicsCache.filter(t => t.id !== id);
                    commentsCache = commentsCache.filter(c => c.topik_id !== id);
                    renderForum();
                    showToast('Topik dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 12. DELETE KOMENTAR (Update Cache Lokal)
        // ================================================================
        window.deleteComment = function(id) {
            showConfirm('Hapus komentar ini?', async () => {
                const result = await apiCall('deleteForumComment', 'POST', { id });
                if (result.success) {
                    commentsCache = commentsCache.filter(c => c.id !== id);
                    renderForum();
                    showToast('Komentar dihapus!', 'success');
                } else {
                    showToast(result.message || 'Gagal menghapus', 'error');
                }
            });
        };

        // ================================================================
        // 13. SUBMIT FORM (CREATE / UPDATE) - Update Cache Lokal
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            const data = {
                judul: judulInput.value,
                isi: isiInput.value,
                created_by: user.id
            };

            const id = idInput.value;
            const action = isEdit ? 'updateForumTopic' : 'createForumTopic';
            const payload = isEdit ? { id, ...data } : data;

            try {
                const result = await apiCall(action, 'POST', payload);
                if (result.success) {
                    // Update cache lokal
                    if (isEdit) {
                        const index = topicsCache.findIndex(t => t.id === id);
                        if (index !== -1) topicsCache[index] = { ...topicsCache[index], ...data, id: id };
                    } else {
                        const newItem = { ...data, id: result.id, created_at: new Date().toISOString() };
                        topicsCache.unshift(newItem);
                    }

                    renderForum();
                    closeModal();
                    form.reset();
                    showToast('Topik disimpan!', 'success');
                } else {
                    showToast(result.message || 'Gagal menyimpan', 'error');
                }
            } catch (error) {
                showToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
            }
        });

        // ================================================================
        // 14. REFRESH BUTTON (Paksa Fetch)
        // ================================================================
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await loadForum(true);
                showToast('Data diperbarui!', 'success');
            });
        }

        // ================================================================
        // 15. INISIALISASI PERTAMA KALI
        // ================================================================
        loadForum();
    }

    // ================================================================
    // 16. JALANKAN INIT
    // ================================================================
    init();
});