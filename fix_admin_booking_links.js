const fs = require('fs');
const path = require('path');
const adminDir = path.join(__dirname, 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

let updated = 0;
files.forEach(f => {
    let content = fs.readFileSync(path.join(adminDir, f), 'utf8');
    if (content.includes('href="/booking.html"')) {
        content = content.replace(/href="\/booking\.html"/g, 'href="/admin/bookings/new"');
        fs.writeFileSync(path.join(adminDir, f), content, 'utf8');
        console.log('Fixed FAB link in', f);
        updated++;
    }
});
console.log('Total fixed:', updated);
