let homeDraft = null;
let homeDirty = false;
let pickerCallback = null;
let mediaRecords = [];
let mediaBusy = false;
let homepageAssets = {};

const pageLocations = {
    home: '首页 / 各幕图片与内容', gallery: '旅途留影 / 照片库、分类、展示状态',
    characters: '首页 / 第二幕 · 冒险者登记簿', posts: '首页角色故事、最近手记 / 动态详情',
    comments: '文章详情 / 评论区', bonus: '酒馆暗门 / 纪念日', final: '首页 / 旅行日志、联系凌巽',
    friends: '同行者 / 友链名册', content: '全站 / 标题、按钮、提示与文案',
    security: '管理工具 / 账号安全', media: '管理工具 / 图片尺寸与传输体积',
};
function updatePageLocation(tab) { document.getElementById('pageLocation').textContent = pageLocations[tab] || ''; }
function visibilityBadge(visible) { return `<span class="visibility-badge${visible ? '' : ' is-hidden'}">${visible ? '前台可见' : '仅后台 · 隐藏'}</span>`; }
function contentGroupName(name) {
    return ({ site: '全站 · 名称与标识', navbar: '导航栏与菜单', hero: '首页 01 · 酒馆首屏', character: '首页 02 · 冒险者登记簿', story: '首页 03 · 角色故事', home_gallery: '首页 04 · 旅途留影预览', home_feed: '首页 05 · 最近手记', final: '首页 06 · 旅行日志与联系凌巽', gallery: '旅途留影 · 完整画廊', posts: '最近手记 · 列表页', post: '手记详情与评论', friends: '同行者 · 名册', egg: '酒馆暗门' })[name] || name;
}
function previewUrl(photo) { return absoluteUrl(photo?.image?.variants?.[0]?.src || photo?.image?.src || photo?.file_url || ''); }
function photoById(id) { return state.gallery.find(photo => photo.id === id); }
function resolveAdminImage(url) { return !url ? '' : absoluteUrl(url.startsWith('/src/assets/') ? homepageAssets[url] || '' : url); }
function markHomeDirty() { homeDirty = true; document.getElementById('homeSaveState').textContent = '有未保存的图片调整'; }

async function loadHomepage() {
    if (homeDirty && !window.confirm('重新读取会丢弃未保存的首页图片调整，继续吗？')) return;
    const [gallery, posts, characters, content] = await Promise.all(['gallery', 'posts', 'characters', 'site-content'].map(name => request('/api/admin/' + name, { headers: authHeaders() })));
    state.gallery = gallery; state.posts = posts; state.characters = characters;
    homepageAssets = await loadAssetPreviews().catch(() => ({}));
    const visible = gallery.filter(photo => photo.is_visible).sort((a, b) => a.sort_order - b.sort_order || b.id - a.id);
    const explicit = content.some(item => item.key === 'home.media_managed' && item.value === 'true');
    const hero = visible.filter(photo => photo.is_home_hero).sort((a, b) => a.hero_order - b.hero_order || a.id - b.id);
    const home = visible.filter(photo => photo.is_home_gallery).sort((a, b) => a.home_order - b.home_order || a.id - b.id);
    const portrait = visible.filter(photo => photo.is_home_portrait).sort((a, b) => a.home_order - b.home_order || a.id - b.id)[0];
    homeDraft = {
        hero_ids: (hero.length || explicit ? hero : visible.slice(0, 4)).map(photo => photo.id),
        portrait_id: portrait?.id ?? (explicit ? null : (hero.length ? hero[0] : visible[1] || visible[0])?.id ?? null),
        gallery_ids: (home.length || explicit ? home : visible).slice(0, 3).map(photo => photo.id),
    };
    homeDirty = false;
    document.getElementById('homeSaveState').textContent = explicit ? '当前首页图片已明确编排' : '当前沿用原配置；保存后按这里的位置展示';
    renderHomepage();
}

function renderPhotoSlot(id, label, group, index) {
    const photo = photoById(id);
    return `<div class="photo-slot"><div class="photo-slot__image">${photo ? `<img src="${escapeHtml(previewUrl(photo))}" alt="${escapeHtml(photo.title || label)}" loading="lazy">` : '<span class="photo-slot__empty">未放入照片</span>'}</div><strong>${escapeHtml(label)}${photo ? ' · ' + escapeHtml(photo.title || photo.original_filename) : ''}</strong><div class="actions"><button class="btn secondary mini" type="button" data-home-pick="${group}" data-index="${index}">${photo ? '更换' : '选择照片'}</button>${photo ? `<button class="btn ghost mini" type="button" data-home-clear="${group}" data-index="${index}">移除</button>` : ''}${group === 'hero' && index > 0 ? `<button class="btn ghost mini" type="button" data-home-earlier="${index}" aria-label="将第 ${index + 1} 张轮播照片向前移动" title="向前移动">←</button>` : ''}</div></div>`;
}

