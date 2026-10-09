import { useCallback, useSyncExternalStore } from "react";

import { getDragPreviewSignal, subscribeDragPreviewSignal } from "@/lib/canvas/drag-preview-signal";
import type { Position } from "@/types/canvas";

export function useDragPreviewPosition(nodeId: string): Position | undefined {
    const getSnapshot = useCallback(() => getDragPreviewSignal()?.get(nodeId), [nodeId]);
    return useSyncExternalStore(subscribeDragPreviewSignal, getSnapshot, getSnapshot);
}
