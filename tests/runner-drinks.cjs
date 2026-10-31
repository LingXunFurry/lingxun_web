const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
const output = path.resolve(__dirname, '../.local-backups/error-screenshots');
const raster = process.env.RUNNER_RASTER !== '0';
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [width, theme] of [[320, 'dark'], [1440, 'light']]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 800 });
            await context.addInitScript(theme => {
                localStorage.setItem('lingxun-theme', theme); localStorage.setItem('lingxun-runner-tips-v4', '1');
                let seed = 2030; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
            }, theme);
            const page = await context.newPage(), errors = [];
            await page.clock.install({ time: new Date('2026-10-30T12:00:00Z') });
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'log') console.log(message.text()); });
            await page.goto(base + '/aa'); await page.locator('#tavern-game summary').click();
            await page.waitForFunction(() => !document.getElementById('game-start').disabled);
            await page.clock.pauseAt(new Date('2026-10-30T12:00:05Z'));
            await page.evaluate(raster => {
                // Long-run physics can omit raster work; separate UI tests always paint real frames.
                const r = Runner.instance_, ctx = r.canvasCtx, paint = raster ? ctx.fillRect.bind(ctx) : () => {};
                if (!raster) {
                    const display = document.querySelector('.runner-canvas').getContext('2d');
                    display.drawImage = display.fillRect = () => {};
                }
                const stats = window.drinkCheck = { frames: 0, wineFrames: 0, pulls: 0, kinds: {}, powers: {}, errors: [], delivered: false, crashes: 0, maxLevel: 1, earlyGaps: [], lateGaps: [], maxUnboosted: 0, activeMs: 0, postCapSpeeds: [], obstacleKinds: {}, windJumps: 0 };
                window.patternCaptures = {};
                let soberMs = 0;
                let cup = null, pulling = false;
                const seen = new WeakSet(), boosted = new WeakSet(), draw = raster ? ctx.drawImage.bind(ctx) : () => {};
                ctx.drawImage = (image, ...args) => {
                    if (image.src?.endsWith('/gust-uriew.gif') && args.length === 4 && args[2] === 26 && args[3] === 13) { stats.pulls++; pulling = true; }
                    return draw(image, ...args);
                };
                ctx.fillRect = (x, y, w, h) => {
                    if (x === 0 && y === 0 && w === r.dimensions.WIDTH && h === r.dimensions.HEIGHT) { cup = null; pulling = false; }
                    if (w === 8 && h === 11 && ['#d3a83d', '#526982', '#9b2731'].includes(ctx.fillStyle)) cup = { x: x - 3, y: y - 5, color: ctx.fillStyle };
                    return paint(x, y, w, h);
                };
                window.drinkDriver = setInterval(() => {
                    stats.frames++;
                    if (r.crashed) {
                        if (!stats.crashes) console.log('first crash', JSON.stringify({ activeMs: stats.activeMs, player: [r.tRex.yPos, r.tRex.jumpVelocity, r.tRex.jumping], speed: r.currentSpeed, obstacles: r.horizon.obstacles.map(o => ({ kind: o.lingxunKind, x: o.xPos, y: o.yPos, width: o.width, height: o.typeConfig.height })) }));
                        stats.crashes = 1; return;
                    }
                    if (!r.playing) return;
                    stats.activeMs += 16;
                    if (r.currentSpeed > 8.4 + .001) stats.errors.push('hard speed cap exceeded');
                    if (cup) {
                        stats.wineFrames++; stats.kinds[cup.color] = true;
                        const groundWine = Math.abs(cup.y - r.tRex.groundYPos - 12) <= 1;
                        for (const obstacle of r.horizon.obstacles) {
                            const overlaps = obstacle.xPos < cup.x + 18 && obstacle.xPos + obstacle.width > cup.x;
                            if (overlaps && groundWine) stats.errors.push('wine overlaps an obstacle');
                            if (groundWine && !pulling && !(obstacle.xPos + obstacle.width <= cup.x - 239 || obstacle.xPos >= cup.x + 257)) stats.errors.push({ problem: 'reserved approach/landing gap lost', cup: { ...cup }, obstacle: { x: obstacle.xPos, width: obstacle.width }, distance: r.distanceRan });
                        }
                    }
                    const text = document.getElementById('game-buff').textContent;
                    const level = Number(document.getElementById('game-level').value);
                    stats.maxLevel = Math.max(stats.maxLevel, level);
                    if (!text.includes('微醺')) stats.maxUnboosted = Math.max(stats.maxUnboosted, r.currentSpeed);
                    soberMs = text.includes('微醺') ? 0 : soberMs + 16;
                    if (stats.activeMs > 160000 && soberMs > 800) stats.postCapSpeeds.push(r.currentSpeed);
                    for (const obstacle of r.horizon.obstacles) if (!seen.has(obstacle)) {
                        seen.add(obstacle);
                        const kind = obstacle.lingxunKind || 'ordinary';
                        stats.obstacleKinds[kind] = (stats.obstacleKinds[kind] || 0) + 1;
                        if (level === 1) stats.earlyGaps.push(obstacle.gap / r.currentSpeed);
                        if (level >= 4) stats.lateGaps.push(obstacle.gap / r.currentSpeed);
                    }
                    for (const obstacle of r.horizon.obstacles) {
                        const kind = obstacle.lingxunKind;
                        if (kind && !window.patternCaptures[kind] && obstacle.xPos > 0 && obstacle.xPos + obstacle.width < r.dimensions.WIDTH) window.patternCaptures[kind] = r.canvas.toDataURL('image/png');
                    }
                    if (text.includes('微醺')) stats.powers.ale = true;
                    if (text.includes('顺风引酒')) stats.powers.breeze = true;
                    if (!document.getElementById('game-shield').hidden) stats.powers.shield = true;
                    if (/已送达 [1-9]/.test(document.getElementById('game-order').title)) stats.delivered = true;
                    const obstacle = r.horizon.obstacles.find(o => o.xPos + o.width > r.tRex.xPos);
                    if (obstacle) {
                        const stage = document.getElementById('lingxun-runner'), kind = obstacle.lingxunKind;
                        const distance = obstacle.xPos - r.tRex.xPos;
                        if (!r.tRex.jumping && distance < r.currentSpeed * (kind === 'high' ? 22 : 14)) {
                            stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
                        } else if (r.tRex.jumping && kind && !boosted.has(obstacle) && (kind === 'high' ? distance < r.currentSpeed * 12 : obstacle.xPos + obstacle.width / 2 < r.tRex.xPos + 22)) {
                            stage.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
                            boosted.add(obstacle); stats.windJumps++;
                        }
                    }
                }, 16);
            }, raster);
            await page.evaluate(() => document.getElementById('game-start').click());
            try {
                await page.clock.runFor(1000);
                const initial = await page.evaluate(() => Runner.instance_.currentSpeed);
                assert(await page.evaluate(() => Runner.instance_.distanceRan > 100), 'mobile pace must not decay through repeated scaling');
                for (let second = 1; second < 220; second++) {
                    await page.clock.runFor(1000);
                    if (second === 44) {
                        for (let frame = 0; frame < 120 && !await page.evaluate(() => Runner.instance_.tRex.jumping); frame++) await page.clock.runFor(16);
                        assert(await page.evaluate(() => Runner.instance_.tRex.jumping), 'pause test must cover a real airborne jump');
                        await page.evaluate(() => document.getElementById('game-pause').click());
                        const paused = await page.evaluate(() => [Runner.instance_.distanceRan, document.getElementById('game-level').value, document.getElementById('game-score').value]);
                        await page.clock.runFor(45000);
                        assert.deepEqual(await page.evaluate(() => [Runner.instance_.distanceRan, document.getElementById('game-level').value, document.getElementById('game-score').value]), paused, 'paused time cannot raise difficulty or score');
                        await page.evaluate(() => document.getElementById('game-start').click());
                        assert.equal(await page.evaluate(() => Runner.instance_.tRex.status), 'JUMPING', 'resume preserves airborne frame timing');
                    }
                    const done = await page.evaluate(() => {
                        const s = window.drinkCheck;
                        return s.crashes || s.errors.length || (s.activeMs >= 185000 && s.maxLevel === 5 && Object.keys(s.kinds).length === 3 && Object.keys(s.powers).length === 3 && s.pulls > 0 && s.delivered);
                    });
                    if (done) break;
                }
                const stats = await page.evaluate(() => window.drinkCheck);
                assert.deepEqual(stats.errors, []);
                assert.equal(Object.keys(stats.kinds).length, 3);
                assert.equal(Object.keys(stats.powers).length, 3);
                assert(stats.pulls > 0 && stats.delivered && stats.wineFrames > 100);
                assert.equal(stats.maxLevel, 5, 'real engine reaches late-game difficulty');
                assert(stats.maxUnboosted > initial * 1.25, 'pace grows even without ale');
                assert.equal(stats.crashes, 0, 'valid mixed single/double jumps remain possible at capped difficulty');
                assert(stats.obstacleKinds.long > 0 && stats.obstacleKinds.high > 0 && stats.obstacleKinds.pair > 0 && stats.windJumps > 0, 'all new encounters must occur in real play');
                assert(stats.postCapSpeeds.length > 20 && stats.postCapSpeeds.every(speed => Math.abs(speed - 7.8) < .01), 'unboosted pace stays at its hard cap after 2.5 minutes');
                const mean = values => values.reduce((sum, n) => sum + n, 0) / values.length;
                assert(mean(stats.lateGaps) < mean(stats.earlyGaps) - 5, 'late-game obstacle intervals are actually shorter');
                await page.clock.resume();
                if (raster) {
                    const captures = await page.evaluate(() => window.patternCaptures);
                    for (const [kind, data] of Object.entries(captures)) fs.writeFileSync(path.join(output, `pattern-${width}-${theme}-${kind}.png`), Buffer.from(data.split(',')[1], 'base64'));
                    await page.locator('.tavern-game__screen').screenshot({ path: path.join(output, `drinks-${width}-${theme}.png`) });
                }
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                assert.deepEqual(errors, []);
                await page.evaluate(() => clearInterval(window.drinkDriver));
                await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100));
                await page.clock.runFor(15000);
                assert(await page.evaluate(() => Runner.instance_.crashed));
                await page.evaluate(() => document.getElementById('game-start').click());
                await page.clock.runFor(32);
                assert.equal(await page.locator('#game-level').textContent(), '1', 'retry resets late-game difficulty');
                console.log('PASS real engine: reachable drinks, 3 effects, 5 levels, hard cap, pause and reset', width, theme, JSON.stringify({ ...stats, earlyGaps: mean(stats.earlyGaps), lateGaps: mean(stats.lateGaps), postCapSpeeds: stats.postCapSpeeds.length }));
            } catch (error) {
                console.error('drink diagnostics', await page.evaluate(() => ({ stats: window.drinkCheck, playing: Runner.instance_.playing, distance: Runner.instance_.distanceRan, speed: Runner.instance_.currentSpeed, screen: document.querySelector('.tavern-game__screen').dataset.gameState }))); throw error;
            } finally { await page.evaluate(() => clearInterval(window.drinkDriver)); await context.close(); }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