function storyArtwork(post) {
    if (post.story_cover_url != null) return post.story_cover_url;
    return post.cover_url || state.characters.find(item => item.id === post.story_character_id)?.image_url || '';
}

function renderHomepage() {
    const stories = state.posts.filter(post => post.is_character_story).sort((a, b) => a.story_order - b.story_order || b.date.localeCompare(a.date) || b.id - a.id);
    document.getElementById('homeEditor').innerHTML = `
        <section class="home-scene"><div><div class="home-scene__heading"><span class="home-scene__number">01</span><h4>酒馆首屏</h4></div><p>背景按这里的顺序轮播。右侧主照片可独立选择。</p><div class="home-scene__tools"><button class="btn ghost mini" data-content-group="hero">修改首屏文案</button></div></div><div><div class="photo-slots">${homeDraft.hero_ids.map((id, index) => renderPhotoSlot(id, '背景 ' + (index + 1), 'hero', index)).join('')}</div><button class="btn secondary mini" type="button" data-home-add ${homeDraft.hero_ids.length >= 12 ? 'disabled' : ''}>添加轮播照片</button><div class="single-photo" style="margin-top:1.5rem">${renderPhotoSlot(homeDraft.portrait_id, '首屏右侧主照片', 'portrait', 0)}</div></div></section>
        <section class="home-scene"><div><div class="home-scene__heading"><span class="home-scene__number">02</span><h4>冒险者登记簿</h4></div><p>人物资料和登记照片在这里编辑。故事封面有自己的设置。</p></div><div>${state.characters.map(character => `<div class="story-record">${resolveAdminImage(character.image_url) ? `<img src="${escapeHtml(resolveAdminImage(character.image?.variants?.[0]?.src || character.image_url))}" alt="" loading="lazy">` : '<span class="photo-slot__empty">登记照片</span>'}<div><strong>${escapeHtml(character.name)}</strong><small>${character.is_visible ? '前台显示' : '已隐藏'} · 冒险者登记簿照片</small></div><button class="btn secondary mini" data-open-character="${character.id}">编辑人物与照片</button></div>`).join('') || '<p>还没有角色登记。</p>'}<button class="btn ghost mini" data-go-tab="characters">管理登记簿 →</button></div></section>
        <section class="home-scene"><div><div class="home-scene__heading"><span class="home-scene__number">03</span><h4>角色故事</h4></div><p>每篇故事都有独立封面与顺序。发布状态决定是否出现在首页。</p></div><div>${stories.map(post => { const art = storyArtwork(post); return `<div class="story-record">${resolveAdminImage(art) ? `<img src="${escapeHtml(resolveAdminImage(post.story_image?.variants?.[0]?.src || art))}" alt="" loading="lazy">` : '<span class="photo-slot__empty">未配故事图</span>'}<div><strong>${escapeHtml(post.title)}</strong><small>${post.is_published ? '前台显示' : '草稿 · 不显示'} · ${post.story_cover_url == null ? '沿用旧规则，尚未独立设图' : post.story_cover_url ? '使用独立封面' : '不展示封面'}</small></div><button class="btn secondary mini" data-open-story="${post.id}">编辑故事与封面</button></div>`; }).join('') || '<p>尚未选择角色故事。在“手记与角色故事”中勾选展示。</p>'}<button class="btn ghost mini" data-go-tab="posts">管理手记与故事 →</button></div></section>
        <section class="home-scene"><div><div class="home-scene__heading"><span class="home-scene__number">04</span><h4>旅途留影 · 三张图</h4></div><p>最多三张，从左到右排列；新增时先填前面的空位，移除后后图前移。不自动补入其他照片。</p><div class="home-scene__tools"><button class="btn ghost mini" data-content-group="home_gallery">修改此幕文案</button></div></div><div class="photo-slots">${[0, 1, 2].map(index => renderPhotoSlot(homeDraft.gallery_ids[index], '第 ' + (index + 1) + ' 张', 'gallery', index)).join('')}</div></section>
        <section class="home-scene"><div><div class="home-scene__heading"><span class="home-scene__number">05–06</span><h4>手记与联系凌巽</h4></div><p>最近手记跟随已发布动态；行程与联系单独管理。</p></div><div class="actions"><button class="btn secondary" data-go-tab="posts">最近手记</button><button class="btn secondary" data-go-tab="final">旅行日志与联系凌巽</button><button class="btn ghost" data-go-tab="content">全站文案</button></div></section>`;
}

