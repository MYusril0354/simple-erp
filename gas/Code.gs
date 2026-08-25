// =============================================================================================
// ERP GUDANG & PENJUALAN — GOOGLE APPS SCRIPT BACKEND (VERSI TEROPTIMASI)
// =============================================================================================
// RINGKASAN OPTIMASI (perilaku & kontrak API 100% sama dengan versi lama, frontend tidak perlu diubah):
//
// 1. MEMOISASI PER-EKSEKUSI  : getSheetData() membaca tiap sheet MAKSIMAL SEKALI per request.
//    Versi lama membaca ulang sheet yang sama berkali-kali (apiKonfirmasiDelivery membaca
//    DeliveryRequest 2x, apiGetDeliveryAlokasi 2x, dst). Setiap bacaan = round-trip ke server
//    Sheets (~100-400ms), jadi ini sumber lambat terbesar untuk endpoint READ.
//
// 2. WRITE BUFFER + FLUSH    : appendRow/updateRow/deleteRowsWhere TIDAK lagi menulis langsung
//    ke sheet. Semua mutasi dilakukan di memori, lalu di-flush SATU KALI per sheet di akhir
//    request (1x setValues per sheet). Versi lama: updateRow membaca SELURUH sheet lalu setValue
//    PER KOLOM; apiCreateSuratJalan dengan 10 item bisa melakukan 30+ operasi I/O.
//    Sekarang: maksimal 1 baca + 1 tulis per sheet yang disentuh.
//
// 3. APPEND BATCH            : loop yang dulu appendRow satu-per-satu (detail PO, baris DR,
//    rincian colly, kartu stok SJ) sekarang mengumpulkan baris lalu appendRows() sekali jalan.
//
// 4. CACHE MASTER DATA       : MasterBarang/MasterCustomer/MasterRak/Users di-cache di
//    CacheService (TTL 15 menit) karena jarang berubah. Invalidasi otomatis di setiap aksi
//    tulis yang menyentuhnya. Login & getMaster jadi hampir instan saat cache hangat.
//
// 5. LockService             : aksi tulis memegang script lock (maks tunggu 10 dtk) supaya dua
//    eksekusi bersamaan tidak saling menimpa (nomor dokumen dobel / stok korup). Bonus: request
//    tidak lagi gagal random karena limit konkurensi -> frontend jarang masuk jalur retry.
//
// 6. BONUS KONSISTENSI       : kalau handler melempar error di tengah jalan, buffer belum
//    di-flush sehingga TIDAK ada baris setengah-jadi tertulis (dulu: parsial).
//
// CATATAN PERILAKU:
// - Duplikat apiGetSuratJalanList yang lama (salinan rusak berisi logika createSJ) DIHAPUS.
//   Di JS, deklarasi fungsi kedua selalu menimpa yang pertama, jadi perilaku live tidak berubah.
// - Setelah edit manual sheet dari UI Google Sheets / jalankan migrasi, panggil
//   invalidateAllCaches() sekali dari editor agar cache master ikut segar.
// =============================================================================================

// ==========================================
// KONFIGURASI AWAL
// ==========================================
const SECRET_KEY = "SUPER_SECRET_ERP_KEY_2026"; // Ganti dengan secret key yang aman

// Nama-nama sheet yang digunakan
const SHEETS = [
  "Users", "MasterBarang", "MasterCustomer", "MasterRak",
  "StokPerRak", "KartuStok", "POHeader", "PODetail",
  "DeliveryRequest", "SuratJalan", "SuratJalanDetail", "SuratJalanColly"
];

// Header kanonik — dipakai untuk self-healing jika sheet kosong/belum punya header,
// dan sebagai acuan urutan kolom untuk append baris (array).
const CANONICAL_HEADERS = {
  "Users": ["id", "username", "password_hash", "role", "akses_menu"],
  "MasterBarang": ["kode_barang", "nama_barang", "satuan", "deskripsi"],
  "MasterCustomer": ["kode_customer", "nama_customer", "alamat", "telepon"],
  "MasterRak": ["kode_rak", "nama_rak"],
  "StokPerRak": ["id", "kode_barang", "kode_rak", "qty"],
  "KartuStok": ["id", "tanggal", "kode_barang", "kode_rak", "jenis_transaksi", "qty", "saldo_setelah", "referensi", "keterangan"],
  "POHeader": ["no_po", "tanggal", "kode_customer", "status", "created_by"],
  "PODetail": ["id", "no_po", "kode_barang", "qty_pesanan", "qty_terkirim"],
  "DeliveryRequest": ["id", "no_po", "kode_barang", "qty_diminta", "kode_rak_alokasi", "qty_alokasi", "status", "no_dr", "tanggal", "tanggal_kirim", "ekspedisi", "no_surat_jalan"],
  "SuratJalan": ["no_surat_jalan", "tanggal", "no_po", "kode_customer", "status", "disiapkan_oleh", "disetujui_oleh", "ekspedisi"],
  "SuratJalanDetail": ["no_surat_jalan", "kode_barang", "qty"],
  "SuratJalanColly": ["id", "no_surat_jalan", "kode_barang", "no_colly", "qty"]
};

// Sheet master yang boleh di-cache lintas-request via CacheService (tanpa field tanggal/Date).
const CACHED_SHEETS = { "MasterBarang": true, "MasterCustomer": true, "MasterRak": true, "Users": true };
const MASTER_CACHE_TTL_SEC = 900; // 15 menit

// Aksi yang MENGUBAH data -> wajib memegang LockService sebelum eksekusi & flush.
const WRITE_ACTIONS = {
  "saveMaster": true, "penerimaanStok": true, "createPO": true,
  "konfirmasiDelivery": true, "createSuratJalan": true, "saveSuratJalanColly": true,
  "updateSuratJalanInfo": true, "createUser": true, "updateUserAccess": true, "deleteUser": true
};

// ==========================================
// INISIALISASI DATABASE (jalankan sekali dari editor)
// ==========================================
function initDB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEETS.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
  });

  setHeaders("Users", CANONICAL_HEADERS["Users"]);
  setHeaders("MasterBarang", CANONICAL_HEADERS["MasterBarang"]);
  setHeaders("MasterCustomer", CANONICAL_HEADERS["MasterCustomer"]);
  setHeaders("MasterRak", CANONICAL_HEADERS["MasterRak"]);
  setHeaders("StokPerRak", CANONICAL_HEADERS["StokPerRak"]);
  setHeaders("KartuStok", CANONICAL_HEADERS["KartuStok"]);
  setHeaders("POHeader", CANONICAL_HEADERS["POHeader"]);
  setHeaders("PODetail", CANONICAL_HEADERS["PODetail"]);
  setHeaders("DeliveryRequest", CANONICAL_HEADERS["DeliveryRequest"]);
  setHeaders("SuratJalan", CANONICAL_HEADERS["SuratJalan"]);
  setHeaders("SuratJalanDetail", CANONICAL_HEADERS["SuratJalanDetail"]);
  setHeaders("SuratJalanColly", CANONICAL_HEADERS["SuratJalanColly"]);

  const users = getSheetData("Users");
  if (users.length === 0) {
    const defaultPassHash = hashPassword("admin123");
    appendRow("Users", [generateId(), "admin", defaultPassHash, "super_user", "[]"]);
    flushAll();
  }
}

