const fs = require('fs');
let content = fs.readFileSync('admin/login.html', 'utf8');
content = content.replace(
    '<form id="loginForm" style="display: none;">',
    '<form id="loginForm">'
);
fs.writeFileSync('admin/login.html', content);
console.log('Done');
