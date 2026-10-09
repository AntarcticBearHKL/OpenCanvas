// Workspace screenshot providers: each studio registers how to render its own
// workspace to a PNG data URL, and the agent bridge asks the active one.

import { toPng } from "html-to-image";

export type WorkspaceScreenshot = {
    studio: string;
    dataUrl: string;
    mimeType: string;
    width: number;
    height: number;
};

type ScreenshotProvider = () => WorkspaceScreenshot | null | Promise<WorkspaceScreenshot | null>;

const providers = new Map<string, ScreenshotProvider>();

export function registerScreenshotProvider(studio: string, provider: ScreenshotProvider) {
    providers.set(studio, provider);
    return () => {
        if (providers.get(studio) === provider) providers.delete(studio);
    };
}

export async function captureWorkspaceScreenshot(studio: string): Promise<WorkspaceScreenshot | null> {
    const provider = providers.get(studio);
    const shot = provider ? await provider() : null;
    return shot ?? captureDomScreenshot(studio);
}

async function captureDomScreenshot(studio: string): Promise<WorkspaceScreenshot | null> {
    const root = document.querySelector("main");
    if (!(root instanceof HTMLElement)) return null;
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    try {
        const dataUrl = await toPng(root, { cacheBust: true, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), backgroundColor: getComputedStyle(root).backgroundColor });
        return { studio: studio || "workspace", dataUrl, mimeType: "image/png", width: Math.round(rect.width), height: Math.round(rect.height) };
    } catch {
        return null;
    }
}
