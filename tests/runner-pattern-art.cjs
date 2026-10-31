const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
const output = path.resolve(__dirname, '../.local-backups/error-screenshots');
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [width, theme] of [[390, 'dark'], [1440, 'light']]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 800 });
            await context.addInitScript(theme => { localStorage.setItem('lingxun-theme', theme); localStorage.setItem('lingxun-runner-tips-v4', '1'); }, theme);
            const page = await context.newPage();
            await page.clock.install({ time: new Date('2026-10-31T12:00:00Z') });
            await page.goto(base + '/aa'); await page.locator('#tavern-game summary').click();
            await page.waitForFunction(() => !document.getElementById('game-start').disabled);
            await page.clock.pauseAt(new Date('2026-10-31T12:00:05Z'));
            await page.evaluate(() => document.getElementById('game-start').click());
            await page.clock.runFor(3500);
            for (const file of ['runnerDifficulty.mjs', 'runnerObstacles.mjs']) {
                const source = fs.readFileSync(path.resolve(__dirname, '../src/lib', file), 'utf8').replace(/^import[^\n]*\n/gm, '').replaceAll(/export const (\w+)/g, 'window.$1').replaceAll(/export function (\w+)/g, 'window.$1 = function');
                await page.addScriptTag({ content: source });
            }
            await page.clock.resume();
            for (const kind of ['high', 'long', 'pair']) {
                // Controlled geometry fixture; the drawing function is the actual site adapter.
                await page.evaluate(kind => {
                    const r = Runner.instance_; r.stop();
                    r.horizon.addNewObstacle = () => {};
                    const obstacle = r.horizon.obstacles[0];
                    configureObstacle(obstacle, kind, r.currentSpeed, r.tRex.groundYPos);
                    obstacle.xPos = r.dimensions.WIDTH - obstacle.width - 12;
                    obstacle.remove = false; obstacle.followingObstacleCreated = true;
                    r.horizon.obstacles = [obstacle]; r.tRex.yPos = r.tRex.groundYPos;
                    r.clearCanvas(); r.horizon.update(0, 0, true); r.tRex.draw();
                    document.documentElement.setAttribute('data-theme', document.documentElement.dataset.theme);
                }, kind);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `art-${width}-${theme}-${kind}.png`) });
            }
            console.log('PASS controlled artwork: high / long / pair', width, theme);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
