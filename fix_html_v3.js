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

    // We want to find the button that contains fa-bars and has class mobile-menu-btn or menu-toggle
    // and replace it entirely.
    // The button might look like:
    // <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Open navigation menu" id="menu-toggle" class="menu-toggle mobile-menu-btn">
    //     <i class="fas fa-bars"></i>
    // </button>

    // Regex matches `<button ... > ... fa-bars ... </button>` where the button has class mobile-menu-btn or menu-toggle or id mobileMenuBtn.
    const buttonRegex = /<button[^>]*(?:mobile-menu-btn|menu-toggle|mobileMenuBtn)[^>]*>\s*<i[^>]*fa-bars[^>]*><\/i>\s*<\/button>/gi;

    let newContent = content.replace(buttonRegex, '<button class="menu-toggle mobile-menu-btn" id="menu-toggle" aria-label="Open navigation menu">\n        <i class="fas fa-bars"></i>\n    </button>');

    // Also remove any onclick=window.toggleSidebar on buttons that might have slipped through
    newContent = newContent.replace(/onclick\s*=\s*['"]window\.toggleSidebar[^>]*['"]/gi, '');

    if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        count++;
        console.log('Fixed', file);
    }
});

console.log('Total fixed: ' + count + ' files.');
