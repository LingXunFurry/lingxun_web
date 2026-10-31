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
        const context = await browser.newContext({ viewport: { width: 1200, height: 820 } });
        const page = await context.newPage();
        await page.goto(base + '/aa');
        await page.addScriptTag({ content: fs.readFileSync(path.resolve(__dirname, '../src/lib/runnerVfx.mjs'), 'utf8').replaceAll(/export function (\w+)/g, 'window.$1 = function') });
        await page.evaluate(async () => {
            const load = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
            const [wind, gust, character, guardSource] = await Promise.all([
                load('/images/game-fx/whirlwind-zwonky.png'),
                load('/images/game-fx/gust-uriew.gif'), load('/images/loading/lingxun-run-32-v5.webp'),
                load('/images/game-fx/shield-snoopeth.png'),
            ]);
            const guard = window.paleBlueShield(guardSource);
            const data = guard.getContext('2d').getImageData(0, 0, 32, 32).data;
            const palette = new Set(['49,85,112', '102,160,199', '169,218,244', '229,248,255']);
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] && !palette.has(`${data[i]},${data[i+1]},${data[i+2]}`)) throw new Error('unexpected shield palette');
            const canvas = document.createElement('canvas'); canvas.id = 'vfx-proof'; canvas.width = 1120; canvas.height = 720;
            canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;width:1120px;height:720px'; document.body.append(canvas);
            const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
            for (let row = 0; row < 2; row++) {
                const light = row === 1, top = row * 360;
                ctx.fillStyle = light ? '#e3e7e6' : '#121820'; ctx.fillRect(0, top, 1120, 360);
                ctx.fillStyle = light ? '#18263d' : '#f1f0eb'; ctx.font = '18px sans-serif';
                ctx.fillText(`${light ? 'LIGHT' : 'DARK'}  /  SHIELD: 4 FRAMES`, 24, top + 28);
                ctx.fillText('DOUBLE JUMP: WIND AT FEET', 590, top + 28);
                for (let col = 0; col < 4; col++) {
                    const x = 50 + col * 135, y = top + 105, fx = window.createRunnerVfx({ guard, wind, gust });
                    fx.advance(col * 140); ctx.drawImage(character, 8 * 160, 0, 160, 160, x - 13, y - 24, 72, 72);
                    fx.drawShield(ctx, { xPos: x, yPos: y }, true, false, light);
                    const windFx = window.createRunnerVfx({ guard, wind, gust });
                    windFx.wind(x + 550 + 22, y + 47, 0); windFx.advance(col * 100);
                    ctx.drawImage(character, 8 * 160, 0, 160, 160, x + 550 - 13, y - 24 - col * 12, 72, 72);
                    windFx.drawWind(ctx, 0, false, light);
                }
                ctx.fillText('SHIELD BREAK', 24, top + 224);
                for (let col = 0; col < 4; col++) {
                    const x = 50 + col * 135, y = top + 290, fx = window.createRunnerVfx({ guard, wind, gust });
                    fx.breakShield(x + 22, y + 16); fx.advance(col * 80);
                    ctx.drawImage(character, 8 * 160, 0, 160, 160, x - 13, y - 24, 72, 72);
                    fx.drawShield(ctx, { xPos: x, yPos: y }, false, false, light);
                }
            }
        });
        await page.locator('#vfx-proof').screenshot({ path: path.join(output, 'vfx-frames.png') });
        await context.close();
        for (const width of [320, 390, 1440]) {
            for (const theme of ['dark', 'light']) {
                const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 800 });
                await context.addInitScript(theme => {
                    localStorage.setItem('lingxun-theme', theme); localStorage.setItem('lingxun-runner-tips-v4', '1');
                    let seed = 4129; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
                }, theme);
                const page = await context.newPage();
                await page.clock.install({ time: new Date('2026-10-30T12:00:00Z') });
                await page.goto(base + '/aa'); await page.locator('#tavern-game summary').click();
                await page.waitForFunction(() => !document.getElementById('game-start').disabled);
                await page.clock.pauseAt(new Date('2026-10-30T12:00:05Z'));
                await page.evaluate(() => document.getElementById('game-start').click());
                await page.evaluate(() => {
                    // Drive the real controls; no rewards or collision state are injected.
                    window.autoplay = setInterval(() => {
                        const r = Runner.instance_, stage = document.getElementById('lingxun-runner');
                        if (r.crashed) { document.getElementById('game-start').click(); return; }
                        const obstacle = r.horizon.obstacles.find(o => o.xPos + o.width > r.tRex.xPos);
                        if (r.playing && obstacle && !r.tRex.jumping && obstacle.xPos - r.tRex.xPos < r.currentSpeed * 14) {
                            stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
                        }
                    }, 16);
                });
                for (let second = 0; second < 90; second++) {
                    await page.clock.runFor(1000);
                    if (await page.evaluate(() => !document.getElementById('game-shield').hidden)) break;
                }
                assert(await page.evaluate(() => !document.getElementById('game-shield').hidden), 'shield must be obtained through actual play');
                await page.evaluate(() => clearInterval(window.autoplay));
                await page.clock.resume();
                assert((await page.locator('#game-shield').textContent()).includes('护盾 ×1'));
                await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `shield-${width}-${theme}.png`) });
                await page.evaluate(() => {
                    const stage = document.getElementById('lingxun-runner');
                    stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
                });
                await page.waitForTimeout(100);
                await page.evaluate(() => document.getElementById('lingxun-runner').dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
                await page.waitForTimeout(65);
                await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `wind-${width}-${theme}.png`) });
                await page.waitForTimeout(100);
                assert(await page.evaluate(() => {
                    const r = Runner.instance_, stage = document.getElementById('lingxun-runner');
                    const scale = stage.clientWidth / r.dimensions.WIDTH, origin = stage.getBoundingClientRect();
                    const offsetY = stage.clientHeight - 72 - (301 - 60) * scale;
                    const shieldTop = origin.top + offsetY + (r.tRex.yPos - 42) * scale;
                    const shieldRight = origin.left + (r.tRex.xPos + 78) * scale;
                    const hud = document.querySelector('.tavern-game__status-row').getBoundingClientRect();
                    return shieldTop >= hud.bottom + 4 || shieldRight <= hud.left - 4;
                }), 'jumping character and shield must not overlap the HUD');
                await page.locator('#game-pause').click();
                const timer = await page.locator('#game-shield-time').textContent();
                await page.waitForTimeout(250);
                assert.equal(await page.locator('#game-shield-time').textContent(), timer, 'pause freezes shield countdown');
                await page.locator('#game-start').click();
                await page.locator('#game-shield').waitFor({ state: 'hidden', timeout: 14000 });
                assert((await page.locator('#game-toast').textContent()).includes('挡了一下'), 'actual collision consumes shield and shows break feedback');
                assert(await page.evaluate(() => Runner.instance_.playing), 'shield prevents game over');
                console.log('PASS actual pickup + shield/wind captures', width, theme);
                await context.close();
            }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
