import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { renderPsDocument } from "@/lib/canvas/smart-canvas";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_FLAT_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { psSelectionBlob, type PsSelection } from "@/components/canvas/workspace/ps-selection";
import type { CanvasNodeData, CanvasNodeMetadata, CanvasPsAlphaChannel } from "@/types/canvas";

export type PsChannelView = "rgb" | "r" | "g" | "b";

const ROW_CLASS = "flex w-full items-center gap-1 border-b px-1 py-0.5 text-sm transition hover:bg-hover";
const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;

/** Channel view is a viewing mode, not a document effect: the composite comes from the shared renderer and only the shown channel changes. */
export function PsChannelPreview({ board, nodes, channel }: { board: CanvasNodeData; nodes: CanvasNodeData[]; channel: PsChannelView }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let active = true;
        void renderPsDocument(board, nodes, { width: board.width, height: board.height }).then(({ canvas }) => {
            const context = canvas?.getContext("2d");
            if (!active || !canvas || !context || channel === "rgb") return;
            const index = channel === "r" ? 0 : channel === "g" ? 1 : 2;
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let offset = 0; offset < image.data.length; offset += 4) {
                const value = image.data[offset + index];
                image.data[offset] = value;
                image.data[offset + 1] = value;
                image.data[offset + 2] = value;
            }
            context.putImageData(image, 0, 0);
            setUrl(canvas.toDataURL("image/png"));
        });
        return () => {
            active = false;
        };
    }, [board, nodes, channel]);
    if (channel === "rgb" || !url) return null;
    return <img src={url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />;
}

