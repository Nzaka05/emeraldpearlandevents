const fs = require('fs');
const path = require('path');
const adminDir = path.join(__dirname, 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

let updated = 0;
files.forEach(f => {
    const fp = path.join(adminDir, f);
    let content = fs.readFileSync(fp, 'utf8');

    if (content.includes('/admin/bookings?new=1')) {
        content = content.replace(/\/admin\/bookings\?new=1/g, '/booking.html');
        fs.writeFileSync(fp, content, 'utf8');
        console.log('Fixed FAB link in', f);
        updated++;
    }
});
console.log('Total fixed:', updated);
