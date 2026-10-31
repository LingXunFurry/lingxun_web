const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8020';
const output = path.resolve(__dirname, '../.local-backups/error-screenshots');
fs.mkdirSync(output, { recursive: true });
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of process.env.THEME_WIDTH ? [Number(process.env.THEME_WIDTH)] : [320, 390, 767, 768, 1440]) for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768 });
            await context.addInitScript(theme => localStorage.setItem('lingxun-theme', theme), theme);
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            for (const route of ['/', '/gallery/', '/friends/', '/posts/', '/aa']) {
                await page.goto(base + route, { waitUntil: 'networkidle' });
                const mobile = width < 768;
                const selector = mobile ? '#mobile-theme-toggle' : '#theme-toggle';
                const toggle = page.locator(selector);
                assert(await toggle.isVisible(), 'theme is available without opening a menu');
                assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'), 'false');
                if (mobile) {
                    assert.equal(await page.locator('#mobile-menu #mobile-theme-toggle').count(), 0, 'no duplicated menu control');
                    assert.equal((await toggle.textContent()).trim(), '', 'mobile control is icon only');
                    const bounds = await page.evaluate(() => {
                        const brand = document.querySelector('.site-brand').getBoundingClientRect();
                        const actions = document.querySelector('.site-nav__mobile-actions').getBoundingClientRect();
                        return { brand: brand.right, actions: actions.left, right: actions.right };
                    });
                    assert(bounds.brand + 4 <= bounds.actions, 'brand and controls cannot overlap');
                    assert(bounds.right <= width, 'controls must remain within viewport');
                    assert(!await page.locator('#theme-toggle').isVisible());
                } else assert(!await page.locator('#mobile-theme-toggle').isVisible());
                const shape = await page.locator(selector).evaluate(el => ({ radius: getComputedStyle(el).borderRadius, height: el.getBoundingClientRect().height }));
                assert.equal(shape.radius, '16px', `${route} ${width} ${theme}`);
                assert(shape.height >= 44);
                const next = theme === 'light' ? 'dark' : 'light';
                await toggle.click();
                assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), next);
                assert.equal(await page.evaluate(() => localStorage.getItem('lingxun-theme')), next);
                assert.equal(await toggle.getAttribute('aria-label'), next === 'light' ? '切换至夜间模式' : '切换至白天模式');
                assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'), 'false', 'switching theme does not open navigation');
                await page.waitForFunction(({ selector, next }) => getComputedStyle(document.querySelector(`${selector} .theme-icon__${next === 'dark' ? 'sun' : 'moon'}`)).opacity === '1', { selector, next });
                await toggle.press('Enter');
                assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, 'keyboard activation');
                if (mobile) {
                    await page.locator('#mobile-menu-btn').click();
                    assert(await toggle.isVisible());
                    assert(await page.locator('#mobile-contact-btn').isVisible());
                    await page.locator('#mobile-menu-btn').press('Escape');
                    assert.equal(await page.locator('#mobile-menu-btn').getAttribute('aria-expanded'), 'false');
                }
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                if (width === 320 && ['/', '/aa'].includes(route)) {
                    await page.evaluate(() => document.activeElement?.blur());
                    await page.waitForTimeout(300);
                    await page.locator('#navbar').screenshot({ path: path.join(output, `mobile-theme-${route === '/' ? 'home' : '404'}-${theme}.png`) });
                }
            }
            assert.deepEqual(errors, []);
            console.log('PASS direct icon theme toggle, keyboard/menu, no overlap, shared shape: 5 pages', width, theme);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
