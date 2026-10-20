/**
 * js/profil_admin.js
 * Modul Admin Profil Publik — v17.0.0 OFFLINE-FIRST FULL FIX
 * =========================================================
 * CHANGELOG v17.0.0:
 *   ✅ NEW: Handle response _offline dari apiCall
 *   ✅ NEW: Badge pending sync pada struktur & profil
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Safe toast fallback
 *   ✅ NEW: Upload foto skip saat offline (warning)
 *   ✅ FIX: Diagram auto-layout engine robust
 *   ✅ FIX: Refresh tanpa reload halaman (refreshDataOnly)
 *   ✅ FIX: Semua handler idempotent (no double bind)
 *   ✅ FIX: Null-safe seluruh DOM elements
 *   ✅ FIX: Clone-replace listener (anti memory leak)
 *   ✅ FIX: Diagram jsPlumb + interact.js
 *   ✅ FIX: Manual drag & resize node
 *   ✅ FIX: Connection mode (sambung manual)
 *   ✅ FIX: Edit node text
 *   ✅ FIX: Auto-save layout setelah regenerate
 *   ✅ FIX: Foto preview (upload + existing)
 *   ✅ FIX: Sliding underline tab
 *   ✅ FIX: Modal pengurus (create/edit/delete)
 *   ✅ FIX: XSS protection (esc/escAttr)
 *   ✅ FIX: Fallback foto (lh3 → drive → inisial)
 *   ✅ PRESERVED: Semua fitur v16.0.0
 * =========================================================
 */

