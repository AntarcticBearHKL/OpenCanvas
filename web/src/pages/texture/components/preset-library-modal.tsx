import { useEffect, useRef, useState } from "react";
import { Button, Input, message, Modal } from "antd";
import { Download, Trash2, Upload } from "lucide-react";
import { nanoid } from "nanoid";

import type { EditorState } from "@/lib/texture/types";

const STORAGE_KEY = "oc_texture_presets";
const MAX_PRESETS = 40;

interface TexturePreset {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    state: EditorState;
}

function isPreset(value: unknown): value is TexturePreset {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.id === "string" &&
        typeof record.name === "string" &&
        typeof record.createdAt === "number" &&
        typeof record.updatedAt === "number" &&
        typeof record.state === "object" &&
        record.state !== null &&
        Array.isArray((record.state as { layers?: unknown }).layers)
    );
}

function readPresets(): TexturePreset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isPreset).slice(0, MAX_PRESETS);
    } catch {
        return [];
    }
}

function writePresets(list: TexturePreset[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        // Ignore storage failures (private mode / quota).
    }
}

function downloadPreset(state: EditorState): void {
    const payload = { version: 1, ...state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `texture_preset_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

export function PresetLibraryModal({
    open,
    onClose,
    currentState,
    onApply,
}: {
    open: boolean;
    onClose: () => void;
    currentState: EditorState;
    onApply: (state: EditorState) => void;
}) {
    const [presets, setPresets] = useState<TexturePreset[]>(readPresets);
    const [name, setName] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setPresets(readPresets());
        setName("");
    }, [open]);

    const persist = (list: TexturePreset[]) => {
        writePresets(list);
        setPresets(list);
    };

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning("Enter a preset name");
            return;
        }
        const now = Date.now();
        const lower = trimmed.toLowerCase();
        const existing = presets.find((item) => item.name.toLowerCase() === lower);
        const saved: TexturePreset = existing
            ? { id: existing.id, name: trimmed, createdAt: existing.createdAt, updatedAt: now, state: structuredClone(currentState) }
            : { id: nanoid(), name: trimmed, createdAt: now, updatedAt: now, state: structuredClone(currentState) };
        const next = [saved, ...presets.filter((item) => item.id !== saved.id)].slice(0, MAX_PRESETS);
        persist(next);
        setName("");
        message.success(existing ? "Preset updated" : "Preset saved");
    };

    const handleDelete = (id: string) => {
        persist(presets.filter((item) => item.id !== id));
        message.success("Preset deleted");
    };

    const handleLoad = (preset: TexturePreset) => {
        onApply(preset.state);
        message.success("Preset loaded");
        onClose();
    };

    const handleImport = async (file: File) => {
        try {
            const parsed: unknown = JSON.parse(await file.text());
            if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { layers?: unknown }).layers)) {
                onApply(parsed as EditorState);
                message.success("Preset imported");
                onClose();
            } else {
                message.error("Import failed: not a valid preset file");
            }
        } catch {
            message.error("Import failed: could not parse file");
        }
        if (fileRef.current) fileRef.current.value = "";
    };

    return (
        <Modal title="Preset Library" width={560} footer={null} open={open} onCancel={onClose}>
            <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-2">
                    <Input placeholder="Preset name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} onPressEnter={handleSave} />
                    <Button type="primary" onClick={handleSave}>
                        Save Current
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>
                        Import JSON
                    </Button>
                    <Button
                        icon={<Download className="size-3.5" />}
                        onClick={() => {
                            downloadPreset(currentState);
                            message.success("Preset exported");
                        }}
                    >
                        Export JSON
                    </Button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void handleImport(file);
                        }}
                    />
                </div>

                <div className="thin-scrollbar max-h-[50vh] overflow-y-auto">
                    {presets.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">No presets yet. Save one to get started.</div>
                    ) : (
                        <ul className="space-y-1">
                            {presets.map((preset) => (
                                <li key={preset.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{preset.name}</span>
                                    <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(preset.updatedAt).toLocaleDateString()}</span>
                                    <Button size="small" onClick={() => handleLoad(preset)}>
                                        Load
                                    </Button>
                                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => handleDelete(preset.id)}>
                                        Delete
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </Modal>
    );
}
