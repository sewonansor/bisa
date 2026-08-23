/**
 * js/keuangan.js - Modul Keuangan Publik (Transparansi)
 * Versi: 1.0.0 - Final Fix (Stable, No Error, Informatif)
 */

App.register('keuangan', function() {
    console.log('Modul keuangan dijalankan');

    // ============================================================
    // 1. AMBIL ELEMEN UTAMA
    // ============================================================
    const summaryContainer = document.getElementById('keuangan-summary');
    const chartContainer = document.getElementById('keuangan-chart');
    const recentContainer = document.getElementById('keuangan-recent');

    if (!summaryContainer || !chartContainer || !recentContainer) {
        console.error('keuangan: elemen utama tidak ditemukan.');
        return;
    }

    // ============================================================
    // 2. FORMAT HELPERS (fallback jika belum ada)
    // ============================================================
    function formatRupiah(a) {
        if (typeof window.formatRupiah === 'function') return window.formatRupiah(a);
        if (!a && a !== 0) return 'Rp 0';
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(a);
    }

    function formatDate(d) {
        if (typeof window.formatDate === 'function') return window.formatDate(d);
        if (!d) return '-';
        const date = new Date(d);
        return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // ============================================================
    // 3. LOAD DATA KEUANGAN
    // ============================================================
    async function loadData() {
        // Tampilkan loading
        summaryContainer.innerHTML = '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
        chartContainer.innerHTML = '';
        recentContainer.innerHTML = '';

        try {
            // Gunakan endpoint khusus publik jika tersedia, fallback ke getKeuangan
            let result;
            try {
                result = await apiCall('getKeuanganPublik', 'POST', {});
            } catch (e) {
                result = await apiCall('getKeuangan', 'POST', {});
            }

            if (result.success && result.data) {
                // Jika data dari publik berupa objek ringkasan
                if (result.data.totalMasuk !== undefined) {
                    renderDashboardFromSummary(result.data);
                } else if (Array.isArray(result.data)) {
                    // Jika masih array transaksi (fallback)
                    renderDashboardFromTransactions(result.data);
                } else {
                    showError('Format data tidak dikenali.');
                }
            } else {
                showError(result.message || 'Gagal memuat data keuangan.');
            }
        } catch (error) {
            console.error('Error load keuangan:', error);
            showError('Terjadi kesalahan: ' + error.message);
        }
    }

    // ============================================================
    // 4. RENDER DARI RINGKASAN PUBLIK (jika endpoint publik ada)
    // ============================================================
    function renderDashboardFromSummary(data) {
        // Data: { totalMasuk, totalKeluar, saldo, transactions: [...] }
        const { totalMasuk, totalKeluar, saldo, transactions } = data;

        // Render ringkasan
        summaryContainer.innerHTML = `
            <div class="stat-card">
                <div class="icon text-green-600"><i class="fas fa-arrow-down"></i></div>
                <div class="value text-green-600">${formatRupiah(totalMasuk)}</div>
                <div class="label">Total Pemasukan</div>
            </div>
            <div class="stat-card">
                <div class="icon text-red-600"><i class="fas fa-arrow-up"></i></div>
                <div class="value text-red-600">${formatRupiah(totalKeluar)}</div>
                <div class="label">Total Pengeluaran</div>
            </div>
            <div class="stat-card">
                <div class="icon text-blue-600"><i class="fas fa-wallet"></i></div>
                <div class="value">${formatRupiah(saldo)}</div>
                <div class="label">Saldo Akhir</div>
            </div>
        `;

        // Render grafik batang
        const maxValue = Math.max(totalMasuk, totalKeluar, 1);
        const masukHeight = Math.round((totalMasuk / maxValue) * 100);
        const keluarHeight = Math.round((totalKeluar / maxValue) * 100);

        chartContainer.innerHTML = `
            <div class="flex flex-col items-center">
                <div class="chart-bar bg-green-500" style="height: ${masukHeight}%;">
                    <span class="bar-value">${formatRupiah(totalMasuk)}</span>
                    <span class="bar-label">Pemasukan</span>
                </div>
            </div>
            <div class="flex flex-col items-center">
                <div class="chart-bar bg-red-500" style="height: ${keluarHeight}%;">
                    <span class="bar-value">${formatRupiah(totalKeluar)}</span>
                    <span class="bar-label">Pengeluaran</span>
                </div>
            </div>
        `;

        // Render transaksi terbaru (5 terakhir)
        if (transactions && transactions.length > 0) {
            recentContainer.innerHTML = transactions.map(t => {
                const isIncome = t.jenis === 'Pemasukan';
                return `
                    <div class="transaction-item">
                        <div class="txn-icon ${isIncome ? 'income' : 'expense'}">
                            <i class="fas ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                        </div>
                        <div class="txn-detail">
                            <div class="txn-desc">${t.kategori || 'Transaksi'}</div>
                            <div class="txn-date">${formatDate(t.tanggal)}</div>
                        </div>
                        <div class="txn-amount ${isIncome ? 'income' : 'expense'}">
                            ${isIncome ? '+' : '-'}${formatRupiah(Number(t.jumlah) || 0)}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            recentContainer.innerHTML = '<p class="text-center text-[var(--text-muted)] py-4">Belum ada transaksi.</p>';
        }
    }

    // ============================================================
    // 5. RENDER DARI ARRAY TRANSAKSI (fallback)
    // ============================================================
    function renderDashboardFromTransactions(transactions) {
        let totalMasuk = 0, totalKeluar = 0;
        transactions.forEach(t => {
            const j = Number(t.jumlah) || 0;
            if (t.jenis === 'Pemasukan') totalMasuk += j;
            else totalKeluar += j;
        });
        const saldo = totalMasuk - totalKeluar;

        // Render ringkasan
        summaryContainer.innerHTML = `
            <div class="stat-card">
                <div class="icon text-green-600"><i class="fas fa-arrow-down"></i></div>
                <div class="value text-green-600">${formatRupiah(totalMasuk)}</div>
                <div class="label">Total Pemasukan</div>
            </div>
            <div class="stat-card">
                <div class="icon text-red-600"><i class="fas fa-arrow-up"></i></div>
                <div class="value text-red-600">${formatRupiah(totalKeluar)}</div>
                <div class="label">Total Pengeluaran</div>
            </div>
            <div class="stat-card">
                <div class="icon text-blue-600"><i class="fas fa-wallet"></i></div>
                <div class="value">${formatRupiah(saldo)}</div>
                <div class="label">Saldo Akhir</div>
            </div>
        `;

        // Render grafik batang
        const maxValue = Math.max(totalMasuk, totalKeluar, 1);
        const masukHeight = Math.round((totalMasuk / maxValue) * 100);
        const keluarHeight = Math.round((totalKeluar / maxValue) * 100);

        chartContainer.innerHTML = `
            <div class="flex flex-col items-center">
                <div class="chart-bar bg-green-500" style="height: ${masukHeight}%;">
                    <span class="bar-value">${formatRupiah(totalMasuk)}</span>
                    <span class="bar-label">Pemasukan</span>
                </div>
            </div>
            <div class="flex flex-col items-center">
                <div class="chart-bar bg-red-500" style="height: ${keluarHeight}%;">
                    <span class="bar-value">${formatRupiah(totalKeluar)}</span>
                    <span class="bar-label">Pengeluaran</span>
                </div>
            </div>
        `;

        // Render transaksi terbaru (5 terakhir)
        const recent = transactions.slice(-5).reverse();
        if (recent.length > 0) {
            recentContainer.innerHTML = recent.map(t => {
                const isIncome = t.jenis === 'Pemasukan';
                return `
                    <div class="transaction-item">
                        <div class="txn-icon ${isIncome ? 'income' : 'expense'}">
                            <i class="fas ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                        </div>
                        <div class="txn-detail">
                            <div class="txn-desc">${t.kategori || 'Transaksi'}</div>
                            <div class="txn-date">${formatDate(t.tanggal)}</div>
                        </div>
                        <div class="txn-amount ${isIncome ? 'income' : 'expense'}">
                            ${isIncome ? '+' : '-'}${formatRupiah(Number(t.jumlah) || 0)}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            recentContainer.innerHTML = '<p class="text-center text-[var(--text-muted)] py-4">Belum ada transaksi.</p>';
        }
    }

    // ============================================================
    // 6. TAMPILKAN ERROR
    // ============================================================
    function showError(msg) {
        summaryContainer.innerHTML = `<div class="col-span-full text-center text-red-500 py-8">${msg}</div>`;
        chartContainer.innerHTML = '';
        recentContainer.innerHTML = '';
    }

    // ============================================================
    // 7. INISIALISASI
    // ============================================================
    loadData();
});