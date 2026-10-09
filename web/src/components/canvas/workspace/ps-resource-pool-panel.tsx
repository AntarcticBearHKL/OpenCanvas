import { useEffect, useMemo, useState } from "react";
import { Empty, Input } from "antd";
import { FolderKanban, Image as ImageIcon, Plus, Search } from "lucide-react";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasNodeData } from "@/types/canvas";

export const IMAGE_NODE_DRAG_MIME = "application/x-open-canvas-image-node";

function useResolvedImageNodeUrls(imageNodes: CanvasNodeData[]) {
    const [urls, setUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        let active = true;
        void Promise.all(imageNodes.map(async (node) => [node.id, await resolveImageUrl(node.metadata?.storageKey, node.metadata?.content || "")] as const)).then((entries) => {
            if (active) setUrls(Object.fromEntries(entries));
        });
        return () => {
            active = false;
        };
    }, [imageNodes]);

    return urls;
}

type PsResourcePoolPanelProps = {
    imageNodes: CanvasNodeData[];
    onAddImageLayer: (node: CanvasNodeData) => void;
};

export default function PsResourcePoolPanel({ imageNodes, onAddImageLayer }: PsResourcePoolPanelProps) {
    const theme = useCanvasTheme();
    const [search, setSearch] = useState("");

    const urls = useResolvedImageNodeUrls(imageNodes);

    const filtered = useMemo(() => {
        if (!search.trim()) return imageNodes;
        const q = search.toLowerCase();
        return imageNodes.filter((node) => {
            const canvasName = (node.metadata?.canvasTitle as string) || "";
            const title = node.title || "";
            return canvasName.toLowerCase().includes(q) || title.toLowerCase().includes(q);
        });
    }, [imageNodes, search]);

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden glass-card">
            <div className="p-2 border-b" style={{ borderColor: theme.toolbar.border }}>
                <Input
                    size="small"
                    prefix={<Search className="size-3.5 text-muted-foreground mr-1" />}
                    placeholder="Search canvas or image name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                />
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5 space-y-1">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No canvas images available" />
                        <span className="mt-1">Images created or generated in any canvas will appear here automatically.</span>
                    </div>
                ) : (
                    filtered.map((node) => {
                        const canvasTitle = (node.metadata?.canvasTitle as string) || "Untitled Canvas";
                        const imageUrl = urls[node.id] || node.metadata?.content || node.metadata?.thumbnail;

                        return (
                            <div
                                key={node.id}
                                draggable
                                onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "copy";
                                    event.dataTransfer.setData(IMAGE_NODE_DRAG_MIME, node.id);
                                    event.dataTransfer.setData("text/plain", node.id);
                                }}
                                className="group flex items-center gap-2 rounded-lg p-1.5 cursor-grab border transition hover:bg-hover"
                                style={{ borderColor: theme.toolbar.border }}
                                title="Drag to canvas or click + to add"
                            >
                                <div
                                    className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-black/10 dark:bg-white/10"
                                >
                                    {imageUrl ? (
                                        <img src={imageUrl} alt="" className="size-full object-cover" />
                                    ) : (
                                        <ImageIcon className="size-5" style={{ color: theme.node.muted }} />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium" style={{ color: theme.node.text }}>
                                        {node.title || "Untitled Image"}
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px]" style={{ color: theme.node.muted }}>
                                        <FolderKanban className="size-3 shrink-0" />
                                        <span className="truncate">{canvasTitle}</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onAddImageLayer(node)}
                                    className="opacity-0 group-hover:opacity-100 flex size-6 shrink-0 items-center justify-center rounded transition hover:bg-black/10 dark:hover:bg-white/10"
                                    style={{ color: theme.node.text }}
                                    title="Add as layer"
                                >
                                    <Plus className="size-4" />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
