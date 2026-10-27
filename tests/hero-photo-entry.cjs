const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const output = path.resolve(__dirname, '../.local-backups/hero-entry-screenshots');
const photos = [1, 2, 3].map(id => ({ id, title: '旅途留影 ' + id, location: id === 1 ? '城镇' : '', file_url: '/logo.png?hero=' + id, is_home_hero: true, hero_order: id, is_visible: true }));
const ready = page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-site-content-pending') && !document.querySelector('[data-public-pending]'));

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    let cases = 0;
    try {
        for (const width of [1440, 1024, 768, 390, 360]) for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/api/public/gallery', route => route.fulfill({ json: photos }));
            await page.goto(base + '/', { referer: base + '/gallery/', waitUntil: 'domcontentloaded' });
            await ready(page);await page.evaluate(() => document.fonts.ready);
            assert.equal(await page.locator('.hero-section .scene-ornament').count(), 0, 'First scene has no registry ornaments');
            assert.equal(await page.locator('#hero-photo-position').innerText(), '01 / 03');
            assert.equal(await page.locator('#hero-current-caption').count(), 0, 'Only playback order, not the filename');
            assert.equal(await page.locator('#hero-photo-toggle').getAttribute('aria-pressed'), 'true');
            await page.locator('#hero-photo-next').click();
            await page.waitForFunction(() => document.getElementById('hero-photo-position').textContent === '02 / 03');
            assert.equal(await page.locator('.carousel-img.is-active').count(), 1);
            assert((await page.locator('.carousel-img.is-active').getAttribute('src')).includes('hero=2'));
            await page.locator('#hero-photo-prev').click();
            await page.waitForFunction(() => document.getElementById('hero-photo-position').textContent === '01 / 03');
            await page.locator('#hero-photo-prev').click();
            await page.waitForFunction(() => document.getElementById('hero-photo-position').textContent === '03 / 03');
            const controls = page.locator('.hero-section__moments');
            await controls.scrollIntoViewIfNeeded();
            for (const button of await controls.locator('button').all()) {
                const box = await button.boundingBox();
                assert(box.width >= 44 && box.height >= 44);
                assert(await button.evaluate(item => { const r = item.getBoundingClientRect();return item.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
            }
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
            await page.screenshot({ path: path.join(output, `hero-${width}-${theme}.png`) });
            assert.deepEqual(errors, []);
            await context.close();cases++;
        }
        for (const motion of ['reduce', 'no-preference']) {
            const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion });
            const page = await context.newPage();
            await page.route('**/api/public/gallery', route => route.fulfill({ json: photos }));
            if (motion === 'no-preference') await page.route('**/logo.png?hero=3', route => route.fulfill({ status: 404, body: '' }));
            await page.goto(base + '/', { referer: base + '/posts/' });await ready(page);
            await page.waitForFunction(() => document.getElementById('page-cover').dataset.state === 'ready');
            await page.waitForFunction(() => document.querySelector('.hero-section__moments').classList.contains('is-visible'));
            assert.equal(await page.evaluate(() => scrollY), 0, 'Controls enter without scrolling');
            await page.waitForTimeout(6800);
            assert.equal(await page.locator('#hero-photo-position').innerText(), motion === 'reduce' ? '01 / 03' : '02 / 03');
            if (motion === 'no-preference') {
                await page.locator('#hero-photo-toggle').click();
                const paused = await page.locator('#hero-photo-position').innerText();
                await page.waitForTimeout(6800);
                assert.equal(await page.locator('#hero-photo-position').innerText(), paused);
                await page.mouse.move(1200, 400);
                assert.notEqual(await page.locator('.hero-section').evaluate(item => item.style.getPropertyValue('--hero-shift-x')), '0px');
                await page.emulateMedia({ reducedMotion: 'reduce' });
                assert.equal(await page.locator('.carousel-img.is-active').evaluate(item => getComputedStyle(item).transform), 'none');
                await page.locator('#hero-photo-next').click();await page.waitForTimeout(200);
                assert.equal(await page.locator('#hero-photo-position').innerText(), paused, 'Failed photo does not replace the current image');
            }
            await context.close();cases++;
        }
        for (const height of [650, 900, 1080]) for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width: 1440, height }, colorScheme: theme });
            const page = await context.newPage();
            await page.route('**/api/public/gallery', route => route.fulfill({ json: photos }));
            await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
            await page.locator('#page-cover').waitFor({ state: 'hidden' });
            await page.waitForFunction(() => {
                const element = document.querySelector('.hero-section__moments'), rect = element.getBoundingClientRect();
                return element.classList.contains('is-visible') && +getComputedStyle(element).opacity > .99 && rect.top >= 0 && rect.bottom <= innerHeight;
            });
            assert.equal(await page.evaluate(() => scrollY), 0, 'First entry reveals bottom controls without a wheel event');
            await page.screenshot({ path: path.join(output, `first-entry-${height}-${theme}.png`) });
            await context.close();cases++;
        }
        console.log(`PASS ${cases} photo-led first-scene cases: first-entry controls without scrolling across viewport heights, order without filenames, navigation/wrap, autoplay/pause, reduced motion, parallax and failed-photo preservation.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
