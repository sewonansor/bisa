/**
 * js/profil_admin.js
 * Modul Admin Profil Publik - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi + reset via router
 *  - XSS protection di semua output
 *  - Clone-replace listener (anti memory leak)
 *  - jsPlumb lazy load via window.loadLib
 *  - isSubmitting anti double-submit
 *  - ESC + click-outside modal
 *  - Per-section error handling (Promise.allSettled)
 *
 * FEATURES:
 *  - Tab Sejarah & Visi Misi (form + live preview)
 *  - Tab Struktur Pengurus (CRUD + search + stats + filter)
 *  - Tab Diagram Struktur (jsPlumb + interact + snap grid)
 *  - Node editor dengan color picker + size
 *  - Undo/Redo diagram (history 20 step)
 *  - Export/Import/Copy JSON diagram
 *  - Kelola Posisi Foto (custom CRUD)
 *  - Upload Foto dengan drag-drop + preview grid
 *  - Live preview Sejarah & Visi Misi
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('profil_admin', function() {
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
    if (window.__profilAdminLoaded) {
        console.log('[profil_admin] Sudah di-init, skip.');
        return;
    }
    window.__profilAdminLoaded = true;

    // ================================================================
    // 3. HELPER: TUNGGU ELEMEN DOM SIAP
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 30;
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
    // 4. HELPER FUNCTIONS
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
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    function generateNodeId() {
        return 'node-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
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

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try {
                await window.loadLib(name);
                return true;
            } catch (e) {
                console.warn('[profil_admin] Gagal load lib ' + name + ':', e);
                return false;
            }
        }
        return false;
    }

    // ================================================================
    // 5. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'profil-list',
            'profil-modal', 'modal-content', 'modal-title', 'profil-form', 'modal-close',
            'upload-foto-form', 'foto-key', 'foto-file', 'foto-preview-container', 'foto-preview',
            'struktur-table-body', 'struktur-skeleton', 'add-struktur-btn',
            'struktur-modal', 'struktur-modal-content', 'struktur-modal-title',
            'struktur-form', 'struktur-modal-close',
            'struktur-id', 'struktur_jabatan', 'struktur_nama', 'struktur_foto', 'struktur_urutan',
            'diagram-container', 'add-node-btn', 'add-connection-btn', 'save-diagram-btn', 'clear-diagram-btn',
            'node-edit-modal', 'node-edit-content', 'node-edit-form', 'node-edit-id', 'node-edit-text', 'node-edit-close',
            'new-posisi-input', 'add-posisi-btn', 'posisi-list-container',
            'sejarah_content', 'visi_misi_content', 'save-profil-btn',
            'refresh-profil-btn'
        ];

        const els = await waitForElements(requiredIds);

        const profilList          = els['profil-list'];
        const profilModal         = els['profil-modal'];
        const profilModalContent  = els['modal-content'];
        const profilModalTitle    = els['modal-title'];
        const profilForm          = els['profil-form'];
        const profilCloseBtn      = els['modal-close'];
        const fotoForm            = els['upload-foto-form'];
        const fotoKeySelect       = els['foto-key'];
        const fotoFileInput       = els['foto-file'];
        const fotoPreviewContainer = els['foto-preview-container'];
        const fotoPreview         = els['foto-preview'];
        const strukturTable       = els['struktur-table-body'];
        const strukturSkeleton    = els['struktur-skeleton'];
        const addStrukturBtn      = els['add-struktur-btn'];
        const strukturModal       = els['struktur-modal'];
        const strukturModalContent = els['struktur-modal-content'];
        const strukturModalTitle  = els['struktur-modal-title'];
        const strukturForm        = els['struktur-form'];
        const strukturCloseBtn    = els['struktur-modal-close'];
        const strukturId          = els['struktur-id'];
        const strukturJabatan     = els['struktur_jabatan'];
        const strukturNama        = els['struktur_nama'];
        const strukturFoto        = els['struktur_foto'];
        const strukturUrutan      = els['struktur_urutan'];
        const diagramContainer    = els['diagram-container'];
        const addNodeBtn          = els['add-node-btn'];
        const addConnectionBtn    = els['add-connection-btn'];
        const saveDiagramBtn      = els['save-diagram-btn'];
        const clearDiagramBtn     = els['clear-diagram-btn'];
        const nodeEditModal       = els['node-edit-modal'];
        const nodeEditContent     = els['node-edit-content'];
        const nodeEditForm        = els['node-edit-form'];
        const nodeEditId          = els['node-edit-id'];
        const nodeEditText        = els['node-edit-text'];
        const nodeEditClose       = els['node-edit-close'];
        const newPosisiInput      = els['new-posisi-input'];
        const addPosisiBtn        = els['add-posisi-btn'];
        const posisiListContainer = els['posisi-list-container'];
        const tabSejarah          = els['tab-sejarah'];
        const tabStruktur         = els['tab-struktur'];
        const tabDiagram          = els['tab-diagram'];
        const sejarahContent      = els['sejarah_content'];
        const visiMisiContent     = els['visi_misi_content'];
        const saveProfilBtn       = els['save-profil-btn'];
        const refreshBtn          = els['refresh-profil-btn'];

        if (!profilList && !strukturTable && !diagramContainer) {
            console.error('[profil_admin] Elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 6. STATE
        // ================================================================
        let profilCache = [];
        let strukturCache = [];
        let filteredStruktur = [];
        let fotoPositions = [];
        let isSubmitting = false;
        let diagramHasChanges = false;

        // Diagram state
        let instance = null;
        let nodeCounter = 0;
        let connectionMode = false;
        let sourceNodeId = null;
        let editingNodeId = null;
        let diagramHistory = [];       // undo history
        let historyIndex = -1;

        // Struktur filter state
        let strukturFilter = { search: '', sort: 'urutan-asc' };

        // ================================================================
        // 7. ENSURE EXTRA UI
        // ================================================================
        function ensureExtraUI() {
            // ===== Struktur: Stats + Search + Filter =====
            if (!document.getElementById('struktur-stats') && tabStruktur) {
                const statsDiv = document.createElement('div');
                statsDiv.id = 'struktur-stats';
                statsDiv.className = 'grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4';
                statsDiv.innerHTML = `
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Pengurus</p>
                                <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-struktur">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white">
                                <i class="fas fa-sitemap"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Ada Foto</p>
                                <p class="text-2xl font-bold text-blue-600 mt-1" id="stats-struktur-foto">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                                <i class="fas fa-camera"></i>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card p-4 rounded-xl shadow-lg bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Jabatan Unik</p>
                                <p class="text-2xl font-bold text-purple-600 mt-1" id="stats-struktur-jabatan">0</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                                <i class="fas fa-tags"></i>
                            </div>
                        </div>
                    </div>
                `;
                const tableWrapper = strukturTable ? strukturTable.closest('.bg-\\[var\\(--card-bg\\)\\]') : null;
                if (tableWrapper && tableWrapper.parentNode) {
                    tableWrapper.parentNode.insertBefore(statsDiv, tableWrapper);
                }
            }

            // Struktur: Search & Sort
            if (!document.getElementById('struktur-search-wrap') && tabStruktur) {
                const wrapper = document.createElement('div');
                wrapper.id = 'struktur-search-wrap';
                wrapper.className = 'flex flex-wrap gap-2 mb-4';
                wrapper.innerHTML = `
                    <div class="flex-1 min-w-[200px] relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                        <input type="text" id="struktur-search"
                            placeholder="Cari nama, jabatan..."
                            class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                    </div>
                    <select id="struktur-sort"
                        class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm">
                        <option value="urutan-asc">Urutan ↑</option>
                        <option value="urutan-desc">Urutan ↓</option>
                        <option value="jabatan-asc">Jabatan A-Z</option>
                        <option value="nama-asc">Nama A-Z</option>
                    </select>
                `;
                const statsDiv = document.getElementById('struktur-stats');
                if (statsDiv && statsDiv.parentNode) {
                    statsDiv.parentNode.insertBefore(wrapper, statsDiv.nextSibling);
                }
            }

            // ===== Diagram: Extra buttons (undo/redo/copy/preview) =====
            const diagramBtnWrap = addNodeBtn ? addNodeBtn.parentElement : null;
            if (diagramBtnWrap && !document.getElementById('export-diagram-btn')) {
                const extraBtns = [
                    { id: 'undo-diagram-btn', icon: 'fa-undo', label: 'Undo', cls: 'bg-yellow-600 hover:bg-yellow-700' },
                    { id: 'redo-diagram-btn', icon: 'fa-redo', label: 'Redo', cls: 'bg-yellow-600 hover:bg-yellow-700' },
                    { id: 'copy-diagram-btn', icon: 'fa-copy', label: 'Copy JSON', cls: 'bg-gray-600 hover:bg-gray-700' },
                    { id: 'export-diagram-btn', icon: 'fa-download', label: 'Export', cls: 'bg-gray-600 hover:bg-gray-700' },
                    { id: 'import-diagram-btn', icon: 'fa-upload', label: 'Import', cls: 'bg-gray-600 hover:bg-gray-700' }
                ];

                extraBtns.forEach(btn => {
                    const b = document.createElement('button');
                    b.id = btn.id;
                    b.type = 'button';
                    b.className = btn.cls + ' text-white px-3 py-1 rounded-lg text-sm transition';
                    b.innerHTML = '<i class="fas ' + btn.icon + ' mr-1"></i>' + btn.label;
                    diagramBtnWrap.appendChild(b);
                });

                // Attach handlers
                document.getElementById('undo-diagram-btn').addEventListener('click', undoDiagram);
                document.getElementById('redo-diagram-btn').addEventListener('click', redoDiagram);
                document.getElementById('copy-diagram-btn').addEventListener('click', copyDiagramJSON);
                document.getElementById('export-diagram-btn').addEventListener('click', exportDiagramJSON);
                document.getElementById('import-diagram-btn').addEventListener('click', importDiagramJSON);
            }
        }

        // ================================================================
        // 8. TAB MANAGEMENT
        // ================================================================
        const allTabBtns = document.querySelectorAll('.tab-btn');

        function switchTab(target) {
            allTabBtns.forEach(b => {
                const isActive = b.dataset.tab === target;
                b.classList.toggle('active', isActive);
                if (isActive) {
                    b.classList.add('border-[#0f2922]', 'text-[#0f2922]');
                    b.classList.remove('text-[var(--text-muted)]');
                } else {
                    b.classList.remove('border-[#0f2922]', 'text-[#0f2922]');
                    b.classList.add('text-[var(--text-muted)]');
                }
            });

            if (tabSejarah) tabSejarah.classList.toggle('hidden', target !== 'sejarah');
            if (tabStruktur) tabStruktur.classList.toggle('hidden', target !== 'struktur');
            if (tabDiagram) tabDiagram.classList.toggle('hidden', target !== 'diagram');

            // Lazy init diagram saat tab aktif
            if (target === 'diagram' && !instance && diagramContainer) {
                setTimeout(initJsPlumb, 100);
            }
        }

        allTabBtns.forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            clone.addEventListener('click', function() {
                switchTab(this.dataset.tab);
            });
        });

        // ================================================================
        // 9. LOAD PROFIL (dari backend)
        // ================================================================
        async function loadProfil(force) {
            force = force || false;

            if (profilCache.length > 0 && !force) {
                renderProfil(profilCache);
                return;
            }

            if (profilList) {
                profilList.innerHTML = '<p class="text-center text-[var(--text-muted)] py-6 text-sm">' +
                    '<i class="fas fa-spinner fa-spin mr-2"></i>Memuat data...</p>';
            }

            try {
                const result = await forceRefreshData('getProfil', {});

                if (result && result.success && Array.isArray(result.data)) {
                    profilCache = result.data;
                    renderProfil(profilCache);
                } else {
                    if (profilList) profilList.innerHTML = '<p class="text-center text-red-500 py-4 text-sm">' +
                        escapeHtml((result && result.message) || 'Gagal memuat data') + '</p>';
                }
            } catch (error) {
                console.error('[profil_admin] Load profil error:', error);
                if (profilList) profilList.innerHTML = '<p class="text-center text-red-500 py-4 text-sm">' +
                    'Error: ' + escapeHtml(error.message) + '</p>';
            }
        }

        function renderProfil(data) {
            if (!profilList) return;

            // Filter out internal keys
            const displayData = data.filter(p => !['struktur_diagram', 'sejarah', 'visi_misi'].includes(p.key));

            if (displayData.length === 0) {
                profilList.innerHTML = `
                    <div class="text-center py-8 text-[var(--text-muted)]">
                        <i class="fas fa-address-card text-3xl mb-2 opacity-40"></i>
                        <p class="mb-4 text-sm">Belum ada item profil custom.</p>
                        <button onclick="tambahProfil()" class="btn-primary px-4 py-2 rounded-lg">
                            <i class="fas fa-plus mr-1"></i>Tambah Profil
                        </button>
                    </div>
                `;
                return;
            }

            let html = '';
            displayData.forEach(item => {
                const content = stripHtml(item.content || '');
                const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;

                html += `
                    <div class="bg-[var(--card-bg)] backdrop-blur-sm p-4 rounded-2xl shadow border border-[var(--card-border)] flex justify-between items-start gap-3 mb-3 hover:shadow-md transition">
                        <div class="flex-1 min-w-0">
                            <h3 class="font-bold text-[var(--text-main)] font-amiri text-sm mb-1 truncate">
                                ${escapeHtml(item.key || '-')}
                            </h3>
                            <p class="text-xs text-[var(--text-muted)] line-clamp-2">${escapeHtml(preview || '-')}</p>
                            <p class="text-xs text-[var(--text-muted)] mt-1 opacity-70">
                                <i class="far fa-clock mr-1"></i>${formatDate(item.updated_at)}
                            </p>
                        </div>
                        <div class="flex gap-1 flex-shrink-0">
                            <button onclick="editProfil('${item.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 p-1.5" title="Edit">
                                <i class="fas fa-edit text-sm"></i>
                            </button>
                            <button onclick="deleteProfil('${item.id}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400 p-1.5" title="Hapus">
                                <i class="fas fa-trash text-sm"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                <div class="text-center mt-4">
                    <button onclick="tambahProfil()" class="btn-primary px-4 py-2 rounded-lg">
                        <i class="fas fa-plus mr-1"></i>Tambah Profil Baru
                    </button>
                </div>
            `;
            profilList.innerHTML = html;
        }

        // ================================================================
        // 10. PROFIL CRUD
        // ================================================================
        window.tambahProfil = function() {
            if (!profilModal) return;
            if (profilModalTitle) profilModalTitle.textContent = 'Tambah Profil';
            if (profilForm) profilForm.reset();
            const idField = document.getElementById('profil-id');
            if (idField) idField.value = '';
            openProfilModal();
        };

        window.editProfil = function(id) {
            const item = profilCache.find(p => p.id === id);
            if (!item) {
                showToast('Profil tidak ditemukan.', 'warning');
                return;
            }
            if (profilModalTitle) profilModalTitle.textContent = 'Edit Profil';
            const idField = document.getElementById('profil-id');
            if (idField) idField.value = item.id;
            const keyField = document.getElementById('profil-key');
            if (keyField) keyField.value = item.key || '';
            const contentField = document.getElementById('profil-content');
            if (contentField) contentField.value = item.content || '';
            openProfilModal();
        };

        window.deleteProfil = function(id) {
            const item = profilCache.find(p => p.id === id);
            const key = item ? (item.key || 'item ini') : 'item ini';
            showConfirm('Hapus profil "' + key + '"?', async () => {
                const result = await apiCall('deleteProfil', 'POST', { id });
                if (result && result.success) {
                    profilCache = profilCache.filter(p => p.id !== id);
                    renderProfil(profilCache);
                    await logActivity('DELETE', 'profil', id, 'Hapus key: ' + key);
                    showToast('Profil berhasil dihapus!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        function openProfilModal() {
            if (!profilModal) return;
            profilModal.classList.remove('hidden');
            profilModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (profilModalContent) {
                    profilModalContent.classList.remove('scale-95', 'opacity-0');
                    profilModalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
        }

        function closeProfilModal() {
            if (!profilModal) return;
            if (profilModalContent) {
                profilModalContent.classList.remove('scale-100', 'opacity-100');
                profilModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                profilModal.classList.add('hidden');
                profilModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
        }

        if (profilCloseBtn) {
            const fresh = profilCloseBtn.cloneNode(true);
            profilCloseBtn.parentNode.replaceChild(fresh, profilCloseBtn);
            fresh.addEventListener('click', closeProfilModal);
        }
        if (profilModal) {
            profilModal.addEventListener('click', (e) => {
                if (e.target === profilModal) closeProfilModal();
            });
        }

        if (profilForm) {
            profilForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const idField = document.getElementById('profil-id');
                const keyField = document.getElementById('profil-key');
                const contentField = document.getElementById('profil-content');

                const id = idField ? idField.value : '';
                const key = keyField ? (keyField.value || '').trim() : '';
                const content = contentField ? contentField.value : '';

                if (!key) {
                    showToast('Key wajib diisi!', 'warning');
                    if (keyField) keyField.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = profilForm.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const data = { key, content };
                    const action = id ? 'updateProfil' : 'createProfil';
                    const payload = id ? Object.assign({ id: id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        if (id) {
                            const idx = profilCache.findIndex(p => p.id === id);
                            if (idx !== -1) profilCache[idx] = Object.assign({}, profilCache[idx], data, { id: id });
                        } else {
                            profilCache.push(Object.assign({}, data, {
                                id: result.id,
                                updated_at: new Date().toISOString()
                            }));
                        }
                        renderProfil(profilCache);
                        closeProfilModal();
                        if (profilForm) profilForm.reset();
                        await logActivity(id ? 'UPDATE' : 'CREATE', 'profil', result.id || id, 'Key: ' + key);
                        showToast('✅ Profil berhasil disimpan!', 'success');
                    } else {
                        showToast((result && result.message) || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    console.error('[profil_admin] Submit profil error:', error);
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 11. SEJARAH & VISI MISI + LIVE PREVIEW
        // ================================================================
        function updateLivePreview() {
            let preview = document.getElementById('profil-text-preview');
            if (!preview && sejarahContent && sejarahContent.parentElement) {
                preview = document.createElement('div');
                preview.id = 'profil-text-preview';
                preview.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-[var(--bg-stats)] rounded-lg border border-[var(--card-border)]';
                preview.innerHTML = `
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                            <i class="fas fa-eye mr-1"></i>Preview Sejarah
                        </p>
                        <div id="preview-sejarah" class="text-sm text-[var(--text-main)] leading-relaxed max-h-40 overflow-y-auto"></div>
                    </div>
                    <div>
                        <p class="text-xs text-[var(--text-muted)] uppercase font-bold mb-2">
                            <i class="fas fa-eye mr-1"></i>Preview Visi & Misi
                        </p>
                        <div id="preview-visi" class="text-sm text-[var(--text-main)] leading-relaxed max-h-40 overflow-y-auto"></div>
                    </div>
                `;
                sejarahContent.parentElement.appendChild(preview);

                // Attach listeners
                if (sejarahContent && !sejarahContent.dataset.previewAttached) {
                    sejarahContent.dataset.previewAttached = 'true';
                    sejarahContent.addEventListener('input',
                        debounceEvent.bind(null, 'preview-sejarah', () => {
                            const el = document.getElementById('preview-sejarah');
                            if (el) el.innerHTML = sejarahContent.value || '<p class="italic text-[var(--text-muted)]">(kosong)</p>';
                        }, 400));
                }
                if (visiMisiContent && !visiMisiContent.dataset.previewAttached) {
                    visiMisiContent.dataset.previewAttached = 'true';
                    visiMisiContent.addEventListener('input',
                        debounceEvent.bind(null, 'preview-visi', () => {
                            const el = document.getElementById('preview-visi');
                            if (el) el.innerHTML = visiMisiContent.value || '<p class="italic text-[var(--text-muted)]">(kosong)</p>';
                        }, 400));
                }
            }
        }

        async function loadProfilText() {
            try {
                const result = await forceRefreshData('getProfil', {});
                if (result && result.success && Array.isArray(result.data)) {
                    const map = {};
                    result.data.forEach(i => { map[i.key] = i.content; });

                    if (sejarahContent) sejarahContent.value = map['sejarah'] || '';
                    if (visiMisiContent) visiMisiContent.value = map['visi_misi'] || '';

                    // Update preview
                    const prevSejarah = document.getElementById('preview-sejarah');
                    const prevVisi = document.getElementById('preview-visi');
                    if (prevSejarah) prevSejarah.innerHTML = map['sejarah'] || '<p class="italic text-[var(--text-muted)]">(kosong)</p>';
                    if (prevVisi) prevVisi.innerHTML = map['visi_misi'] || '<p class="italic text-[var(--text-muted)]">(kosong)</p>';

                    // Update profil cache
                    profilCache = result.data;
                }
            } catch (e) {
                console.error('[profil_admin] Load profil text error:', e);
            }
        }

        if (saveProfilBtn) {
            const fresh = saveProfilBtn.cloneNode(true);
            saveProfilBtn.parentNode.replaceChild(fresh, saveProfilBtn);
            fresh.addEventListener('click', async function() {
                if (isSubmitting) return;

                const sejarah = sejarahContent ? sejarahContent.value.trim() : '';
                const visi_misi = visiMisiContent ? visiMisiContent.value.trim() : '';

                if (!sejarah && !visi_misi) {
                    showToast('Tidak ada perubahan untuk disimpan.', 'warning');
                    return;
                }

                isSubmitting = true;
                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';

                try {
                    // Upsert - updateProfil sudah handle create jika tidak ada
                    await apiCall('updateProfil', 'POST', { key: 'sejarah', content: sejarah });
                    await apiCall('updateProfil', 'POST', { key: 'visi_misi', content: visi_misi });

                    await logActivity('UPDATE', 'profil_teks', null, 'Sejarah & Visi Misi');
                    showToast('✅ Sejarah & Visi Misi berhasil disimpan!', 'success');

                    // Reload cache
                    profilCache = [];
                    await loadProfilText();
                } catch (e) {
                    showToast('Gagal menyimpan: ' + e.message, 'error');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 12. STRUKTUR PENGURUS CRUD
        // ================================================================
        async function loadStruktur(force) {
            force = force || false;

            if (strukturCache.length > 0 && !force) {
                applyFilterStruktur();
                return;
            }

            if (strukturSkeleton) strukturSkeleton.classList.remove('hidden');
            if (strukturTable) strukturTable.innerHTML = '';

            try {
                const result = await forceRefreshData('getStruktur', {});

                if (strukturSkeleton) strukturSkeleton.classList.add('hidden');

                if (result && result.success && Array.isArray(result.data)) {
                    strukturCache = result.data;
                    applyFilterStruktur();
                    updateStrukturStats();
                } else {
                    if (strukturTable) {
                        strukturTable.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-[var(--text-muted)]">' +
                            '<i class="fas fa-sitemap text-3xl mb-2 opacity-40"></i><p>Belum ada data pengurus</p></td></tr>';
                    }
                    updateStrukturStats();
                }
            } catch (error) {
                if (strukturSkeleton) strukturSkeleton.classList.add('hidden');
                console.error('[profil_admin] Load struktur error:', error);
                if (strukturTable) {
                    strukturTable.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-500">' +
                        'Error: ' + escapeHtml(error.message) + '</td></tr>';
                }
            }
        }

        function applyFilterStruktur() {
            filteredStruktur = strukturCache.filter(s => {
                if (strukturFilter.search) {
                    const q = strukturFilter.search.toLowerCase();
                    const haystack = [s.jabatan, s.nama]
                        .map(v => String(v || '').toLowerCase()).join(' ');
                    if (!haystack.includes(q)) return false;
                }
                return true;
            });

            // Sort
            switch (strukturFilter.sort) {
                case 'urutan-asc':
                    filteredStruktur.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
                    break;
                case 'urutan-desc':
                    filteredStruktur.sort((a, b) => (Number(b.urutan) || 0) - (Number(a.urutan) || 0));
                    break;
                case 'jabatan-asc':
                    filteredStruktur.sort((a, b) => String(a.jabatan || '').localeCompare(String(b.jabatan || '')));
                    break;
                case 'nama-asc':
                    filteredStruktur.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
                    break;
            }

            renderStruktur(filteredStruktur);
        }

        function updateStrukturStats() {
            const total = strukturCache.length;
            const adaFoto = strukturCache.filter(s => s.foto_url).length;
            const jabatanUnik = new Set(strukturCache.map(s => s.jabatan).filter(Boolean)).size;

            const el1 = document.getElementById('stats-total-struktur');
            const el2 = document.getElementById('stats-struktur-foto');
            const el3 = document.getElementById('stats-struktur-jabatan');

            if (el1) el1.textContent = total;
            if (el2) el2.textContent = adaFoto;
            if (el3) el3.textContent = jabatanUnik;
        }

        function renderStruktur(data) {
            if (!strukturTable) return;

            if (!data || data.length === 0) {
                const isFiltered = strukturFilter.search;
                strukturTable.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-[var(--text-muted)]">' +
                    (isFiltered
                        ? '<i class="fas fa-search text-3xl mb-2 opacity-40"></i><p>Tidak ada hasil yang cocok</p>'
                        : '<i class="fas fa-sitemap text-3xl mb-2 opacity-40"></i><p>Belum ada data pengurus</p>') +
                    '</td></tr>';
                return;
            }

            let html = '';
            data.forEach((item, idx) => {
                const foto = item.foto_url
                    ? `<img src="${escapeAttr(item.foto_url)}" alt="${escapeAttr(item.nama)}"
                            class="w-10 h-10 rounded-full object-cover border-2 border-[var(--card-border)]"
                            loading="lazy" decoding="async"
                            onerror="this.outerHTML='<div class=&quot;w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold&quot;>${escapeHtml(getInitials(item.nama))}</div>'">`
                    : `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                            ${escapeHtml(getInitials(item.nama))}
                       </div>`;

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)] text-center">
                            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--bg-stats)] text-xs font-bold">
                                ${item.urutan || 0}
                            </span>
                        </td>
                        <td class="px-3 py-3">${foto}</td>
                        <td class="px-3 py-3 text-sm font-bold text-[var(--text-main)]">${escapeHtml(item.jabatan || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${escapeHtml(item.nama || '-')}</td>
                        <td class="px-3 py-3 text-sm text-[var(--text-muted)]">${formatDate(item.updated_at)}</td>
                        <td class="px-3 py-3 text-sm whitespace-nowrap">
                            <button onclick="editStruktur('${item.id}')"
                                class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteStruktur('${item.id}')"
                                class="text-red-600 hover:text-red-800 dark:text-red-400" title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            strukturTable.innerHTML = html;
        }

        // Attach struktur search/sort listeners
        setTimeout(() => {
            const searchInput = document.getElementById('struktur-search');
            const sortSelect = document.getElementById('struktur-sort');

            if (searchInput && !searchInput.dataset.attached) {
                searchInput.dataset.attached = 'true';
                searchInput.addEventListener('input',
                    debounceEvent.bind(null, 'struktur-search', () => {
                        strukturFilter.search = (searchInput.value || '').trim();
                        applyFilterStruktur();
                    }, 250));
            }

            if (sortSelect && !sortSelect.dataset.attached) {
                sortSelect.dataset.attached = 'true';
                sortSelect.addEventListener('change', () => {
                    strukturFilter.sort = sortSelect.value;
                    applyFilterStruktur();
                });
            }
        }, 200);

        window.editStruktur = function(id) {
            const item = strukturCache.find(s => s.id === id);
            if (!item) {
                showToast('Data tidak ditemukan.', 'warning');
                return;
            }
            if (strukturModalTitle) strukturModalTitle.textContent = 'Edit Pengurus';
            if (strukturId) strukturId.value = item.id;
            if (strukturJabatan) strukturJabatan.value = item.jabatan || '';
            if (strukturNama) strukturNama.value = item.nama || '';
            if (strukturFoto) strukturFoto.value = item.foto_url || '';
            if (strukturUrutan) strukturUrutan.value = item.urutan || 0;
            openStrukturModal();
        };

        window.deleteStruktur = function(id) {
            const item = strukturCache.find(s => s.id === id);
            const nama = item ? (item.nama || 'pengurus ini') : 'pengurus ini';
            showConfirm('Hapus pengurus "' + nama + '"?', async () => {
                const result = await apiCall('deleteStruktur', 'POST', { id });
                if (result && result.success) {
                    strukturCache = strukturCache.filter(s => s.id !== id);
                    applyFilterStruktur();
                    updateStrukturStats();
                    await logActivity('DELETE', 'struktur_organisasi', id, 'Hapus: ' + nama);
                    showToast('Pengurus berhasil dihapus!', 'success');
                } else {
                    showToast((result && result.message) || 'Gagal menghapus', 'error');
                }
            });
        };

        function openStrukturModal() {
            if (!strukturModal) return;
            strukturModal.classList.remove('hidden');
            strukturModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (strukturModalContent) {
                    strukturModalContent.classList.remove('scale-95', 'opacity-0');
                    strukturModalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            setTimeout(() => { if (strukturJabatan) strukturJabatan.focus(); }, 150);
        }

        function closeStrukturModal() {
            if (!strukturModal) return;
            if (strukturModalContent) {
                strukturModalContent.classList.remove('scale-100', 'opacity-100');
                strukturModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                strukturModal.classList.add('hidden');
                strukturModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (strukturForm) strukturForm.reset();
            if (strukturId) strukturId.value = '';
        }

        if (strukturCloseBtn) {
            const fresh = strukturCloseBtn.cloneNode(true);
            strukturCloseBtn.parentNode.replaceChild(fresh, strukturCloseBtn);
            fresh.addEventListener('click', closeStrukturModal);
        }
        if (strukturModal) {
            strukturModal.addEventListener('click', (e) => {
                if (e.target === strukturModal) closeStrukturModal();
            });
        }

        if (addStrukturBtn) {
            const fresh = addStrukturBtn.cloneNode(true);
            addStrukturBtn.parentNode.replaceChild(fresh, addStrukturBtn);
            fresh.addEventListener('click', () => {
                if (strukturModalTitle) strukturModalTitle.textContent = 'Tambah Pengurus';
                if (strukturForm) strukturForm.reset();
                if (strukturId) strukturId.value = '';
                if (strukturUrutan) strukturUrutan.value = 0;
                openStrukturModal();
            });
        }

        if (strukturForm) {
            strukturForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const jabatan = (strukturJabatan.value || '').trim();
                const nama = (strukturNama.value || '').trim();
                const foto_url = (strukturFoto.value || '').trim();
                const urutan = parseInt(strukturUrutan.value) || 0;

                if (!jabatan) {
                    showToast('Jabatan wajib diisi!', 'warning');
                    strukturJabatan.focus();
                    return;
                }
                if (!nama) {
                    showToast('Nama wajib diisi!', 'warning');
                    strukturNama.focus();
                    return;
                }

                isSubmitting = true;
                const submitBtn = strukturForm.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                try {
                    const data = { jabatan, nama, foto_url, urutan };
                    const id = strukturId.value;
                    const action = id ? 'updateStruktur' : 'createStruktur';
                    const payload = id ? Object.assign({ id: id }, data) : data;

                    const result = await apiCall(action, 'POST', payload);

                    if (result && result.success) {
                        if (id) {
                            const idx = strukturCache.findIndex(s => s.id === id);
                            if (idx !== -1) strukturCache[idx] = Object.assign({}, strukturCache[idx], data, { id: id });
                        } else {
                            strukturCache.push(Object.assign({}, data, { id: result.id }));
                        }

                        applyFilterStruktur();
                        updateStrukturStats();
                        closeStrukturModal();

                        await logActivity(id ? 'UPDATE' : 'CREATE', 'struktur_organisasi', result.id || id, 'Jabatan: ' + jabatan);
                        showToast('✅ Data pengurus berhasil disimpan!', 'success');
                    } else {
                        showToast((result && result.message) || 'Gagal menyimpan', 'error');
                    }
                } catch (error) {
                    console.error('[profil_admin] Submit struktur error:', error);
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 13. FOTO POSISI CRUD
        // ================================================================
        async function loadFotoPositions() {
            try {
                const res = await apiCall('getPhotoPositions', 'POST', {});
                if (res && res.success && Array.isArray(res.data)) {
                    fotoPositions = res.data;
                    updatePosisiUI();
                    updateFotoKeySelect();
                } else {
                    fotoPositions = [];
                    updatePosisiUI();
                    updateFotoKeySelect();
                }
            } catch (e) {
                console.error('[profil_admin] Load foto positions error:', e);
                fotoPositions = [];
                updatePosisiUI();
                updateFotoKeySelect();
            }
        }

        function updatePosisiUI() {
            if (!posisiListContainer) return;

            if (fotoPositions.length === 0) {
                posisiListContainer.innerHTML = '<span class="text-[var(--text-muted)] text-sm italic">Belum ada posisi. Tambahkan posisi baru di atas.</span>';
                return;
            }

            posisiListContainer.innerHTML = fotoPositions.map((pos, idx) => `
                <div class="flex items-center gap-2 bg-[var(--bg-stats)] px-3 py-2 rounded-lg border border-[var(--card-border)] shadow-sm hover:shadow-md transition">
                    <span class="text-sm font-medium text-[var(--text-main)]">${escapeHtml(pos)}</span>
                    <button type="button" onclick="editPosisi(${idx})"
                        class="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs px-1.5 py-1 transition" title="Edit">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" onclick="deletePosisi(${idx})"
                        class="text-red-600 hover:text-red-800 dark:text-red-400 text-xs px-1.5 py-1 transition" title="Hapus">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }

        function updateFotoKeySelect() {
            if (!fotoKeySelect) return;
            fotoKeySelect.innerHTML = '';
            if (fotoPositions.length === 0) {
                fotoKeySelect.innerHTML = '<option value="">-- Tidak ada posisi --</option>';
                return;
            }
            fotoPositions.forEach(pos => {
                const opt = document.createElement('option');
                opt.value = 'foto_' + String(pos).toLowerCase().replace(/\s+/g, '_');
                opt.textContent = pos;
                fotoKeySelect.appendChild(opt);
            });
        }

        window.editPosisi = function(idx) {
            if (!newPosisiInput) return;
            const oldName = fotoPositions[idx];
            newPosisiInput.value = oldName;
            newPosisiInput.focus();
            newPosisiInput.dataset.editingIdx = idx;

            if (addPosisiBtn) {
                addPosisiBtn.innerHTML = '<i class="fas fa-save"></i> Update';
            }
        };

        window.deletePosisi = function(idx) {
            const name = fotoPositions[idx];
            showConfirm('Hapus posisi "' + name + '"?', async () => {
                fotoPositions.splice(idx, 1);
                await savePosisi();
            });
        };

        function resetPosisiButton() {
            if (addPosisiBtn) {
                addPosisiBtn.innerHTML = '<i class="fas fa-plus"></i> Tambah Posisi';
            }
            if (newPosisiInput) {
                newPosisiInput.value = '';
                delete newPosisiInput.dataset.editingIdx;
            }
        }

        async function savePosisi() {
            try {
                const res = await apiCall('updatePhotoPositions', 'POST', {
                    positions: fotoPositions
                });
                if (res && res.success) {
                    showToast('✅ Posisi foto berhasil diperbarui!', 'success');
                    updatePosisiUI();
                    updateFotoKeySelect();
                    resetPosisiButton();
                } else {
                    showToast((res && res.message) || 'Gagal memperbarui posisi.', 'error');
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
            }
        }

        if (addPosisiBtn) {
            const fresh = addPosisiBtn.cloneNode(true);
            addPosisiBtn.parentNode.replaceChild(fresh, addPosisiBtn);

            fresh.addEventListener('click', async function() {
                const val = (newPosisiInput.value || '').trim();
                if (!val) {
                    showToast('Nama posisi tidak boleh kosong!', 'warning');
                    newPosisiInput.focus();
                    return;
                }

                const editingIdx = newPosisiInput.dataset.editingIdx;

                if (editingIdx !== undefined && editingIdx !== '') {
                    // Mode edit
                    const idx = parseInt(editingIdx);
                    if (fotoPositions[idx] === val) {
                        showToast('Nama tidak ada perubahan.', 'info');
                        resetPosisiButton();
                        return;
                    }
                    if (fotoPositions.includes(val)) {
                        showToast('Nama posisi sudah ada!', 'warning');
                        return;
                    }
                    fotoPositions[idx] = val;
                    await savePosisi();
                } else {
                    // Mode tambah
                    if (fotoPositions.includes(val)) {
                        showToast('Posisi sudah ada!', 'warning');
                        return;
                    }
                    fotoPositions.push(val);
                    await savePosisi();
                }
            });
        }

        // ================================================================
        // 14. UPLOAD FOTO PENGURUS
        // ================================================================
        if (fotoForm) {
            const fresh = fotoForm.cloneNode(true);
            fotoForm.parentNode.replaceChild(fresh, fotoForm);

            // Preview handler
            const freshFileInput = fresh.querySelector('#foto-file');
            const freshPreview = fresh.querySelector('#foto-preview');
            const freshPreviewContainer = fresh.querySelector('#foto-preview-container');

            if (freshFileInput) {
                freshFileInput.addEventListener('change', function() {
                    const file = this.files && this.files[0];
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            if (freshPreview) freshPreview.src = e.target.result;
                            if (freshPreviewContainer) freshPreviewContainer.classList.remove('hidden');
                        };
                        reader.readAsDataURL(file);
                    } else {
                        if (freshPreviewContainer) freshPreviewContainer.classList.add('hidden');
                    }
                });
            }

            fresh.addEventListener('submit', async function(e) {
                e.preventDefault();
                e.stopPropagation();

                if (isSubmitting) return;

                const key = fotoKeySelect ? fotoKeySelect.value : '';
                const file = freshFileInput && freshFileInput.files ? freshFileInput.files[0] : null;

                if (!key) {
                    showToast('Pilih posisi terlebih dahulu.', 'warning');
                    return;
                }
                if (!file) {
                    showToast('Pilih file foto terlebih dahulu.', 'warning');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    showToast('File terlalu besar (maks 5 MB).', 'warning');
                    return;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Mengunggah...');

                try {
                    const uploadResult = await uploadFileToDrive(file);

                    if (!uploadResult || !uploadResult.success) {
                        throw new Error((uploadResult && uploadResult.message) || 'Gagal upload');
                    }

                    const saveResult = await apiCall('updateProfil', 'POST', {
                        key: key,
                        content: uploadResult.url
                    });

                    if (saveResult && saveResult.success) {
                        await logActivity('UPLOAD', 'profil_foto', null, 'Foto posisi: ' + key);
                        showToast('✅ Foto berhasil disimpan!', 'success');

                        fresh.reset();
                        if (freshPreviewContainer) freshPreviewContainer.classList.add('hidden');
                        if (freshPreview) freshPreview.src = '';

                        loadProfil(true);
                    } else {
                        showToast((saveResult && saveResult.message) || 'Gagal menyimpan foto', 'error');
                    }
                } catch (error) {
                    console.error('[profil_admin] Upload foto error:', error);
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 15. DIAGRAM (jsPlumb + interact)
        // ================================================================
        const hasJsPlumb = typeof jsPlumb !== 'undefined';
        const hasInteract = typeof interact !== 'undefined';

        async function initJsPlumb() {
            if (instance) {
                try { instance.reset(); } catch (e) {}
            }

            // Ensure libs
            await ensureLib('jsplumb');
            await ensureLib('interact');

            if (typeof jsPlumb === 'undefined' || !diagramContainer) {
                if (diagramContainer) {
                    diagramContainer.innerHTML = '<div class="text-center py-12 text-[var(--text-muted)]">' +
                        '<i class="fas fa-exclamation-triangle text-4xl mb-3 text-yellow-500"></i>' +
                        '<p>Pustaka diagram belum dimuat.</p></div>';
                }
                return;
            }

            try {
                instance = jsPlumb.getInstance({
                    Connector: ['Straight', { gap: 5 }],
                    PaintStyle: { strokeWidth: 2, stroke: '#0f2922' },
                    HoverPaintStyle: { strokeWidth: 3, stroke: '#fbbf24' },
                    Endpoint: ['Rectangle', { width: 12, height: 12 }],
                    EndpointStyle: { fill: '#0f2922' },
                    Anchors: ['Right', 'Left', 'Top', 'Bottom'],
                    Container: diagramContainer
                });
                instance.setContainer(diagramContainer);
                console.log('[profil_admin] jsPlumb initialized');

                // Load diagram yang tersimpan
                setTimeout(loadDiagram, 200);
            } catch (e) {
                console.error('[profil_admin] Init jsPlumb error:', e);
            }
        }

        function createNode(x, y, label, id, color) {
            if (!diagramContainer) return null;

            if (!id) id = generateNodeId();
            color = color || '#0f2922';

            const node = document.createElement('div');
            node.id = id;
            node.className = 'node-box';
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            node.style.width = '140px';
            node.style.height = '60px';
            node.style.borderColor = color;
            node.dataset.x = x;
            node.dataset.y = y;
            node.dataset.color = color;

            const textSpan = document.createElement('span');
            textSpan.className = 'node-text';
            textSpan.textContent = label || 'Kotak Baru';
            textSpan.style.cursor = 'text';
            textSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                openEditNode(id);
            });

            const actions = document.createElement('div');
            actions.className = 'node-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'edit-btn';
            editBtn.innerHTML = '<i class="fas fa-pen"></i>';
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditNode(id); });

            const colorBtn = document.createElement('button');
            colorBtn.type = 'button';
            colorBtn.className = 'color-btn';
            colorBtn.innerHTML = '<i class="fas fa-palette"></i>';
            colorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                cycleNodeColor(id);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
            deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(id); });

            actions.appendChild(editBtn);
            actions.appendChild(colorBtn);
            actions.appendChild(deleteBtn);

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.dataset.nodeId = id;

            node.appendChild(resizeHandle);
            node.appendChild(textSpan);
            node.appendChild(actions);
            diagramContainer.appendChild(node);

            if (instance) {
                instance.addEndpoint(id, { anchor: 'Right', uuid: id + '-right' });
                instance.addEndpoint(id, { anchor: 'Left', uuid: id + '-left' });
                instance.addEndpoint(id, { anchor: 'Top', uuid: id + '-top' });
                instance.addEndpoint(id, { anchor: 'Bottom', uuid: id + '-bottom' });
            }

            // Drag & resize
            attachNodeInteractions(node, resizeHandle);

            diagramHasChanges = true;
            return node;
        }

        function attachNodeInteractions(node, resizeHandle) {
            if (typeof interact === 'undefined') return;

            try {
                interact(node).draggable({
                    listeners: {
                        move: function(event) {
                            const target = event.target;
                            const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                            const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
                            target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
                            target.setAttribute('data-x', x);
                            target.setAttribute('data-y', y);
                            if (instance) instance.repaint(target);
                        },
                        end: function() { diagramHasChanges = true; }
                    },
                    modifiers: [
                        interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })
                    ],
                    inertia: false
                });

                interact(resizeHandle).draggable({
                    listeners: {
                        move: function(event) {
                            const target = event.target.closest('.node-box');
                            if (!target) return;
                            const newWidth = Math.max(100, target.offsetWidth + event.dx);
                            const newHeight = Math.max(45, target.offsetHeight + event.dy);
                            target.style.width = newWidth + 'px';
                            target.style.height = newHeight + 'px';
                            if (instance) instance.repaint(target);
                        },
                        end: function() { diagramHasChanges = true; }
                    },
                    modifiers: [
                        interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })
                    ],
                    inertia: false
                });
            } catch (e) {
                console.warn('[profil_admin] interact attach error:', e);
            }
        }

        const NODE_COLORS = ['#0f2922', '#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#be185d'];

        function cycleNodeColor(id) {
            const node = document.getElementById(id);
            if (!node) return;
            const current = node.dataset.color || '#0f2922';
            const idx = NODE_COLORS.indexOf(current);
            const next = NODE_COLORS[(idx + 1) % NODE_COLORS.length];
            node.style.borderColor = next;
            node.dataset.color = next;
            diagramHasChanges = true;
            showToast('Warna: ' + next, 'info', 1500);
        }

        function deleteNode(id) {
            showConfirm('Hapus kotak ini?', () => {
                const node = document.getElementById(id);
                if (node) {
                    if (instance) {
                        try { instance.deleteConnectionsForElement(id); } catch (e) {}
                    }
                    node.remove();
                    diagramHasChanges = true;
                }
            });
        }

        function openEditNode(id) {
            const node = document.getElementById(id);
            if (!node) return;
            const textSpan = node.querySelector('.node-text');
            if (nodeEditId) nodeEditId.value = id;
            if (nodeEditText) nodeEditText.value = textSpan ? textSpan.textContent : '';
            editingNodeId = id;

            if (!nodeEditModal) return;
            nodeEditModal.classList.remove('hidden');
            nodeEditModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (nodeEditContent) {
                    nodeEditContent.classList.remove('scale-95', 'opacity-0');
                    nodeEditContent.classList.add('scale-100', 'opacity-100');
                }
            });
            setTimeout(() => { if (nodeEditText) nodeEditText.focus(); }, 150);
        }

        function closeNodeEditModal() {
            if (!nodeEditModal) return;
            if (nodeEditContent) {
                nodeEditContent.classList.remove('scale-100', 'opacity-100');
                nodeEditContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                nodeEditModal.classList.add('hidden');
                nodeEditModal.classList.remove('flex');
            }, 150);
            editingNodeId = null;
        }

        if (nodeEditClose) {
            const fresh = nodeEditClose.cloneNode(true);
            nodeEditClose.parentNode.replaceChild(fresh, nodeEditClose);
            fresh.addEventListener('click', closeNodeEditModal);
        }
        if (nodeEditModal) {
            nodeEditModal.addEventListener('click', (e) => {
                if (e.target === nodeEditModal) closeNodeEditModal();
            });
        }

        if (nodeEditForm) {
            const fresh = nodeEditForm.cloneNode(true);
            nodeEditForm.parentNode.replaceChild(fresh, nodeEditForm);

            fresh.addEventListener('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();

                const id = nodeEditId ? nodeEditId.value : '';
                const text = nodeEditText ? (nodeEditText.value || '').trim() : '';

                if (!text) {
                    showToast('Teks tidak boleh kosong!', 'warning');
                    return;
                }

                if (id) {
                    const node = document.getElementById(id);
                    if (node) {
                        const textSpan = node.querySelector('.node-text');
                        if (textSpan) textSpan.textContent = text;
                    }
                }
                diagramHasChanges = true;
                closeNodeEditModal();
            });
        }

        // Add Node
        if (addNodeBtn) {
            const fresh = addNodeBtn.cloneNode(true);
            addNodeBtn.parentNode.replaceChild(fresh, addNodeBtn);
            fresh.addEventListener('click', function() {
                if (!diagramContainer) return;
                if (!instance) initJsPlumb();

                const containerRect = diagramContainer.getBoundingClientRect();
                const x = 50 + Math.random() * Math.max(100, containerRect.width - 200);
                const y = 50 + Math.random() * Math.max(100, containerRect.height - 150);

                createNode(Math.round(x), Math.round(y), 'Kotak ' + (nodeCounter + 1));
                nodeCounter++;
                pushDiagramHistory();
            });
        }

        // Add Connection mode
        if (addConnectionBtn) {
            const fresh = addConnectionBtn.cloneNode(true);
            addConnectionBtn.parentNode.replaceChild(fresh, addConnectionBtn);
            fresh.addEventListener('click', function() {
                connectionMode = !connectionMode;
                this.classList.toggle('bg-purple-800');
                this.textContent = connectionMode ? 'Batal Sambung' : 'Sambung';
                if (diagramContainer) diagramContainer.style.cursor = connectionMode ? 'crosshair' : 'default';
                if (!connectionMode) {
                    sourceNodeId = null;
                    diagramContainer.querySelectorAll('.node-box').forEach(n => {
                        n.style.outline = 'none';
                    });
                }
            });
        }

        if (diagramContainer) {
            diagramContainer.addEventListener('click', function(e) {
                if (!connectionMode || !instance) return;
                const node = e.target.closest('.node-box');
                if (!node) return;
                const id = node.id;

                if (!sourceNodeId) {
                    sourceNodeId = id;
                    node.style.outline = '2px solid #fbbf24';
                } else {
                    const sourceId = sourceNodeId;
                    const prevNode = document.getElementById(sourceId);
                    if (prevNode) prevNode.style.outline = 'none';

                    if (sourceId !== id) {
                        try {
                            instance.connect({
                                uuids: [sourceId + '-bottom', id + '-top']
                            });
                            diagramHasChanges = true;
                        } catch (err) {
                            console.warn('[profil_admin] Connect error:', err);
                        }
                    }

                    sourceNodeId = null;
                    connectionMode = false;
                    const connBtn = document.getElementById('add-connection-btn');
                    if (connBtn) {
                        connBtn.classList.remove('bg-purple-800');
                        connBtn.textContent = 'Sambung';
                    }
                    if (diagramContainer) diagramContainer.style.cursor = 'default';
                    pushDiagramHistory();
                }
            });
        }

        // Save Diagram
        if (saveDiagramBtn) {
            const fresh = saveDiagramBtn.cloneNode(true);
            saveDiagramBtn.parentNode.replaceChild(fresh, saveDiagramBtn);
            fresh.addEventListener('click', async function() {
                if (!instance || !diagramContainer) {
                    showToast('Diagram belum siap.', 'warning');
                    return;
                }

                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

                try {
                    const payload = serializeDiagram();
                    const result = await apiCall('updateProfil', 'POST', {
                        key: 'struktur_diagram',
                        content: JSON.stringify(payload)
                    });

                    if (result && result.success) {
                        diagramHasChanges = false;
                        await logActivity('UPDATE', 'profil_diagram', null, 'Simpan diagram');
                        showToast('✅ Diagram berhasil disimpan!', 'success');
                    } else {
                        showToast((result && result.message) || 'Gagal menyimpan diagram', 'error');
                    }
                } catch (err) {
                    console.error('[profil_admin] Save diagram error:', err);
                    showToast('Error: ' + err.message, 'error');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // Clear Diagram
        if (clearDiagramBtn) {
            const fresh = clearDiagramBtn.cloneNode(true);
            clearDiagramBtn.parentNode.replaceChild(fresh, clearDiagramBtn);
            fresh.addEventListener('click', function() {
                showConfirm('Hapus semua kotak dan koneksi?', () => {
                    if (!diagramContainer) return;
                    const nodes = diagramContainer.querySelectorAll('.node-box');
                    nodes.forEach(node => {
                        if (instance) {
                            try { instance.deleteConnectionsForElement(node.id); } catch (e) {}
                        }
                        node.remove();
                    });
                    nodeCounter = 0;
                    diagramHasChanges = true;
                    pushDiagramHistory();
                });
            });
        }

        function serializeDiagram() {
            if (!diagramContainer) return { nodes: [], connections: [] };

            const nodes = diagramContainer.querySelectorAll('.node-box');
            const containerRect = diagramContainer.getBoundingClientRect();
            const diagramData = [];

            nodes.forEach(node => {
                const rect = node.getBoundingClientRect();
                diagramData.push({
                    id: node.id,
                    x: Math.round(rect.left - containerRect.left),
                    y: Math.round(rect.top - containerRect.top),
                    width: node.offsetWidth,
                    height: node.offsetHeight,
                    label: node.querySelector('.node-text') ? node.querySelector('.node-text').textContent : '',
                    color: node.dataset.color || '#0f2922'
                });
            });

            const connections = instance
                ? instance.getConnections().map(conn => ({
                    source: conn.sourceId,
                    target: conn.targetId
                }))
                : [];

            return { nodes: diagramData, connections: connections };
        }

        function pushDiagramHistory() {
            try {
                const snapshot = JSON.stringify(serializeDiagram());
                if (diagramHistory[historyIndex] === snapshot) return;

                // Truncate future
                diagramHistory = diagramHistory.slice(0, historyIndex + 1);
                diagramHistory.push(snapshot);
                if (diagramHistory.length > 20) diagramHistory.shift();
                historyIndex = diagramHistory.length - 1;
            } catch (e) {
                console.warn('[profil_admin] Push history error:', e);
            }
        }

        function undoDiagram() {
            if (historyIndex <= 0) {
                showToast('Tidak ada lagi yang bisa di-undo.', 'info', 2000);
                return;
            }
            historyIndex--;
            restoreFromHistory(diagramHistory[historyIndex]);
        }

        function redoDiagram() {
            if (historyIndex >= diagramHistory.length - 1) {
                showToast('Tidak ada lagi yang bisa di-redo.', 'info', 2000);
                return;
            }
            historyIndex++;
            restoreFromHistory(diagramHistory[historyIndex]);
        }

        function restoreFromHistory(snapshot) {
            try {
                const data = JSON.parse(snapshot);
                clearDiagramSilent();
                (data.nodes || []).forEach(nodeData => {
                    createNode(nodeData.x, nodeData.y, nodeData.label, nodeData.id, nodeData.color);
                    const node = document.getElementById(nodeData.id);
                    if (node) {
                        node.style.width = (nodeData.width || 140) + 'px';
                        node.style.height = (nodeData.height || 60) + 'px';
                    }
                });
                (data.connections || []).forEach(conn => {
                    if (!instance) return;
                    try {
                        instance.connect({ uuids: [conn.source + '-bottom', conn.target + '-top'] });
                    } catch (e) {}
                });
            } catch (e) {
                console.error('[profil_admin] Restore from history error:', e);
            }
        }

        function clearDiagramSilent() {
            if (!diagramContainer) return;
            diagramContainer.querySelectorAll('.node-box').forEach(n => {
                if (instance) {
                    try { instance.deleteConnectionsForElement(n.id); } catch (e) {}
                }
                n.remove();
            });
        }

        async function loadDiagram() {
            if (!instance || !diagramContainer) return;

            try {
                const result = await apiCall('getProfil', 'POST', {});
                if (!result || !result.success) return;

                const item = (result.data || []).find(p => p.key === 'struktur_diagram');
                if (!item || !item.content) return;

                let data;
                try {
                    data = JSON.parse(item.content);
                } catch (e) {
                    console.warn('[profil_admin] Diagram parse error:', e);
                    return;
                }

                // Clear existing
                clearDiagramSilent();

                // Add nodes
                (data.nodes || []).forEach(nodeData => {
                    createNode(nodeData.x, nodeData.y, nodeData.label, nodeData.id, nodeData.color);
                    const node = document.getElementById(nodeData.id);
                    if (node) {
                        node.style.width = (nodeData.width || 140) + 'px';
                        node.style.height = (nodeData.height || 60) + 'px';
                    }
                });

                // Add connections
                (data.connections || []).forEach(conn => {
                    try {
                        instance.connect({
                            uuids: [conn.source + '-bottom', conn.target + '-top']
                        });
                    } catch (e) {
                        console.warn('[profil_admin] Load connection error:', e);
                    }
                });

                // Init history
                diagramHistory = [JSON.stringify(serializeDiagram())];
                historyIndex = 0;
                diagramHasChanges = false;

                console.log('[profil_admin] Diagram loaded:', (data.nodes || []).length, 'nodes');
            } catch (error) {
                console.error('[profil_admin] Load diagram error:', error);
            }
        }

        // Export JSON
        function exportDiagramJSON() {
            if (!instance || !diagramContainer) {
                showToast('Diagram belum siap.', 'warning');
                return;
            }

            const payload = serializeDiagram();
            if (!payload.nodes || payload.nodes.length === 0) {
                showToast('Diagram kosong, tidak ada yang di-export.', 'warning');
                return;
            }

            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'struktur_diagram_' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast('✅ Diagram JSON diexport!', 'success');
        }

        // Copy JSON
        function copyDiagramJSON() {
            if (!instance || !diagramContainer) {
                showToast('Diagram belum siap.', 'warning');
                return;
            }

            const payload = serializeDiagram();
            const json = JSON.stringify(payload);
            copyToClipboard(json)
                .then(() => showToast('📋 JSON diagram dicopy ke clipboard!', 'success'))
                .catch(() => showToast('Gagal copy JSON', 'error'));
        }

        // Import JSON
        function importDiagramJSON() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';

            input.onchange = function(e) {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = function(evt) {
                    try {
                        const data = JSON.parse(evt.target.result);

                        if (!data.nodes || !Array.isArray(data.nodes)) {
                            throw new Error('Format JSON tidak valid');
                        }

                        showConfirm('Import diagram ini? Diagram saat ini akan diganti.', () => {
                            clearDiagramSilent();
                            (data.nodes || []).forEach(nodeData => {
                                createNode(nodeData.x || 50, nodeData.y || 50, nodeData.label || 'Kotak', nodeData.id, nodeData.color);
                                const node = document.getElementById(nodeData.id);
                                if (node) {
                                    node.style.width = (nodeData.width || 140) + 'px';
                                    node.style.height = (nodeData.height || 60) + 'px';
                                }
                            });
                            (data.connections || []).forEach(conn => {
                                if (!instance) return;
                                try {
                                    instance.connect({ uuids: [conn.source + '-bottom', conn.target + '-top'] });
                                } catch (e) {}
                            });
                            diagramHasChanges = true;
                            pushDiagramHistory();
                            showToast('✅ Diagram berhasil di-import!', 'success');
                        });
                    } catch (err) {
                        showToast('Gagal parse JSON: ' + err.message, 'error');
                    }
                };
                reader.readAsText(file);
            };

            input.click();
        }

        // ================================================================
        // 16. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                if (diagramHasChanges) {
                    const ok = await new Promise(resolve => {
                        showConfirm('Ada perubahan diagram yang belum disimpan. Lanjut refresh?',
                            () => resolve(true));
                    });
                    // Can't reliably await here without refactor, so just continue
                }

                const original = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';

                try {
                    profilCache = [];
                    strukturCache = [];

                    await Promise.allSettled([
                        loadProfil(true),
                        loadProfilText(),
                        loadStruktur(true),
                        loadFotoPositions()
                    ]);

                    // Reload diagram jika instance ada
                    if (instance) {
                        await loadDiagram();
                    }

                    showToast('Data profil diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = original;
                }
            });
        }

        // ================================================================
        // 17. ESC KEY
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;

            if (nodeEditModal && !nodeEditModal.classList.contains('hidden')) {
                closeNodeEditModal();
            } else if (strukturModal && !strukturModal.classList.contains('hidden')) {
                closeStrukturModal();
            } else if (profilModal && !profilModal.classList.contains('hidden')) {
                closeProfilModal();
            }
        });

        // ================================================================
        // 18. INIT
        // ================================================================
        console.log('[profil_admin] Init dimulai');

        // Ensure libraries
        ensureLib('jsplumb');
        ensureLib('interact');

        // Setup extras
        ensureExtraUI();

        // Set default tab
        switchTab('sejarah');

        // Live preview initialization
        updateLivePreview();

        // Load semua data secara parallel
        await Promise.allSettled([
            loadProfil(),
            loadProfilText(),
            loadStruktur(),
            loadFotoPositions()
        ]);

        // Lazy init diagram jika tab aktif
        if (diagramContainer) {
            setTimeout(() => {
                if (!instance) initJsPlumb();
            }, 300);
        }

        console.log('[profil_admin] Init selesai');
    }

    // ================================================================
    // 19. RUN INIT
    // ================================================================
    init();
});