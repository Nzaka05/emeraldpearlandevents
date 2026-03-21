const fs = require('fs');
let content = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');

// Fix error handling to show actual error
content = content.replace(
    "addMessage('Sorry, I could not process that request.', 'ai');",
    "addMessage('Error: ' + (data.error || data.message || 'Could not process request'), 'ai');"
);

// Fix second error handler
content = content.replace(
    "addMessage('Connection error. Please try again.', 'ai');",
    "addMessage('Connection error: ' + err.message, 'ai');"
);

fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', content);
console.log('Done');
