const fs = require('fs');
let content = fs.readFileSync('admin/gallery.html', 'utf8');
content = content.replace(/loading="lazy"/g, '');
fs.writeFileSync('admin/gallery.html', content);
console.log('Done');
