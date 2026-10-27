const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(__dirname, '..');
const root = process.env.DIST_DIR || path.join(project, 'dist');
const output = path.join(project, '.local-backups/media-admin-screenshots');
fs.mkdirSync(output, {recursive:true});
const assets = JSON.parse(fs.readFileSync(path.join(root, 'asset-previews.json'), 'utf8'));
const pictures = [1,2,3,4].map(n => assets[`/src/assets/gallery/photo${n}.webp`]);
const makeImage = src => ({src,width:960,height:1280,bytes:60000,original_bytes:2000000,variants:[{src,width:480,height:640,bytes:24000},{src,width:960,height:1280,bytes:60000}]});
const gallery = pictures.map((src,index) => ({id:index+1,title:['城镇留影','酒馆片段','旅途记录','公会合照'][index],file_url:src,original_filename:`photo${index+1}.webp`,is_visible:true,sort_order:index,is_home_hero:index<2,hero_order:index,is_home_portrait:index===1,is_home_gallery:index<3,home_order:index,image:makeImage(src)}));
const character = {id:1,name:'凌巽',alias:'Lingxun',species:'风龙',role:'法师 / 冒险者',region:'人类城镇',work:'公会委托',places:'家中 / 酒馆',status:'可接受委托',image_url:pictures[0],introduction:'一条住在人类城镇里的龙，接公会委托谋生，平时喜欢在家读魔法书。',details:'凌巽是一条风龙，职业是法师，同时也擅长使用各种武器战斗。',is_visible:true,custom_fields:[]};
const initialPost = {id:1,slug:'current-story',title:'凌巽 · 城镇手记',date:'2026.10.26',tag:'设定',desc:'公会、酒馆与魔法书之间的日常。',content:'## 第一章 · 风的去处\n\n今天在城镇停留。\n\n## 第二章 · 回家\n\n还有一本书没有读完。',is_published:true,is_character_story:true,story_order:0,story_summary:'一段新的旅途，从推开酒馆的门开始。',story_character_id:1,story_cover_url:null,cover_url:null,image_urls:[],attachments:[],links:[]};
const siteContent = [{id:1,key:'hero.title_main',group_name:'首页首屏',label:'首屏标题',value:'凌巽的',content_type:'text'},{id:2,key:'home_gallery.title_main',group_name:'首页画廊',label:'旅途留影标题',value:'把路上的光，',content_type:'text'},{id:3,key:'home.media_managed',group_name:'internal',label:'internal',value:'true',content_type:'internal'}];
const server = http.createServer((req,res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        let base=root, relative=pathname;
        if(pathname.startsWith('/admin/assets/')) {base=path.join(project,'backend/app/static/admin'); relative=pathname.slice('/admin/assets'.length);}
        else if(pathname==='/admin/'||pathname==='/admin') {base=path.join(project,'backend/app/static/admin');relative='/index.html';}
        const resolved=path.resolve(base,'.'+relative);
        if(!resolved.startsWith(base+path.sep)&&resolved!==base) {res.writeHead(403);res.end();return;}
        const target=fs.statSync(resolved).isDirectory()?path.join(resolved,'index.html'):resolved;
        res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.json':'application/json','.otf':'font/otf'}[path.extname(target)]||'application/octet-stream');
        fs.createReadStream(target).pipe(res);
    } catch {res.writeHead(404);res.end();}
});

