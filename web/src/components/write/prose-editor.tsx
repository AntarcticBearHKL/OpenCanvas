import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Camera, Check, ChevronDown, Focus, Heading2, Italic, Library, List, ListOrdered, Minus, Quote, Redo2, Sparkles, Square, Strikethrough, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { STUDIO_BAR_CLASS, STUDIO_DIVIDER_CLASS, STUDIO_FLAT_BUTTON_CLASS, STUDIO_ICON_BUTTON_CLASS, STUDIO_TOOL_BUTTON_CLASS } from "@/components/canvas/workspace/studio-chrome";
import { useWriteAi, type WriteAiMode } from "@/components/write/use-write-ai";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { frostedSurfaceClass } from "@/lib/canvas-theme";
import { docUnitFor, docUnitNodes } from "@/lib/write/outline";
import { CODEX_META, levelOf } from "@/lib/write/presets";
import { countWords, htmlToPlain } from "@/lib/write/text";
import { useWriteUiStore } from "@/stores/use-write-ui-store";
import { useWritingProject, useWritingStore } from "@/stores/use-writing-store";
import type { ChainedCommands, JSONContent } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";

const SAVE_DELAY = 600;
const AI_MODES: WriteAiMode[] = ["continue", "rewrite", "expand", "condense", "polish", "dialogue"];

const FLOATING_MENU_CLASS = `absolute z-50 overflow-hidden rounded-none border ${frostedSurfaceClass}`;
const MENU_ROW_CLASS = "flex w-full min-w-0 items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-sm transition hover:bg-hover";
const PROSE_COLUMN_CLASS = "mx-auto w-full max-w-[720px] px-6 py-8";
const PROSE_CLASS = [
    "[&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-7",
    "[&_.ProseMirror_p]:my-2",
    "[&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold",
    "[&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-1.5 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-medium",
    "[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6",
    "[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6",
    "[&_.ProseMirror_li_p]:my-0",
    "[&_.ProseMirror_blockquote]:my-3 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:[border-color:var(--prose-border)] [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:opacity-80",
    "[&_.ProseMirror_hr]:my-5 [&_.ProseMirror_hr]:h-px [&_.ProseMirror_hr]:border-0 [&_.ProseMirror_hr]:[background-color:var(--prose-border)]",
    "[&_.ProseMirror_pre]:my-3 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-[2px] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:[background-color:var(--prose-fill)] [&_.ProseMirror_pre]:text-xs",
    "[&_.ProseMirror_p.is-empty::before]:pointer-events-none",
    "[&_.ProseMirror_p.is-empty::before]:float-left",
    "[&_.ProseMirror_p.is-empty::before]:h-0",
    "[&_.ProseMirror_p.is-empty::before]:[color:var(--prose-placeholder)]",
    "[&_.ProseMirror_p.is-empty::before]:[content:attr(data-placeholder)]",
].join(" ");

function toParagraphs(text: string): JSONContent[] {
    return text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }));
}

type ToolItem = { key: string; label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; run: () => void };

