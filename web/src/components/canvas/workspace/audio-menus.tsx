import type { ReactElement, ReactNode } from "react";
import { Button, Dropdown, type MenuProps } from "antd";
import { Check, ChevronDown } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { AUDIO_FADE_SHAPE_LABEL_KEYS, AUDIO_FADE_SHAPE_OPTIONS, AUDIO_SNAP_LABEL_KEYS, AUDIO_SNAP_OPTIONS } from "@/components/canvas/workspace/audio-panels";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { CanvasAudioAutomationCurve, CanvasAudioClip, CanvasAudioFadeShape, CanvasAudioSnap } from "@/types/canvas";

type AudioViewFlags = { grid: boolean; cycle: boolean; metronome: boolean };
export type AudioAutomationFlags = { visible: boolean; hasLanes: boolean; canAddGain: boolean; canAddPan: boolean; canAddSend: boolean };
export type AudioEditCommand = "selectAll" | "deselect" | "copy" | "cut" | "paste" | "duplicate" | "split" | "delete" | "setCycle" | "clearCycle";
export type AudioTrackCommand = "add" | "addGroup" | "addReturn" | "addInstrument" | "addMidi" | "duplicate" | "remove" | "exportStems";
export type AudioClipCommand = "split" | "duplicate" | "delete" | "fadeIn" | "fadeOut" | "crossfade" | "loop" | "reverse" | "clipMute" | "lock" | "rename" | "properties";
export type AudioLaneCommand = "addClip" | "rename" | "showAutomation" | "duplicate" | "remove";
export type AudioMidiRegionCommand = "open" | "duplicate" | "delete";
export type AudioViewCommand = "grid" | "snap" | "cycle" | "metronome" | "zoomIn" | "zoomOut" | "zoomFit";
export type AudioAutomationCommand = "show" | "addGain" | "addPan" | "addSend" | "clearTrack";
export type AudioAutomationPointCommand = "linear" | "hold" | "sCurve" | "delete";
export type AudioOptionCommand = "grid" | "loop" | "reverse" | "autoCrossfade" | `snap:${CanvasAudioSnap}` | `fadeShape:${CanvasAudioFadeShape}`;
export type AudioMenuGroupKey = "edit" | "track" | "clip" | "view" | "automation";
type AudioMenuItems = NonNullable<MenuProps["items"]>;

/** The document state every menu row is enabled or checked by. */
export type AudioMenuFlags = {
    clip: CanvasAudioClip | null;
    snap: CanvasAudioSnap;
    view: AudioViewFlags;
    automation: AudioAutomationFlags;
    hasClips: boolean;
    hasSelection: boolean;
    hasRange: boolean;
    hasCycleRange: boolean;
    canPaste: boolean;
    canRemoveTrack: boolean;
    exporting: boolean;
};

/** The contextual options row, as menu items so the narrow layout can host it in one Dropdown. */
export type AudioOptionFlags = { grid: boolean; snap: CanvasAudioSnap; fadeShape: CanvasAudioFadeShape; hasClip: boolean; loop: boolean; reversed: boolean; autoCrossfade: boolean };

type AudioMenusProps = AudioMenuFlags & {
    onEdit: (command: AudioEditCommand) => void;
    onTrack: (command: AudioTrackCommand) => void;
    onClip: (command: AudioClipCommand) => void;
    onView: (command: AudioViewCommand) => void;
    onAutomation: (command: AudioAutomationCommand) => void;
};

export const AUDIO_MENU_BUTTON_CLASS = "flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10";

const item = (label: string, hint = ""): ReactNode => (
    <span className="flex w-full min-w-[180px] items-center justify-between gap-6">
        <span>{label}</span>
        {hint ? <span className="text-[11px] opacity-50">{hint}</span> : null}
    </span>
);

const toggle = (label: string, active: boolean): ReactNode => (
    <span className="flex w-full min-w-[160px] items-center gap-2">
        {active ? <Check className="size-3.5" /> : <span className="size-3.5" />}
        <span>{label}</span>
    </span>
);

