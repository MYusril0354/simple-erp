// Daftarkan plugin Chart.js Datalabels secara global (dipakai untuk label angka di atas bar chart)
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Set Date in Topbar
const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const currentDateEl = document.getElementById('current-date');
if (currentDateEl) {
    currentDateEl.textContent = new Date().toLocaleDateString('id-ID', dateOptions);
}

// ==========================================
// UTILITIES & UI HELPERS
// ==========================================
function showLoading() { document.getElementById('loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }

// --- Filter Rentang Tanggal (dipakai di Kartu Stok & Rekap PO) ---
// Default: 1 bulan ke belakang sampai hari ini, format "YYYY-MM-DD" (cocok untuk <input type="date">)
function getDefaultDateRange() {
    const akhir = new Date();
    const mulai = new Date();
    mulai.setMonth(mulai.getMonth() - 1);
    const toYMD = (d) => d.toISOString().slice(0, 10);
    return { tanggal_mulai: toYMD(mulai), tanggal_akhir: toYMD(akhir) };
}

// Render bar filter tanggal generik. onApplyFnName = nama fungsi global (string) yang
// dipanggil dengan (tanggalMulai, tanggalAkhir) saat tombol "Terapkan" diklik.
function renderFilterTanggalBar(tanggalMulai, tanggalAkhir, onApplyFnName) {
    return `
        <div class="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
                <input type="date" id="filter-tanggal-mulai" value="${tanggalMulai}" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            </div>
            <div>
                <label class="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
                <input type="date" id="filter-tanggal-akhir" value="${tanggalAkhir}" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            </div>
            <button onclick="${onApplyFnName}(document.getElementById('filter-tanggal-mulai').value, document.getElementById('filter-tanggal-akhir').value)" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2 transition-colors">
                <i data-lucide="filter" class="w-4 h-4"></i> Terapkan Filter
            </button>
        </div>
    `;
}

// --- Fungsi Skeleton Loading Global ---
function getSkeletonHTML() {
    return `
        <div class="animate-pulse space-y-6 w-full">
            <!-- Header Action Bar Skeleton -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                <div class="h-8 bg-gray-200 rounded w-1/3 sm:w-64"></div>
                <div class="h-10 bg-gray-200 rounded w-full sm:w-32"></div>
            </div>
            <!-- Cards Skeleton (3 cols) -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="h-32 bg-white border border-gray-100 shadow-sm rounded-xl flex flex-col justify-center p-6"><div class="h-4 bg-gray-200 rounded w-1/2 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/4"></div></div>
                <div class="h-32 bg-white border border-gray-100 shadow-sm rounded-xl flex flex-col justify-center p-6"><div class="h-4 bg-gray-200 rounded w-1/2 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/4"></div></div>
                <div class="h-32 bg-white border border-gray-100 shadow-sm rounded-xl flex flex-col justify-center p-6"><div class="h-4 bg-gray-200 rounded w-1/2 mb-3"></div><div class="h-8 bg-gray-200 rounded w-1/4"></div></div>
            </div>
            <!-- Main Table/Content Skeleton -->
            <div class="h-96 bg-white border border-gray-100 shadow-sm rounded-xl w-full p-6">
                <div class="h-6 bg-gray-200 rounded w-1/4 mb-6"></div>
                <div class="space-y-4">
                    <div class="h-10 bg-gray-100 rounded w-full"></div>
                    <div class="h-10 bg-gray-50 rounded w-full"></div>
                    <div class="h-10 bg-gray-50 rounded w-full"></div>
                    <div class="h-10 bg-gray-50 rounded w-full"></div>
                </div>
            </div>
        </div>
    `;
}

// --- Fungsi Helper untuk Mencetak Laporan ke Tab Baru ---
window.cetakDokumenLaporan = function(title, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return showToast('Area cetak tidak ditemukan', 'error');
    
    const content = container.innerHTML;
    const win = window.open('', '_blank');
    if (!win) {
        showToast('Popup diblokir browser. Izinkan popup untuk mencetak.', 'error');
        return;
    }
    
    const printHtml = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <title>Cetak - ${title}</title>
        <!-- Load Tailwind untuk styling cetakan -->
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>
            /* Konfigurasi Kertas Landscape A4 */
            @page { size: A4 landscape; margin: 15mm; }
            
            /* Paksa warna background (seperti header biru) tetap tercetak */
            body { 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
                background-color: white !important; 
                font-size: 11px;
                font-family: Arial, sans-serif;
            }
            
            /* Sembunyikan elemen yang tidak perlu di kertas (Tombol, Navigasi) */
            .no-print, button { display: none !important; }
            
            /* Hilangkan bayangan dan border melengkung agar terlihat formal */
            .shadow-sm, .shadow-md, .shadow-lg { box-shadow: none !important; }
            .rounded-xl, .rounded-lg, .rounded-md { border-radius: 0 !important; }
            
            /* Izinkan tabel melewati batas container (hilangkan scrollbar di kertas) */
            .overflow-x-auto, .overflow-hidden, .max-w-full { 
                overflow: visible !important; 
                max-width: none !important; 
                width: 100% !important; 
            }
            
            /* Pertegas Border Tabel di Kertas */
            table { border-collapse: collapse !important; width: 100% !important; }
            th, td { border: 1px solid #444 !important; }
            .border, .border-gray-200, .border-gray-300 { border-color: #444 !important; }
        </style>
    </head>
    <body class="bg-white text-black p-4">
        <div class="mb-6 pb-4 border-b-2 border-gray-800 flex justify-between items-end">
            <div>
                <h2 class="text-2xl font-bold uppercase tracking-wider text-gray-900">${title}</h2>
                <p class="text-sm text-gray-600 mt-1 font-semibold">${NAME_CORP}</p>
            </div>
            <div class="text-right text-xs text-gray-500">
                Dicetak pada:<br><b class="text-gray-800">${new Date().toLocaleString('id-ID')}</b>
            </div>
        </div>
        
        <!-- Konten Tabel yang Diambil dari Layar Utama -->
        <div id="print-content" class="text-sm w-full">
            ${content}
        </div>
        
        <script>
            // Tunggu 1.5 detik agar Tailwind CDN selesai merender class, lalu buka Print Dialog
            setTimeout(() => {
                window.print();
            }, 1500);
        <\/script>
    </body>
    </html>
    `;
    
    win.document.write(printHtml);
    win.document.close();
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    const icon = document.getElementById('toast-icon');
    
    if (!toast || !msgEl || !icon) return;

    msgEl.textContent = message;
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.remove('border-green-500', 'border-red-500', 'border-blue-500');
    
    if (type === 'success') {
        toast.classList.add('border-green-500');
        icon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'; 
        icon.setAttribute('class', 'text-green-500 w-6 h-6 mt-0.5');
    } else if (type === 'error') {
        toast.classList.add('border-red-500');
        icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'; 
        icon.setAttribute('class', 'text-red-500 w-6 h-6 mt-0.5');
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
    }, 3500);
}

async function fetchAPI(action, payload = {}, forceOverlay = false) {
    // Daftar endpoint yang hanya bertugas me-load data tampilan (Bukan Aksi Simpan)
    const isViewDataFetch = ['getDashboardData', 'getMaster', 'getPOList', 'getStokPerRak', 'getAntreanSJ', 'getSuratJalanList', 'getKartuStok', 'getLaporanPersiapan'].includes(action);
    
    // Tampilkan Overlay Hitam HANYA jika dipaksa (forceOverlay) atau jika aksinya BUKAN memuat data view
    const useOverlay = forceOverlay || !isViewDataFetch;
    
    if (useOverlay) showLoading();
    
    try {
        const token = localStorage.getItem('erp_token') || "";
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, payload, token })
        });
        const result = await response.json();
        
        if (useOverlay) hideLoading();
        
        if (!result.success && result.message.includes('Token Expired')) {
            logout();
            showToast('Sesi telah habis, silakan login kembali', 'error');
            return null;
        }
        return result;
    } catch (error) {
        if (useOverlay) hideLoading();
        showToast('Koneksi ke server gagal. Pastikan URL API benar.', 'error');
        console.error(error);
        return null;
    }
}
