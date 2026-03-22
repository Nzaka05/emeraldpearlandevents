const fs = require('fs');
let content = fs.readFileSync('admin/staff.html', 'utf8');

// Fix dropdown values to match DB
content = content.replace('<option value="Waiters">Waiters</option>', '<option value="Waiter">Waiters</option>');
content = content.replace('<option value="Ushers">Ushers</option>', '<option value="Usher">Ushers</option>');
content = content.replace('<option value="Chauffeurs">Chauffeurs</option>', '<option value="Chauffeur">Chauffeurs</option>');

// Fix filter to be case-insensitive and partial match
content = content.replace(
    "const catMatch = !category || (staff.category || '').toLowerCase() === category.toLowerCase() || (staff.department || '').toLowerCase() === category.toLowerCase();",
    "const catMatch = !category || (staff.category || '').toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes((staff.category || '').toLowerCase());"
);

fs.writeFileSync('admin/staff.html', content);
console.log('Done');