/** Prefixes every key, children included, so one Dropdown can host several menus without a key clash. */
export function prefixMenuKeys(items: AudioMenuItems, prefix: string): AudioMenuItems {
    return items.map((entry) => {
        if (!entry || !("key" in entry) || entry.key === undefined) return entry;
        const key = `${prefix}${String(entry.key)}`;
        if ("children" in entry && entry.children) return { ...entry, key, children: prefixMenuKeys(entry.children, prefix) };
        return { ...entry, key };
    });
}

const keyedOptions = <T extends string>(values: T[], keys: Record<T, string>, prefix: string): AudioMenuItems => values.map((value) => ({ key: `${prefix}:${value}`, label: keys[value] }));

export function audioClipMenuItems(t: TFunction, clip: CanvasAudioClip | null): AudioMenuItems {
    const disabled = !clip;
    return [
        { key: "split", label: item(t("canvas.audioStudio.split"), "Ctrl+K"), disabled },
        { key: "duplicate", label: item(t("canvas.audioStudio.duplicate"), "Ctrl+D"), disabled },
        { key: "delete", label: item(t("canvas.audioStudio.delete"), "Delete"), disabled },
        { type: "divider" },
        { key: "fadeIn", label: item(t("canvas.audioStudio.fadeIn")), disabled },
        { key: "fadeOut", label: item(t("canvas.audioStudio.fadeOut")), disabled },
        { key: "crossfade", label: item(t("canvas.audioStudio.crossfade"), "X"), disabled },
        { type: "divider" },
        { key: "loop", label: toggle(t("canvas.audioStudio.loop"), Boolean(clip?.loop)), disabled },
        { key: "reverse", label: toggle(t("canvas.audioStudio.reverse"), Boolean(clip?.reversed)), disabled },
        { key: "clipMute", label: toggle(t("canvas.audioStudio.clipMute"), Boolean(clip?.muted)), disabled },
        { key: "lock", label: toggle(t("canvas.audioStudio.lock"), Boolean(clip?.locked)), disabled },
        { type: "divider" },
        { key: "rename", label: item(t("canvas.audioStudio.rename")), disabled },
        { key: "properties", label: item(t("canvas.audioStudio.properties")), disabled },
    ];
}

export function audioTrackMenuItems(t: TFunction, canRemove: boolean, exporting: boolean): AudioMenuItems {
    return [
        { key: "add", label: item(t("canvas.audioStudio.addAudioTrack")) },
        { key: "addInstrument", label: item(t("canvas.audioStudio.addInstrumentTrack")) },
        { key: "addMidi", label: item(t("canvas.audioStudio.addMidiTrack")) },
        { key: "addGroup", label: item(t("canvas.audioStudio.addGroupTrack")) },
        { key: "addReturn", label: item(t("canvas.audioStudio.addReturnTrack")) },
        { type: "divider" },
        { key: "duplicate", label: item(t("canvas.audioStudio.duplicateTrack")) },
        { key: "remove", label: item(t("canvas.audioStudio.removeTrack")), disabled: !canRemove },
        { type: "divider" },
        { key: "exportStems", label: item(t("canvas.audioStudio.exportStems")), disabled: exporting },
    ];
}

export function audioMidiRegionMenuItems(t: TFunction): AudioMenuItems {
    return [
        { key: "open", label: item(t("canvas.audioStudio.regionOpen"), "Enter") },
        { key: "duplicate", label: item(t("canvas.audioStudio.regionDuplicate")) },
        { key: "delete", label: item(t("canvas.audioStudio.regionDelete"), "Delete") },
    ];
}

export function audioRulerMenuItems(t: TFunction, hasRange: boolean, cycleEnabled: boolean): AudioMenuItems {
    return [
        { key: "addMarker", label: item(t("canvas.audioStudio.addMarker")) },
        { type: "divider" },
        { key: "setCycle", label: item(t("canvas.audioStudio.setCycleFromRange")), disabled: !hasRange },
        { key: "clearCycle", label: item(t("canvas.audioStudio.clearCycle")), disabled: !cycleEnabled },
    ];
}

