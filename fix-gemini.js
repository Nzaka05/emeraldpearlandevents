const fs = require('fs');
let content = fs.readFileSync('staff-system/services/aiAssistantService.js', 'utf8');

// Replace Claude API call with Gemini
const claudeCall = `    const response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages
    });

    const aiResponse = response.content[0].text;`;

const geminiCall = `    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt
    });
    
    // Build Gemini chat history
    const geminiHistory = [];
    if (messages.length > 1) {
        messages.slice(0, -1).forEach(m => {
            geminiHistory.push({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            });
        });
    }
    
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(sanitized);
    const aiResponse = result.response.text();`;

content = content.replace(claudeCall, geminiCall);
fs.writeFileSync('staff-system/services/aiAssistantService.js', content);
console.log('Done');
