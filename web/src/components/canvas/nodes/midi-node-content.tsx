import { FileMusic } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type MidiNodeContentProps = { node: CanvasNodeData; theme: CanvasTheme };

export function MidiNodeContent({ node, theme }: MidiNodeContentProps) {
    const { t } = useTranslation();
    const midi = node.metadata?.midi;
    const summary = midi ? `${t("canvas.node.midiTracks", { count: midi.trackCount })} · ${t("canvas.node.midiNotes", { count: midi.noteCount })}` : "";

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 py-3 text-center" style={{ color: theme.node.text }}>
            <FileMusic className="size-7" style={{ color: theme.node.muted }} />
            <span className="max-w-full truncate text-sm font-medium">{node.title || t("canvas.nodeTypes.midi")}</span>
            {summary ? <span className="text-xs" style={{ color: theme.node.muted }}>{summary}</span> : null}
            <span className="text-xs" style={{ color: theme.node.placeholder }}>{t("canvas.node.midiHint")}</span>
        </div>
    );
}
