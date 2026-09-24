import { useEffect, useState } from "react";
import { Modal } from "antd";

import { classifyAssetFolderFile } from "@/lib/canvas/asset-folder";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

export function AssetFilePreview({ file, open, onClose }: { file: File | null; open: boolean; onClose: () => void }) {
    const theme = useCanvasTheme();
    const [url, setUrl] = useState<string | null>(null);
    const [text, setText] = useState<string | null>(null);
    const kind = file ? classifyAssetFolderFile(file) : null;

    useEffect(() => {
        setUrl(null);
        setText(null);
        if (!file) return;
        const fileKind = classifyAssetFolderFile(file);
        if (fileKind === "text") {
            let active = true;
            void file
                .text()
                .then((content) => {
                    if (active) setText(content);
                })
                .catch(() => undefined);
            return () => {
                active = false;
            };
        }
        if (!fileKind) return;
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [file]);

    return (
        <Modal
            title={file?.name}
            open={open}
            centered
            onCancel={onClose}
            footer={null}
            width="auto"
            classNames={{ container: "glass-raised" }}
            styles={{ container: { background: "var(--glass-strong)" }, body: { padding: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", maxHeight: "80vh" } }}
        >
            {kind === "image" && url ? <img src={url} alt={file?.name} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain" }} /> : null}
            {kind === "video" && url ? <video src={url} controls style={{ maxWidth: "100%", maxHeight: "72vh" }} /> : null}
            {kind === "audio" && url ? <audio src={url} controls /> : null}
            {kind === "text" && text !== null ? (
                <pre className="thin-scrollbar" style={{ maxHeight: "72vh", overflow: "auto", whiteSpace: "pre-wrap", color: theme.node.text }}>
                    {text}
                </pre>
            ) : null}
        </Modal>
    );
}
