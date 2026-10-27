const sharp = require('sharp');
const path = require('node:path');
(async()=>{
    const source=process.argv[2];
    const metadata=await sharp(source).metadata();
    const width=metadata.width/8,height=metadata.height/11;
    if(!Number.isInteger(width)||!Number.isInteger(height))throw new Error('Expected original 8x11 pet sheet');
    const target=path.resolve(__dirname,'../.design/lingxun-tavern/pet-run-original-reference.png');
    await sharp(source).extract({left:0,top:height,width:width*8,height}).png().toFile(target);
    console.log(target);
})().catch(error=>{console.error(error);process.exitCode=1;});
