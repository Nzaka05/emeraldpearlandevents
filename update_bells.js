const fs = require('fs');
const path = require('path');
const adminPath = path.join(__dirname, 'admin');

fs.readdirSync(adminPath).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(adminPath, file);
        let content = fs.readFileSync(filePath, 'utf8');

        let updated = false;

        // This regex specifically matches '<div class="notification-bell"'
        content = content.replace(/<div class="notification-bell"([^>]*)>/g, (match, p1) => {
            if (!match.includes('onclick')) {
                updated = true;
                return '<div class="notification-bell" style="cursor:pointer;" onclick="window.location.href=\'/admin/notifications\'"' + p1 + '>';
            }
            return match;
        });

        if (updated) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Updated bell in:', file);
        }
    }
});
