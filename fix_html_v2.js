const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, 'admin');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
let count = 0;

files.forEach(file => {
    const fullPath = path.normalize(path.join(dir, file));
    if (!fullPath.startsWith(dir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    let content = fs.readFileSync(fullPath, 'utf8');

    // We want to find the topbar-left which contains the hamburger button.
    let newContent = content.replace(/(<div class="topbar-left">\s*)<button[^>]*>[\s\S]*?<\/button>/gi,
        '$1<button class="menu-toggle mobile-menu-btn" id="menu-toggle" aria-label="Open navigation menu">\n                    <i class="fas fa-bars"></i>\n                </button>'
    );

    // Also remove any onclick=window.toggleSidebar
    newContent = newContent.replace(/onclick\s*=\s*['"]window\.toggleSidebar[^>]*['"]/gi, '');

    // Check if the file had the dashboard total booking auto update bug
    // While we're here, we can leave comments if needed but let's stick to HTML.

    if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        count++;
    }
});

console.log('Fixed ' + count + ' files.');
