// Helper untuk membuar Card putih rapi dan menahan lebar tabel (overflow-hidden)
function createCard(html, classes = "") {
    return `<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 w-full max-w-full overflow-hidden ${classes}">${html}</div>`;
}

function setPageTitle(title) {
    const el = document.getElementById('page-title');
    if (el) el.textContent = title;
}

// --- DASHBOARD ---
async function renderDashboard() {
    setPageTitle('Dashboard');
    const [res, antreanSJRes] = await Promise.all([
        fetchAPI('getDashboardData'),
        fetchAPI('getAntreanSJ')
    ]);
    if (!res || !res.success) return;

    const drBelumSJ = (antreanSJRes && antreanSJRes.success) ? antreanSJRes.data.length : 0;

    const html = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div onclick="window.location.hash='#persiapan'" class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between relative overflow-hidden group cursor-pointer hover:shadow-md transition-shadow">
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl transition-all group-hover:w-2"></div>
                <div><p class="text-gray-500 text-sm font-medium mb-1">PO Status Open</p><h3 class="text-3xl font-extrabold text-gray-800">${res.data.openPO}</h3></div>
                <div class="p-3 bg-blue-50 rounded-lg"><i data-lucide="clipboard-list" class="w-8 h-8 text-blue-500"></i></div>
            </div>
            <div onclick="window.location.hash='#surat-jalan'" class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between relative overflow-hidden group cursor-pointer hover:shadow-md transition-shadow">
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500 rounded-l-xl transition-all group-hover:w-2"></div>
                <div><p class="text-gray-500 text-sm font-medium mb-1">DR Belum Ada SJ</p><h3 class="text-3xl font-extrabold text-gray-800">${drBelumSJ}</h3></div>
                <div class="p-3 bg-yellow-50 rounded-lg"><i data-lucide="truck" class="w-8 h-8 text-yellow-500"></i></div>
            </div>
            <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between relative overflow-hidden group">
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-xl transition-all group-hover:w-2"></div>
                <div><p class="text-gray-500 text-sm font-medium mb-1">Total Stok Sistem</p><h3 class="text-3xl font-extrabold text-gray-800">${res.data.totalStok}</h3></div>
                <div class="p-3 bg-green-50 rounded-lg"><i data-lucide="layers" class="w-8 h-8 text-green-500"></i></div>
            </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
            ${createCard(`
                <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="trending-up" class="text-indigo-500 w-5 h-5"></i> Trend Qty PO vs Qty DN (14 Hari Terakhir)</h3>
                <div style="height:300px;"><canvas id="chart-po-dn"></canvas></div>
            `)}
            ${createCard(`
                <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="bar-chart-3" class="text-green-500 w-5 h-5"></i> Total Stok per Barang</h3>
                <div style="height:300px;"><canvas id="chart-stok-barang"></canvas></div>
            `)}
        </div>
        <div class="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 p-6 md:p-8 rounded-xl shadow-lg text-white">
            <h4 class="font-bold text-xl mb-2 flex items-center gap-2"><i data-lucide="sparkles"></i> Selamat Datang kembali, ${currentUser.username}!</h4>
            <p class="text-blue-100 opacity-90">Anda login dengan hak akses sebagai <span class="font-extrabold text-white">${currentUser.role.replace('_', ' ').toUpperCase()}</span>. Gunakan menu di sebelah kiri untuk mengelola data operasional ERP.</p>
        </div>
    `;
    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    renderChartPOvsDN(res.data.chartPOvsDN);
    renderChartStokBarang(res.data.chartStokBarang);
}

let chartPODNInstance = null;
let chartStokInstance = null;

function renderChartPOvsDN(chartData) {
    const ctx = document.getElementById('chart-po-dn');
    if (!ctx || !chartData) return;
    if (chartPODNInstance) chartPODNInstance.destroy();

    chartPODNInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                { label: 'Qty PO', data: chartData.qtyPO, borderColor: '#eab308', backgroundColor: '#eab30833', tension: 0.3, fill: true, pointRadius: 3 },
                { label: 'Qty DN', data: chartData.qtyDN, borderColor: '#22c55e', backgroundColor: '#22c55e33', tension: 0.3, fill: true, pointRadius: 3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, datalabels: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderChartStokBarang(chartData) {
    const ctx = document.getElementById('chart-stok-barang');
    if (!ctx || !chartData) return;
    if (chartStokInstance) chartStokInstance.destroy();

    const topData = chartData.slice(0, 15);
    chartStokInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topData.map(d => d.nama_barang),
            datasets: [{
                label: 'Total Stok',
                data: topData.map(d => d.qty),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                // Konfigurasi datalabels
                datalabels: {
                    anchor: 'end',      // posisi di ujung atas batang
                    align: 'top',       // teks di atas anchor
                    color: '#1e293b',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value) => value // bisa diubah, misal: value + ' pcs'
                }
            },
            scales: {
                y: { beginAtZero: true },
                x: {
                    ticks: {
                        autoSkip: false,
                        maxRotation: 60,
                        minRotation: 30
                    }
                }
            }
        }
    });
}
