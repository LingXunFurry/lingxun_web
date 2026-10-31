import { difficultyAt } from './runnerDifficulty.mjs';

export const JUMP_CEILING = 56;

export function chooseObstacleKind(milliseconds, previous = 'ordinary', random = Math.random) {
    const level = difficultyAt(milliseconds).level;
    if (level < 3) return 'ordinary';
    const limits = level === 3 ? [.55, .78, 1] : level === 4 ? [.35, .6, .85] : [.2, .5, .8];
    const roll = random();
    const kind = roll < limits[0] ? 'ordinary' : roll < limits[1] ? 'high' : roll < limits[2] ? 'long' : 'pair';
    return kind !== 'ordinary' && kind === previous ? 'ordinary' : kind;
}

export function configureObstacle(obstacle, kind, speed, ground) {
    const step = Math.max(1, Math.floor(speed * .96));
    const width = kind === 'long' ? Math.max(64, step * 38) : kind === 'high' ? 28 : 48 + step * 9;
    const height = kind === 'high' ? 100 : 34;
    obstacle.lingxunKind = kind;
    obstacle.lingxunLong = kind === 'long';
    obstacle.size = 1;
    obstacle.width = width;
    obstacle.yPos = ground + 47 - height;
    // The engine's broad phase uses typeConfig.width * size, not obstacle.width.
    obstacle.typeConfig = { ...obstacle.typeConfig, width, height };
    obstacle.collisionBoxes = kind === 'pair'
        ? [{ x: 1, y: 1, width: 22, height: 32 }, { x: width - 25, y: 1, width: 22, height: 32 }]
        : [{ x: 1, y: 1, width: width - 2, height: height - 2 }];
    return obstacle;
}
