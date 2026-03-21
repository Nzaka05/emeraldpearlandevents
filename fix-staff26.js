const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1158] = '                    }).join(\'\');';
lines[1159] = '                }';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
