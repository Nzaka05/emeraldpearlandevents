const { spawn } = require('child_process');

const proc = spawn('npx', ['-y', '@testsprite/testsprite-mcp@latest'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
});

let buffer = '';
let step = 0; // 0=init, 1=code_summary, 2=test_plan, 3=execute

proc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const msg = JSON.parse(line);

            if (msg.id === 1) {
                // Initialized - send notification then code summary
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notifications/initialized"
                }) + '\n');

                console.log('--- Step 1: Calling testsprite_generate_code_summary ---');
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 10,
                    method: "tools/call",
                    params: {
                        name: "testsprite_generate_code_summary",
                        arguments: {
                            projectRootPath: "c:\\My Web Sites\\school\\live.themewild.com\\emerald"
                        }
                    }
                }) + '\n');
                step = 1;
            } else if (msg.id === 10) {
                console.log('--- Code Summary Result ---');
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log(text.substring(0, 2000));
                console.log('...(truncated)');

                console.log('\n--- Step 2: Calling testsprite_generate_backend_test_plan ---');
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 20,
                    method: "tools/call",
                    params: {
                        name: "testsprite_generate_backend_test_plan",
                        arguments: {
                            projectPath: "c:\\My Web Sites\\school\\live.themewild.com\\emerald"
                        }
                    }
                }) + '\n');
                step = 2;
            } else if (msg.id === 20) {
                console.log('--- Backend Test Plan Result ---');
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log(text.substring(0, 3000));
                console.log('...(truncated)');

                console.log('\n--- Step 3: Calling testsprite_generate_code_and_execute ---');
                proc.stdin.write(JSON.stringify({
                    jsonrpc: "2.0",
                    id: 30,
                    method: "tools/call",
                    params: {
                        name: "testsprite_generate_code_and_execute",
                        arguments: {
                            projectName: "emerald",
                            projectPath: "c:\\My Web Sites\\school\\live.themewild.com\\emerald",
                            testIds: [],
                            additionalInstruction: "PRODUCT SPECIFICATION: Use the file staff-system/Port_3001_PRD.md as the PRD context. AUTHENTICATION: For all authenticated endpoints, use Bearer token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmEzNTJkN2QwOTkzZDY0OTU0OWI2YSIsImlhdCI6MTc3MzgxMjgwMSwiZXhwIjoxNzc2NDA0ODAxfQ.Sz5U3-MEIAj_eD_8zCqUXxv3P_O44jJqbv294nM-UL8 in the Authorization header. The server runs on port 3001. Test all backend API endpoints.",
                            serverMode: "development"
                        }
                    }
                }) + '\n');
                step = 3;
            } else if (msg.id === 30) {
                console.log('\n\n========== FINAL TEST RESULTS ==========');
                const fs = require('fs');
                fs.writeFileSync('testsprite_results.json', JSON.stringify(msg, null, 2));
                console.log('Full results saved to testsprite_results.json');
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log(text);
                proc.kill();
                process.exit(0);
            }
        } catch (e) { }
    }
});

proc.stderr.on('data', (data) => {
    const s = data.toString().trim();
    if (s && !s.includes('AUTH_FAILED')) {
        console.error('[STDERR]:', s.substring(0, 500));
    }
});

// Initialize
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

// 10-minute timeout
setTimeout(() => {
    console.error('Timeout after 10 minutes!');
    proc.kill();
    process.exit(1);
}, 600000);
