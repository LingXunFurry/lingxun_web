export const DRINKS = {
    ale: { name: '麦酒', vessel: '黄色酒杯', duration: 6000, color: '#d3a83d', label: '微醺 ×2', description: '6 秒积分 ×2，跑速平缓提升 12%。' },
    water: { name: '清风酒', vessel: '钢蓝酒瓶', duration: 10000, color: '#526982', label: '顺风引酒', description: '10 秒内牵引附近的饮品，不会清除麦酒或护盾效果。' },
    magic: { name: '护身酒', vessel: '红色酒瓶', duration: 7000, color: '#9b2731', label: '护盾 ×1', description: '淡蓝护盾凝聚，7 秒内抵挡一次碰撞；不叠加次数。' },
};

export function advanceRewards(state, distance, milliseconds) {
    const doubled = Math.min(state.remaining, milliseconds);
    state.points += distance * (milliseconds > 0 ? 1 + doubled / milliseconds : 1);
    state.remaining = Math.max(0, state.remaining - milliseconds);
    for (const field of ['attraction', 'shieldTime', 'invincible']) state[field] = Math.max(0, (state[field] || 0) - milliseconds);
    if (!state.shieldTime) state.shield = 0;
}

export function collectDrink(state, kind = 'ale') {
    if (kind === 'water') state.attraction = DRINKS.water.duration;
    else if (kind === 'magic') { state.shield = 1; state.shieldTime = DRINKS.magic.duration; }
    else state.remaining = DRINKS.ale.duration;
    state.deliveries = (state.deliveries || 0) + 1;
    if (state.deliveries >= 3) {
        state.deliveries = 0;
        state.orders = (state.orders || 0) + 1;
        state.points += 1000;
        return true;
    }
    return false;
}

export function speedMultiplier(state) { return state.remaining > 0 ? 1.12 : 1; }

export function approachPace(pace, target, milliseconds) {
    return pace + Math.max(-milliseconds * .002, Math.min(milliseconds * .002, target - pace));
}

export function absorbObstacle(state) {
    if (state.invincible > 0) return true;
    if (state.shield && state.shieldTime > 0) {
        state.shield = 0; state.shieldTime = 0; state.invincible = 1000;
        return true;
    }
    return false;
}

export function runningFrame(distance) {
    // One 32-frame stride covers the same ground at normal and boosted speeds.
    return Math.floor(distance / (5 * 60 * .84 / 32)) % 32;
}
