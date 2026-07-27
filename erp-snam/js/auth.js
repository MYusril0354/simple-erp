// ==========================================
// MENU BUILDER CONFIGURATION
// ==========================================
const MENU_CONFIG = [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', roles: ['super_user', 'penerima_order', 'gudang', 'ppic'] },
    { id: 'master-barang', label: 'Master Barang', icon: 'box', roles: ['super_user', 'gudang'] },
    { id: 'master-customer', label: 'Master Customer', icon: 'users', roles: ['super_user', 'penerima_order'] },
    { id: 'master-rak', label: 'Master Rak', icon: 'layers', roles: ['super_user', 'gudang'] },
    { id: 'penerimaan', label: 'Penerimaan Stok', icon: 'arrow-down-to-line', roles: ['super_user', 'gudang'] },
    { id: 'input-po', label: 'Input PO', icon: 'shopping-cart', roles: ['super_user', 'penerima_order'] },
    { id: 'outstanding', label: 'Outstanding PO', icon: 'list-ordered', roles: ['super_user', 'penerima_order', 'gudang', 'ppic'] },
    { id: 'rekap-po', label: 'Rekap Seluruh PO', icon: 'clipboard-list', roles: ['super_user', 'penerima_order', 'gudang', 'ppic'] },
    { id: 'persiapan', label: 'Persiapan Barang', icon: 'package-search', roles: ['super_user', 'gudang'] },
    { id: 'laporan-persiapan', label: 'Laporan Persiapan', icon: 'clipboard-check', roles: ['super_user', 'gudang', 'ppic'] },
    { id: 'surat-jalan', label: 'Surat Jalan', icon: 'truck', roles: ['super_user', 'gudang'] },
    { id: 'kartu-stok', label: 'Kartu Stok', icon: 'file-spreadsheet', roles: ['super_user', 'gudang', 'ppic'] },
    { id: 'user-management', label: 'Manajemen User', icon: 'user-cog', roles: ['super_user'] },
];

// ==========================================
// ROUTING & AUTH
// ==========================================
function initApp() {
    const token = localStorage.getItem('erp_token');
    const role = localStorage.getItem('erp_role');
    const username = localStorage.getItem('erp_username');
    
    if (token && role) {
        currentUser = { token, role, username };
        document.getElementById('view-login').classList.add('hidden-hash');
        document.getElementById('view-main').classList.remove('hidden-hash');
        
        const displayRole = role.replace('_', ' ').toUpperCase();
        document.getElementById('user-info-sidebar').textContent = `${username} (${displayRole})`;
        document.getElementById('user-initial').textContent = username.charAt(0).toUpperCase();
        
        buildMenu();
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        if (window.location.hash === '' || window.location.hash === '#login') {
            window.location.hash = '#dashboard';
        } else {
            handleRoute();
        }
    } else {
        document.getElementById('view-login').classList.remove('hidden-hash');
        document.getElementById('view-main').classList.add('hidden-hash');
        window.location.hash = '#login';
    }
}

function logout() {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_role');
    localStorage.removeItem('erp_username');
    currentUser = null;
    initApp();
}

function buildMenu() {
    const nav = document.getElementById('nav-menu');
    if (!nav) return;
    nav.innerHTML = '';
    MENU_CONFIG.forEach(item => {
        if (item.roles.includes(currentUser.role)) {
            const a = document.createElement('a');
            a.href = '#' + item.id;
            a.className = 'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200';
            a.innerHTML = `<i data-lucide="${item.icon}" class="w-5 h-5"></i> ${item.label}`;
            nav.appendChild(a);
        }
    });
}

// Login form event listener
const formLogin = document.getElementById('form-login');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;
        const btn = e.target.querySelector('button[type="submit"]');
        
        btn.innerHTML = `<div class="loader inline-block border-2 border-t-white w-4 h-4"></div> Loading...`;
        btn.disabled = true;

        const res = await fetchAPI('login', { username: u, password: p }, true);
        btn.innerHTML = 'Masuk Sistem';
        btn.disabled = false;

        if (res && res.success) {
            localStorage.setItem('erp_token', res.data.token);
            localStorage.setItem('erp_role', res.data.role);
            localStorage.setItem('erp_username', res.data.username);
            initApp();
        } else {
            showToast(res ? res.message : "Login gagal, server tidak merespons", "error");
        }
    });
}
