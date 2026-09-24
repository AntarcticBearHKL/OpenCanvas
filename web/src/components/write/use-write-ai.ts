import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import i18n from "@/i18n";
import { runGenerationTaskWithRetry } from "@/lib/canvas/canvas-generation-helpers";
import { findNode } from "@/lib/write/outline";
import { childKindOf } from "@/lib/write/presets";
import { buildOutlineExpandPrompt, buildWritePrompt, parseOutlineExpansion } from "@/lib/write/write-prompt";
import { requestImageQuestion } from "@/services/api/image";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingStore } from "@/stores/use-writing-store";
import type { WritingProject } from "@/types/writing";

export type WriteAiMode = "continue" | "rewrite" | "expand" | "condense" | "polish" | "dialogue";

type WriteAiState = { running: boolean; mode: WriteAiMode | null; text: string; error: string | null };

const IDLE_STATE: WriteAiState = { running: false, mode: null, text: "", error: null };

function projectFor(outlineId: string): WritingProject | null {
    const projects = useWritingStore.getState().projects;
    const projectId = useWriteUiStore.getState().projectId;
    return projects.find((project) => project.id === projectId) ?? projects.find((project) => project.outline.some((node) => node.id === outlineId)) ?? null;
}

export function useWriteAi(): {
    state: { running: boolean; mode: WriteAiMode | null; text: string; error: string | null };
    runProse: (outlineId: string, mode: WriteAiMode, instruction?: string, selection?: string) => Promise<void>;
    stop: () => void;
    reset: () => void;
    expandOutline: (nodeId: string, instruction?: string) => Promise<boolean>;
} {
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [state, setState] = useState<WriteAiState>(IDLE_STATE);
    const controllerRef = useRef<AbortController | null>(null);

    const config: AiConfig = useMemo(
        () => ({ ...effectiveConfig, model: resolveModelForCapability(effectiveConfig, effectiveConfig.textModel || effectiveConfig.model, "text") }),
        [effectiveConfig],
    );

    useEffect(() => () => controllerRef.current?.abort(), []);

    const begin = useCallback(() => {
        const controller = new AbortController();
        controllerRef.current?.abort();
        controllerRef.current = controller;
        return controller;
    }, []);

    const finish = useCallback((controller: AbortController) => {
        if (controllerRef.current !== controller) return;
        controllerRef.current = null;
        setState((prev) => ({ ...prev, running: false }));
    }, []);

    const fail = useCallback(() => setState((prev) => ({ ...prev, error: i18n.t("writing.ai.failed") })), []);

    const runProse = useCallback(
        async (outlineId: string, mode: WriteAiMode, instruction = "", selection = "") => {
            const project = projectFor(outlineId);
            const node = project ? findNode(project.outline, outlineId) : null;
            if (!project || !node) {
                setState((prev) => ({ ...prev, mode, error: i18n.t("writing.ai.failed") }));
                return;
            }
            if (!isAiConfigReady(config, config.model)) {
                setState((prev) => ({ ...prev, mode, error: i18n.t("writing.ai.needModel") }));
                return;
            }
            const prompt = buildWritePrompt(project, node, [selection.trim(), instruction.trim()].filter(Boolean).join("\n\n"), mode);
            const controller = begin();
            setState({ running: true, mode, text: "", error: null });
            try {
                const answer = await requestImageQuestion(
                    config,
                    [{ role: "user", content: prompt }],
                    (text) => {
                        if (controller.signal.aborted) return;
                        setState((prev) => ({ ...prev, text }));
                    },
                    { signal: controller.signal },
                );
                if (!controller.signal.aborted) setState((prev) => ({ ...prev, text: prev.text || answer }));
            } catch {
                if (!controller.signal.aborted) fail();
            } finally {
                finish(controller);
            }
        },
        [begin, config, fail, finish, isAiConfigReady],
    );

    const stop = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState((prev) => ({ ...prev, running: false }));
    }, []);

    const reset = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState(IDLE_STATE);
    }, []);

    const expandOutline = useCallback(
        async (nodeId: string, instruction = "") => {
            const project = projectFor(nodeId);
            const node = project ? findNode(project.outline, nodeId) : null;
            if (!project || !node) {
                fail();
                return false;
            }
            const childKind = childKindOf(project.template, node.kind);
            if (!childKind) return false;
            if (!isAiConfigReady(config, config.model)) {
                setState((prev) => ({ ...prev, error: i18n.t("writing.ai.needModel") }));
                return false;
            }
            const prompt = buildOutlineExpandPrompt(project, node, instruction);
            const controller = begin();
            setState({ running: true, mode: null, text: "", error: null });
            try {
                const raw = await runGenerationTaskWithRetry(() => requestImageQuestion(config, [{ role: "user", content: prompt }], () => {}, { signal: controller.signal }), {
                    signal: controller.signal,
                });
                const children = parseOutlineExpansion(raw);
                if (!children) {
                    if (!controller.signal.aborted) fail();
                    return false;
                }
                const store = useWritingStore.getState();
                children.forEach((child) => {
                    const childId = store.addOutlineNode(project.id, node.id, childKind, child.title);
                    if (child.description) store.updateOutlineNode(project.id, childId, { summary: child.description });
                });
                return true;
            } catch {
                if (!controller.signal.aborted) fail();
                return false;
            } finally {
                finish(controller);
            }
        },
        [begin, config, fail, finish, isAiConfigReady],
    );

    return { state, runProse, stop, reset, expandOutline };
}
