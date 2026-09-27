import { useEffect, useState } from "react";
import { Button, Input, Modal, Segmented, Select } from "antd";
import { Download, LayoutGrid } from "lucide-react";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export type StudioOutputMode = "download" | "canvas";

export interface StudioOutputModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    resourceType: "image" | "audio" | "text";
    defaultFileName?: string;
    defaultNodeTitle?: string;
    onDownload: (fileName: string) => Promise<void> | void;
    onOutputToCanvas: (targetCanvasId: string, nodeTitle: string) => Promise<void> | void;
}

export function StudioOutputModal({
    open,
    onClose,
    title,
    resourceType,
    defaultFileName = "",
    defaultNodeTitle = "",
    onDownload,
    onOutputToCanvas,
}: StudioOutputModalProps) {
    const projects = useCanvasStore((state) => state.projects);

    const [mode, setMode] = useState<StudioOutputMode>("canvas");
    const [fileName, setFileName] = useState(defaultFileName);
    const [nodeTitle, setNodeTitle] = useState(defaultNodeTitle);
    const [targetCanvasId, setTargetCanvasId] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setFileName(defaultFileName || (resourceType === "image" ? "artwork.png" : resourceType === "audio" ? "mixdown.wav" : "document.txt"));
            setNodeTitle(defaultNodeTitle || (resourceType === "image" ? "Image Artwork" : resourceType === "audio" ? "Audio Mixdown" : "Text Document"));
            if (projects.length > 0 && !targetCanvasId) {
                setTargetCanvasId(projects[0].id);
            }
        }
    }, [open, defaultFileName, defaultNodeTitle, projects, resourceType, targetCanvasId]);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            if (mode === "download") {
                await onDownload(fileName.trim() || defaultFileName);
                onClose();
            } else {
                if (!targetCanvasId && projects.length > 0) {
                    await onOutputToCanvas(projects[0].id, nodeTitle.trim() || defaultNodeTitle);
                } else if (targetCanvasId) {
                    await onOutputToCanvas(targetCanvasId, nodeTitle.trim() || defaultNodeTitle);
                }
                onClose();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const canvasOptions = projects.map((p) => ({
        label: p.title || "Untitled Canvas",
        value: p.id,
    }));

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={title || (resourceType === "image" ? "Export Image Artwork" : resourceType === "audio" ? "Export Audio Mixdown" : "Export Artwork")}
            footer={null}
            destroyOnClose
            centered
            width={460}
        >
            <div className="space-y-4 py-2">
                <div className="flex justify-center">
                    <Segmented<StudioOutputMode>
                        value={mode}
                        onChange={setMode}
                        options={[
                            {
                                label: (
                                    <div className="flex items-center gap-1.5 px-3 py-1">
                                        <LayoutGrid className="size-4" />
                                        <span>Export to Canvas</span>
                                    </div>
                                ),
                                value: "canvas",
                            },
                            {
                                label: (
                                    <div className="flex items-center gap-1.5 px-3 py-1">
                                        <Download className="size-4" />
                                        <span>Download to Device</span>
                                    </div>
                                ),
                                value: "download",
                            },
                        ]}
                    />
                </div>

                {mode === "canvas" ? (
                    <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Target Canvas</label>
                            <Select
                                className="w-full"
                                value={targetCanvasId || (projects[0]?.id ?? "")}
                                onChange={setTargetCanvasId}
                                options={canvasOptions}
                                placeholder="Select a target canvas"
                                notFoundContent="No canvases available. Please create a canvas first."
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Node Title</label>
                            <Input
                                value={nodeTitle}
                                onChange={(e) => setNodeTitle(e.target.value)}
                                placeholder="Enter title for the canvas node"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            A new {resourceType === "image" ? "image" : resourceType === "audio" ? "audio" : "text"} node will be placed in the selected canvas.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 pt-2">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">File Name</label>
                            <Input
                                value={fileName}
                                onChange={(e) => setFileName(e.target.value)}
                                placeholder="Enter file name to download"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            The file will be rendered and downloaded directly to your local machine.
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                    <Button onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        onClick={handleSubmit}
                        loading={submitting}
                        disabled={mode === "canvas" && projects.length === 0}
                    >
                        {mode === "canvas" ? "Export to Canvas" : "Download Now"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
