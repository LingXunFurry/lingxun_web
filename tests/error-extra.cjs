const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const [code, route] of [[403, '/403/'], [500, '/500.html'], [503, '/503/']]) {
            await page.goto(base + route, { waitUntil: 'networkidle' });
            assert.equal(await page.locator('main').getAttribute('data-error-code'), String(code));
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            assert(await page.locator('.lost-page__image img').evaluate(img => img.complete && img.naturalWidth > 0));
        }
        await page.addInitScript(() => { localStorage.setItem('lingxun-runner-tips-v4', '1'); localStorage.setItem('lingxun-theme', 'dark'); });
        await page.goto(base + '/aa', { waitUntil: 'networkidle' });
        await page.locator('#tavern-game summary').click();
        await page.waitForFunction(() => !document.getElementById('game-start').disabled);
        await page.locator('#game-start').click();
        await page.locator('#game-jump').tap();
        await page.locator('#game-jump').tap();
        await page.waitForFunction(() => document.getElementById('game-jump-count').textContent === '•');
        await page.locator('.tavern-game__screen').screenshot({ path: path.resolve(__dirname, '../.local-backups/error-screenshots/mobile-wind.png') });
        await page.locator('#game-pause').click();
        await page.locator('#game-help').click();
        assert(await page.locator('#game-tips').isVisible());
        await page.locator('#tip-next').click();
        await page.locator('#tip-next').click();
        await page.locator('.tavern-game__screen').screenshot({ path: path.resolve(__dirname, '../.local-backups/error-screenshots/mobile-tips.png') });
        await page.locator('#tip-skip').click();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const timing = await page.evaluate(() => new Promise(resolve => {
            const frames = []; let previous = performance.now();
            function sample(now) {
                frames.push(now - previous); previous = now;
                if (frames.length < 90) requestAnimationFrame(sample);
                else {
                    const sorted = frames.slice(5).sort((a, b) => a - b);
                    resolve({ averageMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length, p95Ms: sorted[Math.floor(sorted.length * .95)] });
                }
            }
            requestAnimationFrame(sample);
        }));
        console.log('390px, 4x CPU slowdown frame timing:', JSON.stringify(timing));
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        if (!await page.evaluate(() => Runner.instance_.playing)) await page.locator('#game-start').click();
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(400);
        assert.equal(await page.locator('.tavern-game__screen').getAttribute('data-game-state'), 'paused');
        await page.locator('#game-start').click();
        assert(await page.evaluate(() => Runner.instance_.playing));
        assert.deepEqual(errors, []);
        console.log('PASS 403/500/503 mobile, saved Tips, help replay, pixel wind, orientation resize/resume');
        await context.close();
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
