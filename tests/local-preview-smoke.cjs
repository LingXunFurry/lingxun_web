const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8016';
(async()=>{
    const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    try {
        const posts = await (await fetch(base+'/api/public/posts')).json();
        const routes = ['/','/gallery/','/posts/','/friends/',...(posts.length?['/post/?slug='+encodeURIComponent(posts[0].slug)]:[])];
        for(const width of [1440,390]) {
            const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
            const page=await context.newPage(),errors=[];
            page.on('pageerror',error=>errors.push(error.message));
            for(const route of routes) {
                await page.goto(base+route,{waitUntil:'domcontentloaded'});
                await page.locator('#page-cover').waitFor({state:'hidden',timeout:45000});
                assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow: '+route);
                assert(await page.evaluate(()=>!document.documentElement.hasAttribute('data-site-content-pending')));
                console.log('PASS actual local API',width,route);
            }
            assert.deepEqual(errors,[]);
            await page.screenshot({path:path.resolve(__dirname,'../.local-backups/media-admin-screenshots',`actual-post-${width}.png`)});
            await context.close();
        }
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
