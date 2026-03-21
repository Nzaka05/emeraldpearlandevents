const fs = require('fs');
let content = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');
content = content.replace('AI Assistant', 'PEARL');
content = content.replace('Powered by Emerald AI', 'Personal Emerald Assistant for Real-time Leadership');
content = content.replace('Ask about staff, events, analytics...', 'Good day! How can I assist you?');
content = content.replace("Hello! I am the Emerald AI Assistant. I can help you with staff management, event planning, analytics, and more. What would you like to know?", 
    "Hello! I am PEARL, your Personal Emerald Assistant. I am here to help you manage staff, track events, and keep Emerald Pearland Events running smoothly. How may I assist you today?");
fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', content);
console.log('Done');
