const { spawn } = require('child_process');
const fs = require('fs');

const SUPERVISOR_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmEzNTJlN2QwOTkzZDY0OTU0OWI2ZCIsImlhdCI6MTc3MzgyMzE3NSwiZXhwIjoxNzc2NDE1MTc1fQ.x7RKPpJ-hvhuEuRvGY6qti2qErQzCAQRdzwObVfAua0';

const ADDITIONAL_INSTRUCTION = `This is the Port 3001 Staff Operations System only. Test only these endpoint groups:

1. Staff Authentication: POST /portal/auth/login, POST /portal/auth/logout, GET /portal/auth/me

2. Supervisor Clock-In: POST /portal/supervisor/anchor/drop, POST /portal/supervisor/anchor/clear, GET /portal/supervisor/events/:eventId/team, POST /portal/supervisor/clock-in/override, POST /portal/supervisor/events/:eventId/complete

3. Staff Clock-In: POST /portal/staff/clock-in, POST /portal/staff/clock-out, GET /portal/staff/attendance/:eventId

4. Emergency Funds: POST /portal/admin-staff/auth/biometric-verify, POST /portal/admin-staff/emergency-funds/request-otp, POST /portal/admin-staff/emergency-funds/send, POST /portal/admin-staff/emergency-funds/unlock-payout

5. AI Prediction: GET /portal/admin-staff/events/:id/prediction

6. Command Center: GET /portal/supervisor/command-center/:eventId, GET /portal/supervisor/command-center/:eventId/data

7. Performance Reviews: GET /portal/supervisor/events/:eventId/reviews/pending, POST /portal/supervisor/events/:eventId/reviews/submit

8. ETR: GET /portal/admin-staff/etr, POST /portal/admin-staff/etr/:eventId/generate, POST /portal/admin-staff/etr/:eventId/resend

9. Finance: GET /portal/admin-staff/events/:id/financials, POST /portal/admin-staff/expenses/log, GET /portal/admin-staff/payroll

Do not test any port 3000 routes. Do not test /api/book-event, /api/gallery, or /api/admin routes. Those belong to a different server.

Use testadmin@emerald.com with password TestAdmin123! for admin-level endpoint tests.
Use testsupervisor@emerald.com with password TestSupervisor123! for supervisor endpoint tests.
Use teststaff@emerald.com with password TestStaff123! for staff endpoint tests.

AUTHENTICATION: For all authenticated endpoints, use Bearer token: ${SUPERVISOR_TOKEN} in the Authorization header or as portal_token cookie. The server runs on port 3001 at http://localhost:3001.`;

const PROJECT_PATH = 'c:\\My Web Sites\\school\\live.themewild.com\\emerald\\staff-system';

const proc = spawn('npx', ['-y', '@testsprite/testsprite-mcp@latest'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
});

let buffer = '';
let stepsDone = [];

function sendMsg(id, method, params) {
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    proc.stdin.write(msg + '\n');
}

function logStep(step, msg) {
    const ts = new Date().toISOString().substring(11, 19);
    console.log(`[${ts}] [${step}] ${msg}`);
}

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

                logStep('STEP 1/5', 'Calling testsprite_bootstrap...');
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
                logStep('STEP 1/5', 'Bootstrap complete ✓');
                stepsDone.push('bootstrap');

                logStep('STEP 2/5', 'Calling testsprite_generate_code_summary...');
                sendMsg(20, "tools/call", {
                    name: "testsprite_generate_code_summary",
                    arguments: { projectRootPath: PROJECT_PATH }
                });
            } else if (msg.id === 20) {
                logStep('STEP 2/5', 'Code summary complete ✓');
                stepsDone.push('code_summary');

                logStep('STEP 3/5', 'Calling testsprite_generate_standardized_prd...');
                sendMsg(25, "tools/call", {
                    name: "testsprite_generate_standardized_prd",
                    arguments: { projectPath: PROJECT_PATH }
                });
            } else if (msg.id === 25) {
                logStep('STEP 3/5', 'Standardized PRD complete ✓');
                stepsDone.push('standardized_prd');
                const text = msg.result?.content?.[0]?.text || '';
                logStep('STEP 3/5', 'PRD preview: ' + text.substring(0, 300));

                logStep('STEP 4/5', 'Calling testsprite_generate_backend_test_plan...');
                sendMsg(30, "tools/call", {
                    name: "testsprite_generate_backend_test_plan",
                    arguments: { projectPath: PROJECT_PATH }
                });
            } else if (msg.id === 30) {
                logStep('STEP 4/5', 'Backend test plan complete ✓');
                stepsDone.push('test_plan');
                const text = msg.result?.content?.[0]?.text || '';
                logStep('STEP 4/5', 'Plan preview: ' + text.substring(0, 500));

                logStep('STEP 5/5', 'Calling testsprite_generate_code_and_execute...');
                sendMsg(40, "tools/call", {
                    name: "testsprite_generate_code_and_execute",
                    arguments: {
                        projectName: "staff-system",
                        projectPath: PROJECT_PATH,
                        testIds: [],
                        additionalInstruction: ADDITIONAL_INSTRUCTION,
                        serverMode: "development"
                    }
                });
            } else if (msg.id === 40) {
                logStep('STEP 5/5', 'Test execution complete ✓');
                stepsDone.push('execute');
                fs.writeFileSync(PROJECT_PATH + '\\testsprite_execute_result.json', JSON.stringify(msg, null, 2));
                const text = msg.result?.content?.[0]?.text || JSON.stringify(msg.result);
                logStep('DONE', 'All steps: ' + stepsDone.join(' → '));
                logStep('DONE', 'Execute result saved to testsprite_execute_result.json');
                proc.kill();
                process.exit(0);
            }
        } catch (e) { /* non-JSON line */ }
    }
});

proc.stderr.on('data', (data) => {
    const s = data.toString().trim();
    if (s && !s.includes('AUTH_FAILED') && !s.includes('Failed to post log batch')) {
        console.error('[STDERR]:', s.substring(0, 500));
    }
});

sendMsg(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "emerald-test-client", version: "1.0.0" }
});

// 10-minute timeout
setTimeout(() => {
    console.error('TIMEOUT after 10 minutes!');
    console.log('Steps completed so far:', stepsDone.join(' → '));
    proc.kill();
    process.exit(1);
}, 600000);
