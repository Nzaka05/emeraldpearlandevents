const fs = require('fs');
const path = require('path');

const adminDir = 'admin';
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(adminDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if mobile sidebar script is already there
    if (!content.includes('mobile-sidebar.js')) {
        // Add before closing </body>
        content = content.replace(
            '</body>',
            '<script src="/admin/assets/mobile-sidebar.js?v=3"></script>\n</body>'
        );
        fs.writeFileSync(filePath, content);
        console.log('Added mobile sidebar to: ' + file);
    }
    
    // Check if hamburger toggle exists in header
    if (!content.includes('menu-toggle') && !content.includes('hamburger')) {
        console.log('No hamburger in: ' + file);
    }
});
console.log('Done');
