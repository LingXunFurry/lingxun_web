const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'public/images/loading/lingxun-run-32-v5.webp');
const previous = path.join(root, 'public/images/loading/lingxun-run-32-v4.webp');
const output = path.join(root, '.local-backups/media-admin-screenshots');

(async()=>{
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width,5120);assert.equal(metadata.height,160);assert(metadata.hasAlpha);
    assert(fs.statSync(file).size<64*1024,'Loading animation must remain lightweight');
    const hashes=[];
    let legArea=0,previousLegArea=0;
    for(let index=0;index<32;index++) {
        const {data,info}=await sharp(file).extract({left:index*160,top:0,width:160,height:160}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        const old=await sharp(previous).extract({left:index*160,top:0,width:160,height:160}).ensureAlpha().raw().toBuffer();
        let opaque=0,transparent=0;
        for(let offset=3;offset<data.length;offset+=info.channels){
            const pixel=(offset-3)/info.channels,x=pixel%160,y=Math.floor(pixel/160);
            if(data[offset]>0)opaque++;else transparent++;
            if(y>=112){if(data[offset])legArea++;if(old[offset])previousLegArea++;}
            if(y<72)assert.equal(data[offset],old[offset],'Head and upper torso silhouette remain unchanged');
            if(x===0||x===159||y===0||y===159)assert.equal(data[offset],0,'Thicker legs never clip a frame boundary');
        }
        assert(opaque>1000&&transparent>1000,'Every frame must contain a visible transparent sprite');
        hashes.push(crypto.createHash('sha256').update(data).digest('hex'));
    }
    assert.equal(new Set(hashes).size,32,'Use 32 distinct rig poses');
    assert(legArea/previousLegArea>1.12,'Lower silhouette must be materially fuller than v4');
    console.log('Lower-body silhouette area ratio versus v4:',(legArea/previousLegArea).toFixed(3));
    const {legPose,drawRunner,legBuild}=await import('../scripts/loading-rig.mjs');
    assert(Object.isFrozen(legBuild));
    const hip={x:90,y:111};let flight=0;
    for(let index=0;index<1024;index++) {
        const phase=index*Math.PI*2/1024,a=legPose(hip,phase),b=legPose(hip,phase+Math.PI);
        assert(Math.abs(Math.hypot(a.knee.x-hip.x,a.knee.y-hip.y)-20)<.001,'Upper leg length must not morph');
        assert(Math.abs(Math.hypot(a.ankle.x-a.knee.x,a.ankle.y-a.knee.y)-24)<.001,'Lower leg length must not morph');
        if(a.planted)assert(Math.abs(a.ankle.y+19*Math.sin(a.footAngle)+10*Math.cos(a.footAngle)-155)<.001,'Contact toe stays on the ground line through push-off');
        if(!a.planted&&!b.planted)flight++;
        const next=legPose(hip,phase+Math.PI*2/32);
        assert(Math.hypot(a.ankle.x-next.ankle.x,a.ankle.y-next.ankle.y)<6,'No sudden foot position jump');
    }
    assert(flight>0,'A run has a brief flight phase, not only walking contacts');
    const parts=Object.fromEntries(['body','tail','nearArm','farArm','nearThigh','farThigh','nearShin','farShin','nearFoot','farFoot'].map(name=>[name,{name,width:60,height:106}]));
    const orders=[];
    for(const phase of [0,.7,Math.PI,Math.PI*1.8]) {
        const calls=[];drawRunner({clearRect(){},save(){},restore(){},translate(){},rotate(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},drawImage(image,...args){
            calls.push(image.name);
            if(image.name.endsWith('Thigh')||image.name.endsWith('Shin'))assert.equal(args[2],legBuild[image.name],'Limb thickness is fixed through the whole cycle');
            if(image.name.endsWith('Foot')){assert.equal(args[0]+args[2],19);assert.equal(args[1]+args[3],10);}
        }},parts,phase);orders.push(calls);
    }
    orders.forEach(order=>assert.deepEqual(order,orders[0],'Near/far limb sources and depth order never swap'));
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    try {
        for(const width of [1440,390])for(const motion of ['reduce','no-preference']) {
            const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion}),page=await context.newPage();
            await context.addInitScript(theme=>localStorage.setItem('lingxun-theme',theme),width===1440?'dark':'light');
            let release;const gate=new Promise(resolve=>release=resolve);
            await page.route('**/api/public/**',async route=>{await gate;if(!page.isClosed())await route.continue();});
            const navigationAt=Date.now();
            await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8016/',{waitUntil:'domcontentloaded'});
            await page.evaluate(async()=>{const image=new Image();image.src='/images/loading/lingxun-run-32-v5.webp';await image.decode();});
            await page.waitForTimeout(200);
            const runner=page.locator('.page-cover__runner');
            const initial=await runner.evaluate(element=>({name:getComputedStyle(element).animationName,position:getComputedStyle(element).backgroundPositionX,step:getComputedStyle(element).animationTimingFunction}));
            if(motion==='reduce')assert.equal(initial.name,'none');
            else {
                assert.equal(initial.name,'lingxun-loading-run');assert(initial.step.includes('32'));
                await page.waitForTimeout(180);
                assert.notEqual(await runner.evaluate(element=>getComputedStyle(element).backgroundPositionX),initial.position);
            }
            assert(await page.locator('#page-cover').isVisible());
            assert.equal(await page.locator('#navbar').evaluate(element=>element.inert),true,'Underlying page is not tabbable while covered');
            const shot=await runner.screenshot();
            const statistics=await sharp(shot).stats();
            fs.writeFileSync(path.join(output,`runner-${width}-${motion}.png`),shot);
            assert(Math.max(...statistics.channels.slice(0,3).map(channel=>channel.stdev))>12,'Sprite is not blank on either theme');
            await page.screenshot({path:path.join(output,`pixel-loading-${width}-${motion}.png`)});
            release();await page.locator('#page-cover').waitFor({state:'hidden'});
            assert(Date.now()-navigationAt>=2000,'Fast devices must see the cover for at least two seconds');
            assert.equal(await page.locator('#navbar').evaluate(element=>element.inert),false);
            await context.close();
        }
        {
            const context=await browser.newContext({viewport:{width:800,height:900},reducedMotion:'reduce'}),page=await context.newPage();
            await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8016')+'/loading-review/?v=5');
            const runner=page.locator('#runner');
            assert((await runner.evaluate(item=>getComputedStyle(item).backgroundImage)).includes('v5'));
            await page.selectOption('#version','v4');
            assert((await runner.evaluate(item=>getComputedStyle(item).backgroundImage)).includes('v4'));
            await page.selectOption('#version','v5');await page.selectOption('#zoom','2');
            await page.locator('#frame').evaluate(item=>{item.value='8';item.dispatchEvent(new Event('input',{bubbles:true}));});
            assert.equal(await page.locator('#position').innerText(),'09 / 32');
            assert.equal(await runner.evaluate(item=>getComputedStyle(item).backgroundPositionX),'-1280px');
            await page.selectOption('#speed','0.25');await page.getByRole('button',{name:'播放',exact:true}).click();
            await page.waitForTimeout(350);
            assert.notEqual(await runner.evaluate(item=>getComputedStyle(item).backgroundPositionX),'-1280px');
            await page.getByRole('button',{name:'暂停',exact:true}).click();
            await page.screenshot({path:path.join(output,'loading-v5-review.png')});
            await context.close();
        }
        console.log('PASS 32 fixed 160x160 poses, fuller legs, unchanged head silhouette, stable limb identity, constant bone lengths, contact/flight phases, continuous feet, <64KB, desktop/mobile playback, reduced motion, focus isolation and v4/v5 review controls.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
