const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
// Remove the duplicate staff-role line (index 1129)
lines.splice(1129, 1);
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
