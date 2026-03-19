const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const fs = require('fs');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'emerald_pearland_secret_key_2024';
const ADMIN_URL = 'http://localhost:3000/admin/login';
const SSO_ENDPOINT = 'http://localhost:3001/staff-admin/sso-login';

const LOG_FILE = 'sso-results.txt';
fs.writeFileSync(LOG_FILE, '');
const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
};

(async () => {
    log('🧪 Starting SSO Security and UI Flow Tests\n');
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        log('--- UI FLOW START ---');
        log('1. Navigating to admin login...');
        await page.goto(ADMIN_URL);

        log('2. Logging in...');
        await page.fill('input[type="email"]', 'emeraldpearlandevents@gmail.com');
        await page.fill('input[type="password"]', 'Bostonlegal96');
        await page.click('button[type="submit"]');

        log('3. Waiting for dashboard to load...');
        await page.waitForURL('**/admin/dashboard');

        log('4. Clicking "Staff Operations"...');
        await Promise.all([
            page.waitForNavigation(),
            page.click('text="Staff Operations"')
        ]);

        log(`5. Confirm redirect. Current URL: ${page.url()}`);
        if (!page.url().includes('3001')) {
            log('❌ Redirect url does not contain 3001');
        } else {
            log('✅ Redirect to 3001 confirmed');
        }

        log('6. Checking cookies for 3001 domain...');
        const cookies = await context.cookies();
        const staffCookies = cookies.filter(c => c.domain === 'localhost' || c.domain === '127.0.0.1');

        let portalTokenFound = false;
        let otherTokensFound = false;
        log('   Cookies found:');
        for (const cookie of staffCookies) {
            log(`     - ${cookie.name}`);
            if (cookie.name === 'portal_token') portalTokenFound = true;
            else if (cookie.name !== 'connect.sid') otherTokensFound = true;
        }

        if (portalTokenFound) log('✅ `portal_token` is set');
        else log('❌ `portal_token` is NOT set');

        log('--- UI FLOW COMPLETE ---\n');

        log('--- MANUAL SECURITY TESTS START ---');
        log('7. Testing Expired SSO token...');
        const expiredToken = jwt.sign(
            { id: '12345', email: 'emeraldpearlandevents@gmail.com', type: 'staff-ops-sso' },
            JWT_SECRET,
            { expiresIn: '-1h' }
        );
        await page.goto(`${SSO_ENDPOINT}?token=${expiredToken}`);
        const expiredUrl = page.url();
        log(`   Redirected to: ${expiredUrl}`);
        if (expiredUrl.includes('error=')) {
            log('✅ Token expired check PASSED');
        } else {
            log('❌ Token expired check FAILED');
        }

        log('8. Testing No Type SSO token...');
        const noTypeToken = jwt.sign(
            { id: '12345', email: 'emeraldpearlandevents@gmail.com' },
            JWT_SECRET,
            { expiresIn: '5m' }
        );
        await page.goto(`${SSO_ENDPOINT}?token=${noTypeToken}`);
        const noTypeUrl = page.url();
        log(`   Redirected to: ${noTypeUrl}`);
        if (noTypeUrl.includes('error=')) {
            log('✅ Missing type check PASSED');
        } else {
            log('❌ Missing type check FAILED');
        }

        log('9. Testing Altered Email SSO token...');
        const alteredEmailToken = jwt.sign(
            { id: '12345', email: 'attacker@gmail.com', type: 'staff-ops-sso' },
            JWT_SECRET,
            { expiresIn: '5m' }
        );
        await page.goto(`${SSO_ENDPOINT}?token=${alteredEmailToken}`);
        const alteredUrl = page.url();
        log(`   Redirected to: ${alteredUrl}`);
        if (alteredUrl.includes('error=')) {
            log('✅ Altered email check PASSED');
        } else {
            log('❌ Altered email check FAILED');
        }

        log('\n✅ All tests complete.');
    } catch (err) {
        log('Execution Error: ' + err.message);
    } finally {
        if (browser) await browser.close();
    }
})();
