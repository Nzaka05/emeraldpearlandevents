(function () {
    function initSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebarOverlay'); // correct ID
        const toggleBtn = document.getElementById('menu-toggle');

        if (!sidebar) return;

        // Reset on every page load
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.remove('active');
        }

        function openSidebar() {
            sidebar.classList.add('active'); // use 'active' not 'open'
            document.body.classList.add('sidebar-open');
            if (overlay) {
                overlay.style.display = 'block';
                setTimeout(() => overlay.classList.add('active'), 10);
            }
        }

        function closeSidebar() {
            sidebar.classList.remove('active'); // use 'active' not 'open'
            document.body.classList.remove('sidebar-open');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.style.display = 'none', 300);
            }
        }

        window.toggleSidebar = function () {
            sidebar.classList.contains('active') ? closeSidebar() : openSidebar();
        };

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                window.toggleSidebar();
            });
        }

        if (overlay) overlay.addEventListener('click', closeSidebar);
        sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', closeSidebar));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
    }

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', initSidebar)
        : initSidebar();
})();
