const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
const output = path.resolve(__dirname, '../.local-backups/error-screenshots');
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true });
    let reference;
    try {
        for (const device of [
            { name: 'desktop', width: 1440, dpr: 1, hz: 60 },
            { name: 'android', width: 390, dpr: 2, hz: 120, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' },
            { name: 'ios', width: 320, dpr: 3, hz: 30, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1' },
        ]) {
            const context = await browser.newContext({ viewport: { width: device.width, height: 844 }, deviceScaleFactor: device.dpr, isMobile: device.width < 800, hasTouch: device.width < 800, ...(device.userAgent ? { userAgent: device.userAgent } : {}) });
            await context.addInitScript(device => {
                localStorage.setItem('lingxun-theme', device.name === 'desktop' ? 'light' : 'dark');
                localStorage.setItem('lingxun-runner-tips-v4', '1');
                if (device.name === 'ios') Object.defineProperty(navigator, 'platform', { value: 'iPhone' });
            }, device);
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.install({ time: new Date('2026-10-31T12:00:00Z') });
            await page.goto(base + '/aa');
            await page.locator('#tavern-game summary').click();
            await page.waitForFunction(() => !document.getElementById('game-start').disabled);
            await page.clock.pauseAt(new Date('2026-10-31T12:00:05Z'));
            await page.evaluate(hz => {
                window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 1000 / hz);
                window.cancelAnimationFrame = id => clearTimeout(id);
                let seed = 2030; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
                const r = Runner.instance_, scene = r.horizon.update.bind(r.horizon);
                const trace = window.parityTrace = []; let tick = 0;
                r.horizon.update = (...args) => {
                    scene(...args);
                    if (args[0] <= 0) return;
                    tick++;
                    if ([6, 18, 80, 92].includes(tick)) document.getElementById('lingxun-runner').dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
                    const obstacle = r.horizon.obstacles.find(o => o.xPos + o.width > r.tRex.xPos);
                    if (tick > 180 && obstacle && !r.tRex.jumping && obstacle.xPos - r.tRex.xPos < r.currentSpeed * 14) document.getElementById('lingxun-runner').dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
                    if (tick % 6 === 0) trace.push({ tick, speed: r.currentSpeed, player: [r.tRex.xPos, r.tRex.yPos, r.tRex.jumpVelocity, r.tRex.jumping], obstacles: r.horizon.obstacles.map(o => [o.xPos, o.yPos, o.width, o.gap]), ground: [...r.horizon.horizonLine.xPos] });
                    if (tick === 360) document.getElementById('game-pause').click();
                };
                document.getElementById('game-start').click();
            }, device.hz);
            await page.clock.runFor(6500);
            const state = await page.evaluate(() => {
                const r = Runner.instance_, view = document.querySelector('.runner-canvas'), screen = document.querySelector('.tavern-game__screen');
                return { trace: window.parityTrace, distance: r.distanceRan, speed: r.currentSpeed, dimensions: r.dimensions, model: [r.canvas.width, r.canvas.height], view: [view.width, view.height], frame: [screen.clientWidth, screen.clientHeight], overflow: document.documentElement.scrollWidth > innerWidth + 1, playing: r.playing };
            });
            assert.equal(state.trace.length, 60);
            assert(state.trace.some(frame => frame.obstacles.length), 'parity must include real generated obstacles');
            assert.equal(state.playing, false);
            assert.equal(state.overflow, false);
            assert.deepEqual(state.dimensions, { WIDTH: 600, HEIGHT: 301 });
            assert.deepEqual(state.model, [600, 301]);
            assert.deepEqual(state.view, state.frame.map(n => Math.round(n * device.dpr)));
            const comparable = { trace: state.trace, distance: state.distance, speed: state.speed };
            if (!reference) reference = comparable;
            else assert.deepEqual(comparable, reference, 'world trajectory, obstacles and pace must match desktop exactly');
            await page.clock.resume();
            await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `parity-${device.name}.png`) });
            if (device.width < 800) {
                const button = await page.locator('#game-jump').boundingBox();
                // Hidden while paused; inspect computed dimensions instead.
                assert.equal(button, null);
                assert.deepEqual(await page.locator('#game-jump').evaluate(el => [parseFloat(getComputedStyle(el).width), parseFloat(getComputedStyle(el).height)]), [64, 56]);
                const snapshot = () => page.evaluate(() => { const r = Runner.instance_; return { distance: r.distanceRan, player: [r.tRex.xPos, r.tRex.yPos, r.tRex.groundYPos, r.tRex.jumpVelocity], obstacles: r.horizon.obstacles.map(o => [o.xPos, o.yPos, o.width]) }; });
                const before = await snapshot();
                await page.setViewportSize({ width: 844, height: 390 });
                await page.waitForTimeout(200);
                assert.deepEqual(await snapshot(), before, 'rotation cannot shift physics');
                assert.equal(await page.locator('.tavern-game__screen').getAttribute('data-game-state'), 'paused');
                await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `parity-${device.name}-landscape.png`) });
            }
            assert.deepEqual(errors, []);
            console.log('PASS exact native-engine parity, same forward world, fixed model and responsive DPR view', device.name, device.hz, state.distance);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
