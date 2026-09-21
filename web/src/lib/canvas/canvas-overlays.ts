const CANVAS_OVERLAY_SELECTOR = "[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown,.ant-tooltip,.ant-image-preview";

export function isCanvasOverlayTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest(CANVAS_OVERLAY_SELECTOR));
}
