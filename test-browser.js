const { chromium } = require('playwright');
require('dotenv').config();

async function test() {
    console.log('Testing Playwright launch...');
    console.log('Profile Path:', process.env.CHROME_USER_DATA_DIR);
    
    try {
        const browser = await chromium.launchPersistentContext(process.env.CHROME_USER_DATA_DIR, {
            headless: false,
            args: [`--profile-directory=${process.env.CHROME_PROFILE}`],
        });
        console.log('Browser launched successfully!');
        const page = await browser.newPage();
        await page.goto('https://www.google.com');
        console.log('Navigation successful!');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await browser.close();
    } catch (err) {
        console.error('LAUNCH ERROR:', err);
    }
}

test();
