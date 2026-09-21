import { useRef, useState } from "react";
import { App, Modal } from "antd";
import { FileUp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasExportFile } from "@/types/canvas-export";

const SUPPORTED_VERSION = 3;

class CanvasImportError extends Error {
    constructor(
        public readonly key: string,
        public readonly values?: Record<string, unknown>,
    ) {
        super(key);
    }
}

export function CanvasImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const theme = useCanvasTheme();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [importing, setImporting] = useState(false);
    const importProject = useCanvasStore((state) => state.importProject);
    const createGroup = useCanvasStore((state) => state.createGroup);

    const load = async (file?: File | null) => {
        if (!file || importing) return;
        if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") {
            message.error(t("canvas.importDialog.invalidType"));
            return;
        }
        setImporting(true);
        try {
            let zip: Map<string, Blob>;
            try {
                zip = await readZip(file);
            } catch {
                throw new CanvasImportError("corrupt");
            }
            const manifest = zip.get("projects.json");
            if (!manifest) throw new CanvasImportError("missingManifest");
            let data: CanvasExportFile;
            try {
                data = JSON.parse(await manifest.text()) as CanvasExportFile;
            } catch {
                throw new CanvasImportError("corrupt");
            }
            if (data.app !== "infinite-canvas" || !Array.isArray(data.projects) || !data.projects.length) throw new CanvasImportError("corrupt");
            if (data.version !== SUPPORTED_VERSION) throw new CanvasImportError("unsupportedVersion");
            for (const project of data.projects) {
                for (const item of project.files) {
                    if (!zip.get(item.path)) throw new CanvasImportError("missingAsset", { name: item.path });
                }
            }

            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );

            const resolveGroupId = (name?: string) => {
                if (!name) return undefined;
                const existing = useCanvasStore.getState().groups.find((group) => group.name === name);
                return existing?.id ?? createGroup(name);
            };
            let firstId = "";
            data.projects.forEach((item) => {
                const id = importProject({ ...item.project, groupId: resolveGroupId(item.groupName) ?? item.project.groupId });
                if (!firstId) firstId = id;
            });
            message.success(t("canvas.imported", { count: data.projects.length }));
            onClose();
            if (firstId) navigate(`/canvas/${firstId}`);
        } catch (error) {
            message.error(error instanceof CanvasImportError ? t(`canvas.importDialog.${error.key}`, error.values) : t("canvas.importFailed"));
        } finally {
            setImporting(false);
            setDragging(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const cancel = () => {
        if (importing) return;
        setDragging(false);
        if (inputRef.current) inputRef.current.value = "";
        onClose();
    };

    return (
        <Modal title={t("canvas.importDialog.title")} open={open} onCancel={cancel} footer={null} centered>
            <button
                type="button"
                className="flex h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm transition"
                style={{ borderColor: dragging ? theme.node.activeStroke : theme.toolbar.border, background: dragging ? theme.toolbar.itemHover : "transparent", color: theme.node.text }}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void load(event.dataTransfer.files?.[0]);
                }}
            >
                {importing ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
                <span>{importing ? t("canvas.importDialog.importing") : t("canvas.importDialog.drop")}</span>
            </button>
            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void load(event.target.files?.[0])} />
        </Modal>
    );
}
