/**
 * js/kegiatan_detail.js
 * Modul Halaman Detail Kegiatan Publik - FULL FIX v10.0.0 (FINAL)
 */

App.register('kegiatan_detail', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__kegiatanDetailLoaded) return;
    window.__kegiatanDetailLoaded = true;

    // ===== GET ID =====
    let kegiatanId = '';
    if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
        kegiatanId = window.__currentQuery.get('id') || '';
    }
    if (!kegiatanId) {
        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx !== -1) {
            try {
                const params = new URLSearchParams(hash.substring(qIdx));
                kegiatanId = params.get('id') || '';
            } catch (e) {}
        }
    }
    if (!kegiatanId) {
        kegiatanId = new URLSearchParams(window.location.search).get('id') || '';
    }

    // ===== DOM =====
    const detailMain    = document.getElementById('detail-main');
    const breadcrumbTitle = document.getElementById('breadcrumb-title');
    const recentList    = document.getElementById('recent-list');
    const archiveList   = document.getElementById('archive-list');

    if (!detailMain) { console.error('[kegiatan_detail] Elemen tidak ditemukan.'); return; }

    if (!kegiatanId) {
        detailMain.innerHTML = '<div class="text-center py-8 text-red-500">' +
            '<i class="fas fa-exclamation-triangle text-4xl mb-3"></i>' +
            '<p>ID Kegiatan tidak ditemukan.</p>' +
            '<a href="/kegiatan" class="btn-primary mt-4 inline-block px-6 py-2 rounded-lg">Kembali ke Kegiatan</a>' +
            '</div>';
        return;
    }

    // ===== HELPERS =====
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
            day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    function formatDateLong(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function formatRupiah(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function getFirstImageFromContent(html) {
        if (!html) return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const img = doc.querySelector('img');
            return img ? (img.getAttribute('src') || '') : '';
        } catch (e) { return ''; }
    }

    // ===== LOAD =====
    async function loadDetail() {
        try {
            const result = await apiCall('getLogbook', 'POST', {});

            if (!result || !result.success) throw new Error((result && result.message) || 'Gagal memuat');

            const allData = result.data || [];
            const item = allData.find(l => l.id === kegiatanId);

            if (!item) {
                detailMain.innerHTML = `
                    <div class="text-center py-8 text-red-500">
                        <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
                        <p>Kegiatan tidak ditemukan.</p>
                        <a href="/kegiatan" class="btn-primary mt-4 inline-block px-6 py-2 rounded-lg">Kembali</a>
                    </div>
                `;
                return;
            }

            renderDetail(item);
            renderSidebar(allData);
        } catch (error) {
            console.error('[kegiatan_detail] Load error:', error);
            detailMain.innerHTML = `
                <div class="text-center py-8 text-red-500">
                    <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
                    <p>Error: ${escapeHtml(error.message)}</p>
                    <a href="/kegiatan" class="btn-primary mt-4 inline-block px-6 py-2 rounded-lg">Kembali</a>
                </div>
            `;
        }
    }

    // ===== RENDER DETAIL =====
    function renderDetail(item) {
        const imgUrl = item.file_url || getFirstImageFromContent(item.deskripsi) ||
            'https://placehold.co/1200x600/e2e8f0/475569?text=Kegiatan+Ansor';

        if (breadcrumbTitle) breadcrumbTitle.textContent = item.kegiatan || 'Kegiatan';

        const anggaranBlock = (item.anggaran && Number(item.anggaran) > 0) ? `
            <div class="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-800 dark:text-green-300 flex items-center gap-3">
                <i class="fas fa-coins text-xl"></i>
                <div>
                    <span class="block text-sm font-medium">Anggaran Kegiatan</span>
                    <span class="font-bold text-lg">${formatRupiah(item.anggaran)}</span>
                </div>
            </div>
        ` : '';

        detailMain.innerHTML = `
            <h1 class="text-2xl md:text-3xl font-bold text-[var(--text-main)] font-amiri mb-4">
                ${escapeHtml(item.kegiatan || 'Kegiatan')}
            </h1>

            <div class="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)] mb-6 border-b border-[var(--card-border)] pb-4">
                <span><i class="far fa-calendar-alt mr-1 text-[var(--text-main)]"></i>
                    ${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)}</span>
                <span class="hidden sm:inline text-[var(--card-border)]">|</span>
                <span><i class="fas fa-map-marker-alt mr-1 text-[var(--text-main)]"></i>
                    ${escapeHtml(item.tempat || '-')}</span>
                <span class="hidden sm:inline text-[var(--card-border)]">|</span>
                <span><i class="fas fa-users mr-1 text-[var(--text-main)]"></i>
                    ${item.peserta || 0} Peserta</span>
            </div>

            <div class="detail-image-wrapper mb-6 max-h-[400px] overflow-hidden rounded-2xl">
                <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(item.kegiatan)}"
                    class="w-full h-full object-cover"
                    loading="lazy" decoding="async"
                    onerror="this.src='https://placehold.co/1200x600/e2e8f0/475569?text=Kegiatan+Ansor'">
            </div>

            <div class="prose max-w-none text-[var(--text-muted)] leading-relaxed">
                ${item.deskripsi || '<p class="text-[var(--text-muted)] italic">Belum ada deskripsi untuk kegiatan ini.</p>'}
            </div>

            ${anggaranBlock}
        `;
    }

    // ===== RENDER SIDEBAR =====
    function renderSidebar(allData) {
        // Recent (3 terbaru)
        if (recentList) {
            const sorted = allData.slice().sort((a, b) =>
                new Date(b.tanggal_mulai || 0) - new Date(a.tanggal_mulai || 0));
            const recent = sorted.slice(0, 3);

            if (recent.length > 0) {
                recentList.innerHTML = recent.map(r => {
                    const thumb = r.file_url || getFirstImageFromContent(r.deskripsi) ||
                        'https://placehold.co/100x80/e2e8f0/475569?text=Img';
                    return `
                        <a href="/kegiatan_detail?id=${encodeURIComponent(r.id)}"
                           class="block sidebar-item rounded-lg p-2 transition hover:bg-[var(--bg-stats)]">
                            <div class="flex items-start gap-3">
                                <div class="w-16 h-12 rounded-lg bg-[var(--bg-stats)] overflow-hidden flex-shrink-0 border border-[var(--card-border)]">
                                    <img src="${escapeAttr(thumb)}" class="w-full h-full object-cover" loading="lazy"
                                        onerror="this.src='https://placehold.co/100x80/e2e8f0/475569?text=Img'">
                                </div>
                                <div class="min-w-0">
                                    <h4 class="text-sm font-medium text-[var(--text-main)] line-clamp-1">
                                        ${escapeHtml(r.kegiatan || 'Kegiatan')}
                                    </h4>
                                    <p class="text-xs text-[var(--text-muted)] mt-1">
                                        <i class="far fa-calendar-alt mr-1"></i>${formatDate(r.tanggal_mulai)}
                                    </p>
                                </div>
                            </div>
                        </a>
                    `;
                }).join('');
            } else {
                recentList.innerHTML = '<p class="text-sm text-[var(--text-muted)] text-center py-4">Belum ada data terbaru.</p>';
            }
        }

        // Archive (group by month)
        if (archiveList) {
            const monthMap = {};
            allData.forEach(item => {
                if (!item.tanggal_mulai) return;
                const date = new Date(item.tanggal_mulai);
                if (isNaN(date.getTime())) return;
                const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
                if (!monthMap[key]) {
                    monthMap[key] = {
                        label: date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
                        count: 0
                    };
                }
                monthMap[key].count++;
            });

            const sortedKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));

            if (sortedKeys.length > 0) {
                archiveList.innerHTML = sortedKeys.map(key => {
                    const data = monthMap[key];
                    return `
                        <div class="flex justify-between items-center py-2 border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--var-stats)] px-2 rounded transition">
                            <span class="text-[var(--text-main)] font-medium text-sm">${escapeHtml(data.label)}</span>
                            <span class="text-[var(--text-muted)] text-xs bg-[var(--bg-stats)] px-2 py-0.5 rounded-full">${data.count}</span>
                        </div>
                    `;
                }).join('');
            } else {
                archiveList.innerHTML = '<p class="text-sm text-[var(--text-muted)] text-center py-2">Belum ada arsip.</p>';
            }
        }
    }

    // ===== INIT =====
    console.log('[kegiatan_detail] Init dimulai, ID:', kegiatanId);
    loadDetail();
});