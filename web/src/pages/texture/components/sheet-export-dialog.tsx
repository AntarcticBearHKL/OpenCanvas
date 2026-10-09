import { useEffect, useState, type ReactNode } from "react";
import { Checkbox, Modal, Radio, Select } from "antd";

import type { SheetExportConfig } from "@/lib/texture/export";

/** Sheet export config plus the "also save JSON metadata" toggle. */
export type SheetExportOptions = SheetExportConfig & { saveMetadata: boolean };

const DEFAULT_CONFIG: SheetExportOptions = {
    mode: "animation",
    frameCount: 8,
    cellSize: 128,
    columns: 4,
    padding: 1,
    saveMetadata: false,
};

const FRAME_COUNTS = [4, 8, 16];
const CELL_SIZES = [64, 128, 256, 512];
const COLUMN_COUNTS = [2, 4, 8];
const PADDINGS = [0, 1, 2, 4];

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

export function SheetExportDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (config: SheetExportOptions) => void }) {
    const [config, setConfig] = useState<SheetExportOptions>(DEFAULT_CONFIG);

    useEffect(() => {
        if (open) setConfig(DEFAULT_CONFIG);
    }, [open]);

    const patch = (next: Partial<SheetExportOptions>) => setConfig((previous) => ({ ...previous, ...next }));

    return (
        <Modal open={open} title="Export Sprite Sheet" onCancel={onClose} onOk={() => onConfirm(config)} okText="Export" cancelText="Cancel" centered width={420}>
            <div className="space-y-3 py-2">
                <Field label="Mode">
                    <Radio.Group value={config.mode} onChange={(event) => patch({ mode: event.target.value as SheetExportOptions["mode"] })}>
                        <Radio value="animation">Animation</Radio>
                        <Radio value="colors">Hue</Radio>
                    </Radio.Group>
                </Field>
                <Field label="Frames">
                    <Select className="w-full" value={config.frameCount} options={FRAME_COUNTS.map((value) => ({ value, label: `${value} frames` }))} onChange={(value) => patch({ frameCount: value })} />
                </Field>
                <Field label="Cell Size">
                    <Select className="w-full" value={config.cellSize} options={CELL_SIZES.map((value) => ({ value, label: `${value} × ${value}` }))} onChange={(value) => patch({ cellSize: value })} />
                </Field>
                <Field label="Columns">
                    <Select className="w-full" value={config.columns} options={COLUMN_COUNTS.map((value) => ({ value, label: `${value} columns` }))} onChange={(value) => patch({ columns: value })} />
                </Field>
                <Field label="Padding">
                    <Select className="w-full" value={config.padding} options={PADDINGS.map((value) => ({ value, label: `${value} px` }))} onChange={(value) => patch({ padding: value })} />
                </Field>
                <Checkbox checked={config.saveMetadata} onChange={(event) => patch({ saveMetadata: event.target.checked })}>
                    <span className="text-xs text-muted-foreground">Save JSON metadata</span>
                </Checkbox>
            </div>
        </Modal>
    );
}
