const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto('http://localhost:3001/portal/auth/login');
        await page.fill('input[name="email"]', 'teststaff@emerald.com');
        await page.fill('input[name="password"]', 'TestStaff123!');
        
        await Promise.all([
            page.waitForURL('**/portal/auth/change-password'), // it redirects here on first login
            page.click('button[type="submit"]')
        ]);
        
        const cookies = await context.cookies();
        const portalTokenCookie = cookies.find(c => c.name === 'portal_token');
        
        if (portalTokenCookie) {
            console.log('JWT_TOKEN=' + portalTokenCookie.value);
        } else {
            console.log('Failed to find portal_token cookie.');
            console.log(cookies.map(c => c.name)); // show what cookies we got
        }
    } catch (error) {
        console.error('Playwright Error:', error);
    } finally {
        await browser.close();
    }
})();
