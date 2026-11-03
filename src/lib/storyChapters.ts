import { Marked, type Token, type Tokens } from 'marked';
import { markdownToHtml } from './markdown';

// Existing stories use plain-text chapter names rather than Markdown headings.
const chapterLine = /^(?:第[零〇一二三四五六七八九十百千两0-9]+[章节卷部](?:\s+|[：:、.．]|$).{0,80}|(?:序章|序言|楔子|尾声|后记|特别章|番外)(?:[\s：:、]+.{0,80})?)$/;

export function renderStoryChapters(source: string) {
    // Only promote top-level prose, never chapter-like text inside code or quotes.
    const tokens = new Marked().lexer(source.replace(/\r\n?/g, '\n'));
    const normalized = tokens.map((token: Token) => {
        if (token.type !== 'paragraph') return token.raw;
        return (token as Tokens.Paragraph).raw.split('\n').map(line => {
            const title = line.trim();
            return chapterLine.test(title) ? `\n## ${title}\n` : line;
        }).join('\n');
    }).join('');
    return markdownToHtml(normalized);
}
