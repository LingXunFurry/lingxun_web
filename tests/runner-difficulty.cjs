const assert = require('node:assert/strict');
(async () => {
    const { difficultyAt, obstacleGap, MAX_PACE, DIFFICULTY_CAP_TIME } = await import('../src/lib/runnerDifficulty.mjs');
    let previous = difficultyAt(0);
    for (let time = 1000; time <= 600000; time += 1000) {
        const current = difficultyAt(time);
        assert(current.pace >= previous.pace && current.pace <= MAX_PACE);
        assert(current.gapFrames <= previous.gapFrames && current.gapFrames >= 40);
        assert(current.level >= previous.level && current.level <= 5);
        previous = current;
    }
    assert.equal(difficultyAt(0).level, 1);
    assert.equal(difficultyAt(30000).level, 2);
    assert.equal(difficultyAt(120000).level, 5);
    for (const speed of [2.78, 4.2, 5, 6.5, 8]) for (const time of [0, 30000, 90000, 300000]) {
        const early = obstacleGap(0, speed, () => .5);
        const gap = obstacleGap(time, speed, () => .5);
        assert(gap <= early && gap >= speed * 40);
        assert(gap >= 140);
    }
    assert(difficultyAt(90000).pace > difficultyAt(60000).pace * 1.1);
    assert(difficultyAt(120000).pace > difficultyAt(90000).pace * 1.1);
    assert(obstacleGap(180000, 5, () => .5) < obstacleGap(0, 5, () => .5));
    assert.equal(MAX_PACE, 8.4);
    assert.equal(difficultyAt(DIFFICULTY_CAP_TIME).gapFrames, 40);
    assert.equal(difficultyAt(DIFFICULTY_CAP_TIME).gapSpread, 18);
    assert.equal(difficultyAt(DIFFICULTY_CAP_TIME).pace, 7.8);
    assert(obstacleGap(150000, 7.8, () => .95) > obstacleGap(150000, 7.8, () => .6) * 1.3, 'breathers and close sequences must be visibly different');
    assert.deepEqual(difficultyAt(DIFFICULTY_CAP_TIME), difficultyAt(3600000), 'speed and density stop increasing after 2.5 minutes');
    assert.equal(obstacleGap(DIFFICULTY_CAP_TIME, 8, () => .5), obstacleGap(3600000, 8, () => .5));
    console.log('PASS ten-minute monotonic difficulty, bounded pace, 5 levels and safe mobile/boosted obstacle intervals');
})().catch(error => { console.error(error); process.exitCode = 1; });
