document.addEventListener('DOMContentLoaded', () => {
    // =================================================================================
    // KONFIGURASI DAN STATE APLIKASI
    // =================================================================================

    // URL Webhook (ditempatkan di satu tempat agar mudah diubah)
    const WEBHOOKS = {
        sales: 'https://n8n-uievozfh3got.bgxy.sumopod.my.id/webhook/closing-sales-summary-',
        estatement: 'https://n8n-uievozfh3got.bgxy.sumopod.my.id/webhook/e_statement',
        estatementSummary: 'https://n8n-uievozfh3got.bgxy.sumopod.my.id/webhook/e_statement-summary',
        bankTransaction: 'https://n8n-uievozfh3got.bgxy.sumopod.my.id/webhook/hookbanktransaction',
        expenseMatch: 'https://n8n-uievozfh3got.bgxy.sumopod.my.id/webhook/read-output-formexpense-match'
    };

    // State untuk menyimpan data yang sudah diambil dan diolah
    let masterData = {}; // Data asli, tidak pernah berubah setelah dimuat
    let filteredData = {}; // Data yang sudah difilter berdasarkan tanggal

    // State untuk menyimpan instance chart agar bisa dihancurkan sebelum digambar ulang
    let chartInstances = {};

    // =================================================================================
    // FUNGSI UTAMA & INISIALISASI
    // =================================================================================

    /**
     * Inisialisasi seluruh aplikasi dashboard
     */
    async function initializeApp() {
        console.log("Dashboard is initializing...");
        setupEventListeners();
        setDefaultDateFilters();

        // Tampilkan loading spinner atau placeholder
        showLoadingState(true);

        await fetchAllData();
        applyFiltersAndRender();

        // Sembunyikan loading setelah semuanya selesai
        showLoadingState(false);
        console.log("Dashboard initialized successfully.");
    }

    /**
     * Mengatur semua event listener yang dibutuhkan aplikasi
     */
    function setupEventListeners() {
        // Navigasi Sidebar
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = e.currentTarget.dataset.page;
                navigateTo(pageId);
            });
        });

        // Filter Tanggal
        document.getElementById('apply-filter').addEventListener('click', applyFiltersAndRender);

        // Modal
        const modal = document.getElementById('modal');
        document.getElementById('modal-close-btn').addEventListener('click', () => modal.classList.remove('show'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
        
        // Event Delegation untuk tombol dinamis (popup, accordion)
        document.body.addEventListener('click', handleDynamicClicks);
    }
    
    // =================================================================================
    // PENGAMBILAN & PENGOLAHAN DATA (FETCH & PARSE)
    // =================================================================================

    /**
     * Mengambil semua data dari semua webhook secara paralel
     */
    async function fetchAllData() {
        console.log("Fetching all data sources...");
        const [sales, estatement, estatementSummary, bankTransaction, expenseMatch] = await Promise.all([
            fetchData(WEBHOOKS.sales),
            fetchData(WEBHOOKS.estatement),
            fetchData(WEBHOOKS.estatementSummary),
            fetchData(WEBHOOKS.bankTransaction),
            fetchData(WEBHOOKS.expenseMatch)
        ]);

        // Mengolah dan menyimpan data mentah ke state masterData
        masterData = {
            sales: parseSalesData(sales),
            estatement: parseEstatementData(estatement),
            estatementSummary: estatementSummary, // Biasanya tidak perlu di-parse
            bankTransaction: parseBankTransactionData(bankTransaction),
            expenseMatch: parseExpenseMatchData(expenseMatch)
        };
        console.log("All data fetched and parsed:", masterData);
    }
    
    // --- Fungsi Parser untuk setiap sumber data ---

    function parseSalesData(data) {
        return data.map(item => ({
            ...item,
            date: new Date(item.tanggal),
            total_penjualan: parseFloat(item.total_penjualan) || 0,
            kas_masukkeluar: parseFloat(item['kas_ masukkeluar']) || 0,
        }));
    }
    
    function parseEstatementData(data) {
        return data.map(item => {
            const descriptionLines = item.description ? item.description.split('\n') : [];
            return {
                ...item,
                date: new Date(item.date),
                amount_numeric: parseFloat(item.amount_numeric) || 0,
                entityName: descriptionLines.slice(0, 3).join(' ').trim() || 'Tidak Diketahui'
            };
        });
    }

    function parseBankTransactionData(data) {
        return data.map(item => ({
            ...item,
            date: new Date(item.tanggal),
            total_transaksi: parseFloat(item.total_transaksi) || 0,
            penerima: item.penerima || 'Tidak Diketahui'
        }));
    }
    
    function parseExpenseMatchData(data) {
        return data.map(item => {
            let parsedRawData = {};
            try {
                parsedRawData = JSON.parse(item.exp_data_raw);
            } catch (e) { /* biarkan kosong jika error */ }

            let displayCategory = parsedRawData.category || item.exp_category || 'Lainnya';
            if (parsedRawData.purchaseType === 'purchase_order') {
                displayCategory = 'Bahan Baku';
            }

            return {
                ...item,
                date: new Date(item.trx_date),
                exp_total_amount: parseFloat(item.exp_total_amount) || 0,
                displayCategory: displayCategory
            };
        });
    }

    // =================================================================================
    // LOGIKA FILTER & NAVIGASI
    // =================================================================================
    
    /**
     * Menerapkan filter tanggal ke masterData dan menyimpan hasilnya di filteredData
     */
    function applyFilters() {
        const startDate = new Date(document.getElementById('start-date').value);
        const endDate = new Date(document.getElementById('end-date').value);
        // Atur jam akhir ke 23:59:59 agar mencakup seluruh hari
        endDate.setHours(23, 59, 59, 999);

        filteredData = {};
        for (const key in masterData) {
            if (Array.isArray(masterData[key])) {
                filteredData[key] = masterData[key].filter(item => item.date >= startDate && item.date <= endDate);
            } else {
                filteredData[key] = masterData[key]; // Salin data non-array seperti summary
            }
        }
    }

    function applyFiltersAndRender() {
        console.log("Applying filters and re-rendering...");
        applyFilters();
        renderActivePage();
    }
    
    /**
     * Mengatur navigasi antar halaman
     * @param {string} pageId - ID halaman yang akan ditampilkan
     */
    function navigateTo(pageId) {
        // Sembunyikan semua halaman
        document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
        // Tampilkan halaman yang dipilih
        document.getElementById(`page-${pageId}`).classList.add('active');

        // Update active state di sidebar
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageId);
        });
        
        // Update judul halaman
        const pageTitle = document.querySelector(`.nav-link[data-page="${pageId}"] span`).textContent;
        document.getElementById('page-title').textContent = pageTitle;
        
        // Render konten untuk halaman yang baru aktif
        renderActivePage();
    }
    
    /**
     * Router untuk memanggil fungsi render yang sesuai dengan halaman aktif
     */
    function renderActivePage() {
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;

        showLoadingState(true); // Tampilkan loading pada konten
        
        // Hapus timeout jika tidak diperlukan, atau sesuaikan durasinya
        // setTimeout(() => { // Simulasi delay untuk UX
            switch (activePage.id) {
                case 'page-dashboard':          renderDashboardPage(); break;
                case 'page-neraca':             renderNeracaPage(); break;
                case 'page-arus-kas':           renderArusKasPage(); break;
                case 'page-transaksi-bank':     renderTransaksiBankPage(); break;
                case 'page-pengeluaran':        renderPengeluaranPage(); break;
                case 'page-detail-pengeluaran': renderDetailPengeluaranPage(); break;
            }
            showLoadingState(false);
        // }, 100); 
    }

    // =================================================================================
    // FUNGSI RENDER UNTUK SETIAP HALAMAN
    // =================================================================================
    
    // --- Render Halaman: Dashboard Utama ---
    function renderDashboardPage() {
        // Kalkulasi KPI
        const totalPendapatan = filteredData.sales.reduce((sum, item) => sum + item.total_penjualan, 0);
        const totalPengeluaran = filteredData.expenseMatch.reduce((sum, item) => sum + item.exp_total_amount, 0);
        const labaRugi = totalPendapatan - totalPengeluaran;
        const totalKredit = filteredData.estatement.filter(t => t.type === 'CR').reduce((sum, t) => sum + t.amount_numeric, 0);
        const totalDebit = filteredData.estatement.filter(t => t.type === 'DB').reduce((sum, t) => sum + t.amount_numeric, 0);
        const arusKasBersih = totalKredit - totalDebit;

        // Render KPI
        document.getElementById('dashboard-kpi-container').innerHTML = `
            <div class="metric-item"><p>Total Pendapatan</p><h2>${formatCurrency(totalPendapatan)}</h2></div>
            <div class="metric-item"><p>Total Pengeluaran</p><h2>${formatCurrency(totalPengeluaran)}</h2></div>
            <div class="metric-item"><p>Laba / Rugi</p><h2 class="${labaRugi >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(labaRugi)}</h2></div>
            <div class="metric-item"><p>Arus Kas Bersih (Bank)</p><h2 class="${arusKasBersih >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(arusKasBersih)}</h2></div>
        `;
        
        // Render Grafik Komposisi Pengeluaran
        const expenseByCategory = filteredData.expenseMatch.reduce((acc, item) => {
            const category = item.displayCategory;
            acc[category] = (acc[category] || 0) + item.exp_total_amount;
            return acc;
        }, {});
        
        createOrUpdateChart('dashboard-expense-category-chart', 'doughnut', {
            labels: Object.keys(expenseByCategory),
            datasets: [{
                data: Object.values(expenseByCategory),
                backgroundColor: ['#4361ee', '#4895ef', '#560bad', '#7209b7', '#f72585', '#ffc107', '#2ec4b6']
            }]
        });

        // Render Top 5 Pengeluaran
        const topExpenses = [...filteredData.expenseMatch]
            .sort((a, b) => b.exp_total_amount - a.exp_total_amount)
            .slice(0, 5);
        document.getElementById('dashboard-top-expenses-table').innerHTML = createTable(
            ['Kategori', 'Tanggal', 'Jumlah'],
            topExpenses,
            item => [item.displayCategory, item.date.toLocaleDateString('id-ID'), formatCurrency(item.exp_total_amount)]
        );
    }
    
    // --- Render Halaman: Arus Kas ---
    function renderArusKasPage() {
        const container = document.getElementById('arus-kas-table-container');
        container.innerHTML = createTable(
            ['Karyawan', 'Tanggal', 'Total Penjualan', 'Kas Masuk/Keluar', 'Detail Pembayaran'],
            filteredData.sales,
            item => [
                item.karyawan,
                item.date.toLocaleDateString('id-ID'),
                formatCurrency(item.total_penjualan),
                formatCurrency(item.kas_masukkeluar),
                `<button class="action-btn" data-action="view-json" data-json='${escape(item.metode_pembayaran_json)}'><i class="fas fa-eye"></i></button>`
            ]
        );
    }

    // --- Render Halaman: Transaksi Bank ---
    function renderTransaksiBankPage() {
        // Ringkasan
        const totalKredit = filteredData.estatement.filter(t => t.type === 'CR').reduce((sum, t) => sum + t.amount_numeric, 0);
        const totalDebit = filteredData.estatement.filter(t => t.type === 'DB').reduce((sum, t) => sum + t.amount_numeric, 0);
        document.getElementById('transaksi-bank-summary-container').innerHTML = `
             <div class="metric-item"><p>Total Pemasukan (Kredit)</p><h2 class="text-success">${formatCurrency(totalKredit)}</h2></div>
             <div class="metric-item"><p>Total Pengeluaran (Debit)</p><h2 class="text-danger">${formatCurrency(totalDebit)}</h2></div>
        `;

        // Pengelompokan per Entitas
        const groupedByEntity = filteredData.estatement.reduce((acc, item) => {
            if (!acc[item.entityName]) acc[item.entityName] = [];
            acc[item.entityName].push(item);
            return acc;
        }, {});
        
        let accordionHTML = '';
        for (const entityName in groupedByEntity) {
            accordionHTML += createAccordionItem(
                entityName,
                createTable(
                    ['Tanggal', 'Deskripsi', 'Tipe', 'Jumlah'],
                    groupedByEntity[entityName],
                    item => [item.date.toLocaleDateString('id-ID'), item.description, item.type, formatCurrency(item.amount_numeric)]
                )
            );
        }
        document.getElementById('transaksi-bank-grouped-container').innerHTML = accordionHTML || '<p>Tidak ada data untuk dikelompokkan.</p>';

        // Tabel Mentah
        document.getElementById('transaksi-bank-table-container').innerHTML = createTable(
            ['Tanggal', 'Deskripsi', 'Tipe', 'Jumlah', 'Saldo'],
            filteredData.estatement,
            item => [item.date.toLocaleDateString('id-ID'), item.description, item.type, formatCurrency(item.amount_numeric), formatCurrency(item.balance_numeric)]
        );
    }

    // --- Render Halaman: Pengeluaran ---
    function renderPengeluaranPage() {
         // Pengelompokan per Penerima
        const groupedByRecipient = filteredData.bankTransaction.reduce((acc, item) => {
            if (!acc[item.penerima]) acc[item.penerima] = [];
            acc[item.penerima].push(item);
            return acc;
        }, {});
        
        let accordionHTML = '';
        for (const recipientName in groupedByRecipient) {
            accordionHTML += createAccordionItem(
                recipientName,
                createTable(
                    ['Tanggal', 'Nominal', 'No. Referensi', 'Keterangan'],
                    groupedByRecipient[recipientName],
                    item => [item.date.toLocaleDateString('id-ID'), formatCurrency(item.total_transaksi), item.no_referensi, item.keterangan]
                )
            );
        }
        document.getElementById('pengeluaran-grouped-container').innerHTML = accordionHTML || '<p>Tidak ada data untuk dikelompokkan.</p>';
        
         // Tabel Mentah
        document.getElementById('pengeluaran-table-container').innerHTML = createTable(
            ['Tanggal', 'Penerima', 'Nominal', 'Keterangan'],
            filteredData.bankTransaction,
            item => [item.date.toLocaleDateString('id-ID'), item.penerima, formatCurrency(item.total_transaksi), item.keterangan]
        );
    }

    // --- Render Halaman: Detail Pengeluaran ---
    function renderDetailPengeluaranPage() {
        // Ringkasan Cerdas
        let smartSummaryHTML = filteredData.expenseMatch.map(item => {
             let content = `<p><strong>Kategori:</strong> ${item.exp_category || 'N/A'}</p>`;
             if (item.exp_type === 'Purchase Order') {
                content += `<p><strong>No. PO:</strong> ${item.exp_po_number}</p>`;
             }
             content += `<button class="action-btn" data-action="view-json" data-json='${escape(item.exp_items_json)}'><i class="fas fa-cubes"></i> Lihat Item</button>`;
            
             return createInfoCard(`<strong>${item.exp_type}: ${formatCurrency(item.exp_total_amount)}</strong>`, content);
        }).join('');
        document.getElementById('detail-pengeluaran-summary-container').innerHTML = smartSummaryHTML || '<p>Tidak ada detail pengeluaran pada periode ini.</p>';

        // Tabel Mentah
        document.getElementById('detail-pengeluaran-table-container').innerHTML = createTable(
            ['Tanggal', 'Tipe', 'Kategori', 'Total', 'Detail Item', 'Data Mentah Bank'],
            filteredData.expenseMatch,
            item => [
                item.date.toLocaleDateString('id-ID'), item.exp_type, item.displayCategory, formatCurrency(item.exp_total_amount),
                `<button class="action-btn" data-action="view-json" data-json='${escape(item.exp_items_json)}'><i class="fas fa-eye"></i></button>`,
                `<button class="action-btn" data-action="view-json" data-json='${escape(item.trx_data_raw)}'><i class="fas fa-eye"></i></button>`
            ]
        );
    }

    // --- Render Halaman: Neraca (placeholder) ---
    function renderNeracaPage() {
        // Placeholder - Logika kompleks akan ditambahkan di sini
        const totalPendapatan = filteredData.sales.reduce((sum, item) => sum + item.total_penjualan, 0);
        const totalPengeluaran = filteredData.expenseMatch.reduce((sum, item) => sum + item.exp_total_amount, 0);
        document.getElementById('neraca-summary-section1').innerHTML = `
            <div class="metric-item"><p>Ringkasan Pendapatan Penjualan</p><h2 class="text-success">${formatCurrency(totalPendapatan)}</h2></div>
            <div class="metric-item"><p>Ringkasan Pengeluaran Tercatat</p><h2 class="text-danger">${formatCurrency(totalPengeluaran)}</h2></div>
        `;
    }

    // =================================================================================
    // FUNGSI HELPERS (UI & Lain-lain)
    // =================================================================================

    function handleDynamicClicks(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        if (action === 'view-json') {
            try {
                const jsonData = JSON.parse(unescape(target.dataset.json));
                showModal('Detail JSON', `<pre>${JSON.stringify(jsonData, null, 2)}</pre>`);
            } catch (err) {
                showModal('Error', '<p>Data JSON tidak valid atau kosong.</p>');
            }
        } else if (action === 'toggle-accordion') {
            target.classList.toggle('active');
            const content = target.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        }
    }
    
    function showModal(title, content) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal').classList.add('show');
    }

    function createTable(headers, data, rowMapper) {
        if (!data || data.length === 0) return '<p>Tidak ada data untuk ditampilkan pada periode ini.</p>';
        const headerRow = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
        const bodyRows = data.map(item => `<tr>${rowMapper(item).map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
        return `<table class="table">${headerRow}<tbody>${bodyRows}</tbody></table>`;
    }

    function createAccordionItem(header, content) {
        return `
            <div class="accordion-item">
                <button class="accordion-header" data-action="toggle-accordion">${header}</button>
                <div class="accordion-content">${content}</div>
            </div>
        `;
    }

    function createInfoCard(title, content) {
        return `<div class="info-card"><h4>${title}</h4>${content}</div>`;
    }
    
    function createOrUpdateChart(canvasContainerId, type, data, options = {}) {
        const container = document.getElementById(canvasContainerId);
        if (!container) return;
        
        // Hancurkan chart lama jika ada
        if (chartInstances[canvasContainerId]) {
            chartInstances[canvasContainerId].destroy();
        }
        
        // Buat canvas baru
        container.innerHTML = `<canvas id="${canvasContainerId}-canvas"></canvas>`;
        const ctx = document.getElementById(`${canvasContainerId}-canvas`).getContext('2d');
        
        chartInstances[canvasContainerId] = new Chart(ctx, { type, data, options });
    }

    function setDefaultDateFilters() {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        document.getElementById('start-date').valueAsDate = firstDayOfMonth;
        document.getElementById('end-date').valueAsDate = lastDayOfMonth;
    }
    
    function formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    }
    
    function showLoadingState(isLoading) {
        // Implementasikan logika untuk menampilkan/menyembunyikan loading state,
        // misal: men-toggle class pada body atau container utama.
    }

    /**
     * Fungsi generik untuk mengambil dan mem-parsing JSON dari webhook
     * @param {string} url - URL Webhook
     * @returns {Promise<Array>}
     */
    async function fetchData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            
            // Logika cerdas untuk menangani berbagai format output n8n
            if (Array.isArray(result) && result[0]?.data) return result[0].data;
            if (result.data && Array.isArray(result.data)) return result.data;
            if (Array.isArray(result)) return result;

            return [];
        } catch (error) {
            console.error(`Failed to fetch data from ${url}:`, error);
            showModal('Error Jaringan', `Gagal memuat data dari salah satu sumber: ${url}. Silakan cek koneksi atau hubungi administrator.`);
            return []; // Kembalikan array kosong agar aplikasi tidak crash
        }
    }

    // =================================================================================
    // MEMULAI APLIKASI
    // =================================================================================
    initializeApp();
});
