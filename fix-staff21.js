const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1150] = '                                ${member.isAvailable ? \'<i class="fas fa-check"></i> Available\' : \'<i class="fas fa-times"></i> Unavailable\'}';
lines[1151] = '                            </button>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
