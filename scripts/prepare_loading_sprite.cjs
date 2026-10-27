// Mechanical packing only; animation artwork is generated separately from the user's references.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

(async () => {
    const source = process.argv[2];
    if (!source) throw new Error('Usage: node scripts/prepare_loading_sprite.cjs <4x4 transparent PNG>');
    const destination = path.resolve(__dirname, '../public/images/loading');
    const metadata = await sharp(source).metadata();
    if (metadata.width !== metadata.height || !metadata.hasAlpha) throw new Error('Expected a square transparent 4x4 sprite sheet');
    const frames = [];
    for (let index = 0; index < 16; index++) {
        const column = index % 4, row = Math.floor(index / 4);
        const left = Math.round(column * metadata.width / 4), top = Math.round(row * metadata.height / 4);
        const width = Math.round((column + 1) * metadata.width / 4) - left, height = Math.round((row + 1) * metadata.height / 4) - top;
        const input = await sharp(source).extract({left,top,width,height}).resize(128, 128, {kernel:'nearest'}).png().toBuffer();
        frames.push({input, left:index * 128, top:0});
    }
    fs.mkdirSync(destination, {recursive:true});
    const file = path.join(destination, 'lingxun-run-16-v1.webp');
    const strip = await sharp({create:{width:2048,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).png().toBuffer();
    const alpha = await sharp(strip).extractChannel('alpha').raw().toBuffer();
    const palette = await sharp(strip).removeAlpha().png({palette:true,colours:128,dither:0}).toBuffer();
    const rgb = await sharp(palette).removeAlpha().raw().toBuffer();
    const rgba = Buffer.alloc(2048 * 128 * 4);
    for (let pixel = 0; pixel < alpha.length; pixel++) {
        rgba[pixel * 4] = rgb[pixel * 3];
        rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1];
        rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2];
        // Pixel sprites use a hard alpha edge, avoiding noisy semi-transparent fringes.
        rgba[pixel * 4 + 3] = alpha[pixel] < 128 ? 0 : 255;
    }
    await sharp(rgba,{raw:{width:2048,height:128,channels:4}}).webp({lossless:true,effort:6}).toFile(file);
    console.log(JSON.stringify({file,frames:16,frameWidth:128,frameHeight:128,bytes:fs.statSync(file).size}));
})().catch(error => {console.error(error);process.exitCode=1;});
