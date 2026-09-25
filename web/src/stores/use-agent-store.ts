import { create } from "zustand";
import i18n from "@/i18n";
import { AGENT_BRIDGE_URL, AGENT_TOKEN } from "@/constant/runtime-config";

import type { AgentOp } from "@/lib/agent/agent-ops";

export type AgentPendingToolCall = { requestId: string; name: string; input?: { ops?: AgentOp[]; path?: string; ns?: string } & Record<string, unknown> };
export type AgentPageContext = { page: string; title: string; state: Record<string, unknown> };

type AgentStorePatch = Partial<Omit<AgentStore, "setAgentState" | "setPageContext">>;

type AgentStore = {
    pageContext: AgentPageContext | null;
    url: string;
    token: string;
    connected: boolean;
    enabled: boolean;
    activity: string;
    connectError: string;
    setAgentState: (patch: AgentStorePatch) => void;
    setPageContext: (context: AgentPageContext | null) => void;
};

export const useAgentStore = create<AgentStore>((set) => ({
    pageContext: null,
    url: typeof window === "undefined" ? "" : AGENT_BRIDGE_URL,
    token: typeof window === "undefined" ? "" : AGENT_TOKEN,
    connected: false,
    enabled: true,
    activity: i18n.t("agent.state.ready"),
    connectError: "",
    setAgentState: (patch) => set(patch),
    setPageContext: (pageContext) => set({ pageContext }),
}));
