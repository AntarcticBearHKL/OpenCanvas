import { useEffect, useState } from "react";
import { ArrowUp, LoaderCircle, Maximize2, Square } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { openRouterMusicModels, openRouterSpeechModels } from "@/lib/audio-generation";
import { normalizeVideoMode, openRouterVideoModels } from "@/lib/video-generation";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    nodes: CanvasNodeData[];
    connectedNodes?: CanvasNodeData[];
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode; // Plugin nodes set their generation type through useBuiltinPanel.mode.
};

export function CanvasNodePromptPanel({ node, nodes, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], connectedNodes = [], onImageSettingsOpenChange, modeOverride }: CanvasNodePromptPanelProps) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useCanvasTheme();
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const acceptsPromptConnection = node.type === CanvasNodeType.SpeechGeneration || node.type === CanvasNodeType.MusicGeneration || node.type === CanvasNodeType.VideoGeneration;
    const requiredPromptType = node.type === CanvasNodeType.MusicGeneration ? CanvasNodeType.MusicPrompt : node.type === CanvasNodeType.VideoGeneration ? CanvasNodeType.VideoPrompt : CanvasNodeType.SpeechPrompt;
    const hasConnectedPrompt = acceptsPromptConnection && connectedNodes.some((item) => item.type === requiredPromptType);
    const promptPlaceholderKey = node.type === CanvasNodeType.MusicGeneration ? "music" : node.type === CanvasNodeType.SpeechGeneration ? "speech" : mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode;
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);

    // Restore prompts only when switching nodes; preserve the current input after generation on the same node.
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (isEditingExistingContent) onConfigChange(node.id, { composerContent: value });
        else onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (isRunning || (!text && !hasConnectedPrompt)) return;
        onGenerate(node.id, mode, text);
    };

    const openExpandedEditor = () => {
        setExpanded(true);
    };

    return (
        <div
            className="rounded-none border p-3 glass-card"
            style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
            onWheel={(event) => event.stopPropagation()}
        >
            {acceptsPromptConnection ? null : (
                <div onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <CanvasPromptChipInput
                        value={prompt}
                        references={mentionReferences}
                        onChange={updatePrompt}
                        onSubmit={submit}
                        className="thin-scrollbar h-40 w-full cursor-text resize-none rounded-none px-3 py-2 text-sm leading-5 outline-none"
                        style={{ background: "transparent", color: theme.node.text }}
                        placeholder={t(`canvas.promptPanel.${promptPlaceholderKey}`)}
                    />
                </div>
            )}

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                <div className="flex min-w-0 items-center gap-2">
                    {acceptsPromptConnection ? null : (
                        <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                            <Button type="text" className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !bg-transparent !p-0" style={{ color: theme.node.text }} icon={<Maximize2 className="size-3.5" />} onClick={openExpandedEditor} aria-label={t("canvas.promptPanel.expandEditor")} />
                        </Tooltip>
                    )}
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={node.metadata?.model || config.imageModel} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog()} className="max-w-[190px]" />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog()}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={node.metadata?.model || config.videoModel} onChange={(model) => onConfigChange(node.id, { model })} capability="video" models={node.type === CanvasNodeType.VideoGeneration ? openRouterVideoModels : undefined} onMissingConfig={() => openConfigDialog()} className="max-w-[190px]" />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[220px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker
                                config={config}
                                value={node.metadata?.model || (node.type === CanvasNodeType.SpeechGeneration ? config.speechModel : config.audioModel)}
                                onChange={(model) => onConfigChange(node.id, { model })}
                                capability={node.type === CanvasNodeType.SpeechGeneration ? "speech" : "audio"}
                                models={node.type === CanvasNodeType.SpeechGeneration ? openRouterSpeechModels : node.type === CanvasNodeType.MusicGeneration ? openRouterMusicModels : undefined}
                                onMissingConfig={() => openConfigDialog()}
                                className="max-w-[190px]"
                            />
                            <CanvasAudioSettingsPopover config={config} variant={node.type === CanvasNodeType.MusicGeneration ? "music" : "speech"} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <ModelPicker config={config} value={node.metadata?.model || config.textModel} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog()} className="max-w-[190px]" />
                            <CanvasTextSettingsPopover config={config} count={node.metadata?.textCount || 1} onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })} onCountChange={(textCount) => onConfigChange(node.id, { textCount })} />
                        </>
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    danger={isRunning}
                    disabled={!isRunning && !prompt.trim() && !hasConnectedPrompt}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-sm font-medium">{t("canvas.promptPanel.stop")}</span>
                            </>
                        ) : (
                            <ArrowUp className="size-4" />
                        )}
                    </span>
                </Button>
            </div>
            {acceptsPromptConnection ? null : (
                <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden classNames={{ container: "glass-raised" }} styles={{ container: { background: "var(--glass-strong)" } }}>
                    <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                        <CanvasPromptChipInput
                            value={prompt}
                            references={mentionReferences}
                            onChange={updatePrompt}
                            className="thin-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-none border p-4 text-[15px] leading-6 outline-none"
                            style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                            placeholder={t(`canvas.promptPanel.${promptPlaceholderKey}`)}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video || type === CanvasNodeType.VideoPrompt ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    return {
        ...globalConfig,
        model: node.type === CanvasNodeType.SpeechGeneration ? node.metadata?.model || openRouterSpeechModels[0].value : node.type === CanvasNodeType.MusicGeneration ? node.metadata?.model || openRouterMusicModels[0].value : node.type === CanvasNodeType.VideoGeneration ? node.metadata?.model || openRouterVideoModels[0].value : resolveModelForCapability(globalConfig, node.metadata?.model, mode),
        reasoningEffort: node.metadata?.reasoningEffort || globalConfig.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        background: node.metadata?.background ?? globalConfig.background ?? defaultConfig.background,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        videoMode: node.metadata?.videoMode || globalConfig.videoMode || defaultConfig.videoMode,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoMode") return { videoMode: normalizeVideoMode(value) };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
