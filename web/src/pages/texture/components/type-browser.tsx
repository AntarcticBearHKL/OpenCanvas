import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Input, Modal, Segmented, Spin } from "antd";
import { Star } from "lucide-react";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { TYPE_ID, TYPE_ORDER } from "@/lib/texture/registry";

import { useTextureThumbnails } from "./use-texture-thumbnails";

const FAVORITES_KEY = "oc_texture_type_favorites";

const CHECKERBOARD: CSSProperties = {
    backgroundColor: "#ffffff",
    backgroundImage:
        "linear-gradient(45deg, #cccccc 25%, transparent 25%), linear-gradient(-45deg, #cccccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cccccc 75%), linear-gradient(-45deg, transparent 75%, #cccccc 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

type Category = "Basic" | "Pattern" | "FX";
type FilterValue = "All" | Category | "Favorites";

const FILTER_OPTIONS: Array<{ label: string; value: FilterValue }> = [
    { label: "All", value: "All" },
    { label: "Basic", value: "Basic" },
    { label: "Pattern", value: "Pattern" },
    { label: "FX", value: "FX" },
    { label: "Favorites", value: "Favorites" },
];

/** Simple categories derived from TYPE_ID ranges. */
function categoryOf(type: string): Category {
    const id = TYPE_ID[type] ?? 0;
    if (id <= 199) return "Basic";
    if (id <= 260) return "Pattern";
    return "FX";
}

function readFavorites(): string[] {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
        return [];
    }
}

export function TypeBrowser({ open, onClose, currentType, onSelect }: { open: boolean; onClose: () => void; currentType: string; onSelect: (type: string) => void }) {
    const theme = useCanvasTheme();
    const { thumbnails, ready } = useTextureThumbnails(open);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<FilterValue>("All");
    const [favorites, setFavorites] = useState<string[]>(readFavorites);

    useEffect(() => {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        } catch {
            // Ignore storage failures (private mode / quota).
        }
    }, [favorites]);

    const visible = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return TYPE_ORDER.filter((type) => {
            if (keyword && !type.toLowerCase().includes(keyword)) return false;
            if (filter === "Favorites") return favorites.includes(type);
            if (filter !== "All" && categoryOf(type) !== filter) return false;
            return true;
        });
    }, [query, filter, favorites]);

    const toggleFavorite = (type: string) =>
        setFavorites((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));

    const pick = (type: string) => {
        onSelect(type);
        onClose();
    };

    return (
        <Modal title="Browse Types" width={880} footer={null} open={open} onCancel={onClose}>
            <div className="flex flex-col gap-3 pt-1">
                <div className="flex items-center gap-3">
                    <Input allowClear placeholder="Search types…" value={query} onChange={(event) => setQuery(event.target.value)} />
                    <Segmented<FilterValue> value={filter} options={FILTER_OPTIONS} onChange={(value) => setFilter(value)} />
                </div>

                {!ready && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: theme.node.muted }}>
                        <Spin size="small" />
                        Rendering thumbnails…
                    </div>
                )}

                <div className="thin-scrollbar grid max-h-[60vh] gap-2 overflow-y-auto pr-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
                    {visible.map((type) => {
                        const active = type === currentType;
                        const favorite = favorites.includes(type);
                        const thumb = thumbnails.get(type);
                        return (
                            <div
                                key={type}
                                role="button"
                                tabIndex={0}
                                onClick={() => pick(type)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        pick(type);
                                    }
                                }}
                                className="group relative flex cursor-pointer flex-col items-center gap-1 rounded-md p-1.5 text-center transition hover:bg-hover"
                                style={active ? { background: theme.node.accentSoft, color: theme.node.accent, boxShadow: `inset 0 0 0 1px ${theme.node.accent}` } : undefined}
                            >
                                <button
                                    type="button"
                                    title={favorite ? "Remove from favorites" : "Add to favorites"}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        toggleFavorite(type);
                                    }}
                                    className={`absolute right-0.5 top-0.5 grid size-5 place-items-center rounded transition ${favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                    style={{ color: favorite ? theme.node.warning : theme.node.muted }}
                                >
                                    <Star className="size-3.5" fill={favorite ? "currentColor" : "none"} />
                                </button>

                                <span className="grid size-16 place-items-center overflow-hidden rounded" style={CHECKERBOARD}>
                                    {thumb ? (
                                        <img src={thumb} alt={type} className="size-full object-contain" draggable={false} />
                                    ) : (
                                        <span className="text-[10px]" style={{ color: theme.node.muted }}>
                                            …
                                        </span>
                                    )}
                                </span>
                                <span className="w-full truncate text-[11px]" style={{ color: active ? theme.node.accent : theme.node.muted }}>
                                    {type}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {visible.length === 0 && (
                    <div className="py-10 text-center text-xs" style={{ color: theme.node.muted }}>
                        No matching types
                    </div>
                )}
            </div>
        </Modal>
    );
}
