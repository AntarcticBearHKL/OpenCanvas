import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { commitBoardLayers } from "@/components/canvas/workspace/ps-layer-ops";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_FLAT_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import type { CanvasNodeData, CanvasPsLayer } from "@/types/canvas";

export type PsHistoryEntry = { id: string; name: string; layers: CanvasPsLayer[] };
export type PsHistoryState = { entries: PsHistoryEntry[]; index: number };

export const PS_HISTORY_LIMIT = 50;

const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;

/**
 * History lives only in the editor session: it keeps layer-document snapshots in memory and never writes them into the
 * board, so closing the workspace drops it and the document keeps exactly one saved state.
 */
export function usePsHistory(board: CanvasNodeData | null, layers: CanvasPsLayer[], setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>) {
    const { t } = useTranslation();
    const [state, setState] = useState<PsHistoryState>({ entries: [], index: -1 });
    const labelRef = useRef("");
    const skipRef = useRef(false);
    const boardRef = useRef("");
    const layersRef = useRef(layers);
    layersRef.current = layers;

    useEffect(() => {
        if (!board || board.id === boardRef.current) return;
        boardRef.current = board.id;
        skipRef.current = true;
        setState({ entries: [{ id: nanoid(), name: t("canvas.ps.historyOpen"), layers: layersRef.current }], index: 0 });
    }, [board, t]);

    useEffect(() => {
        if (!board || board.id !== boardRef.current) return;
        if (skipRef.current) {
            skipRef.current = false;
            return;
        }
        const name = labelRef.current || t("canvas.ps.historyEdit");
        labelRef.current = "";
        setState((prev) => {
            const entries = [...prev.entries.slice(0, prev.index + 1), { id: nanoid(), name, layers }].slice(-PS_HISTORY_LIMIT);
            return { entries, index: entries.length - 1 };
        });
    }, [layers]);

    const label = (name: string) => {
        labelRef.current = name;
    };
    const restore = (index: number) => {
        if (!board || index < 0 || index >= state.entries.length) return;
        skipRef.current = true;
        window.setTimeout(() => {
            skipRef.current = false;
        }, 0);
        commitBoardLayers(setNodes, board.id, state.entries[index].layers);
        setState((prev) => ({ ...prev, index }));
    };
    const snapshot = () => {
        setState((prev) => {
            const current = prev.entries[prev.index];
            if (!current) return prev;
            const entries = [...prev.entries.slice(0, prev.index + 1), { id: nanoid(), name: t("canvas.ps.historySnapshot"), layers: current.layers }, ...prev.entries.slice(prev.index + 1)].slice(-PS_HISTORY_LIMIT);
            return { entries, index: Math.min(prev.index + 1, entries.length - 1) };
        });
    };
    return { state, label, restore, snapshot };
}

export function PsHistoryPanel({ history, onRestore, onSnapshot }: { history: PsHistoryState; onRestore: (index: number) => void; onSnapshot: () => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const rows = history.entries.map((entry, index) => ({ entry, index })).reverse();
    return (
        <ImageSettingsTheme theme={theme}>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-1 px-2 py-1">
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={history.index <= 0} aria-label={t("canvas.ps.historyBack")} title={t("canvas.ps.historyBack")} onClick={() => onRestore(history.index - 1)}>
                        <ChevronLeft className="size-3.5" />
                    </button>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={history.index >= history.entries.length - 1} aria-label={t("canvas.ps.historyForward")} title={t("canvas.ps.historyForward")} onClick={() => onRestore(history.index + 1)}>
                        <ChevronRight className="size-3.5" />
                    </button>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} aria-label={t("canvas.ps.historySnapshot")} title={t("canvas.ps.historySnapshot")} onClick={onSnapshot}>
                        <Camera className="size-3.5" />
                        {t("canvas.ps.historySnapshot")}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-right text-sm tabular-nums" style={{ color: theme.node.text }}>
                        {t("canvas.ps.historyCount", { count: history.entries.length, limit: PS_HISTORY_LIMIT })}
                    </span>
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 glass-card">
                    {rows.map(({ entry, index }) => (
                        <button
                            key={entry.id}
                            type="button"
                            className="flex w-full items-center gap-1.5 border-b px-1.5 py-0.5 text-left text-sm transition hover:bg-hover"
                            style={index === history.index ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText, borderColor: theme.toolbar.border, boxShadow: `inset 2px 0 0 0 ${theme.node.accent}` } : { borderColor: theme.toolbar.border, color: index > history.index ? theme.node.muted : theme.node.text }}
                            onClick={() => onRestore(index)}
                        >
                            <span className="size-4 shrink-0 rounded-[2px] border" style={{ borderColor: theme.toolbar.border, background: index === history.index ? theme.node.activeStroke : "transparent" }} />
                            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                            <span className="shrink-0 tabular-nums" style={index === history.index ? undefined : { color: theme.node.muted }}>
                                {index + 1}
                            </span>
                        </button>
                    ))}
                </div>
                <p className="shrink-0 px-2 pb-1.5 text-sm" style={{ color: theme.node.muted }}>
                    {t("canvas.ps.historyTransient")}
                </p>
            </div>
        </ImageSettingsTheme>
    );
}
