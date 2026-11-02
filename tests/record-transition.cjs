const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/recordSwitch.ts'), 'utf8');
const code = transformSync(source.slice(source.indexOf('export function recordTransition')), {loader:'ts',format:'cjs'}).code;

async function check(reduced, diagonal) {
    const context = { module:{exports:{}}, matchMedia:()=>({matches:reduced}) };
    vm.runInNewContext(code, context);
    const logs = [[], []], states = [];
    const nodes = logs.map(log => ({
        setAttribute:(key,value)=>states.push([key,value]),
        animate:(frames)=>{ log.push(JSON.parse(JSON.stringify(frames))); return { finished:new Promise(resolve=>setTimeout(resolve,2)), cancel(){} }; },
    }));
    let rendered = 0, height = 120;
    const resized = [];
    const resize = {getBoundingClientRect:()=>({height}),animate:frames=>{resized.push(frames);return {cancel(){}};}};
    const change = context.module.exports.recordTransition(nodes, index=>{rendered=index;height=220;}, {diagonal,prepare:()=>new Promise(resolve=>setTimeout(resolve,2)),resize});
    const first = change(1);
    await change(2); await change(0); await change(2);
    await first;
    assert.equal(rendered,2,'rapid changes settle at the last request');
    assert(states.at(-1).includes('false'),'busy is cleared');
    if(reduced) assert.equal(logs[0].length,0);
    else {
        assert.deepEqual(logs[0],logs[1],'text and image have identical directional frames');
        assert.equal(logs[0][0][1].transform,`translate(-48px, ${diagonal ? -30 : 0}px)`);
        assert.equal(resized[0][0].height,'120px');
        assert.equal(resized[0][1].height,'220px');
        await change(1,-1);
        assert.equal(logs[0].at(-1)[0].transform,`translate(-48px, ${diagonal ? -30 : 0}px)`);
    }
}
(async()=>{for(const diagonal of [false,true]) for(const reduced of [false,true]) await check(reduced,diagonal);console.log('PASS horizontal/diagonal sync, latest request, height interpolation and reduced motion');})().catch(error=>{console.error(error);process.exitCode=1;});