function setHeaders(sheetName, headers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

// Menambahkan kolom baru ke sheet yang sudah ada tanpa menghapus data lama
function ensureColumns(sheetName, newHeaders) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  newHeaders.forEach(h => {
    if (headers.indexOf(h) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
      headers.push(h);
    }
  });
  invalidateSheetCache(sheetName);
}

// ==========================================
// MIGRASI (jalankan sekali dari editor, sama seperti versi lama)
// ==========================================
function migrateFiturCetakSJ() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("SuratJalanColly")) {
    ss.insertSheet("SuratJalanColly");
  }
  setHeaders("SuratJalanColly", CANONICAL_HEADERS["SuratJalanColly"]);
  ensureColumns("SuratJalan", ["disiapkan_oleh", "disetujui_oleh", "ekspedisi"]);
  invalidateAllCaches();
  Logger.log("Migrasi selesai: sheet SuratJalanColly siap & kolom SuratJalan sudah lengkap.");
}

function migrateFiturLaporanPersiapan() {
  ensureColumns("DeliveryRequest", ["no_dr", "tanggal", "tanggal_kirim", "ekspedisi", "no_surat_jalan"]);
  invalidateAllCaches();
  Logger.log("Migrasi selesai: kolom no_dr, tanggal, tanggal_kirim, ekspedisi, no_surat_jalan sudah ditambahkan ke DeliveryRequest.");
}

function migrateFiturManajemenUser() {
  ensureColumns("Users", ["akses_menu"]);
  invalidateAllCaches();
  Logger.log("Migrasi selesai: kolom akses_menu sudah ditambahkan ke sheet Users.");
}

// Kosongkan semua cache master (panggil dari editor setelah edit manual data master/user).
function invalidateAllCaches() {
  try {
    const cache = CacheService.getScriptCache();
    Object.keys(CACHED_SHEETS).forEach(n => cache.remove("mx:" + n));
  } catch (e) { /* CacheService tidak tersedia — abaikan */ }
}

function invalidateSheetCache(sheetName) {
  if (!CACHED_SHEETS[sheetName]) return;
  try { CacheService.getScriptCache().remove("mx:" + sheetName); } catch (e) {}
}

// =============================================================================================
// LAPISAN PERFORMA: memoisasi baca + buffer tulis + flush batch
// =============================================================================================

// State per-eksekusi. PENTING: instance GAS yang "hangat" bisa mempertahankan variabel global
// antar-request, maka _resetExecutionState() WAJIB dipanggil di awal doPost agar kita tidak
// menyaji data basi dari request sebelumnya.
let _mem = null;     // nama sheet -> { headers:[], rows:[[]], dirty:false, headerDirty:false }
let _ssRef = null;   // objek spreadsheet, di-cache agar getActiveSpreadsheet tidak dipanggil ulang
let _sheetRefs = {}; // nama -> objek sheet

function _resetExecutionState() {
  _mem = {};
  _ssRef = null;
  _sheetRefs = {};
}

function _ss() {
  if (!_ssRef) _ssRef = SpreadsheetApp.getActiveSpreadsheet();
  return _ssRef;
}

function _sheet(name) {
  let sh = _sheetRefs[name];
  if (!sh) {
    sh = _ss().getSheetByName(name);
    if (!sh) {
      sh = _ss().insertSheet(name); // self-healing: sheet hilang -> dibuatkan
      _sheetRefs[name] = sh;
    }
  }
  return sh;
}

// Ambil matriks {headers, rows} sebuah sheet. Sumber prioritas:
//   1) memori eksekusi ini (sudah termasuk mutasi yang belum di-flush)
//   2) CacheService (untuk sheet master)
//   3) baca dari sheet (sekali, lalu tersimpan)
function _matrix(name) {
  if (_mem[name]) return _mem[name];

  // Coba cache lintas-request untuk sheet master
  if (CACHED_SHEETS[name]) {
    try {
      const j = CacheService.getScriptCache().get("mx:" + name);
      if (j && j.length < 1000000) {
        const o = JSON.parse(j);
        if (o && Array.isArray(o.h) && Array.isArray(o.r)) {
          const m = { headers: o.h, rows: o.r, dirty: false, headerDirty: false };
          _mem[name] = m;
          return m;
        }
      }
    } catch (e) { /* cache gagal -> lanjut baca sheet */ }
  }

  const sh = _sheet(name);
  let headers = [];
  let rows = [];
  let headerDirty = false;
  if (sh.getLastRow() > 0) {
    const vals = sh.getDataRange().getValues();
    headers = vals[0].map(h => String(h));
    rows = vals.slice(1);
  }
  // Self-healing: sheet kosong / tanpa header -> adopsi header kanonik (akan ditulis saat flush)
  if (headers.length === 0 || headers.every(h => !h)) {
    const canon = CANONICAL_HEADERS[name];
    if (canon) {
      headers = canon.slice();
      headerDirty = sh.getLastRow() === 0; // hanya tandai benar-benar kosong
    }
  }

  const m = { headers: headers, rows: rows, dirty: false, headerDirty: headerDirty };
  _mem[name] = m;

  // Simpan ke cache lintas-request (hanya sheet master, jaga ukuran < ~90KB)
  if (CACHED_SHEETS[name]) {
    try {
      const payload = JSON.stringify({ h: m.headers, r: m.rows });
      if (payload.length < 90000) {
        CacheService.getScriptCache().put("mx:" + name, payload, MASTER_CACHE_TTL_SEC);
      }
    } catch (e) { /* Date dsb tidak JSON-safe pada kasus lain — master aman */ }
  }
  return m;
}

function _markDirty(name) {
  const m = _matrix(name);
  m.dirty = true;
  invalidateSheetCache(name); // cache master tidak boleh menyaji data basi setelah mutasi
  return m;
}

// API publik yang SAMA dengan versi lama — dipakai semua business logic.
// Kini ter-memoisasi: sheet dibaca maksimal sekali per eksekusi.
function getSheetData(sheetName) {
  const m = _matrix(sheetName);
  const headers = m.headers;
  return m.rows.map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// Append satu baris (array sesuai urutan header). Hanya mutasi memori.
function appendRow(sheetName, rowData) {
  appendRows(sheetName, [rowData]);
}

// Append banyak baris sekaligus — tetap murah walau dipanggil berulang, tapi
// gunakan appendRows langsung untuk batch besar (sekali push array).
function appendRows(sheetName, arrayOfRows) {
  if (!arrayOfRows || arrayOfRows.length === 0) return;
  const m = _markDirty(sheetName);
  const hlen = m.headers.length;
  arrayOfRows.forEach(arr => {
    const row = Array.prototype.slice.call(arr);
    while (row.length < hlen) row.push(""); // normalisasi panjang agar kolom tidak bergeser
    m.rows.push(row);
  });
}

// Update baris berdasarkan kolom id — murni operasi memori (versi lama membaca seluruh sheet
// lalu setValue per kolom; ini penyebab terbesar kelambatan endpoint tulis).
function updateRow(sheetName, idColumnName, idValue, updateData) {
  const m = _markDirty(sheetName);
  const idIndex = m.headers.indexOf(idColumnName);
  if (idIndex === -1) return false;

  const patchCols = {};
  for (const key in updateData) {
    const colIndex = m.headers.indexOf(key);
    if (colIndex !== -1) patchCols[colIndex] = updateData[key];
  }

  for (let i = 0; i < m.rows.length; i++) {
    if (m.rows[i][idIndex] == idValue) { // samakan semantik longgar (==) dengan versi lama
      for (const ci in patchCols) {
        m.rows[i][ci] = patchCols[ci];
      }
      return true;
    }
  }
  return false;
}

// Hapus baris yang memenuhi predicate — murni operasi memori (versi lama clearContents +
// tulis ulang SEMUA baris setiap kali dipanggil).
function deleteRowsWhere(sheetName, predicate) {
  const m = _markDirty(sheetName);
  const headers = m.headers;
  const kept = m.rows.filter(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return !predicate(obj);
  });
  const removed = m.rows.length !== kept.length;
  m.rows = kept;
  return removed;
}

