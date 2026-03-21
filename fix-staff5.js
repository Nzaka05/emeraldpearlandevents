const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
// Fix lines 1123-1127
lines[1123] = '                            <div class="staff-avatar">${avatarContent}</div>';
lines[1124] = '                            <div class="staff-name">${member.name}</div>';
lines[1125] = "                            <div class=\"staff-role\">${member.category || member.department || member.role || 'Staff'}</div>";
lines.splice(1126, 1); // remove duplicate staff-role
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
