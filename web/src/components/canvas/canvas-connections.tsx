import { memo } from "react";

import { connectionGeometry, connectionRelationLabel } from "@/lib/canvas/canvas-connections";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export const ConnectionPath = memo(function ConnectionPath({
    connection,
    from,
    to,
    active,
    referenceIndex,
    onSelect,
    scale,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    referenceIndex?: number;
    onSelect: (connectionId: string) => void;
    scale: number;
}) {
    const theme = useCanvasTheme();
    const { startX, startY, endX, endY, pathD } = connectionGeometry(from, to);
    const label = connectionRelationLabel(connection, from, to, referenceIndex);

    return (
        <g>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect(connection.id);
                }}
            />
            <path
                d={pathD}
                stroke={active ? theme.node.activeStroke : theme.node.faint}
                strokeWidth={active ? 3 : 2}
                strokeOpacity={active ? 1 : 0.82}
                fill="none"
                style={{ pointerEvents: "none" }}
            />
            {label ? (
                <text
                    data-connection-id={connection.id}
                    className={referenceIndex !== undefined ? "canvas-connection-label-in" : undefined}
                    x={(startX + endX) / 2}
                    y={(startY + endY) / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12 / scale}
                    fontWeight={500}
                    fill={active ? theme.node.activeStroke : theme.node.faint}
                    stroke={theme.canvas.background}
                    strokeWidth={4 / scale}
                    strokeOpacity={active ? 1 : 0.82}
                    paintOrder="stroke"
                    style={{ pointerEvents: "all", cursor: "pointer" }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect(connection.id);
                    }}
                >
                    {label}
                </text>
            ) : null}
        </g>
    );
});

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
    const theme = useCanvasTheme();
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

    return <path d={pathD} stroke={theme.node.activeStroke} strokeWidth="2" fill="none" strokeDasharray="5,5" />;
}