// Tulis semua mutasi memori ke sheet — MAKSIMAL 1x setValues + (bila perlu) 1x trim per sheet.
// Dipanggil tepat sekali di akhir doPost, SETELAH handler sukses.
function flushAll() {
  if (!_mem) return;
  Object.keys(_mem).forEach(name => _flushSheet(name));
}

function _flushSheet(name) {
  const m = _mem[name];
  if (!m || !m.dirty) return;
  const sh = _sheet(name);
  const hlen = Math.max(m.headers.length, 1);

  if (m.headerDirty) {
    sh.getRange(1, 1, 1, hlen).setValues([m.headers]);
    m.headerDirty = false;
  }

  const needed = m.rows.length + 1; // +1 baris header
  // Pastikan grid cukup (menulis melewati maxRows akan error)
  if (sh.getMaxRows() < needed) {
    sh.insertRowsAfter(sh.getMaxRows(), needed - sh.getMaxRows());
  }

  if (m.rows.length > 0) {
    sh.getRange(2, 1, m.rows.length, hlen).setValues(m.rows);
  }

  // Buang sisa baris fisik yang tidak lagi terpakai (efek penghapusan)
  const lastRow = sh.getLastRow();
  const excess = lastRow - needed;
  if (excess > 0) {
    sh.deleteRows(needed + 1, excess);
  }

  m.dirty = false;
}

// =============================================================================================
// UTILITIES (tidak berubah)
// =============================================================================================
function generateId() {
  return Utilities.getUuid();
}

function hashPassword(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return rawHash.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    akses_menu: parseAksesMenu(user.akses_menu),
    exp: new Date().getTime() + (24 * 60 * 60 * 1000) // 1 hari
  };
  const base64Payload = Utilities.base64Encode(JSON.stringify(payload));
  const signature = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, base64Payload, SECRET_KEY);
  const base64Signature = Utilities.base64Encode(signature);
  return base64Payload + "." + base64Signature;
}

function parseAksesMenu(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const signature = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, parts[0], SECRET_KEY);
  const expectedSignature = Utilities.base64Encode(signature);

  if (parts[1] !== expectedSignature) return null;

  const payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(parts[0])).getDataAsString());
  if (payload.exp < new Date().getTime()) return null; // Expired

  return payload;
}

// Nomor dokumen — kini memakai data ter-memoisasi (nol round-trip tambahan).
function generateNoPO() {
  const dateStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd");
  const pos = getSheetData("POHeader");
  const todayPOs = pos.filter(po => po.no_po && po.no_po.indexOf("PO-" + dateStr) === 0);
  const nextNumber = (todayPOs.length + 1).toString().padStart(3, '0');
  return `PO-${dateStr}-${nextNumber}`;
}

function generateNoSJ() {
  const dateStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd");
  const sjs = getSheetData("SuratJalan");
  const todaySJs = sjs.filter(sj => sj.no_surat_jalan && sj.no_surat_jalan.indexOf("SJ-" + dateStr) === 0);
  const nextNumber = (todaySJs.length + 1).toString().padStart(3, '0');
  return `SJ-${dateStr}-${nextNumber}`;
}

function generateNoDR() {
  const dateStr = Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd");
  const drs = getSheetData("DeliveryRequest");
  const todayDRs = [...new Set(drs.filter(d => d.no_dr && d.no_dr.indexOf("DR-" + dateStr) === 0).map(d => d.no_dr))];
  const nextNumber = (todayDRs.length + 1).toString().padStart(3, '0');
  return `DR-${dateStr}-${nextNumber}`;
}

// Helper pencarian cepat: index Map sekali bangun, lookup O(1) alih-alih .find() berulang O(n).
function indexBy(rows, keyFn) {
  const map = {};
  (rows || []).forEach(r => {
    const k = keyFn(r);
    if (!(k in map)) map[k] = r;
  });
  return map;
}
function normKey(v) { return String(v == null ? "" : v).trim().toUpperCase(); }

// =============================================================================================
// MAIN API ROUTER (doPost)
// =============================================================================================
function doPost(e) {
  // WAJIB: instance warm bisa membawa state global request sebelumnya
  _resetExecutionState();

  let response = { success: false, message: "Unknown error" };
  let lock = null;

  try {
    if (e.postData === undefined) {
      return buildResponse({ success: true, message: "Preflight OK" });
    }

    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload;
    const token = body.token;

    // Auth Check
    let user = null;
    if (action !== "login") {
      user = verifyToken(token);
      if (!user) {
        return buildResponse({ success: false, message: "Unauthorized / Token Expired" }, 401);
      }
    }

    // Aksi tulis diserialisasi dengan script lock supaya read-modify-write antar
    // eksekusi bersamaan tidak saling menimpa (anti nomor dobel / stok korup).
    if (WRITE_ACTIONS[action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(10000); // lempar error bila lebih dari 10 dtk menunggu -> ditangkap catch di bawah
    }

    // Routing
    switch (action) {
      case "login":
        response = apiLogin(payload); break;
      case "getMaster":
        response = apiGetMaster(payload, user); break;
      case "saveMaster":
        response = apiSaveMaster(payload, user); break;
      case "penerimaanStok":
        response = apiPenerimaanStok(payload, user); break;
      case "createPO":
        response = apiCreatePO(payload, user); break;
      case "getPOList":
        response = apiGetPOList(payload, user); break;
      case "getAntreanSJ":
        response = apiGetAntreanSJ(user); break;
      case "getStokPerRak":
        response = { success: true, data: getSheetData("StokPerRak") }; break;
      case "getDeliveryAlokasi":
        response = apiGetDeliveryAlokasi(payload, user); break;
      case "konfirmasiDelivery":
        response = apiKonfirmasiDelivery(payload, user); break;
      case "createSuratJalan":
        response = apiCreateSuratJalan(payload, user); break;
      case "getSuratJalanList":
        response = apiGetSuratJalanList(user); break;
      case "getSuratJalanColly":
        response = apiGetSuratJalanColly(payload, user); break;
      case "saveSuratJalanColly":
        response = apiSaveSuratJalanColly(payload, user); break;
      case "updateSuratJalanInfo":
        response = apiUpdateSuratJalanInfo(payload, user); break;
      case "getSuratJalanCetakData":
        response = apiGetSuratJalanCetakData(payload, user); break;
      case "getLaporanPersiapan":
        response = apiGetLaporanPersiapan(payload, user); break;
      case "getUserList":
        response = apiGetUserList(user); break;
      case "createUser":
        response = apiCreateUser(payload, user); break;
      case "updateUserAccess":
        response = apiUpdateUserAccess(payload, user); break;
      case "deleteUser":
        response = apiDeleteUser(payload, user); break;
      case "getKartuStok":
        response = apiGetKartuStok(payload, user); break;
      case "getDashboardData":
        response = apiGetDashboardData(user); break;
      default:
        response = { success: false, message: "Action not found" };
    }

    // FLUSH: tulis semua mutasi memori ke sheet, sekali per sheet yang disentuh.
    // Kalau handler tadi melempar error, flush tidak dijalankan -> tidak ada tulisan parsial.
    flushAll();

  } catch (error) {
    response = { success: false, message: error.toString() };
    // Buang buffer yang belum ter-flush agar state memori bersih untuk eksekusi berikutnya
    _resetExecutionState();
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (e2) {}
    }
  }

  return buildResponse(response);
}

