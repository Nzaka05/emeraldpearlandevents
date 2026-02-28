// JS to handle sidebar toggling

// Reset all sidebar state on page load as requested to prevent bug 2
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar) sidebar.classList.remove('open', 'active', 'show');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('active', 'show');
    }
    document.body.classList.remove('sidebar-open', 'menu-open', 'overlay-active');
});

window.toggleSidebar = function (e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar) {
        sidebar.classList.toggle('active');
        const isActive = sidebar.classList.contains('active');

        if (overlay) {
            if (isActive) {
                overlay.style.display = 'block';
                overlay.classList.add('active');
                document.body.classList.add('sidebar-open');
            } else {
                overlay.style.display = 'none';
                overlay.classList.remove('active', 'show');
                document.body.classList.remove('sidebar-open', 'menu-open', 'overlay-active');
            }
        }
    }
};

window.closeSidebar = function () {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar) sidebar.classList.remove('open', 'active', 'show');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('active', 'show');
    }
    document.body.classList.remove('sidebar-open', 'menu-open', 'overlay-active');
};

// Use event delegation for better reliability across pages
document.addEventListener('click', (e) => {
    // Check if we clicked the menu button or its children (icon)
    const btn = e.target.closest('.mobile-menu-btn');
    if (btn) {
        window.toggleSidebar(e);
        return;
    }

    // Check if we clicked the overlay
    if (e.target.id === 'sidebarOverlay') {
        window.closeSidebar();
        return;
    }

    // Check if we clicked a nav link (close on mobile)
    if (e.target.closest('.sidebar-nav-link') || e.target.closest('.nav-item')) {
        if (window.innerWidth <= 768) {
            window.closeSidebar();
        }
        return;
    }

    // Auto-close if clicked outside an active sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('active')) {
        const btnNode = document.querySelector('.mobile-menu-btn');
        if (!sidebar.contains(e.target) && (!btnNode || !btnNode.contains(e.target))) {
            window.closeSidebar();
        }
    }
});

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
