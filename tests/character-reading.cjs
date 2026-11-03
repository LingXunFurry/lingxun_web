const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../src/pages/index.astro'), 'utf8');
const script = transformSync(source.match(/<script>([\s\S]*?)<\/script>/)[1], { loader: 'ts' }).code;

for (const fine of [false, true]) {
    const dom = new JSDOM('<main class="home-page"><section id="hero"></section><section id="character-section"><div class="character-stage"><article id="text">资料</article></div></section><section id="story-section"></section><section id="easter-egg-section" class="hidden egg-section"></section></main>', { runScripts: 'outside-only' });
    const { window } = dom;
    window.matchMedia = query => ({ matches: query.includes('pointer: fine') && fine, addEventListener() {} });
    let nextScene;
    window.HTMLElement.prototype.scrollIntoView = function () { nextScene = this.id; };
    const stages = [...window.document.querySelectorAll('main > section')];
    stages.forEach((el, i) => el.getBoundingClientRect = () => ({ top: i * 800 + 76 - 800 }));
    Object.defineProperty(window, 'scrollY', { value: 800 });
    const pane = window.document.querySelector('.character-stage');
    Object.defineProperties(pane, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    pane.style.overflowY = 'auto'; pane.scrollTop = 50;
    window.eval(script); window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    assert.equal(window.document.querySelector('main').classList.contains('is-stage-controlled'), fine);
    const touch = new window.Event('touchmove', { bubbles: true, cancelable: true });
    pane.dispatchEvent(touch); assert(!touch.defaultPrevented, 'touch never intercepted');
    const wheel = () => {
        const event = new window.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
        window.document.querySelector('#text').dispatchEvent(event); return event;
    };
    assert(!wheel().defaultPrevented, 'readable text keeps native scrolling');
    pane.scrollTop = 700;
    assert.equal(wheel().defaultPrevented, fine, 'only desktop controls scene boundaries');
    if (fine) assert.equal(nextScene, 'story-section');
    dom.window.close();
}
const character = fs.readFileSync(path.join(__dirname, '../src/components/Character.astro'), 'utf8');
assert(!character.includes('character-total'));
assert(character.includes('.character-stage { height: auto; overflow: visible; }'));
assert(!character.includes('overscroll-behavior-y: contain'));
assert(character.includes('font: 700 3.8rem'));
assert(character.includes("[data-field='status'] dd { color: var(--red-soft)"));
console.log('PASS coarse-pointer natural mode, touch handling, desktop inner reading and scene boundary, count removal and layout guards');
