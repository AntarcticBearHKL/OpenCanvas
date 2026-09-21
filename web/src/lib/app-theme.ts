import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";

const neutral = {
    light: {
        primary: canvasThemes.light.node.text,
        primaryHover: canvasThemes.light.node.activeStroke,
        primaryText: canvasThemes.light.node.panel,
        layoutBg: canvasThemes.light.canvas.background,
        containerBg: canvasThemes.light.node.panel,
        elevatedBg: canvasThemes.light.node.panel,
        border: canvasThemes.light.node.stroke,
        borderSecondary: canvasThemes.light.node.fill,
        text: canvasThemes.light.node.text,
        textSecondary: canvasThemes.light.node.label,
        textTertiary: canvasThemes.light.node.muted,
        error: canvasThemes.light.node.blocked,
        itemHoverBg: canvasThemes.light.canvas.selectionFill,
        itemSelectedBg: canvasThemes.light.node.fill,
        itemSelectedHoverBg: canvasThemes.light.node.stroke,
        itemText: canvasThemes.light.node.text,
        tableSelectedBg: canvasThemes.light.canvas.selectionFill,
        tableSelectedHoverBg: canvasThemes.light.toolbar.border,
    },
    dark: {
        primary: canvasThemes.dark.node.text,
        primaryHover: canvasThemes.dark.node.activeStroke,
        primaryText: canvasThemes.dark.node.panel,
        layoutBg: canvasThemes.dark.canvas.background,
        containerBg: canvasThemes.dark.node.panel,
        elevatedBg: canvasThemes.dark.node.fill,
        border: canvasThemes.dark.node.stroke,
        borderSecondary: canvasThemes.dark.node.fill,
        text: canvasThemes.dark.node.text,
        textSecondary: canvasThemes.dark.node.label,
        textTertiary: canvasThemes.dark.node.faint,
        error: canvasThemes.dark.node.blocked,
        itemHoverBg: canvasThemes.dark.canvas.selectionFill,
        itemSelectedBg: canvasThemes.dark.toolbar.activeBg,
        itemSelectedHoverBg: canvasThemes.dark.node.stroke,
        itemText: canvasThemes.dark.node.text,
        tableSelectedBg: canvasThemes.dark.canvas.selectionFill,
        tableSelectedHoverBg: canvasThemes.dark.node.fill,
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            fontFamily: '"Baloo 2", "Resource Han Rounded SC", "Yuanti SC", "YouYuan", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorText: color.text,
            colorTextSecondary: color.textSecondary,
            colorTextTertiary: color.textTertiary,
            colorBgLayout: color.layoutBg,
            colorBgContainer: color.containerBg,
            colorBgElevated: color.elevatedBg,
            colorBorder: color.border,
            colorBorderSecondary: color.borderSecondary,
            colorError: color.error,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: neutral.dark.elevatedBg,
                darkItemHoverBg: neutral.dark.itemHoverBg,
                darkItemSelectedBg: neutral.dark.itemSelectedBg,
                darkItemSelectedColor: neutral.dark.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
