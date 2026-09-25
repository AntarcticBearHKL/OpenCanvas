import type { LucideIcon } from "lucide-react";

export type DockEdge = "left" | "right" | "bottom";
export type DockSide = Exclude<DockEdge, "bottom">;

export type DockPanelDef = {
    id: string;
    labelKey: string;
    icon: LucideIcon;
    /** Edge the panel returns to when shown again or when the layout is reset. */
    dock: DockEdge;
    /** Panels that start hidden; the window menu shows them unchecked. */
    hidden?: boolean;
};

export type DockGroup = {
    /** Panel ids in the group, in tab order. */
    panels: string[];
    active: string;
};

export type DockLayout = {
    /** Tab groups per edge, stacked top to bottom; a panel missing from every group is hidden. */
    groups: Record<DockEdge, DockGroup[]>;
    sizes: Record<DockEdge, number>;
    /** Height share of the top group when a side edge holds two stacked groups. */
    split: Record<DockSide, number>;
};

export const DOCK_EDGES: DockEdge[] = ["left", "right", "bottom"];
export const DOCK_MIN_SIZE = 168;
export const DOCK_MAX_SIZE = 640;
/** The bottom edge stays a single group; a side edge may stack two. */
const DOCK_MAX_GROUPS: Record<DockEdge, number> = { left: 2, right: 2, bottom: 1 };
export const DOCK_MIN_GROUP_SIZE = 96;
export const DOCK_SPLIT_MIN = 0.2;
export const DOCK_SPLIT_MAX = 0.8;
const DOCK_SPLIT_DEFAULT = 0.5;
const DOCK_DEFAULT_SIZES: Record<DockEdge, number> = { left: 288, right: 288, bottom: 208 };
/** The `:v2` suffix retires the old single-stack payload, which now fails validation and resets instead. */
const DOCK_STORAGE_PREFIX = "infinite-canvas:studio-dock:v2:";

export const dockClampSize = (edge: DockEdge, size: number) =>
    Math.min(edge === "bottom" ? 420 : DOCK_MAX_SIZE, Math.max(edge === "bottom" ? 120 : DOCK_MIN_SIZE, Math.round(size || DOCK_DEFAULT_SIZES[edge])));

export const dockClampSplit = (ratio: number) =>
    Math.min(DOCK_SPLIT_MAX, Math.max(DOCK_SPLIT_MIN, Number.isFinite(ratio) ? ratio : DOCK_SPLIT_DEFAULT));

const emptyGroups = (): Record<DockEdge, DockGroup[]> => ({ left: [], right: [], bottom: [] });

/** Drops empty groups so a strip whose last panel left collapses, and repairs each surviving group's active tab. */
const dockCollapseGroups = (groups: DockGroup[]): DockGroup[] =>
    groups.filter((group) => group.panels.length > 0).map((group) => (group.panels.includes(group.active) ? group : { ...group, active: group.panels[0] }));

export const dockDefaultLayout = (defs: DockPanelDef[]): DockLayout => {
    const groups = emptyGroups();
    defs.forEach((def) => {
        if (def.hidden) return;
        const [first] = groups[def.dock];
        if (first) first.panels.push(def.id);
        else groups[def.dock].push({ panels: [def.id], active: def.id });
    });
    return { groups, sizes: { ...DOCK_DEFAULT_SIZES }, split: { left: DOCK_SPLIT_DEFAULT, right: DOCK_SPLIT_DEFAULT } };
};

