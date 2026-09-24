import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Download, Image as ImageIcon, ImagePlus, Music2, Video } from "lucide-react";

import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { createVideoGenerationTask, isVideoTaskFailed, storeGeneratedVideo, waitForVideoGenerationTask } from "@/services/api/video";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useLocalModelStore } from "@/stores/use-local-model-store";
import { cleanupUnusedCanvasImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { removeImageBackground } from "@/services/background-removal";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
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
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { AssetsNodeContent } from "@/components/canvas/nodes/assets-node-content";
import { ImageModifierNodeContent } from "@/components/canvas/nodes/image-modifier-node-content";
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
import { CanvasNodeListPanel } from "@/components/canvas/canvas-node-layer-popover";
import { CanvasRulers } from "@/components/canvas/canvas-rulers";
import { CanvasSelectionToolbar } from "@/components/canvas/canvas-selection-toolbar";
import { alignNodes, type AlignAxis } from "@/lib/canvas/alignment";
import { connectionCrossesStroke } from "@/lib/canvas/canvas-connections";
import { isCanvasDropSourceType, videoReferenceKind } from "@/lib/canvas/canvas-drop-bindings";
import { VIDEO_REFERENCE_LIMITS, VIDEO_REFERENCE_TOTAL_LIMIT, openRouterVideoModels, videoFrameImageLimit, type VideoReferenceKind } from "@/lib/video-generation";
import { isCanvasOverlayTarget } from "@/lib/canvas/canvas-overlays";
import { registerCanvasRightButtonTool } from "@/lib/canvas/canvas-pointer-tools";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNode, selectionBlue } from "@/components/canvas/canvas-node";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { PromptNodePanel } from "@/components/canvas/prompt-node-panel";
import { SmartCanvasSettingsPopover } from "@/components/canvas/smart-canvas-settings-popover";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { CanvasSidePanel } from "@/components/canvas/canvas-side-panel";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAgentBridge } from "@/pages/canvas/hooks/use-agent-bridge";
import { usePluginHost } from "@/pages/canvas/hooks/use-plugin-host";
import { useCanvasGeneration } from "@/pages/canvas/hooks/use-canvas-generation";
import { useCanvasInsertion } from "@/pages/canvas/hooks/use-canvas-insertion";
import { useCanvasHistory } from "@/pages/canvas/hooks/use-canvas-history";
import { useCanvasWorkspace } from "@/pages/canvas/hooks/use-canvas-workspace";
import { useCanvasDocument } from "@/pages/canvas/hooks/use-canvas-document";
import { NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH } from "@/lib/canvas/canvas-node-constants";
import { buildNodeMentionReferences, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { applyNodeConfigPatch, audioMetadata, createCanvasNode } from "@/lib/canvas/canvas-node-factory";
import { insertDerivedAsset } from "@/lib/canvas/canvas-derived-asset";
import { audioProjectAutomation, audioProjectClips, audioProjectDuration, audioProjectMasterGain, audioProjectMidiRegions, audioProjectPpqn, audioProjectTempo, audioProjectTracks, audioStemSourceIds, createAudioTrack, nextClipStart, resolveAudioNodeDuration } from "@/lib/canvas/audio-project";
import { encodeWavBlob, renderAudioMixdown } from "@/lib/canvas/audio-mixdown";
import { replaceClipRange } from "@/lib/canvas/audio-clip-ops";
import { renderImageModifierBlob } from "@/lib/canvas/image-modifier";
import { extractImageText, ocrPrompt } from "@/lib/canvas/canvas-ocr";
import { composeSmartCanvas, createPsImageLayer, smartCanvasBackground, smartCanvasBackgroundOpacity, smartCanvasLayers, smartCanvasSizeForRatio } from "@/lib/canvas/smart-canvas";
import { CANVAS_GRID_SIZE, bulkRenameTitles, findAssetsDropTarget, findAudioProjectDropTarget, findBoardDropTarget, findImageModifierDropTarget, getConnectionTargetAnchor, isNodeHidden, isNodeLocked, nodeBounds, nodeCenterInside, normalizeConnection, snapDragToGuides } from "@/lib/canvas/canvas-node-geometry";
import {
    audioExtension,
    buildGenerationConfig,
    getGenerationCount,
    getInputSummary,
    hasResumableVideoTask,
    hydrateCanvasImages,
    imageExtension,
    resetInterruptedGeneration,
} from "@/lib/canvas/canvas-generation-helpers";
import { getNodeDefinition, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { outputFileName, resolveOutputBlob } from "@/lib/workspace/output-file";
import { useAssetFolderStore } from "@/stores/use-asset-folder-store";
import { useBrowserCacheStore } from "@/stores/use-browser-cache-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { registerBuiltinNodes } from "@/components/canvas/nodes/builtin-nodes";
import { CanvasPluginManagerModal } from "@/components/canvas/canvas-plugin-manager-modal";
import { CanvasRefreshShell } from "@/components/canvas/canvas-refresh-shell";
import { CanvasTopBar } from "@/components/canvas/canvas-top-bar";
import { ConnectionCreateMenu, type PendingConnectionCreate } from "@/components/canvas/canvas-create-menus";
import {
    CANVAS_WORKSPACES,
    CanvasNodeType,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CanvasPsLayer,
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

const ImageStudio = lazy(() => import("@/components/canvas/workspace/image-studio"));
const AudioStudio = lazy(() => import("@/components/canvas/workspace/audio-studio"));

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

function resolveVideoSlotBinding(slot: CanvasVideoSlot, slots: CanvasVideoSlots | undefined, nodes: CanvasNodeData[], nodeId: string, kind: VideoReferenceKind, frameLimit: number): CanvasVideoSlots | null {
    const current = slots || {};
    const singleKeyframe = frameLimit <= 1 ? { firstFrame: undefined, lastFrame: undefined } : {};
    if (slot === "firstFrame") return kind === "image" ? { ...current, ...singleKeyframe, firstFrame: nodeId } : null;
    if (slot === "lastFrame") return kind === "image" ? { ...current, ...singleKeyframe, lastFrame: nodeId } : null;
    const references = current.references || [];
    if (references.includes(nodeId) || references.length >= VIDEO_REFERENCE_TOTAL_LIMIT) return null;
    const kinds = references.map((id) => {
        const node = nodes.find((item) => item.id === id);
        return node ? videoReferenceKind(node.type) : null;
    });
    if (kinds.filter((item) => item === kind).length >= VIDEO_REFERENCE_LIMITS[kind]) return null;
    // Native models reject audio-only reference sets.
    if (kind === "audio" && !kinds.some((item) => item === "image" || item === "video")) return null;
    return { ...current, references: [...references, nodeId] };
}

/** The keyframe limit lives on the video generation node, so resolve it through the prompt node's outgoing connection. */
function videoPromptFrameLimit(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): number {
    const generation = connections
        .filter((connection) => connection.fromNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.toNodeId))
        .find((node) => node?.type === CanvasNodeType.VideoGeneration);
    return videoFrameImageLimit(generation?.metadata?.model || openRouterVideoModels[0].value);
}





export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function InfiniteCanvasPage() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    // Subscribe to the registry version so plugin registration changes rerender the canvas.
    const nodeRegistryVersion = useNodeRegistryVersion((state) => state.version);
    const params = useParams<{ id: string; workspace?: string }>();
    const navigate = useNavigate();
    const projectId = params.id || "";
    const workspace: CanvasWorkspace = CANVAS_WORKSPACES.find((item) => item === params.workspace) || "canvas";
    const handleWorkspaceChange = useCallback(
        (next: CanvasWorkspace) => {
            navigate(`/canvas/${projectId}/${next}`, { replace: false });
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
    const dropTargetModifierRef = useRef<string | null>(null);
    const dropTargetAudioProjectRef = useRef<string | null>(null);
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
    const [pendingConnectionCreate, setPendingConnectionCreate] = useState<PendingConnectionCreate | null>(null);
    const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
    const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
    const [cutStroke, setCutStroke] = useState<Position[] | null>(null);
    const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [projectLoaded, setProjectLoaded] = useState(false);
    const loadedOnceRef = useRef(false);
    const loadedProjectIdRef = useRef<string | null>(null);
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
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [previewImageId, setPreviewImageId] = useState<string | null>(null);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [expandedBatchNodeIds, setExpandedBatchNodeIds] = useState<Set<string>>(new Set());
    const [isNodeDragging, setIsNodeDragging] = useState(false);
    const [isNodeResizing, setIsNodeResizing] = useState(false);
    const [dropTargetBoardId, setDropTargetBoardId] = useState<string | null>(null);
    const [dropTargetAssetsNodeId, setDropTargetAssetsNodeId] = useState<string | null>(null);
    const [dropTargetModifierNodeId, setDropTargetModifierNodeId] = useState<string | null>(null);
    const [dropTargetAudioProjectId, setDropTargetAudioProjectId] = useState<string | null>(null);
    const [dropSlotState, setDropSlotState] = useState<VideoSlotDropTarget | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>(EMPTY_SNAP_GUIDES);
    const [dragPreview, setDragPreview] = useState<Map<string, Position> | null>(null);
    const [dragGhost, setDragGhost] = useState<{ x: number; y: number; nodeId: string; count: number } | null>(null);
    const [returningNodes, setReturningNodes] = useState<Map<string, Position>>(new Map());
    const [boardPreview, setBoardPreview] = useState<{ dataUrl: string; width: number; height: number; title: string; boardId: string } | null>(null);
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
    const pendingConnectionCreateRef = useRef(pendingConnectionCreate);

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
        updateProject(projectId, { nodes, connections });
    }, [connections, nodes, projectId, projectLoaded, updateProject]);

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
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, viewport, connectingParams, connectionTargetNodeId, pendingConnectionCreate]);

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
                message.warning(t("canvas.projectPage.configConnection"));
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

    const createConnectedNode = useCallback(
        (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Audio | CanvasNodeType.SpeechGeneration | CanvasNodeType.MusicGeneration, pending: PendingConnectionCreate) => {
            const metadata = type === CanvasNodeType.Config ? { model: effectiveConfig.imageModel || effectiveConfig.model, size: effectiveConfig.size, count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count) } : undefined;
            const newNode = createCanvasNode(type, pending.position, metadata);
            const connection = normalizeConnection(pending.connection.nodeId, newNode.id, [...nodesRef.current, newNode], pending.connection.handleType);
            if (!connection) {
                message.warning(t("canvas.projectPage.configConnection"));
                return;
            }
            setNodes((prev) => [...prev, newNode]);
            setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
            setSelectedNodeIds(new Set([newNode.id]));
            setSelectedConnectionId(null);
            setPendingConnectionCreate(null);
            setConnecting(null);
        },
        [effectiveConfig.canvasImageCount, effectiveConfig.count, effectiveConfig.imageModel, effectiveConfig.model, effectiveConfig.size, message, setConnecting, t],
    );

    const cancelPendingConnectionCreate = useCallback(() => {
        setPendingConnectionCreate(null);
        setConnecting(null);
    }, [setConnecting]);

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

    const visibleNodes = useMemo(() => {
        const padding = 280;
        const width = size.width;
        const height = size.height;
        const viewLeft = -viewport.x / viewport.k - padding;
        const viewTop = -viewport.y / viewport.k - padding;
        const viewRight = viewLeft + width / viewport.k + padding * 2;
        const viewBottom = viewTop + height / viewport.k + padding * 2;

        return nodes.filter((node) => !isNodeHidden(node) && node.position.x + node.width > viewLeft && node.position.x < viewRight && node.position.y + node.height > viewTop && node.position.y < viewBottom);
    }, [nodes, size.height, size.width, viewport.k, viewport.x, viewport.y]);

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
    const previewNode = previewNodeId ? nodeById.get(previewNodeId) || null : null;
    const previewContent = previewImageId ? previewNode?.metadata?.images?.find((image) => image.id === previewImageId)?.content : previewNode?.metadata?.content;
    const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const alignSelection = (axis: AlignAxis) => {
        const positions = alignNodes(nodes, selectedNodeIds, axis);
        if (!positions.size) return;
        setNodes((prev) => prev.map((node) => { const next = positions.get(node.id); return next ? { ...node, position: next } : node; }));
    };
    const activeNodeId = hasMultipleSelectedNodes ? null : hoveredNodeId || (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
    const { board: workspaceBoard, boards: workspaceBoards, audioProject: workspaceAudioProject, audioProjects: workspaceAudioProjects } = useCanvasWorkspace(nodes, selectedNodeIds);
    const selectWorkspaceBoard = useCallback((boardId: string) => {
        setSelectedNodeIds(new Set([boardId]));
        setSelectedConnectionId(null);
    }, []);
    const selectWorkspaceAudioProject = useCallback((nodeId: string) => {
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
    }, []);
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
            if (node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.ImageGeneration && node.type !== CanvasNodeType.VideoGeneration) return;
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
                const fromPreview = dragPreview?.get(from.id);
                const toPreview = dragPreview?.get(to.id);

                return (
                    <ConnectionPath
                        key={connection.id}
                        connection={connection}
                        from={fromPreview ? { ...from, position: fromPreview } : from}
                        to={toPreview ? { ...to, position: toPreview } : to}
                        active={selectedConnectionId === connection.id || relatedHighlight.connectionIds.has(connection.id)}
                        referenceIndex={promptReferenceIndexByConnectionId.get(connection.id)}
                        scale={viewport.k}
                        onSelect={selectConnection}
                    />
                );
            }),
        [connections, dragPreview, nodeById, promptReferenceIndexByConnectionId, relatedHighlight, selectConnection, selectedConnectionId, viewport.k],
    );
    const { applyAgentOps } = useAgentBridge({
        projectId,
        title: currentProject?.title,
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
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
        effectiveConfig,
        getCanvasCenter,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        clipboardRef,
        cleanupCanvasFiles,
        projectId,
        size,
        cancelPendingConnectionCreate,
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
            if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
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
        [cancelPendingConnectionCreate, screenToCanvas],
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

    /** Dropping audio nodes onto an audio project appends one track plus one clip per node in a single edit, like the studio's add-clip flow. */
    const appendAudioNodesToProject = useCallback(
        async (targetId: string, audioNodes: CanvasNodeData[]) => {
            const durations = await Promise.all(audioNodes.map((node) => resolveAudioNodeDuration(node)));
            setNodes((prev) =>
                prev.map((node) => {
                    if (node.id !== targetId) return node;
                    const tracks = [...audioProjectTracks(node)];
                    const clips = [...audioProjectClips(node)];
                    audioNodes.forEach((source, index) => {
                        const track = { ...createAudioTrack(), name: source.title || t("canvas.audioStudio.trackName", { index: tracks.length + 1 }) };
                        tracks.push(track);
                        clips.push({ id: nanoid(), trackId: track.id, sourceNodeId: source.id, start: nextClipStart(clips, track.id), offset: 0, duration: durations[index] });
                    });
                    return { ...node, metadata: { ...node.metadata, audioTracks: tracks, audioClips: clips } };
                }),
            );
        },
        [setNodes, t],
    );

    const applyNodeMetadata = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, ...patch } } : node)));
    }, []);

    const bakeImageModifierNode = useCallback(
        async (anchor: CanvasNodeData, source: { content?: string; storageKey?: string }, params?: CanvasNodeMetadata["modifierParams"], curve?: CanvasNodeMetadata["modifierCurve"]) => {
            const sourceUrl = await resolveImageUrl(source.storageKey, source.content || "");
            if (!sourceUrl) {
                applyNodeMetadata(anchor.id, { modifierError: t("canvas.imageModifier.noSource") });
                message.error(t("canvas.imageModifier.noSource"));
                return;
            }
            try {
                const blob = await renderImageModifierBlob(sourceUrl, params, curve);
                const image = await uploadImage(blob);
                insertDerivedAsset(
                    {
                        source: anchor,
                        children: [{ image, title: t("canvas.imageModifier.resultTitle"), metadata: { prompt: anchor.metadata?.prompt } }],
                        select: "children",
                        clearSelectedConnection: true,
                        openDialog: null,
                    },
                    { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
                );
                applyNodeMetadata(anchor.id, { modifierError: undefined });
                message.success(t("canvas.imageModifier.baked"));
            } catch {
                applyNodeMetadata(anchor.id, { modifierError: t("canvas.imageModifier.bakeFailed") });
                message.error(t("canvas.imageModifier.bakeFailed"));
            }
        },
        [applyNodeMetadata, message, t],
    );

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
        const modifierTargetId = dragRef.current.hasMoved ? dropTargetModifierRef.current : null;
        const audioProjectTargetId = dragRef.current.hasMoved ? dropTargetAudioProjectRef.current : null;
        const slotTarget = dragRef.current.hasMoved ? dropTargetSlotRef.current : null;
        const previewPositions = dragPreviewRef.current;

        historyPausedRef.current = false;
        nodeDraggingRef.current = false;
        setIsNodeDragging(false);
        delete containerRef.current?.dataset.canvasDragging;
        setDropTargetBoardId(null);
        setDropTargetAssetsNodeId(null);
        setDropTargetModifierNodeId(null);
        setDropTargetAudioProjectId(null);
        setDropSlotState(null);
        dropTargetAssetsRef.current = null;
        dropTargetModifierRef.current = null;
        dropTargetAudioProjectRef.current = null;
        dropTargetSlotRef.current = null;
        setSnapGuides(EMPTY_SNAP_GUIDES);
        setDragPreview(null);
        setDragGhost(null);
        dragPreviewRef.current = null;
        dragMoveRef.current = null;

        const slotTargetNode = slotTarget ? nodesRef.current.find((node) => node.id === slotTarget.nodeId && node.type === CanvasNodeType.VideoPrompt) : undefined;
        const slotNode = draggedVideoReferenceNode(new Set(initialPositions.map((item) => item.id)), nodesRef.current);
        const slotKind = slotNode ? videoReferenceKind(slotNode.type) : null;
        const nextSlots = slotTarget && slotTargetNode && slotNode && slotKind ? resolveVideoSlotBinding(slotTarget.slot, slotTargetNode.metadata?.videoSlots, nodesRef.current, slotNode.id, slotKind, videoPromptFrameLimit(slotTargetNode.id, nodesRef.current, connectionsRef.current)) : null;

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
        } else if (modifierTargetId) {
            const target = nodesRef.current.find((node) => node.id === modifierTargetId);
            const returned = new Map<string, Position>();
            if (target) {
                const emit = Boolean(target.metadata?.modifierEmit);
                const params = target.metadata?.modifierParams;
                const curve = target.metadata?.modifierCurve;
                const droppedNode = nodesRef.current.find((node) => {
                    if (node.type !== CanvasNodeType.Image || (!node.metadata?.content && !node.metadata?.storageKey)) return false;
                    const initial = initialPositions.find((item) => item.id === node.id);
                    if (!initial) return false;
                    const dropped = previewPositions?.get(node.id) || { x: initial.x + dx, y: initial.y + dy };
                    return nodeCenterInside({ ...node, position: dropped }, target);
                });
                if (droppedNode) {
                    const initial = initialPositions.find((item) => item.id === droppedNode.id)!;
                    const dropped = previewPositions?.get(droppedNode.id) || { x: initial.x + dx, y: initial.y + dy };
                    returned.set(droppedNode.id, dropped);
                    if (emit) {
                        void bakeImageModifierNode(target, { content: droppedNode.metadata?.content, storageKey: droppedNode.metadata?.storageKey }, params, curve);
                    } else {
                        applyNodeMetadata(target.id, {
                            modifierSource: {
                                content: droppedNode.metadata?.content || "",
                                storageKey: droppedNode.metadata?.storageKey,
                                thumbnail: droppedNode.metadata?.thumbnail,
                                thumbnailKey: droppedNode.metadata?.thumbnailKey,
                                naturalWidth: droppedNode.metadata?.naturalWidth,
                                naturalHeight: droppedNode.metadata?.naturalHeight,
                                bytes: droppedNode.metadata?.bytes,
                                mimeType: droppedNode.metadata?.mimeType,
                            },
                            modifierError: undefined,
                        });
                    }
                }
            }
            if (returned.size) {
                setReturningNodes(returned);
                window.setTimeout(() => setReturningNodes(new Map()), NODE_RETURN_MS);
            }
        } else if (audioProjectTargetId) {
            const target = nodesRef.current.find((node) => node.id === audioProjectTargetId);
            const returned = new Map<string, Position>();
            const droppedAudios: CanvasNodeData[] = [];
            if (target) {
                nodesRef.current.forEach((node) => {
                    if (node.type !== CanvasNodeType.Audio) return;
                    const initial = initialPositions.find((item) => item.id === node.id);
                    if (!initial) return;
                    const dropped = previewPositions?.get(node.id) || { x: initial.x + dx, y: initial.y + dy };
                    if (!nodeCenterInside({ ...node, position: dropped }, target)) return;
                    returned.set(node.id, dropped);
                    droppedAudios.push(node);
                });
            }
            if (returned.size) {
                setReturningNodes(returned);
                window.setTimeout(() => setReturningNodes(new Map()), NODE_RETURN_MS);
                void appendAudioNodesToProject(audioProjectTargetId, droppedAudios);
            }
        } else if (dragRef.current.hasMoved && clientX != null && clientY != null) {
            const movedIds = new Set(initialPositions.map((item) => item.id));
            const snapped = snapDragToGuides(initialPositions, nodesRef.current, dx, dy, 6 / currentViewport.k, CANVAS_GRID_SIZE);
            const droppedNodes = nodesRef.current.map((node) => {
                const initial = initialPositions.find((item) => item.id === node.id);
                return initial ? { ...node, position: { x: initial.x + snapped.dx, y: initial.y + snapped.dy } } : node;
            });
            const board = findBoardDropTarget(movedIds, droppedNodes.filter((node) => !isNodeHidden(node)));
            const placedLayers: CanvasPsLayer[] = [];
            const returned = new Map<string, Position>();
            let placedOnBoard = false;
            if (board) {
                droppedNodes.forEach((node) => {
                    if (!movedIds.has(node.id) || (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.SmartCanvas) || !nodeCenterInside(node, board)) return;
                    const initial = initialPositions.find((item) => item.id === node.id)!;
                    returned.set(node.id, previewPositions?.get(node.id) || { x: initial.x + snapped.dx, y: initial.y + snapped.dy });
                    placedLayers.push(createPsImageLayer(board, node));
                });
                if (placedLayers.length) {
                    placedOnBoard = true;
                    handleSmartCanvasChange(board.id, { boardLayers: [...smartCanvasLayers(board), ...placedLayers] });
                    setReturningNodes(returned);
                    window.setTimeout(() => setReturningNodes(new Map()), NODE_RETURN_MS);
                }
            }
            if (!placedOnBoard) {
                setNodes((prev) =>
                    prev.map((node) => {
                        const initial = initialPositions.find((item) => item.id === node.id);
                        return initial ? { ...node, position: { x: initial.x + snapped.dx, y: initial.y + snapped.dy } } : node;
                    }),
                );
            }
        }

        dragRef.current.isDraggingNode = false;
        dragRef.current.hasMoved = false;
        dragRef.current.initialSelectedNodes = [];
        dragRef.current.ghost = null;
        if (wasClick && clickedNodeId) setDialogNodeId((current) => (current === clickedNodeId ? current : null));
    }, [applyNodeMetadata, appendAudioNodesToProject, bakeImageModifierNode, collectImageIntoAssets]);

    const moveNodeLayer = useCallback((nodeId: string, direction: "up" | "down") => {
        const current = nodesRef.current;
        const index = current.findIndex((node) => node.id === nodeId);
        if (index < 0) return;
        const step = direction === "up" ? 1 : -1;
        let target = index + step;
        while (target >= 0 && target < current.length && current[target].type === CanvasNodeType.SmartCanvas) target += step;
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
                    const modifierTarget = slotTarget ? null : findImageModifierDropTarget(movedIds, dropCandidates);
                    const audioProjectTarget = slotTarget || assetsTarget || modifierTarget ? null : findAudioProjectDropTarget(movedIds, dropCandidates);
                    dropTargetAssetsRef.current = assetsTarget?.id || null;
                    dropTargetModifierRef.current = modifierTarget?.id || null;
                    dropTargetAudioProjectRef.current = audioProjectTarget?.id || null;
                    dropTargetSlotRef.current = slotTarget;
                    setDropTargetAssetsNodeId(assetsTarget?.id || null);
                    setDropTargetModifierNodeId(modifierTarget?.id || null);
                    setDropTargetAudioProjectId(audioProjectTarget?.id || null);
                    setDropSlotState((current) => (current?.nodeId === slotTarget?.nodeId && current?.slot === slotTarget?.slot ? current : slotTarget));
                    setDropTargetBoardId(assetsTarget || modifierTarget || audioProjectTarget || slotTarget ? null : findBoardDropTarget(movedIds, dropCandidates)?.id || null);
                    const preview = new Map(initialPositions.map((item) => [item.id, { x: item.x + finalDx, y: item.y + finalDy }]));
                    dragPreviewRef.current = preview;
                    setDragPreview(preview);
                    const ghost = dragRef.current.ghost;
                    if (ghost && dragRef.current.hasMoved) setDragGhost({ x: point.clientX, y: point.clientY, nodeId: ghost.nodeId, count: ghost.count });
                });
                return;
            }

            if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
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

            if (pendingConnectionCreateRef.current) return;

            const currentConnection = connectingParamsRef.current;
            if (currentConnection) {
                const dropTarget = getConnectionDropTarget(event.clientX, event.clientY, currentConnection);
                if (dropTarget.nodeId) {
                    connectNodes(currentConnection, dropTarget.nodeId);
                    setConnecting(null);
                } else if (dropTarget.isNearNode) {
                    setConnecting(null);
                } else {
                    setMouseWorld(screenToCanvas(event.clientX, event.clientY));
                    setPendingConnectionCreate({ connection: currentConnection, position: screenToCanvas(event.clientX, event.clientY) });
                }
            }
        },
        [connectNodes, finishNodeDrag, getConnectionDropTarget, screenToCanvas, setConnecting],
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
                setPendingConnectionCreate(null);
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
                const image = node.metadata?.images?.find((item) => item.id === itemId);
                if (!image?.content) return node;
                const edge = Math.max(node.width, node.height);
                const size = node.metadata?.freeResize ? { width: node.width, height: node.height } : fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
                return {
                    ...node,
                    position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 },
                    ...size,
                    metadata: {
                        ...node.metadata,
                        content: image.content,
                        storageKey: image.storageKey,
                        thumbnail: image.thumbnail,
                        thumbnailKey: image.thumbnailKey,
                        naturalWidth: image.naturalWidth,
                        naturalHeight: image.naturalHeight,
                        bytes: image.bytes,
                        mimeType: image.mimeType,
                        primaryImageId: image.id,
                    },
                };
            }),
        );
    }, []);

    const duplicateBatchImage = useCallback((node: CanvasNodeData, imageId: string) => {
        const image = node.metadata?.images?.find((item) => item.id === imageId);
        if (!image?.content) return;
        const id = nanoid();
        const edge = Math.max(node.width, node.height);
        const size = fitNodeSize(image.naturalWidth, image.naturalHeight, edge, edge);
        const copy: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: node.title,
            position: { x: node.position.x + node.width * 2 + 96, y: node.position.y + node.height / 2 - size.height / 2 },
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
        setNodes((prev) => [...prev, copy]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(id);
    }, []);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, prompt } } : node)));
    }, []);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
        setNodes((prev) => prev.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node)));
    }, []);

    const handleSmartCanvasChange = useCallback((nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
        setNodes((prev) =>
            prev.map((node) => {
                if (node.id !== nodeId || node.type !== CanvasNodeType.SmartCanvas) return node;
                const next = { ...node, metadata: { ...node.metadata, ...patch } };
                if (patch.boardRatio && patch.boardRatio !== node.metadata?.boardRatio) {
                    const size = smartCanvasSizeForRatio(patch.boardRatio);
                    return { ...next, ...size, position: { x: node.position.x + node.width / 2 - size.width / 2, y: node.position.y + node.height / 2 - size.height / 2 } };
                }
                return next;
            }),
        );
    }, []);

    const composeBoardImage = useCallback(
        async (board: CanvasNodeData) => {
            if (!smartCanvasLayers(board).some((layer) => !layer.hidden)) {
                message.warning(t("canvas.smartCanvas.noContent"));
                return null;
            }
            try {
                const composite = await composeSmartCanvas(board, nodesRef.current);
                if (!composite.dataUrl) {
                    message.warning(t("canvas.smartCanvas.noContent"));
                    return null;
                }
                return composite;
            } catch {
                message.error(t("canvas.smartCanvas.composeFailed"));
                return null;
            }
        },
        [message, t],
    );

    const handleComposeBoard = useCallback(
        async (board: CanvasNodeData) => {
            const composite = await composeBoardImage(board);
            if (composite) setBoardPreview({ ...composite, title: board.title || t("canvas.nodeTypes.smartCanvas"), boardId: board.id });
        },
        [composeBoardImage, t],
    );

    const handleSaveBoardAsNode = useCallback(
        async (board: CanvasNodeData) => {
            const composite = await composeBoardImage(board);
            if (!composite) return;
            try {
                const uploaded = await uploadImage(composite.dataUrl);
                const size = fitNodeSize(composite.width, composite.height, NODE_DEFAULT_SIZE[CanvasNodeType.Image].width, NODE_DEFAULT_SIZE[CanvasNodeType.Image].height);
                insertDerivedAsset(
                    {
                        source: board,
                        children: [{ image: uploaded, title: board.title || t("canvas.nodeTypes.smartCanvas"), size, position: { x: board.position.x + board.width + 40, y: board.position.y }, metadata: { naturalWidth: composite.width, naturalHeight: composite.height } }],
                        select: "children",
                        clearSelectedConnection: true,
                    },
                    { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
                );
                message.success(t("canvas.smartCanvas.savedAsNode"));
            } catch {
                message.error(t("common.imageReadFailed"));
            }
        },
        [composeBoardImage, message, t],
    );

    const handleMixdownAudioProject = useCallback(
        async (target: CanvasNodeData) => {
            const clips = audioProjectClips(target);
            const regions = audioProjectMidiRegions(target);
            const ppqn = audioProjectPpqn(target);
            const tempo = audioProjectTempo(target);
            if ((!clips.length && !regions.length) || audioProjectDuration(clips, regions, ppqn, tempo) <= 0) {
                message.warning(t("canvas.audioStudio.noContent"));
                return;
            }
            try {
                const rendered = await renderAudioMixdown(
                    { tracks: audioProjectTracks(target), clips, regions, ppqn, tempo, masterGain: audioProjectMasterGain(target), automation: audioProjectAutomation(target) },
                    nodesRef.current,
                );
                const uploaded = await uploadMediaFile(encodeWavBlob(rendered), "audio");
                insertDerivedAsset(
                    {
                        source: target,
                        children: [
                            {
                                type: CanvasNodeType.Audio,
                                title: t("canvas.audioStudio.nodeTitle", { name: target.title || t("canvas.nodeTypes.audioProject") }),
                                size: NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
                                position: { x: target.position.x + target.width + 40, y: target.position.y },
                                metadata: audioMetadata(uploaded),
                            },
                        ],
                        select: "children",
                        clearSelectedConnection: true,
                    },
                    { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
                );
                message.success(t("canvas.audioStudio.savedAsNode"));
            } catch {
                message.error(t("canvas.audioStudio.mixdownFailed"));
            }
        },
        [message, t],
    );

    /** A finished take is one edit: the armed track's clips are rewritten and the recorded audio node is appended in the same patch. */
    const handleAudioRecorded = useCallback(
        async (target: CanvasNodeData, blob: Blob, take: { trackId: string; start: number; duration: number; name: string }) => {
            try {
                const uploaded = await uploadMediaFile(blob, "audio");
                const id = nanoid();
                const size = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
                const x = target.position.x + target.width + 96;
                let y = target.position.y;
                while (nodesRef.current.some((node) => node.position.x < x + size.width && node.position.x + node.width > x && node.position.y < y + size.height && node.position.y + node.height > y)) y += size.height + 24;
                setNodes((prev) =>
                    prev
                        .map((node) =>
                            node.id === target.id
                                ? {
                                      ...node,
                                      metadata: {
                                          ...node.metadata,
                                          audioClips: [...replaceClipRange(audioProjectClips(node), take.trackId, take.start, take.start + take.duration), { id: nanoid(), trackId: take.trackId, sourceNodeId: id, start: take.start, offset: 0, duration: take.duration, name: take.name }],
                                      },
                                  }
                                : node,
                        )
                        .concat({ id, type: CanvasNodeType.Audio, title: take.name, position: { x, y }, width: size.width, height: size.height, metadata: audioMetadata(uploaded) }),
                );
                message.success(t("canvas.audioStudio.recordSaved"));
            } catch {
                message.error(t("canvas.audioStudio.recordFailed"));
            }
        },
        [message, setNodes, t],
    );

    /** One offline render per track through the shared builder, so a stem is exactly what that track contributes. */
    const handleExportAudioStems = useCallback(
        async (target: CanvasNodeData) => {
            const tracks = audioProjectTracks(target);
            const clips = audioProjectClips(target);
            const regions = audioProjectMidiRegions(target);
            const ppqn = audioProjectPpqn(target);
            const tempo = audioProjectTempo(target);
            const masterGain = audioProjectMasterGain(target);
            const automation = audioProjectAutomation(target);
            const stems = tracks.flatMap((track) => {
                const sources = audioStemSourceIds(tracks, track);
                if (!sources) return [];
                const stemClips = clips.filter((clip) => sources.has(clip.trackId));
                const stemRegions = regions.filter((region) => sources.has(region.trackId));
                return stemClips.length || stemRegions.length ? [{ track, clips: stemClips, regions: stemRegions }] : [];
            });
            if (!stems.length) {
                message.warning(t("canvas.audioStudio.exportStemsEmpty"));
                return;
            }
            try {
                const files = await Promise.all(
                    stems.map(async (stem) => ({
                        name: stem.track.name || t("canvas.audioStudio.trackName", { index: tracks.indexOf(stem.track) + 1 }),
                        file: await uploadMediaFile(encodeWavBlob(await renderAudioMixdown({ tracks, clips: stem.clips, regions: stem.regions, ppqn, tempo, masterGain, automation }, nodesRef.current)), "audio"),
                    })),
                );
                insertDerivedAsset(
                    {
                        source: target,
                        children: files.map((stem, index) => ({
                            type: CanvasNodeType.Audio,
                            title: t("canvas.audioStudio.stemTitle", { name: target.title || t("canvas.nodeTypes.audioProject"), track: stem.name }),
                            size: NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
                            position: { x: target.position.x + target.width + 40, y: target.position.y + index * (NODE_DEFAULT_SIZE[CanvasNodeType.Audio].height + 16) },
                            metadata: audioMetadata(stem.file),
                        })),
                        select: "children",
                        clearSelectedConnection: true,
                    },
                    { setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId },
                );
                message.success(t("canvas.audioStudio.exportStemsDone", { count: files.length }));
            } catch {
                message.error(t("canvas.audioStudio.mixdownFailed"));
            }
        },
        [message, t],
    );

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        saveAs(node.metadata.content, `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`);
    }, []);

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
            const nodeSize = getNodeSpec(CanvasNodeType.Config);
            const configNode = createCanvasNode(
                CanvasNodeType.Config,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: configNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(configNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([configNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(configNode.id);
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
            ) : panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    nodeId={panelNode.id}
                    nodes={nodes}
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : panelNode.type === CanvasNodeType.SmartCanvas ? (
                <div className="flex items-center gap-2" style={{ color: theme.node.text }}>
                    <SmartCanvasSettingsPopover ratio={panelNode.metadata?.boardRatio || "16:9"} resolution={panelNode.metadata?.boardResolution || "2k"} background={smartCanvasBackground(panelNode)} backgroundOpacity={smartCanvasBackgroundOpacity(panelNode)} onChange={(patch) => handleSmartCanvasChange(panelNode.id, patch)} />
                    <Button size="small" type="text" className="!h-8 !rounded-full !px-2.5" style={{ color: theme.node.text }} icon={<ImagePlus className="size-3.5" />} onClick={() => void handleSaveBoardAsNode(panelNode)}>
                        {t("canvas.smartCanvas.saveAsNode")}
                    </Button>
                </div>
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
        [configInputsById, confirmStopGeneration, connectedNodesByNodeId, handleConfigNodeChange, handleGenerateNode, handleNodeContentChange, handleNodePromptChange, handleSaveBoardAsNode, handleSmartCanvasChange, mentionReferencesByNodeId, nodes, renderPluginPanel, runningNodeId, t, theme.node.text],
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
            if (contentNode.type === CanvasNodeType.Assets) return <AssetsNodeContent node={contentNode} onInsert={(file) => void insertFolderFile(file)} onSourceChange={(assetSource) => applyNodeMetadata(contentNode.id, { assetSource })} />;
            if (contentNode.type === CanvasNodeType.Recording) return <RecordingNodeContent onRecorded={(blob) => handleRecordingSaved(contentNode, blob)} />;
            if (contentNode.type === CanvasNodeType.ImageModifier)
                return (
                    <ImageModifierNodeContent
                        node={contentNode}
                        onParamsChange={(params) => applyNodeMetadata(contentNode.id, { modifierParams: params, modifierError: undefined })}
                        onCurveChange={(curve) => applyNodeMetadata(contentNode.id, { modifierCurve: curve, modifierError: undefined })}
                        onEmitChange={(emit) => applyNodeMetadata(contentNode.id, { modifierEmit: emit })}
                        onGenerate={() => bakeImageModifierNode(contentNode, contentNode.metadata?.modifierSource || {}, contentNode.metadata?.modifierParams, contentNode.metadata?.modifierCurve)}
                        onClearSource={() => applyNodeMetadata(contentNode.id, { modifierSource: undefined, modifierError: undefined })}
                    />
                );
            return (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                hasPromptConnection={(connectedNodesByNodeId.get(contentNode.id) || []).some((node) => node.type === (contentNode.type === CanvasNodeType.MusicGeneration ? CanvasNodeType.MusicPrompt : contentNode.type === CanvasNodeType.SpeechGeneration ? CanvasNodeType.SpeechPrompt : contentNode.type === CanvasNodeType.VideoGeneration ? CanvasNodeType.VideoPrompt : CanvasNodeType.Prompt))}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                onConfigChange={handleConfigNodeChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    const targetMode = target?.type === CanvasNodeType.SpeechGeneration || target?.type === CanvasNodeType.MusicGeneration ? "audio" : target?.type === CanvasNodeType.VideoGeneration ? "video" : target?.metadata?.generationMode || "image";
                    void handleGenerateNode(nodeId, targetMode, target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
            );
        },
        [applyNodeMetadata, bakeImageModifierNode, configInputsById, confirmStopGeneration, connectedNodesByNodeId, connections, handleConfigNodeChange, handleGenerateNode, handleNodeContentChange, handleRecordingSaved, insertFolderFile, mentionReferencesByNodeId, nodes, runningNodeId, t],
    );

    if (!projectLoaded && !loadedOnceRef.current) return <CanvasRefreshShell />;

    const guideBounds = snapGuides.x.length || snapGuides.y.length ? nodeBounds(nodes) : null;
    const guideSpan = guideBounds ? { left: guideBounds.left - 400, top: guideBounds.top - 400, right: guideBounds.right + 400, bottom: guideBounds.bottom + 400 } : null;
    const isGhostDrag = Boolean(dragGhost);
    const ghostNode = dragGhost ? nodeById.get(dragGhost.nodeId) : undefined;
    const GhostIcon = ghostNode?.type === CanvasNodeType.Video ? Video : ghostNode?.type === CanvasNodeType.Audio ? Music2 : ImageIcon;

    if (workspace !== "canvas") {
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
                    onProjects={() => navigate("/canvas")}
                    workspace={workspace}
                    onWorkspaceChange={handleWorkspaceChange}
                />
                <Suspense
                    fallback={
                        <div className="flex min-h-0 flex-1 items-center justify-center pt-14 text-xs" style={{ color: theme.node.muted }}>
                            {t("canvas.workspace.loading")}
                        </div>
                    }
                >
                    {workspace === "image" ? (
                        <ImageStudio
                            board={workspaceBoard}
                            boards={workspaceBoards}
                            nodes={nodes}
                            setNodes={setNodes}
                            onSelectBoard={selectWorkspaceBoard}
                            onBoardChange={handleSmartCanvasChange}
                            onOutput={(target) => void handleSaveBoardAsNode(target)}
                            onBack={() => navigate("/canvas")}
                        />
                    ) : (
                        <AudioStudio
                            project={workspaceAudioProject}
                            projects={workspaceAudioProjects}
                            nodes={nodes}
                            setNodes={setNodes}
                            onSelectProject={selectWorkspaceAudioProject}
                            onOutput={handleMixdownAudioProject}
                            onExportStems={handleExportAudioStems}
                            onRecorded={handleAudioRecorded}
                            onBack={() => navigate("/canvas")}
                        />
                    )}
                </Suspense>
            </main>
        );
    }

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
                onProjects={() => navigate("/canvas")}
                workspace={workspace}
                onWorkspaceChange={handleWorkspaceChange}
            />
            <div className="flex h-full shrink-0 pt-14">
                <CanvasSidePanel />
            </div>
            <section className="relative min-w-0 flex-1 overflow-hidden">
                <InfiniteCanvas
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
                            previewPosition={dragPreview?.get(node.id)}
                            dragDimmed={isGhostDrag && Boolean(dragPreview?.has(node.id))}
                            isSelected={selectedNodeIds.has(node.id)}
                            isRelated={relatedHighlight.nodeIds.has(node.id)}
                            isFocusRelated={activeNodeId === node.id}
                            isConnectionTarget={connectionTargetNodeId === node.id}
                            isConnecting={Boolean(connectingParams)}
                            showPanel={!isNodeResizing && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.ImageGeneration && node.type !== CanvasNodeType.SpeechGeneration && node.type !== CanvasNodeType.MusicGeneration && node.type !== CanvasNodeType.VideoGeneration && node.type !== CanvasNodeType.Prompt && node.type !== CanvasNodeType.MusicPrompt && node.type !== CanvasNodeType.SpeechPrompt && node.type !== CanvasNodeType.VideoPrompt && dialogNodeId === node.id && !selectionBox && !getNodeDefinition(node.type)?.hidePanel}
                            isBoardDropTarget={dropTargetBoardId === node.id}
                            isAssetsDropTarget={dropTargetAssetsNodeId === node.id || dropTargetModifierNodeId === node.id || dropTargetAudioProjectId === node.id}
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
                            onDuplicateBatchImage={duplicateBatchImage}
                            onDownloadBatchImage={downloadBatchImage}
                            onRetryBatchImage={retryBatchImage}
                            onDeleteBatchImage={deleteBatchImage}
                            onRetry={handleNodeRetry}
                            onViewImage={handleNodeViewImage}
                            onInfo={handleNodeInfo}
                        onBoardPreview={(board) => void handleComposeBoard(board)}
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
                    {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                </InfiniteCanvas>

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
                    onDownload={downloadNodeImage}
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
                    onSaveBoardAsNode={(node) => void handleSaveBoardAsNode(node)}
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
                />

                <CanvasRulers viewport={viewport} viewportSize={size} />
                {isMiniMapOpen ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} onViewportChange={setViewport} /> : null}

                {isNodeListOpen ? (
                    <div className="absolute bottom-[84px] left-1/2 z-[60] w-[250px] -translate-x-1/2">
                        <CanvasNodeListPanel nodes={nodes} onToggleFlag={toggleNodeFlag} onBulkRename={renameNodes} />
                    </div>
                ) : null}

                <input ref={imageInputRef} type="file" multiple accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />
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
                    title={t("canvas.projectPage.imageDetails")}
                    open={Boolean(previewContent)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewContent ? (
                        <>
                            <img src={previewContent} alt={previewNode?.title || t("canvas.nodeTypes.image")} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain" }} />
                            <div className="flex items-center gap-2">
                                <Button className="!border-foreground !bg-foreground !text-background hover:!border-foreground hover:!bg-foreground/85 hover:!text-background" icon={<Download className="size-4" />} aria-label={t("common.download")} title={t("common.download")} onClick={() => saveAs(previewContent, `canvas-image-${previewNode?.id}.${imageExtension(previewContent)}`)} />
                                <Button className="!border-foreground !bg-foreground !text-background hover:!border-foreground hover:!bg-foreground/85 hover:!text-background" icon={<ClipboardCopy className="size-4" />} aria-label={t("canvas.imageTools.copyTitle")} title={t("canvas.imageTools.copyTitle")} onClick={() => void copyImage(previewContent)} />
                            </div>
                        </>
                    ) : null}
                </Modal>

                <Modal
                    title={boardPreview?.title || t("canvas.smartCanvas.previewTitle")}
                    open={Boolean(boardPreview)}
                    centered
                    onCancel={() => setBoardPreview(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", maxHeight: "80vh" } }}
                >
                    {boardPreview ? (
                        <>
                            <img src={boardPreview.dataUrl} alt={boardPreview.title} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain" }} />
                            <div className="flex items-center gap-2">
                                <Button className="!border-foreground !bg-foreground !text-background hover:!border-foreground hover:!bg-foreground/85 hover:!text-background" icon={<Download className="size-4" />} aria-label={t("canvas.smartCanvas.download")} title={t("canvas.smartCanvas.download")} onClick={() => saveAs(boardPreview.dataUrl, `smart-canvas-${boardPreview.width}x${boardPreview.height}.png`)} />
                                <Button className="!border-foreground !bg-foreground !text-background hover:!border-foreground hover:!bg-foreground/85 hover:!text-background" icon={<ClipboardCopy className="size-4" />} aria-label={t("canvas.imageTools.copyTitle")} title={t("canvas.imageTools.copyTitle")} onClick={() => void copyImage(boardPreview.dataUrl)} />
                            </div>
                        </>
                    ) : null}
                </Modal>
            </section>
            {dragGhost ? (
                <div
                    className="canvas-drag-ghost pointer-events-none fixed z-[120] flex size-11 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-md border"
                    style={{ left: dragGhost.x, top: dragGhost.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                >
                    <GhostIcon className="size-5 shrink-0" />
                    {ghostNode?.title ? <span className="max-w-[40px] truncate text-xs leading-none">{ghostNode.title}</span> : null}
                    {dragGhost.count > 1 ? (
                        <span className="absolute -right-1.5 -top-1.5 rounded-full border px-1 text-xs leading-4" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.activeText }}>
                            ×{dragGhost.count}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </main>
    );
}