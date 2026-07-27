// ==========================================
// MANAJEMEN USER & HAK AKSES MENU
// ==========================================
const ROLE_OPTIONS = [
    { value: 'super_user', label: 'Super User' },
    { value: 'gudang', label: 'Gudang' },
    { value: 'penerima_order', label: 'Penerima Order' },
    { value: 'ppic', label: 'PPIC' }
];

function roleLabel(role) {
    const found = ROLE_OPTIONS.find(r => r.value === role);
    return found ? found.label : role;
}

function roleBadgeClass(role) {
    const map = {
        super_user: 'bg-purple-100 text-purple-700 border-purple-200',
        gudang: 'bg-blue-100 text-blue-700 border-blue-200',
        penerima_order: 'bg-green-100 text-green-700 border-green-200',
        ppic: 'bg-amber-100 text-amber-700 border-amber-200'
    };
    return map[role] || 'bg-gray-100 text-gray-700 border-gray-200';
}

let userListCache = [];

async function renderUserManagement() {
    setPageTitle('Manajemen User & Hak Akses');

    if (currentUser.role !== 'super_user') {
        document.getElementById('main-content').innerHTML = `
            <div class="p-8 text-center text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">
                <i data-lucide="shield-alert" class="w-12 h-12 mx-auto text-gray-300 mb-3"></i>
                Anda tidak memiliki akses ke halaman ini.
            </div>`;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    const res = await fetchAPI('getUserList');
    if (!res || !res.success) {
        showToast(res ? res.message : 'Gagal memuat data user', 'error');
        return;
    }
    userListCache = res.data;

    const rows = userListCache.map(u => {
        const aksesBadges = (u.akses_menu && u.akses_menu.length > 0)
            ? u.akses_menu.map(id => {
                const item = MENU_CONFIG.find(m => m.id === id);
                return `<span class="inline-block bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-xs font-medium mr-1 mb-1">${item ? item.label : id}</span>`;
            }).join('')
            : '<span class="text-xs text-gray-400 italic">Tidak ada akses khusus</span>';

        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top">
                <td class="px-4 py-3 font-semibold text-gray-800">${u.username}</td>
                <td class="px-4 py-3"><span class="px-2.5 py-1 rounded-md text-xs font-bold border ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
                <td class="px-4 py-3 max-w-md">${aksesBadges}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button onclick="openUserModalById('${u.id}')" class="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors" title="Edit User">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteUserConfirm('${u.id}', '${u.username.replace(/'/g, "\\'")}')" class="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Hapus User">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const checkboxesHtml = MENU_CONFIG.map(item => `
        <label class="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 transition-colors">
            <input type="checkbox" value="${item.id}" class="um-akses w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
            <i data-lucide="${item.icon}" class="w-4 h-4 text-gray-500"></i>
            <span class="text-gray-700">${item.label}</span>
        </label>
    `).join('');

    const roleOptionsHtml = ROLE_OPTIONS.map(r => `<option value="${r.value}">${r.label}</option>`).join('');

    const html = `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <h2 class="text-xl font-bold text-gray-800">Daftar User Sistem</h2>
            <button onclick="openUserModal()" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-blue-700 flex items-center justify-center gap-2 font-semibold transition-all">
                <i data-lucide="user-plus" class="w-4 h-4"></i> Tambah User Baru
            </button>
        </div>
        ${createCard(`
            <div class="overflow-x-auto w-full rounded-lg border border-gray-200">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-100 text-gray-700 font-semibold border-b border-gray-200">
                        <tr>
                            <th class="px-4 py-3">Username</th>
                            <th class="px-4 py-3">Role</th>
                            <th class="px-4 py-3">Hak Akses Menu</th>
                            <th class="px-4 py-3 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">Belum ada user terdaftar</td></tr>'}</tbody>
                </table>
            </div>
        `)}

        <!-- Modal Tambah/Edit User -->
        <div id="modal-user" class="fixed inset-0 bg-gray-900 bg-opacity-60 z-50 hidden flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl transform transition-all max-h-[90vh] flex flex-col">
                <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
                    <h3 id="modal-user-title" class="font-bold text-gray-800 text-lg flex items-center gap-2"><i data-lucide="user-cog" class="text-blue-600"></i> Tambah User Baru</h3>
                    <button onclick="closeUserModal()" class="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><i data-lucide="x"></i></button>
                </div>
                <form id="form-user" class="p-6 overflow-y-auto space-y-4">
                    <input type="hidden" id="um_id" value="">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Username</label>
                        <input type="text" id="um_username" required class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-gray-100 disabled:text-gray-500">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                        <input type="password" id="um_password" class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Minimal 6 karakter">
                        <p id="um_password_hint" class="text-xs text-gray-400 mt-1">Wajib diisi untuk user baru</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                        <select id="um_role" required class="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
                            ${roleOptionsHtml}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">Hak Akses Menu</label>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            ${checkboxesHtml}
                        </div>
                    </div>
                </form>
                <div class="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
                    <button type="button" onclick="closeUserModal()" class="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-white transition-colors">Batal</button>
                    <button type="submit" form="form-user" class="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 shadow-md transition-all">
                        <i data-lucide="save" class="w-5 h-5"></i> Simpan
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('main-content').innerHTML = html;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    document.getElementById('form-user').addEventListener('submit', submitUserForm);
}

window.openUserModal = function(user = null) {
    const form = document.getElementById('form-user');
    if (!form) return;
    form.reset();
    document.querySelectorAll('.um-akses').forEach(cb => cb.checked = false);

    const usernameInput = document.getElementById('um_username');
    const passwordInput = document.getElementById('um_password');
    const passwordHint = document.getElementById('um_password_hint');
    const roleSelect = document.getElementById('um_role');
    const title = document.getElementById('modal-user-title');

    if (user) {
        title.innerHTML = `<i data-lucide="user-cog" class="text-blue-600"></i> Edit User: ${user.username}`;
        document.getElementById('um_id').value = user.id;
        usernameInput.value = user.username;
        usernameInput.disabled = true;
        passwordInput.required = false;
        passwordHint.textContent = 'Kosongkan jika tidak ingin mengubah password';
        roleSelect.value = user.role;
        (user.akses_menu || []).forEach(id => {
            const cb = document.querySelector(`.um-akses[value="${id}"]`);
            if (cb) cb.checked = true;
        });
    } else {
        title.innerHTML = `<i data-lucide="user-plus" class="text-blue-600"></i> Tambah User Baru`;
        document.getElementById('um_id').value = '';
        usernameInput.value = '';
        usernameInput.disabled = false;
        passwordInput.required = true;
        passwordHint.textContent = 'Wajib diisi untuk user baru';
        roleSelect.value = 'penerima_order';
    }

    document.getElementById('modal-user').classList.remove('hidden');
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.openUserModalById = function(id) {
    const user = userListCache.find(u => u.id === id);
    if (!user) return showToast('Data user tidak ditemukan', 'error');
    openUserModal(user);
}

window.closeUserModal = function() {
    document.getElementById('modal-user').classList.add('hidden');
}

async function submitUserForm(e) {
    e.preventDefault();
    const id = document.getElementById('um_id').value;
    const username = document.getElementById('um_username').value.trim();
    const password = document.getElementById('um_password').value;
    const role = document.getElementById('um_role').value;
    const akses_menu = Array.from(document.querySelectorAll('.um-akses:checked')).map(cb => cb.value);

    let res;
    if (id) {
        const payload = { id, role, akses_menu };
        if (password) payload.password = password;
        res = await fetchAPI('updateUserAccess', payload, true);
    } else {
        if (password.length < 6) {
            showToast('Password minimal 6 karakter', 'error');
            return;
        }
        res = await fetchAPI('createUser', { username, password, role, akses_menu }, true);
    }

    if (res && res.success) {
        showToast(res.message);
        closeUserModal();
        renderUserManagement();
    } else {
        showToast(res ? res.message : 'Gagal menyimpan data user', 'error');
    }
}

window.deleteUserConfirm = async function(id, username) {
    if (!confirm(`Yakin ingin menghapus user "${username}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    const res = await fetchAPI('deleteUser', { id }, true);
    if (res && res.success) {
        showToast(res.message);
        renderUserManagement();
    } else {
        showToast(res ? res.message : 'Gagal menghapus user', 'error');
    }
}
