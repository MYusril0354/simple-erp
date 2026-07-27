// --- PENERIMAAN STOK ---
async function renderPenerimaan() {
    setPageTitle('Penerimaan Stok (Barang Masuk)');
    const [bRes, rRes] = await Promise.all([
        fetchAPI('getMaster', { type: 'Barang' }),
        fetchAPI('getMaster', { type: 'Rak' })
    ]);

    const barangOptions = bRes?.data?.map(b => `<option value="${b.kode_barang}">${b.kode_barang} - ${b.nama_barang}</option>`).join('');
    const rakOptions = rRes?.data?.map(r => `<option value="${r.kode_rak}">${r.nama_rak}</option>`).join('');

    const html = createCard(`
        <form id="form-penerimaan" class="max-w-lg space-y-5">
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Barang Masuk</label>
                <select id="p_barang" required class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                    <option value="">-- Pilih Barang --</option>
                    ${barangOptions}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Rak Tujuan (Alokasi)</label>
                <select id="p_rak" required class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                    <option value="">-- Pilih Rak --</option>
                    ${rakOptions}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Quantity (Qty Masuk)</label>
                <input type="number" id="p_qty" required min="1" class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
            </div>
            <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">Keterangan / Referensi Vendor</label>
                <input type="text" id="p_ket" placeholder="Misal: Surat Jalan Supplier No. 123" class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
            </div>
            <button type="submit" class="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 w-full flex justify-center items-center gap-2 font-bold shadow-md transition-all active:scale-[0.98]">
                <i data-lucide="check-circle"></i> Proses Stok Masuk
            </button>
        </form>
    `);

    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    document.getElementById('form-penerimaan').onsubmit = async (e) => {
        e.preventDefault();
        const kodeBarang = document.getElementById('p_barang').value;
        const kodeRak = document.getElementById('p_rak').value;
        const qty = document.getElementById('p_qty').value;
        const keterangan = document.getElementById('p_ket').value;
        const payload = { kode_barang: kodeBarang, kode_rak: kodeRak, qty: qty, keterangan: keterangan };
        const r = await fetchAPI('penerimaanStok', payload, true);
        if(r.success) {
            showToast(r.message);
            kirimEmailNotifikasiPenerimaan(kodeBarang, kodeRak, qty, keterangan, r.data?.saldo_setelah, bRes?.data);
            e.target.reset();
        } else {
            showToast(r.message, 'error');
        }
    };
}
