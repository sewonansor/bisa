/**
 * js/kalender_admin.js
 * Modul Admin Kalender - Final (Cepat: Cache Lokal, Update Lokal, Tanpa Fetch Berulang)
 * Versi: 8.0.0 - Optimasi Kecepatan Tanpa Kurangi Fitur
 * Jumlah Baris: ±427
 */

App.register('kalender_admin', function() {
    // ================================================================
    // 1. CEK AUTH
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. GUARD INISIALISASI
    // ================================================================
    if (window.__kalenderAdminLoaded) return;
    window.__kalenderAdminLoaded = true;

    // ================================================================
    // 3. HELPER: TUNGGU ELEMEN DOM SIAP
    // ================================================================
    function waitForElements(ids, maxRetries = 30, interval = 100) {
        return new Promise((resolve) => {
            let attempts = 0;
            const elements = {};
            function check() {
                attempts++;
                let allFound = true;
                ids.forEach(id => {
                    if (!elements[id]) {
                        const el = document.getElementById(id);
                        if (el) elements[id] = el;
                        else allFound = false;
                    }
                });
                if (allFound || attempts >= maxRetries) resolve(elements);
                else setTimeout(check, interval);
            }
            check();
        });
    }

    // ================================================================
    // 4. INISIALISASI UTAMA
    // ================================================================
    async function init() {
        const requiredIds = [
            'calendar',
            'event-modal', 'event-modal-content', 'event-modal-title',
            'event-form', 'close-event-modal', 'delete-event-btn',
            'add-event-btn', 'event-id', 'event-title', 'event-start',
            'event-end', 'event-color',
            'kegiatan-modal', 'kegiatan-modal-content', 'kegiatan-modal-title',
            'kegiatan-form', 'close-kegiatan-modal', 'manage-kegiatan-btn',
            'kegiatan-list', 'kegiatan-form-title',
            'kegiatan-id', 'kegiatan-nama', 'kegiatan-tempat',
            'kegiatan-tanggal-mulai', 'kegiatan-tanggal-selesai',
            'kegiatan-peserta', 'kegiatan-anggaran', 'kegiatan-deskripsi',
            'kegiatan-file-url'
        ];

        const els = await waitForElements(requiredIds);

        const {
            'calendar': calendarEl,
            'event-modal': eventModal,
            'event-modal-content': eventModalContent,
            'event-modal-title': eventModalTitle,
            'event-form': eventForm,
            'close-event-modal': closeEventModalBtn,
            'delete-event-btn': deleteEventBtn,
            'add-event-btn': addEventBtn,
            'event-id': eventIdInput,
            'event-title': eventTitleInput,
            'event-start': eventStartInput,
            'event-end': eventEndInput,
            'event-color': eventColorSelect,
            'kegiatan-modal': kegiatanModal,
            'kegiatan-modal-content': kegiatanModalContent,
            'kegiatan-modal-title': kegiatanModalTitle,
            'kegiatan-form': kegiatanForm,
            'close-kegiatan-modal': closeKegiatanModalBtn,
            'manage-kegiatan-btn': manageKegiatanBtn,
            'kegiatan-list': kegiatanList,
            'kegiatan-form-title': kegiatanFormTitle,
            'kegiatan-id': kegiatanIdInput,
            'kegiatan-nama': kegiatanNamaInput,
            'kegiatan-tempat': kegiatanTempatInput,
            'kegiatan-tanggal-mulai': kegiatanTglMulaiInput,
            'kegiatan-tanggal-selesai': kegiatanTglSelesaiInput,
            'kegiatan-peserta': kegiatanPesertaInput,
            'kegiatan-anggaran': kegiatanAnggaranInput,
            'kegiatan-deskripsi': kegiatanDeskripsiInput,
            'kegiatan-file-url': kegiatanFileUrlInput
        } = els;

        if (!calendarEl || !eventModal || !kegiatanModal) {
            console.error('kalender_admin: elemen utama tidak ditemukan.');
            return;
        }

        // ================================================================
        // 5. STATE
        // ================================================================
        let calendarInstance = null;
        let editingKegiatanId = null;
        let editingEventId = null;

        // Cache lokal untuk data
        let lpjCache = [];
        let eventCache = [];

        // ================================================================
        // 6. LOAD DATA (Stale-While-Revalidate)
        // ================================================================
        async function loadAllData(force = false) {
            if (!force && (lpjCache.length > 0 || eventCache.length > 0)) {
                renderCalendarFromCache();
                fetchDataBackground();
                return;
            }

            try {
                const [lpjResult, eventsResult] = await Promise.all([
                    forceRefreshData('getLogbook', {}),
                    forceRefreshData('getEvents', {})
                ]);

                if (lpjResult.success) {
                    lpjCache = lpjResult.data || [];
                }
                if (eventsResult.success) {
                    eventCache = eventsResult.data || [];
                }

                renderCalendarFromCache();
            } catch (error) {
                console.error('Gagal memuat data kalender:', error);
            }
        }

        async function fetchDataBackground() {
            try {
                const [lpjResult, eventsResult] = await Promise.all([
                    forceRefreshData('getLogbook', {}),
                    forceRefreshData('getEvents', {})
                ]);

                if (lpjResult.success) {
                    lpjCache = lpjResult.data || [];
                }
                if (eventsResult.success) {
                    eventCache = eventsResult.data || [];
                }

                renderCalendarFromCache();
            } catch (e) {
                console.warn('Background refresh kalender gagal:', e);
            }
        }

        // ================================================================
        // 7. RENDER KALENDER DARI CACHE
        // ================================================================
        function renderCalendarFromCache() {
            const events = [];

            // Dari Logbook (kegiatan)
            lpjCache.forEach(item => {
                events.push({
                    id: 'lpj_' + item.id,
                    title: '📋 ' + (item.kegiatan || 'Kegiatan'),
                    start: item.tanggal_mulai,
                    end: item.tanggal_selesai,
                    backgroundColor: '#0f2922',
                    borderColor: '#0f2922',
                    textColor: '#ffffff',
                    extendedProps: {
                        type: 'kegiatan',
                        deskripsi: item.deskripsi || '',
                        tempat: item.tempat || '-',
                        data: item
                    }
                });
            });

            // Dari Events (rencana)
            eventCache.forEach(item => {
                events.push({
                    id: 'evt_' + item.id,
                    title: '📌 ' + (item.title || 'Rencana'),
                    start: item.start,
                    end: item.end || item.start,
                    backgroundColor: item.backgroundColor || '#2563eb',
                    borderColor: item.borderColor || '#2563eb',
                    textColor: '#ffffff',
                    extendedProps: {
                        type: 'rencana',
                        data: item
                    }
                });
            });

            if (calendarInstance) {
                calendarInstance.removeAllEvents();
                calendarInstance.addEventSource(events);
            } else {
                initCalendar(events);
            }
        }

        // ================================================================
        // 8. INISIALISASI FULLCALENDAR
        // ================================================================
        function initCalendar(events) {
            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,listWeek'
                },
                eventDisplay: 'block',
                dayMaxEvents: false,
                events: events,
                eventClick: function(info) {
                    // Jika event berasal dari lpj_ (kegiatan), tampilkan detail, bukan edit
                    if (info.event.id.startsWith('lpj_')) {
                        const e = info.event;
                        let detail = `📅 ${e.title}\n📆 Mulai: ${e.start.toLocaleDateString('id-ID')}`;
                        if (e.end && e.end.toDateString() !== e.start.toDateString()) {
                            detail += `\n📆 Selesai: ${e.end.toLocaleDateString('id-ID')}`;
                        }
                        if (e.extendedProps.tempat) detail += `\n📍 Tempat: ${e.extendedProps.tempat}`;
                        if (e.extendedProps.deskripsi) detail += `\n📝 Deskripsi: ${e.extendedProps.deskripsi}`;
                        showToast(detail, 'info', 6000);
                        return;
                    }
                    // Jika event adalah rencana (evt_), buka modal edit
                    if (info.event.id.startsWith('evt_')) {
                        openEventModal(info.event);
                    }
                },
                windowResize: function(view) {
                    calendarInstance.render();
                }
            });
            calendarInstance.render();
        }

        // ================================================================
        // 9. EVENT CRUD (Modal Cepat)
        // ================================================================
        function openEventModal(eventData = null) {
            const isEdit = !!eventData;
            if (eventModalTitle) eventModalTitle.textContent = isEdit ? 'Edit Event' : 'Tambah Event';
            if (eventForm) {
                eventIdInput.value = isEdit ? eventData.id.replace('evt_', '') : '';
                eventTitleInput.value = isEdit ? eventData.title : '';
                eventStartInput.value = isEdit ? eventData.startStr.slice(0, 16) : '';
                eventEndInput.value = isEdit && eventData.endStr ? eventData.endStr.slice(0, 16) : '';
                eventColorSelect.value = isEdit ? eventData.backgroundColor || '#2563eb' : '#2563eb';
            }
            if (deleteEventBtn) deleteEventBtn.classList.toggle('hidden', !isEdit);
            editingEventId = isEdit ? eventData.id.replace('evt_', '') : null;

            eventModal.classList.remove('hidden');
            eventModal.classList.add('flex');
            if (eventModalContent) {
                eventModalContent.classList.remove('scale-95', 'opacity-0');
                eventModalContent.classList.add('scale-100', 'opacity-100');
            }
        }

        function closeEventModal() {
            if (!eventModal || !eventModalContent) return;
            eventModalContent.classList.remove('scale-100', 'opacity-100');
            eventModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                eventModal.classList.add('hidden');
                eventModal.classList.remove('flex');
            }, 150);
            if (eventForm) eventForm.reset();
            if (deleteEventBtn) deleteEventBtn.classList.add('hidden');
            editingEventId = null;
        }

        // Event listeners modal event
        if (addEventBtn) addEventBtn.addEventListener('click', () => openEventModal());
        if (closeEventModalBtn) closeEventModalBtn.addEventListener('click', closeEventModal);
        if (eventModal) {
            eventModal.addEventListener('click', (e) => {
                if (e.target === eventModal) closeEventModal();
            });
        }

        // Delete event
        if (deleteEventBtn) {
            deleteEventBtn.addEventListener('click', function() {
                const id = editingEventId;
                if (!id) return;
                showConfirm('Apakah Anda yakin ingin menghapus event ini?', async () => {
                    const result = await apiCall('deleteEvent', 'POST', { id });
                    if (result.success) {
                        eventCache = eventCache.filter(e => e.id !== id);
                        renderCalendarFromCache();
                        closeEventModal();
                        await logActivity('DELETE', 'events', id, 'Menghapus event');
                        showToast('Event berhasil dihapus!', 'success');
                    } else {
                        showToast('Gagal menghapus event: ' + (result.message || ''), 'error');
                    }
                });
            });
        }

        // Submit event form
        if (eventForm) {
            eventForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const submitBtn = eventForm.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                const id = eventIdInput.value;
                const title = eventTitleInput.value;
                const start = eventStartInput.value;
                const end = eventEndInput.value || start;
                const color = eventColorSelect.value;

                const isEdit = !!id;
                const action = isEdit ? 'updateEvent' : 'createEvent';
                const data = { title, start, end, backgroundColor: color, borderColor: color };
                if (isEdit) data.id = id;

                try {
                    const result = await apiCall(action, 'POST', data);
                    if (result.success) {
                        // Update cache lokal
                        if (isEdit) {
                            const idx = eventCache.findIndex(e => e.id === id);
                            if (idx !== -1) {
                                eventCache[idx] = {
                                    ...eventCache[idx],
                                    title,
                                    start,
                                    end,
                                    backgroundColor: color,
                                    borderColor: color
                                };
                            }
                        } else {
                            const newItem = {
                                id: result.id,
                                title,
                                start,
                                end,
                                backgroundColor: color,
                                borderColor: color
                            };
                            eventCache.push(newItem);
                        }
                        renderCalendarFromCache();
                        closeEventModal();
                        await logActivity(isEdit ? 'UPDATE' : 'CREATE', 'events', result.id || id, `Event: ${title}`);
                        showToast('Event berhasil disimpan!', 'success');
                    } else {
                        showToast('Gagal menyimpan event: ' + (result.message || ''), 'error');
                    }
                } catch (error) {
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                }
            });
        }

        // ================================================================
        // 10. KEGIATAN (LOGBOOK) CRUD (Modal Cepat)
        // ================================================================
        function openKegiatanModal(editData = null) {
            editingKegiatanId = editData ? editData.id : null;
            if (kegiatanModalTitle) kegiatanModalTitle.textContent = 'Kelola Kegiatan';
            if (kegiatanForm) {
                kegiatanFormTitle.textContent = editData ? 'Edit Kegiatan' : 'Tambah Kegiatan';
                kegiatanIdInput.value = editData ? editData.id : '';
                kegiatanNamaInput.value = editData ? editData.kegiatan : '';
                kegiatanTempatInput.value = editData ? editData.tempat : '';
                kegiatanTglMulaiInput.value = editData ? editData.tanggal_mulai : '';
                kegiatanTglSelesaiInput.value = editData ? editData.tanggal_selesai : '';
                kegiatanPesertaInput.value = editData ? editData.peserta : '';
                kegiatanAnggaranInput.value = editData ? editData.anggaran : '';
                kegiatanDeskripsiInput.value = editData ? editData.deskripsi : '';
                kegiatanFileUrlInput.value = editData ? editData.file_url : '';
            }
            loadKegiatanList();

            kegiatanModal.classList.remove('hidden');
            kegiatanModal.classList.add('flex');
            if (kegiatanModalContent) {
                kegiatanModalContent.classList.remove('scale-95', 'opacity-0');
                kegiatanModalContent.classList.add('scale-100', 'opacity-100');
            }
        }

        function closeKegiatanModal() {
            if (!kegiatanModal || !kegiatanModalContent) return;
            kegiatanModalContent.classList.remove('scale-100', 'opacity-100');
            kegiatanModalContent.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                kegiatanModal.classList.add('hidden');
                kegiatanModal.classList.remove('flex');
            }, 150);
            if (kegiatanForm) kegiatanForm.reset();
            editingKegiatanId = null;
        }

        // Event listeners modal kegiatan
        if (manageKegiatanBtn) manageKegiatanBtn.addEventListener('click', () => openKegiatanModal());
        if (closeKegiatanModalBtn) closeKegiatanModalBtn.addEventListener('click', closeKegiatanModal);
        if (kegiatanModal) {
            kegiatanModal.addEventListener('click', (e) => {
                if (e.target === kegiatanModal) closeKegiatanModal();
            });
        }

        // Load daftar kegiatan di dalam modal
        async function loadKegiatanList() {
            if (!kegiatanList) return;
            if (lpjCache.length === 0) {
                // Jika cache kosong, ambil dari API
                const result = await forceRefreshData('getLogbook', {});
                if (result.success) {
                    lpjCache = result.data || [];
                } else {
                    kegiatanList.innerHTML = '<p class="text-red-500 text-center py-4">Gagal memuat data.</p>';
                    return;
                }
            }

            const data = lpjCache;
            if (data.length === 0) {
                kegiatanList.innerHTML = '<p class="text-gray-500 text-center py-4">Belum ada kegiatan.</p>';
                return;
            }
            let html = '';
            data.forEach(item => {
                html += `
                    <div class="flex justify-between items-center p-2 border-b hover:bg-gray-50/50">
                        <div>
                            <div class="font-medium">${item.kegiatan || '-'}</div>
                            <div class="text-xs text-gray-500">${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)} | ${item.tempat || '-'}</div>
                        </div>
                        <div>
                            <button onclick="editKegiatan('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteKegiatan('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
            });
            kegiatanList.innerHTML = html;
        }

        // Edit kegiatan dari list (global function)
        window.editKegiatan = function(id) {
            const item = lpjCache.find(l => l.id === id);
            if (item) openKegiatanModal(item);
            else showToast('Kegiatan tidak ditemukan di cache', 'warning');
        };

        // Delete kegiatan (global function)
        window.deleteKegiatan = function(id) {
            showConfirm('Apakah Anda yakin ingin menghapus kegiatan ini?', async () => {
                const result = await apiCall('deleteLogbook', 'POST', { id });
                if (result.success) {
                    lpjCache = lpjCache.filter(l => l.id !== id);
                    renderCalendarFromCache();
                    loadKegiatanList();
                    await logActivity('DELETE', 'logbook', id, `Menghapus kegiatan: ${kegiatanNamaInput.value}`);
                    showToast('Kegiatan berhasil dihapus!', 'success');
                } else {
                    showToast('Gagal menghapus kegiatan: ' + (result.message || ''), 'error');
                }
            });
        };

        // Submit kegiatan form
        if (kegiatanForm) {
            kegiatanForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const submitBtn = kegiatanForm.querySelector('button[type="submit"]');
                startLoading(submitBtn, 'Menyimpan...');

                const id = kegiatanIdInput.value;
                const data = {
                    kegiatan: kegiatanNamaInput.value,
                    tempat: kegiatanTempatInput.value,
                    tanggal_mulai: kegiatanTglMulaiInput.value,
                    tanggal_selesai: kegiatanTglSelesaiInput.value,
                    peserta: parseInt(kegiatanPesertaInput.value) || 0,
                    anggaran: parseInt(kegiatanAnggaranInput.value) || 0,
                    deskripsi: kegiatanDeskripsiInput.value,
                    file_url: kegiatanFileUrlInput.value || '',
                    created_by: user.id
                };
                const isEdit = !!id;
                const action = isEdit ? 'updateLogbook' : 'createLogbook';
                const payload = isEdit ? { id, ...data } : data;

                try {
                    const result = await apiCall(action, 'POST', payload);
                    if (result.success) {
                        // Update cache lokal
                        if (isEdit) {
                            const idx = lpjCache.findIndex(l => l.id === id);
                            if (idx !== -1) {
                                lpjCache[idx] = { ...lpjCache[idx], ...data, id: id };
                            }
                        } else {
                            const newItem = {
                                ...data,
                                id: result.id,
                                created_at: new Date().toISOString()
                            };
                            lpjCache.unshift(newItem);
                        }
                        renderCalendarFromCache();
                        loadKegiatanList();
                        closeKegiatanModal();
                        await logActivity(isEdit ? 'UPDATE' : 'CREATE', 'logbook', result.id || id, `Kegiatan: ${data.kegiatan}`);
                        showToast('Kegiatan berhasil disimpan!', 'success');
                    } else {
                        showToast('Gagal menyimpan kegiatan: ' + (result.message || ''), 'error');
                    }
                } catch (error) {
                    showToast('Error: ' + error.message, 'error');
                } finally {
                    stopLoading(submitBtn);
                }
            });
        }

        // ================================================================
        // 11. INISIALISASI
        // ================================================================
        loadAllData();
    }

    // ================================================================
    // 12. JALANKAN INIT
    // ================================================================
    init();
});