let pending = 0;
let started = false;
let settled = false;
let failed = false;
let scheduled = false;
const heldElements = new Set<HTMLElement>();
let coverStartedAt = 0;
const minimumCoverMs = 2000;
const hasIntro = () => document.documentElement.dataset.loadMode === 'intro';

function showStatus(message: string, error = false) {
    const status = document.getElementById('page-load-status');
    const text = document.getElementById('page-load-status-message');
    if (status) { status.hidden = false; status.dataset.state = error ? 'error' : 'slow'; }
    if (text) text.textContent = message;
    document.getElementById('page-load-status-retry')?.toggleAttribute('hidden', !error);
}

export function failPageLoad() {
    if (settled) return;
    failed = true;
    const cover = document.getElementById('page-cover');
    cover?.setAttribute('data-state', 'error');
    if (!hasIntro()) {
        showStatus('暂时没能取回最新内容，请检查网络后重试。', true);
        return;
    }
    const message = document.getElementById('page-cover-message');
    if (message) message.textContent = '暂时没能取回最新内容，请检查网络后重试。';
    document.getElementById('page-cover-retry')?.removeAttribute('hidden');
    document.getElementById('page-cover-retry')?.focus();
}

export function beginPageTask() {
    pending += 1;
    let done = false;
    return (success = true) => {
        if (done) return;
        done = true;
        pending -= 1;
        if (!success) failPageLoad();
        scheduleFinish();
    };
}

function scheduleFinish() {
    if (!started || pending || settled || failed || scheduled) return;
    scheduled = true;
    window.setTimeout(async () => {
        scheduled = false;
        if (pending || failed || settled) return;
        const hero = document.querySelector('.hero-section');
        const images = !hasIntro() ? [] : hero
            ? Array.from(hero.querySelectorAll<HTMLImageElement>('.carousel-img.is-active, #hero-portrait-image'))
            : Array.from(document.querySelectorAll<HTMLImageElement>('#gallery-grid img, #posts-list img, #post-media img')).slice(0, 2);
        try {
            await Promise.all(images.filter(image => !image.hidden && image.getAttribute('src')).map(image => new Promise<void>(resolve => {
                const unavailable = () => { image.setAttribute('data-image-error', ''); image.closest('.gallery-card')?.classList.add('is-error'); resolve(); };
                const finish = () => { cleanup(); image.naturalWidth ? image.decode().catch(() => {}).then(resolve) : unavailable(); };
                const timeout = window.setTimeout(() => { cleanup(); unavailable(); }, 20000);
                const cleanup = () => { window.clearTimeout(timeout); image.removeEventListener('load', finish); image.removeEventListener('error', finish); };
                image.loading = 'eager';
                image.addEventListener('load', finish, { once: true });
                image.addEventListener('error', finish, { once: true });
                if (image.complete) finish();
            })));
            const remaining = hasIntro() ? minimumCoverMs - (performance.now() - coverStartedAt) : 0;
            if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
            if (pending || failed) return;
            settled = true;
            try { sessionStorage.setItem('lingxun-intro-seen', '1'); } catch { /* Same-origin navigation is also checked before paint. */ }
            try {
                const state = history.state && typeof history.state === 'object' ? history.state : {};
                history.replaceState({ ...state, lingxunIntroSeen: true }, '', window.location.href);
            } catch { /* Loading remains usable without browser storage/history access. */ }
            requestAnimationFrame(() => {
                document.documentElement.removeAttribute('data-page-loading');
                heldElements.forEach(element => { element.inert = false; });
                heldElements.clear();
                document.getElementById('page-cover')?.setAttribute('data-state', 'ready');
                const status = document.getElementById('page-load-status');
                if (status) status.hidden = true;
                window.dispatchEvent(new Event('lingxun:page-ready'));
                window.setTimeout(() => { const cover = document.getElementById('page-cover'); if (cover) cover.hidden = true; }, 400);
            });
        } catch { failPageLoad(); }
    }, 0);
}

export function startPageLoad() {
    started = true;
    coverStartedAt = performance.now();
    if (hasIntro()) Array.from(document.body.children).forEach(element => {
        if (!(element instanceof HTMLElement) || element.id === 'page-cover' || /^(SCRIPT|STYLE|LINK)$/.test(element.tagName) || element.inert) return;
        element.inert = true;
        heldElements.add(element);
    });
    document.getElementById('page-cover-retry')?.addEventListener('click', () => window.location.reload());
    document.getElementById('page-load-status-retry')?.addEventListener('click', () => window.location.reload());
    window.setTimeout(() => {
        if (settled || failed) return;
        if (hasIntro()) {
            const message = document.getElementById('page-cover-message');
            if (message) message.textContent = '网络有些慢，正在加载，请耐心等候。';
        } else showStatus('网络有些慢，正在加载最新内容……');
    }, 4000);
    // Also covers module/runtime failures that leave a content region pending forever.
    window.setTimeout(() => { if (!settled) failPageLoad(); }, 45000);
    const start = () => scheduleFinish();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
}
