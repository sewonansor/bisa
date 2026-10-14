/**
 * js/kalender.js
 * Modul Kalender Kegiatan Publik - FULL FIX v2.0.0
 */

App.register('kalender', function() {
    'use strict';

    // ===== GUARD =====
    if (window.__kalenderPublicLoaded) return;
    window.__kalenderPublicLoaded = true;

    // ===== DOM =====
    const calendarEl = document.getElementById('calendar');
    const loadingEl  = document.getElementById('kalender-loading');
    const errorEl    = document.getElementById('kalender-error');
    const errorMsgEl = document.getElementById('kalender-error-msg');
    const retryBtn   = document.getElementById('kalender-retry-btn');
    const emptyEl    = document.getElementById('kalender-empty');

    if (!calendarEl || !loadingEl) { console.error('[kalender] Elemen tidak ditemukan.'); return; }

    // ===== STATE =====
    let calendarInstance = null;
    let isLoading = false;

    // ===== HELPERS =====
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function formatTanggalIndo(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    }

    async function ensureLib(name) {
        if (typeof window.loadLib === 'function') {
            try { await window.loadLib(name); return true; }
            catch (e) { return false; }
        }
        return false;
    }

    // ===== LOAD DATA =====
    async function loadTimelineData() {
        const [logbookRes, eventsRes] = await Promise.allSettled([
            apiCall('getLogbook', 'POST', {}),
            apiCall('getEvents', 'POST', {})
        ]);

        const events = [];

        if (logbookRes.status === 'fulfilled' && logbookRes.value && logbookRes.value.success) {
            (logbookRes.value.data || []).forEach(item => {
                if (!item.tanggal_mulai) return;
                const selesai = item.tanggal_selesai && item.tanggal_selesai !== item.tanggal_mulai
                    ? item.tanggal_selesai : null;
                events.push({
                    id: 'logbook_' + item.id,
                    title: item.kegiatan || 'Kegiatan',
                    start: item.tanggal_mulai,
                    end: selesai || item.tanggal_mulai,
                    allDay: true,
                    extendedProps: {
                        type: 'kegiatan',
                        kegiatan: item.kegiatan || 'Kegiatan',
                        tempat: item.tempat || '-',
                        deskripsi: stripHtml(item.deskripsi) || '',
                        peserta: item.peserta || 0,
                        anggaran: item.anggaran || 0,
                        raw: item
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
                    extendedProps: {
                        type: 'rencana',
                        kegiatan: item.title || 'Rencana',
                        tempat: '',
                        deskripsi: '',
                        raw: item
                    }
                });
            });
        }

        return events;
    }

    // ===== INIT CALENDAR =====
    function initCalendar(rawEvents) {
        if (typeof FullCalendar === 'undefined') {
            showError('Pustaka kalender gagal dimuat. Silakan refresh halaman.');
            return;
        }

        const dark = document.documentElement.classList.contains('dark');

        const events = rawEvents.map(e => {
            const isKegiatan = e.extendedProps.type === 'kegiatan';
            const color = isKegiatan ? '#16a34a' : (dark ? '#7c3aed' : '#2563eb');
            return Object.assign({}, e, {
                backgroundColor: color,
                borderColor: color,
                textColor: '#ffffff'
            });
        });

        if (events.length === 0) {
            loadingEl.classList.add('hidden');
            emptyEl && emptyEl.classList.remove('hidden');
        }

        try {
            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,listWeek'
                },
                buttonText: { today: 'Hari Ini', month: 'Bulan', week: 'Minggu', list: 'Agenda' },
                firstDay: 1,
                dayMaxEvents: 3,
                events: events,
                eventDisplay: 'block',
                height: 'auto',
                contentHeight: 'auto',
                eventContent: function(arg) {
                    const container = document.createElement('div');
                    container.style.cssText = 'display:flex;align-items:center;gap:4px;overflow:hidden;';
                    const dot = document.createElement('span');
                    dot.style.cssText = 'width:7px;height:7px;border-radius:50%;flex-shrink:0;background:' + arg.event.backgroundColor + ';';
                    container.appendChild(dot);
                    const title = document.createElement('span');
                    title.textContent = arg.event.title;
                    title.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                    container.appendChild(title);
                    return { domNodes: [container] };
                },
                eventClick: function(info) {
                    info.jsEvent.preventDefault();
                    showEventDetail(info.event);
                },
                datesSet: function() {
                    loadingEl.classList.add('hidden');
                    calendarEl.classList.remove('hidden');
                    if (rawEvents.length > 0 && emptyEl) emptyEl.classList.add('hidden');
                },
                windowResize: function() {
                    if (calendarInstance) calendarInstance.render();
                }
            });

            calendarInstance.render();

            setTimeout(() => {
                loadingEl.classList.add('hidden');
                calendarEl.classList.remove('hidden');
            }, 500);
        } catch (err) {
            console.error('[kalender] Render error:', err);
            showError('Gagal menampilkan kalender: ' + err.message);
        }
    }

    // ===== MODAL DETAIL =====
    function showEventDetail(event) {
        const props = event.extendedProps || {};
        const isKegiatan = props.type === 'kegiatan';

        let modal = document.getElementById('event-detail-modal');
        if (!modal) return;

        const modalContent = document.getElementById('event-detail-content');
        const modalIcon = document.getElementById('event-detail-icon');
        const modalBadge = document.getElementById('event-detail-badge');
        const modalTitle = document.getElementById('event-detail-title');
        const modalTanggal = document.getElementById('event-detail-tanggal');
        const modalTempat = document.getElementById('event-detail-tempat');
        const modalTempatWrap = document.getElementById('event-detail-tempat-wrap');
        const modalDeskripsi = document.getElementById('event-detail-deskripsi');
        const modalDeskWrap = document.getElementById('event-detail-deskripsi-wrap');

        if (isKegiatan) {
            modalIcon.style.background = '#16a34a';
            modalIcon.innerHTML = '<i class="fas fa-calendar-check"></i>';
            modalBadge.textContent = 'Kegiatan';
            modalBadge.style.cssText = 'background:rgba(22,163,74,0.15);color:#16a34a;';
        } else {
            modalIcon.style.background = '#2563eb';
            modalIcon.innerHTML = '<i class="fas fa-calendar-plus"></i>';
            modalBadge.textContent = 'Rencana';
            modalBadge.style.cssText = 'background:rgba(37,99,235,0.15);color:#2563eb;';
        }

        modalTitle.textContent = props.kegiatan || event.title || 'Detail';

        const startStr = formatTanggalIndo(event.startStr);
        let tanggalText = startStr;
        if (event.end) {
            const startDate = new Date(event.startStr);
            const endDate = new Date(event.endStr);
            const realEnd = new Date(endDate);
            realEnd.setDate(realEnd.getDate() - 1);
            if (realEnd.toDateString() !== startDate.toDateString()) {
                tanggalText = startStr + ' — ' + formatTanggalIndo(realEnd.toISOString());
            }
        }
        modalTanggal.textContent = tanggalText;

        if (props.tempat && props.tempat !== '-') {
            modalTempat.textContent = props.tempat;
            modalTempatWrap.classList.remove('hidden');
        } else {
            modalTempatWrap.classList.add('hidden');
        }

        const desk = (props.deskripsi || '').trim();
        if (desk) {
            modalDeskripsi.textContent = desk.length > 500 ? desk.slice(0, 500) + '...' : desk;
            modalDeskWrap.classList.remove('hidden');
        } else {
            modalDeskWrap.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        });
    }

    function closeModal() {
        const modal = document.getElementById('event-detail-modal');
        const content = document.getElementById('event-detail-content');
        if (!modal) return;
        if (content) {
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            document.body.style.overflow = '';
        }, 200);
    }

    function attachModalListeners() {
        const modal = document.getElementById('event-detail-modal');
        const closeBtn = document.getElementById('event-detail-close');
        const okBtn = document.getElementById('event-detail-ok');
        if (!modal) return;

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (okBtn) okBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });
    }

    // ===== ERROR =====
    function showError(msg) {
        loadingEl.classList.add('hidden');
        calendarEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
        if (errorMsgEl) errorMsgEl.textContent = msg || 'Gagal memuat kalender.';
    }

    // ===== LOAD & RENDER =====
    async function loadAndRender() {
        if (isLoading) return;
        isLoading = true;

        if (errorEl) errorEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        calendarEl.classList.add('hidden');
        loadingEl.classList.remove('hidden');

        await ensureLib('fullcalendar');

        try {
            const events = await loadTimelineData();

            if (calendarInstance) {
                try { calendarInstance.destroy(); } catch (e) {}
                calendarInstance = null;
            }

            initCalendar(events);
        } catch (err) {
            console.error('[kalender] Load error:', err);
            showError('Error: ' + err.message);
        } finally {
            isLoading = false;
        }
    }

    // ===== INIT =====
    console.log('[kalender] Init dimulai');
    attachModalListeners();

    if (retryBtn) {
        const fresh = retryBtn.cloneNode(true);
        retryBtn.parentNode.replaceChild(fresh, retryBtn);
        fresh.addEventListener('click', loadAndRender);
    }

    // Re-render saat dark mode berubah
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#theme-toggle, #theme-toggle-mobile');
        if (btn && calendarInstance) setTimeout(loadAndRender, 300);
    });

    loadAndRender();
});