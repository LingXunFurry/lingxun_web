const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const baseline = process.argv.includes('--baseline');
const output = path.resolve(__dirname, '../.local-backups/atmosphere-screenshots', baseline ? 'before' : 'after');
const reference = path.resolve(__dirname, '../.local-backups/atmosphere-reference.json');
const scenes = [
    ['home', '.hero-section'], ['character', '#character-section', 'tavern-wind.svg'], ['story', '#story-section', 'tavern-book.svg'],
    ['photos', '.home-gallery-section', 'tavern-photo.svg'], ['notes', '.home-feed-section', 'tavern-notice.svg'], ['contact', '.final-section', 'tavern-map.svg'],
];
const data = async endpoint => {
    const response = await fetch(base + '/api/public/' + endpoint);
    assert(response.ok);return response.json();
};
const ready = page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-site-content-pending') && !document.querySelector('[data-public-pending]'));
const scrollTo = async (page, selector) => {
    await page.evaluate(selector => window.scrollTo({ top: document.querySelector(selector).getBoundingClientRect().top + scrollY - 76, behavior: 'instant' }), selector);
    await page.waitForTimeout(100);
};

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const frozen = { schedules: await data('schedules'), socials: await data('socials') };
    if (baseline) fs.writeFileSync(reference, JSON.stringify(frozen, null, 2));
    else assert.deepEqual(frozen, JSON.parse(fs.readFileSync(reference, 'utf8')), 'Schedule and contact data stay byte-for-byte equivalent');
    const posts = await data('posts');
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    let shots = 0;
    try {
        for (const width of baseline ? [1440] : [1440, 390]) for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
            const page = await context.newPage(), errors = [], failures = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('response', response => { if (response.url().includes('/images/decor/') && !response.ok()) failures.push(response.url()); });
            const screenshot = async name => {
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow: ' + name);
                if (!baseline) assert(await page.locator('.scene-ornament').evaluateAll(items => items.every(item => item.getAttribute('aria-hidden') === 'true' && getComputedStyle(item).pointerEvents === 'none' && getComputedStyle(item).animationName === 'none' && item.querySelectorAll('a,button,input,[tabindex]').length === 0)), 'Ornaments never enter the focus order or intercept controls');
                await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`) });shots++;
            };
            await page.goto(base + '/', { waitUntil: 'domcontentloaded', referer: base + '/gallery/' });await ready(page);
            await page.locator('#page-cover').waitFor({ state: 'hidden' });await page.evaluate(() => document.fonts.ready);
            for (const [name, selector, motif] of scenes) {
                await scrollTo(page, selector);
                await page.waitForFunction(selector => Array.from(document.querySelector(selector).querySelectorAll('[data-reveal]')).filter(item => {
                    const rect = item.getBoundingClientRect();return rect.top < innerHeight * .94 && rect.bottom > 0;
                }).every(item => item.classList.contains('is-visible')), selector);
                if (!baseline && name !== 'home') {
                    assert.equal(await page.locator(`${selector} > .scene-ornament`).count(), 1);
                    const decor = await page.locator(selector).evaluate(item => {
                        const style = getComputedStyle(item, '::before');
                        return { mask: style.maskImage, pointer: style.pointerEvents, animation: style.animationName };
                    });
                    assert(decor.mask.includes(motif));assert.equal(decor.pointer, 'none');assert.equal(decor.animation, 'none');
                }
                assert.equal(await page.locator('.scene-ornament__folio,.scene-ornament__binding').count(),0,'No Roman numerals or old metal rail');
                await screenshot(name);
            }
            const socials = await page.locator('#social-list a').evaluateAll(items => items.map(item => item.getAttribute('href')));
            assert.deepEqual(socials, frozen.socials.map(item => item.link));
            await page.locator('#entry-trigger').click({ clickCount: 3 });
            await page.locator('#egg-dashboard').waitFor({ state: 'visible', timeout: 15000 });
            await page.waitForFunction(() => document.getElementById('egg-loader').classList.contains('is-hidden'), null, { timeout: 15000 });
            await page.waitForTimeout(200);
            await scrollTo(page, '#easter-egg-section');await screenshot('egg');
            if(!baseline){
                for(const selector of ['.egg-card--dates','.egg-card--message','.egg-card--quest']){
                    await page.locator(selector).scrollIntoViewIfNeeded();
                    await page.waitForFunction(selector=>document.querySelector(selector).classList.contains('is-visible'),selector);
                }
                await page.locator('#easter-egg-section').screenshot({path:path.join(output,`egg-full-${width}-${theme}.png`),style:'#navbar { visibility: hidden !important; }'});shots++;
            }
            await page.locator('#close-egg-button').click();
            const motifs=new Set();
            for (const route of ['/gallery/', '/posts/', '/friends/', ...(posts.length ? ['/post/?slug=' + encodeURIComponent(posts[0].slug)] : [])]) {
                await page.goto(base + route, { waitUntil: 'domcontentloaded', referer: base + '/' });await ready(page);
                await page.evaluate(() => document.fonts.ready);await page.waitForTimeout(100);
                if (!baseline) {
                    assert.equal(await page.locator('main').evaluate(item => getComputedStyle(item, '::before').pointerEvents), 'none');
                    assert.equal(await page.locator('main').evaluate(item => getComputedStyle(item, '::before').animationName), 'none');
                    motifs.add(await page.locator('main').evaluate(item=>getComputedStyle(item,'::before').maskImage));
                    const color=await page.locator('main').evaluate(item=>getComputedStyle(item,'::before').backgroundColor);
                    const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number);
                    assert(theme==='dark'?rgb[0]>rgb[1]&&rgb[1]>rgb[2]:rgb[0]<rgb[1]&&rgb[1]<rgb[2],'Gold night lines and steel/ink daylight lines');
                }
                await screenshot(route.split('/')[1] || 'home');
            }
            if(!baseline)assert.equal(motifs.size,posts.length?4:3,'Different pages have distinct background compositions, not color swaps');
            if (!baseline) {
                const previousWind = await page.locator('main').evaluate(item => getComputedStyle(item, '::before').backgroundColor);
                if (width === 390) await page.locator('#mobile-menu-btn').click();
                await page.locator(width === 390 ? '#mobile-theme-toggle' : '#theme-toggle').click();
                assert.equal(await page.locator('html').getAttribute('data-theme'), theme === 'light' ? 'dark' : 'light');
                await page.waitForFunction(previous => getComputedStyle(document.querySelector('main'), '::before').backgroundColor !== previous, previousWind);
                if (width === 390) await page.locator('#mobile-menu-btn').click();
                await page.emulateMedia({ forcedColors: 'active' });
                assert.equal(await page.locator('main').evaluate(item => getComputedStyle(item, '::before').display), 'none');
                assert.equal(await page.locator('.scene-ornament').evaluate(item => getComputedStyle(item).display), 'none');
            }
            assert.deepEqual(errors, []);assert.deepEqual(failures, []);
            await context.close();
        }
        console.log(`PASS ${shots} ${baseline ? 'baseline' : 'themed desktop/mobile'} screenshots, invariant contact/schedule data, no overflow, no decoration hit targets or continuous motion.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
