const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1151] = '                            </button>';
lines[1152] = '                            <div class="staff-actions">';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
