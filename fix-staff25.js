const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1156] = '                    </div>';
lines[1157] = '                `;';
lines[1158] = '                    }).join(\'\');';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
