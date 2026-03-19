const { spawn } = require('child_process');
const fs = require('fs');

const PROJECT_PATH = 'c:\\My Web Sites\\school\\live.themewild.com\\emerald\\staff-system';

const proc = spawn('npx', ['-y', '@testsprite/testsprite-mcp@latest'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
});

let buffer = '';

function sendMsg(id, method, params) {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + '\n');
}

function ts() { return new Date().toISOString().substring(11, 19); }

proc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const msg = JSON.parse(line);

            if (msg.id === 1) {
                proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + '\n');

                console.log(`[${ts()}] Checking account info...`);
                sendMsg(5, "tools/call", {
                    name: "testsprite_check_account_info",
                    arguments: {}
                });
            } else if (msg.id === 5) {
                console.log(`[${ts()}] Account info result:`);
                console.log(JSON.stringify(msg, null, 2));

                // Now try bootstrap
                console.log(`\n[${ts()}] Running bootstrap...`);
                sendMsg(10, "tools/call", {
                    name: "testsprite_bootstrap",
                    arguments: {
                        localPort: 3001,
                        pathname: "/",
                        type: "backend",
                        projectPath: PROJECT_PATH,
                        testScope: "codebase"
                    }
                });
            } else if (msg.id === 10) {
                console.log(`[${ts()}] Bootstrap complete.`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log('Result:', text.substring(0, 500));

                // Now try code summary
                console.log(`\n[${ts()}] Running code summary...`);
                sendMsg(20, "tools/call", {
                    name: "testsprite_generate_code_summary",
                    arguments: { projectRootPath: PROJECT_PATH }
                });
            } else if (msg.id === 20) {
                console.log(`[${ts()}] Code summary complete.`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log('Result:', text.substring(0, 500));

                // Standardized PRD
                console.log(`\n[${ts()}] Running standardized PRD...`);
                sendMsg(25, "tools/call", {
                    name: "testsprite_generate_standardized_prd",
                    arguments: { projectPath: PROJECT_PATH }
                });
            } else if (msg.id === 25) {
                console.log(`[${ts()}] Standardized PRD complete.`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log('Result:', text.substring(0, 500));

                // Test plan
                console.log(`\n[${ts()}] Running backend test plan...`);
                sendMsg(30, "tools/call", {
                    name: "testsprite_generate_backend_test_plan",
                    arguments: { projectPath: PROJECT_PATH }
                });
            } else if (msg.id === 30) {
                console.log(`[${ts()}] Backend test plan complete.`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                fs.writeFileSync(PROJECT_PATH + '\\testsprite_tests\\test_plan_result.json', JSON.stringify(msg, null, 2));
                console.log('Result:', text.substring(0, 2000));

                // Now check if testsprite_backend_test_plan.json was created
                try {
                    const plan = fs.readFileSync(PROJECT_PATH + '\\testsprite_tests\\testsprite_backend_test_plan.json', 'utf8');
                    console.log('\nTest plan file:', plan.substring(0, 1000));
                } catch(e) {
                    console.log('\nNo test plan file found at expected path');
                }

                // Execute
                console.log(`\n[${ts()}] Running generate_code_and_execute...`);
                sendMsg(40, "tools/call", {
                    name: "testsprite_generate_code_and_execute",
                    arguments: {
                        projectName: "staff-system",
                        projectPath: PROJECT_PATH,
                        testIds: [],
                        additionalInstruction: "This is the Port 3001 Staff Operations System only. Test all /portal/* and /internal/* endpoints. Use Bearer token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmEzNTJlN2QwOTkzZDY0OTU0OWI2ZCIsImlhdCI6MTc3MzgyMzE3NSwiZXhwIjoxNzc2NDE1MTc1fQ.x7RKPpJ-hvhuEuRvGY6qti2qErQzCAQRdzwObVfAua0 for authenticated endpoints. Server at http://localhost:3001.",
                        serverMode: "development"
                    }
                });
            } else if (msg.id === 40) {
                console.log(`\n[${ts()}] Execution complete!`);
                fs.writeFileSync(PROJECT_PATH + '\\testsprite_execute_result.json', JSON.stringify(msg, null, 2));
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log('Result:', text.substring(0, 2000));

                // Check for test results
                try {
                    const results = fs.readFileSync(PROJECT_PATH + '\\testsprite_tests\\tmp\\test_results.json', 'utf8');
                    console.log('\n=== TEST RESULTS ===');
                    console.log(results);
                } catch(e) {
                    console.log('\nNo test_results.json found');
                }

                proc.kill();
                process.exit(0);
            }
        } catch (e) { /* non-JSON */ }
    }
});

proc.stderr.on('data', (data) => {
    const s = data.toString().trim();
    // Show all errors this time for debugging
    if (s) {
        console.error('[STDERR]:', s.substring(0, 800));
    }
});

sendMsg(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "emerald-test-client", version: "1.0.0" }
});

setTimeout(() => {
    console.error('TIMEOUT after 10 minutes!');
    proc.kill();
    process.exit(1);
}, 600000);
