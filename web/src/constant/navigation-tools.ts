import { Images, PenLine, Settings2, Workflow } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: Workflow,
    },
    {
        slug: "write",
        icon: PenLine,
    },
    {
        slug: "assets",
        icon: Images,
    },
    {
        slug: "config",
        icon: Settings2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
