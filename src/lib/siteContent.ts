import { fetchPublic, toApiUrl } from './publicContent';

type Entry = { key: string; value: string; content_type: string };
let contentRequest: Promise<Entry[] | null> | undefined;
const contentValues = new Map<string, string>();
const localImages = import.meta.glob<{ default: { src: string } }>('../assets/**/*.{png,jpg,jpeg,webp,avif}', { eager: true });
export const resolveSiteImage = (value: string) => value.startsWith('/src/assets/')
    ? localImages[value.replace('/src/', '../')]?.default.src || ''
    : /^\/(?!\/)|^https?:\/\//i.test(value) ? toApiUrl(value) : '';
export const loadSiteContent = () => contentRequest ||= fetchPublic<Entry[]>('/api/public/site-content').then(entries => {
    entries?.forEach(entry => contentValues.set(entry.key, entry.value));
    return entries;
});
export const siteText = (key: string, fallback: string) => contentValues.get(key) ?? fallback;
export const siteFormat = (key: string, fallback: string, values: Record<string, string | number>) =>
    siteText(key, fallback).replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
type Binding = [string, string?];
const bindings: Record<string, Binding> = {
    'hero.scroll_label': ['.hero-section__scroll', 'aria-label'],
    'character.previous_label': ['#character-prev', 'aria-label'],
    'character.next_label': ['#character-next', 'aria-label'],
    'story.book_label': ['.story-book', 'aria-label'],
    'story.chapters_nav': ['#story-excerpts', 'aria-label'],
    'story.pagination_label': ['.story-book__pagination', 'aria-label'],
    'story.previous_label': ['#story-prev', 'aria-label'],
    'story.next_label': ['#story-next', 'aria-label'],
    'gallery.category_filter_label': ['.gallery-filter-list', 'aria-label'],
    'gallery.character_filter_label': ['#gallery-character-filters', 'aria-label'],
    'gallery.close_label': ['#modal-close', 'aria-label'],
    'gallery.previous_label': ['#modal-prev', 'aria-label'],
    'gallery.next_label': ['#modal-next', 'aria-label'],
    'gallery.thumbs_label': ['#modal-thumbs', 'aria-label'],
    'post.chapters_label': ['#story-contents', 'aria-label'],
    'egg.photo_label': ['.egg-portrait', 'aria-label'],
    'egg.menu_label': ['#daily-menu-list', 'aria-label'],
    'navbar.label': ['#navbar', 'aria-label'],
    'site.home_title': ['title[data-content-title="site.home_title"]'],
    'site.gallery_title': ['title[data-content-title="site.gallery_title"]'],
    'site.posts_title': ['title[data-content-title="site.posts_title"]'],
    'site.friends_title': ['title[data-content-title="site.friends_title"]'],
    'site.description': ['meta[name="description"]', 'content'],
    'site.favicon': ['#site-favicon', 'image-href'],
    'hero.scroll_hint': ['.hero-section__scroll .meta'],
    'gallery.grid_loading': ['#gallery-loading'],
    'posts.read': ['.note-card__more', 'text-node'],
    'posts.no_cover': ['.post-card__cover-empty'],
    'final.external_notice': ['.social-card__hint'],
    'post.resources_title': ['#post-resources > .eyebrow'],
    'post.attachments_title': ['#post-resources [data-resource-title="attachments"]'],
    'post.links_title': ['#post-resources [data-resource-title="links"]'],
    'gallery.index_label': ['.gallery-page__index > span:first-child'],
    'gallery.count_unit': ['.gallery-page__index > span:last-child'],
    'gallery.all': ['[data-filter="全部"]'],
    'gallery.character_label': ['.gallery-character-label'],
    'gallery.all_characters': ['[data-character-filter="all"]'],
    'gallery.open': ['.gallery-card__open'],
    'gallery.modal_label': ['.lightbox-modal__toolbar > div:first-child > .meta'],
    'gallery.save': ['#modal-download', 'text-node'],
    'gallery.zoom': ['#modal-zoom'],
    'gallery.close': ['#modal-close', 'text-node'],
    'gallery.date_label': ['.lightbox-modal__info dl > div:first-child > dt'],
    'gallery.location_label': ['.lightbox-modal__info dl > div:last-child > dt'],
    'egg.loader_note': ['.egg-loader__meta > span:first-child'],
    'egg.photo_caption': ['.egg-portrait__caption'],
    'egg.visit_note': ['.egg-card--visitors > .egg-card__label > .meta'],
    'egg.visit_unit': ['.egg-card__number > span'],
    'egg.pulse_note': ['.egg-pulse-wrap .egg-card__label > .meta'],
    'egg.pulse_total': ['.egg-pulse-wrap > p:has(#bonus-interaction-count)', 'text-node'],
    'egg.lamp_label': ['.egg-note__line > span'],
    'egg.lamp_value': ['.egg-note__line > strong'],
    'egg.dates_note': ['.egg-card--dates .egg-card__label > .meta'],
    'egg.days_unit': ['.memory-card > span:last-child'],
    'egg.message_note': ['.egg-card--message .egg-card__label > .meta'],
    'egg.quest_note': ['.egg-quest__copy .egg-card__label > .meta'],
    'egg.ticket_label': ['#quest-draw-ticket > .tag'],
    'hero.photo_label': ['.hero-section__portrait-label'],
    'hero.photo_caption': ['.hero-section__portrait-caption > span:first-child'],
    'hero.photo_number': ['.hero-section__portrait-caption > span:last-child'],
    'story.art_caption': ['.story-book__art > .meta:not(.story-book__bookmark)'],
    'friends.note': ['.friend-card__note > .meta'],
    'common.back_home': ['.friends-page__footer a, .archive-page__footer a, .gallery-page__footer a', 'text-node'],
    'posts.keyword_label': ['.post-search__field:first-child > span'],
    'posts.date_label': ['.post-search__field:nth-child(2) > span'],
    'posts.reset': ['#post-search-reset'],
    'post.author_label': ['#comment-form label:has(input[name="author_id"])', 'text-node'],
    'post.author_placeholder': ['#comment-form input[name="author_id"]', 'placeholder'],
    'post.content_label': ['#comment-form label:has(textarea[name="content"])', 'text-node'],
    'post.content_placeholder': ['#comment-form textarea[name="content"]', 'placeholder'],
    'post.submit': ['#comment-submit', 'text-node'],
    'post.cancel_reply': ['#cancel-reply'],
    'post.chapters_title': ['#story-contents summary', 'text-node'],
    'site.brand_name': ['.site-brand > span', 'text-node'],
    'site.brand_english': ['.site-brand__en'],
    'site.logo_image': ['.site-brand img', 'src'],
    'navbar.contact': ['#contact-menu-btn, #mobile-contact-btn', 'text-node'],
    'navbar.theme': ['#mobile-theme-toggle', 'text-node'],
    'navbar.home': ['#navbar a.site-nav__link[href="/"]'],
    'navbar.gallery': ['#navbar a.site-nav__link[href="/gallery/"]'],
    'navbar.posts': ['#navbar a.site-nav__link[href="/posts/"]'],
    'navbar.friends': ['#navbar a.site-nav__link[href="/friends/"]'],
    'navbar.external_notice': ['.site-nav__contact-note'],
    'navbar.empty': ['.site-nav__contact-empty'],
    'hero.eyebrow': ['.hero-section .eyebrow'],
    'hero.note': ['.hero-section__note'],
    'hero.title_main': ['#hero-title', 'text-node'],
    'hero.title_accent': ['#hero-title span'],
    'hero.subtitle': ['.hero-section__subtitle'],
    'hero.body': ['.hero-section__body'],
    'hero.primary_action': ['.hero-section__actions a:first-child', 'text-node'],
    'hero.secondary_action': ['.hero-section__actions a:last-child', 'text-node'],
    'character.photo_label': ['.character-section__photo-label'],
    'character.photo_caption': ['.character-section__photo-caption > span:first-child'],
    'character.photo_category': ['.character-section__photo-caption > span:last-child'],
    'character.eyebrow': ['#character-profile .eyebrow'],
    'story.eyebrow': ['.story-section__heading .eyebrow'],
    'story.title_main': ['#story-title-main'],
    'story.title_accent': ['#story-title-accent'],
    'story.intro': ['#story-intro'],
    'story.read_action': ['#story-read', 'text-node'],
    'story.chapters_label': ['#story-chapters-label'],
    'home_gallery.eyebrow': ['.home-gallery-section .eyebrow'],
    'home_gallery.title_main': ['#home-gallery-title', 'text-node'],
    'home_gallery.title_accent': ['#home-gallery-title em'],
    'home_gallery.body': ['.home-gallery-section .section-copy'],
    'home_gallery.action': ['.home-gallery-section__intro .button', 'text-node'],
    'home_feed.eyebrow': ['.home-feed-section .eyebrow'],
    'home_feed.title_main': ['#home-feed-title', 'text-node'],
    'home_feed.title_accent': ['#home-feed-title em'],
    'home_feed.body': ['.home-feed-section__heading-copy'],
    'home_feed.footer': ['.home-feed-section__footer > .meta'],
    'home_feed.action': ['.home-feed-section__footer .button', 'text-node'],
    'final.schedule_eyebrow': ['.final-section__column:first-child > .eyebrow'],
    'final.schedule_title_main': ['#schedule-title', 'text-node'],
    'final.schedule_title_accent': ['#schedule-title em'],
    'final.schedule_body': ['.final-section__column:first-child > .section-copy'],
    'final.contact_eyebrow': ['.final-section__contact > .eyebrow'],
    'final.contact_title': ['.final-section__contact > .section-title'],
    'final.contact_body': ['.final-section__contact > .section-copy'],
    'final.friends_action': ['.final-section__friends', 'text-node'],
    'final.secret_action': ['#entry-trigger'],
    'final.secret_label': ['#system-log-btn'],
    'gallery.eyebrow': ['.gallery-page__header .eyebrow'],
    'gallery.title_main': ['#gallery-title', 'text-node'],
    'gallery.title_accent': ['#gallery-title em'],
    'gallery.body': ['.gallery-page__header .section-copy'],
    'gallery.empty': ['#gallery-empty'],
    'gallery.footer': ['.gallery-page__footer > .meta'],
    'posts.eyebrow': ['.archive-page__header .eyebrow'],
    'posts.title_main': ['#posts-title', 'text-node'],
    'posts.title_accent': ['#posts-title em'],
    'posts.body': ['.archive-page__header .section-copy'],
    'posts.search_placeholder': ['#post-search-keyword', 'placeholder'],
    'posts.footer': ['.archive-page__footer > .meta'],
    'friends.eyebrow': ['.friends-page__header .eyebrow'],
    'friends.title_main': ['#friends-title', 'text-node'],
    'friends.title_accent': ['#friends-title em'],
    'friends.body': ['.friends-page__header .section-copy'],
    'friends.empty': ['#friends-empty'],
    'friends.footer': ['.friends-page__footer > .meta'],
    'post.back': ['.dynamic-post-page__back', 'text-node'],
    'post.comments_eyebrow': ['.comments-section__heading .eyebrow'],
    'post.comments_title': ['#comments-title'],
    'post.comments_notice': ['.comment-form__notice'],
    'egg.archive_image': ['.egg-portrait img', 'src'],
    'egg.loading': ['.egg-loader > p'],
    'egg.eyebrow': ['.egg-header .eyebrow'],
    'egg.title_main': ['#egg-title', 'text-node'],
    'egg.title_accent': ['#egg-title em'],
    'egg.intro': ['.egg-header__copy > p'],
    'egg.close_action': ['#close-egg-button', 'text-node'],
    'egg.visitors_title': ['.egg-card--visitors > .egg-card__label > span:first-child'],
    'egg.visitors_body': ['.egg-card--visitors > p'],
    'egg.pulse_title': ['.egg-pulse-wrap .egg-card__label > span:first-child'],
    'egg.pulse_action': ['.egg-pulse-button__text'],
    'egg.menu_title': ['.egg-card--menu .egg-card__label > span:first-child'],
    'egg.menu_intro': ['#daily-menu-description'],
    'egg.dates_title': ['.egg-card--dates .egg-card__label > span:first-child'],
    'egg.message_title': ['.egg-card--message .egg-card__label > span:first-child'],
    'egg.quest_title': ['.egg-quest__copy .egg-card__label > span:first-child'],
    'egg.quest_intro': ['.egg-quest__intro'],
    'egg.quest_action': ['#quest-draw-button', 'text-node'],
};

