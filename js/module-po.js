// --- INPUT PO ---
async function renderInputPO() {
    setPageTitle('Input Purchase Order (PO)');
    const [cRes, bRes] = await Promise.all([
        fetchAPI('getMaster', { type: 'Customer' }),
        fetchAPI('getMaster', { type: 'Barang' })
    ]);

    const customerOptions = cRes?.data?.map(c => `<option value="${c.kode_customer}">${c.nama_customer}</option>`).join('');
    window.masterBarangOptions = bRes?.data?.map(b => `<option value="${b.kode_barang}">${b.kode_barang} - ${b.nama_barang} (${b.satuan || '-'})</option>`).join('');

    const html = createCard(`
        <form id="form-po" class="space-y-6">
            <div class="max-w-md bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                <label class="block text-sm font-semibold text-gray-700 mb-1">Customer / Pemesan</label>
                <select id="po_customer" required class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                    <option value="">-- Pilih Customer --</option>
                    ${customerOptions}
                </select>
            </div>
            
            <div class="border border-gray-200 rounded-xl p-5 bg-white shadow-sm">
                <h4 class="font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2"><i data-lucide="list-ordered" class="text-blue-500"></i> Daftar Item Pesanan</h4>
                <div id="po-items" class="space-y-3">
                    <!-- Items inserted here -->
                </div>
                <button type="button" onclick="addPOItemRow()" class="mt-4 px-4 py-2 bg-blue-50 border border-blue-200 text-sm text-blue-700 rounded-lg hover:bg-blue-100 font-medium flex items-center gap-2 transition-colors">
                    <i data-lucide="plus" class="w-4 h-4"></i> Tambah Baris Item
                </button>
            </div>

            <button type="submit" class="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-md hover:bg-blue-700 font-bold flex items-center gap-2 transition-all active:scale-[0.98]">
                <i data-lucide="save"></i> Simpan Purchase Order (Status: Open)
            </button>
        </form>
    `);

    document.getElementById('main-content').innerHTML = html;
    addPOItemRow(); // initial row
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    document.getElementById('form-po').onsubmit = async (e) => {
        e.preventDefault();
        const customer = document.getElementById('po_customer').value;
        const rows = document.querySelectorAll('.po-item-row');
        const items = [];
        rows.forEach(r => {
            const kb = r.querySelector('.po-kode-barang').value;
            const qty = r.querySelector('.po-qty').value;
            if(kb && qty) items.push({ kode_barang: kb, qty: parseInt(qty, 10) });
        });

        if (items.length === 0) return showToast('Tambahkan minimal 1 item barang', 'error');

        const r = await fetchAPI('createPO', { kode_customer: customer, items }, true);
        if(r.success) {
            showToast(r.message);
            kirimEmailNotifikasiPOBaru(r.data?.no_po, customer, items, cRes?.data, bRes?.data);
            e.target.reset();
            document.getElementById('po-items').innerHTML = '';
            addPOItemRow();
        } else {
            showToast(r.message, 'error');
        }
    };
}

// Dibuat fire-and-forget (tidak di-await, error hanya di-log ke console)
// supaya kalau email gagal terkirim, alur input PO di UI tetap lancar.
function kirimEmailNotifikasiPOBaru(no_po, kodeCustomer, items, listCustomer, listBarang) {
    if (!EMAIL_API_URL || EMAIL_API_URL.includes('PASTE_URL')) {
        console.warn('EMAIL_API_URL belum diisi, notifikasi email PO dilewati.');
        return;
    }

    const namaCustomer = (listCustomer || []).find(c => c.kode_customer === kodeCustomer)?.nama_customer || kodeCustomer;
    const itemsWithName = items.map(it => {
        const b = (listBarang || []).find(x => x.kode_barang === it.kode_barang);
        return { kode_barang: it.kode_barang, nama_barang: b?.nama_barang || it.kode_barang, qty: it.qty };
    });

    fetch(EMAIL_API_URL, {
        method: 'POST',
        mode: 'no-cors', // Web App di akun lain tidak set header CORS; kita tidak butuh baca responsenya
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // hindari CORS preflight
        body: JSON.stringify({
            jenis: 'po_baru',
            no_po: no_po,
            customer: namaCustomer,
            items: itemsWithName,
            dibuat_oleh: currentUser?.username || '-',
            tanggal: new Date().toLocaleString('id-ID')
        })
    }).catch(err => console.warn('Gagal memicu email notifikasi PO:', err));
}

