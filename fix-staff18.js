const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1144] = '                            <div class="staff-info" style="margin-top:8px;">';
lines[1145] = '                                <span class="staff-label">Hourly Rate:</span><br>';
lines[1146] = '                                <span class="staff-value">${member.hourlyRate}</span>';
lines[1147] = '                            </div>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
