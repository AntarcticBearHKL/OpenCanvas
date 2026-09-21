import { useTranslation } from "react-i18next";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type PromptContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

export function PromptContent({ node, theme }: PromptContentProps) {
    const { t } = useTranslation();
    const prompt = node.metadata?.prompt || "";

    return (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl p-4">
            <div className="min-h-0 flex-1 overflow-hidden">
                {prompt ? (
                    <div className="line-clamp-6 whitespace-pre-wrap break-words font-mono text-sm leading-6" style={{ color: theme.node.text }}>
                        {prompt}
                    </div>
                ) : (
                    <div className="font-mono text-sm" style={{ color: theme.node.placeholder }}>
                        {t("canvas.promptNode.placeholder")}
                    </div>
                )}
            </div>
            <div className="shrink-0 pt-2 text-[11px]" style={{ color: theme.node.muted }}>
                {t("canvas.promptNode.panelHint")}
            </div>
        </div>
    );
}
