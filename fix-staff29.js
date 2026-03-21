const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1162] = '                    const availability = document.getElementById(\'availabilityFilter\').value;';
lines[1163] = '                    const filtered = staffData.filter(staff => {';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
