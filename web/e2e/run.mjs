import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3000";
// The bridge/MCP service is a standalone local Python server, not part of the dev server.
const AGENT_BRIDGE = process.env.E2E_AGENT_BRIDGE || "http://127.0.0.1:3210";
const PORT = Number(process.env.E2E_CDP_PORT || 9333);
const ARTIFACTS = resolve("e2e", "artifacts", new Date().toISOString().replace(/[:.]/g, "-"));
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((path) => existsSync(path));

const LIB_ASSERTIONS = `(async () => {
    const results = [];
    const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
    const board = { id: "b", type: "smart-canvas", title: "b", position: { x: 0, y: 0 }, width: 640, height: 360, metadata: {} };
    const image = (id, width, height, position) => ({ id, type: "image", title: id, position: position || { x: 0, y: 0 }, width, height, metadata: { naturalWidth: width, naturalHeight: height } });

    const smart = await import("/src/lib/canvas/smart-canvas.ts");
    ok("ratio default", smart.smartCanvasRatio(board) === "16:9", smart.smartCanvasRatio(board));
    ok("resolution default", smart.smartCanvasResolution(board) === "2k", smart.smartCanvasResolution(board));
    ok("background default", smart.smartCanvasBackground(board) === "transparent", smart.smartCanvasBackground(board));
    ok("layers default", Array.isArray(smart.smartCanvasLayers(board)) && smart.smartCanvasLayers(board).length === 0, JSON.stringify(smart.smartCanvasLayers(board)));
    const ratioSize = smart.smartCanvasSizeForRatio("16:9");
    ok("size 16:9", Math.abs(ratioSize.width / ratioSize.height - 16 / 9) < 0.01, JSON.stringify(ratioSize));
    ok("arrange empty", JSON.stringify(smart.arrangePsLayers(board)) === "[]");

    const layer = (id, width, height, extra) => ({ id, name: id, kind: "image", x: 0, y: 0, width, height, rotation: 0, opacity: 1, blendMode: "normal", hidden: false, locked: false, ...extra });
    const layered = { ...board, metadata: { boardLayers: [layer("a", 240, 120)] } };
    const one = smart.arrangePsLayers(layered);
    ok("arrange 1 cols=1, gap 16, centred", one[0].width === 608 && one[0].height === 304 && one[0].x === 16 && one[0].y === 28, JSON.stringify(one[0]));

    const textLayer = layer("t1", 100, 40, { kind: "text", text: "hi", fontSize: 20, color: "#ffffff" });
    const mixed = { ...board, metadata: { boardLayers: [layer("a", 400, 300), textLayer, layer("b", 1000, 100), layer("c", 50, 50)] } };
    const three = smart.arrangePsLayers(mixed);
    ok("arrange 3 grid", three[0].width === 208 && three[0].height === 156 && three[2].width === 296 && three[3].height === 156, JSON.stringify(three));
    ok("arrange 3 aspect kept", Math.abs(three[2].width / three[2].height - 1000 / 100) < 0.2, three[2].width / three[2].height);
    ok("arrange 3 rounded", three.every((item) => Number.isInteger(item.x) && Number.isInteger(item.y) && Number.isInteger(item.width) && Number.isInteger(item.height)));
    ok("arrange leaves text layers untouched", three[1].x === textLayer.x && three[1].y === textLayer.y && three[1].width === 100 && three[1].height === 40 && three[1].text === "hi", JSON.stringify(three[1]));

    ok("layout templates ordered", smart.BOARD_LAYOUT_TEMPLATES.join(",") === "grid,row,column,feature", smart.BOARD_LAYOUT_TEMPLATES.join(","));
    const layoutBoard = { ...board, metadata: { boardLayers: [layer("a", 100, 100), layer("b", 100, 100), layer("c", 100, 100)] } };
    const gridNamed = JSON.stringify(smart.arrangePsLayers(layoutBoard, "grid"));
    ok("grid template keeps default output", gridNamed === JSON.stringify(smart.arrangePsLayers(layoutBoard)), gridNamed);
    const row = smart.arrangePsLayers(layoutBoard, "row");
    ok("row template one row", row.every((item) => item.y === row[0].y) && row[0].x < row[1].x && row[1].x < row[2].x, JSON.stringify(row));
    ok("row template aspect fit integers", row.every((item) => item.width === 192 && item.height === 192 && Number.isInteger(item.x) && Number.isInteger(item.y)), JSON.stringify(row));
    const column = smart.arrangePsLayers(layoutBoard, "column");
    ok("column template one column", column.every((item) => item.x === column[0].x) && column[0].y < column[1].y && column[1].y < column[2].y, JSON.stringify(column));
    ok("column template aspect fit integers", column.every((item) => item.width === column[0].width && item.height === column[0].height && Number.isInteger(item.width) && Number.isInteger(item.height)), JSON.stringify(column));
    const feature = smart.arrangePsLayers(layoutBoard, "feature");
    ok("feature template keeps first image dominant", feature[0].width > feature[1].width && feature[0].height > feature[1].height && feature[0].x < feature[1].x, JSON.stringify(feature));
    ok("feature template aspect fit integers", feature.every((item) => Number.isInteger(item.width) && Number.isInteger(item.height) && Number.isInteger(item.x) && Number.isInteger(item.y)), JSON.stringify(feature));
    const rowAspect = smart.arrangePsLayers({ ...board, metadata: { boardLayers: [layer("w", 400, 100), layer("t", 100, 400)] } }, "row");
    ok("row template keeps aspect", Math.abs(rowAspect[0].width / rowAspect[0].height - 4) < 0.05 && Math.abs(rowAspect[1].width / rowAspect[1].height - 0.25) < 0.01, JSON.stringify(rowAspect));

    ok("layers read metadata", smart.smartCanvasLayers(layered)[0].id === "a", JSON.stringify(smart.smartCanvasLayers(layered)));
    const twoLayers = { ...board, metadata: { boardLayers: [layer("a", 100, 100), layer("b", 100, 100)] } };
    ok("movePsLayer backward reorders", smart.movePsLayer(twoLayers, "b", "backward").map((item) => item.id).join(",") === "b,a", smart.movePsLayer(twoLayers, "b", "backward").map((item) => item.id).join(","));
    ok("movePsLayer forward reorders", smart.movePsLayer(twoLayers, "a", "forward").map((item) => item.id).join(",") === "b,a", smart.movePsLayer(twoLayers, "a", "forward").map((item) => item.id).join(","));
    ok("movePsLayer at front is a no-op", smart.movePsLayer(twoLayers, "b", "forward") === smart.smartCanvasLayers(twoLayers));
    ok("movePsLayer at back is a no-op", smart.movePsLayer(twoLayers, "a", "backward") === smart.smartCanvasLayers(twoLayers));
    ok("movePsLayer unknown id is a no-op", smart.movePsLayer(twoLayers, "zz", "forward").map((item) => item.id).join(",") === "a,b", smart.movePsLayer(twoLayers, "zz", "forward").map((item) => item.id).join(","));

    const created = smart.createPsImageLayer(board, image("src", 240, 120, { x: 10, y: 20 }));
    ok(
        "createPsImageLayer centres a fitted image layer",
        created.kind === "image" &&
            created.sourceNodeId === "src" &&
            created.width === 640 &&
            created.height === 320 &&
            created.x === 0 &&
            created.y === 20 &&
            created.rotation === 0 &&
            created.opacity === 1 &&
            created.blendMode === "normal" &&
            created.hidden === false &&
            created.locked === false,
        JSON.stringify(created),
    );
    ok("createPsImageLayer names the layer after the node", created.name === "src", created.name);
    const nestedLayer = smart.createPsImageLayer(board, { id: "nb", type: "smart-canvas", title: "nb", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: {} });
    ok("createPsImageLayer keeps a nested board aspect", nestedLayer.width === 360 && nestedLayer.height === 360, JSON.stringify(nestedLayer));

    const blend = await import("/src/lib/canvas/blend-modes.ts");
    ok("blend opacity constants", blend.LAYER_OPACITY_MIN === 0 && blend.LAYER_OPACITY_MAX === 1 && blend.LAYER_OPACITY_DEFAULT === 1, blend.LAYER_OPACITY_MIN + "," + blend.LAYER_OPACITY_MAX + "," + blend.LAYER_OPACITY_DEFAULT);
    ok("blend opacity clamps to bounds", blend.clampLayerOpacity(-0.5) === 0 && blend.clampLayerOpacity(1.5) === 1, blend.clampLayerOpacity(-0.5) + "," + blend.clampLayerOpacity(1.5));
    ok("blend opacity defaults when missing or non-finite", blend.clampLayerOpacity(undefined) === 1 && blend.clampLayerOpacity(Number.NaN) === 1 && blend.clampLayerOpacity(Number.POSITIVE_INFINITY) === 1, blend.clampLayerOpacity(undefined) + "," + blend.clampLayerOpacity(Number.NaN));
    ok("blend opacity rounds to two decimals", blend.clampLayerOpacity(0.333) === 0.33 && blend.clampLayerOpacity(0.666) === 0.67, blend.clampLayerOpacity(0.333) + "," + blend.clampLayerOpacity(0.666));
    ok("blend modes resolve back to themselves", blend.CANVAS_BLEND_MODES.length === 16 && blend.CANVAS_BLEND_MODES.every((mode) => blend.resolveBlendMode(mode.id) === mode), blend.CANVAS_BLEND_MODES.length);
    ok("blend mode unknown id falls back to default", blend.resolveBlendMode("nope").id === blend.DEFAULT_BLEND_MODE, blend.resolveBlendMode("nope").id);

    const image2 = await import("/src/lib/canvas/canvas-image-data.ts");
    ok("upscale clamp max", image2.resolveUpscaleSize(100, 100, 99999).width === 4096, JSON.stringify(image2.resolveUpscaleSize(100, 100, 99999)));
    const down = image2.resolveUpscaleSize(1000, 500, 200);
    ok("downscale keeps aspect", Math.abs(down.width / down.height - 2) < 0.02 && down.width <= 200, JSON.stringify(down));
    ok("downscale min clamp", image2.resolveUpscaleSize(1000, 500, 1).width >= 64, JSON.stringify(image2.resolveUpscaleSize(1000, 500, 1)));

    const geo = await import("/src/lib/canvas/canvas-node-geometry.ts");
    const target = image("t", 100, 100, { x: 300, y: 0 });
    const dragged = image("d", 100, 100, { x: 0, y: 0 });
    const snapped = geo.snapDragToGuides([{ id: "d", x: 0, y: 0 }], [target, dragged], 197, 0, 6);
    ok("snap pulls to edge", snapped.dx === 200 && snapped.guides.x[0] === 300, JSON.stringify(snapped));
    const missed = geo.snapDragToGuides([{ id: "d", x: 0, y: 0 }], [image("t2", 100, 100, { x: 900, y: 900 }), dragged], 10, 10, 6);
    ok("snap no match keeps delta", missed.dx === 10 && missed.dy === 10 && missed.guides.x.length === 0, JSON.stringify(missed));
    ok("center inside", geo.nodeCenterInside(image("i", 100, 100, { x: 50, y: 50 }), board) === true);
    const gridSnapped = geo.snapDragToGuides([{ id: "d", x: 7, y: 9 }], [dragged], 3, 3, 0, 16);
    ok("grid snap rounds to 16", gridSnapped.dx === 9 && gridSnapped.dy === 7, JSON.stringify(gridSnapped));
    const guideBeatsGrid = geo.snapDragToGuides([{ id: "d", x: 0, y: 0 }], [target, dragged], 197, 0, 6, 16);
    ok("grid defers to guides", guideBeatsGrid.dx === 200 && guideBeatsGrid.guides.x[0] === 300, JSON.stringify(guideBeatsGrid));
    ok("grid off by default", geo.snapDragToGuides([{ id: "d", x: 7, y: 9 }], [dragged], 3, 3, 0).dx === 3);

    const inside = image("in", 100, 100, { x: 150, y: 100 });
    const outside = image("out", 100, 100, { x: 900, y: 900 });

    const boardA = { id: "ba", type: "smart-canvas", title: "A", position: { x: 0, y: 0 }, width: 640, height: 360, metadata: { boardLayers: [layer("la", 640, 360, { sourceNodeId: "bb" })] } };
    const boardB = { id: "bb", type: "smart-canvas", title: "B", position: { x: 80, y: 60 }, width: 200, height: 150, metadata: { boardLayers: [layer("lb", 200, 150, { sourceNodeId: "bc" })] } };
    const boardC = { id: "bc", type: "smart-canvas", title: "C", position: { x: 100, y: 80 }, width: 80, height: 60, metadata: {} };
    const boardTree = [boardA, boardB, boardC];
    ok("board descendant direct", geo.isBoardDescendant("bb", "ba", boardTree) === true);
    ok("board descendant indirect", geo.isBoardDescendant("bc", "ba", boardTree) === true);
    ok("board descendant never self or ancestor", geo.isBoardDescendant("ba", "ba", boardTree) === false && geo.isBoardDescendant("ba", "bc", boardTree) === false);
    ok("board drop accepts image", geo.findBoardDropTarget(new Set(["bimg"]), [boardA, image("bimg", 100, 100, { x: 40, y: 40 })])?.id === "ba");
    ok("board drop accepts board", geo.findBoardDropTarget(new Set(["bb"]), [boardA, boardB])?.id === "ba");
    ok("board drop rejects self", geo.findBoardDropTarget(new Set(["bb"]), [boardB]) === null);
    ok("board drop rejects descendant cycle", geo.findBoardDropTarget(new Set(["ba"]), boardTree) === null);
    ok("board drop rejects non-board target", geo.findBoardDropTarget(new Set(["bimg"]), [image("plain", 50, 50, { x: 0, y: 0 }), image("bimg", 100, 100, { x: 40, y: 40 })]) === null);

    ok("locked flag predicate", geo.isNodeLocked({ ...dragged, metadata: { locked: true } }) === true && geo.isNodeLocked(dragged) === false);
    ok("hidden flag predicate", geo.isNodeHidden({ ...dragged, metadata: { hidden: true } }) === true && geo.isNodeHidden(dragged) === false);
    const textNode = { id: "txt", type: "text", title: "txt", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: {} };
    const nodeList = [inside, outside, textNode];
    ok("type filter all", geo.filterNodesByType(nodeList, "all").length === 3);
    ok("type filter image", geo.filterNodesByType(nodeList, "image").map((node) => node.id).join(",") === "in,out");
    ok("type filter unknown", geo.filterNodesByType(nodeList, "video").length === 0);
    ok("bulk rename single", geo.bulkRenameTitles(["a"], " 名字 ").get("a") === "名字");
    const bulk = geo.bulkRenameTitles(["a", "b"], "名字");
    ok("bulk rename numbered", bulk.get("a") === "名字 1" && bulk.get("b") === "名字 2");
    ok("bulk rename blank", geo.bulkRenameTitles(["a", "b"], "   ").size === 0);

    const drop = await import("/src/lib/canvas/canvas-drop-bindings.ts");
    ok("drop binding image onto assets", drop.resolveCanvasDropBinding("image", "assets") === "collect", drop.resolveCanvasDropBinding("image", "assets"));
    ok(
        "drop binding rejects unrelated pairs",
        drop.resolveCanvasDropBinding("prompt", "image-generation") === null && drop.resolveCanvasDropBinding("prompt", "assets") === null && drop.resolveCanvasDropBinding("image", "image-generation") === null && drop.resolveCanvasDropBinding("prompt", "prompt") === null,
        JSON.stringify([drop.resolveCanvasDropBinding("prompt", "image-generation"), drop.resolveCanvasDropBinding("prompt", "assets")]),
    );
    const promptSource = { id: "pn", type: "prompt", title: "p", position: { x: 100, y: 100 }, width: 340, height: 240, metadata: {} };
    const generationTarget = { id: "gn", type: "image-generation", title: "g", position: { x: 0, y: 0 }, width: 412, height: 608, metadata: {} };
    const assetsTarget = { id: "an", type: "assets", title: "a", position: { x: 0, y: 0 }, width: 360, height: 320, metadata: {} };
    const imageSource = image("i1", 100, 100, { x: 100, y: 100 });
    ok("image-generation accepts an upstream prompt connection", geo.normalizeConnection(promptSource.id, generationTarget.id, [promptSource, generationTarget], "source")?.toNodeId === generationTarget.id);
    ok("image drop finds assets target", geo.findAssetsDropTarget(new Set(["i1"]), [imageSource, assetsTarget])?.id === "an");
    ok("image drop ignores image-generation target", geo.findAssetsDropTarget(new Set(["i1"]), [imageSource, generationTarget]) === null);

    const align = await import("/src/lib/canvas/alignment.ts");
    const trio = [
        { id: "a", type: "image", title: "a", position: { x: 100, y: 50 }, width: 100, height: 100, metadata: {} },
        { id: "b", type: "image", title: "b", position: { x: 300, y: 400 }, width: 50, height: 50, metadata: {} },
        { id: "c", type: "image", title: "c", position: { x: 600, y: 200 }, width: 200, height: 20, metadata: {} },
    ];
    const sel = new Set(["a", "b", "c"]);
    const topAligned = align.alignNodes(trio, sel, "top");
    ok("align top", topAligned.get("a").y === 50 && topAligned.get("b").y === 50 && topAligned.get("c").y === 50, JSON.stringify([...topAligned]));
    const rightAligned = align.alignNodes(trio, sel, "right");
    ok("align right", rightAligned.get("a").x === 700 && rightAligned.get("c").x === 600, JSON.stringify([...rightAligned]));
    const centreY = align.alignNodes(trio, sel, "center-y");
    ok("align center-y", centreY.get("b").y === 225 && centreY.get("c").y === 240, JSON.stringify([...centreY]));
    const spreadX = align.alignNodes(trio, sel, "distribute-x");
    ok("distribute-x equal gaps", spreadX.get("a").x === 100 && spreadX.get("b").x === 375 && spreadX.get("c").x === 600, JSON.stringify([...spreadX]));
    ok("align needs two", align.alignNodes(trio, new Set(["a"]), "left").size === 0);
    ok("distribute needs three", align.alignNodes(trio, new Set(["a", "b"]), "distribute-y").size === 0);

    const generation = await import("/src/lib/canvas/canvas-generation-helpers.ts");
    ok("generation limits", generation.GENERATION_CONCURRENCY === 2 && generation.GENERATION_MAX_ATTEMPTS === 3 && generation.GENERATION_RETRY_DELAY_MS === 2000);

    const videoModels = await import("/src/lib/video-generation.ts");
    ok("openrouter video models list hailuo-3-max", videoModels.openRouterVideoModels.map((model) => model.value).join(",") === "minimax/hailuo-3-max" && videoModels.isOpenRouterVideoModel("minimax/hailuo-3-max") === true, JSON.stringify(videoModels.openRouterVideoModels.map((model) => model.value)));
    const hailuo = videoModels.videoModelCapability("minimax/hailuo-3-max");
    ok(
        "hailuo capability matches the model contract",
        hailuo.resolutions.join(",") === "480p,768p" &&
            hailuo.durationMin === 5 &&
            hailuo.durationMax === 15 &&
            hailuo.aspectRatios.join(",") === "21:9,16:9,4:3,1:1,3:4,9:16" &&
            !hailuo.supportsSize &&
            !hailuo.supportsAudio &&
            !hailuo.supportsWatermark &&
            !hailuo.supportsSeed &&
            hailuo.frameImages.join(",") === "first_frame,last_frame" &&
            hailuo.inputReferences === true,
        JSON.stringify(hailuo),
    );
    const fallback = videoModels.videoModelCapability("some/plugin-model");
    ok("unknown video models keep the permissive fallback", fallback.supportsSize === true && fallback.supportsAudio === true && fallback.resolutions.length === 0, JSON.stringify(fallback));
    ok("video resolution maps into the model range", videoModels.supportedVideoResolution("720", hailuo) === "768p" && videoModels.supportedVideoResolution("480p", hailuo) === "480p" && videoModels.supportedVideoResolution("1080", hailuo) === "768p", [videoModels.supportedVideoResolution("720", hailuo), videoModels.supportedVideoResolution("1080", hailuo)].join(","));
    ok("video duration clamps to the model range", videoModels.videoModelDuration("30", hailuo) === 15 && videoModels.videoModelDuration("3", hailuo) === 5 && videoModels.videoModelDuration("6", hailuo) === 6);

    const mediaSize = await import("/src/lib/media-size.ts");
    ok("video resolution accepts p-suffixed values", mediaSize.parseVideoResolution("480p") === "480" && mediaSize.parseVideoResolution("768p") === "768" && mediaSize.parseVideoResolution("1080") === "1080");
    ok("video size computes from a p-suffixed resolution", mediaSize.computeVideoSize("768p", "16:9") === "1366x768" && mediaSize.computeVideoSize("480p", "1:1") === "480x480", mediaSize.computeVideoSize("768p", "16:9"));

    const queue = generation.createGenerationQueue();
    await Promise.all(
        ["a", "b", "c", "d", "e"].map((id) =>
            queue.run(id, async () => {
                await new Promise((resolveTask) => setTimeout(resolveTask, 0));
                return id;
            }),
        ),
    );
    const snapshot = queue.snapshot();
    ok("queue caps concurrency at 2", snapshot.peak === 2, JSON.stringify(snapshot));
    ok("queue starts tasks FIFO", snapshot.started.join(",") === "a,b,c,d,e", snapshot.started.join(","));
    ok("queue releases tasks FIFO", snapshot.finished.join(",") === "a,b,c,d,e", snapshot.finished.join(","));

    let attempts = 0;
    await generation.runGenerationTaskWithRetry(async () => {
        attempts += 1;
        throw new Error("boom");
    }, { delayMs: 0 }).catch(() => null);
    ok("retry caps at 3 attempts", attempts === 3, attempts);

    let recovered = 0;
    const recoveredValue = await generation.runGenerationTaskWithRetry(async () => {
        recovered += 1;
        if (recovered < 2) throw new Error("flaky");
        return "done";
    }, { delayMs: 0 });
    ok("retry recovers before cap", recoveredValue === "done" && recovered === 2, recovered);

    const cost = await import("/src/lib/canvas/generation-cost.ts");
    const unpriced = cost.estimateGenerationCost("openrouter::mystery-model", "image", 1);
    ok("cost unpriced model is explicit", unpriced.priced === false && unpriced.usd === 0 && unpriced.reason === "unpriced-model", JSON.stringify(unpriced));
    const mismatched = cost.estimateGenerationCost("openrouter::gpt-image-1", "video-second", 1);
    ok("cost unit mismatch is explicit", mismatched.priced === false && mismatched.usd === 0 && mismatched.reason === "unpriced-unit", JSON.stringify(mismatched));
    ok("cost decodes channel model id", cost.priceModelId("openrouter:: GPT-Image-1 ") === "gpt-image-1", cost.priceModelId("openrouter:: GPT-Image-1 "));
    const billed = cost.estimateGenerationCost("openrouter::gpt-image-1", "image", 3);
    ok("cost prices known model by quantity", billed.priced === true && billed.usd === Number((cost.MODEL_PRICES["gpt-image-1"].usd * 3).toFixed(6)), JSON.stringify(billed));
    const invalid = cost.estimateGenerationCost("gpt-image-1", "image", 0);
    ok("cost rejects non-positive quantity", invalid.priced === false && invalid.reason === "unpriced-unit", JSON.stringify(invalid));
    ok("cost formatUsd uses two decimals", cost.formatUsd(1.234) === "$1.23" && cost.formatUsd(0.037) === "$0.04" && cost.formatUsd(0) === "$0.00", cost.formatUsd(1.234) + "," + cost.formatUsd(0.037) + "," + cost.formatUsd(0));
    ok("cost marks local estimates with a source", cost.estimateGenerationCost("openrouter::gpt-image-1", "image", 1).source === "estimate", cost.estimateGenerationCost("openrouter::gpt-image-1", "image", 1).source);
    const tokenPrice = cost.MODEL_TOKEN_PRICES["openai/gpt-image-2.5-sunburst"];
    ok("cost knows sunburst token prices", tokenPrice.inputText === 0.000005 && tokenPrice.inputImage === 0.000008 && tokenPrice.outputImage === 0.00003, JSON.stringify(tokenPrice));
    const tokenCost = cost.estimateTokenCost("openai/gpt-image-2.5-sunburst", { promptTokens: 1000, completionTokens: 2000 });
    ok("cost estimates token usage from real prices", tokenCost.priced === true && tokenCost.source === "estimate" && tokenCost.usd === 0.065, JSON.stringify(tokenCost));
    const referenceCost = cost.estimateTokenCost("openai/gpt-image-2.5-sunburst", { promptTokens: 1000, completionTokens: 0, hasReference: true });
    ok("cost uses image input rate for reference edits", referenceCost.usd === 0.008, JSON.stringify(referenceCost));
    ok("cost token estimate needs a model and usage", cost.estimateTokenCost("openai/gpt-image-2.5-sunburst", {}) === null && cost.estimateTokenCost("openrouter::mystery", { promptTokens: 10 }) === null);
    const totalOnly = cost.estimateTokenCost("openai/gpt-image-2.5-sunburst", { totalTokens: 3000, completionTokens: 2000 });
    ok("cost derives prompt tokens from total usage", totalOnly.usd === 0.065, JSON.stringify(totalOnly));

    const typography = await import("/src/lib/canvas/text-style.ts");
    ok("text style fontSize clamps to bounds", typography.clampFontSize(2) === typography.TEXT_FONT_SIZE_MIN && typography.clampFontSize(999) === typography.TEXT_FONT_SIZE_MAX, typography.clampFontSize(2) + "," + typography.clampFontSize(999));
    ok("text style fontSize rounds to integer", typography.clampFontSize(17.6) === 18 && typography.clampFontSize(17.4) === 17, typography.clampFontSize(17.6) + "," + typography.clampFontSize(17.4));
    ok("text style fontSize non-finite falls back to default", typography.clampFontSize(Number.NaN) === typography.TEXT_FONT_SIZE_DEFAULT && typography.clampFontSize(Number.POSITIVE_INFINITY) === typography.TEXT_FONT_SIZE_DEFAULT, typography.clampFontSize(Number.NaN));
    ok("text style lineHeight clamps to bounds", typography.clampLineHeight(0.2) === typography.TEXT_LINE_HEIGHT_MIN && typography.clampLineHeight(9) === typography.TEXT_LINE_HEIGHT_MAX, typography.clampLineHeight(0.2) + "," + typography.clampLineHeight(9));
    ok("text style lineHeight rounds to two decimals", typography.clampLineHeight(1.234) === 1.23 && typography.clampLineHeight(1.236) === 1.24, typography.clampLineHeight(1.234) + "," + typography.clampLineHeight(1.236));
    ok("text style lineHeight non-finite falls back to default", typography.clampLineHeight(Number.NaN) === typography.TEXT_LINE_HEIGHT_DEFAULT, typography.clampLineHeight(Number.NaN));
    const textDefaults = typography.resolveTextStyle(undefined);
    ok("text style defaults", textDefaults.fontSize === 14 && textDefaults.lineHeight === 1.65 && textDefaults.bold === false && textDefaults.italic === false && textDefaults.align === "left" && textDefaults.fontFamily === undefined && textDefaults.color === undefined, JSON.stringify(textDefaults));
    const textMapped = typography.resolveTextStyle({ content: "x", fontSize: 24, lineHeight: 2, fontFamily: "Georgia, serif", fontWeight: "bold", italic: true, textAlign: "center", textColor: "#ff0000" });
    ok("text style maps metadata", textMapped.fontSize === 24 && textMapped.lineHeight === 2 && textMapped.fontFamily === "Georgia, serif" && textMapped.bold === true && textMapped.italic === true && textMapped.align === "center" && textMapped.color === "#ff0000", JSON.stringify(textMapped));
    const textUnknown = typography.resolveTextStyle({ textAlign: "diagonal", fontWeight: "heavy", italic: "yes", fontFamily: "  ", textColor: " ", fontSize: Number.NaN, lineHeight: -4 });
    ok("text style unknown values fall back", textUnknown.align === "left" && textUnknown.bold === false && textUnknown.italic === false && textUnknown.fontFamily === undefined && textUnknown.color === undefined && textUnknown.fontSize === 14 && textUnknown.lineHeight === 1, JSON.stringify(textUnknown));
    const textCssDefault = typography.textStyleToCss(textDefaults);
    ok("text style css omits optional colour and font family", textCssDefault.color === undefined && textCssDefault.fontFamily === undefined && textCssDefault.fontSize === "14px" && textCssDefault.lineHeight === 1.65 && textCssDefault.fontWeight === "normal" && textCssDefault.fontStyle === "normal" && textCssDefault.textAlign === "left", JSON.stringify(textCssDefault));
    const textCssMapped = typography.textStyleToCss(textMapped);
    ok("text style css writes mapped values", textCssMapped.color === "#ff0000" && textCssMapped.fontFamily === "Georgia, serif" && textCssMapped.fontSize === "24px" && textCssMapped.lineHeight === 2 && textCssMapped.fontWeight === "bold" && textCssMapped.fontStyle === "italic" && textCssMapped.textAlign === "center", JSON.stringify(textCssMapped));
    ok("text style offers font family stacks", typography.TEXT_FONT_FAMILIES.length >= 4 && typography.TEXT_FONT_FAMILIES.every((item) => item.label && item.value && !item.value.includes(";")), JSON.stringify(typography.TEXT_FONT_FAMILIES));

    const agentOps = await import("/src/lib/canvas/canvas-agent-ops.ts");
    const flaggedNode = { id: "flag", type: "image", title: "flag", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { fontSize: 12, status: "idle" } };
    const clearedNode = agentOps.applyCanvasAgentOps(
        { projectId: "p", title: "p", nodes: [flaggedNode], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } },
        [{ type: "update_node", id: "flag", metadata: { fontSize: null, status: "idle" } }],
    );
    ok("agent update_node drops explicit null metadata keys", clearedNode.nodes[0].metadata.fontSize === undefined && !("fontSize" in clearedNode.nodes[0].metadata) && clearedNode.nodes[0].metadata.status === "idle", JSON.stringify(clearedNode.nodes[0].metadata));

    const permissions = await import("/src/lib/canvas/agent-permissions.ts");
    const allowedOps = [{ type: "add_node" }, { type: "delete_node", id: "n1" }];
    const allAllowed = permissions.filterPermittedOps(allowedOps, permissions.DEFAULT_AGENT_PERMISSIONS);
    ok("agent permissions default allows every op", allAllowed.permitted.length === 2 && allAllowed.blocked.length === 0, JSON.stringify(allAllowed));
    const denied = permissions.filterPermittedOps(allowedOps, { ...permissions.DEFAULT_AGENT_PERMISSIONS, delete_node: false });
    ok("agent permissions deny blocks matching type", denied.permitted.length === 1 && denied.permitted[0].type === "add_node" && denied.blocked.length === 1 && denied.blocked[0].type === "delete_node", JSON.stringify(denied));
    const missingKey = permissions.filterPermittedOps([{ type: "arrange_board", id: "b1" }], {});
    ok("agent permissions missing key stays permitted", missingKey.permitted.length === 1 && missingKey.blocked.length === 0, JSON.stringify(missingKey));
    const noOps = permissions.filterPermittedOps(undefined, permissions.DEFAULT_AGENT_PERMISSIONS);
    ok("agent permissions undefined ops yield nothing", noOps.permitted.length === 0 && noOps.blocked.length === 0, JSON.stringify(noOps));
    ok(
        "agent permissions default covers every op type",
        permissions.AGENT_OP_TYPES.length === 10 && permissions.AGENT_OP_TYPES.every((type) => permissions.DEFAULT_AGENT_PERMISSIONS[type] === true),
        permissions.AGENT_OP_TYPES.join(","),
    );
    ok(
        "agent op describe add_node",
        permissions.describeAgentOp({ type: "add_node", id: "n1" }) === "add_node n1" && permissions.describeAgentOp({ type: "add_node", nodeType: "image" }) === "add_node image",
        permissions.describeAgentOp({ type: "add_node", nodeType: "image" }),
    );
    ok(
        "agent op describe connect_nodes and run_generation",
        permissions.describeAgentOp({ type: "connect_nodes", fromNodeId: "a", toNodeId: "b" }) === "connect_nodes a->b" &&
            permissions.describeAgentOp({ type: "run_generation", nodeId: "n1" }) === "run_generation n1 image",
        permissions.describeAgentOp({ type: "connect_nodes", fromNodeId: "a", toNodeId: "b" }),
    );

    const outputFile = await import("/src/lib/workspace/output-file.ts");
    ok("output file name uses the source title", outputFile.outputFileName("My Image", "img1", "image/png") === "My Image.png", outputFile.outputFileName("My Image", "img1", "image/png"));
    ok("output file name falls back to the source id", outputFile.outputFileName("   ", "img1", "image/png") === "img1.png", outputFile.outputFileName("   ", "img1", "image/png"));
    ok("output file name strips path-illegal characters", outputFile.outputFileName('a/b:c*d?e"f<g>h|i', "x", "image/jpeg") === "abcdefghi.jpg", outputFile.outputFileName('a/b:c*d?e"f<g>h|i', "x", "image/jpeg"));
    ok("output file name defaults the extension to png", outputFile.outputFileName("shot", "x") === "shot.png", outputFile.outputFileName("shot", "x"));
    ok(
        "output extension maps the mime type",
        outputFile.outputFileExtension("video/webm") === "webm" && outputFile.outputFileExtension("audio/mpeg") === "mp3" && outputFile.outputFileExtension("image/webp") === "webp",
        outputFile.outputFileExtension("video/webm") + "," + outputFile.outputFileExtension("audio/mpeg"),
    );
    ok(
        "output extension falls back to the storage key",
        outputFile.outputFileExtension(undefined, "video:1") === "mp4" && outputFile.outputFileExtension(undefined, "audio:1") === "mp3" && outputFile.outputFileExtension(undefined, "image:1") === "png",
        outputFile.outputFileExtension(undefined, "video:1"),
    );
    ok("output fingerprint uses the storage key when present", outputFile.outputSourceFingerprint("s1", "image:1", "ignored") === "s1:image:1", outputFile.outputSourceFingerprint("s1", "image:1", "ignored"));
    ok("output fingerprint falls back to the content length and prefix", outputFile.outputSourceFingerprint("s1", undefined, "abcdef") === "s1:6:abcdef", outputFile.outputSourceFingerprint("s1", undefined, "abcdef"));
    ok(
        "output fingerprint changes when the content changes",
        outputFile.outputSourceFingerprint("s1", undefined, "aaaa") !== outputFile.outputSourceFingerprint("s1", undefined, "bbbb"),
        outputFile.outputSourceFingerprint("s1", undefined, "aaaa"),
    );

    const folderStore = await import("/src/stores/use-asset-folder-store.ts");
    const freshFolders = folderStore.useAssetFolderStore.getState().folders;
    ok("per-node folder store starts with no bindings", Object.keys(freshFolders).length === 0, JSON.stringify(Object.keys(freshFolders)));
    const unwritten = await folderStore.useAssetFolderStore.getState().writeAsset("noop-node", "noop.png", new Blob(["x"], { type: "image/png" }));
    const foldersAfterWrite = folderStore.useAssetFolderStore.getState().folders;
    ok(
        "per-node folder write without a bound folder never throws and only marks that node",
        unwritten === false && foldersAfterWrite["noop-node"]?.folderName === "" && foldersAfterWrite["noop-node"]?.collectStatus === "failed" && foldersAfterWrite["other-node"] === undefined,
        unwritten + "," + JSON.stringify(foldersAfterWrite),
    );

    const canvasStore = await import("/src/stores/canvas/use-canvas-store.ts");
    const viewportProjectA = canvasStore.useCanvasStore.getState().createProject("e2e viewport a");
    const viewportProjectB = canvasStore.useCanvasStore.getState().createProject("e2e viewport b");
    canvasStore.useCanvasStore.getState().updateProject(viewportProjectA, { viewport: { x: 12, y: 34, k: 0.5 } });
    const viewportA = canvasStore.useCanvasStore.getState().projects.find((project) => project.id === viewportProjectA).viewport;
    const viewportB = canvasStore.useCanvasStore.getState().projects.find((project) => project.id === viewportProjectB).viewport;
    ok(
        "canvas store keeps the viewport on its own project",
        viewportA.x === 12 && viewportA.y === 34 && viewportA.k === 0.5 && viewportB.x === 0 && viewportB.y === 0 && viewportB.k === 1,
        JSON.stringify([viewportA, viewportB]),
    );

    const algorithms = await import("/src/lib/image/image-algorithms.ts");
    const cropClamped = algorithms.resolveSmartCropArea(100, 80, 1, { x: -5, y: -3, width: 200, height: 200 });
    ok("smart crop clamps into image bounds", cropClamped.x === 0 && cropClamped.y === 0 && cropClamped.width === 100 && cropClamped.height === 80, JSON.stringify(cropClamped));
    const cropRounded = algorithms.resolveSmartCropArea(101, 80, 1, { x: 1.4, y: 2.6, width: 30.5, height: 20.2 });
    ok("smart crop rounds to integers", cropRounded.x === 1 && cropRounded.y === 3 && cropRounded.width === 31 && cropRounded.height === 20, JSON.stringify(cropRounded));
    const cropInvalid = algorithms.resolveSmartCropArea(120, 90, 0, { x: 5, y: 5, width: 20, height: 20 });
    ok("smart crop falls back to the full image on invalid aspect", cropInvalid.x === 0 && cropInvalid.y === 0 && cropInvalid.width === 120 && cropInvalid.height === 90, JSON.stringify(cropInvalid));
    const cropInside = algorithms.resolveSmartCropArea(64, 48, 1.5, { x: 50, y: 40, width: 40, height: 30 });
    ok("smart crop keeps the box inside the image", cropInside.x + cropInside.width <= 64 && cropInside.y + cropInside.height <= 48 && cropInside.width >= 1 && cropInside.height >= 1, JSON.stringify(cropInside));

    const ocr = await import("/src/lib/canvas/canvas-ocr.ts");
    ok("ocr trims surrounding whitespace", ocr.normaliseOcrText("  hello \\n\\n") === "hello", JSON.stringify(ocr.normaliseOcrText("  hello \\n\\n")));
    ok("ocr strips wrapping code fences", ocr.normaliseOcrText("\`\`\`text\\nline 1\\nline 2\\n\`\`\`") === "line 1\\nline 2", JSON.stringify(ocr.normaliseOcrText("\`\`\`text\\nline 1\\nline 2\\n\`\`\`")));
    ok("ocr strips trailing whitespace per line", ocr.normaliseOcrText("a  \\nb\\t\\nc") === "a\\nb\\nc", JSON.stringify(ocr.normaliseOcrText("a  \\nb\\t\\nc")));
    ok("ocr keeps inner blank lines and spacing", ocr.normaliseOcrText("a b\\n\\nc") === "a b\\n\\nc", JSON.stringify(ocr.normaliseOcrText("a b\\n\\nc")));
    ok("ocr normalises blank input", ocr.normaliseOcrText("   ") === "", JSON.stringify(ocr.normaliseOcrText("   ")));
    ok("ocr exposes extractImageText", typeof ocr.extractImageText === "function");

    const sam = await import("/src/lib/image/mobile-sam-math.ts");
    ok("sam resize scale landscape", sam.samResizeScale(1000, 500) === 1024 / 1000, sam.samResizeScale(1000, 500));
    ok("sam resize scale portrait", sam.samResizeScale(500, 1000) === 1024 / 1000, sam.samResizeScale(500, 1000));
    ok("sam resize scale square", sam.samResizeScale(1024, 1024) === 1 && sam.MOBILE_SAM_INPUT_SIZE === 1024, sam.samResizeScale(1024, 1024));
    ok("sam model point scales into model space", JSON.stringify(sam.samModelPoint(10, 20, 0.5)) === "[5,10]", JSON.stringify(sam.samModelPoint(10, 20, 0.5)));
    ok("sam best mask index picks argmax", sam.pickBestMaskIndex([0.1, 0.9, 0.3]) === 1, sam.pickBestMaskIndex([0.1, 0.9, 0.3]));
    ok("sam best mask index ties take the first", sam.pickBestMaskIndex([0.4, 0.6, 0.6]) === 1, sam.pickBestMaskIndex([0.4, 0.6, 0.6]));
    ok("sam best mask index empty is zero", sam.pickBestMaskIndex([]) === 0, sam.pickBestMaskIndex([]));
    ok("sam binarize thresholds at zero", Array.from(sam.binarizeMaskLogits([-1, 0, 1])).join(",") === "0,0,1", Array.from(sam.binarizeMaskLogits([-1, 0, 1])).join(","));
    ok("sam binarize keeps all positive", Array.from(sam.binarizeMaskLogits([1, 2, 3])).join(",") === "1,1,1", Array.from(sam.binarizeMaskLogits([1, 2, 3])).join(","));
    ok("sam binarize drops all negative", Array.from(sam.binarizeMaskLogits([-3, -2, -1])).join(",") === "0,0,0", Array.from(sam.binarizeMaskLogits([-3, -2, -1])).join(","));
    ok("sam score clamps into zero to one", sam.clampSamScore(1.0177) === 1 && sam.clampSamScore(-0.5) === 0 && sam.clampSamScore(0.42) === 0.42, sam.clampSamScore(1.0177) + "," + sam.clampSamScore(-0.5) + "," + sam.clampSamScore(0.42));
    ok("sam score handles non-finite", sam.clampSamScore(Number.NaN) === 0 && sam.clampSamScore(Number.POSITIVE_INFINITY) === 0, sam.clampSamScore(Number.NaN) + "," + sam.clampSamScore(Number.POSITIVE_INFINITY));

    const modelStore = await import("/src/stores/use-local-model-store.ts");
    const localModels = modelStore.listLocalModels();
    ok("local model registry lists background-removal", localModels.some((model) => model.id === "background-removal"), JSON.stringify(localModels.map((model) => model.id)));
    ok("local model descriptor exposes title/description/prepare/clear/read", localModels.every((model) => typeof model.titleKey === "string" && typeof model.descriptionKey === "string" && typeof model.prepare === "function" && typeof model.clear === "function" && typeof model.read === "function"), JSON.stringify(localModels.map((model) => Object.keys(model))));

    const assetFolder = await import("/src/lib/canvas/asset-folder.ts");
    ok("asset folder classifies image", assetFolder.classifyAssetFolderFile({ type: "image/png", name: "a.png" }) === "image");
    ok("asset folder classifies video", assetFolder.classifyAssetFolderFile({ type: "video/mp4", name: "a.mp4" }) === "video");
    ok("asset folder classifies audio", assetFolder.classifyAssetFolderFile({ type: "audio/mpeg", name: "a.mp3" }) === "audio");
    ok("asset folder classifies plain text", assetFolder.classifyAssetFolderFile({ type: "text/plain", name: "a.txt" }) === "text");
    ok("asset folder classifies text by extension", assetFolder.classifyAssetFolderFile({ type: "", name: "notes.md" }) === "text");
    ok("asset folder drops unknown files", assetFolder.classifyAssetFolderFile({ type: "application/zip", name: "a.zip" }) === null);
    ok("asset folder cap is 200", assetFolder.ASSET_FOLDER_FILE_LIMIT === 200);
    ok("asset folder drag mime", assetFolder.ASSET_FOLDER_DRAG_MIME === "application/x-infinite-canvas-folder-file");

    const assetsNode = { id: "assets", type: "assets", title: "assets", position: { x: 0, y: 0 }, width: 360, height: 320, metadata: {} };
    const plainImage = image("plain", 100, 100, { x: 500, y: 0 });
    ok("merged assets node accepts an upstream connection", geo.normalizeConnection(plainImage.id, assetsNode.id, [plainImage, assetsNode], "source")?.toNodeId === assetsNode.id);

    const canvasConstants = await import("/src/constant/canvas.ts");
    ok(
        "merged assets node resolves a default size",
        canvasConstants.NODE_DEFAULT_SIZE.assets.width === 360 && canvasConstants.NODE_DEFAULT_SIZE.assets.height === 320 && canvasConstants.NODE_SPECS.assets.width === 360 && canvasConstants.NODE_SPECS.assets.height === 320,
        JSON.stringify(canvasConstants.NODE_SPECS.assets),
    );
    ok(
        "node specs expose exactly one folder node and no output type",
        "assets" in canvasConstants.NODE_SPECS && !("output" in canvasConstants.NODE_SPECS) && !("output" in canvasConstants.NODE_DEFAULT_SIZE) && !("asset-input" in canvasConstants.NODE_SPECS),
        JSON.stringify(Object.keys(canvasConstants.NODE_SPECS)),
    );
    const assetsSpec = canvasConstants.getNodeSpec("assets");
    ok(
        "merged assets node resolves a definition with a titled default size",
        assetsSpec.width === 360 && assetsSpec.height === 320 && typeof assetsSpec.title === "string" && assetsSpec.title.length > 0 && Boolean(assetsSpec.metadata),
        JSON.stringify({ title: assetsSpec.title, width: assetsSpec.width, height: assetsSpec.height }),
    );

    return results;
})()`;

