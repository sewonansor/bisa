/**
 * js/arsip.js
 * Modul Halaman Arsip Publik - FULL FIX v10.0.0 (FINAL)
 */

App.register('arsip', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__arsipLoaded) return;
    window.__arsipLoaded = true;

    // ===== DOM =====
    const skeleton  = document.getElementById('arsip-skeleton');
    const container = document.getElementById('arsip-list');
    if (!container) { console.error('[arsip] Container tidak ditemukan.'); return; }

    // ===== STATE =====
    let dataCache = [];
    let currentYear = 'all';

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
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function getJenisInfo(jenis) {
        const map = {
            pdf:   { icon: 'fa-file-pdf', label: 'PDF' },
            docx:  { icon: 'fa-file-word', label: 'DOCX' },
            xlsx:  { icon: 'fa-file-excel', label: 'XLSX' },
            img:   { icon: 'fa-image', label: 'Gambar' },
            video: { icon: 'fa-video', label: 'Video' },
            other: { icon: 'fa-file', label: 'File' }
        };
        return map[jenis] || map.other;
    }

    function getKategoriClass(kategori) {
        const map = {
            dokumen: 'category-tag-doc',
            laporan: 'category-tag-pdf',
            foto:    'category-tag-img',
            video:   'category-tag-video',
            lainnya: 'category-tag-other'
        };
        return map[kategori] || 'category-tag-other';
    }

    // ===== LOAD =====
    async function loadArsip() {
        if (skeleton) skeleton.classList.remove('hidden');
        container.classList.add('hidden');
        container.innerHTML = '';

        try {
            const result = await apiCall('getArsip', 'POST', {});

            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');

            if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                dataCache = result.data;
                renderArsip();
            } else if (result && result.success) {
                dataCache = [];
                container.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-folder-open text-4xl mb-3 opacity-40"></i>
                        <p>Belum ada arsip.</p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12 text-red-500">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <p>${escapeHtml((result && result.message) || 'Gagal memuat data')}</p>
                    </div>
                `;
            }
        } catch (error) {
            if (skeleton) skeleton.classList.add('hidden');
            container.classList.remove('hidden');
            console.error('[arsip] Load error:', error);
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Error: ${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    // ===== RENDER =====
    function renderArsip() {
        const filtered = currentYear === 'all'
            ? dataCache
            : dataCache.filter(a => String(a.tahun) === String(currentYear));

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                    <i class="fas fa-search text-4xl mb-3 opacity-40"></i>
                    <p>Tidak ada arsip untuk tahun ${escapeHtml(currentYear)}.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => {
            const info = getJenisInfo(item.jenis);
            const tagClass = getKategoriClass(item.kategori);

            return `
                <div class="light-card dark:dark-card p-6 archive-item" data-year="${escapeAttr(item.tahun || '')}">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-3xl text-blue-600 dark:text-purple-400">
                                <i class="fas ${info.icon}"></i>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-[var(--text-main)] dark:text-purple-200">
                                    ${escapeHtml(item.judul || '-')}
                                </h3>
                                <p class="text-sm text-[var(--text-muted)]">
                                    ${escapeHtml(item.tahun || '-')} • ${escapeHtml(info.label)}
                                </p>
                            </div>
                        </div>
                        <span class="category-tag ${tagClass}">${escapeHtml(item.kategori || 'Umum')}</span>
                    </div>
                    <p class="text-[var(--text-muted)] text-sm line-clamp-2 mb-3">
                        ${escapeHtml(item.deskripsi || '')}
                    </p>
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-[var(--text-muted)]">
                            <i class="far fa-calendar mr-1"></i>${formatDate(item.created_at)}
                        </span>
                        ${item.file_url ? `
                            <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                               class="btn-secondary text-sm px-3 py-1">
                                <i class="fas fa-download mr-1"></i>Download
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== FILTER =====
    function attachFilterListeners() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);

            clone.addEventListener('click', function() {
                // Reset semua
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-green-600', 'text-white');
                    b.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
                });
                // Set active
                this.classList.remove('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
                this.classList.add('bg-green-600', 'text-white');

                currentYear = this.getAttribute('data-year') || 'all';
                renderArsip();
            });
        });
    }

    // ===== INIT =====
    console.log('[arsip] Init dimulai');
    attachFilterListeners();
    loadArsip();
});