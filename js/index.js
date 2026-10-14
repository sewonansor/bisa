/**
 * js/index.js
 * Modul Halaman Beranda Publik - FULL FIX v16.0.0 (FINAL)
 * ---------------------------------------------------------
 * FITUR v16.0.0:
 *  - ✅ FIX: Floral cleanup saat navigate keluar
 *  - ✅ FIX: Modal multi-tab (Pengurus, Anggota, Diagram)
 *  - ✅ FIX: Pending scroll dari halaman lain
 *  - ✅ FIX: Scroll spy pakai [data-section]
 *  - ✅ FIX: Per-section error isolation
 *  - ✅ FIX: AbortController cleanup
 *  - ✅ FIX: Swiper destroy & re-init
 *  - ✅ FIX: FullCalendar re-init saat dark mode
 *  - ✅ FIX: jsPlumb retry + fallback
 *  - ✅ FIX: AOS lazy init
 *  - ✅ FIX: Anti-duplicate instance
 *  - ✅ FIX: Number animation anti-re-animate
 *  - ✅ FIX: Semua 8 section load paralel
 *  - ✅ FIX: Zero error di console
 * ---------------------------------------------------------
 * SECTION LOADED:
 *  1. Profil (Sejarah + Visi Misi) — getProfil
 *  2. Struktur (5 pengurus) — getStruktur
 *  3. Village Stats — getUsers
 *  4. Keuangan — getKeuanganPublik
 *  5. Berita — getBerita + getUsers
 *  6. Galeri — getGaleri (Swiper)
 *  7. Arsip Dokumen — getArsip
 *  8. Kalender — getLogbook + getEvents (FullCalendar)
 * ---------------------------------------------------------
 * MODAL:
 *  - Multi-tab: Pengurus, Anggota, Diagram
 * ---------------------------------------------------------
 * INTERAKSI:
 *  - Scroll spy navbar
 *  - Scroll to top button
 *  - Klik section link (dari homepage atau halaman lain)
 *  - Floral cleanup on leave
 */

