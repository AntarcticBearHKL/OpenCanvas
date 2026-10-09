import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export function useCanvasTheme() {
    return canvasThemes[useThemeStore((state) => state.theme)];
}
