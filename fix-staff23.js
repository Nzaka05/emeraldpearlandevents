const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1152] = '                            <div class="staff-actions">';
lines[1153] = '                                <button class="action-btn" onclick="deleteStaff(\'${member._id}\')" style="background: var(--accent-danger); margin-top: 8px;">Delete Access</button>';
lines[1154] = '                            </div>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
