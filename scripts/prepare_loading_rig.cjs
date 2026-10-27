const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async()=>{
    const source=process.argv[2];
    if(!source)throw new Error('Usage: node scripts/prepare_loading_rig.cjs <transparent rig atlas>');
    const root=path.resolve(__dirname,'..'),metadata=await sharp(source).metadata();
    const regions={body:[0,0,.265,.49],nearArm:[.29,.15,.23,.34],farArm:[.55,.15,.19,.34],nearThigh:[.78,.15,.21,.34],nearShin:[.045,.50,.18,.24],nearFoot:[.29,.50,.23,.24],farThigh:[.55,.49,.17,.25],farShin:[.79,.50,.19,.24],farFoot:[.04,.77,.20,.23],tail:[.23,.75,.30,.25]};
    const images={};
    const partsDirectory=path.join(root,'.design/lingxun-tavern/loading-rig-parts');
    fs.mkdirSync(partsDirectory,{recursive:true});
    for(const [name,[left,top,width,height]] of Object.entries(regions)){
        const crop={left:Math.floor(left*metadata.width),top:Math.floor(top*metadata.height),width:Math.floor(width*metadata.width),height:Math.floor(height*metadata.height)};
        const {data,info}=await sharp(source).extract(crop).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        let x0=info.width,y0=info.height,x1=0,y1=0;
        for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
        if(x0>x1||y0>y1)throw new Error('Missing rig part: '+name);
        const buffer=await sharp(data,{raw:info}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).png().toBuffer();
        fs.writeFileSync(path.join(partsDirectory,name+'.png'),buffer);
        images[name]='data:image/png;base64,'+buffer.toString('base64');
    }
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    let frames;
    try{
        const page=await browser.newPage();await page.setContent('<canvas width="160" height="160"></canvas>');
        await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'loading-rig.mjs'),'utf8').replaceAll('export ','')});
        frames=await page.evaluate(async data=>{
            const parts={};for(const [name,url]of Object.entries(data)){const image=new Image();image.src=url;await image.decode();parts[name]=image;}
            const canvas=document.querySelector('canvas'),context=canvas.getContext('2d'),result=[];
            for(let index=0;index<32;index++){drawRunner(context,parts,index*Math.PI*2/32);result.push(canvas.toDataURL('image/png').split(',')[1]);}
            return result;
        },images);
    }finally{await browser.close();}
    const strip=await sharp({create:{width:5120,height:160,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames.map((frame,index)=>({input:Buffer.from(frame,'base64'),left:index*160,top:0}))).png().toBuffer();
    const alpha=await sharp(strip).extractChannel('alpha').raw().toBuffer();
    const palette=await sharp(strip).removeAlpha().png({palette:true,colours:128,dither:0}).toBuffer();
    const rgb=await sharp(palette).removeAlpha().raw().toBuffer(),rgba=Buffer.alloc(5120*160*4);
    for(let i=0;i<alpha.length;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=alpha[i]<128?0:255;}
    const destination=path.join(root,'public/images/loading/lingxun-run-32-v5.webp');
    await sharp(rgba,{raw:{width:5120,height:160,channels:4}}).webp({lossless:true,effort:6}).toFile(destination);
    const contact=path.join(root,'.design/lingxun-tavern/lingxun-rig-cycle-review-v5.png');
    await sharp({create:{width:1280,height:640,channels:4,background:'#f1f0eb'}}).composite(frames.map((frame,index)=>({input:Buffer.from(frame,'base64'),left:index%8*160,top:Math.floor(index/8)*160}))).png().toFile(contact);
    console.log(JSON.stringify({file:destination,frames:32,width:160,height:160,bytes:fs.statSync(destination).size,contact}));
})().catch(error=>{console.error(error);process.exitCode=1;});
