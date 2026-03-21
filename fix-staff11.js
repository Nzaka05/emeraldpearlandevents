const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1133] = '                            <div class="staff-info">';
lines[1134] = '                                <span class="staff-label">Phone:</span><br>';
lines[1135] = '                                <span class="staff-value">${member.phone}</span>';
lines[1136] = '                            </div>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
