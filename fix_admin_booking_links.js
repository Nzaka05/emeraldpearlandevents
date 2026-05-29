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
    if (content.includes('href="/booking.html"')) {
        content = content.replace(/href="\/booking\.html"/g, 'href="/admin/bookings/new"');
        fs.writeFileSync(fp, content, 'utf8');
        console.log('Fixed FAB link in', f);
        updated++;
    }
});
console.log('Total fixed:', updated);
