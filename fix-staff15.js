const fs = require('fs');
let lines = fs.readFileSync('admin/staff.html', 'utf8').split('\n');
lines[1141] = '                                </a>';
lines[1142] = '                            </div>` : \'\'}';
lines[1154] = '                        </div>';
lines[1155] = '                    </div>';
fs.writeFileSync('admin/staff.html', lines.join('\n'));
console.log('Done');
