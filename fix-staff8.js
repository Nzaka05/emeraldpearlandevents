const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1123] = '                        <div class="staff-header">';
lines[1124] = '                            <div class="staff-avatar">${avatarContent}</div>';
lines[1125] = '                            <div class="staff-name">${member.name}</div>';
lines[1126] = "                            <div class=\"staff-role\">${member.category || member.department || member.role || 'Staff'}</div>";
lines[1127] = '                        </div>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
