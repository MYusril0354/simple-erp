// --- LAPORAN PERSIAPAN BARANG (ACUAN PICKING STOREMAN) ---
async function renderLaporanPersiapan() {
    setPageTitle('Laporan Persiapan Barang');
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
    const defaultStart = weekAgo.toISOString().slice(0, 10);

    const html = `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-5 flex flex-col sm:flex-row items-end gap-4 no-print">
            <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Tanggal Mulai (Tgl Kirim)</label>
                <input id="filter-tgl-mulai" type="date" value="${defaultStart}" class="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-xs font-semibold text-gray-600 mb-1">Tanggal Selesai (Tgl Kirim)</label>
                <input id="filter-tgl-selesai" type="date" value="${defaultEnd}" class="border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>
            <button onclick="muatLaporanPersiapan()" class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="filter" class="w-4 h-4"></i> Tampilkan
            </button>
            <button onclick="cetakDokumenLaporan('Laporan Persiapan Barang', 'print-persiapan-container')" class="bg-gray-100 text-gray-700 border border-gray-300 px-5 py-2.5 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="printer" class="w-4 h-4"></i> Cetak Laporan
            </button>
        </div>
        <div id="print-persiapan-container" class="w-full">
            <!-- Tabel laporan akan dimuat di sini -->
        </div>
    `;
    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    muatLaporanPersiapan();
}

window.muatLaporanPersiapan = async function() {
    const tanggal_mulai = document.getElementById('filter-tgl-mulai').value;
    const tanggal_selesai = document.getElementById('filter-tgl-selesai').value;
    const container = document.getElementById('print-persiapan-container');
    if (!container) return;
    if (!tanggal_mulai || !tanggal_selesai) return showToast('Pilih rentang tanggal', 'error');

    container.innerHTML = `<div class="animate-pulse h-64 bg-gray-200 border border-gray-300 rounded-xl w-full mt-4"></div>`;

    const res = await fetchAPI('getLaporanPersiapan', { tanggal_mulai, tanggal_selesai });
    if (!res || !res.success) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">${res?.message || 'Gagal'}</div>`; return;
    }
    const groups = res.data;
    if (groups.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200"><i data-lucide="inbox" class="w-12 h-12 mx-auto text-gray-300 mb-3"></i>Tidak ada data pada rentang ini.</div>`;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    let rowNo = 0; let bodyRows = '';
    groups.forEach(g => {
        const tglTrans = new Date(g.tanggal).toLocaleDateString('id-ID');
        const tglKirim = g.tanggal_kirim ? new Date(g.tanggal_kirim).toLocaleDateString('id-ID') : '-';
        const sjBadge = g.no_surat_jalan
            ? `<span class="bg-green-100 text-green-700 border border-green-200 text-xs font-bold px-2.5 py-1 rounded-full">${g.no_surat_jalan}</span>`
            : `<span class="bg-red-100 text-red-700 border border-red-200 text-xs font-bold px-2.5 py-1 rounded-full">Belum SJ</span>`;

        g.items.forEach(it => {
            rowNo++;
            bodyRows += `
            <tr class="border-b border-gray-100 hover:bg-gray-50 text-gray-700">
                <td class="py-2 px-3 text-center text-gray-500">${rowNo}</td>
                <td class="py-2 px-3 whitespace-nowrap">${tglTrans}</td>
                <td class="py-2 px-3 whitespace-nowrap font-medium text-blue-700">${tglKirim}</td>
                <td class="py-2 px-3 font-bold text-indigo-700 whitespace-nowrap">${g.no_dr}</td>
                <td class="py-2 px-3 font-medium">${g.customer}</td>
                <td class="py-2 px-3">${g.ekspedisi || '-'}</td>
                <td class="py-2 px-3 whitespace-nowrap">${it.kode_barang}</td>
                <td class="py-2 px-3">${it.nama_barang}</td>
                <td class="py-2 px-3 text-center">${it.satuan}</td>
                <td class="py-2 px-3">${it.nama_rak}</td>
                <td class="py-2 px-3 text-right font-bold text-gray-800">${it.qty}</td>
                <td class="py-2 px-3 text-center">${sjBadge}</td>
            </tr>`;
        });
        bodyRows += `
            <tr class="bg-blue-50/50 border-b-2 border-blue-200">
                <td colspan="10" class="py-2 px-3 text-right font-bold text-blue-800">Total DR ${g.no_dr}</td>
                <td class="py-2 px-3 text-right font-extrabold text-blue-900">${g.total_qty}</td>
                <td class="py-2 px-3"></td>
            </tr>`;
    });

    container.innerHTML = createCard(`
        <div class="overflow-x-auto w-full max-w-full rounded-lg border border-gray-200">
            <table class="w-full text-sm text-left whitespace-nowrap">
                <thead class="bg-blue-500 text-white">
                    <tr>
                        <th class="py-3 px-3">No</th>
                        <th class="py-3 px-3">Tgl Trans</th>
                        <th class="py-3 px-3">Tgl Kirim</th>
                        <th class="py-3 px-3">No Trans</th>
                        <th class="py-3 px-3">Customer</th>
                        <th class="py-3 px-3">Ekspedisi</th>
                        <th class="py-3 px-3">Kode Barang</th>
                        <th class="py-3 px-3">Nama Barang</th>
                        <th class="py-3 px-3 text-center">Satuan</th>
                        <th class="py-3 px-3">Rak</th>
                        <th class="py-3 px-3 text-right">Jml</th>
                        <th class="py-3 px-3 text-center">Surat Jalan</th>
                    </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
