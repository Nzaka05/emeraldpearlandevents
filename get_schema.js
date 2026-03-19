const { spawn } = require('child_process');
const fs = require('fs');

const proc = spawn('npx', ['-y', '@testsprite/testsprite-mcp@latest'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';

proc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); 

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const msg = JSON.parse(line);
            if (msg.id === 1) {
                // Initialized
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized"
                }) + '\n');
                
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/list",
                    params: {}
                }) + '\n');
            } else if (msg.id === 2) {
                fs.writeFileSync('tools.json', JSON.stringify(msg, null, 2));
                proc.kill();
                process.exit(0);
            }
        } catch (e) { }
    }
});

proc.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "my-client", version: "1.0.0" }
    }
}) + '\n');

setTimeout(() => { proc.kill(); process.exit(1); }, 15000);
