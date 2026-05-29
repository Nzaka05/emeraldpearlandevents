const fs = require('fs');
const path = require('path');
const adminDir = path.resolve(__dirname, 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

let updated = 0;
files.forEach(f => {
    const fp = path.normalize(path.join(adminDir, f));
    if (!fp.startsWith(adminDir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    let content = fs.readFileSync(fp, 'utf8');
    let changed = false;

    // Fix .sidebar.open to .sidebar.active in CSS
    if (content.includes('.sidebar.open {') && !content.includes('.sidebar.active {')) {
        content = content.replace('.sidebar.open {', '.sidebar.active {');
        changed = true;
    }

    // Check if there are multiple sidebarOverlays
    const overlayCount = (content.match(/id="sidebarOverlay"/g) || []).length;
    if (overlayCount > 1) {
        console.log('Multiple overlays in', f);
        // remove the first one 
        content = content.replace('<div id="sidebarOverlay"></div>', '');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(fp, content, 'utf8');
        console.log('Fixed CSS/Overlay in', f);
        updated++;
    }
});
console.log('Total fixed:', updated);
