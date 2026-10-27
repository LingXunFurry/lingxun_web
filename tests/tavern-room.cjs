const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8016';
const output=path.resolve(__dirname,'../.local-backups/tavern-room-screenshots');

(async()=>{
    fs.mkdirSync(output,{recursive:true});
    const originalEntries=await (await fetch(base+'/api/public/site-content')).json();
    const originalBonus=await (await fetch(base+'/api/public/bonus')).json();
    const bonus={...originalBonus,birthday_title:'值得在纪念簿里认真记下的一个漫长标题',birthday_subtitle:'在城镇值得纪念的一个很长很长的日子',birthday_date:'1900-01-01',typewriter_message:'致好奇的旅人：\n这张桌子与今晚的酒，都为你留着。\n凌巽'};
    const overrides=new Map(originalEntries.map(entry=>[entry.key,entry]));
    const override=(key,value)=>overrides.set(key,{key,value,content_type:'text'});
    override('egg.days_unit','日');override('egg.replies_limit','喂，这里不是音乐厅。');override('egg.quests_limit','已经看完所有委托了');
    for(let index=1;index<=3;index++)override(`egg.menu${index}.drinks`,'适合漫长旅途的特调 | 金酒、汤力水、青柠、薄荷\n老式 | 波本威士忌、方糖、苦精\n莫斯科骡子 | 伏特加、姜汁汽水、青柠汁');
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    let cases=0;
    try {
        const scenarios=[...['light','dark'].flatMap(theme=>[1440,390].flatMap(width=>['reduce','no-preference'].map(motion=>({theme,width,height:900,motion})))),{theme:'light',width:768,height:1024,motion:'reduce'},{theme:'dark',width:360,height:740,motion:'reduce'}];
        for(const {theme,width,height,motion} of scenarios){
            const context=await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:motion});
            const page=await context.newPage(),errors=[],requests=[];
            page.on('pageerror',error=>errors.push(error.message));
            let interactions=9999999,visits=12345678;
            await page.route('**/api/public/site-content',route=>route.fulfill({json:[...overrides.values()]}));
            await page.route('**/api/public/bonus',route=>route.fulfill({json:bonus}));
            await page.route('**/api/public/stats**',route=>{
                const request=route.request(),url=new URL(request.url());requests.push({path:url.pathname,method:request.method(),body:request.postData()});
                if(url.pathname.endsWith('/interaction')){assert.equal(request.method(),'POST');interactions++;}
                if(url.pathname.endsWith('/visit')){assert.equal(request.method(),'POST');visits++;}
                return route.fulfill({json:{visit_count:visits,interaction_count:interactions}});
            });
            await page.goto(base+'/',{waitUntil:'domcontentloaded',referer:base+'/friends/'});
            await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-site-content-pending')&&!document.querySelector('[data-public-pending]'));
            await page.evaluate(()=>document.getElementById('final-section').scrollIntoView({block:'start',behavior:'instant'}));
            await page.locator('#entry-trigger').scrollIntoViewIfNeeded();
            await page.locator('#entry-trigger').click({clickCount:3});
            await page.waitForTimeout(200);
            if(motion==='no-preference'){
                assert.equal(await page.locator('#egg-loader').getAttribute('aria-hidden'),'false');
                await page.waitForTimeout(650);
                const center=await page.evaluate(()=>{
                    const candle=document.querySelector('.egg-loader__candle').getBoundingClientRect(),meta=document.querySelector('.egg-loader__meta').getBoundingClientRect();
                    const loader=document.getElementById('egg-loader').getBoundingClientRect(),room=document.getElementById('easter-egg-section').getBoundingClientRect();
                    return {actual:(candle.top+meta.bottom)/2,expected:(76+innerHeight)/2,loaderTop:loader.top,loaderHeight:loader.height,roomTop:room.top,candleTop:candle.top,metaBottom:meta.bottom};
                });
                assert(Math.abs(center.actual-center.expected)<55,'Loader is centered in the first visible screen below the nav: '+JSON.stringify(center));
            }
            await page.waitForFunction(()=>document.getElementById('egg-dashboard').classList.contains('is-ready'));
            await page.waitForTimeout(motion==='reduce'?100:500);
            await page.evaluate(()=>window.scrollTo({top:document.getElementById('easter-egg-section').offsetTop,behavior:'instant'}));
            assert.equal(await page.locator('.scene-ornament__folio,.scene-ornament__binding').count(),0);
            assert.equal(await page.locator('#bonus-visit-count').innerText(),new Intl.NumberFormat('zh-CN').format(visits));
            assert.equal(await page.locator('#days-birth-title').innerText(),bonus.birthday_title);
            assert.equal(await page.locator('#days-birth-subtitle').innerText(),bonus.birthday_subtitle);
            assert((await page.locator('.memory-card > span:last-child').allTextContents()).every(text=>text==='日'),'Editable day unit binding still works');
            const sizes=await page.locator('.egg-menu__item').first().evaluate(item=>({drink:parseFloat(getComputedStyle(item.querySelector('.egg-menu__drink')).fontSize),ingredients:parseFloat(getComputedStyle(item.querySelector('.egg-menu__ingredients')).fontSize)}));
            assert(sizes.drink>sizes.ingredients*1.3);
            await page.screenshot({path:path.join(output,`room-${width}-${theme}-${motion}.png`),fullPage:false});
            const button=page.locator('#bonus-interaction-button');await button.scrollIntoViewIfNeeded();
            assert(await button.evaluate(item=>{const r=item.getBoundingClientRect();return item.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),'Knock control is not covered by decoration');
            for(let index=0;index<9;index++)await button.click({force:true});
            assert.notEqual(await page.locator('#bonus-reply').innerText(),'喂，这里不是音乐厅。');
            await button.click({force:true});assert.equal(await page.locator('#bonus-reply').innerText(),'喂，这里不是音乐厅。');
            await button.click({force:true});assert.equal(await page.locator('#bonus-reply').innerText(),'喂，这里不是音乐厅。');
            await page.waitForFunction(value=>document.getElementById('bonus-interaction-count').textContent===new Intl.NumberFormat('zh-CN').format(value),interactions);
            const draw=page.locator('#quest-draw-button');await draw.scrollIntoViewIfNeeded();
            await page.waitForFunction(()=>{const item=document.querySelector('.egg-card--quest');return item.classList.contains('is-visible')&&Number(getComputedStyle(item).opacity)>.99;});
            assert(await draw.evaluate(item=>{const r=item.getBoundingClientRect();return item.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),'Quest control is not covered by decoration');
            for(let index=0;index<10;index++)await draw.click({force:true});
            assert.equal(await page.locator('#quest-draw-result').innerText(),'已经看完所有委托了');
            await draw.click({force:true});assert.equal(await page.locator('#quest-draw-result').innerText(),'已经看完所有委托了');
            if(width===1440&&theme==='dark'&&motion==='reduce'){
                await page.waitForTimeout(3700);
                assert.equal(await button.evaluate(item=>item.classList.contains('is-overplayed')),false);
                await button.evaluate(item=>item.scrollIntoView({block:'center',behavior:'instant'}));await button.click();
                assert.notEqual(await page.locator('#bonus-reply').innerText(),'喂，这里不是音乐厅。');
                await draw.evaluate(item=>item.scrollIntoView({block:'center',behavior:'instant'}));await draw.click();
                assert.notEqual(await page.locator('#quest-draw-result').innerText(),'已经看完所有委托了');
            }
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow with long titles and large numbers');
            assert(await page.locator('.memory-card').evaluateAll(items=>items.every(item=>{
                const number=item.querySelector('strong').getBoundingClientRect(),unit=item.querySelector(':scope > span:last-child').getBoundingClientRect();
                return number.right<=unit.left+1||number.bottom<=unit.top+1;
            })),'Memorial numbers and units never overlap');
            await page.locator('#close-egg-button').click();
            await page.waitForFunction(()=>document.getElementById('easter-egg-section').classList.contains('hidden'));
            assert.equal(await page.evaluate(()=>document.activeElement?.id),'entry-trigger');
            assert(requests.some(request=>request.path.endsWith('/visit'))&&requests.some(request=>request.path.endsWith('/interaction')));
            assert.deepEqual(errors,[]);await context.close();cases++;console.log('PASS room',width,theme,motion);
        }
        {
            const before=await (await fetch(base+'/api/public/stats')).json();
            const context=await browser.newContext({viewport:{width:1280,height:720},colorScheme:'dark',reducedMotion:'reduce'}),page=await context.newPage();
            await page.goto(base+'/',{waitUntil:'domcontentloaded',referer:base+'/friends/'});
            await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-site-content-pending')&&!document.querySelector('[data-public-pending]'));
            await page.locator('#entry-trigger').click({clickCount:3});
            await page.waitForFunction(()=>document.getElementById('egg-dashboard').classList.contains('is-ready'));
            const button=page.locator('#bonus-interaction-button');await button.evaluate(item=>item.scrollIntoView({block:'center',behavior:'instant'}));await button.click();
            await page.waitForFunction(value=>Number(document.getElementById('bonus-interaction-count').textContent.replaceAll(',',''))>value,before.interaction_count);
            const after=await (await fetch(base+'/api/public/stats')).json();assert(after.interaction_count>before.interaction_count,'Real local backend accepts and retains an interaction');
            await context.close();
        }
        console.log(`PASS ${cases} room theme/motion/desktop/tablet/mobile cases plus real local backend interaction: first-screen loader, long editable copy, large counters, menu hierarchy, knock/quest limits and reset, original request methods, unobstructed controls, memorial units and return focus.`);
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
