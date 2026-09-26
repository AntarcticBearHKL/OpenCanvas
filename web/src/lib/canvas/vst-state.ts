import { createVstClient } from "@/lib/canvas/audio-vst";
import { saveVstState } from "@/services/file-storage";

/**
 * Bounded debounce while a plug-in editor is open: one `getState` + localforage write every 10 s.
 * 10 s keeps the worst-case loss from a crash or a hard reload down to a few seconds of preset
 * tweaking, while staying far above the round trip of a large HALion Sonic state (hundreds of KB
 * of base64) so the save never competes with the audio worklet for main-thread time. The timer
 * only runs between opening and closing the editor, and every close (or unmount) does a final
 * save, so there is no polling while no editor is open and none at all for non-vst3 tracks.
 */
export const VST_STATE_SAVE_INTERVAL_MS = 10_000;

/**
 * One `getState` + write. Never throws: a stopped host, an unloaded instance or a failed
 * localforage write resolves `false`, so neither the UI nor the audio graph is disturbed.
 */
export async function persistVstState(instanceId: string, stateKey: string): Promise<boolean> {
    try {
        const state = await createVstClient().getState(instanceId);
        if (state === null || state === undefined) return false;
        await saveVstState(stateKey, state);
        return true;
    } catch {
        return false;
    }
}

/** Live persistence for one open editor; `stop()` is the final save and can be awaited. */
export type VstStateSession = { stop: () => Promise<void> };

/**
 * Start persisting one track's plug-in state while its editor is open. Returns null when the
 * instrument has no `stateKey` (nothing is stored under a key that does not exist).
 *
 * The timer ends itself after the first failed round trip — a stopped host or a dead instance
 * cannot be re-read — while `stop()` always attempts one final save, so closing the editor is
 * the reliable moment.
 */
export function startVstStateSession(instanceId: string, stateKey: string | undefined): VstStateSession | null {
    if (!stateKey) return null;
    let timer = 0;
    const save = async () => {
        const saved = await persistVstState(instanceId, stateKey);
        if (!saved && timer) {
            window.clearInterval(timer);
            timer = 0;
        }
    };
    timer = window.setInterval(() => void save(), VST_STATE_SAVE_INTERVAL_MS);
    return {
        stop: async () => {
            if (timer) {
                window.clearInterval(timer);
                timer = 0;
            }
            await save();
        },
    };
}
