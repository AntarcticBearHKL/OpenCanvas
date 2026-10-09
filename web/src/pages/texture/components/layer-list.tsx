import { Eye, EyeOff, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import type { LayerState } from "@/lib/texture/types";

export function LayerList({
    layers,
    activeLayerId,
    onSelect,
    onToggleVisible,
    onAdd,
    onDelete,
    onMove,
}: {
    layers: LayerState[];
    activeLayerId: number;
    onSelect: (id: number) => void;
    onToggleVisible: (id: number) => void;
    onAdd: () => void;
    onDelete: (id: number) => void;
    onMove: (id: number, direction: 1 | -1) => void;
}) {
    return (
        <div className="border-b border-border">
            <div className="flex items-center justify-between px-3 py-3">
                <span className="text-xs font-semibold text-foreground">Layers</span>
                <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition hover:bg-hover hover:text-foreground">
                    <Plus className="size-3.5" />
                    Add
                </button>
            </div>
            <div className="flex flex-col gap-0.5 px-2 pb-3">
                {layers
                    .slice()
                    .reverse()
                    .map((layer) => {
                        const index = layers.indexOf(layer);
                        const active = layer.id === activeLayerId;
                        return (
                            <div
                                key={layer.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelect(layer.id)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        onSelect(layer.id);
                                    }
                                }}
                                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition hover:bg-hover ${active ? "bg-brand-soft text-brand" : "text-foreground"}`}
                            >
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleVisible(layer.id);
                                    }}
                                    className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition hover:bg-hover hover:text-foreground"
                                    title={layer.visible ? "Hide" : "Show"}
                                >
                                    {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                                </button>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate font-medium">{layer.name}</span>
                                    <span className="truncate text-[10px] text-muted-foreground">{layer.type}</span>
                                </div>
                                <button
                                    type="button"
                                    disabled={index === layers.length - 1}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onMove(layer.id, 1);
                                    }}
                                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                                    title="Move Up"
                                >
                                    <ChevronUp className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onMove(layer.id, -1);
                                    }}
                                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition hover:bg-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                                    title="Move Down"
                                >
                                    <ChevronDown className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    disabled={layers.length <= 1}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onDelete(layer.id);
                                    }}
                                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition hover:bg-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                                    title="Delete"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}
