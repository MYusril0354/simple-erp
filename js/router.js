window.addEventListener('hashchange', handleRoute);

function handleRoute() {
    if (!currentUser && window.location.hash !== '#login') {
        window.location.hash = '#login';
        return;
    }
    
    const hash = window.location.hash.substring(1);
    const content = document.getElementById('main-content');
    if (!content) return;
    
    // TAMPILKAN SKELETON SEBELUM MULAI FETCH DATA HALAMAN
    content.innerHTML = getSkeletonHTML(); 
    
    // Highlight active menu
    document.querySelectorAll('#nav-menu a').forEach(el => {
        el.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
        el.classList.add('text-gray-300', 'hover:bg-gray-800', 'hover:text-white');
        if(el.getAttribute('href') === '#' + hash) {
            el.classList.remove('text-gray-300', 'hover:bg-gray-800', 'hover:text-white');
            el.classList.add('bg-blue-600', 'text-white', 'shadow-md');
        }
    });

    // Route Switcher
    switch (hash) {
        case 'dashboard': renderDashboard(); break;
        case 'master-barang': renderMaster('Barang'); break;
        case 'master-customer': renderMaster('Customer'); break;
        case 'master-rak': renderMaster('Rak'); break;
        case 'penerimaan': renderPenerimaan(); break;
        case 'input-po': renderInputPO(); break;
        case 'outstanding': renderDaftarPO(); break;
        case 'rekap-po': renderRekapPO(); break;
        case 'persiapan': renderPersiapan(); break;
        case 'laporan-persiapan': renderLaporanPersiapan(); break;
        case 'surat-jalan': renderSuratJalan(); break;
        case 'kartu-stok': renderKartuStok(); break;
        case 'user-management': renderUserManagement(); break;
        default: 
            if(currentUser) renderDashboard();
    }
    
    // Close sidebar on mobile after click
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
}

// Mobile Sidebar Toggles
const openSidebarBtn = document.getElementById('open-sidebar');
const closeSidebarBtn = document.getElementById('close-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (openSidebarBtn) {
    openSidebarBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('-translate-x-full');
        document.getElementById('sidebar-overlay').classList.remove('hidden');
    });
}
if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('sidebar-overlay').classList.add('hidden');
    });
}
if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('sidebar-overlay').classList.add('hidden');
    });
}

// Initialize App on load
window.onload = () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    initApp();
};
