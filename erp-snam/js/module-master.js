// --- MASTER ---
async function renderMaster(type) {
    setPageTitle('Master ' + type);
    const res = await fetchAPI('getMaster', { type });
    if (!res || !res.success) return;
    const data = res.data;

    let fields = '';
    if (type === 'Barang') {
        fields = `
            <input type="text" id="m_kode_barang" placeholder="Kode Barang" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-auto text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
            <input type="text" id="m_nama_barang" placeholder="Nama Barang" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-auto flex-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
            <input type="text" id="m_satuan" placeholder="Satuan (Pcs/Kg/Mtr)" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-32 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
        `;
    } else if (type === 'Customer') {
        fields = `
            <input type="text" id="m_kode_customer" placeholder="Kode Customer" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-auto text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
            <input type="text" id="m_nama_customer" placeholder="Nama Customer" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-auto flex-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
            <input type="text" id="m_alamat" placeholder="Alamat" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-1/3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
        `;
    } else if (type === 'Rak') {
        fields = `
            <input type="text" id="m_kode_rak" placeholder="Kode Rak" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-auto text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
            <input type="text" id="m_nama_rak" placeholder="Nama Rak / Lokasi" class="border border-gray-300 p-2.5 rounded-lg w-full md:w-auto flex-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required>
        `;
    }

    let formHtml = '';
    if (['super_user', 'gudang', 'penerima_order'].includes(currentUser.role)) {
        formHtml = `
            <form id="form-master" class="mb-6 flex flex-col md:flex-row gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                ${fields}
                <button type="submit" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 whitespace-nowrap flex items-center justify-center gap-2 font-medium transition-colors">
                    <i data-lucide="plus-circle" class="w-4 h-4"></i> Tambah Data
                </button>
            </form>
        `;
    }

    let tableHeaders = Object.keys(data[0] || {}).map(k => `<th class="px-4 py-3 text-left tracking-wider">${k.replace('_', ' ').toUpperCase()}</th>`).join('');
    let tableRows = data.map(row => {
        let cells = Object.values(row).map(val => `<td class="px-4 py-3 border-b border-gray-100">${val}</td>`).join('');
        return `<tr class="hover:bg-blue-50/50 transition-colors">${cells}</tr>`;
    }).join('');

    const html = `
        ${createCard(`
            ${formHtml}
            <div class="overflow-x-auto w-full rounded-lg border border-gray-200">
                <table class="w-full text-sm text-left whitespace-nowrap">
                    <thead class="bg-gray-100 text-gray-700 font-semibold border-b border-gray-200">
                        <tr>${tableHeaders || '<th class="px-4 py-3 text-left">Data Kosong</th>'}</tr>
                    </thead>
                    <tbody>${tableRows || '<tr><td class="px-4 py-8 text-center text-gray-500">Tidak ada data tersedia</td></tr>'}</tbody>
                </table>
            </div>
        `)}
    `;
    
    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    const form = document.getElementById('form-master');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            let payload = { type, data: {} };
            form.querySelectorAll('input').forEach(inp => {
                payload.data[inp.id.replace('m_', '')] = inp.value;
            });
            const r = await fetchAPI('saveMaster', payload, true);
            if(r.success) {
                showToast(r.message);
                renderMaster(type);
            } else {
                showToast(r.message, 'error');
            }
        };
    }
}
