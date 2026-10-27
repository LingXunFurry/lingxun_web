export function initPageReveals() {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const registered = new WeakSet<Element>();
    const waiting = new Set<Element>();
    const intersecting = new Set<Element>();
    let scheduled = false;

    const canReveal = (item: Element) => !root.hasAttribute('data-page-loading')
        && !root.hasAttribute('data-site-content-pending')
        && !item.closest('[data-public-pending], [data-public-error], [data-media-pending]')
        && !item.querySelector('[data-public-pending], [data-public-error], [data-media-pending]');

    const flush = () => {
        scheduled = false;
        waiting.forEach(item => {
            if (!item.isConnected) { waiting.delete(item); intersecting.delete(item); return; }
            if (!intersecting.has(item) || !canReveal(item)) return;
            item.classList.add('is-visible');
            waiting.delete(item);
            intersecting.delete(item);
            observer?.unobserve(item);
            edgeObserver?.unobserve(item);
        });
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        // Newly rendered API content needs one hidden paint before its transition starts.
        requestAnimationFrame(() => requestAnimationFrame(flush));
    };
    const trackVisibility = (entries: IntersectionObserverEntry[]) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) intersecting.add(entry.target);
            else intersecting.delete(entry.target);
        });
        schedule();
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(trackVisibility, { threshold: 0.01, rootMargin: '0px 0px -6% 0px' });
    // Bottom-anchored first-scene controls must not wait for an impossible extra scroll.
    const edgeObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(trackVisibility, { threshold: 0.01, rootMargin: '0px' });

    const register = () => {
        document.querySelectorAll('[data-reveal]').forEach(item => {
            if (registered.has(item) || item.classList.contains('is-visible')) return;
            registered.add(item);
            waiting.add(item);
            const targetObserver = item.hasAttribute('data-reveal-edge') ? edgeObserver : observer;
            if (targetObserver) targetObserver.observe(item);
            else intersecting.add(item);
        });
        schedule();
    };
    new MutationObserver(register).observe(root, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-public-pending', 'data-public-error', 'data-site-content-pending', 'data-page-loading', 'data-media-pending'],
    });
    window.addEventListener('lingxun:page-ready', schedule);
    window.addEventListener('pageshow', register);
    reducedMotion.addEventListener('change', schedule);
    register();
}
