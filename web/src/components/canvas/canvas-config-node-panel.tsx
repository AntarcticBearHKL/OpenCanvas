import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Square, Video } from "lucide-react";
import { Button, Segmented } from "antd";
import { useTranslation } from "react-i18next";

import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { VideoSettingsPanel } from "@/components/video-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { openRouterMusicModels, openRouterSpeechModels } from "@/lib/audio-generation";
import { normalizeVideoMode, openRouterVideoModels } from "@/lib/video-generation";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    hasPromptConnection: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
};

const IMAGE_GEN_DESIGN_WIDTH = 412;
const IMAGE_GEN_DESIGN_HEIGHT = 576;
const AUDIO_GEN_DESIGN_WIDTH = 412;
const AUDIO_GEN_DESIGN_HEIGHT = { speech: 312, music: 244 } as const;

export function CanvasConfigNodePanel({ node, isRunning, hasPromptConnection, inputSummary, onConfigChange, onGenerate, onStop, onComposerToggle }: CanvasConfigNodePanelProps) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useCanvasTheme();
    const isImageGenerationNode = node.type === CanvasNodeType.ImageGeneration;
    const isAudioGenerationNode = node.type === CanvasNodeType.SpeechGeneration || node.type === CanvasNodeType.MusicGeneration;
    const isMusicGenerationNode = node.type === CanvasNodeType.MusicGeneration;
    const isVideoGenerationNode = node.type === CanvasNodeType.VideoGeneration;
    const mode = isVideoGenerationNode ? "video" : isAudioGenerationNode ? "audio" : node.metadata?.generationMode || "image";
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const canGenerate = isAudioGenerationNode ? hasPromptConnection : isImageGenerationNode || isVideoGenerationNode || hasComposerContent || (mode === "audio" ? inputSummary.textCount > 0 : hasAnyInput);
    const flatButtonClass = "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10";
    const summaryParts = [
        inputSummary.textCount ? `${t("canvas.configNode.prompt")} ${inputSummary.textCount}` : "",
        inputSummary.imageCount ? `${t("canvas.configNode.references")} ${inputSummary.imageCount}` : "",
        inputSummary.videoCount ? `${t("canvas.configNode.videoReferences")} ${inputSummary.videoCount}` : "",
        inputSummary.audioCount ? `${t("canvas.configNode.audioReferences")} ${inputSummary.audioCount}` : "",
    ].filter(Boolean);

    const scaledLayout = isImageGenerationNode || isAudioGenerationNode || isVideoGenerationNode;
    const designSize = isAudioGenerationNode
        ? { width: AUDIO_GEN_DESIGN_WIDTH, height: isMusicGenerationNode ? AUDIO_GEN_DESIGN_HEIGHT.music : AUDIO_GEN_DESIGN_HEIGHT.speech }
        : { width: IMAGE_GEN_DESIGN_WIDTH, height: IMAGE_GEN_DESIGN_HEIGHT };
    const layoutScale = Math.min(Math.max(node.width - 4, 1) / designSize.width, Math.max(node.height - 4, 1) / designSize.height);

    return (
        <div className={scaledLayout ? "absolute inset-0 overflow-hidden" : "flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm"} style={scaledLayout ? undefined : { color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div
                className={scaledLayout ? "absolute left-1/2 top-1/2 flex flex-col justify-center px-3 pb-5 pt-5 text-sm" : "contents"}
                style={scaledLayout ? { width: designSize.width, height: designSize.height, transform: `translate(-50%, -50%) scale(${layoutScale})`, color: theme.node.text } : undefined}
            >
                {isImageGenerationNode || isAudioGenerationNode || isVideoGenerationNode ? null : (
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="shrink-0 text-sm font-semibold">{t("canvas.configNode.title")}</div>
                        <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                            <Segmented
                                size="small"
                                className="canvas-config-mode !rounded-md !p-0.5"
                                value={mode}
                                onChange={(value) => onConfigChange(node.id, { generationMode: value as CanvasGenerationMode })}
                                options={[
                                    {
                                        value: "image",
                                        label: (
                                            <span className="inline-flex items-center gap-1">
                                                <ImageIcon className="size-3.5" />
                                                {t("canvas.configNode.image")}
                                            </span>
                                        ),
                                    },
                                    {
                                        value: "text",
                                        label: (
                                            <span className="inline-flex items-center gap-1">
                                                <MessageSquare className="size-3.5" />
                                                {t("canvas.configNode.text")}
                                            </span>
                                        ),
                                    },
                                    {
                                        value: "video",
                                        label: (
                                            <span className="inline-flex items-center gap-1">
                                                <Video className="size-3.5" />
                                                {t("canvas.configNode.video")}
                                            </span>
                                        ),
                                    },
                                    {
                                        value: "audio",
                                        label: (
                                            <span className="inline-flex items-center gap-1">
                                                <Music2 className="size-3.5" />
                                                {t("canvas.configNode.audio")}
                                            </span>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>
                )}

                {isAudioGenerationNode ? null : (
                    <div className="mb-1.5 min-w-0 truncate text-[11px]" style={{ color: theme.node.label }}>
                        {summaryParts.length ? summaryParts.join(" · ") : t("canvas.configNode.noInputs")}
                    </div>
                )}

                <div className="mb-1.5 flex min-w-0 cursor-default items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
                    <ModelPicker
                        className="canvas-compact-control h-9 min-w-0 flex-1 !rounded-lg !border-transparent !bg-transparent hover:!bg-black/5 dark:hover:!bg-white/10"
                        config={config}
                        value={config.model}
                        onChange={(model) => onConfigChange(node.id, { model })}
                        capability={mode}
                        models={node.type === CanvasNodeType.SpeechGeneration ? openRouterSpeechModels : isMusicGenerationNode ? openRouterMusicModels : isVideoGenerationNode ? openRouterVideoModels : undefined}
                        onMissingConfig={() => openConfigDialog()}
                        fullWidth
                    />
                    {mode === "audio" && !isAudioGenerationNode ? (
                        <CanvasAudioSettingsPopover
                            config={config}
                            placement="topRight"
                            buttonClassName="canvas-compact-control !h-9 !w-full !justify-start !rounded-lg !px-2"
                            onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))}
                        />
                    ) : mode === "text" ? (
                        <CanvasTextSettingsPopover
                            config={config}
                            count={node.metadata?.textCount || 1}
                            placement="topRight"
                            buttonClassName="canvas-compact-control !h-9 !w-full !justify-start !rounded-lg !px-2"
                            onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })}
                            onCountChange={(textCount) => onConfigChange(node.id, { textCount })}
                        />
                    ) : null}
                </div>

                {mode === "image" ? (
                    <div className={`mb-1.5 min-w-0${scaledLayout ? "" : " thin-scrollbar min-h-0 flex-1 overflow-y-auto"}`} onWheel={(event) => event.stopPropagation()}>
                        <ImageSettingsPanel config={config} compact showTitle={false} className="space-y-2" theme={theme} onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })} />
                    </div>
                ) : null}

                {mode === "video" ? (
                    <div className={`mb-1.5 min-w-0${scaledLayout ? "" : " thin-scrollbar min-h-0 flex-1 overflow-y-auto"}`} onWheel={(event) => event.stopPropagation()}>
                        <VideoSettingsPanel config={config} showTitle={false} showMode={false} showSize={false} className="space-y-2" theme={theme} onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                    </div>
                ) : null}

                {isAudioGenerationNode ? (
                    <div className="mb-1.5 min-w-0" onWheel={(event) => event.stopPropagation()}>
                        <AudioSettingsPanel config={config} variant={isMusicGenerationNode ? "music" : "speech"} showTitle={false} className="space-y-2" theme={theme} onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                    </div>
                ) : null}

                <div className="flex shrink-0 flex-col gap-2 pt-2">
                    {isImageGenerationNode || isAudioGenerationNode || isVideoGenerationNode ? null : (
                        <div className="flex min-w-0 flex-wrap items-center gap-1" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                            <button type="button" className={flatButtonClass} style={{ color: theme.node.text }} onClick={onComposerToggle}>
                                <Settings2 className="size-3.5" />
                                {t("canvas.configNode.compose")}
                            </button>
                        </div>
                    )}

                    <div className="relative flex shrink-0 transition hover:opacity-90 has-[:disabled]:opacity-35">
                        <span
                            className="pointer-events-none absolute inset-0 rounded-full p-px"
                            style={{
                                background: `linear-gradient(120deg, ${isRunning ? theme.node.blocked : theme.node.primary}, ${theme.node.stroke})`,
                                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                WebkitMaskComposite: "xor",
                                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                                maskComposite: "exclude",
                            }}
                        />
                        <Button
                            type="primary"
                            className="!h-9 !w-full !cursor-pointer !rounded-full !border-transparent !px-4 !text-[11px] !font-semibold transition"
                            style={{ background: "transparent", color: theme.node.text }}
                            danger={isRunning}
                            disabled={!isRunning && !canGenerate}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id))}
                        >
                            <span className="inline-flex items-center gap-1.5">
                                {isRunning ? (
                                    <>
                                        <LoaderCircle className="size-4 animate-spin" />
                                        <Square className="size-3.5 fill-current" />
                                        <span>{t("canvas.configNode.stop")}</span>
                                    </>
                                ) : (
                                    <>
                                        <Play className="size-4" />
                                        <span>{t("canvas.configNode.generate")}</span>
                                    </>
                                )}
                            </span>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    const nodeModel = node.type === CanvasNodeType.SpeechGeneration ? node.metadata?.model || openRouterSpeechModels[0].value : node.type === CanvasNodeType.MusicGeneration ? node.metadata?.model || openRouterMusicModels[0].value : node.type === CanvasNodeType.VideoGeneration ? node.metadata?.model || openRouterVideoModels[0].value : "";
    return {
        ...globalConfig,
        model: nodeModel || resolveModelForCapability(globalConfig, node.metadata?.model, mode),
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