function connect(wsUrl) {
    return new Promise((resolvePromise, rejectPromise) => {
        const socket = new WebSocket(wsUrl);
        socket.addEventListener("open", () => resolvePromise(socket));
        socket.addEventListener("error", () => rejectPromise(new Error("CDP socket error")));
    });
}

async function send(socket, id, method, params) {
    socket.send(JSON.stringify({ id, method, params }));
    while (true) {
        const message = await new Promise((resolvePromise) => socket.addEventListener("message", (event) => resolvePromise(event), { once: true }));
        const payload = JSON.parse(typeof message.data === "string" ? message.data : String(message.data));
        if (payload.id === id) return payload.result;
    }
}

async function main() {
    if (!CHROME) throw new Error("Chrome not found on this machine");
    try {
        const app = await fetch(`${BASE}/`);
        if (!app.ok) throw new Error(String(app.status));
    } catch {
        throw new Error(`Dev server is not reachable at ${BASE} — start it before running the E2E suite`);
    }
    try {
        const bridge = await fetch(`${AGENT_BRIDGE}/health`);
        if (!bridge.ok) console.log(`agent bridge health returned ${bridge.status} at ${AGENT_BRIDGE}`);
    } catch {
        console.log(`agent bridge not reachable at ${AGENT_BRIDGE} (bridge health check skipped)`);
    }

    mkdirSync(ARTIFACTS, { recursive: true });
    const profile = join(tmpdir(), `opencanvas-e2e-${process.pid}`);
    rmSync(profile, { recursive: true, force: true });
    const child = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1500,950", `${BASE}/canvas`], { stdio: "ignore" });

    let targets = [];
    for (let attempt = 0; attempt < 40; attempt++) {
        await delay(500);
        try {
            targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            if (targets.some((target) => target.type === "page" && target.webSocketDebuggerUrl)) break;
        } catch {}
    }
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error("Could not attach to a Chrome page target");

    const socket = await connect(page.webSocketDebuggerUrl);
    let nextId = 1;
    await send(socket, nextId++, "Runtime.enable", {});
    await send(socket, nextId++, "Page.enable", {});
    await delay(3000);

    const consoleErrors = [];
    socket.addEventListener("message", (event) => {
        const payload = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        if (payload.method === "Runtime.exceptionThrown") consoleErrors.push(payload.params.exceptionDetails?.text || "exception");
        if (payload.method === "Runtime.consoleAPICalled" && payload.params.type === "error") consoleErrors.push("console.error");
    });

    const evaluated = await send(socket, nextId++, "Runtime.evaluate", { expression: LIB_ASSERTIONS, awaitPromise: true, returnByValue: true });
    const raw = evaluated?.result?.value;
    const results = Array.isArray(raw) ? raw : [];
    if (!Array.isArray(raw)) {
        const detail = evaluated?.exceptionDetails?.exception?.description || evaluated?.exceptionDetails?.text || JSON.stringify(evaluated);
        console.log(`in-page assertion error: ${String(detail).split("\n").slice(0, 6).join(" | ")}`);
    }
    const screenshot = await send(socket, nextId++, "Page.captureScreenshot", { format: "png" });
    if (screenshot?.data) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(join(ARTIFACTS, "canvas.png"), Buffer.from(screenshot.data, "base64"));
    }
    socket.close();
    child.kill();

    let failed = 0;
    for (const result of results) {
        if (result.pass) console.log(`  PASS  ${result.name}`);
        else {
            failed += 1;
            console.log(`  FAIL  ${result.name}  ->  ${result.detail}`);
        }
    }
    console.log(`\n${results.length - failed}/${results.length} library assertions passed`);
    console.log(`console errors during run: ${consoleErrors.length}`);
    console.log(`artifacts: ${ARTIFACTS}`);
    if (!results.length) {
        console.log(`no assertions ran: ${JSON.stringify(evaluated).slice(0, 400)}`);
        process.exitCode = 1;
        return;
    }
    process.exitCode = failed || consoleErrors.length ? 1 : 0;
}

main().catch((error) => {
    console.error(`E2E failed: ${error.message}`);
    process.exit(1);
});
