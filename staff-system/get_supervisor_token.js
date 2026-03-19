const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto('http://localhost:3001/portal/auth/login');
        await page.fill('input[name="email"]', 'testsupervisor@emerald.com');
        await page.fill('input[name="password"]', 'TestSupervisor123!');
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            page.click('button[type="submit"]')
        ]);
        
        const cookies = await context.cookies();
        const portalTokenCookie = cookies.find(c => c.name === 'portal_token');
        
        if (portalTokenCookie) {
            console.log('JWT_TOKEN=' + portalTokenCookie.value);
        } else {
            console.log('NO_TOKEN_FOUND');
            console.log('Current URL:', page.url());
            console.log('Cookies:', cookies.map(c => c.name));
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await browser.close();
    }
})();
