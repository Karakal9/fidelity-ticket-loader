const { chromium } = require('playwright');
require('dotenv').config();

// Keep a global reference to the browser context to stay logged in
let browserContext = null;

/**
 * Hardened helper to fill Fidelity's custom pvd-ett-input components.
 * It mimics human behavior by clicking, typing, and tabbing away to trigger validation.
 */
async function fidelityFill(locator, value) {
    if (value === undefined || value === null) return;
    console.log(`Filling field with: ${value}`);
    await locator.click({ force: true });
    await locator.evaluate(el => {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await locator.type(value.toString(), { delay: 50 });
    await locator.press('Tab'); // CRITICAL: Unlocks subsequent fields
    await locator.page().waitForTimeout(500);
}

async function getBrowserContext() {
    // If context exists and is connected, return it
    if (browserContext) {
        try {
            await browserContext.browser().version();
            return browserContext;
        } catch (e) {
            console.log('Browser context lost, connecting to existing...');
            browserContext = null;
        }
    }

    console.log('Connecting to existing browser on port 9222...');
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        browserContext = browser.contexts()[0];
        
        if (!browserContext) {
            browserContext = await browser.newContext();
        }
        
        return browserContext;
    } catch (err) {
        throw new Error('Failed to connect to Chrome. Ensure it is running with --remote-debugging-port=9222. Error: ' + err.message);
    }
}

async function runTradeAutomation(setup) {
    const { ticker, quantity, price, orderType, limitPrice, target, stopLoss } = setup;

    const context = await getBrowserContext();
    const pages = context.pages();

    // Find an existing Fidelity tab or use the first available one
    let page = pages.find(p => p.url().includes('fidelity.com'));

    if (page) {
        console.log(`Using existing Fidelity tab: ${page.url()}`);
        await page.bringToFront();
    } else {
        console.log('No Fidelity tab found. Opening a new one...');
        page = await context.newPage();
    }

    try {
        const tradeUrl = 'https://digital.fidelity.com/ftgw/digital/trade-equity/index/orderEntry';

        // Only navigate if we aren't already on the trade page
        if (!page.url().includes('trade-equity')) {
            await page.goto(tradeUrl, { waitUntil: 'domcontentloaded' });
        }

        // If we are on the login page, wait for the user to log in
        if (page.url().includes('signin')) {
            console.log('Login required. Waiting for user to sign in...');
            await page.waitForURL(url => !url.href.includes('signin'), { timeout: 0 });
            await page.waitForTimeout(2000); // Let it settle
        }

        console.log(`Starting trade for ${ticker}...`);

        // --- Select Account ---
        await page.waitForSelector('#to-account-select', { timeout: 15000 });
        await page.locator('#to-account-select').click();
        await page.waitForTimeout(800);
        await page.getByText('Individual', { exact: false }).first().click();
        await page.waitForTimeout(800);

        // --- Enter Symbol ---
        const symbolInput = page.locator('#eq-ticket__symbol-search-input');
        await symbolInput.click();
        await page.keyboard.press('Meta+A');
        await page.keyboard.press('Backspace');
        
        await symbolInput.type(ticker, { delay: 100 });
        await page.waitForTimeout(1500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');

        // Wait for quote to load
        await page.waitForSelector('#quote-panel', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // --- STEP 1: Select Action ---
        console.log('Selecting Action: Buy');
        const actionDropdown = page.locator('.eq-ticket-action-label');
        await actionDropdown.click({ force: true });
        await page.waitForTimeout(500);
        await page.getByRole('option', { name: 'Buy', exact: true }).click();
        await page.waitForTimeout(500);

        // --- STEP 2: Enter Quantity (Top Level) ---
        await fidelityFill(page.locator('input[aria-label="share-quantity"]').first(), quantity);

        // --- STEP 3: Switch to Conditional (OTOCO) ---
        console.log('Switching to Conditional (OTOCO) order type...');
        await page.locator('#dest-dropdownlist-button-ordertype').click();
        await page.waitForTimeout(800);
        await page.getByRole('option', { name: 'Conditional', exact: true }).click();
        await page.waitForTimeout(1500);

        // Select "OTOCO"
        const condTypeBtn = page.locator('#dest-dropdownlist-button-conditionaltype');
        await condTypeBtn.click({ force: true });
        await page.waitForTimeout(1000);
        
        try {
            await page.locator('#Conditional-type3').click({ force: true, timeout: 2000 });
        } catch (e) {
            await page.locator('span, div').filter({ hasText: 'One triggers a one cancels the other (OTOCO)' }).first().click({ force: true });
        }
        
        console.log('Waiting for OTOCO interface to render...');
        await page.waitForTimeout(2000);

        // Helper to map order types to Fidelity's internal values
        const getOrderTypeValue = (type) => {
            if (type === 'Stop Limit') return 'SL';
            if (type === 'Limit') return 'L';
            if (type === 'Stop Loss') return 'S';
            return 'M';
        };

        // --- STEP 4: Configure the Orders (A, B, C) ---
        
        // Order A (Entry)
        console.log(`Configuring Order A (Entry): ${orderType}`);
        const orderA = page.locator('.conditional-trade-order').nth(0);
        
        await orderA.locator('select[aria-label="order-type"]').selectOption(getOrderTypeValue(orderType));
        await page.waitForTimeout(1500); 
        
        await fidelityFill(orderA.locator('input[aria-label="share-quantity"]'), quantity);
        
        if (orderType === 'Stop Limit') {
            await fidelityFill(orderA.locator('input[aria-label="stop-price"]'), price);
            await fidelityFill(orderA.locator('input[aria-label="limit-price"]'), limitPrice);
        } else {
            await fidelityFill(orderA.locator('input[aria-label="limit-price"]'), price);
        }

        // Order B (Take Profit)
        if (target) {
            console.log(`Configuring Order B (Target): Limit at $${target}`);
            const orderB = page.locator('.conditional-trade-order').nth(1);
            
            await orderB.locator('select[aria-label="order-type"]').selectOption('L');
            await page.waitForTimeout(1000);
            
            await fidelityFill(orderB.locator('input[aria-label="share-quantity"]'), quantity);
            await fidelityFill(orderB.locator('input[aria-label="limit-price"]'), target);
            await orderB.locator('select[aria-label="time-in-force"]').selectOption('G'); // GTC
        }

        // Order C (Stop Loss)
        if (stopLoss) {
            console.log(`Configuring Order C (Stop Loss): Stop Loss at $${stopLoss}`);
            const orderC = page.locator('.conditional-trade-order').nth(2);
            
            await orderC.locator('select[aria-label="order-type"]').selectOption('S');
            await page.waitForTimeout(1000);
            
            await fidelityFill(orderC.locator('input[aria-label="share-quantity"]'), quantity);
            await fidelityFill(orderC.locator('input[aria-label="stop-price"]'), stopLoss);
            await orderC.locator('select[aria-label="time-in-force"]').selectOption('G'); // GTC
        }

        console.log('Automation complete. Please review and submit.');

    } catch (error) {
        console.error('Automation failed:', error);
        throw error;
    }
}

module.exports = { runTradeAutomation };
