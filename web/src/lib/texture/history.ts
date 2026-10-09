// Undo/redo snapshots and URL-safe share decoding for the Texture Studio.
import type { EditorState } from "./types";

/** Maximum number of snapshots kept in the undo/redo stack. */
const MAX_HISTORY = 50;

function cloneState(state: EditorState): EditorState {
    return structuredClone(state);
}

function sameState(a: EditorState, b: EditorState): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Full-state undo/redo stack. `record` is a no-op when the state is unchanged. */
export class TextureHistory {
    private entries: EditorState[] = [];
    private index = 0;

    constructor(initial: EditorState) {
        this.reset(initial);
    }

    reset(initial: EditorState): void {
        this.entries = [cloneState(initial)];
        this.index = 0;
    }

    record(state: EditorState): void {
        const current = this.entries[this.index];
        if (current && sameState(current, state)) return;
        this.entries = this.entries.slice(0, this.index + 1);
        this.entries.push(cloneState(state));
        if (this.entries.length > MAX_HISTORY) this.entries.shift();
        this.index = this.entries.length - 1;
    }

    undo(): EditorState | null {
        if (this.index <= 0) return null;
        this.index -= 1;
        return cloneState(this.entries[this.index]);
    }

    redo(): EditorState | null {
        if (this.index >= this.entries.length - 1) return null;
        this.index += 1;
        return cloneState(this.entries[this.index]);
    }

    canUndo(): boolean {
        return this.index > 0;
    }

    canRedo(): boolean {
        return this.index < this.entries.length - 1;
    }
}

function base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Decode a base64url share payload; returns null when it is not a valid editor state. */
export function decodeTextureShare(value: string): EditorState | null {
    try {
        const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "===".slice((base64.length + 3) % 4);
        const text = new TextDecoder().decode(base64ToBytes(padded));
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null) return null;
        if (!Array.isArray((parsed as { layers?: unknown }).layers)) return null;
        return parsed as EditorState;
    } catch {
        return null;
    }
}