function buildResponse(data, code = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// BUSINESS LOGIC & ENDPOINTS
// (semua kontrak request/response SAMA dengan versi lama)
// ==========================================

function apiLogin(payload) {
  const users = getSheetData("Users"); // cache hangat -> nyaris instan
  const user = users.find(u => u.username === payload.username);
  if (!user) return { success: false, message: "User tidak ditemukan" };

  if (user.password_hash !== hashPassword(payload.password)) {
    return { success: false, message: "Password salah" };
  }

  const token = generateToken(user);
  return { success: true, data: { token, username: user.username, role: user.role, akses_menu: parseAksesMenu(user.akses_menu) } };
}

function apiGetMaster(payload, user) {
  const type = payload.type; // "Barang", "Customer", "Rak", "Users"
  if (!["Barang", "Customer", "Rak", "Users"].includes(type)) {
    return { success: false, message: "Tipe master tidak valid" };
  }
  const data = getSheetData("Master" + type);
  return { success: true, data: data };
}

function apiSaveMaster(payload, user) {
  if (user.role !== "super_user" && user.role !== "gudang") return { success: false, message: "Akses ditolak" };

  const type = payload.type;
  const data = payload.data;

  if (type === "Barang") {
    appendRow("MasterBarang", [data.kode_barang, data.nama_barang, data.satuan, data.deskripsi]);
  } else if (type === "Customer") {
    appendRow("MasterCustomer", [data.kode_customer, data.nama_customer, data.alamat, data.telepon]);
  } else if (type === "Rak") {
    appendRow("MasterRak", [data.kode_rak, data.nama_rak]);
  }
  return { success: true, message: "Data berhasil disimpan" };
}

function apiPenerimaanStok(payload, user) {
  if (user.role !== "super_user" && user.role !== "gudang") return { success: false, message: "Akses ditolak" };

  const { kode_barang, kode_rak, qty, keterangan } = payload;
  const numQty = parseInt(qty, 10);

  if (numQty <= 0) return { success: false, message: "Qty harus lebih dari 0" };

  const stokData = getSheetData("StokPerRak");

  // Pencocokan kebal spasi/huruf besar-kecil (perilaku sama dengan versi lama)
  let existingStok = stokData.find(s =>
    String(s.kode_barang).trim().toUpperCase() === String(kode_barang).trim().toUpperCase() &&
    String(s.kode_rak).trim().toUpperCase() === String(kode_rak).trim().toUpperCase()
  );

  let saldoSetelah = numQty;

  if (existingStok) {
    saldoSetelah = parseInt(existingStok.qty, 10) + numQty;
    updateRow("StokPerRak", "id", existingStok.id, { qty: saldoSetelah }); // memori saja
  } else {
    appendRow("StokPerRak", [generateId(), kode_barang, kode_rak, saldoSetelah]);
  }

  appendRow("KartuStok", [
    generateId(), new Date().toISOString(), kode_barang, kode_rak,
    "Masuk", numQty, saldoSetelah, "PENERIMAAN", keterangan
  ]);

  return { success: true, message: "Stok berhasil ditambahkan", data: { saldo_setelah: saldoSetelah } };
}

function apiCreatePO(payload, user) {
  if (user.role !== "super_user" && user.role !== "penerima_order") return { success: false, message: "Akses ditolak" };

  const no_po = generateNoPO();
  const tanggal = new Date().toISOString();

  appendRow("POHeader", [no_po, tanggal, payload.kode_customer, "Open", user.username]);

  // OPTIMASI: detail PO ditulis BATCH (1 operasi) alih-alih appendRow per item
  const detailRows = payload.items.map(item => [generateId(), no_po, item.kode_barang, item.qty, 0]);
  appendRows("PODetail", detailRows);

  return { success: true, message: "PO Berhasil Dibuat", data: { no_po } };
}

// Filter rentang tanggal inklusif berdasarkan payload.tanggal_mulai / tanggal_akhir ("YYYY-MM-DD")
function filterByDateRange(rows, payload, fieldTanggal) {
  if (!payload) return rows;
  const mulai = payload.tanggal_mulai ? new Date(payload.tanggal_mulai + "T00:00:00") : null;
  const akhir = payload.tanggal_akhir ? new Date(payload.tanggal_akhir + "T23:59:59") : null;
  if (!mulai && !akhir) return rows;
  return rows.filter(r => {
    const t = new Date(r[fieldTanggal]);
    if (mulai && t < mulai) return false;
    if (akhir && t > akhir) return false;
    return true;
  });
}

function apiGetPOList(payload, user) {
  const headers = filterByDateRange(getSheetData("POHeader"), payload, "tanggal");
  const details = getSheetData("PODetail");
  const customers = getSheetData("MasterCustomer");

  // Index O(1): customer by kode, detail by no_po, total qty DR per no_po|barang
  const customerMap = indexBy(customers, c => normKey(c.kode_customer));
  const detailsByPo = {};
  details.forEach(d => {
    (detailsByPo[d.no_po] = detailsByPo[d.no_po] || []).push(d);
  });

  const drs = getSheetData("DeliveryRequest");
  const qtyDrMap = {};
  drs.forEach(d => {
    const key = d.no_po + "|" + normKey(d.kode_barang);
    qtyDrMap[key] = (qtyDrMap[key] || 0) + (parseInt(d.qty_alokasi, 10) || 0);
  });

  const poList = headers.map(h => {
    const cust = customerMap[normKey(h.kode_customer)];
    h.customer = (cust ? cust.nama_customer : h.kode_customer) || h.kode_customer;
    h.items = (detailsByPo[h.no_po] || []).map(item => {
      item.qty_dr = qtyDrMap[h.no_po + "|" + normKey(item.kode_barang)] || 0;
      return item;
    });
    h.total_qty = h.items.reduce((sum, item) => sum + parseInt(item.qty_pesanan, 10), 0);
    h.total_terkirim = h.items.reduce((sum, item) => sum + parseInt(item.qty_terkirim, 10), 0);
    return h;
  });

  poList.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  return { success: true, data: poList };
}

function apiGetDeliveryAlokasi(payload, user) {
  const { no_po } = payload;
  const details = getSheetData("PODetail").filter(d => d.no_po === no_po);
  const stokPerRak = getSheetData("StokPerRak");
  const barangMaster = getSheetData("MasterBarang");

  // Stok fisik baru dipotong saat SJ dibuat; DR "Selesai" (PO manapun) mengunci qty di rak.
  const reservedDR = getSheetData("DeliveryRequest").filter(d => d.status === "Selesai");
  const reservedMap = {};
  reservedDR.forEach(d => {
    const key = normKey(d.kode_barang) + "|" + normKey(d.kode_rak_alokasi);
    reservedMap[key] = (reservedMap[key] || 0) + parseInt(d.qty_alokasi, 10);
  });

  // Qty yang sudah pernah dialokasikan ke PO INI sendiri (alokasi parsial sebelumnya)
  const sudahDialokasikanMap = {};
  getSheetData("DeliveryRequest") // memoized: tidak ada bacaan kedua ke sheet
    .filter(d => d.status === "Selesai" && d.no_po === no_po)
    .forEach(d => {
      const key = normKey(d.kode_barang);
      sudahDialokasikanMap[key] = (sudahDialokasikanMap[key] || 0) + parseInt(d.qty_alokasi, 10);
    });

  // Index barang master & rak per kode barang
  const barangMap = {};
  barangMaster.forEach(b => { const k = normKey(b.kode_barang); if (!(k in barangMap)) barangMap[k] = b; });
  const rakByBarang = {};
  stokPerRak.forEach(s => {
    if (parseInt(s.qty, 10) > 0) {
      (rakByBarang[normKey(s.kode_barang)] = rakByBarang[normKey(s.kode_barang)] || []).push(s);
    }
  });

  let alokasiUsulan = [];
  let totalDapat = 0;

  details.forEach(item => {
    const kodeKey = normKey(item.kode_barang);
    let butuh = parseInt(item.qty_pesanan, 10) - parseInt(item.qty_terkirim, 10) - (sudahDialokasikanMap[kodeKey] || 0);
    if (butuh <= 0) return;

    const rakTersedia = rakByBarang[kodeKey] || [];

    rakTersedia.forEach(rak => {
      if (butuh <= 0) return;

      const key = kodeKey + "|" + normKey(rak.kode_rak);
      const qtyTerkunci = reservedMap[key] || 0;
      let qtyRak = parseInt(rak.qty, 10) - qtyTerkunci;
      if (qtyRak <= 0) return;

      let ambil = Math.min(butuh, qtyRak);

      alokasiUsulan.push({
        kode_barang: item.kode_barang,
        nama_barang: (barangMap[kodeKey] ? barangMap[kodeKey].nama_barang : item.kode_barang) || item.kode_barang,
        kode_rak: rak.kode_rak,
        qty_alokasi: ambil
      });

      butuh -= ambil;
      totalDapat += ambil;
    });
  });

  if (totalDapat === 0) {
    return { success: false, message: "Stok gudang masih kosong atau sudah teralokasi ke PO lain untuk semua item yang belum terkirim di PO ini." };
  }

  return { success: true, data: alokasiUsulan };
}

function apiKonfirmasiDelivery(payload, user) {
  if (user.role !== "super_user" && user.role !== "gudang" && user.role !== "penerima_order") return { success: false, message: "Akses ditolak" };

  const { no_po, alokasi, tanggal_kirim, ekspedisi } = payload;

  if (!tanggal_kirim || !ekspedisi) {
    return { success: false, message: "Tanggal Kirim dan Ekspedisi wajib diisi" };
  }

  // Validasi keras terakhir: alokasi baru + yang sudah terkunci tidak boleh melebihi stok fisik rak.
  const stokPerRakSemua = getSheetData("StokPerRak");
  const drAktifSemua = getSheetData("DeliveryRequest").filter(d => d.status === "Selesai");
  const terkunciMap = {};
  drAktifSemua.forEach(d => {
    const key = normKey(d.kode_barang) + "|" + normKey(d.kode_rak_alokasi);
    terkunciMap[key] = (terkunciMap[key] || 0) + (parseInt(d.qty_alokasi, 10) || 0);
  });

  const stokFisikMap = {};
  stokPerRakSemua.forEach(s => {
    const key = normKey(s.kode_barang) + "|" + normKey(s.kode_rak);
    if (!(key in stokFisikMap)) stokFisikMap[key] = s; // ambil entri pertama (perilaku .find() lama)
  });

  const alokasiBaruMap = {};
  alokasi.forEach(alo => {
    const key = normKey(alo.kode_barang) + "|" + normKey(alo.kode_rak);
    alokasiBaruMap[key] = (alokasiBaruMap[key] || 0) + (parseInt(alo.qty_alokasi, 10) || 0);
  });

  for (const key in alokasiBaruMap) {
    const sep = key.split("|");
    const kodeBarang = sep[0], kodeRak = sep[1];
    const stokFisik = stokFisikMap[key];
    const qtyFisik = stokFisik ? (parseInt(stokFisik.qty, 10) || 0) : 0;
    const qtySudahTerkunci = terkunciMap[key] || 0;
    const qtyDiminta = alokasiBaruMap[key];

    if (qtySudahTerkunci + qtyDiminta > qtyFisik) {
      const sisaBisaDiambil = Math.max(0, qtyFisik - qtySudahTerkunci);
      return {
        success: false,
        message: "Alokasi ditolak: stok " + kodeBarang + " di rak " + kodeRak + " tidak cukup. " +
          "Stok fisik: " + qtyFisik + ", sudah terkunci alokasi lain: " + qtySudahTerkunci + ", " +
          "sisa yang bisa diambil: " + sisaBisaDiambil + ", diminta: " + qtyDiminta + "."
      };
    }
  }

  // Cek apakah alokasi (lama + baru) menutup seluruh outstanding PO -> status "Proses", else "Open"
  const poDetails = getSheetData("PODetail").filter(d => d.no_po === no_po);
  const drSudahAda = drAktifSemua.filter(d => d.no_po === no_po); // pakai ulang data yang sudah dibaca

  const totalAlokasiMap = {};
  drSudahAda.forEach(d => {
    const key = normKey(d.kode_barang);
    totalAlokasiMap[key] = (totalAlokasiMap[key] || 0) + (parseInt(d.qty_alokasi, 10) || 0);
  });
  alokasi.forEach(alo => {
    const key = normKey(alo.kode_barang);
    totalAlokasiMap[key] = (totalAlokasiMap[key] || 0) + (parseInt(alo.qty_alokasi, 10) || 0);
  });

  const sudahFullTeralokasi = poDetails.every(d => {
    const key = normKey(d.kode_barang);
    const outstanding = parseInt(d.qty_pesanan, 10) - parseInt(d.qty_terkirim, 10);
    if (outstanding <= 0) return true;
    return (totalAlokasiMap[key] || 0) >= outstanding;
  });

  // Semua penulisan di bawah ini murni memori; benar-benar ditulis saat flushAll()
  updateRow("POHeader", "no_po", no_po, { status: sudahFullTeralokasi ? "Proses" : "Open" });

  const no_dr = generateNoDR();
  const tanggal = new Date().toISOString();
  appendRows("DeliveryRequest", alokasi.map(alo => {
    const qtyAlokasi = parseInt(alo.qty_alokasi, 10);
    return [generateId(), no_po, alo.kode_barang, qtyAlokasi, alo.kode_rak, qtyAlokasi, "Selesai", no_dr, tanggal, tanggal_kirim, ekspedisi, ""];
  }));

  return { success: true, message: "Persiapan Barang Disetujui. Silakan buat Surat Jalan untuk memotong stok.", data: { no_dr } };
}

// Daftar DR yang siap dibuatkan SJ
function apiGetAntreanSJ(user) {
  const drs = getSheetData("DeliveryRequest").filter(d => d.status === "Selesai" && d.no_dr);
  const customers = getSheetData("MasterCustomer");
  const pos = getSheetData("POHeader");

  const poMap = indexBy(pos, p => p.no_po);
  const custMap = indexBy(customers, c => normKey(c.kode_customer));

  const queueMap = {};
  drs.forEach(d => {
    if (!queueMap[d.no_dr]) {
      const po = poMap[d.no_po];
      const cust = po ? custMap[normKey(po.kode_customer)] : null;
      queueMap[d.no_dr] = {
        no_dr: d.no_dr,
        no_po: d.no_po,
        customer: cust ? cust.nama_customer : (po ? po.kode_customer : "Unknown")
      };
    }
  });

  const result = Object.values(queueMap).sort((a, b) => b.no_dr.localeCompare(a.no_dr));
  return { success: true, data: result };
}

function apiCreateSuratJalan(payload, user) {
  if (user.role !== "super_user" && user.role !== "gudang") return { success: false, message: "Akses ditolak" };

  const { no_dr } = payload;

  const deliveries = getSheetData("DeliveryRequest").filter(d => d.no_dr === no_dr && d.status === "Selesai");
  if (deliveries.length === 0) return { success: false, message: "Tidak ada alokasi persiapan barang yang siap dibuatkan Surat Jalan untuk DR ini." };

  const no_po = deliveries[0].no_po;
  const poHeader = getSheetData("POHeader").find(p => p.no_po === no_po);
  if (!poHeader) return { success: false, message: "PO tidak ditemukan" };

  const no_sj = generateNoSJ();
  const tanggal = new Date().toISOString();

  // 1. SJ Header (ekspedisi dibawa dari DR, disiapkan_oleh = pembuat SJ)
  appendRow("SuratJalan", [no_sj, tanggal, no_po, poHeader.kode_customer, "Terkirim", user.username, "", deliveries[0].ekspedisi || ""]);

  const poDetailSemua = getSheetData("PODetail");
  const poDetails = poDetailSemua.filter(d => d.no_po === no_po);
  const poDetailMap = {};
  poDetails.forEach(pd => {
    const k = normKey(pd.kode_barang);
    if (!(k in poDetailMap)) poDetailMap[k] = pd;
  });

  const stokSemua = getSheetData("StokPerRak");
  const rakMap = {};
  stokSemua.forEach(s => {
    const k = normKey(s.kode_barang) + "|" + normKey(s.kode_rak);
    if (!(k in rakMap)) rakMap[k] = s;
  });

  let sjItems = {};
  let kartuStokRows = []; // OPTIMASI: kartu stok ditulis batch di akhir

  deliveries.forEach(d => {
    let qtyAlokasi = parseInt(d.qty_alokasi, 10);

    if (!sjItems[d.kode_barang]) sjItems[d.kode_barang] = 0;
    sjItems[d.kode_barang] += qtyAlokasi;

    // A. Update PODetail qty_terkirim (memori)
    let detailTarget = poDetailMap[normKey(d.kode_barang)];
    if (detailTarget) {
      let newTerkirim = parseInt(detailTarget.qty_terkirim, 10) + qtyAlokasi;
      updateRow("PODetail", "id", detailTarget.id, { qty_terkirim: newTerkirim });
      detailTarget.qty_terkirim = newTerkirim; // sinkron objek pembanding untuk cek akhir PO
    }

    // B. Potong StokPerRak & catat KartuStok (Keluar)
    let rakTarget = rakMap[normKey(d.kode_barang) + "|" + normKey(d.kode_rak_alokasi)];

    if (rakTarget) {
      let saldoSetelah = parseInt(rakTarget.qty, 10) - qtyAlokasi;
      updateRow("StokPerRak", "id", rakTarget.id, { qty: saldoSetelah });
      rakTarget.qty = saldoSetelah; // jaga konsistensi bila rak sama muncul lagi di delivery berikutnya

      kartuStokRows.push([
        generateId(), tanggal, d.kode_barang, d.kode_rak_alokasi,
        "Keluar", qtyAlokasi, saldoSetelah, no_sj, "Surat Jalan DR: " + no_dr
      ]);
    }

    // C. Tandai DR sudah di-SJ-kan agar tidak dobel (memori)
    updateRow("DeliveryRequest", "id", d.id, { status: "SJ_Dibuat", no_surat_jalan: no_sj });
  });

  // 2. KartuStok ditulis SEKALI (batch)
  appendRows("KartuStok", kartuStokRows);

  // 3. Rekap ke SuratJalanDetail (batch)
  appendRows("SuratJalanDetail", Object.keys(sjItems).map(kode_barang => [no_sj, kode_barang, sjItems[kode_barang]]));

  // 4. Status PO akhir
  let semuaSelesai = true;
  poDetails.forEach(d => {
    if (parseInt(d.qty_terkirim, 10) < parseInt(d.qty_pesanan, 10)) {
      semuaSelesai = false;
    }
  });

  updateRow("POHeader", "no_po", no_po, { status: semuaSelesai ? "Selesai" : "Open" });

  return { success: true, message: "Surat Jalan Dibuat & Stok Berhasil Dipotong!", data: { no_sj } };
}

// CATATAN: duplikat apiGetSuratJalanList versi lama (berisi salinan logika createSJ yang
// mereferensi `payload` tak terdefinisi) DIHAPUS. Di JavaScript deklarasi fungsi kedua selalu
// menimpa yang pertama, sehingga perilaku runtime tidak berubah sama sekali.

function apiGetSuratJalanList(user) {
  const sjs = getSheetData("SuratJalan");
  const customers = getSheetData("MasterCustomer");
  const custMap = indexBy(customers, c => normKey(c.kode_customer));

  const sjList = sjs.map(sj => {
    const cust = custMap[normKey(sj.kode_customer)];
    sj.customer = (cust ? cust.nama_customer : sj.kode_customer) || sj.kode_customer;
    return sj;
  });
  sjList.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  return { success: true, data: sjList };
}

// ==========================================
// RINCIAN COLLY & CETAK SURAT JALAN
// ==========================================

function apiGetSuratJalanColly(payload, user) {
  const { no_surat_jalan } = payload;
  const details = getSheetData("SuratJalanDetail").filter(d => d.no_surat_jalan === no_surat_jalan);
  const collyData = getSheetData("SuratJalanColly").filter(c => c.no_surat_jalan === no_surat_jalan);
  const barangMaster = getSheetData("MasterBarang");

  // Grouping colly per kode barang sekali jalan (dulu: .filter() per item detail)
  const collyByBarang = {};
  collyData.forEach(c => {
    (collyByBarang[normKey(c.kode_barang)] = collyByBarang[normKey(c.kode_barang)] || []).push(c);
  });
  const barangMap = {};
  barangMaster.forEach(b => { const k = normKey(b.kode_barang); if (!(k in barangMap)) barangMap[k] = b; });

  const items = details.map(d => {
    const collies = (collyByBarang[normKey(d.kode_barang)] || [])
      .sort((a, b) => parseInt(a.no_colly, 10) - parseInt(b.no_colly, 10))
      .map(c => ({ no_colly: parseInt(c.no_colly, 10), qty: parseInt(c.qty, 10) }));

    const qtyColly = collies.reduce((s, c) => s + c.qty, 0);
    const qtySJ = parseInt(d.qty, 10);
    const masterInfo = barangMap[normKey(d.kode_barang)];

    return {
      kode_barang: d.kode_barang,
      nama_barang: (masterInfo ? masterInfo.nama_barang : d.kode_barang) || d.kode_barang,
      satuan: masterInfo ? masterInfo.satuan : "-",
      qty_sj: qtySJ,
      collies: collies,
      qty_colly: qtyColly,
      match: qtyColly === qtySJ
    };
  });

  return { success: true, data: { items, overallMatch: items.length > 0 && items.every(i => i.match) } };
}

function apiSaveSuratJalanColly(payload, user) {
  if (user.role !== "super_user" && user.role !== "gudang") return { success: false, message: "Akses ditolak" };

  const { no_surat_jalan, items } = payload;
  if (!no_surat_jalan || !Array.isArray(items)) return { success: false, message: "Data tidak lengkap" };

  // Replace total: hapus colly lama (memori), kumpulkan baris baru, tulis batch saat flush.
  deleteRowsWhere("SuratJalanColly", row => row.no_surat_jalan === no_surat_jalan);

  const rowsToInsert = [];
  items.forEach(item => {
    (item.collies || []).forEach((c, idx) => {
      const qty = parseInt(c.qty, 10) || 0;
      if (qty > 0) {
        rowsToInsert.push([generateId(), no_surat_jalan, item.kode_barang, idx + 1, qty]);
      }
    });
  });
  appendRows("SuratJalanColly", rowsToInsert);

  // Validasi kecocokan qty colly vs SuratJalanDetail
  const details = getSheetData("SuratJalanDetail").filter(d => d.no_surat_jalan === no_surat_jalan);
  const validasi = details.map(d => {
    const itemInput = items.find(it => normKey(it.kode_barang) === normKey(d.kode_barang));
    const qtyColly = ((itemInput && itemInput.collies) || []).reduce((s, c) => s + (parseInt(c.qty, 10) || 0), 0);
    const qtySJ = parseInt(d.qty, 10);
    return { kode_barang: d.kode_barang, qty_sj: qtySJ, qty_colly: qtyColly, match: qtyColly === qtySJ };
  });

  const semuaCocok = validasi.length > 0 && validasi.every(v => v.match);

  return {
    success: true,
    message: semuaCocok
      ? "Rincian colly tersimpan & sudah cocok dengan qty persiapan barang."
      : "Rincian colly tersimpan, namun masih ada qty yang belum cocok dengan qty persiapan barang!",
    data: { validasi, semuaCocok }
  };
}

function apiUpdateSuratJalanInfo(payload, user) {
  if (user.role !== "super_user" && user.role !== "gudang") return { success: false, message: "Akses ditolak" };

  const { no_surat_jalan, disiapkan_oleh, disetujui_oleh, ekspedisi } = payload;
  if (!no_surat_jalan) return { success: false, message: "No Surat Jalan wajib diisi" };

  updateRow("SuratJalan", "no_surat_jalan", no_surat_jalan, {
    disiapkan_oleh: disiapkan_oleh || "",
    disetujui_oleh: disetujui_oleh || "",
    ekspedisi: ekspedisi || ""
  });

  return { success: true, message: "Informasi Surat Jalan disimpan" };
}

function apiGetSuratJalanCetakData(payload, user) {
  const { no_surat_jalan } = payload;
  const sj = getSheetData("SuratJalan").find(s => s.no_surat_jalan === no_surat_jalan);
  if (!sj) return { success: false, message: "Surat Jalan tidak ditemukan" };

  const customer = getSheetData("MasterCustomer").find(c => c.kode_customer === sj.kode_customer);
  const collyRes = apiGetSuratJalanColly({ no_surat_jalan }, user);

  return {
    success: true,
    data: {
      sj,
      customer: customer || { nama_customer: sj.kode_customer, alamat: "", telepon: "" },
      items: collyRes.data.items
    }
  };
}

// ==========================================
// LAPORAN PERSIAPAN BARANG (ACUAN PICKING STOREMAN)
// ==========================================
function apiGetLaporanPersiapan(payload, user) {
  const { tanggal_mulai, tanggal_selesai } = payload;
  if (!tanggal_mulai || !tanggal_selesai) return { success: false, message: "Tanggal mulai dan tanggal selesai wajib diisi" };

  const deliveries = getSheetData("DeliveryRequest").filter(d => d.no_dr);

  const filtered = deliveries.filter(d => {
    if (!d.tanggal_kirim) return false;
    try {
      const tglStr = Utilities.formatDate(new Date(d.tanggal_kirim), "Asia/Jakarta", "yyyy-MM-dd");
      return tglStr >= tanggal_mulai && tglStr <= tanggal_selesai;
    } catch (e) {
      return false;
    }
  });

  const poHeaders = getSheetData("POHeader");
  const customers = getSheetData("MasterCustomer");
  const barangMaster = getSheetData("MasterBarang");
  const rakMaster = getSheetData("MasterRak");

  const poMap = indexBy(poHeaders, p => p.no_po);
  const custMap = indexBy(customers, c => normKey(c.kode_customer));
  const barangMap = {};
  barangMaster.forEach(b => { const k = normKey(b.kode_barang); if (!(k in barangMap)) barangMap[k] = b; });
  const rakMap = {};
  rakMaster.forEach(r => { const k = normKey(r.kode_rak); if (!(k in rakMap)) rakMap[k] = r; });

  const groups = {};
  filtered.forEach(d => {
    if (!groups[d.no_dr]) {
      const po = poMap[d.no_po];
      const customer = po ? custMap[normKey(po.kode_customer)] : null;
      groups[d.no_dr] = {
        no_dr: d.no_dr,
        tanggal: d.tanggal,
        tanggal_kirim: d.tanggal_kirim,
        no_po: d.no_po,
        customer: customer ? customer.nama_customer : (po ? po.kode_customer : "-"),
        ekspedisi: d.ekspedisi,
        no_surat_jalan: d.no_surat_jalan || "",
        status_sj: d.no_surat_jalan ? "Sudah SJ" : "Belum SJ",
        items: [],
        total_qty: 0
      };
    }
    const barang = barangMap[normKey(d.kode_barang)];
    const rak = rakMap[normKey(d.kode_rak_alokasi)];
    const qty = parseInt(d.qty_alokasi, 10) || 0;

    groups[d.no_dr].items.push({
      kode_barang: d.kode_barang,
      nama_barang: barang ? barang.nama_barang : d.kode_barang,
      satuan: barang ? barang.satuan : "-",
      kode_rak: d.kode_rak_alokasi,
      nama_rak: rak ? rak.nama_rak : d.kode_rak_alokasi,
      qty: qty
    });
    groups[d.no_dr].total_qty += qty;
  });

  const result = Object.values(groups).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  return { success: true, data: result };
}

// ==========================================
// MANAJEMEN USER & HAK AKSES MENU
// ==========================================

const VALID_MENU_IDS = [
  "dashboard", "master-barang", "master-customer", "master-rak",
  "penerimaan", "input-po", "outstanding", "rekap-po",
  "persiapan", "laporan-persiapan", "surat-jalan", "kartu-stok", "user-management"
];

function apiGetUserList(user) {
  if (user.role !== "super_user") return { success: false, message: "Akses ditolak" };

  const users = getSheetData("Users").map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    akses_menu: parseAksesMenu(u.akses_menu)
  }));

  return { success: true, data: users };
}

