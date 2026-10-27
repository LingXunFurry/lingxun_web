const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8016';
(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    try{
        const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'}),page=await context.newPage();
        await page.goto(base+'/',{waitUntil:'domcontentloaded',referer:base+'/friends/'});
        await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-site-content-pending')&&!document.querySelector('[data-public-pending]'));
        await page.evaluate(()=>document.fonts.ready);
        await page.mouse.move(50,350);await page.mouse.wheel(0,600);
        for(let index=0;index<5;index++)await page.mouse.wheel(0,600);
        await page.waitForTimeout(350);
        assert(await page.locator('#character-section').evaluate(item=>Math.abs(item.getBoundingClientRect().top-76)<3),'A wheel burst advances exactly one scene');
        await page.mouse.wheel(0,-600);await page.waitForTimeout(350);
        assert(await page.evaluate(()=>scrollY<3),'Up returns to the previous scene');
        const heights=()=>page.locator('.home-page > section:not(.egg-section)').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
        const before=await heights();
        await page.locator('#entry-trigger').click({clickCount:3});
        await page.waitForFunction(()=>document.getElementById('egg-dashboard').classList.contains('is-ready'));
        await page.waitForTimeout(200);assert.deepEqual(await heights(),before,'Opening the room never resizes earlier scenes');
        await page.evaluate(()=>document.getElementById('easter-egg-section').scrollIntoView({block:'start',behavior:'instant'}));
        const y=await page.evaluate(()=>scrollY);await page.mouse.move(50,350);await page.mouse.wheel(0,150);
        await page.waitForFunction(previous=>scrollY>previous,y);
        assert(await page.evaluate(previous=>scrollY-previous<300,y),'Room scrolling is native, not one-scene snapping');
        await page.locator('#close-egg-button').click();
        await page.waitForFunction(()=>document.getElementById('easter-egg-section').classList.contains('hidden'));
        assert.deepEqual(await heights(),before);assert.equal(await page.evaluate(()=>document.activeElement.id),'entry-trigger');
        console.log('PASS desktop one-wheel scene, burst lock, reverse, stable scene heights and free room scroll/return.');
        await context.close();
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
