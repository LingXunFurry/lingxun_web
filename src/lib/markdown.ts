import { Marked } from 'marked';
import DOMPurify from 'dompurify';

// Keep ordinary single line breaks compatible with existing handwritten stories.
const parser = new Marked({ gfm: true, breaks: true, async: false, renderer: {
    tablecell(cell) {
        const tag = cell.header ? 'th' : 'td';
        return `<${tag}${cell.align ? ` align="${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</${tag}>`;
    },
} });

function contentUrl(value: string): URL | null {
    try { return new URL(value, location.href); }
    catch { return null; }
}

export function markdownToHtml(markdown: string): string {
    const source = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const fragment = DOMPurify.sanitize(parser.parse(source, { async: false }), {
        ALLOWED_TAGS: ['a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div',
            'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
            'i', 'img', 'input', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 's', 'samp', 'small',
            'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul'],
        ALLOWED_ATTR: ['alt', 'align', 'checked', 'class', 'disabled', 'href', 'src', 'start', 'title', 'type'],
        ALLOW_DATA_ATTR: false,
        RETURN_DOM_FRAGMENT: true,
    });
    const container = document.createElement('div');
    container.append(fragment);
    container.querySelectorAll<HTMLInputElement>('input').forEach(input => {
        if (input.type !== 'checkbox') { input.remove(); return; }
        input.disabled = true;
    });
    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
        const url = contentUrl(link.getAttribute('href')!);
        if (!url || !['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) link.removeAttribute('href');
        else if (['http:', 'https:'].includes(url.protocol) && url.origin !== location.origin) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
    container.querySelectorAll<HTMLImageElement>('img').forEach(image => {
        const url = contentUrl(image.getAttribute('src') || '');
        if (!url || !['http:', 'https:'].includes(url.protocol)) image.removeAttribute('src');
        image.setAttribute('loading', 'lazy');
        image.setAttribute('decoding', 'async');
    });
    container.querySelectorAll('table').forEach(table => {
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-table';
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', '文章表格');
        table.replaceWith(wrapper);
        wrapper.append(table);
    });
    return container.innerHTML;
}