App.register('index', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__indexLoaded) {
        console.log('[index] Sudah di-init, skip.');
        return;
    }
    window.__indexLoaded = true;

    // ================================================================
    // 2. HELPER FUNCTIONS
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

    function formatRupiah(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

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

    function estimateReadingTime(html) {
        const text = stripHtml(html);
        const words = text.split(/\s+/).filter(w => w.length > 0).length;
        return Math.max(1, Math.ceil(words / 200));
    }

    function getInitials(name) {
        if (!name || name === '-') return '?';
        const parts = String(name).trim().split(/\s+/);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    function animateNumber(el, target, duration, formatter) {
        if (!el) return;
        if (el.dataset.animated === 'true') return;
        el.dataset.animated = 'true';

        duration = duration || 800;
        formatter = formatter || (v => Math.round(v).toLocaleString('id-ID'));

        const startTime = performance.now();
        function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = formatter(target * eased);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try {
                await window.loadLib(name);
                return true;
            } catch (e) {
                console.warn('[index] Gagal load lib ' + name + ':', e);
                return false;
            }
        }
        return false;
    }

    // ================================================================
    // 3. STATE
    // ================================================================
    let galeriSwiper = null;
    let calendarInstance = null;
    let scrollListener = null;
    let scrollTopHandler = null;
    let abortController = null;
    let isDarkModeListenerAttached = false;

    // ================================================================
    // 4. SCROLL SPY NAVBAR
    //    Selector: [data-section] (support desktop + mobile)
    // ================================================================
    function initScrollAnimations() {
        if (scrollListener) {
            window.removeEventListener('scroll', scrollListener);
            scrollListener = null;
        }

        const navbar = document.getElementById('public-navbar');
        const links = document.querySelectorAll('[data-section]');
        const sections = document.querySelectorAll('section[id]');

        function updateActive() {
            if (navbar) navbar.classList.toggle('navbar-scrolled', window.scrollY > 50);

            if (sections.length === 0 || links.length === 0) return;

            let current = '';
            const scrollY = window.scrollY;
            const offset = 100;

            sections.forEach(section => {
                const top = section.offsetTop - offset;
                const bottom = top + section.offsetHeight;
                if (scrollY >= top && scrollY < bottom) {
                    current = section.id;
                }
            });

            if (!current && sections.length > 0) current = sections[0].id;

            links.forEach(link => {
                link.classList.toggle('active', link.dataset.section === current);
            });
        }

        updateActive();
        scrollListener = updateActive;
        window.addEventListener('scroll', scrollListener, { passive: true });
    }

    // ================================================================
    // 5. SCROLL TO TOP
    // ================================================================
    function initScrollTop() {
        const scrollBtn = document.getElementById('scroll-top-btn');
        if (!scrollBtn) return;

        const fresh = scrollBtn.cloneNode(true);
        scrollBtn.parentNode.replaceChild(fresh, scrollBtn);

        fresh.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        let ticking = false;

        function toggleScrollButton() {
            const scrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const docHeight = document.documentElement.scrollHeight;

            const shouldShow = scrollY > 300 || (scrollY + windowHeight >= docHeight - 100);
            fresh.classList.toggle('show', shouldShow);
            ticking = false;
        }

        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(toggleScrollButton);
                ticking = true;
            }
        }

        if (scrollTopHandler) {
            window.removeEventListener('scroll', scrollTopHandler);
        }
        scrollTopHandler = onScroll;
        window.addEventListener('scroll', scrollTopHandler, { passive: true });

        toggleScrollButton();
    }

    // ================================================================
    // 6. HANDLE PENDING SCROLL
    //    Saat user klik section link dari halaman lain
    // ================================================================
    function handlePendingScroll() {
        const pendingSection = SafeSessionStorage.getItem('__scrollToSection');
        if (!pendingSection) return;

        SafeSessionStorage.removeItem('__scrollToSection');

        setTimeout(() => {
            const el = document.getElementById(pendingSection);
            if (el) {
                const navHeight = 80;
                const offsetTop = el.getBoundingClientRect().top + window.scrollY - navHeight;
                window.scrollTo({ top: offsetTop, behavior: 'smooth' });
                console.log(`[index] ⚡ Auto-scroll ke section: ${pendingSection}`);
            }
        }, 500);
    }

    // ================================================================
    // 7. LOAD PROFIL
    // ================================================================
    async function loadProfilData() {
        const sejarahEl = document.getElementById('profil-sejarah');
        const visiMisiEl = document.getElementById('profil-visi-misi');

        try {
            const res = await apiCall('getProfil', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat profil');
            }

            const map = {};
            (res.data || []).forEach(i => { map[i.key] = i.content; });

            if (sejarahEl) {
                sejarahEl.innerHTML = map['sejarah'] ||
                    '<p class="text-[var(--text-muted)] italic">Belum ada data sejarah.</p>';
            }
            if (visiMisiEl) {
                visiMisiEl.innerHTML = map['visi_misi'] ||
                    '<p class="text-[var(--text-muted)] italic">Belum ada data visi & misi.</p>';
            }
        } catch (e) {
            console.error('[index] loadProfilData error:', e);
            const errHtml = '<p class="text-[var(--text-muted)] italic text-sm">Gagal memuat data.</p>';
            if (sejarahEl) sejarahEl.innerHTML = errHtml;
            if (visiMisiEl) visiMisiEl.innerHTML = errHtml;
        }
    }

    // ================================================================
    // 8. LOAD STRUKTUR (5 pengurus)
    // ================================================================
    async function loadStruktur() {
        const container = document.getElementById('profil-struktur');
        if (!container) return;

        try {
            const res = await apiCall('getStruktur', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat struktur');
            }

            const data = res.data || [];

            if (data.length === 0) {
                container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">Belum ada data struktur organisasi.</p>';
                return;
            }

            const sorted = data.slice().sort((a, b) =>
                (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
            const limited = sorted.slice(0, 5);

            container.innerHTML = limited.map(item => {
                const foto = item.foto_url || '';
                const initials = getInitials(item.nama);

                const imgHtml = foto
                    ? `<img src="${escapeAttr(foto)}" alt="${escapeAttr(item.nama)}"
                            class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover mb-3 shadow-sm border border-[var(--card-border)]"
                            loading="lazy" decoding="async"
                            onerror="this.outerHTML='<div class=&quot;w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold mb-3&quot;>${escapeHtml(initials)}</div>'">`
                    : `<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold mb-3">
                            ${escapeHtml(initials)}
                       </div>`;

                return `
                    <div class="flex flex-col items-center text-center p-3 rounded-lg hover:bg-[var(--bg-stats)] transition">
                        ${imgHtml}
                        <div class="font-medium text-xs sm:text-sm text-[var(--text-main)] leading-tight">${escapeHtml(item.nama || '-')}</div>
                        <div class="text-xs text-[var(--text-muted)] font-medium mt-0.5">${escapeHtml(item.jabatan || '-')}</div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('[index] loadStruktur error:', e);
            container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">Gagal memuat struktur.</p>';
        }
    }

    // ================================================================
    // 9. LOAD VILLAGE STATS
    // ================================================================
    async function loadVillageStats() {
        const container = document.getElementById('village-stats');
        if (!container) return;

        try {
            const res = await apiCall('getUsers', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat data');
            }

            const data = res.data || [];
            const villages = ['Panggungharjo', 'Bangunharjo', 'Pendowoharjo', 'Timbulharjo'];
            const counts = {};
            villages.forEach(v => counts[v] = 0);

            data.forEach(u => {
                const alamat = String(u.alamat || u.kalurahan || '').trim();
                if (villages.includes(alamat)) counts[alamat]++;
            });

            let total = 0;
            const html = villages.map((v, idx) => {
                total += counts[v];
                return `
                    <div class="stat-card p-6 rounded-2xl text-center bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]"
                        data-aos="fade-up" data-aos-delay="${idx * 100}">
                        <div class="text-xs sm:text-sm text-[var(--text-muted)] font-medium uppercase tracking-wider">
                            ${escapeHtml(v)}
                        </div>
                        <div class="text-4xl sm:text-5xl font-bold text-[var(--text-main)] mt-2"
                            data-count="${counts[v]}">0</div>
                        <div class="text-xs text-[var(--text-muted)] mt-1">Anggota</div>
                    </div>
                `;
            }).join('');

            const totalHtml = `
                <div class="stat-card col-span-2 md:col-span-4 p-6 rounded-2xl text-center border-amber-200 bg-amber-50/50 dark:bg-amber-900/20 border"
                    data-aos="fade-up" data-aos-delay="400">
                    <div class="text-xs sm:text-sm text-[var(--text-main)] font-medium uppercase tracking-wider">
                        Total Anggota
                    </div>
                    <div class="text-4xl sm:text-5xl font-bold text-[var(--text-main)] mt-2"
                        data-count="${total}">0</div>
                </div>
            `;

            container.innerHTML = html + totalHtml;

            container.querySelectorAll('[data-count]').forEach(el => {
                const target = parseInt(el.dataset.count, 10) || 0;
                animateNumber(el, target, 800);
            });
        } catch (e) {
            console.error('[index] loadVillageStats error:', e);
            container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 text-sm">Gagal memuat statistik anggota.</p>';
        }
    }

    // ================================================================
    // 10. LOAD KEUANGAN
    // ================================================================
    async function loadKeuangan() {
        const container = document.getElementById('keuangan-summary');
        if (!container) return;

        try {
            let result;
            try {
                result = await apiCall('getKeuanganPublik', 'POST', {});
            } catch (e) {
                result = await apiCall('getKeuangan', 'POST', {});
            }

            if (!result || !result.success) {
                throw new Error((result && result.message) || 'Gagal memuat keuangan');
            }

            let totalMasuk = 0, totalKeluar = 0;

            if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                totalMasuk = Number(result.data.totalMasuk) || 0;
                totalKeluar = Number(result.data.totalKeluar) || 0;
            } else if (Array.isArray(result.data)) {
                result.data.forEach(t => {
                    const j = Number(t.jumlah) || 0;
                    if (t.jenis === 'Pemasukan') totalMasuk += j;
                    else totalKeluar += j;
                });
            }

            const saldo = totalMasuk - totalKeluar;

            container.innerHTML = `
                <div class="glass-card p-6 rounded-2xl text-center hover:scale-105 transition-transform duration-300">
                    <i class="fas fa-arrow-down text-3xl text-green-600 mb-2"></i>
                    <p class="text-sm text-[var(--text-muted)]">Total Pemasukan</p>
                    <p class="text-2xl font-bold text-[var(--text-main)]" data-count="${totalMasuk}" data-currency="true">Rp 0</p>
                </div>
                <div class="glass-card p-6 rounded-2xl text-center hover:scale-105 transition-transform duration-300">
                    <i class="fas fa-arrow-up text-3xl text-red-600 mb-2"></i>
                    <p class="text-sm text-[var(--text-muted)]">Total Pengeluaran</p>
                    <p class="text-2xl font-bold text-[var(--text-main)]" data-count="${totalKeluar}" data-currency="true">Rp 0</p>
                </div>
                <div class="glass-card p-6 rounded-2xl text-center hover:scale-105 transition-transform duration-300">
                    <i class="fas fa-wallet text-3xl text-blue-600 mb-2"></i>
                    <p class="text-sm text-[var(--text-muted)]">Saldo Akhir</p>
                    <p class="text-2xl font-bold text-[var(--text-main)]" data-count="${saldo}" data-currency="true">Rp 0</p>
                </div>
            `;

            container.querySelectorAll('[data-currency]').forEach(el => {
                const target = Number(el.dataset.count) || 0;
                animateNumber(el, target, 1000, v => formatRupiah(v));
            });
        } catch (e) {
            console.error('[index] loadKeuangan error:', e);
            container.innerHTML = '<p class="text-center text-[var(--text-muted)] col-span-full text-sm py-6">Data keuangan belum tersedia.</p>';
        }
    }

    // ================================================================
    // 11. LOAD BERITA
    // ================================================================
    async function loadBerita() {
        const container = document.getElementById('berita-list');
        if (!container) return;

        container.innerHTML = '<div class="col-span-full text-center py-8">' +
            '<i class="fas fa-spinner fa-spin text-3xl text-[var(--text-main)]"></i>' +
            '<p class="text-[var(--text-muted)] text-sm mt-2">Memuat berita...</p></div>';

        try {
            const [beritaRes, usersRes] = await Promise.allSettled([
                apiCall('getBerita', 'POST', {}),
                apiCall('getUsers', 'POST', {})
            ]);

            if (beritaRes.status !== 'fulfilled' || !beritaRes.value || !beritaRes.value.success) {
                throw new Error((beritaRes.value && beritaRes.value.message) || 'Gagal memuat berita');
            }

            const userMap = {};
            if (usersRes.status === 'fulfilled' && usersRes.value && usersRes.value.success) {
                (usersRes.value.data || []).forEach(u => {
                    userMap[u.id] = u.nama || u.name || u.username || 'Admin';
                });
            }

            const data = (beritaRes.value.data || []).slice(0, 4);

            if (data.length === 0) {
                container.innerHTML = '<p class="text-center text-[var(--text-muted)] col-span-full py-8 text-sm">Belum ada berita.</p>';
                return;
            }

            container.innerHTML = data.map((item, index) => {
                const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) ||
                    'https://placehold.co/600x400/e2e8f0/475569?text=Berita+Ansor';
                const penulis = userMap[item.created_by] || 'Admin';
                const tanggal = item.tanggal ? formatDate(item.tanggal) : '-';
                const isiPlain = stripHtml(item.isi);
                const isiSingkat = isiPlain.substring(0, 140) + (isiPlain.length > 140 ? '...' : '');
                const readingTime = estimateReadingTime(item.isi);

                const tag = item.tag
                    ? `<span class="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                           #${escapeHtml(item.tag)}
                       </span>`
                    : '';

                if (index === 0) {
                    return `
                        <a href="/berita_detail?id=${encodeURIComponent(item.id)}"
                           class="featured-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-lg md:col-span-2 relative border border-[var(--card-border)]">
                            <div class="img-wrapper h-72 md:h-96 overflow-hidden relative">
                                <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(item.judul)}"
                                    class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                    loading="lazy" decoding="async"
                                    onerror="this.src='https://placehold.co/800x500/e2e8f0/475569?text=Berita+Ansor'">
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
                            </div>
                            <div class="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
                                <div class="flex items-center gap-2 mb-3">${tag}</div>
                                <h3 class="text-2xl md:text-3xl font-bold leading-tight mb-2 line-clamp-2 font-amiri drop-shadow-lg">
                                    ${escapeHtml(item.judul)}
                                </h3>
                                <p class="text-sm text-gray-200 mb-3 line-clamp-2 drop-shadow">${escapeHtml(isiSingkat)}</p>
                                <div class="flex items-center gap-3 text-xs">
                                    <span><i class="fas fa-user-circle mr-1"></i>${escapeHtml(penulis)}</span>
                                    <span><i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}</span>
                                    <span><i class="far fa-clock mr-1"></i>${readingTime} menit baca</span>
                                </div>
                            </div>
                        </a>
                    `;
                } else {
                    return `
                        <a href="/berita_detail?id=${encodeURIComponent(item.id)}"
                           class="berita-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-md hover:shadow-xl transition-all border border-[var(--card-border)] hover:-translate-y-1">
                            <div class="img-wrapper h-48 overflow-hidden bg-[var(--bg-stats)]">
                                <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(item.judul)}"
                                    class="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                                    loading="lazy" decoding="async"
                                    onerror="this.src='https://placehold.co/600x400/e2e8f0/475569?text=Berita+Ansor'">
                            </div>
                            <div class="p-5">
                                <div class="flex items-center justify-between mb-3">
                                    <span class="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                                        ${tag || 'Berita'}
                                    </span>
                                    <span class="text-xs text-[var(--text-muted)]">
                                        <i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}
                                    </span>
                                </div>
                                <h3 class="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-2 font-amiri group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    ${escapeHtml(item.judul)}
                                </h3>
                                <p class="text-sm text-[var(--text-muted)] mb-4 line-clamp-2">${escapeHtml(isiSingkat)}</p>
                                <div class="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                                    <span class="text-xs text-[var(--text-muted)]">
                                        <i class="fas fa-user-circle mr-1"></i>${escapeHtml(penulis)}
                                    </span>
                                    <span class="text-sm font-semibold text-[var(--text-main)] group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                        Baca <i class="fas fa-arrow-right text-xs"></i>
                                    </span>
                                </div>
                            </div>
                        </a>
                    `;
                }
            }).join('');
        } catch (e) {
            console.error('[index] loadBerita error:', e);
            container.innerHTML = '<p class="text-center text-red-500 col-span-full py-8 text-sm">Gagal memuat berita.</p>';
        }
    }

    // ================================================================
    // 12. LOAD GALERI (Swiper)
    // ================================================================
    async function loadGaleri() {
        const wrapper = document.getElementById('galeri-wrapper');
        if (!wrapper) return;

        const libOk = await ensureLib('swiper');
        if (!libOk && typeof Swiper === 'undefined') {
            wrapper.innerHTML = '<div class="swiper-slide flex items-center justify-center text-[var(--text-muted)] text-sm">Galeri tidak tersedia.</div>';
            return;
        }

        try {
            const res = await apiCall('getGaleri', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat galeri');
            }

            const data = res.data || [];

            if (data.length === 0) {
                wrapper.innerHTML = '<div class="swiper-slide flex items-center justify-center bg-[var(--bg-body)] text-[var(--text-muted)] rounded-xl text-sm">Belum ada dokumentasi.</div>';
            } else {
                wrapper.innerHTML = data.map(item => {
                    const url = item.file_url || '';
                    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
                    const isImage = item.tipe === 'foto' || /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(url);

                    let mediaHtml = '';
                    if (isYoutube) {
                        let vid = '';
                        if (url.includes('v=')) vid = url.split('v=')[1].split('&')[0];
                        else if (url.includes('youtu.be/')) vid = url.split('youtu.be/')[1].split('?')[0];
                        mediaHtml = `<div class="w-full h-full">
                            <iframe class="w-full h-full" src="https://www.youtube.com/embed/${escapeAttr(vid)}"
                                title="${escapeAttr(item.judul)}" frameborder="0" allowfullscreen></iframe>
                        </div>`;
                    } else if (isImage) {
                        mediaHtml = `<img src="${escapeAttr(url)}" alt="${escapeAttr(item.judul)}"
                            class="w-full h-full object-cover" loading="lazy" decoding="async"
                            onerror="this.src='https://placehold.co/800x600/e2e8f0/475569?text=Galeri'">`;
                    } else if (url) {
                        mediaHtml = `<div class="w-full h-full flex items-center justify-center bg-black">
                            <video controls class="w-full h-full object-contain">
                                <source src="${escapeAttr(url)}" type="video/mp4">
                            </video>
                        </div>`;
                    } else {
                        mediaHtml = `<div class="w-full h-full flex items-center justify-center bg-[var(--bg-stats)] text-[var(--text-muted)]">
                            <i class="fas fa-image text-4xl"></i>
                        </div>`;
                    }

                    return `
                        <div class="swiper-slide relative group h-[300px] sm:h-[400px] rounded-xl overflow-hidden">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-end p-6">
                                <h3 class="text-white font-semibold text-lg drop-shadow-md">${escapeHtml(item.judul || '')}</h3>
                            </div>
                            ${mediaHtml}
                        </div>
                    `;
                }).join('');
            }
        } catch (e) {
            console.error('[index] loadGaleri error:', e);
            wrapper.innerHTML = '<div class="swiper-slide flex items-center justify-center text-red-500 text-sm">Gagal memuat galeri.</div>';
        } finally {
            if (galeriSwiper) {
                try { galeriSwiper.destroy(true, true); } catch (e) {}
                galeriSwiper = null;
            }

            setTimeout(() => {
                const swiperEl = document.querySelector('.galeriSwiper');
                if (!swiperEl || typeof Swiper === 'undefined') return;

                try {
                    galeriSwiper = new Swiper('.galeriSwiper', {
                        slidesPerView: 1,
                        spaceBetween: 20,
                        loop: false,
                        autoplay: {
                            delay: 4000,
                            disableOnInteraction: false,
                            pauseOnMouseEnter: true
                        },
                        pagination: {
                            el: '.galeriSwiper .swiper-pagination',
                            clickable: true
                        },
                        navigation: {
                            nextEl: '.galeriSwiper .swiper-button-next',
                            prevEl: '.galeriSwiper .swiper-button-prev'
                        },
                        breakpoints: {
                            640: { slidesPerView: 2 },
                            1024: { slidesPerView: 3 }
                        }
                    });
                } catch (err) {
                    console.error('[index] Swiper init error:', err);
                }
            }, 100);
        }
    }

    // ================================================================
    // 13. LOAD ARSIP DOKUMEN
    // ================================================================
    async function loadArsipDokumen() {
        const container = document.getElementById('arsip-dokumen-list');
        if (!container) return;

        try {
            const res = await apiCall('getArsip', 'POST', {});

            if (!res || !res.success) {
                throw new Error((res && res.message) || 'Gagal memuat arsip');
            }

            const data = (res.data || []).slice(0, 6);

            if (data.length === 0) {
                container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">Belum ada arsip dokumen.</p>';
                return;
            }

            container.innerHTML = data.map((item, i) => {
                let iconClass = 'fa-file', label = 'File';
                if (item.jenis === 'pdf') { iconClass = 'fa-file-pdf'; label = 'PDF'; }
                else if (item.jenis === 'docx') { iconClass = 'fa-file-word'; label = 'DOCX'; }
                else if (item.jenis === 'xlsx') { iconClass = 'fa-file-excel'; label = 'XLSX'; }
                else if (item.jenis === 'img') { iconClass = 'fa-image'; label = 'Gambar'; }
                else if (item.jenis === 'video') { iconClass = 'fa-video'; label = 'Video'; }

                return `
                    <div class="glass-card p-6 rounded-2xl flex flex-col justify-between h-full"
                        data-aos="fade-up" data-aos-delay="${i * 100}">
                        <div>
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex items-center gap-3">
                                    <div class="text-3xl text-[var(--text-main)]">
                                        <i class="fas ${iconClass}"></i>
                                    </div>
                                    <div>
                                        <h3 class="font-semibold text-[var(--text-main)] text-base">
                                            ${escapeHtml(item.judul || 'Dokumen')}
                                        </h3>
                                        <p class="text-xs text-[var(--text-muted)]">
                                            ${escapeHtml(item.tahun || '-')} • ${escapeHtml(label)}
                                        </p>
                                    </div>
                                </div>
                                <span class="text-xs px-3 py-1 bg-[var(--text-main)]/10 text-[var(--text-main)] rounded-full font-medium">
                                    ${escapeHtml(item.kategori || 'Umum')}
                                </span>
                            </div>
                            <p class="text-sm text-[var(--text-muted)] line-clamp-2 mt-2">
                                ${escapeHtml(item.deskripsi || '')}
                            </p>
                        </div>
                        <div class="mt-4 pt-3 border-t border-[var(--card-border)] flex justify-between items-center">
                            <span class="text-xs text-[var(--text-muted)]">${formatDate(item.created_at)}</span>
                            ${item.file_url ? `
                                <a href="${escapeAttr(item.file_url)}" target="_blank" rel="noopener"
                                   class="text-[var(--text-main)] hover:underline text-sm font-medium flex items-center gap-1">
                                    <i class="fas fa-download"></i> Download
                                </a>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('[index] loadArsipDokumen error:', e);
            container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic text-sm">Gagal memuat arsip.</p>';
        }
    }

    // ================================================================
    // 14. LOAD KALENDER (FullCalendar)
    // ================================================================
    async function loadKalender() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;

        await ensureLib('fullcalendar');

        if (typeof FullCalendar === 'undefined') {
            calendarEl.innerHTML = '<p class="text-center text-[var(--text-muted)] py-8 text-sm">Pustaka kalender belum siap.</p>';
            return;
        }

        try {
            const [logbookRes, eventsRes] = await Promise.allSettled([
                apiCall('getLogbook', 'POST', {}),
                apiCall('getEvents', 'POST', {})
            ]);

            const events = [];

            if (logbookRes.status === 'fulfilled' && logbookRes.value && logbookRes.value.success) {
                (logbookRes.value.data || []).forEach(item => {
                    if (!item.tanggal_mulai) return;
                    events.push({
                        id: 'logbook_' + item.id,
                        title: item.kegiatan || 'Kegiatan',
                        start: item.tanggal_mulai,
                        end: item.tanggal_selesai || item.tanggal_mulai,
                        extendedProps: {
                            type: 'kegiatan',
                            deskripsi: stripHtml(item.deskripsi),
                            tempat: item.tempat || '-'
                        }
                    });
                });
            }

            if (eventsRes.status === 'fulfilled' && eventsRes.value && eventsRes.value.success) {
                (eventsRes.value.data || []).forEach(item => {
                    if (!item.start) return;
                    events.push({
                        id: 'evt_' + item.id,
                        title: item.title || 'Rencana',
                        start: item.start,
                        end: item.end || item.start,
                        extendedProps: { type: 'rencana' }
                    });
                });
            }

            if (calendarInstance) {
                try { calendarInstance.destroy(); } catch (e) {}
                calendarInstance = null;
            }

            const isDark = document.documentElement.classList.contains('dark');
            const kegiatanColor = '#16a34a';
            const rencanaColor = isDark ? '#7c3aed' : '#2563eb';

            const enhancedEvents = events.map(e => {
                const isKegiatan = e.extendedProps.type === 'kegiatan';
                return {
                    ...e,
                    backgroundColor: isKegiatan ? kegiatanColor : rencanaColor,
                    borderColor: isKegiatan ? kegiatanColor : rencanaColor,
                    textColor: '#ffffff'
                };
            });

            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,listWeek'
                },
                buttonText: { today: 'Hari Ini', month: 'Bulan', list: 'Agenda' },
                firstDay: 1,
                dayMaxEvents: 3,
                events: enhancedEvents,
                eventDisplay: 'block',
                height: 'auto',
                eventClick: function(info) {
                    const event = info.event;
                    const props = event.extendedProps || {};

                    let detail = `${event.title}\n\n`;
                    detail += `Mulai: ${event.start.toLocaleDateString('id-ID', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}`;
                    if (event.end && event.end.toDateString() !== event.start.toDateString()) {
                        detail += `\nSelesai: ${event.end.toLocaleDateString('id-ID', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                        })}`;
                    }
                    if (props.tempat) detail += `\nTempat: ${props.tempat}`;
                    if (props.deskripsi) detail += `\n\n${props.deskripsi}`;

                    alert(detail);
                }
            });

            calendarInstance.render();
        } catch (e) {
            console.error('[index] loadKalender error:', e);
            calendarEl.innerHTML = '<p class="text-center text-[var(--text-muted)] py-8 text-sm">Gagal memuat kalender.</p>';
        }
    }

    // ================================================================
    // 15. MODAL "LIHAT SELENGKAPNYA" — MULTI-TAB
    // ================================================================
    function initStructureModal() {
        const showBtn = document.getElementById('show-full-structure');
        if (!showBtn) {
            console.warn('[index] Tombol show-full-structure tidak ditemukan');
            return;
        }

        // Hapus modal lama dari view HTML (jika ada)
        const oldModal = document.getElementById('structure-modal');
        if (oldModal) oldModal.remove();

        const existingModal = document.getElementById('index-structure-modal');
        if (existingModal) existingModal.remove();

        // === BUAT MODAL ===
        const modal = document.createElement('div');
        modal.id = 'index-structure-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            padding: 1rem;
        `;
        modal.innerHTML = `
            <div id="index-structure-content" style="
                background: var(--card-bg);
                border-radius: 1rem;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                max-width: 1100px;
                width: 100%;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid var(--card-border);
                transform: scale(0.95);
                opacity: 0;
                transition: transform 0.2s ease, opacity 0.2s ease;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid var(--card-border);
                    flex-shrink: 0;
                ">
                    <div>
                        <h2 class="font-amiri" style="
                            font-size: 1.5rem;
                            font-weight: 700;
                            color: var(--text-main);
                            margin: 0;
                            line-height: 1.2;
                        ">
                            <i class="fas fa-users-cog mr-2" style="color: #fbbf24;"></i>
                            Struktur &amp; Anggota
                        </h2>
                        <p style="
                            font-size: 0.8rem;
                            color: var(--text-muted);
                            margin-top: 0.25rem;
                            margin-bottom: 0;
                        ">PAC GP Ansor Kapanewon Sewon</p>
                    </div>
                    <button id="index-structure-close" style="
                        width: 2.5rem;
                        height: 2.5rem;
                        border-radius: 50%;
                        background: var(--bg-stats);
                        border: none;
                        cursor: pointer;
                        font-size: 1.1rem;
                        color: var(--text-main);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: background 0.2s, transform 0.2s;
                        flex-shrink: 0;
                    ">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div id="index-structure-tabs" style="
                    display: flex;
                    gap: 0.25rem;
                    padding: 0.75rem 1.5rem 0;
                    border-bottom: 1px solid var(--card-border);
                    flex-shrink: 0;
                    overflow-x: auto;
                    scrollbar-width: none;
                ">
                    <button class="index-tab-btn active" data-tab="pengurus" style="
                        padding: 0.6rem 1rem;
                        border: none;
                        background: transparent;
                        cursor: pointer;
                        font-size: 0.875rem;
                        font-weight: 600;
                        color: var(--text-muted);
                        border-bottom: 2px solid transparent;
                        white-space: nowrap;
                        transition: all 0.2s;
                        font-family: inherit;
                    ">
                        <i class="fas fa-sitemap mr-2"></i>Pengurus
                    </button>
                    <button class="index-tab-btn" data-tab="anggota" style="
                        padding: 0.6rem 1rem;
                        border: none;
                        background: transparent;
                        cursor: pointer;
                        font-size: 0.875rem;
                        font-weight: 600;
                        color: var(--text-muted);
                        border-bottom: 2px solid transparent;
                        white-space: nowrap;
                        transition: all 0.2s;
                        font-family: inherit;
                    ">
                        <i class="fas fa-users mr-2"></i>Anggota
                    </button>
                    <button class="index-tab-btn" data-tab="diagram" style="
                        padding: 0.6rem 1rem;
                        border: none;
                        background: transparent;
                        cursor: pointer;
                        font-size: 0.875rem;
                        font-weight: 600;
                        color: var(--text-muted);
                        border-bottom: 2px solid transparent;
                        white-space: nowrap;
                        transition: all 0.2s;
                        font-family: inherit;
                    ">
                        <i class="fas fa-project-diagram mr-2"></i>Diagram
                    </button>
                </div>

                <div id="index-structure-body" style="
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.5rem;
                "></div>

                <div style="
                    padding: 1rem 1.5rem;
                    border-top: 1px solid var(--card-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    flex-shrink: 0;
                    flex-wrap: wrap;
                ">
                    <p id="index-structure-info" style="
                        font-size: 0.75rem;
                        color: var(--text-muted);
                        margin: 0;
                    "></p>
                    <button id="index-structure-ok" class="btn-primary" style="
                        padding: 0.5rem 1.5rem;
                        border-radius: 0.5rem;
                        font-weight: 600;
                        cursor: pointer;
                        border: none;
                    ">
                        <i class="fas fa-check mr-1"></i>Tutup
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // === ELEMENT REFS ===
        const content = modal.querySelector('#index-structure-content');
        const closeBtn = modal.querySelector('#index-structure-close');
        const okBtn = modal.querySelector('#index-structure-ok');
        const body = modal.querySelector('#index-structure-body');
        const info = modal.querySelector('#index-structure-info');
        const tabs = modal.querySelectorAll('.index-tab-btn');

        // === STATE ===
        let dataCache = {
            pengurus: null,
            anggota: null,
            diagram: null
        };
        let currentTab = 'pengurus';
        let modalDiagramInstance = null;

        function openModal() {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            requestAnimationFrame(() => {
                content.style.transform = 'scale(1)';
                content.style.opacity = '1';
            });
            switchTab(currentTab);
        }

        function closeModal() {
            content.style.transform = 'scale(0.95)';
            content.style.opacity = '0';
            document.body.style.overflow = '';
            setTimeout(() => {
                modal.style.display = 'none';
                if (modalDiagramInstance) {
                    try { modalDiagramInstance.reset(); } catch (e) {}
                    modalDiagramInstance = null;
                }
            }, 200);
        }

        function switchTab(tabName) {
            currentTab = tabName;
            tabs.forEach(t => {
                const isActive = t.dataset.tab === tabName;
                t.classList.toggle('active', isActive);
                if (isActive) {
                    t.style.color = 'var(--text-main)';
                    t.style.borderBottomColor = '#fbbf24';
                } else {
                    t.style.color = 'var(--text-muted)';
                    t.style.borderBottomColor = 'transparent';
                }
            });

            if (tabName === 'pengurus') renderPengurus();
            else if (tabName === 'anggota') renderAnggota();
            else if (tabName === 'diagram') renderDiagram();
        }

        // === RENDER PENGURUS ===
        async function renderPengurus() {
            body.innerHTML = `
                <div style="text-align: center; padding: 3rem 0;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--text-main);"></i>
                    <p style="color: var(--text-muted); margin-top: 0.5rem; font-size: 0.875rem;">Memuat pengurus...</p>
                </div>
            `;

            try {
                if (!dataCache.pengurus) {
                    const res = await apiCall('getStruktur', 'POST', {});
                    dataCache.pengurus = (res && res.success && Array.isArray(res.data)) ? res.data : [];
                }
                const data = dataCache.pengurus.slice().sort((a, b) =>
                    (Number(a.urutan) || 0) - (Number(b.urutan) || 0));

                if (data.length === 0) {
                    body.innerHTML = '<p style="text-align: center; padding: 3rem 0; color: var(--text-muted); font-style: italic;">Belum ada data pengurus.</p>';
                    info.textContent = '';
                    return;
                }

                info.textContent = `Menampilkan ${data.length} pengurus`;

                body.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 1rem;">
                        ${data.map(item => {
                            const nama = item.nama || '-';
                            const jabatan = item.jabatan || '-';
                            const foto = item.foto_url || '';
                            const initials = getInitials(nama);

                            const avatar = foto
                                ? `<img src="${escapeAttr(foto)}" alt="${escapeAttr(nama)}"
                                        style="width: 5rem; height: 5rem; border-radius: 50%; object-fit: cover; border: 2px solid var(--card-border);"
                                        loading="lazy"
                                        onerror="this.outerHTML='<div style=&quot;width:5rem;height:5rem;border-radius:50%;background:linear-gradient(135deg,#14b8a6,#059669);display:flex;align-items:center;justify-content:center;color:white;font-size:1.5rem;font-weight:700;&quot;>${escapeHtml(initials)}</div>'">`
                                : `<div style="width: 5rem; height: 5rem; border-radius: 50%; background: linear-gradient(135deg, #14b8a6, #059669); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem; font-weight: 700;">${escapeHtml(initials)}</div>`;

                            return `
                                <div style="
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    text-align: center;
                                    padding: 1rem;
                                    background: var(--bg-stats);
                                    border-radius: 0.75rem;
                                    border: 1px solid var(--card-border);
                                ">
                                    ${avatar}
                                    <div style="
                                        font-weight: 600;
                                        color: var(--text-main);
                                        margin-top: 0.75rem;
                                        font-size: 0.85rem;
                                        line-height: 1.3;
                                        word-break: break-word;
                                    ">${escapeHtml(nama)}</div>
                                    <div style="
                                        font-size: 0.75rem;
                                        color: var(--text-muted);
                                        margin-top: 0.25rem;
                                        font-weight: 500;
                                        word-break: break-word;
                                    ">${escapeHtml(jabatan)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } catch (e) {
                console.error('[index] renderPengurus error:', e);
                body.innerHTML = '<p style="text-align: center; padding: 3rem 0; color: #dc2626;">Gagal memuat pengurus.</p>';
                info.textContent = '';
            }
        }

        // === RENDER ANGGOTA ===
        async function renderAnggota() {
            body.innerHTML = `
                <div style="text-align: center; padding: 3rem 0;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--text-main);"></i>
                    <p style="color: var(--text-muted); margin-top: 0.5rem; font-size: 0.875rem;">Memuat anggota...</p>
                </div>
            `;

            try {
                if (!dataCache.anggota) {
                    const res = await apiCall('getUsers', 'POST', {});
                    dataCache.anggota = (res && res.success && Array.isArray(res.data)) ? res.data : [];
                }

                const data = dataCache.anggota
                    .filter(u => u.status === 'approved' || !u.status)
                    .sort((a, b) => String(a.nama || a.name || '').localeCompare(String(b.nama || b.name || '')));

                if (data.length === 0) {
                    body.innerHTML = '<p style="text-align: center; padding: 3rem 0; color: var(--text-muted); font-style: italic;">Belum ada data anggota.</p>';
                    info.textContent = '';
                    return;
                }

                info.textContent = `Menampilkan ${data.length} anggota terdaftar`;

                body.innerHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem;">
                        ${data.map(u => {
                            const nama = u.nama || u.name || u.username || 'Anonim';
                            const role = u.role || 'member';
                            const alamat = u.alamat || u.kalurahan || u.address || '';
                            const initials = getInitials(nama);
                            const isAdmin = role === 'admin';

                            return `
                                <div style="
                                    display: flex;
                                    align-items: center;
                                    gap: 0.75rem;
                                    padding: 0.75rem;
                                    background: var(--bg-stats);
                                    border-radius: 0.5rem;
                                    border: 1px solid var(--card-border);
                                ">
                                    <div style="
                                        width: 2.5rem;
                                        height: 2.5rem;
                                        border-radius: 50%;
                                        background: ${isAdmin ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#3b82f6,#2563eb)'};
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        color: white;
                                        font-size: 0.75rem;
                                        font-weight: 700;
                                        flex-shrink: 0;
                                    ">${escapeHtml(initials)}</div>
                                    <div style="min-width: 0; flex: 1;">
                                        <div style="
                                            font-weight: 600;
                                            color: var(--text-main);
                                            font-size: 0.85rem;
                                            overflow: hidden;
                                            text-overflow: ellipsis;
                                            white-space: nowrap;
                                        ">${escapeHtml(nama)}</div>
                                        <div style="
                                            font-size: 0.7rem;
                                            color: var(--text-muted);
                                            overflow: hidden;
                                            text-overflow: ellipsis;
                                            white-space: nowrap;
                                            margin-top: 0.15rem;
                                        ">
                                            ${isAdmin
                                                ? '<i class="fas fa-shield-alt" style="color:#dc2626;"></i> Admin'
                                                : '<i class="fas fa-user" style="color:#2563eb;"></i> Member'}
                                            ${alamat ? ' • ' + escapeHtml(alamat) : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } catch (e) {
                console.error('[index] renderAnggota error:', e);
                body.innerHTML = '<p style="text-align: center; padding: 3rem 0; color: #dc2626;">Gagal memuat anggota.</p>';
                info.textContent = '';
            }
        }

        // === RENDER DIAGRAM ===
        async function renderDiagram() {
            body.innerHTML = `
                <div id="index-modal-diagram" style="
                    position: relative;
                    width: 100%;
                    min-height: 500px;
                    border: 2px dashed var(--card-border);
                    border-radius: 0.75rem;
                    background: var(--bg-stats);
                    padding: 1rem;
                    overflow: auto;
                ">
                    <div id="index-modal-diagram-loading" style="
                        text-align: center;
                        padding: 3rem 0;
                        color: var(--text-muted);
                        font-size: 0.875rem;
                    ">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                        <p style="margin-top: 0.5rem;">Memuat diagram...</p>
                    </div>
                </div>
            `;

            info.textContent = 'Diagram struktur organisasi';

            const container = document.getElementById('index-modal-diagram');
            const loading = document.getElementById('index-modal-diagram-loading');

            await ensureLib('jsplumb');

            if (typeof jsPlumb === 'undefined') {
                if (loading) {
                    loading.innerHTML = `
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #f59e0b;"></i>
                        <p style="margin-top: 0.5rem;">Pustaka diagram belum siap.</p>
                        <p style="font-size: 0.75rem; margin-top: 0.25rem;">Coba refresh halaman.</p>
                    `;
                }
                return;
            }

            if (modalDiagramInstance) {
                try { modalDiagramInstance.reset(); } catch (e) {}
                modalDiagramInstance = null;
            }

            try {
                if (!dataCache.diagram) {
                    const res = await apiCall('getProfil', 'POST', {});
                    const item = (res && res.success && Array.isArray(res.data))
                        ? res.data.find(p => p.key === 'struktur_diagram')
                        : null;

                    if (item && item.content) {
                        try {
                            dataCache.diagram = JSON.parse(item.content);
                        } catch (err) {
                            dataCache.diagram = null;
                        }
                    } else {
                        dataCache.diagram = null;
                    }
                }

                const data = dataCache.diagram;

                if (!data || !data.nodes || data.nodes.length === 0) {
                    if (loading) {
                        loading.innerHTML = `
                            <i class="fas fa-sitemap" style="font-size: 2rem; opacity: 0.4;"></i>
                            <p style="margin-top: 0.5rem;">Belum ada diagram struktur.</p>
                            <p style="font-size: 0.75rem; margin-top: 0.25rem;">Silakan atur diagram di halaman Profil Admin.</p>
                        `;
                    }
                    return;
                }

                if (loading) loading.style.display = 'none';
                if (container) container.innerHTML = '';

                modalDiagramInstance = jsPlumb.getInstance({
                    Connector: ['Straight', { gap: 5 }],
                    PaintStyle: { strokeWidth: 2, stroke: '#0f2922' },
                    Endpoint: ['Rectangle', { width: 12, height: 12 }],
                    EndpointStyle: { fill: '#0f2922' },
                    Anchors: ['Right', 'Left', 'Top', 'Bottom'],
                    Container: container
                });

                (data.nodes || []).forEach(n => {
                    const node = document.createElement('div');
                    node.id = 'modal-node-' + n.id;
                    node.style.position = 'absolute';
                    node.style.left = (n.x || 0) + 'px';
                    node.style.top = (n.y || 0) + 'px';
                    node.style.width = (n.width || 120) + 'px';
                    node.style.height = (n.height || 50) + 'px';
                    node.style.background = 'var(--card-bg)';
                    node.style.border = '2px solid ' + (n.color || '#0f2922');
                    node.style.borderRadius = '8px';
                    node.style.padding = '0.5rem';
                    node.style.textAlign = 'center';
                    node.style.fontSize = '0.8rem';
                    node.style.fontWeight = '500';
                    node.style.color = 'var(--text-main)';
                    node.style.display = 'flex';
                    node.style.alignItems = 'center';
                    node.style.justifyContent = 'center';
                    node.style.wordBreak = 'break-word';
                    node.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                    node.textContent = n.label || '';

                    container.appendChild(node);

                    try {
                        modalDiagramInstance.addEndpoint(node.id, { anchor: 'Right', uuid: node.id + '-right' });
                        modalDiagramInstance.addEndpoint(node.id, { anchor: 'Left', uuid: node.id + '-left' });
                        modalDiagramInstance.addEndpoint(node.id, { anchor: 'Top', uuid: node.id + '-top' });
                        modalDiagramInstance.addEndpoint(node.id, { anchor: 'Bottom', uuid: node.id + '-bottom' });
                    } catch (e) {}
                });

                (data.connections || []).forEach(c => {
                    try {
                        modalDiagramInstance.connect({
                            uuids: ['modal-node-' + c.source + '-bottom', 'modal-node-' + c.target + '-top']
                        });
                    } catch (e) {}
                });

                setTimeout(() => {
                    if (modalDiagramInstance) {
                        try { modalDiagramInstance.repaintEverything(); } catch (e) {}
                    }
                }, 150);

            } catch (e) {
                console.error('[index] renderDiagram error:', e);
                if (loading) loading.textContent = 'Gagal memuat diagram.';
            }
        }

        // === ATTACH EVENTS ===
        closeBtn.addEventListener('click', closeModal);
        okBtn.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = 'var(--card-border)';
            closeBtn.style.transform = 'scale(1.05)';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'var(--bg-stats)';
            closeBtn.style.transform = 'scale(1)';
        });

        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });

        const freshShow = showBtn.cloneNode(true);
        showBtn.parentNode.replaceChild(freshShow, showBtn);
        freshShow.addEventListener('click', openModal);

        console.log('[index] ✅ Structure modal siap (multi-tab)');
    }

    // ================================================================
    // 16. AOS INIT
    // ================================================================
    function initAOS() {
        if (typeof AOS === 'undefined') return;
        try {
            AOS.init({
                duration: 800,
                once: true,
                offset: 100,
                disable: window.innerWidth < 640
            });
        } catch (e) {
            console.warn('[index] AOS init error:', e);
        }
    }

    // ================================================================
    // 17. DARK MODE LISTENER
    // ================================================================
    function attachDarkModeListener() {
        if (isDarkModeListenerAttached) return;
        isDarkModeListenerAttached = true;

        document.addEventListener('click', function(e) {
            const btn = e.target.closest('#theme-toggle, #theme-toggle-mobile');
            if (btn && calendarInstance) {
                setTimeout(() => {
                    loadKalender();
                }, 300);
            }
        });
    }

    // ================================================================
    // 18. INIT
    // ================================================================
    async function init() {
        console.log('[index] Init dimulai');

        abortController = new AbortController();

        // 1) Init scroll spy & scroll-to-top
        initScrollAnimations();
        initScrollTop();

        // 2) Init modal multi-tab
        initStructureModal();

        // 3) Dark mode listener
        attachDarkModeListener();

        // 4) AOS lazy init
        ensureLib('aos').then(() => initAOS());

        // 5) Load semua section paralel
        Promise.allSettled([
            loadProfilData(),
            loadStruktur(),
            loadVillageStats(),
            loadKeuangan(),
            loadBerita(),
            loadGaleri(),
            loadArsipDokumen(),
            loadKalender()
        ]).then(results => {
            const ok = results.filter(r => r.status === 'fulfilled').length;
            const fail = results.length - ok;
            console.log(`[index] Sections loaded: ${ok} ok, ${fail} fail`);
        });

        // 6) Handle pending scroll
        handlePendingScroll();

        console.log('[index] Init selesai (data loading di background)');
    }

    // ================================================================
    // 19. CLEANUP
    // ================================================================
    function cleanup() {
        window.__indexLoaded = false;

        if (abortController) {
            try { abortController.abort(); } catch (e) {}
            abortController = null;
        }

        if (scrollListener) {
            window.removeEventListener('scroll', scrollListener);
            scrollListener = null;
        }

        if (scrollTopHandler) {
            window.removeEventListener('scroll', scrollTopHandler);
            scrollTopHandler = null;
        }

        if (galeriSwiper) {
            try { galeriSwiper.destroy(true, true); } catch (e) {}
            galeriSwiper = null;
        }

        if (calendarInstance) {
            try { calendarInstance.destroy(); } catch (e) {}
            calendarInstance = null;
        }

        // Cleanup modal
        const modal = document.getElementById('index-structure-modal');
        if (modal) modal.remove();

        // Cleanup floral parallax (dari view)
        if (typeof window.__heroFloralCleanup === 'function') {
            try { window.__heroFloralCleanup(); } catch (e) {}
            window.__heroFloralCleanup = null;
        }

        isDarkModeListenerAttached = false;

        console.log('[index] Cleanup selesai');
    }

    window.__indexCleanup = cleanup;

    // ================================================================
    // 20. START
    // ================================================================
    init();
});