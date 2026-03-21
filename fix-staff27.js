const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1159] = '                }';
lines[1160] = '                function filterStaff() {';
lines[1161] = '                    const category = document.getElementById(\'categoryFilter\').value;';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
