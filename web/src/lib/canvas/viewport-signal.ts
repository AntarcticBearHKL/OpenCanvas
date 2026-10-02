import type { ViewportTransform } from "@/types/canvas";

let current: ViewportTransform = { x: 0, y: 0, k: 1 };
const listeners = new Set<() => void>();

export function setViewportSignal(next: ViewportTransform) {
    current = next;
    listeners.forEach((listener) => listener());
}

export function getViewportSignal() {
    return current;
}

export function subscribeViewportSignal(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
