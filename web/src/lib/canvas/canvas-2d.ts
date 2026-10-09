export function createCanvasContext(width: number, height: number, options?: CanvasRenderingContext2DSettings) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext("2d", options) };
}
