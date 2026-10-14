/**
 * js/dokumen.js
 * Modul Halaman Dokumen Publik - FULL FIX v10.0.0 (FINAL)
 */

App.register('dokumen', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__dokumenLoaded) return;
    window.__dokumenLoaded = true;

    // ===== DOM =====
    const skeleton = document.getElementById('dokumen-skeleton');
    const content  = document.getElementById('dokumen-content');
    if (!content) { console.error('[dokumen] Container tidak ditemukan.'); return; }

    // ===== STATE =====
    let dataCache = [];
    let searchQuery = '';
    let currentKategori = 'all';

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

    function getBadgeColor(kategori) {
        const map = {
            dokumen: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
            laporan: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
            foto:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
            video:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
            lainnya: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        };
        return map[kategori] || map.lainnya;
    }

    // ===== ENSURE EXTRA UI =====
    function ensureExtraUI() {
        const wrapper = content.closest('section') || content.parentElement;
        if (!wrapper) return;

        if (!document.getElementById('dokumen-stats')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'dokumen-stats';
            statsDiv.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-6';
            statsDiv.innerHTML = `
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Dokumen</p>
                    <p class="text-2xl font-bold text-[var(--text-main)] mt-1" id="stats-total-dokumen">0</p>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Laporan</p>
                    <p class="text-2xl font-bold text-green-600 mt-1" id="stats-laporan-dokumen">0</p>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">PDF</p>
                    <p class="text-2xl font-bold text-red-600 mt-1" id="stats-pdf-dokumen">0</p>
                </div>
                <div class="stat-card p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]">
                    <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Tahun Ini</p>
                    <p class="text-2xl font-bold text-blue-600 mt-1" id="stats-tahun-dokumen">0</p>
                </div>
            `;
            wrapper.insertBefore(statsDiv, content);
        }

        if (!document.getElementById('dokumen-search-wrap')) {
            const searchWrap = document.createElement('div');
            searchWrap.id = 'dokumen-search-wrap';
            searchWrap.className = 'flex flex-wrap gap-2 max-w-5xl mx-auto mb-6';
            searchWrap.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="dokumen-search" placeholder="Cari judul, deskripsi..."
                        class="w-full pl-9 pr-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)]">
                </div>
                <select id="dokumen-filter-kategori" class="px-3 py-2.5 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] backdrop-blur-sm text-[var(--text-main)] text-sm">
                    <option value="all">Semua Kategori</option>
                    <option value="dokumen">Dokumen</option>
                    <option value="laporan">Laporan</option>
                    <option value="foto">Foto</option>
                    <option value="video">Video</option>
                    <option value="lainnya">Lainnya</option>
                </select>
            `;

            const statsDiv = document.getElementById('dokumen-stats');
            if (statsDiv && statsDiv.parentNode) {
                statsDiv.parentNode.insertBefore(searchWrap, statsDiv.nextSibling);
            }

            const searchInput = document.getElementById('dokumen-search');
            const filterSelect = document.getElementById('dokumen-filter-kategori');

            if (searchInput) {
                searchInput.addEventListener('input', debounceEvent.bind(null, 'dokumen-search', () => {
                    searchQuery = (searchInput.value || '').toLowerCase().trim();
                    applyFilter();
                }, 250));
            }
            if (filterSelect) {
                filterSelect.addEventListener('change', function() {
                    currentKategori = this.value;
                    applyFilter();
                });
            }
        }
    }

    // ===== LOAD =====
    async function loadDokumen() {
        if (skeleton) skeleton.classList.remove('hidden');
        content.classList.add('hidden');

        try {
            const result = await apiCall('getArsip', 'POST', {});

            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');

            if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                dataCache = result.data;
                applyFilter();
            } else {
                content.innerHTML = `
                    <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                        <i class="fas fa-folder-open text-4xl mb-3 opacity-40"></i>
                        <p>Belum ada dokumen yang tersedia.</p>
                    </div>
                `;
            }
        } catch (error) {
            if (skeleton) skeleton.classList.add('hidden');
            content.classList.remove('hidden');
            console.error('[dokumen] Load error:', error);
            content.innerHTML = `
                <div class="col-span-full text-center py-12 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Error: ${escapeHtml(error.message)}</p>
                </div>
            `;
        }
    }

    // ===== APPLY FILTER =====
    function applyFilter() {
        let filtered = dataCache;

        if (currentKategori !== 'all') {
            filtered = filtered.filter(d => (d.kategori || '') === currentKategori);
        }

        if (searchQuery) {
            filtered = filtered.filter(d => {
                const haystack = [d.judul, d.deskripsi, d.kategori, d.tahun]
                    .map(v => String(v || '').toLowerCase()).join(' ');
                return haystack.includes(searchQuery);
            });
        }

        renderDokumen(filtered);
        updateStats();
    }

    // ===== STATS =====
    function updateStats() {
        const total = dataCache.length;
        const laporan = dataCache.filter(d => d.kategori === 'laporan').length;
        const pdf = dataCache.filter(d => d.jenis === 'pdf').length;

        const now = new Date();
        const tahunIni = dataCache.filter(d => String(d.tahun) === String(now.getFullYear())).length;

        const el1 = document.getElementById('stats-total-dokumen');
        const el2 = document.getElementById('stats-laporan-dokumen');
        const el3 = document.getElementById('stats-pdf-dokumen');
        const el4 = document.getElementById('stats-tahun-dokumen');

        if (el1) el1.textContent = total;
        if (el2) el2.textContent = laporan;
        if (el3) el3.textContent = pdf;
        if (el4) el4.textContent = tahunIni;
    }

    // ===== RENDER =====
    function renderDokumen(data) {
        if (!data || data.length === 0) {
            const isFiltered = searchQuery || currentKategori !== 'all';
            content.innerHTML = `
                <div class="col-span-full text-center py-12 text-[var(--text-muted)]">
                    <i class="fas ${isFiltered ? 'fa-search' : 'fa-folder-open'} text-4xl mb-3 opacity-40"></i>
                    <p>${isFiltered ? 'Tidak ada dokumen yang cocok dengan filter.' : 'Belum ada dokumen yang tersedia.'}</p>
                </div>
            `;
            return;
        }

        content.className = 'col-span-full grid grid-cols-1 sm:grid-cols-2 gap-6';

        content.innerHTML = data.map(item => {
            const info = getJenisInfo(item.jenis);
            const badge = getBadgeColor(item.kategori);

            return `
                <div class="dokumen-card bg-[var(--card-bg)] backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-[var(--card-border)] transition hover:shadow-xl hover:translate-y-[-4px]">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center space-x-3">
                            <div class="text-3xl text-[var(--text-main)]">
                                <i class="fas ${info.icon}"></i>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-[var(--text-main)]">${escapeHtml(item.judul || 'Dokumen')}</h3>
                                <p class="text-sm text-[var(--text-muted)]">${escapeHtml(item.tahun || '-')} • ${escapeHtml(info.label)}</p>
                            </div>
                        </div>
                        <span class="px-2 py-1 rounded-full text-xs font-semibold ${badge}">${escapeHtml(item.kategori || 'Umum')}</span>
                    </div>
                    <p class="text-[var(--text-muted)] text-sm line-clamp-2 mb-3">${escapeHtml(item.deskripsi || '')}</p>
                    <div class="flex justify-between items-center pt-3 border-t border-[var(--card-border)]">
                        <span class="text-xs text-[var(--text-muted)]"><i class="far fa-calendar mr-1"></i>${formatDate(item.created_at)}</span>
                        ${item.file_url
                            ? `<a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener" class="text-[var(--text-main)] hover:underline text-sm font-medium flex items-center gap-1"><i class="fas fa-download"></i> Download</a>`
                            : '<span class="text-xs text-[var(--text-muted)]">Tidak ada file</span>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== INIT =====
    console.log('[dokumen] Init dimulai');
    ensureExtraUI();
    loadDokumen();
});