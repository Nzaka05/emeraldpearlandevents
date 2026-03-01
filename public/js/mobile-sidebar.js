(function () {
    function initSidebar() {
        const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar');
        // CSS uses #sidebarOverlay — find it by ID first, then fallback to class
        const overlay = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay') || document.getElementById('sidebar-overlay');
        const toggleBtn = document.querySelector('.menu-toggle') || document.getElementById('menu-toggle');

        if (!sidebar) return;

        // Reset state on every page load
        sidebar.classList.remove('open', 'active');
        document.body.classList.remove('sidebar-open');
        if (overlay) { overlay.style.display = 'none'; overlay.classList.remove('active'); }

        function openSidebar() {
            // CSS requires .sidebar.active to slide in (see premium-admin.css line 624)
            sidebar.classList.add('open', 'active');
            document.body.classList.add('sidebar-open');
            if (overlay) { overlay.style.display = 'block'; setTimeout(() => overlay.classList.add('active'), 10); }
        }

        function closeSidebar() {
            sidebar.classList.remove('open', 'active');
            document.body.classList.remove('sidebar-open');
            if (overlay) { overlay.classList.remove('active'); setTimeout(() => overlay.style.display = 'none', 300); }
        }

        if (toggleBtn) toggleBtn.addEventListener('click', e => { e.stopPropagation(); sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); });
        if (overlay) overlay.addEventListener('click', closeSidebar);
        sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', closeSidebar));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initSidebar) : initSidebar();
})();
