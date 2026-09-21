import { nanoid } from "nanoid";
import type { Dispatch, SetStateAction } from "react";

import { createPsLayerStyle } from "@/lib/canvas/ps-layer-styles";
import { psBoxUnion, psLayerBox, psLayerChildIds, psRotatePoint, psTopLayers } from "@/lib/canvas/smart-canvas";
import type { CanvasNodeData, CanvasPsLayer, CanvasPsLayerStyleType, CanvasPsParamValue } from "@/types/canvas";

export type PsResizeCorner = "nw" | "ne" | "sw" | "se";

type PsBox = { x: number; y: number; width: number; height: number };

const MIN_LAYER_SIZE = 8;
/** ax / ay pick the fixed edge: 0 keeps left/top, 1 keeps right/bottom. */
const RESIZE_ANCHORS: Record<PsResizeCorner, { ax: 0 | 1; ay: 0 | 1 }> = { nw: { ax: 1, ay: 1 }, ne: { ax: 0, ay: 1 }, sw: { ax: 1, ay: 0 }, se: { ax: 0, ay: 0 } };

/** Every layer document mutation funnels through here, so undo, autosave and persistence come from setNodes. */
export function commitBoardLayers(setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>, boardId: string, next: CanvasPsLayer[]) {
    const layers = syncPsGroupBoxes(next);
    setNodes((prev) => prev.map((node) => (node.id === boardId ? { ...node, metadata: { ...node.metadata, boardLayers: layers } } : node)));
}

export function findPsLayer(layers: CanvasPsLayer[], id: string) {
    return layers.find((layer) => layer.id === id);
}

export function psLayerCentre(layers: CanvasPsLayer[], layer: CanvasPsLayer) {
    const box = psLayerBox(layers, layer);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function syncPsGroupBoxes(layers: CanvasPsLayer[]) {
    return layers.map((layer) => (layer.kind === "group" ? { ...layer, ...psLayerBox(layers, layer) } : layer));
}

export function patchPsLayer(layers: CanvasPsLayer[], id: string, patch: Partial<CanvasPsLayer>) {
    return layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer));
}

export function addPsLayer(layers: CanvasPsLayer[], layer: CanvasPsLayer, groupId?: string) {
    const group = groupId ? findPsLayer(layers, groupId) : undefined;
    const next = [...layers, layer];
    return syncPsGroupBoxes(group && group.kind === "group" ? patchPsLayer(next, group.id, { children: [...(group.children || []), layer.id] }) : next);
}

export function addPsLayerAbove(layers: CanvasPsLayer[], layer: CanvasPsLayer, targetId?: string) {
    const target = targetId ? findPsLayer(layers, targetId) : undefined;
    if (!target) return addPsLayer(layers, layer);
    const parentId = childParentMap(layers).get(target.id);
    if (parentId) {
        const children = [...(findPsLayer(layers, parentId)?.children || [])];
        children.splice(children.indexOf(target.id) + 1, 0, layer.id);
        return syncPsGroupBoxes(patchPsLayer([...layers, layer], parentId, { children }));
    }
    const index = layers.findIndex((item) => item.id === target.id);
    return syncPsGroupBoxes([...layers.slice(0, index + 1), layer, ...layers.slice(index + 1)]);
}

export function patchPsLayerStyle(layers: CanvasPsLayer[], layerId: string, styleId: string, patch: { enabled?: boolean; params?: Record<string, CanvasPsParamValue> }) {
    const layer = findPsLayer(layers, layerId);
    if (!layer) return layers;
    return patchPsLayer(layers, layerId, { styles: (layer.styles || []).map((style) => (style.id === styleId ? { ...style, ...patch, params: patch.params ? { ...style.params, ...patch.params } : style.params } : style)) });
}

export function ensurePsLayerStyle(layers: CanvasPsLayer[], layerId: string, type: CanvasPsLayerStyleType) {
    const layer = findPsLayer(layers, layerId);
    if (!layer || layer.kind === "adjustment" || (layer.styles || []).some((style) => style.type === type)) return layers;
    return patchPsLayer(layers, layerId, { styles: [...(layer.styles || []), createPsLayerStyle(type)] });
}

/** Turns a text / shape / image / group layer into a pixel layer holding the given bitmap; a group's children are dropped with the bake. */
export function rasterizePsLayer(layers: CanvasPsLayer[], id: string, storageKey: string) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const children = new Set(layer.children || []);
    return syncPsGroupBoxes(
        layers
            .filter((item) => !children.has(item.id))
            .map((item) => (item.id === id ? { ...item, kind: "pixel" as const, storageKey, sourceNodeId: undefined, children: undefined, adjustment: undefined } : item)),
    );
}

