const fs = require('fs');
let c = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');

c = c.replace(
    `        addMessage('Connection error: ' + err.message, 'ai');
function addMessage(text, from) {`,
    `        addMessage('Connection error: ' + err.message, 'ai');
    }
}
function addMessage(text, from) {`
);

fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', c);
console.log('Fixed:', c.includes("addMessage('Connection error: ' + err.message, 'ai');\n    }\n}\nfunction addMessage"));
