const assert = require('node:assert/strict');
(async () => {
    const { DRINK_CLEARANCE: gap, DRINK_SIZE, planDrink, obstacleOutsideDrink, advanceDrink } = await import('../src/lib/runnerPickups.mjs');
    const blocked = { xPos: 620, width: 75 };
    const fixed = planDrink(600, 200, [blocked], 'ale');
    assert(fixed.x >= blocked.xPos + blocked.width + gap, 'regression: wine cannot spawn inside the box at the screen edge');
    assert.equal(fixed.y, 212, 'normal running can reach the wine');
    let seed = 71;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    const separated = (obstacle, cup) => obstacle.xPos + obstacle.width <= cup.x - gap + 1e-6 || obstacle.xPos >= cup.x + DRINK_SIZE.width + gap - 1e-6;
    for (const width of [278, 348, 600]) for (let sample = 0; sample < 1000; sample++) {
        const obstacles = Array.from({ length: Math.floor(random() * 4) }, () => ({ xPos: random() * 1000 - 100, width: 17 + Math.floor(random() * 70) }));
        const cup = planDrink(width, 200, obstacles, 'magic');
        assert(cup.x >= width + 64);
        assert(obstacles.every(obstacle => separated(obstacle, cup)));
        for (let frame = 0; frame < 120; frame++) {
            const movement = Math.floor((5 + random() * 3.4) * 60 * (.008 + random() * .035));
            cup.x -= movement;
            for (const obstacle of obstacles) obstacle.xPos -= movement;
            if (frame % 20 === 0) {
                const obstacle = { xPos: width + 25, width: 17 + Math.floor(random() * 70) };
                obstacle.xPos = obstacleOutsideDrink(obstacle, cup); obstacles.push(obstacle);
            }
            assert(obstacles.every(obstacle => separated(obstacle, cup)), 'future obstacles must respect the reserved pickup/landing space');
        }
    }
    const player = { xPos: 50, yPos: 200 };
    const running = { x: 100, y: 212, pull: null };
    assert(advanceDrink(running, player, 120, 150, false), 'swept collection prevents missed wine on a slow frame');
    const elevatedPlayer = { xPos: 50, yPos: 100 }, pulling = { x: 130, y: 212, pull: null };
    assert(!advanceDrink({ ...pulling }, elevatedPlayer, 0, 16, false), 'without breeze a missed airborne wine is not automatically awarded');
    let collected = false;
    for (let i = 0; i < 20 && !collected; i++) collected = advanceDrink(pulling, { ...player, yPos: 180 }, 0, 16, true);
    assert(collected && pulling.pull, 'breeze guides nearby wine to the character');
    const ordinary = { x: 200, y: 212, pull: null };
    advanceDrink(ordinary, player, 7, 16, false);
    assert.equal(ordinary.x, 193, 'ordinary wine shares the world displacement exactly');
    assert.equal(ordinary.y, 212);
    console.log('PASS 3000 generated layouts / 360000 motion steps, future obstacle reservations, ground reachability, swept pickup and breeze');
})().catch(error => { console.error(error); process.exitCode = 1; });
