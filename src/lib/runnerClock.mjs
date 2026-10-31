export const LOGIC_STEP = 1000 / 60;

export function createRunnerClock(step) {
    let pending = 0;
    return {
        reset() { pending = 0; },
        advance(elapsed) {
            // Bound catch-up after a stall; each collision check still gets a full logical tick.
            pending += Math.min(100, Math.max(0, elapsed));
            let ticks = 0;
            while (pending + 1e-7 >= LOGIC_STEP) {
                pending = Math.max(0, pending - LOGIC_STEP);
                ticks++;
                if (step(LOGIC_STEP) === false) { pending = 0; break; }
            }
            return ticks;
        },
    };
}
