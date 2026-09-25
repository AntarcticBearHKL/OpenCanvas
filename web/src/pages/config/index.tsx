import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { AppConfigPanel } from "@/components/layout/app-config-modal";
import { registerAgentNamespace } from "@/lib/agent/action-registry";
import type { AgentOp } from "@/lib/agent/agent-ops";
import {
    applyConfigChannelOp,
    CONFIG_AGENT_OP_TYPES,
    CONFIG_AGENT_SCHEMA,
    CONFIG_MODEL_FIELDS,
    normalizeConfigScalar,
    redactConfig,
    revealConfigKeys,
    type ConfigAgentOp,
} from "@/lib/agent/config-agent-ops";
import { useAgentStore } from "@/stores/use-agent-store";
import { useConfigStore } from "@/stores/use-config-store";

export default function ConfigPage() {
    const { t } = useTranslation();
    const setPageContext = useAgentStore((state) => state.setPageContext);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);

    const pageState = useMemo<Record<string, unknown>>(() => redactConfig(config), [config]);

    const applyOps = useCallback(
        (ops: AgentOp[]) => {
            let revealed: ReturnType<typeof revealConfigKeys> | undefined;
            let credentialImport: ReturnType<typeof importChannelCredentials> | undefined;
            ops.map(({ ns, ...op }) => op as ConfigAgentOp).forEach((op) => {
                switch (op.type) {
                    case "reveal_key":
                        revealed = revealConfigKeys(useConfigStore.getState().config, op.channelId);
                        return;
                    case "import_credentials":
                        credentialImport = importChannelCredentials({ baseUrl: op.baseUrl, apiKey: op.apiKey });
                        return;
                    case "set": {
                        const scalar = normalizeConfigScalar(op.key, op.value);
                        updateConfig(scalar.key, scalar.value);
                        return;
                    }
                    case "select_model": {
                        const field = CONFIG_MODEL_FIELDS[op.capability];
                        if (!field) throw new Error(`不支持的模型能力：${String(op.capability)}`);
                        updateConfig(field, op.value);
                        return;
                    }
                    case "channel.add":
                    case "channel.update":
                    case "channel.remove":
                    case "set_provider_key":
                    case "channel.add_model":
                    case "channel.remove_model":
                    case "channel.set_model_capability":
                        updateConfig("channels", applyConfigChannelOp(useConfigStore.getState().config, op));
                        return;
                }
            });
            const state = redactConfig(useConfigStore.getState().config);
            return { ...state, ...(revealed ? { revealed } : {}), ...(credentialImport ? { credentialImport } : {}) };
        },
        [importChannelCredentials, updateConfig],
    );

    useEffect(() => {
        const unregister = registerAgentNamespace({
            ns: "config",
            title: i18n.t("agent.namespace.config.title"),
            description: i18n.t("agent.namespace.config.description"),
            ops: CONFIG_AGENT_OP_TYPES,
            danger: true,
            schema: CONFIG_AGENT_SCHEMA,
            applyOps,
        });
        return unregister;
    }, [applyOps]);

    useEffect(() => {
        setPageContext({ page: "config", title: t("config.title"), state: pageState });
        return () => setPageContext(null);
    }, [pageState, setPageContext, t]);

    return (
        <main className="flex h-full min-h-0 flex-col bg-background">
            <div className="shrink-0 px-5 pb-1 pt-5 glass-surface">
                <h1 className="text-xl font-semibold text-foreground">{t("config.title")}</h1>
            </div>
            <div className="min-h-0 flex-1">
                <AppConfigPanel />
            </div>
        </main>
    );
}
