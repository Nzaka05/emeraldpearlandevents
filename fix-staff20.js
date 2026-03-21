const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1148] = '                            <button class="availability-toggle ${member.isAvailable ? \'available\' : \'unavailable\'}"';
lines[1149] = '                                    onclick="toggleAvailability(\'${member._id}\')">';
lines[1150] = '                                ${member.isAvailable ? \'<i class="fas fa-check"></i> Available\' : \'<i class="fas fa-times"></i> Unavailable\'}';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
