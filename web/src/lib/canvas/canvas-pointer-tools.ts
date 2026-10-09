type CanvasRightButtonTool = {
    onStart: (event: PointerEvent) => boolean;
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
};

const RIGHT_BUTTON = 2;
const tools = new Map<string, CanvasRightButtonTool>();

function canvasModifierCombo(event: Pick<PointerEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): string {
    return [event.ctrlKey || event.metaKey ? "ctrl" : "", event.shiftKey ? "shift" : "", event.altKey ? "alt" : ""].filter(Boolean).join("+");
}

export function registerCanvasRightButtonTool(combo: string, tool: CanvasRightButtonTool) {
    tools.set(combo, tool);
    return () => {
        if (tools.get(combo) === tool) tools.delete(combo);
    };
}

export function installCanvasPointerToolHost() {
    let active: CanvasRightButtonTool | null = null;

    const suppressNativeMenu = (event: MouseEvent) => event.preventDefault();

    const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== RIGHT_BUTTON) return;
        const tool = tools.get(canvasModifierCombo(event));
        if (!tool || !tool.onStart(event)) return;
        event.preventDefault();
        active = tool;
    };

    const handlePointerMove = (event: PointerEvent) => {
        active?.onMove(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
        const tool = active;
        active = null;
        tool?.onEnd(event);
    };

    const cancelActiveTool = () => {
        active = null;
    };

    document.addEventListener("contextmenu", suppressNativeMenu);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelActiveTool);
    window.addEventListener("blur", cancelActiveTool);
    return () => {
        document.removeEventListener("contextmenu", suppressNativeMenu);
        window.removeEventListener("pointerdown", handlePointerDown, true);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", cancelActiveTool);
        window.removeEventListener("blur", cancelActiveTool);
    };
}
