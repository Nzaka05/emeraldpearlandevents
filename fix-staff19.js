const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1147] = '                            </div>';
lines[1148] = '                            <button class="availability-toggle ${member.isAvailable ? \'available\' : \'unavailable\'}"';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
