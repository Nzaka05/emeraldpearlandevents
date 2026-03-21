const fs = require('fs');
let content = fs.readFileSync('admin/staff.html', 'utf8');

// Fix the avatarContent lines
content = content.replace(
    `const avatarContent = member.photo || member.photo_url\n                            ? <img src="\${member.photo || member.photo_url}" alt="\${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">"`,
    "const avatarContent = (member.photo || member.photo_url)\n                            ? `<img src=\"${member.photo || member.photo_url}\" alt=\"${member.name}\" style=\"width: 100%; height: 100%; object-fit: cover; border-radius: 50%;\">`"
);

// Fix duplicate staff-role - remove the old one
content = content.replace(
    `<div class="staff-role">\${member.category || member.department || member.role || 'Staff'}</div>\n                            <div class="staff-name">\${member.name}</div>\n                            <div class="staff-role">\${member.category}</div>`,
    `<div class="staff-name">\${member.name}</div>\n                            <div class="staff-role">\${member.category || member.department || member.role || 'Staff'}</div>`
);

fs.writeFileSync('admin/staff.html', content);
console.log('Done');
