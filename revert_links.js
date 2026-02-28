const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, 'admin');

fs.readdirSync(adminDir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(adminDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        let original = content;

        // Remove .html from /admin/xxx.html links
        content = content.replace(/href="\/admin\/([a-zA-Z0-9_-]+)\.html([\?"])/g, 'href="/admin/$1$2');

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Reverted links in ${file}`);
        }
    }
});
