const { spawn } = require('child_process');
const fs = require('fs');

const PROJECT_PATH = 'c:\\My Web Sites\\school\\live.themewild.com\\emerald\\staff-system';
const API_KEY = 'sk-user-RX32xCdYtO9gTAHK9u6nX1bRJ7wiEHXvKoBRXj2l3HsNvAyB39q7pm07plHH5oqUO64l5y3Vsaijskx9ydNLwybm_gjF20z79vn98S303H_9tkupAFCZFolCAaLdOJMlr3E';

const proc = spawn('npx', ['-y', '@testsprite/testsprite-mcp@latest'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TESTSPRITE_API_KEY: API_KEY }
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

                console.log(`[${ts()}] Checking account info with explicitly set TESTSPRITE_API_KEY...`);
                sendMsg(5, "tools/call", {
                    name: "testsprite_check_account_info",
                    arguments: {}
                });
            } else if (msg.id === 5) {
                console.log(`[${ts()}] Account info result:`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log(text.substring(0, 1000));

                console.log(`\n[${ts()}] Running backend test plan...`);
                sendMsg(30, "tools/call", {
                    name: "testsprite_generate_backend_test_plan",
                    arguments: { projectPath: PROJECT_PATH }
                });
            } else if (msg.id === 30) {
                console.log(`[${ts()}] Backend test plan complete.`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log('Result:', text.substring(0, 2000));
                
                fs.writeFileSync(PROJECT_PATH + '\\testsprite_tests\\testsprite_backend_test_plan.json', JSON.stringify({ raw_result: text }, null, 2));

                console.log(`\n[${ts()}] Running generate_code_and_execute...`);
                sendMsg(40, "tools/call", {
                    name: "testsprite_generate_code_and_execute",
                    arguments: {
                        projectName: "staff-system",
                        projectPath: PROJECT_PATH,
                        testIds: [],
                        additionalInstruction: "This is the Port 3001 Staff Operations System only. Test all /portal/* and /internal/* endpoints.",
                        serverMode: "development"
                    }
                });
            } else if (msg.id === 40) {
                console.log(`\n[${ts()}] Execution complete!`);
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                console.log('Result:', text.substring(0, 2000));
                proc.kill();
                process.exit(0);
            }
        } catch (e) { /* non-JSON */ }
    }
});

proc.stderr.on('data', (data) => {
    const s = data.toString().trim();
    if (s && !s.includes('AUTH_FAILED') && !s.includes('Failed to post log batch')) {
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
