// Frozen wire types shared by the browser bridge and the local Agent service.
// Ops are flat: `{ ns, type, ...fields }`. The 10 canvas ops keep their field shapes and only gain `ns`.

export type AgentOp = { ns: string; type: string } & Record<string, unknown>;

export type AgentActionNamespace = {
    ns: string;
    title: string;
    description: string;
    ops: string[];
    danger?: boolean;
};

export type AgentPageSnapshot = {
    page: string;
    title: string;
    state: Record<string, unknown>;
    availableActions: AgentActionNamespace[];
};
