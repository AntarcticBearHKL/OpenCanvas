import type { CSSProperties } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useVersionCheck } from "@/hooks/use-version-check";
import { APP_VERSION } from "@/constant/env";

type VersionReleaseModalProps = {
    className?: string;
    style?: CSSProperties;
};

export function VersionReleaseModal({ className, style }: VersionReleaseModalProps) {
    const { t } = useTranslation();
    const { open, setOpen, openReleaseModal, latestVersion, checking, hasNewVersion, checkLatestRelease } = useVersionCheck();

    return (
        <>
            <button
                type="button"
                className={className || "shrink-0 cursor-pointer text-sm font-medium text-muted-foreground transition hover:text-foreground dark:text-muted-foreground dark:hover:text-white"}
                style={style}
                onClick={openReleaseModal}
                title={t("version.viewUpdates")}
            >
                <span className="relative inline-flex">
                    {APP_VERSION}
                    {hasNewVersion ? <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-success" /> : null}
                </span>
            </button>
            <Modal title={t("version.title")} open={open} width={680} centered footer={null} onCancel={() => setOpen(false)} classNames={{ container: "glass-raised !bg-[var(--glass-strong)]" }} styles={{ container: { borderRadius: 0 } }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border p-3 dark:border-border">
                        <div className="text-sm text-muted-foreground">{t("version.currentVersion")}</div>
                        <div className="mt-1 text-base font-semibold text-foreground">{APP_VERSION}</div>
                    </div>
                    <div className="rounded-xl border border-border p-3 dark:border-border">
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-muted-foreground">{t("version.latestVersion")}</div>
                            <button
                                type="button"
                                className="cursor-pointer bg-transparent p-0 text-sm font-normal text-muted-foreground underline-offset-2 transition hover:text-brand hover:underline dark:text-muted-foreground dark:hover:text-brand"
                                onClick={() => void checkLatestRelease(true)}
                            >
                                {t(checking ? "version.checking" : "version.checkUpdates")}
                            </button>
                        </div>
                        <div className="mt-1 text-base font-semibold text-foreground">{latestVersion}</div>
                    </div>
                </div>
            </Modal>
        </>
    );
}