export function audioLaneMenuItems(t: TFunction, canRemove: boolean, midi = false): AudioMenuItems {
    return [
        { key: "addClip", label: item(t(midi ? "canvas.audioStudio.addRegion" : "canvas.audioStudio.addClip")) },
        { key: "rename", label: item(t("canvas.audioStudio.rename")) },
        { key: "showAutomation", label: item(t("canvas.audioStudio.automationShow")) },
        { type: "divider" },
        { key: "duplicate", label: item(t("canvas.audioStudio.duplicateTrack")) },
        { key: "remove", label: item(t("canvas.audioStudio.removeTrack")), disabled: !canRemove },
    ];
}

export function audioAutomationMenuItems(t: TFunction, flags: AudioAutomationFlags): AudioMenuItems {
    return [
        { key: "show", label: toggle(t("canvas.audioStudio.automationShow"), flags.visible), disabled: !flags.hasLanes },
        { type: "divider" },
        { key: "addGain", label: item(t("canvas.audioStudio.automationAddGain")), disabled: !flags.canAddGain },
        { key: "addPan", label: item(t("canvas.audioStudio.automationAddPan")), disabled: !flags.canAddPan },
        { key: "addSend", label: item(t("canvas.audioStudio.automationAddSend")), disabled: !flags.canAddSend },
        { type: "divider" },
        { key: "clearTrack", label: item(t("canvas.audioStudio.automationClearTrack")), disabled: !flags.hasLanes },
    ];
}

export function audioAutomationPointMenuItems(t: TFunction, curve: CanvasAudioAutomationCurve): AudioMenuItems {
    return [
        { key: "linear", label: toggle(t("canvas.audioStudio.curveLinear"), curve === "linear") },
        { key: "hold", label: toggle(t("canvas.audioStudio.curveHold"), curve === "hold") },
        { key: "sCurve", label: toggle(t("canvas.audioStudio.curveSCurve"), curve === "sCurve") },
        { type: "divider" },
        { key: "delete", label: item(t("canvas.audioStudio.automationDeletePoint")) },
    ];
}

/** The five DAW menus, keyed so one Dropdown can host them all and a caller can route the clicked key. */
export function audioMenuGroups(t: TFunction, flags: AudioMenuFlags) {
    const editItems: AudioMenuItems = [
        { key: "selectAll", label: item(t("canvas.audioStudio.selectAll"), "Ctrl+A"), disabled: !flags.hasClips },
        { key: "deselect", label: item(t("canvas.audioStudio.deselect"), "Esc"), disabled: !flags.hasSelection },
        { type: "divider" },
        { key: "copy", label: item(t("canvas.audioStudio.copy"), "Ctrl+C"), disabled: !flags.hasSelection },
        { key: "cut", label: item(t("canvas.audioStudio.cut"), "Ctrl+X"), disabled: !flags.hasSelection },
        { key: "paste", label: item(t("canvas.audioStudio.paste"), "Ctrl+V"), disabled: !flags.canPaste },
        { type: "divider" },
        { key: "duplicate", label: item(t("canvas.audioStudio.duplicate"), "Ctrl+D"), disabled: !flags.hasSelection },
        { key: "split", label: item(t("canvas.audioStudio.split"), "Ctrl+K"), disabled: !flags.hasSelection },
        { key: "delete", label: item(t("canvas.audioStudio.delete"), "Delete"), disabled: !flags.hasSelection },
        { type: "divider" },
        { key: "setCycle", label: item(t("canvas.audioStudio.setCycleFromRange")), disabled: !flags.hasRange },
        { key: "clearCycle", label: item(t("canvas.audioStudio.clearCycle")), disabled: !flags.hasCycleRange },
    ];
    const viewItems: AudioMenuItems = [
        { key: "grid", label: toggle(t("canvas.audioStudio.grid"), flags.view.grid) },
        { key: "snap", label: toggle(t("canvas.audioStudio.snap"), flags.snap !== "off") },
        { type: "divider" },
        { key: "cycle", label: toggle(t("canvas.audioStudio.cycle"), flags.view.cycle), disabled: !flags.hasCycleRange },
        { key: "metronome", label: toggle(t("canvas.audioStudio.metronome"), flags.view.metronome) },
        { type: "divider" },
        { key: "zoomIn", label: item(t("canvas.audioStudio.zoomIn")) },
        { key: "zoomOut", label: item(t("canvas.audioStudio.zoomOut")) },
        { key: "zoomFit", label: item(t("canvas.audioStudio.zoomFit")) },
    ];
    return [
        { key: "edit" as AudioMenuGroupKey, labelKey: "canvas.audioStudio.menuEdit", items: editItems },
        { key: "track" as AudioMenuGroupKey, labelKey: "canvas.audioStudio.menuTrack", items: audioTrackMenuItems(t, flags.canRemoveTrack, flags.exporting) },
        { key: "clip" as AudioMenuGroupKey, labelKey: "canvas.audioStudio.menuClip", items: audioClipMenuItems(t, flags.clip) },
        { key: "view" as AudioMenuGroupKey, labelKey: "canvas.audioStudio.menuView", items: viewItems },
        { key: "automation" as AudioMenuGroupKey, labelKey: "canvas.audioStudio.menuAutomation", items: audioAutomationMenuItems(t, flags.automation) },
    ];
}

