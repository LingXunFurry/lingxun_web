const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
(async () => {
    const { configureObstacle, chooseObstacleKind } = await import('../src/lib/runnerObstacles.mjs');
    assert.equal(chooseObstacleKind(59000, 'ordinary', () => .99), 'ordinary');
    assert.equal(chooseObstacleKind(60000, 'ordinary', () => .99), 'long');
    assert.equal(chooseObstacleKind(90000, 'ordinary', () => .99), 'pair');
    assert.equal(chooseObstacleKind(150000, 'long', () => .7), 'ordinary');
    assert.equal(chooseObstacleKind(150000, 'ordinary', () => .6), chooseObstacleKind(999999, 'ordinary', () => .6));
    let previousRate = 0;
    for (const time of [60000, 90000, 150000]) {
        let seed = 17, previous = 'ordinary', special = 0;
        const rng = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 10000; i++) {
            const kind = chooseObstacleKind(time, previous, rng);
            assert(!(previous === kind && kind !== 'ordinary'));
            if (kind !== 'ordinary') special++;
            previous = kind;
        }
        assert(special > previousRate, 'later stages must actually show more special encounters'); previousRate = special;
    }
    const shared = { width: 25, height: 50 };
    const item = configureObstacle({ typeConfig: shared }, 'long', 7.8, 194);
    assert.equal(shared.width, 25, 'do not mutate native type definitions');
    assert.equal(item.width, item.typeConfig.width * item.size, 'broad-phase collider must match the visible long row');
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [width, height] of [[278, 420], [600, 301]]) {
            const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
            await page.goto(base + '/aa');
            await page.setContent(`<style>#fixture{width:${width}px;height:${height}px}</style><div id="fixture"><span class="icon-offline"></span></div><img hidden id="offline-resources-1x" src="${base}/vendor/t-rex-runner/sprite-1x.png"><img hidden id="offline-resources-2x" src="${base}/vendor/t-rex-runner/sprite-2x.png">`);
            await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
            await page.addScriptTag({ content: fs.readFileSync(path.resolve(__dirname, '../src/lib/runnerDifficulty.mjs'), 'utf8').replaceAll(/export const (\w+)/g, 'window.$1').replaceAll(/export function (\w+)/g, 'window.$1 = function') });
            await page.addScriptTag({ content: fs.readFileSync(path.resolve(__dirname, '../src/lib/runnerObstacles.mjs'), 'utf8').replace(/^import[^\n]*\n/m, '').replace('export const JUMP_CEILING', 'window.JUMP_CEILING').replaceAll(/export function (\w+)/g, 'window.$1 = function') });
            await page.evaluate(() => { window.fixtureTime = 1000; performance.now = () => window.fixtureTime; });
            await page.addScriptTag({ url: base + '/vendor/t-rex-runner/runner.js' });
            const result = await page.evaluate(({ width, height }) => {
                Object.assign(Runner.prototype, { startListening() {}, createTouchController() {}, loadSounds() {}, setArcadeMode() {}, setArcadeModeContainerScale() {}, invert() {}, startGame() {}, playIntro() { this.activated = true; }, scheduleNextUpdate() {}, adjustDimensions() { this.dimensions.WIDTH = 600; this.dimensions.HEIGHT = 301; }, setSpeed(speed) { this.currentSpeed = speed; } });
                Object.assign(Runner.defaultDimensions, { WIDTH: 600, HEIGHT: 301 }); Runner.config.BOTTOM_PAD = 60;
                Runner.updateCanvasScaling = () => false;
                const r = new Runner('#fixture', { ...Runner.config, SPEED: 5, MAX_SPEED: 8.4, ACCELERATION: 0, CLEAR_TIME: 0, INVERT_DISTANCE: Infinity });
                r.stop(); r.activated = true; r.tRex.xPos = 50;
                r.horizon.addNewObstacle(5);
                const obstacle = r.horizon.obstacles[0];
                r.horizon.addNewObstacle = () => {};
                r.horizon.updateClouds = r.horizon.horizonLine.draw = r.distanceMeter.draw = r.tRex.draw = r.clearCanvas = obstacle.draw = () => {};
                r.gameOver = () => { r.crashed = true; r.playing = false; };
                const jump = r.tRex.updateJump.bind(r.tRex);
                r.tRex.updateJump = delta => {
                    if (r.tRex.yPos <= JUMP_CEILING && r.tRex.jumpVelocity < 0) r.tRex.jumpVelocity = 0;
                    jump(delta);
                    if (r.tRex.yPos < JUMP_CEILING) { r.tRex.yPos = JUMP_CEILING; r.tRex.jumpVelocity = Math.max(0, r.tRex.jumpVelocity); }
                };
                const trial = (kind, speed, lead, second, delta, layoutSpeed = speed) => {
                    r.tRex.reset(); r.tRex.xPos = 50;
                    configureObstacle(obstacle, kind, layoutSpeed, r.tRex.groundYPos);
                    obstacle.xPos = 50 + lead * speed; obstacle.remove = false; obstacle.followingObstacleCreated = true;
                    r.horizon.obstacles = [obstacle]; r.crashed = false; r.playing = true; r.paused = false; r.runningTime = 1000;
                    r.currentSpeed = speed; r.time = fixtureTime; r.distanceRan = 0;
                    r.tRex.startJump(speed);
                    let boosted = false;
                    for (let frame = 0; frame < 110; frame++) {
                        const automatic = second === -2 && !boosted && (kind === 'high' ? obstacle.xPos - r.tRex.xPos < speed * 12 : obstacle.xPos + obstacle.width / 2 < r.tRex.xPos + 22);
                        if ((frame === second || automatic) && r.tRex.jumping) { r.tRex.jumpVelocity = -9; r.tRex.reachedMinHeight = false; boosted = true; }
                        fixtureTime += delta; r.update();
                        if (r.crashed) return false;
                        if (obstacle.xPos + obstacle.width < r.tRex.xPos) return true;
                    }
                    return false;
                };
                const results = [];
                for (const kind of ['long', 'high', 'pair']) for (const speed of [5, 6.8, 7.8, 8.4]) {
                    for (const delta of [16, 1000 / 60]) {
                        let singles = 0, doubles = 0;
                        for (let lead = 8; lead <= 32; lead++) {
                            if (trial(kind, speed, lead, -1, delta)) singles++;
                            for (let second = 6; second <= 32; second += 2) if (trial(kind, speed, lead, second, delta)) doubles++;
                        }
                        results.push({ kind, speed, delta, singles, doubles, automatic: trial(kind, speed, kind === 'high' ? 22 : 14, -2, delta) });
                    }
                }
                for (const [base, boosted] of [[5.9, 6.608], [6.66, 7.4592], [7.8, 8.4]]) {
                    for (const speed of [base, boosted]) {
                        let doubles = 0;
                        for (let lead = 8; lead <= 32; lead++) for (let second = 6; second <= 32; second += 2) if (trial('long', speed, lead, second, 1000 / 60, base)) doubles++;
                        results.push({ kind: 'buff-transition', speed, layoutSpeed: base, doubles, automatic: trial('long', speed, 14, -2, 1000 / 60, base) });
                    }
                }
                return results;
            }, { width, height });
            console.log('Physics fixture', width, 'cases', result.length, 'min double-jump windows', Math.min(...result.map(sample => sample.doubles)));
            for (const sample of result) {
                if (sample.kind === 'long') assert.equal(sample.singles, 0, 'single-jump escape: ' + JSON.stringify(sample));
                assert(sample.doubles >= 5, 'insufficient double-jump windows: ' + JSON.stringify(sample));
                assert(sample.automatic, 'suggested timing must work: ' + JSON.stringify(sample));
            }
            await page.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
