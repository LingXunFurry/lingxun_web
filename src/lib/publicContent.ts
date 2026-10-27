import { beginPageTask } from './pageLoad';

export type ImageAsset = {
    src: string; width: number; height: number; bytes: number;
    original_url?: string; original_bytes?: number;
    variants: { src: string; width: number; height: number; bytes: number }[];
};

export type GalleryPhoto = {
    id: number;
    title: string;
    description: string;
    category?: string;
    date?: string;
    location?: string;
    file_url: string;
    original_filename: string;
    sort_order: number;
    is_visible: boolean;
    character_ids?: number[] | null;
    is_home_hero?: boolean;
    hero_order?: number;
    is_home_portrait?: boolean;
    is_home_gallery?: boolean;
    home_order?: number;
    image?: ImageAsset | null;
};

export type PublicPost = {
    id: number;
    slug: string;
    title: string;
    date: string;
    tag: string;
    desc: string;
    content: string;
    cover_url?: string | null;
    image_urls?: string[] | null;
    attachments?: string[] | null;
    links?: { label?: string; url: string }[] | null;
    is_published: boolean;
    is_pinned?: boolean;
    pin_order?: number;
    is_character_story?: boolean;
    story_order?: number;
    story_summary?: string;
    story_character_id?: number | null;
    story_cover_url?: string | null;
    story_image?: ImageAsset | null;
    cover_image?: ImageAsset | null;
    image_assets?: Record<string, ImageAsset | null>;
};

export type CharacterProfile = {
    id: number;
    name: string;
    alias: string;
    species: string;
    role: string;
    region: string;
    work: string;
    places: string;
    status: string;
    introduction: string;
    details?: string;
    custom_fields?: { label?: string; value?: string }[] | null;
    image_url: string;
    image?: ImageAsset | null;
    sort_order: number;
    is_visible: boolean;
};

export type PostComment = {
    id: number;
    post_id: number;
    parent_id?: number | null;
    author_id: string;
    avatar_url: string;
    content: string;
    like_count: number;
    is_visible: boolean;
    created_at?: string | null;
    updated_at?: string | null;
};

export type BonusContent = {
    typewriter_message: string;
    birthday_title: string;
    birthday_subtitle: string;
    birthday_date: string;
    love_title: string;
    love_subtitle: string;
    love_date: string;
    site_title: string;
    site_subtitle: string;
    site_date: string;
    future_title: string;
    future_subtitle: string;
    future_date: string;
};

export type SiteStats = {
    visit_count: number;
    interaction_count: number;
};

export type ScheduleItem = {
    id: number;
    code: string;
    name: string;
    location: string;
    start_date: string;
    end_date: string;
    description: string;
    sort_order: number;
    is_visible: boolean;
};

export type SocialLink = {
    id: number;
    name: string;
    icon: string;
    desc: string;
    link: string;
    number: string;
    sort_order: number;
    is_visible: boolean;
};

export type FriendLink = {
    id: number;
    display_id: string;
    avatar_url: string;
    url: string;
    comment: string;
    sort_order: number;
    is_visible: boolean;
};

export function getApiBase() {
    const configured = document.documentElement.dataset.apiBase;
    if (configured) return configured;
    // Astro dev runs separately from FastAPI; production/local FastAPI pages are same-origin.
    if (["4321", "8080", "8765"].includes(window.location.port) && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
        return "http://127.0.0.1:8000";
    }
    return window.location.origin;
}

export function toApiUrl(url: string | null | undefined) {
    if (!url) return "";
    if (/^https?:\/\//.test(url)) return url;
    return `${getApiBase()}${url}`;
}

const publicRequests = new Map<string, Promise<unknown | null>>();

export function fetchPublic<T>(path: string): Promise<T | null> {
    const url = `${getApiBase()}${path}`;
    const pending = publicRequests.get(url);
    if (pending) return pending as Promise<T | null>;
    const request = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!response.ok) return null;
            return await response.json() as T;
        } catch {
            return null;
        } finally {
            window.clearTimeout(timeout);
            publicRequests.delete(url);
        }
    })();
    publicRequests.set(url, request);
    return request;
}

export async function fetchRequired<T>(path: string): Promise<T> {
    const data = await fetchPublic<T>(path);
    if (data === null) throw new Error(`Latest content unavailable: ${path}`);
    return data;
}

export function initPublicContent(selector: string, initialize: () => Promise<void>) {
    const complete = beginPageTask();
    const start = async () => {
        const regions = document.querySelectorAll<HTMLElement>(selector);
        let success = false;
        try {
            await initialize();
            success = true;
        } catch {
            complete(false);
            return;
        } finally {
            regions.forEach(region => {
                if (success) {
                    region.removeAttribute('data-public-pending');
                    region.removeAttribute('aria-busy');
                } else region.setAttribute('data-public-error', '');
            });
            complete();
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else void start();
}

export function imageAttributes(url: string, image?: ImageAsset | null, sizes = '100vw') {
    const src = image?.src || url;
    const variants = image?.variants || [];
    return `src="${escapeHtml(toApiUrl(src))}"${variants.length ? ` srcset="${variants.map(item => `${escapeHtml(toApiUrl(item.src))} ${item.width}w`).join(', ')}" sizes="${escapeHtml(sizes)}"` : ''}${image?.width ? ` width="${image.width}" height="${image.height}"` : ''}`;
}

export function setImageSource(element: HTMLImageElement, url: string, image?: ImageAsset | null, sizes = '100vw') {
    element.removeAttribute('srcset');
    element.removeAttribute('sizes');
    if (image?.variants?.length) {
        element.sizes = sizes;
        element.srcset = image.variants.map(item => `${toApiUrl(item.src)} ${item.width}w`).join(', ');
    }
    element.src = toApiUrl(image?.src || url);
}

export async function postPublic<T>(path: string): Promise<T | null> {
    try {
        const response = await fetch(`${getApiBase()}${path}`, {
            method: "POST",
            headers: { Accept: "application/json" },
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

export async function submitPublicForm<T>(path: string, body: FormData): Promise<T | null> {
    try {
        const response = await fetch(`${getApiBase()}${path}`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body,
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

export function escapeHtml(value: string | number | null | undefined) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function markdownToHtml(markdown: string) {
    const blocks = markdown.replace(/\r\n/g, "\n").split(/\n{2,}/);
    return blocks
        .map((block) => {
            const trimmed = block.trim();
            if (!trimmed) return "";
            if (trimmed.startsWith("### ")) return `<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`;
            if (trimmed.startsWith("## ")) return `<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`;
            if (trimmed.startsWith("# ")) return `<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`;
            if (trimmed.startsWith("> ")) return `<blockquote>${inlineMarkdown(trimmed.replace(/^> /gm, ""))}</blockquote>`;
            if (/^[-*] /.test(trimmed)) {
                const items = trimmed
                    .split("\n")
                    .filter((line) => /^[-*] /.test(line))
                    .map((line) => `<li>${inlineMarkdown(line.replace(/^[-*] /, ""))}</li>`)
                    .join("");
                return `<ul>${items}</ul>`;
            }
            return `<p>${inlineMarkdown(trimmed).replaceAll("\n", "<br>")}</p>`;
        })
        .join("");
}

function inlineMarkdown(value: string) {
    return escapeHtml(value)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`(.+?)`/g, "<code>$1</code>");
}
