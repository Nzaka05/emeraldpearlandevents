const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname);

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

const newLink = `            <li class="sidebar-nav-item">
                <a href="http://localhost:3001" target="_blank" class="sidebar-nav-link" style="color: var(--accent); background: rgba(201, 168, 76, 0.05);">
                    <span class="sidebar-nav-icon"><i class="fas fa-external-link-alt"></i></span>
                    <span>Staff System</span>
                </a>
            </li>`;

files.forEach(file => {
    const fullPath = path.normalize(path.join(dir, file));
    if (!fullPath.startsWith(dir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');

        // Check if already injected
        if (content.includes('href="http://localhost:3001"')) {
            console.log('Already updated:', file);
            return;
        }

        // Find the settings block
        const regexSettings = /(<li class="sidebar-nav-item">\s*<a href="\/admin\/settings" class="sidebar-nav-link(?: active)?">)/g;

        if (regexSettings.test(content)) {
            const newContent = content.replace(regexSettings, newLink + '\n$1');
            fs.writeFileSync(fullPath, newContent, 'utf8');
            console.log('Updated:', file);
        } else {
            console.log('Could not find settings link in:', file);
        }
    } else {
        console.log('File not found:', file);
    }
});