async function openMediaPicker(title, callback) {
    state.gallery = await request('/api/admin/gallery', { headers: authHeaders() });
    pickerCallback = callback;
    document.getElementById('mediaPickerTitle').textContent = title;
    document.getElementById('mediaPickerSearch').value = '';
    renderPicker();
    document.getElementById('mediaPicker').showModal();
}

function renderPicker() {
    const keyword = document.getElementById('mediaPickerSearch').value.trim().toLocaleLowerCase();
    const photos = state.gallery.filter(photo => photo.is_visible && (!keyword || [photo.title, photo.category, photo.original_filename].join(' ').toLocaleLowerCase().includes(keyword)));
    document.getElementById('mediaPickerGrid').innerHTML = photos.map(photo => `<button type="button" class="picker-photo" data-pick-photo="${photo.id}"><img src="${escapeHtml(previewUrl(photo))}" alt="${escapeHtml(photo.title || photo.original_filename)}" loading="lazy"><span>${escapeHtml(photo.title || photo.original_filename)}</span><small>${escapeHtml(photo.category || '未分类')}</small></button>`).join('') || '<p class="helper">没有符合条件的公开照片。可先在照片库上传，或将照片设为前台显示。</p>';
}

function updateStoryCoverPreview() {
    const form = document.getElementById('postForm');
    const mode = form.elements.story_cover_mode.value;
    const url = mode === 'independent' ? form.elements.story_cover_url.value.trim() : mode === 'inherit' ? form.elements.cover_url.value || state.characters.find(item => item.id === Number(form.elements.story_character_id.value))?.image_url : '';
    const preview = document.getElementById('storyCoverPreview');
    preview.hidden = !url;
    setPreview(preview, url);
    form.elements.story_cover_url.disabled = mode !== 'independent';
    document.getElementById('storyCoverFile').disabled = mode !== 'independent';
    document.getElementById('chooseStoryCover').disabled = mode !== 'independent';
}

