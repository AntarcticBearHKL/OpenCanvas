import { type ReactNode } from "react";
import { Checkbox, ColorPicker, Slider } from "antd";

import { type EditorState, type PostEffects, type RGB } from "@/lib/texture/types";

export function rgbToHex(rgb: RGB): string {
    return `#${rgb.map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): RGB {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!match) return [0, 0, 0];
    const value = parseInt(match[1], 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function formatValue(value: number, step: number): string {
    if (step >= 1) return value.toFixed(0);
    if (step >= 0.01) return value.toFixed(2);
    return value.toFixed(3);
}

export function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
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

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
            <span className="text-xs text-muted-foreground">{label}</span>
        </Checkbox>
    );
}

export function ColorRow({ label, value, onChange }: { label: string; value: RGB; onChange: (value: RGB) => void }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
            <ColorPicker className="shrink-0" value={rgbToHex(value)} disabledAlpha onChange={(color) => onChange(hexToRgb(color.toHexString()))} />
        </div>
    );
}

function EffectBlock({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (enabled: boolean) => void; children?: ReactNode }) {
    return (
        <div className="space-y-1.5 rounded-md border border-border/60 px-2 py-2">
            <Checkbox checked={enabled} onChange={(event) => onToggle(event.target.checked)}>
                <span className="text-xs font-medium text-foreground">{title}</span>
            </Checkbox>
            {children}
        </div>
    );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="space-y-2 border-b border-border px-3 py-3">
            <span className="text-xs font-semibold text-foreground">{title}</span>
            {children}
        </div>
    );
}

export function EffectsPanel({ state, onPostChange }: { state: EditorState; onPostChange: (patch: Partial<PostEffects>) => void }) {
    const post = state.postEffects;

    return (
        <div>
            <Section title="Post Effects">
                <EffectBlock title="Blur" enabled={post.blurEnabled} onToggle={(value) => onPostChange({ blurEnabled: value })}>
                    <SliderRow label="Strength" value={post.blurStrength} min={0} max={200} step={1} onChange={(value) => onPostChange({ blurStrength: value })} />
                </EffectBlock>

                <EffectBlock title="Bloom" enabled={post.bloomEnabled} onToggle={(value) => onPostChange({ bloomEnabled: value })}>
                    <SliderRow label="Strength" value={post.bloomStrength} min={0} max={5} step={0.01} onChange={(value) => onPostChange({ bloomStrength: value })} />
                </EffectBlock>

                <EffectBlock title="Sharpen" enabled={post.sharpenEnabled} onToggle={(value) => onPostChange({ sharpenEnabled: value })}>
                    <SliderRow label="Strength" value={post.sharpenStrength} min={0} max={10} step={0.1} onChange={(value) => onPostChange({ sharpenStrength: value })} />
                </EffectBlock>

                <EffectBlock title="Pixelation" enabled={post.pixelationEnabled} onToggle={(value) => onPostChange({ pixelationEnabled: value })}>
                    <SliderRow label="Pixel Size" value={post.pixelSize} min={1} max={200} step={1} onChange={(value) => onPostChange({ pixelSize: value })} />
                </EffectBlock>

                <EffectBlock title="Chromatic Aberration" enabled={post.chromaticAberrationEnabled} onToggle={(value) => onPostChange({ chromaticAberrationEnabled: value })}>
                    <SliderRow label="Strength" value={post.chromaticAberration} min={0} max={0.1} step={0.001} onChange={(value) => onPostChange({ chromaticAberration: value })} />
                </EffectBlock>

                <EffectBlock title="Vignette" enabled={post.vignetteEnabled} onToggle={(value) => onPostChange({ vignetteEnabled: value })}>
                    <SliderRow label="Strength" value={post.vignetteStrength} min={0} max={2} step={0.01} onChange={(value) => onPostChange({ vignetteStrength: value })} />
                    <SliderRow label="Range" value={post.vignetteSize} min={0} max={2} step={0.01} onChange={(value) => onPostChange({ vignetteSize: value })} />
                    <ColorRow label="Color" value={post.vignetteColor} onChange={(value) => onPostChange({ vignetteColor: value })} />
                </EffectBlock>

                <EffectBlock title="Scanline" enabled={post.scanlineEnabled} onToggle={(value) => onPostChange({ scanlineEnabled: value })}>
                    <SliderRow label="Density" value={post.scanlineDensity} min={10} max={500} step={1} onChange={(value) => onPostChange({ scanlineDensity: value })} />
                    <SliderRow label="Speed" value={post.scanlineSpeed} min={0} max={10} step={0.1} onChange={(value) => onPostChange({ scanlineSpeed: value })} />
                    <SliderRow label="Strength" value={post.scanlineStrength} min={0} max={1} step={0.01} onChange={(value) => onPostChange({ scanlineStrength: value })} />
                    <ColorRow label="Color" value={post.scanlineColor} onChange={(value) => onPostChange({ scanlineColor: value })} />
                </EffectBlock>

                <EffectBlock title="Kaleidoscope" enabled={post.kaleidoscopeEnabled} onToggle={(value) => onPostChange({ kaleidoscopeEnabled: value })}>
                    <SliderRow label="Segments" value={post.kaleidoSegments} min={2} max={24} step={1} onChange={(value) => onPostChange({ kaleidoSegments: value })} />
                    <SliderRow label="Rotation" value={post.kaleidoRotation} min={-3.14} max={3.14} step={0.01} onChange={(value) => onPostChange({ kaleidoRotation: value })} />
                </EffectBlock>

                <EffectBlock title="Mirror Tile" enabled={post.mirrorTileEnabled} onToggle={(value) => onPostChange({ mirrorTileEnabled: value })}>
                    <CheckRow label="Mirror X" checked={post.mirrorTileX} onChange={(value) => onPostChange({ mirrorTileX: value })} />
                    <CheckRow label="Mirror Y" checked={post.mirrorTileY} onChange={(value) => onPostChange({ mirrorTileY: value })} />
                </EffectBlock>

                <EffectBlock title="Swirl" enabled={post.swirlEnabled} onToggle={(value) => onPostChange({ swirlEnabled: value })}>
                    <SliderRow label="Strength" value={post.swirlStrength} min={-10} max={10} step={0.1} onChange={(value) => onPostChange({ swirlStrength: value })} />
                    <SliderRow label="Radius" value={post.swirlRadius} min={0.1} max={2} step={0.01} onChange={(value) => onPostChange({ swirlRadius: value })} />
                </EffectBlock>

                <EffectBlock title="Edge Detection" enabled={post.edgeDetectionEnabled} onToggle={(value) => onPostChange({ edgeDetectionEnabled: value })}>
                    <SliderRow label="Line Width" value={post.edgeThickness} min={0.1} max={5} step={0.1} onChange={(value) => onPostChange({ edgeThickness: value })} />
                    <ColorRow label="Line Color" value={post.edgeColor} onChange={(value) => onPostChange({ edgeColor: value })} />
                </EffectBlock>

                <EffectBlock title="Toon" enabled={post.toonEnabled} onToggle={(value) => onPostChange({ toonEnabled: value })}>
                    <SliderRow label="Shadow Levels" value={post.toonDark} min={1} max={16} step={1} onChange={(value) => onPostChange({ toonDark: value })} />
                    <SliderRow label="Highlight Levels" value={post.toonLight} min={1} max={16} step={1} onChange={(value) => onPostChange({ toonLight: value })} />
                </EffectBlock>

                <EffectBlock title="Radial Mask" enabled={post.vignetteMaskEnabled} onToggle={(value) => onPostChange({ vignetteMaskEnabled: value })} />

                <EffectBlock title="Color Correction" enabled={post.colorEnabled} onToggle={(value) => onPostChange({ colorEnabled: value })}>
                    <ColorRow label="Shadows" value={post.colorShadow} onChange={(value) => onPostChange({ colorShadow: value })} />
                    <ColorRow label="Midtones" value={post.colorMidtone} onChange={(value) => onPostChange({ colorMidtone: value })} />
                    <ColorRow label="Highlights" value={post.colorHighlight} onChange={(value) => onPostChange({ colorHighlight: value })} />
                </EffectBlock>
            </Section>
        </div>
    );
}
