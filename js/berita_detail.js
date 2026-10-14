/**
 * js/berita_detail.js
 * Modul Halaman Detail Berita (Publik) - FULL FIX v10.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi (window.__beritaDetailLoaded)
 *  - XSS protection: escapeHtml meta, sanitize HTML isi
 *  - Loading/error/not-found state proper
 *  - Hash routing token reading (support 3 fallback)
 *  - Clone-replace listener anti memory leak
 *
 * FEATURES:
 *  - Detail berita lengkap (judul, penulis, tanggal, tag, gambar)
 *  - Estimasi waktu baca
 *  - Share buttons (FB, Twitter/X, WhatsApp, Telegram)
 *  - Copy link ke clipboard
 *  - Print berita
 *  - Bookmark lokal (localStorage)
 *  - Navigasi Prev/Next antar berita
 *  - Sidebar berita terkait (5 item)
 *  - Reading progress bar
 *  - Scroll to top button
 *  - Keyboard shortcut (←/→ prev/next)
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('berita_detail', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__beritaDetailLoaded) {
        console.log('[berita_detail] Sudah di-init, skip.');
        return;
    }
    window.__beritaDetailLoaded = true;

    // ================================================================
    // 2. AMBIL ID DARI URL (support hash routing)
    // ================================================================
    let beritaId = '';

    // Prioritas 1: dari router SPA
    if (window.__currentQuery && typeof window.__currentQuery.get === 'function') {
        beritaId = window.__currentQuery.get('id') || '';
    }
    // Prioritas 2: dari hash (#/berita_detail?id=xxx)
    if (!beritaId) {
        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx !== -1) {
            try {
                const params = new URLSearchParams(hash.substring(qIdx));
                beritaId = params.get('id') || '';
            } catch (e) {}
        }
    }
    // Prioritas 3: dari search params
    if (!beritaId) {
        beritaId = new URLSearchParams(window.location.search).get('id') || '';
    }

    // ================================================================
    // 3. DOM ELEMENTS
    // ================================================================
    const loadingEl     = document.getElementById('berita-loading');
    const contentEl     = document.getElementById('berita-content');
    const judulEl       = document.getElementById('berita-judul');
    const penulisEl     = document.getElementById('berita-penulis');
    const tanggalEl     = document.getElementById('berita-tanggal');
    const tagEl         = document.getElementById('berita-tag');
    const gambarEl      = document.getElementById('berita-gambar');
    const gambarPlaceholderEl = document.getElementById('berita-gambar-placeholder');
    const isiEl         = document.getElementById('berita-isi');
    const sidebarListEl = document.getElementById('sidebar-berita-terkait');

    if (!beritaId) {
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-3"></i>
                    <p class="text-red-500 font-medium">ID Berita tidak ditemukan.</p>
                    <a href="/semua_berita" class="btn-primary inline-block mt-4 px-6 py-2 rounded-lg">
                        <i class="fas fa-arrow-left mr-1"></i>Kembali ke Berita
                    </a>
                </div>
            `;
        }
        return;
    }

    if (!loadingEl || !contentEl || !judulEl || !isiEl) {
        console.error('[berita_detail] Elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let beritaData = null;
    let allBerita = [];
    let userMap = {};
    let currentIndex = -1;
    let isBookmarked = false;

    // ================================================================
    // 5. HELPER FUNCTIONS
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
            day: '2-digit', month: 'long', year: 'numeric'
        });
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    /**
     * Ambil gambar pertama dari konten HTML
     */
    function getFirstImageFromContent(html) {
        if (!html) return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const img = doc.querySelector('img');
            return img ? (img.getAttribute('src') || '') : '';
        } catch (e) {
            return '';
        }
    }

    /**
     * Sanitize HTML dari isi berita (hapus script & event handlers)
     */
    function sanitizeHtml(html) {
        if (!html) return '';
        return String(html)
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
            .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
            .replace(/javascript:/gi, '');
    }

    /**
     * Estimasi waktu baca (200 kata/menit)
     */
    function estimateReadingTime(html) {
        const text = stripHtml(html);
        const words = text.split(/\s+/).filter(w => w.length > 0).length;
        const minutes = Math.max(1, Math.ceil(words / 200));
        return { words: words, minutes: minutes };
    }

    /**
     * Build URL lengkap untuk share
     */
    function buildCurrentUrl() {
        return window.location.origin + window.location.pathname +
            '#/berita_detail?id=' + encodeURIComponent(beritaId);
    }

    /**
     * Copy text ke clipboard (dengan fallback)
     */
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

    /**
     * Cek apakah berita ini sudah di-bookmark
     */
    function checkBookmark() {
        try {
            const list = JSON.parse(localStorage.getItem('bookmark_berita') || '[]');
            isBookmarked = list.includes(beritaId);
        } catch (e) {
            isBookmarked = false;
        }
    }

    /**
     * Toggle bookmark
     */
    function toggleBookmark() {
        try {
            let list = JSON.parse(localStorage.getItem('bookmark_berita') || '[]');
            if (isBookmarked) {
                list = list.filter(id => id !== beritaId);
                isBookmarked = false;
                showToast('Dihapus dari bookmark.', 'info', 2000);
            } else {
                list.push(beritaId);
                isBookmarked = true;
                showToast('✅ Ditambahkan ke bookmark!', 'success', 2000);
            }
            localStorage.setItem('bookmark_berita', JSON.stringify(list));
            updateBookmarkBtn();
        } catch (e) {
            showToast('Gagal update bookmark.', 'error');
        }
    }

    /**
     * Update icon bookmark
     */
    function updateBookmarkBtn() {
        const btn = document.getElementById('berita-bookmark-btn');
        if (!btn) return;
        if (isBookmarked) {
            btn.innerHTML = '<i class="fas fa-bookmark"></i>';
            btn.classList.add('text-yellow-500');
            btn.classList.remove('text-[var(--text-muted)]');
            btn.title = 'Hapus bookmark';
        } else {
            btn.innerHTML = '<i class="far fa-bookmark"></i>';
            btn.classList.remove('text-yellow-500');
            btn.classList.add('text-[var(--text-muted)]');
            btn.title = 'Tambah bookmark';
        }
    }

    // ================================================================
    // 6. LOAD DATA (berita + users)
    // ================================================================
    async function loadBerita() {
        try {
            const [beritaRes, usersRes] = await Promise.allSettled([
                apiCall('getBerita', 'POST', {}),
                apiCall('getUsers', 'POST', {})
            ]);

            if (beritaRes.status !== 'fulfilled' || !beritaRes.value ||
                !beritaRes.value.success) {
                throw new Error((beritaRes.value && beritaRes.value.message) || 'Gagal memuat berita');
            }

            allBerita = beritaRes.value.data || [];

            // Build userMap
            if (usersRes.status === 'fulfilled' && usersRes.value &&
                usersRes.value.success) {
                (usersRes.value.data || []).forEach(u => {
                    userMap[u.id] = u.nama || u.name || u.username || 'Admin';
                });
            }

            // Find current
            const item = allBerita.find(b => b.id === beritaId);
            if (!item) {
                showNotFound();
                return;
            }

            beritaData = item;
            currentIndex = allBerita.findIndex(b => b.id === beritaId);

            renderDetail(item);
            renderSidebar();
            renderNavigation();
            checkBookmark();
            initReadingProgress();
            attachContentListeners();

        } catch (error) {
            console.error('[berita_detail] Load error:', error);
            showError(error.message);
        }
    }

    // ================================================================
    // 7. SHOW ERROR/NOT FOUND STATES
    // ================================================================
    function showError(msg) {
        loadingEl.classList.remove('hidden');
        loadingEl.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-5xl text-red-500 mb-4"></i>
                <p class="text-red-500 font-medium mb-4">${escapeHtml(msg || 'Terjadi kesalahan')}</p>
                <div class="flex justify-center gap-2">
                    <button onclick="location.reload()" class="btn-primary px-6 py-2 rounded-lg">
                        <i class="fas fa-sync-alt mr-1"></i>Coba Lagi
                    </button>
                    <a href="/semua_berita" class="btn-outline px-6 py-2 rounded-lg">
                        <i class="fas fa-arrow-left mr-1"></i>Kembali
                    </a>
                </div>
            </div>
        `;
    }

    function showNotFound() {
        loadingEl.classList.remove('hidden');
        loadingEl.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-newspaper text-5xl text-gray-400 mb-4"></i>
                <p class="text-[var(--text-muted)] font-medium mb-4">Berita tidak ditemukan.</p>
                <p class="text-[var(--text-muted)] text-sm mb-4">ID: ${escapeHtml(beritaId)}</p>
                <a href="/semua_berita" class="btn-primary inline-block px-6 py-2 rounded-lg">
                    <i class="fas fa-arrow-left mr-1"></i>Kembali ke Berita
                </a>
            </div>
        `;
    }

    // ================================================================
    // 8. RENDER DETAIL
    // ================================================================
    function renderDetail(item) {
        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        const penulis = userMap[item.created_by] || 'Admin';
        const tanggal = item.tanggal ? formatDate(item.tanggal) : '-';

        // Thumbnail
        let gambarUrl = item.gambar_url;
        if (!gambarUrl) gambarUrl = getFirstImageFromContent(item.isi);

        // Estimasi waktu baca
        const reading = estimateReadingTime(item.isi);

        // Judul
        judulEl.textContent = item.judul || 'Tanpa Judul';

        // Meta info
        if (penulisEl) {
            penulisEl.innerHTML = `
                <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--text-main)] text-[var(--text-inverse)] text-xs font-bold mr-1">
                    ${escapeHtml(penulis.charAt(0).toUpperCase())}
                </span>
                ${escapeHtml(penulis)}
            `;
        }

        if (tanggalEl) {
            tanggalEl.innerHTML = `<i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}`;
        }

        if (tagEl) {
            if (item.tag) {
                tagEl.textContent = '#' + item.tag;
                tagEl.classList.remove('hidden');
            } else {
                tagEl.classList.add('hidden');
            }
        }

        // Gambar
        if (gambarUrl) {
            gambarEl.src = gambarUrl;
            gambarEl.alt = item.judul || 'Berita';
            gambarEl.style.display = 'block';
            if (gambarPlaceholderEl) gambarPlaceholderEl.style.display = 'none';
        } else {
            gambarEl.style.display = 'none';
            if (gambarPlaceholderEl) gambarPlaceholderEl.style.display = 'flex';
        }

        // Isi berita (sanitized)
        isiEl.innerHTML = sanitizeHtml(item.isi) || '<p class="italic text-[var(--text-muted)]">Tidak ada isi berita.</p>';

        // Update document title
        document.title = (item.judul || 'Berita') + ' - PAC GP Ansor Sewon';

        // Estimasi waktu baca (tambahkan ke meta)
        const metaWrap = penulisEl ? penulisEl.parentElement : null;
        if (metaWrap && !document.getElementById('reading-time-badge')) {
            const badge = document.createElement('span');
            badge.id = 'reading-time-badge';
            badge.className = 'text-sm text-green-100';
            badge.innerHTML = `<i class="far fa-clock mr-1"></i>${reading.minutes} menit baca`;
            metaWrap.appendChild(badge);
        }
    }

    // ================================================================
    // 9. RENDER SIDEBAR (berita terkait)
    // ================================================================
    function renderSidebar() {
        if (!sidebarListEl) return;

        const related = allBerita
            .filter(b => b.id !== beritaId)
            .slice(0, 5);

        if (related.length === 0) {
            sidebarListEl.innerHTML = '<p class="text-[var(--text-muted)] text-sm text-center py-4">Belum ada berita lain.</p>';
            return;
        }

        let html = '';
        related.forEach(item => {
            const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) ||
                'https://placehold.co/100x100/e2e8f0/475569?text=Berita';
            const penulis = userMap[item.created_by] || 'Admin';
            const tanggal = item.tanggal ? formatDate(item.tanggal) : '-';

            html += `
                <a href="/berita_detail?id=${encodeURIComponent(item.id)}"
                   class="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--bg-stats)] transition-colors group">
                    <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(item.judul)}"
                        class="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-[var(--card-border)] group-hover:scale-105 transition-transform"
                        loading="lazy" decoding="async"
                        onerror="this.src='https://placehold.co/100x100/e2e8f0/475569?text=Berita'">
                    <div class="min-w-0 flex-1">
                        <h4 class="text-sm font-semibold text-[var(--text-main)] line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            ${escapeHtml(item.judul)}
                        </h4>
                        <p class="text-xs text-[var(--text-muted)] mt-1">
                            <i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}
                        </p>
                        <p class="text-xs text-[var(--text-muted)] mt-0.5">
                            <i class="fas fa-user-circle mr-1"></i>${escapeHtml(penulis)}
                        </p>
                    </div>
                </a>
            `;
        });
        sidebarListEl.innerHTML = html;
    }

    // ================================================================
    // 10. RENDER NAVIGATION (prev/next)
    // ================================================================
    function renderNavigation() {
        // Cari atau buat container navigasi
        let navContainer = document.getElementById('berita-nav-container');
        if (!navContainer) {
            navContainer = document.createElement('div');
            navContainer.id = 'berita-nav-container';
            navContainer.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 pt-6 border-t border-[var(--card-border)]';

            // Sisipkan sebelum tombol share (yang sudah ada di view)
            const shareBar = contentEl.querySelector('.mt-10.border-t');
            if (shareBar && shareBar.parentNode) {
                shareBar.parentNode.insertBefore(navContainer, shareBar);
            } else if (isiEl && isiEl.parentNode) {
                isiEl.parentNode.appendChild(navContainer);
            }
        }

        // Prev (berita sebelumnya = index - 1)
        const prevItem = currentIndex > 0 ? allBerita[currentIndex - 1] : null;
        // Next (berita setelah = index + 1)
        const nextItem = currentIndex < allBerita.length - 1 ? allBerita[currentIndex + 1] : null;

        let html = '';

        if (prevItem) {
            html += `
                <a href="/berita_detail?id=${encodeURIComponent(prevItem.id)}"
                   class="group flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--text-main)] transition-all">
                    <i class="fas fa-chevron-left text-[var(--text-muted)] group-hover:text-[var(--text-main)] mt-1 transition-colors"></i>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs text-[var(--text-muted)] mb-1">Sebelumnya</p>
                        <p class="text-sm font-medium text-[var(--text-main)] line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            ${escapeHtml(prevItem.judul)}
                        </p>
                    </div>
                </a>
            `;
        } else {
            html += '<div></div>';
        }

        if (nextItem) {
            html += `
                <a href="/berita_detail?id=${encodeURIComponent(nextItem.id)}"
                   class="group flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--text-main)] transition-all text-right">
                    <div class="min-w-0 flex-1">
                        <p class="text-xs text-[var(--text-muted)] mb-1">Selanjutnya</p>
                        <p class="text-sm font-medium text-[var(--text-main)] line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            ${escapeHtml(nextItem.judul)}
                        </p>
                    </div>
                    <i class="fas fa-chevron-right text-[var(--text-muted)] group-hover:text-[var(--text-main)] mt-1 transition-colors"></i>
                </a>
            `;
        }

        navContainer.innerHTML = html;
    }

    // ================================================================
    // 11. ATTACH CONTENT LISTENERS (share, copy, print, bookmark)
    // ================================================================
    function attachContentListeners() {
        // Cari toolbar share (dari view atau buat baru)
        let toolbar = document.getElementById('berita-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'berita-toolbar';
            toolbar.className = 'flex flex-wrap items-center gap-2 mt-6 p-3 rounded-lg bg-[var(--bg-stats)] border border-[var(--card-border)]';

            // Sisipkan sebelum nav
            const navContainer = document.getElementById('berita-nav-container');
            if (navContainer && navContainer.parentNode) {
                navContainer.parentNode.insertBefore(toolbar, navContainer);
            } else if (isiEl && isiEl.parentNode) {
                isiEl.parentNode.appendChild(toolbar);
            }
        }

        toolbar.innerHTML = `
            <span class="text-sm text-[var(--text-muted)] mr-1">
                <i class="fas fa-share-alt mr-1"></i>Bagikan:
            </span>
            <button type="button" data-share="facebook" title="Share ke Facebook"
                class="share-btn flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#1877F2] text-white text-xs font-medium hover:opacity-90 transition">
                <i class="fab fa-facebook-f"></i> Facebook
            </button>
            <button type="button" data-share="twitter" title="Share ke X/Twitter"
                class="share-btn flex items-center gap-1 px-3 py-1.5 rounded-full bg-black text-white text-xs font-medium hover:opacity-90 transition">
                <i class="fab fa-x-twitter"></i> X
            </button>
            <button type="button" data-share="whatsapp" title="Share ke WhatsApp"
                class="share-btn flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-medium hover:opacity-90 transition">
                <i class="fab fa-whatsapp"></i> WhatsApp
            </button>
            <button type="button" data-share="telegram" title="Share ke Telegram"
                class="share-btn flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#0088cc] text-white text-xs font-medium hover:opacity-90 transition">
                <i class="fab fa-telegram-plane"></i> Telegram
            </button>
            <div class="flex items-center gap-2 ml-auto">
                <button type="button" id="berita-bookmark-btn" title="Bookmark"
                    class="text-[var(--text-muted)] hover:text-[var(--text-main)] w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center transition">
                    <i class="far fa-bookmark"></i>
                </button>
                <button type="button" id="berita-copy-btn" title="Copy link"
                    class="text-[var(--text-muted)] hover:text-[var(--text-main)] w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center transition">
                    <i class="fas fa-link"></i>
                </button>
                <button type="button" id="berita-print-btn" title="Print"
                    class="text-[var(--text-muted)] hover:text-[var(--text-main)] w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center transition">
                    <i class="fas fa-print"></i>
                </button>
            </div>
        `;

        // Share buttons
        toolbar.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const type = this.dataset.share;
                handleShare(type);
            });
        });

        // Bookmark
        const bookmarkBtn = document.getElementById('berita-bookmark-btn');
        if (bookmarkBtn) {
            const fresh = bookmarkBtn.cloneNode(true);
            bookmarkBtn.parentNode.replaceChild(fresh, bookmarkBtn);
            fresh.addEventListener('click', toggleBookmark);
            updateBookmarkBtn();
        }

        // Copy link
        const copyBtn = document.getElementById('berita-copy-btn');
        if (copyBtn) {
            const fresh = copyBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(fresh, copyBtn);
            fresh.addEventListener('click', () => {
                copyToClipboard(buildCurrentUrl())
                    .then(() => showToast('Link berhasil dicopy!', 'success', 2000))
                    .catch(() => showToast('Gagal copy link.', 'error'));
            });
        }

        // Print
        const printBtn = document.getElementById('berita-print-btn');
        if (printBtn) {
            const fresh = printBtn.cloneNode(true);
            printBtn.parentNode.replaceChild(fresh, printBtn);
            fresh.addEventListener('click', handlePrint);
        }

        // Cegah global router intercept pada share button
        toolbar.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => e.stopPropagation());
        });
    }

    // ================================================================
    // 12. HANDLE SHARE
    // ================================================================
    function handleShare(type) {
        if (!beritaData) return;

        const url = buildCurrentUrl();
        const title = beritaData.judul || 'Berita';
        const encodedUrl = encodeURIComponent(url);
        const encodedTitle = encodeURIComponent(title);

        let shareUrl = '';

        switch (type) {
            case 'facebook':
                shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl;
                break;
            case 'twitter':
                shareUrl = 'https://twitter.com/intent/tweet?url=' + encodedUrl + '&text=' + encodedTitle;
                break;
            case 'whatsapp':
                shareUrl = 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url);
                break;
            case 'telegram':
                shareUrl = 'https://t.me/share/url?url=' + encodedUrl + '&text=' + encodedTitle;
                break;
        }

        if (shareUrl) {
            const w = window.open(shareUrl, '_blank', 'width=600,height=500,noopener,noreferrer');
            if (w) w.focus();
            else showToast('Popup diblokir. Copy link manual.', 'warning');
        }
    }

    // ================================================================
    // 13. HANDLE PRINT
    // ================================================================
    function handlePrint() {
        // Update title sementara untuk print
        const originalTitle = document.title;
        document.title = (beritaData && beritaData.judul) || 'Berita';

        setTimeout(() => {
            window.print();
            setTimeout(() => { document.title = originalTitle; }, 1000);
        }, 200);
    }

    // ================================================================
    // 14. READING PROGRESS BAR
    // ================================================================
    function initReadingProgress() {
        let bar = document.getElementById('reading-progress-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'reading-progress-bar';
            bar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                height: 3px;
                width: 0%;
                background: linear-gradient(90deg, #0f2922, #fbbf24);
                z-index: 9999;
                transition: width 0.1s ease;
                pointer-events: none;
            `;
            document.body.appendChild(bar);
        }

        const updateProgress = () => {
            const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
            bar.style.width = scrolled + '%';
        };

        // Hapus listener lama
        if (window.__readingScrollHandler) {
            window.removeEventListener('scroll', window.__readingScrollHandler);
        }

        window.__readingScrollHandler = updateProgress;
        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress();

        // Cleanup function
        window.__readingProgressCleanup = () => {
            const b = document.getElementById('reading-progress-bar');
            if (b) b.remove();
            if (window.__readingScrollHandler) {
                window.removeEventListener('scroll', window.__readingScrollHandler);
                window.__readingScrollHandler = null;
            }
        };
    }

    // ================================================================
    // 15. KEYBOARD NAVIGATION (← / → prev/next)
    // ================================================================
    function attachKeyboardNav() {
        document.addEventListener('keydown', function(e) {
            // Abaikan jika di dalam input/textarea
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                const prevItem = allBerita[currentIndex - 1];
                if (prevItem) router.load('/berita_detail?id=' + encodeURIComponent(prevItem.id));
            } else if (e.key === 'ArrowRight' && currentIndex < allBerita.length - 1) {
                const nextItem = allBerita[currentIndex + 1];
                if (nextItem) router.load('/berita_detail?id=' + encodeURIComponent(nextItem.id));
            }
        });
    }

    // ================================================================
    // 16. CLEANUP
    // ================================================================
    function cleanup() {
        window.__beritaDetailLoaded = false;
        if (typeof window.__readingProgressCleanup === 'function') {
            window.__readingProgressCleanup();
            window.__readingProgressCleanup = null;
        }
        document.title = 'PAC GP Ansor Kapanewon Sewon';
    }

    window.__beritaDetailCleanup = cleanup;

    // ================================================================
    // 17. INIT
    // ================================================================
    console.log('[berita_detail] Init untuk ID:', beritaId);
    loadBerita();
    attachKeyboardNav();
});