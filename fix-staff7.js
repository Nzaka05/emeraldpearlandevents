const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1121] = '                        return `';
lines[1122] = '                    <div class="staff-card">';
lines[1123] = '                        <div class="staff-header">';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
