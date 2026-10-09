"""The 48 agent tools: names, verbatim descriptions, and input schemas.

Four generic relay tools (``app_*``) and sixteen site tools
(``canvas_list_projects``, ``generation_get_status``, ``canvas_get_node_content``, ``canvas_get_image_group`` and the
project/library/pixel tools) are relayed verbatim to the browser; the remaining ``canvas_*``
macro tools are compiled server-side into ``app_apply_ops`` requests and require an explicit
``projectId``. Tool names and Chinese
descriptions are copied verbatim; the zod schemas are re-expressed as Pydantic
models whose JSON Schema is equivalent.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal[
    "image",
    "text",
    "prompt",
    "music-prompt",
    "speech-prompt",
    "video-prompt",
    "image-generation",
    "speech-generation",
    "music-generation",
    "video-generation",
    "video",
    "audio",
    "midi",
    "assets",
    "recording",
    "image-stack",
]
GenerationMode = Literal["text", "image", "video", "audio"]
AlignMode = Literal["left", "center-x", "right", "top", "center-y", "bottom", "distribute-x", "distribute-y"]

TOOL_NAMES: tuple[str, ...] = (
    "canvas_list_projects",
    "generation_get_status",
    "canvas_get_node_content",
    "canvas_get_image_group",
    "app_get_state",
    "app_describe_actions",
    "app_apply_ops",
    "app_screenshot",
    "canvas_create_node",
    "canvas_create_text_node",
    "canvas_create_text_nodes",
    "canvas_create_image_prompt_flow",
    "canvas_create_generation_flow",
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
    "canvas_group_images",
    "canvas_ungroup_images",
    "canvas_delete_nodes",
    "canvas_connect_nodes",
    "canvas_select_nodes",
    "canvas_set_viewport",
    "canvas_run_generation",
    "canvas_create_project",
    "canvas_rename_project",
    "canvas_delete_projects",
    "canvas_move_project_to_library",
    "canvas_create_library",
    "canvas_rename_library",
    "canvas_delete_library",
    "canvas_create_pixel_project",
    "canvas_apply_pixel_ops",
    "canvas_list_pixel_projects",
    "canvas_rename_pixel_project",
    "canvas_delete_pixel_projects",
    "write_list_entities",
    "write_create_entity",
    "write_link_entities",
    "write_entity_context",
    "write_backlinks",
)


class ViewportInput(BaseModel):
    x: float
    y: float
    k: float


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


class CanvasToolInput(PassthroughInput):
    """Base for ``canvas_*`` macro tools: an explicit target canvas is mandatory.

    Canvas operations never fall back to the browser's open/bound page; the caller must
    pass the ``projectId`` returned by ``canvas_list_projects``.
    """

    projectId: str


class AppGetStateInput(PassthroughInput):
    pass


class AppDescribeActionsInput(PassthroughInput):
    ns: str | None = None


class AppApplyOpsInput(PassthroughInput):
    projectId: str | None = None
    ops: list[dict[str, Any]]


class AppScreenshotInput(PassthroughInput):
    studio: str | None = None


class ListProjectsInput(BaseModel):
    keyword: str | None = None
    page: float | None = None
    pageSize: float | None = None


class CreateProjectInput(BaseModel):
    title: str | None = None
    libraryId: str | None = None


class RenameProjectInput(BaseModel):
    id: str
    title: str


class DeleteProjectsInput(BaseModel):
    ids: list[str] = Field(min_length=1)


class MoveProjectInput(BaseModel):
    id: str
    libraryId: str | None = None


class CreateLibraryInput(BaseModel):
    name: str | None = None


class RenameLibraryInput(BaseModel):
    id: str
    name: str


class DeleteLibraryInput(BaseModel):
    id: str


class CreatePixelProjectInput(BaseModel):
    title: str | None = None
    width: float | None = None
    height: float | None = None
    palette: list[str] | None = None


class ApplyPixelOpsInput(BaseModel):
    projectId: str | None = None
    ops: list[dict[str, Any]] = Field(min_length=1)


class ListPixelProjectsInput(BaseModel):
    keyword: str | None = None


class RenamePixelProjectInput(BaseModel):
    id: str
    title: str


class DeletePixelProjectsInput(BaseModel):
    ids: list[str] = Field(min_length=1)


class WriteListEntitiesInput(BaseModel):
    pass


class WriteCreateEntityInput(BaseModel):
    kind: Literal["character", "location", "plot"]
    name: str | None = None


class WriteLinkEntitiesInput(BaseModel):
    fromEntityId: str
    toEntityId: str
    label: str | None = None


class WriteEntityContextInput(BaseModel):
    entityId: str


class WriteBacklinksInput(BaseModel):
    entityId: str


class CreateNodeInput(CanvasToolInput):
    nodeType: NodeType
    title: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    metadata: dict[str, Any] | None = None


class CreateTextNodeInput(CanvasToolInput):
    text: str | None = None
    x: float | None = None
    y: float | None = None
    title: str | None = None
    width: float | None = None
    height: float | None = None


class CreateTextNodesInput(CanvasToolInput):
    items: list[TextNodeInput] = Field(min_length=1)
    x: float | None = None
    y: float | None = None
    gap: float | None = None
    direction: Literal["row", "column"] | None = None


class CreateImagePromptFlowInput(CanvasToolInput, GenerationOptions):
    prompt: str
    title: str | None = None
    x: float | None = None
    y: float | None = None
    referenceNodeIds: list[str] | None = None
    autoRun: bool | None = None


class CreateGenerationFlowInput(CanvasToolInput, GenerationFlowInput, GenerationOptions):
    mode: GenerationMode | None = None
    autoRun: bool | None = None


class GenerateImageInput(CanvasToolInput, GenerationFlowInput, GenerationOptions):
    pass


class GenerateVideoInput(CanvasToolInput, GenerationFlowInput, GenerationOptions):
    pass


class GenerateAudioInput(CanvasToolInput, GenerationFlowInput, GenerationOptions):
    pass


class UpdateNodeInput(CanvasToolInput):
    id: str
    patch: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class UpdateNodeTextInput(CanvasToolInput):
    id: str
    text: str
    title: str | None = None


class MoveNodesInput(CanvasToolInput):
    items: list[MoveItem] = Field(min_length=1)


class ResizeNodeInput(CanvasToolInput):
    id: str
    width: float
    height: float
    freeResize: bool | None = None


class SetNodeFlagsInput(CanvasToolInput):
    ids: list[str] = Field(min_length=1)
    locked: bool | None = None
    hidden: bool | None = None


class BulkRenameInput(CanvasToolInput):
    ids: list[str] = Field(min_length=1)
    title: str


class AlignNodesInput(CanvasToolInput):
    ids: list[str] = Field(min_length=2)
    mode: AlignMode


class DuplicateNodeInput(CanvasToolInput):
    id: str
    dx: float | None = None
    dy: float | None = None


class GroupImagesInput(CanvasToolInput):
    nodeIds: list[str] = Field(min_length=1)
    title: str | None = None
    x: float | None = None
    y: float | None = None
    removeSources: bool | None = None


class UngroupImagesInput(CanvasToolInput):
    nodeId: str
    gap: float | None = None
    columns: float | None = None
    keepGroup: bool | None = None


class DeleteNodesInput(CanvasToolInput):
    ids: list[str] = Field(min_length=1)


class ConnectNodesInput(CanvasToolInput):
    connections: list[ConnectionInput] = Field(min_length=1)


class SelectNodesInput(CanvasToolInput):
    ids: list[str]


class SetViewportInput(CanvasToolInput):
    viewport: ViewportInput


class RunGenerationInput(CanvasToolInput):
    nodeId: str
    mode: GenerationMode | None = None
    prompt: str | None = None


class GetNodeContentInput(CanvasToolInput):
    """Read one resource node's real bytes; project-scoped but does not need the canvas open."""

    nodeId: str
    itemId: str | None = None
    maxBytes: int | None = None


