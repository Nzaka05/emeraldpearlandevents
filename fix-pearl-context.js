const fs = require('fs');
let content = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');

// Pass user context from EJS template to fetch
content = content.replace(
    "body: JSON.stringify({ query, eventContext: {} })",
    `body: JSON.stringify({ 
                query, 
                eventContext: {
                    userName: '<%= user && user.name ? user.name : "Team Member" %>',
                    title: '<%= user && user.title ? user.title : "" %>',
                    role: '<%= user && user.role ? user.role : "Admin" %>',
                    email: '<%= user && user.email ? user.email : "" %>'
                },
                history: conversationHistory
            })`
);

// Add conversation history tracking
content = content.replace(
    "const csrf = document.querySelector('meta[name=\"csrf-token\"]')?.content || '';",
    `const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
const conversationHistory = [];`
);

// Save to history after each message
content = content.replace(
    "addMessage(data.data.response || data.data.summary || JSON.stringify(data.data), 'ai');",
    `const reply = data.data.response || data.data.summary || JSON.stringify(data.data);
            addMessage(reply, 'ai');
            conversationHistory.push({ query: query, response: reply });`
);

fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', content);
console.log('Done');
