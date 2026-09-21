import { create } from "zustand";
import i18n from "@/i18n";

import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";

export type AgentPendingToolCall = { requestId: string; name: string; input?: { ops?: CanvasAgentOp[]; path?: string } & Record<string, unknown> };
export type AgentCanvasContext = { snapshot: CanvasAgentSnapshot; applyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot; undoOps: () => CanvasAgentSnapshot | null; canUndo: boolean; replayAgentEntry: (id: string) => boolean };

type AgentStorePatch = Partial<Omit<AgentStore, "setAgentState" | "setCanvasContext">>;

type AgentStore = {
    canvasContext: AgentCanvasContext | null;
    url: string;
    connected: boolean;
    enabled: boolean;
    activity: string;
    connectError: string;
    setAgentState: (patch: AgentStorePatch) => void;
    setCanvasContext: (context: AgentCanvasContext | null) => void;
};

export const useAgentStore = create<AgentStore>((set) => ({
    canvasContext: null,
    url: typeof window === "undefined" ? "" : window.location.origin,
    connected: false,
    enabled: true,
    activity: i18n.t("agent.state.ready"),
    connectError: "",
    setAgentState: (patch) => set(patch),
    setCanvasContext: (canvasContext) => set({ canvasContext }),
}));
