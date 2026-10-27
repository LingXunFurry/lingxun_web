const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const ready = page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-site-content-pending') && !document.querySelector('[data-public-pending]'));

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    let cases = 0;
    try {
        for (const width of [1440, 768, 390, 360]) for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
            const page = await context.newPage(), errors = [], removedRequests = [], compositions = new Set();
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => { if (request.url().includes('/vendor/game-icons/')) removedRequests.push(request.url()); });
            for (const [route, detail] of [['/gallery/', '.scene-ornament__photo'], ['/posts/', '.scene-ornament__notice'], ['/friends/', '.scene-ornament__calling-card']]) {
                await page.goto(base + route, { referer: base + '/', waitUntil: 'domcontentloaded' });await ready(page);
                assert(await page.locator(detail).count() > 0);
                assert.equal(await page.locator('.scene-ornament__object,.art-credits').count(), 0);
                compositions.add(await page.locator('.scene-ornament__wind-lines').evaluate(item => {
                    const style = getComputedStyle(item);return `${style.maskPosition}|${style.clipPath}`;
                }));
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                cases++;
            }
            assert.equal(compositions.size, 3, 'Different flow composition per page');
            await page.goto(base + '/', { referer: base + '/posts/', waitUntil: 'domcontentloaded' });await ready(page);
            assert.equal(await page.locator('.hero-section .scene-ornament').count(), 0);
            assert.equal(await page.locator('.home-feed-section .scene-ornament__wind-lines').evaluate(item => getComputedStyle(item).display), 'none');
            assert.equal(await page.locator('.home-feed-section .scene-ornament__notice').count(), 1);
            assert.equal(await page.locator('.home-feed-section .scene-ornament__seal').count(), 1);
            assert.equal(await page.locator('.final-section .scene-ornament__wind-lines').evaluate(item => getComputedStyle(item).display), 'none');
            if (width <= 760) assert.equal(await page.locator('.final-section .scene-ornament__map-fold').evaluate(item => getComputedStyle(item).display), 'none');
            else assert((await page.locator('.final-section').evaluate(item => getComputedStyle(item, '::before').clipPath)).includes('51%'));
            assert((await page.locator('#contact-menu-btn').innerText()).includes('联系凌巽'));
            assert.equal(await page.locator('.scene-ornament__object,.art-credits').count(), 0);
            assert.deepEqual(errors, []);assert.deepEqual(removedRequests, []);
            await context.close();cases++;
        }
        assert(!fs.existsSync(path.resolve(__dirname, '../public/vendor/game-icons/manifest.json')));
        console.log(`PASS ${cases} responsive light/dark page-art cases: individual flow/paper compositions, no third-party objects/credits/requests, clear first scene, quiet home-notes flow and contact background.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
