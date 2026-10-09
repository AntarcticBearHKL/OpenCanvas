import { Boxes, Frame, Grid3x3, LayoutGrid } from "lucide-react";

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
        slug: "pixel",
        icon: Grid3x3,
    },
    {
        slug: "texture",
        icon: Boxes,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
