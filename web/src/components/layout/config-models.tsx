import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, type ModelCapability } from "@/stores/use-config-store";

const MODEL_FIELDS: { capability: ModelCapability; field: "textModel" | "imageModel" | "audioModel" | "speechModel" | "videoModel" }[] = [
    { capability: "text", field: "textModel" },
    { capability: "image", field: "imageModel" },
    { capability: "audio", field: "audioModel" },
    { capability: "speech", field: "speechModel" },
    { capability: "video", field: "videoModel" },
];

export function ConfigModels() {
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);

    return (
        <div className="space-y-3">
            <div>
                <div className="text-sm font-semibold">{t("config.models.title")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("config.models.description")}</div>
            </div>
            {MODEL_FIELDS.map(({ capability, field }) => (
                <section key={capability} className="rounded-xl border border-border p-4 dark:border-border glass-card">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{t(`settingsPanels.model.capabilities.${capability}`)}</div>
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-sm text-muted-foreground">{t("config.models.defaultModel")}</span>
                            <ModelPicker config={config} value={config[field]} onChange={(model) => updateConfig(field, model)} capability={capability} className="max-w-[220px]" />
                        </div>
                    </div>
                </section>
            ))}
        </div>
    );
}
