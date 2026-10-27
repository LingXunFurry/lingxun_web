const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const output = path.resolve(__dirname, '../.local-backups/feed-entry-screenshots');
const ready = page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-site-content-pending') && !document.querySelector('[data-public-pending]'));

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    let cases = 0;
    try {
        const viewports = process.env.FEED_REPRO ? [[1440, 900]] : [[1024, 480], [1280, 720], [1440, 900], [1920, 1080]];
        const themes = process.env.FEED_REPRO ? ['dark'] : ['light', 'dark'];
        const motions = process.env.FEED_REPRO ? ['no-preference'] : ['no-preference', 'reduce'];
        for (const [width, height] of viewports) for (const theme of themes) for (const motion of motions) {
            const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: motion });
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                window.__feedFooterFrames = [];
                const sample = () => {
                    const footer = document.querySelector('.home-feed-section__footer');
                    if (footer) window.__feedFooterFrames.push(Number(getComputedStyle(footer).opacity));
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
            try {
                await page.goto(base + '/', { referer: base + '/gallery/', waitUntil: 'domcontentloaded' });
                await ready(page);await page.evaluate(() => document.fonts.ready);
                await page.locator('#page-cover').waitFor({ state: 'hidden' });
                const footer = page.locator('.home-feed-section__footer');
                assert.equal(await footer.evaluate(item => item.classList.contains('is-visible')), false, 'Offscreen footer keeps its entrance animation');
                const feedIndex = await page.locator('.home-page').evaluate(home => Array.from(home.children).filter(item => item.tagName === 'SECTION' && !item.classList.contains('egg-section') && !item.classList.contains('hidden')).findIndex(item => item.classList.contains('home-feed-section')));
                assert(feedIndex > 0);
                const wheel = async direction => {
                    await page.mouse.move(10, height / 2);
                    await page.mouse.wheel(0, direction * 600);
                    await page.waitForTimeout(motion === 'reduce' ? 300 : 1000);
                };
                for (let index = 0; index < feedIndex; index++) await wheel(1);
                assert(await page.locator('.home-feed-section').evaluate(item => Math.abs(item.getBoundingClientRect().top - 76) < 2), 'First entry uses the actual wheel controller');
                const firstEntry = await page.waitForFunction(() => {
                    const footer = document.querySelector('.home-feed-section__footer');
                    return footer.classList.contains('is-visible') && +getComputedStyle(footer).opacity > .99;
                }, null, { timeout: 2000 }).then(() => true, () => false);
                if (!firstEntry) {
                    const state = await footer.evaluate(item => ({ top: item.getBoundingClientRect().top, bottom: item.getBoundingClientRect().bottom, opacity: getComputedStyle(item).opacity, revealed: item.classList.contains('is-visible') }));
                    assert.fail('Footer must reveal on first entry without visiting another scene: ' + JSON.stringify({ width, height, motion, theme, state }));
                }
                const position = await page.evaluate(() => scrollY);
                const geometry = await footer.evaluate(item => {
                    const rect = item.getBoundingClientRect(), button = item.querySelector('a'), link = button.getBoundingClientRect();
                    return { top: rect.top, bottom: rect.bottom, notes: item.querySelector('.meta').textContent, link: button.getAttribute('href'), clickable: button.contains(document.elementFromPoint(link.x + link.width / 2, link.y + link.height / 2)) };
                });
                assert(geometry.top >= 76 && geometry.bottom <= height + 1 && geometry.clickable, 'Footer stays in frame and accepts clicks');
                assert(geometry.notes.includes('NOTES') && geometry.notes.includes('记录持续更新'));
                assert.equal(geometry.link, '/posts/');
                if (motion === 'no-preference') assert(await page.evaluate(() => window.__feedFooterFrames.some(opacity => opacity > .02 && opacity < .98)), 'Preserve the real fade-in, not an always-visible override');
                await page.screenshot({ path: path.join(output, `feed-${width}-${height}-${theme}-${motion}.png`) });
                await wheel(1);await wheel(-1);
                assert(Math.abs(await page.evaluate(() => scrollY) - position) < 2, 'Returning targets the same scene');
                assert(await footer.evaluate(item => +getComputedStyle(item).opacity > .99), 'Footer stays visible on return');
                await footer.locator('a').click();
                await page.waitForURL('**/posts/');
                assert.deepEqual(errors, []);
                cases++;
            } finally { await context.close(); }
        }
        console.log(`PASS ${cases} themed first-wheel entry and return cases: footer notes/link reveal without extra scrolling, genuine fade-in, viewport fit and working link.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
