import { useCallback, useRef, useState } from "react";
import { Circle, Play, Save, Square, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { STUDIO_FLAT_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { usePsAssetStore, type PsActionStep } from "@/stores/use-ps-asset-store";

export const PS_MENU_COMMANDS = ["selectAll", "deselect", "inverse", "feather", "crop", "trim", "rotateCw", "rotateCcw", "rotate180"] as const;
export const PS_LAYER_COMMANDS = ["duplicate", "delete", "forward", "backward", "group", "ungroup", "rasterize"] as const;

export type PsMenuCommand = (typeof PS_MENU_COMMANDS)[number];
export type PsLayerCommand = (typeof PS_LAYER_COMMANDS)[number];

const FLAT_BUTTON_CLASS = STUDIO_FLAT_BUTTON_CLASS;

/**
 * The recorder captures the editor's own document commands (menu, layer, adjustment, filter, transform), never freehand
 * brush work: a stroke is not a command, so it is intentionally not recordable.
 */
export function usePsActionRecorder(run: (step: PsActionStep) => Promise<void> | void) {
    const [recording, setRecording] = useState(false);
    const [steps, setSteps] = useState<PsActionStep[]>([]);
    const [playingId, setPlayingId] = useState("");
    const recordingRef = useRef(false);
    const record = useCallback((step: PsActionStep) => {
        if (recordingRef.current) setSteps((prev) => [...prev, step]);
    }, []);
    const start = () => {
        recordingRef.current = true;
        setSteps([]);
        setRecording(true);
    };
    const stop = () => {
        recordingRef.current = false;
        setRecording(false);
    };
    const play = async (id: string, actionSteps: PsActionStep[]) => {
        setPlayingId(id);
        for (const step of actionSteps) {
            await run(step);
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        setPlayingId("");
    };
    return { recording, steps, playingId, record, start, stop, play };
}

export type PsActionRecorder = ReturnType<typeof usePsActionRecorder>;

export function PsActionsPanel({ recorder }: { recorder: PsActionRecorder }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const actions = usePsAssetStore((state) => state.actions);
    const saveAction = usePsAssetStore((state) => state.saveAction);
    const renameAction = usePsAssetStore((state) => state.renameAction);
    const removeAction = usePsAssetStore((state) => state.removeAction);
    const [name, setName] = useState("");
    const [renamingId, setRenamingId] = useState("");

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2" style={{ color: theme.node.text }}>
                <div className="flex items-center gap-1 py-1">
                    <button
                        type="button"
                        className={FLAT_BUTTON_CLASS}
                        style={recorder.recording ? { color: "#dc2626" } : { color: theme.node.text }}
                        onClick={() => (recorder.recording ? recorder.stop() : recorder.start())}
                    >
                        {recorder.recording ? <Square className="size-3" /> : <Circle className="size-3" />}
                        {recorder.recording ? t("canvas.ps.actionStop") : t("canvas.ps.actionRecord")}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: theme.node.muted }}>
                        {recorder.recording ? t("canvas.ps.actionRecording", { count: recorder.steps.length }) : t("canvas.ps.actionIdle")}
                    </span>
                </div>
                <div className="flex items-center gap-1 py-0.5">
                    <input
                        className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-0.5 text-[11px]"
                        style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                        value={name}
                        maxLength={32}
                        placeholder={t("canvas.ps.actionName")}
                        aria-label={t("canvas.ps.actionName")}
                        onChange={(event) => setName(event.target.value)}
                    />
                    <button
                        type="button"
                        className={FLAT_BUTTON_CLASS}
                        style={{ color: theme.node.text }}
                        disabled={!recorder.steps.length}
                        onClick={() => {
                            saveAction({ name: name.trim() || t("canvas.ps.actionNew", { count: actions.length + 1 }), steps: recorder.steps });
                            setName("");
                        }}
                    >
                        <Save className="size-3" />
                        {t("canvas.ps.presetSave")}
                    </button>
                </div>
                {actions.length ? (
                    actions.map((action) => (
                        <div key={action.id} className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-[11px]">
                            <button type="button" className="grid size-5 shrink-0 place-items-center rounded transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} disabled={Boolean(recorder.playingId)} aria-label={t("canvas.ps.actionPlay")} title={t("canvas.ps.actionPlay")} onClick={() => void recorder.play(action.id, action.steps)}>
                                <Play className="size-3" />
                            </button>
                            {renamingId === action.id ? (
                                <input
                                    autoFocus
                                    className="min-w-0 flex-1 rounded border bg-transparent px-1 text-[11px]"
                                    style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                                    defaultValue={action.name}
                                    onBlur={(event) => {
                                        renameAction(action.id, event.target.value);
                                        setRenamingId("");
                                    }}
                                />
                            ) : (
                                <button type="button" className="min-w-0 flex-1 truncate text-left" onDoubleClick={() => setRenamingId(action.id)}>
                                    {action.name}
                                </button>
                            )}
                            <span className="shrink-0 tabular-nums" style={{ color: theme.node.muted }}>
                                {t("canvas.ps.actionSteps", { count: action.steps.length })}
                            </span>
                            <button type="button" className="grid size-5 shrink-0 place-items-center rounded transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} aria-label={t("canvas.ps.presetDelete")} title={t("canvas.ps.presetDelete")} onClick={() => removeAction(action.id)}>
                                <Trash2 className="size-3" />
                            </button>
                        </div>
                    ))
                ) : (
                    <p className="pt-1 text-[11px]" style={{ color: theme.node.placeholder }}>
                        {t("canvas.ps.actionEmpty")}
                    </p>
                )}
                <p className="pt-1 text-[11px]" style={{ color: theme.node.placeholder }}>
                    {t("canvas.ps.actionScope")}
                </p>
            </div>
        </ImageSettingsTheme>
    );
}