App.register('profil_admin', function() {
    'use strict';

    // ================================================================
    // 1. AUTH GUARD
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

    console.log('[profil_admin] 🚀 Init v17.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. HELPERS
    // ================================================================
    function waitForElements(ids, maxRetries, interval) {
        maxRetries = maxRetries || 50;
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

    function esc(s) {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function escAttr(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function generateNodeId() {
        return 'node-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    }

    function extractFileId(url) {
        if (!url) return '';
        const m = String(url).match(/[-\w]{25,}/);
        return m ? m[0] : '';
    }

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try { await window.loadLib(name); return true; }
            catch (e) { console.warn('[profil_admin] Lib fail:', name, e); return false; }
        }
        return false;
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[profil_admin:' + (type || 'info') + ']', msg);
        }
    }

    function isPendingSync(id) {
        try {
            if (!window.SyncManager) return false;
            const queue = window.SyncManager.getQueue() || [];
            const idStr = String(id);
            return queue.some(item => {
                const d = item.data || {};
                return String(d.id) === idStr;
            });
        } catch (e) {
            return false;
        }
    }

    function compressImage(file, maxSize, quality) {
        maxSize = maxSize || 800;
        quality = quality || 0.75;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w > maxSize || h > maxSize) {
                        if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
                        else { w = Math.round((w * maxSize) / h); h = maxSize; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob((blob) => {
                        if (!blob) { reject(new Error('Gagal kompres')); return; }
                        const newName = file.name.replace(/\.[^.]+$/, '') + '_c.jpg';
                        resolve(new File([blob], newName, { type: 'image/jpeg' }));
                    }, 'image/jpeg', quality);
                };
                img.onerror = () => reject(new Error('Gagal muat gambar'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Gagal baca file'));
            reader.readAsDataURL(file);
        });
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const r = e.target.result || '';
                const b = r.split(',')[1] || '';
                if (b) resolve(b);
                else reject(new Error('Gagal konversi'));
            };
            reader.onerror = () => reject(new Error('Gagal baca'));
            reader.readAsDataURL(file);
        });
    }

    // ================================================================
    // 4. MODULE STATE (shared across functions)
    // ================================================================
    let strukturCache = [];
    let isSubmitting = false;
    let instance = null;
    let connectionMode = false;
    let sourceNodeId = null;
    let currentFotoUrl = '';
    let pendingFotoFile = null;
    let currentTab = 'sejarah';
    let moduleInitialized = false;

    // ================================================================
    // 5. ✅ REFRESH DATA (Offline-First)
    // ================================================================
    function refreshDataOnly() {
        console.log('[profil_admin] 🔄 Refresh data without reload');

        try {
            var userKey = (user && user.id) ? user.id : 'anon';
            var cKeyStruktur = 'cache_getStruktur_' + userKey + '_' + JSON.stringify({});
            var cKeyProfil = 'cache_getProfil_' + userKey + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKeyStruktur);
            SafeSessionStorage.removeItem(cKeyProfil);
        } catch (e) {}

        return Promise.allSettled([
            loadStruktur(true),
            loadProfilText()
        ]).then(function() {
            setTimeout(function() {
                if (currentTab === 'diagram') {
                    autoFillDiagramFromStruktur();
                }
            }, 300);
            console.log('[profil_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 6. INIT
    // ================================================================
    async function init() {
        if (moduleInitialized) return;
        moduleInitialized = true;

        const requiredIds = [
            'profil-tabs', 'tab-slider',
            'sejarah_content', 'visi_misi_content', 'save-profil-btn',
            'refresh-profil-btn',
            'struktur-container', 'add-pengurus-btn',
            'diagram-container', 'reset-diagram-btn', 'add-connection-btn',
            'save-diagram-btn', 'clear-diagram-btn',
            'node-edit-modal', 'node-edit-content', 'node-edit-form',
            'node-edit-id', 'node-edit-text', 'node-edit-close', 'node-edit-cancel',
            'pengurus-modal', 'pengurus-modal-content', 'pengurus-modal-title',
            'pengurus-form', 'pengurus-modal-close', 'pengurus-modal-close-2',
            'pengurus-id', 'pengurus_nama', 'pengurus_jabatan',
            'pengurus_deskripsi', 'pengurus_whatsapp', 'pengurus_email',
            'pengurus_foto', 'pengurus_foto_preview', 'pengurus_foto_preview_wrap',
            'pengurus_foto_placeholder', 'pengurus_hapus_foto'
        ];

        const els = await waitForElements(requiredIds);

        const tabsWrap = els['profil-tabs'];
        const tabSlider = els['tab-slider'];
        const sejarahContent = els['sejarah_content'];
        const visiMisiContent = els['visi_misi_content'];
        const saveProfilBtn = els['save-profil-btn'];
        const refreshBtn = els['refresh-profil-btn'];
        const strukturCont = els['struktur-container'];
        const addPengurusBtn = els['add-pengurus-btn'];
        const diagramContainer = els['diagram-container'];
        const resetDiagramBtn = els['reset-diagram-btn'];
        const addConnectionBtn = els['add-connection-btn'];
        const saveDiagramBtn = els['save-diagram-btn'];
        const clearDiagramBtn = els['clear-diagram-btn'];
        const nodeEditModal = els['node-edit-modal'];
        const nodeEditContent = els['node-edit-content'];
        const nodeEditForm = els['node-edit-form'];
        const nodeEditId = els['node-edit-id'];
        const nodeEditText = els['node-edit-text'];
        const nodeEditClose = els['node-edit-close'];
        const nodeEditCancel = els['node-edit-cancel'];
        const pengurusModal = els['pengurus-modal'];
        const pengurusModalContent = els['pengurus-modal-content'];
        const pengurusModalTitle = els['pengurus-modal-title'];
        const pengurusForm = els['pengurus-form'];
        const pengurusModalClose = els['pengurus-modal-close'];
        const pengurusModalClose2 = els['pengurus-modal-close-2'];
        const pengurusId = els['pengurus-id'];
        const pengurusNama = els['pengurus_nama'];
        const pengurusJabatan = els['pengurus_jabatan'];
        const pengurusDeskripsi = els['pengurus_deskripsi'];
        const pengurusWhatsapp = els['pengurus_whatsapp'];
        const pengurusEmail = els['pengurus_email'];

        if (!strukturCont) {
            console.error('[profil_admin] Struktur container tidak ditemukan');
            return;
        }

        console.log('[profil_admin] ✅ Semua elemen ditemukan');

        // ================================================================
        // 7. PHOTO EVENT LISTENERS
        // ================================================================
        document.addEventListener('profil-foto-selected', function(e) {
            if (e.detail && e.detail.file) {
                pendingFotoFile = e.detail.file;
                console.log('[profil_admin] 📷 Foto set via event:', e.detail.file.name);
            }
        });

        document.addEventListener('profil-foto-cleared', function() {
            pendingFotoFile = null;
            currentFotoUrl = '';
            console.log('[profil_admin] 📷 Foto cleared via event');
        });

        // ================================================================
        // 8. TAB MANAGEMENT
        // ================================================================
        const tabBtns = tabsWrap ? tabsWrap.querySelectorAll('.tab-btn') : [];

        function moveSlider(target) {
            if (!tabSlider || !tabsWrap) return;
            const targetBtn = tabsWrap.querySelector('.tab-btn[data-tab="' + target + '"]');
            if (!targetBtn) return;

            const wrapRect = tabsWrap.getBoundingClientRect();
            const btnRect = targetBtn.getBoundingClientRect();
            const offsetLeft = btnRect.left - wrapRect.left + tabsWrap.scrollLeft;
            const width = btnRect.width;

            tabSlider.style.width = width + 'px';
            tabSlider.style.transform = 'translateX(' + offsetLeft + 'px)';
        }

        function switchTab(target) {
            console.log('[profil_admin] switchTab:', target);
            currentTab = target;

            tabBtns.forEach(b => {
                b.classList.toggle('active', b.dataset.tab === target);
            });

            ['sejarah', 'struktur', 'diagram'].forEach(t => {
                const el = document.getElementById('tab-' + t);
                if (!el) return;
                if (t === target) {
                    el.classList.remove('hidden');
                    el.style.display = 'block';
                } else {
                    el.classList.add('hidden');
                    el.style.display = 'none';
                }
            });

            setTimeout(() => moveSlider(target), 50);

            if (target === 'diagram') {
                setTimeout(() => {
                    if (!instance && diagramContainer) initJsPlumb();
                    else if (instance) autoFillDiagramFromStruktur();
                }, 250);
            }
        }

        tabBtns.forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            clone.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (this.dataset.tab) switchTab(this.dataset.tab);
            });
        });

        window.addEventListener('resize', () => {
            setTimeout(() => moveSlider(currentTab), 100);
        });

        // ================================================================
        // 9. LOAD PROFIL TEXT
        // ================================================================
        async function loadProfilText() {
            console.log('[profil_admin] 🔄 Loading profil text...');
            try {
                const res = await forceRefreshData('getProfil', {});
                if (!res || !res.success || !Array.isArray(res.data)) {
                    console.warn('[profil_admin] getProfil invalid:', res);
                    return;
                }

                const map = {};
                res.data.forEach(item => {
                    if (!item || !item.key) return;
                    const key = String(item.key).toLowerCase().trim();
                    map[key] = item.content || '';
                });

                if (sejarahContent) sejarahContent.value = map['sejarah'] || '';
                if (visiMisiContent) visiMisiContent.value = map['visi_misi'] || '';
            } catch (e) {
                console.error('[profil_admin] loadProfilText error:', e);
            }
        }

        // ================================================================
        // 10. SAVE PROFIL TEXT
        // ================================================================
        if (saveProfilBtn) {
            const fresh = saveProfilBtn.cloneNode(true);
            saveProfilBtn.parentNode.replaceChild(fresh, saveProfilBtn);
            fresh.addEventListener('click', async function() {
                if (isSubmitting) return;

                const sejarah = sejarahContent ? sejarahContent.value.trim() : '';
                const visi_misi = visiMisiContent ? visiMisiContent.value.trim() : '';

                if (!sejarah && !visi_misi) {
                    safeToast('Tidak ada perubahan', 'warning');
                    return;
                }

                isSubmitting = true;
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

                try {
                    const res1 = await apiCall('updateProfil', 'POST', { key: 'sejarah', content: sejarah });
                    const res2 = await apiCall('updateProfil', 'POST', { key: 'visi_misi', content: visi_misi });

                    if (res1 && res1.success && res2 && res2.success) {
                        await logActivity('UPDATE', 'profil_teks', null, 'Sejarah & Visi Misi');

                        try {
                            const cKey = 'cache_getProfil_' + user.id + '_' + JSON.stringify({});
                            SafeSessionStorage.removeItem(cKey);
                        } catch (e) {}

                        const indicator = document.getElementById('profil-save-indicator');
                        if (indicator) {
                            indicator.classList.remove('hidden');
                            setTimeout(() => indicator.classList.add('hidden'), 2500);
                        }

                        const isOffline = res1._offline || res2._offline;
                        if (isOffline) {
                            safeToast('📴 Tersimpan lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Sejarah & Visi Misi disimpan!', 'success');
                        }
                    } else {
                        safeToast('Gagal menyimpan (partial)', 'warning');
                    }
                } catch (e) {
                    console.error('[profil_admin] Save error:', e);
                    safeToast('Gagal: ' + e.message, 'error');
                } finally {
                    this.disabled = false;
                    this.innerHTML = orig;
                    isSubmitting = false;
                }
            });
        }

        // ================================================================
        // 11. LOAD STRUKTUR
        // ================================================================
        async function loadStruktur(force) {
            force = force || false;
            if (!strukturCont) return;

            strukturCont.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i>
                    <p class="text-sm text-[var(--text-muted)] mt-2">Memuat struktur...</p>
                </div>`;

            try {
                if (force) {
                    try {
                        const cKey = 'cache_getStruktur_' + user.id + '_' + JSON.stringify({});
                        SafeSessionStorage.removeItem(cKey);
                    } catch (e) {}
                }

                const res = await apiCall('getStruktur', 'POST', { _t: Date.now() });

                if (res && res.success && Array.isArray(res.data)) {
                    strukturCache = res.data;
                    console.log('[profil_admin] Struktur loaded:', strukturCache.length);
                } else {
                    console.warn('[profil_admin] Struktur response invalid:', res);
                    strukturCache = [];
                }
            } catch (e) {
                console.error('[profil_admin] loadStruktur error:', e);
                strukturCache = [];
            }

            renderStruktur();
        }

        // ================================================================
        // 12. RENDER STRUKTUR
        // ================================================================
        function renderStruktur() {
            if (!strukturCont) return;

            if (strukturCache.length === 0) {
                strukturCont.innerHTML = `
                    <div class="text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-users text-4xl mb-3 opacity-40"></i>
                        <p class="font-medium">Belum ada pengurus</p>
                        <p class="text-sm mt-1">Klik "Tambah Pengurus" untuk menambahkan.</p>
                    </div>`;
                return;
            }

            const sorted = strukturCache.slice().sort((a, b) =>
                (Number(a.urutan) || 0) - (Number(b.urutan) || 0));

            let html = '<div class="space-y-3">';

            sorted.forEach((item, idx) => {
                const nama = item.nama || '';
                const jabatan = item.jabatan || '';
                const foto = item.foto_url || '';
                const urutan = item.urutan || (idx + 1);
                const fileId = extractFileId(foto);
                const pending = isPendingSync(item.id);

                let fotoHtml;
                if (foto) {
                    fotoHtml = `
                        <img src="${escAttr(foto)}"
                             alt="${escAttr(nama || jabatan)}"
                             class="w-14 h-14 rounded-full object-cover border-2 border-amber-400"
                             loading="lazy"
                             onerror="if(this.dataset.triedAlt==='1'){this.outerHTML='<div class=&quot;w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold&quot;>${esc(getInitials(nama || jabatan))}</div>'}else{this.dataset.triedAlt='1';this.src='https://drive.google.com/thumbnail?id=${fileId}&sz=w200';}">`;
                } else {
                    fotoHtml = `<div class="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold">${esc(getInitials(nama || jabatan))}</div>`;
                }

                const waDisplay = item.whatsapp ? `<span class="text-xs text-[var(--text-muted)]"><i class="fab fa-whatsapp mr-1"></i>${esc(item.whatsapp)}</span>` : '';
                const emailDisplay = item.email ? `<span class="text-xs text-[var(--text-muted)] ml-2"><i class="fas fa-envelope mr-1"></i>${esc(item.email)}</span>` : '';

                const pendingBadge = pending
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⟳ SYNC</span>'
                    : '';

                html += `
                    <div class="flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:shadow-md transition ${pending ? 'border-l-4 border-amber-500' : ''}">
                        <div class="flex-shrink-0">${fotoHtml}</div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-base text-[var(--text-main)] truncate flex items-center gap-2">
                                ${esc(nama || '(belum diisi)')} ${pendingBadge}
                            </div>
                            <div class="text-sm text-[var(--text-muted)] mt-0.5">
                                <i class="fas fa-user-tag mr-1"></i>${esc(jabatan || '-')}
                            </div>
                            <div class="text-xs text-[var(--text-muted)] mt-0.5">
                                <i class="fas fa-sort-numeric-up mr-1"></i>Urutan: ${urutan}
                            </div>
                            ${(waDisplay || emailDisplay) ? `<div class="mt-1 flex flex-wrap items-center gap-2">${waDisplay}${emailDisplay}</div>` : ''}
                        </div>
                        <div class="flex gap-2 flex-shrink-0">
                            <button type="button" data-action="edit-pengurus" data-id="${escAttr(item.id)}"
                                class="btn-primary px-3 py-2 rounded-lg text-sm flex items-center gap-1">
                                <i class="fas fa-edit"></i><span>Edit</span>
                            </button>
                            <button type="button" data-action="delete-pengurus" data-id="${escAttr(item.id)}" data-nama="${escAttr(nama)}"
                                class="px-3 py-2 rounded-lg text-sm bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-300 transition">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            strukturCont.innerHTML = html;

            strukturCont.querySelectorAll('[data-action="edit-pengurus"]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = this.dataset.id;
                    const item = strukturCache.find(s => String(s.id) === String(id));
                    if (item) openPengurusModal(true, item);
                });
            });
            strukturCont.querySelectorAll('[data-action="delete-pengurus"]').forEach(btn => {
                btn.addEventListener('click', function() {
                    deletePengurusConfirm(this.dataset.id, this.dataset.nama || 'data ini');
                });
            });
        }

        // ================================================================
        // 13. DELETE PENGURUS (Offline-aware)
        // ================================================================
        function deletePengurusConfirm(id, nama) {
            showConfirm('Hapus data "' + nama + '"?', async () => {
                try {
                    const res = await apiCall('deleteStruktur', 'POST', { id: id });
                    if (res && res.success) {
                        await logActivity('DELETE', 'struktur_organisasi', id, 'Hapus: ' + nama);

                        if (res._offline) {
                            safeToast('📴 Data dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ ' + nama + ' dihapus', 'success');
                        }

                        refreshDataOnly();
                    } else {
                        safeToast((res && res.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[profil_admin] Delete error:', e);
                    safeToast('Error: ' + e.message, 'error');
                }
            });
        }

        // ================================================================
        // 14. MODAL PENGURUS
        // ================================================================
        function openPengurusModal(isEdit, data) {
            data = data || {};
            pendingFotoFile = null;

            if (!pengurusModal) return;

            if (isEdit) {
                pengurusModalTitle.textContent = 'Edit Anggota Tim';
                pengurusId.value = data.id || '';
                pengurusNama.value = data.nama || '';
                pengurusJabatan.value = data.jabatan || '';
                pengurusDeskripsi.value = data.deskripsi || '';
                pengurusWhatsapp.value = data.whatsapp || '';
                pengurusEmail.value = data.email || '';
                currentFotoUrl = data.foto_url || '';

                if (currentFotoUrl) showFotoPreview(currentFotoUrl);
                else hideFotoPreview();
            } else {
                pengurusModalTitle.textContent = 'Tambah Anggota Tim';
                pengurusForm.reset();
                pengurusId.value = '';
                currentFotoUrl = '';
                hideFotoPreview();
            }

            pengurusModal.classList.remove('hidden');
            pengurusModal.classList.add('flex');
            requestAnimationFrame(() => {
                if (pengurusModalContent) {
                    pengurusModalContent.classList.remove('scale-95', 'opacity-0');
                    pengurusModalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            setTimeout(() => { if (pengurusNama) pengurusNama.focus(); }, 200);
        }

        function closePengurusModal() {
            if (!pengurusModal) return;
            if (pengurusModalContent) {
                pengurusModalContent.classList.remove('scale-100', 'opacity-100');
                pengurusModalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                pengurusModal.classList.add('hidden');
                pengurusModal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            if (pengurusForm) pengurusForm.reset();
            if (pengurusId) pengurusId.value = '';
            currentFotoUrl = '';
            pendingFotoFile = null;
            hideFotoPreview();
        }

        // ================================================================
        // 15. FOTO PREVIEW
        // ================================================================
        function showFotoPreview(src) {
            const preview = document.getElementById('pengurus_foto_preview');
            const placeholder = document.getElementById('pengurus_foto_placeholder');
            const hapusBtn = document.getElementById('pengurus_hapus_foto');

            if (preview) {
                preview.src = src;
                preview.style.display = 'block';
                preview.style.width = '100%';
                preview.style.height = '100%';
                preview.style.objectFit = 'cover';
                preview.style.position = 'absolute';
                preview.style.top = '0';
                preview.style.left = '0';
            }
            if (placeholder) placeholder.style.display = 'none';
            if (hapusBtn) {
                hapusBtn.style.display = 'inline-flex';
                hapusBtn.style.alignItems = 'center';
                hapusBtn.style.gap = '4px';
            }
        }

        function hideFotoPreview() {
            const preview = document.getElementById('pengurus_foto_preview');
            const placeholder = document.getElementById('pengurus_foto_placeholder');
            const hapusBtn = document.getElementById('pengurus_hapus_foto');

            if (preview) {
                preview.src = '';
                preview.style.display = 'none';
            }
            if (placeholder) placeholder.style.display = 'block';
            if (hapusBtn) hapusBtn.style.display = 'none';
        }

        // ================================================================
        // 16. EVENT LISTENERS MODAL
        // ================================================================
        if (addPengurusBtn) {
            const fresh = addPengurusBtn.cloneNode(true);
            addPengurusBtn.parentNode.replaceChild(fresh, addPengurusBtn);
            fresh.addEventListener('click', () => openPengurusModal(false));
        }

        if (pengurusModalClose) {
            const fresh = pengurusModalClose.cloneNode(true);
            pengurusModalClose.parentNode.replaceChild(fresh, pengurusModalClose);
            fresh.addEventListener('click', closePengurusModal);
        }
        if (pengurusModalClose2) {
            const fresh = pengurusModalClose2.cloneNode(true);
            pengurusModalClose2.parentNode.replaceChild(fresh, pengurusModalClose2);
            fresh.addEventListener('click', closePengurusModal);
        }
        if (pengurusModal) {
            pengurusModal.addEventListener('click', (e) => {
                if (e.target === pengurusModal) closePengurusModal();
            });
        }

        // ================================================================
        // 17. SUBMIT PENGURUS FORM (Offline-aware)
        // ================================================================
        if (pengurusForm) {
            const fresh = pengurusForm.cloneNode(true);
            pengurusForm.parentNode.replaceChild(fresh, pengurusForm);

            fresh.addEventListener('submit', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (isSubmitting) return;

                const idEl = document.getElementById('pengurus-id');
                const namaEl = document.getElementById('pengurus_nama');
                const jabatanEl = document.getElementById('pengurus_jabatan');
                const deskripsiEl = document.getElementById('pengurus_deskripsi');
                const waEl = document.getElementById('pengurus_whatsapp');
                const emailEl = document.getElementById('pengurus_email');
                const fileEl = document.getElementById('pengurus_foto');

                const id = idEl ? idEl.value : '';
                const nama = namaEl ? (namaEl.value || '').trim() : '';
                const jabatan = jabatanEl ? (jabatanEl.value || '').trim() : '';
                const deskripsi = deskripsiEl ? (deskripsiEl.value || '').trim() : '';
                const whatsapp = waEl ? (waEl.value || '').trim() : '';
                const email = emailEl ? (emailEl.value || '').trim() : '';

                let file = pendingFotoFile;
                if (!file && fileEl && fileEl.files && fileEl.files[0]) {
                    file = fileEl.files[0];
                }

                if (!nama) {
                    safeToast('Nama wajib diisi', 'warning');
                    if (namaEl) namaEl.focus();
                    return;
                }
                if (!jabatan) {
                    safeToast('Jabatan wajib diisi', 'warning');
                    if (jabatanEl) jabatanEl.focus();
                    return;
                }

                let urutan = 0;
                if (id) {
                    const existing = strukturCache.find(s => String(s.id) === String(id));
                    urutan = existing ? (Number(existing.urutan) || 0) : 0;
                } else {
                    const maxUrutan = strukturCache.reduce((max, s) => {
                        const u = Number(s.urutan) || 0;
                        return u > max ? u : max;
                    }, 0);
                    urutan = maxUrutan + 1;
                }

                isSubmitting = true;
                const submitBtn = fresh.querySelector('button[type="submit"]');
                const orig = submitBtn.innerHTML;
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

                try {
                    let foto_url = currentFotoUrl || '';
                    if (file) {
                        if (!navigator.onLine) {
                            safeToast('📴 Upload foto memerlukan koneksi internet. Menyimpan tanpa foto.', 'warning', 4500);
                        } else {
                            safeToast('🗜️ Kompres foto...', 'info', 2000);
                            const compressed = await compressImage(file, 800, 0.75);

                            safeToast('📤 Upload ke Drive...', 'info', 2000);
                            const b64 = await fileToBase64(compressed);

                            const upRes = await apiCall('uploadFile', 'POST', {
                                fileName: compressed.name,
                                mimeType: compressed.type,
                                base64Data: b64
                            });

                            if (!upRes || !upRes.success) {
                                throw new Error((upRes && upRes.message) || 'Upload foto gagal');
                            }

                            foto_url = upRes.url
                                    || (upRes.data && upRes.data.url)
                                    || upRes.alt_url
                                    || (upRes.data && upRes.data.alt_url)
                                    || '';

                            if (!foto_url) throw new Error('URL foto kosong');
                            console.log('[profil_admin] ✅ Foto URL:', foto_url);
                        }
                    }

                    const data = {
                        jabatan, nama, urutan, deskripsi, whatsapp, email,
                        foto_url: foto_url
                    };

                    let res;
                    if (id) {
                        res = await apiCall('updateStruktur', 'POST', Object.assign({ id: id }, data));
                    } else {
                        res = await apiCall('createStruktur', 'POST', data);
                    }

                    if (res && res.success) {
                        await logActivity(id ? 'UPDATE' : 'CREATE', 'struktur_organisasi', res.id || id, 'Jabatan: ' + jabatan);

                        if (res._offline) {
                            safeToast('📴 Data tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                        } else {
                            safeToast('✅ Data berhasil disimpan!', 'success');
                        }

                        closePengurusModal();
                        refreshDataOnly();
                    } else {
                        safeToast((res && res.message) || 'Gagal simpan', 'error');
                    }
                } catch (err) {
                    console.error('[profil_admin] Save error:', err);
                    safeToast('Error: ' + err.message, 'error', 5000);
                } finally {
                    isSubmitting = false;
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = orig;
                }
            });
        }

        // ================================================================
        // 18. DIAGRAM — Init jsPlumb
        // ================================================================
        async function initJsPlumb() {
            if (instance) { try { instance.reset(); } catch (e) {} }
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
                setTimeout(() => loadOrAutoFillDiagram(), 200);
            } catch (e) {
                console.error('[profil_admin] Init jsPlumb error:', e);
            }
        }

        async function loadOrAutoFillDiagram() {
            if (!instance || !diagramContainer) return;
            try {
                const result = await apiCall('getProfil', 'POST', {});
                if (result && result.success) {
                    const item = (result.data || []).find(p => p.key === 'struktur_diagram');
                    if (item && item.content) {
                        let data;
                        try { data = JSON.parse(item.content); } catch (e) { data = null; }
                        if (data && data.nodes && data.nodes.length > 0) {
                            renderDiagram(data);
                            return;
                        }
                    }
                }
            } catch (e) {}
            autoFillDiagramFromStruktur();
        }

        // ================================================================
        // 19. AUTO-LAYOUT ENGINE
        // ================================================================
        function autoFillDiagramFromStruktur() {
            if (!instance || !diagramContainer) return;

            const existingNodes = diagramContainer.querySelectorAll('.node-box');
            if (existingNodes.length > 0) return;

            if (strukturCache.length === 0) {
                diagramContainer.innerHTML = `
                    <div class="text-center py-12 text-[var(--text-muted)] pointer-events-none">
                        <i class="fas fa-info-circle text-4xl mb-3 opacity-40"></i>
                        <p class="font-medium">Belum ada struktur pengurus</p>
                        <p class="text-sm mt-1">Isi data di tab "Struktur Pengurus" dulu.</p>
                    </div>`;
                return;
            }

            diagramContainer.innerHTML = '';

            const sorted = strukturCache.slice().sort((a, b) =>
                (Number(a.urutan) || 0) - (Number(b.urutan) || 0));

            const nodes = {
                dewanPenasehat: [], ketua: null, wakilKetua: [],
                sekretaris: null, wasek: [], bendahara: null,
                wabend: [], koordinator: [], anggota: [], lainnya: []
            };

            sorted.forEach(item => {
                const jab = String(item.jabatan || '').toLowerCase().trim();

                if (jab.indexOf('penasehat') !== -1) nodes.dewanPenasehat.push(item);
                else if (jab === 'ketua' || (jab.indexOf('ketua') !== -1 && jab.indexOf('wakil') === -1 && jab.indexOf('penasehat') === -1)) nodes.ketua = item;
                else if (jab.indexOf('wakil ketua') !== -1) nodes.wakilKetua.push(item);
                else if (jab === 'sekretaris' || (jab.indexOf('sekretaris') !== -1 && jab.indexOf('wakil') === -1)) nodes.sekretaris = item;
                else if (jab.indexOf('wakil sekretaris') !== -1) nodes.wasek.push(item);
                else if (jab === 'bendahara' || (jab.indexOf('bendahara') !== -1 && jab.indexOf('wakil') === -1)) nodes.bendahara = item;
                else if (jab.indexOf('wakil bendahara') !== -1) nodes.wabend.push(item);
                else if (jab.indexOf('koordinator') !== -1) nodes.koordinator.push(item);
                else if (jab.indexOf('anggota') !== -1) nodes.anggota.push(item);
                else nodes.lainnya.push(item);
            });

            const cr = diagramContainer.getBoundingClientRect();
            const cw = Math.max(cr.width, 1200);
            const nodeW = 180, nodeH = 240;
            const gapX = 30, gapY = 80;
            const startY = 40;
            let currentY = startY;
            const positions = {};

            function layoutRow(items, yPos, customGapX) {
                if (!items || items.length === 0) return yPos + nodeH;
                const gX = customGapX !== undefined ? customGapX : gapX;
                const totalWidth = items.length * nodeW + (items.length - 1) * gX;
                const startX = Math.max((cw - totalWidth) / 2, 20);
                items.forEach((item, idx) => {
                    positions[item.id] = { x: startX + idx * (nodeW + gX), y: yPos };
                });
                return yPos + nodeH;
            }

            if (nodes.dewanPenasehat.length > 0) {
                const perRow = Math.min(5, nodes.dewanPenasehat.length);
                const rows = Math.ceil(nodes.dewanPenasehat.length / perRow);
                for (let r = 0; r < rows; r++) {
                    const startIdx = r * perRow;
                    const rowItems = nodes.dewanPenasehat.slice(startIdx, startIdx + perRow);
                    currentY = layoutRow(rowItems, currentY);
                    if (r < rows - 1) currentY += 20;
                }
                currentY += gapY;
            }

            if (nodes.ketua) {
                positions[nodes.ketua.id] = { x: (cw - nodeW) / 2, y: currentY };
                currentY += nodeH + gapY;
            }

            if (nodes.wakilKetua.length > 0) {
                const perRow = Math.min(3, nodes.wakilKetua.length);
                const rows = Math.ceil(nodes.wakilKetua.length / perRow);
                for (let r = 0; r < rows; r++) {
                    const startIdx = r * perRow;
                    const rowItems = nodes.wakilKetua.slice(startIdx, startIdx + perRow);
                    currentY = layoutRow(rowItems, currentY);
                    if (r < rows - 1) currentY += 20;
                }
                currentY += gapY;
            }

            let sekretarisPos = null, bendaharaPos = null;

            if (nodes.sekretaris && nodes.bendahara) {
                const totalW = 2 * nodeW + gapX * 4;
                const startX = (cw - totalW) / 2;
                positions[nodes.sekretaris.id] = { x: startX + nodeW + gapX * 2, y: currentY };
                positions[nodes.bendahara.id] = { x: startX + nodeW * 2 + gapX * 3, y: currentY };
                sekretarisPos = positions[nodes.sekretaris.id];
                bendaharaPos = positions[nodes.bendahara.id];
                currentY += nodeH + gapY;
            } else if (nodes.sekretaris) {
                positions[nodes.sekretaris.id] = { x: (cw - nodeW) / 2, y: currentY };
                sekretarisPos = positions[nodes.sekretaris.id];
                currentY += nodeH + gapY;
            } else if (nodes.bendahara) {
                positions[nodes.bendahara.id] = { x: (cw - nodeW) / 2, y: currentY };
                bendaharaPos = positions[nodes.bendahara.id];
                currentY += nodeH + gapY;
            }

            let wasekBottomY = currentY, wabendBottomY = currentY;

            if (nodes.wasek.length > 0 && sekretarisPos) {
                const perRow = Math.min(3, nodes.wasek.length);
                const rows = Math.ceil(nodes.wasek.length / perRow);
                for (let r = 0; r < rows; r++) {
                    const startIdx = r * perRow;
                    const rowItems = nodes.wasek.slice(startIdx, startIdx + perRow);
                    const rowWidth = rowItems.length * nodeW + (rowItems.length - 1) * gapX;
                    const rowStartX = sekretarisPos.x - (rowWidth - nodeW) / 2;
                    rowItems.forEach((item, idx) => {
                        positions[item.id] = {
                            x: Math.max(rowStartX + idx * (nodeW + gapX), 20),
                            y: currentY + r * (nodeH + 20)
                        };
                    });
                    wasekBottomY = Math.max(wasekBottomY, currentY + r * (nodeH + 20));
                }
            }

            if (nodes.wabend.length > 0 && bendaharaPos) {
                const perRow = Math.min(3, nodes.wabend.length);
                const rows = Math.ceil(nodes.wabend.length / perRow);
                for (let r = 0; r < rows; r++) {
                    const startIdx = r * perRow;
                    const rowItems = nodes.wabend.slice(startIdx, startIdx + perRow);
                    const rowWidth = rowItems.length * nodeW + (rowItems.length - 1) * gapX;
                    const rowStartX = bendaharaPos.x - (rowWidth - nodeW) / 2;
                    rowItems.forEach((item, idx) => {
                        positions[item.id] = {
                            x: Math.max(rowStartX + idx * (nodeW + gapX), 20),
                            y: currentY + r * (nodeH + 20)
                        };
                    });
                    wabendBottomY = Math.max(wabendBottomY, currentY + r * (nodeH + 20));
                }
            }

            currentY = Math.max(wasekBottomY, wabendBottomY) + nodeH + gapY;

            if (nodes.koordinator.length > 0) {
                const perRow = Math.min(5, nodes.koordinator.length);
                const rows = Math.ceil(nodes.koordinator.length / perRow);
                for (let r = 0; r < rows; r++) {
                    const startIdx = r * perRow;
                    const rowItems = nodes.koordinator.slice(startIdx, startIdx + perRow);
                    currentY = layoutRow(rowItems, currentY);
                    if (r < rows - 1) currentY += 20;
                }
                currentY += gapY;
            }

            if (nodes.anggota.length > 0) {
                const perRow = Math.min(5, nodes.anggota.length);
                const rows = Math.ceil(nodes.anggota.length / perRow);
                for (let r = 0; r < rows; r++) {
                    const startIdx = r * perRow;
                    const rowItems = nodes.anggota.slice(startIdx, startIdx + perRow);
                    currentY = layoutRow(rowItems, currentY);
                    if (r < rows - 1) currentY += 20;
                }
            }

            if (nodes.lainnya.length > 0) {
                layoutRow(nodes.lainnya, currentY);
            }

            const totalHeight = currentY + 60;
            if (totalHeight > cr.height) diagramContainer.style.minHeight = totalHeight + 'px';

            sorted.forEach(item => {
                const pos = positions[item.id];
                if (!pos) {
                    positions[item.id] = { x: 40 + Math.random() * 400, y: currentY };
                    currentY += nodeH + 20;
                }
                createNode(positions[item.id].x, positions[item.id].y, item, 'auto-' + item.id);
            });

            const connect = (fromId, toId, anchorFrom, anchorTo, style) => {
                anchorFrom = anchorFrom || 'bottom';
                anchorTo = anchorTo || 'top';
                try {
                    instance.connect({
                        uuids: ['auto-' + fromId + '-' + anchorFrom, 'auto-' + toId + '-' + anchorTo],
                        paintStyle: style || { strokeWidth: 2, stroke: '#0f2922' }
                    });
                } catch (e) {}
            };

            if (nodes.ketua) {
                nodes.wakilKetua.forEach(wk => connect(nodes.ketua.id, wk.id, 'bottom', 'top'));
                if (nodes.sekretaris) connect(nodes.ketua.id, nodes.sekretaris.id, 'bottom', 'top');
                if (nodes.bendahara) connect(nodes.ketua.id, nodes.bendahara.id, 'bottom', 'top');
            }
            if (nodes.sekretaris) nodes.wasek.forEach(w => connect(nodes.sekretaris.id, w.id, 'bottom', 'top'));
            if (nodes.bendahara) nodes.wabend.forEach(w => connect(nodes.bendahara.id, w.id, 'bottom', 'top'));

            if (nodes.dewanPenasehat.length > 0 && nodes.ketua) {
                nodes.dewanPenasehat.forEach(dp => {
                    try {
                        instance.connect({
                            uuids: ['auto-' + dp.id + '-bottom', 'auto-' + nodes.ketua.id + '-top'],
                            paintStyle: { strokeWidth: 1.5, stroke: '#94a3b8', dashstyle: '4 4' }
                        });
                    } catch (e) {}
                });
            }

            safeToast('🎨 Diagram tersusun otomatis berdasarkan jabatan', 'success', 3000);

            setTimeout(() => {
                try {
                    const allNodes = diagramContainer.querySelectorAll('.node-box');
                    allNodes.forEach(n => instance.repaint(n));
                    instance.repaintEverything();
                } catch (e) {}
            }, 200);

            // Auto-save layout
            setTimeout(async () => {
                try {
                    const payload = serializeDiagram();
                    const saveRes = await apiCall('updateProfil', 'POST', {
                        key: 'struktur_diagram',
                        content: JSON.stringify(payload)
                    });
                    if (saveRes && saveRes._offline) {
                        console.log('[profil_admin] 📴 Layout auto-save queued');
                    } else {
                        console.log('[profil_admin] ✅ Layout auto-saved');
                    }
                } catch (e) {
                    console.warn('[profil_admin] Auto-save failed:', e);
                }
            }, 1200);
        }

        // ================================================================
        // 20. CREATE NODE
        // ================================================================
        function createNode(x, y, item, id) {
            if (!diagramContainer) return null;
            id = id || generateNodeId();

            const nama = item.nama || '';
            const jabatan = item.jabatan || '';
            const foto = item.foto_url || '';
            const fileId = extractFileId(foto);

            const node = document.createElement('div');
            node.id = id;
            node.className = 'node-box';
            node.style.left = x + 'px';
            node.style.top = y + 'px';
            node.dataset.x = x;
            node.dataset.y = y;

            let fotoHtml;
            if (foto) {
                fotoHtml = `
                    <img src="${escAttr(foto)}"
                         alt="${escAttr(nama || jabatan)}"
                         class="node-foto"
                         loading="lazy"
                         draggable="false"
                         onerror="if(this.dataset.triedAlt==='1'){this.outerHTML='<div class=&quot;node-foto-fallback&quot;>${esc(getInitials(nama || jabatan))}</div>'}else{this.dataset.triedAlt='1';this.src='https://drive.google.com/thumbnail?id=${fileId}&sz=w400';}">`;
            } else {
                fotoHtml = `<div class="node-foto-fallback">${esc(getInitials(nama || jabatan))}</div>`;
            }

            const overlayHtml = `
                <div class="node-overlay">
                    <div class="node-nama">${esc(nama || '(belum diisi)')}</div>
                    <div class="node-jabatan">${esc(jabatan || '-')}</div>
                </div>
            `;

            node.innerHTML = `
                ${fotoHtml}
                ${overlayHtml}
                <span class="node-badge" title="Aktif"></span>
            `;

            const actions = document.createElement('div');
            actions.className = 'node-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.title = 'Edit kotak';
            editBtn.innerHTML = '<i class="fas fa-pen"></i>';
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditNode(id); });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.title = 'Hapus kotak';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
            deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(id); });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.title = 'Resize';

            node.appendChild(actions);
            node.appendChild(resizeHandle);
            diagramContainer.appendChild(node);

            if (instance) {
                try {
                    instance.addEndpoint(id, { anchor: 'Right', uuid: id + '-right' });
                    instance.addEndpoint(id, { anchor: 'Left', uuid: id + '-left' });
                    instance.addEndpoint(id, { anchor: 'Top', uuid: id + '-top' });
                    instance.addEndpoint(id, { anchor: 'Bottom', uuid: id + '-bottom' });
                } catch (e) {}
            }
            attachNodeInteractions(node, resizeHandle);
            return node;
        }

        function attachNodeInteractions(node, resizeHandle) {
            if (typeof interact === 'undefined') return;
            try {
                interact(node).draggable({
                    listeners: {
                        move: function(event) {
                            const t = event.target;
                            const x = (parseFloat(t.getAttribute('data-x')) || 0) + event.dx;
                            const y = (parseFloat(t.getAttribute('data-y')) || 0) + event.dy;
                            t.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
                            t.setAttribute('data-x', x);
                            t.setAttribute('data-y', y);
                            if (instance) instance.repaint(t);
                        }
                    },
                    modifiers: [interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })],
                    inertia: false
                });
                interact(resizeHandle).draggable({
                    listeners: {
                        move: function(event) {
                            const t = event.target.closest('.node-box');
                            if (!t) return;
                            const newWidth = Math.max(140, t.offsetWidth + event.dx);
                            const newHeight = Math.max(180, t.offsetHeight + event.dy);
                            t.style.width = newWidth + 'px';
                            t.style.height = newHeight + 'px';
                            if (instance) instance.repaint(t);
                        }
                    },
                    modifiers: [interact.modifiers.restrictRect({ restriction: 'parent', endOnly: true })],
                    inertia: false
                });
            } catch (e) {}
        }

        function deleteNode(id) {
            showConfirm('Hapus kotak ini?', () => {
                const node = document.getElementById(id);
                if (node) {
                    if (instance) { try { instance.deleteConnectionsForElement(id); } catch (e) {} }
                    node.remove();
                }
            });
        }

        // ================================================================
        // 21. NODE EDIT MODAL
        // ================================================================
        function openEditNode(id) {
            const node = document.getElementById(id);
            if (!node) return;
            const namaEl = node.querySelector('.node-nama');
            if (nodeEditId) nodeEditId.value = id;
            if (nodeEditText) nodeEditText.value = namaEl ? namaEl.textContent : '';

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
        }

        if (nodeEditClose) {
            const fresh = nodeEditClose.cloneNode(true);
            nodeEditClose.parentNode.replaceChild(fresh, nodeEditClose);
            fresh.addEventListener('click', closeNodeEditModal);
        }
        if (nodeEditCancel) {
            const fresh = nodeEditCancel.cloneNode(true);
            nodeEditCancel.parentNode.replaceChild(fresh, nodeEditCancel);
            fresh.addEventListener('click', closeNodeEditModal);
        }
        if (nodeEditModal) {
            nodeEditModal.addEventListener('click', (e) => { if (e.target === nodeEditModal) closeNodeEditModal(); });
        }
        if (nodeEditForm) {
            const fresh = nodeEditForm.cloneNode(true);
            nodeEditForm.parentNode.replaceChild(fresh, nodeEditForm);
            fresh.addEventListener('submit', function(e) {
                e.preventDefault(); e.stopPropagation();
                const id = nodeEditId ? nodeEditId.value : '';
                const text = nodeEditText ? (nodeEditText.value || '').trim() : '';
                if (!text) { safeToast('Teks tidak boleh kosong', 'warning'); return; }
                if (id) {
                    const node = document.getElementById(id);
                    if (node) {
                        const namaEl = node.querySelector('.node-nama');
                        if (namaEl) namaEl.textContent = text;
                    }
                }
                closeNodeEditModal();
            });
        }

        // ================================================================
        // 22. DIAGRAM BUTTONS
        // ================================================================
        if (resetDiagramBtn) {
            const fresh = resetDiagramBtn.cloneNode(true);
            resetDiagramBtn.parentNode.replaceChild(fresh, resetDiagramBtn);
            fresh.addEventListener('click', function() {
                if (!instance || !diagramContainer) return;
                diagramContainer.querySelectorAll('.node-box').forEach(node => {
                    if (instance) { try { instance.deleteConnectionsForElement(node.id); } catch (e) {} }
                    node.remove();
                });
                diagramContainer.style.minHeight = '';
                autoFillDiagramFromStruktur();
            });
        }

        if (addConnectionBtn) {
            const fresh = addConnectionBtn.cloneNode(true);
            addConnectionBtn.parentNode.replaceChild(fresh, addConnectionBtn);
            fresh.addEventListener('click', function() {
                connectionMode = !connectionMode;
                this.classList.toggle('bg-purple-800');
                this.innerHTML = connectionMode
                    ? '<i class="fas fa-times mr-1"></i> Batal Sambung'
                    : '<i class="fas fa-link mr-1"></i> Sambung';
                if (diagramContainer) diagramContainer.style.cursor = connectionMode ? 'crosshair' : 'default';
                if (!connectionMode) {
                    sourceNodeId = null;
                    diagramContainer.querySelectorAll('.node-box').forEach(n => { n.style.outline = 'none'; });
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
                        try { instance.connect({ uuids: [sourceId + '-bottom', id + '-top'] }); } catch (err) {}
                    }
                    sourceNodeId = null;
                    connectionMode = false;
                    const connBtn = document.getElementById('add-connection-btn');
                    if (connBtn) {
                        connBtn.classList.remove('bg-purple-800');
                        connBtn.innerHTML = '<i class="fas fa-link mr-1"></i> Sambung';
                    }
                    if (diagramContainer) diagramContainer.style.cursor = 'default';
                }
            });
        }

        if (saveDiagramBtn) {
            const fresh = saveDiagramBtn.cloneNode(true);
            saveDiagramBtn.parentNode.replaceChild(fresh, saveDiagramBtn);
            fresh.addEventListener('click', async function() {
                if (!instance || !diagramContainer) { safeToast('Diagram belum siap', 'warning'); return; }
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';
                try {
                    const payload = serializeDiagram();
                    const result = await apiCall('updateProfil', 'POST', {
                        key: 'struktur_diagram',
                        content: JSON.stringify(payload)
                    });
                    if (result && result.success) {
                        await logActivity('UPDATE', 'profil_diagram', null, 'Simpan diagram');
                        if (result._offline) {
                            safeToast('📴 Diagram tersimpan lokal, akan disinkronkan', 'warning', 4000);
                        } else {
                            safeToast('✅ Diagram disimpan', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal', 'error');
                    }
                } catch (err) { safeToast('Error: ' + err.message, 'error'); }
                finally { this.disabled = false; this.innerHTML = orig; }
            });
        }

        if (clearDiagramBtn) {
            const fresh = clearDiagramBtn.cloneNode(true);
            clearDiagramBtn.parentNode.replaceChild(fresh, clearDiagramBtn);
            fresh.addEventListener('click', function() {
                showConfirm('Hapus semua kotak?', () => {
                    if (!diagramContainer) return;
                    diagramContainer.querySelectorAll('.node-box').forEach(node => {
                        if (instance) { try { instance.deleteConnectionsForElement(node.id); } catch (e) {} }
                        node.remove();
                    });
                });
            });
        }

        function serializeDiagram() {
            if (!diagramContainer) return { nodes: [], connections: [] };
            const nodes = diagramContainer.querySelectorAll('.node-box');
            const cr = diagramContainer.getBoundingClientRect();
            const data = [];
            nodes.forEach(node => {
                const rect = node.getBoundingClientRect();
                data.push({
                    id: node.id,
                    x: Math.round(rect.left - cr.left),
                    y: Math.round(rect.top - cr.top),
                    width: node.offsetWidth,
                    height: node.offsetHeight,
                    label: node.querySelector('.node-nama') ? node.querySelector('.node-nama').textContent : '',
                    color: '#0f2922'
                });
            });
            const connections = instance
                ? instance.getConnections().map(c => ({ source: c.sourceId, target: c.targetId }))
                : [];
            return { nodes: data, connections: connections };
        }

        function renderDiagram(data) {
            if (!instance || !diagramContainer) return;
            diagramContainer.innerHTML = '';
            (data.nodes || []).forEach(nd => {
                const item = strukturCache.find(s => s.id === (nd.id || '').replace('auto-', '')) || {
                    nama: nd.label, jabatan: '', foto_url: ''
                };
                createNode(nd.x, nd.y, item, nd.id);
                const n = document.getElementById(nd.id);
                if (n) {
                    n.style.width = (nd.width || 180) + 'px';
                    n.style.height = (nd.height || 240) + 'px';
                }
            });
            (data.connections || []).forEach(c => {
                try { instance.connect({ uuids: [c.source, c.target] }); } catch (e) {}
            });
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
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
                try {
                    safeToast('🔄 Reloading data...', 'info', 1500);
                    await refreshDataOnly();
                    safeToast('✅ Data diperbarui', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = orig;
                }
            });
        }

        // ================================================================
        // 24. ESC HANDLER
        // ================================================================
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            if (nodeEditModal && !nodeEditModal.classList.contains('hidden')) closeNodeEditModal();
            else if (pengurusModal && !pengurusModal.classList.contains('hidden')) closePengurusModal();
        });

        // ================================================================
        // 25. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[profil_admin] Sync complete, refreshing...');
                refreshDataOnly();
            }
        });

        // ================================================================
        // 26. CLEANUP
        // ================================================================
        function cleanup() {
            window.__profilAdminLoaded = false;
            if (instance) { try { instance.reset(); } catch (e) {} instance = null; }
            moduleInitialized = false;
            console.log('[profil_admin] Cleanup');
        }
        window.__profilAdminCleanup = cleanup;

        // ================================================================
        // 27. INIT SEQUENCE
        // ================================================================
        console.log('[profil_admin] Loading data...');
        await loadProfilText();
        await loadStruktur();

        setTimeout(() => {
            switchTab('sejarah');
            console.log('[profil_admin] ✅ Init selesai v17.0.0');
        }, 150);
    }

    init();
});