/**
 * full js/kegiatan_admin.js
 * Modul Manajemen Kegiatan (Logbook) untuk Admin
 * Versi: 5.0.0 - Final Fix (Anti Stuck Skeleton, No Error)
 */

App.register('kegiatan_admin', function() {

    // ================================================================
    // 1. CEK AUTH (router sudah cek, tapi tetap amankan)
    // ================================================================
    const user = checkAuth();
    if (!user || user.role !== 'admin') {
        router.load('/auth');
        return;
    }

    // Guard untuk mencegah inisialisasi ganda saat navigasi bolak-balik
    if (window.__kegiatanAdminLoaded) return;
    window.__kegiatanAdminLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const tableBody = document.getElementById('kegiatan-table-body');
    const skeleton = document.getElementById('kegiatan-skeleton');
    const modal = document.getElementById('kegiatan-modal');
    const modalContent = document.getElementById('modal-content');
    const modalTitle = document.getElementById('modal-title');
    const form = document.getElementById('kegiatan-form');
    const closeBtn = document.getElementById('modal-close');
    const addBtn = document.getElementById('add-kegiatan-btn');
    const refreshBtn = document.getElementById('refresh-kegiatan-btn');

    // Pastikan elemen penting ada
    if (!tableBody || !modal || !form) {
        console.error('kegiatan_admin: elemen DOM tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. QUILL EDITOR SETUP (opsional, jika ada)
    // ================================================================
    let quill = null;
    const quillContainer = document.getElementById('kegiatan_deskripsi_editor');
    const hiddenDeskripsi = document.getElementById('kegiatan_deskripsi');

    // Inisialisasi Quill jika container dan library tersedia
    if (quillContainer && typeof Quill !== 'undefined') {
        quill = new Quill(quillContainer, {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                ]
            }
        });

        // Custom image handler untuk Quill (Upload ke Drive via app.js)
        quill.getModule('toolbar').addHandler('image', function() {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();

            input.onchange = async function() {
                const file = input.files[0];
                if (!file) return;
                const result = await uploadFileToDrive(file);
                if (result.success) {
                    const range = quill.getSelection();
                    quill.insertEmbed(range.index, 'image', result.url);
                } else {
                    showToast('Gagal upload gambar: ' + (result.message || ''), 'error');
                }
            };
        });
    }

    let isEdit = false;

    // ================================================================
    // 4. LOAD KEGIATAN - ANTI STUCK (langsung tampil spinner, data update setelah API)
    // ================================================================
    async function loadKegiatan() {
        // Sembunyikan skeleton, langsung tampilkan spinner di tabel
        if (skeleton) skeleton.classList.add('hidden');
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-[var(--text-muted)]">
            <i class="fas fa-spinner fa-spin mr-2"></i>Memuat data...
        </td></tr>`;

        // Timeout pengaman: jika API tidak merespon dalam 3 detik, tampilkan error
        let dataLoaded = false;
        const timeout = setTimeout(() => {
            if (!dataLoaded) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Gagal memuat data (timeout). Klik Refresh.</td></tr>`;
            }
        }, 3000);

        try {
            const result = await apiCall('getLogbook', 'POST', {});
            dataLoaded = true;
            clearTimeout(timeout);

            if (result.success && result.data.length > 0) {
                renderKegiatan(result.data);
            } else if (result.success && result.data.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-[var(--text-muted)]">Belum ada data kegiatan</td></tr>`;
            } else {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">${result.message || 'Gagal memuat data'}</td></tr>`;
            }
        } catch (error) {
            dataLoaded = true;
            clearTimeout(timeout);
            console.error('Error load kegiatan:', error);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500">Error: ${error.message}</td></tr>`;
        }
    }

    // ================================================================
    // 5. RENDER TABLE KEGIATAN
    // ================================================================
    function renderKegiatan(data) {
        let html = '';
        data.forEach((item, index) => {
            html += `
                <tr class="hover:bg-[var(--bg-stats)] transition-colors">
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${index + 1}</td>
                    <td class="px-6 py-4 text-sm font-medium text-[var(--text-main)]">${item.kegiatan || '-'}</td>
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatDate(item.tanggal_mulai)} - ${formatDate(item.tanggal_selesai)}</td>
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.tempat || '-'}</td>
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${item.peserta || 0}</td>
                    <td class="px-6 py-4 text-sm text-[var(--text-muted)]">${formatRupiah(item.anggaran || 0)}</td>
                    <td class="px-6 py-4 text-sm">
                        <button onclick="editKegiatan('${item.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fas fa-edit"></i></button>
                        <button onclick="deleteKegiatan('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;
    }

    // ================================================================
    // 6. EVENT LISTENERS (Tambah, Edit, Delete, Modal, Refresh)
    // ================================================================
    // Tambah Kegiatan
    addBtn.addEventListener('click', () => {
        isEdit = false;
        modalTitle.textContent = 'Tambah Kegiatan';
        form.reset();
        document.getElementById('kegiatan-id').value = '';
        if (quill) quill.root.innerHTML = '';
        document.getElementById('kegiatan_file').value = '';
        openModal();
    });

    // Tombol Refresh Manual
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            loadKegiatan();
            showToast('Data kegiatan diperbarui!', 'success');
        });
    }

    function openModal() {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }, 10);
    }

    function closeModal() {
        modalContent.classList.remove('scale-100', 'opacity-100');
        modalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // ================================================================
    // 7. EDIT KEGIATAN (global function untuk onclick)
    // ================================================================
    window.editKegiatan = async function(id) {
        try {
            const result = await apiCall('getLogbook', 'POST', {});
            if (result.success) {
                const item = result.data.find(l => l.id === id);
                if (item) {
                    isEdit = true;
                    modalTitle.textContent = 'Edit Kegiatan';
                    document.getElementById('kegiatan-id').value = item.id;
                    document.getElementById('kegiatan_nama').value = item.kegiatan || '';
                    document.getElementById('kegiatan_tempat').value = item.tempat || '';
                    document.getElementById('kegiatan_tanggal_mulai').value = item.tanggal_mulai || '';
                    document.getElementById('kegiatan_tanggal_selesai').value = item.tanggal_selesai || '';
                    document.getElementById('kegiatan_peserta').value = item.peserta || 0;
                    document.getElementById('kegiatan_anggaran').value = item.anggaran || 0;
                    if (quill) quill.root.innerHTML = item.deskripsi || '';
                    document.getElementById('kegiatan_file_url').value = item.file_url || '';
                    document.getElementById('kegiatan_file').value = '';
                    openModal();
                }
            }
        } catch (error) {
            showToast('Gagal mengambil data: ' + error.message, 'error');
        }
    };

    // ================================================================
    // 8. DELETE KEGIATAN (global function)
    // ================================================================
    window.deleteKegiatan = async function(id) {
        if (!confirm('Apakah Anda yakin ingin menghapus kegiatan ini?')) return;
        try {
            const result = await apiCall('deleteLogbook', 'POST', { id });
            if (result.success) {
                await logActivity('DELETE', 'logbook', id, `Menghapus kegiatan: ${document.getElementById('kegiatan_nama').value}`);
                loadKegiatan();
                showToast('Kegiatan berhasil dihapus!', 'success');
            } else {
                showToast(result.message || 'Gagal menghapus kegiatan', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        }
    };

    // ================================================================
    // 9. SUBMIT FORM (CREATE / UPDATE)
    // ================================================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const loadingState = startLoading(submitBtn, 'Menyimpan...');

        const id = document.getElementById('kegiatan-id').value;
        const fileInput = document.getElementById('kegiatan_file');
        let file_url = document.getElementById('kegiatan_file_url').value;

        // Jika ada file yang dipilih, upload ke Drive
        if (fileInput.files.length > 0) {
            const uploadResult = await uploadFileToDrive(fileInput.files[0]);
            if (uploadResult.success) {
                file_url = uploadResult.url;
            } else {
                showToast('Gagal upload file: ' + (uploadResult.message || ''), 'error');
                stopLoading(loadingState);
                return;
            }
        }

        // Ambil deskripsi dari Quill
        const deskripsi = quill ? quill.root.innerHTML : document.getElementById('kegiatan_deskripsi').value;

        const data = {
            kegiatan: document.getElementById('kegiatan_nama').value,
            tempat: document.getElementById('kegiatan_tempat').value,
            tanggal_mulai: document.getElementById('kegiatan_tanggal_mulai').value,
            tanggal_selesai: document.getElementById('kegiatan_tanggal_selesai').value,
            peserta: parseInt(document.getElementById('kegiatan_peserta').value) || 0,
            anggaran: parseInt(document.getElementById('kegiatan_anggaran').value) || 0,
            deskripsi: deskripsi,
            file_url: file_url,
            created_by: user.id
        };

        try {
            let result;
            if (isEdit) {
                result = await apiCall('updateLogbook', 'POST', { id, ...data });
            } else {
                result = await apiCall('createLogbook', 'POST', data);
            }

            if (result.success) {
                const actionType = isEdit ? 'UPDATE' : 'CREATE';
                const targetId = result.id || id;
                await logActivity(actionType, 'logbook', targetId, `Kegiatan: ${data.kegiatan}`);

                closeModal();
                loadKegiatan();
                form.reset();
                if (quill) quill.root.innerHTML = '';
                showToast('Kegiatan berhasil disimpan!', 'success');
            } else {
                showToast(result.message || 'Gagal menyimpan kegiatan', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        } finally {
            stopLoading(loadingState);
        }
    });

    // ================================================================
    // 10. INISIALISASI PERTAMA KALI
    // ================================================================
    loadKegiatan();

});