class GetImageGroupInput(CanvasToolInput):
    """List one image-stack node's images; project-scoped but does not need the canvas open."""

    nodeId: str


class GenerationStatusInput(BaseModel):
    scope: Literal["all", "canvas"] | None = None
    taskId: str | None = None
    nodeIds: list[str] | None = None
    limit: float | None = None


INPUT_MODELS: dict[str, type[BaseModel]] = {
    "canvas_list_projects": ListProjectsInput,
    "generation_get_status": GenerationStatusInput,
    "canvas_get_node_content": GetNodeContentInput,
    "canvas_get_image_group": GetImageGroupInput,
    "app_get_state": AppGetStateInput,
    "app_describe_actions": AppDescribeActionsInput,
    "app_apply_ops": AppApplyOpsInput,
    "app_screenshot": AppScreenshotInput,
    "canvas_create_node": CreateNodeInput,
    "canvas_create_text_node": CreateTextNodeInput,
    "canvas_create_text_nodes": CreateTextNodesInput,
    "canvas_create_image_prompt_flow": CreateImagePromptFlowInput,
    "canvas_create_generation_flow": CreateGenerationFlowInput,
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
    "canvas_group_images": GroupImagesInput,
    "canvas_ungroup_images": UngroupImagesInput,
    "canvas_delete_nodes": DeleteNodesInput,
    "canvas_connect_nodes": ConnectNodesInput,
    "canvas_select_nodes": SelectNodesInput,
    "canvas_set_viewport": SetViewportInput,
    "canvas_run_generation": RunGenerationInput,
    "canvas_create_project": CreateProjectInput,
    "canvas_rename_project": RenameProjectInput,
    "canvas_delete_projects": DeleteProjectsInput,
    "canvas_move_project_to_library": MoveProjectInput,
    "canvas_create_library": CreateLibraryInput,
    "canvas_rename_library": RenameLibraryInput,
    "canvas_delete_library": DeleteLibraryInput,
    "canvas_create_pixel_project": CreatePixelProjectInput,
    "canvas_apply_pixel_ops": ApplyPixelOpsInput,
    "canvas_list_pixel_projects": ListPixelProjectsInput,
    "canvas_rename_pixel_project": RenamePixelProjectInput,
    "canvas_delete_pixel_projects": DeletePixelProjectsInput,
    "write_list_entities": WriteListEntitiesInput,
    "write_create_entity": WriteCreateEntityInput,
    "write_link_entities": WriteLinkEntitiesInput,
    "write_entity_context": WriteEntityContextInput,
    "write_backlinks": WriteBacklinksInput,
}

