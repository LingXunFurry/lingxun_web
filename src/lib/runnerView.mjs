export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 301;
export const WORLD_FLOOR_PAD = 60;

export function viewGeometry(width, height) {
    const scale = width / WORLD_WIDTH;
    return { width, height, scale, offsetY: height - 72 - (WORLD_HEIGHT - WORLD_FLOOR_PAD) * scale };
}

export function createRunnerView(stage, source) {
    const canvas = document.createElement('canvas');
    canvas.className = 'runner-canvas'; canvas.setAttribute('aria-hidden', 'true');
    stage.append(canvas);
    const ctx = canvas.getContext('2d');
    let geometry, ratio;
    return {
        canvas,
        resize() {
            const width = stage.clientWidth, height = stage.clientHeight, dpr = window.devicePixelRatio || 1;
            if (!width || !height || (geometry?.width === width && geometry?.height === height && ratio === dpr)) return false;
            geometry = viewGeometry(width, height); ratio = dpr;
            canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return true;
        },
        project(x, y) {
            return { x: x * geometry.scale, y: geometry.offsetY + y * geometry.scale };
        },
        render(travel, light) {
            if (!geometry) return;
            const { width, height, scale, offsetY } = geometry;
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = light ? '#e3e7e6' : '#121820'; ctx.fillRect(0, 0, width, height);
            // Extend the sky into the mobile HUD band without changing world coordinates.
            ctx.fillStyle = light ? '#ced6da' : '#202c3a';
            for (let row = 0; row < 2; row++) {
                const y = 138 + row * 42;
                if (y + 8 >= offsetY) continue;
                for (let x = -360 - travel % 360 + row * 120; x < WORLD_WIDTH; x += 360) {
                    ctx.fillRect((x + 80) * scale, y, 48 * scale, 5);
                    ctx.fillRect((x + 91) * scale, y - 4, 24 * scale, 4);
                }
            }
            ctx.drawImage(source, 0, 0, source.width, source.height, 0, offsetY, width, WORLD_HEIGHT * scale);
        },
    };
}