/** Grid, snap, fade shape, loop, reverse and auto-crossfade as menu items; keys carry their own command. */
export function audioOptionItems(t: TFunction, flags: AudioOptionFlags): AudioMenuItems {
    return [
        { key: "grid", label: toggle(t("canvas.audioStudio.grid"), flags.grid) },
        { key: "snap", label: t("canvas.audioStudio.snap"), children: keyedOptions<CanvasAudioSnap>(AUDIO_SNAP_OPTIONS, AUDIO_SNAP_LABEL_KEYS, "snap") },
        { key: "fadeShape", label: t("canvas.audioStudio.fadeShape"), children: keyedOptions<CanvasAudioFadeShape>(AUDIO_FADE_SHAPE_OPTIONS, AUDIO_FADE_SHAPE_LABEL_KEYS, "fadeShape"), disabled: !flags.hasClip },
        { type: "divider" },
        { key: "loop", label: toggle(t("canvas.audioStudio.loop"), flags.loop), disabled: !flags.hasClip },
        { key: "reverse", label: toggle(t("canvas.audioStudio.reverse"), flags.reversed), disabled: !flags.hasClip },
        { key: "autoCrossfade", label: toggle(t("canvas.audioStudio.autoCrossfade"), flags.autoCrossfade) },
    ];
}

/** Everything the narrow options row offers in one Dropdown: the five menus plus the contextual options. */
export function audioCompactMenuItems(t: TFunction, flags: AudioMenuFlags & AudioOptionFlags): AudioMenuItems {
    return [
        ...audioMenuGroups(t, flags).map((group) => ({ key: `menu:${group.key}`, label: t(group.labelKey), children: prefixMenuKeys(group.items, `${group.key}:`) })),
        { type: "divider" },
        ...prefixMenuKeys(audioOptionItems(t, flags), "opt:"),
    ];
}

export function AudioClipContextMenu({ clip, onCommand, children }: { clip: CanvasAudioClip; onCommand: (command: AudioClipCommand) => void; children: ReactElement }) {
    const { t } = useTranslation();
    return (
        <Dropdown
            trigger={["contextMenu"]}
            menu={{
                items: audioClipMenuItems(t, clip),
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    onCommand(key as AudioClipCommand);
                },
            }}
            styles={{ root: { zIndex: 1300 } }}
        >
            {children}
        </Dropdown>
    );
}

