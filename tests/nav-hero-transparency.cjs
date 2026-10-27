const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const ready = page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-site-content-pending') && !document.querySelector('[data-public-pending]'));
const transparent = async (page, expected) => {
    await page.waitForTimeout(260);
    const result = await page.locator('#navbar').evaluate(item => {
        const css = getComputedStyle(item);
        return { color: css.backgroundColor, blur: css.backdropFilter, text: getComputedStyle(item.querySelector('.site-brand')).color };
    });
    assert.equal(result.color === 'rgba(0, 0, 0, 0)', expected, JSON.stringify(result));
    if (expected) { assert.equal(result.blur, 'none');assert.equal(result.text, 'rgb(241, 240, 235)'); }
};

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    try {
        for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
            const page = await context.newPage();
            await page.goto(base + '/', { referer: base + '/gallery/' });await ready(page);
            await transparent(page, true);
            await page.evaluate(() => scrollTo({ top: 180, behavior: 'instant' }));
            await page.waitForFunction(() => document.getElementById('navbar').classList.contains('is-scrolled'));
            await transparent(page, false);
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
            await transparent(page, true);
            if (width === 390) {
                await page.locator('#mobile-menu-btn').click();await transparent(page, false);
                await page.locator('#mobile-contact-btn').click();
                assert(await page.locator('#mobile-contact-menu a').count() >= 6);
                await page.locator('#mobile-menu-btn').click();await transparent(page, true);
                await page.locator('#mobile-menu-btn').click();await page.locator('#mobile-theme-toggle').click();await page.locator('#mobile-menu-btn').click();
            } else {
                await page.locator('#contact-menu-btn').click();await transparent(page, false);
                await page.keyboard.press('Escape');await transparent(page, true);
                await page.locator('#theme-toggle').click();
            }
            await transparent(page, true);
            await page.goto(base + '/gallery/', { referer: base + '/' });await ready(page);await transparent(page, false);
            await context.close();
        }
        const context = await browser.newContext({ javaScriptEnabled: false });
        const page = await context.newPage();await page.goto(base + '/');await transparent(page, true);await context.close();
        console.log('PASS both themes desktop/mobile transparent hero-top, themed scroll/menu mask, transparent return and theme switching, opaque subpages and pre-script/no-JS first paint.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
