import { useEffect, useRef, useState } from "react";

import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";

export function useCanvasProjectDelete(onDeleted?: (ids: string[]) => void) {
    const [armedId, setArmedId] = useState<string | null>(null);
    const controlRef = useRef<Element | null>(null);
    const deleteProjects = useCanvasStore((state) => state.deleteProjects);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const removeSelectedIds = useCanvasUiStore((state) => state.removeSelectedProjectIds);
    const onDeletedRef = useRef(onDeleted);
    onDeletedRef.current = onDeleted;

    useEffect(() => {
        if (!armedId) return;
        const close = () => setArmedId(null);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && controlRef.current?.contains(event.target)) return;
            close();
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [armedId]);

    const cancel = () => setArmedId(null);

    const confirmDelete = (id: string, ids: string[], control: Element) => {
        if (armedId !== id) {
            controlRef.current = control;
            setArmedId(id);
            return;
        }
        cancel();
        deleteProjects(ids);
        cleanupImages();
        removeSelectedIds(ids);
        onDeletedRef.current?.(ids);
    };

    return { armedId, confirmDelete, cancel };
}