// Memicu email notifikasi Penerimaan Barang (stok masuk) lewat Web App yang sama.
// Sama seperti notifikasi PO: fire-and-forget, tidak mengganggu alur UI kalau gagal.
function kirimEmailNotifikasiPenerimaan(kodeBarang, kodeRak, qty, keterangan, saldoSetelah, listBarang) {
    if (!EMAIL_API_URL || EMAIL_API_URL.includes('PASTE_URL')) {
        console.warn('EMAIL_API_URL belum diisi, notifikasi email penerimaan barang dilewati.');
        return;
    }

    const barang = (listBarang || []).find(b => b.kode_barang === kodeBarang);

    fetch(EMAIL_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            jenis: 'penerimaan_barang',
            kode_barang: kodeBarang,
            nama_barang: barang?.nama_barang || kodeBarang,
            satuan: barang?.satuan || '',
            qty: qty,
            kode_rak: kodeRak,
            stok_saat_ini: saldoSetelah,
            keterangan: keterangan,
            diterima_oleh: currentUser?.username || '-',
            tanggal: new Date().toLocaleString('id-ID')
        })
    }).catch(err => console.warn('Gagal memicu email notifikasi penerimaan barang:', err));
}

window.addPOItemRow = function() {
    const container = document.getElementById('po-items');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'po-item-row flex flex-col md:flex-row md:items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg relative';
    row.innerHTML = `
        <select required class="po-kode-barang flex-1 border border-gray-300 p-2.5 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
            <option value="">-- Pilih Barang --</option>
            ${window.masterBarangOptions}
        </select>
        <div class="flex items-center gap-2 w-full md:w-auto">
            <input type="number" required min="1" placeholder="Qty" class="po-qty w-full md:w-32 border border-gray-300 p-2.5 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 bg-white border border-gray-200 hover:bg-red-50 p-2.5 rounded transition-colors shadow-sm">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
        </div>
    `;
    container.appendChild(row);
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// --- OUTSTANDING PO (GROUPED PER ITEM) ---
async function renderDaftarPO() {
    setPageTitle('Outstanding PO (Belum Terkirim)');
    const [poRes, barangRes, stokRes] = await Promise.all([
        fetchAPI('getPOList'), fetchAPI('getMaster', { type: 'Barang' }), fetchAPI('getStokPerRak')
    ]);
    if(!poRes || !poRes.success) return;

    const masterBarang = {}; const masterSatuan = {};
    if (barangRes && barangRes.success) {
        barangRes.data.forEach(b => {
            let kb = String(b.kode_barang).trim().toUpperCase();
            masterBarang[kb] = b.nama_barang;
            masterSatuan[kb] = b.satuan;
        });
    }

    const stokGudang = {};
    if (stokRes && stokRes.success) {
        stokRes.data.forEach(s => {
            let kb = String(s.kode_barang).trim().toUpperCase();
            if (!stokGudang[kb]) stokGudang[kb] = 0;
            stokGudang[kb] += (parseInt(s.qty, 10) || 0);
        });
    }

    const groupedData = {};
    poRes.data.forEach(po => {
        if (po.status === 'Selesai') return; 
        po.items.forEach(item => {
            const kode = String(item.kode_barang).trim().toUpperCase();
            const pesanan = parseInt(item.qty_pesanan, 10) || 0;
            const terkirim = parseInt(item.qty_terkirim, 10) || 0;
            const qtyDr = parseInt(item.qty_dr, 10) || 0;
            const outstanding = pesanan - terkirim;
            if (outstanding <= 0) return;

            if (!groupedData[kode]) {
                groupedData[kode] = {
                    kode_barang: kode, nama_barang: masterBarang[kode] || 'Unknown', satuan: masterSatuan[kode] || '-',
                    list: [], total_pesanan: 0, total_terkirim: 0, total_outstanding: 0, total_qty_dr: 0, stok_gudang: stokGudang[kode] || 0
                };
            }
            groupedData[kode].list.push({
                no_po: po.no_po, tanggal: po.tanggal, customer: po.customer,
                qty_pesanan: pesanan, qty_terkirim: terkirim, qty_os: outstanding, qty_dr: qtyDr
            });
            groupedData[kode].total_pesanan += pesanan;
            groupedData[kode].total_terkirim += terkirim;
            groupedData[kode].total_outstanding += outstanding;
            groupedData[kode].total_qty_dr += qtyDr;
        });
    });

    let htmlContent = '';
    const groups = Object.values(groupedData);

    if (groups.length === 0) {
        htmlContent = '<div class="p-8 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200"><i data-lucide="check-circle" class="w-12 h-12 mx-auto text-green-300 mb-3"></i>Semua pesanan telah terpenuhi. Tidak ada Outstanding PO.</div>';
    } else {
        groups.forEach((group, index) => {
            const rows = group.list.map((item, i) => `
                <tr class="border-b border-gray-200 hover:bg-blue-50/50 bg-white transition-colors text-gray-700">
                    <td class="px-3 py-2.5 text-center">${i + 1}</td>
                    <td class="px-3 py-2.5 font-medium text-blue-700">${item.no_po}</td>
                    <td class="px-3 py-2.5">${new Date(item.tanggal).toLocaleDateString('id-ID')}</td>
                    <td class="px-3 py-2.5">${item.customer}</td>
                    <td class="px-3 py-2.5 text-center">${group.satuan}</td>
                    <td class="px-3 py-2.5 text-right font-medium">${item.qty_pesanan.toLocaleString('id-ID')}</td>
                    <td class="px-3 py-2.5 text-right text-purple-600">${item.qty_dr.toLocaleString('id-ID')}</td>
                    <td class="px-3 py-2.5 text-right">${item.qty_terkirim.toLocaleString('id-ID')}</td>
                    <td class="px-3 py-2.5 text-right font-bold text-red-600">${item.qty_os.toLocaleString('id-ID')}</td>
                    <td class="px-3 py-2.5"></td>
                    <td class="px-3 py-2.5"></td>
                </tr>
            `).join('');

            htmlContent += `
                <div class="mb-8 rounded-xl shadow-sm overflow-hidden border border-gray-300 bg-white break-inside-avoid w-full max-w-full">
                    <div class="px-4 py-3 bg-gray-50 border-b border-gray-300">
                        <h3 class="font-extrabold text-gray-800 text-sm tracking-wide">
                            Barang : <span class="text-blue-700">${group.nama_barang}</span> - ${group.kode_barang}
                        </h3>
                    </div>
                    <div class="overflow-x-auto w-full">
                        <table class="w-full text-sm text-left whitespace-nowrap">
                            <thead class="bg-blue-500 text-white shadow-inner">
                                <tr>
                                    <th class="px-3 py-3 text-center border-r border-blue-400 w-12">No.</th>
                                    <th class="px-3 py-3 border-r border-blue-400">No. PO</th>
                                    <th class="px-3 py-3 border-r border-blue-400">PO Date</th>
                                    <th class="px-3 py-3 border-r border-blue-400">Customer</th>
                                    <th class="px-3 py-3 text-center border-r border-blue-400 w-20">Satuan</th>
                                    <th class="px-3 py-3 text-right border-r border-blue-400 w-24">Order</th>
                                    <th class="px-3 py-3 text-right border-r border-blue-400 w-24">Qty DR</th>
                                    <th class="px-3 py-3 text-right border-r border-blue-400 w-24">Terkirim</th>
                                    <th class="px-3 py-3 text-right border-r border-blue-400 w-24">OS (Sisa)</th>
                                    <th class="px-3 py-3 text-right border-r border-blue-400 w-32">Stok Gudang</th>
                                    <th class="px-3 py-3 text-right w-36">Stok Tanpa Alokasi</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows}
                                <tr class="bg-blue-100 font-bold border-t-2 border-blue-200 text-blue-900">
                                    <td colspan="5" class="px-3 py-3 text-right border-r border-blue-200">Total</td>
                                    <td class="px-3 py-3 text-right border-r border-blue-200">${group.total_pesanan.toLocaleString('id-ID')}</td>
                                    <td class="px-3 py-3 text-right border-r border-blue-200 text-purple-700">${group.total_qty_dr.toLocaleString('id-ID')}</td>
                                    <td class="px-3 py-3 text-right border-r border-blue-200">${group.total_terkirim.toLocaleString('id-ID')}</td>
                                    <td class="px-3 py-3 text-right border-r border-blue-200 text-red-700">${group.total_outstanding.toLocaleString('id-ID')}</td>
                                    <td class="px-3 py-3 text-right border-r border-blue-200 font-black text-green-700 tracking-wider">${group.stok_gudang.toLocaleString('id-ID')}</td>
                                    <td class="px-3 py-3 text-right font-black tracking-wider ${(group.stok_gudang - group.total_pesanan) < 0 ? 'text-red-700' : 'text-gray-800'}">${(group.stok_gudang - group.total_pesanan).toLocaleString('id-ID')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
    }
    
    const wrapperHtml = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <h2 class="text-xl font-bold text-gray-800">Outstanding PO (Belum Terkirim)</h2>
            <button onclick="cetakDokumenLaporan('Laporan Outstanding PO', 'print-outstanding-container')" class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="printer" class="w-4 h-4"></i> Cetak Laporan
            </button>
        </div>
        <div id="print-outstanding-container" class="w-full">
            ${htmlContent}
        </div>
    `;
    document.getElementById('main-content').innerHTML = wrapperHtml;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// --- REKAP SELURUH PO (Dengan Fitur Rowspan per Item) ---
async function renderRekapPO() {
    setPageTitle('Rekapitulasi Seluruh PO');
    
    const [resPO, bRes] = await Promise.all([
        fetchAPI('getPOList'),
        fetchAPI('getMaster', { type: 'Barang' })
    ]);
    
    if(!resPO || !resPO.success) return;

    const masterBarang = {};
    if(bRes && bRes.success) {
        bRes.data.forEach(b => masterBarang[String(b.kode_barang).trim().toUpperCase()] = b.nama_barang);
    }

    let rows = '';

    resPO.data.forEach(po => {
        const rowCount = po.items.length || 1; 
        const statusColor = po.status === 'Open' ? 'bg-blue-100 text-blue-800 border-blue-200' : 
                            po.status === 'Proses' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-green-100 text-green-800 border-green-200';
        
        const aksiBtn = (po.status === 'Open' && currentUser.role === 'gudang') ? 
            `<button onclick="prosesAlokasiPO('${po.no_po}')" class="text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition-colors flex items-center gap-1 mx-auto"><i data-lucide="package-search" class="w-3 h-3"></i> Siapkan</button>` 
            : '-';

        po.items.forEach((item, index) => {
            const itemName = masterBarang[String(item.kode_barang).trim().toUpperCase()] || item.kode_barang;
            const pesanan = parseInt(item.qty_pesanan, 10) || 0;
            const terkirim = parseInt(item.qty_terkirim, 10) || 0;
            const sisa = pesanan - terkirim;
            
            if (index === 0) {
                rows += `
                    <tr class="hover:bg-blue-50/30 transition-colors border-t-2 border-t-gray-200">
                        <td class="px-3 py-2.5 font-bold text-gray-800 align-top bg-gray-50 border-r border-gray-200" rowspan="${rowCount}">${po.no_po}</td>
                        <td class="px-3 py-2.5 text-gray-600 align-top bg-gray-50 border-r border-gray-200 whitespace-nowrap" rowspan="${rowCount}">${new Date(po.tanggal).toLocaleDateString('id-ID')}</td>
                        <td class="px-3 py-2.5 font-medium align-top bg-gray-50 border-r border-gray-200" rowspan="${rowCount}">${po.customer}</td>
                        
                        <td class="px-3 py-2 border-b border-gray-100 font-medium text-gray-700 text-xs">${itemName}</td>
                        <td class="px-3 py-2 border-b border-gray-100 text-center">${pesanan}</td>
                        <td class="px-3 py-2 border-b border-gray-100 text-center text-blue-600 font-semibold">${terkirim}</td>
                        <td class="px-3 py-2 border-b border-gray-100 text-center font-bold ${sisa > 0 ? 'text-red-500' : 'text-green-500'}">${sisa}</td>
                        
                        <td class="px-3 py-2.5 text-center align-middle bg-gray-50 border-l border-gray-200" rowspan="${rowCount}">
                            <span class="px-2.5 py-1 inline-flex text-xs font-bold rounded-full border ${statusColor}">${po.status}</span>
                        </td>
                        <td class="px-3 py-2.5 text-center align-middle bg-gray-50 border-l border-gray-200 no-print" rowspan="${rowCount}">
                            ${aksiBtn}
                        </td>
                    </tr>
                `;
            } else {
                rows += `
                    <tr class="hover:bg-blue-50/30 transition-colors">
                        <td class="px-3 py-2 border-b border-gray-100 font-medium text-gray-700 text-xs">${itemName}</td>
                        <td class="px-3 py-2 border-b border-gray-100 text-center">${pesanan}</td>
                        <td class="px-3 py-2 border-b border-gray-100 text-center text-blue-600 font-semibold">${terkirim}</td>
                        <td class="px-3 py-2 border-b border-gray-100 text-center font-bold ${sisa > 0 ? 'text-red-500' : 'text-green-500'}">${sisa}</td>
                    </tr>
                `;
            }
        });
    });

    const html = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <h2 class="text-xl font-bold text-gray-800">Daftar Transaksi Keseluruhan PO</h2>
            <button onclick="cetakDokumenLaporan('Rekapitulasi Seluruh PO', 'print-rekap-container')" class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="printer" class="w-4 h-4"></i> Cetak Rekap
            </button>
        </div>
        
        <div id="print-rekap-container">
            ${createCard(`
                <div class="overflow-x-auto w-full max-w-full rounded-lg border-2 border-gray-200">
                    <table class="w-full text-sm text-left whitespace-nowrap">
                        <thead class="bg-gray-200 text-gray-800 font-bold border-b-2 border-gray-300">
                            <tr>
                                <th class="px-3 py-3 border-r border-gray-300">No PO</th>
                                <th class="px-3 py-3 border-r border-gray-300">Tanggal</th>
                                <th class="px-3 py-3 border-r border-gray-300">Customer</th>
                                <th class="px-3 py-3 w-64 text-indigo-700">Nama Barang</th>
                                <th class="px-3 py-3 text-center text-indigo-700 w-20">Order</th>
                                <th class="px-3 py-3 text-center text-indigo-700 w-20">Terkirim</th>
                                <th class="px-3 py-3 text-center text-indigo-700 w-20">Sisa</th>
                                <th class="px-3 py-3 text-center border-l border-gray-300">Status</th>
                                <th class="px-3 py-3 text-center w-28 no-print border-l border-gray-300">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="9" class="text-center py-8 text-gray-500 font-medium">Belum ada data Transaksi PO</td></tr>'}</tbody>
                    </table>
                </div>
            `, 'p-0 overflow-hidden')} 
        </div>
    `;
    
    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
