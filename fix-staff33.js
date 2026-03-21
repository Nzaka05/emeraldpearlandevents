const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1166] = '                        return catMatch && availMatch;';
lines[1167] = '                    });';
lines[1168] = '                    renderStaff(filtered);';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
