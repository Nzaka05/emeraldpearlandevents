const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, 'admin');

fs.readdirSync(adminDir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(adminDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        const target = '<a href="/admin/bookings" class="fab-item">';
        const replacement = '<a href="/admin/bookings?new=1" class="fab-item">';

        if (content.includes(target)) {
            content = content.replace(target, replacement);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
});
