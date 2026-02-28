// JS to handle sidebar toggling
window.toggleSidebar = function (e) {
    if (e) e.stopPropagation();

    // Fallbacks just in case the DOM is loaded weirdly
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    console.log("Toggle sidebar called!", sidebar);

    if (sidebar) {
        sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
    }
};

window.closeSidebar = function () {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

function initMobileSidebar() {
    const btn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (btn) {
        // Also attach traditional listener as backup
        btn.addEventListener('click', window.toggleSidebar);
    }

    if (overlay) {
        overlay.addEventListener('click', window.closeSidebar);
    }

    // Auto close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('active')) {
            // Check if click was outside sidebar and NOT on the menu button
            if (!sidebar.contains(e.target) && (!btn || !btn.contains(e.target))) {
                window.closeSidebar();
            }
        }
    });

    // Close when clicking a nav link
    const navLinks = document.querySelectorAll('.sidebar-nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                window.closeSidebar();
            }
        });
    });
}

// Ensure execution whether loaded before or after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileSidebar);
} else {
    initMobileSidebar();
}
