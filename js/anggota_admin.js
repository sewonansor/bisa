/**
 * js/anggota_admin.js
 * Modul Admin Anggota & Verifikasi — v11.0.0 OFFLINE-FIRST FULL FIX
 * ============================================================
 * CHANGELOG v11.0.0:
 *   ✅ NEW: Handle response _offline dari apiCall
 *   ✅ NEW: Badge pending sync di tabel
 *   ✅ NEW: Auto-refresh saat sync:complete
 *   ✅ NEW: Safe toast fallback
 *   ✅ NEW: Upload foto skip saat offline
 *   ✅ FIX: Semua handler idempotent
 *   ✅ FIX: Null-safe seluruh DOM elements
 *   ✅ FIX: Refresh tanpa reload halaman
 *   ✅ FIX: Guard anti-duplikasi
 *   ✅ FIX: Tab switching (daftar + verifikasi)
 *   ✅ FIX: Modal tambah/edit anggota
 *   ✅ FIX: Approve/reject pendaftar (offline-aware)
 *   ✅ FIX: Delete anggota dengan konfirmasi
 *   ✅ FIX: Upload foto via window.FormPhoto
 *   ✅ FIX: Avatar thumbnail dengan fallback initials
 *   ✅ FIX: FormPhoto controller robust
 *   ✅ PRESERVED: Semua fitur v10.0.0
 * ============================================================
 */

