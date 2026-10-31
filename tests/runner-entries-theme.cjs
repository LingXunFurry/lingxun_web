const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
const output = path.resolve(__dirname, '../.local-backups/error-screenshots');
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [390, 1440]) for (const route of ['/aa', '/']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 800 });
            await context.addInitScript(() => { localStorage.setItem('lingxun-theme', 'light'); localStorage.setItem('lingxun-runner-tips-v4', '1'); });
            const page = await context.newPage(), errors = [], requests = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', request => requests.push(request.url()));
            await page.goto(base + route, { waitUntil: 'networkidle' });
            if (route === '/') {
                for (let click = 0; click < 3; click++) await page.locator('#entry-trigger').click();
                await page.waitForFunction(() => document.getElementById('egg-dashboard').classList.contains('is-ready'));
                assert(await page.locator('#easter-egg-section .egg-game #tavern-game').count() === 1);
                assert(await page.evaluate(() => document.querySelector('.egg-game').compareDocumentPosition(document.querySelector('.egg-grid')) & Node.DOCUMENT_POSITION_PRECEDING));
            }
            assert.equal(await page.locator('#tavern-game').count(), 1);
            assert(!requests.some(url => url.includes('/vendor/t-rex-runner/')), 'closed game must not load its engine');
            assert(!await page.locator('#tavern-game').evaluate(el => el.open));
            await page.locator('#tavern-game summary').click();
            await page.waitForFunction(() => !document.getElementById('game-start').disabled);
            assert(!await page.evaluate(() => Runner.instance_.playing), 'expansion must not auto-play');
            await page.locator('#game-start').click();
            await page.waitForFunction(() => {
                const r = Runner.instance_;
                return r.horizon.obstacles.some(o => o.xPos > r.tRex.xPos + 100 && o.xPos + o.width < r.dimensions.WIDTH);
            });
            await page.locator('#game-pause').click();
            const snapshot = () => page.evaluate(() => {
                const r = Runner.instance_;
                return { distance: r.distanceRan, time: r.time, runningTime: r.runningTime, horizonTime: r.horizon.runningTime, ground: [...r.horizon.horizonLine.xPos], player: [r.tRex.yPos, r.tRex.jumpVelocity, r.tRex.jumping], obstacles: r.horizon.obstacles.map(o => [o.xPos, o.yPos, o.width, o.gap, o.remove]), score: document.getElementById('game-score').value, level: document.getElementById('game-level').value, buff: document.getElementById('game-buff').textContent, shield: document.getElementById('game-shield-time').value };
            });
            const frozen = await snapshot();
            for (const theme of ['dark', 'light']) {
                const mobile = await page.locator('#mobile-menu-btn').isVisible();
                if (mobile) await page.locator('#mobile-menu-btn').click();
                await page.locator(mobile ? '#mobile-theme-toggle' : '#theme-toggle').click();
                if (mobile) await page.locator('#mobile-menu-btn').click();
                const expected = theme === 'dark' ? [18, 24, 32] : [227, 231, 230];
                await page.waitForFunction(rgb => {
                    return [Runner.instance_.canvas, document.querySelector('.runner-canvas')].every(canvas => {
                        const pixels = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
                        return rgb.every((value, i) => pixels[i] === value);
                    });
                }, expected, { timeout: 1500 });
                assert(!await page.evaluate(() => Runner.instance_.playing));
                assert.deepEqual(await snapshot(), frozen, 'theme repaint cannot advance game state');
                assert(await page.evaluate(() => {
                    const r = Runner.instance_, o = r.horizon.obstacles[0];
                    const x = Math.max(0, Math.min(r.canvas.width - 1, Math.round(o.xPos + 5)));
                    const pixel = r.canvasCtx.getImageData(x, Math.round(o.yPos + 5), 1, 1).data;
                    return pixel[0] === 24 && pixel[1] === 38 && pixel[2] === 61;
                }), 'paused obstacles must remain visible after repaint');
                await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `theme-paused-${route === '/' ? 'egg' : '404'}-${width}-${theme}.png`) });
            }
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.locator('#game-start').click();
            assert(await page.evaluate(() => Runner.instance_.playing));
            if (route === '/') {
                await page.locator('#close-egg-button').click();
                await page.waitForFunction(() => document.getElementById('easter-egg-section').classList.contains('hidden'));
                assert(!await page.evaluate(() => Runner.instance_.playing));
                assert(!await page.locator('#tavern-game').evaluate(el => el.open), 'closing the room must pause and fold the game');
                for (let click = 0; click < 3; click++) await page.locator('#entry-trigger').click();
                await page.waitForFunction(() => document.getElementById('egg-dashboard').classList.contains('is-ready'));
                assert(!await page.locator('#tavern-game').evaluate(el => el.open));
                assert(!await page.evaluate(() => Runner.instance_.playing));
            }
            assert.deepEqual(errors, []);
            console.log('PASS lazy shared game + immediate paused theme repaint + frozen state', route, width);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
