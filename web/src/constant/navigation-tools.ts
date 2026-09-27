import { Frame, LayoutGrid, Music2, PenLine } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        icon: LayoutGrid,
    },
    {
        slug: "image",
        icon: Frame,
    },
    {
        slug: "audio",
        icon: Music2,
    },
    {
        slug: "write",
        icon: PenLine,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
