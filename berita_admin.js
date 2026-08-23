/**
 * full js/berita_admin.js
 * Modul Manajemen Berita untuk Admin
 * Versi: 2.0.0 - Final (CRUD, Tag, Thumbnail Otomatis, Anti Stuck)
 */

App.register('berita_admin', function() {

    // ================================================================
    // 1. CEK AUTH (router sudah cek, tapi tetap amankan)
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // Guard untuk mencegah inisialisasi ganda
    if (window.__beritaAdminLoaded) return;
    window.__beritaAdminLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const tableBody = document.getElementById('berita-table');
    const refreshBtn = document.getElementById('refresh-btn');
    const addBtn = document.getElementById('add-btn');
    const modal = document.getElementById('berita-modal');
    const modalTitle = document.getElementById('modal-title');
    const form = document.getElementById('berita-form');
    const closeBtn = document.getElementById('close-btn');
    const saveBtn = document.getElementById('save-btn');
    const idInput = document.getElementById('berita-id');
    const judulInput = document.getElementById('judul');
    const tagInput = document.getElementById('tag');
    const isiInput = document.getElementById('isi');
    const gambarInput = document.getElementById('gambar_url');
    const tanggalInput = document.getElementById('tanggal');

    // Jika elemen utama tidak ditemukan, hentikan modul
    if (!tableBody || !modal || !form) {
        console.error('berita_admin: elemen DOM tidak ditemukan.');
        return;
    }

    let isEdit = false;

    // ================================================================
    // 3. HELPER AMBIL GAMBAR PERTAMA DARI KONTEN
    // ================================================================
    function getFirstImageFromContent(html) {
        if (!html) return '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        return img ? img.src : '';
    }

    // ================================================================
    // 4. LOAD DATA BERITA (dengan timeout agar tidak stuck)
    // ================================================================
    async function loadBerita() {
        // Tampilkan loading
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-[var(--text-muted)]"><i class="fas fa-spinner fa-spin mr-2"></i>Memuat data...</td></tr>';

        // Timeout pengaman 3 detik
        let dataLoaded = false;
        const timeout = setTimeout(() => {
            if (!dataLoaded) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-red-500">Gagal memuat data (timeout). Klik Refresh.</td></tr>';
            }
        }, 3000);

        try {
            const result = await apiCall('getBerita', 'POST', {});
            dataLoaded = true;
            clearTimeout(timeout);

            if (result.success && result.data.length > 0) {
                renderTable(result.data);
            } else if (result.success && result.data.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-[var(--text-muted)]">Belum ada berita.</td></tr>';
            } else {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
            }
        } catch (error) {
            dataLoaded = true;
            clearTimeout(timeout);
            console.error('Error load berita:', error);
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
        }
    }

    // ================================================================
    // 5. RENDER TABEL BERITA
    // ================================================================
    function renderTable(data) {
        let html = '';
        data.forEach((item, index) => {
            // Tentukan thumbnail: jika gambar_url ada, gunakan itu, jika tidak ambil dari isi
            const thumbnail = item.gambar_url || getFirstImageFromContent(item.isi) || '';
            const gambarHtml = thumbnail
                ? `<img src="${thumbnail}" alt="${item.judul}" class="table-thumb" onerror="this.style.display='none'">`
                : '<span class="text-[var(--text-muted)]">-</span>';

            html += `
                <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${index + 1}</td>
                    <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.judul || '-'}</td>
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatDate(item.tanggal)}</td>
                    <td class="px-6 py-4 text-sm">
                        ${item.tag ? `<span class="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">#${item.tag}</span>` : '-'}
                    </td>
                    <td class="px-6 py-4 text-sm">${gambarHtml}</td>
                    <td class="px-6 py-4 text-sm">
                        <button onclick="editBerita('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteBerita('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    }

    // ================================================================
    // 6. EDIT BERITA (global function untuk onclick)
    // ================================================================
    window.editBerita = async function(id) {
        try {
            const result = await apiCall('getBerita', 'POST', {});
            if (result.success) {
                const item = result.data.find(b => b.id === id);
                if (item) {
                    isEdit = true;
                    modalTitle.textContent = 'Edit Berita';
                    idInput.value = item.id;
                    judulInput.value = item.judul || '';
                    tagInput.value = item.tag || '';
                    isiInput.value = item.isi || '';
                    gambarInput.value = item.gambar_url || '';
                    tanggalInput.value = item.tanggal ? item.tanggal.slice(0, 10) : new Date().toISOString().slice(0, 10);
                    openModal();
                }
            }
        } catch (error) {
            showToast('Gagal mengambil data: ' + error.message, 'error');
        }
    };

    // ================================================================
    // 7. DELETE BERITA (global function)
    // ================================================================
    window.deleteBerita = async function(id) {
        if (!confirm('Apakah Anda yakin ingin menghapus berita ini?')) return;
        try {
            const result = await apiCall('deleteBerita', 'POST', { id });
            if (result.success) {
                await logActivity('DELETE', 'berita', id, `Menghapus berita: ${judulInput.value}`);
                loadBerita();
                showToast('Berita berhasil dihapus!', 'success');
            } else {
                showToast(result.message || 'Gagal menghapus berita', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        }
    };

    // ================================================================
    // 8. EVENT LISTENERS (Tambah, Refresh, Modal, Submit)
    // ================================================================
    // Tambah Berita
    addBtn.addEventListener('click', () => {
        isEdit = false;
        modalTitle.textContent = 'Tambah Berita';
        form.reset();
        idInput.value = '';
        tanggalInput.value = new Date().toISOString().slice(0, 10);
        openModal();
    });

    // Refresh
    refreshBtn.addEventListener('click', function() {
        loadBerita();
        showToast('Data berita diperbarui!', 'success');
    });

    // Modal open/close
    function openModal() {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            const modalContent = modal.querySelector('div');
            if (modalContent) {
                modalContent.classList.remove('scale-95', 'opacity-0');
                modalContent.classList.add('scale-100', 'opacity-100');
            }
        }, 10);
    }

    function closeModal() {
        const modalContent = modal.querySelector('div');
        if (modalContent) {
            modalContent.classList.remove('scale-100', 'opacity-100');
            modalContent.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Submit form (Tambah / Edit)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const loadingState = startLoading(submitBtn, 'Menyimpan...');

        const id = idInput.value;
        let gambar_url = gambarInput.value;

        // Jika gambar_url kosong, ambil gambar pertama dari isi
        if (!gambar_url) {
            gambar_url = getFirstImageFromContent(isiInput.value);
        }

        const data = {
            judul: judulInput.value,
            tag: tagInput.value,
            isi: isiInput.value,
            gambar_url: gambar_url,
            tanggal: tanggalInput.value,
            created_by: user.id
        };

        try {
            let result;
            if (isEdit) {
                result = await apiCall('updateBerita', 'POST', { id, ...data });
            } else {
                result = await apiCall('createBerita', 'POST', data);
            }

            if (result.success) {
                const actionType = isEdit ? 'UPDATE' : 'CREATE';
                await logActivity(actionType, 'berita', result.id || id, `Berita: ${data.judul}`);
                closeModal();
                loadBerita();
                form.reset();
                showToast('Berita berhasil disimpan!', 'success');
            } else {
                showToast(result.message || 'Gagal menyimpan berita', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        } finally {
            stopLoading(loadingState);
        }
    });

    // ================================================================
    // 9. INISIALISASI PERTAMA KALI
    // ================================================================
    loadBerita();

});