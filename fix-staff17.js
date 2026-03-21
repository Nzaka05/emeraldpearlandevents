const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1142] = '                                </a>';
lines[1143] = '                            </div>` : \'\'}';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
