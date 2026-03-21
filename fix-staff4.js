const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
// Remove the duplicate staff-role line (index 1125)
lines.splice(1125, 1);
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