function apiCreateUser(payload, user) {
  if (user.role !== "super_user") return { success: false, message: "Akses ditolak" };

  const { username, password, role, akses_menu } = payload;
  if (!username || !password || !role) {
    return { success: false, message: "Username, password, dan role wajib diisi" };
  }
  if (password.length < 6) {
    return { success: false, message: "Password minimal 6 karakter" };
  }

  const users = getSheetData("Users");
  const existing = users.find(u => String(u.username).trim().toLowerCase() === String(username).trim().toLowerCase());
  if (existing) return { success: false, message: "Username sudah digunakan, pilih username lain" };

  const aksesValid = Array.isArray(akses_menu) ? akses_menu.filter(m => VALID_MENU_IDS.includes(m)) : [];

  appendRow("Users", [
    generateId(),
    username.trim(),
    hashPassword(password),
    role,
    JSON.stringify(aksesValid)
  ]);

  return { success: true, message: `User "${username}" berhasil dibuat` };
}

function apiUpdateUserAccess(payload, user) {
  if (user.role !== "super_user") return { success: false, message: "Akses ditolak" };

  const { id, role, akses_menu, password } = payload;
  if (!id || !role) return { success: false, message: "Data tidak lengkap" };

  const aksesValid = Array.isArray(akses_menu) ? akses_menu.filter(m => VALID_MENU_IDS.includes(m)) : [];

  const updateData = {
    role: role,
    akses_menu: JSON.stringify(aksesValid)
  };

  if (password && password.trim() !== "") {
    if (password.length < 6) return { success: false, message: "Password minimal 6 karakter" };
    updateData.password_hash = hashPassword(password);
  }

  updateRow("Users", "id", id, updateData);

  return { success: true, message: "Hak akses user berhasil diperbarui" };
}

