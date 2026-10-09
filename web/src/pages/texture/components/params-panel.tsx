import { type ReactNode } from "react";
import { Checkbox, ColorPicker, Input, Select, Slider } from "antd";

import { PARAM_SPECS, TYPE_ORDER, defaultParams } from "@/lib/texture/registry";
import { BLEND_MODES, type BlendMode, type LayerState, type RGB } from "@/lib/texture/types";

const BLEND_LABELS: Record<BlendMode, string> = {
    normal: "Normal",
    add: "Add",
    multiply: "Multiply",
    screen: "Screen",
    mask: "Mask",
};

function rgbToHex(rgb: RGB): string {
    return `#${rgb.map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): RGB {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!match) return [0, 0, 0];
    const value = parseInt(match[1], 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function formatValue(value: number, step: number): string {
    if (step >= 1) return value.toFixed(0);
    if (step >= 0.01) return value.toFixed(2);
    return value.toFixed(3);
}

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={label}>
                {label}
            </span>
            <Slider className="min-w-0 flex-1" min={min} max={max} step={step} value={value} onChange={onChange} tooltip={{ open: false }} />
            <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{formatValue(value, step)}</span>
        </div>
    );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <div className="space-y-2 border-b border-border px-3 py-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{title}</span>
                {action}
            </div>
            {children}
        </div>
    );
}

export function ParamsPanel({ layer, onChange }: { layer: LayerState; onChange: (patch: Partial<LayerState>) => void }) {
    const specs = PARAM_SPECS[layer.type] ?? [];

    const setParam = (index: number, value: number) => {
        const next = layer.typeParams.slice();
        next[index] = value;
        onChange({ typeParams: next });
    };

    return (
        <div>
            <Section title="Layer">
                <Input size="small" value={layer.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="Layer name" />
                <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Blend Mode</span>
                    <Select
                        className="min-w-0 flex-1"
                        size="small"
                        value={layer.blendMode}
                        options={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABELS[mode] }))}
                        onChange={(value: BlendMode) => onChange({ blendMode: value })}
                    />
                </div>
                <SliderRow label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={(value) => onChange({ opacity: value })} />
                <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Solid Fill</span>
                    <Checkbox checked={layer.solidColorEnabled} onChange={(event) => onChange({ solidColorEnabled: event.target.checked })} />
                    <ColorPicker
                        className="shrink-0"
                        value={rgbToHex(layer.solidColor)}
                        disabledAlpha
                        onChange={(color) => onChange({ solidColor: hexToRgb(color.toHexString()) })}
                    />
                </div>
            </Section>

            <Section title="Type">
                <Select
                    className="w-full"
                    size="small"
                    showSearch
                    value={layer.type}
                    options={TYPE_ORDER.map((type) => ({ value: type, label: type }))}
                    onChange={(value: string) => onChange({ type: value, typeParams: defaultParams(value) })}
                />
                <div className="flex items-center gap-4">
                    <Checkbox checked={layer.polarConversion} onChange={(event) => onChange({ polarConversion: event.target.checked })}>
                        <span className="text-xs text-muted-foreground">Polar</span>
                    </Checkbox>
                    <Checkbox checked={layer.invertEnable} onChange={(event) => onChange({ invertEnable: event.target.checked })}>
                        <span className="text-xs text-muted-foreground">Invert</span>
                    </Checkbox>
                </div>
            </Section>

            <Section
                title="Transform"
                action={
                    <button
                        type="button"
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-hover hover:text-foreground"
                        onClick={() => onChange({ offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, scrollX: 0, scrollY: 0 })}
                    >
                        Reset Transform
                    </button>
                }
            >
                <SliderRow label="Offset X" value={layer.offsetX} min={-5} max={5} step={0.01} onChange={(value) => onChange({ offsetX: value })} />
                <SliderRow label="Offset Y" value={layer.offsetY} min={-5} max={5} step={0.01} onChange={(value) => onChange({ offsetY: value })} />
                <SliderRow label="Scale X" value={layer.scaleX} min={0.01} max={10} step={0.01} onChange={(value) => onChange({ scaleX: value })} />
                <SliderRow label="Scale Y" value={layer.scaleY} min={0.01} max={10} step={0.01} onChange={(value) => onChange({ scaleY: value })} />
                <SliderRow label="Rotation" value={layer.rotation} min={-180} max={180} step={1} onChange={(value) => onChange({ rotation: value })} />
                <SliderRow label="Scroll X" value={layer.scrollX} min={-5} max={5} step={0.01} onChange={(value) => onChange({ scrollX: value })} />
                <SliderRow label="Scroll Y" value={layer.scrollY} min={-5} max={5} step={0.01} onChange={(value) => onChange({ scrollY: value })} />
            </Section>

            <Section
                title="Parameters"
                action={
                    <button
                        type="button"
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-hover hover:text-foreground"
                        onClick={() => onChange({ typeParams: defaultParams(layer.type) })}
                    >
                        Reset Parameters
                    </button>
                }
            >
                {specs.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No adjustable parameters for this type</p>
                ) : (
                    specs.map((spec) => (
                        <SliderRow
                            key={spec.key}
                            label={spec.en}
                            value={layer.typeParams[spec.index] ?? spec.default}
                            min={spec.min}
                            max={spec.max}
                            step={spec.step}
                            onChange={(value) => setParam(spec.index, value)}
                        />
                    ))
                )}
            </Section>
        </div>
    );
}
