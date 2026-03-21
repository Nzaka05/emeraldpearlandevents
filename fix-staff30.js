const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1163] = '                    const filtered = staffData.filter(staff => {';
lines[1164] = '                        const catMatch = !category || staff.category === category;';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
