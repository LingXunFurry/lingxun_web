export type GalleryPhoto = {
    id: number;
    title: string;
    description: string;
    file_url: string;
    original_filename: string;
    sort_order: number;
    is_visible: boolean;
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
    is_published: boolean;
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
    birthday_date: string;
    love_date: string;
    site_date: string;
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
    if (window.location.port === "4321") return "http://127.0.0.1:8000";
    return window.location.origin;
}

export function toApiUrl(url: string | null | undefined) {
    if (!url) return "";
    if (/^https?:\/\//.test(url)) return url;
    return `${getApiBase()}${url}`;
}

export async function fetchPublic<T>(path: string): Promise<T | null> {
    try {
        const response = await fetch(`${getApiBase()}${path}`, {
            headers: { Accept: "application/json" },
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
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
