const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const screenshots = path.resolve(__dirname, '../.local-backups/page-reveal-screenshots');
const routes = [
    { path: '/gallery/', header: '.gallery-page__header', list: '#gallery-grid', api: 'gallery' },
    { path: '/posts/', header: '.archive-page__header', list: '#posts-list', api: 'posts' },
    { path: '/friends/', header: '.friends-page__header', list: '#friends-list', api: 'friends' },
];
const visible = (page, selector) => page.waitForFunction(selector => {
    const item = document.querySelector(selector);
    return item?.classList.contains('is-visible') && Number(getComputedStyle(item).opacity) > .99;
}, selector);

(async () => {
    fs.mkdirSync(screenshots, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    let cases = 0;
    try {
        for (const width of [1440, 390]) for (const motion of ['no-preference', 'reduce']) for (const route of routes) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: width === 390 ? 'dark' : 'light', reducedMotion: motion });
            await context.addInitScript(({ header, list }) => {
                window.__frames = [];
                const sample = () => {
                    const h = document.querySelector(header), l = document.querySelector(list);
                    if (h && l) window.__frames.push({
                        header: Number(getComputedStyle(h).opacity), list: Number(getComputedStyle(l).opacity),
                        pending: l.hasAttribute('data-public-pending'), revealed: l.classList.contains('is-visible'),
                    });
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            }, route);
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            let releaseScripts, releaseSite, releaseContent;
            const scripts = new Promise(resolve => releaseScripts = resolve);
            const site = new Promise(resolve => releaseSite = resolve);
            const content = new Promise(resolve => releaseContent = resolve);
            await page.route('**/_astro/*.js', async request => { await scripts; await request.continue(); });
            await page.route('**/api/public/**', async request => {
                const key = new URL(request.request().url()).pathname.split('/')[3];
                if (key === 'site-content') await site;
                if (key === route.api) await content;
                await request.continue();
            });
            try {
                await page.goto(base + route.path, { waitUntil: 'commit' });
                await page.locator(route.header).waitFor({ state: 'attached' });
                assert(await page.locator('html').evaluate(item => item.classList.contains('reveal-ready')), 'Hide before modules, never after a visible first paint');
                assert.equal(await page.locator(route.header).evaluate(item => Number(getComputedStyle(item).opacity)), 0);
                releaseScripts();
                await page.waitForTimeout(250);
                assert.equal(await page.locator(route.header).evaluate(item => item.classList.contains('is-visible')), false);
                releaseSite();
                await visible(page, route.header);
                assert.equal(await page.locator(route.list).evaluate(item => item.classList.contains('is-visible')), false, 'Do not spend the list animation while API content is hidden');
                await page.evaluate(selector => document.querySelector(selector).scrollIntoView({ block: 'start', behavior: 'instant' }), route.list);
                await page.waitForTimeout(100);
                releaseContent();
                await visible(page, route.list);
                const frames = await page.evaluate(() => window.__frames);
                assert(frames.length > 2);
                assert(!frames.some(frame => frame.pending && frame.revealed), 'Pending content must not already have its reveal consumed');
                if (motion === 'no-preference') {
                    assert(frames.some(frame => frame.header > .02 && frame.header < .98), 'Header genuinely transitions');
                    assert(frames.some(frame => !frame.pending && frame.list > .02 && frame.list < .98), 'Latest list genuinely transitions after API completion');
                } else {
                    assert.equal(await page.locator(route.list).evaluate(item => getComputedStyle(item).transform), 'none');
                }
                assert(await page.locator('#page-cover').isHidden());
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                assert.deepEqual(errors, []);
                await page.screenshot({ path: path.join(screenshots, `${route.api}-${width}-${motion}.png`) });
                cases++;
            } finally { releaseScripts(); releaseSite(); releaseContent(); await context.close(); }
        }
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: width === 390 ? 'dark' : 'light' });
            await context.addInitScript(() => {
                window.__detailFrames = [];
                const sample = () => {
                    const header = document.querySelector('.dynamic-post-page__header');
                    if (header) window.__detailFrames.push(Number(getComputedStyle(header).opacity));
                    requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            });
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(base + '/posts/', { waitUntil: 'domcontentloaded' });
            await visible(page, '#posts-list');
            let releaseDetail;
            const detail = new Promise(resolve => releaseDetail = resolve);
            await page.route('**/api/public/posts/*', async request => { await detail; await request.continue(); });
            try {
                await page.locator('[data-post-card]').first().click();
                await page.waitForTimeout(800);
                assert.equal(await page.locator('.dynamic-post-page__header').evaluate(item => item.classList.contains('is-visible')), false);
                releaseDetail();
                await visible(page, '.dynamic-post-page__header');
                assert((await page.evaluate(() => window.__detailFrames)).some(opacity => opacity > .02 && opacity < .98));
                await page.evaluate(() => document.querySelector('#post-content').scrollIntoView({ block: 'start', behavior: 'instant' }));
                await visible(page, '#post-content');
                assert.deepEqual(errors, []);
                await page.screenshot({ path: path.join(screenshots, `post-detail-${width}.png`) });
                cases++;
            } finally { releaseDetail(); await context.close(); }
        }
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: width === 390 ? 'dark' : 'light' });
            const page = await context.newPage(), assets = [], errors = [];
            page.on('request', request => { if (/lingxun-run-32-v\d+\.webp/.test(request.url())) assets.push(request.url()); });
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(base + '/gallery/', { waitUntil: 'domcontentloaded' });
            await visible(page, '#gallery-grid');
            let releaseImages;
            const images = new Promise(resolve => releaseImages = resolve);
            await page.route('**/*', async request => {
                if (request.request().resourceType() === 'image' && !request.request().url().includes('/logo')) await images;
                await request.continue();
            });
            try {
                await page.locator('.site-brand').click();
                await visible(page, '.hero-section__copy');
                assert.equal(await page.locator('html').getAttribute('data-load-mode'), 'inline');
                assert(await page.locator('#page-cover').isHidden());
                assert(await page.locator('.hero-section__portrait').evaluate(item => item.hasAttribute('data-media-pending') && !item.classList.contains('is-visible')));
                assert.equal(await page.locator('#hero-backdrop').evaluate(item => Number(getComputedStyle(item).opacity)), 0);
                releaseImages();
                await visible(page, '.hero-section__portrait');
                await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('hero-backdrop')).opacity) > .99);
                assert(await page.locator('#hero-portrait-image').evaluate(item => item.complete && item.naturalWidth > 0));
                assert.equal(assets.length, 0, 'Internal return never replays the runner');
                assert.deepEqual(errors, []);
                await page.screenshot({ path: path.join(screenshots, `home-return-${width}.png`) });
                cases++;
            } finally { releaseImages(); await context.close(); }
        }
        console.log(`PASS ${cases} delayed-script/API/media, real entry transitions, reduced-motion, no-flash home return and responsive scenarios.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
