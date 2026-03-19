const { spawn } = require('child_process');

const proc = spawn('npx', ['-y', '@testsprite/testsprite-mcp@latest'], {
    // Windows might need shell: true for npx
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
});

let state = 0;
let buffer = '';

proc.stdout.on('data', (data) => {
    buffer += data.toString();
    console.log('--- RAW RECV ---');
    console.log(data.toString());
    console.log('----------------');
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep remainder

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const msg = JSON.parse(line);
            console.log('RECV:', JSON.stringify(msg, null, 2));
            if (msg.id === 1) {
                // Initialized
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized"
                }) + '\n');
                // Request tools
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 2,
                    method: "tools/list",
                    params: {}
                }) + '\n');
            } else if (msg.id === 2) {
                console.log('--- TOOLS LIST ---');
                console.log(JSON.stringify(msg, null, 2));
                proc.kill();
                process.exit(0);
            }
        } catch (e) {
            // Might be logging, not JSON
            console.error('Non-JSON stdout:', line);
        }
    }
});

proc.stderr.on('data', (data) => {
    console.error('STDERR:', data.toString());
});

// Send init
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

// Timeout
setTimeout(() => {
    console.error('Timeout!');
    proc.kill();
    process.exit(1);
}, 15000);
