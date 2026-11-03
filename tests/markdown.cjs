const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('', { url: 'http://127.0.0.1:8022/post/?slug=test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location });

function load(name) {
    const { outputFiles } = buildSync({ entryPoints: [path.join(__dirname, '../src/lib', name)], bundle: true,
        platform: 'node', format: 'cjs', write: false, external: ['dompurify'] });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports);
    return module.exports;
}
const { markdownToHtml } = load('markdown.ts');
const { renderStoryChapters } = load('storyChapters.ts');
const parse = (source, render = markdownToHtml) => {
    const root = document.createElement('article'); root.innerHTML = render(source); return root;
};

let root = parse('> 第一段 **古籍**\n>\n> 第二段——*咳，龙手*\n>\n> > 嵌套引用\n\n*真的不会发生什么事情吗……？？？*\n\n---\n\n***');
assert.equal(root.querySelectorAll('blockquote').length, 2);
assert(root.querySelector('blockquote strong'));
assert.equal(root.querySelector('blockquote em').textContent, '咳，龙手');
assert.equal(root.querySelectorAll('em').length, 2);
assert.equal(root.querySelectorAll('hr').length, 2);
assert(!root.textContent.includes('>'));

root = parse('# 一级\n## 二级\n### 三级\n#### 四级\n##### 五级\n###### 六级\n\n1. 一\n2. 二\n   - 子项\n     - 孙项\n\n- [x] 已完成\n- [ ] 未完成\n\n~~删除~~ 和 `代码`\n\n[引用链接][id]\n\n[id]: https://example.com "标题"\n\nhttps://example.com\n\n| 名称 | 数量 |\n| :--- | ---: |\n| 龙 | 2 |\n\n```js\nconst text = "<script>不是脚本</script>";\n```\n\n![照片](/logo.png)\n\n<details><summary>展开</summary>正文</details>');
for (let level = 1; level <= 6; level++) assert(root.querySelector('h' + level));
assert(root.querySelector('ol li ul li ul'));
assert.equal(root.querySelectorAll('input[type=checkbox][disabled]').length, 2);
assert(root.querySelector('input[checked]'));
assert(root.querySelector('del'));
assert.equal(root.querySelector('a').target, '_blank');
assert(root.querySelector('a').rel.includes('noopener'));
assert(root.querySelector('.markdown-table[tabindex="0"] table'));
assert.equal(root.querySelector('th:last-child').getAttribute('align'), 'right');
assert(root.querySelector('pre code.language-js').textContent.includes('<script>'));
assert(root.querySelector('details summary'));
assert.equal(root.querySelector('img').getAttribute('loading'), 'lazy');
assert(parse('一行\n另一行').querySelector('br'), 'keep legacy line breaks');

root = parse('<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://example.com"></iframe>\n\n[坏链接](javascript:alert(1))\n\n<a href="data:text/html,test">data</a><a href="http://[">invalid</a><span style="position:fixed" onclick="alert(1)">正文</span><input type=text><input type=checkbox><form><button>提交</button></form>');
assert.equal(root.querySelectorAll('script, iframe, form, button, input:not([type=checkbox])').length, 0);
for (const item of root.querySelectorAll('*')) for (const attribute of item.attributes) {
    assert(!/^on/i.test(attribute.name)); assert.notEqual(attribute.name, 'style');
    if (attribute.name === 'href') assert(!/^(?:javascript|data):/i.test(attribute.value));
}
assert(root.querySelector('input[disabled]'));

root = parse('第一章 记忆归来\n\n正文 **啪**\n\n```text\n第二章 代码中的文字\n```\n\n> 第三章 引用中的文字\n\n## 第四章 已有 Markdown 标题', renderStoryChapters);
assert.deepEqual([...root.querySelectorAll('h2')].map(el => el.textContent), ['第一章 记忆归来', '第四章 已有 Markdown 标题']);
assert(root.querySelector('pre code').textContent.includes('第二章'));
assert(!root.querySelector('blockquote h2'));
console.log('PASS CommonMark/GFM, Chinese emphasis, multi-paragraph quotes, rules, tables, tasks, code, safe HTML, unsafe URLs and legacy story headings');
dom.window.close();
