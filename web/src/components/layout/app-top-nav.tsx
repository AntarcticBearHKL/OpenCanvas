import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes, frostedSurfaceClass } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const hideHeader = /^\/(canvas|write|image|audio|pixel|texture)\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    return (
        <>
            {!hideHeader ? (
                <header className={cn("sticky top-0 z-20 h-14 shrink-0 border-b border-border glass-surface", frostedSurfaceClass)}>
                    <div className="relative flex h-full items-center justify-between gap-3 px-4 sm:gap-5">
                        <div className="flex shrink-0 items-center">
                            <Link to="/" className="flex h-full min-w-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight !text-foreground transition hover:!text-muted-foreground">
                                <span
                                    className="size-5 shrink-0 !bg-brand"
                                    style={{
                                        mask: "url(/logo.svg) center / contain no-repeat",
                                        WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                    }}
                                />
                                <span className="truncate text-base font-semibold">{t("meta.title")}</span>
                            </Link>

                            <button
                                type="button"
                                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition hover:text-foreground md:hidden dark:text-muted-foreground dark:hover:text-white"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label={t("topNav.openMenu")}
                                title={t("topNav.menu")}
                            >
                                <Menu className="size-5" />
                            </button>
                        </div>

                        {/* Directly centered tabs switcher */}
                        <nav className="pointer-events-auto absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1 md:flex">
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link
                                        key={tool.slug}
                                        to={`/${tool.slug}`}
                                        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium transition hover:bg-hover"
                                        style={
                                            active
                                                ? {
                                                      background: theme.node.accentSoft,
                                                      color: theme.node.accent,
                                                      boxShadow: `inset 0 0 0 1px ${theme.node.accent}`,
                                                  }
                                                : { color: theme.node.muted }
                                        }
                                        aria-current={active ? "page" : undefined}
                                    >
                                        <Icon className="size-3.5 shrink-0" />
                                        <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="my-auto flex h-9 shrink-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
