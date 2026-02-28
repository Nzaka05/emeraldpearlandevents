const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, 'admin');

fs.readdirSync(adminDir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(adminDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        let original = content;

        // Match href="/admin/word" and add .html before any ? or "
        // But exclude ones that already have .html
        content = content.replace(/href="\/admin\/([a-zA-Z0-9_-]+)([\?"])/g, (match, pageName, suffix) => {
            // Check if pageName exists in the directory
            const htmlExists = fs.existsSync(path.join(adminDir, pageName + '.html'));
            if (htmlExists) {
                return `href="/admin/${pageName}.html${suffix}`;
            }
            return match;
        });

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated links in ${file}`);
        }
    }
});
