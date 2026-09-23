"""The 33 canvas tools: names, verbatim descriptions, and input schemas.

Port of ``web/server/canvas/schemas.ts``. Tool names and Chinese descriptions are
copied verbatim; the zod schemas are re-expressed as Pydantic models whose JSON
Schema is equivalent.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal[
    "image",
    "text",
    "prompt",
    "music-prompt",
    "speech-prompt",
    "video-prompt",
    "config",
    "image-generation",
    "speech-generation",
    "music-generation",
    "video-generation",
    "video",
    "audio",
    "smart-canvas",
    "assets",
    "recording",
    "image-modifier",
    "story",
]
GenerationMode = Literal["text", "image", "video", "audio"]
AlignMode = Literal["left", "center-x", "right", "top", "center-y", "bottom", "distribute-x", "distribute-y"]

TOOL_NAMES: tuple[str, ...] = (
    "site_navigate",
    "canvas_list_projects",
    "canvas_get_state",
    "canvas_get_selection",
    "canvas_export_snapshot",
    "canvas_apply_ops",
    "canvas_create_node",
    "canvas_create_text_node",
    "canvas_create_text_nodes",
    "canvas_create_config_node",
    "canvas_create_image_prompt_flow",
    "canvas_create_generation_flow",
    "canvas_generate_text",
    "canvas_generate_image",
    "canvas_generate_video",
    "canvas_generate_audio",
    "canvas_update_node",
    "canvas_update_node_text",
    "canvas_move_nodes",
    "canvas_resize_node",
    "canvas_set_node_flags",
    "canvas_bulk_rename",
    "canvas_align_nodes",
    "canvas_duplicate_node",
    "canvas_delete_nodes",
    "canvas_connect_nodes",
    "canvas_select_nodes",
    "canvas_set_viewport",
    "canvas_run_generation",
    "canvas_expand_story",
    "generation_get_status",
    "assets_list",
    "assets_add",
)


class PositionInput(BaseModel):
    x: float
    y: float


class ViewportInput(BaseModel):
    x: float
    y: float
    k: float


class _Op(BaseModel):
    """Canvas op: zod used ``.passthrough()``, so unknown keys are preserved."""

    model_config = ConfigDict(extra="allow")


class AddNodeOp(_Op):
    type: Literal["add_node"]
    nodeType: NodeType | None = None
    id: str | None = None
    title: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    position: PositionInput | None = None
    metadata: dict[str, Any] | None = None


class UpdateNodeOp(_Op):
    type: Literal["update_node"]
    id: str
    patch: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class DeleteNodeOp(_Op):
    type: Literal["delete_node"]
    id: str | None = None
    ids: list[str] | None = None
    nodeType: NodeType | None = None


class DeleteConnectionsOp(_Op):
    type: Literal["delete_connections"]
    id: str | None = None
    ids: list[str] | None = None
    all: bool | None = None


class ConnectNodesOp(_Op):
    type: Literal["connect_nodes"]
    id: str | None = None
    fromNodeId: str
    toNodeId: str
    relation: str | None = None


class SetViewportOp(_Op):
    type: Literal["set_viewport"]
    viewport: ViewportInput


class SelectNodesOp(_Op):
    type: Literal["select_nodes"]
    ids: list[str]


class RunGenerationOp(_Op):
    type: Literal["run_generation"]
    nodeId: str
    mode: GenerationMode | None = None
    prompt: str | None = None


class ArrangeBoardOp(_Op):
    type: Literal["arrange_board"]
    id: str


class ExpandStoryOp(_Op):
    type: Literal["expand_story"]
    nodeId: str
    instructions: str | None = None


class PlaceOnBoardOp(_Op):
    type: Literal["place_on_board"]
    nodeId: str
    boardId: str | None = None


CanvasOp = Annotated[
    AddNodeOp
    | UpdateNodeOp
    | DeleteNodeOp
    | DeleteConnectionsOp
    | ConnectNodesOp
    | SetViewportOp
    | SelectNodesOp
    | RunGenerationOp
    | ExpandStoryOp
    | ArrangeBoardOp
    | PlaceOnBoardOp,
    Field(discriminator="type"),
]


class TextNodeInput(BaseModel):
    text: str
    title: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None


class GenerationOptions(BaseModel):
    model: str | None = None
    size: str | None = None
    quality: str | None = None
    count: float | None = None
    seconds: str | None = None
    vquality: str | None = None
    generateAudio: str | None = None
    watermark: str | None = None
    videoMode: str | None = None
    audioVoice: str | None = None
    audioFormat: str | None = None
    audioSpeed: str | None = None
    audioInstructions: str | None = None


class GenerationFlowInput(BaseModel):
    prompt: str
    title: str | None = None
    x: float | None = None
    y: float | None = None
    referenceNodeIds: list[str] | None = None


class MoveItem(BaseModel):
    id: str
    x: float | None = None
    y: float | None = None
    dx: float | None = None
    dy: float | None = None


class ConnectionInput(BaseModel):
    fromNodeId: str
    toNodeId: str
    relation: str | None = None


class PassthroughInput(BaseModel):
    model_config = ConfigDict(extra="allow")


class SiteNavigateInput(BaseModel):
    path: str


class ListProjectsInput(BaseModel):
    keyword: str | None = None
    page: float | None = None
    pageSize: float | None = None


class ApplyOpsInput(BaseModel):
    ops: list[CanvasOp]


class CreateNodeInput(BaseModel):
    nodeType: NodeType
    title: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    metadata: dict[str, Any] | None = None


class CreateTextNodeInput(BaseModel):
    text: str | None = None
    x: float | None = None
    y: float | None = None
    title: str | None = None
    width: float | None = None
    height: float | None = None


class CreateTextNodesInput(BaseModel):
    items: list[TextNodeInput] = Field(min_length=1)
    x: float | None = None
    y: float | None = None
    gap: float | None = None
    direction: Literal["row", "column"] | None = None


class CreateConfigNodeInput(GenerationOptions):
    prompt: str | None = None
    mode: GenerationMode | None = None
    title: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    autoRun: bool | None = None


class CreateImagePromptFlowInput(GenerationOptions):
    prompt: str
    x: float | None = None
    y: float | None = None
    autoRun: bool | None = None


class CreateGenerationFlowInput(GenerationFlowInput, GenerationOptions):
    mode: GenerationMode | None = None
    autoRun: bool | None = None


class GenerateTextInput(GenerationFlowInput, GenerationOptions):
    pass


class GenerateImageInput(GenerationFlowInput, GenerationOptions):
    pass


class GenerateVideoInput(GenerationFlowInput, GenerationOptions):
    pass


class GenerateAudioInput(GenerationFlowInput, GenerationOptions):
    pass


class UpdateNodeInput(BaseModel):
    id: str
    patch: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class UpdateNodeTextInput(BaseModel):
    id: str
    text: str
    title: str | None = None


class MoveNodesInput(BaseModel):
    items: list[MoveItem] = Field(min_length=1)


class ResizeNodeInput(BaseModel):
    id: str
    width: float
    height: float
    freeResize: bool | None = None


class SetNodeFlagsInput(BaseModel):
    ids: list[str] = Field(min_length=1)
    locked: bool | None = None
    hidden: bool | None = None


class BulkRenameInput(BaseModel):
    ids: list[str] = Field(min_length=1)
    title: str


class AlignNodesInput(BaseModel):
    ids: list[str] = Field(min_length=2)
    mode: AlignMode


class DuplicateNodeInput(BaseModel):
    id: str
    dx: float | None = None
    dy: float | None = None


class DeleteNodesInput(BaseModel):
    ids: list[str] = Field(min_length=1)


class ConnectNodesInput(BaseModel):
    connections: list[ConnectionInput] = Field(min_length=1)


class SelectNodesInput(BaseModel):
    ids: list[str]


class SetViewportInput(BaseModel):
    viewport: ViewportInput


class RunGenerationInput(BaseModel):
    nodeId: str
    mode: GenerationMode | None = None
    prompt: str | None = None


class ExpandStoryInput(BaseModel):
    nodeId: str
    instructions: str | None = None


class GenerationStatusInput(BaseModel):
    scope: Literal["all", "canvas"] | None = None
    taskId: str | None = None
    nodeIds: list[str] | None = None
    limit: float | None = None


class AssetsListInput(BaseModel):
    kind: Literal["all", "text", "image", "video"] | None = None
    keyword: str | None = None
    page: float | None = None
    pageSize: float | None = None


class AssetsAddInput(BaseModel):
    kind: Literal["text", "image"]
    title: str
    content: str | None = None
    imageUrl: str | None = None
    tags: list[str] | None = None
    source: str | None = None
    note: str | None = None


INPUT_MODELS: dict[str, type[BaseModel]] = {
    "site_navigate": SiteNavigateInput,
    "canvas_list_projects": ListProjectsInput,
    "canvas_get_state": PassthroughInput,
    "canvas_get_selection": PassthroughInput,
    "canvas_export_snapshot": PassthroughInput,
    "canvas_apply_ops": ApplyOpsInput,
    "canvas_create_node": CreateNodeInput,
    "canvas_create_text_node": CreateTextNodeInput,
    "canvas_create_text_nodes": CreateTextNodesInput,
    "canvas_create_config_node": CreateConfigNodeInput,
    "canvas_create_image_prompt_flow": CreateImagePromptFlowInput,
    "canvas_create_generation_flow": CreateGenerationFlowInput,
    "canvas_generate_text": GenerateTextInput,
    "canvas_generate_image": GenerateImageInput,
    "canvas_generate_video": GenerateVideoInput,
    "canvas_generate_audio": GenerateAudioInput,
    "canvas_update_node": UpdateNodeInput,
    "canvas_update_node_text": UpdateNodeTextInput,
    "canvas_move_nodes": MoveNodesInput,
    "canvas_resize_node": ResizeNodeInput,
    "canvas_set_node_flags": SetNodeFlagsInput,
    "canvas_bulk_rename": BulkRenameInput,
    "canvas_align_nodes": AlignNodesInput,
    "canvas_duplicate_node": DuplicateNodeInput,
    "canvas_delete_nodes": DeleteNodesInput,
    "canvas_connect_nodes": ConnectNodesInput,
    "canvas_select_nodes": SelectNodesInput,
    "canvas_set_viewport": SetViewportInput,
    "canvas_run_generation": RunGenerationInput,
    "canvas_expand_story": ExpandStoryInput,
    "generation_get_status": GenerationStatusInput,
    "assets_list": AssetsListInput,
    "assets_add": AssetsAddInput,
}

INPUT_SCHEMAS: dict[str, dict[str, Any]] = {
    name: model.model_json_schema() for name, model in INPUT_MODELS.items()
}

TOOL_DESCRIPTIONS: dict[str, str] = {
    "site_navigate": "跳转网站页面。path 可为 / (首页)、/canvas (我的画布)、/canvas/:id (指定画布)、/assets (我的素材)、/config (配置)。操作画布前若不在画布页，先用本工具打开画布。",
    "canvas_list_projects": "列出用户全部画布（仅标题、创建/更新时间、节点数、连线数，不含完整数据），支持 keyword 搜索和 page/pageSize 分页。返回的 id 可配合 site_navigate 跳转到 /canvas/:id 打开对应画布。",
    "canvas_get_state": "读取当前网页画布的节点、连线、选区和视口。",
    "canvas_get_selection": "读取当前网页画布选中的节点。",
    "canvas_export_snapshot": "导出当前画布快照，用于理解布局。",
    "canvas_apply_ops": "批量操作当前网页画布。ops 支持 add_node、update_node、delete_node、delete_connections、connect_nodes、set_viewport、select_nodes、run_generation、expand_story、arrange_board、place_on_board。arrange_board / place_on_board 操作的是智能画板自包含的图层文档（metadata.boardLayers），不会移动画布上的节点。expand_story 由前端拦截执行，不直接落地为节点操作。",
    "canvas_create_node": "创建任意类型节点。nodeType 可为 text、prompt、music-prompt、speech-prompt、video-prompt、image、video、audio、config、image-generation、speech-generation、music-generation、video-generation、smart-canvas、assets、recording、image-modifier、story。适合创建占位图、媒体占位、提示词节点、配置节点或自定义 metadata 节点。",
    "canvas_create_text_node": "在当前画布创建单个文本节点。",
    "canvas_create_text_nodes": "批量创建文本节点，适合生成标题、段落、脚本、说明等内容块。",
    "canvas_create_config_node": "创建生成配置节点，可指定 text/image/video/audio 模式和生成参数，可选择立即触发生成。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 两种模式；首尾帧与参考图槽位（videoSlots）只对 video-prompt + video-generation 节点组合生效。",
    "canvas_create_image_prompt_flow": "创建提示词文本节点和图片生成配置节点，并自动连线，可选择立即触发生图。",
    "canvas_create_generation_flow": "创建通用生成流程：提示词文本节点、生成配置节点、参考节点连线，可用于文案、生图、视频或音频。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 模式；需要首尾帧/参考图槽位时用 video-prompt + video-generation 节点组合。",
    "canvas_generate_text": "创建通用文本生成流程并立即触发生成。",
    "canvas_generate_image": "创建通用图片生成流程并立即触发生成。",
    "canvas_generate_video": "创建通用视频生成流程（config 节点）并立即触发生成。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 模式；需要首尾帧/参考图槽位时用 video-prompt + video-generation 节点组合。",
    "canvas_generate_audio": "创建通用音频生成流程并立即触发生成。",
    "canvas_update_node": "更新节点基础字段或 metadata。",
    "canvas_update_node_text": "更新文本节点内容和标题。",
    "canvas_move_nodes": "移动一个或多个节点，支持绝对坐标或 dx/dy 偏移。",
    "canvas_resize_node": "调整节点尺寸。",
    "canvas_set_node_flags": "设置一个或多个节点的锁定 / 隐藏状态，locked 与 hidden 至少填写一个。",
    "canvas_bulk_rename": "批量重命名节点：多个节点按给定顺序编号为「标题 1」「标题 2」…，单个节点直接使用标题。",
    "canvas_align_nodes": "按选区包围盒对齐或分布节点：left/center-x/right/top/center-y/bottom 对齐，distribute-x/distribute-y 等距分布（分布需 3 个以上节点）。",
    "canvas_duplicate_node": "复制节点：按 dx/dy 偏移（默认 40）创建同类型、大小与 metadata 的副本并选中。",
    "canvas_delete_nodes": "删除指定节点及相关连线。",
    "canvas_connect_nodes": "批量连接节点。",
    "canvas_select_nodes": "设置当前选中节点。",
    "canvas_set_viewport": "调整画布视口。",
    "canvas_run_generation": "触发指定节点生成，通常用于配置节点或文本/图片/视频/音频节点。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 模式；video-generation 节点按 metadata（model/vquality/size/seconds）与所连 video-prompt 的 videoMode/videoSlots 生成。",
    "canvas_expand_story": "把故事节点（前提/幕/章/场景）展开为下一级故事节点：按叙事顺序生成 3-6 个子节点、自动连线并排版。可用 instructions 追加展开要求。",
    "generation_get_status": "查询当前活动网页画布的生成任务状态。可用 scope 过滤来源，用 nodeIds 查询画布节点。",
    "assets_list": "列出用户「我的素材」，支持 kind（text/image/video）过滤、keyword 搜索和 page/pageSize 分页。为控制体积不返回图片/视频原始 data，仅返回封面与元信息。",
    "assets_add": "向「我的素材」新增素材。kind=text 时用 content 传文本内容；kind=image 时用 imageUrl 传图片地址或 dataURL。可附带 title、tags、source、note。",
}
