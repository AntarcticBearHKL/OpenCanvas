import { Modal } from "antd";
import { useTranslation } from "react-i18next";

import { WRITE_AI_MODES } from "@/components/write/use-write-ai";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";

const CONTEXT_KEYS = ["unit", "work", "before", "existing", "instructions"] as const;

export function PromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const theme = useCanvasTheme();
    return (
        <Modal open={open} onCancel={onClose} footer={null} width={640} title={t("writing.promptDialog.title")}>
            <div className="thin-scrollbar flex max-h-[68vh] flex-col gap-4 overflow-y-auto text-sm" style={{ color: theme.node.text }}>
                <p style={{ color: theme.node.muted }}>{t("writing.promptDialog.intro")}</p>
                <section>
                    <div className="pb-1 text-sm font-medium" style={{ color: theme.node.label }}>
                        {t("writing.promptDialog.context")}
                    </div>
                    <ul className="flex flex-col gap-1.5">
                        {CONTEXT_KEYS.map((key) => (
                            <li key={key} className="flex items-start gap-2">
                                <span className="shrink-0 rounded-md px-1.5 py-0.5 text-xs" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>
                                    {t(`writing.prompt.${key}`)}
                                </span>
                                <span style={{ color: theme.node.muted }}>{t(`writing.promptDialog.contextItem.${key}`)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
                <section>
                    <div className="pb-1 text-sm font-medium" style={{ color: theme.node.label }}>
                        {t("writing.promptDialog.actions")}
                    </div>
                    <div className="flex flex-col gap-3">
                        {WRITE_AI_MODES.map((mode) => (
                            <div key={mode}>
                                <div className="text-sm font-medium">{t(`writing.editor.aiMenu.${mode}`)}</div>
                                <p className="whitespace-pre-wrap pt-0.5" style={{ color: theme.node.muted }}>
                                    {t(`writing.prompt.mode.${mode}`)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </Modal>
    );
}