export function removePsLayer(layers: CanvasPsLayer[], id: string) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const removed = new Set<string>([id, ...(layer.children || [])]);
    return syncPsGroupBoxes(layers.filter((item) => !removed.has(item.id)).map((item) => (item.children ? { ...item, children: item.children.filter((childId) => !removed.has(childId)) } : item)));
}

export function duplicatePsLayer(layers: CanvasPsLayer[], id: string, suffix: string, copyId: string) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const childCopies = (layer.children || []).flatMap((childId) => {
        const child = findPsLayer(layers, childId);
        return child ? [{ ...child, id: nanoid(), name: `${child.name} ${suffix}` }] : [];
    });
    const copy: CanvasPsLayer = { ...layer, id: copyId, name: `${layer.name} ${suffix}`, children: layer.children ? childCopies.map((child) => child.id) : undefined };
    const index = layers.findIndex((item) => item.id === id);
    return syncPsGroupBoxes([...layers.slice(0, index + 1), copy, ...childCopies, ...layers.slice(index + 1)]);
}

/** Groups are a single level: a group child is always an image or text layer, and a group is never nested. */
export function groupPsLayers(layers: CanvasPsLayer[], ids: string[], groupId: string, name: string) {
    const childIds = psLayerChildIds(layers);
    const selected = ids.flatMap((id) => {
        const layer = findPsLayer(layers, id);
        return layer && layer.kind !== "group" && !childIds.has(id) ? [layer] : [];
    });
    if (!selected.length) return layers;
    const box = psBoxUnion(selected.map((layer) => ({ x: layer.x, y: layer.y, width: layer.width, height: layer.height })))!;
    const index = Math.max(...selected.map((layer) => layers.findIndex((item) => item.id === layer.id)));
    const group: CanvasPsLayer = { id: groupId, name, kind: "group", children: selected.map((layer) => layer.id), ...box, rotation: 0, opacity: 1, blendMode: "normal", hidden: false, locked: false };
    return syncPsGroupBoxes([...layers.slice(0, index + 1), group, ...layers.slice(index + 1)]);
}

export function ungroupPsLayer(layers: CanvasPsLayer[], id: string) {
    const group = findPsLayer(layers, id);
    if (!group || group.kind !== "group") return layers;
    return syncPsGroupBoxes(layers.filter((layer) => layer.id !== id));
}

function childParentMap(layers: CanvasPsLayer[]) {
    const map = new Map<string, string>();
    layers.forEach((layer) => (layer.children || []).forEach((childId) => map.set(childId, layer.id)));
    return map;
}

function reorderTopLevel(layers: CanvasPsLayer[], order: string[]) {
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    const topLevel = new Set(psTopLayers(layers).map((layer) => layer.id));
    const queue = [...order];
    return layers.map((layer) => (topLevel.has(layer.id) ? byId.get(queue.shift()!)! : layer));
}

export function movePsLayerTo(layers: CanvasPsLayer[], dragId: string, targetId: string, position: "before" | "after" | "into") {
    const drag = findPsLayer(layers, dragId);
    const target = findPsLayer(layers, targetId);
    if (!drag || !target || dragId === targetId) return layers;
    const parentId = childParentMap(layers).get(targetId) || (target.kind === "group" && position === "into" ? targetId : "");
    if (drag.kind === "group" && parentId) return layers;
    const detached = layers.map((layer) => (layer.children?.includes(dragId) ? { ...layer, children: layer.children.filter((childId) => childId !== dragId) } : layer));
    const parent = parentId ? findPsLayer(detached, parentId) : undefined;
    const containerIds = (parent ? parent.children || [] : psTopLayers(detached).map((layer) => layer.id)).filter((id) => id !== dragId);
    const index = containerIds.indexOf(targetId);
    if (index < 0) return layers;
    const next = [...containerIds];
    next.splice(index + (position === "after" ? 1 : 0), 0, dragId);
    return syncPsGroupBoxes(parent && parentId ? patchPsLayer(detached, parentId, { children: next }) : reorderTopLevel(detached, next));
}

