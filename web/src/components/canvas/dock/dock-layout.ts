import type { LucideIcon } from "lucide-react";

export type DockEdge = "left" | "right" | "bottom";

export type DockPanelDef = {
    id: string;
    labelKey: string;
    icon: LucideIcon;
    /** Edge the panel returns to when shown again or when the layout is reset. */
    dock: DockEdge;
    /** Panels that start hidden; the window menu shows them unchecked. */
    hidden?: boolean;
};

export type DockLayout = {
    /** Panel ids per dock, in stack order; a panel missing from every stack is hidden. */
    stacks: Record<DockEdge, string[]>;
    active: Record<DockEdge, string>;
    sizes: Record<DockEdge, number>;
};

export const DOCK_EDGES: DockEdge[] = ["left", "right", "bottom"];
export const DOCK_MIN_SIZE = 168;
export const DOCK_MAX_SIZE = 640;
const DOCK_DEFAULT_SIZES: Record<DockEdge, number> = { left: 288, right: 288, bottom: 208 };
const DOCK_STORAGE_PREFIX = "infinite-canvas:studio-dock:";

export const dockClampSize = (edge: DockEdge, size: number) =>
    Math.min(edge === "bottom" ? 420 : DOCK_MAX_SIZE, Math.max(edge === "bottom" ? 120 : DOCK_MIN_SIZE, Math.round(size || DOCK_DEFAULT_SIZES[edge])));

const emptyStacks = (): Record<DockEdge, string[]> => ({ left: [], right: [], bottom: [] });

const dockActive = (stacks: Record<DockEdge, string[]>, active: DockLayout["active"]): DockLayout["active"] => {
    const next = { ...active };
    DOCK_EDGES.forEach((edge) => {
        if (!stacks[edge].includes(next[edge])) next[edge] = stacks[edge][0] ?? "";
    });
    return next;
};

export const dockDefaultLayout = (defs: DockPanelDef[]): DockLayout => {
    const stacks = emptyStacks();
    defs.forEach((def) => {
        if (!def.hidden) stacks[def.dock].push(def.id);
    });
    return { stacks, active: dockActive(stacks, { left: "", right: "", bottom: "" }), sizes: { ...DOCK_DEFAULT_SIZES } };
};

export const dockLoadLayout = (studio: string, defs: DockPanelDef[]): DockLayout => {
    const fallback = dockDefaultLayout(defs);
    let saved: Partial<DockLayout> | null = null;
    try {
        const raw = localStorage.getItem(DOCK_STORAGE_PREFIX + studio);
        saved = raw ? (JSON.parse(raw) as Partial<DockLayout>) : null;
    } catch {
        saved = null;
    }
    if (!saved || typeof saved !== "object") return fallback;
    const known = new Set(defs.map((def) => def.id));
    const seen = new Set<string>();
    const stacks = emptyStacks();
    DOCK_EDGES.forEach((edge) => {
        const list = Array.isArray(saved?.stacks?.[edge]) ? (saved.stacks?.[edge] as string[]) : fallback.stacks[edge];
        stacks[edge] = list.filter((id) => {
            if (typeof id !== "string" || !known.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    });
    const sizes = { ...fallback.sizes };
    DOCK_EDGES.forEach((edge) => {
        const size = saved?.sizes?.[edge];
        if (typeof size === "number") sizes[edge] = dockClampSize(edge, size);
    });
    return { stacks, active: dockActive(stacks, saved.active ?? fallback.active), sizes };
};

export const dockSaveLayout = (studio: string, layout: DockLayout) => {
    try {
        localStorage.setItem(DOCK_STORAGE_PREFIX + studio, JSON.stringify(layout));
    } catch {
        // A full or unavailable storage must not break the studio; the layout simply stops persisting.
    }
};

export const dockIsVisible = (layout: DockLayout, id: string) => DOCK_EDGES.some((edge) => layout.stacks[edge].includes(id));

const dockWithoutPanel = (stacks: Record<DockEdge, string[]>, id: string) => {
    const next = emptyStacks();
    DOCK_EDGES.forEach((edge) => {
        next[edge] = stacks[edge].filter((panel) => panel !== id);
    });
    return next;
};

export const dockRevealPanel = (layout: DockLayout, defs: DockPanelDef[], id: string): DockLayout => {
    const def = defs.find((item) => item.id === id);
    return def ? dockMovePanel(layout, id, def.dock) : layout;
};

export const dockTogglePanel = (layout: DockLayout, defs: DockPanelDef[], id: string): DockLayout => {
    if (!dockIsVisible(layout, id)) return dockRevealPanel(layout, defs, id);
    const stacks = dockWithoutPanel(layout.stacks, id);
    return { ...layout, stacks, active: dockActive(stacks, layout.active) };
};

export const dockMovePanel = (layout: DockLayout, id: string, edge: DockEdge): DockLayout => {
    const stacks = dockWithoutPanel(layout.stacks, id);
    stacks[edge] = [...stacks[edge], id];
    return { ...layout, stacks, active: { ...layout.active, [edge]: id } };
};

export const dockSetActive = (layout: DockLayout, edge: DockEdge, id: string): DockLayout =>
    layout.stacks[edge].includes(id) && layout.active[edge] !== id ? { ...layout, active: { ...layout.active, [edge]: id } } : layout;

export const dockSetSize = (layout: DockLayout, edge: DockEdge, size: number): DockLayout => {
    const next = dockClampSize(edge, size);
    return layout.sizes[edge] === next ? layout : { ...layout, sizes: { ...layout.sizes, [edge]: next } };
};
