const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
const LATIN_PATTERN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function htmlToPlain(html: string): string {
    if (!html) return "";
    if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").trim();
    const el = document.createElement("div");
    el.innerHTML = html;
    return (el.innerText || el.textContent || "").trim();
}

export function countWords(text: string): number {
    if (!text) return 0;
    const cjk = text.match(CJK_PATTERN)?.length ?? 0;
    const latin = text.replace(CJK_PATTERN, " ").match(LATIN_PATTERN)?.length ?? 0;
    return cjk + latin;
}

export function tail(text: string, limit: number): string {
    return text.length > limit ? text.slice(-limit) : text;
}
