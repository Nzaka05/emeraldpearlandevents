const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1129] = '                            <div class="staff-info">';
lines[1130] = '                                <span class="staff-label">Email:</span><br>';
lines[1131] = '                                <span class="staff-value">${member.email}</span>';
lines[1132] = '                            </div>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
