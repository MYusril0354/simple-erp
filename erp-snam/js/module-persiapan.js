// --- PERSIAPAN BARANG (DELIVERY REQUEST) ---
async function renderPersiapan() {
    setPageTitle('Persiapan Barang (Gudang)');
    const res = await fetchAPI('getPOList');
    if(!res || !res.success) return;

    const openPOs = res.data.filter(p => p.status === 'Open');
    const rows = openPOs.map(po => `
        <div class="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white border border-gray-200 rounded-xl mb-3 hover:shadow-md transition-shadow group">
            <div class="mb-3 md:mb-0">
                <h4 class="font-extrabold text-gray-800 text-lg flex items-center gap-2"><i data-lucide="file-text" class="w-5 h-5 text-indigo-500"></i> ${po.no_po}</h4>
                <p class="text-sm text-gray-500 mt-1 font-medium"><i data-lucide="user" class="inline w-3 h-3 mr-1"></i> ${po.customer} &nbsp;|&nbsp; <i data-lucide="layers" class="inline w-3 h-3 mr-1"></i> Total Item: ${po.items.length}</p>
            </div>
            <button onclick="prosesAlokasiPO('${po.no_po}')" class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="scan-barcode" class="w-4 h-4"></i> Siapkan Barang (FIFO)
            </button>
        </div>
    `).join('');

    const html = `
        <div class="max-w-4xl mx-auto">
            <h3 class="font-bold text-gray-700 mb-4 px-1">Daftar PO Perlu Disiapkan (Status: Open)</h3>
            ${rows || '<div class="p-8 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200"><i data-lucide="coffee" class="w-12 h-12 mx-auto text-gray-300 mb-3"></i>Tidak ada PO baru yang berstatus Open saat ini.</div>'}
        </div>
        
        <!-- Modal Alokasi FIFO -->
        <div id="modal-alokasi" class="fixed inset-0 bg-gray-900 bg-opacity-60 z-50 hidden flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl transform transition-all">
                <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h3 class="font-bold text-gray-800 text-lg flex items-center gap-2"><i data-lucide="cpu" class="text-indigo-600"></i> Usulan Alokasi Stok FIFO</h3>
                    <button onclick="closeModalAlokasi()" class="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><i data-lucide="x"></i></button>
                </div>
                <div class="p-6" id="alokasi-content"></div>
            </div>
        </div>
    `;
    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

let alokasiState = { no_po: null, alokasi: [] };

window.prosesAlokasiPO = async function(no_po) {
    const [res, rakRes] = await Promise.all([ fetchAPI('getDeliveryAlokasi', { no_po }), fetchAPI('getMaster', { type: 'Rak' }) ]);
    if(!res.success) return showToast(res.message, 'error');

    const masterRak = {};
    if(rakRes && rakRes.success) {
        rakRes.data.forEach(r => masterRak[String(r.kode_rak).trim().toUpperCase()] = r.nama_rak);
    }

    const alokasi = res.data;
    alokasiState = { no_po, alokasi };
    const tBody = alokasi.map(a => {
        let namaRak = masterRak[String(a.kode_rak).trim().toUpperCase()] || a.kode_rak;
        return `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="py-2.5 px-3 font-medium text-gray-700">${a.nama_barang || a.kode_barang}</td>
            <td class="py-2.5 px-3 text-center"><span class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-md text-xs font-bold">${namaRak}</span></td>
            <td class="py-2.5 px-3 text-center font-black text-green-600 text-base">${a.qty_alokasi}</td>
        </tr>`
    }).join('');

    const content = `
        <div class="bg-indigo-50 border border-indigo-100 text-indigo-800 p-4 rounded-lg mb-5 text-sm flex gap-3">
            <i data-lucide="info" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
            <p>Sistem telah menghitung usulan pengambilan stok FIFO. <b>Jika stok gudang kurang dari pesanan, sistem hanya akan mengalokasikan stok yang tersedia saat ini (Pengiriman Parsial)</b>. Sisa barang akan tetap berstatus Outstanding.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Tanggal Kirim <span class="text-red-500">*</span></label>
                <input id="input-tanggal-kirim" type="date" class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Ekspedisi <span class="text-red-500">*</span></label>
                <input id="input-ekspedisi-persiapan" type="text" placeholder="Contoh: 21 EXPRESS" class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>
        </div>
        <div class="overflow-x-auto border border-gray-200 rounded-lg mb-6">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-100 text-gray-700 border-b border-gray-200">
                    <tr><th class="py-3 px-3">Nama Barang</th><th class="py-3 px-3 text-center w-36">Rak Sumber</th><th class="py-3 px-3 text-center w-28">Qty Diambil</th></tr>
                </thead>
                <tbody>${tBody}</tbody>
            </table>
        </div>
        <div class="flex flex-col sm:flex-row justify-end gap-3 pt-2 border-t border-gray-100">
            <button onclick="closeModalAlokasi()" class="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">Batal</button>
            <button onclick='konfirmasiAlokasi()' class="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-md transition-all">
                <i data-lucide="check-circle" class="w-5 h-5"></i> Konfirmasi Persiapan
            </button>
        </div>
    `;
    document.getElementById('alokasi-content').innerHTML = content;
    document.getElementById('modal-alokasi').classList.remove('hidden');
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.closeModalAlokasi = function() { document.getElementById('modal-alokasi').classList.add('hidden'); }

window.konfirmasiAlokasi = async function() {
    const tanggal_kirim = document.getElementById('input-tanggal-kirim').value;
    const ekspedisi = document.getElementById('input-ekspedisi-persiapan').value.trim();
    if (!tanggal_kirim) return showToast('Tanggal Kirim wajib diisi', 'error');
    if (!ekspedisi) return showToast('Ekspedisi wajib diisi', 'error');

    const res = await fetchAPI('konfirmasiDelivery', { no_po: alokasiState.no_po, alokasi: alokasiState.alokasi, tanggal_kirim, ekspedisi }, true);
    if(res.success) {
        showToast(res.message); closeModalAlokasi();
        if(window.location.hash === '#persiapan') renderPersiapan(); else if(window.location.hash === '#rekap-po') renderRekapPO();
    } else { showToast(res.message, 'error'); }
}
