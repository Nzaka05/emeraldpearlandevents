const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1164] = '                        const catMatch = !category || staff.category === category;';
lines[1165] = '                        const availMatch = !availability || (availability === "available" ? staff.isAvailable : !staff.isAvailable);';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