App.register('anggota_admin', function() {
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
    if (window.__anggotaAdminLoaded) {
        console.log('[anggota_admin] Sudah di-init, skip.');
        return;
    }
    window.__anggotaAdminLoaded = true;

    console.log('[anggota_admin] 🚀 Init v11.0.0 (Offline-First Full Fix)');

    // ================================================================
    // 3. HELPER: WAIT FOR DOM
    // ================================================================
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
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function getInitials(name) {
        if (!name || name === '-') return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function getAvatarColor(str) {
        const colors = [
            'from-teal-400 to-emerald-600',
            'from-blue-400 to-indigo-600',
            'from-purple-400 to-fuchsia-600',
            'from-pink-400 to-rose-600',
            'from-amber-400 to-orange-600',
            'from-cyan-400 to-blue-600'
        ];
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash = hash & hash;
        }
        return colors[Math.abs(hash) % colors.length];
    }

    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info', dur || 3000);
        } else {
            console.log('[anggota_admin:' + (type || 'info') + ']', msg);
        }
    }

    /**
     * ✅ NEW: Deteksi pending sync per id
     */
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

    // ================================================================
    // 5. REFRESH TANPA RELOAD
    // ================================================================
    function refreshAnggotaData(forceAll) {
        console.log('[anggota_admin] 🔄 Refresh data without reload');

        try {
            const cKeyUsers = 'cache_getUsers_' + user.id + '_' + JSON.stringify({});
            const cKeyPending = 'cache_getPendingUsers_' + user.id + '_' + JSON.stringify({});
            SafeSessionStorage.removeItem(cKeyUsers);
            SafeSessionStorage.removeItem(cKeyPending);
        } catch (e) {}

        return Promise.allSettled([
            loadAnggota(forceAll === true),
            loadPending(forceAll === true)
        ]).then(() => {
            console.log('[anggota_admin] ✅ Data refreshed');
        });
    }

    // ================================================================
    // 6. INIT UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'anggota-table-body', 'pending-table-body',
            'anggota-skeleton', 'pending-skeleton',
            'anggota-modal', 'modal-content', 'modal-title',
            'anggota-form', 'modal-close', 'add-anggota-btn', 'refresh-anggota-btn',
            'anggota-id', 'anggota_nama', 'anggota_username', 'anggota_password',
            'anggota_role', 'anggota_alamat', 'anggota_angkatan', 'anggota_riwayat_jabatan',
            'anggota_foto', 'anggota_foto_url',
            'anggota-foto-preview', 'anggota-foto-preview-wrap', 'anggota-foto-remove',
            'tab-daftar', 'tab-verifikasi'
        ];

        const els = await waitForElements(requiredIds);

        const tableBody = els['anggota-table-body'];
        const pendingTableBody = els['pending-table-body'];
        const anggotaSkeleton = els['anggota-skeleton'];
        const pendingSkeleton = els['pending-skeleton'];
        const modal = els['anggota-modal'];
        const modalContent = els['modal-content'];
        const modalTitle = els['modal-title'];
        const form = els['anggota-form'];
        const closeBtn = els['modal-close'];
        const addBtn = els['add-anggota-btn'];
        const refreshBtn = els['refresh-anggota-btn'];
        const idInput = els['anggota-id'];
        const namaInput = els['anggota_nama'];
        const usernameInput = els['anggota_username'];
        const passwordInput = els['anggota_password'];
        const roleSelect = els['anggota_role'];
        const alamatInput = els['anggota_alamat'];
        const angkatanInput = els['anggota_angkatan'];
        const riwayatJabatanInput = els['anggota_riwayat_jabatan'];
        const fotoUrlInput = els['anggota_foto_url'];
        const fotoFileInput = els['anggota_foto'];

        if (!tableBody || !modal || !form) {
            console.error('[anggota_admin] ❌ Elemen utama tidak ditemukan.');
            return;
        }

        console.log('[anggota_admin] ✅ Semua elemen ditemukan');

        // ================================================================
        // 7. STATE
        // ================================================================
        let isEdit = false;
        let isSubmitting = false;
        let membersCache = [];
        let pendingCache = [];

        // ✅ FormPhoto controller
        let anggotaPhotoCtrl = null;

        // ================================================================
        // 8. ATTACH FORMPHOTO CONTROLLER
        // ================================================================
        if (typeof window.FormPhoto !== 'undefined' && fotoFileInput) {
            anggotaPhotoCtrl = window.FormPhoto.attach(
                'anggota_foto',
                'anggota-foto-preview',
                'anggota-foto-remove',
                {
                    onPreview: function() {
                        const wrap = document.getElementById('anggota-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'block';
                    },
                    onClear: function() {
                        const wrap = document.getElementById('anggota-foto-preview-wrap');
                        if (wrap) wrap.style.display = 'none';
                        if (fotoUrlInput) fotoUrlInput.value = '';
                    }
                }
            );
            console.log('[anggota_admin] ✅ FormPhoto controller attached');
        } else {
            console.warn('[anggota_admin] ⚠️ FormPhoto tidak tersedia');
        }

        function resetAnggotaPhoto() {
            if (anggotaPhotoCtrl) {
                try { anggotaPhotoCtrl.reset(); } catch (e) {}
            }
            const wrap = document.getElementById('anggota-foto-preview-wrap');
            if (wrap) wrap.style.display = 'none';
            if (fotoUrlInput) fotoUrlInput.value = '';
        }

        // ================================================================
        // 9. TAB LOGIC
        // ================================================================
        const tabBtns = document.querySelectorAll('.tab-btn');

        function activateTab(tabName) {
            console.log('[anggota_admin] activateTab:', tabName);

            tabBtns.forEach(btn => {
                const isActive = btn.dataset.tab === tabName;
                btn.classList.toggle('active', isActive);
            });

            const daftarEl = document.getElementById('tab-daftar');
            const verifEl = document.getElementById('tab-verifikasi');

            if (daftarEl) daftarEl.classList.toggle('hidden', tabName !== 'daftar');
            if (verifEl) verifEl.classList.toggle('hidden', tabName !== 'verifikasi');

            if (tabName === 'verifikasi' && pendingCache.length === 0) {
                loadPending();
            }
        }

        tabBtns.forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            clone.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                if (tabName) activateTab(tabName);
            });
        });

        // ================================================================
        // 10. LOAD DATA (SWR)
        // ================================================================
        async function loadAnggota(force) {
            force = force || false;

            if (membersCache.length > 0 && !force) {
                renderAnggota(membersCache);
                fetchAnggotaBackground();
                return;
            }

            if (anggotaSkeleton) anggotaSkeleton.classList.remove('hidden');
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8">' +
                    '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i>' +
                    '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data anggota...</p>' +
                    '</td></tr>';
            }

            try {
                const result = await forceRefreshData('getUsers', {});

                if (anggotaSkeleton) anggotaSkeleton.classList.add('hidden');

                if (result && result.success && Array.isArray(result.data)) {
                    membersCache = result.data;
                    renderAnggota(membersCache);
                } else if (result && result.success) {
                    membersCache = [];
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                        '<i class="fas fa-users text-3xl mb-2 opacity-40"></i>' +
                        '<p>Belum ada anggota terdaftar</p></td></tr>';
                } else {
                    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[anggota_admin] loadAnggota error:', error);
                if (anggotaSkeleton) anggotaSkeleton.classList.add('hidden');
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchAnggotaBackground() {
            try {
                const result = await forceRefreshData('getUsers', {});
                if (result && result.success && Array.isArray(result.data)) {
                    membersCache = result.data;
                    renderAnggota(membersCache);
                }
            } catch (e) {
                console.warn('[anggota_admin] fetchAnggotaBackground error:', e);
            }
        }

        async function loadPending(force) {
            force = force || false;

            if (pendingCache.length > 0 && !force) {
                renderPending(pendingCache);
                fetchPendingBackground();
                return;
            }

            if (pendingSkeleton) pendingSkeleton.classList.remove('hidden');
            if (pendingTableBody) {
                pendingTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
                    '<i class="fas fa-spinner fa-spin text-2xl text-[var(--text-muted)]"></i>' +
                    '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat data pendaftar...</p>' +
                    '</td></tr>';
            }

            try {
                const result = await forceRefreshData('getPendingUsers', {});

                if (pendingSkeleton) pendingSkeleton.classList.add('hidden');

                if (result && result.success && Array.isArray(result.data)) {
                    pendingCache = result.data;
                    renderPending(pendingCache);
                } else if (result && result.success) {
                    pendingCache = [];
                    pendingTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                        '<i class="fas fa-user-check text-3xl mb-2 opacity-40"></i>' +
                        '<p>Tidak ada pendaftar baru</p></td></tr>';
                } else {
                    pendingTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                        '<i class="fas fa-exclamation-triangle text-2xl mb-2"></i>' +
                        '<p>' + escapeHtml((result && result.message) || 'Gagal memuat data') + '</p></td></tr>';
                }
            } catch (error) {
                console.error('[anggota_admin] loadPending error:', error);
                if (pendingSkeleton) pendingSkeleton.classList.add('hidden');
                pendingTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">' +
                    'Error: ' + escapeHtml(error.message) + '</td></tr>';
            }
        }

        async function fetchPendingBackground() {
            try {
                const result = await forceRefreshData('getPendingUsers', {});
                if (result && result.success && Array.isArray(result.data)) {
                    pendingCache = result.data;
                    renderPending(pendingCache);
                }
            } catch (e) {
                console.warn('[anggota_admin] fetchPendingBackground error:', e);
            }
        }

        // ================================================================
        // 11. RENDER TABEL ANGGOTA — WITH PENDING SYNC BADGE
        // ================================================================
        function renderAnggota(data) {
            if (!tableBody) return;

            if (!data || data.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-[var(--text-muted)]">' +
                    '<i class="fas fa-users text-3xl mb-2 opacity-40"></i>' +
                    '<p>Belum ada anggota terdaftar</p></td></tr>';
                return;
            }

            let html = '';
            data.forEach((u, index) => {
                const status = String(u.status || 'approved').toLowerCase();
                let statusBadge = '';

                if (status === 'approved' || status === 'active' || status === '') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Aktif</span>';
                } else if (status === 'pending') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Pending</span>';
                } else if (status === 'rejected') {
                    statusBadge = '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Ditolak</span>';
                }

                const role = String(u.role || 'member').toLowerCase();
                const roleBadge = role === 'admin'
                    ? '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Admin</span>'
                    : '<span class="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Member</span>';

                const nama = u.nama || u.name || '-';
                const username = u.username || u.email || '-';
                const alamat = u.alamat || u.kalurahan || '-';
                const angkatan = u.angkatan || '-';
                const riwayat = u.riwayat_jabatan || '-';

                const avatarColor = getAvatarColor(nama);
                const initials = getInitials(nama);
                const avatarHtml = u.foto_url
                    ? `<img src="${escapeAttr(u.foto_url)}"
                            alt="${escapeAttr(nama)}"
                            class="anggota-avatar"
                            loading="lazy"
                            onerror="this.outerHTML='<div class=\\'anggota-avatar-placeholder bg-gradient-to-br ${avatarColor}\\'>${escapeHtml(initials)}</div>'">`
                    : `<div class="anggota-avatar-placeholder bg-gradient-to-br ${avatarColor}">${escapeHtml(initials)}</div>`;

                const pending = isPendingSync(u.id);
                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳ SYNC</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${index + 1}${pendingBadge}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">
                            <div class="flex items-center gap-3">
                                ${avatarHtml}
                                <span class="truncate">${escapeHtml(nama)}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(username)}</td>
                        <td class="px-6 py-4 text-sm">${roleBadge}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(alamat)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(angkatan)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(riwayat)}</td>
                        <td class="px-6 py-4 text-sm">${statusBadge}</td>
                        <td class="px-6 py-4 text-sm whitespace-nowrap">
                            <button onclick="editAnggota('${escapeAttr(u.id)}')" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-2" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteAnggota('${escapeAttr(u.id)}')" class="text-red-600 hover:text-red-800 dark:text-red-400" title="Hapus">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        // ================================================================
        // 12. RENDER TABEL PENDING
        // ================================================================
        function renderPending(data) {
            if (!pendingTableBody) return;

            if (!data || data.length === 0) {
                pendingTableBody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">' +
                    '<i class="fas fa-user-check text-3xl mb-2 opacity-40"></i>' +
                    '<p>Tidak ada pendaftar baru</p></td></tr>';
                return;
            }

            let html = '';
            data.forEach((u, idx) => {
                const nama = u.nama || u.name || '-';
                const username = u.username || u.email || '-';
                const noHp = u.no_hp || '-';
                const kalurahan = u.kalurahan || u.alamat || '-';
                const tgl = formatDate(u.created_at || u.joinDate);
                const pending = isPendingSync(u.id);
                const pendingBadge = pending
                    ? ' <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" title="Menunggu sinkronisasi">⟳ SYNC</span>'
                    : '';

                html += `
                    <tr class="hover:bg-[var(--bg-stats)] transition-colors ${pending ? 'border-l-2 border-amber-500' : ''}">
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${idx + 1}${pendingBadge}</td>
                        <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${escapeHtml(nama)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(username)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(noHp)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(kalurahan)}</td>
                        <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${escapeHtml(tgl)}</td>
                        <td class="px-6 py-4 text-sm whitespace-nowrap">
                            <button onclick="approveUser('${escapeAttr(u.id)}')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs mr-2 transition">
                                <i class="fas fa-check mr-1"></i>Setujui
                            </button>
                            <button onclick="rejectUser('${escapeAttr(u.id)}')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-xs transition">
                                <i class="fas fa-times mr-1"></i>Tolak
                            </button>
                        </td>
                    </tr>
                `;
            });
            pendingTableBody.innerHTML = html;
        }

        // ================================================================
        // 13. APPROVE USER — HANDLE OFFLINE
        // ================================================================
        window.approveUser = function(id) {
            showConfirm('Setujui pendaftar ini?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('approveUser', 'POST', { id: id });

                    if (result && result.success) {
                        pendingCache = pendingCache.filter(u => String(u.id) !== String(id));

                        const member = membersCache.find(u => String(u.id) === String(id));
                        if (member) {
                            member.status = 'approved';
                        }

                        renderPending(pendingCache);
                        renderAnggota(membersCache);

                        await logActivity('APPROVE', 'anggota', id, 'Menyetujui pendaftaran');

                        if (result._offline) {
                            safeToast('📴 Persetujuan tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                        } else {
                            safeToast('✅ Anggota berhasil disetujui!', 'success');
                        }

                        setTimeout(() => refreshAnggotaData(false), 500);
                    } else {
                        safeToast((result && result.message) || 'Gagal menyetujui.', 'error');
                    }
                } catch (e) {
                    console.error('[anggota_admin] approveUser error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 14. REJECT USER — HANDLE OFFLINE
        // ================================================================
        window.rejectUser = function(id) {
            showConfirm('Tolak pendaftar ini?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('rejectUser', 'POST', { id: id });

                    if (result && result.success) {
                        pendingCache = pendingCache.filter(u => String(u.id) !== String(id));

                        const member = membersCache.find(u => String(u.id) === String(id));
                        if (member) member.status = 'rejected';

                        renderPending(pendingCache);
                        renderAnggota(membersCache);

                        await logActivity('REJECT', 'anggota', id, 'Menolak pendaftaran');

                        if (result._offline) {
                            safeToast('📴 Penolakan tersimpan lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('Pendaftar ditolak.', 'info');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menolak.', 'error');
                    }
                } catch (e) {
                    console.error('[anggota_admin] rejectUser error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 15. MODAL FUNCTIONS
        // ================================================================
        function openModal() {
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(() => {
                if (modalContent) {
                    modalContent.classList.remove('scale-95', 'opacity-0');
                    modalContent.classList.add('scale-100', 'opacity-100');
                }
            });
            document.body.style.overflow = 'hidden';
            setTimeout(() => { if (namaInput) namaInput.focus(); }, 150);
        }

        function closeModal() {
            if (!modal) return;
            if (modalContent) {
                modalContent.classList.remove('scale-100', 'opacity-100');
                modalContent.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 150);
            document.body.style.overflow = '';
            form.reset();
            if (idInput) idInput.value = '';
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.placeholder = 'Kosongkan jika tidak mengubah password';
            }
            isEdit = false;
            resetAnggotaPhoto();
        }

        if (closeBtn) {
            const fresh = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(fresh, closeBtn);
            fresh.addEventListener('click', closeModal);
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });

        // ================================================================
        // 16. TAMBAH ANGGOTA
        // ================================================================
        if (addBtn) {
            const fresh = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(fresh, addBtn);
            fresh.addEventListener('click', () => {
                isEdit = false;
                if (modalTitle) modalTitle.textContent = 'Tambah Anggota';
                form.reset();
                if (idInput) idInput.value = '';
                if (passwordInput) {
                    passwordInput.placeholder = 'Password (minimal 6 karakter)';
                    passwordInput.value = '';
                }
                resetAnggotaPhoto();
                openModal();
            });
        }

        // ================================================================
        // 17. EDIT ANGGOTA
        // ================================================================
        window.editAnggota = function(id) {
            const anggota = membersCache.find(u => String(u.id) === String(id));
            if (!anggota) {
                safeToast('Anggota tidak ditemukan', 'warning');
                if (membersCache.length === 0) {
                    loadAnggota(true).then(() => {
                        const retry = membersCache.find(u => String(u.id) === String(id));
                        if (retry) fillEditForm(retry);
                    });
                }
                return;
            }
            fillEditForm(anggota);
        };

        function fillEditForm(anggota) {
            isEdit = true;
            if (modalTitle) modalTitle.textContent = 'Edit Anggota';
            if (idInput) idInput.value = anggota.id || '';
            if (namaInput) namaInput.value = anggota.nama || anggota.name || '';
            if (usernameInput) usernameInput.value = anggota.username || anggota.email || '';
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.placeholder = 'Kosongkan jika tidak mengubah password';
            }
            if (roleSelect) roleSelect.value = anggota.role || 'member';
            if (alamatInput) alamatInput.value = anggota.alamat || anggota.kalurahan || '';
            if (angkatanInput) angkatanInput.value = anggota.angkatan || '';
            if (riwayatJabatanInput) riwayatJabatanInput.value = anggota.riwayat_jabatan || '';

            resetAnggotaPhoto();
            const existingUrl = anggota.foto_url || '';
            if (fotoUrlInput) fotoUrlInput.value = existingUrl;

            if (existingUrl && anggotaPhotoCtrl) {
                try {
                    anggotaPhotoCtrl.setExisting(existingUrl);
                    const wrap = document.getElementById('anggota-foto-preview-wrap');
                    if (wrap) wrap.style.display = 'block';
                } catch (e) {
                    console.warn('[anggota_admin] setExisting error:', e);
                }
            }

            openModal();
        }

        // ================================================================
        // 18. DELETE ANGGOTA — HANDLE OFFLINE
        // ================================================================
        window.deleteAnggota = function(id) {
            const anggota = membersCache.find(u => String(u.id) === String(id));
            const nama = anggota ? (anggota.nama || anggota.name || 'anggota ini') : 'anggota ini';

            showConfirm('Hapus anggota "' + nama + '"?', async () => {
                if (isSubmitting) return;
                isSubmitting = true;

                try {
                    const result = await apiCall('deleteUser', 'POST', { id: id });

                    if (result && result.success) {
                        membersCache = membersCache.filter(u => String(u.id) !== String(id));
                        renderAnggota(membersCache);

                        await logActivity('DELETE', 'anggota', id, 'Hapus: ' + nama);

                        if (result._offline) {
                            safeToast('📴 Anggota dihapus lokal, akan disinkronkan saat online', 'warning', 4000);
                        } else {
                            safeToast('✅ Anggota berhasil dihapus!', 'success');
                        }
                    } else {
                        safeToast((result && result.message) || 'Gagal menghapus', 'error');
                    }
                } catch (e) {
                    console.error('[anggota_admin] deleteAnggota error:', e);
                    safeToast('Error: ' + e.message, 'error');
                } finally {
                    isSubmitting = false;
                }
            });
        };

        // ================================================================
        // 19. SUBMIT FORM — HANDLE OFFLINE
        // ================================================================
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isSubmitting) return;

            const id = idInput ? idInput.value : '';
            const nama = namaInput ? (namaInput.value || '').trim() : '';
            const username = usernameInput ? (usernameInput.value || '').trim() : '';
            const password = passwordInput ? (passwordInput.value || '').trim() : '';
            const role = roleSelect ? roleSelect.value : 'member';
            const alamat = alamatInput ? (alamatInput.value || '').trim() : '';
            const angkatan = angkatanInput ? (angkatanInput.value || '').trim() : '';
            const riwayat_jabatan = riwayatJabatanInput ? (riwayatJabatanInput.value || '').trim() : '';

            if (!nama) {
                safeToast('Nama wajib diisi!', 'warning');
                if (namaInput) namaInput.focus();
                return;
            }
            if (nama.length < 3) {
                safeToast('Nama minimal 3 karakter!', 'warning');
                if (namaInput) namaInput.focus();
                return;
            }
            if (!username) {
                safeToast('Username/email wajib diisi!', 'warning');
                if (usernameInput) usernameInput.focus();
                return;
            }
            if (!id && !password) {
                safeToast('Password wajib diisi untuk anggota baru!', 'warning');
                if (passwordInput) passwordInput.focus();
                return;
            }
            if (password && password.length < 6) {
                safeToast('Password minimal 6 karakter!', 'warning');
                if (passwordInput) passwordInput.focus();
                return;
            }

            isSubmitting = true;
            const submitBtn = form.querySelector('button[type="submit"]');
            startLoading(submitBtn, 'Menyimpan...');

            try {
                // STEP 1: Upload foto (jika ada file baru & online)
                const existingUrl = fotoUrlInput ? fotoUrlInput.value : '';
                let foto_url = existingUrl;

                if (anggotaPhotoCtrl && anggotaPhotoCtrl.hasFile()) {
                    if (!navigator.onLine) {
                        safeToast('📴 Upload foto memerlukan koneksi internet. Menyimpan tanpa foto.', 'warning', 4500);
                    } else {
                        if (submitBtn) {
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mengunggah foto...';
                        }

                        try {
                            foto_url = await window.FormPhoto.uploadIfAny(anggotaPhotoCtrl, existingUrl);
                        } catch (uploadErr) {
                            console.error('[anggota_admin] Upload foto error:', uploadErr);
                            safeToast('Gagal upload foto: ' + uploadErr.message, 'error', 4000);
                            stopLoading(submitBtn);
                            isSubmitting = false;
                            return;
                        }

                        if (submitBtn) {
                            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
                        }
                    }
                }

                // STEP 2: Build payload
                const data = {
                    nama: nama,
                    username: username,
                    role: role,
                    alamat: alamat,
                    angkatan: angkatan,
                    riwayat_jabatan: riwayat_jabatan,
                    foto_url: foto_url
                };
                if (password) data.password = password;

                const action = isEdit ? 'updateUser' : 'createUser';
                const payload = isEdit ? Object.assign({ id: id }, data) : data;

                const result = await apiCall(action, 'POST', payload);

                if (result && result.success) {
                    // Update cache lokal (optimistic)
                    if (isEdit) {
                        const idx = membersCache.findIndex(u => String(u.id) === String(id));
                        if (idx !== -1) {
                            membersCache[idx] = Object.assign({}, membersCache[idx], data, { id: id });
                        }
                    } else {
                        const newUser = Object.assign({}, data, {
                            id: result.id || ('tmp_' + Date.now()),
                            status: 'approved',
                            created_at: new Date().toISOString()
                        });
                        membersCache.unshift(newUser);
                    }

                    renderAnggota(membersCache);
                    closeModal();
                    form.reset();

                    await logActivity(
                        isEdit ? 'UPDATE' : 'CREATE',
                        'anggota',
                        result.id || id,
                        'Username: ' + username
                    );

                    if (result._offline) {
                        safeToast('📴 Data tersimpan lokal, akan disinkronkan saat online', 'warning', 4500);
                    } else {
                        safeToast(
                            isEdit ? '✅ Anggota berhasil diperbarui!' : '✅ Anggota berhasil ditambahkan!',
                            'success'
                        );
                    }
                } else {
                    safeToast((result && result.message) || 'Gagal menyimpan anggota', 'error');
                }
            } catch (error) {
                console.error('[anggota_admin] Submit error:', error);
                safeToast('Error: ' + error.message, 'error');
            } finally {
                stopLoading(submitBtn);
                isSubmitting = false;
            }
        });

        // ================================================================
        // 20. REFRESH BUTTON
        // ================================================================
        if (refreshBtn) {
            const fresh = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(fresh, refreshBtn);
            fresh.addEventListener('click', async function() {
                const orig = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span class="hidden sm:inline">Memuat...</span>';

                try {
                    await refreshAnggotaData(true);
                    safeToast('✅ Data anggota diperbarui!', 'success');
                } finally {
                    this.disabled = false;
                    this.innerHTML = orig;
                }
            });
        }

        // ================================================================
        // 21. LISTEN SYNC EVENT
        // ================================================================
        window.addEventListener('sync:complete', function(e) {
            const detail = e.detail || {};
            if (detail.processed > 0) {
                console.log('[anggota_admin] Sync complete, refreshing...');
                refreshAnggotaData(true);
            }
        });

        // ================================================================
        // 22. CLEANUP
        // ================================================================
        function cleanup() {
            window.__anggotaAdminLoaded = false;
            isSubmitting = false;
            console.log('[anggota_admin] Cleanup');
        }
        window.__anggotaAdminCleanup = cleanup;

        // ================================================================
        // 23. INIT — LOAD DATA
        // ================================================================
        console.log('[anggota_admin] Loading initial data...');
        await Promise.all([
            loadAnggota(),
            loadPending()
        ]);

        activateTab('daftar');
        console.log('[anggota_admin] ✅ Init selesai v11.0.0');
    }

    // ================================================================
    // 24. RUN INIT
    // ================================================================
    init();
});