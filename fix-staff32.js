const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1165] = '                        const availMatch = !availability || (availability === "available" ? staff.isAvailable : !staff.isAvailable);';
lines[1166] = '                        return catMatch && availMatch;';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
