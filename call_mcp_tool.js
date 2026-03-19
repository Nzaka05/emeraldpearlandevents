const { spawn } = require('child_process');

const toolName = process.argv[2];
const paramsStr = process.argv[3];
let params;
try { params = JSON.parse(paramsStr); } catch(e) { console.error('Invalid JSON params'); process.exit(1); }

console.log(`Calling ${toolName} with`, params);

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
            
            if (msg.id === 1) { // initialized
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized"
                }) + '\n');
                
                // CALL TOOL
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/call",
                    params: {
                        name: toolName,
                        arguments: params
                    }
                }) + '\n');
                console.log('Tool call sent. Waiting for response... (this might take a while)');
            } else if (msg.id === 2) {
                console.log('--- CALL RESULT ---');
                console.log(JSON.stringify(msg, null, 2));
                proc.kill();
                process.exit(0);
            } else if (msg.method && msg.method.startsWith('notifications/')) {
                console.log('[Notification]', msg.method, JSON.stringify(msg.params||{}));
            }
        } catch (e) {
            // Not JSON or trailing log
        }
    }
});

proc.stderr.on('data', (data) => {
    console.error('[MCP STDERR]:', data.toString().trim());
});

// START
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

// 10 minutes timeout for the entire MCP task
setTimeout(() => {
    console.error('Timeout after 10m!');
    proc.kill();
    process.exit(1);
}, 600000);