(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    let cases=0;
    try {
        for(const width of [1440,390])for(const theme of ['dark','light']) {
            const context=await browser.newContext({viewport:{width,height:960},reducedMotion:width===390?'reduce':'no-preference'});
            await context.addInitScript(theme=>{localStorage.setItem('lingxun-theme',theme);localStorage.setItem('lingxun_admin_session',JSON.stringify({accessToken:'fixture-token',expiresAt:Date.now()+1800000}));},theme);
            const page=await context.newPage(), errors=[],photos=structuredClone(gallery),posts=[structuredClone(initialPost)],saves=[];
            page.on('pageerror',error=>errors.push(error.message));
            await page.route('**/api/admin/**',async route=>{
                const request=route.request(),url=new URL(request.url()),endpoint=url.pathname.replace('/api/admin/','');
                let result={ok:true};
                if(endpoint==='me')result={username:'preview'};
                else if(endpoint==='gallery')result=photos;
                else if(endpoint==='characters')result=[character];
                else if(endpoint==='site-content')result=siteContent;
                else if(endpoint==='posts')result=posts;
                else if(endpoint==='homepage/media') {const data=request.postDataJSON();saves.push(data);photos.forEach(photo=>{photo.is_home_hero=data.hero_ids.includes(photo.id);photo.hero_order=data.hero_ids.indexOf(photo.id);photo.is_home_portrait=data.portrait_id===photo.id;photo.is_home_gallery=data.gallery_ids.includes(photo.id);photo.home_order=data.gallery_ids.indexOf(photo.id);});result={ok:true,...data};}
                else if(endpoint==='posts/1'&&request.method()==='PATCH') {Object.assign(posts[0],request.postDataJSON());result=posts[0];}
                else if(endpoint==='posts/upload-cover')result={file_url:pictures[2],image:makeImage(pictures[2])};
                else if(endpoint==='media')result=[{url:pictures[0],title:'城镇留影',locations:['首页留影','角色故事'],image:makeImage(pictures[0])}];
                else result=[];
                await route.fulfill({json:result});
            });
            await page.goto(base+'/admin/');
            await page.locator('#homeEditor .home-scene').first().waitFor();
            assert(await page.locator('#homeTab').isVisible());
            assert.equal(await page.locator('#homeEditor .home-scene h4').first().innerText(), '酒馆首屏');
            assert((await page.locator('#homeEditor').innerText()).includes('手记与联系凌巽'));
            assert((await page.locator('[data-tab="final"]').innerText()).includes('联系凌巽'));
            assert(await page.locator('[data-home-pick="gallery"]').count()===3);
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await page.screenshot({path:path.join(output,`admin-home-${width}-${theme}.png`),fullPage:true});
            await page.locator('[data-home-pick="gallery"]').nth(1).click();
            await page.locator('#mediaPicker').waitFor({state:'visible'});
            await page.locator('#mediaPickerSearch').fill('公会');
            assert.equal(await page.locator('[data-pick-photo]').count(),1);
            await page.locator('[data-pick-photo="4"]').click();
            await page.locator('#saveHomeMedia').click();
            await page.waitForFunction(()=>document.getElementById('homeSaveState').textContent.includes('已保存'));
            assert.deepEqual(saves.at(-1).gallery_ids,[1,4,3]);
            assert.equal(saves.at(-1).portrait_id,2);
            await page.locator('[data-open-story="1"]').click();
            await page.waitForFunction(()=>document.getElementById('postForm').elements.id.value==='1');
            await page.locator('[name="story_cover_mode"]').selectOption('independent');
            await page.locator('#chooseStoryCover').click();
            await page.locator('[data-pick-photo="3"]').click();
            await page.locator('#storyCoverPreview').waitFor({state:'visible'});
            await page.locator('#postForm [type="submit"]').click();
            await page.waitForFunction(()=>document.getElementById('postForm').elements.id.value==='');
            assert.equal(posts[0].story_cover_url,pictures[2]);
            assert.equal(character.image_url,pictures[0]);
            assert.equal(posts[0].cover_url,null);
            await page.locator('[data-post-edit="1"]').click();
            await page.locator('#storyCoverFile').setInputFiles(path.join(project,'public/logo.png'));
            await page.waitForFunction(()=>!document.getElementById('storyCoverFile').disabled);
            await page.locator('#postForm [type="submit"]').click();
            await page.waitForFunction(()=>document.getElementById('postForm').elements.id.value==='');
            await page.locator('[data-tab="content"]').click();
            await page.locator('#contentSearch').fill('旅途留影');
            await page.locator('[data-content-form="2"]').waitFor({state:'visible'});
            assert.equal(await page.locator('[data-content-form]').count(),1);
            await page.locator('[data-tab="media"]').click();
            await page.locator('.media-record').waitFor();
            assert((await page.locator('.media-state').innerText()).includes('2 个浏览尺寸'));
            await page.screenshot({path:path.join(output,`admin-media-${width}-${theme}.png`),fullPage:true});
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            assert.deepEqual(errors,[]);
            await context.close();cases++;
        }
        for(const theme of ['dark','light']) {
            const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage();
            await context.addInitScript(theme=>localStorage.setItem('lingxun-theme',theme),theme);
            let release;const gate=new Promise(resolve=>release=resolve);
            const fixtures={gallery,characters:[character],stories:[{...initialPost,story_cover_url:pictures[2]}],posts:[initialPost],socials:[],schedules:[],friends:[],'site-content':siteContent,bonus:{},stats:{visit_count:1,interaction_count:1}};
            await page.route('**/api/public/**',async route=>{await gate;await route.fulfill({json:fixtures[new URL(route.request().url()).pathname.split('/')[3]]||[]});});
            await page.goto(base+'/',{waitUntil:'domcontentloaded'});
            await page.waitForTimeout(4300);
            assert((await page.locator('#page-cover-message').innerText()).includes('网络有些慢'));
            assert(await page.locator('#page-cover').isVisible());
            await page.screenshot({path:path.join(output,`loading-${theme}.png`)});
            release();await page.locator('#page-cover').waitFor({state:'hidden'});
            assert((await page.locator('.story-book__art img').getAttribute('src')).includes(pictures[2]));
            await page.screenshot({path:path.join(output,`home-ready-${theme}.png`)});
            const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(item=>/\.otf|woff2/.test(item.name)).map(item=>item.name));
            assert(!resources.some(url=>/SourceHan.*\.otf/.test(url)),'Initial UI must not request original huge Chinese OTFs');
            await context.close();cases++;
        }
        console.log(`PASS ${cases} desktop/mobile light/dark admin and slow-loading cases: exact photo order, image picker search, independent story cover, upload, content search, responsive layout and font requests.`);
    } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