export function ProseEditor() {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    const projectId = useWriteUiStore((state) => state.projectId);
    const selectedOutlineId = useWriteUiStore((state) => state.selectedOutlineId);
    const focusMode = useWriteUiStore((state) => state.focusMode);
    const setFocusMode = useWriteUiStore((state) => state.setFocusMode);
    const editorCommand = useWriteUiStore((state) => state.editorCommand);
    const setEditorCommand = useWriteUiStore((state) => state.setEditorCommand);
    const project = useWritingProject(projectId ?? undefined);
    const setDoc = useWritingStore((state) => state.setDoc);
    const snapshot = useWritingStore((state) => state.snapshot);
    const ai = useWriteAi();

    const unit = project ? docUnitFor(project, selectedOutlineId) ?? docUnitNodes(project)[0] ?? null : null;
    const unitId = unit?.id ?? null;

    const shellRef = useRef<HTMLDivElement | null>(null);
    const pendingRef = useRef(new Map<string, { projectId: string; html: string }>());
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rangeRef = useRef<{ from: number; to: number } | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [words, setWords] = useState(0);
    const [focused, setFocused] = useState(false);
    const [slashDismissed, setSlashDismissed] = useState(false);
    const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
    const [codexOpen, setCodexOpen] = useState(false);
    const [codexQuery, setCodexQuery] = useState("");
    const [codexPos, setCodexPos] = useState<{ top: number; left: number } | null>(null);
    const [aiMenuOpen, setAiMenuOpen] = useState(false);
    const [barPos, setBarPos] = useState<{ top: number; left: number } | null>(null);

    const flushPending = useCallback(() => {
        const pending = pendingRef.current;
        if (!pending.size) return;
        pendingRef.current = new Map();
        pending.forEach((item, id) => {
            const plain = htmlToPlain(item.html);
            setDoc(item.projectId, id, { html: item.html, plain, wordCount: countWords(plain) });
        });
    }, [setDoc]);

    const flushNow = useCallback(() => {
        const hadPending = pendingRef.current.size > 0;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        flushPending();
        if (hadPending) {
            setSaving(false);
            setSaved(true);
        }
    }, [flushPending]);

    const queueSave = useCallback(
        (id: string, html: string) => {
            if (!projectId) return;
            pendingRef.current.set(id, { projectId, html });
            setSaving(true);
            setSaved(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                flushNow();
            }, SAVE_DELAY);
        },
        [flushNow, projectId],
    );

    const editor = useEditor(
        {
            extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Placeholder.configure({ placeholder: t("writing.editor.placeholder") }), CharacterCount],
            content: unitId ? project?.docs[unitId]?.html ?? "" : "",
            immediatelyRender: false,
            editorProps: { attributes: { class: "min-h-[45vh] outline-none" } },
            onUpdate: ({ editor: current }) => {
                setWords(countWords(current.getText()));
                if (unitId) queueSave(unitId, current.getHTML());
            },
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
        },
        [projectId, unitId],
    );

    useEffect(() => {
        if (!editorCommand || !editor) return;
        const chain = editor.chain().focus();
        if (editorCommand.startsWith("insert:")) chain.insertContent(editorCommand.slice(7)).run();
        else if (editorCommand === "undo") chain.undo().run();
        else if (editorCommand === "redo") chain.redo().run();
        else if (editorCommand === "bold") chain.toggleBold().run();
        else if (editorCommand === "italic") chain.toggleItalic().run();
        else if (editorCommand === "strike") chain.toggleStrike().run();
        else if (editorCommand === "h2") chain.toggleHeading({ level: 2 }).run();
        else if (editorCommand === "h3") chain.toggleHeading({ level: 3 }).run();
        else if (editorCommand === "bullet") chain.toggleBulletList().run();
        else if (editorCommand === "ordered") chain.toggleOrderedList().run();
        else if (editorCommand === "quote") chain.toggleBlockquote().run();
        else if (editorCommand === "divider") chain.setHorizontalRule().run();
        setEditorCommand(null);
    }, [editorCommand, editor, setEditorCommand]);

    const marks = useEditorState({
        editor,
        selector: ({ editor: current }) =>
            current
                ? {
                      bold: current.isActive("bold"),
                      italic: current.isActive("italic"),
                      strike: current.isActive("strike"),
                      heading: current.isActive("heading", { level: 2 }),
                      bulletList: current.isActive("bulletList"),
                      orderedList: current.isActive("orderedList"),
                      blockquote: current.isActive("blockquote"),
                      canUndo: current.can().undo(),
                      canRedo: current.can().redo(),
                  }
                : null,
    });

    const selection = useEditorState({
        editor,
        selector: ({ editor: current }) => {
            if (!current) return null;
            const { from, to } = current.state.selection;
            return { from, to, text: from === to ? "" : current.state.doc.textBetween(from, to, "\n") };
        },
    });

    const slash = useEditorState({
        editor,
        selector: ({ editor: current }) => {
            if (!current) return null;
            const { $from, empty } = current.state.selection;
            if (!empty || $from.parent.type.name !== "paragraph") return null;
            return $from.parent.textBetween(0, $from.parentOffset) === "/" ? $from.pos : null;
        },
    });

    const slashOpen = slash !== null && focused && !slashDismissed && !codexOpen;
    const selectedText = selection?.text ?? "";
    const aiOpen = ai.state.mode !== null && (ai.state.running || Boolean(ai.state.text) || Boolean(ai.state.error));

    useEffect(() => {
        if (!editor) return;
        setWords(countWords(editor.getText()));
    }, [editor]);

    useEffect(() => {
        setSaving(false);
        setSaved(false);
    }, [unitId]);

    useEffect(
        () => () => {
            flushNow();
        },
        [flushNow],
    );

    useEffect(() => {
        if (slash === null) setSlashDismissed(false);
    }, [slash]);

    useEffect(() => {
        const shell = shellRef.current;
        if (!editor || !shell || slash === null) {
            setSlashPos(null);
            return;
        }
        const rect = shell.getBoundingClientRect();
        const coords = editor.view.coordsAtPos(slash);
        setSlashPos({ top: coords.bottom - rect.top + shell.scrollTop + 6, left: Math.max(8, Math.min(coords.left - rect.left, rect.width - 180)) });
    }, [editor, slash]);

    useEffect(() => {
        const shell = shellRef.current;
        if (!editor || !shell || !selectedText || !selection) {
            setBarPos(null);
            return;
        }
        const rect = shell.getBoundingClientRect();
        const coords = editor.view.coordsAtPos(selection.from);
        setBarPos({ top: coords.bottom - rect.top + shell.scrollTop + 6, left: Math.max(8, Math.min(coords.left - rect.left, rect.width - 260)) });
    }, [editor, selectedText, selection]);

    useEffect(() => {
        if (!slashOpen && !codexOpen && !aiMenuOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setSlashDismissed(true);
            setCodexOpen(false);
            setAiMenuOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [aiMenuOpen, codexOpen, slashOpen]);

    const codexEntries = useMemo(() => {
        if (!project) return [];
        const query = codexQuery.trim().toLowerCase();
        const list = query
            ? project.codex.filter((entry) => entry.name.toLowerCase().includes(query) || entry.aliases.some((alias) => alias.toLowerCase().includes(query)))
            : project.codex;
        return list.slice(0, 8).map((entry) => ({ id: entry.id, name: entry.name, icon: CODEX_META[entry.kind].icon }));
    }, [codexQuery, project]);

    const runSlash = (command: (chain: ChainedCommands) => ChainedCommands) => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        command(editor.chain().focus().deleteRange({ from: from - 1, to })).run();
        setSlashDismissed(true);
    };

    const openCodexPicker = () => {
        const shell = shellRef.current;
        if (!editor || !shell) return;
        const rect = shell.getBoundingClientRect();
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        setCodexPos({ top: coords.bottom - rect.top + shell.scrollTop + 6, left: Math.max(8, Math.min(coords.left - rect.left, rect.width - 248)) });
        const { from, to } = editor.state.selection;
        editor.chain().focus().deleteRange({ from: from - 1, to }).run();
        setCodexQuery("");
        setCodexOpen(true);
    };

    const insertCodex = (name: string) => {
        setCodexOpen(false);
        editor?.chain().focus().insertContent(name).run();
    };

    const runAi = (mode: WriteAiMode, fromSelection: boolean) => {
        if (!editor || !unitId) return;
        flushNow();
        const { from, to } = editor.state.selection;
        const text = fromSelection && from !== to ? editor.state.doc.textBetween(from, to, "\n") : "";
        rangeRef.current = text ? { from, to } : null;
        void ai.runProse(unitId, mode, "", text);
    };

    const acceptAi = () => {
        const text = ai.state.text.trim();
        if (editor && text) {
            const content = toParagraphs(text);
            const range = ai.state.mode === "rewrite" ? rangeRef.current : null;
            if (range) {
                const size = editor.state.doc.content.size;
                editor.chain().focus().insertContentAt({ from: Math.min(range.from, size), to: Math.min(range.to, size) }, content).run();
            } else {
                editor.chain().focus().insertContent(content).run();
            }
        }
        rangeRef.current = null;
        ai.reset();
    };

    const discardAi = () => {
        rangeRef.current = null;
        ai.reset();
    };

    const renderTool = (tool: ToolItem) => (
        <button
            key={tool.key}
            type="button"
            className={STUDIO_TOOL_BUTTON_CLASS}
            style={tool.active ? { background: theme.toolbar.accentBg, color: theme.toolbar.accentText } : { color: theme.node.label }}
            aria-label={tool.label}
            aria-pressed={tool.active}
            disabled={tool.disabled}
            onClick={tool.run}
        >
            <tool.icon className="size-3.5" />
        </button>
    );

    if (!project || !unit) {
        return (
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 text-sm" style={{ background: theme.canvas.background, color: theme.node.muted }}>
                {t("writing.editor.empty")}
            </div>
        );
    }

    const kindLevel = levelOf(project.template, unit.kind);
    const markTools: ToolItem[] = [
        { key: "bold", label: "Bold", icon: Bold, active: marks?.bold, run: () => editor?.chain().focus().toggleBold().run() },
        { key: "italic", label: "Italic", icon: Italic, active: marks?.italic, run: () => editor?.chain().focus().toggleItalic().run() },
        { key: "strike", label: "Strikethrough", icon: Strikethrough, active: marks?.strike, run: () => editor?.chain().focus().toggleStrike().run() },
    ];
    const blockTools: ToolItem[] = [
        { key: "heading", label: "Heading 2", icon: Heading2, active: marks?.heading, run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
        { key: "bullet", label: "Bulleted list", icon: List, active: marks?.bulletList, run: () => editor?.chain().focus().toggleBulletList().run() },
        { key: "ordered", label: "Numbered list", icon: ListOrdered, active: marks?.orderedList, run: () => editor?.chain().focus().toggleOrderedList().run() },
        { key: "quote", label: "Blockquote", icon: Quote, active: marks?.blockquote, run: () => editor?.chain().focus().toggleBlockquote().run() },
        { key: "divider", label: "Divider", icon: Minus, run: () => editor?.chain().focus().setHorizontalRule().run() },
    ];
    const historyTools: ToolItem[] = [
        { key: "undo", label: "Undo", icon: Undo2, disabled: !marks?.canUndo, run: () => editor?.chain().focus().undo().run() },
        { key: "redo", label: "Redo", icon: Redo2, disabled: !marks?.canRedo, run: () => editor?.chain().focus().redo().run() },
    ];
    const slashItems: ToolItem[] = [
        { key: "heading", label: t("writing.editor.slash.heading"), icon: Heading2, run: () => runSlash((chain) => chain.toggleHeading({ level: 2 })) },
        { key: "bullet", label: t("writing.editor.slash.bullet"), icon: List, run: () => runSlash((chain) => chain.toggleBulletList()) },
        { key: "quote", label: t("writing.editor.slash.quote"), icon: Quote, run: () => runSlash((chain) => chain.toggleBlockquote()) },
        { key: "divider", label: t("writing.editor.slash.divider"), icon: Minus, run: () => runSlash((chain) => chain.setHorizontalRule()) },
        { key: "codex", label: t("writing.editor.slash.codex"), icon: Library, run: openCodexPicker },
        {
            key: "ai",
            label: t("writing.editor.slash.ai"),
            icon: Sparkles,
            run: () => {
                runSlash((chain) => chain);
                flushNow();
                void ai.runProse(unit.id, "continue");
            },
        },
    ];

    return (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <header className={`${STUDIO_BAR_CLASS} h-9 shrink-0`} style={{ borderBottom: `1px solid ${theme.toolbar.border}` }}>
                <span className="min-w-0 truncate text-sm font-medium">{unit.title}</span>
                {kindLevel ? <span className="shrink-0 text-sm" style={{ color: theme.node.muted }}>{t(kindLevel.labelKey)}</span> : null}
                <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                <span className="shrink-0 text-sm tabular-nums" style={{ color: theme.node.muted }}>{t("writing.editor.words", { count: words })}</span>
                {saving || saved ? <span className="shrink-0 text-xs" style={{ color: saving ? theme.node.muted : theme.node.success }}>{saving ? t("writing.editor.saving") : t("writing.editor.saved")}</span> : null}
                <div className="ml-auto flex items-center gap-1">
                    <div
                        className="relative"
                        onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAiMenuOpen(false);
                        }}
                    >
                        <button
                            type="button"
                            className={STUDIO_FLAT_BUTTON_CLASS}
                            style={aiMenuOpen ? { background: theme.toolbar.accentBg, color: theme.toolbar.accentText } : { color: theme.node.accent }}
                            aria-haspopup="menu"
                            aria-expanded={aiMenuOpen}
                            onClick={() => setAiMenuOpen(!aiMenuOpen)}
                        >
                            <Sparkles className="size-3.5" />
                            <span>{t("writing.editor.aiMenu.label")}</span>
                            <ChevronDown className="size-3" />
                        </button>
                        {aiMenuOpen ? (
                            <div className={`${FLOATING_MENU_CLASS} right-0 top-[calc(100%+6px)] w-28 p-1`} style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }} role="menu">
                                {AI_MODES.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        role="menuitem"
                                        className={MENU_ROW_CLASS}
                                        style={{ color: theme.node.text }}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                            setAiMenuOpen(false);
                                            runAi(mode, false);
                                        }}
                                    >
                                        {t(`writing.editor.aiMenu.${mode}`)}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className={STUDIO_ICON_BUTTON_CLASS}
                        style={{ color: theme.node.label }}
                        aria-label={t("writing.editor.snapshot")}
                        title={t("writing.editor.snapshot")}
                        onClick={() => snapshot(project.id, unit.id, t("writing.history.auto"))}
                    >
                        <Camera className="size-4" />
                    </button>
                    <button
                        type="button"
                        className={STUDIO_ICON_BUTTON_CLASS}
                        style={focusMode ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { color: theme.node.muted }}
                        aria-label={t(focusMode ? "writing.editor.exitFocus" : "writing.editor.focus")}
                        title={t(focusMode ? "writing.editor.exitFocus" : "writing.editor.focus")}
                        aria-pressed={focusMode}
                        onClick={() => setFocusMode(!focusMode)}
                    >
                        <Focus className="size-4" />
                    </button>
                </div>
            </header>
            {focusMode ? null : (
                <div className={`${STUDIO_BAR_CLASS} h-9 shrink-0`} style={{ borderBottom: `1px solid ${theme.toolbar.border}` }} onMouseDown={(event) => event.preventDefault()}>
                    {markTools.map(renderTool)}
                    <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                    {blockTools.map(renderTool)}
                    <span className={STUDIO_DIVIDER_CLASS} style={{ background: theme.toolbar.border }} />
                    {historyTools.map(renderTool)}
                </div>
            )}
            <div
                ref={shellRef}
                className={`thin-scrollbar relative min-h-0 flex-1 overflow-y-auto ${PROSE_CLASS}`}
                style={{ "--prose-placeholder": theme.node.placeholder, "--prose-border": theme.toolbar.border, "--prose-fill": theme.node.fill } as CSSProperties}
            >
                <EditorContent editor={editor} className={PROSE_COLUMN_CLASS} />
                {slashOpen && slashPos ? (
                    <div className={`${FLOATING_MENU_CLASS} w-36 p-1`} style={{ top: slashPos.top, left: slashPos.left, background: theme.toolbar.panel, borderColor: theme.toolbar.border }} role="menu">
                        {slashItems.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="menuitem"
                                className={MENU_ROW_CLASS}
                                style={{ color: theme.node.text }}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    item.run();
                                }}
                            >
                                <item.icon className="size-3.5 shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                {codexOpen && codexPos ? (
                    <div className={`${FLOATING_MENU_CLASS} w-60 p-1.5`} style={{ top: codexPos.top, left: codexPos.left, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                        <input
                            autoFocus
                            value={codexQuery}
                            placeholder={t("writing.editor.codexPlaceholder")}
                            onChange={(event) => setCodexQuery(event.target.value)}
                            onBlur={() => window.setTimeout(() => setCodexOpen(false), 120)}
                            className="mb-1 w-full rounded-[2px] bg-transparent px-2 py-1 text-sm outline-none"
                            style={{ color: theme.node.text, border: `1px solid ${theme.toolbar.border}` }}
                        />
                        <div className="thin-scrollbar max-h-52 overflow-y-auto">
                            {codexEntries.length ? (
                                codexEntries.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        className={MENU_ROW_CLASS}
                                        style={{ color: theme.node.text }}
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            insertCodex(entry.name);
                                        }}
                                    >
                                        <entry.icon className="size-3.5 shrink-0" />
                                        <span className="truncate">{entry.name}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="px-2 py-1.5 text-sm" style={{ color: theme.node.muted }}>{t("writing.common.none")}</div>
                            )}
                        </div>
                    </div>
                ) : null}
                {selectedText && focused && !ai.state.running && barPos ? (
                    <div
                        className={`${FLOATING_MENU_CLASS} flex items-center gap-0.5 p-1`}
                        style={{ top: barPos.top, left: barPos.left, background: theme.node.accentSoft, borderColor: theme.node.accent }}
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        {AI_MODES.map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className="rounded-[2px] px-1.5 py-1 text-sm font-medium whitespace-nowrap transition hover:bg-hover"
                                style={{ color: theme.node.accentText }}
                                onClick={() => runAi(mode, true)}
                            >
                                {t(`writing.editor.aiMenu.${mode}`)}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            {aiOpen ? (
                <div className={`${FLOATING_MENU_CLASS} inset-x-3 bottom-3 max-h-[46%]`} style={{ background: theme.node.accentSoft, borderColor: theme.node.accent, color: theme.node.text }}>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm" style={{ borderBottom: `1px solid ${theme.toolbar.border}` }}>
                        <Sparkles className="size-3.5 shrink-0" style={{ color: theme.node.accent }} />
                        <span className="truncate">{ai.state.running ? t("writing.editor.aiMenu.generating") : ai.state.mode ? t(`writing.editor.aiMenu.${ai.state.mode}`) : ""}</span>
                        <div className="ml-auto flex items-center gap-1">
                            {ai.state.running ? (
                                <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.danger }} onClick={ai.stop}>
                                    <Square className="size-3" />
                                    <span>{t("writing.editor.aiMenu.stop")}</span>
                                </button>
                            ) : (
                                <>
                                    <button type="button" className={`${STUDIO_FLAT_BUTTON_CLASS} font-medium`} style={{ color: theme.node.accentText }} disabled={!ai.state.text.trim()} onClick={acceptAi}>
                                        <Check className="size-3" />
                                        <span>{t("writing.editor.aiMenu.accept")}</span>
                                    </button>
                                    <button type="button" className={STUDIO_FLAT_BUTTON_CLASS} style={{ color: theme.node.danger }} onClick={discardAi}>
                                        <X className="size-3" />
                                        <span>{t("writing.editor.aiMenu.reject")}</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="thin-scrollbar max-h-52 overflow-y-auto px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">{ai.state.text}</div>
                    {ai.state.error ? (
                        <div className="px-3 pb-2 text-sm" style={{ color: theme.node.danger }}>
                            {ai.state.error}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
