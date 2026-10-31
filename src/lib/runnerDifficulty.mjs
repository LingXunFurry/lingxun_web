export const MAX_PACE = 8.4;
export const DIFFICULTY_CAP_TIME = 150000;

export function difficultyAt(milliseconds) {
    const elapsed = Math.min(DIFFICULTY_CAP_TIME, Math.max(0, milliseconds));
    const stages = [[0, 5, 64], [30000, 5.45, 60], [60000, 5.9, 50], [90000, 6.8, 44], [120000, 7.7, 40], [150000, 7.8, 40]];
    const index = Math.min(4, Math.floor(elapsed / 30000));
    const from = stages[index], to = stages[index + 1];
    const t = (elapsed - from[0]) / (to[0] - from[0]), blend = t * t * (3 - 2 * t);
    return {
        pace: from[1] + (to[1] - from[1]) * blend,
        gapFrames: from[2] + (to[2] - from[2]) * blend,
        gapSpread: 18,
        level: Math.min(5, 1 + Math.floor(elapsed / 30000)),
    };
}

export function obstacleGap(milliseconds, speed, random = Math.random) {
    const { gapFrames, gapSpread, level } = difficultyAt(milliseconds);
    const roll = random();
    // Mix close encounters and breathing space instead of a near-constant cadence.
    const extra = level < 3 ? roll * gapSpread : roll < .72 ? roll / .72 * 10 : 20 + (roll - .72) / .28 * 24;
    return Math.max(140, Math.ceil(speed * (gapFrames + extra)));
}
