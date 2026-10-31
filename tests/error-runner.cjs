const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
const output = path.resolve(__dirname, '../.local-backups/error-screenshots');
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    try {
        for (const width of [320, 390, 768, 1440]) {
            for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 800, reducedMotion: width === 768 ? 'reduce' : 'no-preference' });
                await context.addInitScript(value => localStorage.setItem('lingxun-theme', value), theme);
                const page = await context.newPage(), errors = [], requests = [];
                page.on('pageerror', error => errors.push(error.message));
                page.on('request', request => requests.push(request.url()));
                const response = await page.goto(base + '/aa', { waitUntil: 'networkidle' });
                assert.equal(response.status(), 404);
                assert.equal(await page.locator('h1').textContent(), '走错门了？');
                assert(!requests.some(url => url.includes('/vendor/t-rex-runner/')), 'game must be lazy');
                assert(await page.locator('.lost-page__image img').evaluate(img => img.complete && img.naturalWidth > 0));
                await page.screenshot({ path: path.join(output, `error-${width}-${theme}.png`), fullPage: true });
                await page.locator('#tavern-game summary').click();
                await page.locator('#game-start').waitFor({ state: 'visible' });
                await page.waitForFunction(() => !document.getElementById('game-start').disabled);
                await page.waitForFunction(() => window.Runner?.instance_?.canvas);
                await page.evaluate(() => {
                    window.spriteDraws = {};
                    const ctx = Runner.instance_.canvasCtx, draw = ctx.drawImage.bind(ctx);
                    ctx.drawImage = (image, ...args) => {
                        if (image.src) window.spriteDraws[image.src.split('/').pop()] = (window.spriteDraws[image.src.split('/').pop()] || 0) + 1;
                        return draw(image, ...args);
                    };
                });
                const fixedFrame = await page.locator('.tavern-game__screen').boundingBox();
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'overflow');
                await page.waitForFunction(() => document.fonts.check('24px "Tavern Pixel"'));
                await page.locator('#game-start').click();
                await page.locator('#game-tips').waitFor({ state: 'visible' });
                assert(Math.abs((await page.locator('.tavern-game__screen').boundingBox()).height - fixedFrame.height) < .5, 'tips frame is stable');
                assert.equal(await page.locator('#tip-count').textContent(), '1 / 3');
                await page.locator('#tip-next').click();
                assert.equal(await page.locator('#tip-count').textContent(), '2 / 3');
                await page.locator('#tip-next').click();
                assert.equal(await page.locator('#tip-count').textContent(), '3 / 3');
                await page.locator('#tip-next').click();
                await page.waitForTimeout(250);
                assert(Math.abs((await page.locator('.tavern-game__screen').boundingBox()).height - fixedFrame.height) < .5, 'game frame is stable');
                assert(await page.evaluate(() => Runner.instance_.playing));
                await page.locator('#lingxun-runner').press('Space');
                assert(await page.evaluate(() => Runner.instance_.tRex.jumping), 'keyboard jump');
                await page.locator('#lingxun-runner').press('Space');
                await page.waitForFunction(() => document.getElementById('game-jump-count').textContent === '•');
                await page.waitForFunction(() => window.spriteDraws['whirlwind-zwonky.png'] > 0 && window.spriteDraws['gust-uriew.gif'] > 0);
                await page.waitForTimeout(550);
                await page.locator('#game-pause').click();
                assert(!await page.evaluate(() => Runner.instance_.playing), 'pause');
                const stopped = await page.locator('#game-score').textContent();
                await page.waitForTimeout(250);
                assert.equal(await page.locator('#game-score').textContent(), stopped);
                await page.locator('#game-start').click();
                const bounds = await page.locator('#game-jump').boundingBox();
                assert(bounds.height >= 44);
                if (width < 800) await page.locator('#game-jump').tap();
                else await page.locator('#game-jump').click();
                assert(await page.evaluate(() => Runner.instance_.tRex.jumping), 'button jump');
                await page.waitForTimeout(600);
                assert.equal(await page.locator('#game-duck').count(), 0, 'duck removed');
                await page.locator('#game-pause').click();
                const pixels = await page.locator('.runner-canvas').evaluate(canvas => {
                    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                    const colors = new Set();
                    for (let i = 0; i < data.length; i += 4) if (data[i + 3]) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
                    return colors.size;
                });
                assert(pixels > 12, 'canvas scene must be nonblank');
                assert(await page.evaluate(() => Math.abs(document.querySelector('.runner-canvas').getBoundingClientRect().width - document.querySelector('.tavern-game__screen').clientWidth) < 2), 'canvas fills right edge');
                await page.screenshot({ path: path.join(output, `game-${width}-${theme}.png`), fullPage: true });
                await page.locator('#game-start').click();
                await page.locator('#tavern-game summary').click();
                assert(!await page.evaluate(() => Runner.instance_.playing), 'collapse must pause');
                await page.locator('#tavern-game summary').click();
                assert(!await page.evaluate(() => Runner.instance_.playing), 'reopen must not autoplay');
                await page.locator('#game-start').click();
                await page.waitForFunction(() => Runner.instance_.crashed || !Runner.instance_.playing, null, { timeout: 20000 });
                assert(await page.evaluate(() => Runner.instance_.crashed), await page.locator('#game-status').textContent());
                assert((await page.locator('#game-status').textContent()).includes('撞到了'));
                await page.locator('#game-start').click();
                assert(await page.evaluate(() => Runner.instance_.playing && !Runner.instance_.crashed), 'retry');
                await page.evaluate(() => window.dispatchEvent(new Event('blur')));
                assert(!await page.evaluate(() => Runner.instance_.playing), 'background pause');
                if (await page.locator('#mobile-menu-btn').isVisible()) {
                    await page.locator('#mobile-menu-btn').click();
                    assert.equal(await page.locator('#mobile-theme-toggle').evaluate(el => getComputedStyle(el).borderRadius), '16px');
                    await page.locator('#mobile-theme-toggle').click();
                } else {
                    assert.equal(await page.locator('#theme-toggle').evaluate(el => getComputedStyle(el).borderRadius), '16px');
                    await page.locator('#theme-toggle').click();
                }
                for (const selector of ['#game-start', '#game-pause', '#game-jump', '#game-help', '#tip-next', '.lost-page__actions .button']) {
                    assert.equal(await page.locator(selector).first().evaluate(el => getComputedStyle(el).borderRadius), '16px', `${selector} must reuse the control radius`);
                }
                assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme === 'light' ? 'dark' : 'light');
                assert.deepEqual(errors, []);
                console.log('PASS', width, theme, '404 + lazy game + keyboard/touch + pause/collapse/crash/retry + pixels', pixels);
                await context.close();
            }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
