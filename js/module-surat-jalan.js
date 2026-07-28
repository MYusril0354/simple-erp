// --- SURAT JALAN ---
async function renderSuratJalan() {
    setPageTitle('Manajemen Surat Jalan');
    const [drRes, sjRes] = await Promise.all([ fetchAPI('getAntreanSJ'), fetchAPI('getSuratJalanList') ]);
    
    const pRows = (drRes?.data || []).map(dr => `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="py-3 px-3 font-medium text-gray-800">
                ${dr.no_dr}
                <div class="text-xs text-gray-500 font-normal mt-0.5">PO: ${dr.no_po}</div>
            </td>
            <td class="py-3 px-3 text-gray-600 truncate max-w-[120px]">${dr.customer}</td>
            <td class="py-3 px-3 text-right">
                <button onclick="buatSuratJalan('${dr.no_dr}')" class="bg-blue-600 text-white text-xs px-3 py-1.5 font-bold rounded hover:bg-blue-700 shadow-sm transition-colors">Buat SJ</button>
            </td>
        </tr>
    `).join('');

    const sRows = sjRes?.data?.map(sj => `
        <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <td class="py-3 px-3 font-bold text-indigo-700">${sj.no_surat_jalan}</td>
            <td class="py-3 px-3 text-gray-600">${new Date(sj.tanggal).toLocaleDateString('id-ID')}</td>
            <td class="py-3 px-3 font-medium text-gray-700">${sj.no_po}</td>
            <td class="py-3 px-3 text-gray-600">${sj.customer}</td>
            <td class="py-3 px-3 text-center"><span class="bg-green-100 text-green-800 border border-green-200 text-xs px-3 py-1 font-bold rounded-full">${sj.status}</span></td>
            <td class="py-3 px-3 text-center">
                <button onclick="bukaCetakSJ('${sj.no_surat_jalan}')" class="bg-indigo-600 text-white text-xs px-3 py-1.5 font-bold rounded hover:bg-indigo-700 shadow-sm transition-colors inline-flex items-center gap-1">
                    <i data-lucide="printer" class="w-3.5 h-3.5"></i> Cetak
                </button>
            </td>
        </tr>
    `).join('');

    const html = `
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div class="xl:col-span-1">
                ${createCard(`
                    <h3 class="font-bold text-gray-800 mb-4 border-b pb-3 flex items-center gap-2"><i data-lucide="package-check" class="text-blue-500 w-5 h-5"></i> Antrean SJ (DR Selesai)</h3>
                    <div class="overflow-x-auto w-full max-h-[500px] overflow-y-auto">
                        <table class="w-full text-sm">
                            <tbody>${pRows || '<tr><td colspan="3" class="text-gray-400 text-center py-6 border-2 border-dashed rounded-lg">Tidak ada alokasi siap kirim</td></tr>'}</tbody>
                        </table>
                    </div>
                `)}
            </div>
            <div class="xl:col-span-2">
                ${createCard(`
                    <h3 class="font-bold text-gray-800 mb-4 border-b pb-3 flex items-center gap-2"><i data-lucide="truck" class="text-green-500 w-5 h-5"></i> Riwayat Surat Jalan</h3>
                    <div class="overflow-x-auto w-full rounded-lg border border-gray-200">
                        <table class="w-full text-sm text-left whitespace-nowrap">
                            <thead class="bg-gray-100 text-gray-700 border-b border-gray-200">
                                <tr><th class="py-3 px-3">No SJ</th><th class="py-3 px-3">Tanggal</th><th class="py-3 px-3">No PO</th><th class="py-3 px-3">Customer</th><th class="py-3 px-3 text-center">Status</th><th class="py-3 px-3 text-center">Aksi</th></tr>
                            </thead>
                            <tbody>${sRows || '<tr><td colspan="6" class="text-center py-8 text-gray-500">Belum ada Surat Jalan yang dicetak</td></tr>'}</tbody>
                        </table>
                    </div>
                `)}
            </div>
        </div>
        <!-- Modal Rincian Colly & Cetak Surat Jalan -->
        <div id="modal-cetak-sj" class="fixed inset-0 bg-gray-900 bg-opacity-60 z-50 hidden flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-2xl w-full max-w-3xl overflow-scroll shadow-2xl transform transition-all flex flex-col" style="max-height:90vh">
                <div id="modal-cetak-sj-body"></div>
            </div>
        </div>
    `;
    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.buatSuratJalan = async function(no_dr) {
    const res = await fetchAPI('createSuratJalan', { no_dr }, true); 
    if(res.success) { showToast(`Surat Jalan ${res.data.no_sj} berhasil dibuat!`); renderSuratJalan(); } 
    else { showToast(res.message, 'error'); }
}

let collyModalState = { no_surat_jalan: null, sj: null, customer: null, items: [], lastValidasi: null };

window.bukaCetakSJ = async function(no_surat_jalan) {
    const res = await fetchAPI('getSuratJalanCetakData', { no_surat_jalan });
    if (!res || !res.success) return showToast(res?.message || 'Gagal memuat data Surat Jalan', 'error');

    const d = res.data;
    collyModalState = {
        no_surat_jalan: no_surat_jalan, sj: d.sj, customer: d.customer,
        items: d.items.map(it => ({
            kode_barang: it.kode_barang, nama_barang: it.nama_barang, satuan: it.satuan || '-', qty_sj: it.qty_sj,
            collies: it.collies.length > 0 ? it.collies.map(c => c.qty) : [it.qty_sj]
        })),
        lastValidasi: null
    };
    renderModalCetakSJ();
    document.getElementById('modal-cetak-sj').classList.remove('hidden');
}

window.closeModalCetakSJ = function() { document.getElementById('modal-cetak-sj').classList.add('hidden'); }

function renderModalCetakSJ() {
    const s = collyModalState;
    const itemRows = s.items.map((it, itemIdx) => {
        const totalColly = it.collies.reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
        const match = totalColly === it.qty_sj;
        const selisih = totalColly - it.qty_sj;

        const collyInputs = it.collies.map((qty, cIdx) => `
            <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs text-gray-400 w-16">Colly ${cIdx + 1}</span>
                <input type="number" min="0" value="${qty}" onchange="updateCollyQty(${itemIdx}, ${cIdx}, this.value)" class="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <span class="text-xs text-gray-400">pcs</span>
                <button onclick="hapusColly(${itemIdx}, ${cIdx})" class="text-red-400 hover:text-red-600 p-1 ml-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `).join('');

        return `
        <div class="border border-gray-200 rounded-lg p-4 mb-3">
            <div class="flex justify-between items-start mb-2 gap-2">
                <div>
                    <p class="font-bold text-gray-800">${it.nama_barang}</p>
                    <p class="text-xs text-gray-500">Qty Persiapan Barang: <b>${it.qty_sj}</b> pcs</p>
                </div>
                <span class="${match ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'} border text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                    <i data-lucide="${match ? 'check-circle' : 'alert-triangle'}" class="w-3.5 h-3.5"></i>
                    ${match ? 'Cocok' : `Selisih ${selisih > 0 ? '+' : ''}${selisih}`}
                </span>
            </div>
            <div class="mt-3">${collyInputs}</div>
            <button onclick="tambahColly(${itemIdx})" class="mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Tambah Colly</button>
            <p class="text-xs text-gray-400 mt-2 pt-2 border-t border-dashed border-gray-200">Total dari colly: <b>${totalColly}</b> pcs &nbsp;|&nbsp; Jumlah Colly: <b>${it.collies.length}</b></p>
        </div>`;
    }).join('');

    const html = `
        <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
            <h3 class="font-bold text-gray-800 text-lg flex items-center gap-2"><i data-lucide="box" class="text-indigo-600"></i> Rincian Colly & Kemasan</h3>
            <button onclick="closeModalCetakSJ()" class="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><i data-lucide="x"></i></button>
        </div>
        <div class="p-6 overflow-y-auto flex-1">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 border border-gray-200 p-4 rounded-xl mb-5 text-sm">
                <div><span class="text-gray-400 block text-xs">No Surat Jalan</span><b class="text-gray-800 text-base">${s.no_surat_jalan}</b></div>
                <div><span class="text-gray-400 block text-xs">Customer</span><b class="text-gray-800 text-base">${s.customer.nama_customer}</b></div>
                <div><span class="text-gray-400 block text-xs">Ekspedisi / Kirim</span><b class="text-gray-800 text-base">${s.sj.ekspedisi || '-'}</b></div>
            </div>
            <h4 class="font-bold text-gray-700 mb-3 text-sm">Pengaturan Item Kemasan (Colli)</h4>
            <div>${itemRows}</div>
        </div>
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-between items-center gap-3 flex-shrink-0">
            <div>
                <button onclick="simpanRincianColly(true)" class="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 text-sm shadow-sm transition-colors flex items-center gap-1.5">
                    <i data-lucide="save" class="w-4 h-4"></i> Simpan Saja
                </button>
            </div>
            <div class="flex gap-2">
                <button onclick="cetakLabelColly()" class="px-4 py-2 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 text-sm shadow-sm transition-colors flex items-center gap-1.5">
                    <i data-lucide="tags" class="w-4 h-4"></i> Cetak Label Box
                </button>
                <button onclick="cetakDokumenSJ()" class="px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 text-sm shadow-md transition-all flex items-center gap-1.5">
                    <i data-lucide="printer" class="w-4.5 h-4.5"></i> Simpan & Cetak SJ
                </button>
            </div>
        </div>
    `;

    document.getElementById('modal-cetak-sj-body').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.updateCollyQty = function(itemIdx, cIdx, value) {
    collyModalState.items[itemIdx].collies[cIdx] = parseInt(value, 10) || 0;
    renderModalCetakSJ();
}

window.hapusColly = function(itemIdx, cIdx) {
    if (collyModalState.items[itemIdx].collies.length <= 1) return showToast('Minimal harus ada 1 colly per item', 'error');
    collyModalState.items[itemIdx].collies.splice(cIdx, 1);
    renderModalCetakSJ();
}

window.tambahColly = function(itemIdx) {
    collyModalState.items[itemIdx].collies.push(0);
    renderModalCetakSJ();
}

window.simpanRincianColly = async function(showNotif = false) {
    const s = collyModalState;
    const payload = {
        no_surat_jalan: s.no_surat_jalan,
        items: s.items.map(it => ({
            kode_barang: it.kode_barang,
            collies: it.collies.map(qty => ({ qty }))
        }))
    };

    const res = await fetchAPI('saveSuratJalanColly', payload, true);
    if (res && res.success) {
        s.lastValidasi = res.data || null;
        if(showNotif) showToast(res.message || 'Rincian Colly berhasil disimpan.');
        return true;
    } else {
        showToast(res ? res.message : 'Gagal menyimpan rincian colly', 'error');
        return false;
    }
}

window.cetakLabelColly = async function() {
    const s = collyModalState;
    const berhasilSimpan = await window.simpanRincianColly();
    if (!berhasilSimpan) return;

    let labelBlocks = '';
    let collyNoGlobal = 0;
    const totalBoxGlobal = s.items.reduce((a, b) => a + b.collies.length, 0);

    s.items.forEach(it => {
        it.collies.forEach((qty, cIdx) => {
            collyNoGlobal++;
            labelBlocks += `
            <div class="label-box">
                <div class="label-header">
                    <span>SHIPPING LABEL</span>
                    <span style="font-size:18px;">Box ${collyNoGlobal} of ${totalBoxGlobal}</span>
                </div>
                <table style="margin-top:10px;">
                    <tr><td class="font-bold" style="width:25%;">CUSTOMER</td><td style="font-size:24px; font-weight:black; text-transform:uppercase;">${s.customer.nama_customer}</td></tr>
                    <tr><td class="font-bold">ALAMAT</td><td style="font-size:14px; font-weight:medium;">${s.customer.alamat || '-'}</td></tr>
                    <tr><td class="font-bold">NO. PO</td><td style="font-size:18px; font-weight:bold;">${s.sj.no_po}</td></tr>
                    <tr><td class="font-bold">EKSPEDISI</td><td style="font-size:18px; font-weight:bold; text-transform:uppercase;">${s.sj.ekspedisi || '-'}</td></tr>
                </table>
                <table style="margin-top:15px;">
                    <thead><tr><th>KODE BARANG</th><th>DESKRIPSI BARANG</th><th style="width:20%;">QTY</th></tr></thead>
                    <tbody>
                        <tr><td class="center font-bold" style="font-size:16px;">${it.kode_barang}</td><td style="font-size:18px; font-weight:bold;">${it.nama_barang}</td><td class="center font-bold" style="font-size:24px;">${qty} ${it.satuan}</td></tr>
                    </tbody>
                </table>
            </div>`;
        });
    });

    const printHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8"><title>Label Colly - ${s.no_surat_jalan}</title>
        <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #000; }
            .label-box { 
                border: 4px solid #000; 
                padding: 20px; 
                margin-bottom: 25px; 
                height: 125mm; /* Setengah halaman A4 */
                box-sizing: border-box;
                page-break-after: always;
                page-break-inside: avoid; /* Mencegah 1 label terpotong 2 halaman */
                border-radius: 4px;
                background: #fff;
            }
            .label-header { 
                border-bottom: 2px solid #000; 
                padding-bottom: 8px; 
                margin-bottom: 10px; 
                font-weight: bold; 
                font-size: 30px; 
                display: flex; 
                justify-content: space-between;
                align-items: center;
            }
            
            /* Styling Tabel dalam Label */
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 8px 6px; text-align: left; vertical-align: middle; }
            th { background-color: #f3f4f6; text-align: center; font-size: 20px; text-transform: uppercase; border-bottom: 2px solid #000;}
            .center { text-align: center; }
            .font-bold { font-weight: bold; }              
        </style>
    </head>
    <body>
        ${labelBlocks}
    </body>
    </html>`;

    const win = window.open('', '_blank');
    if (!win) return showToast('Popup diblokir browser. Izinkan popup.', 'error');
    win.document.write(printHtml);
    win.document.close();
    setTimeout(() => win.print(), 1000);
}

window.cetakDokumenSJ = async function() {
    const s = collyModalState;
    const berhasilSimpan = await window.simpanRincianColly();
    if (!berhasilSimpan) return;
    const semuaCocok = s.lastValidasi ? s.lastValidasi.semuaCocok : false;
    if (!semuaCocok) {
        const lanjut = confirm('Qty per colly masih ada yang TIDAK COCOK dengan qty persiapan barang. Tetap cetak Surat Jalan?');
        if (!lanjut) return;
    }

    const win = window.open('', '_blank');
    if (!win) return showToast('Popup diblokir browser.', 'error');
    win.document.write(buildHtmlCetakSJ(s,true));
    win.document.close();
    setTimeout(() => win.print(), 1000);
}

function buildHtmlCetakSJ(s, double = false) {
    let itemRows = '';
    let totalCBO = 0;

    s.items.forEach(it => {
        let collyGroups = {};
        it.collies.forEach(q => {
            if (!collyGroups[q]) collyGroups[q] = 0;
            collyGroups[q]++;
        });

        for (let qty in collyGroups) {
            let countCBO = collyGroups[qty];
            totalCBO += countCBO;

            itemRows += `
            <tr>
                <td style="border:1px solid #333;padding:4px 6px;text-align:center;">${it.kode_barang}</td>
                <td style="border:1px solid #333;padding:4px 6px;background-color:#eaeaea;">${it.nama_barang}</td>
                <td style="border:1px solid #333;padding:4px 6px;text-align:right;font-weight:bold;">${qty}</td>
                <td style="border:1px solid #333;padding:4px 6px;text-align:center;">${it.satuan}</td>
                <td style="border:1px solid #333;padding:4px 6px;text-align:center;font-weight:bold;">${countCBO}</td>
            </tr>`;
        }
    });

    const alamatFormat = s.customer.alamat ? s.customer.alamat.replace(/\r?\n/g, '<br>') : '-';

    // Template satu blok surat jalan lengkap
    const sjBlock = (label) => `
        <div class="sj-copy">
            ${label ? `<div style="text-align:right; font-size:10px; margin-bottom:4px; font-weight:bold; color:#555;">${label}</div>` : ''}
            <div class="header">
                <div class="company">${NAME_CORP}<br><span style="font-weight:normal;font-size:11px;">Pandaan, Pasuruan, Jawa Timur</span></div>
                <div style="text-align:right;"><h2 style="margin:0; font-size:18px;">SURAT JALAN</h2><p style="margin:0;font-weight:bold;">${s.no_surat_jalan}</p></div>
            </div>
            <table class="info-table" style="margin-bottom: 20px;">
                <tr><td style="width:15%;">No. PO</td><td style="width:2%;">:</td><td>${s.sj.no_po}</td><td style="width:15%;">Tanggal</td><td style="width:2%;">:</td><td>${new Date(s.sj.tanggal).toLocaleDateString('id-ID')}</td></tr>
                <tr><td>Customer</td><td>:</td><td>${s.customer.nama_customer}</td><td>Ekspedisi</td><td>:</td><td>${s.sj.ekspedisi || '-'}</td></tr>
                <tr><td style="vertical-align:top;">Alamat</td><td style="vertical-align:top;">:</td><td colspan="4">${alamatFormat}</td></tr>
            </table>
            <table>
                <thead>
                    <tr style="background:#f3f4f6;">
                        <th style="border:1px solid #333;padding:5px;">Kode/Code</th>
                        <th style="border:1px solid #333;padding:5px;">Description</th>
                        <th style="border:1px solid #333;padding:5px;">Jumlah/Quantity</th>
                        <th style="border:1px solid #333;padding:5px;">Unit</th>
                        <th style="border:1px solid #333;padding:5px;">CBO</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemRows}
                    <tr style="background:#f3f4f6; font-weight:bold;">
                        <td colspan="4" style="border:1px solid #333;padding:5px;text-align:right;">Total CBO</td>
                        <td style="border:1px solid #333;padding:5px;text-align:center;font-size:14px;">${totalCBO}</td>
                    </tr>
                </tbody>
            </table>
            <div class="ttd-wrap">
                <div class="ttd-box"><div class="ttd-line">Disiapkan Oleh<br><b>${s.sj.disiapkan_oleh || '..........................'}</b></div></div>
                <div class="ttd-box"><div class="ttd-line">Disetujui Oleh<br><b>${s.sj.disetujui_oleh || '..........................'}</b></div></div>
                <div class="ttd-box"><div class="ttd-line">Ekspedisi<br><b>${s.sj.ekspedisi || '..........................'}</b></div></div>
                <div class="ttd-box"><div class="ttd-line">Penerima<br>( .......................... )</div></div>
            </div>
        </div>
    `;

    // CSS khusus jika double
    const doubleCSS = double ? `
        @page { size: A4; margin: 10mm; }
        body { 
            font-size: 12px; 
            margin: 0; 
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;          /* setinggi halaman cetak */
            justify-content: space-between;
        }
        .sj-copy {
            flex: 1;
            page-break-inside: avoid;
            overflow: hidden;
            padding: 5px 0;
            border-bottom: 1px dashed #333;
        }
        .sj-copy:last-child {
            border-bottom: none;
        }
    ` : `
        @page { size: A4; margin: 15mm; }
        body { font-size: 13px; }
    `;

    const content = double
        ? sjBlock('Untuk Rekap') + sjBlock('Untuk Ekspedisi / Penerima')
        : sjBlock('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8"><title>Surat Jalan ${s.no_surat_jalan}${double ? ' (2 copy)' : ''}</title>
        <style>
            body { font-family: Arial, sans-serif; color: #111; }
            .header { display:flex; justify-content:space-between; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:12px; }
            .company { font-weight:bold; font-size:${double ? '14px' : '16px'}; }
            table { width:100%; border-collapse:collapse; margin-bottom:15px; }
            .info-table td { padding:2px 0; vertical-align:top; }
            .ttd-wrap { display:flex; justify-content:space-between; margin-top:30px; }
            .ttd-box { text-align:center; width:24%; }
            .ttd-line { border-top:1px solid #333; margin-top:50px; padding-top:4px; font-size:11px; }
            ${doubleCSS}
        </style>
    </head>
    <body>
        ${content}
    </body>
    </html>`;
}
