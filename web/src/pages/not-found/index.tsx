import { Home } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
    const { t } = useTranslation();
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 text-foreground [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)] dark:text-foreground">
                <section className="w-full max-w-md text-center">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-xl border border-border glass-card text-2xl font-semibold text-brand dark:border-border">404</div>
                    <h1 className="text-3xl font-semibold tracking-normal">{t("notFound.title")}</h1>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("notFound.description")}</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground transition hover:bg-brand/90">
                            <Home className="size-4" />
                            {t("notFound.home")}
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
