"""Shared builders for translating high-level tools into ``app_apply_ops``."""

from __future__ import annotations

from typing import Any

CanvasToolRequest = dict[str, Any]


def apply_ops(ops: list[Any]) -> CanvasToolRequest:
    """Wrap a list of canvas ops into the single batch tool request."""
    return {"name": "app_apply_ops", "input": {"ops": ops}}


def omit_none(data: dict[str, Any]) -> dict[str, Any]:
    """Drop ``None``-valued keys, matching how ``JSON.stringify`` drops ``undefined``."""
    return {key: value for key, value in data.items() if value is not None}


def text_node_op(input_data: dict[str, Any], position: dict[str, float] | None) -> dict[str, Any]:
    """Build an ``add_node`` op for a text node; ``position`` is omitted when unknown."""
    return omit_none(
        {
            "type": "add_node",
            "id": input_data.get("id"),
            "nodeType": "text",
            "title": input_data.get("title"),
            "position": position,
            "width": input_data.get("width"),
            "height": input_data.get("height"),
            "metadata": {"content": input_data.get("text") or "", "status": "success", "fontSize": 14},
        }
    )


def generation_node_op(node_id: str, input_data: dict[str, Any], position: dict[str, float] | None) -> dict[str, Any]:
    """Build an ``add_node`` op for a dedicated generation node; ``position`` is omitted when unknown."""
    mode = generation_mode(input_data.get("mode"))
    return omit_none(
        {
            "type": "add_node",
            "id": node_id,
            "nodeType": generation_node_type(mode),
            "title": str(input_data.get("title") or generation_title(mode)),
            "position": position,
            "width": input_data.get("width"),
            "height": input_data.get("height"),
            "metadata": clean_record(
                {
                    "generationMode": mode,
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


def prompt_node_op(node_id: str, mode: str, prompt: str, title: str, position: dict[str, float] | None) -> dict[str, Any]:
    """Build an ``add_node`` op for the prompt node feeding a generation node; ``position`` is omitted when unknown."""
    return omit_none(
        {
            "type": "add_node",
            "id": node_id,
            "nodeType": prompt_node_type(mode),
            "title": title,
            "position": position,
            "metadata": {"prompt": prompt, "status": "success"},
        }
    )


def run_generation_op(node_id: str, mode: str, prompt: str | None = None) -> dict[str, Any]:
    """Build a ``run_generation`` op."""
    return omit_none({"type": "run_generation", "nodeId": node_id, "mode": mode, "prompt": prompt})


def generation_mode(value: Any) -> str:
    """Normalise an unknown generation mode to one the canvas supports."""
    return value if value in ("video", "audio") else "image"


def generation_node_type(mode: str) -> str:
    """Dedicated generation node type for a generation mode."""
    if mode == "video":
        return "video-generation"
    if mode == "audio":
        return "speech-generation"
    return "image-generation"


def prompt_node_type(mode: str) -> str:
    """Prompt node type feeding a generation mode."""
    if mode == "video":
        return "video-prompt"
    if mode == "audio":
        return "speech-prompt"
    return "prompt"


def generation_title(mode: str) -> str:
    """Default node title for a generation mode."""
    if mode == "video":
        return "视频生成"
    if mode == "audio":
        return "语音生成"
    return "图片生成"


def clean_record(value: dict[str, Any]) -> dict[str, Any]:
    """Remove unset generation parameters (``None`` or empty string)."""
    return {key: item for key, item in value.items() if item is not None and item != ""}
