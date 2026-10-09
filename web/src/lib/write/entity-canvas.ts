import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { formatEntityBlock } from "@/lib/write/entity";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingStore } from "@/stores/use-writing-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasScope } from "@/types/canvas";
import type { WriteEntityKind } from "@/types/writing";

const ENTITY_TAB_PREFIX = "entity:";
const GRAPH_TAB_ID = "graph";

export function entityCanvasFor(writeProjectId: string, entityId: string): CanvasProject | null {
    return useCanvasStore.getState().projects.find((project) => project.scope?.writeProjectId === writeProjectId && project.scope.entityId === entityId) ?? null;
}

function canvasById(id: string | undefined): CanvasProject | null {
    return id ? useCanvasStore.getState().projects.find((project) => project.id === id) ?? null : null;
}

export function ensureEntityCanvas(writeProjectId: string, entityId: string, kind: WriteEntityKind): string {
    const found = entityCanvasFor(writeProjectId, entityId);
    const entity = useWritingStore.getState().projects.find((project) => project.id === writeProjectId)?.entities.find((item) => item.id === entityId);
    if (found) {
        if (entity && entity.canvasId !== found.id) useWritingStore.getState().setEntityCanvas(writeProjectId, entityId, found.id);
        return found.id;
    }
    const linked = canvasById(entity?.canvasId);
    if (linked) {
        if (!linked.scope) useCanvasStore.getState().updateProject(linked.id, { scope: { writeProjectId, role: kind, entityId } });
        return linked.id;
    }
    const canvasId = useCanvasStore.getState().createProject(entity?.name.trim() || i18n.t("writing.entity.untitled"));
    useCanvasStore.getState().updateProject(canvasId, { scope: { writeProjectId, role: kind, entityId } });
    useWritingStore.getState().setEntityCanvas(writeProjectId, entityId, canvasId);
    return canvasId;
}

function seedGraphCanvas(writeProjectId: string, canvasId: string) {
    const entities = useWritingStore.getState().projects.find((project) => project.id === writeProjectId)?.entities ?? [];
    if (!entities.length) return;
    const radius = Math.max(220, entities.length * 64);
    const nodes: CanvasNodeData[] = entities.map((entity, index) => {
        const angle = (index / entities.length) * Math.PI * 2;
        return {
            id: nanoid(),
            type: CanvasNodeType.EntityRef,
            title: entity.name.trim() || i18n.t("writing.entity.untitled"),
            position: { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) },
            width: 260,
            height: 104,
            metadata: { entityRefId: entity.id, entityRefKind: entity.kind, entityRefName: entity.name },
        };
    });
    useCanvasStore.getState().updateProject(canvasId, { nodes });
}

export function ensureGraphCanvas(writeProjectId: string): string {
    const project = useWritingStore.getState().projects.find((item) => item.id === writeProjectId);
    const linked = canvasById(project?.graphCanvasId);
    if (linked) {
        if (!linked.scope) useCanvasStore.getState().updateProject(linked.id, { scope: { writeProjectId, role: "graph" } });
        return linked.id;
    }
    const existing = useCanvasStore.getState().projects.find((item) => item.scope?.writeProjectId === writeProjectId && item.scope.role === "graph");
    if (existing) {
        useWritingStore.getState().setGraphCanvas(writeProjectId, existing.id);
        return existing.id;
    }
    const canvasId = useCanvasStore.getState().createProject(i18n.t("writing.graph.title"));
    useCanvasStore.getState().updateProject(canvasId, { scope: { writeProjectId, role: "graph" } });
    useWritingStore.getState().setGraphCanvas(writeProjectId, canvasId);
    seedGraphCanvas(writeProjectId, canvasId);
    return canvasId;
}

export function openEntityTab(writeProjectId: string, entityId: string, kind: WriteEntityKind) {
    const canvasId = ensureEntityCanvas(writeProjectId, entityId, kind);
    useWriteUiStore.getState().openTab({ id: `${ENTITY_TAB_PREFIX}${entityId}`, kind: "entity", entityId, canvasId });
}

export function openGraphTab(writeProjectId: string) {
    useWriteUiStore.getState().openTab({ id: GRAPH_TAB_ID, kind: "graph", canvasId: ensureGraphCanvas(writeProjectId) });
}

export function backlinksFor(writeProjectId: string, entityId: string) {
    const selfId = entityCanvasFor(writeProjectId, entityId)?.id;
    return useCanvasStore
        .getState()
        .projects.filter((project) => project.scope?.writeProjectId === writeProjectId && project.id !== selfId)
        .flatMap((project) =>
            project.nodes
                .filter((node) => node.type === CanvasNodeType.EntityRef && node.metadata?.entityRefId === entityId)
                .map((node) => ({ canvasId: project.id, title: project.title, role: project.scope!.role as CanvasScope["role"], name: node.metadata?.entityRefName || node.title })),
        );
}

export function entityContextFor(writeProjectId: string, entityId: string): string {
    const project = useWritingStore.getState().projects.find((item) => item.id === writeProjectId);
    const entity = project?.entities.find((item) => item.id === entityId);
    if (!project || !entity) return "";
    const lines: string[] = [formatEntityBlock(entity)];
    const canvas = entityCanvasFor(writeProjectId, entityId) ?? canvasById(entity.canvasId);
    if (canvas) {
        const texts = canvas.nodes
            .filter((node) => node.type === CanvasNodeType.Text && node.metadata?.content?.trim())
            .map((node) => `${node.title}：${node.metadata!.content!.trim()}`);
        if (texts.length) lines.push(`画布：${texts.join(" / ")}`);
        const refs = canvas.nodes.filter((node) => node.type === CanvasNodeType.EntityRef && node.metadata?.entityRefId).map((node) => node.metadata?.entityRefName || node.title);
        if (refs.length) lines.push(`关联：${refs.join("、")}`);
    }
    const links = backlinksFor(writeProjectId, entityId);
    if (links.length) lines.push(`被引用：${links.map((link) => `${link.name}（${link.title}）`).join("、")}`);
    return lines.join("\n");
}

export function deleteEntityCascade(writeProjectId: string, entityId: string) {
    const entity = useWritingStore.getState().projects.find((item) => item.id === writeProjectId)?.entities.find((item) => item.id === entityId);
    const canvas = entityCanvasFor(writeProjectId, entityId) ?? canvasById(entity?.canvasId);
    if (canvas) useCanvasStore.getState().deleteProjects([canvas.id]);
    useCanvasStore
        .getState()
        .projects.filter((project) => project.scope?.writeProjectId === writeProjectId)
        .forEach((project) => {
            const nodes = project.nodes.filter((node) => !(node.type === CanvasNodeType.EntityRef && node.metadata?.entityRefId === entityId));
            if (nodes.length !== project.nodes.length) useCanvasStore.getState().updateProject(project.id, { nodes });
        });
    useWritingStore.getState().removeEntity(writeProjectId, entityId);
    useWriteUiStore.getState().closeTab(`${ENTITY_TAB_PREFIX}${entityId}`);
}
