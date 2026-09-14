import { markdownToHtml } from './publicContent';

// Existing stories use plain-text chapter names rather than Markdown headings.
const chapterLine = /^(?:第[零〇一二三四五六七八九十百千两0-9]+[章节卷部](?:\s+|[：:、.．]|$).{0,80}|(?:序章|序言|楔子|尾声|后记|特别章|番外)(?:[\s：:、]+.{0,80})?)$/;

export function renderStoryChapters(source: string) {
    const normalized = source.replace(/\r\n?/g, '\n').split('\n').map(line => {
        const title = line.trim();
        return chapterLine.test(title) ? `\n## ${title}\n` : line;
    }).join('\n');
    return markdownToHtml(normalized);
}
