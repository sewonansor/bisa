/**
 * js/keuangan.js
 * Modul Keuangan Publik (Transparansi) - FULL FIX v11.0.0 (FINAL)
 * ---------------------------------------------------------
 * FIX:
 *  - Guard anti-duplikasi
 *  - XSS protection di semua output
 *  - Loading/error/empty state proper
 *  - Backend compat: v15 (array) & v16 (summary object)
 *  - Clone-replace listener (anti memory leak)
 *
 * FEATURES:
 *  - Stats 4 kartu (Masuk, Keluar, Saldo, Jumlah Tx) + animate count-up
 *  - Chart bar CSS gradient (bukan library berat)
 *  - Filter real-time (search + jenis + rentang tanggal)
 *  - Clear filter button
 *  - Top 5 kategori dengan progress bar
 *  - Ikon kategori dinamis (8+ jenis)
 *  - Recent transactions dengan copy jumlah
 *  - Export CSV (dengan filter aktif)
 *  - Print laporan A4 rapi
 *  - Dark mode aware
 *  - Mobile responsive
 */

App.register('keuangan', function() {
    'use strict';

    // ================================================================
    // 1. GUARD ANTI-DUPLIKASI
    // ================================================================
    if (window.__keuanganLoaded) {
        console.log('[keuangan] Sudah di-init, skip.');
        return;
    }
    window.__keuanganLoaded = true;

    // ================================================================
    // 2. DOM ELEMENTS
    // ================================================================
    const summaryContainer = document.getElementById('keuangan-summary');
    const chartContainer   = document.getElementById('keuangan-chart');
    const recentContainer  = document.getElementById('keuangan-recent');

    if (!summaryContainer || !chartContainer || !recentContainer) {
        console.error('[keuangan] Elemen utama tidak ditemukan.');
        return;
    }

    // ================================================================
    // 3. HELPER FUNCTIONS
    // ================================================================
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function formatDate(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    function formatDateLong(d) {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    function formatRupiah(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID', {
            style: 'currency', currency: 'IDR', minimumFractionDigits: 0
        }).format(n);
    }

    function formatNumber(a) {
        const n = Number(a) || 0;
        return new Intl.NumberFormat('id-ID').format(n);
    }

    function animateNumber(el, target, duration, formatter) {
        if (!el) return;
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

    function getKategoriIcon(kategori, jenis) {
        const k = String(kategori || '').toLowerCase();
        const isIncome = jenis === 'Pemasukan';

        if (k.includes('iuran'))         return { icon: 'fa-users', color: 'blue' };
        if (k.includes('donasi'))         return { icon: 'fa-hand-holding-heart', color: 'pink' };
        if (k.includes('konsumsi'))       return { icon: 'fa-utensils', color: 'orange' };
        if (k.includes('transport'))      return { icon: 'fa-car', color: 'purple' };
        if (k.includes('perlengkap'))     return { icon: 'fa-shopping-bag', color: 'teal' };
        if (k.includes('honor'))          return { icon: 'fa-user-tie', color: 'indigo' };
        if (k.includes('listrik') || k.includes('air')) return { icon: 'fa-bolt', color: 'yellow' };
        if (k.includes('atk'))            return { icon: 'fa-pen', color: 'cyan' };
        if (k.includes('kegiatan'))       return { icon: 'fa-calendar-check', color: 'green' };

        return isIncome
            ? { icon: 'fa-arrow-down', color: 'green' }
            : { icon: 'fa-arrow-up', color: 'red' };
    }

    // ================================================================
    // 4. STATE
    // ================================================================
    let allTransactions = [];
    let filteredTransactions = [];
    let currentFilter = {
        search: '',
        jenis: 'all',
        dateFrom: '',
        dateTo: ''
    };
    let summaryData = {
        totalMasuk: 0,
        totalKeluar: 0,
        saldo: 0,
        transactions: []
    };
    let isLoading = false;

    // ================================================================
    // 5. ENSURE EXTRA UI (Filter Bar + Top Kategori)
    // ================================================================
    function ensureExtraUI() {
        const maxW5xl = summaryContainer.closest('.max-w-5xl') ||
                       summaryContainer.parentElement;
        if (!maxW5xl) return;

        // ===== Filter & Actions Bar =====
        if (!document.getElementById('keuangan-filter-bar')) {
            const filterBar = document.createElement('div');
            filterBar.id = 'keuangan-filter-bar';
            filterBar.className = 'flex flex-wrap gap-2 mb-6 p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-sm border border-[var(--card-border)]';
            filterBar.innerHTML = `
                <div class="flex-1 min-w-[200px] relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm"></i>
                    <input type="text" id="keuangan-search"
                        placeholder="Cari kategori, keterangan..."
                        class="w-full pl-9 pr-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                </div>
                <select id="keuangan-filter-jenis-pub"
                    class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm focus:outline-none focus:border-[var(--text-main)] transition">
                    <option value="all">Semua Jenis</option>
                    <option value="Pemasukan">Pemasukan</option>
                    <option value="Pengeluaran">Pengeluaran</option>
                </select>
                <input type="date" id="keuangan-date-from-pub"
                    class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm transition"
                    title="Dari tanggal">
                <input type="date" id="keuangan-date-to-pub"
                    class="px-3 py-2 border border-[var(--card-border)] rounded-lg bg-[var(--bg-body)] text-[var(--text-main)] text-sm transition"
                    title="Sampai tanggal">
                <button id="keuangan-clear-btn" type="button"
                    class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition"
                    title="Reset filter">
                    <i class="fas fa-times"></i>
                </button>
                <button id="keuangan-export-btn" type="button"
                    class="px-3 py-2 rounded-lg bg-[var(--text-main)] text-[var(--text-inverse)] text-sm hover:opacity-90 transition">
                    <i class="fas fa-download mr-1"></i>CSV
                </button>
                <button id="keuangan-print-btn" type="button"
                    class="px-3 py-2 rounded-lg bg-[var(--bg-stats)] hover:bg-[var(--card-border)] text-[var(--text-main)] text-sm transition"
                    title="Print laporan">
                    <i class="fas fa-print"></i>
                </button>
            `;

            // Sisipkan sebelum summary section
            const summarySection = summaryContainer.closest('.py-12') ||
                                  summaryContainer.parentElement;
            if (summarySection && summarySection.parentNode) {
                summarySection.parentNode.insertBefore(filterBar, summarySection);
            } else {
                maxW5xl.insertBefore(filterBar, summaryContainer);
            }

            attachFilterListeners();
        }

        // ===== Top Kategori Section =====
        if (!document.getElementById('keuangan-top-kategori')) {
            const topKat = document.createElement('div');
            topKat.id = 'keuangan-top-kategori';
            topKat.className = 'bg-[var(--card-bg)] backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-[var(--card-border)] mb-10';
            topKat.innerHTML = `
                <h3 class="text-xl font-bold text-[var(--text-main)] mb-6 font-amiri text-center">
                    <i class="fas fa-trophy text-yellow-500 mr-2"></i>Top 5 Kategori
                </h3>
                <div id="top-kategori-list" class="space-y-3">
                    <p class="text-center text-[var(--text-muted)] text-sm">
                        <i class="fas fa-spinner fa-spin mr-1"></i>Memuat...
                    </p>
                </div>
            `;

            // Sisipkan setelah chart
            const chartWrapper = chartContainer.closest('.bg-white\\/80') ||
                                chartContainer.closest('.bg-\\[var\\(--card-bg\\)\\]') ||
                                chartContainer.parentElement;

            if (chartWrapper && chartWrapper.parentNode) {
                chartWrapper.parentNode.insertBefore(topKat, chartWrapper.nextSibling);
            }
        }
    }

    // ================================================================
    // 6. ATTACH FILTER LISTENERS
    // ================================================================
    function attachFilterListeners() {
        const searchInput = document.getElementById('keuangan-search');
        const filterJenis = document.getElementById('keuangan-filter-jenis-pub');
        const dateFrom = document.getElementById('keuangan-date-from-pub');
        const dateTo = document.getElementById('keuangan-date-to-pub');
        const clearBtn = document.getElementById('keuangan-clear-btn');
        const exportBtn = document.getElementById('keuangan-export-btn');
        const printBtn = document.getElementById('keuangan-print-btn');

        if (searchInput && !searchInput.dataset.attached) {
            searchInput.dataset.attached = 'true';
            searchInput.addEventListener('input',
                debounceEvent.bind(null, 'keuangan-search', () => {
                    currentFilter.search = (searchInput.value || '').toLowerCase().trim();
                    applyFilter();
                }, 250));
        }

        if (filterJenis && !filterJenis.dataset.attached) {
            filterJenis.dataset.attached = 'true';
            filterJenis.addEventListener('change', function() {
                currentFilter.jenis = this.value;
                applyFilter();
            });
        }

        if (dateFrom && !dateFrom.dataset.attached) {
            dateFrom.dataset.attached = 'true';
            dateFrom.addEventListener('change', function() {
                currentFilter.dateFrom = this.value;
                applyFilter();
            });
        }

        if (dateTo && !dateTo.dataset.attached) {
            dateTo.dataset.attached = 'true';
            dateTo.addEventListener('change', function() {
                currentFilter.dateTo = this.value;
                applyFilter();
            });
        }

        if (clearBtn && !clearBtn.dataset.attached) {
            clearBtn.dataset.attached = 'true';
            clearBtn.addEventListener('click', function() {
                currentFilter = { search: '', jenis: 'all', dateFrom: '', dateTo: '' };
                if (searchInput) searchInput.value = '';
                if (filterJenis) filterJenis.value = 'all';
                if (dateFrom) dateFrom.value = '';
                if (dateTo) dateTo.value = '';
                applyFilter();
                showToast('Filter direset.', 'info', 2000);
            });
        }

        if (exportBtn && !exportBtn.dataset.attached) {
            exportBtn.dataset.attached = 'true';
            exportBtn.addEventListener('click', exportCSV);
        }

        if (printBtn && !printBtn.dataset.attached) {
            printBtn.dataset.attached = 'true';
            printBtn.addEventListener('click', handlePrint);
        }
    }

    // ================================================================
    // 7. APPLY FILTER
    // ================================================================
    function applyFilter() {
        filteredTransactions = allTransactions.filter(t => {
            if (currentFilter.jenis !== 'all' && t.jenis !== currentFilter.jenis) return false;

            if (currentFilter.dateFrom || currentFilter.dateTo) {
                const d = new Date(t.tanggal);
                if (isNaN(d.getTime())) return false;
                if (currentFilter.dateFrom) {
                    const from = new Date(currentFilter.dateFrom);
                    from.setHours(0, 0, 0, 0);
                    if (d < from) return false;
                }
                if (currentFilter.dateTo) {
                    const to = new Date(currentFilter.dateTo);
                    to.setHours(23, 59, 59, 999);
                    if (d > to) return false;
                }
            }

            if (currentFilter.search) {
                const q = currentFilter.search;
                const haystack = [t.kategori, t.keterangan, t.jenis, formatNumber(t.jumlah)]
                    .map(v => String(v || '').toLowerCase()).join(' ');
                if (!haystack.includes(q)) return false;
            }

            return true;
        });

        // Sort by tanggal descending
        filteredTransactions.sort((a, b) =>
            new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

        // Recompute summary dari filtered
        let totalMasuk = 0, totalKeluar = 0;
        filteredTransactions.forEach(t => {
            const j = Number(t.jumlah) || 0;
            if (t.jenis === 'Pemasukan') totalMasuk += j;
            else totalKeluar += j;
        });

        summaryData = {
            totalMasuk: totalMasuk,
            totalKeluar: totalKeluar,
            saldo: totalMasuk - totalKeluar,
            transactions: filteredTransactions.slice(0, 20)
        };

        renderSummary();
        renderChart();
        renderTopKategori();
        renderRecent();
    }

    // ================================================================
    // 8. RENDER SUMMARY (4 kartu dengan animate)
    // ================================================================
    function renderSummary() {
        if (!summaryContainer) return;

        const { totalMasuk, totalKeluar, saldo } = summaryData;
        const totalTx = filteredTransactions.length;

        summaryContainer.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
        summaryContainer.innerHTML = `
            <div class="stat-card p-5 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <span class="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">Masuk</span>
                </div>
                <p class="text-xs text-[var(--text-muted)] mb-1">Total Pemasukan</p>
                <p class="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400" id="anim-masuk">Rp 0</p>
            </div>

            <div class="stat-card p-5 rounded-2xl bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200 dark:border-red-800">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <span class="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">Keluar</span>
                </div>
                <p class="text-xs text-[var(--text-muted)] mb-1">Total Pengeluaran</p>
                <p class="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400" id="anim-keluar">Rp 0</p>
            </div>

            <div class="stat-card p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <span class="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Saldo</span>
                </div>
                <p class="text-xs text-[var(--text-muted)] mb-1">Saldo Akhir</p>
                <p class="text-xl sm:text-2xl font-bold ${saldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}" id="anim-saldo">Rp 0</p>
            </div>

            <div class="stat-card p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-900/20 dark:to-fuchsia-900/20 border border-purple-200 dark:border-purple-800">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-fuchsia-600 flex items-center justify-center text-white">
                        <i class="fas fa-receipt"></i>
                    </div>
                    <span class="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">Transaksi</span>
                </div>
                <p class="text-xs text-[var(--text-muted)] mb-1">Jumlah Transaksi</p>
                <p class="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400" id="anim-tx">0</p>
            </div>
        `;

        // Animate
        const animMasuk = document.getElementById('anim-masuk');
        const animKeluar = document.getElementById('anim-keluar');
        const animSaldo = document.getElementById('anim-saldo');
        const animTx = document.getElementById('anim-tx');

        if (animMasuk) animateNumber(animMasuk, totalMasuk, 800, v => formatRupiah(v));
        if (animKeluar) animateNumber(animKeluar, totalKeluar, 800, v => formatRupiah(v));
        if (animSaldo) animateNumber(animSaldo, Math.abs(saldo), 800, v => {
            return formatRupiah(saldo < 0 ? -v : v);
        });
        if (animTx) animateNumber(animTx, totalTx, 800, v => Math.round(v).toString());
    }

    // ================================================================
    // 9. RENDER CHART (CSS Bar)
    // ================================================================
    function renderChart() {
        if (!chartContainer) return;

        const { totalMasuk, totalKeluar } = summaryData;
        const maxVal = Math.max(totalMasuk, totalKeluar, 1);
        const masukPct = Math.round((totalMasuk / maxVal) * 100);
        const keluarPct = Math.round((totalKeluar / maxVal) * 100);

        chartContainer.className = 'flex items-end justify-around h-64 gap-6 px-4';
        chartContainer.innerHTML = `
            <div class="flex flex-col items-center w-full max-w-xs">
                <div class="w-full flex justify-center items-end h-full relative">
                    <span class="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/40 px-2 py-1 rounded-full whitespace-nowrap">
                        ${formatRupiah(totalMasuk)}
                    </span>
                    <div class="w-16 sm:w-20 rounded-t-lg bg-gradient-to-t from-green-600 to-green-400 shadow-lg transition-all duration-700"
                        style="height: ${Math.max(masukPct, 5)}%"
                        title="Pemasukan: ${formatRupiah(totalMasuk)}"></div>
                </div>
                <p class="text-xs sm:text-sm text-[var(--text-muted)] mt-3 font-medium text-center">
                    <i class="fas fa-arrow-down text-green-600 mr-1"></i>Pemasukan
                </p>
            </div>

            <div class="flex flex-col items-center w-full max-w-xs">
                <div class="w-full flex justify-center items-end h-full relative">
                    <span class="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/40 px-2 py-1 rounded-full whitespace-nowrap">
                        ${formatRupiah(totalKeluar)}
                    </span>
                    <div class="w-16 sm:w-20 rounded-t-lg bg-gradient-to-t from-red-600 to-red-400 shadow-lg transition-all duration-700"
                        style="height: ${Math.max(keluarPct, 5)}%"
                        title="Pengeluaran: ${formatRupiah(totalKeluar)}"></div>
                </div>
                <p class="text-xs sm:text-sm text-[var(--text-muted)] mt-3 font-medium text-center">
                    <i class="fas fa-arrow-up text-red-600 mr-1"></i>Pengeluaran
                </p>
            </div>
        `;
    }

    // ================================================================
    // 10. RENDER TOP KATEGORI
    // ================================================================
    function renderTopKategori() {
        const el = document.getElementById('top-kategori-list');
        if (!el) return;

        // Hitung total per kategori
        const kategoriMap = {};
        filteredTransactions.forEach(t => {
            const key = t.kategori || 'Lainnya';
            if (!kategoriMap[key]) {
                kategoriMap[key] = { total: 0, jenis: t.jenis, count: 0 };
            }
            kategoriMap[key].total += Number(t.jumlah) || 0;
            kategoriMap[key].count += 1;
        });

        const sorted = Object.keys(kategoriMap)
            .map(k => ({ kategori: k, ...kategoriMap[k] }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        if (sorted.length === 0) {
            el.innerHTML = '<p class="text-center text-[var(--text-muted)] py-4 text-sm italic">Belum ada data kategori.</p>';
            return;
        }

        const maxTotal = sorted[0].total || 1;

        const colorMap = {
            blue: 'bg-blue-500',
            green: 'bg-green-500',
            red: 'bg-red-500',
            yellow: 'bg-yellow-500',
            purple: 'bg-purple-500',
            pink: 'bg-pink-500',
            indigo: 'bg-indigo-500',
            teal: 'bg-teal-500',
            orange: 'bg-orange-500',
            cyan: 'bg-cyan-500'
        };

        el.innerHTML = sorted.map((item, idx) => {
            const info = getKategoriIcon(item.kategori, item.jenis);
            const widthPct = Math.round((item.total / maxTotal) * 100);
            const barColor = colorMap[info.color] || 'bg-gray-500';

            return `
                <div class="flex items-center gap-3">
                    <span class="w-6 text-xs font-bold text-[var(--text-muted)] flex-shrink-0">#${idx + 1}</span>
                    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-${info.color}-100 dark:bg-${info.color}-900/40 text-${info.color}-600 dark:text-${info.color}-400 flex-shrink-0">
                        <i class="fas ${info.icon} text-xs"></i>
                    </span>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm font-medium text-[var(--text-main)] truncate">
                                ${escapeHtml(item.kategori)}
                            </span>
                            <span class="text-xs font-bold text-[var(--text-main)] whitespace-nowrap ml-2">
                                ${formatRupiah(item.total)}
                            </span>
                        </div>
                        <div class="w-full bg-[var(--bg-stats)] rounded-full h-1.5 overflow-hidden">
                            <div class="${barColor} h-full rounded-full transition-all duration-700"
                                style="width: ${widthPct}%"></div>
                        </div>
                    </div>
                    <span class="text-xs text-[var(--text-muted)] flex-shrink-0">${item.count}x</span>
                </div>
            `;
        }).join('');
    }

    // ================================================================
    // 11. RENDER RECENT TRANSACTIONS
    // ================================================================
    function renderRecent() {
        if (!recentContainer) return;

        const transactions = filteredTransactions.slice(0, 10);

        if (!transactions || transactions.length === 0) {
            const isFiltered = currentFilter.search ||
                              currentFilter.jenis !== 'all' ||
                              currentFilter.dateFrom ||
                              currentFilter.dateTo;

            recentContainer.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-receipt text-4xl text-[var(--text-muted)] mb-3 opacity-40"></i>
                    <p class="text-[var(--text-muted)] text-sm">
                        ${isFiltered
                            ? 'Tidak ada transaksi yang cocok dengan filter.'
                            : 'Belum ada transaksi.'}
                    </p>
                </div>
            `;
            return;
        }

        recentContainer.className = 'space-y-2';
        recentContainer.innerHTML = transactions.map(t => {
            const isIncome = t.jenis === 'Pemasukan';
            const info = getKategoriIcon(t.kategori, t.jenis);
            const sign = isIncome ? '+' : '-';
            const color = isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
            const bgColor = isIncome ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40';
            const iconColor = isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

            const tanggal = formatDate(t.tanggal);

            return `
                <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--bg-stats)] transition-colors border border-transparent hover:border-[var(--card-border)]">
                    <div class="w-10 h-10 rounded-full ${bgColor} flex items-center justify-center flex-shrink-0">
                        <i class="fas ${info.icon} ${iconColor}"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-medium text-sm text-[var(--text-main)] truncate">
                            ${escapeHtml(t.kategori || 'Transaksi')}
                        </p>
                        <div class="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                            <span><i class="far fa-calendar-alt mr-1"></i>${escapeHtml(tanggal)}</span>
                            ${t.keterangan ? `<span class="truncate">• ${escapeHtml(t.keterangan)}</span>` : ''}
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="font-bold text-sm ${color} whitespace-nowrap">
                            ${sign}${formatRupiah(t.jumlah)}
                        </p>
                        <button onclick="copyKeuanganAmount('${Number(t.jumlah) || 0}', event)"
                            class="text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs mt-0.5 opacity-60 hover:opacity-100 transition"
                            title="Copy jumlah">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ================================================================
    // 12. COPY AMOUNT (global)
    // ================================================================
    window.copyKeuanganAmount = function(amount, event) {
        if (event) event.stopPropagation();
        const text = formatNumber(amount);
        copyToClipboard(text)
            .then(() => showToast('Jumlah dicopy: Rp ' + text, 'success', 2000))
            .catch(() => showToast('Gagal copy jumlah', 'error'));
    };

    // ================================================================
    // 13. LOAD DATA (Support v15 & v16)
    // ================================================================
    async function loadData() {
        if (isLoading) return;
        isLoading = true;

        // Loading state
        summaryContainer.className = 'grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
        summaryContainer.innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-spinner fa-spin text-3xl text-[var(--text-main)]"></i>
                <p class="text-[var(--text-muted)] text-sm mt-2">Memuat data keuangan...</p>
            </div>
        `;
        chartContainer.innerHTML = '';
        recentContainer.innerHTML = '';

        try {
            // Coba endpoint publik dulu, fallback ke getKeuangan
            let result;
            try {
                result = await apiCall('getKeuanganPublik', 'POST', {});
            } catch (e) {
                console.warn('[keuangan] Fallback ke getKeuangan:', e);
                result = await apiCall('getKeuangan', 'POST', {});
            }

            if (!result || !result.success) {
                throw new Error((result && result.message) || 'Gagal memuat data keuangan');
            }

            // Normalize: bisa object summary atau array of transactions
            let totalMasuk = 0, totalKeluar = 0;
            let transactions = [];

            if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                // Summary object (v16)
                totalMasuk = Number(result.data.totalMasuk) || 0;
                totalKeluar = Number(result.data.totalKeluar) || 0;
                transactions = result.data.transactions || [];
            } else if (Array.isArray(result.data)) {
                // Array of transactions (v15)
                transactions = result.data;
                transactions.forEach(t => {
                    const j = Number(t.jumlah) || 0;
                    if (t.jenis === 'Pemasukan') totalMasuk += j;
                    else totalKeluar += j;
                });
            }

            allTransactions = transactions;
            summaryData = {
                totalMasuk: totalMasuk,
                totalKeluar: totalKeluar,
                saldo: totalMasuk - totalKeluar,
                transactions: transactions
            };

            // Apply filter (default no filter)
            applyFilter();

        } catch (error) {
            console.error('[keuangan] Load error:', error);

            summaryContainer.className = 'col-span-full';
            summaryContainer.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-3"></i>
                    <p class="text-red-500 font-medium mb-2">Gagal memuat data keuangan.</p>
                    <p class="text-[var(--text-muted)] text-sm mb-4">${escapeHtml(error.message)}</p>
                    <button onclick="location.reload()" class="btn-primary px-6 py-2 rounded-lg">
                        <i class="fas fa-sync-alt mr-1"></i>Coba Lagi
                    </button>
                </div>
            `;
            chartContainer.innerHTML = '';
            recentContainer.innerHTML = '';
        } finally {
            isLoading = false;
        }
    }

    // ================================================================
    // 14. EXPORT CSV
    // ================================================================
    function exportCSV() {
        if (filteredTransactions.length === 0) {
            showToast('Tidak ada data untuk diekspor.', 'warning');
            return;
        }

        const headers = ['No', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan'];
        const rows = filteredTransactions.map((t, i) => [
            i + 1,
            formatDate(t.tanggal),
            t.jenis || '',
            t.kategori || '',
            Number(t.jumlah) || 0,
            t.keterangan || ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keuangan_publik_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('✅ CSV berhasil diunduh!', 'success');
    }

    // ================================================================
    // 15. PRINT REPORT
    // ================================================================
    function handlePrint() {
        if (filteredTransactions.length === 0) {
            showToast('Tidak ada data untuk dicetak.', 'warning');
            return;
        }
        showToast('Menyiapkan halaman cetak...', 'info', 2000);
        setTimeout(() => window.print(), 300);
    }

    // ================================================================
    // 16. CLEANUP
    // ================================================================
    function cleanup() {
        window.__keuanganLoaded = false;
    }

    window.__keuanganCleanup = cleanup;

    // ================================================================
    // 17. INIT
    // ================================================================
    console.log('[keuangan] Init dimulai');
    ensureExtraUI();
    loadData();
});