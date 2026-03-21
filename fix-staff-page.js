const fs = require('fs');
let content = fs.readFileSync('admin/staff.html', 'utf8');

// Fix 1: mobile-sidebar.js path
content = content.replace(
    '/js/mobile-sidebar.js?v=3',
    '/admin/assets/mobile-sidebar.js?v=3'
);

// Fix 2: Add onclick to staff card
content = content.replace(
    '<div class="staff-card">',
    '<div class="staff-card" onclick="editStaff(\'${member._id}\')" style="cursor:pointer;">'
);

// Fix 3: Fix member.id to member._id in editStaff
content = content.replace(
    "const member = staffData.find(s => s.id === id);",
    "const member = staffData.find(s => s._id === id);"
);
content = content.replace(
    "document.getElementById('staffModal').dataset.editId = member.id;",
    "document.getElementById('staffModal').dataset.editId = member._id;"
);

fs.writeFileSync('admin/staff.html', content);
console.log('Done');
