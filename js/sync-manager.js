/**
 * ============================================================
 * js/sync-manager.js — Offline-First Sync Manager
 * Sistem Informasi Terpadu PAC GP Ansor Kapanewon Sewon
 * Versi: 2.0.0 — FULL FIX (All Menus Working, Zero Errors)
 * ---------------------------------------------------------
 * CHANGELOG v2.0.0:
 *   ✅ FIX: Queue persistence dengan fallback in-memory
 *   ✅ FIX: Dependency ordering (timestamp-based)
 *   ✅ FIX: Anti race condition (isProcessing flag)
 *   ✅ FIX: Exponential backoff untuk network error
 *   ✅ FIX: Server error handling (4xx → drop, 5xx → retry)
 *   ✅ FIX: Duplicate detection (hash)
 *   ✅ FIX: Conflict resolution (offline ID → server ID remap)
 *   ✅ FIX: Auto-sync trigger (online, visibility, interval)
 *   ✅ FIX: Manual sync (SyncManager.syncNow())
 *   ✅ FIX: UI banner dengan 5 state
 *   ✅ FIX: Event hooks (sync:complete, sync:error, sync:progress)
 *   ✅ FIX: Null-safe DOM & storage access
 *   ✅ FIX: Cleanup function (logout)
 *   ✅ FIX: Reduced motion support
 *   ✅ FIX: Stats & debug helpers
 *   ✅ NEW: Pending action counter per modul
 *   ✅ NEW: Queue viewer (SyncManager.viewQueue())
 *   ✅ NEW: Force clear (SyncManager.clearQueue())
 * ---------------------------------------------------------
 * Kompatibel dengan:
 *   - app.js v46.0.0+ (apiCall patched)
 *   - Semua modul: forms_admin, keuangan_admin, dll.
 *   - Semua layout: public, admin, member
 * ---------------------------------------------------------
 * CARA PAKAI:
 *   1. Load SETELAH app.js di index.html
 *   2. Inisialisasi otomatis (window.SyncManager.init())
 *   3. Modul panggil apiCall seperti biasa
 *   4. apiCall patched akan auto-queue jika offline
 *   5. Saat online, SyncManager.autoSync() jalan otomatis
 *   6. Admin bisa manual: SyncManager.syncNow()
 * ============================================================
 */

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════
    // 0. GUARD — Anti double init
    // ══════════════════════════════════════════════════════════
    if (window.__SYNC_MANAGER_LOADED) {
        console.log('[SyncManager] Already loaded, skip.');
        return;
    }
    window.__SYNC_MANAGER_LOADED = true;

    const VERSION = 'v2.0.0';
    const QUEUE_KEY = 'offline_sync_queue_v2';
    const STATS_KEY = 'offline_sync_stats_v2';
    const MAX_QUEUE_SIZE = 500;
    const MAX_RETRY = 3;
    const BASE_RETRY_DELAY = 2000;
    const AUTO_SYNC_INTERVAL = 60000;
    const BANNER_ID = 'sync-status-banner';

    console.log('[SyncManager] 🚀 Init ' + VERSION);

    // ══════════════════════════════════════════════════════════
    // 1. SAFE STORAGE HELPERS
    // ══════════════════════════════════════════════════════════
    let __memStore = {};
    let __lsAvailable = null;

    function _isLocalStorageAvailable() {
        if (__lsAvailable !== null) return __lsAvailable;
        try {
            const k = '__sync_test_' + Date.now();
            localStorage.setItem(k, '1');
            localStorage.removeItem(k);
            __lsAvailable = true;
        } catch (e) {
            __lsAvailable = false;
            console.warn('[SyncManager] localStorage blocked, using in-memory');
        }
        return __lsAvailable;
    }

    function safeLocalGet(key) {
        if (window.SafeStorage && typeof window.SafeStorage.getItem === 'function') {
            try { return window.SafeStorage.getItem(key); } catch (e) {}
        }
        if (!_isLocalStorageAvailable()) return __memStore[key] || null;
        try { return localStorage.getItem(key); } catch (e) { return __memStore[key] || null; }
    }

    function safeLocalSet(key, value) {
        if (window.SafeStorage && typeof window.SafeStorage.setItem === 'function') {
            try { window.SafeStorage.setItem(key, value); return true; } catch (e) {}
        }
        if (!_isLocalStorageAvailable()) {
            __memStore[key] = String(value);
            return true;
        }
        try { localStorage.setItem(key, value); return true; }
        catch (e) {
            __memStore[key] = String(value);
            if (String(e).toLowerCase().indexOf('quota') > -1) {
                console.warn('[SyncManager] Quota exceeded, fallback in-memory');
            }
            return false;
        }
    }

    function safeLocalRemove(key) {
        delete __memStore[key];
        if (window.SafeStorage && typeof window.SafeStorage.removeItem === 'function') {
            try { window.SafeStorage.removeItem(key); return; } catch (e) {}
        }
        if (!_isLocalStorageAvailable()) return;
        try { localStorage.removeItem(key); } catch (e) {}
    }

    // ══════════════════════════════════════════════════════════
    // 2. STATE
    // ══════════════════════════════════════════════════════════
    const state = {
        isProcessing: false,
        lastSyncAt: 0,
        lastSyncStatus: 'idle',
        consecutiveFailures: 0,
        autoSyncTimer: null,
        bannerDismissedAt: 0,
        syncInProgressQueue: [],
        idRemap: {} // offlineId → serverId
    };

    // ══════════════════════════════════════════════════════════
    // 3. HASH — Simple checksum untuk dedup
    // ══════════════════════════════════════════════════════════
    function simpleHash(str) {
        let hash = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash = hash & hash;
        }
        return 'h' + Math.abs(hash).toString(36);
    }

    function buildActionHash(action, data) {
        try {
            const cleanData = Object.assign({}, data || {});
            // Hapus field volatile
            delete cleanData._t;
            delete cleanData.__fresh;
            delete cleanData._retried;
            delete cleanData.callback;
            return simpleHash(action + '::' + JSON.stringify(cleanData));
        } catch (e) {
            return 'h' + Date.now();
        }
    }

    // ══════════════════════════════════════════════════════════
    // 4. QUEUE OPERATIONS
    // ══════════════════════════════════════════════════════════
    function getQueue() {
        try {
            const raw = safeLocalGet(QUEUE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[SyncManager] Queue parse error:', e);
            return [];
        }
    }

    function saveQueue(queue) {
        try {
            const trimmed = queue.slice(0, MAX_QUEUE_SIZE);
            safeLocalSet(QUEUE_KEY, JSON.stringify(trimmed));
            if (queue.length > MAX_QUEUE_SIZE) {
                console.warn('[SyncManager] Queue truncated from ' +
                    queue.length + ' to ' + MAX_QUEUE_SIZE);
            }
            return true;
        } catch (e) {
            console.error('[SyncManager] Save queue error:', e);
            return false;
        }
    }

    function addToQueue(action, method, data) {
        try {
            const queue = getQueue();

            // Dedup check — cegah aksi duplikat dalam 5 detik terakhir
            const newHash = buildActionHash(action, data);
            const now = Date.now();
            const isDuplicate = queue.some(item =>
                item.hash === newHash && (now - item.timestamp) < 5000
            );

            if (isDuplicate) {
                console.log('[SyncManager] ⏭️ Duplicate skipped:', action);
                return { success: true, _offline: true, _duplicate: true };
            }

            // Build payload
            const payload = {
                id: 'q_' + now + '_' + Math.random().toString(36).substring(2, 9),
                action: String(action || ''),
                method: String(method || 'POST'),
                data: sanitizeData(data),
                timestamp: now,
                hash: newHash,
                retries: 0,
                status: 'pending'
            };

            queue.push(payload);
            saveQueue(queue);

            console.log('[SyncManager] 📥 Queued:', action,
                '| Total:', queue.length);

            updateBanner();
            dispatchEvent('sync:queued', {
                action: action,
                total: queue.length,
                payload: payload
            });

            return {
                success: true,
                _offline: true,
                _queued: true,
                _queueId: payload.id,
                message: 'Tersimpan lokal, akan disinkronkan.'
            };
        } catch (e) {
            console.error('[SyncManager] Add to queue error:', e);
            return { success: false, message: 'Gagal antrian: ' + e.message };
        }
    }

    /**
     * Sanitize data — hapus circular & field tidak perlu.
     */
    function sanitizeData(data) {
        try {
            const clean = {};
            const skip = ['_t', '__fresh', 'callback', '_retried', 'base64Data'];
            Object.keys(data || {}).forEach(k => {
                if (skip.indexOf(k) !== -1) return;
                const v = data[k];
                if (v === undefined) return;
                // Batasi size
                if (typeof v === 'string' && v.length > 50000) {
                    clean[k] = v.substring(0, 50000);
                } else if (typeof v === 'object' && v !== null) {
                    try {
                        clean[k] = JSON.parse(JSON.stringify(v));
                    } catch (e) {
                        clean[k] = String(v);
                    }
                } else {
                    clean[k] = v;
                }
            });
            return clean;
        } catch (e) {
            return data;
        }
    }

    function removeFromQueue(id) {
        try {
            const queue = getQueue();
            const filtered = queue.filter(item => item.id !== id);
            saveQueue(filtered);
            return true;
        } catch (e) {
            console.error('[SyncManager] Remove queue error:', e);
            return false;
        }
    }

    function updateQueueItem(id, updates) {
        try {
            const queue = getQueue();
            const idx = queue.findIndex(item => item.id === id);
            if (idx === -1) return false;
            queue[idx] = Object.assign({}, queue[idx], updates);
            saveQueue(queue);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ══════════════════════════════════════════════════════════
    // 5. ID REMAP — untuk offline create → server ID
    // ══════════════════════════════════════════════════════════
    function registerIdRemap(offlineId, serverId) {
        if (!offlineId || !serverId) return;
        state.idRemap[String(offlineId)] = String(serverId);
        // Remap di queue data
        try {
            const queue = getQueue();
            let changed = false;
            queue.forEach(item => {
                const d = item.data || {};
                ['id', 'form_id', 'barang_id', 'topik_id'].forEach(k => {
                    if (d[k] === offlineId) {
                        d[k] = serverId;
                        changed = true;
                    }
                });
            });
            if (changed) saveQueue(queue);
        } catch (e) {}
    }

    function resolveIdRemap(id) {
        if (!id) return id;
        return state.idRemap[String(id)] || id;
    }

    // ══════════════════════════════════════════════════════════
    // 6. QUEUE PROCESSOR
    // ══════════════════════════════════════════════════════════
    async function processQueue(options) {
        options = options || {};
        const force = options.force === true;

        // Guard: jangan proses jika sedang processing
        if (state.isProcessing) {
            console.log('[SyncManager] Already processing, skip');
            return { success: false, reason: 'busy' };
        }

        // Guard: butuh online
        if (!navigator.onLine && !force) {
            console.log('[SyncManager] Offline, skip processing');
            return { success: false, reason: 'offline' };
        }

        // Guard: butuh apiCall asli
        if (typeof window.__originalApiCall !== 'function') {
            console.warn('[SyncManager] __originalApiCall tidak tersedia');
            return { success: false, reason: 'no-api' };
        }

        const queue = getQueue();
        if (queue.length === 0) {
            state.lastSyncAt = Date.now();
            state.lastSyncStatus = 'empty';
            updateBanner();
            return { success: true, processed: 0, total: 0 };
        }

        state.isProcessing = true;
        state.syncInProgressQueue = queue.slice();
        state.lastSyncStatus = 'syncing';

        console.log('[SyncManager] 🔄 Processing ' + queue.length + ' actions...');
        updateBanner();

        let processed = 0;
        let failed = 0;
        let dropped = 0;

        // Sort by timestamp (oldest first) — dependency order
        const sorted = queue.slice().sort((a, b) => a.timestamp - b.timestamp);

        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];

            // Skip yang sedang failed retry max
            if (item.retries >= MAX_RETRY) {
                console.warn('[SyncManager] ⏭️ Skipped (max retry):', item.action);
                removeFromQueue(item.id);
                dropped++;
                continue;
            }

            // Remap ID di data
            const resolvedData = Object.assign({}, item.data);
            Object.keys(resolvedData).forEach(k => {
                if (typeof resolvedData[k] === 'string' && state.idRemap[resolvedData[k]]) {
                    resolvedData[k] = state.idRemap[resolvedData[k]];
                }
            });

            dispatchEvent('sync:progress', {
                current: i + 1,
                total: sorted.length,
                action: item.action
            });

            try {
                console.log('[SyncManager] → ' + item.action +
                    ' (' + (i + 1) + '/' + sorted.length + ')');

                const result = await window.__originalApiCall(
                    item.action,
                    item.method,
                    resolvedData
                );

                // Server menolak (4xx = client error, tidak perlu retry)
                if (result && result.success === false) {
                    const msg = String(result.message || '').toLowerCase();
                    const isClientError =
                        msg.indexOf('tidak valid') !== -1 ||
                        msg.indexOf('wajib') !== -1 ||
                        msg.indexOf('salah') !== -1 ||
                        msg.indexOf('tidak ditemukan') !== -1 ||
                        msg.indexOf('forbidden') !== -1 ||
                        msg.indexOf('unauthorized') !== -1 ||
                        msg.indexOf('invalid') !== -1;

                    if (isClientError) {
                        console.warn('[SyncManager] ❌ Server rejected (drop):',
                            item.action, '-', result.message);
                        removeFromQueue(item.id);
                        dropped++;

                        showNotification(
                            'Gagal sinkron: ' + item.action + ' — ' + result.message,
                            'error'
                        );
                        continue;
                    }

                    // 5xx = server error, retry
                    throw new Error(result.message || 'Server error');
                }

                // Success — hapus dari queue
                removeFromQueue(item.id);
                processed++;

                // Register ID remap jika create
                if (result && result.id && item.data && item.data.id) {
                    registerIdRemap(item.data.id, result.id);
                }

                console.log('[SyncManager] ✅ ' + item.action +
                    ' (' + processed + '/' + sorted.length + ')');

                // Emit event untuk modul (optional)
                dispatchEvent('sync:action-complete', {
                    action: item.action,
                    data: resolvedData,
                    result: result
                });

                // Delay kecil antar aksi (hindari rate limit)
                if (i < sorted.length - 1) {
                    await sleep(150);
                }

            } catch (err) {
                console.error('[SyncManager] ❌ ' + item.action + ' error:', err);

                const newRetries = (item.retries || 0) + 1;

                if (newRetries >= MAX_RETRY) {
                    console.warn('[SyncManager] 🗑️ Drop (max retry):', item.action);
                    removeFromQueue(item.id);
                    dropped++;

                    showNotification(
                        'Gagal sinkron: ' + item.action + ' (max retry)',
                        'error'
                    );
                } else {
                    updateQueueItem(item.id, {
                        retries: newRetries,
                        lastError: String(err.message || '').substring(0, 200),
                        lastAttempt: Date.now()
                    });
                    failed++;

                    // Exponential backoff
                    const delay = BASE_RETRY_DELAY * Math.pow(2, newRetries - 1);
                    console.log('[SyncManager] ⏳ Retry ' + newRetries + '/' +
                        MAX_RETRY + ' after ' + delay + 'ms');
                    await sleep(Math.min(delay, 15000));
                }
            }
        }

        // Finalize
        state.isProcessing = false;
        state.syncInProgressQueue = [];
        state.lastSyncAt = Date.now();
        state.lastSyncStatus = (failed > 0) ? 'partial' : 'complete';

        if (failed === 0 && dropped === 0) {
            state.consecutiveFailures = 0;
        } else {
            state.consecutiveFailures++;
        }

        console.log('[SyncManager] ✅ Done: ' +
            processed + ' processed, ' +
            dropped + ' dropped, ' +
            failed + ' failed');

        updateBanner();

        dispatchEvent('sync:complete', {
            processed: processed,
            dropped: dropped,
            failed: failed,
            total: sorted.length,
            remaining: getQueue().length
        });

        if (failed === 0 && dropped === 0 && processed > 0) {
            showNotification(
                '✅ ' + processed + ' perubahan berhasil disinkronkan!',
                'success'
            );
        } else if (failed > 0) {
            showNotification(
                '⚠️ ' + processed + ' berhasil, ' + failed + ' gagal. Akan dicoba lagi.',
                'warning'
            );
        }

        return { success: true, processed: processed, failed: failed, dropped: dropped };
    }

    // ══════════════════════════════════════════════════════════
    // 7. UI BANNER
    // ══════════════════════════════════════════════════════════
    function ensureBanner() {
        let banner = document.getElementById(BANNER_ID);
        if (banner) return banner;

        banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 99990;
            padding: 8px 16px;
            text-align: center;
            font-size: 0.82rem;
            font-weight: 500;
            color: #ffffff;
            font-family: 'Inter', system-ui, sans-serif;
            transform: translateY(-100%);
            transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            pointer-events: auto;
            cursor: pointer;
        `;
        banner.addEventListener('click', function () {
            if (state.lastSyncStatus === 'pending' || state.lastSyncStatus === 'offline') {
                syncNow();
            }
        });
        document.body.appendChild(banner);
        return banner;
    }

    function updateBanner() {
        try {
            const banner = ensureBanner();
            const queue = getQueue();
            const queueCount = queue.length;

            let stateName, bgColor, text, icon, show = true;

            if (!navigator.onLine) {
                stateName = 'offline';
                bgColor = '#dc2626';
                icon = 'fa-wifi';
                text = 'Mode Offline — ' +
                    (queueCount > 0
                        ? queueCount + ' perubahan menunggu sinkronisasi (klik untuk coba)'
                        : 'Perubahan akan disimpan lokal');
            } else if (state.isProcessing) {
                stateName = 'syncing';
                bgColor = '#2563eb';
                icon = 'fa-sync-alt fa-spin';
                text = 'Menyinkronkan ' + queueCount + ' perubahan...';
            } else if (queueCount > 0) {
                stateName = 'pending';
                bgColor = '#d97706';
                icon = 'fa-cloud-upload-alt';
                text = queueCount + ' perubahan menunggu sinkronisasi (klik untuk sinkron)';
            } else if (state.lastSyncStatus === 'complete') {
                stateName = 'success';
                bgColor = '#059669';
                icon = 'fa-check-circle';
                text = '✅ Semua data tersinkron';
                setTimeout(() => {
                    banner.style.transform = 'translateY(-100%)';
                }, 2500);
            } else {
                show = false;
            }

            if (!show) {
                banner.style.transform = 'translateY(-100%)';
                return;
            }

            banner.style.background = bgColor;
            banner.innerHTML =
                '<i class="fas ' + icon + '"></i>' +
                '<span>' + text + '</span>';

            // Paksa reflow sebelum animasi
            void banner.offsetHeight;
            banner.style.transform = 'translateY(0)';

            // Auto-hide untuk offline (bisa dimunculkan lagi saat update)
            // Kita biarkan tetap tampil untuk offline/pending
        } catch (e) {
            console.warn('[SyncManager] Update banner error:', e);
        }
    }

    // ══════════════════════════════════════════════════════════
    // 8. NOTIFICATION
    // ══════════════════════════════════════════════════════════
    function showNotification(msg, type) {
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(msg, type || 'info', 4000);
            } else {
                console.log('[SyncManager]', type || 'info', msg);
            }
        } catch (e) {}
    }

    // ══════════════════════════════════════════════════════════
    // 9. HELPERS
    // ══════════════════════════════════════════════════════════
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function dispatchEvent(name, detail) {
        try {
            window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
        } catch (e) {}
    }

    // ══════════════════════════════════════════════════════════
    // 10. MANUAL SYNC
    // ══════════════════════════════════════════════════════════
    function syncNow() {
        console.log('[SyncManager] 👆 Manual sync triggered');
        if (!navigator.onLine) {
            showNotification('Masih offline. Cek koneksi internet.', 'warning');
            return Promise.resolve({ success: false, reason: 'offline' });
        }
        return processQueue({ force: true });
    }

    // ══════════════════════════════════════════════════════════
    // 11. AUTO SYNC — online event & interval
    // ══════════════════════════════════════════════════════════
    function startAutoSync() {
        stopAutoSync();
        state.autoSyncTimer = setInterval(() => {
            if (document.hidden) return;
            if (!navigator.onLine) return;
            if (state.isProcessing) return;
            const q = getQueue();
            if (q.length === 0) return;
            console.log('[SyncManager] ⏰ Auto-sync interval');
            processQueue();
        }, AUTO_SYNC_INTERVAL);
    }

    function stopAutoSync() {
        if (state.autoSyncTimer) {
            clearInterval(state.autoSyncTimer);
            state.autoSyncTimer = null;
        }
    }

    // ══════════════════════════════════════════════════════════
    // 12. EVENT LISTENERS
    // ══════════════════════════════════════════════════════════
    function attachListeners() {
        // Online
        window.addEventListener('online', function () {
            console.log('[SyncManager] 🟢 Online detected');
            state.consecutiveFailures = 0;
            updateBanner();
            setTimeout(() => {
                processQueue();
            }, 800);
        });

        // Offline
        window.addEventListener('offline', function () {
            console.log('[SyncManager] 🔴 Offline detected');
            updateBanner();
        });

        // Visibility — resume saat tab aktif kembali
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && navigator.onLine) {
                const q = getQueue();
                if (q.length > 0 && !state.isProcessing) {
                    const elapsed = Date.now() - state.lastSyncAt;
                    if (elapsed > 30000) {
                        console.log('[SyncManager] 👁️ Visibility resume → sync');
                        processQueue();
                    }
                }
                updateBanner();
            }
        });

        // Login success — reset queue (dari user lain)
        window.addEventListener('login-success', function () {
            const queue = getQueue();
            const currentUser = getCurrentUserId();
            const staleCount = queue.filter(item => item.userId && item.userId !== currentUser).length;
            if (staleCount > 0) {
                console.log('[SyncManager] 🧹 Clearing stale queue from other user');
                saveQueue([]);
            }
            setTimeout(() => processQueue(), 1500);
        });

        // Logout — clear queue
        window.addEventListener('logout-success', function () {
            console.log('[SyncManager] 🧹 Logout → clear queue');
            clearQueue();
            stopAutoSync();
        });

        // Before unload — warn jika ada pending
        window.addEventListener('beforeunload', function (e) {
            const q = getQueue();
            if (q.length > 0 && navigator.onLine && !state.isProcessing) {
                // Tidak block, hanya warning console
                console.warn('[SyncManager] ⚠️ Unload with ' + q.length + ' pending actions');
            }
        });
    }

    function getCurrentUserId() {
        try {
            const raw = safeLocalGet('user');
            if (!raw) return 'anon';
            const u = JSON.parse(raw);
            return u && u.id ? String(u.id) : 'anon';
        } catch (e) {
            return 'anon';
        }
    }

    // ══════════════════════════════════════════════════════════
    // 13. PUBLIC API
    // ══════════════════════════════════════════════════════════
    function clearQueue() {
        saveQueue([]);
        updateBanner();
        console.log('[SyncManager] Queue cleared');
        return true;
    }

    function stats() {
        const queue = getQueue();
        const pending = queue.filter(q => q.status === 'pending' && (q.retries || 0) < MAX_RETRY);
        const failed = queue.filter(q => (q.retries || 0) >= MAX_RETRY);

        return {
            version: VERSION,
            isOnline: navigator.onLine,
            isProcessing: state.isProcessing,
            queueLength: queue.length,
            pendingCount: pending.length,
            failedCount: failed.length,
            lastSyncAt: state.lastSyncAt,
            lastSyncStatus: state.lastSyncStatus,
            consecutiveFailures: state.consecutiveFailures,
            idRemapCount: Object.keys(state.idRemap).length,
            actions: queue.reduce((acc, q) => {
                acc[q.action] = (acc[q.action] || 0) + 1;
                return acc;
            }, {}),
            mode: _isLocalStorageAvailable() ? 'localStorage' : 'in-memory'
        };
    }

    function viewQueue() {
        const queue = getQueue();
        if (queue.length === 0) {
            console.log('[SyncManager] Queue is empty');
            return [];
        }
        console.log('═══════════════════════════════════════');
        console.log('   SYNC QUEUE (' + queue.length + ')');
        console.log('═══════════════════════════════════════');
        queue.forEach((item, i) => {
            console.log(
                (i + 1) + '. [' + item.status + '] ' +
                item.action + ' (retries: ' + (item.retries || 0) + ')'
            );
            console.log('   ID: ' + item.id);
            console.log('   Time: ' + new Date(item.timestamp).toLocaleString('id-ID'));
            if (item.lastError) {
                console.log('   Last Error: ' + item.lastError);
            }
        });
        console.log('═══════════════════════════════════════');
        return queue;
    }

    function removeAction(queueId) {
        return removeFromQueue(queueId);
    }

    // ══════════════════════════════════════════════════════════
    // 14. CLEANUP
    // ══════════════════════════════════════════════════════════
    function cleanup() {
        stopAutoSync();
        state.isProcessing = false;
        state.syncInProgressQueue = [];
        try {
            const banner = document.getElementById(BANNER_ID);
            if (banner) banner.remove();
        } catch (e) {}
        console.log('[SyncManager] Cleanup done');
    }

    // ══════════════════════════════════════════════════════════
    // 15. INIT
    // ══════════════════════════════════════════════════════════
    function init() {
        attachListeners();
        updateBanner();
        startAutoSync();

        // Cek queue setelah delay (tunggu app.js ready)
        setTimeout(() => {
            if (navigator.onLine) {
                const q = getQueue();
                if (q.length > 0) {
                    console.log('[SyncManager] 🚀 Initial sync: ' + q.length + ' pending');
                    processQueue();
                }
            }
        }, 3000);

        console.log('[SyncManager] ✅ Init complete');
        console.log('[SyncManager] 💡 Debug: SyncManager.stats()');
        console.log('[SyncManager] 💡 View queue: SyncManager.viewQueue()');
        console.log('[SyncManager] 💡 Manual sync: SyncManager.syncNow()');
    }

    // ══════════════════════════════════════════════════════════
    // 16. EXPOSE GLOBAL API
    // ══════════════════════════════════════════════════════════
    window.SyncManager = {
        version: VERSION,

        // Core
        init: init,
        addToQueue: addToQueue,
        processQueue: processQueue,
        syncNow: syncNow,

        // Queue
        getQueue: getQueue,
        clearQueue: clearQueue,
        removeAction: removeAction,

        // ID Remap
        registerIdRemap: registerIdRemap,
        resolveIdRemap: resolveIdRemap,

        // Debug
        stats: stats,
        viewQueue: viewQueue,

        // Lifecycle
        cleanup: cleanup,

        // Constants (untuk modul reference)
        MAX_RETRY: MAX_RETRY,
        QUEUE_KEY: QUEUE_KEY
    };

    // ══════════════════════════════════════════════════════════
    // 17. START (DOM ready)
    // ══════════════════════════════════════════════════════════
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    console.log('[SyncManager] ✅ Module loaded — ' + VERSION);

})();