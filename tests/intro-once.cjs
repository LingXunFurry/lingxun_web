const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
const sprite = /lingxun-run-32-v\d+\.webp/;

async function contextFor(browser, width=1440) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:width===390?'reduce':'no-preference'});
    await context.addInitScript(()=>{
        window.__readyAt=0;
        addEventListener('lingxun:page-ready',()=>{window.__readyAt=Date.now();});
    });
    return context;
}
async function ready(page) { await page.waitForFunction(()=>window.__readyAt>0,null,{timeout:15000}); }
async function intro(page,started) {
    assert.equal(await page.locator('html').getAttribute('data-load-mode'),'intro');
    assert(await page.locator('#page-cover').isVisible());
    await ready(page);await page.locator('#page-cover').waitFor({state:'hidden'});
    assert(Date.now()-started>=2000,'Homepage entry and refresh retain minimum display time');
}
async function inline(page) {
    assert.equal(await page.locator('html').getAttribute('data-load-mode'),'inline');
    assert(await page.locator('#page-cover').isHidden());
    assert.equal(await page.locator('#navbar').evaluate(element=>element.inert),false);
    assert.equal(await page.locator('.page-cover__runner').evaluate(element=>getComputedStyle(element).animationName),'none');
}

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    let cases=0;
    try {
        for(const width of [1440,390]) {
            const context=await contextFor(browser,width),page=await context.newPage(),errors=[];
            page.on('pageerror',error=>errors.push(error.message));
            const assets=[];page.on('request',request=>{if(sprite.test(request.url()))assets.push(request.url());});
            let release;const gate=new Promise(resolve=>release=resolve);
            const held=async route=>{await gate;await route.continue();};
            await page.route('**/api/public/**',held);
            const started=Date.now();await page.goto(base+'/',{waitUntil:'domcontentloaded'});
            assert.equal(await page.locator('html').getAttribute('data-load-mode'),'intro');
            assert(await page.locator('#page-cover').isVisible());
            await page.waitForTimeout(100);release();await ready(page);await page.locator('#page-cover').waitFor({state:'hidden'});
            assert(Date.now()-started>=2000,'First homepage entry retains minimum display time');
            assert.equal(await page.evaluate(()=>sessionStorage.getItem('lingxun-intro-seen')),'1');
            assert(assets.length>0);const introAssets=assets.length;
            await page.unroute('**/api/public/**',held);
            for(const route of ['/gallery/','/posts/','/friends/','/']) {
                await page.goto(base+route,{waitUntil:'domcontentloaded',referer:page.url()});await inline(page);await ready(page);
                assert.equal(assets.length,introAssets,'Do not request the running sprite during later navigation');
                cases++;
            }
            const refreshed=Date.now();await page.reload({waitUntil:'domcontentloaded'});
            await page.screenshot({path:`.local-backups/media-admin-screenshots/loading-refresh-${width}.png`});
            await intro(page,refreshed);
            assert(assets.length>introAssets,'Homepage refresh requests and replays the accepted animation');cases++;
            await page.goto('about:blank');
            const direct=Date.now();await page.goto(base+'/',{waitUntil:'domcontentloaded'});await intro(page,direct);cases++;
            const afterIntro=assets.length;
            let releaseAgain;const again=new Promise(resolve=>releaseAgain=resolve);
            await page.route('**/api/public/**',async route=>{await again;await route.continue();});
            await page.goto(base+'/posts/',{waitUntil:'domcontentloaded',referer:base+'/'});await inline(page);
            await page.waitForTimeout(100);const released=Date.now();releaseAgain();await ready(page);
            assert(await page.evaluate(()=>window.__readyAt)-released<1800,'Subpages do not impose a two-second wait');cases++;
            await page.reload({waitUntil:'domcontentloaded'});await inline(page);await ready(page);cases++;
            await page.goto(base+'/',{waitUntil:'domcontentloaded',referer:base+'/posts/'});await inline(page);await ready(page);
            await page.goto(base+'/gallery/',{waitUntil:'domcontentloaded',referer:base+'/'});await inline(page);await ready(page);
            await page.goBack({waitUntil:'domcontentloaded'});await inline(page);await ready(page);cases++;
            await page.goForward({waitUntil:'domcontentloaded'});await inline(page);await ready(page);cases++;
            assert.equal(assets.length,afterIntro,'Subpage reload, home links and history navigation never load the sprite');
            assert.deepEqual(errors,[]);await context.close();
        }
        {
            const context=await contextFor(browser),page=await context.newPage(),assets=[];
            page.on('request',request=>{if(sprite.test(request.url()))assets.push(request.url());});
            await page.goto(base+'/gallery/',{waitUntil:'domcontentloaded'});await inline(page);await ready(page);
            assert.equal(assets.length,0,'Direct subpage entry never downloads the character animation');cases++;
            await page.locator('.site-brand').click();await inline(page);await ready(page);assert.equal(assets.length,0);cases++;
            await page.route('**/api/public/posts*',route=>route.fulfill({status:503,json:{detail:'fixture outage'}}));
            await page.goto(base+'/posts/',{waitUntil:'domcontentloaded'});await inline(page);
            await page.locator('#page-load-status-retry').waitFor({state:'visible'});
            assert(await page.locator('[data-public-error]').count()>0);
            assert(await page.evaluate(()=>Array.from(document.querySelectorAll('[data-public-error]')).every(root=>Array.from(root.children).every(child=>getComputedStyle(child).visibility==='hidden'))),'Never reveal old static records after failure');
            await page.unroute('**/api/public/posts*');
            await page.locator('#page-load-status-retry').click();await inline(page);await ready(page);cases++;
            await context.close();
        }
        {
            const context=await contextFor(browser),page=await context.newPage(),errors=[];
            await context.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
            page.on('pageerror',error=>errors.push(error.message));
            await page.goto(base+'/',{waitUntil:'domcontentloaded'});assert.equal(await page.locator('html').getAttribute('data-load-mode'),'intro');await ready(page);
            const refreshed=Date.now();await page.reload({waitUntil:'domcontentloaded'});await intro(page,refreshed);
            assert.deepEqual(errors,[]);cases++;await context.close();
        }
        console.log(`PASS ${cases} first-entry, navigation, refresh, no sprite fetch, no secondary minimum delay, direct-subpage, failure/retry and blocked-storage cases.`);
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
