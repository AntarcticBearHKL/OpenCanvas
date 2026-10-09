import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Download, FileMusic, Image as ImageIcon, Music2, Video } from "lucide-react";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { createVideoGenerationTask, isVideoTaskFailed, storeGeneratedVideo, waitForVideoGenerationTask } from "@/services/api/video";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useLocalModelStore } from "@/stores/use-local-model-store";
import { cleanupUnusedCanvasImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { removeImageBackground } from "@/services/background-removal";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { transcribeAudioToMidi, type TranscriptionStage } from "@/services/midi-transcription";
import { instrumentPreset } from "@/lib/canvas/audio-midi";
import { midiFileFromTracks, midiToProjectRegions, parseMidiFile } from "@/lib/canvas/audio-midi-file";
import { nanoid } from "nanoid";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl, upscaleDataUrl, type ImageUpscaleParams } from "@/lib/canvas/canvas-image-data";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { captureVideoFrame, type VideoFramePosition } from "@/lib/canvas/canvas-video-frame";
import { copyImageToClipboard } from "@/lib/clipboard-image";
import { App, Button, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "@/constant/canvas";
import { ActiveConnectionPath, ConnectionPath } from "@/components/canvas/canvas-connections";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { AssetsNodeContent } from "@/components/canvas/nodes/assets-node-content";
import { RecordingNodeContent } from "@/components/canvas/nodes/recording-node-content";
import { VideoPromptNodeContent } from "@/components/canvas/nodes/video-prompt-node-content";
import { CanvasImageAnalysisDialog } from "@/components/canvas/canvas-image-analysis-dialog";
import { CanvasNodeAngleDialog } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasNodeCropDialog, type CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import { CanvasNodeMaskEditDialog } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeSplitDialog, type CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import { CanvasNodeResolutionDialog, type CanvasImageResolutionPayload } from "@/components/canvas/canvas-node-resolution-dialog";
import { CanvasNodeSegmentDialog, type CanvasImageSegmentResult } from "@/components/canvas/canvas-node-segment-dialog";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-hover-toolbar";
import { ImageStackPreview } from "@/components/canvas/image-stack-preview";
import { CanvasMidiTranscribeDialog } from "@/components/canvas/canvas-midi-transcribe-dialog";
import { CanvasNodeListPanel } from "@/components/canvas/canvas-node-layer-popover";
import { CanvasRulers } from "@/components/canvas/canvas-rulers";
import { CanvasSelectionToolbar } from "@/components/canvas/canvas-selection-toolbar";
import { alignNodes, type AlignAxis } from "@/lib/canvas/alignment";
import { connectionCrossesStroke } from "@/lib/canvas/canvas-connections";
import { isCanvasDropSourceType, videoReferenceKind } from "@/lib/canvas/canvas-drop-bindings";
import { bindVideoSlot, videoPromptFrameLimit } from "@/lib/canvas/canvas-video-slots";
import { isCanvasOverlayTarget } from "@/lib/canvas/canvas-overlays";
import { registerCanvasRightButtonTool } from "@/lib/canvas/canvas-pointer-tools";
import { OpenCanvas } from "@/components/canvas/open-canvas";
import { setDragPreviewSignal } from "@/lib/canvas/drag-preview-signal";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode, selectionBlue } from "@/components/canvas/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { PromptNodePanel } from "@/components/canvas/prompt-node-panel";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { CanvasSidePanel } from "@/components/canvas/canvas-side-panel";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAgentBridge, type CanvasAgentHandlers } from "@/pages/canvas/hooks/use-agent-bridge";
import { usePluginHost } from "@/pages/canvas/hooks/use-plugin-host";
import { useCanvasGeneration } from "@/pages/canvas/hooks/use-canvas-generation";
import { useCanvasInsertion } from "@/pages/canvas/hooks/use-canvas-insertion";
import { useCanvasHistory } from "@/pages/canvas/hooks/use-canvas-history";
import { useCanvasDocument } from "@/pages/canvas/hooks/use-canvas-document";
import { NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "@/lib/canvas/canvas-node-constants";
import { buildNodeMentionReferences, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { applyNodeConfigPatch, audioMetadata, createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import { insertDerivedAsset } from "@/lib/canvas/canvas-derived-asset";
import { extractImageText, ocrPrompt } from "@/lib/canvas/canvas-ocr";
import { CANVAS_GRID_SIZE, bulkRenameTitles, findAssetsDropTarget, findImageStackDropTarget, getConnectionTargetAnchor, isNodeHidden, isNodeLocked, nodeBounds, nodeCenterInside, normalizeConnection, snapDragToGuides } from "@/lib/canvas/canvas-node-geometry";
import {
    audioExtension,
    buildGenerationConfig,
    getGenerationCount,
    getInputSummary,
    hasResumableVideoTask,
    hydrateCanvasImages,
    imageExtension,
    isGenerationCanceled,
    resetInterruptedGeneration,
} from "@/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { outputFileName, resolveOutputBlob } from "@/lib/workspace/output-file";
import { useAssetFolderStore } from "@/stores/use-asset-folder-store";
import { useAudioStore } from "@/stores/use-audio-store";
import { useBrowserCacheStore } from "@/stores/use-browser-cache-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { registerBuiltinNodes } from "@/components/canvas/nodes/builtin-nodes";
import { CanvasPluginManagerModal } from "@/components/canvas/canvas-plugin-manager-modal";
import { CanvasRefreshShell } from "@/components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import {
    CANVAS_WORKSPACES,
    CanvasNodeType,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeImage,
    type CanvasWorkspace,
    type ConnectionHandle,
    type Position,
    type SelectionBox,
    type ViewportTransform,
    type CanvasVideoSlot,
    type CanvasVideoSlots,
} from "@/types/canvas";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

// Register built-in nodes in the shared registry once when the module loads.
registerBuiltinNodes();

// Stable empty reference array prevents `... || []` from invalidating CanvasNode's React.memo on every render.
const EMPTY_REFERENCES: CanvasResourceReference[] = [];
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const EMPTY_SNAP_GUIDES = { x: [], y: [] };
const NODE_RETURN_MS = 220;

type CanvasClipboard = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

type ConnectionDropTarget = {
    nodeId: string | null;
    isNearNode: boolean;
};

type VideoSlotDropTarget = { nodeId: string; slot: CanvasVideoSlot };

function isCanvasVideoSlot(value: string | undefined): value is CanvasVideoSlot {
    return value === "firstFrame" || value === "lastFrame" || value === "reference";
}

function draggedVideoReferenceNode(draggedIds: Set<string>, nodes: CanvasNodeData[]) {
    return nodes.find((node) => draggedIds.has(node.id) && Boolean(node.metadata?.content) && videoReferenceKind(node.type)) || null;
}

function findVideoSlotDropTarget(x: number, y: number, draggedIds: Set<string>, nodes: CanvasNodeData[]): VideoSlotDropTarget | null {
    const dragged = draggedVideoReferenceNode(draggedIds, nodes);
    const draggedKind = dragged ? videoReferenceKind(dragged.type) : null;
    if (!dragged || !draggedKind) return null;
    for (const element of document.querySelectorAll<HTMLElement>("[data-video-slot][data-video-slot-node]")) {
        const rect = element.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
        const nodeId = element.dataset.videoSlotNode;
        const slot = element.dataset.videoSlot;
        const slotKind = element.dataset.videoSlotKind;
        if (!nodeId || !isCanvasVideoSlot(slot)) continue;
        if (slotKind && slotKind !== "any" && slotKind !== draggedKind) continue;
        if (nodes.some((node) => node.id === nodeId && node.type === CanvasNodeType.VideoPrompt)) return { nodeId, slot };
    }
    return null;
}

const WRITE_RELATIONS = ["ally", "enemy", "family", "mentor", "lover", "belongs", "cause", "effect", "parallel", "contains", "near"] as const;

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);
    const params = useParams<{ id: string }>();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <CanvasWorkspace projectId={params.id || ""} />;
}

