import { useEffect } from "react";

import i18n from "@/i18n";
import { registerAgentNamespace } from "@/lib/agent/action-registry";
import type { AgentOp } from "@/lib/agent/agent-ops";
import { runCanvasAgentOps } from "@/lib/canvas/canvas-agent-runtime";
import { CANVAS_AGENT_OP_TYPES, CANVAS_AGENT_SCHEMA } from "@/pages/canvas/hooks/use-agent-bridge";

function opsProjectId(ops: AgentOp[]) {
    for (const op of ops) {
        if (typeof op.projectId === "string" && op.projectId) return op.projectId;
    }
    return undefined;
}

/** Register the `canvas` action namespace once, routing each batch by its projectId. */
export function useCanvasAgentNamespace() {
    useEffect(() => {
        return registerAgentNamespace({
            ns: "canvas",
            title: i18n.t("agent.namespace.canvas.title"),
            description: i18n.t("agent.namespace.canvas.description"),
            ops: CANVAS_AGENT_OP_TYPES,
            schema: CANVAS_AGENT_SCHEMA,
            applyOps: (ops: AgentOp[]) => runCanvasAgentOps(opsProjectId(ops), ops),
        });
    }, []);
}
