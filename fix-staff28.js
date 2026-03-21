const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1161] = '                    const category = document.getElementById(\'categoryFilter\').value;';
lines[1162] = '                    const availability = document.getElementById(\'availabilityFilter\').value;';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
