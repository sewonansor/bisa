/**
 * full js/index.js - Modul Halaman Beranda Publik
 * Versi: 3.1.0 - Final (Berita Profesional, Semua Menu Berfungsi)
 */

App.register('index', function() {
    console.log('Modul index dijalankan');

    // ========== UTILITY ==========
    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Helper ambil gambar pertama dari konten
    function getFirstImageFromContent(html) {
        if (!html) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        return img ? img.src : '';
    }

    // ========== SCROLL SPY NAVBAR ==========
    let scrollListener = null;

    function initScrollAnimations() {
        if (scrollListener) {
            window.removeEventListener('scroll', scrollListener);
        }

        const navbar = document.getElementById('navbar');
        const links = document.querySelectorAll('.nav-link[data-section]');
        const sections = document.querySelectorAll('section[id]');

        function updateActive() {
            if (navbar) navbar.classList.toggle('navbar-scrolled', window.scrollY > 50);

            let current = '';
            const scrollY = window.scrollY;
            const offset = 80;

            sections.forEach(section => {
                const sectionTop = section.offsetTop - offset;
                const sectionBottom = sectionTop + section.offsetHeight;
                if (scrollY >= sectionTop && scrollY < sectionBottom) {
                    current = section.id;
                }
            });

            if (!current && sections.length > 0) {
                current = sections[0].id;
            }

            links.forEach(link => {
                link.classList.toggle('active', link.dataset.section === current);
            });
        }

        updateActive();
        scrollListener = updateActive;
        window.addEventListener('scroll', scrollListener);
    }

    // ========== SCROLL TO TOP BUTTON ==========
    const scrollBtn = document.getElementById('scroll-top-btn');

    if (scrollBtn) {
        scrollBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        function toggleScrollButton() {
            const scrollY = window.scrollY;
            const windowHeight = window.innerHeight;
            const docHeight = document.documentElement.scrollHeight;

            if (scrollY > 300 || (scrollY + windowHeight >= docHeight - 100)) {
                scrollBtn.classList.add('show');
            } else {
                scrollBtn.classList.remove('show');
            }
        }

        toggleScrollButton();
        window.addEventListener('scroll', toggleScrollButton);
    }

    // ========== LOAD DATA PROFIL ==========
    async function loadProfilData() {
        try {
            const res = await apiCall('getProfil', 'POST', {});
            if (res.success && res.data) {
                const map = {};
                res.data.forEach(i => { map[i.key] = i.content; });
                const sejarahEl = document.getElementById('profil-sejarah');
                const visiMisiEl = document.getElementById('profil-visi-misi');
                if (sejarahEl) sejarahEl.innerHTML = map['sejarah'] || '<p class="text-[var(--text-muted)] italic">Belum ada data sejarah.</p>';
                if (visiMisiEl) visiMisiEl.innerHTML = map['visi_misi'] || '<p class="text-[var(--text-muted)] italic">Belum ada data visi misi.</p>';
            }
        } catch (e) { console.error('Error loading profil:', e); }
    }

    async function loadStruktur() {
        const container = document.getElementById('profil-struktur');
        if (!container) return;
        try {
            const res = await apiCall('getStruktur', 'POST', {});
            if (res.success && res.data.length > 0) {
                const limited = res.data.slice(0, 5);
                container.innerHTML = limited.map(item => `
                    <div class="flex flex-col items-center text-center p-3 rounded-lg hover:bg-[var(--card-border)] transition">
                        <img src="${item.foto_url || 'https://i.pravatar.cc/150?img=' + (Math.floor(Math.random() * 70) + 1)}" alt="${item.nama}" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover mb-3 shadow-sm border border-[var(--card-border)]">
                        <div class="font-medium text-xs sm:text-sm text-[var(--text-main)]">${item.nama || '-'}</div>
                        <div class="text-xs text-[var(--text-muted)] font-medium">${item.jabatan || '-'}</div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = `<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic">Belum ada data struktur organisasi.</p>`;
            }
        } catch (e) { console.error('Error loading struktur:', e); }
    }

    // ========== STATISTIK ANGGOTA ==========
    async function loadVillageStats() {
        const container = document.getElementById('village-stats');
        if (!container) return;
        try {
            const res = await apiCall('getUsers', 'POST', {});
            if (res.success && res.data.length > 0) {
                const villages = ['Panggungharjo','Bangunharjo','Pendowoharjo','Timbulharjo'];
                const counts = {};
                villages.forEach(v => counts[v] = 0);
                res.data.forEach(u => {
                    const a = (u.alamat || '').trim();
                    if (villages.includes(a)) counts[a]++;
                });
                let total = 0;
                const html = villages.map((v, idx) => {
                    total += counts[v];
                    return `<div class="stat-card p-6 rounded-2xl text-center" data-aos="fade-up" data-aos-delay="${idx * 100}">
                        <div class="text-xs sm:text-sm text-[var(--text-muted)] font-medium uppercase tracking-wider">${v}</div>
                        <div class="text-4xl sm:text-5xl font-bold text-[var(--text-main)] mt-2">${counts[v]}</div>
                        <div class="text-xs text-[var(--text-muted)] mt-1">Anggota</div>
                    </div>`;
                }).join('');
                container.innerHTML = html + `<div class="stat-card col-span-2 md:col-span-4 p-6 rounded-2xl text-center border-amber-200 bg-amber-50/50 dark:bg-amber-900/20" data-aos="fade-up" data-aos-delay="400">
                    <div class="text-xs sm:text-sm text-[var(--text-main)] font-medium uppercase tracking-wider">Total Anggota</div>
                    <div class="text-4xl sm:text-5xl font-bold text-[var(--text-main)] mt-2">${total}</div>
                </div>`;
            } else {
                container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8">Belum ada data anggota.</p>';
            }
        } catch (e) { console.error('Error load stats:', e); }
    }

    // ========== KEUANGAN ==========
    async function loadKeuangan() {
        const container = document.getElementById('keuangan-summary');
        if (!container) return;
        try {
            const result = await apiCall('getKeuanganPublik', 'POST', {});
            if (result.success && result.data) {
                const { totalMasuk, totalKeluar, saldo } = result.data;
                container.innerHTML = `
                    <div class="glass-card p-6 rounded-2xl text-center hover:scale-105 transition-transform duration-300">
                        <i class="fas fa-arrow-down text-3xl text-green-600 mb-2"></i>
                        <p class="text-sm text-[var(--text-muted)]">Total Pemasukan</p>
                        <p class="text-2xl font-bold text-[var(--text-main)]">${formatRupiah(totalMasuk)}</p>
                    </div>
                    <div class="glass-card p-6 rounded-2xl text-center hover:scale-105 transition-transform duration-300">
                        <i class="fas fa-arrow-up text-3xl text-red-600 mb-2"></i>
                        <p class="text-sm text-[var(--text-muted)]">Total Pengeluaran</p>
                        <p class="text-2xl font-bold text-[var(--text-main)]">${formatRupiah(totalKeluar)}</p>
                    </div>
                    <div class="glass-card p-6 rounded-2xl text-center hover:scale-105 transition-transform duration-300">
                        <i class="fas fa-wallet text-3xl text-blue-600 mb-2"></i>
                        <p class="text-sm text-[var(--text-muted)]">Saldo Akhir</p>
                        <p class="text-2xl font-bold text-[var(--text-main)]">${formatRupiah(saldo)}</p>
                    </div>
                `;
            } else {
                container.innerHTML = '<p class="text-center text-[var(--text-muted)] col-span-full">Data keuangan belum tersedia.</p>';
            }
        } catch (error) {
            console.error('Error load keuangan:', error);
            container.innerHTML = '<p class="text-center text-red-500 col-span-full">Gagal memuat data keuangan.</p>';
        }
    }

    // Fallback formatRupiah jika belum ada di global
    function formatRupiah(a) {
        if (typeof window.formatRupiah === 'function') return window.formatRupiah(a);
        if (!a && a !== 0) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a);
    }

    // ========== BERITA TERBARU (PROFESIONAL) ==========
    async function loadBerita() {
        const container = document.getElementById('berita-list');
        if (!container) return;

        // Tampilkan loading
        container.innerHTML = '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';

        try {
            // Ambil berita dan user sekaligus
            const [beritaRes, usersRes] = await Promise.all([
                apiCall('getBerita', 'POST', {}),
                apiCall('getUsers', 'POST', {})
            ]);

            if (!beritaRes.success) throw new Error(beritaRes.message || 'Gagal memuat berita');

            // Map user id -> nama
            const userMap = {};
            if (usersRes.success) {
                usersRes.data.forEach(u => userMap[u.id] = u.nama || u.username || 'Admin');
            }

            const data = beritaRes.data.slice(0, 4); // Ambil 4 berita terbaru

            if (data.length === 0) {
                container.innerHTML = '<p class="text-center text-[var(--text-muted)] col-span-full py-8">Belum ada berita.</p>';
                return;
            }

            // Render kartu profesional
            container.innerHTML = data.map((item, index) => {
                const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) || 'https://placehold.co/600x400/e2e8f0/475569?text=Berita+Ansor';
                const penulis = userMap[item.created_by] || 'Admin';
                const tanggal = item.tanggal ? formatDate(item.tanggal) : '';
                const isiSingkat = item.isi ? item.isi.replace(/<[^>]*>/g, '').substring(0, 120) + '...' : '';
                const tag = item.tag ? `<span class="text-xs font-semibold uppercase tracking-wide text-green-700 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">#${item.tag}</span>` : '';

                // Berita pertama sebagai featured (2 kolom)
                if (index === 0) {
                    return `
                        <a href="/berita_detail?id=${item.id}" class="featured-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-lg md:col-span-2 relative">
                            <div class="img-wrapper h-72 md:h-96 overflow-hidden relative">
                                <img src="${thumbnail}" alt="${item.judul}" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">
                                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
                            </div>
                            <div class="absolute bottom-0 left-0 p-6 text-white z-10">
                                <div class="flex items-center gap-2 mb-3">${tag}</div>
                                <h3 class="text-2xl md:text-3xl font-bold leading-tight mb-2 line-clamp-2">${item.judul}</h3>
                                <p class="text-sm text-gray-200 mb-3 line-clamp-2">${isiSingkat}</p>
                                <div class="flex items-center gap-3 text-xs">
                                    <span><i class="fas fa-user-circle mr-1"></i>${penulis}</span>
                                    <span><i class="far fa-calendar-alt mr-1"></i>${tanggal}</span>
                                </div>
                            </div>
                        </a>
                    `;
                } else {
                    // Kartu biasa (1 kolom)
                    return `
                        <a href="/berita_detail?id=${item.id}" class="berita-card group block overflow-hidden rounded-2xl bg-[var(--card-bg)] shadow-md hover:shadow-xl transition-shadow">
                            <div class="img-wrapper h-48 overflow-hidden">
                                <img src="${thumbnail}" alt="${item.judul}" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">
                            </div>
                            <div class="p-5">
                                <div class="flex items-center justify-between mb-3">
                                    <span class="text-xs font-semibold uppercase tracking-wide text-green-700 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">${tag || 'Berita'}</span>
                                    <span class="text-xs text-[var(--text-muted)]"><i class="far fa-calendar-alt mr-1"></i>${tanggal}</span>
                                </div>
                                <h3 class="text-lg font-bold text-[var(--text-main)] mb-2 line-clamp-2">${item.judul}</h3>
                                <p class="text-sm text-[var(--text-muted)] mb-4 line-clamp-2">${isiSingkat}</p>
                                <div class="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                                    <span class="text-xs text-[var(--text-muted)]"><i class="fas fa-user-circle mr-1"></i>${penulis}</span>
                                    <span class="text-sm font-semibold text-[var(--text-main)] group-hover:translate-x-1 transition-transform">Baca →</span>
                                </div>
                            </div>
                        </a>
                    `;
                }
            }).join('');
        } catch (error) {
            console.error('Error load berita:', error);
            container.innerHTML = '<p class="text-center text-red-500 col-span-full py-8">Gagal memuat berita.</p>';
        }
    }

    // ========== GALERI ==========
    let galeriSwiper = null;
    async function loadGaleri() {
        const wrapper = document.getElementById('galeri-wrapper');
        if (!wrapper) return;
        try {
            const res = await apiCall('getGaleri', 'POST', {});
            if (res.success && res.data.length > 0) {
                wrapper.innerHTML = res.data.map(item => {
                    const url = item.file_url || '';
                    const isImage = item.tipe === 'foto' || url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
                    let mediaHtml = '';
                    if (isYoutube) {
                        let videoId = '';
                        if (url.includes('v=')) videoId = url.split('v=')[1].split('&')[0];
                        else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];
                        mediaHtml = `<div class="w-full h-full"><iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoId}" title="${item.judul}" frameborder="0" allowfullscreen></iframe></div>`;
                    } else if (isImage) {
                        mediaHtml = `<img src="${url}" alt="${item.judul}" class="w-full h-full object-cover" loading="lazy" />`;
                    } else {
                        mediaHtml = `<div class="w-full h-full flex items-center justify-center bg-black"><video controls class="w-full h-full object-contain"><source src="${url}" type="video/mp4">Browser Anda tidak mendukung video.</video></div>`;
                    }
                    return `<div class="swiper-slide relative group h-[300px] sm:h-[400px]"><div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-end p-6"><h3 class="text-white font-semibold text-lg drop-shadow-md">${item.judul}</h3></div>${mediaHtml}</div>`;
                }).join('');
            } else {
                wrapper.innerHTML = `<div class="swiper-slide flex items-center justify-center bg-[var(--bg-body)] text-[var(--text-muted)] rounded-xl">Belum ada dokumentasi.</div>`;
            }
        } catch (error) {
            wrapper.innerHTML = `<div class="swiper-slide flex items-center justify-center bg-[var(--bg-body)] text-red-500 rounded-xl">Error: ${error.message}</div>`;
        } finally {
            if (galeriSwiper) { galeriSwiper.destroy(true, true); galeriSwiper = null; }
            if (document.querySelector('.galeriSwiper')) {
                galeriSwiper = new Swiper(".galeriSwiper", {
                    slidesPerView: 1, spaceBetween: 20,
                    autoplay: { delay: 4000, disableOnInteraction: false },
                    pagination: { el: ".galeriSwiper .swiper-pagination", clickable: true },
                    navigation: { nextEl: ".galeriSwiper .swiper-button-next", prevEl: ".galeriSwiper .swiper-button-prev" },
                    breakpoints: { 640: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } }
                });
            }
        }
    }

    // ========== ARSIP DOKUMEN ==========
    async function loadArsipDokumen() {
        const container = document.getElementById('arsip-dokumen-list');
        if (!container) return;
        try {
            const res = await apiCall('getArsip', 'POST', {});
            if (res.success && res.data.length > 0) {
                const data = res.data.slice(0, 6);
                container.innerHTML = data.map((item, i) => {
                    let iconClass = 'fa-file', label = 'File';
                    if (item.jenis === 'pdf') { iconClass = 'fa-file-pdf'; label = 'PDF'; }
                    else if (item.jenis === 'docx') { iconClass = 'fa-file-word'; label = 'DOCX'; }
                    else if (item.jenis === 'xlsx') { iconClass = 'fa-file-excel'; label = 'XLSX'; }
                    else if (item.jenis === 'img') { iconClass = 'fa-image'; label = 'Gambar'; }
                    else if (item.jenis === 'video') { iconClass = 'fa-video'; label = 'Video'; }
                    return `<div class="glass-card p-6 rounded-2xl flex flex-col justify-between h-full" data-aos="fade-up" data-aos-delay="${i * 100}">
                        <div><div class="flex items-start justify-between mb-3"><div class="flex items-center gap-3"><div class="text-3xl text-[var(--text-main)]"><i class="fas ${iconClass}"></i></div><div><h3 class="font-semibold text-[var(--text-main)] text-base">${item.judul || 'Dokumen'}</h3><p class="text-xs text-[var(--text-muted)]">${item.tahun || '-'} • ${label}</p></div></div><span class="text-xs px-3 py-1 bg-[var(--text-main)]/10 text-[var(--text-main)] rounded-full font-medium">${item.kategori || 'Umum'}</span></div><p class="text-sm text-[var(--text-muted)] line-clamp-2 mt-2">${item.deskripsi || ''}</p></div>
                        <div class="mt-4 pt-3 border-t border-[var(--card-border)] flex justify-between items-center"><span class="text-xs text-[var(--text-muted)]">${formatDate(item.created_at)}</span>${item.file_url ? `<a href="${item.file_url}" target="_blank" class="text-[var(--text-main)] hover:underline text-sm font-medium flex items-center gap-1"><i class="fas fa-download"></i> Download</a>` : ''}</div>
                    </div>`;
                }).join('');
            } else {
                container.innerHTML = '<p class="text-[var(--text-muted)] col-span-full text-center py-8 italic">Belum ada arsip dokumen.</p>';
            }
        } catch (e) { console.error('Error load arsip:', e); }
    }

    // ========== KALENDER / TIMELINE (tetap pakai getLogbook untuk kegiatan) ==========
    async function loadTimelineData() {
        const [logbookResult, eventsResult] = await Promise.all([
            apiCall('getLogbook', 'POST', {}), // Tetap untuk kalender kegiatan
            apiCall('getEvents', 'POST', {})
        ]);
        const events = [];
        if (logbookResult.success) {
            logbookResult.data.forEach(item => {
                events.push({
                    id: 'logbook_' + item.id,
                    title: '📋 ' + (item.kegiatan || 'Kegiatan'),
                    start: item.tanggal_mulai,
                    end: item.tanggal_selesai,
                    extendedProps: { type: 'kegiatan', deskripsi: item.deskripsi || '', tempat: item.tempat || '-' }
                });
            });
        }
        if (eventsResult.success) {
            eventsResult.data.forEach(item => {
                events.push({
                    id: 'evt_' + item.id,
                    title: '📌 ' + (item.title || 'Rencana'),
                    start: item.start,
                    end: item.end || item.start,
                    extendedProps: { type: 'rencana' }
                });
            });
        }
        return events;
    }

    function initCalendar(events) {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) return;

        const isDark = document.documentElement.classList.contains('dark');
        const kegiatanColor = isDark ? '#0f2922' : '#0f2922';
        const rencanaColor = isDark ? '#2dd4bf' : '#fbbf24';

        const enhancedEvents = events.map(e => {
            const isKegiatan = e.extendedProps.type === 'kegiatan';
            return {
                ...e,
                backgroundColor: isKegiatan ? kegiatanColor : rencanaColor,
                borderColor: isKegiatan ? kegiatanColor : rencanaColor,
                textColor: isKegiatan ? '#ffffff' : (isDark ? '#0b132b' : '#0f2922'),
                extendedProps: { ...e.extendedProps, icon: isKegiatan ? 'fa-calendar-check' : 'fa-calendar-plus' }
            };
        });

        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
            buttonText: { today: 'Hari Ini', month: 'Bulan', week: 'Minggu', list: 'Agenda' },
            firstDay: 1,
            dayMaxEvents: 3,
            events: enhancedEvents,
            eventDisplay: 'block',
            eventContent: function(arg) {
                const dot = document.createElement('div');
                dot.style.cssText = `display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: ${arg.event.backgroundColor};`;
                const title = document.createElement('span');
                title.textContent = arg.event.title;
                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.appendChild(dot);
                container.appendChild(title);
                return { domNodes: [container] };
            },
            eventClick: function(info) {
                const event = info.event;
                let detail = `📅 **${event.title}**\n\n`;
                detail += `📆 Mulai: ${event.start.toLocaleDateString('id-ID')}\n`;
                if (event.end && event.end.toDateString() !== event.start.toDateString()) {
                    detail += `📆 Selesai: ${event.end.toLocaleDateString('id-ID')}\n`;
                }
                if (event.extendedProps.tempat) {
                    detail += `📍 Tempat: ${event.extendedProps.tempat}\n`;
                }
                if (event.extendedProps.deskripsi) {
                    detail += `📝 Deskripsi: ${event.extendedProps.deskripsi}\n`;
                }
                alert(detail);
            },
            windowResize: function(view) {
                if (window.innerWidth < 768) calendar.changeView('listWeek');
                else calendar.changeView('dayGridMonth');
            }
        });
        calendar.render();
    }

    // ========== DIAGRAM STRUKTUR (MODAL) ==========
    let diagramInstance = null;
    async function loadDiagram() {
        const container = document.getElementById('diagram-container');
        const loading = document.getElementById('diagram-loading');
        if (diagramInstance) { diagramInstance.reset(); diagramInstance = null; }
        if (container) container.innerHTML = '';
        if (loading) { loading.style.display = 'block'; loading.textContent = 'Memuat diagram...'; }
        try {
            const res = await apiCall('getProfil', 'POST', {});
            if (res.success && container && loading) {
                const item = res.data.find(p => p.key === 'struktur_diagram');
                if (item && item.content) {
                    const data = JSON.parse(item.content);
                    loading.style.display = 'none';
                    if (typeof jsPlumb === 'undefined') {
                        loading.textContent = '⚠️ Pustaka diagram (jsPlumb) gagal dimuat.';
                        return;
                    }
                    diagramInstance = jsPlumb.getInstance({
                        Connector: ["Straight", { gap: 5 }], PaintStyle: { strokeWidth: 2, stroke: "#0f2922" },
                        Endpoint: ["Rectangle", { width: 12, height: 12 }], EndpointStyle: { fill: "#0f2922" },
                        Anchors: ["Right", "Left", "Top", "Bottom"], Container: container
                    });
                    data.nodes.forEach(nodeData => {
                        const node = document.createElement('div');
                        node.id = nodeData.id; node.className = 'node-box';
                        node.style.left = nodeData.x + 'px'; node.style.top = nodeData.y + 'px';
                        node.style.width = nodeData.width + 'px'; node.style.height = nodeData.height + 'px';
                        node.textContent = nodeData.label; container.appendChild(node);
                        diagramInstance.addEndpoint(nodeData.id, { anchor: "Right", uuid: nodeData.id + "-right" });
                        diagramInstance.addEndpoint(nodeData.id, { anchor: "Left", uuid: nodeData.id + "-left" });
                        diagramInstance.addEndpoint(nodeData.id, { anchor: "Top", uuid: nodeData.id + "-top" });
                        diagramInstance.addEndpoint(nodeData.id, { anchor: "Bottom", uuid: nodeData.id + "-bottom" });
                    });
                    data.connections.forEach(conn => diagramInstance.connect({ uuids: [conn.source + "-bottom", conn.target + "-top"] }));
                    setTimeout(() => diagramInstance.repaintEverything(), 100);
                } else { loading.textContent = 'Belum ada diagram struktur.'; }
            }
        } catch (error) { if (loading) loading.textContent = 'Error: ' + error.message; }
    }

    // Event listener untuk modal
    const showBtn = document.getElementById('show-full-structure');
    const modal = document.getElementById('structure-modal');
    const closeBtn = document.getElementById('close-structure-modal');
    if (showBtn && modal) {
        showBtn.addEventListener('click', function() {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            loadDiagram();
        });
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', function() {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            if (diagramInstance) { diagramInstance.reset(); diagramInstance = null; }
        });
    }
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === e.currentTarget) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
                if (diagramInstance) { diagramInstance.reset(); diagramInstance = null; }
            }
        });
    }

    // ========== INISIALISASI SEMUA ==========
    initScrollAnimations();

    loadProfilData();
    loadStruktur();
    loadVillageStats();
    loadKeuangan();
    loadBerita();
    loadGaleri();
    loadArsipDokumen();
    loadTimelineData().then(events => initCalendar(events));

    if (typeof AOS !== 'undefined') {
        AOS.init({ duration: 800, once: true });
    }
});