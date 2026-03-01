(function () {
    function initSidebar() {
        const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar');
        const overlay = document.querySelector('.sidebar-overlay') || document.getElementById('sidebar-overlay');
        const toggleBtn = document.getElementById('menu-toggle') || document.querySelector('.menu-toggle');

        if (!sidebar) {
            console.warn('Sidebar element not found');
            return;
        }

        // Clean reset on every page load
        sidebar.classList.remove('open', 'active');
        document.body.classList.remove('sidebar-open');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.remove('active');
        }

        function openSidebar() {
            sidebar.classList.add('open');
            document.body.classList.add('sidebar-open');
            if (overlay) {
                overlay.style.display = 'block';
                setTimeout(() => overlay.classList.add('active'), 10);
            }
        }

        function closeSidebar() {
            sidebar.classList.remove('open', 'active');
            document.body.classList.remove('sidebar-open');
            if (overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.style.display = 'none', 300);
            }
        }

        // Expose globally so onclick="window.toggleSidebar()" still works
        window.toggleSidebar = function () {
            sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
        };

        // Also attach via event listener as backup
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                window.toggleSidebar();
            });
        }

        if (overlay) overlay.addEventListener('click', closeSidebar);

        sidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', closeSidebar);
        });

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
    }

    // Run immediately if DOM ready, otherwise wait
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();

async function loadGlobalAdminAvatar() {
    try {
        const response = await fetch('/api/admin/settings');
        const result = await response.json();
        if (result.success && result.settings && result.settings.profileImage) {
            const sidebarLogo = document.querySelector('.sidebar-logo');
            if (sidebarLogo && !document.querySelector('.sidebar-profile')) {
                const profileDiv = document.createElement('div');
                profileDiv.className = 'sidebar-profile';
                profileDiv.style.textAlign = 'center';
                profileDiv.style.marginBottom = '32px';

                const img = document.createElement('img');
                img.src = result.settings.profileImage;
                img.style.width = '70px';
                img.style.height = '70px';
                img.style.borderRadius = '50%';
                img.style.objectFit = 'cover';
                img.style.border = '2px solid var(--accent-gold)';
                img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                img.style.transition = 'transform 0.3s ease';
                img.onmouseover = () => img.style.transform = 'scale(1.05)';
                img.onmouseout = () => img.style.transform = 'scale(1)';

                profileDiv.appendChild(img);
                sidebarLogo.parentNode.insertBefore(profileDiv, sidebarLogo.nextSibling);
            }
        }
    } catch (err) {
        console.error('Failed to load global admin avatar:', err);
    }
}

// Load avatar globally
loadGlobalAdminAvatar();
