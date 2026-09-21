import { Form, Input, Modal, Select, Tabs, theme as antdTheme } from "antd";
import { CircleDollarSign, Cloud, Cpu, Database, Info, Palette, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConfigAgentAudit } from "@/components/layout/config-agent-audit";
import { ConfigGenerationCost } from "@/components/layout/config-generation-cost";
import { ConfigLocalModels } from "@/components/layout/config-local-models";
import { ConfigLocalStorage } from "@/components/layout/config-local-storage";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { useConfigStore, type ConfigTabKey } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";

const CONFIG_BODY_HEIGHT = 560;

export function AppConfigPanel() {
    const { i18n, t } = useTranslation();
    const configTab = useConfigStore((state) => state.configTab);
    const setConfigTab = useConfigStore((state) => state.setConfigTab);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const locale = i18n.resolvedLanguage as AppLocale;
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);

    return (
        <Tabs
            tabPlacement="start"
            activeKey={configTab}
            onChange={(key) => setConfigTab(key as ConfigTabKey)}
            className="app-config-tabs h-full"
            classNames={{ header: "app-config-tabs-header w-52 shrink-0 px-2.5 py-3", item: "[&_.ant-tabs-tab-btn]:flex [&_.ant-tabs-tab-btn]:items-center" }}
            styles={{ item: { padding: "5px 10px", borderRadius: 8, marginTop: 2 }, content: { padding: "20px 24px" } }}
            items={[
                {
                    key: "channels",
                    label: t("config.tabs.channels"),
                    icon: <Cloud className="size-4" />,
                    children: (
                        <Form layout="vertical" requiredMark={false}>
                            <Form.Item label={t("config.preferences.apiKey")} className="mb-0">
                                <Input.Password value={config.apiKey} onChange={(event) => updateConfig("apiKey", event.target.value)} placeholder="sk-..." />
                            </Form.Item>
                        </Form>
                    ),
                },
                {
                    key: "appearance",
                    label: t("config.tabs.appearance"),
                    icon: <Palette className="size-4" />,
                    children: (
                        <Form layout="vertical" requiredMark={false}>
                            <div className="grid gap-4 md:grid-cols-4">
                                <Form.Item label={t("config.preferences.language")} className="mb-0">
                                    <Select
                                        value={locale}
                                        onChange={(value) => void changeAppLocale(value)}
                                        options={[
                                            { value: "zh-CN", label: t("locale.zhCN") },
                                            { value: "en-US", label: t("locale.enUS") },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item label={t("config.preferences.theme")} className="mb-0">
                                    <Select
                                        value={theme}
                                        onChange={setTheme}
                                        options={[
                                            { value: "light", label: t("canvas.toolbar.light") },
                                            { value: "dark", label: t("canvas.toolbar.dark") },
                                        ]}
                                    />
                                </Form.Item>
                                <Form.Item label={t("config.preferences.canvasBackground")} className="mb-0">
                                    <Select
                                        value={config.canvasBackgroundMode}
                                        onChange={(value) => updateConfig("canvasBackgroundMode", value)}
                                        options={[
                                            { value: "dots", label: t("canvas.toolbar.dots") },
                                            { value: "lines", label: t("canvas.toolbar.lines") },
                                            { value: "blank", label: t("canvas.toolbar.blank") },
                                        ]}
                                    />
                                </Form.Item>
                            </div>
                        </Form>
                    ),
                },
                {
                    key: "generation",
                    label: t("config.tabs.generation"),
                    icon: <SlidersHorizontal className="size-4" />,
                    children: (
                        <Form layout="vertical" requiredMark={false}>
                            <Form.Item label={t("config.preferences.canvasImageCount")} extra={t("config.preferences.canvasImageCountDescription")} className="mb-0">
                                <Input
                                    type="number"
                                    min={1}
                                    max={15}
                                    value={config.canvasImageCount}
                                    onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                    onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                                />
                            </Form.Item>
                        </Form>
                    ),
                },
                {
                    key: "local-models",
                    label: t("config.tabs.localModels"),
                    icon: <Cpu className="size-4" />,
                    children: <ConfigLocalModels />,
                },
                {
                    key: "local-storage",
                    label: t("config.tabs.localStorage"),
                    icon: <Database className="size-4" />,
                    children: <ConfigLocalStorage active={configTab === "local-storage"} />,
                },
                {
                    key: "cost",
                    label: t("config.tabs.cost"),
                    icon: <CircleDollarSign className="size-4" />,
                    children: <ConfigGenerationCost />,
                },
                {
                    key: "agent",
                    label: t("config.tabs.agent"),
                    icon: <ShieldCheck className="size-4" />,
                    children: <ConfigAgentAudit />,
                },
                {
                    key: "about",
                    label: t("config.tabs.about"),
                    icon: <Info className="size-4" />,
                    children: (
                        <div className="space-y-4">
                            <div>
                                <div className="mb-2 text-sm font-semibold">{t("config.preferences.shortcuts")}</div>
                                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border dark:border-border">
                                    <Shortcut keys={["Ctrl / Space", t("canvas.shortcut.drag")]} value={t("canvas.shortcut.toggleTool")} />
                                    <Shortcut keys={[t("canvas.shortcut.wheel")]} value={t("canvas.shortcut.zoom")} />
                                    <Shortcut keys={[t("canvas.shortcut.zoomSlider")]} value={t("canvas.shortcut.preciseZoom")} />
                                    <Shortcut keys={[t("canvas.shortcut.drag")]} value={t("canvas.shortcut.boxSelect")} />
                                    <Shortcut keys={["Shift / Cmd", t("canvas.shortcut.click")]} value={t("canvas.shortcut.addSelection")} />
                                    <Shortcut keys={["Ctrl / Cmd", "A"]} value={t("canvas.shortcut.selectAll")} />
                                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value={t("canvas.shortcut.copyPaste")} />
                                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value={t("canvas.undo")} />
                                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value={t("canvas.redo")} />
                                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value={t("canvas.redo")} />
                                    <Shortcut keys={["Delete / Backspace"]} value={t("canvas.shortcut.delete")} />
                                    <Shortcut keys={["Esc"]} value={t("canvas.shortcut.escape")} />
                                    <Shortcut keys={[t("canvas.shortcut.dropMedia")]} value={t("canvas.shortcut.upload")} />
                                </div>
                            </div>
                            <div className="rounded-lg border border-border px-4 py-3.5 dark:border-border">
                                <div className="text-xs text-muted-foreground">{t("config.preferences.version")}</div>
                                <div className="mt-2">
                                    <VersionReleaseModal className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted" />
                                </div>
                            </div>
                        </div>
                    ),
                },
            ]}
        />
    );
}

export function AppConfigModal() {
    const { t } = useTranslation();
    const { token } = antdTheme.useToken();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal
            title={t("config.title")}
            open={isConfigOpen}
            width={980}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            footer={null}
            styles={{
                container: { padding: 0, overflow: "hidden", border: `1px solid ${token.colorBorder}` },
                header: { margin: 0, padding: "16px 24px", borderBottom: `1px solid ${token.colorSplit}` },
                body: { height: CONFIG_BODY_HEIGHT, overflow: "hidden" },
            }}
        >
            <AppConfigPanel />
        </Modal>
    );
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 1))));
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1">
                        {index ? <span className="text-[11px] text-muted-foreground">+</span> : null}
                        <kbd className="rounded-md border border-border bg-muted/80 px-2 py-1 text-center text-[11px] font-medium leading-none text-muted-foreground dark:border-border dark:bg-muted/70 dark:text-muted-foreground">{key}</kbd>
                    </span>
                ))}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{value}</span>
        </div>
    );
}
