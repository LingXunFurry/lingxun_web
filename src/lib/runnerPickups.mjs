export const DRINK_SIZE = { width: 18, height: 22 };
// At the maximum game speed this leaves about half a second on either side.
export const DRINK_CLEARANCE = 240;

export function planDrink(width, ground, obstacles, kind) {
    const afterObstacles = obstacles.reduce((right, obstacle) => Math.max(right, obstacle.xPos + obstacle.width + DRINK_CLEARANCE), 0);
    return { x: Math.max(width + 64, afterObstacles), y: ground + 12, kind, pull: null };
}

export function obstacleOutsideDrink(obstacle, drink) {
    if (!drink) return obstacle.xPos;
    const right = obstacle.xPos + obstacle.width;
    const reservedRight = drink.x + DRINK_SIZE.width + DRINK_CLEARANCE;
    return right > drink.x - DRINK_CLEARANCE && obstacle.xPos < reservedRight ? reservedRight : obstacle.xPos;
}

export function advanceDrink(drink, player, movement, milliseconds, attracting) {
    const previousX = drink.x;
    drink.x -= movement;
    const target = { x: player.xPos + 22, y: player.yPos + 20 };
    if (!drink.pull && attracting && Math.hypot(drink.x + 9 - target.x, drink.y + 8 - target.y) < 110) {
        drink.pull = { x: drink.x + movement, y: drink.y, elapsed: 0, travel: 0 };
    }
    if (drink.pull) {
        const pull = drink.pull;
        pull.elapsed += milliseconds; pull.travel += movement;
        const t = Math.min(1, pull.elapsed / 260), ease = 1 - (1 - t) ** 2;
        drink.x = (pull.x - pull.travel) * (1 - ease) + (target.x - 9) * ease;
        drink.y = pull.y * (1 - ease) + (target.y - 8) * ease;
    }
    return (Math.min(previousX, drink.x) < player.xPos + 39 && Math.max(previousX, drink.x) + DRINK_SIZE.width > player.xPos + 7 &&
        drink.y - 3 < player.yPos + 45 && drink.y + 19 > player.yPos + 5) || Boolean(drink.pull && drink.pull.elapsed >= 260);
}