const parseGroups = (raw: unknown, max: number, known: Set<string>, seen: Set<string>): DockGroup[] | null => {
    if (!Array.isArray(raw) || raw.length > max) return null;
    const groups: DockGroup[] = [];
    for (const entry of raw) {
        const panelsRaw = (entry as { panels?: unknown } | null)?.panels;
        if (!Array.isArray(panelsRaw)) return null;
        const panels = panelsRaw.filter((id): id is string => {
            if (typeof id !== "string" || !known.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        if (!panels.length) continue;
        const active = (entry as { active?: unknown }).active;
        groups.push({ panels, active: typeof active === "string" ? active : panels[0] });
    }
    return dockCollapseGroups(groups);
};

export const dockLoadLayout = (studio: string, defs: DockPanelDef[]): DockLayout => {
    const fallback = dockDefaultLayout(defs);
    let saved: unknown = null;
    try {
        const raw = localStorage.getItem(DOCK_STORAGE_PREFIX + studio);
        saved = raw ? JSON.parse(raw) : null;
    } catch {
        saved = null;
    }
    if (!saved || typeof saved !== "object") return fallback;
    const source = saved as { groups?: Partial<Record<DockEdge, unknown>>; sizes?: Partial<Record<DockEdge, unknown>>; split?: Partial<Record<DockSide, unknown>> };
    const known = new Set(defs.map((def) => def.id));
    const seen = new Set<string>();
    const groups = emptyGroups();
    for (const edge of DOCK_EDGES) {
        const parsed = parseGroups(source.groups?.[edge], DOCK_MAX_GROUPS[edge], known, seen);
        if (!parsed) return fallback;
        groups[edge] = parsed;
    }
    const sizes = { ...fallback.sizes };
    DOCK_EDGES.forEach((edge) => {
        const size = source.sizes?.[edge];
        if (typeof size === "number") sizes[edge] = dockClampSize(edge, size);
    });
    const split = { ...fallback.split };
    (["left", "right"] as const).forEach((edge) => {
        const ratio = source.split?.[edge];
        if (typeof ratio === "number") split[edge] = dockClampSplit(ratio);
    });
    return { groups, sizes, split };
};

export const dockSaveLayout = (studio: string, layout: DockLayout) => {
    try {
        localStorage.setItem(DOCK_STORAGE_PREFIX + studio, JSON.stringify(layout));
    } catch {
        // A full or unavailable storage must not break the studio; the layout simply stops persisting.
    }
};

export const dockIsVisible = (layout: DockLayout, id: string) => DOCK_EDGES.some((edge) => layout.groups[edge].some((group) => group.panels.includes(id)));

const dockWithoutPanel = (groups: Record<DockEdge, DockGroup[]>, id: string): Record<DockEdge, DockGroup[]> => {
    const next = emptyGroups();
    DOCK_EDGES.forEach((edge) => {
        next[edge] = dockCollapseGroups(groups[edge].map((group) => ({ panels: group.panels.filter((panel) => panel !== id), active: group.active })));
    });
    return next;
};

export const dockRevealPanel = (layout: DockLayout, defs: DockPanelDef[], id: string): DockLayout => {
    const def = defs.find((item) => item.id === id);
    return def ? dockMovePanel(layout, id, def.dock, 0) : layout;
};

export const dockTogglePanel = (layout: DockLayout, defs: DockPanelDef[], id: string): DockLayout => {
    if (!dockIsVisible(layout, id)) return dockRevealPanel(layout, defs, id);
    return { ...layout, groups: dockWithoutPanel(layout.groups, id) };
};

export const dockMovePanel = (layout: DockLayout, id: string, edge: DockEdge, groupIndex = 0): DockLayout => {
    const groups = dockWithoutPanel(layout.groups, id);
    const list = groups[edge];
    const index = Math.max(0, Math.min(DOCK_MAX_GROUPS[edge] - 1, Math.floor(groupIndex) || 0));
    if (index < list.length) list[index] = { panels: [...list[index].panels, id], active: id };
    else list.push({ panels: [id], active: id });
    return { ...layout, groups };
};

export const dockSetActive = (layout: DockLayout, edge: DockEdge, groupIndex: number, id: string): DockLayout => {
    const group = layout.groups[edge][groupIndex];
    if (!group || !group.panels.includes(id) || group.active === id) return layout;
    const groups = { ...layout.groups, [edge]: layout.groups[edge].map((item, index) => (index === groupIndex ? { ...item, active: id } : item)) };
    return { ...layout, groups };
};

export const dockSetSize = (layout: DockLayout, edge: DockEdge, size: number): DockLayout => {
    const next = dockClampSize(edge, size);
    return layout.sizes[edge] === next ? layout : { ...layout, sizes: { ...layout.sizes, [edge]: next } };
};

export const dockSetSplit = (layout: DockLayout, edge: DockSide, ratio: number): DockLayout => {
    const next = dockClampSplit(ratio);
    return layout.split[edge] === next ? layout : { ...layout, split: { ...layout.split, [edge]: next } };
};
