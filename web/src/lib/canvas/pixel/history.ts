export type PixelHistory<T> = {
    push: (snapshot: T) => void;
    undo: () => T | null;
    redo: () => T | null;
    canUndo: () => boolean;
    canRedo: () => boolean;
    reset: (snapshot: T) => void;
};

/** Snapshot stack: pushes clear the redo tail and the history is capped at `limit` (default 100). */
export function createPixelHistory<T>(limit = 100): PixelHistory<T> {
    let stack: T[] = [];
    let index = -1;
    return {
        push(snapshot) {
            stack = stack.slice(0, index + 1);
            stack.push(snapshot);
            if (stack.length > limit) stack = stack.slice(stack.length - limit);
            index = stack.length - 1;
        },
        undo() {
            if (index <= 0) return null;
            index -= 1;
            return stack[index];
        },
        redo() {
            if (index >= stack.length - 1) return null;
            index += 1;
            return stack[index];
        },
        canUndo: () => index > 0,
        canRedo: () => index < stack.length - 1,
        reset(snapshot) {
            stack = [snapshot];
            index = 0;
        },
    };
}
