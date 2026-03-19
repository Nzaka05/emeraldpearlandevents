const { spawn } = require('child_process');

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
                
                console.log('--- CALLING testsprite_bootstrap ---');
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/call",
                    params: {
                        name: "testsprite_bootstrap",
                        arguments: {
                            localPort: 3001,
                            pathname: "/",
                            type: "backend",
                            projectPath: "c:\\My Web Sites\\school\\live.themewild.com\\emerald",
                            testScope: "codebase"
                        }
                    }
                }) + '\n');
            } else if (msg.id === 2) {
                console.log('--- BOOTSTRAP RESULT ---');
                console.log(JSON.stringify(msg, null, 2));
                proc.kill();
                process.exit(0);
            } else if (msg.method === "notifications/message") {
                console.log('[MCP Message]', msg.params.message);
            }
        } catch (e) { }
    }
});

proc.stderr.on('data', (data) => {
    console.error('[MCP STDERR]:', data.toString().trim());
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

// Timeout in 3 minutes
setTimeout(() => {
    console.error('Timeout!');
    proc.kill();
    process.exit(1);
}, 180000);
