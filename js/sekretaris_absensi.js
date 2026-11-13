/**
 * js/sekretaris_absensi.js
 * Modul Absensi Khusus Ranting (Sekretaris) — v2.3.0 FULL FIX
 * ---------------------------------------------------------
 * Fitur: Filter, CRUD (Edit/Hapus), Export (CSV/PDF/Gambar), QR Per-Ranting
 * Terintegrasi dengan Preload Cache & Router SPA
 */

(function() {
    'use strict';

    // Pastikan App global tersedia
    if (typeof App === 'undefined' || typeof App.register !== 'function') {
        console.error('[sekretaris_absensi] App.register tidak ditemukan. Pastikan app.js dimuat sebelum file ini.');
        return;
    }

    App.register('sekretaris_absensi', function() {
        // 1. AUTH & GUARD
        var user = (typeof window.checkAuth === 'function') ? window.checkAuth() : null;
        if (!user || user.role !== 'sekretaris') {
            if (typeof router !== 'undefined' && router.load) router.load('/auth');
            return;
        }

        var kalurahan = String(user.kalurahan || '').trim();
        if (!kalurahan) {
            if (typeof window.showToast === 'function') {
                window.showToast('Akun sekretaris belum punya kalurahan valid.', 'error', 5000);
            }
            if (typeof router !== 'undefined' && router.load) router.load('/sekretaris_dashboard');
            return;
        }

        if (window.__sekretarisAbsensiLoaded) {
            console.log('[sekretaris_absensi] Already loaded, skip.');
            return;
        }
        window.__sekretarisAbsensiLoaded = true;

        console.log('[sekretaris_absensi] 🚀 Init v2.3.0 — Ranting: ' + kalurahan);

        // ================================================================
        // 2. HELPERS
        // ================================================================
        function escapeHtml(s) { 
            if (s === null || s === undefined) return ''; 
            var div = document.createElement('div'); 
            div.textContent = String(s); 
            return div.innerHTML; 
        }
        function escapeAttr(s) { 
            return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); 
        }
        function formatDateTime(d) {
            if (!d) return '-';
            var date = new Date(d); 
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        }
        function todayISO() { 
            return new Date().toISOString().slice(0, 10); 
        }
        function safeToast(msg, type, dur) { 
            if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', dur || 3000); 
        }
        function debounced(key, fn, delay) {
            delay = delay || 250;
            if (!window._skDebounceTimers) window._skDebounceTimers = {};
            if (window._skDebounceTimers[key]) clearTimeout(window._skDebounceTimers[key]);
            window._skDebounceTimers[key] = setTimeout(function() { 
                delete window._skDebounceTimers[key]; 
                try { fn(); } catch (e) { console.error(e); } 
            }, delay);
        }

        // ================================================================
        // 3. DOM CACHE
        // ================================================================
        var el = {
            get tableBody()         { return document.getElementById('sk-table-body'); },
            get statsTotal()        { return document.getElementById('sk-stat-total'); },
            get statsToday()        { return document.getElementById('sk-stat-today'); },
            get statsMonth()        { return document.getElementById('sk-stat-month'); },
            get statsUnique()       { return document.getElementById('sk-stat-unique'); },
            get qrStatusText()      { return document.getElementById('sk-qr-status-text'); },
            get qrTokenText()       { return document.getElementById('sk-qr-token-text'); },
            get qrDisplay()         { return document.getElementById('sk-qr-display'); },
            get qrToggleBtn()       { return document.getElementById('sk-qr-toggle-btn'); },
            get qrRegenBtn()        { return document.getElementById('sk-qr-regenerate-btn'); },
            get downloadQrBtn()     { return document.getElementById('sk-download-qr-btn'); },
            get filterDate()        { return document.getElementById('sk-filter-date'); },
            get searchInput()       { return document.getElementById('sk-search'); },
            get dateFrom()          { return document.getElementById('sk-date-from'); },
            get dateTo()            { return document.getElementById('sk-date-to'); },
            get clearFilter()       { return document.getElementById('sk-clear-filter'); },
            get refreshBtn()        { return document.getElementById('sk-refresh-btn'); },
            get loadMoreWrap()      { return document.getElementById('sk-load-more-wrap'); },
            get loadMoreBtn()       { return document.getElementById('sk-load-more-btn'); },
            get loadMoreInfo()      { return document.getElementById('sk-load-more-info'); },
            // Export Dropdown
            get exportBtn()         { return document.getElementById('sk-export-btn'); },
            get exportDropdown()    { return document.getElementById('sk-export-dropdown'); },
            get exportDropdownWrap(){ return document.getElementById('sk-export-dropdown-wrap'); },
            get exportCsvBtn()      { return document.getElementById('sk-export-csv'); },
            get exportPdfBtn()      { return document.getElementById('sk-export-pdf'); },
            get exportImgBtn()      { return document.getElementById('sk-export-img'); }
        };

        // Set Nama Ranting di Header
        ['sk-ranting-name', 'sk-ranting-name-2', 'sk-ranting-name-3', 'sk-ranting-name-4'].forEach(function(id) {
            var node = document.getElementById(id); 
            if (node) node.textContent = kalurahan;
        });

        if (!el.tableBody) {
            console.error('[sekretaris_absensi] Tabel body tidak ditemukan. Abort.');
            window.__sekretarisAbsensiLoaded = false;
            return;
        }

        // ================================================================
        // 4. STATE
        // ================================================================
        var dataCache = [];
        var filteredCache = [];
        var currentFilter = { search: '', dateFrom: '', dateTo: '' };
        var currentQrStatus = 'inactive';
        var currentQrToken = '';
        var visibleCount = 20;
        var isSubmitting = false;

        // ================================================================
        // 5. LOAD STATS
        // ================================================================
        function loadStats(force) {
            var action = 'getAbsensiStatsSekretaris';
            var req = force ? window.forceRefreshData(action, { userId: user.id }) : window.apiCall(action, 'POST', { userId: user.id });
            
            return req.then(function(res) {
                if (res && res.success && res.data) {
                    var d = res.data;
                    if (el.statsTotal)  el.statsTotal.textContent  = String(d.total || 0);
                    if (el.statsToday)  el.statsToday.textContent  = String(d.hariIni || 0);
                    if (el.statsMonth)  el.statsMonth.textContent  = String(d.bulanIni || 0);
                    if (el.statsUnique) el.statsUnique.textContent = String(d.uniqueAnggota || 0);
                }
            }).catch(function(e) { 
                console.warn('[sekretaris_absensi] loadStats error:', e.message); 
            });
        }

        // ================================================================
        // 6. LOAD & RENDER TABEL
        // ================================================================
        function loadAbsensi(force) {
            force = force || false;
            
            if (dataCache.length > 0 && !force) { 
                applyFilter(); 
                return Promise.resolve(); 
            }
            
            el.tableBody.innerHTML = '<tr><td colspan="6" class="sk-td-loading"><i class="fas fa-spinner fa-spin sk-loading-spinner"></i><p>Memuat data...</p></td></tr>';

            var action = 'getAbsensiSekretaris';
            var req = force ? window.forceRefreshData(action, { userId: user.id }) : window.apiCall(action, 'POST', { userId: user.id });

            return req.then(function(res) {
                if (res && res.success && res.data && Array.isArray(res.data.data)) {
                    dataCache = res.data.data;
                    applyFilter();
                } else if (res && res.success) {
                    dataCache = []; 
                    filteredCache = []; 
                    renderTable([]);
                } else {
                    el.tableBody.innerHTML = `<tr><td colspan="6" class="sk-td-empty" style="color:#dc2626;">${escapeHtml((res && res.message) || 'Gagal memuat data')}</td></tr>`;
                }
            }).catch(function(e) {
                el.tableBody.innerHTML = `<tr><td colspan="6" class="sk-td-empty" style="color:#dc2626;">Error: ${escapeHtml(e.message)}</td></tr>`;
            });
        }

        function applyFilter() {
            filteredCache = dataCache.filter(function(item) {
                if (currentFilter.dateFrom || currentFilter.dateTo) {
                    var d = new Date(item.created_at); 
                    if (isNaN(d.getTime())) return false;
                    if (currentFilter.dateFrom) { 
                        var from = new Date(currentFilter.dateFrom); 
                        from.setHours(0,0,0,0); 
                        if (d < from) return false; 
                    }
                    if (currentFilter.dateTo) { 
                        var to = new Date(currentFilter.dateTo); 
                        to.setHours(23,59,59,999); 
                        if (d > to) return false; 
                    }
                }
                if (currentFilter.search) {
                    var q = currentFilter.search;
                    var hay = [item.nama, item.alamat].map(function(v){return String(v||'').toLowerCase();}).join(' ');
                    if (hay.indexOf(q) === -1) return false;
                }
                return true;
            });
            filteredCache.sort(function(a, b) { 
                return new Date(b.created_at||0) - new Date(a.created_at||0); 
            });
            renderTable(filteredCache);
        }

        function renderTable(data) {
            if (!data || data.length === 0) {
                var isFiltered = currentFilter.search || currentFilter.dateFrom || currentFilter.dateTo;
                el.tableBody.innerHTML = `<tr><td colspan="6" class="sk-td-empty"><i class="fas fa-${isFiltered?'search':'clipboard-check'}"></i><p>${isFiltered?'Tidak ada hasil':'Belum ada data absensi'}</p></td></tr>`;
                if (el.loadMoreWrap) el.loadMoreWrap.classList.add('hidden');
                return;
            }

            var toShow = data.slice(0, visibleCount);
            var hasMore = data.length > visibleCount;
            var html = '';
            
            toShow.forEach(function(item, idx) {
                var dateStr = formatDateTime(item.created_at);
                var ttdHtml = item.ttd 
                    ? `<img src="${escapeAttr(item.ttd)}" alt="TTD" class="sk-ttd-img" onclick="skPreviewTtd('${escapeAttr(item.id)}')" loading="lazy" onerror="this.style.display='none';" />` 
                    : '<span class="sk-ttd-none">-</span>';
                
                html += `
                    <tr>
                        <td class="sk-td-num">${idx + 1}</td>
                        <td class="sk-td-name">${escapeHtml(item.nama || '-')}</td>
                        <td class="sk-td-muted">${escapeHtml(item.alamat || '-')}</td>
                        <td class="sk-td-muted" style="white-space:nowrap;">${escapeHtml(dateStr)}</td>
                        <td class="sk-td-center">${ttdHtml}</td>
                        <td class="sk-td-center" style="white-space:nowrap;">
                            <button onclick="skEditAbsensi('${escapeAttr(item.id)}')" class="sk-action-btn sk-action-edit" title="Edit"><i class="fas fa-edit"></i></button>
                            <button onclick="skDeleteAbsensi('${escapeAttr(item.id)}')" class="sk-action-btn sk-action-delete" title="Hapus"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`;
            });
            el.tableBody.innerHTML = html;

            if (el.loadMoreWrap) {
                if (hasMore) {
                    el.loadMoreWrap.classList.remove('hidden');
                    if (el.loadMoreInfo) el.loadMoreInfo.textContent = `Menampilkan ${toShow.length} dari ${data.length} data`;
                } else {
                    el.loadMoreWrap.classList.add('hidden');
                }
            }
        }

        // ================================================================
        // 7. GLOBAL ACTIONS (CRUD)
        // ================================================================
        window.skPreviewTtd = function(id) {
            var item = dataCache.find(function(a) { return String(a.id) === String(id); });
            if (!item || !item.ttd) return;
            
            var lb = document.getElementById('sk-ttd-lightbox');
            if (!lb) {
                lb = document.createElement('div');
                lb.id = 'sk-ttd-lightbox';
                lb.className = 'fixed inset-0 bg-black/90 hidden items-center justify-center z-[10000] p-4';
                lb.innerHTML = `
                    <button id="sk-ttd-close" class="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl"><i class="fas fa-times"></i></button>
                    <div class="bg-white rounded-lg p-6 max-w-2xl w-full">
                        <h3 class="text-lg font-bold mb-4 text-gray-800" id="sk-ttd-title">TTD</h3>
                        <img id="sk-ttd-img" src="" class="w-full h-auto max-h-[60vh] object-contain rounded-lg">
                        <p class="text-sm text-gray-600 mt-3" id="sk-ttd-info"></p>
                    </div>`;
                document.body.appendChild(lb);
                var close = function() { 
                    lb.classList.add('hidden'); 
                    lb.classList.remove('flex'); 
                    document.body.style.overflow = ''; 
                };
                lb.querySelector('#sk-ttd-close').onclick = close;
                lb.onclick = function(e) { if (e.target === lb) close(); };
            }
            lb.querySelector('#sk-ttd-img').src = item.ttd;
            lb.querySelector('#sk-ttd-title').textContent = 'TTD: ' + (item.nama || '-');
            lb.querySelector('#sk-ttd-info').innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(item.alamat || '-')} &middot; <i class="far fa-clock ml-2 mr-1"></i>${escapeHtml(formatDateTime(item.created_at))}`;
            lb.classList.remove('hidden'); 
            lb.classList.add('flex'); 
            document.body.style.overflow = 'hidden';
        };

        window.skEditAbsensi = function(id) {
            var item = dataCache.find(function(a) { return String(a.id) === String(id); });
            if (!item) return;
            
            var modal = document.getElementById('sk-edit-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'sk-edit-modal';
                modal.className = 'fixed inset-0 bg-black/70 hidden items-center justify-center z-[9999] p-4';
                modal.innerHTML = `
                    <div class="bg-[var(--sk-card-bg)] rounded-2xl shadow-2xl w-full max-w-lg p-6 relative">
                        <button id="sk-edit-close" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-[var(--sk-bg-stats)] text-[var(--sk-text-main)] flex items-center justify-center hover:bg-[var(--sk-card-border)] transition"><i class="fas fa-times"></i></button>
                        <h3 class="text-lg font-bold text-[var(--sk-text-main)] mb-1"><i class="fas fa-edit mr-2 text-amber-600"></i>Edit Absensi</h3>
                        <div class="mb-3 mt-4"><label class="block text-sm font-medium mb-1 text-[var(--sk-text-main)]">Nama</label><input type="text" id="sk-edit-nama" class="w-full px-3 py-2 border border-[var(--sk-card-border)] rounded-lg bg-[var(--sk-bg-body)] text-[var(--sk-text-main)] focus:outline-none focus:border-[var(--sk-brand-700)]"></div>
                        <div class="mb-3"><label class="block text-sm font-medium mb-1 text-[var(--sk-text-main)]">Alamat</label><textarea id="sk-edit-alamat" rows="2" class="w-full px-3 py-2 border border-[var(--sk-card-border)] rounded-lg bg-[var(--sk-bg-body)] text-[var(--sk-text-main)] focus:outline-none focus:border-[var(--sk-brand-700)] resize-none"></textarea></div>
                        <div class="flex gap-2 justify-end mt-4">
                            <button id="sk-edit-cancel" class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-300 transition">Batal</button>
                            <button id="sk-edit-save" class="sk-btn sk-btn-primary px-4 py-2 rounded-lg flex items-center gap-2"><i class="fas fa-save"></i><span>Simpan</span></button>
                        </div>
                    </div>`;
                document.body.appendChild(modal);
                
                var close = function() { 
                    modal.classList.add('hidden'); 
                    modal.classList.remove('flex'); 
                    document.body.style.overflow = ''; 
                };
                modal.querySelector('#sk-edit-close').onclick = close;
                modal.querySelector('#sk-edit-cancel').onclick = close;
                modal.querySelector('#sk-edit-save').onclick = function() { saveEdit(modal, close); };
            }
            
            modal.querySelector('#sk-edit-nama').value = item.nama || '';
            modal.querySelector('#sk-edit-alamat').value = item.alamat || '';
            modal.dataset.editId = String(id);
            modal.classList.remove('hidden'); 
            modal.classList.add('flex'); 
            document.body.style.overflow = 'hidden';
            setTimeout(function() { modal.querySelector('#sk-edit-nama').focus(); }, 100);
        };

        function saveEdit(modal, closeFn) {
            var id = modal.dataset.editId;
            var nama = modal.querySelector('#sk-edit-nama').value.trim();
            var alamat = modal.querySelector('#sk-edit-alamat').value.trim();
            
            if (nama.length < 3) { safeToast('Nama minimal 3 karakter', 'warning'); return; }
            if (!alamat) { safeToast('Alamat wajib diisi', 'warning'); return; }
            
            var btn = modal.querySelector('#sk-edit-save');
            var orig = btn.innerHTML;
            btn.disabled = true; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
            
            window.apiCall('updateAbsensi', 'POST', { id: id, nama: nama, alamat: alamat, userId: user.id })
            .then(function(res) {
                if (res && res.success) {
                    var idx = dataCache.findIndex(function(a) { return String(a.id) === String(id); });
                    if (idx !== -1) { dataCache[idx].nama = nama; dataCache[idx].alamat = alamat; }
                    applyFilter(); 
                    loadStats(false); 
                    closeFn(); 
                    safeToast('Data berhasil diperbarui', 'success');
                } else { 
                    safeToast((res && res.message) || 'Gagal menyimpan', 'error'); 
                }
            }).catch(function(e) { 
                safeToast(e.message, 'error'); 
            }).finally(function() { 
                btn.disabled = false; 
                btn.innerHTML = orig; 
            });
        }

        window.skDeleteAbsensi = function(id) {
            var item = dataCache.find(function(a) { return String(a.id) === String(id); });
            var nama = item ? item.nama : 'ini';
            
            var doDelete = function() {
                window.apiCall('deleteAbsensi', 'POST', { id: id, userId: user.id })
                .then(function(res) {
                    if (res && res.success) {
                        dataCache = dataCache.filter(function(a) { return String(a.id) !== String(id); });
                        applyFilter(); 
                        loadStats(false); 
                        safeToast('Data berhasil dihapus', 'success');
                    } else { 
                        safeToast((res && res.message) || 'Gagal menghapus', 'error'); 
                    }
                }).catch(function(e) { 
                    safeToast(e.message, 'error'); 
                });
            };

            if (typeof window.showConfirm === 'function') {
                window.showConfirm(`Hapus data absensi "${nama}"?`, doDelete);
            } else if (confirm(`Hapus data absensi "${nama}"?`)) {
                doDelete();
            }
        };

        // ================================================================
        // 8. EXPORT FUNCTIONS
        // ================================================================
        function exportCSV() {
            if (filteredCache.length === 0) return safeToast('Tidak ada data untuk diekspor', 'warning');
            var headers = ['No', 'Nama', 'Alamat', 'Waktu', 'TTD'];
            var rows = filteredCache.map(function(item, idx) { 
                return [idx+1, item.nama||'', item.alamat||'', formatDateTime(item.created_at), item.ttd?'Ada':'-']; 
            });
            var csvContent = [headers].concat(rows).map(function(row) { 
                return row.map(function(c){ return '"'+String(c||'').replace(/"/g,'""')+'"'; }).join(','); 
            }).join('\n');
            var blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            var link = document.createElement('a'); 
            link.href = URL.createObjectURL(blob); 
            link.download = `absensi_${kalurahan}_${todayISO()}.csv`;
            document.body.appendChild(link); 
            link.click(); 
            document.body.removeChild(link); 
            safeToast('CSV berhasil diunduh', 'success');
        }

        function buildExportCanvas() {
            return new Promise(function(resolve, reject) {
                if (typeof html2canvas === 'undefined') return reject(new Error('Library html2canvas tidak tersedia'));
                var wrap = document.createElement('div');
                wrap.style.cssText = 'position:fixed;left:-99999px;top:0;padding:32px 28px;background:#ffffff;width:1000px;font-family:"Inter",system-ui,sans-serif;color:#0f2922;';
                var logoUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') + 'logo-ansor.webp';
                
                var html = `
                <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
                    <tr>
                        <td style="width:100px;vertical-align:middle;"><img src="${logoUrl}" style="width:88px;height:88px;object-fit:contain;" crossorigin="anonymous"></td>
                        <td style="vertical-align:middle;padding-left:16px;text-align:right;">
                            <div style="font-family:'Amiri',serif;font-size:22px;font-weight:800;color:#0f2922;">Pimpinan Anak Cabang Gerakan Pemuda Ansor</div>
                            <div style="font-family:'Amiri',serif;font-size:19px;font-weight:700;color:#0f2922;margin:2px 0 6px;">Kapanewon Sewon</div>
                            <div style="font-size:12px;color:#475569;">Ranting: ${escapeHtml(kalurahan)}</div>
                        </td>
                    </tr>
                </table>
                <div style="height:3px;background:linear-gradient(90deg,#0f2922 0%,#0f2922 68%,#f59e0b 100%);margin-bottom:20px;"></div>
                <div style="text-align:center;margin-bottom:18px;">
                    <h2 style="margin:0;font-size:20px;font-weight:800;">LAPORAN ABSENSI RANTING ${escapeHtml(kalurahan.toUpperCase())}</h2>
                    <p style="margin:4px 0 0;font-size:11px;color:#64748b;">Diekspor: ${formatDateTime(new Date())}</p>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:11px;">
                    <thead><tr style="background:#0f2922;color:#ffffff;">
                        <th style="padding:9px;border:1px solid #1e4038;width:34px;">No</th>
                        <th style="padding:9px;border:1px solid #1e4038;text-align:left;">Nama</th>
                        <th style="padding:9px;border:1px solid #1e4038;text-align:left;">Alamat</th>
                        <th style="padding:9px;border:1px solid #1e4038;text-align:left;width:130px;">Waktu</th>
                        <th style="padding:9px;border:1px solid #1e4038;width:90px;">TTD</th>
                    </tr></thead><tbody>`;
                
                filteredCache.forEach(function(item, idx) {
                    var bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                    var ttdCell = item.ttd ? `<img src="${item.ttd}" style="width:80px;height:36px;object-fit:contain;" crossorigin="anonymous">` : '-';
                    html += `<tr style="background:${bg};"><td style="padding:6px;border:1px solid #cbd5e1;text-align:center;">${idx+1}</td><td style="padding:6px 8px;border:1px solid #cbd5e1;">${escapeHtml(item.nama)}</td><td style="padding:6px 8px;border:1px solid #cbd5e1;">${escapeHtml(item.alamat)}</td><td style="padding:6px 8px;border:1px solid #cbd5e1;">${formatDateTime(item.created_at)}</td><td style="padding:4px;border:1px solid #cbd5e1;text-align:center;">${ttdCell}</td></tr>`;
                });
                
                html += `</tbody></table><div style="margin-top:18px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;"><span>Total: <strong>${filteredCache.length}</strong> data</span><span>Sistem Absensi Digital PAC GP Ansor Sewon</span></div>`;
                
                wrap.innerHTML = html;
                document.body.appendChild(wrap);

                Promise.all(Array.from(wrap.querySelectorAll('img')).map(function(img) {
                    return new Promise(function(res) { if (img.complete) return res(); img.onload = res; img.onerror = res; setTimeout(res, 3000); });
                })).then(function() {
                    html2canvas(wrap, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
                    .then(function(canvas) { document.body.removeChild(wrap); resolve(canvas); })
                    .catch(function(err) { document.body.removeChild(wrap); reject(err); });
                });
            });
        }

        function exportPDF() {
            if (filteredCache.length === 0) return safeToast('Tidak ada data untuk diekspor', 'warning');
            if (!window.jspdf || !window.jspdf.jsPDF) return safeToast('Library PDF tidak tersedia', 'error');
            safeToast('Menyiapkan PDF...', 'info', 2000);
            buildExportCanvas().then(function(canvas) {
                var pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
                var imgData = canvas.toDataURL('image/jpeg', 0.92);
                var pdfW = pdf.internal.pageSize.getWidth(), pdfH = pdf.internal.pageSize.getHeight(), margin = 8;
                var imgH = (canvas.height * (pdfW - margin*2)) / canvas.width;
                var heightLeft = imgH, position = margin;
                pdf.addImage(imgData, 'JPEG', margin, position, pdfW - margin*2, imgH);
                heightLeft -= (pdfH - margin*2);
                while (heightLeft > 0) { position -= (pdfH - margin*2); pdf.addPage(); pdf.addImage(imgData, 'JPEG', margin, position, pdfW - margin*2, imgH); heightLeft -= (pdfH - margin*2); }
                pdf.save(`absensi_${kalurahan}_${todayISO()}.pdf`);
                safeToast('PDF berhasil diunduh', 'success');
            }).catch(function(err) { safeToast(err.message, 'error'); });
        }

        function exportImage() {
            if (filteredCache.length === 0) return safeToast('Tidak ada data untuk diekspor', 'warning');
            safeToast('Menyiapkan Gambar...', 'info', 2000);
            buildExportCanvas().then(function(canvas) {
                var link = document.createElement('a'); link.download = `absensi_${kalurahan}_${todayISO()}.png`; link.href = canvas.toDataURL('image/png');
                document.body.appendChild(link); link.click(); document.body.removeChild(link); safeToast('Gambar berhasil diunduh', 'success');
            }).catch(function(err) { safeToast(err.message, 'error'); });
        }

        // ================================================================
        // 9. BIND EVENTS
        // ================================================================
        function bindEvents() {
            if (el.searchInput) el.searchInput.addEventListener('input', function() { debounced('sk-search', function() { currentFilter.search = (el.searchInput.value||'').toLowerCase().trim(); visibleCount = 20; applyFilter(); }, 250); });
            if (el.dateFrom) el.dateFrom.addEventListener('change', function() { currentFilter.dateFrom = this.value; visibleCount = 20; applyFilter(); });
            if (el.dateTo) el.dateTo.addEventListener('change', function() { currentFilter.dateTo = this.value; visibleCount = 20; applyFilter(); });
            if (el.filterDate) el.filterDate.addEventListener('change', function() { var v = this.value; if (el.dateFrom) el.dateFrom.value = v; if (el.dateTo) el.dateTo.value = v; currentFilter.dateFrom = v; currentFilter.dateTo = v; visibleCount = 20; applyFilter(); });
            if (el.clearFilter) el.clearFilter.addEventListener('click', function() { currentFilter = { search: '', dateFrom: '', dateTo: '' }; if (el.searchInput) el.searchInput.value = ''; if (el.dateFrom) el.dateFrom.value = ''; if (el.dateTo) el.dateTo.value = ''; if (el.filterDate) el.filterDate.value = ''; visibleCount = 20; applyFilter(); });
            if (el.loadMoreBtn) el.loadMoreBtn.addEventListener('click', function() { visibleCount += 20; renderTable(filteredCache); });
            
            if (el.refreshBtn) el.refreshBtn.addEventListener('click', function() { 
                var orig = this.innerHTML; 
                this.disabled = true; 
                this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span class="sk-btn-label">...</span>'; 
                dataCache = []; 
                Promise.all([loadAbsensi(true), loadStats(true), loadQrStatus(true)]).finally(function(){ 
                    el.refreshBtn.disabled = false; 
                    el.refreshBtn.innerHTML = orig; 
                    safeToast('✅ Data berhasil diperbarui', 'success');
                }); 
            });
            
            if (el.exportBtn && el.exportDropdown) {
                el.exportBtn.addEventListener('click', function(e) { e.stopPropagation(); el.exportDropdown.classList.toggle('hidden'); el.exportDropdownWrap.classList.toggle('open'); });
                document.addEventListener('click', function(e) { if (el.exportDropdownWrap && !el.exportDropdownWrap.contains(e.target)) { el.exportDropdown.classList.add('hidden'); el.exportDropdownWrap.classList.remove('open'); } });
                if (el.exportCsvBtn) el.exportCsvBtn.addEventListener('click', function(){ exportCSV(); el.exportDropdown.classList.add('hidden'); el.exportDropdownWrap.classList.remove('open'); });
                if (el.exportPdfBtn) el.exportPdfBtn.addEventListener('click', function(){ exportPDF(); el.exportDropdown.classList.add('hidden'); el.exportDropdownWrap.classList.remove('open'); });
                if (el.exportImgBtn) el.exportImgBtn.addEventListener('click', function(){ exportImage(); el.exportDropdown.classList.add('hidden'); el.exportDropdownWrap.classList.remove('open'); });
            }
        }

        // ================================================================
        // 10. QR MANAGEMENT
        // ================================================================
        function loadQrStatus(force) {
            var action = 'getQrConfigSekretaris';
            var req = force ? window.forceRefreshData(action, { userId: user.id }) : window.apiCall(action, 'POST', { userId: user.id });
            
            return req.then(function(res) {
                if (res && res.success && res.data) { 
                    currentQrStatus = res.data.status || 'inactive'; 
                    currentQrToken = res.data.token || ''; 
                } else { 
                    currentQrStatus = 'inactive'; 
                    currentQrToken = ''; 
                }
                updateQrUI();
            }).catch(function() { updateQrUI(); });
        }

        function updateQrUI() {
            if (el.qrStatusText) {
                el.qrStatusText.textContent = 'Status: ' + (currentQrStatus === 'active' ? 'Aktif' : 'Nonaktif');
                el.qrStatusText.className = 'sk-qr-status ' + (currentQrStatus === 'active' ? 'is-active' : 'is-inactive');
            }
            if (el.qrTokenText) el.qrTokenText.textContent = currentQrToken ? 'Token: ' + currentQrToken.slice(0,16) + '...' : 'Token: -';
            if (el.qrToggleBtn) {
                if (currentQrStatus === 'active') { 
                    el.qrToggleBtn.innerHTML = '<i class="fas fa-power-off"></i><span>Tutup QR</span>'; 
                    el.qrToggleBtn.style.background = 'linear-gradient(135deg,#dc2626,#b91c1c)'; 
                }
                else { 
                    el.qrToggleBtn.innerHTML = '<i class="fas fa-power-off"></i><span>Aktifkan QR</span>'; 
                    el.qrToggleBtn.style.background = ''; 
                }
            }
            if (el.qrRegenBtn) el.qrRegenBtn.disabled = currentQrStatus !== 'active';
            if (el.downloadQrBtn) el.downloadQrBtn.disabled = currentQrStatus !== 'active';
            
            if (currentQrStatus === 'active') generateQrPreview();
            else if (el.qrDisplay) el.qrDisplay.innerHTML = '<i class="fas fa-lock" style="font-size:1.5rem;color:#94a3b8;"></i><p style="font-size:.72rem;color:#94a3b8;margin:4px 0 0;">QR Nonaktif</p>';
        }

        function generateQrPreview() {
            if (!el.qrDisplay) return;
            el.qrDisplay.innerHTML = '';
            if (typeof QRCode === 'undefined' || !currentQrToken) { 
                el.qrDisplay.innerHTML = '<p style="color:#dc2626;font-size:.7rem;">QR tidak tersedia</p>'; 
                return; 
            }
            var qrUrl = window.location.origin + window.location.pathname + '#/absensi?token=' + encodeURIComponent(currentQrToken) + '&ranting=' + encodeURIComponent(kalurahan);
            var qrDiv = document.createElement('div'); 
            qrDiv.style.cssText = 'width:180px;height:180px;'; 
            el.qrDisplay.appendChild(qrDiv);
            try { 
                new QRCode(qrDiv, { text: qrUrl, width: 180, height: 180, colorDark: '#0f2922', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H }); 
            } catch(e) { 
                el.qrDisplay.innerHTML = '<p style="color:#dc2626;font-size:.7rem;">Error generate QR</p>'; 
            }
        }

        // ================================================================
        // 11. INIT
        // ================================================================
        bindEvents();
        
        if (el.tableBody) el.tableBody.innerHTML = '<tr><td colspan="6" class="sk-td-loading"><i class="fas fa-spinner fa-spin sk-loading-spinner"></i><p class="sk-loading-text">Memuat data...</p></td></tr>';

        Promise.all([loadAbsensi(false), loadStats(false), loadQrStatus(false)]).then(function() {
            console.log('[sekretaris_absensi] ✅ Init complete v2.3.0');
        });
        
        window.__sekretarisAbsensiCleanup = function() {
            window.__sekretarisAbsensiLoaded = false;
            console.log('[sekretaris_absensi] Cleanup');
        };
    });

})();