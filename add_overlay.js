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

    // Check if overlay already exists  
    if (content.includes('sidebarOverlay') || content.includes('sidebar-overlay')) {
        console.log('Already has overlay:', file);
        return;
    }

    // Insert the overlay div right after <body>
    const newContent = content.replace(/<body[^>]*>/, match => {
        return match + '\n    <div id="sidebarOverlay"></div>';
    });

    if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        count++;
        console.log('Added overlay:', file);
    }
});

console.log('Total updated:', count);
