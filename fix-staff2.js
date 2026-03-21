const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');

// Fix line 1119 (index 1118) - avatarContent
lines[1118] = "                        const avatarContent = (member.photo || member.photo_url)";
lines[1119] = '                            ? `<img src="${member.photo || member.photo_url}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`';
lines[1120] = "                            : initials;";

// Fix line 1125 (index 1124) - remove duplicate staff-role, fix order
lines[1124] = '                            <div class="staff-avatar">${avatarContent}</div>';
lines[1125] = '                            <div class="staff-name">${member.name}</div>';
lines[1126] = "                            <div class=\"staff-role\">${member.category || member.department || member.role || 'Staff'}</div>";

fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done - lines updated');