export function PsChannelsPanel({
    board,
    onBoardChange,
    selection,
    onLoadSelection,
    view,
    onView,
}: {
    board: CanvasNodeData;
    onBoardChange: (boardId: string, patch: Partial<CanvasNodeMetadata>) => void;
    selection: HTMLCanvasElement | null;
    onLoadSelection: (selection: PsSelection) => void;
    view: PsChannelView;
    onView: (view: PsChannelView) => void;
}) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const channels = board.metadata?.boardAlphaChannels ?? [];
    const visibility = board.metadata?.boardChannelVisibility ?? { r: true, g: true, b: true };
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [renamingId, setRenamingId] = useState("");
    const [nameDraft, setNameDraft] = useState("");

    useEffect(() => {
        let active = true;
        void Promise.all(channels.map(async (channel) => [channel.id, await resolveImageUrl(channel.storageKey)] as const)).then((entries) => {
            if (active) setUrls(Object.fromEntries(entries));
        });
        return () => {
            active = false;
        };
    }, [channels]);

    const setChannels = (next: CanvasPsAlphaChannel[]) => onBoardChange(board.id, { boardAlphaChannels: next });
    const saveSelection = async () => {
        if (!selection) return;
        const blob = await psSelectionBlob(selection);
        if (!blob) return;
        const uploaded = await uploadImage(blob);
        if (!uploaded.storageKey) return;
        setChannels([...channels, { id: uploaded.storageKey, name: t("canvas.ps.channelAlpha", { count: channels.length + 1 }), storageKey: uploaded.storageKey }]);
    };
    const loadChannel = async (channel: CanvasPsAlphaChannel) => {
        const url = await resolveImageUrl(channel.storageKey);
        if (!url) return;
        const image = new Image();
        image.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
            image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = board.width;
        canvas.height = board.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        onLoadSelection({ canvas });
    };
    const toggle = (key: "r" | "g" | "b") => {
        const next = { ...visibility, [key]: !visibility[key] };
        if (!next.r && !next.g && !next.b) return;
        onBoardChange(board.id, { boardChannelVisibility: next });
    };
    const compositeRows: { key: PsChannelView; label: string }[] = [
        { key: "rgb", label: t("canvas.ps.channelRgb") },
        { key: "r", label: t("canvas.ps.channelRed") },
        { key: "g", label: t("canvas.ps.channelGreen") },
        { key: "b", label: t("canvas.ps.channelBlue") },
    ];

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 glass-card" style={{ color: theme.node.text }}>
                {compositeRows.map((row) => {
                    const channelKey = row.key === "rgb" ? null : row.key;
                    const shown = view === row.key;
                    return (
                        <div key={row.key} className={ROW_CLASS} style={shown ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText, borderColor: theme.toolbar.border, boxShadow: `inset 2px 0 0 0 ${theme.node.accent}` } : { borderColor: theme.toolbar.border }}>
                            <button type="button" className="grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-hover" aria-label={t("canvas.ps.channelVisibility")} title={t("canvas.ps.channelVisibility")} onClick={() => channelKey && toggle(channelKey)}>
                                {channelKey ? (visibility[channelKey] ? <Eye className="size-3" /> : <EyeOff className="size-3" />) : <span className="size-3" />}
                            </button>
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onView(row.key)}>
                                <span className="size-4 shrink-0 rounded-md border" style={{ borderColor: theme.toolbar.border, background: row.key === "rgb" ? "linear-gradient(135deg, #ff0000, #00ff00, #0000ff)" : row.key === "r" ? "#ff0000" : row.key === "g" ? "#00ff00" : "#0000ff" }} />
                                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                                {shown ? <Check className="size-3 shrink-0" /> : null}
                            </button>
                        </div>
                    );
                })}
                <div className="mt-1 flex items-center gap-1.5 border-t pt-1.5" style={{ borderColor: theme.toolbar.border }}>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: theme.node.label }}>
                        {t("canvas.ps.channelAlphaTitle")}
                    </span>
                    <button type="button" className={FLAT_BUTTON_CLASS} style={{ color: theme.node.text }} disabled={!selection} onClick={() => void saveSelection()}>
                        <Plus className="size-3" />
                        {t("canvas.ps.channelSaveSelection")}
                    </button>
                </div>
                {channels.length ? (
                    channels.map((channel) => (
                        <div key={channel.id} className={ROW_CLASS} style={{ borderColor: theme.toolbar.border }}>
                            <img src={urls[channel.id] || ""} alt="" className="size-5 shrink-0 rounded-md border object-cover" style={{ borderColor: theme.node.info }} />
                            {renamingId === channel.id ? (
                                <input
                                    autoFocus
                                    className="min-w-0 flex-1 rounded-md border bg-transparent px-1 text-sm"
                                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                                    value={nameDraft}
                                    onChange={(event) => setNameDraft(event.target.value)}
                                    onBlur={() => {
                                        if (nameDraft.trim()) setChannels(channels.map((item) => (item.id === channel.id ? { ...item, name: nameDraft.trim() } : item)));
                                        setRenamingId("");
                                    }}
                                />
                            ) : (
                                <button type="button" className="min-w-0 flex-1 truncate text-left" title={t("canvas.ps.channelRenameHint")} onClick={() => { setRenamingId(channel.id); setNameDraft(channel.name); }}>
                                    {channel.name}
                                </button>
                            )}
                            <button type="button" className="grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-hover" style={{ color: theme.node.muted }} aria-label={t("canvas.ps.channelLoad")} title={t("canvas.ps.channelLoad")} onClick={() => void loadChannel(channel)}>
                                <RefreshCw className="size-3" />
                            </button>
                            <button type="button" className="grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-hover" style={{ color: theme.node.muted }} aria-label={t("canvas.ps.channelDelete")} title={t("canvas.ps.channelDelete")} onClick={() => setChannels(channels.filter((item) => item.id !== channel.id))}>
                                <Trash2 className="size-3" />
                            </button>
                        </div>
                    ))
                ) : (
                    <p className="pt-1 text-sm glass-card" style={{ color: theme.node.muted }}>
                        {t("canvas.ps.channelEmpty")}
                    </p>
                )}
            </div>
        </ImageSettingsTheme>
    );
}
