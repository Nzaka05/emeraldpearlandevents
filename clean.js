const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'admin');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(f => {
    let p = path.join(dir, f);
    let content = fs.readFileSync(p, 'utf8');

    // Replace all occurrences of onclick=...toggleSidebar... 
    content = content.replace(/onclick=["']window\.toggleSidebar[^"']*["']/g, '');

    // Also change existing ID of mobileMenuBtn to menu-toggle where appropriate
    content = content.replace(/id=["']mobileMenuBtn["']/g, 'id="menu-toggle"');

    fs.writeFileSync(p, content);
    console.log('Cleaned inline JS tags in ' + f);
});
