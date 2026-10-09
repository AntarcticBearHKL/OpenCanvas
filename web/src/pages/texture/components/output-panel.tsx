import { Select } from "antd";

import { RESOLUTIONS, type EditorState, type Resolution } from "@/lib/texture/types";

import { CheckRow, Section, SliderRow } from "./effects-panel";

export function OutputPanel({ state, onChange }: { state: EditorState; onChange: (patch: Partial<EditorState>) => void }) {
    return (
        <div>
            <Section title="Output">
                <div className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">Resolution</span>
                    <Select
                        className="min-w-0 flex-1"
                        size="small"
                        value={state.resolution}
                        options={RESOLUTIONS.map((resolution) => ({ value: resolution, label: `${resolution} × ${resolution}` }))}
                        onChange={(value: number) => onChange({ resolution: value as Resolution })}
                    />
                </div>
            </Section>

            <Section title="Animation">
                <CheckRow label="Enable Animation" checked={state.animate} onChange={(value) => onChange({ animate: value })} />
                <SliderRow label="Time" value={state.time} min={0} max={100} step={0.1} onChange={(value) => onChange({ time: value })} />
                <SliderRow label="Speed" value={state.animSpeed} min={0} max={5} step={0.1} onChange={(value) => onChange({ animSpeed: value })} />
                <SliderRow label="GIF FPS" value={state.gifFps} min={1} max={60} step={1} onChange={(value) => onChange({ gifFps: value })} />
                <SliderRow label="GIF Duration" value={state.gifDuration} min={0.5} max={10} step={0.1} onChange={(value) => onChange({ gifDuration: value })} />
                <CheckRow label="Seamless Loop" checked={state.gifSeamless} onChange={(value) => onChange({ gifSeamless: value })} />
            </Section>
        </div>
    );
}
