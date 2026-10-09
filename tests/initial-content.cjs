const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const project = path.resolve(__dirname, '..');

async function checkRequests() {
    const esbuild = require(path.join(project, 'node_modules/esbuild'));
    const code = esbuild.transformSync(fs.readFileSync(path.join(project, 'src/lib/publicContent.ts'), 'utf8'), {loader:'ts',format:'cjs'}).code;
    let calls = 0, release, options;
    const pending = new Promise(resolve => release = resolve);
    const region = {attributes:new Set(['data-public-pending','aria-busy']),removeAttribute(name){this.attributes.delete(name);}};
    const context = {module:{exports:{}},AbortController,window:{location:{port:'8123',hostname:'localhost',origin:'http://localhost:8123'},setTimeout,clearTimeout},document:{readyState:'complete',documentElement:{dataset:{}},querySelectorAll:()=>[region]},fetch:async (url, init)=>{calls++;options=init;await pending;return {ok:true,json:async()=>[]};}};
    vm.runInNewContext(code, context);
    const api = context.module.exports, first = api.fetchPublic('/api/public/gallery');
    assert.equal(first, api.fetchPublic('/api/public/gallery'));assert.equal(calls,1);assert.equal(options.cache,'no-store');
    release();assert.equal((await first).length,0);
    await api.fetchPublic('/api/public/gallery');assert.equal(calls,2,'Only in-flight requests are reused');
    let renderDone;const rendering = new Promise(resolve=>renderDone=resolve);
    api.initPublicContent('#region',()=>rendering);assert(region.attributes.has('data-public-pending'));
    renderDone();await new Promise(resolve=>setImmediate(resolve));assert.equal(region.attributes.size,0);
    context.fetch=async()=>{throw new Error('offline');};assert.equal(await api.fetchPublic('/api/public/posts'),null);
    let timeoutRequested;context.window.setTimeout=(fn,ms)=>{timeoutRequested=ms;return setTimeout(fn,0);};
    context.fetch=(url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    assert.equal(await api.fetchPublic('/api/public/posts'),null);assert.equal(timeoutRequested,10000);
}

async function checkBrowser() {
    const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const root = path.join(project, 'dist'), screenshots = process.env.SCREENSHOT_DIR || path.join(project,'.local-backups/initial-content-screenshots');
    fs.mkdirSync(screenshots,{recursive:true});
    const server = http.createServer((req,res)=>{
        const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''), file = path.resolve(root,relative||'index.html');
        if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
        try{
            const target=fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
            const ext=path.extname(target);res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.otf':'font/otf','.woff2':'font/woff2'}[ext]||'application/octet-stream');
            fs.createReadStream(target).pipe(res);
        }catch{res.writeHead(404);res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const photo=id=>({id,title:'当前照片'+id,file_url:'/logo.png?current='+id,description:'新资料',category:'当前分类',character_ids:[],is_home_hero:true,is_home_portrait:id===9001,is_home_gallery:true,hero_order:id,home_order:id});
    const post={id:9001,title:'当前后台手记',slug:'current-note',date:'2026.10.09',desc:'新的手记摘要',tag:'更新',content:'## 第一章\n\n新正文',is_published:true,is_pinned:true,story_summary:'新故事'};
    const fixture={gallery:[photo(9001),photo(9002)],posts:[post],stories:[post],characters:[{id:9001,name:'当前登记',alias:'Lingxun',species:'风龙',role:'法师',region:'城镇',work:'委托',places:'家',status:'休息',introduction:'当前资料',details:'',image_url:'/logo.png',custom_fields:[]}],socials:[],schedules:[],friends:[],'site-content':[{key:'hero.title_main',value:'当前酒馆',content_type:'text'},{key:'posts.title_main',value:'当前公告',content_type:'text'}],stats:{visit_count:1,interaction_count:1}};
    const regions={'/':['#hero-backdrop','.hero-section__portrait','#homepage-gallery-grid','#homepage-post-grid','#character-section','#story-section','#schedule-list','#social-list'], '/gallery/':['#gallery-grid','.gallery-page__filters'], '/posts/':['#posts-list']};
    let browser;
    try {
        browser=await chromium.launch({headless:true});
        for(const width of [1440,390])for(const motion of ['reduce','no-preference'])for(const route of Object.keys(regions)){
            const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion});
            const p=await context.newPage(), errors=[],counts={};p.on('pageerror',e=>errors.push(e.message));
            let releaseScripts,releaseApi;
            const scripts=new Promise(resolve=>releaseScripts=resolve),api=new Promise(resolve=>releaseApi=resolve);
            await p.route('**/_astro/*.js',async r=>{await scripts;await r.continue();});
            await p.route('**/api/public/**',async r=>{
                const key=new URL(r.request().url()).pathname.split('/')[3];counts[key]=(counts[key]||0)+1;
                await api;if(!p.isClosed())await r.fulfill({json:fixture[key]??[]});
            });
            await p.goto(base+route,{waitUntil:'commit'});
            await p.locator(regions[route][0]).waitFor({state:'attached'});
            const hidden = () => p.evaluate(selectors=>selectors.every(selector=>{
                const root=document.querySelector(selector);
                return root?.hasAttribute('data-public-pending')&&Array.from(root.children).every(child=>getComputedStyle(child).visibility==='hidden');
            }),regions[route]);
            await p.waitForFunction(()=>document.styleSheets.length>0);
            assert(await hidden(),'Old content visible before module scripts: '+route);
            if(route==='/')assert.equal(await p.locator('#hero-title').evaluate(el=>getComputedStyle(el).visibility),'hidden');
            releaseScripts();await p.waitForFunction(()=>document.documentElement.classList.contains('reveal-ready'));
            await p.waitForTimeout(300);assert(await hidden(),'Old content visible during API delay: '+route);
            releaseApi();await p.waitForFunction(()=>!document.querySelector('[data-public-pending]'));
            if(route==='/'){
                assert.equal(counts.gallery,1,'Hero and home gallery should share the pending request');
                assert((await p.locator('#hero-portrait-image').getAttribute('src')).includes('current=9001'));
                assert.equal(await p.locator('#homepage-post-grid h3').innerText(),post.title);
                assert((await p.locator('#hero-title').innerText()).startsWith('当前酒馆'));
                assert.equal(await p.locator('#hero-title').evaluate(el=>getComputedStyle(el).visibility),'visible');
                if(width===1440&&motion==='no-preference'){
                    await p.waitForTimeout(6800);
                    assert((await p.locator('.carousel-img.is-active').getAttribute('src')).includes('current=9002'));
                }
            }else if(route==='/gallery/'){
                assert.equal(await p.locator('.gallery-card').count(),2);
                await p.locator('[data-gallery-trigger]').first().click();await p.locator('#modal-next').click();
                assert.equal(await p.locator('#modal-position').innerText(),'02 / 02');
                await p.keyboard.press('Escape');await p.locator('#lightbox-modal').waitFor({state:'hidden'});
            }else{
                assert.equal(await p.locator('[data-post-card]').count(),1);
                await p.locator('#post-search-keyword').fill('不存在');assert(await p.locator('#posts-empty').isVisible());
                await p.locator('#post-search-reset').click();assert(await p.locator('[data-post-card]').isVisible());
            }
            assert.deepEqual(errors,[]);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await p.screenshot({path:path.join(screenshots,`${route.replaceAll('/','')||'home'}-${width}-${motion}.png`)});
            await context.close();
        }
        {
            const context=await browser.newContext({reducedMotion:'reduce'}),p=await context.newPage();
            let releaseApi,releaseImage;
            const api=new Promise(resolve=>releaseApi=resolve),image=new Promise(resolve=>releaseImage=resolve);
            await p.route('**/api/public/**',async r=>{await api;const key=new URL(r.request().url()).pathname.split('/')[3];await r.fulfill({json:fixture[key]??[]});});
            await p.route('**/logo.png?current=*',async r=>{await image;await r.continue();});
            await p.goto(base+'/',{waitUntil:'domcontentloaded'});
            await p.locator('#hero-portrait-image').evaluate(img=>img.loading='eager');
            await p.waitForFunction(()=>document.querySelector('#hero-portrait-image').naturalWidth>0);
            releaseApi();await p.waitForFunction(()=>!document.querySelector('[data-public-pending]'));
            const displayed=await p.locator('#hero-portrait-image').evaluate(img=>img.currentSrc);
            try { assert(!displayed.includes('/_astro/'),'Cached old portrait bitmap is still displayed while the current image loads'); }
            finally { releaseImage(); }
            await p.waitForFunction(()=>document.querySelector('#hero-portrait-image').currentSrc.includes('current=9001'));
            await context.close();
        }
        for(const mode of ['empty','failure','timeout'])for(const route of Object.keys(regions)){
            if(mode==='timeout'&&route!=='/')continue;
            const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),p=await context.newPage();
            let release;const pending=new Promise(resolve=>release=resolve);
            await p.route('**/api/public/**',async r=>{
                if(mode==='timeout'){await pending;if(p.isClosed())return;}
                await r.fulfill({status:mode==='failure'?503:200,json:mode==='empty'?[]:{}});
            });
            await p.goto(base+route);
            await p.waitForFunction(()=>!document.querySelector('[data-public-pending]'),null,{timeout:15000});
            const count=await p.locator(route==='/'?'#homepage-post-grid .note-card':route==='/gallery/'?'.gallery-card':'[data-post-card]').count();
            assert(mode==='empty'?count===0:count>0,`${mode} fallback/empty: ${route}`);
            if(mode==='empty'&&route==='/')assert(await p.locator('.hero-section__portrait').isHidden());
            await context.close();release();
        }
        const nojs=await browser.newContext({javaScriptEnabled:false});const p=await nojs.newPage();await p.goto(base+'/posts/');
        assert(await p.locator('[data-post-card]').first().isVisible(),'No-JS static fallback');await nojs.close();
        console.log('PASS 12 delayed first-render cases, 7 empty/failure/timeout cases, managed text, cached portrait, no-JS fallback, carousel, lightbox, search and layout.');
    } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}

(async()=>{await checkRequests();console.log('PASS shared requests');if(!process.argv.includes('--unit'))await checkBrowser();})().catch(error=>{console.error(error);process.exitCode=1;});
