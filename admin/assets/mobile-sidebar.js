// JS to handle sidebar toggling
window.toggleSidebar = function (e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Fallbacks just in case the DOM is loaded weirdly
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');

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

    // We do NOT add btn.addEventListener('click', window.toggleSidebar) here
    // because all 14 HTML files already have an inline onclick="window.toggleSidebar(event)".
    // Having both causes it to toggle twice (open then instantly close).

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
    const navLinks = document.querySelectorAll('.sidebar-nav-link, .nav-item');
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
// End of file