export function CanvasWorkspace({ projectId, embedded = false, onExit }: { projectId: string; embedded?: boolean; onExit?: () => void }) {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    // Subscribe to the registry version so plugin registration changes rerender the canvas.
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const params = useParams<{ workspace?: string }>();
    const navigate = useNavigate();
    const workspace: CanvasWorkspace = embedded ? "canvas" : CANVAS_WORKSPACES.find((item) => item === params.workspace) || "canvas";

    useEffect(() => {
        if (embedded) return;
        if (params.workspace === "image") {
            navigate("/image", { replace: true });
        } else if (params.workspace === "audio") {
            navigate("/audio", { replace: true });
        } else if (params.workspace === "pixel") {
            navigate("/pixel", { replace: true });
        }
    }, [embedded, params.workspace, navigate]);

    const handleWorkspaceChange = useCallback(
        (next: CanvasWorkspace) => {
            if (next === "image") {
                navigate("/image");
            } else if (next === "audio") {
                navigate("/audio");
            } else if (next === "pixel") {
                navigate("/pixel");
            } else {
                navigate(`/canvas/${projectId}`);
            }
        },
        [navigate, projectId],
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; position?: Position } | null>(null);
    const clipboardRef = useRef<CanvasClipboard | null>(null);
    const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rafRef = useRef<number | null>(null);
    const dragMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);
    const dragPreviewRef = useRef<Map<string, Position> | null>(null);
    const dropTargetAssetsRef = useRef<string | null>(null);
    const dropTargetStackRef = useRef<string | null>(null);
    const dropTargetSlotRef = useRef<VideoSlotDropTarget | null>(null);
    const nodeDraggingRef = useRef(false);
    const dragRef = useRef<{
        isDraggingNode: boolean;
        hasMoved: boolean;
        startX: number;
        startY: number;
        initialSelectedNodes: { id: string; x: number; y: number }[];
        ghost: { nodeId: string; count: number } | null;
    }>({
        isDraggingNode: false,
        hasMoved: false,
        startX: 0,
        startY: 0,
        initialSelectedNodes: [],
        ghost: null,
    });

    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const prepareModel = useLocalModelStore((state) => state.prepareModel);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const openProject = useCanvasStore((state) => state.openProject);
    const updateProject = useCanvasStore((state) => state.updateProject);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const currentProject = useCanvasStore((state) => state.projects.find((project) => project.id === projectId));
    const groups = useCanvasStore((state) => state.groups);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [canvasTool, setCanvasTool] = useState<"select" | "pan">("pan");
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [connectingParams, setConnectingParams] = useState<ConnectionHandle | null>(null);
    const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<string | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [cutStroke, setCutStroke] = useState<Position[] | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const loadedOnceRef = useRef(false);
    const loadedProjectIdRef = useRef<string | null>(null);
    const skipPersistRef = useRef(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
    const [cropNodeId, setCropNodeId] = useState<string | null>(null);
    const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
    const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
    const [resolutionNodeId, setResolutionNodeId] = useState<string | null>(null);
    const [analyzeNodeId, setAnalyzeNodeId] = useState<string | null>(null);
    const [segmentNodeId, setSegmentNodeId] = useState<string | null>(null);
    const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
    const [midiTranscribeNodeId, setMidiTranscribeNodeId] = useState<string | null>(null);
    const [midiHighQuality, setMidiHighQuality] = useState(true);
    const [midiRunning, setMidiRunning] = useState(false);
    const [midiStage, setMidiStage] = useState<TranscriptionStage | null>(null);
    const [midiProgress, setMidiProgress] = useState(0);
    const [midiFailed, setMidiFailed] = useState(false);
    const midiAbortRef = useRef<AbortController | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [previewImageId, setPreviewImageId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [isNodeResizing, setIsNodeResizing] = useState(false);
    const [dropTargetAssetsNodeId, setDropTargetAssetsNodeId] = useState<string | null>(null);
    const [dropTargetStackNodeId, setDropTargetStackNodeId] = useState<string | null>(null);
    const [dropSlotState, setDropSlotState] = useState<VideoSlotDropTarget | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>(EMPTY_SNAP_GUIDES);
    const [ghostMeta, setGhostMeta] = useState<{ nodeId: string; count: number } | null>(null);
    const ghostChipRef = useRef<HTMLDivElement>(null);
    const [returningNodes, setReturningNodes] = useState<Map<string, Position>>(new Map());
    const [isNodeListOpen, setIsNodeListOpen] = useState(false);

    const nodesRef = useRef(nodes);
    const connectionsRef = useRef(connections);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => Promise<void>) | null>(null);
    const connectingParamsRef = useRef(connectingParams);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
    const selectionBoxRef = useRef(selectionBox);
    const cutStrokeRef = useRef<Position[] | null>(null);

    const { historyState, undoCanvas, redoCanvas, resetHistory, historyRef, lastHistoryRef, historyPausedRef } = useCanvasHistory({
        nodes,
        connections,
        projectLoaded,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupUnusedCanvasImages({ extra, history: historyRef.current, lastHistory: lastHistoryRef.current });
        },
        [],
    );

    const { handleGenerateNode, handleRetryNode, pollVideoNodeTask, confirmStopGeneration, maskEditImageNode, generateAngleNode } = useCanvasGeneration({
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        message,
        modal,
        t,
        nodesRef,
        connectionsRef,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setRunningNodeId,
        setMaskEditNodeId,
        setAngleNodeId,
        setExpandedBatchNodeIds,
    });

    useEffect(() => {
        if (!hydrated) return;
        // Guarded by project id, not by effect deps: `navigate` changes identity on every navigation (workspace tabs included).
        if (loadedProjectIdRef.current === projectId) return;
        if (loadedProjectIdRef.current !== null) {
            setNodes([]);
            setConnections([]);
        }
        loadedProjectIdRef.current = projectId;
        setProjectLoaded(false);
        const project = openProject(projectId);
        if (!project) {
            navigate("/canvas", { replace: true });
            return;
        }

        const restore = async () => {
            const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
            setNodes(restoredNodes);
            setConnections(project.connections);
            setViewport(project.viewport);
            resetHistory({ nodes: restoredNodes, connections: project.connections });
            loadedOnceRef.current = true;
            setProjectLoaded(true);
        };
        void restore();
    }, [hydrated, navigate, openProject, projectId]);

    useEffect(() => {
        if (!projectLoaded) return;
        nodesRef.current.filter(hasResumableVideoTask).forEach((node) => void pollVideoNodeTask(node, true));
        // Resume once after the current canvas is restored, not on later config identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectLoaded]);

    useEffect(() => {
        useBrowserCacheStore.getState().init();
    }, []);


    useEffect(() => {
        if (!projectLoaded || historyPausedRef.current) return;
        if (skipPersistRef.current) {
            skipPersistRef.current = false;
            return;
        }
        updateProject(projectId, { nodes, connections });
    }, [connections, nodes, projectId, projectLoaded, updateProject]);

    useEffect(() => {
        if (!projectLoaded) return;
        const unsubscribe = useCanvasStore.subscribe((state, prev) => {
            const sync = state.remoteSync;
            if (!sync || sync === prev.remoteSync || sync.projectId !== projectId) return;
            const project = state.projects.find((item) => item.id === projectId);
            if (!project) return;
            skipPersistRef.current = true;
            void (async () => {
                const restoredNodes = await hydrateCanvasImages(resetInterruptedGeneration(project.nodes));
                setNodes(restoredNodes);
                setConnections(project.connections);
                resetHistory({ nodes: restoredNodes, connections: project.connections });
            })();
        });
        return unsubscribe;
    }, [projectId, projectLoaded, resetHistory]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        connectingParamsRef.current = connectingParams;
        connectionTargetNodeIdRef.current = connectionTargetNodeId;
    }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId]);

    useLayoutEffect(() => {
        selectionBoxRef.current = selectionBox;
    }, [selectionBox]);

    const exportCurrentCanvas = useCallback(async () => {
        if (!currentProject) return;
        try {
            const groupName = groups.find((group) => group.id === currentProject.groupId)?.name;
            await exportCanvasProjects([{ ...currentProject, nodes, connections, viewport }], currentProject.title || t("canvas.untitledCanvas"), () => groupName);
            message.success(t("canvas.exported"));
        } catch {
            message.error(t("canvas.exportFailed"));
        }
    }, [connections, currentProject, groups, message, nodes, t, viewport]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
        // Re-measure when the workspace changes: the canvas container unmounts in studios, and a detached observer reports 0×0.
    }, [panelOpen, projectLoaded, workspace]);

    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        const currentViewport = viewportRef.current;
        const localX = clientX - (rect?.left || 0);
        const localY = clientY - (rect?.top || 0);

        return {
            x: (localX - currentViewport.x) / currentViewport.k,
            y: (localY - currentViewport.y) / currentViewport.k,
        };
    }, []);

    const getCanvasCenter = useCallback(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        return screenToCanvas((rect?.left || 0) + (rect?.width || size.width) / 2, (rect?.top || 0) + (rect?.height || size.height) / 2);
    }, [screenToCanvas, size.height, size.width]);

    const setConnecting = useCallback((next: ConnectionHandle | null) => {
        connectingParamsRef.current = next;
        setConnectingParams(next);
        if (!next) {
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
        }
    }, []);

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen || !selectedNodeIdsRef.current.has(nodeId)) return;
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {}, []);

    const selectConnection = useCallback((connectionId: string) => {
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
    }, []);

    const connectNodes = useCallback(
        (current: ConnectionHandle, targetNodeId: string) => {
            if (current.nodeId === targetNodeId) return;

            const connection = normalizeConnection(current.nodeId, targetNodeId, nodesRef.current, current.handleType);
            if (!connection) {
                message.warning(t("canvas.projectPage.generationConnection"));
                return;
            }
            const { fromNodeId, toNodeId } = connection;
            const exists = connectionsRef.current.some((conn) => conn.fromNodeId === fromNodeId && conn.toNodeId === toNodeId);
            if (!exists) {
                setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, ...connection }]);
            }
        },
        [message, t],
    );

    const getConnectionDropTarget = useCallback(
        (clientX: number, clientY: number, current: ConnectionHandle): ConnectionDropTarget => {
            const world = screenToCanvas(clientX, clientY);
            const scale = Math.max(viewportRef.current.k, 0.05);
            const padding = CONNECTION_NODE_HIT_PADDING / scale;
            const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
            let isNearNode = false;
            let bestNodeId: string | null = null;
            let bestPriority = Number.POSITIVE_INFINITY;

            [...nodesRef.current]
                .reverse()
                .forEach((node) => {
                    if (isNodeHidden(node)) return;
                    const anchor = getConnectionTargetAnchor(node, current);
                    const dx = world.x - anchor.x;
                    const dy = world.y - anchor.y;
                    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
                    const hitsInside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
                    const hitsExpanded = world.x >= node.position.x - padding && world.x <= node.position.x + node.width + padding && world.y >= node.position.y - padding && world.y <= node.position.y + node.height + padding;

                    if (!hitsHandle && !hitsInside && !hitsExpanded) return;
                    isNearNode = true;
                    if (node.id === current.nodeId || !normalizeConnection(current.nodeId, node.id, nodesRef.current, current.handleType)) return;

                    const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
                    if (priority < bestPriority) {
                        bestNodeId = node.id;
                        bestPriority = priority;
                    }
                });

            return { nodeId: bestNodeId, isNearNode };
        },
        [screenToCanvas],
    );

    const visibleNodes = useMemo(() => nodes.filter((node) => !isNodeHidden(node)), [nodes]);

    const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    // The toolbar follows a single selected node selected by click, creation, marquee, or keyboard.
    // It stays hidden for multi-selection and while isNodeDragging is true.
    const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
    const singleSelectedNode = singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null;
    const toolbarNode = (toolbarNodeId ? nodeById.get(toolbarNodeId) || null : null) || (singleSelectedNodeId ? nodeById.get(singleSelectedNodeId) || null : null);
    const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
    const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
    const maskEditNode = maskEditNodeId ? nodeById.get(maskEditNodeId) || null : null;
    const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
    const resolutionNode = resolutionNodeId ? nodeById.get(resolutionNodeId) || null : null;
    const analyzeNode = analyzeNodeId ? nodeById.get(analyzeNodeId) || null : null;
    const segmentNode = segmentNodeId ? nodeById.get(segmentNodeId) || null : null;
    const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
    const midiTranscribeNode = midiTranscribeNodeId ? nodeById.get(midiTranscribeNodeId) || null : null;
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const previewContent = previewImageId ? previewNode?.metadata?.images?.find((image) => image.id === previewImageId)?.content : previewNode?.metadata?.content;
    const previewIsStack = previewNode?.type === CanvasNodeType.ImageStack;
    const previewImages = previewIsStack ? previewNode?.metadata?.images ?? [] : [];
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const alignSelection = (axis: AlignAxis) => {
        const positions = alignNodes(nodes, selectedNodeIds, axis);
        if (!positions.size) return;
        setNodes((prev) => prev.map((node) => { const next = positions.get(node.id); return next ? { ...node, position: next } : node; }));
    };
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const relatedHighlight = useMemo(() => {
        const nodeIds = new Set<string>();
        const connectionIds = new Set<string>();

        if (!activeNodeId) return { nodeIds, connectionIds };

        const addNode = (nodeId: string) => {
            nodeIds.add(nodeId);
        };
        addNode(activeNodeId);
        connections.forEach((connection) => {
            if (connection.fromNodeId !== activeNodeId && connection.toNodeId !== activeNodeId) return;
            connectionIds.add(connection.id);
            addNode(connection.fromNodeId);
            addNode(connection.toNodeId);
        });

        return { nodeIds, connectionIds };
    }, [activeNodeId, connections]);

    const configInputsById = useMemo(() => {
        const map = new Map<string, NodeGenerationInput[]>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.ImageGeneration && node.type !== CanvasNodeType.VideoGeneration) return;
            map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
        });
        return map;
    }, [connections, nodes]);
    const mentionReferencesByNodeId = useMemo(() => {
        const map = new Map<string, ReturnType<typeof buildNodeMentionReferences>>();
        nodes.forEach((node) => map.set(node.id, buildNodeMentionReferences(node, nodes, connections)));
        return map;
    }, [connections, nodes]);
    const promptReferenceIndexByConnectionId = useMemo(() => {
        const map = new Map<string, number>();
        nodes.forEach((node) => {
            if (node.type !== CanvasNodeType.Prompt) return;
            (mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES)
                .filter((reference) => reference.kind === "image")
                .forEach((reference, index) => {
                    const connection = connections.find((item) => item.toNodeId === node.id && item.fromNodeId === reference.nodeId);
                    if (connection) map.set(connection.id, index);
                });
        });
        return map;
    }, [connections, mentionReferencesByNodeId, nodes]);
    const connectedNodesByNodeId = useMemo(() => {
        const map = new Map<string, CanvasNodeData[]>();
        connections.forEach((connection) => {
            const source = nodeById.get(connection.fromNodeId);
            if (!source) return;
            const connected = map.get(connection.toNodeId);
            if (connected) connected.push(source);
            else map.set(connection.toNodeId, [source]);
        });
        return map;
    }, [connections, nodeById]);
    const connectionPaths = useMemo(
        () =>
            connections.map((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                if (!from || !to) return null;
                return (
                    <ConnectionPath
                        key={connection.id}
                        connection={connection}
                        from={from}
                        to={to}
                        active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                        referenceIndex={promptReferenceIndexByConnectionId.get(connection.id)}
                        scale={viewport.k}
                        onSelect={selectConnection}
                    />
                );
            }),
        [connections, nodeById, promptReferenceIndexByConnectionId, relatedHighlight, selectConnection, selectedConnectionId, viewport.k],
    );
    const runAgentNode = (nodeId: string, run: (node: CanvasNodeData) => void) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (node) run(node);
    };
    const runMidiTranscription = useCallback(
        async (source: CanvasNodeData, highQuality: boolean, options?: { signal?: AbortSignal; onProgress?: (progress: { stage: TranscriptionStage; progress: number }) => void }) => {
            const content = source.metadata?.content;
            if (!content) throw new Error("midi-source-missing");
            const blob = source.metadata?.storageKey ? await getMediaBlob(source.metadata.storageKey) : await (await fetch(content)).blob();
            if (!blob) throw new Error("midi-source-missing");
            const result = await transcribeAudioToMidi(blob, { highQuality, signal: options?.signal, onProgress: options?.onProgress });
            const data = midiFileFromTracks(result.tracks, { tempo: result.tempo, ppqn: 960 });
            const uploaded = await uploadMediaFile(new Blob([data], { type: "audio/midi" }), "midi");
            const noteCount = result.tracks.reduce((total, track) => total + track.notes.length, 0);
            insertDerivedAsset(
                {
                    source,
                    children: [
                        {
                            id: nanoid(),
                            type: CanvasNodeType.Midi,
                            title: `${source.title || t("canvas.nodeTypes.midi")} MIDI`,
                            size: NODE_DEFAULT_SIZE[CanvasNodeType.Midi],
                            position: { x: source.position.x + source.width + 40, y: source.position.y },
                            metadata: {
                                content: uploaded.url,
                                storageKey: uploaded.storageKey,
                                status: NODE_STATUS_SUCCESS,
                                bytes: uploaded.bytes,
                                mimeType: "audio/midi",
                                durationMs: result.durationMs,
                                midi: { trackCount: result.tracks.length, noteCount, tempo: result.tempo, ppqn: 960 },
                            },
                        },
                    ],
                    select: "children",
                    clearSelectedConnection: true,
                    openDialog: null,
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
        },
        [setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, t],
    );

    const importMidiToAudio = useCallback(
        async (node: CanvasNodeData, options?: { title?: string; preset?: string }) => {
            const content = node.metadata?.content;
            if (!content) return;
            const blob = node.metadata?.storageKey ? await getMediaBlob(node.metadata.storageKey) : await (await fetch(content)).blob();
            if (!blob) throw new Error("midi-source-missing");
            const parsed = parseMidiFile(await blob.arrayBuffer());
            const projectId = useAudioStore.getState().createProject(options?.title?.trim() || node.title);
            const project = useAudioStore.getState().projects.find((item) => item.id === projectId);
            if (!project) return;
            const { tracks, regions } = midiToProjectRegions(parsed, {
                startSeconds: 0,
                tempo: project.tempo,
                ppqn: project.ppqn,
                fallbackName: node.title || t("canvas.audioStudio.midiTrackFallback", { defaultValue: "MIDI 音轨" }),
            });
            if (!tracks.length) return;
            if (options?.preset) {
                const preset = instrumentPreset(options.preset).id;
                tracks.forEach((track) => {
                    if (track.type === "instrument") track.instrument = { kind: "synth", preset };
                });
            }
            useAudioStore.getState().updateProject(projectId, { tracks: [...project.tracks, ...tracks], midiRegions: [...project.midiRegions, ...regions] });
            return projectId;
        },
        [t],
    );

    const agentHandlers: CanvasAgentHandlers = {
        crop_image: (op) => {
            if (op.type === "crop_image") runAgentNode(op.nodeId, (node) => void cropImageNode(node, op.crop));
        },
        split_image: (op) => {
            if (op.type === "split_image") runAgentNode(op.nodeId, (node) => void splitImageNode(node, { rows: op.rows, columns: op.columns, horizontalLines: op.horizontalLines, verticalLines: op.verticalLines }));
        },
        upscale_image: (op) => {
            if (op.type === "upscale_image") runAgentNode(op.nodeId, (node) => (op.kind === "ai" ? void aiUpscaleImageNode(node, op.prompt || "") : void upscaleImageNode(node, { targetLongEdge: op.targetLongEdge ?? 2048, algorithm: op.algorithm ?? "high" })));
        },
        ocr_image: (op) => {
            if (op.type === "ocr_image") runAgentNode(op.nodeId, (node) => void ocrImageNode(node));
        },
        remove_background: (op) => {
            if (op.type === "remove_background") runAgentNode(op.nodeId, (node) => void removeNodeBackground(node));
        },
        generate_angle: (op) => {
            if (op.type === "generate_angle") runAgentNode(op.nodeId, (node) => void generateAngleNode(node, { horizontalAngle: op.horizontalAngle, pitchAngle: op.pitchAngle, cameraDistance: op.cameraDistance, wideAngle: op.wideAngle }));
        },
        generate_image_from_text: (op) => {
            if (op.type === "generate_image_from_text") runAgentNode(op.nodeId, generateImageFromTextNode);
        },
        retry_generation: (op) => {
            if (op.type === "retry_generation") runAgentNode(op.nodeId, (node) => void handleRetryNode(node));
        },
        capture_video_frame: (op) => {
            if (op.type === "capture_video_frame") void captureVideoNodeFrame(op.nodeId, op.position);
        },
        transcribe_midi: (op) => {
            if (op.type === "transcribe_midi") runAgentNode(op.nodeId, (node) => void runMidiTranscription(node, op.highQuality ?? true).catch(() => {}));
        },
        import_midi_to_audio: (op) => {
            if (op.type === "import_midi_to_audio") runAgentNode(op.nodeId, (node) => void importMidiToAudio(node, { title: op.title, preset: op.preset }).catch(() => {}));
        },
    };
    const { applyAgentOps } = useAgentBridge({
        projectId,
        title: currentProject?.title,
        workspace,
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        agentHandlers,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
    });

    const { pluginHost, renderPluginPanel, buildNodeToolbarItems } = usePluginHost({
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        theme,
        nodesRef,
        connectionsRef,
        viewportRef,
        setNodes,
        setDialogNodeId,
        applyAgentOps,
    });
    const { createNode, deleteNodes, deleteConnection, deselectCanvas, duplicateNode, copySelectedNodes, pasteCopiedNodes, resetViewport, setZoomScale } = useCanvasDocument({
        getCanvasCenter,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        clipboardRef,
        cleanupCanvasFiles,
        projectId,
        size,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setHoveredNodeId,
        setToolbarNodeId,
        setInfoNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setAngleNodeId,
        setPreviewNodeId,
        setRunningNodeId,
        setExpandedBatchNodeIds,
        setSelectionBox,
        setViewport,
    });


    const handleCanvasMouseDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            setHoveredNodeId(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            setIsNodeListOpen(false);
            if (event.button !== 0) return;

            const world = screenToCanvas(event.clientX, event.clientY);
            const nextSelectionBox = {
                startWorldX: world.x,
                startWorldY: world.y,
                currentWorldX: world.x,
                currentWorldY: world.y,
                additive: event.shiftKey,
                initialSelectedNodeIds: event.shiftKey ? Array.from(selectedNodeIdsRef.current) : [],
            };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            if (!event.shiftKey) {
                setSelectedNodeIds(new Set());
            }

            setSelectedConnectionId(null);
        },
        [screenToCanvas],
    );

    const startCutStroke = useCallback(
        (event: PointerEvent) => {
            if (isCanvasOverlayTarget(event.target)) return false;
            if (!containerRef.current?.contains(event.target as Node)) return false;
            const point = screenToCanvas(event.clientX, event.clientY);
            cutStrokeRef.current = [point];
            setCutStroke([point]);
            return true;
        },
        [screenToCanvas],
    );

    const moveCutStroke = useCallback(
        (event: PointerEvent) => {
            const points = cutStrokeRef.current;
            if (!points) return;
            const next = [...points, screenToCanvas(event.clientX, event.clientY)];
            cutStrokeRef.current = next;
            setCutStroke(next);
        },
        [screenToCanvas],
    );

    const finishCutStroke = useCallback(() => {
        const points = cutStrokeRef.current;
        cutStrokeRef.current = null;
        setCutStroke(null);
        if (!points || points.length < 2) return;
        connectionsRef.current
            .filter((connection) => {
                const from = nodesRef.current.find((node) => node.id === connection.fromNodeId);
                const to = nodesRef.current.find((node) => node.id === connection.toNodeId);
                return Boolean(from && to && connectionCrossesStroke(from, to, points));
            })
            .forEach((connection) => deleteConnection(connection.id));
    }, [deleteConnection]);

    useEffect(() => registerCanvasRightButtonTool("ctrl", { onStart: startCutStroke, onMove: moveCutStroke, onEnd: finishCutStroke }), [finishCutStroke, moveCutStroke, startCutStroke]);

    // Selection-only logic shared by the bubbling drag entry point and outer capture handler.
    // Returns the single target ID after the click, or null for multi-selection or deselection, to sync the toolbar.
    const selectNodeByEvent = useCallback((event: Pick<ReactMouseEvent, "shiftKey" | "metaKey" | "ctrlKey">, nodeId: string) => {
        const nextSelected = new Set(selectedNodeIdsRef.current);
        if (event.shiftKey || event.metaKey || event.ctrlKey) {
            if (nextSelected.has(nodeId)) nextSelected.delete(nodeId);
            else nextSelected.add(nodeId);
        } else if (!nextSelected.has(nodeId)) {
            nextSelected.clear();
            nextSelected.add(nodeId);
        }
        setSelectedNodeIds(nextSelected);
        const soloId = nextSelected.size === 1 && nextSelected.has(nodeId) ? nodeId : null;
        setToolbarNodeId(soloId);
        return { nextSelected, soloId };
    }, []);

    // Capture-phase selection lets any inner element, including textarea or iframe, select the node and show its toolbar.
    // It only selects; body onMouseDown still starts dragging, so text selection inside editors does not drag the node.
    // Cache the capture result for the following bubbling drag handler to avoid applying shift-selection twice.
    const pendingSelectionRef = useRef<Set<string> | null>(null);
    const handleNodeSelectCapture = useCallback(
        (event: ReactMouseEvent, nodeId: string) => {
            if (event.button !== 0) return;
            setHoveredNodeId(null);
            setSelectedConnectionId(null);
            const { nextSelected } = selectNodeByEvent(event, nodeId);
            pendingSelectionRef.current = nextSelected;
        },
        [selectNodeByEvent],
    );

    const handleNodeMouseDown = useCallback((event: ReactMouseEvent, nodeId: string) => {
        event.stopPropagation();
        // Capture already selected the node; this only starts dragging, with a fallback selection if capture did not run.
        const currentNodes = nodesRef.current;
        const target = currentNodes.find((node) => node.id === nodeId);
        if (target && isNodeLocked(target)) {
            pendingSelectionRef.current = null;
            return;
        }
        const nextSelected = pendingSelectionRef.current ?? selectNodeByEvent(event, nodeId).nextSelected;
        pendingSelectionRef.current = null;
        const dragIds = new Set(
            [...nextSelected].filter((id) => {
                const node = currentNodes.find((item) => item.id === id);
                return Boolean(node && !isNodeLocked(node) && !isNodeHidden(node));
            }),
        );
        if (!dragIds.size) return;
        const draggedNodes = currentNodes.filter((node) => dragIds.has(node.id));
        dragRef.current = {
            isDraggingNode: true,
            hasMoved: false,
            startX: event.clientX,
            startY: event.clientY,
            initialSelectedNodes: draggedNodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
            ghost: draggedNodes.every((node) => isCanvasDropSourceType(node.type)) ? { nodeId, count: draggedNodes.length } : null,
        };
        setGhostMeta(dragRef.current.ghost);
        historyPausedRef.current = true;
        nodeDraggingRef.current = true;
        setIsNodeDragging(true);
        if (containerRef.current) containerRef.current.dataset.canvasDragging = "true";
    }, []);

    const collectImageIntoAssets = useCallback((nodeId: string, node: CanvasNodeData, permission: Promise<boolean>) => {
        void (async () => {
            const store = useAssetFolderStore.getState();
            try {
                if (!(await permission)) {
                    store.setCollectStatus(nodeId, "failed");
                    return;
                }
                const blob = await resolveOutputBlob(node);
                if (!blob) {
                    store.setCollectStatus(nodeId, "failed");
                    return;
                }
                await store.writeAsset(nodeId, outputFileName(node.title, node.id, node.metadata?.mimeType, node.metadata?.storageKey), blob);
            } catch {
                store.setCollectStatus(nodeId, "failed");
            }
        })();
    }, []);

    const applyNodeMetadata = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node)));
    }, []);

    const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (!dragRef.current.isDraggingNode) return;

        const wasClick = !dragRef.current.hasMoved && dragRef.current.initialSelectedNodes.length === 1;
        const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
        const currentViewport = viewportRef.current;
        const dx = clientX == null ? 0 : (clientX - dragRef.current.startX) / currentViewport.k;
        const dy = clientY == null ? 0 : (clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;
        const assetsTargetId = dragRef.current.hasMoved ? dropTargetAssetsRef.current : null;
        const stackTargetId = dragRef.current.hasMoved ? dropTargetStackRef.current : null;
        const slotTarget = dragRef.current.hasMoved ? dropTargetSlotRef.current : null;
        const previewPositions = dragPreviewRef.current;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        delete containerRef.current?.dataset.canvasDragging;
        setDropTargetAssetsNodeId(null);
        setDropTargetStackNodeId(null);
        setDropSlotState(null);
        dropTargetAssetsRef.current = null;
        dropTargetStackRef.current = null;
        dropTargetSlotRef.current = null;
        setSnapGuides(EMPTY_SNAP_GUIDES);
        setDragPreviewSignal(null);
        setGhostMeta(null);
        dragPreviewRef.current = null;
        dragMoveRef.current = null;

        const slotTargetNode = slotTarget ? nodesRef.current.find((node) => node.id === slotTarget.nodeId && node.type === CanvasNodeType.VideoPrompt) : undefined;
        const slotNode = draggedVideoReferenceNode(new Set(initialPositions.map((item) => item.id)), nodesRef.current);
        const nextSlots = slotTarget && slotTargetNode && slotNode ? bindVideoSlot(slotTargetNode.id, slotTarget.slot, slotNode.id, nodesRef.current, connectionsRef.current) : null;

        if (slotTargetNode && slotNode && nextSlots) {
            applyNodeMetadata(slotTargetNode.id, { videoSlots: nextSlots });
            const initial = initialPositions.find((item) => item.id === slotNode.id)!;
            const dropped = previewPositions?.get(slotNode.id) || { x: initial.x + dx, y: initial.y + dy };
            setReturningNodes(new Map([[slotNode.id, dropped]]));
            window.setTimeout(() => setReturningNodes(new Map()), NODE_RETURN_MS);
        } else if (assetsTargetId) {
            const target = nodesRef.current.find((node) => node.id === assetsTargetId);
            const returned = new Map<string, Position>();
            if (target) {
                const permission = useAssetFolderStore.getState().requestWriteAccess(target.id);
                nodesRef.current.forEach((node) => {
                    if (node.type !== CanvasNodeType.Image) return;
                    const initial = initialPositions.find((item) => item.id === node.id);
                    if (!initial) return;
                    const dropped = previewPositions?.get(node.id) || { x: initial.x + dx, y: initial.y + dy };
                    if (!nodeCenterInside({ ...node, position: dropped }, target)) return;
                    returned.set(node.id, dropped);
                    collectImageIntoAssets(target.id, node, permission);
                });
            }
            if (returned.size) {
                setReturningNodes(returned);
                window.setTimeout(() => setReturningNodes(new Map()), NODE_RETURN_MS);
            }
        } else if (stackTargetId) {
            const target = nodesRef.current.find((node) => node.id === stackTargetId && node.type === CanvasNodeType.ImageStack);
            const consumed = new Set<string>();
            const appended: CanvasNodeImage[] = [];
            if (target) {
                nodesRef.current.forEach((node) => {
                    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return;
                    const initial = initialPositions.find((item) => item.id === node.id);
                    if (!initial) return;
                    const dropped = previewPositions?.get(node.id) || { x: initial.x + dx, y: initial.y + dy };
                    if (!nodeCenterInside({ ...node, position: dropped }, target)) return;
                    appended.push({
                        id: nanoid(),
                        status: "success",
                        content: node.metadata.content,
                        storageKey: node.metadata.storageKey,
                        thumbnail: node.metadata.thumbnail,
                        thumbnailKey: node.metadata.thumbnailKey,
                        naturalWidth: node.metadata.naturalWidth || node.width,
                        naturalHeight: node.metadata.naturalHeight || node.height,
                        bytes: node.metadata.bytes || 0,
                        mimeType: node.metadata.mimeType || "image/png",
                    });
                    consumed.add(node.id);
                });
            }
            if (appended.length) {
                setNodes((prev) =>
                    prev
                        .filter((node) => !consumed.has(node.id))
                        .map((node) =>
                            node.id === stackTargetId
                                ? { ...node, metadata: { ...node.metadata, images: [...(node.metadata?.images || []), ...appended], count: (node.metadata?.images?.length || 0) + appended.length, primaryImageId: node.metadata?.primaryImageId || appended[0]?.id } }
                                : node,
                        ),
                );
                setSelectedNodeIds(new Set([stackTargetId]));
                setSelectedConnectionId(null);
            }
        } else if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            const snapped = snapDragToGuides(initialPositions, nodesRef.current, dx, dy, 6 / currentViewport.k, CANVAS_GRID_SIZE);
            setNodes((prev) =>
                prev.map((node) => {
                    const initial = initialPositions.find((item) => item.id === node.id);
                    return initial ? { ...node, position: { x: initial.x + snapped.dx, y: initial.y + snapped.dy } } : node;
                }),
            );
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = [];
        dragRef.current.ghost = null;
        if (wasClick && clickedNodeId) setDialogNodeId((current) => (current === clickedNodeId ? current : null));
    }, [applyNodeMetadata, collectImageIntoAssets]);

    const moveNodeLayer = useCallback((nodeId: string, direction: "up" | "down") => {
        const current = nodesRef.current;
        const index = current.findIndex((node) => node.id === nodeId);
        if (index < 0) return;
        const target = index + (direction === "up" ? 1 : -1);
        if (target < 0 || target >= current.length) return;
        const next = [...current];
        const [node] = next.splice(index, 1);
        next.splice(target, 0, node);
        setNodes(next);
    }, []);

    const toggleNodeFlag = useCallback((nodeId: string, flag: "locked" | "hidden") => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, [flag]: !node.metadata?.[flag] } } : node)));
    }, []);

    const renameNodes = useCallback((ids: string[], title: string) => {
        const titles = bulkRenameTitles(ids, title);
        if (!titles.size) return;
        setNodes((prev) =>
            prev.map((node) => {
                const nextTitle = titles.get(node.id);
                return nextTitle ? { ...node, title: nextTitle } : node;
            }),
        );
    }, []);

    const handleGlobalMouseMove = useCallback(
        (event: MouseEvent) => {
            const currentViewport = viewportRef.current;

            if (dragRef.current.isDraggingNode) {
                dragMoveRef.current = { clientX: event.clientX, clientY: event.clientY };
                if (rafRef.current) return;
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    const point = dragMoveRef.current;
                    if (!point || !dragRef.current.isDraggingNode) return;
                    const dx = (point.clientX - dragRef.current.startX) / currentViewport.k;
                    const dy = (point.clientY - dragRef.current.startY) / currentViewport.k;
                    const initialPositions = dragRef.current.initialSelectedNodes;
                    if (Math.abs(point.clientX - dragRef.current.startX) > 3 || Math.abs(point.clientY - dragRef.current.startY) > 3) {
                        dragRef.current.hasMoved = true;
                    }

                    const movedIds = new Set(initialPositions.map((item) => item.id));
                    const snap = dragRef.current.hasMoved ? snapDragToGuides(initialPositions, nodesRef.current, dx, dy, 6 / currentViewport.k, CANVAS_GRID_SIZE) : null;
                    const finalDx = snap?.dx ?? dx;
                    const finalDy = snap?.dy ?? dy;
                    setSnapGuides(snap?.guides ?? EMPTY_SNAP_GUIDES);
                    const previewNodes = nodesRef.current.map((node) => {
                        const initial = initialPositions.find((item) => item.id === node.id);
                        return initial ? { ...node, position: { x: initial.x + finalDx, y: initial.y + finalDy } } : node;
                    });
                    const dropCandidates = previewNodes.filter((node) => !isNodeHidden(node));
                    const slotTarget = findVideoSlotDropTarget(point.clientX, point.clientY, movedIds, nodesRef.current);
                    const assetsTarget = slotTarget ? null : findAssetsDropTarget(movedIds, dropCandidates);
                    const stackTarget = slotTarget || assetsTarget ? null : findImageStackDropTarget(movedIds, dropCandidates);
                    dropTargetAssetsRef.current = assetsTarget?.id || null;
                    dropTargetStackRef.current = stackTarget?.id || null;
                    dropTargetSlotRef.current = slotTarget;
                    setDropTargetAssetsNodeId(assetsTarget?.id || null);
                    setDropTargetStackNodeId(stackTarget?.id || null);
                    setDropSlotState((current) => (current?.nodeId === slotTarget?.nodeId && current?.slot === slotTarget?.slot ? current : slotTarget));
                    const preview = new Map(initialPositions.map((item) => [item.id, { x: item.x + finalDx, y: item.y + finalDy }]));
                    dragPreviewRef.current = preview;
                    setDragPreviewSignal(preview);
                    const ghost = dragRef.current.ghost;
                    if (ghost && dragRef.current.hasMoved) {
                        const chip = ghostChipRef.current;
                        if (chip) {
                            chip.style.left = `${point.clientX}px`;
                            chip.style.top = `${point.clientY}px`;
                        }
                    }
                });
                return;
            }

            if (connectingParamsRef.current) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, connectingParamsRef.current);
                connectionTargetNodeIdRef.current = dropTarget.nodeId;
                setConnectionTargetNodeId(dropTarget.nodeId);
                setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            }
        },
        [getConnectionDropTarget, screenToCanvas],
    );

    const handleGlobalPointerMove = useCallback(
        (event: PointerEvent) => {
            const currentSelection = selectionBoxRef.current;
            if (!currentSelection) return;

            if (event.buttons === 0) {
                selectionBoxRef.current = null;
                setSelectionBox(null);
                return;
            }

            const world = screenToCanvas(event.clientX, event.clientY);
            const rectX = Math.min(currentSelection.startWorldX, world.x);
            const rectY = Math.min(currentSelection.startWorldY, world.y);
            const rectW = Math.abs(world.x - currentSelection.startWorldX);
            const rectH = Math.abs(world.y - currentSelection.startWorldY);
            const nextSelected = new Set<string>(currentSelection.additive ? currentSelection.initialSelectedNodeIds : []);

            nodesRef.current
                .forEach((node) => {
                    const intersects = rectX < node.position.x + node.width && rectX + rectW > node.position.x && rectY < node.position.y + node.height && rectY + rectH > node.position.y;

                    if (intersects && !isNodeLocked(node) && !isNodeHidden(node)) nextSelected.add(node.id);
                });

            const nextSelectionBox = { ...currentSelection, currentWorldX: world.x, currentWorldY: world.y };
            selectionBoxRef.current = nextSelectionBox;
            setSelectionBox(nextSelectionBox);
            setSelectedNodeIds(nextSelected);
        },
        [screenToCanvas],
    );

    const handleGlobalMouseUp = useCallback(
        (event: MouseEvent) => {
            finishNodeDrag(event.clientX, event.clientY);

            selectionBoxRef.current = null;
            setSelectionBox(null);

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) connectNodes(currentConnection, dropTarget.nodeId);
                setConnecting(null);
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, setConnecting],
    );

    useEffect(() => {
        const handlePointerUp = (event: PointerEvent) => finishNodeDrag(event.clientX, event.clientY);
        const cancelNodeDrag = () => finishNodeDrag();
        window.addEventListener("mousemove", handleGlobalMouseMove);
        window.addEventListener("mouseup", handleGlobalMouseUp);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelNodeDrag);
        window.addEventListener("blur", cancelNodeDrag);
        window.addEventListener("pointermove", handleGlobalPointerMove);
        return () => {
            window.removeEventListener("mousemove", handleGlobalMouseMove);
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelNodeDrag);
            window.removeEventListener("blur", cancelNodeDrag);
            window.removeEventListener("pointermove", handleGlobalPointerMove);
        };
    }, [finishNodeDrag, handleGlobalMouseMove, handleGlobalMouseUp, handleGlobalPointerMove]);

    const { handleUploadRequest, handleImageInputChange, insertFolderFile, handleDrop, pasteSystemClipboard } = useCanvasInsertion({
        containerRef,
        imageInputRef,
        uploadTargetRef,
        size,
        screenToCanvas,
        getCanvasCenter,
        message,
        t,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
    });

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom],[data-canvas-shortcuts-ignore]")) return;

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && key === "c" && window.getSelection()?.toString()) return;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setSelectionBox(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                event.preventDefault();
                if (!pasteCopiedNodes()) void pasteSystemClipboard();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setSelectionBox(null);
                setConnecting(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setIsNodeListOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, deleteConnection, deleteNodes, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, selectedConnectionId, setConnecting, undoCanvas]);

    const handleConnectStart = useCallback(
        (event: ReactMouseEvent, nodeId: string, handleType: "source" | "target") => {
            event.stopPropagation();
            setMouseWorld(screenToCanvas(event.clientX, event.clientY));
            setConnecting({ nodeId, handleType });
            connectionTargetNodeIdRef.current = null;
            setConnectionTargetNodeId(null);
            setSelectedConnectionId(null);
        },
        [screenToCanvas, setConnecting],
    );

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, width, height, position: position || node.position } : node)));
    }, []);

    const handleNodeResizeStart = useCallback(() => {
        if (containerRef.current) containerRef.current.dataset.canvasDragging = "true";
        setIsNodeResizing(true);
    }, []);
    const handleNodeResizeEnd = useCallback(() => {
        delete containerRef.current?.dataset.canvasDragging;
        setIsNodeResizing(false);
    }, []);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, []);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                if (node.type === CanvasNodeType.Prompt || node.type === CanvasNodeType.MusicPrompt || node.type === CanvasNodeType.SpeechPrompt || node.type === CanvasNodeType.VideoPrompt) return { ...node, metadata: { ...node.metadata, prompt: content } };
                return { ...node, metadata: { ...node.metadata, content, texts: node.metadata?.texts?.map((text) => (text.id === node.metadata?.primaryTextId ? { ...text, content } : text)) } };
            }),
        );
    }, []);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, []);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        setExpandedBatchNodeIds((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    }, []);

    const setBatchPrimary = useCallback((nodeId: string, itemId: string) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId) return node;
                if (node.type === CanvasNodeType.Text) {
                    const text = node.metadata?.texts?.find((item) => item.id === itemId);
                    return text?.content ? { ...node, metadata: { ...node.metadata, content: text.content, primaryTextId: text.id } } : node;
                }
                if (node.type === CanvasNodeType.ImageStack) {
                    return { ...node, metadata: { ...node.metadata, primaryImageId: itemId } };
                }
                return node;
            }),
        );
    }, []);

    const takeOutBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        const id = nanoid();
        const edge = Math.max(node.width, node.height);
        const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
        const copy: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: node.title,
            position: { x: node.position.x + node.width + 96, y: node.position.y + node.height / 2 - size.height / 2 },
            ...size,
            metadata: {
                content: image.content,
                storageKey: image.storageKey,
                thumbnail: image.thumbnail,
                thumbnailKey: image.thumbnailKey,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                bytes: image.bytes,
                mimeType: image.mimeType,
                status: NODE_STATUS_SUCCESS,
                prompt: node.metadata?.prompt,
                generationType: node.metadata?.generationType,
                model: node.metadata?.model,
                size: node.metadata?.size,
                quality: node.metadata?.quality,
                background: node.metadata?.background,
                references: node.metadata?.references,
            },
        };
        setNodes((prev) => {
            const remaining = (node.metadata?.images || []).filter((item) => item.id !== imageId);
            return [
                ...prev.map((item) =>
                    item.id === node.id
                        ? { ...item, metadata: { ...item.metadata, images: remaining, count: remaining.length, primaryImageId: item.metadata?.primaryImageId === imageId ? remaining[0]?.id : item.metadata?.primaryImageId } }
                        : item,
                ),
                copy,
            ];
        });
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const splitStackImages = useCallback((node: CanvasNodeData) => {
        const images = (node.metadata?.images || []).filter((image) => image.content);
        if (images.length < 2) return;
        const gap = 16;
        const columns = Math.ceil(Math.sqrt(images.length));
        const edge = Math.max(node.width, node.height);
        const sizes = images.map((image) => fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge));
        const cellWidth = Math.max(...sizes.map((size) => size.width));
        const cellHeight = Math.max(...sizes.map((size) => size.height));
        const startX = node.position.x + node.width + 96;
        const startY = node.position.y;
        insertDerivedAsset(
            {
                source: node,
                children: images.map((image, index) => ({
                    type: CanvasNodeType.Image,
                    title: `${node.title} ${index + 1}`,
                    size: sizes[index],
                    position: { x: startX + (index % columns) * (cellWidth + gap), y: startY + Math.floor(index / columns) * (cellHeight + gap) },
                    metadata: {
                        content: image.content,
                        storageKey: image.storageKey,
                        thumbnail: image.thumbnail,
                        thumbnailKey: image.thumbnailKey,
                        naturalWidth: image.naturalWidth,
                        naturalHeight: image.naturalHeight,
                        bytes: image.bytes,
                        mimeType: image.mimeType,
                        status: "success",
                        prompt: node.metadata?.prompt,
                    },
                })),
                select: "children",
                clearSelectedConnection: true,
                openDialog: null,
            },
            { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
        );
        setNodes((prev) => prev.filter((item) => item.id !== node.id));
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const downloadNodeImage = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Midi) {
                if (!node.metadata?.content) return;
                const blob = node.metadata.storageKey ? await getMediaBlob(node.metadata.storageKey) : await (await fetch(node.metadata.content)).blob();
                if (blob) saveAs(blob, `${node.title || "midi"}.mid`);
                return;
            }
            if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
            saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
        },
        [],
    );

    const downloadBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        saveAs(image.content, `canvas-image-${node.id}-${image.id}.${imageExtension(image.content)}`);
    }, []);

    const copyImage = useCallback(
        async (source: string | null | undefined) => {
            if (await copyImageToClipboard(source)) message.success(t("canvas.imageTools.copied"));
            else message.error(t("canvas.imageTools.copyFailed"));
        },
        [message, t],
    );

    const captureVideoNodeFrame = useCallback(
        async (nodeId: string, position: VideoFramePosition) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const video = Array.from(containerRef.current!.querySelectorAll<HTMLVideoElement>("video[data-canvas-video]")).find((item) => item.dataset.canvasVideo === nodeId);
            if (node?.type !== CanvasNodeType.Video || !node.metadata?.content || !video) return message.error(t("canvas.videoFrames.failed"));
            try {
                const image = await uploadImage(await captureVideoFrame(node.metadata.content, position, video.currentTime));
                const size = fitNodeSize(image.width, image.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
                const id = nanoid();
                const x = node.position.x + node.width + 96;
                let y = node.position.y + node.height / 2 - size.height / 2;
                while (nodesRef.current.some((item) => item.id !== node.id && item.position.x < x + size.width && item.position.x + item.width > x && item.position.y < y + size.height && item.position.y + item.height > y)) y += size.height + 24;
                insertDerivedAsset(
                    {
                        source: node,
                        children: [{ id, image, title: t(`canvas.videoFrames.${position}Title`, { name: node.title || t("canvas.nodeTypes.video") }), size, position: { x, y } }],
                        select: "children",
                        clearSelectedConnection: true,
                        openDialog: id,
                    },
                    { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
                );
                message.success(t("canvas.videoFrames.captured"));
            } catch {
                message.error(t("canvas.videoFrames.failed"));
            }
        },
        [message, t],
    );

    const cropImageNode = useCallback(async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
        if (!node.metadata?.content) return;
        const cropped = await cropDataUrl(node.metadata.content, crop);
        const image = await uploadImage(cropped);
        const width = Math.min(node.width, Math.max(220, image.width));
        const childId = nanoid();
        insertDerivedAsset(
            {
                source: node,
                children: [{ id: childId, image, title: "Cropped Image", size: { width, height: width * (image.height / image.width) }, metadata: { prompt: node.metadata?.prompt } }],
                select: "children",
                openDialog: childId,
            },
            { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
        );
        setCropNodeId(null);
    }, []);

    const insertAnalyzedCrop = useCallback(
        async (node: CanvasNodeData, dataUrl: string) => {
            const image = await uploadImage(dataUrl);
            const width = Math.min(node.width, Math.max(220, image.width));
            const childId = nanoid();
            insertDerivedAsset(
                {
                    source: node,
                    children: [{ id: childId, image, title: t("canvas.imageAnalysis.smartCrop"), size: { width, height: width * (image.height / image.width) }, metadata: { prompt: node.metadata?.prompt } }],
                    select: "children",
                    openDialog: childId,
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
        },
        [t],
    );

    const removeNodeBackground = useCallback(async (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Image) return;
        const key = `remove-bg-${node.id}`;
        const progressTimer = window.setInterval(() => {
            const { status, percent } = useLocalModelStore.getState().models["background-removal"];
            if (status === "downloading") message.loading({ content: t("canvas.imageTools.removeBackgroundDownloading", { percent }), key, duration: 0 });
        }, 500);
        const prepared = await prepareModel("background-removal");
        window.clearInterval(progressTimer);
        if (!prepared) {
            message.error({ content: t("canvas.imageTools.removeBackgroundFailed"), key });
            return;
        }
        const source = await resolveImageUrl(node.metadata?.storageKey, node.metadata?.content || "");
        if (!source) {
            message.destroy(key);
            return;
        }
        message.loading({ content: t("canvas.imageTools.removeBackgroundRunning"), key, duration: 0 });
        try {
            const blob = await removeImageBackground(source, (progressKey, current, total) => {
                if (progressKey.startsWith("fetch") && total > 0) message.loading({ content: t("canvas.imageTools.removeBackgroundProgress", { percent: Math.round((current / total) * 100) }), key, duration: 0 });
            });
            const image = await uploadImage(blob);
            const width = Math.min(node.width, Math.max(220, image.width));
            insertDerivedAsset(
                {
                    source: node,
                    children: [{ image, title: t("canvas.imageTools.removeBackgroundResult"), size: { width, height: width * (image.height / image.width) }, metadata: { prompt: node.metadata?.prompt } }],
                    select: "children",
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
            message.success({ content: t("canvas.imageTools.removeBackgroundDone"), key });
        } catch {
            message.error({ content: t("canvas.imageTools.removeBackgroundFailed"), key });
        }
    }, [message, prepareModel, t]);

    const splitImageNode = useCallback(
        async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
            if (!node.metadata?.content) return;
            setSplitNodeId(null);
            const pieces = await splitDataUrl(node.metadata.content, params);
            const gap = 16;
            const cellWidth = node.width / params.columns;
            const cellHeight = node.height / params.rows;
            const startX = node.position.x + node.width + 96;
            const startY = node.position.y;
            const images = await Promise.all(pieces.map((piece) => uploadImage(piece.dataUrl)));
            const childNodes = insertDerivedAsset(
                {
                    source: node,
                    children: pieces.map((piece, index) => ({
                        image: images[index],
                        title: t("canvas.projectPage.splitTitle", { name: node.title || t("canvas.nodeTypes.image"), row: piece.row + 1, column: piece.column + 1 }),
                        size: { width: cellWidth, height: cellHeight },
                        position: { x: startX + piece.column * (cellWidth + gap), y: startY + piece.row * (cellHeight + gap) },
                        metadata: { prompt: node.metadata?.prompt },
                    })),
                    select: "children",
                    clearSelectedConnection: true,
                    openDialog: null,
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
            message.success(t("canvas.projectPage.splitSuccess", { count: childNodes.length }));
        },
        [message, t],
    );


    const upscaleImageNode = useCallback(async (node: CanvasNodeData, params: ImageUpscaleParams) => {
        if (!node.metadata?.content) return;
        setResolutionNodeId(null);
        const resized = await upscaleDataUrl(node.metadata.content, params);
        const image = await uploadImage(resized);
        const childId = nanoid();
        insertDerivedAsset(
            {
                source: node,
                children: [{ id: childId, image, title: t("canvas.imageTools.resolutionResult"), metadata: { prompt: node.metadata?.prompt } }],
                select: "children",
                openDialog: childId,
            },
            { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
        );
    }, [t]);

    const aiUpscaleImageNode = useCallback(async (node: CanvasNodeData, prompt: string) => {
        if (!node.metadata?.content) return;
        const generationConfig = { ...buildGenerationConfig(effectiveConfig, node, "image"), count: "1", size: node.metadata?.size || "auto" };
        if (!effectiveConfig.imageModel || !isAiConfigReady(generationConfig, generationConfig.model)) {
            message.error(t("workbench.configFirst"));
            return;
        }
        setResolutionNodeId(null);
        const key = `ai-upscale-${node.id}`;
        message.loading({ content: t("canvas.imageTools.resolutionAiRunning"), key, duration: 0 });
        const controller = new AbortController();
        try {
            const source = { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
            const result = await requestEdit(generationConfig, prompt, [source], { signal: controller.signal });
            const image = result.images[0];
            const uploaded = await uploadImage(image.dataUrl, { signal: controller.signal });
            const childId = nanoid();
            insertDerivedAsset(
                {
                    source: node,
                    children: [{ id: childId, image: uploaded, title: t("canvas.imageTools.resolutionAiResult"), metadata: { prompt, model: generationConfig.model } }],
                    select: "children",
                    openDialog: childId,
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
            message.success({ content: t("canvas.imageTools.resolutionAiDone"), key });
        } catch (error) {
            message.error({ content: error instanceof Error ? error.message : t("canvas.imageTools.resolutionAiFailed"), key });
        }
    }, [effectiveConfig, isAiConfigReady, message, t]);

    const ocrImageNode = useCallback(async (node: CanvasNodeData) => {
        if (!node.metadata?.content) return;
        const textConfig = buildGenerationConfig(effectiveConfig, node, "text");
        if (!isAiConfigReady(textConfig, textConfig.model)) {
            openConfigDialog();
            return;
        }
        const key = `ocr-${node.id}`;
        message.loading({ content: t("canvas.imageTools.ocrRunning"), key, duration: 0 });
        const controller = new AbortController();
        try {
            const text = await extractImageText(textConfig, { id: node.id, name: `${node.title || node.id}.png`, type: node.metadata.mimeType || "image/png", dataUrl: node.metadata.content, storageKey: node.metadata.storageKey }, { signal: controller.signal });
            insertDerivedAsset(
                {
                    source: node,
                    children: [{ type: CanvasNodeType.Text, title: text.slice(0, 32) || t("canvas.imageTools.ocrResult"), metadata: { content: text, prompt: ocrPrompt(), status: "success" } }],
                    select: "children",
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
            message.success({ content: t("canvas.imageTools.ocrResult"), key });
        } catch (error) {
            if (controller.signal.aborted) {
                message.destroy(key);
                return;
            }
            message.error({ content: error instanceof Error ? error.message : t("canvas.imageTools.ocrFailed"), key });
        }
    }, [effectiveConfig, isAiConfigReady, message, openConfigDialog, t]);

    const insertSegmentedImage = useCallback(
        async (node: CanvasNodeData, result: CanvasImageSegmentResult) => {
            const image = await uploadImage(result.maskDataUrl);
            const width = Math.min(node.width, Math.max(220, image.width));
            insertDerivedAsset(
                {
                    source: node,
                    children: [{ image, title: t("canvas.segment.result"), size: { width, height: width * (image.height / image.width) }, metadata: { prompt: node.metadata?.prompt } }],
                    select: "children",
                },
                { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
            );
            setSegmentNodeId(null);
        },
        [t],
    );

    const handleResolutionConfirm = useCallback(
        (node: CanvasNodeData, payload: CanvasImageResolutionPayload) => {
            if (payload.kind === "ai") void aiUpscaleImageNode(node, payload.prompt);
            else void upscaleImageNode(node, payload);
        },
        [aiUpscaleImageNode, upscaleImageNode],
    );


    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, []);


    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || t("canvas.projectPage.untitledCanvas"));
        setTitleEditing(true);
    }, [currentProject?.title, t]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameProject(projectId, nextTitle);
        setTitleEditing(false);
    }, [projectId, renameProject, titleDraft]);

    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);


    const deleteBatchImage = useCallback((nodeId: string, imageId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if ((node?.metadata?.images?.length || 0) <= 2) setExpandedBatchNodeIds((current) => new Set([...current].filter((id) => id !== nodeId)));
        setNodes((prev) =>
            prev.map((item) => {
                if (item.id !== nodeId) return item;
                const images = item.metadata?.images?.filter((image) => image.id !== imageId) || [];
                return { ...item, metadata: { ...item.metadata, images, count: images.length, primaryImageId: item.metadata?.primaryImageId === imageId ? images[0]?.id : item.metadata?.primaryImageId } };
            }),
        );
    }, []);

    const retryBatchImage = useCallback((node: CanvasNodeData, imageId: string) => void handleRetryNode(node, imageId), [handleRetryNode]);

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning(t("canvas.projectPage.emptyTextImage"));
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const promptSize = getNodeSpec(CanvasNodeType.Prompt);
            const generationSize = getNodeSpec(CanvasNodeType.ImageGeneration);
            const promptNode = createCanvasNode(
                CanvasNodeType.Prompt,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + promptSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                { prompt, status: NODE_STATUS_SUCCESS },
            );
            const generationNode = createCanvasNode(
                CanvasNodeType.ImageGeneration,
                {
                    x: promptNode.position.x + promptSize.width / 2 + 96 + generationSize.width / 2,
                    y: promptNode.position.y,
                },
                {
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: promptNode.id, toNodeId: generationNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(promptNode, generationNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([generationNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(generationNode.id);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, t],
    );


    // Memoize every callback and render function passed to CanvasNode.
    // CanvasNode uses React.memo, but new prop references would invalidate it on every render and rerender every node
    // during click, hover, or viewport changes, which is especially expensive for Markdown. These useCallback values
    // and their memoized map/handler dependencies remain stable during interaction, so unchanged nodes do not rerender.
    const handleNodeHoverStart = useCallback((nodeId: string) => {
        if (nodeDraggingRef.current) return;
        setHoveredNodeId(nodeId);
    }, []);
    const handleNodeHoverEnd = useCallback((nodeId: string) => {
        setHoveredNodeId((current) => (current === nodeId ? null : current));
    }, []);
    const handleNodeViewImage = useCallback((node: CanvasNodeData, imageId?: string) => {
        setPreviewNodeId(node.id);
        setPreviewImageId(imageId || null);
    }, []);
    const handleNodeInfo = useCallback((node: CanvasNodeData) => setInfoNodeId(node.id), []);
    const handleNodeRetry = useCallback(
        (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Text && (node.metadata?.textCount || 1) > 1) {
                void generateNodeRef.current?.(node.id, "text", node.metadata?.prompt || "");
                return;
            }
            void handleRetryNode(node);
        },
        [handleRetryNode],
    );
    const renderNodePanel = useCallback(
        (panelNode: CanvasNodeData) =>
            panelNode.type === CanvasNodeType.Image || panelNode.type === CanvasNodeType.Prompt ? null : getNodeDefinition(panelNode.type)?.Panel ? (
                renderPluginPanel(panelNode)
            ) : (
                <div data-canvas-no-zoom>
                    <CanvasNodePromptPanel
                        node={panelNode}
                        nodes={nodes}
                        isRunning={runningNodeId === panelNode.id}
                        mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_REFERENCES}
                        connectedNodes={connectedNodesByNodeId.get(panelNode.id) || []}
                        onPromptChange={handleNodePromptChange}
                        onConfigChange={handleConfigNodeChange}
                        onGenerate={handleGenerateNode}
                        onStop={confirmStopGeneration}
                        modeOverride={getNodeDefinition(panelNode.type)?.useBuiltinPanel?.mode}
                        onImageSettingsOpenChange={(open) => {
                            setNodeImageSettingsOpen(open);
                            if (open) setToolbarNodeId(null);
                        }}
                    />
                </div>
            ),
        [configInputsById, confirmStopGeneration, connectedNodesByNodeId, handleConfigNodeChange, handleGenerateNode, handleNodeContentChange, handleNodePromptChange, mentionReferencesByNodeId, nodes, renderPluginPanel, runningNodeId, t, theme.node.text],
    );

    const handleRecordingSaved = useCallback(
        async (source: CanvasNodeData, blob: Blob) => {
            try {
                const audio = await uploadMediaFile(blob, "audio");
                insertDerivedAsset(
                    {
                        source,
                        children: [{ id: nanoid(), type: CanvasNodeType.Audio, title: t("canvas.recording.resultTitle"), size: NODE_DEFAULT_SIZE[CanvasNodeType.Audio], position: { x: source.position.x + source.width + 40, y: source.position.y }, metadata: audioMetadata(audio) }],
                        select: "children",
                        clearSelectedConnection: true,
                        openDialog: null,
                    },
                    { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
                );
                message.success(t("canvas.recording.saved"));
            } catch {
                message.error(t("canvas.recording.saveFailed"));
                throw new Error("recording-save-failed");
            }
        },
        [message, t],
    );

    const openMidiTranscribe = useCallback((node: CanvasNodeData) => {
        setMidiTranscribeNodeId(node.id);
        setMidiHighQuality(true);
        setMidiStage(null);
        setMidiProgress(0);
        setMidiFailed(false);
    }, []);

    const closeMidiTranscribe = useCallback(() => {
        midiAbortRef.current?.abort();
        midiAbortRef.current = null;
        setMidiTranscribeNodeId(null);
        setMidiRunning(false);
        setMidiStage(null);
        setMidiProgress(0);
        setMidiFailed(false);
    }, []);

    const startMidiTranscribe = useCallback(async () => {
        const source = midiTranscribeNodeId ? nodesRef.current.find((item) => item.id === midiTranscribeNodeId) : undefined;
        if (!source?.metadata?.content) return;
        const controller = new AbortController();
        midiAbortRef.current = controller;
        setMidiRunning(true);
        setMidiFailed(false);
        setMidiStage("decode");
        setMidiProgress(0);
        try {
            await runMidiTranscription(source, midiHighQuality, {
                signal: controller.signal,
                onProgress: (progress) => {
                    setMidiStage(progress.stage);
                    setMidiProgress(progress.progress <= 1 ? progress.progress * 100 : progress.progress);
                },
            });
            message.success(t("canvas.midiTranscribe.success", { defaultValue: "已生成 MIDI 节点" }));
            closeMidiTranscribe();
        } catch (error) {
            if (isGenerationCanceled(error)) {
                closeMidiTranscribe();
                return;
            }
            setMidiFailed(true);
            setMidiRunning(false);
            message.error(t("canvas.midiTranscribe.failed", { defaultValue: "转换失败，请重试" }));
        }
    }, [closeMidiTranscribe, message, midiHighQuality, midiTranscribeNodeId, runMidiTranscription, t]);

    const renderNodeContentPanel = useCallback(
        (contentNode: CanvasNodeData, dropSlot?: CanvasVideoSlot | null) => {
            const musicTags = t("canvas.promptNode.musicTags", { returnObjects: true }) as unknown as string[];
            const speechTags = t("canvas.promptNode.speechTags", { returnObjects: true }) as unknown as string[];
            if (contentNode.type === CanvasNodeType.Prompt) return <PromptNodePanel node={contentNode} references={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_REFERENCES} onContentChange={handleNodeContentChange} />;
            if (contentNode.type === CanvasNodeType.MusicPrompt) return <PromptNodePanel node={contentNode} tags={musicTags} references={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_REFERENCES} onContentChange={handleNodeContentChange} />;
            if (contentNode.type === CanvasNodeType.SpeechPrompt) return <PromptNodePanel node={contentNode} tags={speechTags} references={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_REFERENCES} onContentChange={handleNodeContentChange} />;
            if (contentNode.type === CanvasNodeType.VideoPrompt)
                return (
                    <VideoPromptNodeContent
                        node={contentNode}
                        nodes={nodes}
                        references={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_REFERENCES}
                        maxFrameImages={videoPromptFrameLimit(contentNode.id, nodes, connections)}
                        dropSlot={dropSlot}
                        onContentChange={handleNodeContentChange}
                        onVideoModeChange={(nodeId, videoMode) => applyNodeMetadata(nodeId, { videoMode })}
                        onVideoSlotsChange={(nodeId, videoSlots) => applyNodeMetadata(nodeId, { videoSlots })}
                    />
                );
            if (contentNode.type === CanvasNodeType.Assets) return <AssetsNodeContent node={contentNode} onInsert={(file) => void insertFolderFile(file)} onSourceChange={(assetSource) => applyNodeMetadata(contentNode.id, { assetSource })} onStudioProjectsChange={(assetStudioProjects) => applyNodeMetadata(contentNode.id, { assetStudioProjects })} />;
            if (contentNode.type === CanvasNodeType.Recording) return <RecordingNodeContent onRecorded={(blob) => handleRecordingSaved(contentNode, blob)} />;
            return (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                hasPromptConnection={(connectedNodesByNodeId.get(contentNode.id) || []).some((node) => node.type === (contentNode.type === CanvasNodeType.MusicGeneration ? CanvasNodeType.MusicPrompt : contentNode.type === CanvasNodeType.SpeechGeneration ? CanvasNodeType.SpeechPrompt : contentNode.type === CanvasNodeType.VideoGeneration ? CanvasNodeType.VideoPrompt : CanvasNodeType.Prompt))}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                onConfigChange={handleConfigNodeChange}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    const targetMode = target?.type === CanvasNodeType.SpeechGeneration || target?.type === CanvasNodeType.MusicGeneration ? "audio" : target?.type === CanvasNodeType.VideoGeneration ? "video" : "image";
                    void handleGenerateNode(nodeId, targetMode, "");
                }}
            />
            );
        },
        [applyNodeMetadata, configInputsById, confirmStopGeneration, connectedNodesByNodeId, connections, handleConfigNodeChange, handleGenerateNode, handleNodeContentChange, handleRecordingSaved, insertFolderFile, mentionReferencesByNodeId, nodes, runningNodeId, t],
    );

    if (!projectLoaded && !loadedOnceRef.current) return <CanvasRefreshShell />;

    const guideBounds = snapGuides.x.length || snapGuides.y.length ? nodeBounds(nodes) : null;
    const guideSpan = guideBounds ? { left: guideBounds.left - 400, top: guideBounds.top - 400, right: guideBounds.right + 400, bottom: guideBounds.bottom + 400 } : null;
    const isGhostDrag = Boolean(ghostMeta);
    const ghostNode = ghostMeta ? nodeById.get(ghostMeta.nodeId) : undefined;
    const GhostIcon = ghostNode?.type === CanvasNodeType.Video ? Video : ghostNode?.type === CanvasNodeType.Audio ? Music2 : ghostNode?.type === CanvasNodeType.Midi ? FileMusic : ImageIcon;

    return (
        <main className="relative flex h-full min-h-0 overflow-hidden" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <CanvasTopBar
                title={currentProject?.title || t("canvas.projectPage.untitledCanvas")}
                titleDraft={titleDraft}
                isTitleEditing={titleEditing}
                onTitleDraftChange={setTitleDraft}
                onStartTitleEditing={startTitleEditing}
                onFinishTitleEditing={finishTitleEditing}
                onCancelTitleEditing={() => setTitleEditing(false)}
                onProjects={() => (embedded && onExit ? onExit() : navigate("/canvas"))}
                embedded={embedded}
                workspace={workspace}
                onWorkspaceChange={handleWorkspaceChange}
            />
            {embedded ? null : (
                <div className="flex h-full shrink-0 pt-14">
                    <CanvasSidePanel />
                </div>
            )}
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <OpenCanvas
                    containerRef={containerRef}
                    viewport={viewport}
                    tool={canvasTool}
                    backgroundMode={effectiveConfig.canvasBackgroundMode}
                    onViewportChange={setViewport}
                    onCanvasMouseDown={handleCanvasMouseDown}
                    onCanvasDeselect={deselectCanvas}
                    onDrop={handleDrop}
                >
                    <svg className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ pointerEvents: "none", transform: "translateZ(0)", zIndex: 0 }}>
                        {connectionPaths}
                        {cutStroke && cutStroke.length > 1 ? (
                            <polyline points={cutStroke.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={theme.canvas.selectionStroke} strokeWidth={2 / viewport.k} strokeLinecap="round" strokeLinejoin="round" />
                        ) : null}
                        {connectingParams ? <ActiveConnectionPath node={nodeById.get(connectingParams.nodeId)} handle={connectingParams} mouseWorld={mouseWorld} target={connectionTargetNodeId ? nodeById.get(connectionTargetNodeId) : undefined} /> : null}
                    </svg>

                    {visibleNodes.map((node) => (
                        <CanvasNode
                            key={node.id}
                            data={node}
                            scale={viewport.k}
                            ghostDragging={isGhostDrag}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            showPanel={!isNodeResizing && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.ImageStack && node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.ImageGeneration && node.type !== CanvasNodeType.SpeechGeneration && node.type !== CanvasNodeType.MusicGeneration && node.type !== CanvasNodeType.VideoGeneration && node.type !== CanvasNodeType.Prompt && node.type !== CanvasNodeType.MusicPrompt && node.type !== CanvasNodeType.SpeechPrompt && node.type !== CanvasNodeType.VideoPrompt && dialogNodeId === node.id && !selectionBox && !getNodeDefinition(node.type)?.hidePanel}
                            isAssetsDropTarget={dropTargetAssetsNodeId === node.id}
                            isStackDropTarget={dropTargetStackNodeId === node.id}
                            videoSlotDropTarget={dropSlotState?.nodeId === node.id ? dropSlotState : null}
                            returnFrom={returningNodes.get(node.id)}
                            nodes={nodes}
                            batchExpanded={expandedBatchNodeIds.has(node.id)}
                            mentionReferences={mentionReferencesByNodeId.get(node.id) || EMPTY_REFERENCES}
                            pluginHost={pluginHost}
                            registryVersion={nodeRegistryVersion}
                            renderPanel={renderNodePanel}
                            renderNodeContent={renderNodeContentPanel}
                            onMouseDown={handleNodeMouseDown}
                            onSelectCapture={handleNodeSelectCapture}
                            onHoverStart={handleNodeHoverStart}
                            onHoverEnd={handleNodeHoverEnd}
                            onConnectStart={handleConnectStart}
                            onResizeStart={handleNodeResizeStart}
                            onResize={handleNodeResize}
                            onResizeEnd={handleNodeResizeEnd}
                            onContentChange={handleNodeContentChange}
                            onTitleChange={handleNodeTitleChange}
                            onToggleBatch={toggleBatchExpanded}
                            onSetBatchPrimary={setBatchPrimary}
                            onTakeOutBatchImage={takeOutBatchImage}
                            onSplitBatchImages={splitStackImages}
                            onDownloadBatchImage={downloadBatchImage}
                            onRetryBatchImage={retryBatchImage}
                            onDeleteBatchImage={deleteBatchImage}
                            onRetry={handleNodeRetry}
                            onViewImage={handleNodeViewImage}
                            onInfo={handleNodeInfo}
                        />
                    ))}

                    {guideSpan ? (
                        <svg className="pointer-events-none absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible" style={{ zIndex: 45 }}>
                            {snapGuides.x.map((x) => (
                                <line key={`x-${x}`} x1={x} y1={guideSpan.top} x2={x} y2={guideSpan.bottom} stroke={selectionBlue} strokeWidth={1 / viewport.k} />
                            ))}
                            {snapGuides.y.map((y) => (
                                <line key={`y-${y}`} x1={guideSpan.left} y1={y} x2={guideSpan.right} y2={y} stroke={selectionBlue} strokeWidth={1 / viewport.k} />
                            ))}
                        </svg>
                    ) : null}

                    {selectionBox ? (
                        <svg
                            className="pointer-events-none absolute z-[100] overflow-visible"
                            style={{
                                left: Math.min(selectionBox.startWorldX, selectionBox.currentWorldX),
                                top: Math.min(selectionBox.startWorldY, selectionBox.currentWorldY),
                                width: Math.abs(selectionBox.currentWorldX - selectionBox.startWorldX),
                                height: Math.abs(selectionBox.currentWorldY - selectionBox.startWorldY),
                            }}
                        >
                            <rect width="100%" height="100%" fill={theme.canvas.selectionFill} stroke={theme.canvas.selectionStroke} strokeOpacity={0.55} strokeWidth={1 / viewport.k} strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`} />
                        </svg>
                    ) : null}
                </OpenCanvas>

                {embedded && selectedConnectionId ? (
                    <div className="pointer-events-auto absolute left-1/2 top-16 z-[90] flex max-w-[92%] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border p-1.5 glass-raised" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <span className="px-1 text-xs" style={{ color: theme.node.muted }}>
                            {t("writing.board.relation")}
                        </span>
                        {WRITE_RELATIONS.map((relation) => (
                            <button
                                key={relation}
                                type="button"
                                className="rounded-md px-2 py-1 text-xs transition hover:bg-hover"
                                style={{ color: theme.node.text }}
                                onClick={() => setConnections((prev) => prev.map((conn) => (conn.id === selectedConnectionId ? { ...conn, relation } : conn)))}
                            >
                                {t(`canvas.relations.${relation}`)}
                            </button>
                        ))}
                    </div>
                ) : null}

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || isNodeResizing || nodeImageSettingsOpen || expandedBatchNodeIds.has(toolbarNode?.id || "") ? null : toolbarNode}
                    nodes={nodes}
                    viewport={viewport}
                    extraTools={toolbarNode ? buildNodeToolbarItems(toolbarNode) : undefined}
                    onKeep={keepNodeToolbar}
                    onLeave={hideNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onTextStyleChange={handleConfigNodeChange}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={(node) => void downloadNodeImage(node)}
                    onTranscribeMidi={openMidiTranscribe}
                    onCopy={(node) => void copyImage(node.metadata?.content)}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onRemoveBackground={(node) => void removeNodeBackground(node)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onResolution={(node) => setResolutionNodeId(node.id)}
                    onAnalyze={(node) => setAnalyzeNodeId(node.id)}
                    onOcr={(node) => void ocrImageNode(node)}
                    onSegment={(node) => setSegmentNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                    onDuplicate={(node) => duplicateNode(node.id)}
                    onMoveLayer={moveNodeLayer}
                    onToggleFlag={toggleNodeFlag}
                    onBulkRename={renameNodes}
                    onCaptureVideoFrame={(node, position) => void captureVideoNodeFrame(node.id, position)}
                />

                {hasMultipleSelectedNodes && !selectionBox ? (
                    <CanvasSelectionToolbar
                        nodes={selectedNodes}
                        viewport={viewport}
                        showToolbar={!isNodeDragging && !isNodeResizing}
                        onAlign={alignSelection}
                        onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    />
                ) : null}

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    canvasTool={canvasTool}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onAddNode={(type, metadata) => createNode(type, undefined, metadata)}
                    onAddExtensionNode={(type) => createNode(type)}
                    onExport={exportCurrentCanvas}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onCanvasToolChange={setCanvasTool}
                    scale={viewport.k}
                    isMiniMapOpen={isMiniMapOpen}
                    onScaleChange={setZoomScale}
                    onResetViewport={resetViewport}
                    onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                    isNodeListOpen={isNodeListOpen}
                    onToggleNodeList={() => setIsNodeListOpen((value) => !value)}
                    variant={embedded ? "write" : "canvas"}
                />

                <CanvasRulers viewportSize={size} />
                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                {isNodeListOpen ? (
                    <div className="absolute bottom-[84px] left-1/2 z-[60] w-[250px] -translate-x-1/2">
                        <CanvasNodeListPanel nodes={nodes} onToggleFlag={toggleNodeFlag} onBulkRename={renameNodes} />
                    </div>
                ) : null}

                <input ref={imageInputRef} type="file" multiple accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav,.mid,.midi,audio/midi,audio/x-midi" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />

                <CanvasMidiTranscribeDialog
                    open={Boolean(midiTranscribeNode)}
                    node={midiTranscribeNode}
                    highQuality={midiHighQuality}
                    onHighQualityChange={setMidiHighQuality}
                    running={midiRunning}
                    stage={midiStage}
                    progress={midiProgress}
                    failed={midiFailed}
                    onStart={() => void startMidiTranscribe()}
                    onClose={closeMidiTranscribe}
                />
                <CanvasPluginManagerModal open={pluginManagerOpen} onClose={() => setPluginManagerOpen(false)} />

                {cropNode?.metadata?.content ? <CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open={Boolean(cropNode)} onClose={() => setCropNodeId(null)} onConfirm={(crop) => void cropImageNode(cropNode!, crop)} /> : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? <CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open={Boolean(splitNode)} onClose={() => setSplitNodeId(null)} onConfirm={(params) => void splitImageNode(splitNode!, params)} /> : null}

                {resolutionNode?.metadata?.content ? (
                    <CanvasNodeResolutionDialog
                        dataUrl={resolutionNode.metadata.content}
                        open={Boolean(resolutionNode)}
                        onClose={() => setResolutionNodeId(null)}
                        onConfirm={(payload) => handleResolutionConfirm(resolutionNode, payload)}
                    />
                ) : null}

                {analyzeNode?.metadata?.content ? (
                    <CanvasImageAnalysisDialog
                        dataUrl={analyzeNode.metadata.content}
                        open={Boolean(analyzeNode)}
                        onClose={() => setAnalyzeNodeId(null)}
                        onCrop={(dataUrl) => void insertAnalyzedCrop(analyzeNode, dataUrl)}
                    />
                ) : null}

                {segmentNode?.metadata?.content ? (
                    <CanvasNodeSegmentDialog dataUrl={segmentNode.metadata.content} open={Boolean(segmentNode)} onClose={() => setSegmentNodeId(null)} onConfirm={(result) => void insertSegmentedImage(segmentNode, result)} />
                ) : null}

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                <Modal
                    title={previewIsStack ? previewNode?.title || t("canvas.nodeTypes.imageStack") : t("canvas.projectPage.imageDetails")}
                    open={previewIsStack ? previewImages.length > 0 : Boolean(previewContent)}
                    centered
                    onCancel={() => {
                        setPreviewNodeId(null);
                        setPreviewImageId(null);
                    }}
                    footer={null}
                    width={previewIsStack ? "min(1200px, 94vw)" : "auto"}
                    styles={{ body: { padding: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewIsStack ? (
                        <ImageStackPreview
                            images={previewImages}
                            coverId={previewNode?.metadata?.primaryImageId || previewImages[0]?.id}
                            activeId={previewImageId}
                            onSetCover={(image) => {
                                if (previewNode) setBatchPrimary(previewNode.id, image.id);
                            }}
                            onTakeOut={(image) => {
                                if (previewNode) takeOutBatchImage(previewNode, image.id);
                            }}
                            onRemove={(image) => {
                                if (previewNode) deleteBatchImage(previewNode.id, image.id);
                            }}
                            onRetry={(image) => {
                                if (previewNode) retryBatchImage(previewNode, image.id);
                            }}
                            onDownload={(image) => {
                                if (image.content) saveAs(image.content, `canvas-image-${previewNode?.id}-${image.id}.${imageExtension(image.content)}`);
                            }}
                            onCopy={(image) => {
                                if (image.content) void copyImage(image.content);
                            }}
                            onSplitAll={() => {
                                if (previewNode) {
                                    splitStackImages(previewNode);
                                    setPreviewNodeId(null);
                                    setPreviewImageId(null);
                                }
                            }}
                        />
                    ) : previewContent ? (
                        <>
                            <img src={previewContent} alt={previewNode?.title || t("canvas.nodeTypes.image")} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain" }} />
                            <div className="flex items-center gap-2">
                                <Button className="!border-foreground !bg-foreground !text-background hover:!border-foreground hover:!bg-foreground/85 hover:!text-background" icon={<Download className="size-4" />} aria-label={t("common.download")} title={t("common.download")} onClick={() => saveAs(previewContent, `canvas-image-${previewNode?.id}.${imageExtension(previewContent)}`)} />
                                <Button className="!border-foreground !bg-foreground !text-background hover:!border-foreground hover:!bg-foreground/85 hover:!text-background" icon={<ClipboardCopy className="size-4" />} aria-label={t("canvas.imageTools.copyTitle")} title={t("canvas.imageTools.copyTitle")} onClick={() => void copyImage(previewContent)} />
                            </div>
                        </>
                    ) : null}
                </Modal>
            </section>
            {ghostMeta ? (
                <div
                    ref={ghostChipRef}
                    className="canvas-drag-ghost pointer-events-none fixed z-[120] flex size-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-md border"
                    style={{ left: -9999, top: -9999, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <GhostIcon className="size-5 shrink-0" />
                    {ghostNode?.title ? <span className="max-w-[40px] truncate text-xs leading-none">{ghostNode.title}</span> : null}
                    {ghostMeta.count > 1 ? (
                        <span className="absolute -right-1.5 -top-1.5 rounded-full border px-1 text-xs leading-4" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}>
                            ×{ghostMeta.count}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </main>
    );
}