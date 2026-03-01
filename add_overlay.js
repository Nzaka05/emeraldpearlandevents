const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), 'admin');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
let count = 0;

files.forEach(file => {
    const fullPath = path.join(dir, file);
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
