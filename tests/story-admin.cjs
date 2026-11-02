const assert = require('node:assert/strict');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8021';
assert(new URL(base).hostname === '127.0.0.1', 'Local preview only');
const token = execFileSync(path.join(root,'backend/.venv/Scripts/python.exe'), ['-c',
    "from sqlalchemy import select; from app.database import SessionLocal; from app.models import AdminAccount; from app.auth import create_access_token; db=SessionLocal(); print(create_access_token(db.scalar(select(AdminAccount).limit(1)))); db.close()"
], {cwd:path.join(root,'backend'),env:{...process.env,DATABASE_URL:'sqlite:///'+path.join(root,'backend/preview-20261102.db').replaceAll('\\','/')}}).toString().trim();
const headers={Authorization:'Bearer '+token};
async function api(route, options={}) {
    const response = await fetch(base+route,{...options,headers:{...headers,'Content-Type':'application/json',...options.headers}});
    const body=await response.json(); assert(response.ok,JSON.stringify(body)); return body;
}
(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
    try {
        for(const width of [1440,390]) {
            const context=await browser.newContext({viewport:{width,height:900}});
            await context.addInitScript(token=>localStorage.setItem('lingxun_admin_session',JSON.stringify({accessToken:token,expiresAt:Date.now()+20*60*1000})),token);
            const page=await context.newPage(), errors=[]; let id;
            page.on('pageerror',error=>errors.push(error.message));
            try {
                await page.goto(base+'/admin'); await page.locator('#appView').waitFor({state:'visible'});
                await page.locator('[data-tab=stories]').click();
                await page.locator('#postListTitle').filter({hasText:'故事列表'}).waitFor();
                const form=page.locator('#postForm');
                await form.locator('[name=title]').fill('本地章节验收 '+width);
                await form.locator('[name=slug]').fill('qa-chapters-'+width+'-'+Date.now());
                await form.locator('[name=content]').fill('原有故事介绍，必须保留。');
                await form.locator('[name=desc]').fill('章节管理测试，结束后自动移除');
                await form.locator('[name=story_status]').selectOption('serial');
                await form.locator('[type=submit]').click();
                await page.waitForFunction(()=>Boolean(document.querySelector('#postForm [name=id]').value));
                id=await form.locator('[name=id]').inputValue();
                const story=(await api('/api/admin/posts')).find(p=>String(p.id)===id);
                assert(story.is_character_story);
                await page.locator('#newChapterBtn').click();
                const chapter=page.locator('#chapterForm');
                await chapter.locator('[name=label]').fill('第一章'); await chapter.locator('[name=title]').fill('出发');
                await chapter.locator('[name=is_published]').check();
                await chapter.locator('[type=submit]').click();
                await page.locator('#chapterError').filter({hasText:'正文'}).waitFor();
                await chapter.locator('[name=content]').fill('第一章的测试正文。');
                await chapter.locator('[name=is_published]').uncheck();
                await chapter.locator('[type=submit]').click();
                await page.locator('#chapterEditor').waitFor({state:'hidden'});
                await page.locator('[data-chapter-edit]').first().waitFor();
                assert.equal((await api('/api/public/posts/'+story.slug)).chapters.length,0,'draft not public');
                let rows=await api(`/api/admin/posts/${id}/chapters`); const first=rows[0];
                await page.locator(`[data-chapter-edit="${first.id}"]`).click();
                assert(await chapter.locator('[name=slug]').evaluate(el=>el.readOnly));
                await chapter.locator('[name=is_published]').check(); await chapter.locator('[type=submit]').click();
                await page.locator('#chapterEditor').waitFor({state:'hidden'});
                await page.waitForFunction(()=>document.querySelectorAll('#chapterList a').length===1);
                await page.locator('#newChapterBtn').click();
                await chapter.locator('[name=label]').fill('第二章');await chapter.locator('[name=title]').fill('同行');
                await chapter.locator('[name=content]').fill('第二章的测试正文。');await chapter.locator('[name=is_published]').check();
                await page.screenshot({path:path.join(root,`.design/characters-20261102/screens/admin-chapter-${width}.png`)});
                assert(await page.locator('#chapterEditor').evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1 && el.scrollWidth<=el.clientWidth+1));
                await chapter.locator('[type=submit]').click();await page.locator('#chapterEditor').waitFor({state:'hidden'});
                await page.waitForFunction(()=>document.querySelectorAll('#chapterList a').length===2);
                rows=await api(`/api/admin/posts/${id}/chapters`); const second=rows[1];
                const reader=await context.newPage();
                await reader.goto(base+`/post/?slug=${story.slug}&chapter=${first.slug}`);
                await reader.locator('#chapter-heading').waitFor({state:'visible'});
                assert.equal(await reader.locator('#story-contents a').count(),3,'full directory plus original text');
                assert((await reader.locator('#chapter-nav-top a').last().getAttribute('href')).includes(second.slug));
                await reader.locator('#chapter-nav-top a').last().click();
                await reader.locator('#chapter-title').filter({hasText:'同行'}).waitFor();
                assert((await reader.locator('#chapter-nav-bottom a').first().getAttribute('href')).includes(first.slug));
                await reader.goto(base+'/post/?slug='+story.slug);await reader.locator('#dynamic-post').waitFor({state:'visible'});
                assert((await reader.locator('#post-content').textContent()).includes('原有故事介绍，必须保留。'));
                await reader.close();
                await page.locator(`[data-chapter-edit="${first.id}"]`).click();
                await chapter.locator('[name=sort_order]').fill('30');await chapter.locator('[name=title]').fill('新的标题');
                await chapter.locator('[type=submit]').click();await page.locator('#chapterEditor').waitFor({state:'hidden'});
                const changed=await api(`/api/admin/posts/${id}/chapters`);
                assert.equal(changed[0].id,second.id);assert.equal(changed[1].slug,first.slug);
                page.once('dialog',dialog=>dialog.accept()); await page.locator(`[data-chapter-delete="${first.id}"]`).click();
                await page.waitForFunction(()=>document.querySelectorAll('[data-chapter-edit]').length===1);
                await page.locator('[data-tab=posts]').click();await page.locator('#postListTitle').filter({hasText:'动态列表'}).waitFor();
                assert.equal(await page.locator(`[data-post-edit="${id}"]`).count(),0,'story management separated');
                assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'admin mobile overflow');
                assert.deepEqual(errors,[]);console.log('PASS real admin chapter workflow',width);
            } finally {
                if(id) await api('/api/admin/posts/'+id,{method:'DELETE'});
                await context.close();
            }
        }
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
