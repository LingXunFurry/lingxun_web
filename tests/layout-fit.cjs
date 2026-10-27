const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const output = path.resolve(__dirname, '../.local-backups/release-20261027/layout-fit-screenshots');
const description = '这是一段较长的手记摘要，应该在这一幕中省略显示，完整文章仍然可以打开阅读。'.repeat(25);
const posts = [0, 1, 2].map(index => ({ id: 900 + index, slug: 'layout-check-' + index, title: index === 1 ? '网站全新升级：凌巽的酒馆上线与旅途记录' : '凌巽的城镇生活记录', desc: description, date: '2026.10.27', tag: 'UPDATE', is_pinned: index < 2, cover_url: index ? '/logo.png' : null, image_urls: [], content: description }));
const friends = [
    { id: 901, display_id: '寒曜', avatar_url: '/logo.png', url: 'https://hanyao.me/', comment: '站主的对象，一只银白色的小狼，背后有帅气的披风，还有胸前的珠宝挂饰。'.repeat(4) },
    { id: 902, display_id: 'AReallyLongTravellerNameWithoutSpaces'.repeat(4), avatar_url: '/logo.png', url: 'https://example.com/', comment: '介绍：https://example.com/' + 'LongUnbrokenAddress'.repeat(40) },
];
const ready = page => page.waitForFunction(() => !document.documentElement.hasAttribute('data-site-content-pending') && !document.querySelector('[data-public-pending]'));

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    let cases = 0;
    try {
        for (const theme of ['light', 'dark']) {
            const context = await browser.newContext({ reducedMotion: 'reduce', colorScheme: theme });
            const page = await context.newPage();
            page.setDefaultTimeout(120000);
            await page.route('**/api/public/posts', route => route.fulfill({ json: posts }));
            await page.route('**/api/public/friends', route => route.fulfill({ json: friends }));
            for (const [width, height] of [[1024, 480], [1024, 600], [1280, 720], [1440, 900], [1464, 806], [1920, 1080], [2196, 1100]]) {
                await page.setViewportSize({ width, height });
                await page.goto(base + '/', { referer: base + '/friends/', waitUntil: 'domcontentloaded' });await ready(page);await page.evaluate(() => document.fonts.ready);
                await page.evaluate(() => scrollTo({ top: document.querySelector('.home-feed-section').getBoundingClientRect().top + scrollY - 76, behavior: 'instant' }));
                await page.waitForTimeout(100);
                const measurements = await page.locator('.home-feed-section').evaluate(section => {
                    const inner = section.querySelector('.home-feed-section__inner');
                    const footer = section.querySelector('.home-feed-section__footer').getBoundingClientRect();
                    return { top: section.getBoundingClientRect().top, bottom: section.getBoundingClientRect().bottom, scrollHeight: inner.scrollHeight, clientHeight: inner.clientHeight, overflow: getComputedStyle(inner).overflowY, footerBottom: footer.bottom, cards: Array.from(section.querySelectorAll('.note-card')).map(card => {
                        const rect = card.getBoundingClientRect(), summary = card.querySelector('p'), more = card.querySelector('.note-card__more').getBoundingClientRect();
                        return { top: rect.top, bottom: rect.bottom, moreBottom: more.bottom, clamp: getComputedStyle(summary).webkitLineClamp, clipped: summary.scrollHeight > summary.clientHeight + 1, imageHeight: card.querySelector('.note-card__cover')?.getBoundingClientRect().height };
                    }) };
                });
                assert(Math.abs(measurements.top - 76) < 2);
                assert.equal(measurements.overflow, 'visible');
                assert(measurements.scrollHeight <= measurements.clientHeight + 1, 'No inner scroll: ' + JSON.stringify({ width, height, measurements }));
                assert(measurements.footerBottom <= height + 1, 'Footer remains in the scene');
                for (const card of measurements.cards) {
                    assert(card.bottom < height && card.moreBottom <= card.bottom);
                    assert(+card.clamp >= 1 && card.clipped, 'Long summary has a real line clamp');
                    if (card.imageHeight != null) assert(card.imageHeight >= 20, 'Cover remains visible');
                }
                assert.equal(await page.locator('#homepage-post-grid p').first().textContent(), description, 'Only presentation is shortened');
                await page.screenshot({ path: path.join(output, `feed-${width}-${height}-${theme}.png`) });
                await page.mouse.move(10, height / 2);await page.mouse.wheel(0, 600);await page.waitForTimeout(350);
                assert(await page.locator('.final-section').evaluate(item => Math.abs(item.getBoundingClientRect().top - 76) < 2), 'One wheel leaves the whole feed scene');
                cases++;
            }
            await context.close();
            const mobileContext = await browser.newContext({ reducedMotion: 'reduce', colorScheme: theme, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
            const mobilePage = await mobileContext.newPage();
            mobilePage.setDefaultTimeout(120000);
            await mobilePage.route('**/api/public/friends', route => route.fulfill({ json: friends }));
            for (const width of [320, 360, 390, 412, 430, 480, 620]) for (const fontSize of [16, 20]) {
                await mobilePage.setViewportSize({ width, height: 900 });
                await mobilePage.goto(base + '/friends/', { referer: base + '/', waitUntil: 'domcontentloaded' });await ready(mobilePage);
                await mobilePage.evaluate(() => document.fonts.ready);
                await mobilePage.evaluate(fontSize => document.documentElement.style.fontSize = fontSize + 'px', fontSize);
                const cards = await mobilePage.locator('.friend-card').evaluateAll(items => items.map(card => {
                    const rect = card.getBoundingClientRect(), note = card.querySelector('.friend-card__note p'), arrow = card.querySelector('.friend-card__arrow').getBoundingClientRect();
                    return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: card.scrollWidth, clientWidth: card.clientWidth, arrowRight: arrow.right, textWidth: note.scrollWidth, textClient: note.clientWidth, textHeight: note.scrollHeight, textClientHeight: note.clientHeight };
                }));
                for (const card of cards) {
                    assert(card.left >= 0 && card.right <= width + 1, 'Card border fits viewport: ' + JSON.stringify({ width, fontSize, card }));
                    assert(card.scrollWidth <= card.clientWidth + 1 && card.textWidth <= card.textClient + 1, 'No clipped text or intrinsic overflow');
                    assert(card.arrowRight <= card.right && card.textHeight <= card.textClientHeight + 1, 'Arrow and complete introduction fit');
                }
                assert.deepEqual(await mobilePage.locator('.friend-card').evaluateAll(items => items.map(item => item.getAttribute('href'))), friends.map(friend => friend.url));
                if ([320, 390, 430].includes(width)) await mobilePage.screenshot({ path: path.join(output, `friends-${width}-${fontSize}-${theme}.png`) });
                cases++;
            }
            await mobileContext.close();
        }
        console.log(`PASS ${cases} themed desktop scene-fit and narrow/large-text friend-card cases: no nested scroll, visible covers/footer, ellipsis without content deletion, complete mobile cards and unchanged links.`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
