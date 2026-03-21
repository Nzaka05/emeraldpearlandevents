const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1127] = '                        </div>';
lines[1128] = '                        <div class="staff-body">';
lines[1129] = '                            <div class="staff-info">';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