function formatBytes(bytes) { return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB'; }
async function loadMediaWorkshop() {
    mediaRecords = await request('/api/admin/media', { headers: authHeaders() });
    renderMediaWorkshop();
}
function renderMediaWorkshop() {
    document.getElementById('optimizeAllImages').disabled = mediaBusy || !mediaRecords.some(item => !item.image);
    document.getElementById('mediaList').innerHTML = mediaRecords.map((item, index) => `<div class="media-record"><img src="${escapeHtml(absoluteUrl(item.image?.variants?.[0]?.src || item.url))}" alt="" loading="lazy"><div><strong>${escapeHtml(item.title || '未命名图片')}</strong><small>${escapeHtml(item.locations.join(' · '))}</small><span class="media-state">${item.image ? item.image.animated ? '动态图 · 保留动画' : `${item.image.width} × ${item.image.height} · ${formatBytes(item.image.original_bytes)} → ${formatBytes(item.image.bytes)} · ${item.image.variants.length} 个浏览尺寸` : '待生成多尺寸浏览版本'}</span></div><button type="button" class="btn secondary mini" data-optimize-image="${index}" ${mediaBusy || item.image ? 'disabled' : ''}>${item.image ? '已处理' : '优化'}</button></div>`).join('') || '<div class="empty">还没有本站上传的图片。</div>';
}
async function optimizeMedia(indices) {
    if (mediaBusy) return;
    mediaBusy = true; renderMediaWorkshop();
    let completed = 0, failed = 0;
    try {
        for (const index of indices) {
            document.getElementById('mediaProgress').textContent = `正在处理 ${completed + failed + 1} / ${indices.length}，可以保留此页面等待完成。`;
            try { mediaRecords[index].image = await request('/api/admin/media/optimize', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ url: mediaRecords[index].url }) }); completed++; }
            catch { failed++; }
            renderMediaWorkshop();
        }
    } finally {
        mediaBusy = false; renderMediaWorkshop();
        document.getElementById('mediaProgress').textContent = `处理完成：${completed} 张成功${failed ? `，${failed} 张未成功（文件可能缺失或损坏，可单独重试）` : '，原文件均已保留'}。`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminTheme').addEventListener('click', () => {
        const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('lingxun-theme', theme);
    });
    document.addEventListener('click', async event => {
        const button = event.target.closest('button');
        if (!button) return;
        try {
            if (button.dataset.goTab) setTab(button.dataset.goTab);
            if (button.dataset.contentGroup) { setTab('content'); await loadSiteContent(); const group = siteContent.find(item => item.key.startsWith(button.dataset.contentGroup + '.'))?.group_name; if (group) document.getElementById('contentGroup').value = group; document.getElementById('contentSearch').value = ''; renderSiteContent(); document.getElementById('contentGroup').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
            if (button.dataset.openStory) { setTab('posts'); await loadPosts(); fillPostForm(state.posts.find(post => post.id === Number(button.dataset.openStory))); document.querySelector('.story-cover-editor').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
            if (button.dataset.openCharacter) { setTab('characters'); await loadCharacters(); fillCharacterForm(state.characters.find(character => character.id === Number(button.dataset.openCharacter))); document.getElementById('characterForm').scrollIntoView({ block: 'start' }); }
            if (button.hasAttribute('data-home-add')) await openMediaPicker('添加首屏轮播照片', photo => { if (homeDraft.hero_ids.includes(photo.id)) return showStatus('这张照片已经在轮播中。', true); homeDraft.hero_ids.push(photo.id); markHomeDirty(); renderHomepage(); });
            if (button.dataset.homePick) {
                const group = button.dataset.homePick, index = Number(button.dataset.index);
                await openMediaPicker(group === 'gallery' ? `旅途留影 · 第 ${index + 1} 张` : group === 'portrait' ? '首屏右侧主照片' : '首屏轮播照片', photo => {
                    if (group === 'portrait') homeDraft.portrait_id = photo.id;
                    else { const list = group === 'hero' ? homeDraft.hero_ids : homeDraft.gallery_ids; if (list.some((id, i) => id === photo.id && i !== index)) return showStatus('这个区域已使用这张照片，请选择另一张。', true); list[Math.min(index, list.length)] = photo.id; }
                    markHomeDirty(); renderHomepage();
                });
            }
            if (button.dataset.homeClear) { const group = button.dataset.homeClear; if (group === 'portrait') homeDraft.portrait_id = null; else { const list = group === 'hero' ? homeDraft.hero_ids : homeDraft.gallery_ids; list.splice(Number(button.dataset.index), 1); } markHomeDirty(); renderHomepage(); }
            if (button.hasAttribute('data-home-earlier')) { const index = Number(button.dataset.homeEarlier); [homeDraft.hero_ids[index - 1], homeDraft.hero_ids[index]] = [homeDraft.hero_ids[index], homeDraft.hero_ids[index - 1]]; markHomeDirty(); renderHomepage(); }
            if (button.hasAttribute('data-pick-photo')) { const photo = photoById(Number(button.dataset.pickPhoto)); document.getElementById('mediaPicker').close(); pickerCallback?.(photo); }
            if (button.hasAttribute('data-optimize-image')) await optimizeMedia([Number(button.dataset.optimizeImage)]);
        } catch (error) { showStatus(error.message, true); }
    });
    document.getElementById('saveHomeMedia').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await request('/api/admin/homepage/media', { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ...homeDraft, gallery_ids: homeDraft.gallery_ids.filter(Boolean) }) });
            homeDirty = false; document.getElementById('homeSaveState').textContent = '已保存，重新打开前台即可查看'; showStatus('首页图片已保存');
        } catch (error) { showStatus(error.message, true); }
        finally { button.disabled = false; }
    });
    document.getElementById('closeMediaPicker').addEventListener('click', () => document.getElementById('mediaPicker').close());
    document.getElementById('mediaPickerSearch').addEventListener('input', renderPicker);
    document.getElementById('chooseStoryCover').addEventListener('click', () => openMediaPicker('选择角色故事独立封面', photo => { document.getElementById('postForm').elements.story_cover_url.value = photo.file_url; updateStoryCoverPreview(); }).catch(error => showStatus(error.message, true)));
    document.getElementById('postForm').addEventListener('input', event => { if (['story_cover_url', 'story_cover_mode', 'cover_url', 'story_character_id'].includes(event.target.name)) updateStoryCoverPreview(); });
    document.getElementById('storyCoverFile').addEventListener('change', async event => {
        if (!event.target.files?.length) return;
        const body = new FormData(); body.append('file', event.target.files[0]); event.target.disabled = true;
        try { const result = await request('/api/admin/posts/upload-cover', { method: 'POST', headers: authHeaders(), body }); const form = document.getElementById('postForm'); form.elements.story_cover_url.value = result.file_url; form.elements.story_cover_mode.value = 'independent'; updateStoryCoverPreview(); showStatus('独立封面已上传，请保存动态'); }
        catch (error) { showStatus(error.message, true); }
        finally { event.target.value = ''; event.target.disabled = false; }
    });
    document.getElementById('optimizeAllImages').addEventListener('click', () => optimizeMedia(mediaRecords.map((item, index) => item.image ? -1 : index).filter(index => index >= 0)));
    window.addEventListener('beforeunload', event => { if (homeDirty || mediaBusy) { event.preventDefault(); event.returnValue = ''; } });
    const labelTables = () => document.querySelectorAll('table').forEach(table => { const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent); table.querySelectorAll('tbody tr').forEach(row => [...row.children].forEach((cell, index) => { cell.dataset.column = headings[index] || ''; })); });
    new MutationObserver(labelTables).observe(document.getElementById('appView'), { childList: true, subtree: true });
});
