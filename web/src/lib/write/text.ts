const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const LATIN_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/** Strip TipTap HTML down to plain text so word counts and AI context never see markup. */
export function htmlToPlain(html: string): string {
    if (!html) return "";
    if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
    const el = document.createElement("div");
    el.innerHTML = html;
    return (el.innerText || el.textContent || "").trim();
}

/** CJK characters count individually; latin runs count as one word. */
export function countWords(text: string): number {
    if (!text) return 0;
    const cjk = text.match(CJK_PATTERN)?.length ?? 0;
    const latin = text.replace(CJK_PATTERN, " ").match(LATIN_PATTERN)?.length ?? 0;
    return cjk + latin;
}

/** Reading time in minutes, tuned for mixed Chinese/latin prose. */
export function readingMinutes(words: number): number {
    return Math.max(1, Math.round(words / 400));
}

export function tail(text: string, limit: number): string {
    return text.length > limit ? text.slice(-limit) : text;
}

export function head(text: string, limit: number): string {
    return text.length > limit ? text.slice(0, limit) : text;
}
