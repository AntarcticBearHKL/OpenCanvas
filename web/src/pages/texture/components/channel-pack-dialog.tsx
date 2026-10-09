import { useEffect, useState, type ReactNode } from "react";
import { Modal, Select } from "antd";

import { CHANNEL_PRESETS, CHANNEL_SOURCES, type ChannelConfig, type ChannelSource } from "@/lib/texture/types";

const SOURCE_LABELS: Record<ChannelSource, string> = {
    baseR: "Base R",
    baseG: "Base G",
    baseB: "Base B",
    baseA: "Base A",
    baseLuma: "Base Luma",
    normalX: "Normal X",
    normalY: "Normal Y",
    normalZ: "Normal Z",
    black: "Black",
    white: "White",
};

const PRESET_LABELS: Record<string, string> = {
    base: "Base",
    normal_xy: "Normal XY",
    normal_xyz: "Normal XYZ",
    luma_alpha: "Luma + Alpha",
};

const SOURCE_OPTIONS = CHANNEL_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] }));
const PRESET_OPTIONS = Object.keys(CHANNEL_PRESETS).map((key) => ({ value: key, label: PRESET_LABELS[key] ?? key }));

const DEFAULT_CONFIG: ChannelConfig = { ...CHANNEL_PRESETS.base };

const CHANNELS: Array<{ key: keyof ChannelConfig; label: string }> = [
    { key: "r", label: "R Channel" },
    { key: "g", label: "G Channel" },
    { key: "b", label: "B Channel" },
    { key: "a", label: "A Channel" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

export function ChannelPackDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (config: ChannelConfig) => void }) {
    const [config, setConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);

    useEffect(() => {
        if (open) setConfig(DEFAULT_CONFIG);
    }, [open]);

    const presetKey = Object.keys(CHANNEL_PRESETS).find((key) => {
        const preset = CHANNEL_PRESETS[key];
        return preset.r === config.r && preset.g === config.g && preset.b === config.b && preset.a === config.a;
    });

    return (
        <Modal open={open} title="Channel Pack" onCancel={onClose} onOk={() => onConfirm(config)} okText="Export" cancelText="Cancel" centered width={420}>
            <div className="space-y-3 py-2">
                <Field label="Preset">
                    <Select className="w-full" value={presetKey} placeholder="Custom" options={PRESET_OPTIONS} onChange={(value) => setConfig({ ...CHANNEL_PRESETS[value] })} />
                </Field>
                {CHANNELS.map(({ key, label }) => (
                    <Field key={key} label={label}>
                        <Select
                            className="w-full"
                            value={config[key]}
                            options={SOURCE_OPTIONS}
                            onChange={(value: ChannelSource) => setConfig((previous) => ({ ...previous, [key]: value }))}
                        />
                    </Field>
                ))}
                <p className="text-xs text-muted-foreground">Normal channels are generated from the base image in real time.</p>
            </div>
        </Modal>
    );
}
