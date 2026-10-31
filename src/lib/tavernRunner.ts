import { DRINKS, advanceRewards, collectDrink, runningFrame, speedMultiplier, approachPace, absorbObstacle } from './runnerRewards.mjs';
import { planDrink, obstacleOutsideDrink, advanceDrink } from './runnerPickups.mjs';
import { difficultyAt, obstacleGap, MAX_PACE } from './runnerDifficulty.mjs';
import { JUMP_CEILING, chooseObstacleKind, configureObstacle } from './runnerObstacles.mjs';
import { createRunnerVfx, paleBlueShield } from './runnerVfx.mjs';
import { createRunnerView, WORLD_WIDTH, WORLD_HEIGHT, WORLD_FLOOR_PAD } from './runnerView.mjs';
import { createRunnerClock } from './runnerClock.mjs';

// Chromium owns jumps and collisions; this adapter owns the contained tavern game.
export function initTavernRunner() {
    const details = document.querySelector<HTMLDetailsElement>('#tavern-game');
    if (!details || details.dataset.gameInitialized === 'true') return;
    details.dataset.gameInitialized = 'true';
    const stage = document.querySelector<HTMLElement>('#lingxun-runner')!;
    const screen = document.querySelector<HTMLElement>('.tavern-game__screen')!;
    const status = document.querySelector<HTMLElement>('#game-status')!;
    const start = document.querySelector<HTMLButtonElement>('#game-start')!;
    const pause = document.querySelector<HTMLButtonElement>('#game-pause')!;
    const jump = document.querySelector<HTMLButtonElement>('#game-jump')!;
    const score = document.querySelector<HTMLOutputElement>('#game-score')!;
    const bestOutput = document.querySelector<HTMLOutputElement>('#game-best')!;
    const buff = document.querySelector<HTMLElement>('#game-buff')!;
    const shieldBadge = document.querySelector<HTMLElement>('#game-shield')!;
    const shieldTime = document.querySelector<HTMLOutputElement>('#game-shield-time')!;
    const order = document.querySelector<HTMLOutputElement>('#game-order')!;
    const level = document.querySelector<HTMLOutputElement>('#game-level')!;
    const toast = document.querySelector<HTMLElement>('#game-toast')!;
    const tips = document.querySelector<HTMLElement>('#game-tips')!;
    const nextTip = document.querySelector<HTMLButtonElement>('#tip-next')!;
    const tipSlides = Array.from(document.querySelectorAll<HTMLElement>('[data-tip-slide]'));
    const jumpCount = document.querySelector<HTMLElement>('#game-jump-count')!;
    let runner: any, effects: any, vfx: ReturnType<typeof createRunnerVfx>, loading = false, best = 0;
    let view: ReturnType<typeof createRunnerView>;
    let clock: ReturnType<typeof createRunnerClock>;
    let lastDistance = 0, lastTime = 0, nextCupAt = 1800, gameTime = 0, worldTravel = 0;
    const worldOffset = WORLD_HEIGHT - 200;
    let pace = 5;
    let paintingOnly = false;
    let previousKind = 'ordinary';
    let cup: ReturnType<typeof planDrink> | null = null;
    let airJumpUsed = false, tipIndex = 0, tipTimer: ReturnType<typeof setTimeout>, toastUntil = 0;
    let tipsSeen = false;
    try { tipsSeen = localStorage.getItem('lingxun-runner-tips-v4') === '1'; } catch {}
    const rewards = { points: 0, remaining: 0, attraction: 0, shield: 0, shieldTime: 0, invincible: 0, deliveries: 0, orders: 0 };
    try { best = Number(localStorage.getItem('lingxun-runner-best-v2')) || 0; } catch {}
    const format = (value: number) => String(Math.floor(value)).padStart(5, '0');
    bestOutput.value = format(best);
    function updateScore() {
        const current = runner.distanceMeter.getActualDistance(Math.ceil(rewards.points));
        score.value = format(current);
        const effects = [];
        if (rewards.remaining > 0) effects.push(`微醺 ×2 · ${Math.ceil(rewards.remaining / 1000)}s`);
        if (rewards.attraction > 0) effects.push(`顺风引酒 · ${Math.ceil(rewards.attraction / 1000)}s`);
        buff.hidden = effects.length === 0;
        const label = effects.join(' / ');
        if (buff.textContent !== label) buff.textContent = label;
        shieldBadge.hidden = !rewards.shield;
        const seconds = `${Math.ceil(rewards.shieldTime / 1000)}s`;
        if (shieldTime.value !== seconds) shieldTime.value = seconds;
        order.value = `${rewards.deliveries}/3`;
        level.value = String(difficultyAt(gameTime).level);
        order.title = `已送达 ${rewards.orders} 单，每单额外获得 25 分`;
        if (current > best) {
            best = current; bestOutput.value = format(best);
            try { localStorage.setItem('lingxun-runner-best-v2', String(best)); } catch {}
        }
    }
    function stop() {
        if (!runner?.playing) return;
        runner.stop();
        effects?.reset();
        repaint();
        screen.dataset.gameState = 'paused';
        start.textContent = '继续';
        status.textContent = '歇一会儿，凌巽等你。';
        pause.disabled = true;
    }
    function repaint() {
        if (!runner?.canvas) return;
        paintingOnly = true;
        try {
            runner.clearCanvas(); runner.horizon.update(0, 0, false); runner.tRex.draw();
            view?.render(worldTravel, document.documentElement.dataset.theme === 'light');
        } finally { paintingOnly = false; }
    }
    new MutationObserver(() => { if (runner && !runner.playing) repaint(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const egg = details.closest<HTMLElement>('#easter-egg-section');
    if (egg) new MutationObserver(() => {
        if (egg.getAttribute('aria-hidden') !== 'true') return;
        stop(); details.open = false; clearTimeout(tipTimer); tips.hidden = true; stage.inert = false;
        if (runner) screen.dataset.gameState = runner.crashed ? 'over' : 'paused';
    }).observe(egg, { attributes: true, attributeFilter: ['aria-hidden'] });
    function begin() {
        if (!runner || !details!.open || document.hidden) return;
        if (!tipsSeen) { showTips(); return; }
        screen.dataset.gameState = 'running';
        lastTime = performance.now();
        clock.reset();
        if (runner.crashed) {
            for (const key of Object.keys(rewards) as (keyof typeof rewards)[]) rewards[key] = 0;
            lastDistance = 0;
            cup = null; nextCupAt = 1800; gameTime = 0;
            worldTravel = 0;
            pace = 5;
            previousKind = 'ordinary';
            vfx.clear();
            airJumpUsed = false;
            runner.restart();
        } else {
            const airborne = runner.tRex.jumping;
            runner.play();
            // Native play() selects RUNNING; airborne physics needs the jump frame timing.
            if (airborne) runner.tRex.update(0, 'JUMPING');
        }
        pause.disabled = jump.disabled = false;
        stage.focus({ preventScroll: true });
    }
    function jumpDown() {
        if (!runner?.playing || runner.crashed) return;
        if (!runner.tRex.jumping) { airJumpUsed = false; runner.tRex.startJump(runner.currentSpeed); }
        else if (!airJumpUsed) {
            runner.tRex.jumpVelocity = -9; runner.tRex.reachedMinHeight = false; airJumpUsed = true;
            vfx.wind(runner.tRex.xPos + 22, runner.tRex.yPos + 47, worldTravel);
        }
    }
    function celebrateDrink() {
        if (!effects || !runner) return;
        const player = runner.tRex;
        const point = view.project(player.xPos + 22, player.yPos + 14);
        const origin = { x: point.x / stage.clientWidth, y: point.y / stage.clientHeight };
        const common = { origin, shapes: ['square'], flat: true, gravity: .05, decay: .88, ticks: 26, scalar: .6, disableForReducedMotion: true };
        const colors = document.documentElement.dataset.theme === 'light' ? ['#795a12', '#526982', '#9b2731'] : ['#d3a83d', '#f1f0eb', '#526982'];
        effects({ ...common, particleCount: 24, angle: 90, spread: 360, startVelocity: 8, colors });
    }
    function showTip() {
        clearTimeout(tipTimer);
        tipSlides.forEach((slide, index) => slide.hidden = index !== tipIndex);
        document.querySelector<HTMLOutputElement>('#tip-count')!.value = `${tipIndex + 1} / ${tipSlides.length}`;
        nextTip.textContent = tipIndex === tipSlides.length - 1 ? '开始跑腿' : '下一条 →';
        if (tipIndex < tipSlides.length - 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            tipTimer = setTimeout(() => { tipIndex++; showTip(); }, 9000);
        }
    }
    function showTips() {
        stop(); clearTimeout(tipTimer); tipIndex = 0; tips.hidden = false;
        stage.inert = true;
        screen.dataset.gameState = 'tips'; showTip(); nextTip.focus({ preventScroll: true });
    }
    function finishTips() {
        clearTimeout(tipTimer); tipsSeen = true; tips.hidden = true;
        stage.inert = false;
        try { localStorage.setItem('lingxun-runner-tips-v4', '1'); } catch {}
        if (runner) begin();
    }
    const asset = (src: string, id?: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        if (id) { image.id = id; image.hidden = true; stage.append(image); }
        image.onload = () => resolve(image);
        image.onerror = () => { image.remove(); reject(new Error('image')); };
        image.src = src;
    });
    async function load() {
        if (runner || loading) return;
        loading = true;
        try {
            const [character, , , wind, gust, guardSource] = await Promise.all([
                asset('/images/loading/lingxun-run-32-v5.webp'),
                asset('/vendor/t-rex-runner/sprite-1x.png', 'offline-resources-1x'),
                asset('/vendor/t-rex-runner/sprite-2x.png', 'offline-resources-2x'),
                asset('/images/game-fx/whirlwind-zwonky.png'),
                asset('/images/game-fx/gust-uriew.gif'),
                asset('/images/game-fx/shield-snoopeth.png'),
            ]);
            const guard = paleBlueShield(guardSource);
            document.querySelectorAll<HTMLImageElement>('[data-shield-icon]').forEach(image => image.src = guard.toDataURL());
            vfx = createRunnerVfx({ guard, wind, gust });
            const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve();
                script.onerror = () => { script.remove(); reject(new Error('script')); };
                document.head.append(script);
            });
            await Promise.all([loadScript('/vendor/t-rex-runner/runner.js?v=20261031-fixed-step'), loadScript('/vendor/canvas-confetti/confetti.browser.js')]);
            const Runner = (window as any).Runner;
            Object.assign(Runner.prototype, {
                startListening() {}, createTouchController() {}, loadSounds() {},
                setArcadeMode() {}, setArcadeModeContainerScale() {}, invert() {},
                startGame() {}, playIntro() { this.activated = true; },
                adjustDimensions() {
                    this.dimensions.WIDTH = WORLD_WIDTH; this.dimensions.HEIGHT = WORLD_HEIGHT;
                    clearInterval(this.resizeTimerId_); this.resizeTimerId_ = null;
                },
                setSpeed(speed = this.currentSpeed) { this.currentSpeed = Math.max(0, Math.min(MAX_PACE, speed)); },
            });
            Object.assign(Runner.defaultDimensions, { WIDTH: WORLD_WIDTH, HEIGHT: WORLD_HEIGHT });
            Runner.config.BOTTOM_PAD = WORLD_FLOOR_PAD;
            // Pixel art is rendered once in world space; only the presentation canvas uses DPR.
            Runner.updateCanvasScaling = () => false;
            // Keep speed below the original flying-obstacle threshold: this game needs only jumping.
            runner = new Runner('#lingxun-runner', { ...Runner.config, SPEED: 5, MAX_SPEED: MAX_PACE, ACCELERATION: 0, INVERT_DISTANCE: Infinity });
            runner.stop(); runner.activated = true; runner.tRex.xPos = 50;
            runner.canvas.className = 'runner-engine'; runner.canvas.setAttribute('aria-hidden', 'true');
            view = createRunnerView(stage, runner.canvas); view.resize();
            const effectCanvas = document.createElement('canvas');
            effectCanvas.className = 'tavern-game__effects'; effectCanvas.setAttribute('aria-hidden', 'true');
            stage.append(effectCanvas);
            effects = (window as any).confetti.create(effectCanvas, { resize: true, disableForReducedMotion: true });
            runner.horizon.horizonLine.yPos += worldOffset;
            runner.horizon.updateClouds = () => {};
            runner.distanceMeter.draw = () => {};
            const reduced = matchMedia('(prefers-reduced-motion: reduce)');
            runner.tRex.draw = function () {
                const frame = this.jumping || runner.crashed || reduced.matches ? 8 : runningFrame(worldTravel);
                const ctx = this.canvasCtx;
                ctx.save(); ctx.imageSmoothingEnabled = false;
                const light = document.documentElement.dataset.theme === 'light';
                vfx.drawWind(ctx, worldTravel, reduced.matches, light);
                ctx.drawImage(character, frame * 160, 0, 160, 160, this.xPos - 13, this.yPos - 24, 72, 72);
                vfx.drawShield(ctx, this, Boolean(rewards.shield), reduced.matches, light);
                ctx.restore();
            };
            const nativeJump = runner.tRex.updateJump.bind(runner.tRex);
            runner.tRex.updateJump = (delta: number) => {
                if (runner.tRex.yPos <= JUMP_CEILING && runner.tRex.jumpVelocity < 0) runner.tRex.jumpVelocity = 0;
                nativeJump(delta);
                if (runner.tRex.yPos < JUMP_CEILING) { runner.tRex.yPos = JUMP_CEILING; runner.tRex.jumpVelocity = Math.max(0, runner.tRex.jumpVelocity); }
            };
            const skinObstacle = (obstacle: any) => {
                if (obstacle.lingxunSkin) return;
                obstacle.lingxunSkin = true; obstacle.yPos += worldOffset;
                obstacle.draw = function () {
                    const ctx = this.canvasCtx, x = Math.round(this.xPos), y = Math.round(this.yPos);
                    const w = this.width, h = this.typeConfig.height;
                    ctx.save(); ctx.filter = 'none';
                    if (this.lingxunKind === 'pair') {
                        for (const left of [x, x + w - 24]) {
                            ctx.fillStyle = '#526982'; ctx.fillRect(left, y, 24, h);
                            ctx.fillStyle = '#18263d'; ctx.fillRect(left + 3, y + 3, 18, h - 6);
                            ctx.fillStyle = '#d3a83d'; ctx.fillRect(left, y + 3, 24, 3); ctx.fillRect(left, y + h - 6, 24, 3);
                        }
                        ctx.restore(); return;
                    }
                    if (this.lingxunKind === 'high') {
                        ctx.fillStyle = '#526982'; ctx.fillRect(x, y, w, h);
                        for (let dy = 3; dy < h; dy += 33) {
                            ctx.fillStyle = '#18263d'; ctx.fillRect(x + 3, y + dy, w - 6, 28);
                            ctx.fillStyle = '#d3a83d'; ctx.fillRect(x, y + dy, w, 3);
                        }
                        ctx.fillStyle = '#f1f0eb';
                        ctx.fillRect(x + 12, y + 10, 3, 15);
                        for (const side of [-1, 1]) {
                            ctx.fillRect(x + 12 + side * 3, y + 13, 3, 3); ctx.fillRect(x + 12 + side * 6, y + 16, 3, 3);
                        }
                        ctx.restore(); return;
                    }
                    if (this.lingxunLong) {
                        ctx.fillStyle = '#526982'; ctx.fillRect(x, y, w, h);
                        ctx.fillStyle = '#18263d'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
                        ctx.fillStyle = '#8e9baa';
                        for (let dx = 22; dx < w - 3; dx += 24) ctx.fillRect(x + dx, y + 3, 2, h - 6);
                        ctx.fillStyle = '#d3a83d'; ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + h - 3, w, 3);
                        ctx.fillStyle = '#f1f0eb';
                        for (const dx of [-10, 10]) {
                            const cx = x + Math.round(w / 2) + dx;
                            ctx.fillRect(cx, y + 9, 3, 15);
                            for (const side of [-1, 1]) {
                                ctx.fillRect(cx + side * 3, y + 12, 3, 3); ctx.fillRect(cx + side * 6, y + 15, 3, 3);
                            }
                        }
                        ctx.restore(); return;
                    }
                    ctx.fillStyle = '#526982'; ctx.fillRect(x + 2, y + 2, w - 4, h - 2);
                    ctx.fillStyle = '#18263d'; ctx.fillRect(x + 4, y + 4, w - 8, h - 6);
                    ctx.fillStyle = '#d3a83d'; ctx.fillRect(x, y + 6, w, 3); ctx.fillRect(x, y + h - 9, w, 3);
                    ctx.fillStyle = '#a8a9a6';
                    for (let dx = 8; dx < w - 3; dx += 10) ctx.fillRect(x + dx, y + 11, 2, h - 22);
                    ctx.restore();
                };
            };
            const addObstacle = runner.horizon.addNewObstacle.bind(runner.horizon);
            runner.horizon.addNewObstacle = (speed: number) => {
                addObstacle(speed);
                const newest = runner.horizon.obstacles.at(-1);
                if (newest && !newest.lingxunConfigured) {
                    newest.lingxunConfigured = true;
                    skinObstacle(newest);
                    const kind = chooseObstacleKind(gameTime, previousKind);
                    // Ale may expire before this row is crossed; size for the guaranteed base pace.
                    if (kind !== 'ordinary') configureObstacle(newest, kind, Math.min(speed, difficultyAt(gameTime).pace), runner.tRex.groundYPos);
                    previousKind = kind;
                    newest.xPos = obstacleOutsideDrink(newest, cup);
                    newest.gap = obstacleGap(gameTime, speed);
                    if (kind !== 'ordinary') newest.gap = Math.max(newest.gap, Math.ceil(speed * 48));
                }
                runner.horizon.obstacles.forEach(skinObstacle);
            };
            const scene = runner.horizon.update.bind(runner.horizon);
            runner.horizon.update = (delta: number, speed: number, obstacles: boolean) => {
                const ctx = runner.canvasCtx, width = runner.dimensions.WIDTH;
                const light = document.documentElement.dataset.theme === 'light';
                ctx.save();
                ctx.fillStyle = light ? '#e3e7e6' : '#121820'; ctx.fillRect(0, 0, width, runner.dimensions.HEIGHT);
                // Match the Chromium obstacle/ground rounding, including boosted speed.
                const movement = Math.floor(speed * 60 / 1000 * delta);
                worldTravel += movement;
                const drift = worldTravel % 180;
                ctx.fillStyle = light ? '#ced6da' : '#202c3a';
                for (let x = -360 - worldTravel % 360; x < width; x += 360) {
                    ctx.fillRect(x + 80, 80, 48, 7); ctx.fillRect(x + 91, 74, 24, 6);
                    ctx.fillRect(x + 235, 116, 35, 5); ctx.fillRect(x + 246, 111, 15, 5);
                }
                ctx.fillStyle = light ? '#b9c5cd' : '#253344';
                for (let x = -180 - drift; x < width; x += 180) {
                    ctx.fillRect(x + 12, 62 + worldOffset, 86, 50);
                    for (let row = 0; row < 6; row++) ctx.fillRect(x + 48 - row * 7, 44 + worldOffset + row * 3, 14 + row * 14, 3);
                    ctx.fillRect(x + 120, 42 + worldOffset, 28, 70);
                    ctx.fillRect(x + 116, 36 + worldOffset, 10, 10); ctx.fillRect(x + 142, 36 + worldOffset, 10, 10);
                }
                ctx.fillStyle = light ? '#9a7c34' : '#d3a83d';
                for (let x = -180 - drift; x < width; x += 180) { ctx.fillRect(x + 28, 78 + worldOffset, 6, 9); ctx.fillRect(x + 68, 78 + worldOffset, 6, 9); }
                if (paintingOnly) {
                    runner.horizon.horizonLine.draw();
                    runner.horizon.obstacles.forEach((obstacle: any) => obstacle.draw());
                } else scene(delta, speed, obstacles, false);
                ctx.fillStyle = light ? '#84919b' : '#526982';
                const road = worldTravel % 32;
                for (let x = -32 - road; x < width; x += 32) { ctx.fillRect(x, 143 + worldOffset, 19, 2); ctx.fillRect(x + 17, 148 + worldOffset, 10, 2); }
                if (runner.playing && !paintingOnly) {
                    let spawned = false;
                    if (!cup && gameTime >= nextCupAt) {
                        const kinds = Object.keys(DRINKS);
                        cup = planDrink(width, runner.tRex.groundYPos, runner.horizon.obstacles, kinds[Math.floor(Math.random() * kinds.length)]);
                        spawned = true;
                        nextCupAt = gameTime + 7000 + Math.random() * 2000;
                    }
                    if (cup) {
                        const player = runner.tRex;
                        // Obstacles have already moved when this frame's spawn is planned.
                        if (advanceDrink(cup, player, spawned ? 0 : movement, delta, rewards.attraction > 0)) {
                            const delivery = collectDrink(rewards, cup.kind);
                            if (cup.kind !== 'magic') celebrateDrink();
                            const drink = DRINKS[cup.kind as keyof typeof DRINKS];
                            toast.textContent = delivery ? `委托送达 +25 分 · ${drink.name}` : `${drink.name} · ${drink.label}`;
                            toastUntil = performance.now() + 1500; cup = null;
                        } else if (cup.x < -20) cup = null;
                    }
                }
                if (cup) {
                    if (cup.pull) vfx.drawAttraction(ctx, cup, runner.tRex, reduced.matches, light);
                    const x = Math.round(cup.x), y = Math.round(cup.y);
                    const beer = cup.kind === 'ale';
                    ctx.fillStyle = '#f1f0eb';
                    if (beer) { ctx.fillRect(x, y, 14, 3); ctx.fillRect(x + 1, y + 3, 12, 16); ctx.fillRect(x + 13, y + 5, 5, 9); }
                    else { ctx.fillRect(x + 4, y - 3, 6, 5); ctx.fillRect(x + 2, y + 2, 10, 17); }
                    ctx.fillStyle = DRINKS[cup.kind as keyof typeof DRINKS].color; ctx.fillRect(x + 3, y + 5, 8, 11);
                    if (beer) { ctx.fillStyle = '#18263d'; ctx.fillRect(x + 14, y + 7, 2, 5); }
                }
                ctx.restore();
            };
            const gameOver = runner.gameOver.bind(runner);
            runner.gameOver = () => {
                const hadShield = Boolean(rewards.shield);
                if (absorbObstacle(rewards)) {
                    runner.horizon.removeFirstObstacle();
                    if (hadShield) {
                        vfx.breakShield(runner.tRex.xPos + 22, runner.tRex.yPos + 16);
                        toast.textContent = '风盾替你挡了一下'; toastUntil = performance.now() + 1500;
                    }
                    return;
                }
                gameOver(); runner.gameOverPanel.draw = () => {};
                effects?.reset();
                repaint();
                screen.dataset.gameState = 'over';
                status.textContent = '撞到了。下一杯留到下一趟。';
                start.textContent = '再跑一趟'; pause.disabled = true;
                updateScore();
            };
            const update = runner.update.bind(runner);
            // Render refresh rates must not change Chromium's integer movement or jump integration.
            runner.scheduleNextUpdate = () => {};
            clock = createRunnerClock((delta: number) => {
                const wasPlaying = runner.playing;
                if (wasPlaying) { vfx.advance(delta); gameTime += delta; }
                if (wasPlaying) {
                    const target = Math.min(MAX_PACE, difficultyAt(gameTime).pace * speedMultiplier(rewards));
                    // One shared pace drives the world on every viewport.
                    pace = approachPace(pace, target, delta);
                    runner.setSpeed(pace);
                }
                update(delta);
                if (wasPlaying) advanceRewards(rewards, Math.max(0, runner.distanceRan - lastDistance), delta);
                lastDistance = runner.distanceRan;
                return runner.playing;
            });
            runner.update = () => {
                runner.updatePending = false;
                const now = performance.now();
                if (runner.playing) clock.advance(now - lastTime);
                lastTime = now;
                if (!runner.tRex.jumping) airJumpUsed = false;
                jumpCount.textContent = airJumpUsed ? '•' : '••';
                if (now > toastUntil) toast.textContent = '';
                updateScore();
                view.render(worldTravel, document.documentElement.dataset.theme === 'light');
                if (runner.playing) {
                    runner.updatePending = true;
                    runner.raqId = requestAnimationFrame(runner.update);
                }
            };
            new ResizeObserver(() => {
                if (!view.resize()) return;
                const playing = runner.playing;
                if (playing) stop();
                repaint();
                if (playing) {
                    screen.dataset.gameState = 'paused'; start.textContent = '继续';
                    status.textContent = '画面已调整。准备好了就继续。'; pause.disabled = true;
                }
            }).observe(stage);
            repaint();
            screen.dataset.gameState = 'ready'; start.disabled = false;
            status.textContent = '凌巽在城外等你。';
        } catch {
            stage.querySelectorAll('img').forEach(node => node.remove());
            status.textContent = '没能加载游戏。再试一次？';
            start.disabled = false; start.textContent = '重新加载';
        } finally { loading = false; }
    }
    details.addEventListener('toggle', () => { if (details.open) void load(); else { stop(); clearTimeout(tipTimer); } });
    details.querySelector('summary')!.addEventListener('click', () => { if (details.open) { stop(); clearTimeout(tipTimer); } });
    document.querySelector('#game-help')!.addEventListener('click', showTips);
    nextTip.addEventListener('click', () => { if (tipIndex === tipSlides.length - 1) finishTips(); else { tipIndex++; showTip(); } });
    document.querySelector('#tip-skip')!.addEventListener('click', finishTips);
    tips.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); finishTips(); }
        if (event.key === 'Tab') {
            const skip = document.querySelector<HTMLButtonElement>('#tip-skip')!;
            if (event.shiftKey && document.activeElement === skip) { event.preventDefault(); nextTip.focus(); }
            else if (!event.shiftKey && document.activeElement === nextTip) { event.preventDefault(); skip.focus(); }
        }
    });
    start.addEventListener('click', () => { if (!runner) void load(); else begin(); });
    pause.addEventListener('click', stop);
    jump.addEventListener('pointerdown', event => { event.preventDefault(); jumpDown(); });
    jump.addEventListener('click', event => { if (event.detail === 0) jumpDown(); });
    stage.addEventListener('pointerdown', event => { if (event.target instanceof HTMLCanvasElement) { stage.focus({ preventScroll: true }); jumpDown(); } });
    stage.addEventListener('keydown', event => {
        if (!runner || !['Space', 'ArrowUp', 'KeyP', 'Enter'].includes(event.code)) return;
        event.preventDefault(); if (event.repeat) return;
        if (event.code === 'KeyP') runner.playing ? stop() : begin();
        else if (event.code === 'Enter') { if (!runner.playing) begin(); }
        else if (!runner.playing) begin(); else jumpDown();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { stop(); clearTimeout(tipTimer); }
        else if (!tips.hidden && details.open) showTip();
    });
    window.addEventListener('blur', () => { stop(); clearTimeout(tipTimer); });
    window.addEventListener('focus', () => { if (!tips.hidden && details.open) showTip(); });
    window.addEventListener('pagehide', stop);
    new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) return;
        const bounds = stage.getBoundingClientRect();
        if (!details.open || bounds.bottom <= 0 || bounds.top >= innerHeight) stop();
    }).observe(stage);
}
