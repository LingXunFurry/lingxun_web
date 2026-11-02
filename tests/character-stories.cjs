const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8021';
const output = path.resolve(__dirname, '../.design/characters-20261102/screens');
fs.mkdirSync(output, { recursive: true });

async function ready(page) {
    await page.locator('#page-cover').waitFor({state:'hidden',timeout:45000});
    await page.waitForFunction(() => document.querySelectorAll('#character-tabs [role=tab]').length >= 2 && document.querySelectorAll('#story-tabs [role=tab]').length >= 2);
    await page.evaluate(() => document.fonts.ready);
}
async function stage(page, id) {
    await page.locator(id).evaluate(el => window.scrollTo({top:el.getBoundingClientRect().top + scrollY - 76, behavior:'instant'}));
    await page.waitForTimeout(550);
}
async function switchAndMeasure(page, tab, panel, name) {
    const scroll = await page.evaluate(()=>scrollY);
    await page.evaluate(() => {
        window.__overflow = [];
        window.__measureSwitch = true;
        function frame() {
            for (const el of document.querySelectorAll('#character-section, #character-section .site-container, #character-profile, #story-section, #story-page, .story-book')) {
                if (el.scrollWidth > el.clientWidth + 1) window.__overflow.push({el:el.id || el.className, scroll:el.scrollWidth, client:el.clientWidth});
            }
            if (document.documentElement.scrollWidth > innerWidth + 1) window.__overflow.push({el:'document'});
            if (window.__measureSwitch) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    });
    await page.locator(tab).click();
    await page.waitForFunction(({panel,name}) => document.querySelector(panel).getAttribute('aria-busy') !== 'true' && document.querySelector(panel).textContent.includes(name), {panel,name});
    const overflow = await page.evaluate(() => {window.__measureSwitch=false;return window.__overflow;});
    assert.deepEqual(overflow, [], 'no horizontal overflow, including transition frames');
    const after=await page.evaluate(()=>scrollY);
    if(Math.abs(after-scroll)>2) await page.screenshot({path:path.join(output,'scroll-failure.png')});
    assert(Math.abs(after-scroll)<=2,`switch must not jump to another scene: ${scroll} -> ${after} ${tab}`);
}
(async () => {
    const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
    try {
        for (const [width,height] of [[1440,900],[1366,768],[1280,600],[390,844],[320,740]]) for (const theme of ['dark','light']) {
            const context = await browser.newContext({viewport:{width,height},hasTouch:width<800});
            await context.addInitScript(theme => localStorage.setItem('lingxun-theme', theme), theme);
            const page=await context.newPage(), errors=[];
            page.on('pageerror', error=>errors.push(error.message));
            await page.goto(base+'/',{waitUntil:'domcontentloaded'}); await ready(page);
            await stage(page,'#character-section');
            await switchAndMeasure(page,'#character-tabs [role=tab]:nth-child(2)','#character-profile','震烁');
            assert.equal(await page.locator('.dossier-portrait__empty').count(),1,'empty portrait retained');
            if(width>=900) {
                assert(await page.locator('.character-roster').evaluate(el=>{
                    const roster=el.getBoundingClientRect();
                    return [...document.querySelectorAll('.dossier-lead,.dossier-facts,.dossier-notes')].every(item=>{
                        const b=item.getBoundingClientRect();return roster.bottom<=b.top || roster.top>=b.bottom || roster.right<=b.left || roster.left>=b.right;
                    });
                }),'thumbnail navigator cannot overlap body text');
            }
            await page.screenshot({path:path.join(output,`character-${width}-${theme}.png`)});
            assert.equal(await page.locator('.dossier-footer').count(),0);
            assert.equal(await page.locator('#character-story-jump').count(),0);
            if(width>=900) assert(await page.locator('#character-section').evaluate(el=>el.querySelector('.character-stage').getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom+1));
            await page.locator('#character-tabs [role=tab]:first-child').focus();
            await page.keyboard.press('End');
            await page.waitForFunction(()=>document.querySelector('#character-profile').getAttribute('aria-busy')!=='true');
            assert.equal(await page.locator('#character-tabs [aria-selected=true]').getAttribute('aria-label').then(v=>v.includes('震烁')),true);
            // Rapid requests must settle on the last selected record.
            await page.evaluate(()=>{
                const tabs=document.querySelectorAll('#character-tabs button'); tabs[0].click();tabs[1].click();tabs[0].click();tabs[1].click();
            });
            await page.waitForFunction(()=>document.querySelector('#character-profile').getAttribute('aria-busy')!=='true');
            assert((await page.locator('#character-title').textContent()).includes('震烁'));
            await stage(page,'#story-section');
            const bookBefore = await page.locator('.story-book').boundingBox();
            await switchAndMeasure(page,'#story-tabs [role=tab]:nth-child(2)','#story-page','震烁的故事');
            const bookAfter = await page.locator('.story-book').boundingBox();
            assert.equal(bookAfter.height,bookBefore.height,'book never changes height between stories');
            assert.equal(bookAfter.width,bookBefore.width,'book never changes width between stories');
            assert.equal(await page.locator('.story-book img').count(),0,'book has no image');
            assert.equal(await page.locator('.story-book__pagination').count(),0);
            assert.equal(await page.locator('#story-tabs .record-tab__preview').count(),2);
            assert.equal(await page.locator('.record-tab__name').count(),0);
            if(width<721) assert.equal(await page.locator('.story-selection-controls > #story-prev, .story-selection-controls > #story-next').count(),2);
            else assert.equal(await page.locator('.story-switch-arrows > button').count(),2);
            assert.equal(await page.locator('#story-excerpt-links a').count(),1);
            await page.screenshot({path:path.join(output,`story-${width}-${theme}.png`)});
            const bounds=await page.locator('#story-section').evaluate(el=>({bottom:el.getBoundingClientRect().bottom, footer:el.querySelector('.story-book').getBoundingClientRect().bottom}));
            if(width>=900) assert(bounds.footer<=bounds.bottom+1,`story footer fits ${width}`);
            await page.locator('#story-read').click();
            await page.locator('#chapter-heading').waitFor({state:'visible'});
            assert((await page.locator('#post-content').textContent()).includes('雷族古籍'));
            assert.equal(await page.locator('#chapter-nav-top').isVisible(),true);
            assert.equal(await page.locator('#chapter-nav-bottom').isVisible(),true);
            assert.equal(await page.locator('#story-contents [aria-current=page]').count(),1);
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await page.screenshot({path:path.join(output,`chapter-${width}-${theme}.png`)});
            await page.goto(base+'/post/?slug=post-lingxun-s_story#story-chapter-2');
            await page.locator('#dynamic-post').waitFor({state:'visible'});
            assert(await page.locator('#post-content h2').count()>=10,'legacy full text and headings survive');
            assert.deepEqual(errors,[]);
            console.log('PASS character/story/reader',width,height,theme);
            await context.close();
        }
        const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}), page=await context.newPage();
        await page.goto(base+'/');await ready(page);
        await page.locator('#character-tabs button').last().click();
        await page.waitForFunction(()=>document.querySelector('#character-title').textContent.includes('震烁'));
        assert((await page.locator('#character-title').textContent()).includes('震烁'));
        assert.equal(await page.locator('#character-profile').evaluate(el=>el.getAnimations().length),0);
        await context.close();
        console.log('PASS reduced motion');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
