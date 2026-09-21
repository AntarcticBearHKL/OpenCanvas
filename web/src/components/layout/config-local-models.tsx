import { App, Button, Popconfirm, Progress } from "antd";
import { Download, Eraser, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listLocalModels, useLocalModelStore, type LocalModelDescriptor } from "@/stores/use-local-model-store";

async function clearModelCaches() {
    if (typeof caches === "undefined") return;
    try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.toLowerCase().includes("imgly")).map((key) => caches.delete(key)));
    } catch {
        return;
    }
}

export function ConfigLocalModels() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const models = useLocalModelStore((state) => state.models);

    const download = async (model: LocalModelDescriptor) => {
        if (await model.prepare(models[model.id].status === "ready")) message.success(t("config.localModels.downloadDone"));
        else message.error(t("config.localModels.downloadFailed"));
    };

    const remove = async (model: LocalModelDescriptor) => {
        model.clear();
        await clearModelCaches();
        message.success(t("config.localModels.deleteDone"));
    };

    return (
        <div className="space-y-3">
            <div>
                <div className="text-sm font-semibold">{t("config.localModels.title")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("config.localModels.description")}</div>
            </div>
            {listLocalModels().map((model) => {
                const state = models[model.id];
                const downloading = state.status === "downloading";
                const deletable = state.status === "ready" || state.status === "error";
                return (
                    <section key={model.id} className="rounded-lg border border-border p-4 dark:border-border">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Eraser className="size-4" />
                                    {t(model.titleKey)}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">{t(model.descriptionKey)}</div>
                            </div>
                            <div className="shrink-0 text-right text-xs text-muted-foreground">
                                <div>{t("config.localModels.size")}</div>
                                <div className="mt-0.5">{t(`config.localModels.status.${state.status}`, { percent: state.percent })}</div>
                            </div>
                        </div>
                        {downloading ? <Progress className="mt-3" percent={state.percent} size="small" showInfo={false} /> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="primary" icon={<Download className="size-4" />} loading={downloading} disabled={downloading} onClick={() => void download(model)}>
                                {t(state.status === "ready" ? "config.localModels.redownload" : "config.localModels.download")}
                            </Button>
                            <Popconfirm title={t("config.localModels.deleteConfirm")} description={t("config.localModels.deleteConfirmDescription")} okText={t("common.delete")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} disabled={!deletable} onConfirm={() => void remove(model)}>
                                <Button danger disabled={!deletable} icon={<Trash2 className="size-4" />}>
                                    {t("common.delete")}
                                </Button>
                            </Popconfirm>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
