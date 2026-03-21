const fs = require('fs');
const path = require('path');

const adminDir = 'admin';
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(adminDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('localhost:3001')) {
        content = content.replace(/http:\/\/localhost:3001/g, 'https://emerald-staff-system.onrender.com');
        fs.writeFileSync(filePath, content);
        console.log('Fixed: ' + file);
    }
});
console.log('Done');