export function AudioTrackContextMenu({ canRemove, exporting = false, onCommand, children }: { canRemove: boolean; exporting?: boolean; onCommand: (command: AudioTrackCommand) => void; children: ReactElement }) {
    const { t } = useTranslation();
    return (
        <Dropdown
            trigger={["contextMenu"]}
            menu={{
                items: audioTrackMenuItems(t, canRemove, exporting),
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    onCommand(key as AudioTrackCommand);
                },
            }}
            styles={{ root: { zIndex: 1300 } }}
        >
            {children}
        </Dropdown>
    );
}

export function AudioLaneContextMenu({ canRemove, midi = false, onCommand, children }: { canRemove: boolean; midi?: boolean; onCommand: (command: AudioLaneCommand) => void; children: ReactElement }) {
    const { t } = useTranslation();
    return (
        <Dropdown
            trigger={["contextMenu"]}
            menu={{
                items: audioLaneMenuItems(t, canRemove, midi),
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    onCommand(key as AudioLaneCommand);
                },
            }}
            styles={{ root: { zIndex: 1300 } }}
        >
            {children}
        </Dropdown>
    );
}

export function AudioMidiRegionContextMenu({ onCommand, children }: { onCommand: (command: AudioMidiRegionCommand) => void; children: ReactElement }) {
    const { t } = useTranslation();
    return (
        <Dropdown
            trigger={["contextMenu"]}
            menu={{
                items: audioMidiRegionMenuItems(t),
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    onCommand(key as AudioMidiRegionCommand);
                },
            }}
            styles={{ root: { zIndex: 1300 } }}
        >
            {children}
        </Dropdown>
    );
}

export function AudioRulerContextMenu({ hasRange, canClearCycle, onCommand, children }: { hasRange: boolean; canClearCycle: boolean; onCommand: (command: "addMarker" | "setCycle" | "clearCycle") => void; children: ReactElement }) {
    const { t } = useTranslation();
    return (
        <Dropdown
            trigger={["contextMenu"]}
            menu={{
                items: audioRulerMenuItems(t, hasRange, canClearCycle),
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    onCommand(key as "addMarker" | "setCycle" | "clearCycle");
                },
            }}
            styles={{ root: { zIndex: 1300 } }}
        >
            {children}
        </Dropdown>
    );
}

export function AudioAutomationPointMenu({ curve, onCommand, children }: { curve: CanvasAudioAutomationCurve; onCommand: (command: AudioAutomationPointCommand) => void; children: ReactElement }) {
    const { t } = useTranslation();
    return (
        <Dropdown
            trigger={["contextMenu"]}
            menu={{
                items: audioAutomationPointMenuItems(t, curve),
                onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    onCommand(key as AudioAutomationPointCommand);
                },
            }}
            styles={{ root: { zIndex: 1300 } }}
        >
            {children}
        </Dropdown>
    );
}

export function AudioMenus({ onEdit, onTrack, onClip, onView, onAutomation, ...flags }: AudioMenusProps) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const dispatch: Record<AudioMenuGroupKey, (key: string) => void> = {
        edit: (key) => onEdit(key as AudioEditCommand),
        track: (key) => onTrack(key as AudioTrackCommand),
        clip: (key) => onClip(key as AudioClipCommand),
        view: (key) => onView(key as AudioViewCommand),
        automation: (key) => onAutomation(key as AudioAutomationCommand),
    };

    return (
        <span className="flex shrink-0 items-center gap-0.5">
            {audioMenuGroups(t, flags).map((group) => (
                <Dropdown key={group.key} menu={{ items: group.items, onClick: ({ key }) => dispatch[group.key](key) }} placement="bottomLeft" styles={{ root: { zIndex: 1300 } }}>
                        <Button size="small" type="text" className={AUDIO_MENU_BUTTON_CLASS} style={{ color: theme.node.text }}>
                        {t(group.labelKey)}
                        <ChevronDown className="size-3" />
                    </Button>
                </Dropdown>
            ))}
        </span>
    );
}
