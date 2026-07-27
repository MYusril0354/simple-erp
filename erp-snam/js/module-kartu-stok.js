// --- KARTU STOK (GROUPED PER BARANG) ---
async function renderKartuStok() {
    setPageTitle('Laporan Kartu Stok');
    const [ksRes, bRes, rRes] = await Promise.all([
        fetchAPI('getKartuStok'), fetchAPI('getMaster', { type: 'Barang' }), fetchAPI('getMaster', { type: 'Rak' })
    ]);
    if(!ksRes || !ksRes.success) return;

    const masterBarang = {}; const masterRak = {};
    if(bRes && bRes.success) bRes.data.forEach(b => masterBarang[String(b.kode_barang).trim().toUpperCase()] = b.nama_barang);
    if(rRes && rRes.success) rRes.data.forEach(r => masterRak[String(r.kode_rak).trim().toUpperCase()] = r.nama_rak);

    const groupedKS = {};
    ksRes.data.forEach(ks => {
        const kode = String(ks.kode_barang).trim().toUpperCase();
        if (!groupedKS[kode]) {
            groupedKS[kode] = { kode_barang: kode, nama_barang: masterBarang[kode] || 'Nama Tidak Tersedia', history: [] };
        }
        groupedKS[kode].history.push(ks);
    });

    let htmlContent = '';
    const groups = Object.values(groupedKS);

    if (groups.length === 0) {
        htmlContent = '<div class="p-8 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200"><i data-lucide="file-x-2" class="w-12 h-12 mx-auto text-gray-300 mb-3"></i>Belum ada riwayat mutasi stok.</div>';
    } else {
        groups.forEach(group => {
            const rows = group.history.map(ks => {
                let tipeColor = ks.jenis_transaksi === 'Masuk' ? 'text-green-600 bg-green-50' : 
                                ks.jenis_transaksi === 'Keluar' ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';
                let namaRak = masterRak[String(ks.kode_rak).trim().toUpperCase()] || ks.kode_rak;
                
                return `
                    <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors text-gray-700">
                        <td class="px-4 py-2.5 text-xs font-medium">${new Date(ks.tanggal).toLocaleString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
                        <td class="px-4 py-2.5 text-center"><span class="bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md text-xs font-bold border border-gray-300">${namaRak}</span></td>
                        <td class="px-4 py-2.5 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${tipeColor}">${ks.jenis_transaksi}</span></td>
                        <td class="px-4 py-2.5 text-right font-semibold">${ks.qty}</td>
                        <td class="px-4 py-2.5 text-right font-black bg-gray-50/50 text-indigo-900 border-l border-r border-gray-100">${ks.saldo_setelah}</td>
                        <td class="px-4 py-2.5 text-xs text-gray-500 tracking-wide">${ks.referensi || '-'}</td>
                        <td class="px-4 py-2.5 text-xs text-gray-500 truncate max-w-[200px]">${ks.keterangan || '-'}</td>
                    </tr>
                `;
            }).join('');

            htmlContent += `
                <div class="mb-8 bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200 break-inside-avoid w-full max-w-full">
                    <div class="bg-indigo-50 px-5 py-3 border-b-2 border-indigo-200 flex flex-col md:flex-row md:items-center justify-between">
                        <h3 class="font-extrabold text-indigo-900 text-sm uppercase tracking-wider flex items-center gap-2">
                            <i data-lucide="package" class="w-5 h-5 text-indigo-500"></i> ${group.nama_barang}
                        </h3>
                        <span class="text-xs font-bold text-indigo-400 bg-white px-2 py-1 rounded border border-indigo-100 mt-2 md:mt-0 shadow-sm">${group.kode_barang}</span>
                    </div>
                    <div class="overflow-x-auto w-full">
                        <table class="w-full text-sm text-left whitespace-nowrap">
                            <thead class="bg-gray-100 text-gray-600 font-semibold border-b border-gray-200">
                                <tr>
                                    <th class="px-4 py-3 w-40">Waktu Mutasi</th>
                                    <th class="px-4 py-3 text-center w-24">Posisi Rak</th>
                                    <th class="px-4 py-3 text-center w-28">Tipe Mutasi</th>
                                    <th class="px-4 py-3 text-right w-24">Qty In/Out</th>
                                    <th class="px-4 py-3 text-right w-24 bg-gray-50 border-l border-r border-gray-200">Saldo Akhir</th>
                                    <th class="px-4 py-3 w-40">Ref. Dokumen</th>
                                    <th class="px-4 py-3">Keterangan</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        });
    }
    
    const wrapperHtml = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <h2 class="text-xl font-bold text-gray-800">Laporan Mutasi Kartu Stok</h2>
            <button onclick="cetakDokumenLaporan('Laporan Kartu Stok Gudang', 'print-kartustok-container')" class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="printer" class="w-4 h-4"></i> Cetak Kartu Stok
            </button>
        </div>
        <div id="print-kartustok-container" class="w-full">
            ${htmlContent}
        </div>
    `;
    document.getElementById('main-content').innerHTML = wrapperHtml;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