export function movePsLayerStep(layers: CanvasPsLayer[], id: string, direction: "forward" | "backward") {
    const parentId = childParentMap(layers).get(id);
    const parent = parentId ? findPsLayer(layers, parentId) : undefined;
    const ids = parent ? parent.children || [] : psTopLayers(layers).map((layer) => layer.id);
    const index = ids.indexOf(id);
    const target = index + (direction === "forward" ? 1 : -1);
    if (index < 0 || target < 0 || target >= ids.length) return layers;
    return movePsLayerTo(layers, id, ids[target], direction === "forward" ? "after" : "before");
}

function transformTargets(layer: CanvasPsLayer) {
    return layer.kind === "group" ? new Set([layer.id, ...(layer.children || [])]) : new Set([layer.id]);
}

export function translatePsLayer(layers: CanvasPsLayer[], id: string, dx: number, dy: number) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const targets = transformTargets(layer);
    return layers.map((item) => (targets.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
}

export function rotatePsLayer(layers: CanvasPsLayer[], id: string, deltaDegrees: number, centre: { x: number; y: number }) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const targets = transformTargets(layer);
    return layers.map((item) => {
        if (!targets.has(item.id)) return item;
        const next = psRotatePoint(item.x + item.width / 2, item.y + item.height / 2, centre, deltaDegrees);
        return { ...item, x: next.x - item.width / 2, y: next.y - item.height / 2, rotation: item.rotation + deltaDegrees };
    });
}

export function scalePsLayer(layers: CanvasPsLayer[], id: string, sx: number, sy: number, anchor: { x: number; y: number }) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const targets = transformTargets(layer);
    return layers.map((item) => {
        if (!targets.has(item.id)) return item;
        return { ...item, x: anchor.x + (item.x - anchor.x) * sx, y: anchor.y + (item.y - anchor.y) * sy, width: Math.max(1, item.width * sx), height: Math.max(1, item.height * sy), fontSize: item.fontSize ? Math.max(1, Math.round(item.fontSize * ((sx + sy) / 2))) : item.fontSize };
    });
}

function resizeBox(box: PsBox, pointer: { x: number; y: number }, corner: PsResizeCorner): PsBox {
    const anchor = RESIZE_ANCHORS[corner];
    const width = anchor.ax === 0 ? Math.max(MIN_LAYER_SIZE, pointer.x - box.x) : Math.max(MIN_LAYER_SIZE, box.x + box.width - pointer.x);
    const height = anchor.ay === 0 ? Math.max(MIN_LAYER_SIZE, pointer.y - box.y) : Math.max(MIN_LAYER_SIZE, box.y + box.height - pointer.y);
    return { x: anchor.ax === 0 ? box.x : box.x + box.width - width, y: anchor.ay === 0 ? box.y : box.y + box.height - height, width, height };
}

export function resizePsLayer(layers: CanvasPsLayer[], id: string, pointer: { x: number; y: number }, corner: PsResizeCorner) {
    const layer = findPsLayer(layers, id);
    if (!layer) return layers;
    const box = psLayerBox(layers, layer);
    const anchor = RESIZE_ANCHORS[corner];
    if (layer.kind === "group") {
        const resized = resizeBox(box, pointer, corner);
        const fixed = { x: anchor.ax === 0 ? box.x : box.x + box.width, y: anchor.ay === 0 ? box.y : box.y + box.height };
        return scalePsLayer(layers, id, resized.width / Math.max(1, box.width), resized.height / Math.max(1, box.height), fixed);
    }
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    const resized = resizeBox({ x: layer.x, y: layer.y, width: layer.width, height: layer.height }, psRotatePoint(pointer.x, pointer.y, centre, -layer.rotation), corner);
    const cornerOffset = { x: anchor.ax === 0 ? 0 : resized.width, y: anchor.ay === 0 ? 0 : resized.height };
    const fixedDoc = psRotatePoint(anchor.ax === 0 ? layer.x : layer.x + layer.width, anchor.ay === 0 ? layer.y : layer.y + layer.height, centre, layer.rotation);
    const offset = psRotatePoint(cornerOffset.x, cornerOffset.y, { x: 0, y: 0 }, layer.rotation);
    const scale = (resized.width / Math.max(1, layer.width) + resized.height / Math.max(1, layer.height)) / 2;
    return patchPsLayer(layers, id, { x: fixedDoc.x - offset.x, y: fixedDoc.y - offset.y, width: resized.width, height: resized.height, fontSize: layer.kind === "text" && layer.fontSize ? Math.max(1, Math.round(layer.fontSize * scale)) : layer.fontSize });
}