INPUT_SCHEMAS: dict[str, dict[str, Any]] = {
    name: model.model_json_schema() for name, model in INPUT_MODELS.items()
}

TOOL_DESCRIPTIONS: dict[str, str] = {
    "canvas_list_projects": "列出用户全部画布（仅标题、创建/更新时间、节点数、连线数，不含完整数据），支持 keyword 搜索和 page/pageSize 分页。返回的 id 用作其他画布工具的 projectId。",
    "canvas_get_node_content": "按 projectId + nodeId 读取节点真实内容并直接返回：图片作为图片块、音频作为音频块、文本作为文本块、视频与 MIDI 作为嵌入二进制资源；不依赖页面里临时的 blob: URL，也不需要该画布处于打开状态。批量图片节点可用 itemId 指定其中一张（省略则取主图/第一张）。maxBytes 可覆盖默认解码字节上限。",
    "canvas_get_image_group": "读取指定图片组节点的图片清单，返回 { count, primaryImageId, images:[{id,status,primary,naturalWidth,naturalHeight,bytes,mimeType,hasContent}] }；随后可用 canvas_get_node_content 配 itemId 读取其中某张的真实字节。",
    "app_get_state": "读取当前网页的页面快照，返回 { page, title, state, availableActions }。availableActions 列出当前页可用的操作命名空间（ns）、标题、说明和 op 名称（不含 schema）。操作任何页面前先调用本工具确认当前页面。",
    "app_describe_actions": "读取操作的 schema。传入 ns 返回该命名空间的可用操作及字段定义；省略 ns 返回全部可用命名空间及其 schema，用于构造 app_apply_ops 的 ops。",
    "app_apply_ops": "向当前网页提交一批操作。ops 为扁平、带 ns 标记的操作对象数组，例如 { ns: \"canvas\", type: \"add_node\", ... }；每个 op 的字段以 app_describe_actions 返回的 schema 为准。",
    "app_screenshot": "截取当前工作区的画面并返回 PNG 图片。默认截取当前工作区，所有工作区都支持（画布 / 图像 / 像素 / 音频 / 纹理 / 写作 / 配置），可用 studio 指定工作区名。用于查看当前界面渲染效果。",
    "canvas_create_node": "创建任意类型节点。nodeType 可为 text、prompt、music-prompt、speech-prompt、video-prompt、image、video、audio、midi、image-generation、speech-generation、music-generation、video-generation、assets、recording、image-stack（图片组，metadata.images[] + metadata.primaryImageId）。适合创建占位图、媒体占位、提示词节点、生成节点或自定义 metadata 节点。",
    "canvas_create_text_node": "在当前画布创建单个文本节点。",
    "canvas_create_text_nodes": "批量创建文本节点，适合生成标题、段落、脚本、说明等内容块。",
    "canvas_create_image_prompt_flow": "创建提示词节点和图片生成节点，并自动连线，可选择立即触发生图。",
    "canvas_create_generation_flow": "创建通用生成流程：提示词节点、生成节点、参考节点连线，可用于文案、生图、视频或音频。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 模式；需要首尾帧/参考图槽位时用 video-prompt + video-generation 节点组合。",
    "canvas_generate_image": "创建图片生成流程并立即触发生成。",
    "canvas_generate_video": "创建视频生成流程并立即触发生成。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 模式；需要首尾帧/参考图槽位时用 video-prompt + video-generation 节点组合。",
    "canvas_generate_audio": "创建语音生成流程并立即触发生成。",
    "canvas_update_node": "更新节点基础字段或 metadata。",
    "canvas_update_node_text": "更新文本节点内容和标题。",
    "canvas_move_nodes": "移动一个或多个节点，支持绝对坐标或 dx/dy 偏移。",
    "canvas_resize_node": "调整节点尺寸。",
    "canvas_set_node_flags": "设置一个或多个节点的锁定 / 隐藏状态，locked 与 hidden 至少填写一个。",
    "canvas_bulk_rename": "批量重命名节点：多个节点按给定顺序编号为「标题 1」「标题 2」…，单个节点直接使用标题。",
    "canvas_align_nodes": "按选区包围盒对齐或分布节点：left/center-x/right/top/center-y/bottom 对齐，distribute-x/distribute-y 等距分布（分布需 3 个以上节点）。",
    "canvas_duplicate_node": "复制节点：按 dx/dy 偏移（默认 40）创建同类型、大小与 metadata 的副本并选中。",
    "canvas_group_images": "把多个图片节点（或已有图片组）里的图片打包成一个新的「图片组」(image-stack) 节点；默认移除来源节点（removeSources 传 false 可保留）。",
    "canvas_ungroup_images": "把图片组节点拆包成多个独立图片节点；默认删除图片组（keepGroup 传 true 可保留）。",
    "canvas_delete_nodes": "删除指定节点及相关连线。",
    "canvas_connect_nodes": "批量连接节点。",
    "canvas_select_nodes": "设置当前选中节点。",
    "canvas_set_viewport": "调整画布视口。",
    "canvas_run_generation": "触发指定节点生成，通常用于生成节点或文本/图片/视频/音频节点。视频为 minimax/hailuo-3-max：分辨率 480p/768p、时长 5-15s、frames/reference 模式；video-generation 节点按 metadata（model/vquality/size/seconds）与所连 video-prompt 的 videoMode/videoSlots 生成。",
    "generation_get_status": "查询当前活动网页画布的生成任务状态。可用 scope 过滤来源，用 nodeIds 查询画布节点。",
    "canvas_create_project": "新建画布（项目）。title 省略时自动命名；libraryId 指定所属库（画布分组），省略则放在当前/默认库。返回新画布 id，用作后续画布工具的 projectId。",
    "canvas_rename_project": "重命名指定画布。",
    "canvas_delete_projects": "删除一个或多个画布（移入回收，并清理不再使用的图片）。",
    "canvas_move_project_to_library": "把画布移动到指定库；libraryId 传 null 表示移出分组。",
    "canvas_create_library": "新建库（画布分组）。返回新库 id。",
    "canvas_rename_library": "重命名指定库。",
    "canvas_delete_library": "删除指定库，库内画布会一并移入回收。",
    "canvas_create_pixel_project": "无需打开像素编辑器，直接在数据层新建一个像素画布项目（可选 width/height/palette），返回项目 id。用于后台批量创建像素画作。",
    "canvas_apply_pixel_ops": "无需打开像素编辑器，直接对指定像素项目执行一批像素操作（纯数据流）。ops 中每项含 type，可为 doc.setSize、doc.setFps、doc.setBackground、palette.set、layer.*、frame.*、pixels.set（points:[{x,y,color}]）、fill、shape（line/rect/ellipse）。projectId 省略时会新建项目。",
    "canvas_list_pixel_projects": "列出全部像素画布项目（id、标题、尺寸、帧数、图层数），支持 keyword 过滤。",
    "canvas_rename_pixel_project": "重命名指定像素项目。",
    "canvas_delete_pixel_projects": "删除一个或多个像素项目（并清理不再引用的图片）。",
    "write_list_entities": "列出当前写作项目中的全部设定实体（角色 / 地点 / 情节），返回 id、kind、name 与画布 id。",
    "write_create_entity": "在当前写作项目中创建设定实体（kind 为 character / location / plot，name 可选），并确保其专属画布存在，返回 entityId 与 canvasId。",
    "write_link_entities": "在两个设定实体之间建立引用：在来源实体画布上新增一个 entity-ref 节点指向目标实体（label 可选，用作节点标题），返回来源 canvasId 与 nodeId。",
    "write_entity_context": "读取指定设定实体的上下文文本（概要、字段、关系与相关正文片段），返回 { text }。",
    "write_backlinks": "列出引用了指定设定实体的其他实体画布，返回 { links }。",
}
