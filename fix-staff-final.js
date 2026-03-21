const fs = require('fs');
let content = fs.readFileSync('admin/staff.html', 'utf8');

// Fix 1: Remove duplicate Staff header (line 963 area - inside main content)
content = content.replace(
    `                        <h1 class="page-title">Staff</h1>`,
    `                        <h1 class="page-title" style="display:none;">Staff</h1>`
);

// Fix 2: Map _id correctly (staffData uses id but editStaff uses _id)
content = content.replace(
    "id: s._id,",
    "_id: s._id,\n                                id: s._id,"
);

// Fix 3: Add missing fields to staffData map
content = content.replace(
    "notes: s.notes || ''",
    "notes: s.notes || '',\n                                _id: s._id,\n                                photo_url: s.photo_url || null,\n                                isAvailable: s.isAvailable"
);

fs.writeFileSync('admin/staff.html', content);
console.log('Done');
