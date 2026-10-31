// Sprite art credits and original file mappings: /images/game-fx/ATTRIBUTION.txt.
export function paleBlueShield(image) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 32, 32);
    const pixels = ctx.getImageData(0, 0, 32, 32);
    const palette = [[49, 85, 112], [102, 160, 199], [169, 218, 244], [229, 248, 255]];
    for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i + 3] = pixels.data[i + 3] < 96 ? 0 : 255;
        const luma = pixels.data[i] * .21 + pixels.data[i + 1] * .72 + pixels.data[i + 2] * .07;
        const color = palette[luma < 45 ? 0 : luma < 110 ? 1 : luma < 190 ? 2 : 3];
        pixels.data.set(color, i);
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
}

export function createRunnerVfx({ guard, wind, gust }) {
    let clock = 0, windStart = null, brokenShield = null;
    function shimmer(ctx, x, y, reduced, light, spread = 0) {
        const points = [[-27, -9], [-18, -25], [4, -28], [24, -17], [28, 5], [14, 25], [-10, 27], [-26, 15]];
        ctx.fillStyle = light ? '#619ac0' : '#c4e9ff';
        for (const [index, [dx, dy]] of points.entries()) {
            ctx.globalAlpha = reduced ? .65 : .5 + Math.sin(clock / 260 + index) * .22;
            const scale = 1 + spread / 28;
            ctx.fillRect(Math.round(x + dx * scale), Math.round(y + dy * scale), 3, 3);
        }
    }
    return {
        advance(milliseconds) { clock += Math.max(0, milliseconds); },
        wind(x, feet, worldTravel) { windStart = { x, feet, worldTravel, time: clock }; },
        breakShield(x, center) { brokenShield = { x, center, time: clock }; },
        clear() { windStart = brokenShield = null; clock = 0; },
        drawWind(ctx, worldTravel, reduced = false, light = false) {
            if (!windStart) return;
            const progress = (clock - windStart.time) / 560;
            if (progress >= 1) { windStart = null; return; }
            const x = windStart.x - (worldTravel - windStart.worldTravel);
            const frame = reduced ? 1 : Math.floor(progress * 12) % 4;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = reduced ? .8 : Math.min(1, (1 - progress) * 2.5);
            ctx.filter = light ? 'brightness(.62) saturate(.6)' : 'brightness(1.25) saturate(.5)';
            // The gust opens under the feet; a readable spiral gives the second jump its lift.
            const spread = reduced ? 62 : 52 + progress * 28;
            ctx.drawImage(gust, x - spread / 2, windStart.feet - 3, spread, 22);
            ctx.drawImage(wind, frame * 16, 0, 16, 16, x - 26, windStart.feet - 42, 52, 48);
            ctx.restore();
        },
        drawAttraction(ctx, drink, player, reduced = false, light = false) {
            ctx.save(); ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = .7;
            ctx.filter = light ? 'brightness(.6) saturate(.5)' : 'brightness(1.1) saturate(.5)';
            ctx.drawImage(gust, drink.x - 19, drink.y + 8, 26, 13);
            if (!reduced) ctx.drawImage(gust, (drink.x + player.xPos) / 2, (drink.y + player.yPos) / 2 + 12, 18, 9);
            ctx.restore();
        },
        drawShield(ctx, player, active, reduced = false, light = false) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            if (active) {
                const x = player.xPos + 22, y = player.yPos + 16;
                ctx.filter = light ? 'brightness(.9)' : 'brightness(1.45)';
                ctx.globalAlpha = light ? .18 : .3;
                for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) ctx.drawImage(guard, x - 22 + dx, y - 22 + dy, 44, 44);
                ctx.filter = 'none'; ctx.globalAlpha = .85;
                ctx.drawImage(guard, x - 20, y - 20, 40, 40);
                shimmer(ctx, x, y, reduced, light);
            }
            if (brokenShield) {
                const progress = (clock - brokenShield.time) / 360;
                if (progress < 1) {
                    ctx.globalAlpha = 1 - progress;
                    const { x, center } = brokenShield;
                    const spread = reduced ? 0 : progress * 15;
                    ctx.drawImage(guard, 0, 0, 16, 32, x - 20 - spread, center - 20 - spread / 2, 20, 40);
                    ctx.drawImage(guard, 16, 0, 16, 32, x + spread, center - 20 + spread / 2, 20, 40);
                } else brokenShield = null;
            }
            ctx.restore();
        },
    };
}
