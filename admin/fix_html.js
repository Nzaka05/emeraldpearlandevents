const fs = require('fs');
const path = require('path');
const dir = __dirname;

const files = [
    'analytics.html',
    'bookings.html',
    'calendar.html',
    'clients.html',
    'dashboard.html',
    'gallery.html',
    'new-booking.html',
    'notifications.html',
    'settings.html',
    'staff.html',
    'testimonials.html'
];

files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');

        let changed = false;
        const newContent = content.replace(/<button[^>]*onclick\s*=\s*['"]window\.toggleSidebar[^>]*>([\s\S]*?)<\/button>/giv, (match, inner) => {
            changed = true;
            return `<button class="menu-toggle" id="menu-toggle" aria-label="Open navigation menu">${inner}</button>`;
        });

        if (changed) {
            fs.writeFileSync(fullPath, newContent, 'utf8');
            console.log('Fixed:', file);
        } else {
            console.log('No matches in:', file);
        }
    }
});