function apiDeleteUser(payload, user) {
  if (user.role !== "super_user") return { success: false, message: "Akses ditolak" };

  const { id } = payload;
  if (!id) return { success: false, message: "ID user tidak valid" };

  if (id === user.id) {
    return { success: false, message: "Tidak bisa menghapus akun yang sedang Anda gunakan" };
  }

  const users = getSheetData("Users");
  const target = users.find(u => u.id === id);
  if (!target) return { success: false, message: "User tidak ditemukan" };

  const jumlahSuperUser = users.filter(u => u.role === "super_user").length;
  if (target.role === "super_user" && jumlahSuperUser <= 1) {
    return { success: false, message: "Tidak bisa menghapus Super User terakhir" };
  }

  deleteRowsWhere("Users", row => row.id === id);

  return { success: true, message: `User "${target.username}" berhasil dihapus` };
}

function apiGetKartuStok(payload, user) {
  const data = filterByDateRange(getSheetData("KartuStok"), payload, "tanggal");
  data.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  return { success: true, data: data };
}

function apiGetDashboardData(user) {
  const pos = getSheetData("POHeader");
  const openPO = pos.filter(p => p.status === "Open").length;
  const prosesPO = pos.filter(p => p.status === "Proses").length;

  const stok = getSheetData("StokPerRak");
  let totalStok = 0;
  stok.forEach(s => totalStok += parseInt(s.qty, 10) || 0);

  // ===== Chart 1: Trend Qty PO vs Qty DN (14 hari terakhir) =====
  const poDetails = getSheetData("PODetail");
  const sjHeaders = getSheetData("SuratJalan");
  const sjDetails = getSheetData("SuratJalanDetail");

  // OPTIMASI CPU: agregasi qty per dokumen sekali jalan (dulu: .filter+reduce per PO/SJ -> O(n*m))
  const qtyPesananByPo = {};
  poDetails.forEach(d => {
    qtyPesananByPo[d.no_po] = (qtyPesananByPo[d.no_po] || 0) + (parseInt(d.qty_pesanan, 10) || 0);
  });
  const qtyBySj = {};
  sjDetails.forEach(d => {
    qtyBySj[d.no_surat_jalan] = (qtyBySj[d.no_surat_jalan] || 0) + (parseInt(d.qty, 10) || 0);
  });

  const dateMap = {};
  const N_HARI = 14;
  const labelsChrono = [];
  for (let i = N_HARI - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = Utilities.formatDate(d, "Asia/Jakarta", "yyyy-MM-dd");
    dateMap[key] = { po: 0, dn: 0 };
    labelsChrono.push(key);
  }

  pos.forEach(po => {
    const key = Utilities.formatDate(new Date(po.tanggal), "Asia/Jakarta", "yyyy-MM-dd");
    if (!dateMap[key]) return;
    dateMap[key].po += qtyPesananByPo[po.no_po] || 0;
  });

  sjHeaders.forEach(sj => {
    const key = Utilities.formatDate(new Date(sj.tanggal), "Asia/Jakarta", "yyyy-MM-dd");
    if (!dateMap[key]) return;
    dateMap[key].dn += qtyBySj[sj.no_surat_jalan] || 0;
  });

  const chartPOvsDN = {
    labels: labelsChrono.map(k => Utilities.formatDate(new Date(k), "Asia/Jakarta", "dd/MM")),
    qtyPO: labelsChrono.map(k => dateMap[k].po),
    qtyDN: labelsChrono.map(k => dateMap[k].dn)
  };

  // ===== Chart 2: Bar Total Stok per Barang =====
  const barangMaster = getSheetData("MasterBarang");
  const barangMap = {};
  barangMaster.forEach(b => { const k = normKey(b.kode_barang); if (!(k in barangMap)) barangMap[k] = b; });

  const stokPerBarang = {};
  stok.forEach(s => {
    const kode = normKey(s.kode_barang);
    stokPerBarang[kode] = (stokPerBarang[kode] || 0) + (parseInt(s.qty, 10) || 0);
  });

  const chartStokBarang = Object.keys(stokPerBarang).map(kode => {
    const master = barangMap[kode];
    return {
      kode_barang: kode,
      nama_barang: master ? master.nama_barang : kode,
      qty: stokPerBarang[kode]
    };
  }).sort((a, b) => b.qty - a.qty);

  return {
    success: true,
    data: {
      openPO,
      prosesPO,
      totalStok,
      chartPOvsDN,
      chartStokBarang,
      role: user.role
    }
  };
}
