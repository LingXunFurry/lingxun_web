const assert = require('node:assert/strict');
(async () => {
    const { viewGeometry, WORLD_WIDTH, WORLD_HEIGHT, WORLD_FLOOR_PAD } = await import('../src/lib/runnerView.mjs');
    const { createRunnerClock, LOGIC_STEP } = await import('../src/lib/runnerClock.mjs');
    for (const [width, height] of [[302, 358], [372, 358], [758, 378]]) {
        const g = viewGeometry(width, height);
        assert.equal(g.scale * WORLD_WIDTH, width, 'same entire forward view');
        assert(Math.abs(g.offsetY + (WORLD_HEIGHT - WORLD_FLOOR_PAD) * g.scale - (height - 72)) < .001);
        assert(72 * g.scale >= 36, 'smallest phone retains visible character');
        assert(g.offsetY >= 0, 'world top cannot be clipped');
    }
    for (const hz of [30, 60, 90, 120, 144]) {
        let ticks = 0, elapsed = 0;
        const clock = createRunnerClock(delta => { ticks++; elapsed += delta; });
        for (let frame = 0; frame < hz * 10; frame++) clock.advance(1000 / hz);
        assert.equal(ticks, 600, `${hz}Hz must give the same tick count`);
        assert(Math.abs(elapsed - 10000) < .001);
        clock.reset(); assert.equal(clock.advance(0), 0);
    }
    let ticks = 0;
    const clock = createRunnerClock(() => { ticks++; return ticks < 3; });
    assert.equal(clock.advance(5000), 3, 'stop on crash or pause during catch-up');
    assert.equal(clock.advance(LOGIC_STEP / 2), 0, 'discard stale backlog');
    console.log('PASS fixed world projection, clear controls, 30/60/90/120/144Hz clock parity and bounded catch-up');
})().catch(error => { console.error(error); process.exitCode = 1; });