export async function initSiteContent() {
    const entries = await loadSiteContent();
    if (!entries) return;
    const applied = new WeakMap<Element, Set<string>>();
    const apply = () => {
        for (const entry of entries) {
            const binding = bindings[entry.key];
            if (!binding) continue;
            const [selector, mode] = binding;
            document.querySelectorAll(selector).forEach(element => {
                const keys = applied.get(element) || new Set<string>();
                if (keys.has(entry.key)) return;
                keys.add(entry.key);
                applied.set(element, keys);
                if (mode === 'src' || mode === 'image-href') {
                    const attribute = mode === 'src' ? 'src' : 'href';
                    const url = resolveSiteImage(entry.value);
                    if (!url) {
                        element.removeAttribute(attribute);
                        element.removeAttribute('srcset');
                        element.setAttribute('hidden', '');
                        (element as HTMLElement).style.display = 'none';
                        return;
                    }
                    element.removeAttribute('hidden');
                    (element as HTMLElement).style.removeProperty('display');
                    if (element.getAttribute(attribute) !== url) {
                        element.removeAttribute('srcset');
                        element.setAttribute(attribute, url);
                    }
                } else if (mode === 'placeholder' || mode === 'content' || mode === 'aria-label') {
                    if (element.getAttribute(mode) !== entry.value) element.setAttribute(mode, entry.value);
                } else if (mode === 'text-node') {
                    const node = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
                    if (node && node.textContent !== entry.value) node.textContent = entry.value;
                } else if (element.textContent !== entry.value) {
                    element.textContent = entry.value;
                }
            });
        }
    };
    apply();
    // New API-rendered elements inherit content once; live counters and replies retain ownership.
    let scheduled = false;
    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; apply(); });
    }).observe(document.body, { childList: true, subtree: true });
}
