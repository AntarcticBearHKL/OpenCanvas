// Workspace screenshot providers: each studio registers how to render its own
// workspace to a PNG data URL, and the agent bridge asks the active one.

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
    return provider ? await provider() : null;
}
