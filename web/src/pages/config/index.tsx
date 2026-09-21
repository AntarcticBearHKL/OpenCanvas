import { useTranslation } from "react-i18next";

import { AppConfigPanel } from "@/components/layout/app-config-modal";

export default function ConfigPage() {
    const { t } = useTranslation();

    return (
        <main className="flex h-full min-h-0 flex-col bg-background">
            <div className="shrink-0 px-5 pb-1 pt-5">
                <h1 className="text-xl font-semibold text-foreground">{t("config.title")}</h1>
            </div>
            <div className="min-h-0 flex-1">
                <AppConfigPanel />
            </div>
        </main>
    );
}
