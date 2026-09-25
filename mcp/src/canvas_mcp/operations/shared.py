"""Shared builders for translating high-level tools into ``app_apply_ops``."""

from __future__ import annotations

from typing import Any

from canvas_mcp.types import AgentSnapshot, CanvasNode

CanvasToolRequest = dict[str, Any]


def apply_ops(ops: list[Any]) -> CanvasToolRequest:
    """Wrap a list of canvas ops into the single batch tool request."""
    return {"name": "app_apply_ops", "input": {"ops": ops}}


def omit_none(data: dict[str, Any]) -> dict[str, Any]:
    """Drop ``None``-valued keys, matching how ``JSON.stringify`` drops ``undefined``."""
    return {key: value for key, value in data.items() if value is not None}


def text_node_op(input_data: dict[str, Any], x: float, y: float) -> dict[str, Any]:
    """Build an ``add_node`` op for a text node."""
    return omit_none(
        {
            "type": "add_node",
            "id": input_data.get("id"),
            "nodeType": "text",
            "title": input_data.get("title"),
            "position": {"x": x, "y": y},
            "width": input_data.get("width"),
            "height": input_data.get("height"),
            "metadata": {"content": input_data.get("text") or "", "status": "success", "fontSize": 14},
        }
    )


def config_node_op(node_id: str, input_data: dict[str, Any], x: float, y: float) -> dict[str, Any]:
    """Build an ``add_node`` op for a generation config node."""
    mode = generation_mode(input_data.get("mode"))
    prompt = str(input_data.get("prompt") or "")
    return omit_none(
        {
            "type": "add_node",
            "id": node_id,
            "nodeType": "config",
            "title": str(input_data.get("title") or generation_title(mode)),
            "position": {"x": x, "y": y},
            "width": input_data.get("width"),
            "height": input_data.get("height"),
            "metadata": clean_record(
                {
                    "generationMode": mode,
                    "composerContent": prompt,
                    "prompt": prompt,
                    "status": "idle",
                    "model": input_data.get("model"),
                    "size": input_data.get("size"),
                    "quality": input_data.get("quality"),
                    "count": input_data.get("count"),
                    "seconds": input_data.get("seconds"),
                    "vquality": input_data.get("vquality"),
                    "generateAudio": input_data.get("generateAudio"),
                    "watermark": input_data.get("watermark"),
                    "videoMode": input_data.get("videoMode"),
                    "audioVoice": input_data.get("audioVoice"),
                    "audioFormat": input_data.get("audioFormat"),
                    "audioSpeed": input_data.get("audioSpeed"),
                    "audioInstructions": input_data.get("audioInstructions"),
                }
            ),
        }
    )


def run_generation_op(node_id: str, mode: str, prompt: str | None = None) -> dict[str, Any]:
    """Build a ``run_generation`` op."""
    return omit_none({"type": "run_generation", "nodeId": node_id, "mode": mode, "prompt": prompt})


def generation_mode(value: Any) -> str:
    """Normalise an unknown generation mode to one the canvas supports."""
    return value if value in ("text", "video", "audio") else "image"


def generation_title(mode: str) -> str:
    """Default node title for a generation mode."""
    if mode == "text":
        return "文本生成"
    if mode == "video":
        return "视频生成"
    if mode == "audio":
        return "音频生成"
    return "图片生成"


def find_node(state: AgentSnapshot | None, node_id: str) -> CanvasNode | None:
    """Find a node by id in the current canvas snapshot."""
    return next((node for node in (state or {}).get("nodes") or [] if node.get("id") == node_id), None)


def clean_record(value: dict[str, Any]) -> dict[str, Any]:
    """Remove unset generation parameters (``None`` or empty string)."""
    return {key: item for key, item in value.items() if item is not None and item != ""}
