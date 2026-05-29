const fs = require('fs');
const path = require('path');

const adminDir = path.resolve(__dirname, 'admin');

fs.readdirSync(adminDir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.normalize(path.join(adminDir, file));
        if (!filePath.startsWith(adminDir + path.sep)) {
            throw new Error('Path traversal detected');
        }
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
