import type { Position } from "@/types/canvas";

let current: Map<string, Position> | null = null;
const listeners = new Set<() => void>();

export function setDragPreviewSignal(next: Map<string, Position> | null) {
    current = next;
    listeners.forEach((listener) => listener());
}

export function getDragPreviewSignal() {
    return current;
}

export function subscribeDragPreviewSignal(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
