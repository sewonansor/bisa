/**
 * js/sekretaris_dashboard.js
 * Modul Dashboard Khusus Ranting (Sekretaris) — v2.0.0 FULL FIX
 * ---------------------------------------------------------
 */

App.register('sekretaris_dashboard', function() {
    'use strict';

    // 1. GUARD
    var user = (typeof window.checkAuth === 'function') ? window.checkAuth() : null;
    if (!user || user.role !== 'sekretaris') {
        if (typeof router !== 'undefined' && router.load) router.load('/auth');
        return;
    }

    var kalurahan = String(user.kalurahan || '').trim();
    if (!kalurahan) {
        if (typeof window.showToast === 'function') window.showToast('Akun sekretaris belum punya kalurahan valid.', 'error', 5000);
        if (typeof router !== 'undefined' && router.load) router.load('/sekretaris_dashboard');
        return;
    }

    if (window.__sekretarisDashLoaded) return;
    window.__sekretarisDashLoaded = true;

    console.log('[sek_dash] 🚀 Init v2.0.0 Ranting:', kalurahan);

    // 2. HELPERS
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        var div = document.createElement('div'); div.textContent = String(s); return div.innerHTML;
    }
    function formatDate(d) {
        if (!d) return '-';
        var date = new Date(d); if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function formatRupiah(n) {
        return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
    }
    function safeToast(msg, type, dur) {
        if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', dur || 3000);
    }

    // 3. DOM CACHE (Sesuai ID di HTML v2.1.0)
    var el = {
        get headerRanting(){ return document.getElementById('sk-ranting-name-header'); },
        get statSurat()    { return document.getElementById('stat-total-surat'); },
        get statLogbook()  { return document.getElementById('stat-total-logbook'); },
        get statAnggota()  { return document.getElementById('stat-total-anggota'); },
        get statSaldo()    { return document.getElementById('stat-total-saldo'); },
        get statKegiatan() { return document.getElementById('stat-kegiatan-bulan'); },
        get recentSurat()  { return document.getElementById('recent-surat-list'); },
        get recentLogbook(){ return document.getElementById('recent-logbook-list'); },
        get refreshBtn()   { return document.getElementById('btn-refresh-dash'); }
    };

    // Set nama ranting di header
    if (el.headerRanting) el.headerRanting.textContent = kalurahan;

    // 4. LOAD DATA
    function loadDashboardData(force) {
        force = force || false;

        if (force && typeof window.invalidateCacheForAction === 'function') {
            window.invalidateCacheForAction('getSekretarisStats');
            window.invalidateCacheForAction('getSurat');
            window.invalidateCacheForAction('getLogbook');
        }

        if (force) {
            if (el.recentSurat) el.recentSurat.innerHTML = '<div class="sk-loading-center"><i class="fas fa-spinner fa-spin"></i></div>';
            if (el.recentLogbook) el.recentLogbook.innerHTML = '<div class="sk-loading-center"><i class="fas fa-spinner fa-spin"></i></div>';
        }

        // A. Stats
        var reqStats = force ? window.forceRefreshData('getSekretarisStats', { userId: user.id }) : window.apiCall('getSekretarisStats', 'POST', { userId: user.id });
        reqStats.then(function(res) {
            if (res && res.success && res.data) {
                var d = res.data;
                if (el.statSurat)    el.statSurat.textContent    = String(d.totalSurat || 0);
                if (el.statLogbook)  el.statLogbook.textContent  = String(d.totalLogbook || 0);
                if (el.statAnggota)  el.statAnggota.textContent  = String(d.totalAnggota || 0);
                if (el.statSaldo)    el.statSaldo.textContent    = formatRupiah((d.saldo && d.saldo.saldo) || 0);
                if (el.statKegiatan) el.statKegiatan.textContent = String(d.logbookBulanIni || 0);
            }
        }).catch(function(e) { console.warn('[sek_dash] Stats error:', e.message); });

        // B. Surat
        var reqSurat = force ? window.forceRefreshData('getSurat', { userId: user.id }) : window.apiCall('getSurat', 'POST', { userId: user.id });
        reqSurat.then(function(res) {
            if (res && res.success && Array.isArray(res.data)) {
                renderRecentSurat(res.data);
            } else if (el.recentSurat) {
                el.recentSurat.innerHTML = '<p class="sk-list-empty">Belum ada data surat.</p>';
            }
        }).catch(function(e) { 
            if (el.recentSurat) el.recentSurat.innerHTML = '<p class="sk-list-empty" style="color:#dc2626;">Gagal memuat.</p>';
        });

        // C. Logbook
        var reqLogbook = force ? window.forceRefreshData('getLogbook', { userId: user.id }) : window.apiCall('getLogbook', 'POST', { userId: user.id });
        reqLogbook.then(function(res) {
            if (res && res.success && Array.isArray(res.data)) {
                renderRecentLogbook(res.data);
            } else if (el.recentLogbook) {
                el.recentLogbook.innerHTML = '<p class="sk-list-empty">Belum ada data logbook.</p>';
            }
        }).catch(function(e) { 
            if (el.recentLogbook) el.recentLogbook.innerHTML = '<p class="sk-list-empty" style="color:#dc2626;">Gagal memuat.</p>';
        });

        return Promise.all([reqStats, reqSurat, reqLogbook]);
    }

    // 5. RENDER LIST
    function renderRecentSurat(data) {
        if (!el.recentSurat) return;
        if (!data || data.length === 0) {
            el.recentSurat.innerHTML = '<p class="sk-list-empty">Belum ada data surat.</p>';
            return;
        }
        var sorted = data.slice().sort(function(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
        var html = '';
        sorted.slice(0, 3).forEach(function(item) {
            html += `
                <div class="sk-list-item">
                    <div class="sk-list-icon" style="background:#dbeafe; color:#2563eb;"><i class="fas fa-file-alt"></i></div>
                    <div class="sk-list-content">
                        <p class="sk-list-title">${escapeHtml(item.perihal || '-')}</p>
                        <p class="sk-list-desc"><i class="far fa-calendar" style="margin-right:4px;"></i>${formatDate(item.tanggal || item.created_at)}</p>
                    </div>
                </div>`;
        });
        el.recentSurat.innerHTML = html;
    }

    function renderRecentLogbook(data) {
        if (!el.recentLogbook) return;
        if (!data || data.length === 0) {
            el.recentLogbook.innerHTML = '<p class="sk-list-empty">Belum ada data logbook.</p>';
            return;
        }
        var sorted = data.slice().sort(function(a, b) { return new Date(b.tanggal_mulai || b.created_at || 0) - new Date(a.tanggal_mulai || a.created_at || 0); });
        var html = '';
        sorted.slice(0, 3).forEach(function(item) {
            html += `
                <div class="sk-list-item">
                    <div class="sk-list-icon" style="background:#dcfce7; color:#16a34a;"><i class="fas fa-book"></i></div>
                    <div class="sk-list-content">
                        <p class="sk-list-title">${escapeHtml(item.kegiatan || '-')}</p>
                        <p class="sk-list-desc"><i class="far fa-calendar" style="margin-right:4px;"></i>${formatDate(item.tanggal_mulai || item.created_at)}</p>
                    </div>
                </div>`;
        });
        el.recentLogbook.innerHTML = html;
    }

    // 6. INIT DENGAN DELAY (Agar HTML dirender dulu oleh Router)
    setTimeout(function() {
        // Bind Refresh Button
        if (el.refreshBtn) {
            var fresh = el.refreshBtn.cloneNode(true);
            el.refreshBtn.parentNode.replaceChild(fresh, el.refreshBtn);
            fresh.addEventListener('click', function() {
                var btn = this;
                var orig = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Memuat...';
                loadDashboardData(true).finally(function() {
                    btn.disabled = false;
                    btn.innerHTML = orig;
                    safeToast('✅ Data diperbarui', 'success');
                });
            });
        }
        
        // Jalankan Load Data Pertama Kali
        loadDashboardData(false).then(function() {
            console.log('[sek_dash] ✅ Init complete v2.0.0');
        });
    }, 150);

    // Cleanup Hook
    window.__sekretarisDashboardCleanup = function() {
        window.__sekretarisDashLoaded = false;
    };
});