# Optimasi Google Apps Script — ERP Gudang & Penjualan

File: `gas/Code.gs` — pengganti langsung `Code.gs` di editor Apps Script.
**Kontrak API tidak berubah** (`{action, payload, token}` masuk, `{success, data, message}` keluar) → **frontend (`js/*`) tidak perlu diubah sama sekali.**

---

## Masalah performa di code.gs lama

| # | Hotspot | Dampak |
|---|---------|--------|
| 1 | `updateRow()` membaca **seluruh sheet** lalu `setValue()` **per kolom**, setiap kali dipanggil | `apiCreateSuratJalan` dgn 10 item ≈ 30+ operasi I/O sheet ≈ 5–20 detik |
| 2 | `getSheetData()` membaca ulang sheet yang sama berkali-kali dalam 1 request | `getDeliveryAlokasi` & `konfirmasiDelivery` membaca DeliveryRequest 2×; dashboard membaca 6 sheet |
| 3 | `appendRow()` di dalam loop (detail PO, baris DR, rincian colly) | 1 round-trip network per baris |
| 4 | `deleteRowsWhere()` clearContents + tulis ulang seluruh sheet tiap dipanggil | Sangat mahal + berisiko kehilangan data bila gagal di tengah |
| 5 | Tanpa LockService | Eksekusi bersamaan bisa menghasilkan nomor PO/SJ/DR dobel & stok korup; frontend sering kena limit konkurensi → masuk jalur retry (tambah 3,5 detik+) |
| 6 | Master data dibaca penuh tiap request | Login/getMaster selalu bayar biaya baca sheet |

## Solusi di Code.gs baru

1. **Memoisasi per-eksekusi** — tiap sheet dibaca maksimal sekali per request (`_matrix`).
2. **Write buffer + flush** — semua append/update/delete hanya mengubah memori; di akhir `doPost`, `flushAll()` menulis balik **maks. 1× setValues per sheet** yang disentuh.
3. **Append batch** — `appendRows()` untuk detail PO, baris DR, KartuStok SJ, rincian colly.
4. **CacheService untuk master** — `MasterBarang/Customer/Rak/Users` di-cache 15 menit; invalidasi otomatis saat aksi tulis terkait.
5. **LockService** — aksi tulis memegang script lock (tunggu maks 10 dtk) → anti nomor dobel & stok korup, plus request tidak gagal random karena limit konkurensi.
6. **Bonus atomicity** — handler error di tengah jalan = buffer dibuang → **tidak ada lagi baris setengah-jadi** tertulis.
7. **Index Map O(1)** untuk join antar-sheet di endpoint berat (POList, Alokasi, Antrean SJ, Dashboard).

## Perkiraan dampak

| Endpoint | Lama (perkiraan) | Baru (perkiraan) |
|---|---|---|
| `login` / `getMaster` (cache hangat) | 1–3 s | ~0,1–0,3 s |
| `getDashboardData`, `getPOList`, `getKartuStok` | 2–6 s | 0,5–1,5 s |
| `createSuratJalan` (10 item) | 5–20 s | 1–2 s |
| `konfirmasiDelivery` / `penerimaanStok` | 3–8 s | < 1–1,5 s |

*(Cold start Apps Script ±0,6–2 dtk tetap ada dan tidak bisa dihilangkan — itu batasan platform.)*

## Langkah deploy

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Backup dulu: File → **Version history** aman secara default; atau copy code lama ke doc sendiri.
3. Ganti seluruh isi `Code.gs` dengan isi `gas/Code.gs` ini → Save.
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**
   (pakai cara ini agar URL `/exec` TIDAK berubah → `js/config.js` tidak perlu disentuh).
5. Uji dari aplikasi: login → dashboard → input PO → persiapan → buat SJ → cetak.

## Checklist pengujian

- [ ] Login semua role
- [ ] Penerimaan stok → cek KartuStok & StokPerRak
- [ ] Create PO (multi item)
- [ ] Persiapan barang: alokasi muncul, konfirmasi parsial & penuh
- [ ] Buat SJ dari antrean DR → stok terpotong, qty_terkirim bertambah, status PO benar
- [ ] Rincian colly simpan + ulang (replace), validasi match
- [ ] Cetak SJ & Laporan Persiapan
- [ ] Manajemen user: create/update/delete + guard super user terakhir
- [ ] Dua orang input bersamaan → tidak ada nomor dobel

## Catatan penting

- Setelah edit manual data master/user langsung dari UI Google Sheets, jalankan fungsi
  `invalidateAllCaches()` sekali dari editor agar cache master ikut segar.
- Duplikat `apiGetSuratJalanList` versi lama (salinan rusak berisi logika createSJ) dihapus —
  deklarasi fungsi kedua di JS selalu menimpa yang pertama, jadi perilaku runtime tidak berubah.
- `SECRET_KEY` masih hardcoded & password hash tanpa salt — sebaiknya dipindah ke Script Properties
  di kesempatan berikutnya (bukan bagian optimasi kecepatan).
