/**
 * js/surat_preview.js - Modul Preview & Cetak Surat Resmi
 * Versi: 1.0.0 - Final Fix (Stable, No Error, Defensive)
 */

App.register('surat_preview', function() {

    // ================================================================
    // 1. CEK AUTH (router sudah cek, tapi tetap amankan)
    // ================================================================
    const user = checkAuth();
    if (!user) {
        router.load('/auth');
        return;
    }

    // ================================================================
    // 2. AMBIL ID DARI URL
    // ================================================================
    const urlParams = new URLSearchParams(window.location.search);
    const suratId = urlParams.get('id');

    if (!suratId) {
        showToast('ID Surat tidak ditemukan!', 'error');
        setTimeout(() => router.load('/surat_admin'), 1000);
        return;
    }

    // ================================================================
    // 3. DOM ELEMENTS (dengan guard null)
    // ================================================================
    const loading = document.getElementById('preview-loading');
    const kopSurat = document.getElementById('kop-surat');
    const isiSurat = document.getElementById('isi-surat');
    const backBtn = document.getElementById('back-btn');
    const printBtn = document.getElementById('print-btn');

    const tanggalEl = document.getElementById('surat-tanggal');
    const nomorEl = document.getElementById('surat-nomor');
    const lampiranEl = document.getElementById('surat-lampiran');
    const perihalEl = document.getElementById('surat-perihal');
    const penerimaEl = document.getElementById('surat-penerima');
    const isiEl = document.getElementById('surat-isi');
    const pengirimEl = document.getElementById('surat-pengirim');

    // Jika elemen utama tidak ditemukan, hentikan modul
    if (!loading || !kopSurat || !isiSurat || !backBtn || !printBtn ||
        !tanggalEl || !nomorEl || !lampiranEl || !perihalEl ||
        !penerimaEl || !isiEl || !pengirimEl) {
        console.error('surat_preview: elemen penting tidak ditemukan.');
        return;
    }

    // ================================================================
    // 4. FORMAT TANGGAL INDONESIA
    // ================================================================
    function formatTanggalIndo(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    // ================================================================
    // 5. LOAD DATA SURAT
    // ================================================================
    async function loadSurat() {
        // Tampilkan loading
        loading.classList.remove('hidden');
        kopSurat.classList.add('hidden');
        isiSurat.classList.add('hidden');

        try {
            const result = await apiCall('getSurat', 'POST', {});

            if (result.success) {
                const surat = result.data.find(s => s.id === suratId);
                if (surat) {
                    renderSurat(surat);
                } else {
                    showToast('Surat tidak ditemukan.', 'error');
                    setTimeout(() => router.load('/surat_admin'), 1000);
                }
            } else {
                showToast(result.message || 'Gagal memuat data.', 'error');
                setTimeout(() => router.load('/surat_admin'), 1000);
            }
        } catch (error) {
            console.error('Error load surat:', error);
            showToast('Terjadi kesalahan: ' + error.message, 'error');
            loading.innerHTML = `<p class="text-red-500 text-center">Error: ${error.message}</p>`;
        }
    }

    // ================================================================
    // 6. RENDER SURAT
    // ================================================================
    function renderSurat(surat) {
        // Sembunyikan loading
        loading.classList.add('hidden');
        
        // Tampilkan kop dan isi
        kopSurat.classList.remove('hidden');
        isiSurat.classList.remove('hidden');

        // Isi data
        tanggalEl.textContent = "Bantul, " + formatTanggalIndo(surat.tanggal);
        nomorEl.textContent = surat.nomor_surat || '-';
        lampiranEl.textContent = surat.lampiran || '-';
        perihalEl.textContent = surat.perihal || '-';
        penerimaEl.textContent = surat.penerima || '-';
        isiEl.textContent = surat.isi || '-';
        pengirimEl.textContent = surat.pengirim || "Ketua PAC GP Ansor Sewon";
    }

    // ================================================================
    // 7. EVENT LISTENERS
    // ================================================================
    // Tombol Cetak / Simpan PDF
    if (printBtn) {
        printBtn.addEventListener('click', function() {
            window.print();
        });
    }

    // Tombol Kembali
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            // Kembali ke halaman surat admin (atau member jika role member)
            const dashUrl = user.role === 'admin' ? '/surat_admin' : '/surat_member';
            router.load(dashUrl);
        });
    }

    // ================================================================
    // 8. INISIALISASI PERTAMA KALI
    // ================================================================
    loadSurat();

});