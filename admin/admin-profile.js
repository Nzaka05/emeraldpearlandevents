// Admin Profile Loader - Loads admin avatar and name on all admin pages
(function() {
    async function loadAdminProfile() {
        try {
            const res = await fetch('/api/admin/me');
            const data = await res.json();

            if (!data.success || !data.admin) {
                console.warn('Could not load admin profile');
                return;
            }

            const admin = data.admin;
            const initials = (admin.name || 'A').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

            // Update all avatar elements on the page
            const avatarSelectors = [
                '.admin-avatar',
                '#adminAvatar',
                '#topbarAvatar',
                '.topbar-avatar'
            ];

            avatarSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (admin.avatar) {
                        // If avatar exists, show image
                        if (el.tagName === 'IMG') {
                            el.src = admin.avatar;
                            el.style.display = 'block';
                        } else {
                            // Replace div content with image
                            el.innerHTML = `<img src="${admin.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="${admin.name}">`;
                            el.style.padding = '0';
                            el.style.background = 'transparent';
                        }
                    } else {
                        // No avatar - show initials
                        el.textContent = initials;
                        // Reset styles for initials display
                        if (el.tagName !== 'IMG') {
                            el.style.padding = '';
                            el.style.background = '';
                        }
                    }
                });
            });

            // Update admin name elements
            const nameSelectors = [
                '.admin-name',
                '#adminName',
                '#topbarName',
                '.topbar-admin-name'
            ];

            nameSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    el.textContent = admin.name || 'Admin';
                });
            });

            // Update admin role elements
            const roleSelectors = [
                '.admin-role',
                '#adminRole',
                '.topbar-admin-role'
            ];

            const roleText = admin.role ? admin.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Super Admin';
            roleSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    el.textContent = roleText;
                });
            });

            // Cache in localStorage for faster loading on next page
            localStorage.setItem('adminAvatar', admin.avatar || '');
            localStorage.setItem('adminName', admin.name || 'Admin');
            localStorage.setItem('adminRole', admin.role || 'admin');

        } catch (err) {
            console.warn('Could not load admin profile:', err);
            // Try to use cached data
            applyCachedProfile();
        }
    }

    function applyCachedProfile() {
        const cachedAvatar = localStorage.getItem('adminAvatar');
        const cachedName = localStorage.getItem('adminName');
        const cachedRole = localStorage.getItem('adminRole');

        if (!cachedName && !cachedAvatar) return;

        const initials = (cachedName || 'A').split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        const avatarSelectors = ['.admin-avatar', '#adminAvatar', '#topbarAvatar', '.topbar-avatar'];
        avatarSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (cachedAvatar) {
                    if (el.tagName === 'IMG') {
                        el.src = cachedAvatar;
                    } else {
                        el.innerHTML = `<img src="${cachedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="${cachedName}">`;
                    }
                } else {
                    el.textContent = initials;
                }
            });
        });

        const nameSelectors = ['.admin-name', '#adminName', '#topbarName', '.topbar-admin-name'];
        nameSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.textContent = cachedName || 'Admin';
            });
        });

        const roleText = cachedRole ? cachedRole.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Super Admin';
        const roleSelectors = ['.admin-role', '#adminRole', '.topbar-admin-role'];
        roleSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.textContent = roleText;
            });
        });
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAdminProfile);
    } else {
        loadAdminProfile();
    }
})();
