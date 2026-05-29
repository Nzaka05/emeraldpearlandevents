const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, 'admin');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
let count = 0;

const newScriptTag = '<script src="/js/mobile-sidebar.js"></script>';

files.forEach(file => {
    const fullPath = path.normalize(path.join(dir, file));
    if (!fullPath.startsWith(dir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    let content = fs.readFileSync(fullPath, 'utf8');

    // Remove ALL existing mobile-sidebar script tags (old path or new path)
    let newContent = content
        .replace(/<script[^>]*src="[^"]*mobile-sidebar\.js"[^>]*><\/script>\r?\n?/gi, '');

    // Insert the new script tag right before </body>
    newContent = newContent.replace(/<\/body>/i, `    ${newScriptTag}\n</body>`);

    if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        count++;
        console.log('Updated:', file);
    }
});

console.log('Total updated:', count);
