const fs = require('fs');
const path = require('path');

const adminDir = path.resolve(__dirname, 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.normalize(path.join(adminDir, file));
    if (!filePath.startsWith(adminDir + path.sep)) {
        throw new Error('Path traversal detected');
    }
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
